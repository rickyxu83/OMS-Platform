const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const env = require('../../../config/env')

/** 报价识别解析器版本：识别逻辑/输出格式变更时 +1，旧缓存自动失效。 */
const RECOGNITION_PARSER_VERSION = 3

async function readRecognitionCache(fileHash) {
  try {
    const rows = await query(
      `SELECT result, corrected_result, corrected_by, corrected_at, correction_count
       FROM mr_quote_recognition_cache WHERE file_hash = :hash AND parser_version = :version LIMIT 1`,
      { hash: fileHash, version: RECOGNITION_PARSER_VERSION },
    )
    if (!rows[0]) return null
    const parse = (input) => {
      if (!input) return null
      try {
        const value = JSON.parse(input)
        return value && typeof value === 'object' ? value : null
      } catch { return null }
    }
    return {
      result: parse(rows[0].result),
      corrected: parse(rows[0].corrected_result) || null,
      correctedBy: rows[0].corrected_by || null,
      correctedAt: rows[0].corrected_at || null,
      correctionCount: Number(rows[0].correction_count || 0),
    }
  } catch (_error) {
    return null
  }
}

async function writeRecognitionCache(fileHash, fileName, payload) {
  try {
    await query(
      `INSERT INTO mr_quote_recognition_cache (file_hash, parser_version, file_name, result)
       VALUES (:hash, :version, :name, :result)
       ON DUPLICATE KEY UPDATE result = VALUES(result), file_name = VALUES(file_name)`,
      { hash: fileHash, version: RECOGNITION_PARSER_VERSION, name: fileName, result: JSON.stringify(payload) },
    )
  } catch (_error) {
    // 缓存写入失败不影响导入
  }
}

/** 报价导入进度（内存态，用于前端“第 x/N 份”提示）；识别结束后延迟清理。 */
const importProgress = new Map()
const { query, transaction } = require('../../../config/db')
const { badRequest, forbidden, notFound } = require('../../../utils/http-error')
const { parseWorkbookWithMetadata, sheetTotal } = require('./quotation-parser')
const { parsePdf, parsePdfText } = require('./quotation-pdf-parser')
const { recognizePdf } = require('./ocr-client')
const { extractWorkbookImages, companyCandidates } = require('./workbook-images')
const { archiveMrDocument } = require('./archive')
const { validateParsedQuotation } = require('./quotation-validation')
const { applyQuotationLayoutRule } = require('./quotation-layout-rules')
const { mergeQuotations } = require('./quotation-merge')
const { recognizeQuotationWithAi, applyAiEntityKeys } = require('./quotation-ai-parser')
const {
  constants,
  STEP_ROLES,
  normalizeOrder,
  validateSubmission,
  totals,
  computeApprovalSteps,
} = require('../domain')
const { resolveSubmissionCustomer } = require('../customer-resolution')
const {
  ensureWorkflowTables,
  salesWithAssistant,
  assertAssistantMapping,
  resolveStepAssignee,
  activateCurrentStep,
  activatePurchaseTask,
  completeTask,
  saveSubmissionBaseline,
  freezeVersion,
  assistantSetting,
  updateAssistantSetting,
  mrDocument,
} = require('./workflow')
const { PDF_FORMAT_VERSION } = require('./mr-pdf')

const EDITABLE_STATUSES = new Set(['draft', 'rejected'])
const SALES_ROLES = new Set(['sales', 'sales_supervisor'])
// 助理及助理主管：助理主管可见/可操作所有在职助理负责的内容
const ASSISTANT_LIKE_ROLES = new Set(['assistant', 'assistant_supervisor'])
const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
const quotationRoot = path.join(uploadRoot, 'mr-quotations')
fs.mkdirSync(quotationRoot, { recursive: true })

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

function camelizeRow(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
    value,
  ]))
}

/** 助理类角色的可操作助理范围：助理本人仅自己；助理主管为全部在职助理。 */
async function assistantIdsFor(user) {
  if (user.role === 'assistant') return [Number(user.id)]
  if (user.role === 'assistant_supervisor') {
    const rows = await query("SELECT id FROM users WHERE role = 'assistant' AND status = 'active'")
    return rows.map((row) => Number(row.id))
  }
  return []
}

const ASSISTANT_SCOPE_SQL = `SELECT id FROM users WHERE role = 'assistant' AND status = 'active'`

