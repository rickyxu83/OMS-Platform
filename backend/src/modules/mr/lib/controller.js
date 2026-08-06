const fs = require('fs')
const path = require('path')
const multer = require('multer')
const env = require('../../../config/env')
const { query, transaction } = require('../../../config/db')
const { badRequest, forbidden, notFound } = require('../../../utils/http-error')
const { parseWorkbookWithMetadata, sheetTotal } = require('./quotation-parser')
const { parsePdf } = require('./quotation-pdf-parser')
const { mergeQuotations } = require('./quotation-merge')
const {
  constants,
  STEP_ROLES,
  normalizeOrder,
  validateSubmission,
  totals,
  computeApprovalSteps,
} = require('../domain')

const EDITABLE_STATUSES = new Set(['draft', 'rejected'])
const APPROVE_ANY_ROLE = 'admin'
const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
const quotationRoot = path.join(uploadRoot, 'mr-quotations')
fs.mkdirSync(quotationRoot, { recursive: true })

let tablesReady = false

async function ensureTables() {
  if (tablesReady) return
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
      billing_timing VARCHAR(255) NULL,
      purchaser VARCHAR(255) NULL,
      purchaser_tel VARCHAR(64) NULL,
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
  const deliveryLocationColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_orders' AND column_name = 'delivery_location' LIMIT 1`,
  )
  if (!deliveryLocationColumns[0]) await query('ALTER TABLE mr_orders ADD COLUMN delivery_location VARCHAR(500) NULL AFTER latest_delivery_date')
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
      purchase_order_no VARCHAR(255) NULL,
      cost_source VARCHAR(255) NULL,
      PRIMARY KEY (id),
      KEY idx_mr_items_mr (mr_id),
      CONSTRAINT fk_mr_items_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const costSourceColumns = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mr_items' AND column_name = 'cost_source' LIMIT 1`,
  )
  if (!costSourceColumns[0]) await query('ALTER TABLE mr_items ADD COLUMN cost_source VARCHAR(255) NULL AFTER purchase_order_no')
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
  tablesReady = true
}

function camelizeRow(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
    value,
  ]))
}

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

function orderPayload(row) {
  const payload = camelizeRow(row)
  payload.installOptions = parseOptions(payload.installOptions)
  payload.maintenanceOptions = parseOptions(payload.maintenanceOptions)
  payload.hasContract = payload.hasContract === null ? null : Number(payload.hasContract)
  payload.hasPenalty = payload.hasPenalty === null ? null : Number(payload.hasPenalty)
  payload.splitDelivery = payload.splitDelivery === null ? null : Number(payload.splitDelivery)
  payload.pricingMode = payload.pricingMode === null ? null : Number(payload.pricingMode)
  return payload
}

function canView(order, user) {
  return user.role !== 'sales' || order.currentStepKey === 'sales' || Number(order.salesOwnerId) === Number(user.id) || user.role === APPROVE_ANY_ROLE
}


function canEdit(order, user) {
  if (user.role === 'assistant' && order.status === 'in_review' && order.currentStepKey === 'assistant') return true
  if (!EDITABLE_STATUSES.has(order.status)) return false
  if (user.role === 'admin' || user.role === 'assistant') return true
  return user.role === 'sales' && Number(order.salesOwnerId) === Number(user.id)
}

function canDelete(order, user) {
  return EDITABLE_STATUSES.has(order.status)
    && (user.role === 'admin' || Number(order.createdBy) === Number(user.id))
}

function canVoid(order, user) {
  if (order.status !== 'approved') return false
  if (['admin', 'assistant', 'operations_director', 'sales_supervisor'].includes(user.role)) return true
  return user.role === 'sales' && Number(order.salesOwnerId) === Number(user.id)
}

function canApprove(order, user) {
  if (order.status !== 'in_review' || !order.currentStepKey) return false
  if (user.role === APPROVE_ANY_ROLE) return true
  const requiredRole = STEP_ROLES[order.currentStepKey]
  if (user.role !== requiredRole) return false
  return true
}

