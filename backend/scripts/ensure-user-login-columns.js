const { pool } = require('../src/config/db')

async function main() {
  const connection = await pool.getConnection()
  try {
    const [columns] = await connection.execute('SHOW COLUMNS FROM users')
    const columnNames = new Set(columns.map((column) => column.Field))

    if (!columnNames.has('email')) {
      await connection.execute('ALTER TABLE users ADD COLUMN email VARCHAR(128) NULL AFTER phone')
    }

    if (!columnNames.has('login_alias')) {
      await connection.execute('ALTER TABLE users ADD COLUMN login_alias VARCHAR(64) NULL AFTER email')
    }

    const [indexes] = await connection.execute(
      `SELECT index_name AS indexName
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'users'
         AND index_name = 'idx_users_email'`,
    )
    if (!indexes[0]) {
      await connection.execute('CREATE INDEX idx_users_email ON users (email)')
    }

    await connection.execute(
      `UPDATE users
       SET email = LOWER(username)
       WHERE (email IS NULL OR email = '')
         AND username REGEXP '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`,
    )

    console.log('User login columns are ready.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