function parseOptions(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonValue(value, fallback = null) {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function orderPayload(row) {
  const payload = camelizeRow(row)
  payload.installOptions = parseOptions(payload.installOptions)
  payload.maintenanceOptions = parseOptions(payload.maintenanceOptions)
  payload.grossProfitRecognitions = parseJsonValue(payload.grossProfitRecognitions, null)
  payload.taiwanBusinessTransfers = parseJsonValue(payload.taiwanBusinessTransfers, null)
  payload.hasContract = payload.hasContract === null ? null : Number(payload.hasContract)
  payload.hasPenalty = payload.hasPenalty === null ? null : Number(payload.hasPenalty)
  payload.splitDelivery = payload.splitDelivery === null ? null : Number(payload.splitDelivery)
  payload.pricingMode = payload.pricingMode === null ? null : Number(payload.pricingMode)
  return payload
}

function canView(order, user, assistantIds = []) {
  if (user.role === 'admin') return true
  if (user.role === 'operations_director' && ['approved', 'voided'].includes(order.status)) return true
  if (SALES_ROLES.has(user.role) && Number(order.salesOwnerId) === Number(user.id)) return true
  if (ASSISTANT_LIKE_ROLES.has(user.role) && assistantIds.includes(Number(order.assistantUserId))) return true
  if (user.role === 'purchaser' && Number(order.purchaseAssigneeUserId) === Number(user.id)) return true
  return Boolean(order.approvalParticipant)
}

function canEdit(order, user, assistantIds = []) {
  if (order.status === 'in_review') {
    return ASSISTANT_LIKE_ROLES.has(user.role)
      && order.currentStepKey === 'assistant'
      && assistantIds.includes(Number(order.currentAssigneeUserId))
  }
  if (!EDITABLE_STATUSES.has(order.status)) return false
  if (user.role === 'admin') return true
  if (order.status === 'rejected') {
    if (order.returnTarget === 'assistant') {
      return ASSISTANT_LIKE_ROLES.has(user.role) && assistantIds.includes(Number(order.assistantUserId))
    }
    return SALES_ROLES.has(user.role) && Number(order.salesOwnerId) === Number(user.id)
  }
  return (SALES_ROLES.has(user.role) && Number(order.salesOwnerId) === Number(user.id))
    || (ASSISTANT_LIKE_ROLES.has(user.role) && assistantIds.includes(Number(order.assistantUserId)))
}

function canDelete(order, user, assistantIds = []) {
  if (user.role === 'admin') return EDITABLE_STATUSES.has(order.status)
  return EDITABLE_STATUSES.has(order.status) && Number(order.createdBy) === Number(user.id) && canEdit(order, user, assistantIds)
}

function canVoid(order, user, assistantIds = []) {
  if (order.status !== 'approved') return false
  if (['admin', 'operations_director', 'sales_supervisor'].includes(user.role)) return true
  return (SALES_ROLES.has(user.role) && Number(order.salesOwnerId) === Number(user.id))
    || (ASSISTANT_LIKE_ROLES.has(user.role) && assistantIds.includes(Number(order.assistantUserId)))
}

function canPurchase(order, user) {
  if (order.status !== 'approved') return false
  if (!['pending', 'done', 'skipped'].includes(String(order.purchaseStatus || ''))) return false
  if (user.role === 'admin') return true
  return user.role === 'purchaser' && Number(order.purchaseAssigneeUserId) === Number(user.id)
}

function canApprove(order, user, assistantIds = []) {
  if (order.status !== 'in_review' || !order.currentStepKey) return false
  if (order.currentStepKey === 'assistant') {
    return ASSISTANT_LIKE_ROLES.has(user.role) && assistantIds.includes(Number(order.currentAssigneeUserId))
  }
  if (Number(order.currentAssigneeUserId) !== Number(user.id)) return false
  if (order.currentStepKey === 'sales') return SALES_ROLES.has(user.role) && Number(order.salesOwnerId) === Number(user.id)
  return STEP_ROLES[order.currentStepKey] === user.role
}

function canWithdraw(order, user) {
  return SALES_ROLES.has(user.role)
    && order.status === 'in_review'
    && Number(order.salesOwnerId) === Number(user.id)
}

async function loadRawOrder(id, user = null) {
  await ensureTables()
  const rows = await query(
    `SELECT o.*, creator.real_name AS created_by_name, updater.real_name AS updated_by_name,
            sales.real_name AS sales_owner_name, sales.role AS sales_owner_role, sales.assistant_user_id, assistant.real_name AS assistant_name,
            purchase_assignee.real_name AS purchase_assignee_name, purchaser_done.real_name AS purchased_by_name,
            c.code AS customer_code,
            pending.step_key AS current_step_key, pending.step_label AS current_step_label,
            pending.assignee_user_id AS current_assignee_user_id, pending.assignment_error,
            EXISTS (
              SELECT 1 FROM mr_approvals participant
              WHERE participant.mr_id = o.id
                AND (participant.assignee_user_id = :viewerId OR participant.approver_id = :viewerId)
            ) AS approval_participant
     FROM mr_orders o
     LEFT JOIN users creator ON creator.id = o.created_by
     LEFT JOIN users updater ON updater.id = o.updated_by
     LEFT JOIN users sales ON sales.id = o.sales_owner_id
     LEFT JOIN users assistant ON assistant.id = sales.assistant_user_id
     LEFT JOIN users purchase_assignee ON purchase_assignee.id = o.purchase_assignee_user_id
     LEFT JOIN users purchaser_done ON purchaser_done.id = o.purchased_by
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN mr_approvals pending ON pending.id = (
       SELECT a.id FROM mr_approvals a
       WHERE a.mr_id = o.id AND a.action IS NULL
       ORDER BY a.cycle DESC, a.seq LIMIT 1
     )
     WHERE o.id = :id
     LIMIT 1`,
    { id, viewerId: Number(user?.id || 0) },
  )
  if (!rows[0]) throw notFound('MR 申请不存在')
  return orderPayload(rows[0])
}

async function loadLockedOrder(connection, id) {
  const [rows] = await connection.execute(
    `SELECT o.*, sales.role AS sales_owner_role, sales.assistant_user_id
     FROM mr_orders o LEFT JOIN users sales ON sales.id = o.sales_owner_id
     WHERE o.id = :id LIMIT 1 FOR UPDATE`,
    { id },
  )
  if (!rows[0]) throw notFound('MR 申请不存在')
  const [pending] = await connection.execute(
    `SELECT step_key AS current_step_key, step_label AS current_step_label,
            assignee_user_id AS current_assignee_user_id, assignment_error
     FROM mr_approvals WHERE mr_id = :id AND action IS NULL
     ORDER BY cycle DESC, seq LIMIT 1`,
    { id },
  )
  return orderPayload({ ...rows[0], ...(pending[0] || {}) })
}

async function loadCalculatedOrder(connection, order) {
  const [rows] = await connection.execute('SELECT * FROM mr_items WHERE mr_id = :id ORDER BY row_no, id', { id: order.id })
  const normalized = normalizeOrder({ ...order, items: rows.map(camelizeRow) })
  return { ...order, ...normalized.order, items: normalized.items }
}

async function loadDetail(id, user) {
  await ensureTables()
  const order = await loadRawOrder(id, user)
  const assistantIds = await assistantIdsFor(user)
  if (!canView(order, user, assistantIds)) throw forbidden('无权查看该 MR 申请')
  const [itemRows, approvalRows, fileRows, versionRows, documentRows] = await Promise.all([
    query('SELECT * FROM mr_items WHERE mr_id = :id ORDER BY row_no, id', { id }),
    query(
      `SELECT a.*, COALESCE(a.approver_name_snapshot, u.real_name) AS approver_name,
              a.approver_role_snapshot AS approver_role, assignee.real_name AS assignee_name
       FROM mr_approvals a
       LEFT JOIN users u ON u.id = a.approver_id
       LEFT JOIN users assignee ON assignee.id = a.assignee_user_id
       WHERE a.mr_id = :id
       ORDER BY a.cycle, a.seq`,
      { id },
    ),
    query(
      `SELECT id, original_name, size, created_at, quote_role
       FROM files WHERE owner_type = 'mr_order' AND owner_id = :id ORDER BY id`,
      { id },
    ),
    query(
      `SELECT version_no, snapshot, changes, created_at
       FROM mr_versions WHERE mr_id = :id AND kind = 'frozen'
       ORDER BY version_no DESC LIMIT 1`,
      { id },
    ),
    query('SELECT document_type FROM mr_documents WHERE mr_id = :id AND format_version >= :formatVersion ORDER BY created_at', { id, formatVersion: PDF_FORMAT_VERSION }),
  ])
  const rawItems = itemRows.map(camelizeRow)
  const normalized = normalizeOrder({ ...order, items: rawItems })
  const items = normalized.items.map((item, index) => ({ id: rawItems[index]?.id, ...item }))
  const merged = { ...order, ...normalized.order, items }
  const approvalHistory = approvalRows.map(camelizeRow)
  const currentCycle = approvalHistory.reduce((max, approval) => Math.max(max, Number(approval.cycle) || 0), 0)
  const approvals = approvalHistory.filter((approval) => Number(approval.cycle) === currentCycle)
  const currentApproval = approvals.find((approval) => !approval.action)
  const currentVersion = versionRows[0] ? {
    versionNo: Number(versionRows[0].version_no),
    changes: parseOptions(versionRows[0].changes),
    createdAt: versionRows[0].created_at,
  } : null
  const liveTotals = totals(merged, items)
  const frozenSnapshot = parseJsonValue(versionRows[0]?.snapshot, null)
  const useFrozenSnapshot = frozenSnapshot && (
    ['approved', 'voided'].includes(order.status)
    || (order.status === 'in_review' && order.currentStepKey !== 'assistant')
  )
  const displayed = useFrozenSnapshot ? {
    ...merged,
    ...frozenSnapshot,
    items: Array.isArray(frozenSnapshot.items) ? frozenSnapshot.items : items,
    totals: frozenSnapshot.totals || liveTotals,
  } : { ...merged, totals: liveTotals }
  // 冻结快照的品项缺少数据库 id，且不含审批后由采购填写的采购订单号；
  // 按 rowNo 叠加实时 id 与 purchaseOrderNo，归档 PDF 仍保持审批时快照不变
  const liveItemByRowNo = new Map(rawItems.map((raw) => [Number(raw.rowNo), raw]))
  const displayedItems = (displayed.items || []).map((item) => {
    const live = liveItemByRowNo.get(Number(item.rowNo))
    return live ? { ...item, id: live.id ?? item.id, purchaseOrderNo: live.purchaseOrderNo ?? item.purchaseOrderNo } : item
  })
  // 采购环节属于审批后的生命周期数据：始终以 mr_orders 实时值为准，不被冻结快照覆盖
  const purchaseLive = {
    purchaseStatus: order.purchaseStatus ?? null,
    purchaseAssigneeUserId: order.purchaseAssigneeUserId ?? null,
    purchaseAssigneeName: order.purchaseAssigneeName ?? null,
    purchaseAssignmentError: order.purchaseAssignmentError ?? null,
    purchasedAt: order.purchasedAt ?? null,
    purchasedBy: order.purchasedBy ?? null,
    purchasedByName: order.purchasedByName ?? null,
    purchaseNote: order.purchaseNote ?? null,
  }
  return {
    ...displayed,
    ...purchaseLive,
    items: displayedItems,
    approvals,
    approvalHistory,
    currentVersion,
    currentAssigneeName: currentApproval?.assigneeName || null,
    assignmentError: currentApproval?.assignmentError || order.assignmentError || null,
    quotationFiles: fileRows.map((file) => ({ id: file.id, name: file.original_name, size: Number(file.size), createdAt: file.created_at, quoteRole: file.quote_role || null })),
    archivedDocumentTypes: documentRows.map((row) => row.document_type),
    fileName: `${order.customerCode || order.customerName || 'MR'}_${order.ctrlNo || `草稿-${order.id}`}`,
    permissions: {
      canEdit: canEdit(order, user, assistantIds),
      canDelete: canDelete(order, user, assistantIds),
      canVoid: canVoid(order, user, assistantIds),
      canApprove: canApprove(order, user, assistantIds),
      canWithdraw: canWithdraw(order, user),
      canPurchase: canPurchase(order, user),
    },
  }
}

async function resolveReferences(order, user) {
  if (SALES_ROLES.has(user.role)) order.salesOwnerId = Number(user.id)
  if (order.customerId) {
    const customers = await query('SELECT id, name FROM customers WHERE id = :id LIMIT 1', { id: order.customerId })
    if (!customers[0]) throw badRequest('客户档案不存在')
    order.customerName = customers[0].name
  }
  if (order.customerContactId) {
    const contacts = await query(
      'SELECT id, name FROM customer_contacts WHERE id = :id AND customer_id = :customerId LIMIT 1',
      { id: order.customerContactId, customerId: order.customerId },
    )
    if (!contacts[0]) throw badRequest('联系人不属于所选客户')
    order.contactName = contacts[0].name
  }
  if (order.salesOwnerId) {
    const users = await query(
      "SELECT id FROM users WHERE id = :id AND role IN ('sales', 'sales_supervisor') AND status = 'active' LIMIT 1",
      { id: order.salesOwnerId },
    )
    if (!users[0]) throw badRequest('业务负责人不存在或已停用')
  }
  return order
}

async function assertCreateOwner(order, user) {
  if (user.role === 'admin' || SALES_ROLES.has(user.role)) return
  if (!ASSISTANT_LIKE_ROLES.has(user.role)) throw forbidden('仅业务人员、业务主管或其对应助理可以创建 MR 申请')
  if (!order.salesOwnerId) throw badRequest('助理代建 MR 申请时，请选择业务负责人')
  const rows = await query(
    `SELECT assistant_user_id FROM users
     WHERE id = :salesId AND role IN ('sales', 'sales_supervisor') AND status = 'active' LIMIT 1`,
    { salesId: order.salesOwnerId },
  )
  const assistantId = Number(rows[0]?.assistant_user_id || 0)
  if (user.role === 'assistant') {
    if (assistantId !== Number(user.id)) throw forbidden('仅可为与你建立助理对应关系的业务负责人代建 MR 申请')
    return
  }
  // 助理主管：可为已配置在职助理的业务负责人代建
  if (!assistantId) throw badRequest('请选择已配置在职助理的业务负责人')
  const assistant = await query(
    "SELECT id FROM users WHERE id = :assistantId AND role = 'assistant' AND status = 'active' LIMIT 1",
    { assistantId },
  )
  if (!assistant[0]) throw badRequest('请选择已配置在职助理的业务负责人')
}

const ORDER_COLUMNS = [
  ['customerId', 'customer_id'], ['customerContactId', 'customer_contact_id'], ['salesOwnerId', 'sales_owner_id'],
  ['customerName', 'customer_name'], ['contactName', 'contact_name'], ['caseCategory', 'case_category'],
  ['customerPo', 'customer_po'], ['ctrlNo', 'ctrl_no'], ['invoiceType', 'invoice_type'],
  ['pricingMode', 'pricing_mode'], ['totalExcludingTax', 'total_excluding_tax'], ['hasContract', 'has_contract'],
  ['contractType', 'contract_type'], ['hasPenalty', 'has_penalty'], ['penaltyContent', 'penalty_content'],
  ['invoiceProcess', 'invoice_process'], ['billingContent', 'billing_content'], ['invoiceRecipient', 'invoice_recipient'],
  ['invoiceRecipientTel', 'invoice_recipient_tel'], ['invoiceRecipientMail', 'invoice_recipient_mail'],
  ['billingTiming', 'billing_timing'], ['purchaser', 'purchaser'], ['purchaserTel', 'purchaser_tel'], ['purchaserMail', 'purchaser_mail'],
  ['recipient', 'recipient'], ['recipientTel', 'recipient_tel'], ['recipientMail', 'recipient_mail'],
  ['paymentTerms', 'payment_terms'], ['paymentOther', 'payment_other'], ['splitDelivery', 'split_delivery'],
  ['acceptance', 'acceptance'], ['acceptanceOther', 'acceptance_other'], ['installOptions', 'install_options'],
  ['maintenanceOptions', 'maintenance_options'], ['contractNo', 'contract_no'], ['fillDate', 'fill_date'],
  ['latestDeliveryDate', 'latest_delivery_date'], ['deliveryLocation', 'delivery_location'],
  ['shipmentNo', 'shipment_no'], ['deliveryTerms', 'delivery_terms'],
  ['grossProfitRecognitionStartMonth', 'gross_profit_recognition_start_month'], ['grossProfitRecognitionAmount', 'gross_profit_recognition_amount'], ['remainingRecognizableGrossProfit', 'remaining_recognizable_gross_profit'],
  ['taiwanBusinessTransferStartMonth', 'taiwan_business_transfer_start_month'], ['taiwanBusinessTransferAmount', 'taiwan_business_transfer_amount'], ['remainingTaiwanBusinessTransfer', 'remaining_taiwan_business_transfer'],
  ['grossProfitRecognitions', 'gross_profit_recognitions'], ['taiwanBusinessTransfers', 'taiwan_business_transfers'],
  ['remark', 'remark'],
]

function dbParams(order) {
  return Object.fromEntries(ORDER_COLUMNS.map(([key, column]) => [
    column,
    ['installOptions', 'maintenanceOptions', 'grossProfitRecognitions', 'taiwanBusinessTransfers'].includes(key) ? JSON.stringify(order[key] || []) : order[key],
  ]))
}

async function replaceItems(connection, mrId, items) {
  await connection.execute('DELETE FROM mr_items WHERE mr_id = :mrId', { mrId })
  for (const item of items) {
    await connection.execute(
      `INSERT INTO mr_items
        (mr_id, row_no, company_part_no, oem_spec, name, description, warranty_service,
         install_by, qty, unit_price, subtotal, vendor, cost_incl_tax, tax_rate, quoted_unit_price, purchase_order_no, cost_source, sales_source, purchase_only)
       VALUES
        (:mrId, :rowNo, :companyPartNo, :oemSpec, :name, :description, :warrantyService,
         :installBy, :qty, :unitPrice, :subtotal, :vendor, :costInclTax, :taxRate, :quotedUnitPrice, :purchaseOrderNo, :costSource, :salesSource, :purchaseOnly)`,
      { mrId, ...item }
    )
  }
}

async function list(req, res) {
  await ensureTables()
  const where = []
  const params = {}
  if (req.user.role === 'sales') {
    where.push('o.sales_owner_id = :userId')
    params.userId = req.user.id
  } else if (req.user.role === 'sales_supervisor') {
    where.push(`(o.sales_owner_id = :userId OR EXISTS (
      SELECT 1 FROM mr_approvals visible
      WHERE visible.mr_id = o.id AND (visible.assignee_user_id = :userId OR visible.approver_id = :userId)
    ))`)
    params.userId = req.user.id
  } else if (req.user.role === 'assistant') {
    where.push(`(sales.assistant_user_id = :userId OR EXISTS (
      SELECT 1 FROM mr_approvals visible
      WHERE visible.mr_id = o.id AND (visible.assignee_user_id = :userId OR visible.approver_id = :userId)
    ))`)
    params.userId = req.user.id
  } else if (req.user.role === 'assistant_supervisor') {
    // 助理主管：可见所有在职助理负责/经手的内容（新增助理自动纳入）
    where.push(`(sales.assistant_user_id IN (${ASSISTANT_SCOPE_SQL}) OR EXISTS (
      SELECT 1 FROM mr_approvals visible
      WHERE visible.mr_id = o.id
        AND (visible.assignee_user_id IN (${ASSISTANT_SCOPE_SQL}) OR visible.approver_id IN (${ASSISTANT_SCOPE_SQL}))
    ))`)
  } else if (req.user.role !== 'admin') {
    const participantClause = `EXISTS (SELECT 1 FROM mr_approvals visible
      WHERE visible.mr_id = o.id AND (visible.assignee_user_id = :userId OR visible.approver_id = :userId))`
    where.push(req.user.role === 'operations_director' ? `(o.status IN ('approved', 'voided') OR ${participantClause})` : participantClause)
    params.userId = req.user.id
  }
  const status = String(req.query.status || '').trim()
  if (status) {
    where.push('o.status = :status')
    params.status = status
  }
  const purchaseStatus = String(req.query.purchaseStatus || '').trim()
  if (purchaseStatus) {
    where.push('o.purchase_status = :purchaseStatus')
    params.purchaseStatus = purchaseStatus
  }
  const q = String(req.query.q || '').trim()
  if (q) {
    where.push('(o.customer_name LIKE :q OR o.ctrl_no LIKE :q OR c.code LIKE :q)')
    params.q = `%${q}%`
  }
  params.permissionUserId = req.user.id
  const assistantIds = await assistantIdsFor(req.user)
  const rows = await query(
    `SELECT o.*, creator.real_name AS created_by_name, sales.real_name AS sales_owner_name,
            sales.assistant_user_id, assistant.real_name AS assistant_name,
            purchase_assignee.real_name AS purchase_assignee_name,
            c.code AS customer_code, (SELECT COUNT(*) FROM mr_items i WHERE i.mr_id = o.id) AS item_count,
            pending.step_key AS current_step_key, pending.step_label AS current_step_label,
            pending.assignee_user_id AS current_assignee_user_id, current_assignee.real_name AS current_assignee_name, pending.assignment_error,
            CASE WHEN pending.assignee_user_id = :permissionUserId THEN 1 ELSE 0 END AS approval_participant
     FROM mr_orders o
     LEFT JOIN users creator ON creator.id = o.created_by
     LEFT JOIN users sales ON sales.id = o.sales_owner_id
     LEFT JOIN users assistant ON assistant.id = sales.assistant_user_id
     LEFT JOIN users purchase_assignee ON purchase_assignee.id = o.purchase_assignee_user_id
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN mr_approvals pending ON pending.id = (
       SELECT a.id FROM mr_approvals a WHERE a.mr_id = o.id AND a.action IS NULL ORDER BY a.cycle DESC, a.seq LIMIT 1
     )
     LEFT JOIN users current_assignee ON current_assignee.id = pending.assignee_user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY o.updated_at DESC, o.id DESC
     LIMIT 500`,
    params,
  )
  res.json({ items: rows.map((row) => {
    const order = orderPayload(row)
    return { ...order, permissions: { canEdit: canEdit(order, req.user, assistantIds), canDelete: canDelete(order, req.user, assistantIds), canVoid: canVoid(order, req.user, assistantIds), canApprove: canApprove(order, req.user, assistantIds), canWithdraw: canWithdraw(order, req.user), canPurchase: canPurchase(order, req.user) } }
  }) })
}

async function getAssistantSetting(req, res) {
  await ensureTables()
  res.json(await assistantSetting(req.user.id))
}

async function setAssistantSetting(req, res) {
  await ensureTables()
  res.json(await updateAssistantSetting(req.user.id, req.body?.assistantUserId))
}

async function detail(req, res) {
  res.json(await loadDetail(req.params.id, req.user))
}

async function create(req, res) {
  await ensureTables()
  const normalized = normalizeOrder(req.body || {})
  await resolveReferences(normalized.order, req.user)
  await assertCreateOwner(normalized.order, req.user)
  const params = dbParams(normalized.order)
  const id = await transaction(async (connection) => {
    const columns = ORDER_COLUMNS.map(([, column]) => column)
    const [result] = await connection.execute(
      `INSERT INTO mr_orders (${columns.join(', ')}, created_by, updated_by)
       VALUES (${columns.map((column) => `:${column}`).join(', ')}, :userId, :userId)`,
      { ...params, userId: req.user.id },
    )
    await replaceItems(connection, result.insertId, normalized.items)
    return result.insertId
  })
  res.status(201).json(await loadDetail(id, req.user))
}

async function update(req, res) {
  await ensureTables()
  const assistantIds = await assistantIdsFor(req.user)
  const normalized = normalizeOrder(req.body || {})
  await resolveReferences(normalized.order, req.user)
  const params = dbParams(normalized.order)
  await transaction(async (connection) => {
    const existing = await loadLockedOrder(connection, req.params.id)
    if (!canEdit(existing, req.user, assistantIds)) throw forbidden('当前状态或身份不允许编辑该 MR 申请')
    if (req.user.role !== 'admin' || existing.status !== 'draft') params.sales_owner_id = existing.salesOwnerId
    await connection.execute(
      `UPDATE mr_orders SET
       ${ORDER_COLUMNS.map(([, column]) => `${column} = :${column}`).join(', ')}, updated_by = :userId
       WHERE id = :id`,
      { ...params, userId: req.user.id, id: req.params.id },
    )
    await replaceItems(connection, req.params.id, normalized.items)
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function ensureMrVendors(connection, items = []) {
  const names = [...new Set(items.map((item) => String(item.vendor || '').trim()).filter(Boolean))]
  for (const name of names) {
    const [rows] = await connection.execute(
      "SELECT id FROM maintenance_parties WHERE party_type = 'original_manufacturer' AND name = :name LIMIT 1",
      { name },
    )
    if (rows[0]) continue
    await connection.execute(
      `INSERT INTO maintenance_parties (party_type, name) VALUES ('original_manufacturer', :name)`,
      { name },
    )
  }
}

async function submit(req, res) {
  await ensureTables()
  const assistantIds = await assistantIdsFor(req.user)
  await transaction(async (connection) => {
    const locked = await loadLockedOrder(connection, req.params.id)
    if (!canEdit(locked, req.user, assistantIds)) throw forbidden('当前状态或身份不允许提交该 MR 申请')
    if (locked.status === 'in_review') throw badRequest('请先保存修改，再通过助理会签推进流程')
    const detailValue = await loadCalculatedOrder(connection, locked)
    await resolveSubmissionCustomer(connection, detailValue, req.user)
    const errors = validateSubmission(detailValue, detailValue.items)
    if (errors.length) throw badRequest('规范检查未通过', errors)
    await ensureMrVendors(connection, detailValue.items)
    await resolveStepAssignee(connection, detailValue, 'assistant', { required: true })
    await resolveStepAssignee(connection, detailValue, 'sales', { required: true })
    const steps = computeApprovalSteps(detailValue, detailValue.items)
    const [cycleRows] = await connection.execute('SELECT COALESCE(MAX(cycle), 0) + 1 AS next_cycle FROM mr_approvals WHERE mr_id = :id', { id: req.params.id })
    const cycle = Number(cycleRows[0].next_cycle)
    for (const step of steps) {
      await connection.execute(
        `INSERT INTO mr_approvals (mr_id, cycle, seq, step_key, step_label)
         VALUES (:mrId, :cycle, :seq, :key, :label)`,
        { mrId: req.params.id, cycle, ...step },
      )
    }
    await connection.execute(
      `UPDATE mr_orders SET status = 'in_review', submitted_at = NOW(), fill_date = CURDATE(), approved_at = NULL,
       rejected_at = NULL, reject_reason = NULL, return_target = NULL, withdrawn_at = NULL, withdraw_reason = NULL,
       updated_by = :userId WHERE id = :id`,
      { id: req.params.id, userId: req.user.id },
    )
    const [submissionDates] = await connection.execute('SELECT CURDATE() AS fill_date')
    detailValue.fillDate = submissionDates[0].fill_date
    const snapshot = { ...detailValue, totals: totals(detailValue, detailValue.items), approvalSteps: steps }
    await saveSubmissionBaseline(connection, detailValue, cycle, snapshot, req.user.id)
    await activateCurrentStep(connection, detailValue, cycle, detailValue.createdBy || req.user.id)
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function decide(req, res, action) {
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  const returnTarget = ['sales', 'assistant'].includes(req.body?.target) ? req.body.target : 'sales'
  if (action === 'reject' && !reason) throw badRequest('驳回时必须填写原因')
  await ensureTables()
  let autoApprovedLabel = null
  let becameApproved = false
  const assistantIds = await assistantIdsFor(req.user)
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    const [steps] = await connection.execute(
      `SELECT * FROM mr_approvals WHERE mr_id = :id AND action IS NULL
       ORDER BY cycle DESC, seq LIMIT 1 FOR UPDATE`,
      { id: req.params.id },
    )
    const current = steps[0]
    if (!current) throw badRequest('当前没有待签核步骤')
    order.currentStepKey = current.step_key
    order.currentStepLabel = current.step_label
    order.currentAssigneeUserId = current.assignee_user_id
    if (!canApprove(order, req.user, assistantIds)) throw forbidden('当前签核步骤不属于你')
    const expectedCurrentAssignee = await resolveStepAssignee(connection, order, current.step_key, { required: true })
    // 助理主管替签：当前是助理步骤且签核人属于其管辖助理范围时放行
    const supervisorReplacing = current.step_key === 'assistant'
      && req.user.role === 'assistant_supervisor'
      && assistantIds.includes(Number(expectedCurrentAssignee.id))
    if (!supervisorReplacing && expectedCurrentAssignee.id !== Number(req.user.id)) throw forbidden('该签核待办已转交')
    if (action === 'approve' && current.step_key !== 'assistant' && Number(order.versionNo || 0) === 0) {
      const legacyDetail = await loadCalculatedOrder(connection, order)
      const legacySteps = computeApprovalSteps(legacyDetail, legacyDetail.items)
      const legacySnapshot = { ...legacyDetail, totals: totals(legacyDetail, legacyDetail.items), approvalSteps: legacySteps }
      const [legacyBaselines] = await connection.execute(
        `SELECT id FROM mr_versions WHERE mr_id = :mrId AND cycle = :cycle AND kind = 'submitted' LIMIT 1`,
        { mrId: order.id, cycle: current.cycle },
      )
      if (!legacyBaselines[0]) await saveSubmissionBaseline(connection, order, current.cycle, legacySnapshot, req.user.id)
      await freezeVersion(connection, order, current.cycle, legacySnapshot, req.user.id)
    }
    if (action === 'approve' && current.step_key === 'assistant') {
      const detailValue = await loadCalculatedOrder(connection, order)
      const errors = validateSubmission(detailValue, detailValue.items)
      if (errors.length) throw badRequest('助理补充后仍有未完成内容', errors)
      await ensureMrVendors(connection, detailValue.items)
      await resolveStepAssignee(connection, detailValue, 'sales', { required: true })
      const nextSteps = computeApprovalSteps(detailValue, detailValue.items)
      await connection.execute(
        'DELETE FROM mr_approvals WHERE mr_id = :id AND cycle = :cycle AND seq > 1',
        { id: req.params.id, cycle: current.cycle },
      )
      for (const step of nextSteps.slice(1)) {
        await connection.execute(
          `INSERT INTO mr_approvals (mr_id, cycle, seq, step_key, step_label)
           VALUES (:mrId, :cycle, :seq, :key, :label)`,
          { mrId: req.params.id, cycle: current.cycle, ...step },
        )
      }
      const snapshot = { ...detailValue, totals: totals(detailValue, detailValue.items), approvalSteps: nextSteps }
      const [baselineRows] = await connection.execute(
        `SELECT id FROM mr_versions WHERE mr_id = :mrId AND cycle = :cycle AND kind = 'submitted' LIMIT 1`,
        { mrId: order.id, cycle: current.cycle },
      )
      if (!baselineRows[0] && Number(order.versionNo || 0) === 0) {
        await saveSubmissionBaseline(connection, order, current.cycle, snapshot, req.user.id)
      }
      await freezeVersion(connection, order, current.cycle, snapshot, req.user.id)
    }
    await connection.execute(
      `UPDATE mr_approvals SET approver_id = :userId, approver_name_snapshot = :approverName,
              approver_role_snapshot = :approverRole, approver_signature_snapshot = :approverSignature,
              action = :action, reason = :reason, decided_at = NOW()
       WHERE id = :stepId`,
      {
        userId: req.user.id,
        approverName: req.user.real_name || req.user.username,
        approverRole: req.user.role,
        approverSignature: action === 'approve' ? req.user.engineer_signature || null : null,
        action,
        reason: reason || null,
        stepId: current.id,
      },
    )
    await completeTask(connection, current.id, action === 'reject' ? 'rejected' : 'approved')
    // 连签：当前签核人与下一轮签核人是同一人时，一次签完下一环节并提示
    if (action === 'approve') {
      const [nextRows] = await connection.execute(
        'SELECT * FROM mr_approvals WHERE mr_id = :id AND cycle = :cycle AND action IS NULL ORDER BY seq LIMIT 1',
        { id: req.params.id, cycle: current.cycle },
      )
      const next = nextRows[0]
      if (next) {
        let nextAssigneeId = null
        try {
          const resolved = await resolveStepAssignee(connection, order, next.step_key, { required: false })
          nextAssigneeId = resolved ? Number(resolved.id) : null
        } catch {
          nextAssigneeId = null
        }
        if (nextAssigneeId === Number(req.user.id)) {
          await connection.execute(
            `UPDATE mr_approvals SET approver_id = :userId, approver_name_snapshot = :approverName,
                    approver_role_snapshot = :approverRole, approver_signature_snapshot = :approverSignature,
                    action = 'approve', reason = NULL, decided_at = NOW()
             WHERE id = :stepId`,
            {
              userId: req.user.id,
              approverName: req.user.real_name || req.user.username,
              approverRole: req.user.role,
              approverSignature: req.user.engineer_signature || null,
              stepId: next.id,
            },
          )
          await completeTask(connection, next.id, 'approved')
          autoApprovedLabel = next.step_label || next.step_key
        }
      }
    }
    if (action === 'reject') {
      await connection.execute(
        `UPDATE mr_approvals SET action = 'skipped', reason = '前序驳回'
         WHERE mr_id = :id AND cycle = :cycle AND action IS NULL`,
        { id: req.params.id, cycle: current.cycle },
      )
      await connection.execute(
        `UPDATE mr_orders SET status = 'rejected', rejected_at = NOW(), reject_reason = :reason,
                return_target = :returnTarget, updated_by = :userId WHERE id = :id`,
        { id: req.params.id, userId: req.user.id, reason, returnTarget },
      )
      const recipient = await resolveStepAssignee(connection, order, returnTarget, { required: true })
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'reject')`,
        { mrId: req.params.id, recipientId: recipient.id },
      )
      return
    }
    const [pending] = await connection.execute(
      `SELECT id FROM mr_approvals WHERE mr_id = :id AND cycle = :cycle AND action IS NULL LIMIT 1`,
      { id: req.params.id, cycle: current.cycle },
    )
    if (!pending[0]) {
      becameApproved = true
      // 全部品项均无供应商时自动标记无需采购，不再派发采购待办
      const [vendorRows] = await connection.execute(
        'SELECT COUNT(*) AS count FROM mr_items WHERE mr_id = :id AND TRIM(COALESCE(vendor, \'\')) <> \'\'',
        { id: req.params.id },
      )
      const needsPurchase = Number(vendorRows[0]?.count || 0) > 0
      await connection.execute(
        `UPDATE mr_orders SET status = 'approved', approved_at = NOW(), archive_status = 'pending',
                archive_attempts = 0, archive_next_attempt_at = NOW(), archive_error = NULL,
                purchase_status = :purchaseStatus, purchase_assignee_user_id = NULL, purchase_assignment_error = NULL,
                purchased_at = NULL, purchased_by = NULL,
                purchase_note = :purchaseNote,
                updated_by = :userId WHERE id = :id`,
        {
          id: req.params.id,
          userId: req.user.id,
          purchaseStatus: needsPurchase ? 'pending' : 'skipped',
          purchaseNote: needsPurchase ? null : '全部品项均无供应商，系统自动标记无需采购',
        },
      )
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'approved')`,
        { mrId: req.params.id, recipientId: order.salesOwnerId },
      )
      if (needsPurchase) {
        await activatePurchaseTask(connection, {
          id: Number(req.params.id),
          customerName: order.customerName,
          salesOwnerId: Number(order.salesOwnerId) || null,
          createdBy: Number(order.createdBy) || req.user.id,
        }, req.user.id)
      }
    } else {
      await connection.execute('UPDATE mr_orders SET updated_by = :userId WHERE id = :id', { id: req.params.id, userId: req.user.id })
      await activateCurrentStep(connection, order, current.cycle, order.createdBy || req.user.id)
    }
  })
  if (becameApproved) {
    try {
      await archiveMrDocument(req.params.id, 'approved')
    } catch (error) {
      console.error('[mr] 同步归档失败，等待后台重试', error?.message || error)
    }
  }
  const detail = await loadDetail(req.params.id, req.user)
  res.json(autoApprovedLabel ? { ...detail, autoApprovedStep: autoApprovedLabel } : detail)
}

async function approve(req, res) {
  await decide(req, res, 'approve')
}

async function reject(req, res) {
  await decide(req, res, 'reject')
}

async function reassignSalesOwner(req, res) {
  if (req.user.role !== 'admin') throw forbidden('仅管理员可以正式变更业务负责人')
  const salesOwnerId = Number(req.body?.salesOwnerId)
  if (!Number.isInteger(salesOwnerId) || salesOwnerId <= 0) throw badRequest('请选择新的业务负责人')
  await ensureTables()
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (Number(order.salesOwnerId) === salesOwnerId) throw badRequest('业务负责人未发生变化')
    if (['approved', 'voided'].includes(order.status)) throw badRequest('已通过或已作废的 MR 申请不允许变更业务负责人')
    const mapping = await salesWithAssistant(connection, salesOwnerId)
    const nextOrder = { ...order, salesOwnerId }
    await resolveStepAssignee(connection, nextOrder, 'sales', { required: true })
    let assistant = null
    try { assistant = assertAssistantMapping(mapping) } catch (_error) { /* 新业务可在“我的设置”补配助理 */ }
    if (order.status === 'in_review') {
      const [pending] = await connection.execute(
        `SELECT id, cycle FROM mr_approvals WHERE mr_id = :id AND action IS NULL
         ORDER BY cycle DESC, seq LIMIT 1 FOR UPDATE`,
        { id: req.params.id },
      )
      if (pending[0]) {
        await completeTask(connection, pending[0].id, 'reassigned')
        await connection.execute(
          `UPDATE mr_approvals SET action = 'skipped', reason = '业务负责人变更'
           WHERE mr_id = :id AND cycle = :cycle AND action IS NULL`,
          { id: req.params.id, cycle: pending[0].cycle },
        )
      }
    }
    const restart = ['in_review', 'rejected'].includes(order.status)
    await connection.execute(
      `UPDATE mr_orders SET sales_owner_id = :salesOwnerId,
              status = CASE WHEN :restart = 1 THEN 'rejected' ELSE status END,
              return_target = CASE WHEN :restart = 1 THEN 'assistant' ELSE return_target END,
              rejected_at = CASE WHEN :restart = 1 THEN NOW() ELSE rejected_at END,
              reject_reason = CASE WHEN :restart = 1 THEN '业务负责人已变更，请新对应助理核对后重新提交' ELSE reject_reason END,
              updated_by = :userId WHERE id = :id`,
      { id: req.params.id, salesOwnerId, restart: restart ? 1 : 0, userId: req.user.id },
    )
    if (restart) {
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'owner_transfer')`,
        { mrId: req.params.id, recipientId: salesOwnerId },
      )
      if (assistant) {
        await connection.execute(
          `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
           VALUES (:mrId, :recipientId, 'owner_transfer')`,
          { mrId: req.params.id, recipientId: assistant.id },
        )
      }
    }
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function withdraw(req, res) {
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  if (!reason) throw badRequest('撤回时必须填写原因')
  await ensureTables()
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (!canWithdraw(order, req.user)) {
      throw forbidden('仅业务负责人可以撤回签核中的 MR 申请')
    }
    const [pending] = await connection.execute(
      `SELECT id, cycle, assignee_user_id FROM mr_approvals
       WHERE mr_id = :id AND action IS NULL ORDER BY cycle DESC, seq LIMIT 1 FOR UPDATE`,
      { id: req.params.id },
    )
    if (!pending[0]) throw badRequest('当前没有可撤回的签核任务')
    await completeTask(connection, pending[0].id, 'withdrawn')
    await connection.execute(
      `UPDATE mr_approvals SET action = 'skipped', reason = '业务负责人撤回'
       WHERE mr_id = :id AND cycle = :cycle AND action IS NULL`,
      { id: req.params.id, cycle: pending[0].cycle },
    )
    await connection.execute(
      `UPDATE mr_orders SET status = 'draft', withdrawn_at = NOW(), withdraw_reason = :reason,
              rejected_at = NULL, reject_reason = NULL, return_target = NULL, updated_by = :userId
       WHERE id = :id`,
      { id: req.params.id, userId: req.user.id, reason },
    )
    if (pending[0].assignee_user_id) {
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'withdraw')`,
        { mrId: req.params.id, recipientId: pending[0].assignee_user_id },
      )
    }
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function voidOrder(req, res) {
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  if (!reason) throw badRequest('作废时必须填写原因')
  await ensureTables()
  const assistantIds = await assistantIdsFor(req.user)
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (!canVoid(order, req.user, assistantIds)) throw forbidden('当前状态或身份不允许作废该 MR 申请')
    await connection.execute(
      `UPDATE mr_orders SET status = 'voided', voided_at = NOW(), void_reason = :reason,
              archive_status = 'pending', archive_attempts = 0, archive_next_attempt_at = NOW(), archive_error = NULL,
              updated_by = :userId WHERE id = :id`,
      { id: req.params.id, userId: req.user.id, reason },
    )
    await connection.execute(
      `UPDATE mr_notification_outbox SET status = 'cancelled', last_error = 'MR 已作废'
       WHERE mr_id = :mrId AND event = 'approved' AND status IN ('pending', 'failed')`,
      { mrId: req.params.id },
    )
    await connection.execute(
      `UPDATE mr_purchase_tasks SET status = 'cancelled', completed_at = NOW()
       WHERE mr_id = :mrId AND status = 'pending'`,
      { mrId: req.params.id },
    )
    await connection.execute(
      `UPDATE mr_notification_outbox SET status = 'cancelled', last_error = 'MR 已作废'
       WHERE mr_id = :mrId AND event IN ('purchase_task', 'purchase_transfer') AND status IN ('pending', 'failed')`,
      { mrId: req.params.id },
    )
    await connection.execute(
      `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
       VALUES (:mrId, :recipientId, 'void')`,
      { mrId: req.params.id, recipientId: order.salesOwnerId },
    )
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function submitPurchase(req, res) {
  await ensureTables()
  const note = String(req.body?.note || '').trim().slice(0, 500) || null
  const rows = Array.isArray(req.body?.items) ? req.body.items : []
  let auditChanges = []
  let wasDone = false
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (order.status !== 'approved') throw badRequest('仅已通过的 MR 可以填写采购订单号')
    if (!['pending', 'done'].includes(String(order.purchaseStatus || ''))) throw badRequest('当前 MR 不在采购订单填写环节')
    if (!canPurchase(order, req.user)) throw forbidden('当前采购填写任务不属于你')
    wasDone = String(order.purchaseStatus || '') === 'done'
    const [itemRows] = await connection.execute('SELECT id, row_no, name, vendor, purchase_order_no FROM mr_items WHERE mr_id = :mrId ORDER BY row_no, id', { mrId: order.id })
    const byId = new Map(rows.map((entry) => [Number(entry?.id), String(entry?.purchaseOrderNo || '').trim().slice(0, 255)]))
    const updates = []
    for (const item of itemRows) {
      const value = byId.get(Number(item.id))
      if (value === undefined) throw badRequest('请完整提交所有品项的采购订单号')
      const hasVendor = String(item.vendor || '').trim() !== ''
      // 无供应商的品项没有采购对象，视为无需采购，不强制填写采购订单号
      if (hasVendor && !value) throw badRequest('有供应商的品项都需填写采购订单号；无供应商的品项视为无需采购')
      if (!hasVendor && !value) continue
      updates.push([value, Number(item.id)])
      const before = String(item.purchase_order_no || '')
      if (before !== value) auditChanges.push({ rowNo: item.row_no, name: item.name, before: before || null, after: value })
    }
    for (const [value, itemId] of updates) {
      await connection.execute('UPDATE mr_items SET purchase_order_no = :value WHERE id = :itemId AND mr_id = :mrId', { value, itemId, mrId: order.id })
    }
    await connection.execute(
      `UPDATE mr_orders SET purchase_status = 'done', purchased_at = NOW(), purchased_by = :userId,
              purchase_note = :note, updated_by = :userId WHERE id = :mrId`,
      { mrId: order.id, userId: req.user.id, note },
    )
    await connection.execute(
      `UPDATE mr_purchase_tasks SET status = 'done', completed_at = NOW(), completed_by = :userId
       WHERE mr_id = :mrId AND status = 'pending'`,
      { mrId: order.id, userId: req.user.id },
    )
    if (order.salesOwnerId) {
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'purchase_done')`,
        { mrId: order.id, recipientId: order.salesOwnerId },
      )
    }
    // 审计留痕：首次提交记 purchase_submit，完成后再次修改记 purchase_update（含旧值→新值）
    await connection.execute(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:actorId, 'mr', :targetId, :action, :detailJson)`,
      {
        actorId: req.user.id,
        targetId: order.id,
        action: wasDone ? 'purchase_update' : 'purchase_submit',
        detailJson: JSON.stringify({
          customerName: order.customerName,
          ctrlNo: order.ctrlNo,
          note,
          changes: auditChanges,
        }),
      },
    )
    // 触发重新归档：归档 PDF 取审批冻结快照 + 实时采购订单号
    await connection.execute(
      `UPDATE mr_orders SET archive_status = 'pending', archive_attempts = 0, archive_next_attempt_at = NOW(), archive_error = NULL
       WHERE id = :mrId`,
      { mrId: order.id },
    )
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function remove(req, res) {
  await ensureTables()
  const assistantIds = await assistantIdsFor(req.user)
  let files = []
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (!canDelete(order, req.user, assistantIds)) throw forbidden('只能删除本人创建的草稿或被驳回单据')
    const [rows] = await connection.execute(
      `SELECT storage_path FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId FOR UPDATE`,
      { ownerId: req.params.id },
    )
    files = rows
    await connection.execute("DELETE FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId", { ownerId: req.params.id })
    await connection.execute("DELETE FROM approval_tasks WHERE business_type = 'mr' AND business_id = :id", { id: req.params.id })
    await connection.execute('DELETE FROM mr_orders WHERE id = :id', { id: req.params.id })
  })
  await Promise.allSettled(files.map((file) => fs.promises.rm(file.storage_path, { force: true })))
  res.status(204).end()
}

const quotationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 30 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase()
    if (!['.xls', '.xlsx', '.pdf'].includes(extension)) return callback(badRequest('请上传 Excel 或 PDF 报价/订单文件（.xls、.xlsx、.pdf）'))
    callback(null, true)
  }
}).fields([{ name: 'files', maxCount: 30 }, { name: 'file', maxCount: 1 }])

