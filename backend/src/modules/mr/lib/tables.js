const { query } = require('../../../config/db')
const { ensureWorkflowTables } = require('./workflow')

/**
 * mr 模块建表/惰性迁移（含并发去重记忆）。
 * 抽离目的：消除 lib/archive.js ↔ lib/controller.js 循环依赖（depcruise no-circular），
 * 双方统一从本模块取 ensureTables；controller.js 仍透传导出保持原契约。
 */

let tablesReady = false
let tablesPromise = null

async function ensureTables() {
  if (tablesReady) return
  if (tablesPromise) return tablesPromise
  tablesPromise = (async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS mr_orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      customer_id BIGINT UNSIGNED NULL,
      customer_contact_id BIGINT UNSIGNED NULL,
      sales_owner_id BIGINT UNSIGNED NULL,
      customer_name VARCHAR(255) NULL,
      contact_name VARCHAR(255) NULL,
      case_category VARCHAR(32) NULL,
      customer_po VARCHAR(255) NULL,
      ctrl_no VARCHAR(64) NULL,
      invoice_type VARCHAR(32) NULL,
      pricing_mode TINYINT NULL,
      total_excluding_tax DECIMAL(14,2) NULL,
      has_contract TINYINT(1) NULL,
      contract_type VARCHAR(32) NULL,
      has_penalty TINYINT(1) NULL,
      invoice_process VARCHAR(32) NULL,
      billing_content VARCHAR(500) NULL,
      invoice_recipient VARCHAR(255) NULL,
      invoice_recipient_tel VARCHAR(64) NULL,
      invoice_recipient_mail VARCHAR(255) NULL,
      billing_timing VARCHAR(255) NULL,
      purchaser VARCHAR(255) NULL,
      purchaser_tel VARCHAR(64) NULL,
      purchaser_mail VARCHAR(255) NULL,
      recipient VARCHAR(255) NULL,
      recipient_tel VARCHAR(64) NULL,
      recipient_mail VARCHAR(255) NULL,
      payment_terms VARCHAR(32) NULL,
      payment_other VARCHAR(255) NULL,
      split_delivery TINYINT(1) NULL,
      acceptance VARCHAR(32) NULL,
      acceptance_other VARCHAR(255) NULL,
      penalty_content VARCHAR(500) NULL,
      install_options JSON NULL,
      maintenance_options JSON NULL,
      contract_no VARCHAR(255) NULL,
      fill_date DATE NULL,
      latest_delivery_date DATE NULL,
      delivery_location VARCHAR(500) NULL,
      shipment_no VARCHAR(255) NULL,
      delivery_terms VARCHAR(255) NULL,
      gross_profit_recognition_start_month VARCHAR(10) NULL,
      gross_profit_recognition_amount DECIMAL(14,2) NULL,
      remaining_recognizable_gross_profit DECIMAL(14,2) NULL,
      taiwan_business_transfer_start_month VARCHAR(10) NULL,
      taiwan_business_transfer_amount DECIMAL(14,2) NULL,
      remaining_taiwan_business_transfer DECIMAL(14,2) NULL,
      gross_profit_recognitions JSON NULL,
      taiwan_business_transfers JSON NULL,
      quotation_file_id BIGINT UNSIGNED NULL,
      remark TEXT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      updated_by BIGINT UNSIGNED NULL,
      submitted_at DATETIME NULL,
      approved_at DATETIME NULL,
      rejected_at DATETIME NULL,
      reject_reason VARCHAR(500) NULL,
      voided_at DATETIME NULL,
      void_reason VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mr_orders_status (status),
      KEY idx_mr_orders_customer (customer_id),
      KEY idx_mr_orders_sales_owner (sales_owner_id),
      KEY idx_mr_orders_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const dateColumns = new Set(['gross_profit_recognition_start_month', 'taiwan_business_transfer_start_month'])
  const requiredOrderColumns = new Map([
    ['delivery_location', 'VARCHAR(500) NULL'],
    ['invoice_recipient_tel', 'VARCHAR(64) NULL'],
    ['invoice_recipient_mail', 'VARCHAR(255) NULL'],
    ['purchaser_mail', 'VARCHAR(255) NULL'],
    ['gross_profit_recognition_start_month', 'VARCHAR(10) NULL'],
    ['gross_profit_recognition_amount', 'DECIMAL(14,2) NULL'],
    ['remaining_recognizable_gross_profit', 'DECIMAL(14,2) NULL'],
    ['taiwan_business_transfer_start_month', 'VARCHAR(10) NULL'],
    ['taiwan_business_transfer_amount', 'DECIMAL(14,2) NULL'],
    ['remaining_taiwan_business_transfer', 'DECIMAL(14,2) NULL'],
    ['gross_profit_recognitions', 'JSON NULL'],
    ['taiwan_business_transfers', 'JSON NULL'],
  ])
  const existingOrderColumns = new Map((await query(
    `SELECT column_name AS name, character_maximum_length AS maxLength FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_orders'`,
  )).map((row) => [row.name, row]))
  for (const [name, definition] of requiredOrderColumns) {
    if (!existingOrderColumns.has(name)) {
      try {
        await query(`ALTER TABLE mr_orders ADD COLUMN ${name} ${definition}`)
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error
      }
    } else if (dateColumns.has(name) && Number(existingOrderColumns.get(name).maxLength) < 10) {
      await query(`ALTER TABLE mr_orders MODIFY COLUMN ${name} VARCHAR(10) NULL`)
    }
  }
  const contactEmailColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'customer_contacts' AND column_name = 'email' LIMIT 1`,
  )
  if (!contactEmailColumns[0]) {
    try {
      await query('ALTER TABLE customer_contacts ADD COLUMN email VARCHAR(255) NULL AFTER phone')
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }
  // Legacy values only contain a month; day 1 preserves that month in the new date control.
  await query(
    `UPDATE mr_orders SET
       gross_profit_recognition_start_month = CASE WHEN gross_profit_recognition_start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN CONCAT(gross_profit_recognition_start_month, '-01') ELSE gross_profit_recognition_start_month END,
       taiwan_business_transfer_start_month = CASE WHEN taiwan_business_transfer_start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN CONCAT(taiwan_business_transfer_start_month, '-01') ELSE taiwan_business_transfer_start_month END
     WHERE gross_profit_recognition_start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
        OR taiwan_business_transfer_start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS mr_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      row_no INT NOT NULL,
      company_part_no VARCHAR(100) NULL,
      oem_spec VARCHAR(255) NULL,
      name VARCHAR(255) NULL,
      description TEXT NULL,
      warranty_service VARCHAR(255) NULL,
      install_by VARCHAR(64) NULL,
      qty DECIMAL(12,4) NULL,
      unit_price DECIMAL(14,6) NULL,
      subtotal DECIMAL(14,2) NULL,
      vendor VARCHAR(255) NULL,
      cost_incl_tax DECIMAL(14,2) NULL,
      tax_rate DECIMAL(5,2) NULL,
      quoted_unit_price DECIMAL(14,6) NULL,
      purchase_order_no VARCHAR(255) NULL,
      cost_source VARCHAR(255) NULL,
      purchase_only TINYINT(1) NULL,
      PRIMARY KEY (id),
      KEY idx_mr_items_mr (mr_id),
      CONSTRAINT fk_mr_items_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const quotedUnitPriceColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_items' AND column_name = 'quoted_unit_price' LIMIT 1`,
  )
  if (!quotedUnitPriceColumns[0]) await query('ALTER TABLE mr_items ADD COLUMN quoted_unit_price DECIMAL(14,6) NULL AFTER tax_rate')
  const costSourceColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_items' AND column_name = 'cost_source' LIMIT 1`,
  )
  if (!costSourceColumns[0]) await query('ALTER TABLE mr_items ADD COLUMN cost_source VARCHAR(255) NULL AFTER purchase_order_no')
  const purchaseOnlyColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_items' AND column_name = 'purchase_only' LIMIT 1`,
  )
  if (!purchaseOnlyColumns[0]) await query('ALTER TABLE mr_items ADD COLUMN purchase_only TINYINT(1) NULL AFTER cost_source')
  const salesSourceColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_items' AND column_name = 'sales_source' LIMIT 1`,
  )
  if (!salesSourceColumns[0]) await query('ALTER TABLE mr_items ADD COLUMN sales_source VARCHAR(255) NULL AFTER cost_source')
  const shipmentNoColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_items' AND column_name = 'shipment_no' LIMIT 1`,
  )
  if (!shipmentNoColumns[0]) await query('ALTER TABLE mr_items ADD COLUMN shipment_no VARCHAR(255) NULL AFTER purchase_order_no')
  await query(
    `CREATE TABLE IF NOT EXISTS mr_approvals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      cycle INT NOT NULL DEFAULT 1,
      seq INT NOT NULL,
      step_key VARCHAR(24) NOT NULL,
      step_label VARCHAR(32) NOT NULL,
      approver_id BIGINT UNSIGNED NULL,
      action VARCHAR(16) NULL,
      reason VARCHAR(500) NULL,
      decided_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_mr_approvals_mr (mr_id, cycle, seq),
      CONSTRAINT fk_mr_approvals_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  // 报价识别缓存：同一文件内容（hash + 解析器版本一致）直接复用首次识别结果，避免重复调 AI 且结果稳定
  await query(
    `CREATE TABLE IF NOT EXISTS mr_quote_recognition_cache (
      file_hash CHAR(64) NOT NULL,
      parser_version INT NOT NULL,
      file_name VARCHAR(255) NULL,
      result LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (file_hash, parser_version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  // 人工修正回写：同一文件命中缓存时，优先应用用户上次修正后的识别结果（提升准确率）
  const cacheColumns = new Set((await query(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_quote_recognition_cache'`,
  )).map((row) => row.name))
  for (const [name, definition] of [
    ['corrected_result', 'LONGTEXT NULL'],
    ['corrected_by', 'BIGINT UNSIGNED NULL'],
    ['corrected_at', 'DATETIME NULL'],
    ['correction_count', 'INT UNSIGNED NOT NULL DEFAULT 0'],
  ]) {
    if (!cacheColumns.has(name)) await query(`ALTER TABLE mr_quote_recognition_cache ADD COLUMN ${name} ${definition}`)
  }
  // 纠错样本库：记录“自动识别结果 vs 人工修正结果”的差异，供规则自学习与人工抽检
  await query(
    `CREATE TABLE IF NOT EXISTS mr_recognition_feedback (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      file_hash CHAR(64) NOT NULL,
      parser_version INT NOT NULL,
      file_name VARCHAR(255) NULL,
      role VARCHAR(16) NULL,
      original_result LONGTEXT NOT NULL,
      corrected_result LONGTEXT NOT NULL,
      diff JSON NULL,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mr_feedback_hash (file_hash, parser_version),
      KEY idx_mr_feedback_name (file_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  // 布局规则自学习：从纠错样本统计“文件名模式 → 供应商”沉淀规则（候选默认待确认）
  await query(
    `CREATE TABLE IF NOT EXISTS mr_layout_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      rule_key VARCHAR(128) NOT NULL,
      file_pattern VARCHAR(128) NOT NULL,
      vendor VARCHAR(128) NOT NULL,
      match_count INT UNSIGNED NOT NULL DEFAULT 0,
      source VARCHAR(16) NOT NULL DEFAULT 'manual',
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mr_layout_rules_key (rule_key),
      KEY idx_mr_layout_rules_enabled (enabled, match_count)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  // 报价表头布局模板：从纠错样本学习“文件模式 + 表头签名 → 列语义映射”，同模板新文件识别时按模板取数
  await query(
    `CREATE TABLE IF NOT EXISTS mr_layout_templates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      rule_key VARCHAR(160) NOT NULL,
      file_pattern VARCHAR(128) NOT NULL,
      header_signature VARCHAR(512) NOT NULL,
      columns_json TEXT NOT NULL,
      review_fields_json TEXT NULL,
      header_row INT UNSIGNED NOT NULL DEFAULT 0,
      match_count INT UNSIGNED NOT NULL DEFAULT 0,
      source VARCHAR(16) NOT NULL DEFAULT 'auto',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mr_templates_key (rule_key),
      KEY idx_mr_templates_pattern (file_pattern),
      KEY idx_mr_templates_signature (header_signature(128))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  // 惰性迁移：为已有 mr_layout_templates 表补充 review_fields_json（记录该模板高频被人工修正的字段）
  const reviewFieldsColumn = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_layout_templates' AND column_name = 'review_fields_json' LIMIT 1`,
  )
  if (!reviewFieldsColumn[0]) {
    await query('ALTER TABLE mr_layout_templates ADD COLUMN review_fields_json TEXT NULL')
  }
  // 销售个人常用供应商：按“销售 × 供应商名”沉淀，与工程师维保厂商目录（maintenance_parties）隔离
  await query(
    `CREATE TABLE IF NOT EXISTS mr_sales_vendors (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      salesperson_id BIGINT UNSIGNED NOT NULL,
      vendor_name VARCHAR(255) NOT NULL,
      use_count INT UNSIGNED NOT NULL DEFAULT 0,
      last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mr_sales_vendors_owner (salesperson_id, vendor_name),
      KEY idx_mr_sales_vendors_last (salesperson_id, last_used_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  // 销售个人客户偏好快照：按“销售 × 客户”记忆 MR 表单中客户维度的稳定偏好（送货地址、三组联系人、付款与开票等）
  await query(
    `CREATE TABLE IF NOT EXISTS mr_sales_customer_prefs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      salesperson_id BIGINT UNSIGNED NOT NULL,
      customer_id BIGINT UNSIGNED NOT NULL,
      snapshot JSON NULL,
      use_count INT UNSIGNED NOT NULL DEFAULT 0,
      last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mr_sales_prefs_owner (salesperson_id, customer_id),
      KEY idx_mr_sales_prefs_last (salesperson_id, last_used_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await ensureWorkflowTables()
  const quoteRoleColumn = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'files' AND column_name = 'quote_role' LIMIT 1`,
  )
  if (!quoteRoleColumn[0]) await query("ALTER TABLE files ADD COLUMN quote_role VARCHAR(16) NULL")
  tablesReady = true
  })()
  try {
    await tablesPromise
  } catch (error) {
    tablesPromise = null
    throw error
  }
}

module.exports = { ensureTables }