async function loadRawOrder(id) {
  const rows = await query(
    `SELECT o.*, creator.real_name AS created_by_name, updater.real_name AS updated_by_name,
            sales.real_name AS sales_owner_name, c.code AS customer_code,
            pending.step_key AS current_step_key, pending.step_label AS current_step_label
     FROM mr_orders o
     LEFT JOIN users creator ON creator.id = o.created_by
     LEFT JOIN users updater ON updater.id = o.updated_by
     LEFT JOIN users sales ON sales.id = o.sales_owner_id
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN mr_approvals pending ON pending.id = (
       SELECT a.id FROM mr_approvals a
       WHERE a.mr_id = o.id AND a.action IS NULL
       ORDER BY a.cycle DESC, a.seq LIMIT 1
     )
     WHERE o.id = :id
     LIMIT 1`,
    { id },
  )
  if (!rows[0]) throw notFound('MR 单不存在')
  return orderPayload(rows[0])
}

async function loadLockedOrder(connection, id) {
  const [rows] = await connection.execute('SELECT * FROM mr_orders WHERE id = :id LIMIT 1 FOR UPDATE', { id })
  if (!rows[0]) throw notFound('MR 单不存在')
  const [pending] = await connection.execute(
    `SELECT step_key AS current_step_key, step_label AS current_step_label
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
  const order = await loadRawOrder(id)
  if (!canView(order, user)) throw forbidden('无权查看该 MR 单')
  const [itemRows, approvalRows, fileRows] = await Promise.all([
    query('SELECT * FROM mr_items WHERE mr_id = :id ORDER BY row_no, id', { id }),
    query(
      `SELECT a.*, u.real_name AS approver_name, u.username AS approver_username
       FROM mr_approvals a
       LEFT JOIN users u ON u.id = a.approver_id
       WHERE a.mr_id = :id
       ORDER BY a.cycle, a.seq`,
      { id },
    ),
    query(
      `SELECT id, original_name, size, created_at
       FROM files WHERE owner_type = 'mr_order' AND owner_id = :id ORDER BY id`,
      { id },
    ),
  ])
  const rawItems = itemRows.map(camelizeRow)
  const normalized = normalizeOrder({ ...order, items: rawItems })
  const items = normalized.items.map((item, index) => ({ id: rawItems[index]?.id, ...item }))
  const merged = { ...order, ...normalized.order, items }
  const approvalHistory = approvalRows.map(camelizeRow)
  const currentCycle = approvalHistory.reduce((max, approval) => Math.max(max, Number(approval.cycle) || 0), 0)
  const approvals = approvalHistory.filter((approval) => Number(approval.cycle) === currentCycle)
  return {
    ...merged,
    totals: totals(merged, items),
    approvals,
    approvalHistory,
    quotationFiles: fileRows.map((file) => ({ id: file.id, name: file.original_name, size: Number(file.size), createdAt: file.created_at })),
    fileName: `${order.customerCode || order.customerName || 'MR'}_${order.ctrlNo || `草稿-${order.id}`}`,
    permissions: {
      canEdit: canEdit(order, user),
      canDelete: canDelete(order, user),
      canVoid: canVoid(order, user),
      canApprove: canApprove(order, user),
    },
  }
}

async function resolveReferences(order, user) {
  if (user.role === 'sales') order.salesOwnerId = Number(user.id)
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
      "SELECT id FROM users WHERE id = :id AND role = 'sales' AND status = 'active' LIMIT 1",
      { id: order.salesOwnerId },
    )
    if (!users[0]) throw badRequest('负责业务不存在或已停用')
  }
  return order
}

const ORDER_COLUMNS = [
  ['customerId', 'customer_id'], ['customerContactId', 'customer_contact_id'], ['salesOwnerId', 'sales_owner_id'],
  ['customerName', 'customer_name'], ['contactName', 'contact_name'], ['caseCategory', 'case_category'],
  ['customerPo', 'customer_po'], ['ctrlNo', 'ctrl_no'], ['invoiceType', 'invoice_type'],
  ['pricingMode', 'pricing_mode'], ['totalExcludingTax', 'total_excluding_tax'], ['hasContract', 'has_contract'],
  ['contractType', 'contract_type'], ['hasPenalty', 'has_penalty'], ['penaltyContent', 'penalty_content'],
  ['invoiceProcess', 'invoice_process'], ['billingContent', 'billing_content'], ['invoiceRecipient', 'invoice_recipient'],
  ['billingTiming', 'billing_timing'], ['purchaser', 'purchaser'], ['purchaserTel', 'purchaser_tel'],
  ['recipient', 'recipient'], ['recipientTel', 'recipient_tel'], ['recipientMail', 'recipient_mail'],
  ['paymentTerms', 'payment_terms'], ['paymentOther', 'payment_other'], ['splitDelivery', 'split_delivery'],
  ['acceptance', 'acceptance'], ['acceptanceOther', 'acceptance_other'], ['installOptions', 'install_options'],
  ['maintenanceOptions', 'maintenance_options'], ['contractNo', 'contract_no'], ['fillDate', 'fill_date'],
  ['latestDeliveryDate', 'latest_delivery_date'], ['deliveryLocation', 'delivery_location'],
  ['shipmentNo', 'shipment_no'], ['deliveryTerms', 'delivery_terms'],
  ['remark', 'remark'],
]

function dbParams(order) {
  return Object.fromEntries(ORDER_COLUMNS.map(([key, column]) => [
    column,
    ['installOptions', 'maintenanceOptions'].includes(key) ? JSON.stringify(order[key] || []) : order[key],
  ]))
}

async function replaceItems(connection, mrId, items) {
  await connection.execute('DELETE FROM mr_items WHERE mr_id = :mrId', { mrId })
  for (const item of items) {
    await connection.execute(
      `INSERT INTO mr_items
        (mr_id, row_no, company_part_no, oem_spec, name, description, warranty_service,
         install_by, qty, unit_price, subtotal, vendor, cost_incl_tax, tax_rate, purchase_order_no, cost_source)
       VALUES
        (:mrId, :rowNo, :companyPartNo, :oemSpec, :name, :description, :warrantyService,
         :installBy, :qty, :unitPrice, :subtotal, :vendor, :costInclTax, :taxRate, :purchaseOrderNo, :costSource)`,
      { mrId, ...item },
    )
  }
}

async function list(req, res) {
  await ensureTables()
  const where = []
  const params = {}
  if (req.user.role === 'sales') {
    where.push("(o.sales_owner_id = :userId OR pending.step_key = 'sales')")
    params.userId = req.user.id
  }
  const status = String(req.query.status || '').trim()
  if (status) {
    where.push('o.status = :status')
    params.status = status
  }
  const q = String(req.query.q || '').trim()
  if (q) {
    where.push('(o.customer_name LIKE :q OR o.ctrl_no LIKE :q OR c.code LIKE :q)')
    params.q = `%${q}%`
  }
  const rows = await query(
    `SELECT o.*, creator.real_name AS created_by_name, sales.real_name AS sales_owner_name,
            c.code AS customer_code, (SELECT COUNT(*) FROM mr_items i WHERE i.mr_id = o.id) AS item_count,
            pending.step_key AS current_step_key, pending.step_label AS current_step_label
     FROM mr_orders o
     LEFT JOIN users creator ON creator.id = o.created_by
     LEFT JOIN users sales ON sales.id = o.sales_owner_id
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN mr_approvals pending ON pending.id = (
       SELECT a.id FROM mr_approvals a WHERE a.mr_id = o.id AND a.action IS NULL ORDER BY a.cycle DESC, a.seq LIMIT 1
     )
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY o.updated_at DESC, o.id DESC
     LIMIT 500`,
    params,
  )
  res.json({ items: rows.map((row) => {
    const order = orderPayload(row)
    return { ...order, permissions: { canEdit: canEdit(order, req.user), canDelete: canDelete(order, req.user), canVoid: canVoid(order, req.user), canApprove: canApprove(order, req.user) } }
  }) })
}

async function detail(req, res) {
  res.json(await loadDetail(req.params.id, req.user))
}

async function create(req, res) {
  await ensureTables()
  const normalized = normalizeOrder(req.body || {})
  await resolveReferences(normalized.order, req.user)
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
  const normalized = normalizeOrder(req.body || {})
  await resolveReferences(normalized.order, req.user)
  const params = dbParams(normalized.order)
  await transaction(async (connection) => {
    const existing = await loadLockedOrder(connection, req.params.id)
    if (!canEdit(existing, req.user)) throw forbidden('当前状态或身份不允许编辑该 MR 单')
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
  await transaction(async (connection) => {
    const locked = await loadLockedOrder(connection, req.params.id)
    if (!canEdit(locked, req.user)) throw forbidden('当前状态或身份不允许提交该 MR 单')
    const detailValue = await loadCalculatedOrder(connection, locked)
    const errors = validateSubmission(detailValue, detailValue.items)
    if (errors.length) throw badRequest('规范检查未通过', errors)
    await ensureMrVendors(connection, detailValue.items)
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
       rejected_at = NULL, reject_reason = NULL, updated_by = :userId WHERE id = :id`,
      { id: req.params.id, userId: req.user.id },
    )
  })
  await removeStoredQuotationFiles(req.params.id)
  res.json(await loadDetail(req.params.id, req.user))
}

