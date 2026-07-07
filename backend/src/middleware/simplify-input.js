const { toSimplifiedDeep } = require('../utils/chinese')

const skippedBodyKeys = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'password_hash',
  'token',
  'customerSignature',
  'signature',
])

function simplifyInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = toSimplifiedDeep(req.body, skippedBodyKeys)
  }
  if (req.query && typeof req.query === 'object') {
    const rawQuery = { ...req.query }
    const simplifiedQuery = toSimplifiedDeep(req.query, skippedBodyKeys)
    try {
      Object.defineProperty(req, 'rawQuery', {
        value: rawQuery,
        configurable: true,
        enumerable: false,
        writable: true,
      })
      Object.defineProperty(req, 'query', {
        value: simplifiedQuery,
        configurable: true,
        enumerable: true,
        writable: true,
      })
    } catch {
      Object.keys(req.query).forEach((key) => { delete req.query[key] })
      Object.assign(req.query, simplifiedQuery)
    }
  }
  next()
}

module.exports = {
  simplifyInput,
}
