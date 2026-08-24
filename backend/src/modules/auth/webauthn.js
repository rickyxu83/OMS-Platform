const crypto = require('crypto')
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server')
const env = require('../../config/env')
const { query, transaction } = require('../../config/db')
const { badRequest, unauthorized, notFound } = require('../../utils/http-error')
const { ensureAuthSecurityTables } = require('./schema')
const { ensureUserLoginColumns } = require('../users/schema')
const { writeAuthAudit } = require('./audit')
const { inferDeviceLabel } = require('./device-alert')

const MAX_PASSKEYS_PER_USER = 10
const CHALLENGE_TTL_MINUTES = 5

// 与 controller.login 的锁定口径保持一致（本地副本避免循环依赖）
function isLockActive(lockedUntil) {
  return Boolean(lockedUntil) && new Date(lockedUntil).getTime() > Date.now()
}

function passkeyEnabled() {
  return Boolean(env.webauthnRpId && env.webauthnOrigins.length)
}

function assertPasskeyEnabled() {
  if (!passkeyEnabled()) throw notFound('通行密钥功能未开启')
}

// 设备名自动推断（用户可在设置中改名）；复用 device-alert 的 UA 解析，取 OS 部分
function inferDeviceName(userAgent = '') {
  return inferDeviceLabel(userAgent).split(' · ')[0]
}

function base64urlToBytes(value) {
  return new Uint8Array(Buffer.from(String(value), 'base64url'))
}

function randomChallenge() {
  return crypto.randomBytes(32).toString('base64url')
}

async function createChallenge({ purpose, userId = null, challenge = null, payload = null }) {
  const value = challenge || randomChallenge()
  // 惰性清理过期票据（24h 前的死行），不建调度任务
  await query(
    `DELETE FROM auth_challenges WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)`,
  )
  await query(
    `INSERT INTO auth_challenges (challenge, purpose, user_id, payload, expires_at)
     VALUES (:challenge, :purpose, :userId, :payload, DATE_ADD(NOW(), INTERVAL ${CHALLENGE_TTL_MINUTES} MINUTE))`,
    { challenge: value, purpose, userId, payload: payload ? JSON.stringify(payload) : null },
  )
  return value
}

async function findChallenge(challenge, purpose, connection = null) {
  const sql = `SELECT id, challenge, purpose, user_id, payload, expires_at, consumed_at
     FROM auth_challenges
     WHERE challenge = :challenge AND purpose = :purpose
     LIMIT 1`
  const params = { challenge, purpose }
  if (connection) {
    const [rows] = await connection.execute(sql, params)
    return rows[0] || null
  }
  const rows = await query(sql, params)
  return rows[0] || null
}

// 一次性消费：并发/重放只有一个请求能抢到（原子条件更新）
async function consumeChallenge(connection, challenge, purpose) {
  const [result] = await connection.execute(
    `UPDATE auth_challenges
     SET consumed_at = NOW()
     WHERE challenge = :challenge
       AND purpose = :purpose
       AND consumed_at IS NULL
       AND expires_at > NOW()`,
    { challenge, purpose },
  )
  return result.affectedRows === 1
}

async function passkeysForUser(userId) {
  return query(
    `SELECT id, user_id, credential_id, public_key, counter, transports, device_name, created_at, last_used_at
     FROM user_passkeys
     WHERE user_id = :userId
     ORDER BY created_at ASC`,
    { userId },
  )
}

