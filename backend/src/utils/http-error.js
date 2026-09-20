class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

function badRequest(message, details) {
  return new HttpError(400, message, details)
}

function unauthorized(message = '未登录或登录已过期') {
  return new HttpError(401, message)
}

function forbidden(message = '无权执行该操作') {
  return new HttpError(403, message)
}

function notFound(message = '记录不存在') {
  return new HttpError(404, message)
}

function unprocessableEntity(message = '请求内容无法处理', details) {
  return new HttpError(422, message, details)
}

function badGateway(message = '上游服务异常，请稍后重试') {
  return new HttpError(502, message)
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  unprocessableEntity,
  badGateway,
}