function originalNameUtf8(file) {
  return Buffer.from(file?.originalname || '', 'latin1').toString('utf8') || 'quotation.xlsx'
}

function uploadedFiles(req) {
  return Object.values(req.files || {}).flat()
}
async function persistQuotationFiles(ownerId, uploads, user, cleanupExisting, roles = []) {
  const written = []
  let oldFiles = []
  try {
    for (const [index, file] of uploads.entries()) {
      const name = originalNameUtf8(file)
      const extension = path.extname(name).toLowerCase()
      const storagePath = path.join(quotationRoot, `${ownerId}-${Date.now()}-${index}-${Math.round(Math.random() * 1e9)}${extension}`)
      await fs.promises.writeFile(storagePath, file.buffer)
      const quoteRole = ['sales', 'purchase'].includes(roles[index]) ? `quote_${roles[index]}` : null
      written.push({ name, storagePath, mimeType: file.mimetype || 'application/octet-stream', size: file.size, quoteRole })
    }
    await transaction(async (connection) => {
      const locked = await loadLockedOrder(connection, ownerId)
      if (!canEdit(locked, user, await assistantIdsFor(user))) throw forbidden('当前状态或身份不允许保存报价原始附件')
      if (cleanupExisting) {
        ;[oldFiles] = await connection.execute(
          `SELECT storage_path FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId FOR UPDATE`,
          { ownerId },
        )
        await connection.execute("DELETE FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId", { ownerId })
        await connection.execute('UPDATE mr_orders SET quotation_file_id = NULL WHERE id = :ownerId', { ownerId })
      }
      let primaryFileId = null
      for (const file of written) {
        const [result] = await connection.execute(
          `INSERT INTO files (owner_type, owner_id, original_name, storage_path, mime_type, size, uploaded_by, quote_role)
           VALUES ('mr_order', :ownerId, :name, :storagePath, :mimeType, :size, :userId, :quoteRole)`,
          { ownerId, userId: user.id, ...file },
        )
        if (!primaryFileId) primaryFileId = result.insertId
      }
      await connection.execute(
        'UPDATE mr_orders SET quotation_file_id = :fileId WHERE id = :ownerId AND quotation_file_id IS NULL',
        { ownerId, fileId: primaryFileId },
      )
    })
  } catch (error) {
    await Promise.allSettled(written.map((file) => fs.promises.rm(file.storagePath, { force: true })))
    throw error
  }
  await Promise.allSettled(oldFiles.map((file) => fs.promises.rm(file.storage_path, { force: true })))
  return query(
    `SELECT id, original_name AS name, size, created_at AS createdAt, quote_role AS quoteRole
     FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId ORDER BY id`,
    { ownerId },
  )
}

