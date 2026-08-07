async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND column_name = :columnName
     LIMIT 1`,
    { tableName, columnName },
  )
  return Boolean(rows[0])
}

async function dropColumnIfEmpty(connection, tableName, columnName, valuePredicate) {
  if (!(await columnExists(connection, tableName, columnName))) return false
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM ${tableName}
     WHERE ${valuePredicate}`,
  )
  if (Number(rows[0]?.count || 0) > 0) {
    throw new Error(`${tableName}.${columnName} still contains data`)
  }
  await connection.execute(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
  return true
}

async function dropRedundantWorkHoursColumn(connection) {
  if (!(await columnExists(connection, 'service_reports', 'work_hours'))) return false
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS workHourRows,
            SUM(actual_start_at IS NOT NULL
                AND actual_end_at IS NOT NULL
                AND ABS(work_hours - ROUND(TIMESTAMPDIFF(MINUTE, actual_start_at, actual_end_at) / 60, 2)) <= 0.01) AS representedRows
     FROM service_reports
     WHERE work_hours IS NOT NULL`,
  )
  const workHourRows = Number(rows[0]?.workHourRows || 0)
  const representedRows = Number(rows[0]?.representedRows || 0)
  if (workHourRows !== representedRows) {
    throw new Error(`service_reports.work_hours contains ${workHourRows - representedRows} value(s) not represented by actual timestamps`)
  }
  await connection.execute('ALTER TABLE service_reports DROP COLUMN work_hours')
  return true
}

async function dropRedundantFaultSummaryColumn(connection) {
  if (!(await columnExists(connection, 'service_reports', 'fault_summary'))) return false
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS faultSummaryRows,
            SUM(so.id IS NOT NULL
                AND INSTR(TRIM(COALESCE(so.issue_description, '')), TRIM(sr.fault_summary)) > 0) AS representedRows
     FROM service_reports sr
     LEFT JOIN service_orders so ON so.id = sr.service_order_id
     WHERE sr.fault_summary IS NOT NULL
       AND TRIM(sr.fault_summary) <> ''`,
  )
  const faultSummaryRows = Number(rows[0]?.faultSummaryRows || 0)
  const representedRows = Number(rows[0]?.representedRows || 0)
  if (faultSummaryRows !== representedRows) {
    throw new Error(`service_reports.fault_summary contains ${faultSummaryRows - representedRows} value(s) not represented by issue descriptions`)
  }
  await connection.execute('ALTER TABLE service_reports DROP COLUMN fault_summary')
  return true
}

async function ensureInspectionScheduleDevices(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS inspection_schedule_devices (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      schedule_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_schedule_device (schedule_id, device_id),
      KEY idx_schedule_devices_device (device_id),
      CONSTRAINT fk_legacy_cleanup_schedule_devices_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
      CONSTRAINT fk_legacy_cleanup_schedule_devices_device FOREIGN KEY (device_id) REFERENCES devices (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

async function migrateInspectionScheduleDeviceColumn(connection) {
  if (!(await columnExists(connection, 'inspection_schedules', 'device_id'))) return false

  await ensureInspectionScheduleDevices(connection)
  await connection.execute(
    `INSERT IGNORE INTO inspection_schedule_devices (schedule_id, device_id)
     SELECT s.id, s.device_id
     FROM inspection_schedules s
     WHERE s.device_id IS NOT NULL`,
  )

  const [foreignKeys] = await connection.execute(
    `SELECT DISTINCT constraint_name AS constraintName
     FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE()
       AND table_name = 'inspection_schedules'
       AND column_name = 'device_id'
       AND referenced_table_name IS NOT NULL`,
  )
  for (const row of foreignKeys) {
    await connection.execute(`ALTER TABLE inspection_schedules DROP FOREIGN KEY ${row.constraintName}`)
  }

  const [indexes] = await connection.execute(
    `SELECT DISTINCT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'inspection_schedules'
       AND index_name <> 'PRIMARY'
       AND column_name = 'device_id'`,
  )
  for (const row of indexes) {
    await connection.execute(`ALTER TABLE inspection_schedules DROP INDEX ${row.indexName}`)
  }

  await connection.execute('ALTER TABLE inspection_schedules DROP COLUMN device_id')
  return true
}

async function main() {
  const { pool } = require('../src/config/db')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const dropped = []
    if (await dropColumnIfEmpty(connection, 'service_reports', 'customer_signature', "customer_signature IS NOT NULL AND customer_signature <> ''")) {
      dropped.push('service_reports.customer_signature')
    }
    if (await dropRedundantWorkHoursColumn(connection)) {
      dropped.push('service_reports.work_hours')
    }
    if (await dropRedundantFaultSummaryColumn(connection)) {
      dropped.push('service_reports.fault_summary')
    }
    if (await migrateInspectionScheduleDeviceColumn(connection)) {
      dropped.push('inspection_schedules.device_id')
    }
    await connection.commit()
    console.log(`Legacy compatibility migration complete: ${dropped.length ? dropped.join(', ') : 'nothing to drop'}`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { dropRedundantFaultSummaryColumn, dropRedundantWorkHoursColumn }
