const { pool } = require('../src/config/db')

async function main() {
  const connection = await pool.getConnection()
  try {
    await connection.execute(
      `ALTER TABLE users
       MODIFY role ENUM(
         'admin',
         'assistant',
         'supervisor',
         'engineering_supervisor',
         'sales_supervisor',
         'engineer',
         'sales',
         'dispatcher'
       ) NOT NULL`,
    )
    console.log('User role enum is ready.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