function passkeyPayload(row) {
  return {
    id: Number(row.id),
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

async function activeUserByIdentifier(identifier) {
  const rows = await query(
    `SELECT id, username, email, login_alias, real_name, role, status, engineer_signature, avatar_path,
            must_change_password, failed_login_count, locked_until
     FROM users
     WHERE status = 'active'
       AND (LOWER(email) = :identifier OR LOWER(login_alias) = :identifier)
     LIMIT 1`,
    { identifier },
  )
  return rows[0] || null
}

// ---------- 登录方式探测（公开） ----------

async function loginMethods(req, res) {
  res.json({
    password: true,
    passkey: passkeyEnabled(),
    // 微信扫码通道（002-login-security US2）留到最后实现，先固定关闭
    wechat: false,
  })
}

// ---------- 登记（需登录） ----------

async function registerOptions(req, res) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  const existing = await passkeysForUser(req.user.id)
  if (existing.length >= MAX_PASSKEYS_PER_USER) throw badRequest('通行密钥数量已达上限')

  const options = await generateRegistrationOptions({
    rpName: env.webauthnRpName,
    rpID: env.webauthnRpId,
    userID: new TextEncoder().encode(String(req.user.id)),
    userName: req.user.email || req.user.username || `user-${req.user.id}`,
    userDisplayName: req.user.real_name || req.user.username || '',
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: String(row.transports || '').split(',').filter(Boolean),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  })

  const challengeToken = await createChallenge({
    purpose: 'webauthn_register',
    userId: req.user.id,
    challenge: options.challenge,
  })

  res.json({ challengeToken, publicKey: options })
}

async function registerVerify(req, res) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  const { challengeToken, response, deviceName } = req.body || {}
  if (!challengeToken || !response) throw badRequest('登记参数不完整')

  const result = await transaction(async (connection) => {
    const consumed = await consumeChallenge(connection, String(challengeToken), 'webauthn_register')
    if (!consumed) throw badRequest('通行密钥登记失败')

    const challengeRow = await findChallenge(String(challengeToken), 'webauthn_register', connection)
    if (!challengeRow || Number(challengeRow.user_id) !== Number(req.user.id)) throw badRequest('通行密钥登记失败')

    let verification
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: String(challengeToken),
        expectedOrigin: env.webauthnOrigins,
        expectedRPID: env.webauthnRpId,
        requireUserVerification: true,
      })
    } catch {
      throw badRequest('通行密钥登记失败')
    }
    if (!verification.verified || !verification.registrationInfo) throw badRequest('通行密钥登记失败')

    const { credential } = verification.registrationInfo
    const [existing] = await connection.execute(
      `SELECT id FROM user_passkeys WHERE credential_id = :credentialId LIMIT 1`,
      { credentialId: credential.id },
    )
    if (existing[0]) throw badRequest('该设备已登记过通行密钥')

    const name = String(deviceName || '').trim().slice(0, 64) || inferDeviceName(req.get('user-agent'))
    const [insert] = await connection.execute(
      `INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, transports, device_name)
       VALUES (:userId, :credentialId, :publicKey, :counter, :transports, :deviceName)`,
      {
        userId: req.user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter || 0,
        transports: (credential.transports || []).join(',') || null,
        deviceName: name,
      },
    )
    return { id: Number(insert.insertId), deviceName: name }
  })

  await writeAuthAudit(req, { actorId: req.user.id, action: 'passkey_register', detail: { deviceName: result.deviceName } })
  res.json({ ok: true, credential: { ...result, createdAt: new Date() } })
}

// ---------- 管理（需登录） ----------

async function listCredentials(req, res) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  const rows = await passkeysForUser(req.user.id)
  res.json({ items: rows.map(passkeyPayload) })
}

async function renameCredential(req, res) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  const id = Number(req.params.id)
  const deviceName = String(req.body?.deviceName || '').trim().slice(0, 64)
  if (!id || !deviceName) throw badRequest('设备名不能为空')
  const result = await query(
    `UPDATE user_passkeys SET device_name = :deviceName WHERE id = :id AND user_id = :userId`,
    { id, deviceName, userId: req.user.id },
  )
  if (!result.affectedRows) throw notFound('通行密钥不存在')
  await writeAuthAudit(req, { actorId: req.user.id, action: 'passkey_rename', detail: { passkeyId: id, deviceName } })
  res.json({ ok: true })
}

async function deleteCredential(req, res) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  const id = Number(req.params.id)
  if (!id) throw badRequest('通行密钥 ID 不正确')
  const result = await query(
    `DELETE FROM user_passkeys WHERE id = :id AND user_id = :userId`,
    { id, userId: req.user.id },
  )
  if (!result.affectedRows) throw notFound('通行密钥不存在')
  await writeAuthAudit(req, { actorId: req.user.id, action: 'passkey_delete', detail: { passkeyId: id } })
  res.json({ ok: true })
}

// ---------- 登录（公开） ----------

