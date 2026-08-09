const INVOICE_TYPES = ['13%增值税', '13%普通发票', '6%普通发票', '6%服务发票']
const CONTRACT_TYPES = ['买卖/维修', '维护/服务']
const INVOICE_PROCESSES = ['随货开立', '验收再开', '预开']
const PAYMENT_TERMS = ['月结30天', '月结60天', '月结90天', '月结120天', '其他']
const CASE_CATEGORIES = ['软件买卖', '硬件买卖', '系统整合', '维护维修', '顾问', '项目', '其它']
const ACCEPTANCE_TYPES = ['交货即验收', '装机完成', '测试完成', '验收报告', '其他']
const WORK_OPTIONS = ['敦阳', '厂商', 'NO', '其它']

const STEP_ROLES = Object.freeze({
  assistant: 'assistant',
  sales: 'sales',
  engineering: 'engineering_supervisor',
  supervisor: 'sales_supervisor',
  vp: 'operations_director',
})

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max) || null
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function bool(value) {
  if (value === '' || value === null || value === undefined) return null
  if (value === true || value === 1 || value === '1' || value === 'true') return 1
  if (value === false || value === 0 || value === '0' || value === 'false') return 0
  return null
}

function date(value) {
  const normalized = text(value, 10)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const [year, month, day] = normalized.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? normalized
    : null
}

function month(value) {
  const normalized = text(value, 7)
  return normalized && /^\d{4}-(0[1-9]|1[0-2])$/.test(normalized) ? normalized : null
}

function options(value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map((item) => text(item, 16)).filter((item) => WORK_OPTIONS.includes(item)))]
}

function taxRate(value) {
  const number = optionalNumber(value)
  if (number === null) return null
  return number > 0 && number <= 1 ? number * 100 : number
}

function normalizeItem(item = {}, index = 0) {
  return {
    rowNo: index + 1,
    companyPartNo: text(item.companyPartNo ?? item.company_part_no, 100),
    oemSpec: text(item.oemSpec ?? item.oem_spec ?? item.partNo ?? item.part_no, 255),
    name: text(item.name, 255),
    description: text(item.description, 4000),
    warrantyService: text(item.warrantyService ?? item.warranty_service, 255),
    installBy: text(item.installBy ?? item.install_by, 64),
    qty: optionalNumber(item.qty),
    unitPrice: optionalNumber(item.unitPrice ?? item.unit_price),
    vendor: text(item.vendor, 255),
    costInclTax: optionalNumber(item.costInclTax ?? item.cost_incl_tax),
    taxRate: taxRate(item.taxRate ?? item.tax_rate),
    quotedUnitPrice: optionalNumber(item.quotedUnitPrice ?? item.quoted_unit_price),
    purchaseOrderNo: text(item.purchaseOrderNo ?? item.purchase_order_no, 255),
    costSource: text(item.costSource ?? item.cost_source, 255),
  }
}

function itemHasContent(item) {
  return Boolean(
    item.name || item.description || item.oemSpec || item.companyPartNo || item.vendor
    || item.purchaseOrderNo || item.qty !== null || item.unitPrice !== null
    || item.costInclTax !== null || item.taxRate !== null,
  )
}

function costExcludingTax(item) {
  if (item.costInclTax === null || item.taxRate === null) return null
  const cost = Number(item.costInclTax)
  const rate = Number(item.taxRate)
  if (!Number.isFinite(cost) || !Number.isFinite(rate) || rate < 0) return null
  return cost / (1 + rate / 100)
}

