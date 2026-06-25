const fs = require('fs')
const path = require('path')
const bcrypt = require('bcrypt')
const multer = require('multer')
const env = require('../../config/env')
const { query } = require('../../config/db')
const { badRequest, notFound, unauthorized } = require('../../utils/http-error')
const { isValidNormalizedPhone, normalizePhoneNumber } = require('../../utils/phone')
const { ALL_ROLES } = require('../../permissions/catalog')
const { ensureUserLoginColumns } = require('./schema')

const engineerRoles = new Set(['engineer', 'engineering_supervisor'])
const salespersonRoles = new Set(['sales', 'sales_supervisor'])
const publicColumns = 'id, username, real_name, phone, email, login_alias, role, status, avatar_path, must_change_password, engineer_signature, last_login_at, created_at, updated_at'
const privateColumns = publicColumns
const allowedRoles = new Set(ALL_ROLES)
const allowedStatuses = new Set(['active', 'disabled'])
const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
const avatarUploadDir = path.join(uploadRoot, 'avatars')
fs.mkdirSync(avatarUploadDir, { recursive: true })

const avatarExtensionByMime = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const avatarUploadMiddleware = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, avatarUploadDir)
    },
    filename(req, file, cb) {
      // 扩展名由 mimetype 白名单映射得出，不信任客户端文件名（防止 .html/.svg 落盘导致存储型 XSS）
      const extension = avatarExtensionByMime[file.mimetype] || '.jpg'
      cb(null, `user-${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`)
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter(_req, file, cb) {
    if (!Object.prototype.hasOwnProperty.call(avatarExtensionByMime, file.mimetype)) {
      cb(badRequest('头像仅支持 JPG、PNG 或 WebP'))
      return
    }
    cb(null, true)
  },
}).single('avatar')

function cleanupFile(filePath) {
  if (filePath) fs.rm(filePath, { force: true }, () => {})
}

function avatarUrl(avatarPath) {
  if (!avatarPath) return ''
  return `/api/v1/avatars/${path.basename(avatarPath)}`
}

function requiresOnboarding(row) {
  return Boolean(row.must_change_password) || (engineerRoles.has(row.role) && !Boolean(row.engineer_signature))
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAlias(value) {
  return String(value || '').trim().toLowerCase()
}

function validateEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('请输入有效的邮箱账号')
  }
}

function validateLoginAlias(alias) {
  if (!alias) return
  if (alias.includes('@')) {
    throw badRequest('别名不能使用邮箱格式')
  }
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(alias)) {
    throw badRequest('别名仅支持 2-32 位字母、数字、点、下划线或短横线')
  }
}

function normalizeOptionalPhone(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const phone = normalizePhoneNumber(value)
  if (!isValidNormalizedPhone(phone)) {
    throw badRequest('联系电话格式不正确')
  }
  return phone
}

async function assertLoginIdentifierAvailable({ email, loginAlias, excludeId = null }) {
  const checks = []
  const params = { excludeId: excludeId || 0 }
  if (email) {
    checks.push('LOWER(email) = :email OR LOWER(login_alias) = :email')
    params.email = email
  }
  if (loginAlias) {
    checks.push('LOWER(email) = :loginAlias OR LOWER(login_alias) = :loginAlias')
    params.loginAlias = loginAlias
  }
  if (!checks.length) return

  const rows = await query(
    `SELECT id
     FROM users
     WHERE status = 'active'
       AND id <> :excludeId
       AND (${checks.map((check) => `(${check})`).join(' OR ')})
     LIMIT 1`,
    params,
  )
  if (rows[0]) {
    throw badRequest('邮箱账号或别名已被使用')
  }
}

