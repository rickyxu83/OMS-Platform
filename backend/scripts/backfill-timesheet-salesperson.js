const { pool } = require('../src/config/db')

async function main() {
  const connection = await pool.getConnection()
  try {
    const [result] = await connection.execute(
      `UPDATE service_orders so
       JOIN customers c ON c.id = so.customer_id
       SET so.timesheet_salesperson = c.salesperson
       WHERE so.timesheet_salesperson IS NULL
         AND c.salesperson IS NOT NULL
         AND c.salesperson <> ''`,
    )
    console.log(`Backfilled timesheet salesperson snapshots: ${result.affectedRows}`)
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
