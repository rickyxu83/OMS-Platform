const { query } = require('../../config/db')

let deviceModelCatalogTableReady = false
let deviceModelAliasesTableReady = false

async function ensureDeviceModelCatalogTable(connection = null) {
  if (!connection && deviceModelCatalogTableReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql) => [await query(sql)]
  await execute(
    `CREATE TABLE IF NOT EXISTS device_model_catalog (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      brand VARCHAR(100) NOT NULL,
      category ENUM('server','storage','network') NOT NULL,
      canonical_model VARCHAR(255) NOT NULL,
      source_provider VARCHAR(50) NOT NULL DEFAULT 'fixture',
      source_reference VARCHAR(255) DEFAULT NULL,
      priority INT NOT NULL DEFAULT 0,
      confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      synced_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_catalog_brand_cat_model (brand, category, canonical_model)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  if (!connection) {
    deviceModelCatalogTableReady = true
  }
}

async function ensureDeviceModelAliasesTable(connection = null) {
  if (!connection && deviceModelAliasesTableReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql) => [await query(sql)]
  await execute(
    `CREATE TABLE IF NOT EXISTS device_model_aliases (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      catalog_id INT UNSIGNED NOT NULL,
      normalized_alias VARCHAR(255) NOT NULL,
      provider_scope VARCHAR(50) NOT NULL DEFAULT 'approved-v1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_alias_cat_scope (catalog_id, normalized_alias, provider_scope),
      INDEX idx_alias_norm_scope (normalized_alias, provider_scope),
      CONSTRAINT fk_alias_catalog FOREIGN KEY (catalog_id) REFERENCES device_model_catalog(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  if (!connection) {
    deviceModelAliasesTableReady = true
  }
}

module.exports = {
  ensureDeviceModelCatalogTable,
  ensureDeviceModelAliasesTable,
}
