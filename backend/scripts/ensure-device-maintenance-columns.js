const { pool } = require('../src/config/db')

const deviceColumns = [
  ['pn', 'VARCHAR(128) NULL', 'AFTER model'],
  ['remark', 'TEXT NULL', 'AFTER serial_no'],
  ['maintenance_type', "ENUM('pending_confirmation', 'none', 'original_manufacturer', 'our_maintenance') NOT NULL DEFAULT 'pending_confirmation'", 'AFTER warranty_until'],
  ['maintenance_party_id', 'BIGINT UNSIGNED NULL', 'AFTER maintenance_type'],
  ['maintenance_start', 'DATE NULL', 'AFTER maintenance_party_id'],
  ['maintenance_end', 'DATE NULL', 'AFTER maintenance_start'],
  ['installation_source_service_order_id', 'BIGINT UNSIGNED NULL', 'AFTER maintenance_end'],
]

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName`,
    { tableName },
  )
  return Number(rows[0].total) > 0
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND COLUMN_NAME = :columnName`,
    { tableName, columnName },
  )
  return Number(rows[0].total) > 0
}

async function columnIsNullable(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT IS_NULLABLE AS is_nullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND COLUMN_NAME = :columnName
     LIMIT 1`,
    { tableName, columnName },
  )
  return String(rows[0]?.is_nullable || '').toUpperCase() === 'YES'
}

async function columnType(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_TYPE AS column_type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND COLUMN_NAME = :columnName
     LIMIT 1`,
    { tableName, columnName },
  )
  return String(rows[0]?.column_type || '')
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND INDEX_NAME = :indexName`,
    { tableName, indexName },
  )
  return Number(rows[0].total) > 0
}

async function constraintExists(connection, tableName, constraintName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND CONSTRAINT_NAME = :constraintName`,
    { tableName, constraintName },
  )
  return Number(rows[0].total) > 0
}

