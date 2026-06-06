const { query } = require('../../config/db')

let tableReady = false

async function ensureSettingsTable() {
  if (tableReady) return
  await query(
    `CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(128) NOT NULL,
      setting_value LONGTEXT NULL,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key),
      KEY idx_system_settings_updated_by (updated_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  tableReady = true
}

async function getSettings(keys = []) {
  await ensureSettingsTable()
  if (!keys.length) return {}
  const params = {}
  const placeholders = keys.map((key, index) => {
    params[`key${index}`] = key
    return `:key${index}`
  })
  const rows = await query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key IN (${placeholders.join(',')})`,
    params,
  )
  return rows.reduce((values, row) => {
    values[row.setting_key] = row.setting_value
    return values
  }, {})
}

async function setSettings(values, userId = null) {
  await ensureSettingsTable()
  for (const [key, value] of Object.entries(values || {})) {
    await query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by)
       VALUES (:key, :value, :updatedBy)
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      {
        key,
        value: value === undefined ? null : String(value),
        updatedBy: userId || null,
      },
    )
  }
}

module.exports = {
  ensureSettingsTable,
  getSettings,
  setSettings,
}
