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
  next()
}

module.exports = {
  simplifyInput,
}
