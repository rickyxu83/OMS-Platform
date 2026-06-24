const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')

const VALID_TYPES = new Set(['problem', 'suggestion'])
const VALID_STATUSES = new Set(['open', 'resolved'])

async function ensureFeedbackTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS feedback_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      type ENUM('problem', 'suggestion') NOT NULL DEFAULT 'problem',
      content TEXT NOT NULL,
      page_path VARCHAR(255) NULL,
      status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
      submitter_id BIGINT UNSIGNED NOT NULL,
      submitter_role VARCHAR(64) NOT NULL,
      resolved_by BIGINT UNSIGNED NULL,
      resolved_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_feedback_status_created (status, created_at),
      KEY idx_feedback_submitter (submitter_id),
      CONSTRAINT fk_feedback_submitter FOREIGN KEY (submitter_id) REFERENCES users (id),
      CONSTRAINT fk_feedback_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

function feedbackPayload(row) {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    pagePath: row.page_path,
    status: row.status,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    submitterUsername: row.submitter_username,
    submitterRole: row.submitter_role,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolved_by_name,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeType(value) {
  const type = String(value || 'problem').trim()
  return VALID_TYPES.has(type) ? type : ''
}

function normalizeStatus(value) {
  const status = String(value || '').trim()
  return VALID_STATUSES.has(status) ? status : ''
}

async function create(req, res) {
  await ensureFeedbackTable()

  const type = normalizeType(req.body?.type)
  const content = String(req.body?.content || '').trim()
  const pagePath = String(req.body?.pagePath || '').trim().slice(0, 255) || null

  if (!type) throw badRequest('反馈类型无效')
  if (!content) throw badRequest('请填写反馈内容')
  if (content.length > 2000) throw badRequest('反馈内容不能超过 2000 字')

  const result = await query(
    `INSERT INTO feedback_items (type, content, page_path, submitter_id, submitter_role)
     VALUES (:type, :content, :pagePath, :submitterId, :submitterRole)`,
    {
      type,
      content,
      pagePath,
      submitterId: req.user.id,
      submitterRole: req.user.role,
    },
  )

  res.status(201).json({ id: result.insertId })
}

async function list(req, res) {
  await ensureFeedbackTable()

  const { status = 'all', page = '1', pageSize = '50' } = req.query
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50))
  const offset = (normalizedPage - 1) * normalizedPageSize
  const normalizedStatus = status === 'all' ? '' : normalizeStatus(status)

  if (status !== 'all' && !normalizedStatus) throw badRequest('反馈状态无效')

  const params = { status: normalizedStatus }
  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM feedback_items
     WHERE (:status = '' OR status = :status)`,
    params,
  )
  const rows = await query(
    `SELECT fi.id, fi.type, fi.content, fi.page_path, fi.status,
            fi.submitter_id, fi.submitter_role, submitter.real_name AS submitter_name,
            submitter.username AS submitter_username, fi.resolved_by,
            resolver.real_name AS resolved_by_name, fi.resolved_at, fi.created_at, fi.updated_at
     FROM feedback_items fi
     JOIN users submitter ON submitter.id = fi.submitter_id
     LEFT JOIN users resolver ON resolver.id = fi.resolved_by
     WHERE (:status = '' OR fi.status = :status)
     ORDER BY fi.id DESC
     LIMIT ${normalizedPageSize} OFFSET ${offset}`,
    params,
  )

  res.json({
    items: rows.map(feedbackPayload),
    total: Number(countRows[0].total),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })
}

async function updateStatus(req, res) {
  await ensureFeedbackTable()

  const id = Number(req.params.id)
  const status = normalizeStatus(req.body?.status)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('反馈 ID 无效')
  if (!status) throw badRequest('反馈状态无效')

  const existing = await query('SELECT id FROM feedback_items WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) throw notFound('反馈不存在')

  await query(
    `UPDATE feedback_items
     SET status = :status,
         resolved_by = CASE WHEN :status = 'resolved' THEN :userId ELSE NULL END,
         resolved_at = CASE WHEN :status = 'resolved' THEN NOW() ELSE NULL END
     WHERE id = :id`,
    { id, status, userId: req.user.id },
  )

  res.json({ ok: true })
}

module.exports = {
  create,
  list,
  updateStatus,
}
