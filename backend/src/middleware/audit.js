const { query } = require('../config/db')

const actionByMethod = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
}

const sensitiveKeys = new Set(['password', 'customerSignature', 'token'])

function safeBody(body) {
  if (!body || typeof body !== 'object') return null
  return Object.entries(body).reduce((value, [key, item]) => {
    value[key] = sensitiveKeys.has(key) ? '[redacted]' : item
    return value
  }, {})
}

function auditTarget(req) {
  const basePath = (req.baseUrl || '').replace(/^\/api\/v1\/?/, '')
  const targetType = basePath.split('/').filter(Boolean)[0] || 'api'
  const numericPart = req.path.split('/').filter(Boolean).find((part) => /^\d+$/.test(part))
  return {
    targetType,
    targetId: numericPart ? Number(numericPart) : 0,
  }
}

function auditLogger(req, res, next) {
  const startedAt = Date.now()
  res.on('finish', () => {
    if (!req.user || !actionByMethod[req.method]) return
    if (req.path === '/health') return

    const { targetType, targetId } = auditTarget(req)
    const detail = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      ip: req.ip,
      durationMs: Date.now() - startedAt,
      query: req.query || {},
      body: req.method === 'GET' ? undefined : safeBody(req.body),
    }

    query(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:actorId, :targetType, :targetId, :action, :detailJson)`,
      {
        actorId: req.user.id,
        targetType,
        targetId,
        action: actionByMethod[req.method],
        detailJson: JSON.stringify(detail),
      },
    ).catch((error) => {
      console.error('audit log failed', error.message)
    })
  })

  next()
}

module.exports = {
  auditLogger,
}
