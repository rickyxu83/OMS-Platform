const env = require('../config/env')
const { HttpError } = require('../utils/http-error')

const DB_STRUCTURE_ERROR_CODES = new Set([
  'ER_BAD_FIELD_ERROR',
  'ER_NO_SUCH_TABLE',
  'ER_PARSE_ERROR',
  'ER_CANT_DROP_FIELD_OR_KEY',
  'ER_DROP_INDEX_FK',
])

function cleanSqlColumnName(value = '') {
  return String(value || '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/_/g, ' ')
    .trim()
}

function mysqlDuplicateMessage(error) {
  const message = String(error?.sqlMessage || error?.message || '')
  if (/serial_no|serial/i.test(message)) return '序列号已存在，请检查是否选择了已有设备'
  if (/customer.*name|name_key|customer_name/i.test(message)) return '名称已存在，请检查是否重复录入'
  if (/order_no|orderNo/i.test(message)) return '单号已存在，请稍后重试'
  if (/email/i.test(message)) return '邮箱已存在，请换一个邮箱'
  if (/phone|mobile/i.test(message)) return '联系电话已存在，请检查是否重复录入'
  return '记录已存在，请检查是否重复提交或重复录入'
}

function mysqlBadValueMessage(error) {
  const message = String(error?.sqlMessage || error?.message || '')
  const columnMatch = message.match(/column '([^']+)'/i) || message.match(/Data too long for column '([^']+)'/i)
  const column = columnMatch ? cleanSqlColumnName(columnMatch[1]) : ''
  if (error?.code === 'ER_DATA_TOO_LONG') return column ? `字段内容过长：${column}` : '字段内容过长，请删减后再提交'
  if (error?.code === 'ER_BAD_NULL_ERROR') return column ? `缺少必填字段：${column}` : '缺少必填字段，请补充后再提交'
  if (error?.code === 'ER_WARN_DATA_OUT_OF_RANGE') return column ? `字段数值超出范围：${column}` : '字段数值超出允许范围'
  return '字段格式或取值不正确，请检查后再提交'
}

function normalizeDatabaseError(error) {
  const code = String(error?.code || '')
  if (!code) return null
  if (code === 'ER_DUP_ENTRY') return new HttpError(409, mysqlDuplicateMessage(error), { code })
  if (code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_NO_REFERENCED_ROW') {
    return new HttpError(409, '关联记录不存在或已被删除，请刷新页面后重试', { code })
  }
  if (code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_ROW_IS_REFERENCED') {
    return new HttpError(409, '该记录仍有关联数据，不能直接删除', { code })
  }
  if (['ER_DATA_TOO_LONG', 'ER_BAD_NULL_ERROR', 'ER_TRUNCATED_WRONG_VALUE', 'ER_WRONG_VALUE_FOR_TYPE', 'ER_WARN_DATA_OUT_OF_RANGE'].includes(code)) {
    return new HttpError(400, mysqlBadValueMessage(error), { code })
  }
  if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') {
    return new HttpError(409, '数据正在被其他操作占用，请稍后重试', { code })
  }
  if (DB_STRUCTURE_ERROR_CODES.has(code)) {
    return new HttpError(500, `系统数据库结构未同步，请联系管理员处理（${code}）`, { code })
  }
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(code)) {
    return new HttpError(503, '数据库连接异常，请稍后重试', { code })
  }
  return null
}

function normalizeError(error) {
  if (error instanceof HttpError) return error
  return normalizeDatabaseError(error) || error
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: '接口不存在',
      path: req.originalUrl,
    },
  })
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error)
    return
  }

  const normalizedError = normalizeError(error)
  const status = normalizedError instanceof HttpError ? normalizedError.status : 500

  if (status === 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error)
  }

  const payload = {
    error: {
      message: status === 500 && !(normalizedError instanceof HttpError) ? '服务器内部错误' : normalizedError.message,
    },
  }

  if (normalizedError.details) {
    payload.error.details = normalizedError.details
  }

  if (env.nodeEnv !== 'production' && status === 500) {
    payload.error.debug = error.message
  }

  res.status(status).json(payload)
}

module.exports = {
  notFoundHandler,
  errorHandler,
}
