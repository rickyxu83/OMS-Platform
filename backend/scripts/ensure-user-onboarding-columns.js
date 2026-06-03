const { pool } = require('../src/config/db')

async function main() {
  const connection = await pool.getConnection()
  try {
    const [columns] = await connection.execute('SHOW COLUMNS FROM users')
    const columnNames = new Set(columns.map((column) => column.Field))

    if (!columnNames.has('avatar_path')) {
      await connection.execute(
        `ALTER TABLE users
         ADD COLUMN avatar_path VARCHAR(255) NULL AFTER engineer_signature`,
      )
    }

    if (!columnNames.has('must_change_password')) {
      await connection.execute(
        `ALTER TABLE users
         ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar_path`,
      )
    }

    console.log('User onboarding columns are ready.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
