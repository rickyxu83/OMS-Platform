const { pool } = require('../src/config/db')
const { ensureUserRoleEnum } = require('../src/modules/users/schema')

async function main() {
  const connection = await pool.getConnection()
  try {
    await ensureUserRoleEnum(connection)
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