function calculateItems(pricingMode, totalExcludingTax, rawItems = []) {
  const items = rawItems.slice(0, 200).map(normalizeItem).filter(itemHasContent)
  const mode = Number(pricingMode)
  const total = Number(totalExcludingTax)

  if (mode === 2 && items.length === 1) {
    items.push(normalizeItem({ name: '技术服务', qty: 1, costInclTax: 0, taxRate: 6 }, 1))
  }

  const costs = items.map(costExcludingTax)
  const totalCost = costs.reduce((sum, cost) => sum + (cost ?? 0), 0)
  const preserveQuotedPrices = mode === 1 && items.length > 0 && items.every((item) => item.quotedUnitPrice !== null)
  const completeCosts = costs.every((cost) => cost !== null)
  const lastAllocationIndex = items.reduce((last, item, index) => Number(item.qty) > 0 && costs[index] !== null ? index : last, -1)
  let allocatedSales = 0
  return items.map((item, index) => {
    const qty = Number(item.qty)
    const cost = costs[index]
    let unitPrice = item.unitPrice
    let subtotal = null
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(total) && total >= 0) {
      if (preserveQuotedPrices) unitPrice = Number(item.quotedUnitPrice)
      else if (mode === 1 && completeCosts && totalCost > 0) {
        subtotal = index === lastAllocationIndex ? round(total - allocatedSales, 2) : round((cost ?? 0) / totalCost * total, 2)
        allocatedSales += subtotal
        unitPrice = subtotal / qty
      }
      if (mode === 2 && index < 2) unitPrice = total * (index === 0 ? 0.99 : 0.01) / qty
    }
    if (subtotal === null) subtotal = Number.isFinite(qty) && Number.isFinite(unitPrice) ? qty * unitPrice : null
    const marginRate = subtotal > 0 && cost !== null ? (subtotal - cost) / subtotal * 100 : null
    return {
      ...item,
      rowNo: index + 1,
      unitPrice: unitPrice === null ? null : round(unitPrice, 6),
      subtotal: subtotal === null ? null : round(subtotal, 2),
      costExcludingTax: cost === null ? null : round(cost, 2),
      marginRate: marginRate === null ? null : round(marginRate, 4),
    }
  })
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalizeOrder(body = {}) {
  const pricingMode = optionalNumber(body.pricingMode ?? body.pricing_mode)
  const rawTotal = optionalNumber(body.totalExcludingTax ?? body.total_excluding_tax)
  const order = {
    customerId: optionalNumber(body.customerId ?? body.customer_id),
    customerContactId: optionalNumber(body.customerContactId ?? body.customer_contact_id),
    salesOwnerId: optionalNumber(body.salesOwnerId ?? body.sales_owner_id),
    customerName: text(body.customerName ?? body.customer_name, 255),
    contactName: text(body.contactName ?? body.contact_name, 255),
    caseCategory: text(body.caseCategory ?? body.case_category, 32),
    customerPo: text(body.customerPo ?? body.customer_po, 255),
    ctrlNo: text(body.ctrlNo ?? body.ctrl_no, 64),
    invoiceType: text(body.invoiceType ?? body.invoice_type, 32),
    pricingMode,
    totalExcludingTax: rawTotal,
    hasContract: bool(body.hasContract ?? body.has_contract),
    contractType: text(body.contractType ?? body.contract_type, 32),
    hasPenalty: bool(body.hasPenalty ?? body.has_penalty),
    penaltyContent: text(body.penaltyContent ?? body.penalty_content, 500),
    invoiceProcess: text(body.invoiceProcess ?? body.invoice_process, 32),
    billingContent: text(body.billingContent ?? body.billing_content, 500),
    invoiceRecipient: text(body.invoiceRecipient ?? body.invoice_recipient, 255),
    billingTiming: text(body.billingTiming ?? body.billing_timing, 255),
    purchaser: text(body.purchaser, 255),
    purchaserTel: text(body.purchaserTel ?? body.purchaser_tel, 64),
    recipient: text(body.recipient, 255),
    recipientTel: text(body.recipientTel ?? body.recipient_tel, 64),
    recipientMail: text(body.recipientMail ?? body.recipient_mail, 255),
    paymentTerms: text(body.paymentTerms ?? body.payment_terms, 32),
    paymentOther: text(body.paymentOther ?? body.payment_other, 255),
    splitDelivery: bool(body.splitDelivery ?? body.split_delivery),
    acceptance: text(body.acceptance, 32),
    acceptanceOther: text(body.acceptanceOther ?? body.acceptance_other, 255),
    installOptions: options(body.installOptions ?? body.install_options),
    maintenanceOptions: options(body.maintenanceOptions ?? body.maintenance_options),
    contractNo: text(body.contractNo ?? body.contract_no, 255),
    fillDate: date(body.fillDate ?? body.fill_date),
    latestDeliveryDate: date(body.latestDeliveryDate ?? body.latest_delivery_date),
    deliveryLocation: text(body.deliveryLocation ?? body.delivery_location, 500),
    shipmentNo: text(body.shipmentNo ?? body.shipment_no, 255),
    deliveryTerms: text(body.deliveryTerms ?? body.delivery_terms, 255),
    grossProfitRecognitionStartMonth: month(body.grossProfitRecognitionStartMonth ?? body.gross_profit_recognition_start_month),
    grossProfitRecognitionAmount: optionalNumber(body.grossProfitRecognitionAmount ?? body.gross_profit_recognition_amount),
    remainingRecognizableGrossProfit: optionalNumber(body.remainingRecognizableGrossProfit ?? body.remaining_recognizable_gross_profit),
    taiwanBusinessTransferStartMonth: month(body.taiwanBusinessTransferStartMonth ?? body.taiwan_business_transfer_start_month),
    taiwanBusinessTransferAmount: optionalNumber(body.taiwanBusinessTransferAmount ?? body.taiwan_business_transfer_amount),
    remainingTaiwanBusinessTransfer: optionalNumber(body.remainingTaiwanBusinessTransfer ?? body.remaining_taiwan_business_transfer),
    quotationFileId: optionalNumber(body.quotationFileId ?? body.quotation_file_id),
    remark: text(body.remark, 10000),
  }
  order.hasContract = order.contractNo ? 1 : 0
  order.contractType = null
  order.hasPenalty = order.hasContract && order.penaltyContent ? 1 : 0
  if (!order.hasContract) order.penaltyContent = null
  const bodyItems = Array.isArray(body.items) ? body.items : []
  const rawItems = String(order.invoiceType || '').startsWith('6%')
    ? bodyItems.map((item) => ({ ...item, taxRate: 6 }))
    : bodyItems
  const items = calculateItems(pricingMode, rawTotal, rawItems)
  if (pricingMode === 3) {
    order.totalExcludingTax = round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0), 2)
  }
  return { order, items }
}

