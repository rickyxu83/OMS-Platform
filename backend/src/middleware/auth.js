const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { query } = require('../config/db')
const { ROLE_GROUPS } = require('../permissions/roles')
const { forbidden, unauthorized } = require('../utils/http-error')

function cookieToken(req) {
  const cookieHeader = req.get('cookie') || ''
  const cookieName = env.sessionCookieName || 'service_sheet_rc_token'
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf('=')
      return separator === -1 ? ['', ''] : [part.slice(0, separator), part.slice(separator + 1)]
    })
    .find(([name]) => name === cookieName)?.[1] || ''
}

function requiresOnboarding(user) {
  return ROLE_GROUPS.engineerWorkspace.includes(user?.role) && (Boolean(user.must_change_password) || !Boolean(user.engineer_signature))
}

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || ''
    const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : ''
    const token = bearerToken || cookieToken(req)

    if (!token) {
      throw unauthorized()
    }

    const payload = jwt.verify(token, env.jwtSecret)
    const users = await query(
      `SELECT id, username, real_name, phone, role, status, engineer_signature, avatar_path, must_change_password
       FROM users
       WHERE id = :id
       LIMIT 1`,
      { id: payload.sub },
    )

    const user = users[0]
    if (!user || user.status !== 'active') {
      throw unauthorized()
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(unauthorized())
      return
    }

    next(error)
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      next(unauthorized())
      return
    }

    if (!roles.includes(req.user.role)) {
      next(forbidden())
      return
    }

    next()
  }
}

function requireEngineerOnboardingComplete(req, res, next) {
  if (!req.user) {
    next(unauthorized())
    return
  }

  if (requiresOnboarding(req.user)) {
    next(forbidden('请先修改密码并补充手写签名'))
    return
  }

  next()
}

module.exports = {
  authenticate,
  requireRoles,
  requireEngineerOnboardingComplete,
}