async function loginOptions(req, res) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  await ensureUserLoginColumns()
  const identifier = String(req.body?.identifier || '').trim().toLowerCase()

  // 防枚举（R4）：账号不存在/无凭据/被锁定时返回结构一致但不可满足的 options
  let user = null
  let credentials = []
  if (identifier) {
    user = await activeUserByIdentifier(identifier)
    if (user && !(user.locked_until && isLockActive(user.locked_until) && !env.disableLoginAccountLockout)) {
      credentials = await passkeysForUser(user.id)
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: env.webauthnRpId,
    userVerification: 'required',
    // 不声明 transports：让浏览器自行选择本机/手机扫码（hybrid）任意通道，
    // 否则台式机会失去「用手机 Face ID/指纹扫码登录」的入口
    allowCredentials: credentials.map((row) => ({ id: row.credential_id })),
  })

  const challengeToken = await createChallenge({
    purpose: 'webauthn_login',
    userId: user ? user.id : null,
    challenge: options.challenge,
  })

  res.json({ challengeToken, publicKey: options })
}

// issueSession 由 controller 注入（避免与 controller.js 循环依赖）
async function loginVerify(req, res, { issueSession }) {
  assertPasskeyEnabled()
  await ensureAuthSecurityTables()
  await ensureUserLoginColumns()
  const { challengeToken, response } = req.body || {}
  if (!challengeToken || !response?.id) throw badRequest('登录参数不完整')

  const auditFail = async (detail = {}) => {
    await writeAuthAudit(req, { action: 'login_failed', detail: { method: 'passkey_login', ...detail } })
  }

  try {
    const outcome = await transaction(async (connection) => {
      const consumed = await consumeChallenge(connection, String(challengeToken), 'webauthn_login')
      if (!consumed) return null

      const challengeRow = await findChallenge(String(challengeToken), 'webauthn_login', connection)
      const [passkeyRows] = await connection.execute(
        `SELECT id, user_id, credential_id, public_key, counter, transports FROM user_passkeys WHERE credential_id = :credentialId LIMIT 1`,
        { credentialId: String(response.id) },
      )
      const passkey = passkeyRows[0]
      if (!passkey) return null
      // 按钮流程 challenge 绑定了用户：凭据必须属于该用户；conditional UI 流程由凭据决定用户
      if (challengeRow?.user_id && Number(challengeRow.user_id) !== Number(passkey.user_id)) return null

      const [userRows] = await connection.execute(
        `SELECT id, username, email, login_alias, real_name, phone, role, status, engineer_signature, avatar_path,
                must_change_password, failed_login_count, locked_until
         FROM users WHERE id = :id AND status = 'active' LIMIT 1`,
        { id: passkey.user_id },
      )
      const user = userRows[0]
      if (!user) return null
      if (!env.disableLoginAccountLockout && isLockActive(user.locked_until)) return null

      let verification
      try {
        verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: String(challengeToken),
          expectedOrigin: env.webauthnOrigins,
          expectedRPID: env.webauthnRpId,
          credential: {
            id: passkey.credential_id,
            publicKey: base64urlToBytes(passkey.public_key),
            counter: Number(passkey.counter || 0),
            transports: String(passkey.transports || '').split(',').filter(Boolean),
          },
          requireUserVerification: true,
        })
      } catch {
        return null
      }
      if (!verification.verified) return null

      await connection.execute(
        `UPDATE user_passkeys
         SET counter = :counter, last_used_at = NOW()
         WHERE id = :id`,
        { id: passkey.id, counter: verification.authenticationInfo.newCounter || 0 },
      )
      await connection.execute(
        `UPDATE users
         SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = :id`,
        { id: user.id },
      )
      return user
    })

    if (!outcome) {
      await auditFail()
      throw unauthorized('通行密钥验证失败')
    }

    await writeAuthAudit(req, { actorId: outcome.id, action: 'login', detail: { method: 'passkey_login' } })
    await issueSession(req, res, outcome, { method: 'passkey_login' })
  } catch (error) {
    if (error?.status) throw error
    await auditFail()
    throw unauthorized('通行密钥验证失败')
  }
}

module.exports = {
  loginMethods,
  registerOptions,
  registerVerify,
  listCredentials,
  renameCredential,
  deleteCredential,
  loginOptions,
  loginVerify,
  passkeyEnabled,
}
