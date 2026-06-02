const fs = require('fs')
const path = require('path')
const { query, transaction } = require('../../config/db')
const env = require('../../config/env')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { buildOrderNo } = require('../../utils/order-no')
const { customerNameKey, toTraditional, toTraditionalDeep } = require('../../utils/chinese')

const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
const signatureRoot = path.join(uploadRoot, 'signatures')
fs.mkdirSync(signatureRoot, { recursive: true })

let serviceReportTravelColumnsReady = false
let selfReportDraftsTableReady = false
let serviceOrderInspectionColumnsReady = false

const orderColumns = `
  so.id, so.order_no, so.customer_id, c.name AS customer_name, c.address AS customer_address,
  c.contact_name, c.contact_phone, so.device_id, d.name AS device_name,
  so.service_mode, so.service_type, so.timesheet_category, so.timesheet_salesperson,
  so.priority, so.status, so.issue_description, so.assigned_engineer_id,
  u.real_name AS engineer_name, so.inspection_schedule_id, so.inspection_occurrence_date,
  so.target_engineer_id, target_u.real_name AS target_engineer_name, target_u.username AS target_engineer_username,
  so.confirmed_by, confirmer.real_name AS confirmed_by_name, so.confirmed_at,
  so.planned_start_at, so.planned_end_at, so.internal_note,
  so.created_by, so.submitted_at, so.reviewed_by, so.reviewed_at, so.review_comment,
  so.archived_at, so.created_at, so.updated_at
`

const broadListRoles = new Set(['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor'])

function orderPayload(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    deviceId: row.device_id,
    deviceName: row.device_name,
    serviceMode: row.service_mode || 'onsite',
    serviceType: row.service_type,
    timesheetCategory: row.timesheet_category,
    timesheetSalesperson: row.timesheet_salesperson,
    priority: row.priority,
    status: publicStatus(row.status),
    issueDescription: row.issue_description,
    engineerName: row.engineer_name,
    inspectionScheduleId: row.inspection_schedule_id,
    inspectionOccurrenceDate: row.inspection_occurrence_date,
    targetEngineerId: row.target_engineer_id,
    targetEngineerName: row.target_engineer_name || row.target_engineer_username,
    pendingConfirmation: row.status === 'pending_confirmation',
    confirmedBy: row.confirmed_by,
    confirmedByName: row.confirmed_by_name,
    confirmedAt: row.confirmed_at,
    serviceAt: row.planned_start_at || row.submitted_at || row.created_at,
    engineers: row.engineers || [],
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    internalNote: row.internal_note,
    createdBy: row.created_by,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment,
    report: reportPayload(row.report),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function publicStatus(status) {
  if (status === 'pending_confirmation') return 'pending_confirmation'
  if (status === 'assigned' || status === 'rejected') return 'draft'
  if (status === 'approved' || status === 'archived') return 'submitted'
  return status
}

async function ensureServiceOrderInspectionColumns(connection = null) {
  if (!connection && serviceOrderInspectionColumnsReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  const [rows] = await execute(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND column_name IN (
         'inspection_schedule_id', 'inspection_occurrence_date', 'target_engineer_id', 'confirmed_by', 'confirmed_at'
       )`,
  )
  const existing = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!existing.has('inspection_schedule_id')) {
    await execute('ALTER TABLE service_orders ADD COLUMN inspection_schedule_id BIGINT UNSIGNED NULL AFTER internal_note')
  }
  if (!existing.has('inspection_occurrence_date')) {
    await execute('ALTER TABLE service_orders ADD COLUMN inspection_occurrence_date DATE NULL AFTER inspection_schedule_id')
  }
  if (!existing.has('target_engineer_id')) {
    await execute('ALTER TABLE service_orders ADD COLUMN target_engineer_id BIGINT UNSIGNED NULL AFTER inspection_occurrence_date')
  }
  if (!existing.has('confirmed_by')) {
    await execute('ALTER TABLE service_orders ADD COLUMN confirmed_by BIGINT UNSIGNED NULL AFTER target_engineer_id')
  }
  if (!existing.has('confirmed_at')) {
    await execute('ALTER TABLE service_orders ADD COLUMN confirmed_at DATETIME NULL AFTER confirmed_by')
  }

  const [statusRows] = await execute(
    `SELECT column_type AS columnType
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND column_name = 'status'
     LIMIT 1`,
  )
  const statusType = statusRows[0]?.columnType || statusRows[0]?.column_type || ''
  if (!String(statusType).includes("'pending_confirmation'")) {
    await execute(
      `ALTER TABLE service_orders MODIFY COLUMN status ENUM(
        'draft', 'pending_confirmation', 'assigned', 'in_progress', 'submitted', 'rejected', 'approved', 'archived', 'cancelled'
      ) NOT NULL DEFAULT 'draft'`,
    )
  }

  const [indexRows] = await execute(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND index_name IN (
         'uk_service_orders_inspection_occurrence', 'idx_service_orders_target_engineer', 'idx_service_orders_inspection_schedule'
       )`,
  )
  const indexes = new Set(indexRows.map((row) => row.indexName || row.index_name))
  if (!indexes.has('uk_service_orders_inspection_occurrence')) {
    await execute('ALTER TABLE service_orders ADD UNIQUE KEY uk_service_orders_inspection_occurrence (inspection_schedule_id, inspection_occurrence_date)')
  }
  if (!indexes.has('idx_service_orders_target_engineer')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_target_engineer (target_engineer_id)')
  }
  if (!indexes.has('idx_service_orders_inspection_schedule')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_inspection_schedule (inspection_schedule_id)')
  }

  if (!connection) {
    serviceOrderInspectionColumnsReady = true
  }
}

function shanghaiDateKey(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000)
  date.setUTCDate(date.getUTCDate() - offsetDays)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeMonth(month) {
  const value = String(month || '').trim()
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value
  return shanghaiDateKey(0).slice(0, 7)
}

function normalizeDateInput(value, fallback) {
  const text = String(value || '').trim()
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text)) return text
  return fallback
}

function timesheetDateRange(query = {}) {
  const month = normalizeMonth(query.month)
  const fallbackStart = `${month}-01`
  const fallbackEnd = `${month}-31`
  let startDate = normalizeDateInput(query.startDate, fallbackStart)
  let endDate = normalizeDateInput(query.endDate, fallbackEnd)
  if (startDate > endDate) {
    const temp = startDate
    startDate = endDate
    endDate = temp
  }
  const label = startDate === fallbackStart && endDate === fallbackEnd ? month : `${startDate} 至 ${endDate}`
  return { month, startDate, endDate, label }
}

function weekdayText(dateText) {
  const [year, month, day] = String(dateText).split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getUTCDay()]
}

function timesheetType(serviceType, serviceMode = 'onsite') {
  if (serviceMode === 'office') return ['内部工作', '其他']
  if (serviceMode === 'remote') return ['远程服务', '排障']
  const map = {
    install: ['售后服务', '安装'],
    repair: ['维护服务', '排障'],
    maintain: ['维护服务', '保养'],
    inspect: ['维护服务', '巡检'],
    training: ['售后服务', '培训'],
    other: ['维护服务', '其他'],
  }
  return map[serviceType] || map.other
}

function normalizeManualEntryCategory(value) {
  const category = String(value || '').trim()
  const allowed = new Set(['方案准备', '文档整理', '网络会议', '培训学习', '其他'])
  return allowed.has(category) ? category : ''
}

function normalizeProgress(value) {
  return String(value || '已完成').trim() || '已完成'
}

