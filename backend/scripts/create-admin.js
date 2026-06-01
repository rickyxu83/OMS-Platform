const bcrypt = require('bcrypt')
const { query, pool } = require('../src/config/db')

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD
  const realName = process.env.ADMIN_REAL_NAME || '系统管理员'

  if (!password) {
    throw new Error('ADMIN_PASSWORD must be set before creating or updating the admin user')
  }

  const existing = await query('SELECT id FROM users WHERE username = :username LIMIT 1', { username })
  const passwordHash = await bcrypt.hash(password, 10)

  if (existing[0]) {
    await query(
      `UPDATE users
       SET password_hash = :passwordHash,
           real_name = :realName,
           role = 'admin',
           status = 'active',
           failed_login_count = 0,
           locked_until = NULL
       WHERE username = :username`,
      { username, passwordHash, realName },
    )
    console.log(`Admin user updated: ${username}`)
  } else {
    await query(
      `INSERT INTO users (username, password_hash, real_name, role, status, failed_login_count, locked_until)
       VALUES (:username, :passwordHash, :realName, 'admin', 'active', 0, NULL)`,
      { username, passwordHash, realName },
    )
    console.log(`Admin user created: ${username}`)
  }

  console.log('Password: configured from ADMIN_PASSWORD')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