/** 文件名提取稳定模式 token：去掉日期/大数字/扩展名，用于规则匹配与统计。 */
function extractFilePattern(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '')
  const cleaned = base
    .replace(/20\d{2}[-./年]?\d{0,2}[-./月]?\d{0,2}日?/g, ' ')
    .replace(/\d{3,}/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 64) || null
}

/**
 * 布局规则自学习：从纠错样本统计“文件名模式 + 修正后供应商”的出现频次，
 * 达到阈值（默认 3 次）自动生成候选规则（source=auto，enabled=0 待管理员确认启用）。
 */
async function learnLayoutRulesFromFeedback() {
  const rows = await query(
    'SELECT file_name, diff FROM mr_recognition_feedback ORDER BY created_at',
  )
  const stats = new Map()
  for (const row of rows) {
    const pattern = extractFilePattern(row.file_name)
    if (!pattern) continue
    let diff = null
    try { diff = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff } catch { diff = null }
    const entries = Array.isArray(diff) ? diff : []
    for (const entry of entries) {
      if (entry?.field !== 'vendor' || !entry.after) continue
      const vendor = String(entry.after).trim().slice(0, 128)
      if (!vendor) continue
      const key = `${pattern}|${vendor}`
      if (!stats.has(key)) stats.set(key, { pattern, vendor, count: 0 })
      stats.get(key).count += 1
    }
  }
  for (const { pattern, vendor, count } of stats.values()) {
    if (count < 3) continue
    await query(
      `INSERT INTO mr_layout_rules (rule_key, file_pattern, vendor, match_count, source, enabled)
       VALUES (:ruleKey, :pattern, :vendor, :count, 'auto', 1)
       ON DUPLICATE KEY UPDATE match_count = :count, updated_at = NOW()`,
      { ruleKey: `auto:${pattern}|${vendor}`.slice(0, 128), pattern, vendor, count },
    )
  }
}

