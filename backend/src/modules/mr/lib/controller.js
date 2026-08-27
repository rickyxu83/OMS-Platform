const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const XLSX = require('xlsx')
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
const { parseWorkbookWithMetadata, parseSheet, sheetTotal } = require('./quotation-parser')
const { parsePdf, parsePdfText } = require('./quotation-pdf-parser')
const { recognizePdf } = require('./ocr-client')
const { extractWorkbookImages, companyCandidates } = require('./workbook-images')
const { archiveMrDocument } = require('./archive')
const { ensureTables } = require('./tables')
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
  salesWithAssistant,
  assertAssistantMapping,
  resolveStepAssignee,
  activateCurrentStep,
  activatePurchaseTask,
  activateContractNoTask,
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

// 待补合同编号期间，purchaseAssigneeUserId 记录的是被指派的助理；助理主管可代为补填
function canFillContractNo(order, user, assistantIds = []) {
  if (order.status !== 'approved') return false
  if (String(order.purchaseStatus || '') !== 'waiting_contract') return false
  if (user.role === 'admin') return true
  const assigneeId = Number(order.purchaseAssigneeUserId || 0)
  return ASSISTANT_LIKE_ROLES.has(user.role) && assigneeId > 0
    && (Number(user.id) === assigneeId || assistantIds.includes(assigneeId))
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
  // 冻结快照的品项缺少数据库 id，且不含审批后由采购填写的公司料号、采购订单号、出货单号；
  // 按 rowNo 叠加实时 id 与执行数据，归档 PDF 仍保持审批时快照不变
  const liveItemByRowNo = new Map(rawItems.map((raw) => [Number(raw.rowNo), raw]))
  const displayedItems = (displayed.items || []).map((item) => {
    const live = liveItemByRowNo.get(Number(item.rowNo))
    return live ? {
      ...item,
      id: live.id ?? item.id,
      companyPartNo: live.companyPartNo ?? item.companyPartNo,
      purchaseOrderNo: live.purchaseOrderNo ?? item.purchaseOrderNo,
      shipmentNo: live.shipmentNo ?? item.shipmentNo,
    } : item
  })
  // 采购环节属于审批后的生命周期数据：始终以 mr_orders 实时值为准，不被冻结快照覆盖
  // 合同编号同理：有合同但签核时暂无编号的单，由助理在签核通过后补填
  const purchaseLive = {
    contractNo: order.contractNo ?? null,
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
      canFillContractNo: canFillContractNo(order, user, assistantIds),
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
  // 全文搜索：单头（客户/Ctrl.NO/客户P/O/备注）+ 品项明细（品名/描述/原厂规格/料号/供应商/采购订单号/出货单号）
  // 设备型号查单场景：型号命中 oem_spec/description/name 的品项即可定位所属 MR 单
  const q = String(req.query.q || '').trim()
  if (q) {
    where.push(`(
      o.customer_name LIKE :q OR o.ctrl_no LIKE :q OR c.code LIKE :q
      OR o.customer_po LIKE :q OR o.remark LIKE :q
      OR EXISTS (
        SELECT 1 FROM mr_items i
        WHERE i.mr_id = o.id AND (
          i.name LIKE :q OR i.description LIKE :q OR i.oem_spec LIKE :q
          OR i.company_part_no LIKE :q OR i.vendor LIKE :q
          OR i.purchase_order_no LIKE :q OR i.shipment_no LIKE :q
        )
      )
    )`)
    params.q = `%${q}%`
  }
  // 多维筛选：客户精确、业务负责人、填表日期范围（均为可选，参数化查询防注入）
  const customerId = Number(String(req.query.customerId || '').trim())
  if (Number.isInteger(customerId) && customerId > 0) {
    where.push('o.customer_id = :customerId')
    params.customerId = customerId
  }
  const salesOwnerId = Number(String(req.query.salesOwnerId || '').trim())
  if (Number.isInteger(salesOwnerId) && salesOwnerId > 0) {
    where.push('o.sales_owner_id = :salesOwnerId')
    params.salesOwnerId = salesOwnerId
  }
  const dateFrom = String(req.query.dateFrom || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    where.push('o.fill_date >= :dateFrom')
    params.dateFrom = dateFrom
  }
  const dateTo = String(req.query.dateTo || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    where.push('o.fill_date <= :dateTo')
    params.dateTo = dateTo
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
  // 批量查所有 MR 的签核步骤链（悬浮卡显示完整流转进度）
  const mrIds = rows.map((row) => row.id).filter(Boolean)
  let approvalsByMr = {}
  if (mrIds.length) {
    // 只取每个 MR 最新一轮 cycle 的步骤（驳回重提交会开新一轮，旧轮不显示避免重复）
    const approvalRows = await query(
      `SELECT a.mr_id, a.cycle, a.seq, a.step_key, a.step_label, a.approver_id, a.approver_name_snapshot, a.action, a.decided_at
       FROM mr_approvals a
       INNER JOIN (SELECT mr_id, MAX(cycle) AS max_cycle FROM mr_approvals WHERE mr_id IN (${mrIds.map(() => '?').join(',')}) GROUP BY mr_id) latest
         ON latest.mr_id = a.mr_id AND latest.max_cycle = a.cycle
       ORDER BY a.mr_id, a.seq`,
      mrIds,
    )
    for (const a of approvalRows) {
      if (!approvalsByMr[a.mr_id]) approvalsByMr[a.mr_id] = []
      approvalsByMr[a.mr_id].push({
        seq: a.seq,
        stepKey: a.step_key,
        stepLabel: a.step_label,
        approverName: a.approver_name_snapshot || null,
        action: a.action || null,
        decidedAt: a.decided_at || null,
      })
    }
  }
  res.json({ items: rows.map((row) => {
    const order = orderPayload(row)
    return { ...order, approvalSteps: approvalsByMr[row.id] || [], permissions: { canEdit: canEdit(order, req.user, assistantIds), canDelete: canDelete(order, req.user, assistantIds), canVoid: canVoid(order, req.user, assistantIds), canApprove: canApprove(order, req.user, assistantIds), canWithdraw: canWithdraw(order, req.user), canPurchase: canPurchase(order, req.user), canFillContractNo: canFillContractNo(order, req.user, assistantIds) } }
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

// 销售个人常用信息沉淀：按“销售 × 供应商/客户”记忆 MR 表单偏好，与工程师维保厂商目录（maintenance_parties）完全隔离
// 快照字段为客户维度的稳定偏好；单据级字段（客户 P/O、日期、金额、品项等）不记忆
// 快照字段为客户维度的稳定偏好；单据级字段（客户 P/O、日期、金额、品项、开票/收款时间、开票内容等每单不同）不记忆
const SALES_PREF_SNAPSHOT_FIELDS = [
  'deliveryLocation',
  'purchaser', 'purchaserTel', 'purchaserMail',
  'recipient', 'recipientTel', 'recipientMail',
  'invoiceRecipient', 'invoiceRecipientTel', 'invoiceRecipientMail',
  'paymentTerms', 'paymentOther',
  'invoiceProcess', 'invoiceType',
  'deliveryTerms',
]

async function recordSalesVendorUsage(connection, salespersonId, items = []) {
  if (!salespersonId) return
  const names = [...new Set(items.map((item) => String(item.vendor || '').trim()).filter(Boolean))]
  for (const name of names) {
    await connection.execute(
      `INSERT INTO mr_sales_vendors (salesperson_id, vendor_name, use_count, last_used_at)
       VALUES (:salespersonId, :vendorName, 1, NOW())
       ON DUPLICATE KEY UPDATE use_count = use_count + 1, last_used_at = NOW()`,
      { salespersonId, vendorName: name },
    )
  }
}

async function recordSalesCustomerPref(connection, salespersonId, order) {
  if (!salespersonId || !order || !order.customerId) return
  const snapshot = {}
  for (const field of SALES_PREF_SNAPSHOT_FIELDS) {
    const value = order[field]
    if (value !== null && value !== undefined && String(value).trim() !== '') snapshot[field] = value
  }
  await connection.execute(
    `INSERT INTO mr_sales_customer_prefs (salesperson_id, customer_id, snapshot, use_count, last_used_at)
     VALUES (:salespersonId, :customerId, :snapshot, 1, NOW())
     ON DUPLICATE KEY UPDATE snapshot = :snapshot, use_count = use_count + 1, last_used_at = NOW()`,
    { salespersonId, customerId: Number(order.customerId), snapshot: JSON.stringify(snapshot) },
  )
}

// 提交/助理批准时沉淀该业务负责人的个人常用（供应商 + 客户表单快照），不写工程师维保厂商目录
async function recordSalesUsage(connection, order, items = []) {
  const salespersonId = Number(order.salesOwnerId) || null
  await recordSalesVendorUsage(connection, salespersonId, items)
  await recordSalesCustomerPref(connection, salespersonId, order)
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
    await recordSalesUsage(connection, detailValue, detailValue.items)
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
      await recordSalesUsage(connection, detailValue, detailValue.items)
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
      // 有合同但签核时合同流程未走完（暂无编号）：签核照常完成，采购挂起，待助理补填合同编号后流转
      const waitingContract = needsPurchase && Number(order.hasContract) === 1 && !order.contractNo
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
          purchaseStatus: waitingContract ? 'waiting_contract' : needsPurchase ? 'pending' : 'skipped',
          purchaseNote: waitingContract
            ? '有合同但合同编号未填写，待助理补填合同编号后流转采购'
            : needsPurchase ? null : '全部品项均无供应商，系统自动标记无需采购',
        },
      )
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'approved')`,
        { mrId: req.params.id, recipientId: order.salesOwnerId },
      )
      if (waitingContract) {
        await activateContractNoTask(connection, {
          id: Number(req.params.id),
          customerName: order.customerName,
          salesOwnerId: Number(order.salesOwnerId) || null,
          createdBy: Number(order.createdBy) || req.user.id,
        }, req.user.id)
      } else if (needsPurchase) {
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
       WHERE mr_id = :mrId AND event IN ('purchase_task', 'purchase_transfer', 'contract_no_task', 'contract_no_transfer') AND status IN ('pending', 'failed')`,
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

async function submitContractNo(req, res) {
  await ensureTables()
  const contractNo = String(req.body?.contractNo ?? req.body?.contract_no ?? '').trim().slice(0, 255)
  if (!contractNo) throw badRequest('请填写合同编号')
  await transaction(async (connection) => {
    const order = await loadLockedOrder(connection, req.params.id)
    if (order.status !== 'approved') throw badRequest('仅签核通过的 MR 可以补填合同编号')
    if (String(order.purchaseStatus || '') !== 'waiting_contract') throw badRequest('当前 MR 不在待补填合同编号环节')
    if (!Number(order.hasContract)) throw badRequest('该 MR 为无合同单，无需补填合同编号')
    // 合同编号由助理补填：补填期待 purchase_assignee_user_id 记录的是被指派的助理
    const assigneeId = Number(order.purchaseAssigneeUserId || 0)
    const assistantIds = await assistantIdsFor(req.user)
    const allowed = req.user.role === 'admin'
      || (assigneeId && Number(req.user.id) === assigneeId)
      || (ASSISTANT_LIKE_ROLES.has(req.user.role) && assigneeId && assistantIds.includes(assigneeId))
    if (!allowed) throw forbidden('合同编号由助理补填，当前补填待办不属于你')
    await connection.execute(
      `UPDATE mr_orders SET contract_no = :contractNo,
              purchase_status = 'pending', purchase_assignment_error = NULL, purchase_note = NULL,
              archive_status = 'pending', archive_attempts = 0, archive_next_attempt_at = NOW(),
              archive_error = '合同编号补填，等待重新生成',
              updated_by = :userId WHERE id = :mrId`,
      { contractNo, userId: req.user.id, mrId: order.id },
    )
    await connection.execute(
      `UPDATE mr_purchase_tasks SET status = 'done', completed_at = NOW(), completed_by = :userId
       WHERE mr_id = :mrId AND status = 'pending' AND task_type = 'contract_no'`,
      { mrId: order.id, userId: req.user.id },
    )
    if (order.salesOwnerId) {
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :recipientId, 'contract_no_filled')`,
        { mrId: order.id, recipientId: order.salesOwnerId },
      )
    }
    await connection.execute(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:actorId, 'mr', :targetId, 'contract_no_fill', :detailJson)`,
      {
        actorId: req.user.id,
        targetId: order.id,
        detailJson: JSON.stringify({ contractNo }),
      },
    )
    // 编号补齐后立即流转采购
    await activatePurchaseTask(connection, {
      id: Number(order.id),
      customerName: order.customerName,
      salesOwnerId: Number(order.salesOwnerId) || null,
      createdBy: Number(order.createdBy) || req.user.id,
    }, req.user.id)
  })
  try {
    await archiveMrDocument(req.params.id, 'approved')
  } catch (error) {
    console.error('[mr] 合同编号补填后归档失败，等待后台重试', error?.message || error)
  }
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
    const [itemRows] = await connection.execute('SELECT id, row_no, name, vendor, company_part_no, purchase_order_no, shipment_no FROM mr_items WHERE mr_id = :mrId ORDER BY row_no, id', { mrId: order.id })
    const byId = new Map(rows.map((entry) => [Number(entry?.id), String(entry?.purchaseOrderNo || '').trim().slice(0, 255)]))
    const byCompanyPartNo = new Map(rows.map((entry) => [Number(entry?.id), String(entry?.companyPartNo || '').trim().slice(0, 100)]))
    const byShipmentNo = new Map(rows.map((entry) => [Number(entry?.id), String(entry?.shipmentNo || '').trim().slice(0, 255)]))
    const updates = []
    for (const item of itemRows) {
      const value = byId.get(Number(item.id))
      if (value === undefined) throw badRequest('请完整提交所有品项的采购订单号')
      const hasVendor = String(item.vendor || '').trim() !== ''
      // 无供应商的品项没有采购对象，视为无需采购，不强制填写采购订单号
      if (hasVendor && !value) throw badRequest('有供应商的品项都需填写采购订单号；无供应商的品项视为无需采购')
      if (!hasVendor && !value) continue
      const companyValue = byCompanyPartNo.get(Number(item.id)) || ''
      const shipmentValue = byShipmentNo.get(Number(item.id)) || ''
      // 公司料号、出货单号为采购执行数据，选填不校验
      const before = String(item.purchase_order_no || '')
      if (before !== value) auditChanges.push({ rowNo: item.row_no, name: item.name, field: 'purchaseOrderNo', before: before || null, after: value })
      const beforeCompany = String(item.company_part_no || '')
      if (beforeCompany !== companyValue) auditChanges.push({ rowNo: item.row_no, name: item.name, field: 'companyPartNo', before: beforeCompany || null, after: companyValue || null })
      const beforeShipment = String(item.shipment_no || '')
      if (beforeShipment !== shipmentValue) auditChanges.push({ rowNo: item.row_no, name: item.name, field: 'shipmentNo', before: beforeShipment || null, after: shipmentValue || null })
      updates.push([value, companyValue, shipmentValue, Number(item.id)])
    }
    for (const [value, companyValue, shipmentValue, itemId] of updates) {
      await connection.execute('UPDATE mr_items SET purchase_order_no = :value, company_part_no = :companyValue, shipment_no = :shipmentValue WHERE id = :itemId AND mr_id = :mrId', { value, companyValue, shipmentValue, itemId, mrId: order.id })
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

/** 有效数字判定：null/undefined/''/NaN 都视为无效（避免 Number(null)=0 把缺省单价/数量坑成 0）。 */
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

/**
 * 人工修正品项归一化（前端 camelCase → 识别流水线 snake_case）。
 * 用户在校对中只填了“采购成本（含税）”而未填单价/小计时（供应商报价场景），
 * 按税率反推未税单价与小计，保证修正数据完整可被 merge 正确消费；含税成本原样保留供 merge 直接取值。
 */
function normalizeCorrectedItem(item) {
  const qty = hasNumber(item?.qty) ? Number(item.qty) : null
  const unitPrice = hasNumber(item?.unitPrice) ? Number(item.unitPrice) : null
  const extended = hasNumber(item?.extended) ? Number(item.extended)
    : qty !== null && unitPrice !== null ? Math.round(qty * unitPrice * 100) / 100
    : null
  const costInclTax = hasNumber(item?.costInclTax) ? Number(item.costInclTax) : null
  const taxRate = hasNumber(item?.taxRate) ? Number(item.taxRate) : null
  const normalized = {
    rowNo: Number(item?.rowNo) || 0,
    // 识别流水线内部品项为 snake_case，回写时保持同构以被 merge 正确处理
    company_part_no: String(item?.companyPartNo || item?.company_part_no || '').trim().slice(0, 100) || null,
    part_no: String(item?.oemSpec || item?.partNo || item?.part_no || '').trim().slice(0, 255) || null,
    name: String(item?.name || '').trim().slice(0, 255) || null,
    description: String(item?.description || '').trim().slice(0, 4000) || null,
    warranty_service: String(item?.warrantyService || '').trim().slice(0, 255) || null,
    qty,
    unit_price: unitPrice,
    extended,
    vendor: String(item?.vendor || '').trim().slice(0, 255) || null,
    cost_incl_tax: costInclTax,
    tax_rate: taxRate,
  }
  // 反推：只填了含税成本、没有单价/小计时，按税率折算未税单价与小计（单位成本保留到 6 位避免除不尽误差）
  if (unitPrice === null && extended === null && costInclTax !== null) {
    const rate = taxRate === null ? 13 : taxRate
    const untaxed = Math.round((costInclTax / (1 + rate / 100)) * 100) / 100
    normalized.extended = untaxed
    normalized.unit_price = qty !== null && qty > 0 ? Math.round((untaxed / qty) * 1000000) / 1000000 : null
  }
  return normalized
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
      .map(normalizeCorrectedItem)
      .filter((item) => item.name || item.part_no || item.company_part_no || item.description)
    if (!normalized.length) continue

    // 写前读取原始识别结果：diff 基准必须用修正前的 result（记录不存在时 INSERT 分支会写入占位 result，写后读会读空导致纠错样本永不落库）
    const cached = await readRecognitionCache(fileHash)
    const originalItems = cached?.result?.parsed?.sheets?.[0]?.items || []

    const corrected = { sheets: [{ items: normalized }], source: 'user_corrected' }
    // 已有缓存时 result 保持原始识别结果不变（ON DUPLICATE KEY UPDATE 的 UPDATE 分支不触碰 result，仅修正字段）；
    // 缓存缺失时写入占位，不伪造原始识别数据
    const originalResult = cached?.result ? JSON.stringify(cached.result) : JSON.stringify({})
    await query(
      `INSERT INTO mr_quote_recognition_cache
         (file_hash, parser_version, file_name, result, corrected_result, corrected_by, corrected_at, correction_count)
       VALUES (:hash, :version, :name, :result, :corrected, :userId, NOW(), 1)
       ON DUPLICATE KEY UPDATE
         corrected_result = :corrected, corrected_by = :userId, corrected_at = NOW(), correction_count = correction_count + 1`,
      { hash: fileHash, version: RECOGNITION_PARSER_VERSION, name: fileName, result: originalResult, corrected: JSON.stringify(corrected), userId: user?.id || null },
    )
    applied += 1

    // 纠错样本：对比自动识别结果与修正结果，有差异才落库
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
    await learnLayoutTemplatesFromFeedback()
  } catch (error) {
    console.warn('[mr] 布局规则自学习失败：', error?.message || error)
  }
  return { applied, feedback }
}

/**
 * 表头布局模板自学习：从纠错样本统计“文件名模式 + 表头签名”的出现频次，
 * 达到阈值（默认 3 次）自动生成模板规则（source=auto，enabled=1），
 * 同模板新文件识别时按模板列映射取数（见 applyLayoutTemplate）。
 * 仅系统解析结果（含 header_signature/columns_json 元数据）参与学习，AI 结果自动跳过。
 */
async function learnLayoutTemplatesFromFeedback() {
  const rows = await query(
    'SELECT file_name, original_result FROM mr_recognition_feedback ORDER BY created_at',
  )
  const stats = new Map()
  for (const row of rows) {
    const pattern = extractFilePattern(row.file_name)
    if (!pattern) continue
    let original = null
    try { original = typeof row.original_result === 'string' ? JSON.parse(row.original_result) : row.original_result } catch (_error) { continue }
    const sheet = original?.parsed?.sheets?.[0]
    const signature = String(sheet?.header_signature || '').trim()
    const columnsJson = String(sheet?.columns_json || '').trim()
    const headerRow = Number(sheet?.header_row || 0)
    if (!signature || !columnsJson || columnsJson === '{}') continue
    const key = `${pattern}|${signature}`
    if (!stats.has(key)) stats.set(key, { pattern, signature, columnsJson, headerRow, count: 0, fieldCounts: {} })
    stats.get(key).count += 1
    // 统计纠错样本 diff 中被人工修正的字段（sample 反哺：同一模板反复被改的字段标记为易错）
    let diff = null
    try { diff = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff } catch (_error) { diff = null }
    for (const entry of Array.isArray(diff) ? diff : []) {
      const field = String(entry?.field || '')
      if (field) stats.get(key).fieldCounts[field] = (stats.get(key).fieldCounts[field] || 0) + 1
    }
  }
  for (const { pattern, signature, columnsJson, headerRow, count, fieldCounts } of stats.values()) {
    if (count < 3) continue
    // 高频被人工修正字段（≥3 次）→ 模板标记为需重点核对字段
    const reviewFields = Object.entries(fieldCounts)
      .filter(([, freq]) => freq >= 3)
      .map(([field]) => field)
    await query(
      `INSERT INTO mr_layout_templates (rule_key, file_pattern, header_signature, columns_json, review_fields_json, header_row, match_count, source, enabled)
       VALUES (:ruleKey, :pattern, :signature, :columnsJson, :reviewFields, :headerRow, :count, 'auto', 1)
       ON DUPLICATE KEY UPDATE match_count = :count, header_row = :headerRow, review_fields_json = :reviewFields, updated_at = NOW()`,
      { ruleKey: `template:${pattern}|${signature}`.slice(0, 160), pattern, signature, columnsJson, reviewFields: JSON.stringify(reviewFields), headerRow, count },
    )
  }
}

/**
 * 模板列映射与当前识别结果的一致性判断（数量/单价/小计/品名前 30 字符）。
 * 用于防固化：模板列映射与本次识别不一致时不覆盖识别结果，仅提示核对。
 */
function templateResultConsistent(currentItems, templateItems) {
  if (!Array.isArray(currentItems) || !Array.isArray(templateItems) || currentItems.length !== templateItems.length) return false
  const key = (item) => [item.qty, item.unit_price, item.extended, String(item.name || item.description || '').slice(0, 30)].join('|')
  return currentItems.every((item, index) => key(item) === key(templateItems[index]))
}

/** 品名匹配 key：小写 + 去空白标点，取前 20 字符作为同名品匹配前缀 */
function namePrefixKey(value) {
  return String(value || '').toLowerCase().replace(/[\s，,。.;；:：()（）'"“”【】\[\]\-]/g, '').slice(0, 20)
}

/**
 * 历史价格统计：按“供应商 + 名称前缀”查 mr_items 历史品项，
 * 返回单位含税成本（cost_incl_tax/qty）中位数与样本数；无历史或样本 <3 返回 null。
 * 中位数比均值抗异常（历史中偶有误填价格）。
 */
async function historyUnitCostStats(vendor, name, { queryImpl = query, limit = 50 } = {}) {
  const prefix = namePrefixKey(name)
  if (!vendor || !prefix) return null
  const rows = await queryImpl(
    `SELECT cost_incl_tax, qty FROM mr_items
     WHERE vendor = :vendor AND cost_incl_tax > 0 AND qty > 0
       AND (REPLACE(LOWER(name), ' ', '') LIKE :prefix OR REPLACE(LOWER(description), ' ', '') LIKE :prefix)
     ORDER BY id DESC LIMIT :limit`,
    { vendor, prefix: `${prefix}%`, limit },
  )
  const values = (rows || [])
    .map((row) => Number(row.cost_incl_tax) / Math.max(Number(row.qty) || 1, 1))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)
  if (values.length < 3) return null
  const median = values.length % 2
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
  return { median, count: values.length }
}

/**
 * 历史价格统计（按供应商批量）：一次查询该供应商全部历史品项，内存中按名称规范化前缀匹配，
 * 返回 statsFor(name) 闭包；样本 <3 的前缀不收录（返回 null）。
 * 与原 historyUnitCostStats 的 LIKE ':prefix%' 语义等价，但同一供应商只发一条 SQL，
 * 避免导入时对每个品项逐条全表 LIKE 扫描。
 */
async function historyUnitCostStatsByVendor(vendor, { queryImpl = query, limit = 200 } = {}) {
  // 规范化前缀 → 该前缀下各历史品项的单位成本（原实现按 LIKE 前缀聚合，同一供应商下“6类跳线 1米/2米/3米”
  // 都是同一前缀的样本，须合并统计中位数）
  const byPrefix = new Map()
  if (vendor) {
    const rows = await queryImpl(
      `SELECT name, description, cost_incl_tax, qty FROM mr_items
       WHERE vendor = :vendor AND cost_incl_tax > 0 AND qty > 0
       ORDER BY id DESC LIMIT :limit`,
      { vendor, limit },
    )
    for (const row of rows || []) {
      const prefix = namePrefixKey(row.name) || namePrefixKey(row.description)
      if (!prefix) continue
      const unitCost = Number(row.cost_incl_tax) / Math.max(Number(row.qty) || 1, 1)
      if (!Number.isFinite(unitCost) || unitCost <= 0) continue
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, [])
      byPrefix.get(prefix).push(unitCost)
    }
  }
  return {
    statsFor(name) {
      const prefix = namePrefixKey(name)
      if (!prefix) return null
      // 与原 LIKE ':prefix%' 语义一致：合并所有以当前品名前缀开头的历史品项计算中位数；样本 <3 返回 null
      const values = []
      for (const [candidate, costs] of byPrefix) {
        if (candidate.startsWith(prefix)) values.push(...costs)
      }
      if (values.length < 3) return null
      const sorted = values.sort((left, right) => left - right)
      const median = sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      return { median, count: sorted.length }
    },
  }
}

/**
 * 历史价格偏差判断：当前单位成本偏离历史中位数 >50% 时返回核对警告文案，否则 null。
 * 无历史、样本不足、中位数无效或价格在正常范围均不打扰。
 */
function priceAnomalyWarning(itemName, currentUnitCost, stats, { threshold = 0.5 } = {}) {
  if (!stats || stats.count < 3 || currentUnitCost === null || currentUnitCost === undefined || currentUnitCost <= 0) return null
  const median = Number(stats.median)
  if (!Number.isFinite(median) || median <= 0) return null
  const deviation = Math.abs(currentUnitCost - median) / median
  if (deviation <= threshold) return null
  const fmt = (value) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return `“${String(itemName || '').slice(0, 40)}”识别单位成本 ¥${fmt(currentUnitCost)} 与历史中位 ¥${fmt(median)} 偏差 ${Math.round(deviation * 100)}%，疑似识别错误，请核对`
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
  // persist 回写场景（仅留存文件、无新上传，确认导入补漏校对）：凭 sourceHashes 回写修正，允许 uploads 为空
  const persistOnly = String(req.body?.persistOnly || '') === '1'
  const persist = String(req.body?.persist || '') === '1'
  if (!uploads.length && !(persist && persistOnly)) throw badRequest('请选择报价单或订单文件')

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
    parsed = extension === '.pdf'
        ? await parsePdf(file.buffer, name)
        : parseWorkbookWithMetadata(file.buffer, name)
      // 表头模板应用：同文件模式 + 表头签名命中已学模板时，用模板列映射重新解析（覆盖启发式识别）
      if (extension === '.xls' || extension === '.xlsx') {
        try {
          const pattern = extractFilePattern(name)
          if (pattern && parsed.sheets?.length) {
            const templates = await query(
              'SELECT header_signature, columns_json, review_fields_json, header_row FROM mr_layout_templates WHERE file_pattern = :pattern AND enabled = 1',
              { pattern },
            )
            if (templates.length) {
              const bySignature = new Map(templates.map((tpl) => [tpl.header_signature, tpl]))
              const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true })
              let applied = 0
              let mismatchCount = 0
              const reviewHints = new Set()
              parsed.sheets = parsed.sheets.map((sheet, sheetIndex) => {
                const tpl = bySignature.get(sheet.header_signature)
                if (!tpl) return sheet
                let columns = null
                try { columns = JSON.parse(tpl.columns_json) } catch (_error) { return sheet }
                if (!columns || typeof columns !== 'object' || Array.isArray(columns)) return sheet
                // 用 sheet.title 定位 worksheet：parsed.sheets 可能跳过无法解析的 sheet（封面页等），
                // 其索引与 workbook.SheetNames 并不一一对应，用 SheetNames[sheetIndex] 会取错 sheet
                const worksheet = workbook.Sheets[sheet.title]
                if (!worksheet) return sheet
                const knownSpec = {
                  row: Number(tpl.header_row) || 0,
                  columns,
                  all: Object.fromEntries(Object.entries(columns).map(([key, col]) => [key, [Number(col)]])),
                }
                const reParsed = parseSheet(worksheet, knownSpec)
                // 模板解析为空（模板已不匹配当前文件）时忽略
                if (!reParsed || !reParsed.items?.length) return sheet
                // 防固化：模板列映射与本次识别不一致时，不覆盖本次识别结果（以当前识别为准），仅提示核对
                if (!templateResultConsistent(sheet.items || [], reParsed.items)) {
                  mismatchCount += 1
                  return sheet
                }
                // 模板与本次识别一致：保留当前识别结果（不覆盖），仅标记模板记录的易错字段（样本反哺提示）
                let reviewFields = []
                try { reviewFields = JSON.parse(tpl.review_fields_json || '[]') } catch (_error) { reviewFields = [] }
                if (reviewFields.length) {
                  const mapped = [...new Set(reviewFields
                    .map((field) => ({ unit_price: 'unitPrice', extended: 'extended', qty: 'qty', name: 'description', description: 'description', cost_incl_tax: 'extended', tax_rate: 'taxRate' }[field] || field))
                    .filter(Boolean))]
                  if (mapped.length) {
                    sheet.items = (sheet.items || []).map((item) => ({ ...item, review_fields: [...new Set([...(item.review_fields || []), ...mapped])] }))
                    mapped.forEach((field) => reviewHints.add(field))
                  }
                }
                applied += 1
                return sheet
              })
              if (applied) {
                parsed.warnings.push(`已命中供应商表头模板（${applied} 个 sheet），识别结果与模板一致`)
                if (reviewHints.size) parsed.warnings.push(`该表头模板的 ${[...reviewHints].join('、')} 字段历史常被人工修正，请重点核对`)
              }
              if (mismatchCount) parsed.warnings.push(`${mismatchCount} 个 sheet 命中表头模板但列映射与本次识别不一致，已按本次识别结果为准，请核对`)
            }
          }
        } catch (error) {
          console.warn('[mr] 表头模板应用失败：', error?.message || error)
        }
      }
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
      // 识别缓存仅写不读：每次导入总是重新识别（避免旧识别结果污染）；写入原始识别结果供纠错样本 diff（三期学习）使用
      await writeRecognitionCache(fileHash, name, { parsed, recognitionMethod, systemItemCount, aiItemCount, aiDocumentType })
      // 分区冲突提示与请求角色相关，每次按本次分区重新判断
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
  // 单份来源文件无需跨文件实体配对（无销售/采购对照），跳过该步避免无谓的 AI 调用（二次打开秒开）
  if (sources.length > 1) {
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
  }
  progress.stage = 'merging'
  progress.stagePercent = 95

  const vendors = await query(
    `SELECT name, official_website AS officialWebsite
     FROM maintenance_parties WHERE party_type = 'original_manufacturer' ORDER BY name`,
  )
  const merged = mergeQuotations(sources, vendors)
  // 历史价格校验：对每个有供应商和成本的品项，对比该供应商同名品历史价格，明显偏离时追加核对警告
  // 按供应商批量取一次历史品项（内存前缀匹配），避免逐品项全表 LIKE 扫描
  try {
    const anomalyWarnings = []
    const byVendor = new Map()
    for (const item of merged.items || []) {
      if (!item.vendor) continue
      const unitCost = item.costInclTax === null || item.costInclTax === undefined
        ? null
        : Number(item.costInclTax) / Math.max(Number(item.qty) || 1, 1)
      if (unitCost === null || unitCost <= 0) continue
      if (!byVendor.has(item.vendor)) byVendor.set(item.vendor, [])
      byVendor.get(item.vendor).push({ name: item.name || item.description, unitCost })
    }
    const vendorStats = new Map()
    for (const [vendor, entries] of byVendor) {
      let statsByVendor = vendorStats.get(vendor)
      if (!statsByVendor) {
        statsByVendor = await historyUnitCostStatsByVendor(vendor)
        vendorStats.set(vendor, statsByVendor)
      }
      for (const entry of entries) {
        const stats = statsByVendor.statsFor(entry.name)
        const warning = priceAnomalyWarning(entry.name, entry.unitCost, stats)
        if (warning) anomalyWarnings.push(warning)
      }
    }
    if (anomalyWarnings.length) merged.warnings.push(...anomalyWarnings)
  } catch (error) {
    console.warn('[mr] 历史价格校验失败：', error?.message || error)
  }
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

/** 供应商候选：当前销售个人常用（mr_sales_vendors）排前 + MR 全局历史品项供应商兜底；不再返回维保厂商目录，避免与工程师侧混淆。 */
async function vendorSuggestions(req, res) {
  await ensureTables()
  const salespersonId = Number(req.user?.id) || 0
  const personal = salespersonId ? await query(
    `SELECT vendor_name AS name, use_count AS usageCount, last_used_at AS lastUsedAt
     FROM mr_sales_vendors WHERE salesperson_id = :salespersonId
     ORDER BY usageCount DESC, lastUsedAt DESC`,
    { salespersonId },
  ) : []
  const personalNames = new Set(personal.map((row) => row.name))
  const mrVendors = await query(
    `SELECT vendor AS name, COUNT(*) AS usageCount
     FROM mr_items
     WHERE vendor IS NOT NULL AND vendor != ''
     GROUP BY vendor
     ORDER BY usageCount DESC, vendor
     LIMIT 300`,
  )
  const items = [
    ...personal.map((row) => ({ id: `sales-${row.name}`, name: row.name })),
    ...mrVendors.filter((row) => !personalNames.has(row.name)).map((row) => ({ id: `mr-${row.name}`, name: row.name })),
  ]
  res.json({ items })
}

/** 销售个人常用偏好：常用客户（含该销售对该客户的表单快照）与常用供应商，供填单自动带出。 */
async function salesPreferences(req, res) {
  await ensureTables()
  const salespersonId = Number(req.user?.id) || 0
  if (!salespersonId) return res.json({ customers: [], vendors: [] })
  const [customerRows, vendorRows] = await Promise.all([
    query(
      `SELECT customer_id AS customerId, snapshot, use_count AS useCount, last_used_at AS lastUsedAt
       FROM mr_sales_customer_prefs WHERE salesperson_id = :salespersonId
       ORDER BY useCount DESC, lastUsedAt DESC LIMIT 200`,
      { salespersonId },
    ),
    query(
      `SELECT vendor_name AS name, use_count AS useCount, last_used_at AS lastUsedAt
       FROM mr_sales_vendors WHERE salesperson_id = :salespersonId
       ORDER BY useCount DESC, lastUsedAt DESC LIMIT 200`,
      { salespersonId },
    ),
  ])
  res.json({
    customers: customerRows.map((row) => ({
      customerId: Number(row.customerId),
      snapshot: parseJsonValue(row.snapshot, {}) || {},
      useCount: Number(row.useCount) || 0,
      lastUsedAt: row.lastUsedAt || null,
    })),
    vendors: vendorRows.map((row) => ({ name: row.name, useCount: Number(row.useCount) || 0, lastUsedAt: row.lastUsedAt || null })),
  })
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
  const assistantIds = await assistantIdsFor(req.user)
  if (!canView(order, req.user, assistantIds)) throw forbidden('无权下载该报价原始附件')
  const fileId = Number(req.query.fileId || order.quotationFileId)
  if (!fileId) throw notFound('该 MR 申请未上传报价原始附件')
  const rows = await query(
    `SELECT storage_path, original_name FROM files
     WHERE id = :fileId AND owner_type = 'mr_order' AND owner_id = :ownerId LIMIT 1`,
    { fileId, ownerId: req.params.id },
  )
  if (!rows[0] || !fs.existsSync(rows[0].storage_path)) throw notFound('报价原始附件不存在')
  // inline=1 时浏览器内联预览（前端新标签页打开），否则强制下载
  if (String(req.query.inline || '') === '1') {
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].original_name)}`)
    res.sendFile(path.resolve(rows[0].storage_path))
    return
  }
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
  const assistantIds = await assistantIdsFor(req.user)
  if (!canView(order, req.user, assistantIds)) throw forbidden('无权下载该 MR 归档文件')
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
  normalizeCorrectedItem,
  historyUnitCostStats,
  historyUnitCostStatsByVendor,
  priceAnomalyWarning,
  learnLayoutTemplatesFromFeedback,
  namePrefixKey,
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
  submitContractNo,
  submitPurchase,
  remove,
  importQuotation,
  importProgressHandler,
  vendorSuggestions,
  salesPreferences,
  downloadQuotation,
  deleteQuotationFile,
  uploadAttachments,
  downloadDocument,
}
