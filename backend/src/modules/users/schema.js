const { query } = require('../../config/db')
const { ALL_ROLES } = require('../../permissions/catalog')

let userLoginColumnsReady = false
let userRoleEnumReady = false

const LEGACY_ROLES = Object.freeze(['supervisor'])

function roleEnumDefinition(roles) {
  return `ENUM(${roles.map((role) => `'${String(role).replace(/'/g, "''")}'`).join(', ')})`
}

async function runQuery(sql, params = {}, connection = null) {
  if (connection) {
    const [rows] = await connection.execute(sql, params)
    return rows
  }
  return query(sql, params)
}

async function ensureUserRoleEnum(connection = null) {
  if (!connection && userRoleEnumReady) return

  const rows = await runQuery(
    `SELECT column_type AS columnType
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'role'
     LIMIT 1`,
    {},
    connection,
  )
  const columnType = String(rows[0]?.columnType || '')
  const hasAllCurrentRoles = ALL_ROLES.every((role) => columnType.includes(`'${role}'`))
  const hasLegacyRoles = LEGACY_ROLES.some((role) => columnType.includes(`'${role}'`))

  if (!hasAllCurrentRoles || hasLegacyRoles) {
    const expandedRoles = [...new Set([...ALL_ROLES, ...LEGACY_ROLES])]
    await runQuery(
      `ALTER TABLE users
       MODIFY role ${roleEnumDefinition(expandedRoles)} NOT NULL`,
      {},
      connection,
    )
    await runQuery(
      `UPDATE users
       SET role = 'operations_director'
       WHERE role = 'supervisor'`,
      {},
      connection,
    )
    await runQuery(
      `ALTER TABLE users
       MODIFY role ${roleEnumDefinition(ALL_ROLES)} NOT NULL`,
      {},
      connection,
    )
  }

  if (!connection) userRoleEnumReady = true
}

async function ensureUserLoginColumns() {
  if (userLoginColumnsReady) return

  await ensureUserRoleEnum()

  const rows = await query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name IN ('email', 'login_alias')`,
  )
  const columns = new Set(rows.map((row) => row.columnName))

  if (!columns.has('email')) {
    await query('ALTER TABLE users ADD COLUMN email VARCHAR(128) NULL AFTER phone')
  }

  if (!columns.has('login_alias')) {
    await query('ALTER TABLE users ADD COLUMN login_alias VARCHAR(64) NULL AFTER email')
  }

  const indexRows = await query(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND index_name = 'idx_users_email'`,
  )
  if (!indexRows[0]) {
    await query('CREATE INDEX idx_users_email ON users (email)')
  }

  await query(
    `UPDATE users
     SET email = LOWER(username)
     WHERE (email IS NULL OR email = '')
       AND username REGEXP '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`,
  )

  userLoginColumnsReady = true
}

module.exports = {
  ensureUserRoleEnum,
  ensureUserLoginColumns,
}