/** 对比自动识别品项与人工修正品项的差异（纠错样本用）。识别流水线内部品项为 snake_case。 */
function diffItems(originalItems = [], correctedItems = []) {
  const COMPARE_FIELDS = ['company_part_no', 'part_no', 'name', 'description', 'qty', 'unit_price', 'vendor', 'cost_incl_tax', 'tax_rate']
  const diff = []
  const max = Math.max(originalItems.length, correctedItems.length)
  for (let index = 0; index < max; index += 1) {
    const before = originalItems[index] || {}
    const after = correctedItems[index] || {}
    for (const field of COMPARE_FIELDS) {
      const beforeValue = before[field] ?? null
      const afterValue = after[field] ?? null
      if (String(beforeValue ?? '') !== String(afterValue ?? '')) {
        diff.push({ rowNo: index + 1, field, before: beforeValue, after: afterValue })
      }
    }
  }
  return diff
}

/**
 * 学习回写（确认导入时触发）：把用户修正后的品项按来源文件分组回写识别缓存，
 * 使同一文件下次导入直接应用修正结果；同时将“自动识别 vs 人工修正”差异落纠错样本库。
 */
async function recordRecognitionFeedback(mrId, { body = {}, uploads = [], storedUploads = [], user }) {
  let correctedItems = []
  try {
    correctedItems = JSON.parse(String(body?.correctedItems || '[]'))
    if (!Array.isArray(correctedItems)) correctedItems = []
  } catch (_error) {
    correctedItems = []
  }
  if (!correctedItems.length) return { applied: 0, feedback: 0 }

  let sourceHashes = {}
  try {
    sourceHashes = JSON.parse(String(body?.sourceHashes || '{}'))
    if (!sourceHashes || typeof sourceHashes !== 'object' || Array.isArray(sourceHashes)) sourceHashes = {}
  } catch (_error) {
    sourceHashes = {}
  }

  // 文件 → 内容 hash：优先用识别时返回的 hash；新上传/留存文件缺失时重算
  const hashByName = { ...sourceHashes }
  for (const file of uploads) {
    const name = originalNameUtf8(file)
    if (!hashByName[name]) hashByName[name] = crypto.createHash('sha256').update(file.buffer).digest('hex')
  }
  for (const stored of storedUploads) {
    const name = String(stored?.name || '')
    if (name && !hashByName[name]) {
      try {
        const buffer = await fs.promises.readFile(stored.storagePath)
        hashByName[name] = crypto.createHash('sha256').update(buffer).digest('hex')
      } catch (_error) { /* 磁盘缺失跳过 */ }
    }
  }

  // 按来源文件名分组修正品项，并标记文件角色：costSource 命中为供应商报价，salesSource 命中为销售报价
  const byFile = new Map()
  for (const item of correctedItems) {
    const costName = String(item?.costSource || '')
    const salesName = String(item?.salesSource || '')
    if (costName && hashByName[costName]) {
      if (!byFile.has(costName)) byFile.set(costName, { role: 'purchase', items: [] })
      byFile.get(costName).items.push(item)
    }
    if (salesName && hashByName[salesName] && salesName !== costName) {
      if (!byFile.has(salesName)) byFile.set(salesName, { role: 'sales', items: [] })
      byFile.get(salesName).items.push(item)
    }
  }

  let applied = 0
  let feedback = 0
  for (const [fileName, { role, items }] of byFile) {
    const fileHash = hashByName[fileName]
    const normalized = items
      .map((item) => ({
        rowNo: Number(item?.rowNo) || 0,
        // 识别流水线内部品项为 snake_case，回写时保持同构以被 merge 正确处理
        company_part_no: String(item?.companyPartNo || item?.company_part_no || '').trim().slice(0, 100) || null,
        part_no: String(item?.oemSpec || item?.partNo || item?.part_no || '').trim().slice(0, 255) || null,
        name: String(item?.name || '').trim().slice(0, 255) || null,
        description: String(item?.description || '').trim().slice(0, 4000) || null,
        warranty_service: String(item?.warrantyService || '').trim().slice(0, 255) || null,
        qty: Number.isFinite(Number(item?.qty)) ? Number(item.qty) : null,
        unit_price: Number.isFinite(Number(item?.unitPrice)) ? Number(item.unitPrice) : null,
        // 小计：前端修正品项通常不带 extended，缺省时用 qty × unit_price 补齐（校验依赖）
        extended: Number.isFinite(Number(item?.extended)) ? Number(item.extended)
          : Number.isFinite(Number(item?.qty)) && Number.isFinite(Number(item?.unitPrice))
            ? Math.round(Number(item.qty) * Number(item.unitPrice) * 100) / 100
            : null,
        vendor: String(item?.vendor || '').trim().slice(0, 255) || null,
        cost_incl_tax: Number.isFinite(Number(item?.costInclTax)) ? Number(item.costInclTax) : null,
        tax_rate: Number.isFinite(Number(item?.taxRate)) ? Number(item.taxRate) : null,
      }))
      .filter((item) => item.name || item.part_no || item.company_part_no || item.description)
    if (!normalized.length) continue

    const corrected = { sheets: [{ items: normalized }], source: 'user_corrected' }
    await query(
      `INSERT INTO mr_quote_recognition_cache
         (file_hash, parser_version, file_name, result, corrected_result, corrected_by, corrected_at, correction_count)
       VALUES (:hash, :version, :name, :result, :corrected, :userId, NOW(), 1)
       ON DUPLICATE KEY UPDATE
         corrected_result = :corrected, corrected_by = :userId, corrected_at = NOW(), correction_count = correction_count + 1`,
      { hash: fileHash, version: RECOGNITION_PARSER_VERSION, name: fileName, result: JSON.stringify({}), corrected: JSON.stringify(corrected), userId: user?.id || null },
    )
    applied += 1

    // 纠错样本：对比自动识别结果与修正结果，有差异才落库
    const cached = await readRecognitionCache(fileHash)
    const originalItems = cached?.result?.parsed?.sheets?.[0]?.items || []
    if (!originalItems.length) continue
    const diff = diffItems(originalItems, normalized)
    if (!diff.length) continue
    await query(
      `INSERT INTO mr_recognition_feedback
         (mr_id, file_hash, parser_version, file_name, role, original_result, corrected_result, diff, created_by)
       VALUES (:mrId, :hash, :version, :name, :role, :original, :corrected, :diff, :userId)`,
      {
        mrId,
        hash: fileHash,
        version: RECOGNITION_PARSER_VERSION,
        name: fileName,
        role,
        original: JSON.stringify(cached.result),
        corrected: JSON.stringify(corrected),
        diff: JSON.stringify(diff),
        userId: user?.id || null,
      },
    )
    feedback += 1
  }
  // 布局规则自学习：根据本次纠错样本实时沉淀候选规则（量小，同步执行）
  try {
    await learnLayoutRulesFromFeedback()
  } catch (error) {
    console.warn('[mr] 布局规则自学习失败：', error?.message || error)
  }
  return { applied, feedback }
}

