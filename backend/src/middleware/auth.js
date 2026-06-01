const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { query } = require('../config/db')
const { forbidden, unauthorized } = require('../utils/http-error')

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''

    if (!token) {
      throw unauthorized()
    }

    const payload = jwt.verify(token, env.jwtSecret)
    const users = await query(
      `SELECT id, username, real_name, phone, role, status
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

module.exports = {
  authenticate,
  requireRoles,
}

