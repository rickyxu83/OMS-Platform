const env = require('../config/env')
const { HttpError } = require('../utils/http-error')

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

  const status = error instanceof HttpError ? error.status : 500

  if (status === 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error)
  }

  const payload = {
    error: {
      message: status === 500 ? '服务器内部错误' : error.message,
    },
  }

  if (error.details) {
    payload.error.details = error.details
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