/** 读取已留存的报价原始附件，作为“再次导入一并识别”的来源文件；磁盘缺失的跳过。 */
async function loadStoredQuotationUploads(ownerId) {
  const rows = await query(
    `SELECT original_name AS name, storage_path AS storagePath, quote_role AS quoteRole
     FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId ORDER BY id`,
    { ownerId },
  )
  const uploads = []
  for (const row of rows) {
    try {
      const buffer = await fs.promises.readFile(row.storagePath)
      uploads.push({
        // originalname 按 multer 的 latin1 错位编码存储，供 originalNameUtf8 还原为 UTF-8
        originalname: Buffer.from(String(row.name || ''), 'utf8').toString('latin1'),
        buffer,
        mimetype: '',
        size: buffer.length,
        stored: true,
        storedRole: row.quoteRole === 'quote_sales' ? 'sales' : row.quoteRole === 'quote_purchase' ? 'purchase' : null,
      })
    } catch (_error) {
      // 留存文件磁盘缺失时跳过，不阻断新文件识别
    }
  }
  return uploads
}

async function importQuotation(req, res) {
  const newUploads = uploadedFiles(req)
  const includeStored = String(req.body?.includeStored || '') === '1'
  await ensureTables()
  const order = await loadRawOrder(req.params.id)
  const assistantIds = await assistantIdsFor(req.user)
  if (!canEdit(order, req.user, assistantIds)) throw forbidden('当前状态或身份不允许导入报价单')
  const storedUploads = includeStored ? await loadStoredQuotationUploads(req.params.id) : []
  const uploads = [...storedUploads, ...newUploads]
  if (!uploads.length) throw badRequest('请选择报价单或订单文件')

  const taskId = String(req.body?.taskId || '').trim()
  // 分阶段进度：stagePercent 为服务端真实锚点，前端在锚点间平滑补间
  const progress = { done: 0, total: uploads.length, current: '', stage: 'preparing', stagePercent: 3, itemCount: 0 }
  const setStage = (stage, stagePercent) => {
    progress.stage = stage
    // 锚点只升不降：多文件逐份解析时不会回到较低锚点，避免前端进度条回跳
    progress.stagePercent = Math.max(Number(progress.stagePercent || 0), stagePercent)
  }
  if (taskId) importProgress.set(taskId, progress)
  const clearProgress = () => { if (taskId) setTimeout(() => importProgress.delete(taskId), 60000) }
  let requestedRoles = []
  try {
    requestedRoles = JSON.parse(String(req.body?.sourceRoles || '[]'))
    if (!Array.isArray(requestedRoles)) requestedRoles = []
  } catch (_error) {
    requestedRoles = []
  }
  // 留存文件的角色来自入库时的 quote_role，新上传文件的角色来自本次请求的 sourceRoles
  const effectiveRoles = [...storedUploads.map((file) => file.storedRole), ...requestedRoles]
  const uploadHashes = uploads.map((file) => crypto.createHash('sha256').update(file.buffer).digest('hex'))
  const persist = String(req.body?.persist || '') === '1'
  const persistOnly = String(req.body?.persistOnly || '') === '1'
  if (persist && persistOnly) {
    // 确认导入：识别结果已在预览中，仅留存新上传的原始附件（留存文件本来就在库里），不重复识别
    const files = await persistQuotationFiles(req.params.id, newUploads, req.user, false, requestedRoles)
    // 学习回写：把用户修正后的品项写入识别缓存（同文件下次导入自动应用），并落纠错样本
    const corrections = await recordRecognitionFeedback(req.params.id, { body: req.body, uploads: newUploads, storedUploads, user: req.user })
    return res.json({ files, corrections })
  }
  const processSource = async (file, index) => {
    const name = originalNameUtf8(file)
    progress.current = name
    setStage('parsing', 8)
    const extension = path.extname(name).toLowerCase()
    const requestedRole = ['sales', 'purchase'].includes(effectiveRoles[index]) ? effectiveRoles[index] : null
    const requestedDocumentType = requestedRole === 'sales' ? 'sales_quote' : requestedRole === 'purchase' ? 'purchase_quote' : 'unknown'
    let parsed = null
    try {
    const fileHash = uploadHashes[index]
    let recognitionMethod = extension === '.pdf' ? 'pdf_text' : 'excel_cells'
    parsed = null
    let systemItemCount = 0
    let aiItemCount = 0
    let aiDocumentType = null
    const cached = await readRecognitionCache(fileHash)
    if (cached?.result?.parsed?.sheets) {
      // 缓存 payload 结构为 { parsed, recognitionMethod, systemItemCount, aiItemCount, aiDocumentType }
      parsed = cached.result.parsed
      recognitionMethod = cached.result.recognitionMethod || recognitionMethod
      systemItemCount = cached.result.systemItemCount || 0
      aiItemCount = cached.result.aiItemCount || 0
      aiDocumentType = cached.result.aiDocumentType || null
      parsed = { ...parsed, warnings: [...(parsed.warnings || []), '已复用该文件的历史识别结果（文件内容一致）'] }
      setStage('cache', 8)
      progress.stage = 'cache'
    } else {
      parsed = extension === '.pdf'
        ? await parsePdf(file.buffer, name)
        : parseWorkbookWithMetadata(file.buffer, name)
      recognitionMethod = parsed.recognitionMethod || recognitionMethod
      systemItemCount = (parsed.sheets || []).reduce((sum, sheet) => sum + (sheet.items || []).length, 0)
      const preferAi = extension === '.pdf' || systemItemCount === 0
      if (env.ai.quoteRecognitionEnabled && preferAi) {
        try {
          const aiResult = await recognizeQuotationWithAi(file.buffer, extension, name, { onStage: (stage) => {
            // AI 识别阶段（rendering/ai）锚点 35%，前端在此平滑爬升
            setStage(stage === 'rendering' ? 'rendering' : 'ai', 35)
          } })
          if (aiResult?.sheets?.length && aiResult.sheets[0].items.length) {
            aiItemCount = aiResult.sheets[0].items.length
            aiDocumentType = aiResult.documentType
            recognitionMethod = aiResult.recognitionMethod
            const modeLabel = aiResult.recognitionMethod === 'ai_vision' ? 'AI 视觉' : 'AI 文本'
            parsed = {
              ...parsed,
              ...aiResult,
              warnings: [...(parsed.warnings || []), `已通过${modeLabel}识别，请在预览中核对品项`],
            }
          } else {
            parsed = { ...parsed, warnings: [...(parsed.warnings || []), 'AI 识别未返回有效品项，已保留系统识别结果'] }
          }
        } catch (error) {
          parsed = { ...parsed, warnings: [...(parsed.warnings || []), `AI 识别失败（${error.message}），已保留系统识别结果`] }
        }
      }
      if (parsed.documentType === 'scanned_pdf' && !aiItemCount) {
        setStage('ocr', 20)
        try {
          const ocr = await recognizePdf(file.buffer, name)
          if (ocr?.text) {
            recognitionMethod = 'ocr_layout'
            const recognized = parsePdfText(ocr.text, ocr.layout)
            parsed = { ...recognized, warnings: [...(parsed.warnings || []), ...(recognized.warnings || []), `已通过 Linux OCR 识别 ${ocr.pages || 1} 页，请在预览中核对结果`] }
          }
        } catch (_error) {
          parsed = { ...parsed, warnings: [...(parsed.warnings || []), 'Linux OCR 暂时不可用，本次只保留内存中的识别结果，请人工确认'] }
        }
      }
      await writeRecognitionCache(fileHash, name, { parsed, recognitionMethod, systemItemCount, aiItemCount, aiDocumentType })
    }
      // 人工修正回写：同一文件存在用户修正结果时，用修正品项替换自动识别品项（保留 sheet 级元数据）
      if (cached?.corrected?.sheets?.length && Array.isArray(parsed.sheets)) {
        parsed = {
          ...parsed,
          sheets: parsed.sheets.map((sheet, sheetIndex) => {
            const correctedItems = cached.corrected.sheets[sheetIndex]?.items
            return correctedItems && correctedItems.length
              ? { ...sheet, items: correctedItems }
              : sheet
          }),
          warnings: [...(parsed.warnings || []), `已应用上次人工修正结果（历史修正 ${cached.correctionCount || 0} 次）`],
        }
      }
      // 分区冲突提示与请求角色相关，不随缓存复用，每次按本次分区重新判断
      if (requestedRole && aiDocumentType && aiDocumentType !== requestedDocumentType) {
        parsed.warnings.push(`AI 识别该文件为“${aiDocumentType === 'sales_quote' ? '销售报价' : '供应商报价'}”，与所选分区（${requestedRole === 'sales' ? '销售报价' : '供应商报价'}）不一致，请确认分区是否正确`)
      }
      const hasExternalVendor = parsed.sheets.some((sheet) => sheet.vendor && !/(敦阳|敦陽|stark|dunyang)/i.test(String(sheet.vendor)))
      if (requestedRole === 'purchase' && !hasExternalVendor && ['.xls', '.xlsx'].includes(extension)) {
        try {
          const images = await extractWorkbookImages(file.buffer, extension)
          const imageTexts = []
          const candidates = []
          for (const [imageIndex, image] of images.slice(0, 3).entries()) {
            const ocr = await recognizePdf(image.buffer, `${name}-image-${imageIndex + 1}.${image.extension}`)
            if (!ocr?.text) continue
            imageTexts.push(ocr.text)
            candidates.push(...companyCandidates(ocr.text))
          }
          if (images.length) {
            const vendor = candidates[0] || ''
            parsed = {
              ...parsed,
              sheets: parsed.sheets.map((sheet) => ({ ...sheet, vendor: sheet.vendor && !/(敦阳|敦陽|stark|dunyang)/i.test(String(sheet.vendor)) ? sheet.vendor : vendor, notes: [...(Array.isArray(sheet.notes) ? sheet.notes : sheet.notes ? [sheet.notes] : []), ...imageTexts] })),
              warnings: [...(parsed.warnings || []), vendor ? `已从工作簿图片识别供应商：${vendor}` : '工作簿包含图片，但未能可靠识别供应商，请人工填写'],
            }
          }
        } catch (_error) {
          parsed = { ...parsed, warnings: [...(parsed.warnings || []), '工作簿图片识别失败，供应商请人工核对'] }
        }
      }
      if (aiItemCount && systemItemCount > 0 && aiItemCount !== systemItemCount) {
        parsed.warnings.push(`AI 识别 ${aiItemCount} 项与系统识别 ${systemItemCount} 项不一致，请仔细核对`)
      }
      parsed = await applyQuotationLayoutRule(parsed, name, requestedRole)
      parsed = validateParsedQuotation(parsed, recognitionMethod)
      const sheets = (parsed.sheets || []).map((sheet) => ({ ...sheet, total: sheet.total ?? sheetTotal(sheet) }))
      const warnings = [...(parsed.warnings || [])]
      if (!sheets.length) warnings.push(`${name} 未找到可识别的报价明细表；已保留其他来源的识别结果`)
      const documentType = requestedRole ? requestedDocumentType : parsed.documentType
      return { name, sheets, documentType, requestedRole, warnings, reviewCount: parsed.reviewCount || 0, hash: fileHash }
    } catch (error) {
      return {
        name,
        sheets: [],
        documentType: requestedDocumentType,
        requestedRole,
        warnings: [`${name} 解析失败：${error.message}；已保留其他来源的识别结果`],
        reviewCount: 0,
      }
    } finally {
      progress.done += 1
      progress.current = name
      // 整理完成锚点：按已识别品项条数上报真实数据
      const sheetItems = (parsed?.sheets || []).reduce((sum, sheet) => sum + (sheet.items || []).length, 0)
      if (sheetItems > 0) progress.itemCount = Number(progress.itemCount || 0) + sheetItems
      setStage('ready', 28)
    }
  }
  try {
  const sources = await Promise.all(uploads.map((file, index) => processSource(file, index)))
  progress.stage = 'normalizing'
  progress.stagePercent = 92
  // 跨文件实体归一化按“文件集合”缓存：同一批文件重复导入直接复用，只有新增文件才重跑 AI
  // key 直接取命名空间输入的 sha256，保证 64 字符不超过 file_hash CHAR(64)
  const setHash = crypto.createHash('sha256').update(`entity-set:${uploadHashes.join(':')}`).digest('hex')
  const cachedEntity = await readRecognitionCache(setHash)
  if (cachedEntity?.result?.entityMap) {
    for (const entry of cachedEntity.result.entityMap) {
      const item = sources[Number(entry.sourceIndex)]?.sheets?.[0]?.items?.[Number(entry.itemIndex)]
      if (item && entry.entityKey) item.entityKey = entry.entityKey
    }
  } else {
    try {
      await applyAiEntityKeys(sources)
      const entityMap = []
      sources.forEach((source, sourceIndex) => {
        ;(source.sheets?.[0]?.items || []).forEach((item, itemIndex) => {
          if (item.entityKey) entityMap.push({ sourceIndex, itemIndex, entityKey: item.entityKey })
        })
      })
      if (entityMap.length) await writeRecognitionCache(setHash, '跨文件实体归一化', { entityMap })
    } catch (error) {
      // 实体归一化失败不影响识别结果，保持各文件原始 entityKey
      console.warn('[mr] 跨文件实体归一化失败：', error?.message || error)
    }
  }
  progress.stage = 'merging'
  progress.stagePercent = 95

  const vendors = await query(
    `SELECT name, official_website AS officialWebsite
     FROM maintenance_parties WHERE party_type = 'original_manufacturer' ORDER BY name`,
  )
  const merged = mergeQuotations(sources, vendors)
  const sourceIndex = merged.salesSourceIndex
  const primarySheet = sourceIndex >= 0 ? sources[sourceIndex]?.sheets[0] : null
  const customerName = String(primarySheet?.customer || '').replace(/^客户名称[：:]?\s*/i, '').trim()
  const matchedCustomer = customerName ? (await query(
    'SELECT id, code, name FROM customers WHERE name = :customer OR code = :customer LIMIT 1',
    { customer: customerName },
  ))[0] : null
  const matchedContacts = matchedCustomer ? await query(
    'SELECT id, customer_id, name, phone, email FROM customer_contacts WHERE customer_id = :customerId ORDER BY use_count DESC, last_used_at DESC, id DESC',
    { customerId: matchedCustomer.id },
  ) : []
  const payload = {
    ...merged,
    metadata: primarySheet ? {
      customer: primarySheet?.customer,
      attn: primarySheet?.attn,
      payment: primarySheet?.payment,
      delivery: primarySheet?.delivery,
      taxRate: primarySheet?.tax_rate ?? null,
      customerPo: primarySheet?.po_no || '',
      latestDeliveryDate: primarySheet?.latest_delivery_date || '',
      deliveryLocation: primarySheet?.delivery || '',
      matchedCustomer: matchedCustomer ? { ...camelizeRow(matchedCustomer), contacts: matchedContacts.map(camelizeRow) } : null,
    } : {},
  }
  // 透传每份来源文件的识别 hash：确认导入时前端据此回写人工修正学习数据
  const sourceHashByName = new Map(uploads.map((file, index) => [originalNameUtf8(file), uploadHashes[index]]))
  payload.sources = (merged.sources || []).map((source) => ({ ...source, hash: sourceHashByName.get(String(source.name)) || null }))
  if (uploads.length === 1) payload.warnings.unshift('只识别到一份来源文件，请确认销售报价或供应商报价角色')
  const cleanupStoredFiles = String(req.body?.cleanupStoredFiles || '') === '1'
  const files = persist ? await persistQuotationFiles(req.params.id, newUploads, req.user, cleanupStoredFiles, requestedRoles) : []
  res.json({ files, ...payload })
  } finally {
    clearProgress()
  }
}