async function ensureMaintenancePartiesTable(connection) {
  if (!(await tableExists(connection, 'maintenance_parties'))) {
    await connection.execute(
      `CREATE TABLE maintenance_parties (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        party_type ENUM('original_manufacturer', 'our_maintenance') NOT NULL,
        name VARCHAR(128) NOT NULL,
        contact VARCHAR(100) NULL,
        phone VARCHAR(32) NULL,
        official_website VARCHAR(255) NULL,
        remark TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_maintenance_parties_name_phone_type (name, phone, party_type),
        KEY idx_maintenance_parties_party_type (party_type),
        KEY idx_maintenance_parties_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    return
  }

  await connection.execute(
    `UPDATE maintenance_parties
     SET party_type = 'our_maintenance'
     WHERE party_type = 'partner_maintenance'`,
  )

  await connection.execute(
    `ALTER TABLE maintenance_parties
     MODIFY party_type ENUM('original_manufacturer', 'our_maintenance') NOT NULL`,
  )

  if (!(await columnExists(connection, 'maintenance_parties', 'contact'))) {
    await connection.execute('ALTER TABLE maintenance_parties ADD COLUMN contact VARCHAR(100) NULL AFTER phone')
  }
  if ((await columnExists(connection, 'maintenance_parties', 'service_scope')) && !(await columnExists(connection, 'maintenance_parties', 'official_website'))) {
    await connection.execute('ALTER TABLE maintenance_parties CHANGE COLUMN service_scope official_website VARCHAR(255) NULL')
  }
  if (!(await columnExists(connection, 'maintenance_parties', 'official_website'))) {
    await connection.execute('ALTER TABLE maintenance_parties ADD COLUMN official_website VARCHAR(255) NULL AFTER contact')
  }
  if (await columnExists(connection, 'maintenance_parties', 'service_scope')) {
    await connection.execute(
      `UPDATE maintenance_parties
       SET official_website = COALESCE(NULLIF(official_website, ''), service_scope)
       WHERE service_scope IS NOT NULL AND service_scope <> ''`,
    )
    await connection.execute('ALTER TABLE maintenance_parties DROP COLUMN service_scope')
  }
  if (!(await columnExists(connection, 'maintenance_parties', 'remark'))) {
    await connection.execute('ALTER TABLE maintenance_parties ADD COLUMN remark TEXT NULL AFTER official_website')
  }

  if (!(await indexExists(connection, 'maintenance_parties', 'uk_maintenance_parties_name_phone_type'))) {
    await connection.execute('ALTER TABLE maintenance_parties ADD UNIQUE KEY uk_maintenance_parties_name_phone_type (name, phone, party_type)')
  }

  if (!(await indexExists(connection, 'maintenance_parties', 'idx_maintenance_parties_party_type'))) {
    await connection.execute('ALTER TABLE maintenance_parties ADD KEY idx_maintenance_parties_party_type (party_type)')
  }
}

async function ensureDeviceColumns(connection) {
  if (await columnExists(connection, 'devices', 'name')) {
    if (!(await columnIsNullable(connection, 'devices', 'name'))) {
      await connection.execute('ALTER TABLE devices MODIFY COLUMN name VARCHAR(128) NULL')
    }
  }

  if (await columnExists(connection, 'devices', 'maintenance_start_at')) {
    await connection.execute('ALTER TABLE devices CHANGE COLUMN maintenance_start_at maintenance_start DATE NULL')
  }
  if (await columnExists(connection, 'devices', 'maintenance_end_at')) {
    await connection.execute('ALTER TABLE devices CHANGE COLUMN maintenance_end_at maintenance_end DATE NULL')
  }

  for (const [name, definition, position] of deviceColumns) {
    if (!(await columnExists(connection, 'devices', name))) {
      await connection.execute(`ALTER TABLE devices ADD COLUMN ${name} ${definition} ${position}`)
    }
  }

  if ((await columnExists(connection, 'devices', 'maintenance_type'))
    && !(await columnType(connection, 'devices', 'maintenance_type')).includes('pending_confirmation')) {
    await connection.execute(
      "ALTER TABLE devices MODIFY COLUMN maintenance_type ENUM('pending_confirmation', 'none', 'original_manufacturer', 'our_maintenance') NOT NULL DEFAULT 'pending_confirmation'",
    )
    await connection.execute("UPDATE devices SET maintenance_type = 'pending_confirmation' WHERE maintenance_type = 'none'")
  }
}

async function ensureDeviceIndexes(connection) {
  if (!(await indexExists(connection, 'devices', 'uk_devices_installation_source_service_order_id'))) {
    await connection.execute(
      'ALTER TABLE devices ADD UNIQUE KEY uk_devices_installation_source_service_order_id (installation_source_service_order_id)',
    )
  }

  if (!(await indexExists(connection, 'devices', 'idx_devices_maintenance_type'))) {
    await connection.execute('ALTER TABLE devices ADD KEY idx_devices_maintenance_type (maintenance_type)')
  }

  if (!(await indexExists(connection, 'devices', 'idx_devices_maintenance_party_id'))) {
    await connection.execute('ALTER TABLE devices ADD KEY idx_devices_maintenance_party_id (maintenance_party_id)')
  }

  if (!(await indexExists(connection, 'devices', 'idx_devices_maintenance_end'))) {
    await connection.execute('ALTER TABLE devices ADD KEY idx_devices_maintenance_end (maintenance_end)')
  }
}

async function ensureDeviceConstraints(connection) {
  if (!(await constraintExists(connection, 'devices', 'fk_devices_maintenance_party_id'))) {
    await connection.execute(
      `ALTER TABLE devices
       ADD CONSTRAINT fk_devices_maintenance_party_id FOREIGN KEY (maintenance_party_id) REFERENCES maintenance_parties (id)`,
    )
  }

  if (!(await constraintExists(connection, 'devices', 'fk_devices_installation_source_service_order_id'))) {
    await connection.execute(
      `ALTER TABLE devices
       ADD CONSTRAINT fk_devices_installation_source_service_order_id
       FOREIGN KEY (installation_source_service_order_id) REFERENCES service_orders (id)`,
    )
  }
}

async function main() {
  const connection = await pool.getConnection()
  try {
    await ensureMaintenancePartiesTable(connection)
    await ensureDeviceColumns(connection)
    await ensureDeviceIndexes(connection)
    await ensureDeviceConstraints(connection)

    console.log('Device maintenance columns are ready.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
