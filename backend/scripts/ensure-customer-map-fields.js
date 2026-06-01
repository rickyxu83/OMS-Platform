const { pool } = require('../src/config/db')

const columns = [
  ['name_key', 'VARCHAR(160) NULL', 'AFTER name'],
  ['map_provider', 'VARCHAR(32) NULL'],
  ['map_poi_id', 'VARCHAR(128) NULL'],
  ['map_poi_name', 'VARCHAR(128) NULL'],
  ['map_address', 'VARCHAR(255) NULL'],
]

async function columnExists(connection, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'customers'
       AND COLUMN_NAME = :columnName`,
    { columnName },
  )
  return Number(rows[0].total) > 0
}

async function indexExists(connection, indexName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'customers'
       AND INDEX_NAME = :indexName`,
    { indexName },
  )
  return Number(rows[0].total) > 0
}

async function main() {
  const connection = await pool.getConnection()
  try {
    for (const [name, definition, position] of columns) {
      if (!(await columnExists(connection, name))) {
        await connection.execute(`ALTER TABLE customers ADD COLUMN ${name} ${definition} ${position || 'AFTER longitude'}`)
      }
    }

    if (!(await indexExists(connection, 'uk_customers_name_key'))) {
      await connection.execute('ALTER TABLE customers ADD UNIQUE KEY uk_customers_name_key (name_key)')
    }

    if (!(await indexExists(connection, 'idx_customers_map_poi'))) {
      await connection.execute('ALTER TABLE customers ADD KEY idx_customers_map_poi (map_provider, map_poi_id)')
    }

    console.log('Customer map fields are ready.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