async function decide(req, res, action) {
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  if (action === 'reject' && !reason) throw badRequest('驳回时必须填写原因')
  await ensureTables()
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    let [steps] = await connection.execute(
      `SELECT * FROM mr_approvals WHERE mr_id = :id AND action IS NULL
       ORDER BY cycle DESC, seq LIMIT 1 FOR UPDATE`,
      { id: req.params.id },
    )
    if (!steps[0]) throw badRequest('当前没有待签核步骤')
    order.currentStepKey = steps[0].step_key
    order.currentStepLabel = steps[0].step_label
    if (!canApprove(order, req.user)) throw forbidden('当前签核步骤不属于你')
    if (action === 'approve' && order.currentStepKey === 'assistant') {
      const detailValue = await loadCalculatedOrder(connection, order)
      const errors = validateSubmission(detailValue, detailValue.items)
      if (errors.length) throw badRequest('助理补充后仍有未完成内容', errors)
      await ensureMrVendors(connection, detailValue.items)
      const nextSteps = computeApprovalSteps(detailValue, detailValue.items)
      const cycle = steps[0].cycle
      await connection.execute('DELETE FROM mr_approvals WHERE mr_id = :id AND cycle = :cycle', { id: req.params.id, cycle })
      for (const step of nextSteps) {
        await connection.execute(
          `INSERT INTO mr_approvals (mr_id, cycle, seq, step_key, step_label)
           VALUES (:mrId, :cycle, :seq, :key, :label)`,
          { mrId: req.params.id, cycle, ...step },
        )
      }
      ;[steps] = await connection.execute(
        `SELECT * FROM mr_approvals WHERE mr_id = :id AND action IS NULL
         ORDER BY cycle DESC, seq LIMIT 1 FOR UPDATE`,
        { id: req.params.id },
      )
    }
    await connection.execute(
      `UPDATE mr_approvals SET approver_id = :userId, action = :action, reason = :reason, decided_at = NOW()
       WHERE id = :stepId`,
      { userId: req.user.id, action, reason: reason || null, stepId: steps[0].id },
    )
    if (action === 'reject') {
      await connection.execute(
        `UPDATE mr_approvals SET action = 'skipped', reason = '前序驳回'
         WHERE mr_id = :id AND cycle = :cycle AND action IS NULL`,
        { id: req.params.id, cycle: steps[0].cycle },
      )
      await connection.execute(
        `UPDATE mr_orders SET status = 'rejected', rejected_at = NOW(), reject_reason = :reason,
         updated_by = :userId WHERE id = :id`,
        { id: req.params.id, userId: req.user.id, reason },
      )
      return
    }
    const [pending] = await connection.execute(
      `SELECT id FROM mr_approvals WHERE mr_id = :id AND cycle = :cycle AND action IS NULL LIMIT 1`,
      { id: req.params.id, cycle: steps[0].cycle },
    )
    if (!pending[0]) {
      await connection.execute(
        `UPDATE mr_orders SET status = 'approved', approved_at = NOW(), updated_by = :userId WHERE id = :id`,
        { id: req.params.id, userId: req.user.id },
      )
    } else {
      await connection.execute('UPDATE mr_orders SET updated_by = :userId WHERE id = :id', { id: req.params.id, userId: req.user.id })
    }
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function approve(req, res) {
  await decide(req, res, 'approve')
}

async function reject(req, res) {
  await decide(req, res, 'reject')
}

async function voidOrder(req, res) {
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  if (!reason) throw badRequest('作废时必须填写原因')
  await ensureTables()
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (!canVoid(order, req.user)) throw forbidden('当前状态或身份不允许作废该 MR 单')
    await connection.execute(
      `UPDATE mr_orders SET status = 'voided', voided_at = NOW(), void_reason = :reason,
       updated_by = :userId WHERE id = :id`,
      { id: req.params.id, userId: req.user.id, reason },
    )
  })
  res.json(await loadDetail(req.params.id, req.user))
}

