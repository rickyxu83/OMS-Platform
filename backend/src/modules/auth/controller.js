const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const env = require('../../config/env')
const { transaction } = require('../../config/db')
const { ROLE_GROUPS } = require('../../permissions/roles')
const {
  getAvailableWorkspacesForRole,
  getDefaultWorkspaceForRole,
  listPermissionsForRole,
} = require('../../permissions/store')
const { badRequest, unauthorized } = require('../../utils/http-error')
const { normalizePhoneNumber } = require('../../utils/phone')
const { ensureUserLoginColumns } = require('../users/schema')

const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 15
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

// 账号不存在/被锁定时用它做一次等时 bcrypt 比对,消除"是否注册"的时间侧信道
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('__timing_guard__', 10)

function isLockActive(lockedUntil) {
  return Boolean(lockedUntil) && new Date(lockedUntil).getTime() > Date.now()
}

function invalidLoginResult() {
  return { ok: false }
}

function cookieDomain() {
  return env.sessionCookieDomain || undefined
}

function sessionCookieOptions(req) {
  const domain = cookieDomain()
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production' || req.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
    ...(domain ? { domain } : {}),
  }
}

function setSessionCookie(req, res, token) {
  res.cookie(env.sessionCookieName || 'oms_platform_token', token, sessionCookieOptions(req))
}

function clearSessionCookie(req, res) {
  const { maxAge, ...options } = sessionCookieOptions(req)
  res.clearCookie(env.sessionCookieName || 'oms_platform_token', options)
}

async function publicUser(user) {
  const hasEngineerSignature = Boolean(user.engineer_signature)
  const mustChangePassword = Boolean(user.must_change_password)
  const hasAvatar = Boolean(user.avatar_path)
  const permissionDetails = await listPermissionsForRole(user.role)
  const availableWorkspaces = await getAvailableWorkspacesForRole(user.role)
  const defaultWorkspace = await getDefaultWorkspaceForRole(user.role)
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    loginAlias: user.login_alias || '',
    realName: user.real_name,
    phone: normalizePhoneNumber(user.phone) || user.phone,
    role: user.role,
    status: user.status,
    hasEngineerSignature,
    mustChangePassword,
    requiresOnboarding: mustChangePassword || (ROLE_GROUPS.engineerWorkspace.includes(user.role) && !hasEngineerSignature),
    availableWorkspaces,
    defaultWorkspace,
    permissions: permissionDetails.map((permission) => permission.key),
    permissionDetails,
    avatarUrl: hasAvatar ? `/api/v1/avatars/${String(user.avatar_path).split(/[\\/]/).pop()}` : '',
    hasAvatar,
  }
}

async function sessionPayload(user) {
  const safeUser = await publicUser(user)
  return {
    user: safeUser,
    availableWorkspaces: safeUser.availableWorkspaces,
    defaultWorkspace: safeUser.defaultWorkspace,
  }
}

async function login(req, res) {
  const { username, password } = req.body || {}
  if (!username || !password) {
    throw badRequest('邮箱/别名和密码不能为空')
  }
  await ensureUserLoginColumns()
  const identifier = String(username).trim().toLowerCase()

  const loginResult = await transaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, username, email, login_alias, password_hash, real_name, phone, role, status, engineer_signature, avatar_path, must_change_password, failed_login_count, locked_until
       FROM users
       WHERE status = 'active'
         AND (
           LOWER(email) = :identifier
           OR LOWER(login_alias) = :identifier
         )
       LIMIT 1`,
      { identifier },
    )

    const existingUser = rows[0]
    const loginBlocked = !existingUser || (!env.disableLoginAccountLockout && isLockActive(existingUser.locked_until))
    if (loginBlocked) {
      // 做一次等时哈希比对,使不存在/被锁账号与存在账号的响应耗时一致
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
      return invalidLoginResult()
    }

    const passwordOk = await bcrypt.compare(password, existingUser.password_hash)
    if (!passwordOk) {
      if (env.disableLoginAccountLockout) {
        return invalidLoginResult()
      }

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
           last_login_at = CURRENT_TIMESTAMP,
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

  setSessionCookie(req, res, token)

  res.json({
    ...await sessionPayload(user),
  })
}

async function me(req, res) {
  res.json(await sessionPayload(req.user))
}

function logout(req, res) {
  clearSessionCookie(req, res)
  res.status(204).end()
}

module.exports = {
  login,
  me,
  logout,
}
