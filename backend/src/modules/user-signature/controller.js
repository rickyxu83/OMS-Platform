const crypto = require('crypto')
const { query, transaction } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')
const { validateSignature } = require('../../utils/signature')

// 签名收集链接有效期：1 小时（自签场景，够用且安全）
const SIGNATURE_LINK_TTL_MS = 60 * 60 * 1000
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/

let userSignatureRequestsTableReady = false

async function ensureUserSignatureRequestsTable(connection = null) {
  if (userSignatureRequestsTableReady) return
  const executor = connection || { execute: (sql, params = {}) => query(sql, params) }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS user_signature_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      status ENUM('active', 'signed', 'expired', 'revoked') NOT NULL DEFAULT 'active',
      expires_at DATETIME NOT NULL,
      signed_at DATETIME NULL,
      signed_ip VARCHAR(64) NULL,
      signed_user_agent VARCHAR(255) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_user_signature_requests_token_hash (token_hash),
      KEY idx_user_signature_requests_user_status (user_id, status),
      KEY idx_user_signature_requests_expires (status, expires_at),
      CONSTRAINT fk_user_signature_requests_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_user_signature_requests_created_by FOREIGN KEY (created_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  userSignatureRequestsTableReady = true
}

function createSignatureToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function signatureTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function formatMysqlDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function resolveSignaturePublicBaseUrl(req) {
  const configured = String(req.body?.publicBaseUrl || req.query?.publicBaseUrl || '').trim().replace(/\/+$/, '')
  if (configured && /^https?:\/\//i.test(configured)) return configured
  const origin = String(req.get?.('origin') || '').trim().replace(/\/+$/, '')
  if (origin && /^https?:\/\//i.test(origin)) return origin
  const fallbackHost = String(req.get?.('host') || '').trim()
  if (!fallbackHost) return ''
  const protocol = req.protocol || 'https'
  return `${protocol}://${fallbackHost}`
}

function buildSignatureUrl(req, token) {
  const baseUrl = resolveSignaturePublicBaseUrl(req)
  if (!baseUrl) return ''
  return `${baseUrl}/engineer-signature/${encodeURIComponent(token)}`
}

/**
 * 生成签名收集链接（需登录，仅限为自己生成）。
 * 同一用户同时只保留一条有效链接，重新生成会作废旧的。
 */
async function createSignatureLink(req, res) {
  await ensureUserSignatureRequestsTable()
  const userId = req.user.id
  const token = createSignatureToken()
  const expiresAt = new Date(Date.now() + SIGNATURE_LINK_TTL_MS)

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE user_signature_requests
       SET status = 'revoked'
       WHERE user_id = :userId AND status = 'active'`,
      { userId },
    )
    await connection.execute(
      `INSERT INTO user_signature_requests (user_id, token_hash, status, expires_at, created_by)
       VALUES (:userId, :tokenHash, 'active', :expiresAt, :createdBy)`,
      {
        userId,
        tokenHash: signatureTokenHash(token),
        expiresAt: formatMysqlDateTime(expiresAt),
        createdBy: userId,
      },
    )
  })

  res.json({
    url: buildSignatureUrl(req, token),
    expiresAt: formatMysqlDateTime(expiresAt),
    ttlMinutes: SIGNATURE_LINK_TTL_MS / 60000,
  })
}

async function signatureRequestByToken(token, { connection = null, forUpdate = false } = {}) {
  const rawToken = String(token || '').trim()
  if (!TOKEN_PATTERN.test(rawToken)) {
    throw notFound('签名链接不存在或已失效')
  }
  await ensureUserSignatureRequestsTable(connection)
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  const [rows] = await execute(
    `SELECT usr.id, usr.user_id, usr.status, usr.expires_at, usr.signed_at,
            u.real_name, u.username, u.role, u.status AS user_status
     FROM user_signature_requests usr
     JOIN users u ON u.id = usr.user_id
     WHERE usr.token_hash = :tokenHash
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    { tokenHash: signatureTokenHash(rawToken) },
  )
  const row = rows[0]
  if (!row) {
    throw notFound('签名链接不存在或已失效')
  }

  // 惰性过期：打开时已过有效期的链接标记为 expired，避免状态悬挂
  if (row.status === 'active' && new Date(row.expires_at).getTime() <= Date.now()) {
    const executeUpdate = connection ? connection.execute.bind(connection) : (sql, params = {}) => query(sql, params)
    await executeUpdate(
      `UPDATE user_signature_requests
       SET status = 'expired'
       WHERE id = :id AND status = 'active'`,
      { id: row.id },
    )
    row.status = 'expired'
  }
  return row
}

async function assertLinkUsable(row) {
  if (row.status === 'revoked') {
    throw badRequest('签名链接已作废，请让本人重新生成')
  }
  if (row.status === 'expired') {
    throw badRequest('签名链接已过期，请让本人重新生成')
  }
  if (row.user_status === 'disabled') {
    throw badRequest('账号已停用，无法签署')
  }
}

/** 公开 GET：手机端打开链接时展示签署人信息 */
async function publicSignatureRequest(req, res) {
  const row = await signatureRequestByToken(req.params.token)
  await assertLinkUsable(row)

  res.json({
    item: {
      realName: row.real_name || row.username || '',
      username: row.username || '',
      role: row.role || '',
      signed: Boolean(row.signed_at),
      signedAt: row.signed_at || null,
      expiresAt: row.expires_at || null,
    },
  })
}

/** 公开 POST：提交手写签名，写入该用户工程师签名（有效期内可重复签署覆盖） */
async function submitSignatureRequest(req, res) {
  const signature = validateSignature(String(req.body?.signature || ''))
  if (!signature) {
    throw badRequest('请先完成手写签名')
  }
  await ensureUserSignatureRequestsTable()

  const signedAt = await transaction(async (connection) => {
    const row = await signatureRequestByToken(req.params.token, { connection, forUpdate: true })
    await assertLinkUsable(row)

    await connection.execute(
      'UPDATE users SET engineer_signature = :signature WHERE id = :userId',
      { signature, userId: row.user_id },
    )
    await connection.execute(
      `UPDATE user_signature_requests
       SET signed_at = CURRENT_TIMESTAMP,
           signed_ip = :signedIp,
           signed_user_agent = :signedUserAgent
       WHERE id = :id`,
      {
        id: row.id,
        signedIp: String(req.ip || '').slice(0, 64),
        signedUserAgent: String(req.get('user-agent') || '').slice(0, 255),
      },
    )
    await connection.execute(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:actorId, 'user', :targetId, 'engineer_signature_signed', :detailJson)`,
      {
        actorId: row.user_id,
        targetId: row.user_id,
        detailJson: JSON.stringify({ source: 'public_link', requestId: row.id }),
      },
    )
    return formatMysqlDateTime(new Date())
  })

  res.json({ ok: true, signedAt })
}

module.exports = {
  createSignatureLink,
  publicSignatureRequest,
  submitSignatureRequest,
}
