const { query } = require('../config/db')
const { resolveIpLocation } = require('../utils/ip-location')

const actionByMethod = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
}

const sensitiveKeyPattern = /(password|secret|token|api[_-]?key|authorization|cookie|signature|transcript|currentdraft)/i

function isSensitiveKey(key) {
  return sensitiveKeyPattern.test(String(key || ''))
}

function redactValue(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (depth > 8) return '[redacted]'
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  if (typeof value !== 'object') return value

  return Object.entries(value).reduce((redacted, [key, item]) => {
    redacted[key] = isSensitiveKey(key) ? '[redacted]' : redactValue(item, depth + 1)
    return redacted
  }, {})
}

function safePayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  return redactValue(payload)
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

// 临时需求（2026-11-03 佬拍板）：假勤（考勤）模块的读操作也留审计，
// 2026-12-31 23:59:59（北京时间）后自动失效。到期后此逻辑整体可删，恢复"只审计写操作"。
const TEMP_READ_AUDIT_TARGET = 'attendance'
const TEMP_READ_AUDIT_UNTIL = new Date('2026-12-31T23:59:59+08:00').getTime()

function isTempReadAudit(req) {
  if (req.method !== 'GET') return false
  if (Date.now() > TEMP_READ_AUDIT_UNTIL) return false
  const basePath = (req.baseUrl || '').replace(/^\/api\/v1\/?/, '')
  return basePath.split('/').filter(Boolean)[0] === TEMP_READ_AUDIT_TARGET
}

function auditLogger(req, res, next) {
  const startedAt = Date.now()
  res.on('finish', () => {
    if (!req.user || !actionByMethod[req.method]) return
    // GET/read 审计降噪：列表/查询每请求一记会在同一时刻产生大量相同 read 记录,
    // 审计只保留写操作（create/update/delete）与既有业务审计,读操作不再留痕；
    // 例外：上方临时窗口期内的假勤读操作
    if (req.method === 'GET' && !isTempReadAudit(req)) return
    if (req.path === '/health') return

    const { targetType, targetId } = auditTarget(req)
    const detail = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      ip: req.ip,
      location: resolveIpLocation(req.ip) || undefined,
      durationMs: Date.now() - startedAt,
      query: safePayload(req.query) || {},
      body: req.method === 'GET' ? undefined : safePayload(req.body),
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