async function ensureTimesheetManualEntriesTable(connection = null) {
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS timesheet_manual_entries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      engineer_id BIGINT UNSIGNED NOT NULL,
      entry_date DATE NOT NULL,
      category VARCHAR(64) NOT NULL,
      customer_project VARCHAR(128) NULL,
      work_content TEXT NOT NULL,
      progress VARCHAR(64) NULL,
      remark VARCHAR(255) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_timesheet_manual_entries_engineer_date (engineer_id, entry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

async function ensureServiceReportWorkEntriesTable(connection = null) {
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS service_report_work_entries (
      service_order_id BIGINT UNSIGNED NOT NULL,
      engineer_id BIGINT UNSIGNED NOT NULL,
      work_content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (service_order_id, engineer_id),
      KEY idx_service_report_work_entries_engineer_id (engineer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

async function ensureServiceReportTravelColumns() {
  if (serviceReportTravelColumnsReady) return
  const rows = await query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_reports'
       AND column_name IN ('departure_at', 'return_at')`,
  )
  const existing = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!existing.has('departure_at')) {
    await query('ALTER TABLE service_reports ADD COLUMN departure_at DATETIME NULL AFTER service_order_id')
  }
  if (!existing.has('return_at')) {
    await query('ALTER TABLE service_reports ADD COLUMN return_at DATETIME NULL AFTER actual_end_at')
  }
  serviceReportTravelColumnsReady = true
}

async function ensureSelfReportDraftsTable(connection = null) {
  if (!connection && selfReportDraftsTableReady) return
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS self_report_drafts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      engineer_id BIGINT UNSIGNED NOT NULL,
      draft_scope VARCHAR(16) NOT NULL,
      service_order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      payload_json LONGTEXT NOT NULL,
      client_updated_at VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_self_report_drafts_engineer_scope_order (engineer_id, draft_scope, service_order_id),
      KEY idx_self_report_drafts_service_order_id (service_order_id),
      CONSTRAINT fk_self_report_drafts_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  if (!connection) {
    selfReportDraftsTableReady = true
  }
}

function normalizeDraftScope(orderId) {
  return Number(orderId) > 0 ? 'edit' : 'create'
}

function normalizeDraftOrderId(orderId) {
  const value = Number(orderId || 0)
  return value > 0 ? value : 0
}

function parseDraftPayload(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeWorkEntries(workEntries = []) {
  if (!Array.isArray(workEntries)) return []
  const entries = []
  const seen = new Set()
  for (const entry of workEntries) {
    const engineerId = Number(entry?.engineerId || entry?.engineer_id || 0)
    const workContent = String(entry?.workContent || entry?.work_content || '').trim()
    if (!engineerId || !workContent || seen.has(engineerId)) continue
    seen.add(engineerId)
    entries.push({ engineerId, workContent })
  }
  return entries
}

function mergedWorkContent(entries, fallback = '') {
  const filledEntries = Array.isArray(entries)
    ? entries
        .map((entry) => ({
          engineerName: String(entry?.engineerName || entry?.engineer_name || '').trim(),
          workContent: String(entry?.workContent || entry?.work_content || '').trim(),
        }))
        .filter((entry) => entry.workContent)
    : []
  if (filledEntries.length === 1) return filledEntries[0].workContent
  if (filledEntries.length > 1) {
    return filledEntries.map((entry) => `${entry.engineerName || '工程师'}：\n${entry.workContent}`).join('\n\n')
  }
  return String(fallback || '').trim()
}

function hasSubmittedWorkContent(workContent, workEntries) {
  return Boolean(String(workContent || '').trim() || normalizeWorkEntries(workEntries).length)
}

function idParams(ids, prefix = 'id') {
  const params = {}
  const placeholders = ids.map((id, index) => {
    const key = `${prefix}${index}`
    params[key] = id
    return `:${key}`
  })
  return { params, placeholders: placeholders.join(',') }
}

async function loadWorkEntries(orderIds) {
  await ensureServiceReportWorkEntriesTable()
  if (!orderIds.length) return new Map()
  const params = orderIds.reduce((values, id, index) => {
    values[`orderId${index}`] = id
    return values
  }, {})
  const rows = await query(
    `SELECT srwe.service_order_id, srwe.engineer_id, srwe.work_content, srwe.created_at, srwe.updated_at,
            u.real_name AS engineer_name, u.username AS engineer_username
     FROM service_report_work_entries srwe
     JOIN users u ON u.id = srwe.engineer_id
     WHERE srwe.service_order_id IN (${orderIds.map((_, index) => `:orderId${index}`).join(',')})
     ORDER BY srwe.updated_at ASC, srwe.created_at ASC, srwe.engineer_id ASC`,
    params,
  )
  return rows.reduce((groups, row) => {
    if (!groups.has(row.service_order_id)) groups.set(row.service_order_id, [])
    groups.get(row.service_order_id).push({
      engineerId: row.engineer_id,
      engineerName: row.engineer_name || row.engineer_username || '工程师',
      workContent: row.work_content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
    return groups
  }, new Map())
}

async function saveWorkEntries(connection, orderId, workEntries, fallbackWorkContent, currentEngineerId) {
  const normalizedEntries = normalizeWorkEntries(workEntries)
  const hasExplicitEntries = Array.isArray(workEntries)
  const currentId = Number(currentEngineerId || 0)

  if (currentId) {
    const currentEntry = normalizedEntries.find((entry) => Number(entry.engineerId) === currentId)
    const currentWorkContent = currentEntry?.workContent || (hasExplicitEntries ? '' : String(fallbackWorkContent || '').trim())
    if (currentWorkContent) {
      await connection.execute(
        `INSERT INTO service_report_work_entries (service_order_id, engineer_id, work_content)
         VALUES (:orderId, :engineerId, :workContent)
         ON DUPLICATE KEY UPDATE
           work_content = VALUES(work_content),
           updated_at = CURRENT_TIMESTAMP`,
        { orderId, engineerId: currentId, workContent: currentWorkContent },
      )
    } else {
      await connection.execute(
        `DELETE FROM service_report_work_entries
         WHERE service_order_id = :orderId AND engineer_id = :engineerId`,
        { orderId, engineerId: currentId },
      )
    }
  } else {
    const replacementEntries = [...normalizedEntries]
    if (!replacementEntries.length) {
      const fallback = String(fallbackWorkContent || '').trim()
      if (fallback) replacementEntries.push({ engineerId: 0, workContent: fallback })
    }
    const keepEngineerIds = []
    for (const entry of replacementEntries.filter((item) => item.engineerId)) {
      keepEngineerIds.push(entry.engineerId)
      await connection.execute(
        `INSERT INTO service_report_work_entries (service_order_id, engineer_id, work_content)
         VALUES (:orderId, :engineerId, :workContent)
         ON DUPLICATE KEY UPDATE
           work_content = VALUES(work_content),
           updated_at = CURRENT_TIMESTAMP`,
        { orderId, engineerId: entry.engineerId, workContent: entry.workContent },
      )
    }
    if (keepEngineerIds.length) {
      const params = keepEngineerIds.reduce(
        (values, id, index) => {
          values[`engineerId${index}`] = id
          return values
        },
        { orderId },
      )
      await connection.execute(
        `DELETE FROM service_report_work_entries
         WHERE service_order_id = :orderId
           AND engineer_id NOT IN (${keepEngineerIds.map((_, index) => `:engineerId${index}`).join(',')})`,
        params,
      )
    }
  }

  const [rows] = await connection.execute(
    `SELECT srwe.engineer_id, srwe.work_content, u.real_name AS engineer_name, u.username AS engineer_username
     FROM service_report_work_entries srwe
     JOIN users u ON u.id = srwe.engineer_id
     WHERE srwe.service_order_id = :orderId
     ORDER BY srwe.updated_at ASC, srwe.created_at ASC, srwe.engineer_id ASC`,
    { orderId },
  )
  return rows.map((row) => ({
    engineerId: row.engineer_id,
    engineerName: row.engineer_name || row.engineer_username || '工程师',
    workContent: row.work_content,
  }))
}

async function pruneWorkEntriesToEngineers(connection, orderId, engineerIds) {
  const keepEngineerIds = [...new Set((engineerIds || []).map(Number).filter(Boolean))]
  if (!keepEngineerIds.length) {
    await connection.execute('DELETE FROM service_report_work_entries WHERE service_order_id = :orderId', { orderId })
    return []
  }
  const params = keepEngineerIds.reduce(
    (values, id, index) => {
      values[`engineerId${index}`] = id
      return values
    },
    { orderId },
  )
  await connection.execute(
    `DELETE FROM service_report_work_entries
     WHERE service_order_id = :orderId
       AND engineer_id NOT IN (${keepEngineerIds.map((_, index) => `:engineerId${index}`).join(',')})`,
    params,
  )
}

function reportPayload(row) {
  if (!row) return null
  return {
    id: row.id,
    serviceOrderId: row.service_order_id,
    departureAt: row.departure_at,
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    returnAt: row.return_at,
    workHours: row.work_hours,
    faultSummary: row.fault_summary,
    workContent: row.work_content,
    workEntries: row.workEntries || [],
    result: row.result,
    resultDescription: row.result_description,
    customerName: row.customer_name,
    customerSignatureFileId: row.customer_signature_file_id,
    customerSignature: row.customer_signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseSignatureDataUrl(dataUrl) {
  if (!dataUrl) return null
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) return null
  if (buffer.length > 1024 * 1024) {
    throw badRequest('签名图片过大')
  }
  return {
    mimeType: match[1],
    extension: match[1] === 'image/jpeg' ? 'jpg' : 'png',
    buffer,
  }
}

async function saveSignatureFile(connection, orderId, dataUrl, userId) {
  const parsed = parseSignatureDataUrl(dataUrl)
  if (!parsed) return null

  const filename = `signature-${orderId}-${Date.now()}.${parsed.extension}`
  const storagePath = path.join(signatureRoot, filename)
  await fs.promises.writeFile(storagePath, parsed.buffer)

  const [result] = await connection.execute(
    `INSERT INTO files (owner_type, owner_id, original_name, storage_path, mime_type, size, uploaded_by)
     VALUES ('signature', :ownerId, :originalName, :storagePath, :mimeType, :size, :uploadedBy)`,
    {
      ownerId: orderId,
      originalName: filename,
      storagePath,
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      uploadedBy: userId,
    },
  )

  return result.insertId
}

async function signatureDataUrl(fileId) {
  if (!fileId) return ''
  const rows = await query('SELECT storage_path, mime_type FROM files WHERE id = :id LIMIT 1', { id: fileId })
  const file = rows[0]
  if (!file) return ''
  try {
    const buffer = await fs.promises.readFile(file.storage_path)
    return `data:${file.mime_type};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

async function hydrateReportSignature(report) {
  if (!report) return null
  if (report.customer_signature_file_id) {
    return {
      ...report,
      customer_signature: await signatureDataUrl(report.customer_signature_file_id),
    }
  }
  return report
}

async function getOrder(id) {
  await ensureServiceOrderInspectionColumns()
  const rows = await query(
    `SELECT ${orderColumns}
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN users u ON u.id = so.assigned_engineer_id
     LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
     LEFT JOIN users confirmer ON confirmer.id = so.confirmed_by
     WHERE so.id = :id
     LIMIT 1`,
    { id },
  )
  return rows[0]
}

function assertEditable(order) {
  if (['approved', 'archived', 'cancelled'].includes(order.status)) {
    throw badRequest('当前状态不允许修改')
  }
}

async function writeAudit(connection, actorId, targetId, action, detail = {}) {
  await connection.execute(
    `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
     VALUES (:actorId, 'service_order', :targetId, :action, :detailJson)`,
    {
      actorId,
      targetId,
      action,
      detailJson: JSON.stringify(detail),
    },
  )
}

async function recordCustomerContact(connection, customerId, name, phone = null, engineerId = null) {
  if (!customerId || !name) return

  const [existingRows] = await connection.execute(
    `SELECT id, use_count
     FROM customer_contacts
     WHERE customer_id = :customerId AND name = :name
     ORDER BY last_used_at DESC, id DESC`,
    { customerId, name },
  )
  if (existingRows[0]) {
    const keeper = existingRows[0]
    const duplicateIds = existingRows.slice(1).map((row) => row.id)
    const duplicateUseCount = existingRows.slice(1).reduce((total, row) => total + Number(row.use_count || 0), 0)
    await connection.execute(
      `UPDATE customer_contacts
       SET phone = :phone,
           use_count = use_count + :duplicateUseCount + 1,
           last_used_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: keeper.id, phone: phone || null, duplicateUseCount },
    )
    if (duplicateIds.length) {
      await mergeDuplicateCustomerContacts(connection, keeper.id, duplicateIds)
    }
    if (engineerId) {
      await recordCustomerContactUsage(connection, keeper.id, engineerId)
    }
    return
  }

  const [result] = await connection.execute(
    `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
     VALUES (:customerId, :name, :phone, 1, CURRENT_TIMESTAMP)`,
    {
      customerId,
      name,
      phone: phone || null,
    },
  )
  if (engineerId && result.insertId) {
    await recordCustomerContactUsage(connection, result.insertId, engineerId)
  }
}

async function recordCustomerContactUsage(connection, customerContactId, engineerId) {
  await connection.execute(
    `INSERT INTO customer_contact_usage (customer_contact_id, engineer_id, use_count, last_used_at)
     VALUES (:customerContactId, :engineerId, 1, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       use_count = use_count + 1,
       last_used_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    {
      customerContactId,
      engineerId,
    },
  )
}

async function mergeDuplicateCustomerContacts(connection, keeperId, duplicateIds) {
  if (!duplicateIds.length) return
  const params = duplicateIds.reduce(
    (values, id, index) => {
      values[`duplicateId${index}`] = id
      return values
    },
    { keeperId },
  )
  const placeholders = duplicateIds.map((_, index) => `:duplicateId${index}`).join(',')
  const [usageRows] = await connection.execute(
    `SELECT engineer_id, SUM(use_count) AS use_count, MAX(last_used_at) AS last_used_at
     FROM customer_contact_usage
     WHERE customer_contact_id IN (${placeholders})
     GROUP BY engineer_id`,
    params,
  )
  for (const usage of usageRows) {
    await connection.execute(
      `INSERT INTO customer_contact_usage (customer_contact_id, engineer_id, use_count, last_used_at)
       VALUES (:keeperId, :engineerId, :useCount, :lastUsedAt)
       ON DUPLICATE KEY UPDATE
         use_count = use_count + VALUES(use_count),
         last_used_at = GREATEST(last_used_at, VALUES(last_used_at)),
         updated_at = CURRENT_TIMESTAMP`,
      {
        keeperId,
        engineerId: usage.engineer_id,
        useCount: Number(usage.use_count || 0),
        lastUsedAt: usage.last_used_at,
      },
    )
  }
  await connection.execute(`DELETE FROM customer_contact_usage WHERE customer_contact_id IN (${placeholders})`, params)
  await connection.execute(`DELETE FROM customer_contacts WHERE id IN (${placeholders})`, params)
}

function normalizeEngineerIds(engineerIds, currentUserId) {
  return [...new Set([currentUserId, ...(Array.isArray(engineerIds) ? engineerIds : [])].map(Number).filter(Boolean))]
}

async function replaceOrderEngineers(connection, orderId, engineerIds, joinedBy) {
  await connection.execute('DELETE FROM service_order_engineers WHERE service_order_id = :orderId', { orderId })
  for (const engineerId of engineerIds) {
    await connection.execute(
      `INSERT INTO service_order_engineers (service_order_id, engineer_id, joined_by)
       VALUES (:orderId, :engineerId, :joinedBy)`,
      { orderId, engineerId, joinedBy },
    )
  }
}

async function listOrderEngineers(orderIds) {
  if (!orderIds.length) return new Map()
  const params = orderIds.reduce((values, id, index) => {
    values[`orderId${index}`] = id
    return values
  }, {})
  const rows = await query(
    `SELECT soe.service_order_id, u.id, u.real_name, u.username, u.phone, u.engineer_signature
     FROM service_order_engineers soe
     JOIN users u ON u.id = soe.engineer_id
     WHERE soe.service_order_id IN (${orderIds.map((_, index) => `:orderId${index}`).join(',')})
     ORDER BY soe.created_at ASC, u.real_name ASC`,
    params,
  )
  return rows.reduce((groups, row) => {
    if (!groups.has(row.service_order_id)) groups.set(row.service_order_id, [])
    groups.get(row.service_order_id).push({
      id: row.id,
      realName: row.real_name,
      username: row.username,
      phone: row.phone,
      engineerSignature: row.engineer_signature || '',
    })
    return groups
  }, new Map())
}

async function attachEngineers(rows) {
  const engineersByOrder = await listOrderEngineers(rows.map((row) => row.id))
  return rows.map((row) => ({
    ...row,
    engineers:
      engineersByOrder.get(row.id) ||
      (row.assigned_engineer_id
        ? [
            {
              id: row.assigned_engineer_id,
              realName: row.engineer_name,
              username: null,
              phone: null,
              engineerSignature: '',
            },
          ]
        : []),
  }))
}

async function attachReports(rows) {
  const orderIds = rows.map((row) => Number(row.id)).filter(Boolean)
  if (!orderIds.length) return rows
  const found = idParams(orderIds, 'orderId')
  const [reportsByOrder, workEntriesByOrder] = await Promise.all([
    query(
      `SELECT sr.*
       FROM service_reports sr
       JOIN (
         SELECT service_order_id, MAX(id) AS latest_report_id
         FROM service_reports
         WHERE service_order_id IN (${found.placeholders})
         GROUP BY service_order_id
       ) latest
         ON latest.latest_report_id = sr.id`,
      found.params,
    ),
    loadWorkEntries(orderIds),
  ])
  const reportMap = reportsByOrder.reduce((groups, row) => {
    groups.set(Number(row.service_order_id), {
      ...row,
      workEntries: workEntriesByOrder.get(Number(row.service_order_id)) || [],
    })
    return groups
  }, new Map())
  return rows.map((row) => ({ ...row, report: reportMap.get(Number(row.id)) || null }))
}

async function engineerCanAccess(orderId, user) {
  if (user.role !== 'engineer') return true
  const rows = await query(
    `SELECT 1
     FROM service_order_engineers
     WHERE service_order_id = :orderId AND engineer_id = :engineerId
     LIMIT 1`,
    { orderId, engineerId: user.id },
  )
  return Boolean(rows[0])
}

async function assertEngineerOwns(order, user) {
  if (user.role !== 'engineer') return
  if (order.assigned_engineer_id === user.id) return
  if (await engineerCanAccess(order.id, user)) return
  throw forbidden('只能操作自己参与的服务单')
}

async function list(req, res) {
  await ensureServiceOrderInspectionColumns()
  const {
    status = null,
    customerId = null,
    engineerId = null,
    keyword = '',
    customer = '',
    startDate = '',
    endDate = '',
    sortBy = 'createdAt',
    sortDir = 'desc',
    page = '1',
    pageSize = '20',
  } = req.query
  const isEngineer = req.user.role === 'engineer'
  const canListBroadly = broadListRoles.has(req.user.role)
  const effectiveEngineerId = isEngineer ? req.user.id : canListBroadly ? engineerId || null : null
  const salespersonScope = req.user.role === 'sales' ? String(req.user.real_name || req.user.username || '').trim() : ''
  const salespersonUsernameScope = req.user.role === 'sales' ? String(req.user.username || '').trim() : ''
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
  const offset = (normalizedPage - 1) * normalizedPageSize
  let statusWhereSql = '1 = 1'
  if (status === 'draft') {
    statusWhereSql = "so.status IN ('draft', 'assigned', 'rejected')"
  } else if (status === 'submitted') {
    statusWhereSql = "so.status IN ('submitted', 'approved', 'archived')"
  } else if (status) {
    statusWhereSql = 'so.status = :status'
  }
  const sortColumns = {
    orderNo: 'so.order_no',
    customerName: 'c.name',
    deviceName: 'd.name',
    serviceType: 'so.service_type',
    priority: 'so.priority',
    engineerName: 'u.real_name',
    status: 'so.status',
    serviceAt: 'COALESCE(so.planned_start_at, so.submitted_at, so.created_at)',
    plannedStartAt: 'COALESCE(so.planned_start_at, so.submitted_at, so.created_at)',
    createdAt: 'so.id',
  }
  const sortColumn = sortColumns[sortBy] || sortColumns.createdAt
  const sortDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const fromAndWhere = `
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN users u ON u.id = so.assigned_engineer_id
      LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
      LEFT JOIN users confirmer ON confirmer.id = so.confirmed_by
     WHERE ${statusWhereSql}
       AND (:customerId IS NULL OR so.customer_id = :customerId)
       AND (:customer = '' OR c.name LIKE :likeCustomer)
       AND (:startDate = '' OR DATE(COALESCE(so.planned_start_at, so.submitted_at, so.created_at)) >= :startDate)
       AND (:endDate = '' OR DATE(COALESCE(so.planned_start_at, so.submitted_at, so.created_at)) <= :endDate)
        AND (
          :engineerId IS NULL
          OR so.assigned_engineer_id = :engineerId
          OR EXISTS (
            SELECT 1 FROM service_order_engineers soe
            WHERE soe.service_order_id = so.id AND soe.engineer_id = :engineerId
          )
        )
        AND (
          :salespersonScope = ''
          OR so.timesheet_salesperson = :salespersonScope
          OR c.salesperson = :salespersonScope
          OR so.timesheet_salesperson = :salespersonUsernameScope
          OR c.salesperson = :salespersonUsernameScope
        )
        AND (:keyword = '' OR so.order_no LIKE :likeKeyword OR c.name LIKE :likeKeyword OR so.issue_description LIKE :likeKeyword)
  `
  const params = {
    status: status || null,
    customerId: customerId || null,
    engineerId: effectiveEngineerId,
    salespersonScope,
    salespersonUsernameScope,
    keyword,
    customer,
    startDate,
    endDate,
    likeKeyword: `%${keyword}%`,
    likeCustomer: `%${customer}%`,
  }

  const countRows = await query(`SELECT COUNT(*) AS total ${fromAndWhere}`, params)
  const rows = await query(
    `SELECT ${orderColumns}
     ${fromAndWhere}
     ORDER BY ${sortColumn} ${sortDirection}, so.id DESC
     LIMIT ${normalizedPageSize} OFFSET ${offset}`,
    {
      ...params,
    },
  )

  res.json({
    items: (await attachReports(await attachEngineers(rows))).map(orderPayload),
    total: Number(countRows[0].total),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })
}

async function statsOverview(req, res) {
  const [summaryRows, trendRows, recentRows] = await Promise.all([
    query(
      `SELECT
         SUM(DATE(COALESCE(submitted_at, created_at)) = CURDATE()) AS todayTotal,
         SUM(DATE_FORMAT(COALESCE(submitted_at, created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS monthTotal,
         COUNT(DISTINCT CASE
           WHEN DATE_FORMAT(COALESCE(submitted_at, created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
           THEN customer_id
         END) AS monthCustomers
       FROM service_orders`,
    ),
    query(
      `SELECT DATE(COALESCE(submitted_at, created_at)) AS service_date, COUNT(*) AS total
       FROM service_orders
       WHERE DATE(COALESCE(submitted_at, created_at)) >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
       GROUP BY service_date
       ORDER BY service_date ASC`,
    ),
    query(
      `SELECT ${orderColumns}
       FROM service_orders so
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN devices d ON d.id = so.device_id
       LEFT JOIN users u ON u.id = so.assigned_engineer_id
       LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
       LEFT JOIN users confirmer ON confirmer.id = so.confirmed_by
       ORDER BY so.id DESC
       LIMIT 8`,
    ),
  ])

  const engineerRows = await query(
    `SELECT COUNT(*) AS total
     FROM service_order_engineers soe
     JOIN service_orders so ON so.id = soe.service_order_id
     WHERE DATE_FORMAT(COALESCE(so.submitted_at, so.created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
  )

  const trendMap = new Map(trendRows.map((row) => [String(row.service_date).slice(0, 10), Number(row.total)]))
  const trend = []
  for (let index = 13; index >= 0; index -= 1) {
    const key = shanghaiDateKey(index)
    trend.push({
      date: key,
      total: trendMap.get(key) || 0,
    })
  }

  const summary = summaryRows[0] || {}
  res.json({
    summary: {
      todayTotal: Number(summary.todayTotal || 0),
      monthTotal: Number(summary.monthTotal || 0),
      monthCustomers: Number(summary.monthCustomers || 0),
      monthEngineerVisits: Number(engineerRows[0]?.total || 0),
    },
    trend,
    recent: (await attachEngineers(recentRows)).map(orderPayload),
  })
}

async function timesheetMonthly(req, res) {
  await ensureServiceOrderInspectionColumns()
  await ensureTimesheetManualEntriesTable()
  const { month, startDate, endDate, label } = timesheetDateRange(req.query)
  const requestedEngineerId = req.user.role === 'engineer' ? req.user.id : req.query.engineerId || ''
  const filterEngineerId = requestedEngineerId && requestedEngineerId !== 'all' ? Number(requestedEngineerId) : null
  const engineerFilterSql = filterEngineerId ? 'AND participants.engineer_id = :engineerId' : ''

  const rows = await query(
    `SELECT
       so.id, so.order_no, so.service_mode, so.service_type, so.timesheet_category, so.timesheet_salesperson,
       so.issue_description, so.planned_start_at,
       so.submitted_at, so.created_at, c.name AS customer_name, c.salesperson AS customer_salesperson, d.name AS device_name,
       sr.actual_start_at, sr.work_content, sr.fault_summary, sr.result, sr.result_description,
       u.real_name AS engineer_name
     FROM service_orders so
     JOIN (
       SELECT service_order_id, engineer_id FROM service_order_engineers
       UNION
       SELECT id AS service_order_id, assigned_engineer_id AS engineer_id
       FROM service_orders
       WHERE assigned_engineer_id IS NOT NULL
     ) participants ON participants.service_order_id = so.id
     JOIN users u ON u.id = participants.engineer_id AND u.role = 'engineer'
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     WHERE DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) >= :startDate
       AND DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) <= :endDate
       AND so.status <> 'cancelled'
       ${engineerFilterSql}
     ORDER BY u.real_name, COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at), so.id`,
    {
      engineerId: filterEngineerId,
      startDate,
      endDate,
    },
  )
  const manualRows = await query(
    `SELECT tme.id, tme.engineer_id, tme.entry_date, tme.category, tme.customer_project,
            tme.work_content, tme.progress, tme.remark, u.real_name AS engineer_name
     FROM timesheet_manual_entries tme
     JOIN users u ON u.id = tme.engineer_id AND u.role = 'engineer'
     WHERE tme.entry_date >= :startDate
       AND tme.entry_date <= :endDate
       ${filterEngineerId ? 'AND tme.engineer_id = :engineerId' : ''}
     ORDER BY u.real_name, tme.entry_date, tme.id`,
    {
      engineerId: filterEngineerId,
      startDate,
      endDate,
    },
  )

  const serviceItems = rows.map((row) => {
    const date = String(row.actual_start_at || row.planned_start_at || row.submitted_at || row.created_at).slice(0, 10)
    const [workNature, category] = timesheetType(row.service_type, row.service_mode)
    return toTraditionalDeep({
      source: 'service_order',
      serviceOrderId: row.id,
      orderNo: row.order_no,
      serviceMode: row.service_mode || 'onsite',
      engineerName: row.engineer_name || req.user.real_name || req.user.username,
      date,
      weekday: weekdayText(date),
      workNature,
      category:
        row.service_mode === 'remote'
          ? row.timesheet_category || category
          : row.service_mode === 'office'
            ? row.timesheet_category || category
            : category,
      customerName: row.customer_name,
      productName: row.device_name || '',
      workContent: row.issue_description || row.work_content || row.fault_summary || '',
      salesperson: row.timesheet_salesperson || row.customer_salesperson || '',
      progress:
        {
          resolved: '已完成',
          unresolved: '未完成',
          follow_up_required: '擱置中',
        }[row.result] || '已完成',
      remark: row.order_no,
    })
  })
  const manualItems = manualRows.map((row) => {
    const date = String(row.entry_date).slice(0, 10)
    return toTraditionalDeep({
      source: 'manual',
      manualEntryId: row.id,
      serviceOrderId: null,
      orderNo: '',
      serviceMode: 'manual',
      engineerName: row.engineer_name || req.user.real_name || req.user.username,
      date,
      weekday: weekdayText(date),
      workNature: '内部工作',
      category: row.category,
      customerName: row.customer_project || '',
      productName: row.customer_project || '',
      workContent: row.work_content,
      salesperson: '',
      progress: row.progress || '已完成',
      remark: row.remark || '',
    })
  })
  const items = [...serviceItems, ...manualItems].sort((left, right) => {
    const dateCompare = String(left.date).localeCompare(String(right.date))
    if (dateCompare) return dateCompare
    return String(left.engineerName).localeCompare(String(right.engineerName), 'zh-Hans-CN')
  })

  res.json({
    month,
    startDate,
    endDate,
    label,
    engineerName: toTraditional(filterEngineerId ? rows[0]?.engineer_name || manualRows[0]?.engineer_name || req.user.real_name || req.user.username : '全部工程師'),
    items,
  })
}

async function createTimesheetManualEntry(req, res) {
  await ensureTimesheetManualEntriesTable()
  const { entryDate, category, customerProject, workContent, progress, remark } = req.body || {}
  const normalizedDate = normalizeDateInput(entryDate, '')
  const normalizedCategory = normalizeManualEntryCategory(category)
  const missing = []
  if (!normalizedDate) missing.push('日期')
  if (!normalizedCategory) missing.push('类别')
  if (!String(workContent || '').trim()) missing.push('工作内容')
  if (missing.length) {
    throw badRequest(`请先补充必填项：${missing.join('、')}`)
  }

  const created = await transaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO timesheet_manual_entries (
         engineer_id, entry_date, category, customer_project, work_content, progress, remark, created_by
       )
       VALUES (
         :engineerId, :entryDate, :category, :customerProject, :workContent, :progress, :remark, :createdBy
       )`,
      {
        engineerId: req.user.id,
        entryDate: normalizedDate,
        category: normalizedCategory,
        customerProject: String(customerProject || '').trim() || null,
        workContent: String(workContent || '').trim(),
        progress: normalizeProgress(progress),
        remark: String(remark || '').trim() || null,
        createdBy: req.user.id,
      },
    )
    await writeAudit(connection, req.user.id, result.insertId, 'timesheet_manual_entry_create')
    return { id: result.insertId }
  })

  res.status(201).json(created)
}

async function deleteTimesheetManualEntry(req, res) {
  await ensureTimesheetManualEntriesTable()
  const rows = await query('SELECT id, engineer_id FROM timesheet_manual_entries WHERE id = :id LIMIT 1', { id: req.params.id })
  const entry = rows[0]
  if (!entry) {
    throw notFound('月报条目不存在')
  }
  if (Number(entry.engineer_id) !== Number(req.user.id)) {
    throw forbidden('只能删除自己的月报条目')
  }

  await transaction(async (connection) => {
    await connection.execute('DELETE FROM timesheet_manual_entries WHERE id = :id', { id: req.params.id })
    await writeAudit(connection, req.user.id, req.params.id, 'timesheet_manual_entry_delete')
  })
  res.status(204).end()
}

async function customerSalesperson(connection, customerId) {
  if (!customerId) return null
  const [rows] = await connection.execute('SELECT salesperson FROM customers WHERE id = :customerId LIMIT 1', { customerId })
  return rows[0]?.salesperson || null
}

async function assertDeviceBelongsToCustomer(connection, deviceId, customerId) {
  if (!deviceId) return
  const [rows] = await connection.execute('SELECT id FROM devices WHERE id = :deviceId AND customer_id = :customerId LIMIT 1', {
    deviceId,
    customerId,
  })
  if (!rows[0]) {
    throw badRequest('设备不属于所选客户')
  }
}

async function create(req, res) {
  await ensureServiceOrderInspectionColumns()
  const {
    customerId,
    deviceId,
    serviceMode = 'onsite',
    serviceType,
    timesheetCategory,
    timesheetSalesperson,
    priority = 'normal',
    issueDescription,
    internalNote,
  } =
    req.body || {}

  if (!customerId || !serviceType || !issueDescription) {
    throw badRequest('客户、服务类型和问题描述不能为空')
  }

  const result = await transaction(async (connection) => {
    const now = new Date()
    const prefix = buildOrderNo(0, now).slice(0, 10)
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM service_orders
       WHERE order_no LIKE :prefix`,
      { prefix: `${prefix}%` },
    )
    const orderNo = buildOrderNo(Number(countRows[0].total) + 1, now)
    const status = 'draft'
    const salespersonSnapshot = timesheetSalesperson || (await customerSalesperson(connection, customerId))

    const [insertResult] = await connection.execute(
      `INSERT INTO service_orders (
         order_no, customer_id, device_id, service_mode, service_type, timesheet_category, timesheet_salesperson,
         priority, status, issue_description,
         assigned_engineer_id, planned_start_at, planned_end_at, internal_note, created_by
       )
       VALUES (
         :orderNo, :customerId, :deviceId, :serviceMode, :serviceType, :timesheetCategory, :timesheetSalesperson,
         :priority, :status, :issueDescription,
         :assignedEngineerId, :plannedStartAt, :plannedEndAt, :internalNote, :createdBy
       )`,
      {
        orderNo,
        customerId,
        deviceId: deviceId || null,
        serviceMode: ['remote', 'office'].includes(serviceMode) ? serviceMode : 'onsite',
        serviceType,
        timesheetCategory: timesheetCategory || null,
        timesheetSalesperson: salespersonSnapshot,
        priority,
        status,
        issueDescription,
        assignedEngineerId: null,
        plannedStartAt: null,
        plannedEndAt: null,
        internalNote: internalNote || null,
        createdBy: req.user.id,
      },
    )

    await writeAudit(connection, req.user.id, insertResult.insertId, 'create', { status })
    return { id: insertResult.insertId, orderNo }
  })

  res.status(201).json(result)
}

async function createSelfReport(req, res) {
  const {
    customerId,
    customerName,
    customerAddress,
    customerLatitude,
    customerLongitude,
    customerMapProvider,
    customerMapPoiId,
    customerMapPoiName,
    customerMapAddress,
    contactName,
    contactPhone,
    deviceId,
    deviceName,
    deviceModel,
    devicePn,
    deviceSerialNo,
    deviceRemark,
    serviceMode = 'onsite',
    serviceType = 'repair',
    timesheetCategory,
    timesheetSalesperson,
    priority = 'normal',
    issueDescription,
    departureAt,
    actualStartAt,
    actualEndAt,
    returnAt,
    workHours,
    faultSummary,
    workContent,
    workEntries = [],
    result,
    resultDescription,
    customerConfirmName,
    customerSignature,
    engineerIds = [],
    parts = [],
  } = req.body || {}

  const effectiveServiceMode = ['remote', 'office'].includes(serviceMode) ? serviceMode : 'onsite'
  const missing = []
  if (!customerId && !customerName) missing.push('客户名称')
  if (effectiveServiceMode === 'onsite' && !customerAddress) missing.push('客户地址')
  if (!contactName) missing.push('客户联系人')
  if (!contactPhone) missing.push('联系人电话')
  if (effectiveServiceMode === 'onsite' && serviceType !== 'install' && !deviceName && !deviceId) {
    missing.push(effectiveServiceMode === 'remote' ? '专案名称 / 产品名称' : '设备/系统')
  }
  if (effectiveServiceMode === 'onsite' && !serviceType) missing.push('服务类型')
  if (effectiveServiceMode !== 'onsite' && !timesheetCategory) missing.push('月报类别')
  if (!issueDescription) missing.push(effectiveServiceMode === 'onsite' ? '问题描述' : '月报工作内容')
  if (!hasSubmittedWorkContent(workContent, workEntries)) missing.push(effectiveServiceMode === 'onsite' ? '现场处理记录' : '处理记录')
  if (!result) missing.push(effectiveServiceMode === 'onsite' ? '服务结果' : '处理进度')
  if (!actualStartAt) missing.push(effectiveServiceMode === 'onsite' ? '到达时间' : '开始时间')
  if (!actualEndAt) missing.push(effectiveServiceMode === 'onsite' ? '完成时间' : '结束时间')
  if (effectiveServiceMode === 'onsite' && !customerSignature) missing.push('客户手写签名')

  if (missing.length) {
    throw badRequest(`请先补充必填项：${missing.join('、')}`)
  }

  if (effectiveServiceMode === 'onsite') {
    await ensureServiceReportWorkEntriesTable()
  }
  await ensureServiceReportTravelColumns()
  await ensureSelfReportDraftsTable()

  const created = await transaction(async (connection) => {
    await ensureSelfReportDraftsTable(connection)
    let effectiveCustomerId = customerId || null
    if (!effectiveCustomerId) {
      const nameKey = customerNameKey(customerName)
      const [existingCustomers] = await connection.execute('SELECT id FROM customers WHERE name_key = :nameKey LIMIT 1', { nameKey })
      if (existingCustomers[0]) {
        effectiveCustomerId = existingCustomers[0].id
        await connection.execute(
          `UPDATE customers
           SET address = COALESCE(NULLIF(address, ''), :customerAddress),
               contact_name = COALESCE(NULLIF(contact_name, ''), :contactName),
               contact_phone = COALESCE(NULLIF(contact_phone, ''), :contactPhone),
               latitude = COALESCE(latitude, :customerLatitude),
               longitude = COALESCE(longitude, :customerLongitude),
               map_provider = COALESCE(NULLIF(map_provider, ''), :customerMapProvider),
               map_poi_id = COALESCE(NULLIF(map_poi_id, ''), :customerMapPoiId),
               map_poi_name = COALESCE(NULLIF(map_poi_name, ''), :customerMapPoiName),
               map_address = COALESCE(NULLIF(map_address, ''), :customerMapAddress)
           WHERE id = :customerId`,
          {
            customerId: effectiveCustomerId,
            customerAddress: customerAddress || null,
            contactName: contactName || null,
            contactPhone: contactPhone || null,
            customerLatitude: customerLatitude || null,
            customerLongitude: customerLongitude || null,
            customerMapProvider: customerMapProvider || null,
            customerMapPoiId: customerMapPoiId || null,
            customerMapPoiName: customerMapPoiName || null,
            customerMapAddress: customerMapAddress || null,
          },
        )
      } else {
        const [customerResult] = await connection.execute(
        `INSERT INTO customers (
           name, name_key, address, contact_name, contact_phone, latitude, longitude,
           map_provider, map_poi_id, map_poi_name, map_address
         )
         VALUES (
           :customerName, :nameKey, :customerAddress, :contactName, :contactPhone, :customerLatitude, :customerLongitude,
           :customerMapProvider, :customerMapPoiId, :customerMapPoiName, :customerMapAddress
         )`,
          {
            customerName,
            nameKey,
            customerAddress: customerAddress || null,
            contactName: contactName || null,
            contactPhone: contactPhone || null,
            customerLatitude: customerLatitude || null,
            customerLongitude: customerLongitude || null,
            customerMapProvider: customerMapProvider || null,
            customerMapPoiId: customerMapPoiId || null,
            customerMapPoiName: customerMapPoiName || null,
            customerMapAddress: customerMapAddress || null,
          },
        )
        effectiveCustomerId = customerResult.insertId
      }
    } else {
      await connection.execute(
        `UPDATE customers
         SET name = COALESCE(NULLIF(:customerName, ''), name),
             name_key = COALESCE(NULLIF(:customerNameKey, ''), name_key),
             latitude = COALESCE(:customerLatitude, latitude),
             longitude = COALESCE(:customerLongitude, longitude),
             map_provider = COALESCE(NULLIF(:customerMapProvider, ''), map_provider),
             map_poi_id = COALESCE(NULLIF(:customerMapPoiId, ''), map_poi_id),
             map_poi_name = COALESCE(NULLIF(:customerMapPoiName, ''), map_poi_name),
             map_address = COALESCE(NULLIF(:customerMapAddress, ''), map_address),
             address = COALESCE(NULLIF(:customerAddress, ''), address),
             contact_name = COALESCE(NULLIF(:contactName, ''), contact_name),
             contact_phone = COALESCE(NULLIF(:contactPhone, ''), contact_phone)
         WHERE id = :customerId`,
        {
          customerId: effectiveCustomerId,
          customerName: customerName || null,
          customerNameKey: customerName ? customerNameKey(customerName) : null,
          customerAddress: customerAddress || null,
          contactName: contactName || null,
          contactPhone: contactPhone || null,
          customerLatitude: customerLatitude || null,
          customerLongitude: customerLongitude || null,
          customerMapProvider: customerMapProvider || null,
          customerMapPoiId: customerMapPoiId || null,
          customerMapPoiName: customerMapPoiName || null,
          customerMapAddress: customerMapAddress || null,
        },
      )
    }

    await recordCustomerContact(connection, effectiveCustomerId, contactName || customerConfirmName, contactPhone, req.user.id)

    let effectiveDeviceId = deviceId || null
    if (effectiveDeviceId) {
      await assertDeviceBelongsToCustomer(connection, effectiveDeviceId, effectiveCustomerId)
    }
    const hasInstallDeviceFields = effectiveServiceMode === 'onsite'
      && serviceType === 'install'
      && [deviceModel, devicePn, deviceSerialNo, deviceRemark].some((value) => String(value || '').trim())
    const effectiveDeviceName = String(deviceName || deviceModel || devicePn || deviceSerialNo || '现场安装设备').trim()
    if (!effectiveDeviceId && (deviceName || hasInstallDeviceFields)) {
      const [deviceResult] = await connection.execute(
        `INSERT INTO devices (customer_id, name, model, pn, serial_no, remark)
         VALUES (:customerId, :deviceName, :deviceModel, :devicePn, :deviceSerialNo, :deviceRemark)`,
        {
          customerId: effectiveCustomerId,
          deviceName: effectiveDeviceName,
          deviceModel: deviceModel || null,
          devicePn: devicePn || null,
          deviceSerialNo: deviceSerialNo || null,
          deviceRemark: deviceRemark || null,
        },
      )
      effectiveDeviceId = deviceResult.insertId
    }

    const now = new Date()
    const prefix = buildOrderNo(0, now).slice(0, 10)
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM service_orders
       WHERE order_no LIKE :prefix`,
      { prefix: `${prefix}%` },
    )
    const orderNo = buildOrderNo(Number(countRows[0].total) + 1, now)
    const salespersonSnapshot = timesheetSalesperson || (await customerSalesperson(connection, effectiveCustomerId))

    const [orderResult] = await connection.execute(
      `INSERT INTO service_orders (
         order_no, customer_id, device_id, service_mode, service_type, timesheet_category, timesheet_salesperson,
         priority, status, issue_description,
         assigned_engineer_id, planned_start_at, planned_end_at, created_by, submitted_at
       )
       VALUES (
         :orderNo, :customerId, :deviceId, :serviceMode, :serviceType, :timesheetCategory, :timesheetSalesperson,
         :priority, 'submitted', :issueDescription,
         :engineerId, :actualStartAt, :actualEndAt, :createdBy, CURRENT_TIMESTAMP
       )`,
      {
        orderNo,
        customerId: effectiveCustomerId,
        deviceId: effectiveDeviceId,
        serviceMode: effectiveServiceMode,
        serviceType,
        timesheetCategory: effectiveServiceMode === 'onsite' ? null : timesheetCategory || '其他',
        timesheetSalesperson: salespersonSnapshot,
        priority,
        issueDescription,
        engineerId: null,
        actualStartAt: actualStartAt || null,
        actualEndAt: actualEndAt || null,
        createdBy: req.user.id,
      },
    )

    if (!deviceId && effectiveDeviceId) {
      await connection.execute(
        `UPDATE devices
         SET installation_source_service_order_id = COALESCE(installation_source_service_order_id, :serviceOrderId)
         WHERE id = :deviceId`,
        {
          deviceId: effectiveDeviceId,
          serviceOrderId: orderResult.insertId,
        },
      )
    }

    await replaceOrderEngineers(connection, orderResult.insertId, normalizeEngineerIds(engineerIds, req.user.id), req.user.id)
    const savedWorkEntries =
      effectiveServiceMode === 'office'
        ? []
        : await saveWorkEntries(connection, orderResult.insertId, workEntries, workContent, req.user.id)
    const effectiveWorkContent = String(workContent || '').trim() || mergedWorkContent(savedWorkEntries, workContent)

    const customerSignatureFileId = await saveSignatureFile(connection, orderResult.insertId, customerSignature, req.user.id)

    await connection.execute(
      `INSERT INTO service_reports (
         service_order_id, departure_at, actual_start_at, actual_end_at, return_at, work_hours, fault_summary, work_content,
         result, result_description, customer_name, customer_signature_file_id, customer_signature
       )
       VALUES (
         :orderId, :departureAt, :actualStartAt, :actualEndAt, :returnAt, :workHours, :faultSummary, :workContent,
         :result, :resultDescription, :customerConfirmName, :customerSignatureFileId, NULL
       )`,
      {
        orderId: orderResult.insertId,
        departureAt: departureAt || null,
        actualStartAt: actualStartAt || null,
        actualEndAt: actualEndAt || null,
        returnAt: returnAt || null,
        workHours: workHours || null,
        faultSummary: faultSummary || null,
        workContent: effectiveWorkContent,
        result,
        resultDescription: resultDescription || null,
        customerConfirmName: customerConfirmName || contactName || null,
        customerSignatureFileId,
      },
    )

    for (const part of parts) {
      if (!part.partName) continue
      await connection.execute(
        `INSERT INTO service_parts (service_order_id, part_name, part_no, quantity, unit, remark)
         VALUES (:orderId, :partName, :partNo, :quantity, :unit, :remark)`,
        {
          orderId: orderResult.insertId,
          partName: part.partName,
          partNo: part.partNo || null,
          quantity: part.quantity || 1,
          unit: part.unit || null,
          remark: part.remark || null,
        },
      )
    }

    await writeAudit(connection, req.user.id, orderResult.insertId, 'self_report_submit')
    await connection.execute(
      `DELETE FROM self_report_drafts
       WHERE engineer_id = :engineerId
         AND draft_scope = 'create'
         AND service_order_id = 0`,
      { engineerId: req.user.id },
    )
    return {
      id: orderResult.insertId,
      orderNo,
    }
  })

  res.status(201).json(created)
}

async function detail(req, res) {
  await ensureServiceOrderInspectionColumns()
  let order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  await assertEngineerOwns(order, req.user)
  order = (await attachEngineers([order]))[0]

  const reports = await query(
    `SELECT *
     FROM service_reports
     WHERE service_order_id = :id
     ORDER BY id DESC
     LIMIT 1`,
    { id: req.params.id },
  )
  const hydratedReport = await hydrateReportSignature(reports[0])
  const workEntriesByOrder = await loadWorkEntries([Number(req.params.id)])
  const report = hydratedReport ? { ...hydratedReport, workEntries: workEntriesByOrder.get(Number(req.params.id)) || [] } : null
  const contacts = await query(
    `SELECT cc.id, cc.customer_id, cc.name, cc.phone, cc.use_count, cc.last_used_at,
            COALESCE(ccu.use_count, 0) AS engineer_use_count,
            ccu.last_used_at AS engineer_last_used_at
     FROM customer_contacts cc
     LEFT JOIN customer_contact_usage ccu
       ON ccu.customer_contact_id = cc.id AND ccu.engineer_id = :engineerId
     WHERE cc.customer_id = :customerId
     ORDER BY engineer_use_count DESC, engineer_last_used_at DESC, cc.use_count DESC, cc.last_used_at DESC, cc.id DESC
     LIMIT 20`,
    { customerId: order.customer_id, engineerId: req.user.id },
  )
  const parts = await query(
    `SELECT id, service_order_id, part_name, part_no, quantity, unit, remark, created_at, updated_at
     FROM service_parts
     WHERE service_order_id = :id
     ORDER BY id ASC`,
    { id: req.params.id },
  )
  const files = await query(
    `SELECT id, owner_type, owner_id, original_name, mime_type, size, uploaded_by, created_at
     FROM files
     WHERE owner_type IN ('service_order', 'service_report', 'signature') AND owner_id = :id
     ORDER BY id ASC`,
    { id: req.params.id },
  )

  res.json({
    item: {
      ...orderPayload(order),
      report: reportPayload(report),
      contacts: contacts.map((contact) => ({
        id: contact.id,
        customerId: contact.customer_id,
        name: contact.name,
        phone: contact.phone,
        useCount: contact.use_count,
        lastUsedAt: contact.last_used_at,
      })),
      parts: parts.map((part) => ({
        id: part.id,
        serviceOrderId: part.service_order_id,
        partName: part.part_name,
        partNo: part.part_no,
        quantity: part.quantity,
        unit: part.unit,
        remark: part.remark,
        createdAt: part.created_at,
        updatedAt: part.updated_at,
      })),
      files: files.map((file) => ({
        id: file.id,
        ownerType: file.owner_type,
        ownerId: file.owner_id,
        originalName: file.original_name,
        mimeType: file.mime_type,
        size: file.size,
        uploadedBy: file.uploaded_by,
        createdAt: file.created_at,
      })),
    },
  })
}

async function latestCustomerSignature(req, res) {
  const customerId = Number(req.query.customerId || 0)
  const nameKey = customerNameKey(req.query.customerName || '')
  const filters = []
  const params = {}

  if (customerId) {
    filters.push('so.customer_id = :customerId')
    params.customerId = customerId
  }
  if (nameKey) {
    filters.push('c.name_key = :customerNameKey')
    params.customerNameKey = nameKey
  }
  if (!filters.length) {
    throw badRequest('请先选择或填写客户名称')
  }

  const rows = await query(
    `SELECT sr.customer_signature_file_id, sr.customer_signature
     FROM service_reports sr
     JOIN service_orders so ON so.id = sr.service_order_id
     JOIN customers c ON c.id = so.customer_id
     WHERE (sr.customer_signature_file_id IS NOT NULL OR sr.customer_signature IS NOT NULL)
       AND (${filters.join(' OR ')})
     ORDER BY COALESCE(sr.updated_at, sr.created_at) DESC, sr.id DESC
     LIMIT 1`,
    params,
  )
  const signature = rows[0]?.customer_signature_file_id
    ? await signatureDataUrl(rows[0].customer_signature_file_id)
    : rows[0]?.customer_signature || ''

  res.json({ customerSignature: signature })
}

async function getSelfReportDraft(req, res) {
  await ensureSelfReportDraftsTable()
  const orderId = normalizeDraftOrderId(req.query.serviceOrderId)
  const draftScope = normalizeDraftScope(orderId)
  const rows = await query(
    `SELECT id, engineer_id, draft_scope, service_order_id, payload_json, client_updated_at, created_at, updated_at
     FROM self_report_drafts
     WHERE engineer_id = :engineerId
       AND draft_scope = :draftScope
       AND service_order_id = :serviceOrderId
     LIMIT 1`,
    {
      engineerId: req.user.id,
      draftScope,
      serviceOrderId: orderId,
    },
  )
  const item = rows[0]
  if (!item) {
    res.json({ item: null })
    return
  }
  res.json({
    item: {
      scope: item.draft_scope,
      serviceOrderId: item.service_order_id,
      payload: parseDraftPayload(item.payload_json) || {},
      clientUpdatedAt: item.client_updated_at || '',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    },
  })
}

async function saveSelfReportDraft(req, res) {
  const payload = req.body?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('草稿内容不能为空')
  }
  const orderId = normalizeDraftOrderId(req.body?.serviceOrderId)
  const draftScope = normalizeDraftScope(orderId)
  const clientUpdatedAt = String(req.body?.clientUpdatedAt || '').trim() || null
  await ensureSelfReportDraftsTable()

  await transaction(async (connection) => {
    await ensureSelfReportDraftsTable(connection)
    if (orderId) {
      const order = await getOrder(orderId)
      if (!order) throw notFound('服务单不存在')
      await assertEngineerOwns(order, req.user)
      assertEditable(order)
    }

    await connection.execute(
      `INSERT INTO self_report_drafts (engineer_id, draft_scope, service_order_id, payload_json, client_updated_at)
       VALUES (:engineerId, :draftScope, :serviceOrderId, :payloadJson, :clientUpdatedAt)
       ON DUPLICATE KEY UPDATE
         payload_json = VALUES(payload_json),
         client_updated_at = VALUES(client_updated_at),
         updated_at = CURRENT_TIMESTAMP`,
      {
        engineerId: req.user.id,
        draftScope,
        serviceOrderId: orderId,
        payloadJson: JSON.stringify(payload),
        clientUpdatedAt,
      },
    )
  })

  res.status(204).end()
}

async function deleteSelfReportDraft(req, res) {
  await ensureSelfReportDraftsTable()
  const orderId = normalizeDraftOrderId(req.query.serviceOrderId || req.body?.serviceOrderId)
  const draftScope = normalizeDraftScope(orderId)
  await query(
    `DELETE FROM self_report_drafts
     WHERE engineer_id = :engineerId
       AND draft_scope = :draftScope
       AND service_order_id = :serviceOrderId`,
    {
      engineerId: req.user.id,
      draftScope,
      serviceOrderId: orderId,
    },
  )
  res.status(204).end()
}

async function updateSelfReport(req, res) {
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  await assertEngineerOwns(order, req.user)
  assertEditable(order)

  const {
    customerName,
    customerAddress,
    customerLatitude,
    customerLongitude,
    customerMapProvider,
    customerMapPoiId,
    customerMapPoiName,
    customerMapAddress,
    contactName,
    contactPhone,
    deviceId,
    deviceName,
    deviceModel,
    devicePn,
    deviceSerialNo,
    deviceRemark,
    serviceMode = order.service_mode || 'onsite',
    serviceType = order.service_type,
    timesheetCategory,
    timesheetSalesperson,
    priority = order.priority,
    issueDescription,
    departureAt,
    actualStartAt,
    actualEndAt,
    returnAt,
    workHours,
    faultSummary,
    workContent,
    workEntries = [],
    result,
    resultDescription,
    customerConfirmName,
    customerSignature,
    engineerIds = [],
    parts = [],
  } = req.body || {}

  const effectiveServiceMode = ['remote', 'office'].includes(serviceMode) ? serviceMode : 'onsite'
  const hasDeviceIdField = Object.prototype.hasOwnProperty.call(req.body || {}, 'deviceId')
  const existingSignature = await query(
    `SELECT customer_signature_file_id, customer_signature
     FROM service_reports
     WHERE service_order_id = :id
     ORDER BY id DESC
     LIMIT 1`,
    { id: req.params.id },
  )
  const hasExistingSignature = Boolean(existingSignature[0]?.customer_signature_file_id || existingSignature[0]?.customer_signature)
  const missing = []
  if (!customerName) missing.push('客户名称')
  if (effectiveServiceMode === 'onsite' && !customerAddress) missing.push('客户地址')
  if (!contactName && !customerConfirmName) missing.push('客户联系人')
  if (!contactPhone) missing.push('联系人电话')
  if (effectiveServiceMode === 'onsite' && serviceType !== 'install' && !deviceName && !order.device_id) {
    missing.push(effectiveServiceMode === 'remote' ? '专案名称 / 产品名称' : '设备/系统')
  }
  if (effectiveServiceMode === 'onsite' && !serviceType) missing.push('服务类型')
  if (effectiveServiceMode !== 'onsite' && !timesheetCategory) missing.push('月报类别')
  if (!issueDescription) missing.push(effectiveServiceMode === 'onsite' ? '问题描述' : '月报工作内容')
  if (!hasSubmittedWorkContent(workContent, workEntries)) missing.push(effectiveServiceMode === 'onsite' ? '现场处理记录' : '处理记录')
  if (!result) missing.push(effectiveServiceMode === 'onsite' ? '服务结果' : '处理进度')
  if (!actualStartAt) missing.push(effectiveServiceMode === 'onsite' ? '到达时间' : '开始时间')
  if (!actualEndAt) missing.push(effectiveServiceMode === 'onsite' ? '完成时间' : '结束时间')
  if (effectiveServiceMode === 'onsite' && !customerSignature && !hasExistingSignature) missing.push('客户手写签名')

  if (missing.length) {
    throw badRequest(`请先补充必填项：${missing.join('、')}`)
  }

  if (effectiveServiceMode === 'onsite') {
    await ensureServiceReportWorkEntriesTable()
  }
  await ensureServiceReportTravelColumns()
  await ensureSelfReportDraftsTable()

  await transaction(async (connection) => {
    await ensureSelfReportDraftsTable(connection)
    await connection.execute(
      `UPDATE customers
       SET name = :customerName,
           name_key = :customerNameKey,
           address = :customerAddress,
           contact_name = :contactName,
           contact_phone = :contactPhone,
           latitude = COALESCE(:customerLatitude, latitude),
           longitude = COALESCE(:customerLongitude, longitude),
           map_provider = COALESCE(:customerMapProvider, map_provider),
           map_poi_id = COALESCE(:customerMapPoiId, map_poi_id),
           map_poi_name = COALESCE(:customerMapPoiName, map_poi_name),
           map_address = COALESCE(:customerMapAddress, map_address)
       WHERE id = :customerId`,
      {
        customerId: order.customer_id,
        customerName,
        customerNameKey: customerNameKey(customerName),
        customerAddress: customerAddress || null,
        contactName: contactName || customerConfirmName || null,
        contactPhone: contactPhone || null,
        customerLatitude: customerLatitude || null,
        customerLongitude: customerLongitude || null,
        customerMapProvider: customerMapProvider || null,
        customerMapPoiId: customerMapPoiId || null,
        customerMapPoiName: customerMapPoiName || null,
        customerMapAddress: customerMapAddress || null,
      },
    )

    let effectiveDeviceId = hasDeviceIdField ? Number(deviceId || 0) || null : order.device_id || null
    if (effectiveDeviceId) {
      await assertDeviceBelongsToCustomer(connection, effectiveDeviceId, order.customer_id)
    }
    const hasInstallDeviceFields = effectiveServiceMode === 'onsite'
      && serviceType === 'install'
      && [deviceModel, devicePn, deviceSerialNo, deviceRemark].some((value) => String(value || '').trim())
    const effectiveDeviceName = String(deviceName || deviceModel || devicePn || deviceSerialNo || '现场安装设备').trim()
    if (effectiveServiceMode === 'onsite' && serviceType === 'install' && !effectiveDeviceId && (deviceName || hasInstallDeviceFields)) {
      const [deviceResult] = await connection.execute(
        `INSERT INTO devices (
           customer_id, name, model, pn, serial_no, remark, maintenance_type, installation_source_service_order_id
         )
         VALUES (:customerId, :deviceName, :deviceModel, :devicePn, :deviceSerialNo, :deviceRemark, 'none', :serviceOrderId)`,
        {
          customerId: order.customer_id,
          deviceName: effectiveDeviceName,
          deviceModel: deviceModel || null,
          devicePn: devicePn || null,
          deviceSerialNo: deviceSerialNo || null,
          deviceRemark: deviceRemark || null,
          serviceOrderId: req.params.id,
        },
      )
      effectiveDeviceId = deviceResult.insertId
    } else if (effectiveDeviceId && (deviceName || hasInstallDeviceFields)) {
      await connection.execute(
        `UPDATE devices
         SET name = :deviceName,
             model = :deviceModel,
             pn = :devicePn,
             serial_no = :deviceSerialNo,
             remark = :deviceRemark
         WHERE id = :deviceId`,
        {
          deviceId: effectiveDeviceId,
          deviceName: effectiveDeviceName,
          deviceModel: deviceModel || null,
          devicePn: devicePn || null,
          deviceSerialNo: deviceSerialNo || null,
          deviceRemark: deviceRemark || null,
        },
      )
    }

    await connection.execute(
      `UPDATE service_orders
       SET device_id = :deviceId,
           service_mode = :serviceMode,
           service_type = :serviceType,
           timesheet_category = :timesheetCategory,
           timesheet_salesperson = COALESCE(:timesheetSalesperson, timesheet_salesperson),
           priority = :priority,
           issue_description = :issueDescription,
           planned_start_at = :actualStartAt,
           planned_end_at = :actualEndAt,
           status = 'submitted',
           submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP)
       WHERE id = :id`,
      {
        id: req.params.id,
        deviceId: effectiveDeviceId,
        serviceMode: effectiveServiceMode,
        serviceType,
        timesheetCategory: effectiveServiceMode === 'onsite' ? null : timesheetCategory || '其他',
        timesheetSalesperson: timesheetSalesperson || null,
        priority,
        issueDescription,
        actualStartAt: actualStartAt || null,
        actualEndAt: actualEndAt || null,
      },
    )

    const normalizedEngineerIds = normalizeEngineerIds(engineerIds, req.user.id)
    await replaceOrderEngineers(connection, req.params.id, normalizedEngineerIds, req.user.id)
    await pruneWorkEntriesToEngineers(connection, req.params.id, normalizedEngineerIds)

    const savedSignatureFileId = await saveSignatureFile(connection, req.params.id, customerSignature, req.user.id)
    const savedWorkEntries =
      effectiveServiceMode === 'office'
        ? []
        : await saveWorkEntries(connection, req.params.id, workEntries, workContent, req.user.id)
    const effectiveWorkContent = String(workContent || '').trim() || mergedWorkContent(savedWorkEntries, workContent)

    await connection.execute(
      `INSERT INTO service_reports (
         service_order_id, departure_at, actual_start_at, actual_end_at, return_at, work_hours, fault_summary, work_content,
         result, result_description, customer_name, customer_signature_file_id, customer_signature
       )
       VALUES (
         :id, :departureAt, :actualStartAt, :actualEndAt, :returnAt, :workHours, :faultSummary, :workContent,
         :result, :resultDescription, :customerConfirmName, :customerSignatureFileId, NULL
       )
       ON DUPLICATE KEY UPDATE
         departure_at = VALUES(departure_at),
         actual_start_at = VALUES(actual_start_at),
         actual_end_at = VALUES(actual_end_at),
         return_at = VALUES(return_at),
         work_hours = VALUES(work_hours),
         fault_summary = VALUES(fault_summary),
         work_content = VALUES(work_content),
         result = VALUES(result),
         result_description = VALUES(result_description),
         customer_name = VALUES(customer_name),
         customer_signature_file_id = COALESCE(VALUES(customer_signature_file_id), customer_signature_file_id),
         customer_signature = IF(VALUES(customer_signature_file_id) IS NULL, customer_signature, NULL)`,
      {
        id: req.params.id,
        departureAt: departureAt || null,
        actualStartAt: actualStartAt || null,
        actualEndAt: actualEndAt || null,
        returnAt: returnAt || null,
        workHours: workHours || null,
        faultSummary: faultSummary || null,
        workContent: effectiveWorkContent,
        result,
        resultDescription: resultDescription || null,
        customerConfirmName: customerConfirmName || contactName || null,
        customerSignatureFileId: savedSignatureFileId,
      },
    )

    await connection.execute('DELETE FROM service_parts WHERE service_order_id = :id', { id: req.params.id })
    for (const part of parts) {
      if (!part.partName) continue
      await connection.execute(
        `INSERT INTO service_parts (service_order_id, part_name, part_no, quantity, unit, remark)
         VALUES (:id, :partName, :partNo, :quantity, :unit, :remark)`,
        {
          id: req.params.id,
          partName: part.partName,
          partNo: part.partNo || null,
          quantity: part.quantity || 1,
          unit: part.unit || null,
          remark: part.remark || null,
        },
      )
    }

    await recordCustomerContact(connection, order.customer_id, contactName || customerConfirmName, contactPhone, req.user.id)
    await writeAudit(connection, req.user.id, req.params.id, 'self_report_update')
    await connection.execute(
      `DELETE FROM self_report_drafts
       WHERE engineer_id = :engineerId
         AND draft_scope = 'edit'
         AND service_order_id = :serviceOrderId`,
      {
        engineerId: req.user.id,
        serviceOrderId: req.params.id,
      },
    )
  })

  res.status(204).end()
}

async function update(req, res) {
  await ensureServiceOrderInspectionColumns()
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  assertEditable(order)

  const { customerId, deviceId, serviceMode, serviceType, timesheetCategory, timesheetSalesperson, priority, issueDescription, internalNote } = req.body || {}
  const normalizedServiceMode = ['remote', 'onsite', 'office'].includes(serviceMode) ? serviceMode : null
  const effectiveServiceMode = normalizedServiceMode || order.service_mode || 'onsite'
  const effectiveTimesheetCategory =
    effectiveServiceMode === 'remote' ? timesheetCategory || order.timesheet_category || '排障' : null
  await query(
    `UPDATE service_orders
     SET customer_id = COALESCE(:customerId, customer_id),
         device_id = :deviceId,
         service_mode = COALESCE(:serviceMode, service_mode),
         service_type = COALESCE(:serviceType, service_type),
         timesheet_category = :timesheetCategory,
         timesheet_salesperson = COALESCE(:timesheetSalesperson, timesheet_salesperson),
         priority = COALESCE(:priority, priority),
         issue_description = COALESCE(:issueDescription, issue_description),
         internal_note = :internalNote
     WHERE id = :id`,
    {
      id: req.params.id,
      customerId: customerId || null,
      deviceId: deviceId || null,
      serviceMode: normalizedServiceMode,
      serviceType: serviceType || null,
      timesheetCategory: effectiveTimesheetCategory,
      timesheetSalesperson: timesheetSalesperson || null,
      priority: priority || null,
      issueDescription: issueDescription || null,
      internalNote: internalNote || null,
    },
  )

  res.status(204).end()
}

async function confirmInspectionOrder(req, res) {
  await ensureServiceOrderInspectionColumns()
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  if (order.status !== 'pending_confirmation') {
    throw badRequest('仅待确认巡检工单可以确认派发')
  }
  if (!order.inspection_schedule_id || order.service_type !== 'inspect') {
    throw badRequest('仅巡检计划生成的工单可以走确认派发')
  }

  const engineerId = Number(req.body?.engineerId || order.target_engineer_id || 0)
  if (!engineerId) {
    throw badRequest('请选择派发工程师')
  }
  const plannedStartAt = String(req.body?.plannedStartAt || order.planned_start_at || `${order.inspection_occurrence_date} 09:00:00`).trim()
  const plannedEndAt = String(req.body?.plannedEndAt || order.planned_end_at || '').trim() || null

  await transaction(async (connection) => {
    await ensureServiceOrderInspectionColumns(connection)
    const [engineerRows] = await connection.execute(
      `SELECT id
       FROM users
       WHERE id = :engineerId AND role = 'engineer' AND status = 'active'
       LIMIT 1`,
      { engineerId },
    )
    if (!engineerRows[0]) {
      throw badRequest('派发工程师不存在或未启用')
    }
    const [updateResult] = await connection.execute(
      `UPDATE service_orders
       SET status = 'assigned',
           assigned_engineer_id = :engineerId,
           target_engineer_id = :engineerId,
           planned_start_at = :plannedStartAt,
           planned_end_at = :plannedEndAt,
           confirmed_by = :confirmedBy,
           confirmed_at = CURRENT_TIMESTAMP
       WHERE id = :id
         AND status = 'pending_confirmation'`,
      {
        id: req.params.id,
        engineerId,
        plannedStartAt,
        plannedEndAt,
        confirmedBy: req.user.id,
      },
    )
    if (!updateResult.affectedRows) {
      throw badRequest('当前服务单状态已变化，请刷新后重试')
    }
    await replaceOrderEngineers(connection, req.params.id, [engineerId], req.user.id)
    await writeAudit(connection, req.user.id, req.params.id, 'inspection_order_confirm', {
      inspectionScheduleId: order.inspection_schedule_id,
      inspectionOccurrenceDate: order.inspection_occurrence_date,
      engineerId,
      plannedStartAt,
    })
  })

  res.json({ item: orderPayload((await attachEngineers([await getOrder(req.params.id)]))[0]) })
}

async function cancelByEngineer(req, res) {
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  await assertEngineerOwns(order, req.user)

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE service_orders
       SET status = 'cancelled'
       WHERE id = :id`,
      { id: req.params.id },
    )
    await writeAudit(connection, req.user.id, req.params.id, 'cancel', {
      orderNo: order.order_no,
      previousStatus: order.status,
      source: 'engineer_rc',
    })
  })

  res.status(204).end()
}

async function bulkDelete(req, res) {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => Number(id)).filter(Boolean))]
    : []
  if (!ids.length) {
    throw badRequest('请选择要删除的服务表')
  }

  const { params, placeholders } = idParams(ids, 'orderId')
  const rows = await query(
    `SELECT id, order_no
     FROM service_orders
     WHERE id IN (${placeholders})`,
    params,
  )
  if (!rows.length) {
    throw notFound('服务表不存在')
  }
  const foundIds = rows.map((row) => Number(row.id))
  const found = idParams(foundIds, 'orderId')

  await transaction(async (connection) => {
    await ensureServiceReportWorkEntriesTable(connection)
    await connection.execute(`DELETE FROM service_report_work_entries WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(`DELETE FROM service_parts WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(
      `DELETE FROM files
       WHERE (owner_type = 'service_order' AND owner_id IN (${found.placeholders}))
          OR (owner_type = 'service_report' AND owner_id IN (${found.placeholders}))
          OR (owner_type = 'signature' AND owner_id IN (${found.placeholders}))`,
      found.params,
    )
    await connection.execute(`DELETE FROM service_reports WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(`DELETE FROM service_order_engineers WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(`DELETE FROM service_orders WHERE id IN (${found.placeholders})`, found.params)

    for (const row of rows) {
      await writeAudit(connection, req.user.id, row.id, 'delete', { orderNo: row.order_no })
    }
  })

  res.json({ deleted: foundIds.length })
}

module.exports = {
  list,
  statsOverview,
  timesheetMonthly,
  createTimesheetManualEntry,
  deleteTimesheetManualEntry,
  create,
  createSelfReport,
  updateSelfReport,
  detail,
  latestCustomerSignature,
  getSelfReportDraft,
  saveSelfReportDraft,
  deleteSelfReportDraft,
  cancelByEngineer,
  confirmInspectionOrder,
  update,
  bulkDelete,
}