function userPayload(row) {
  const hasAvatar = Boolean(row.avatar_path)
  return {
    id: row.id,
    username: String(row.username).replace(/__deleted_\d+$/, ''),
    loginAlias: row.login_alias || '',
    realName: row.real_name,
    phone: normalizePhoneNumber(row.phone) || row.phone,
    email: row.email,
    role: row.role,
    status: row.status,
    engineerSignature: row.engineer_signature || '',
    hasEngineerSignature: Boolean(row.engineer_signature),
    mustChangePassword: Boolean(row.must_change_password),
    requiresOnboarding: requiresOnboarding(row),
    avatarUrl: avatarUrl(row.avatar_path),
    hasAvatar,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function validatePassword(password) {
  if (!password) return
  if (String(password).length < 8) {
    throw badRequest('密码至少需要 8 位')
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw badRequest('密码需要包含大小写字母、数字和特殊符号')
  }
}

function validateSignature(dataUrl) {
  if (!dataUrl) return ''
  const value = String(dataUrl)
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw badRequest('签名格式不正确')
  }
  if (Buffer.from(value.split(',')[1], 'base64').length > 1024 * 1024) {
    throw badRequest('签名图片过大')
  }
  return value
}

async function list(req, res) {
  await ensureUserLoginColumns()
  const { role, status = 'active', keyword = '' } = req.query
  const rows = await query(
    `SELECT ${publicColumns}
     FROM users
     WHERE (:role IS NULL OR role = :role)
       AND (:status IS NULL OR status = :status)
       AND (:keyword = '' OR username LIKE :likeKeyword OR login_alias LIKE :likeKeyword OR real_name LIKE :likeKeyword OR phone LIKE :likeKeyword OR email LIKE :likeKeyword)
     ORDER BY id DESC`,
    {
      role: role || null,
      status: status || null,
      keyword,
      likeKeyword: `%${keyword}%`,
    },
  )

  res.json({ items: rows.map(userPayload) })
}

function assertUserInput({ role, status }) {
  if (role && !allowedRoles.has(role)) {
    throw badRequest('角色不正确')
  }
  if (status && !allowedStatuses.has(status)) {
    throw badRequest('状态不正确')
  }
}

async function listEngineers(req, res) {
  await ensureUserLoginColumns()
  const rows = await query(
    `SELECT ${publicColumns}
     FROM users
     WHERE role = 'engineer' AND status = 'active'
     ORDER BY real_name ASC`,
  )
  res.json({ items: rows.map(userPayload) })
}

async function listSalespeople(req, res) {
  await ensureUserLoginColumns()
  const rows = await query(
    `SELECT ${publicColumns}
     FROM users
     WHERE role IN ('sales', 'sales_supervisor') AND status = 'active'
     ORDER BY real_name ASC, username ASC`,
  )
  res.json({ items: rows.map(userPayload).filter((user) => salespersonRoles.has(user.role)) })
}

async function create(req, res) {
  await ensureUserLoginColumns()
  const { username, password, realName, phone, email, loginAlias, role, status = 'active' } = req.body || {}
  const accountEmail = normalizeEmail(email || username)
  const normalizedAlias = normalizeAlias(loginAlias)
  const normalizedPhone = normalizeOptionalPhone(phone)

  if (!accountEmail || !password || !realName || !role) {
    throw badRequest('邮箱账号、密码、姓名和角色不能为空')
  }
  assertUserInput({ role, status })
  validateEmail(accountEmail)
  validateLoginAlias(normalizedAlias)
  validatePassword(password)
  await assertLoginIdentifierAvailable({ email: accountEmail, loginAlias: normalizedAlias })

  const passwordHash = await bcrypt.hash(password, 10)
  const result = await query(
    `INSERT INTO users (username, password_hash, real_name, phone, email, login_alias, role, status, must_change_password)
     VALUES (:username, :passwordHash, :realName, :phone, :email, :loginAlias, :role, :status, 1)`,
    {
      username: accountEmail,
      passwordHash,
      realName,
      phone: normalizedPhone,
      email: accountEmail,
      loginAlias: normalizedAlias || null,
      role,
      status,
    },
  )

  res.status(201).json({ id: result.insertId })
}

async function update(req, res) {
  await ensureUserLoginColumns()
  const { id } = req.params
  const { username, realName, phone, email, loginAlias, role, status, password } = req.body || {}
  const accountEmail = email || username ? normalizeEmail(email || username) : ''
  const normalizedAlias = loginAlias === undefined ? undefined : normalizeAlias(loginAlias)
  const normalizedPhone = normalizeOptionalPhone(phone)
  assertUserInput({ role, status })

  const existing = await query('SELECT id, role, email, login_alias FROM users WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) {
    throw notFound('用户不存在')
  }
  if (accountEmail) {
    validateEmail(accountEmail)
  }
  if (normalizedAlias !== undefined) {
    validateLoginAlias(normalizedAlias)
  }
  if (accountEmail || normalizedAlias !== undefined) {
    await assertLoginIdentifierAvailable({
      email: accountEmail || null,
      loginAlias: normalizedAlias || null,
      excludeId: id,
    })
  }

  if (password) {
    validatePassword(password)
    const passwordHash = await bcrypt.hash(password, 10)
    await query(
      `UPDATE users
       SET username = COALESCE(:username, username),
           real_name = COALESCE(:realName, real_name),
           phone = :phone,
           email = :email,
           login_alias = :loginAlias,
           role = COALESCE(:role, role),
           status = COALESCE(:status, status),
           password_hash = :passwordHash,
           must_change_password = 1,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = :id`,
      {
        id,
        username: accountEmail || null,
        realName: realName || null,
        phone: normalizedPhone,
        email: accountEmail || existing[0].email || null,
        loginAlias: normalizedAlias === undefined ? existing[0].login_alias || null : normalizedAlias || null,
        role: role || null,
        status: status || null,
        passwordHash,
      },
    )
  } else {
    await query(
      `UPDATE users
       SET username = COALESCE(:username, username),
           real_name = COALESCE(:realName, real_name),
           phone = :phone,
           email = :email,
           login_alias = :loginAlias,
           role = COALESCE(:role, role),
           status = COALESCE(:status, status)
       WHERE id = :id`,
      {
        id,
        username: accountEmail || null,
        realName: realName || null,
        phone: normalizedPhone,
        email: accountEmail || existing[0].email || null,
        loginAlias: normalizedAlias === undefined ? existing[0].login_alias || null : normalizedAlias || null,
        role: role || null,
        status: status || null,
      },
    )
  }

  res.status(204).end()
}

async function me(req, res) {
  await ensureUserLoginColumns()
  const rows = await query(`SELECT ${privateColumns} FROM users WHERE id = :id LIMIT 1`, { id: req.user.id })
  if (!rows[0]) {
    throw notFound('用户不存在')
  }
  res.json({ user: userPayload(rows[0]) })
}

async function updateMe(req, res) {
  await ensureUserLoginColumns()
  const { currentPassword = '', newPassword = '', engineerSignature = null, loginAlias } = req.body || {}
  const rows = await query('SELECT id, password_hash, role, email, login_alias FROM users WHERE id = :id LIMIT 1', { id: req.user.id })
  const user = rows[0]
  if (!user) {
    throw notFound('用户不存在')
  }

  const updates = []
  const params = { id: req.user.id }

  if (newPassword) {
    validatePassword(newPassword)
    const passwordOk = await bcrypt.compare(currentPassword, user.password_hash)
    if (!passwordOk) {
      throw unauthorized('当前密码不正确')
    }
    updates.push('password_hash = :passwordHash')
    updates.push('must_change_password = 0')
    updates.push('failed_login_count = 0')
    updates.push('locked_until = NULL')
    params.passwordHash = await bcrypt.hash(newPassword, 10)
  }

  if (engineerSignature !== null) {
    updates.push('engineer_signature = :engineerSignature')
    params.engineerSignature = validateSignature(engineerSignature)
  }

  if (loginAlias !== undefined) {
    const normalizedAlias = normalizeAlias(loginAlias)
    validateLoginAlias(normalizedAlias)
    await assertLoginIdentifierAvailable({
      email: null,
      loginAlias: normalizedAlias || null,
      excludeId: req.user.id,
    })
    updates.push('login_alias = :loginAlias')
    params.loginAlias = normalizedAlias || null
  }

  if (!updates.length) {
    res.status(204).end()
    return
  }

  await query(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id`, params)
  res.status(204).end()
}

async function uploadAvatar(req, res) {
  if (!req.file) throw badRequest('头像文件不能为空')

  const rows = await query('SELECT avatar_path FROM users WHERE id = :id LIMIT 1', { id: req.user.id })
  if (!rows[0]) {
    cleanupFile(req.file.path)
    throw notFound('用户不存在')
  }

  cleanupFile(rows[0].avatar_path)
  await query('UPDATE users SET avatar_path = :avatarPath, updated_at = CURRENT_TIMESTAMP WHERE id = :id', {
    id: req.user.id,
    avatarPath: req.file.path,
  })

  res.status(201).json({ avatarUrl: avatarUrl(req.file.path), hasAvatar: true })
}

async function removeAvatar(req, res) {
  const rows = await query('SELECT avatar_path FROM users WHERE id = :id LIMIT 1', { id: req.user.id })
  if (!rows[0]) throw notFound('用户不存在')

  cleanupFile(rows[0].avatar_path)
  await query('UPDATE users SET avatar_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = :id', { id: req.user.id })
  res.status(204).end()
}

async function remove(req, res) {
  const { id } = req.params
  if (Number(id) === Number(req.user.id)) {
    throw badRequest('不能删除当前登录用户')
  }

  const existing = await query('SELECT id FROM users WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) {
    throw notFound('用户不存在')
  }

  await query(
    `UPDATE users
     SET status = 'disabled',
         username = CONCAT(username, '__deleted_', id),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id
       AND status <> 'disabled'
       AND username NOT LIKE '%__deleted_%'`,
    { id },
  )

  res.status(204).end()
}

async function restore(req, res) {
  const { id } = req.params
  await ensureUserLoginColumns()
  const existing = await query('SELECT id, username, email, login_alias FROM users WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) {
    throw notFound('用户不存在')
  }

  const username = String(existing[0].username).replace(/__deleted_\d+$/, '')
  await assertLoginIdentifierAvailable({
    email: normalizeEmail(existing[0].email || username),
    loginAlias: normalizeAlias(existing[0].login_alias),
    excludeId: id,
  })
  await query(
    `UPDATE users
     SET username = :username,
         status = 'active',
         failed_login_count = 0,
         locked_until = NULL
     WHERE id = :id`,
    { id, username },
  )

  res.status(204).end()
}

module.exports = {
  me,
  updateMe,
  list,
  listEngineers,
  listSalespeople,
  create,
  update,
  remove,
  restore,
  avatarUploadMiddleware,
  uploadAvatar,
  removeAvatar,
}