function validateWorkOptions(label, value, errors) {
  if (!value.length) errors.push({ field: `${label}Options`, message: `请选择${label}承担方（可选择 NO）` })
  if (value.includes('NO') && value.length > 1) errors.push({ field: `${label}Options`, message: `${label}选择 NO 时不能同时选择其它承担方` })
}

function validateSubmission(order, items) {
  const errors = []
  const requireValue = (field, value, message) => {
    if (value === null || value === undefined || value === '') errors.push({ field, message })
  }

  requireValue('latestDeliveryDate', order.latestDeliveryDate, '请选择最晚交货日')
  requireValue('customerId', order.customerId, '请选择客户档案')
  requireValue('customerName', order.customerName, '请选择客户名称')
  requireValue('purchaser', order.purchaser, '请填写采购联系人')
  requireValue('recipient', order.recipient, '请填写收件人')
  requireValue('billingTiming', order.billingTiming, '请填写开票/收款时间')
  requireValue('invoiceType', order.invoiceType, '请选择发票别')
  requireValue('pricingMode', order.pricingMode, '请选择计价模式')
  requireValue('invoiceProcess', order.invoiceProcess, '请选择发票处理方式')
  requireValue('billingContent', order.billingContent, '请填写开票内容')
  requireValue('paymentTerms', order.paymentTerms, '请选择付款条件')
  requireValue('splitDelivery', order.splitDelivery, '请选择是否分批送机')
  requireValue('caseCategory', order.caseCategory, '请选择案分类')
  requireValue('acceptance', order.acceptance, '请选择验收条件')
  if (order.invoiceType && !INVOICE_TYPES.includes(order.invoiceType)) errors.push({ field: 'invoiceType', message: '发票别无效' })
  if (![1, 2, 3].includes(order.pricingMode)) errors.push({ field: 'pricingMode', message: '计价模式无效' })
  if (order.invoiceProcess && !INVOICE_PROCESSES.includes(order.invoiceProcess)) errors.push({ field: 'invoiceProcess', message: '发票处理方式无效' })
  if (order.paymentTerms && !PAYMENT_TERMS.includes(order.paymentTerms)) errors.push({ field: 'paymentTerms', message: '付款条件无效' })
  if (order.paymentTerms === '其他') requireValue('paymentOther', order.paymentOther, '请填写付款条件说明')
  if (order.caseCategory && !CASE_CATEGORIES.includes(order.caseCategory)) errors.push({ field: 'caseCategory', message: '案分类无效' })
  if (order.acceptance && !ACCEPTANCE_TYPES.includes(order.acceptance)) errors.push({ field: 'acceptance', message: '验收条件无效' })
  if (order.acceptance === '其他') requireValue('acceptanceOther', order.acceptanceOther, '请填写验收条件说明')

  validateWorkOptions('装机', order.installOptions, errors)
  validateWorkOptions('维护', order.maintenanceOptions, errors)

  if ([1, 2].includes(order.pricingMode) && !(order.totalExcludingTax > 0)) {
    errors.push({ field: 'totalExcludingTax', message: '系统集成模式的未税总计必须大于 0' })
  }
  if (!items.length) errors.push({ field: 'items', message: '至少填写一个品项' })

  items.forEach((item, index) => {
    const label = `第 ${index + 1} 项`
    if (!item.name && !item.description) errors.push({ field: `items.${index}.name`, message: `${label}请填写品名或描述` })
    if (!(item.qty >= 1)) errors.push({ field: `items.${index}.qty`, message: `${label}数量必须大于等于 1` })
    if (!(item.unitPrice >= 0)) errors.push({ field: `items.${index}.unitPrice`, message: `${label}单价不得小于 0` })
    const serviceRow = order.pricingMode === 2 && index === 1
    if (!serviceRow && !item.vendor) errors.push({ field: `items.${index}.vendor`, message: `${label}请填写厂商` })
    if (!(item.costInclTax >= 0)) errors.push({ field: `items.${index}.costInclTax`, message: `${label}成本含税不得小于 0` })
    if (![6, 13].includes(item.taxRate)) errors.push({ field: `items.${index}.taxRate`, message: `${label}成本税率只能是 6% 或 13%` })
    if (['6%普通发票', '6%服务发票'].includes(order.invoiceType) && item.taxRate === 13) errors.push({ field: `items.${index}.taxRate`, message: `${label}6%发票的成本税率只能选 6%` })
    if (order.pricingMode === 3 && item.marginRate !== null && item.marginRate < 0) errors.push({ field: `items.${index}.unitPrice`, message: `${label}毛利率不能为负` })
  })

  if (order.pricingMode === 1 && items.length) {
    const margins = items.map((item) => item.marginRate).filter((value) => value !== null)
    if (margins.length !== items.length) errors.push({ field: 'items', message: '多项系统集成需要完整填写每项成本，才能计算毛利' })
    else if (!items.every((item) => item.quotedUnitPrice !== null) && Math.max(...margins) - Math.min(...margins) > 0.01) errors.push({ field: 'items', message: '按成本分摊的多项系统集成各品项毛利率必须一致' })
  }

  if (order.pricingMode === 2) {
    if (items.length !== 2) errors.push({ field: 'items', message: '单项系统集成只能填写主项和技术服务两项' })
    if (items[1] && !`${items[1].name || ''}${items[1].description || ''}`.includes('服务')) errors.push({ field: 'items.1.name', message: '第二项必须是技术服务' })
    if (items[1] && Number(items[1].costInclTax) !== 0) errors.push({ field: 'items.1.costInclTax', message: '技术服务项成本必须为 0' })
  }

  return errors
}

