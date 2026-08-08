const fs = require('fs')
const path = require('path')
const env = require('../../../config/env')
const { query } = require('../../../config/db')
const { ensureWorkflowTables } = require('./workflow')
const { buildMrPdf } = require('./mr-pdf')

const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
const documentRoot = path.join(uploadRoot, 'mr-documents')
fs.mkdirSync(documentRoot, { recursive: true })

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function safeName(value) {
  return String(value || 'MR').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 120) || 'MR'
}

async function archiveContext(mrId) {
  const [orders, versions, files] = await Promise.all([
    query(
      `SELECT o.*, sales.real_name AS sales_owner_name, c.code AS customer_code
       FROM mr_orders o
       LEFT JOIN users sales ON sales.id = o.sales_owner_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id = :mrId LIMIT 1`,
      { mrId },
    ),
    query(
      `SELECT cycle, version_no, snapshot FROM mr_versions
       WHERE mr_id = :mrId AND kind = 'frozen' ORDER BY version_no DESC LIMIT 1`,
      { mrId },
    ),
    query(
      `SELECT original_name AS name, size, created_at AS createdAt FROM files
       WHERE owner_type = 'mr_order' AND owner_id = :mrId ORDER BY id`,
      { mrId },
    ),
  ])
  const order = orders[0]
  const version = versions[0]
  if (!order) throw new Error('MR 不存在')
  if (!version) throw new Error('MR 尚未生成冻结版本')
  const approvals = await query(
    `SELECT step_key, step_label, action, reason, approver_name_snapshot,
            approver_role_snapshot, approver_signature_snapshot, decided_at
     FROM mr_approvals WHERE mr_id = :mrId AND cycle = :cycle ORDER BY seq`,
    { mrId, cycle: version.cycle },
  )
  const snapshot = jsonValue(version.snapshot, {})
  return {
    order: {
      ...snapshot,
      id: order.id,
      status: order.status,
      versionNo: Number(version.version_no),
      customerCode: order.customer_code,
      salesOwnerName: order.sales_owner_name,
      quotationFiles: files,
      voidReason: order.void_reason,
      archiveAttempts: Number(order.archive_attempts || 0),
    },
    approvals,
    versionNo: Number(version.version_no),
  }
}

function writePdf(filePath, order, approvals, options) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath)
    const doc = buildMrPdf(order, approvals, options)
    stream.on('finish', resolve)
    stream.on('error', reject)
    doc.on('error', reject)
    doc.pipe(stream)
    doc.end()
  })
}

async function archiveMrDocument(mrId, requestedType = null, markReady = true) {
  await ensureWorkflowTables()
  const context = await archiveContext(mrId)
  const type = requestedType || (context.order.status === 'voided' ? 'voided' : 'approved')
  const watermarkLabel = type === 'voided' ? `已作废 · ${context.order.voidReason || ''}` : ''
  const filename = `${safeName(context.order.customerCode || context.order.customerName)}_${safeName(context.order.ctrlNo || mrId)}_V${context.versionNo}_${type === 'voided' ? '作废' : '审批'}.pdf`
  const finalPath = path.join(documentRoot, `${mrId}-v${context.versionNo}-${type}.pdf`)
  const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`
  try {
    await writePdf(tempPath, context.order, context.approvals, { watermarkLabel })
    await fs.promises.rename(tempPath, finalPath)
    const stat = await fs.promises.stat(finalPath)
    await query(
      `INSERT INTO mr_documents (mr_id, version_no, document_type, storage_path, original_name, size)
       VALUES (:mrId, :versionNo, :type, :storagePath, :filename, :size)
       ON DUPLICATE KEY UPDATE storage_path = VALUES(storage_path), original_name = VALUES(original_name),
                               size = VALUES(size), created_at = CURRENT_TIMESTAMP`,
      { mrId, versionNo: context.versionNo, type, storagePath: finalPath, filename, size: stat.size },
    )
    if (markReady) {
      await query(
        `UPDATE mr_orders SET
           archive_status = CASE WHEN :type = 'approved' AND status = 'voided' THEN 'pending' ELSE 'ready' END,
           archive_next_attempt_at = CASE WHEN :type = 'approved' AND status = 'voided' THEN NOW() ELSE NULL END,
           archive_error = NULL
         WHERE id = :mrId`,
        { mrId, type },
      )
    }
    return { path: finalPath, filename, type }
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {})
    const retryMinutes = Math.min(360, 2 ** Math.min(context.order.archiveAttempts + 1, 8))
    await query(
      `UPDATE mr_orders SET archive_status = 'failed', archive_attempts = archive_attempts + 1,
              archive_next_attempt_at = DATE_ADD(NOW(), INTERVAL ${retryMinutes} MINUTE), archive_error = :message
       WHERE id = :mrId`,
      { mrId, message: String(error.message || 'PDF 生成失败').slice(0, 500) },
    ).catch(() => {})
    throw error
  }
}

async function processMrArchives(limit = 5) {
  await require('./controller').ensureTables()
  await ensureWorkflowTables()
  await query(
    `UPDATE mr_orders SET archive_status = 'failed', archive_error = '生成任务超时，自动重试', archive_next_attempt_at = NOW()
     WHERE archive_status = 'generating' AND archive_next_attempt_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
  )
  const batchLimit = Math.max(1, Math.min(20, Number(limit) || 5))
  const rows = await query(
    `SELECT id, status FROM mr_orders
     WHERE status IN ('approved', 'voided') AND archive_status IN ('pending', 'failed')
       AND (archive_next_attempt_at IS NULL OR archive_next_attempt_at <= NOW())
     ORDER BY COALESCE(archive_next_attempt_at, updated_at), id LIMIT ${batchLimit}`,
  )
  let archived = 0
  let failed = 0
  for (const row of rows) {
    const claimed = await query(
      `UPDATE mr_orders SET archive_status = 'generating', archive_next_attempt_at = NOW()
       WHERE id = :id AND archive_status IN ('pending', 'failed')`,
      { id: row.id },
    )
    if (!claimed.affectedRows) continue
    try {
      if (row.status === 'voided') {
        const approvedDocument = await mrDocument(row.id, 'approved')
        if (!approvedDocument || !fs.existsSync(approvedDocument.storage_path)) await archiveMrDocument(row.id, 'approved', false)
        await archiveMrDocument(row.id, 'voided')
      } else {
        await archiveMrDocument(row.id, 'approved')
      }
      archived += 1
    } catch (error) {
      failed += 1
      console.error('[mr-archive] PDF generation failed', { mrId: row.id, message: error.message })
    }
  }
  return { processed: rows.length, archived, failed }
}

async function mrDocument(mrId, type = null) {
  await ensureWorkflowTables()
  const rows = await query(
    `SELECT * FROM mr_documents WHERE mr_id = :mrId
       AND (:type IS NULL OR document_type = :type)
     ORDER BY CASE document_type WHEN 'voided' THEN 0 ELSE 1 END, version_no DESC LIMIT 1`,
    { mrId, type: type || null },
  )
  return rows[0] || null
}

module.exports = { archiveMrDocument, processMrArchives, mrDocument }