/** 供应商候选：MR 历史品项供应商 + 供应商目录（原厂），供导入/编辑页下拉联动。 */
async function vendorSuggestions(_req, res) {
  await ensureTables()
  const mrVendors = await query(
    `SELECT vendor AS name, COUNT(*) AS usageCount
     FROM mr_items
     WHERE vendor IS NOT NULL AND vendor != ''
     GROUP BY vendor
     ORDER BY usageCount DESC, vendor
     LIMIT 300`,
  )
  const seen = new Set(mrVendors.map((row) => row.name))
  const parties = await query(
    `SELECT id, name FROM maintenance_parties WHERE party_type = 'original_manufacturer' ORDER BY name`,
  )
  const items = [
    ...mrVendors.map((row) => ({ id: `mr-${row.name}`, name: row.name })),
    ...parties.filter((party) => !seen.has(party.name)).map((party) => ({ id: party.id, name: party.name })),
  ]
  res.json({ items })
}

/** 报价导入进度查询（配合前端“第 x/N 份”提示）。 */
async function importProgressHandler(req, res) {
  const taskId = String(req.query.taskId || '').trim()
  if (!taskId) throw badRequest('缺少 taskId')
  const progress = importProgress.get(taskId)
  if (!progress) return res.json({ done: 0, total: 0, current: '', stage: 'preparing', stagePercent: 3, itemCount: 0 })
  res.json({
    done: progress.done,
    total: progress.total,
    current: progress.current,
    stage: progress.stage,
    stagePercent: Number(progress.stagePercent || 0),
    itemCount: Number(progress.itemCount || 0),
  })
}