function totals(order, items) {
  const sales = items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0)
  const costExcl = items.reduce((sum, item) => sum + (item.costExcludingTax ?? 0), 0)
  const costIncl = items.reduce((sum, item) => sum + (item.costInclTax ?? 0), 0)
  const completeCosts = items.every((item) => item.costInclTax !== null && item.costExcludingTax !== null)
  const taxRateValue = order.invoiceType?.startsWith('13%') ? 13 : 6
  const vat = sales * taxRateValue / 100
  const marginRate = completeCosts && sales > 0 ? (sales - costExcl) / sales * 100 : null
  return {
    salesExcludingTax: round(sales, 2),
    vat: round(vat, 2),
    salesIncludingTax: round(sales + vat, 2),
    costExcludingTax: completeCosts ? round(costExcl, 2) : null,
    costIncludingTax: completeCosts ? round(costIncl, 2) : null,
    marginRate: marginRate === null ? null : round(marginRate, 4),
  }
}

function computeApprovalSteps(order, items) {
  const result = totals(order, items)
  const steps = [
    { seq: 1, key: 'assistant', label: '助理', role: STEP_ROLES.assistant },
    { seq: 2, key: 'sales', label: '业务负责人', role: STEP_ROLES.sales },
  ]
  if (order.installOptions.includes('敦阳')) steps.push({ seq: steps.length + 1, key: 'engineering', label: '工程会签单位', role: STEP_ROLES.engineering })
  steps.push({ seq: steps.length + 1, key: 'supervisor', label: '处级单位', role: STEP_ROLES.supervisor })
  if (result.salesExcludingTax > 750000 || (result.marginRate !== null && result.marginRate < 15)) {
    steps.push({ seq: steps.length + 1, key: 'vp', label: '副总经理', role: STEP_ROLES.vp })
  }
  return steps
}

module.exports = {
  constants: { INVOICE_TYPES, CONTRACT_TYPES, INVOICE_PROCESSES, PAYMENT_TERMS, CASE_CATEGORIES, ACCEPTANCE_TYPES, WORK_OPTIONS },
  STEP_ROLES,
  normalizeOrder,
  validateSubmission,
  totals,
  computeApprovalSteps,
}
