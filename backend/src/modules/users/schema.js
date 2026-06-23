const { query } = require('../../config/db')

let userLoginColumnsReady = false

async function ensureUserLoginColumns() {
  if (userLoginColumnsReady) return

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
  ensureUserLoginColumns,
}
