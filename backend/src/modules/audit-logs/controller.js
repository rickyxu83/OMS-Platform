const { query } = require('../../config/db')
const { badRequest } = require('../../utils/http-error')
const { buildLikeSearch } = require('../../utils/chinese')

function parseDetailJson(value) {
  if (!value || typeof value !== 'string') return value || null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function auditPayload(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorUsername: row.actor_username,
    targetType: row.target_type,
    targetId: row.target_id,
    action: row.action,
    detail: parseDetailJson(row.detail_json),
    createdAt: row.created_at,
  }
}

function normalizeDate(value, fieldName) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw badRequest(`${fieldName}格式不正确`)
  }
  return text
}

async function list(req, res) {
  const {
    actorId = null,
    targetType = '',
    action = '',
    keyword = '',
    from = '',
    to = '',
    riskyOnly = '',
    page = '1',
    pageSize = '50',
    sortBy = 'createdAt',
    sortDir = 'desc',
  } = req.query
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50))
  const offset = (normalizedPage - 1) * normalizedPageSize
  const fromDate = normalizeDate(from, '开始日期')
  const toDate = normalizeDate(to, '结束日期')
  const normalizedKeyword = String(keyword || '').trim()
  const keywordSearch = buildLikeSearch(normalizedKeyword)
  const onlyRisky = ['1', 'true', 'yes'].includes(String(riskyOnly || '').toLowerCase())
  const sortColumns = {
    createdAt: 'al.created_at',
    actorName: 'u.real_name',
    targetType: 'al.target_type',
    action: 'al.action',
    targetId: 'al.target_id',
  }
  const orderBy = sortColumns[sortBy] || sortColumns.createdAt
  const orderDir = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  const params = {
    actorId: actorId || null,
    targetType,
    action,
    keyword: normalizedKeyword,
    ...keywordSearch.params,
    fromDate,
    toDate,
  }
  const prefersIdOrdering = sortBy === 'createdAt'
  const effectiveOrderBy = prefersIdOrdering ? 'al.id' : orderBy
  const filters = `
     WHERE (:actorId IS NULL OR al.actor_id = :actorId)
       AND (:targetType = '' OR al.target_type = :targetType)
       AND (:action = '' OR al.action = :action)
       AND (:fromDate = '' OR al.created_at >= :fromDate)
       AND (:toDate = '' OR al.created_at < DATE_ADD(:toDate, INTERVAL 1 DAY))
       AND (
         :keyword = ''
         OR ${keywordSearch.sql('u.real_name')}
         OR ${keywordSearch.sql('u.username')}
         OR ${keywordSearch.sql('al.target_type')}
         OR ${keywordSearch.sql('al.action')}
         OR ${keywordSearch.sql('al.detail_json')}
       )
       ${onlyRisky ? `AND (
         al.action IN ('update', 'delete')
         OR al.detail_json LIKE '%"statusCode":4%'
         OR al.detail_json LIKE '%"statusCode":5%'
       )` : ''}`

  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     JOIN users u ON u.id = al.actor_id
     ${filters}`,
    params,
  )
  const rows = await query(
    `SELECT al.id, al.actor_id, u.real_name AS actor_name, u.username AS actor_username,
            al.target_type, al.target_id, al.action, al.detail_json, al.created_at
     FROM audit_logs al
     JOIN users u ON u.id = al.actor_id
     ${filters}
     ORDER BY ${effectiveOrderBy} ${orderDir}${effectiveOrderBy === 'al.id' ? '' : `, al.id ${orderDir}`}
     LIMIT ${normalizedPageSize} OFFSET ${offset}`,
    params,
  )

  res.json({
    items: rows.map(auditPayload),
    total: Number(countRows[0].total),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })
}

module.exports = {
  list,
}
