const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const env = require('../../config/env')
const { transaction } = require('../../config/db')
const { badRequest, unauthorized } = require('../../utils/http-error')

const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 15
const engineerRoles = new Set(['engineer', 'engineering_supervisor'])

function isLockActive(lockedUntil) {
  return Boolean(lockedUntil) && new Date(lockedUntil).getTime() > Date.now()
}

function invalidLoginResult() {
  return { ok: false }
}

function publicUser(user) {
  const hasEngineerSignature = Boolean(user.engineer_signature)
  const mustChangePassword = Boolean(user.must_change_password)
  const hasAvatar = Boolean(user.avatar_path)
  return {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    hasEngineerSignature,
    mustChangePassword,
    requiresOnboarding: engineerRoles.has(user.role) && (mustChangePassword || !hasEngineerSignature),
    avatarUrl: hasAvatar ? `/api/v1/avatars/${String(user.avatar_path).split(/[\\/]/).pop()}` : '',
    hasAvatar,
  }
}

async function login(req, res) {
  const { username, password } = req.body || {}
  if (!username || !password) {
    throw badRequest('用户名和密码不能为空')
  }

  const loginResult = await transaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, username, password_hash, real_name, phone, role, status, engineer_signature, avatar_path, must_change_password, failed_login_count, locked_until
       FROM users
       WHERE username = :username
       LIMIT 1`,
      { username },
    )

    const existingUser = rows[0]
    if (!existingUser || existingUser.status !== 'active' || isLockActive(existingUser.locked_until)) {
      return invalidLoginResult()
    }

    const passwordOk = await bcrypt.compare(password, existingUser.password_hash)
    if (!passwordOk) {
      const failedLoginCount = Number(existingUser.failed_login_count || 0) + 1
      const shouldLock = failedLoginCount >= MAX_FAILED_LOGINS

      await connection.execute(
        `UPDATE users
         SET failed_login_count = :failedLoginCount,
             locked_until = ${shouldLock ? `DATE_ADD(NOW(), INTERVAL ${LOCKOUT_MINUTES} MINUTE)` : 'NULL'},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :id`,
        {
          id: existingUser.id,
          failedLoginCount: shouldLock ? 0 : failedLoginCount,
        },
      )

      return invalidLoginResult()
    }

    await connection.execute(
      `UPDATE users
       SET failed_login_count = 0,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: existingUser.id },
    )

    return { ok: true, user: existingUser }
  })

  if (!loginResult.ok) {
    throw unauthorized('用户名或密码错误')
  }

  const { user } = loginResult

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      username: user.username,
    },
    env.jwtSecret,
    { expiresIn: '12h' },
  )

  res.json({
    token,
    user: publicUser(user),
  })
}

function me(req, res) {
  res.json({
    user: publicUser(req.user),
  })
}

function logout(req, res) {
  res.status(204).end()
}

module.exports = {
  login,
  me,
  logout,
}
