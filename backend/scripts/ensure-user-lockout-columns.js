const { pool } = require('../src/config/db')

async function main() {
  const connection = await pool.getConnection()
  try {
    const [columns] = await connection.execute('SHOW COLUMNS FROM users')
    const columnNames = new Set(columns.map((column) => column.Field))

    if (!columnNames.has('failed_login_count')) {
      await connection.execute(
        `ALTER TABLE users
         ADD COLUMN failed_login_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER status`,
      )
    }

    if (!columnNames.has('locked_until')) {
      await connection.execute(
        `ALTER TABLE users
         ADD COLUMN locked_until DATETIME NULL AFTER failed_login_count`,
      )
    }

    console.log('User lockout columns are ready.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