async function remove(req, res) {
  await ensureTables()
  let files = []
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (!canDelete(order, req.user)) throw forbidden('只能删除本人创建的草稿或被驳回单据')
    const [rows] = await connection.execute(
      `SELECT storage_path FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId FOR UPDATE`,
      { ownerId: req.params.id },
    )
    files = rows
    await connection.execute("DELETE FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId", { ownerId: req.params.id })
    await connection.execute('DELETE FROM mr_orders WHERE id = :id', { id: req.params.id })
  })
  await Promise.allSettled(files.map((file) => fs.promises.rm(file.storage_path, { force: true })))
  res.status(204).end()
}

const quotationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase()
    if (!['.xls', '.xlsx', '.pdf'].includes(extension)) return callback(badRequest('请上传 Excel 或 PDF 报价/订单文件（.xls、.xlsx、.pdf）'))
    callback(null, true)
  }
}).fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }])

function originalNameUtf8(file) {
  return Buffer.from(file?.originalname || '', 'latin1').toString('utf8') || 'quotation.xlsx'
}

function uploadedFiles(req) {
  return Object.values(req.files || {}).flat()
}
async function removeStoredQuotationFiles(ownerId) {
  const rows = await query(
    `SELECT storage_path FROM files WHERE owner_type = 'mr_order' AND owner_id = :ownerId`,
    { ownerId },
  )
  if (!rows.length) return
  await query('DELETE FROM files WHERE owner_type = \'mr_order\' AND owner_id = :ownerId', { ownerId })
  await query('UPDATE mr_orders SET quotation_file_id = NULL WHERE id = :ownerId', { ownerId })
  await Promise.allSettled(rows.map((file) => fs.promises.rm(file.storage_path, { force: true })))
}