async function downloadQuotation(req, res) {
  const order = await loadRawOrder(req.params.id, req.user)
  if (!canView(order, req.user)) throw forbidden('无权下载该报价原始附件')
  const fileId = Number(req.query.fileId || order.quotationFileId)
  if (!fileId) throw notFound('该 MR 申请未上传报价原始附件')
  const rows = await query(
    `SELECT storage_path, original_name FROM files
     WHERE id = :fileId AND owner_type = 'mr_order' AND owner_id = :ownerId LIMIT 1`,
    { fileId, ownerId: req.params.id },
  )
  if (!rows[0] || !fs.existsSync(rows[0].storage_path)) throw notFound('报价原始附件不存在')
  res.download(rows[0].storage_path, rows[0].original_name)
}

/** 删除单份已留存的报价原始附件；若主附件指针指向被删文件则改指剩余第一份。 */
async function deleteQuotationFile(req, res) {
  await ensureTables()
  const order = await loadRawOrder(req.params.id)
  const assistantIds = await assistantIdsFor(req.user)
  if (!canEdit(order, req.user, assistantIds)) throw forbidden('当前状态或身份不允许删除报价原始附件')
  const fileId = Number(req.query.fileId || 0)
  if (!fileId) throw badRequest('缺少 fileId')
  let removed = null
  let removedItems = 0
  await transaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, storage_path, original_name FROM files
       WHERE id = :fileId AND owner_type = 'mr_order' AND owner_id = :ownerId FOR UPDATE`,
      { fileId, ownerId: req.params.id },
    )
    if (!rows[0]) throw notFound('报价原始附件不存在')
    removed = rows[0]
    await connection.execute('DELETE FROM files WHERE id = :fileId', { fileId })
    // 联动删除从该文件导入的品项（销售来源或采购成本来源文件名匹配）
    const [deleteResult] = await connection.execute(
      'DELETE FROM mr_items WHERE mr_id = :ownerId AND (cost_source = :fileName OR sales_source = :fileName)',
      { ownerId: req.params.id, fileName: removed.original_name },
    )
    removedItems = Number(deleteResult?.affectedRows || 0)
    const [remaining] = await connection.execute(
      `SELECT id FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId ORDER BY id LIMIT 1`,
      { ownerId: req.params.id },
    )
    await connection.execute(
      'UPDATE mr_orders SET quotation_file_id = :nextId WHERE id = :ownerId AND quotation_file_id = :deletedId',
      { nextId: remaining[0]?.id || null, deletedId: fileId, ownerId: req.params.id },
    )
  })
  await fs.promises.rm(removed.storage_path, { force: true })
  const files = await query(
    `SELECT id, original_name AS name, size, created_at AS createdAt, quote_role AS quoteRole
     FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId ORDER BY id`,
    { ownerId: req.params.id },
  )
  res.json({ files, removedItems })
}

async function downloadDocument(req, res) {
  const order = await loadRawOrder(req.params.id, req.user)
  if (!canView(order, req.user)) throw forbidden('无权下载该 MR 归档文件')
  const requestedType = ['approved', 'voided'].includes(req.query.type) ? req.query.type : null
  const document = await mrDocument(req.params.id, requestedType)
  const stale = document && Number(document.format_version || 0) < PDF_FORMAT_VERSION
  if (!document || !fs.existsSync(document.storage_path) || stale) {
    if (['approved', 'voided'].includes(order.status)) {
      if (document?.id) await query('DELETE FROM mr_documents WHERE id = :id', { id: document.id })
      await query(
        `UPDATE mr_orders SET archive_status = 'pending', archive_next_attempt_at = NOW(), archive_error = :reason
         WHERE id = :id`,
        { id: req.params.id, reason: stale ? 'PDF 格式升级，等待重新生成' : '归档文件缺失，等待重新生成' },
      )
      throw badRequest('正式 PDF 正在生成，请稍后重试')
    }
    throw notFound('该 MR 尚无正式归档 PDF')
  }
  res.download(document.storage_path, document.original_name)
}

const ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.zip', '.csv', '.txt'])
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(originalNameUtf8(file)).toLowerCase()
    if (!ATTACHMENT_EXTENSIONS.has(extension)) return callback(badRequest('附件仅支持常见办公文件（PDF、Office、图片、ZIP、CSV、TXT）'))
    callback(null, true)
  },
}).fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }])

/** 通用附件上传（MR 表单底部附件区）：不做报价识别，直接留存到 MR 单。 */
async function uploadAttachments(req, res) {
  await ensureTables()
  const order = await loadRawOrder(req.params.id)
  const assistantIds = await assistantIdsFor(req.user)
  if (!canEdit(order, req.user, assistantIds)) throw forbidden('当前状态或身份不允许上传附件')
  const uploads = uploadedFiles(req)
  if (!uploads.length) throw badRequest('请选择要上传的附件')
  const files = await persistQuotationFiles(req.params.id, uploads, req.user, false)
  res.json({ files })
}

function getConstants(_req, res) {
  res.json({ ...constants, pricingModes: [{ value: 1, label: '多项系统集成' }, { value: 2, label: '单项系统集成' }, { value: 3, label: '开明细' }] })
}

async function listLayoutRules(_req, res) {
  await ensureTables()
  const rows = await query(
    `SELECT id, rule_key, file_pattern, vendor, match_count, source, enabled, created_by, created_at, updated_at
     FROM mr_layout_rules ORDER BY enabled DESC, match_count DESC, id DESC LIMIT 500`,
  )
  res.json({ items: rows.map((row) => ({
    id: row.id,
    ruleKey: row.rule_key,
    filePattern: row.file_pattern,
    vendor: row.vendor,
    matchCount: Number(row.match_count || 0),
    source: row.source,
    enabled: Boolean(row.enabled),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) })
}

function assertAdmin(req) {
  if (req.user?.role !== 'admin') throw forbidden('仅管理员可以管理识别版式规则')
}

async function createLayoutRule(req, res) {
  assertAdmin(req)
  await ensureTables()
  const filePattern = String(req.body?.filePattern || '').trim().slice(0, 128)
  const vendor = String(req.body?.vendor || '').trim().slice(0, 128)
  if (!filePattern) throw badRequest('请填写文件名模式')
  if (!vendor) throw badRequest('请填写供应商')
  const ruleKey = `manual:${filePattern}|${vendor}`.slice(0, 128)
  await query(
    `INSERT INTO mr_layout_rules (rule_key, file_pattern, vendor, match_count, source, enabled, created_by)
     VALUES (:ruleKey, :filePattern, :vendor, 0, 'manual', 1, :userId)
     ON DUPLICATE KEY UPDATE file_pattern = :filePattern, vendor = :vendor, source = 'manual', enabled = 1, updated_at = NOW()`,
    { ruleKey, filePattern, vendor, userId: req.user.id },
  )
  res.status(201).json({ ok: true })
}

async function updateLayoutRule(req, res) {
  assertAdmin(req)
  await ensureTables()
  const id = Number(req.params.id)
  const rows = await query('SELECT id FROM mr_layout_rules WHERE id = :id LIMIT 1', { id })
  if (!rows[0]) throw notFound('规则不存在')
  const updates = []
  const params = { id }
  if (req.body?.enabled !== undefined) { updates.push('enabled = :enabled'); params.enabled = req.body.enabled ? 1 : 0 }
  if (req.body?.vendor !== undefined) { updates.push('vendor = :vendor'); params.vendor = String(req.body.vendor).trim().slice(0, 128) }
  if (req.body?.filePattern !== undefined) { updates.push('file_pattern = :filePattern'); params.filePattern = String(req.body.filePattern).trim().slice(0, 128) }
  if (updates.length) await query(`UPDATE mr_layout_rules SET ${updates.join(', ')} WHERE id = :id`, params)
  res.json({ ok: true })
}

async function deleteLayoutRule(req, res) {
  assertAdmin(req)
  await ensureTables()
  const id = Number(req.params.id)
  await query('DELETE FROM mr_layout_rules WHERE id = :id', { id })
  res.status(204).end()
}

module.exports = {
  ensureTables,
  assistantIdsFor,
  listLayoutRules,
  createLayoutRule,
  updateLayoutRule,
  deleteLayoutRule,
  quotationUpload,
  attachmentUpload,
  getConstants,
  getAssistantSetting,
  setAssistantSetting,
  list,
  detail,
  create,
  update,
  submit,
  approve,
  reject,
  reassignSalesOwner,
  withdraw,
  voidOrder,
  submitPurchase,
  remove,
  importQuotation,
  importProgressHandler,
  vendorSuggestions,
  downloadQuotation,
  deleteQuotationFile,
  uploadAttachments,
  downloadDocument,
}
