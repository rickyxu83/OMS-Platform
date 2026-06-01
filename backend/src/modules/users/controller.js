const bcrypt = require('bcrypt')
const { query } = require('../../config/db')
const { badRequest, notFound, unauthorized } = require('../../utils/http-error')

const publicColumns = 'id, username, real_name, phone, role, status, created_at, updated_at'
const privateColumns = `${publicColumns}, engineer_signature`
const allowedRoles = new Set(['admin', 'assistant', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'engineer', 'sales', 'dispatcher'])
const allowedStatuses = new Set(['active', 'disabled'])

function userPayload(row) {
  return {
    id: row.id,
    username: String(row.username).replace(/__deleted_\d+$/, ''),
    realName: row.real_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    engineerSignature: row.engineer_signature || '',
    hasEngineerSignature: Boolean(row.engineer_signature),
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
  const { role, status = 'active', keyword = '' } = req.query
  const rows = await query(
    `SELECT ${publicColumns}
     FROM users
     WHERE (:role IS NULL OR role = :role)
       AND (:status IS NULL OR status = :status)
       AND (:keyword = '' OR username LIKE :likeKeyword OR real_name LIKE :likeKeyword OR phone LIKE :likeKeyword)
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
  const rows = await query(
    `SELECT ${publicColumns}
     FROM users
     WHERE role = 'engineer' AND status = 'active'
     ORDER BY real_name ASC`,
  )
  res.json({ items: rows.map(userPayload) })
}

async function create(req, res) {
  const { username, password, realName, phone, role, status = 'active' } = req.body || {}

  if (!username || !password || !realName || !role) {
    throw badRequest('用户名、密码、姓名和角色不能为空')
  }
  assertUserInput({ role, status })
  validatePassword(password)

  const passwordHash = await bcrypt.hash(password, 10)
  const result = await query(
    `INSERT INTO users (username, password_hash, real_name, phone, role, status)
     VALUES (:username, :passwordHash, :realName, :phone, :role, :status)`,
    {
      username,
      passwordHash,
      realName,
      phone: phone || null,
      role,
      status,
    },
  )

  res.status(201).json({ id: result.insertId })
}

async function update(req, res) {
  const { id } = req.params
  const { username, realName, phone, role, status, password } = req.body || {}
  assertUserInput({ role, status })

  const existing = await query('SELECT id FROM users WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) {
    throw notFound('用户不存在')
  }
  if (username) {
    const duplicate = await query('SELECT id FROM users WHERE username = :username AND id <> :id LIMIT 1', { id, username })
    if (duplicate[0]) throw badRequest('登录账号已存在')
  }

  if (password) {
    validatePassword(password)
    const passwordHash = await bcrypt.hash(password, 10)
    await query(
      `UPDATE users
       SET username = COALESCE(:username, username),
           real_name = COALESCE(:realName, real_name),
           phone = :phone,
           role = COALESCE(:role, role),
           status = COALESCE(:status, status),
           password_hash = :passwordHash,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = :id`,
      { id, username: username || null, realName: realName || null, phone: phone || null, role: role || null, status: status || null, passwordHash },
    )
  } else {
    await query(
      `UPDATE users
       SET username = COALESCE(:username, username),
           real_name = COALESCE(:realName, real_name),
           phone = :phone,
           role = COALESCE(:role, role),
           status = COALESCE(:status, status)
       WHERE id = :id`,
      { id, username: username || null, realName: realName || null, phone: phone || null, role: role || null, status: status || null },
    )
  }

  res.status(204).end()
}

async function me(req, res) {
  const rows = await query(`SELECT ${privateColumns} FROM users WHERE id = :id LIMIT 1`, { id: req.user.id })
  if (!rows[0]) {
    throw notFound('用户不存在')
  }
  res.json({ user: userPayload(rows[0]) })
}

async function updateMe(req, res) {
  const { currentPassword = '', newPassword = '', engineerSignature = null } = req.body || {}
  const rows = await query('SELECT id, password_hash, role FROM users WHERE id = :id LIMIT 1', { id: req.user.id })
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
    updates.push('failed_login_count = 0')
    updates.push('locked_until = NULL')
    params.passwordHash = await bcrypt.hash(newPassword, 10)
  }

  if (engineerSignature !== null) {
    updates.push('engineer_signature = :engineerSignature')
    params.engineerSignature = validateSignature(engineerSignature)
  }

  if (!updates.length) {
    res.status(204).end()
    return
  }

  await query(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id`, params)
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
  const existing = await query('SELECT id, username FROM users WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) {
    throw notFound('用户不存在')
  }

  const username = String(existing[0].username).replace(/__deleted_\d+$/, '')
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
  create,
  update,
  remove,
  restore,
}