async function importQuotation(req, res) {
  const uploads = uploadedFiles(req)
  if (!uploads.length) throw badRequest('请选择报价单或订单文件')
  await ensureTables()
  const order = await loadRawOrder(req.params.id)
  if (!canEdit(order, req.user)) throw forbidden('当前状态或身份不允许导入报价单')

  let sources
  let requestedRoles = []
  try {
    requestedRoles = JSON.parse(String(req.body?.sourceRoles || '[]'))
    if (!Array.isArray(requestedRoles)) requestedRoles = []
  } catch (_error) {
    requestedRoles = []
  }
  try {
    sources = await Promise.all(uploads.map(async (file, index) => {
      const name = originalNameUtf8(file)
      const extension = path.extname(name).toLowerCase()
      const parsed = extension === '.pdf'
        ? await parsePdf(file.buffer, name)
        : parseWorkbookWithMetadata(file.buffer, name)
      const sheets = parsed.sheets.map((sheet) => ({ ...sheet, total: sheet.total ?? sheetTotal(sheet) }))
      if (!sheets.length && parsed.documentType !== 'scanned_pdf') throw new Error(`${name} 未找到可识别的报价明细表`)
      const requestedRole = ['sales', 'purchase'].includes(requestedRoles[index]) ? requestedRoles[index] : null
      const documentType = parsed.documentType === 'customer_order' ? 'customer_order' : requestedRole === 'sales' ? 'sales_quote' : requestedRole === 'purchase' ? 'purchase_quote' : parsed.documentType
      return { name, sheets, documentType, requestedRole, warnings: parsed.warnings || [] }
    }))
  } catch (error) {
    throw badRequest(`报价单解析失败：${error.message}`)
  }

  const vendors = await query(
    `SELECT name, official_website AS officialWebsite
     FROM maintenance_parties WHERE party_type = 'original_manufacturer' ORDER BY name`,
  )
  const merged = mergeQuotations(sources, vendors)
  const sourceIndex = merged.salesSourceIndex >= 0 ? merged.salesSourceIndex : merged.orderSourceIndex
  const primarySheet = sourceIndex >= 0 ? sources[sourceIndex]?.sheets[0] : null
  const orderSheet = merged.orderSourceIndex >= 0 ? sources[merged.orderSourceIndex]?.sheets[0] : null
  const customerName = String(primarySheet?.customer || orderSheet?.customer || '').replace(/^客户名称[：:]?\s*/i, '').trim()
  const matchedCustomer = customerName ? (await query(
    'SELECT id, code, name FROM customers WHERE name = :customer OR code = :customer LIMIT 1',
    { customer: customerName },
  ))[0] : null
  const matchedContacts = matchedCustomer ? await query(
    'SELECT id, name, phone FROM customer_contacts WHERE customer_id = :customerId ORDER BY use_count DESC, last_used_at DESC, id DESC',
    { customerId: matchedCustomer.id },
  ) : []
  const payload = {
    ...merged,
    metadata: primarySheet ? {
      customer: primarySheet?.customer || orderSheet?.customer,
      attn: primarySheet?.attn || orderSheet?.attn,
      payment: primarySheet?.payment || orderSheet?.payment,
      delivery: primarySheet?.delivery || orderSheet?.delivery,
      taxRate: primarySheet?.tax_rate ?? orderSheet?.tax_rate ?? null,
      customerPo: orderSheet?.po_no || primarySheet?.po_no || '',
      latestDeliveryDate: orderSheet?.latest_delivery_date || primarySheet?.latest_delivery_date || '',
      deliveryLocation: orderSheet?.delivery || primarySheet?.delivery || '',
      matchedCustomer: matchedCustomer ? { ...camelizeRow(matchedCustomer), contacts: matchedContacts.map(camelizeRow) } : null,
    } : {},
  }
  if (uploads.length === 1) payload.warnings.unshift('只识别到一份来源文件，请确认客户报价、厂商报价或最终 PO 角色')
  if (String(req.body?.cleanupStoredFiles || '') === '1') await removeStoredQuotationFiles(req.params.id)
  res.json({ files: [], ...payload })
}

async function downloadQuotation(req, res) {
  const order = await loadRawOrder(req.params.id)
  if (!canView(order, req.user)) throw forbidden('无权下载该报价单')
  const fileId = Number(req.query.fileId || order.quotationFileId)
  if (!fileId) throw notFound('该 MR 单未上传报价单')
  const rows = await query(
    `SELECT storage_path, original_name FROM files
     WHERE id = :fileId AND owner_type = 'mr_order' AND owner_id = :ownerId LIMIT 1`,
    { fileId, ownerId: req.params.id },
  )
  if (!rows[0] || !fs.existsSync(rows[0].storage_path)) throw notFound('报价单文件不存在')
  res.download(rows[0].storage_path, rows[0].original_name)
}

function getConstants(_req, res) {
  res.json({ ...constants, pricingModes: [{ value: 1, label: '多项系统集成' }, { value: 2, label: '单项系统集成' }, { value: 3, label: '开明细' }] })
}

module.exports = {
  ensureTables,
  quotationUpload,
  getConstants,
  list,
  detail,
  create,
  update,
  submit,
  approve,
  reject,
  voidOrder,
  remove,
  importQuotation,
  downloadQuotation,
}
