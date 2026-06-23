const { query } = require('../../config/db')

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

async function list(req, res) {
  const { actorId = null, targetType = '', action = '', page = '1', pageSize = '50', sortBy = 'createdAt', sortDir = 'desc' } = req.query
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50))
  const offset = (normalizedPage - 1) * normalizedPageSize
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
  }
  const prefersIdOrdering = sortBy === 'createdAt'
  const effectiveOrderBy = prefersIdOrdering ? 'al.id' : orderBy

  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     WHERE (:actorId IS NULL OR al.actor_id = :actorId)
       AND (:targetType = '' OR al.target_type = :targetType)
       AND (:action = '' OR al.action = :action)`,
    params,
  )
  const rows = await query(
    `SELECT al.id, al.actor_id, u.real_name AS actor_name, u.username AS actor_username,
            al.target_type, al.target_id, al.action, al.detail_json, al.created_at
     FROM audit_logs al
     JOIN users u ON u.id = al.actor_id
     WHERE (:actorId IS NULL OR al.actor_id = :actorId)
       AND (:targetType = '' OR al.target_type = :targetType)
       AND (:action = '' OR al.action = :action)
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
