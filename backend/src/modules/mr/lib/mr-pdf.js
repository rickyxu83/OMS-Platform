const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const { registerFonts } = require('../../service-orders/service-record-pdf')

// 页眉 logo（与前端预览同一张 dunyang-mark.png），只读取一次
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'dunyang-mark.png')
let logoBufferCache
function getLogoBuffer() {
  if (logoBufferCache === undefined) {
    try {
      logoBufferCache = fs.readFileSync(LOGO_PATH)
    } catch {
      logoBufferCache = null
    }
  }
  return logoBufferCache
}

const PAGE = { width: 841.89, height: 595.28, margin: 28 }
const PURPLE = '#6d5bd0'
const MUTED = '#64748b'
const BORDER = '#eef1f5'
const PDF_FORMAT_VERSION = 37

function hasValue(input) {
  if (Array.isArray(input)) return input.length > 0
  return input !== null && input !== undefined && String(input).trim() !== ''
}

function value(input, fallback = '') {
  return hasValue(input) ? String(input).trim() : fallback
}

function money(input, fallback = '') {
  if (!hasValue(input)) return fallback
  const number = Number(input)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fallback
}
function moneyText(input) { return hasValue(input) ? `¥ ${money(input)}` : '' }

function dateText(input) {
  const match = value(input).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  return match ? `${match[1]} 年 ${Number(match[2])} 月${match[3] ? ` ${Number(match[3])} 日` : ''}` : value(input)
}

function scheduleText(date, initialAmount, remainingAmount, action) {
  return [
    hasValue(date) ? `${dateText(date)}起${action}` : '',
    hasValue(initialAmount) ? `首期 ${moneyText(initialAmount)}` : '',
    hasValue(remainingAmount) ? `剩余 ${moneyText(remainingAmount)}（按季）` : '',
  ].filter(hasValue).join(' · ')
}

function parseJsonList(input) {
  if (Array.isArray(input)) return input
  if (typeof input !== 'string' || !input) return []
  try { const parsed = JSON.parse(input); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

function entryText(entry, action) {
  if (!entry) return ''
  const period = entry.frequency === 'quarterly' ? '每季度' : '每月'
  const prefix = hasValue(entry.businessName) ? `${entry.businessName}：` : ''
  return [
    prefix + (hasValue(entry.startMonth) ? `${dateText(entry.startMonth)}起` : ''),
    hasValue(entry.amount) ? `${period}${action} ${moneyText(entry.amount)}` : '',
  ].filter(hasValue).join('')
}

function scheduleEntriesText(rawEntries, legacyStartMonth, legacyAmount, legacyRemaining, action) {
  const entries = parseJsonList(rawEntries)
  if (entries.length) return entries.map((entry) => entryText(entry, action)).filter(hasValue).join('\n')
  if (hasValue(legacyStartMonth) || hasValue(legacyAmount)) {
    const head = entryText({ startMonth: String(legacyStartMonth || '').slice(0, 7), frequency: 'quarterly', amount: legacyAmount }, action)
    return [head, hasValue(legacyRemaining) ? `剩余 ${moneyText(legacyRemaining)}（按季）` : ''].filter(hasValue).join(' · ')
  }
  return ''
}

function time(input) {
  return input ? String(input).replace('T', ' ').slice(0, 16) : ''
}

function abbreviateVendor(input) {
  return value(input)
    .replace(/(?:计算机系统集成|系统集成|计算机|信息|网络|电子|科技|技术|贸易|商贸|实业|自动化|设备|咨询|服务)?(?:股份)?有限公司$/, '')
    .replace(/(?:计算机系统集成|系统集成|计算机|信息|网络|电子|科技|技术|贸易|商贸|实业|自动化|设备|咨询|服务)+$/, '') || value(input)
}

function options(input) {
  return Array.isArray(input) && input.length ? input.join('、') : ''
}

function text(doc, fonts, content, x, y, options = {}) {
  const { size = 8, bold = false, color = '#111827', ...rest } = options
  doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color).text(value(content), x, y, rest)
}

function line(doc, x1, y1, x2, y2, color = BORDER) {
  doc.strokeColor(color).lineWidth(0.6).moveTo(x1, y1).lineTo(x2, y2).stroke()
}

function header(doc, fonts, order, title = '客户订购申请单（境内单）') {
  const left = PAGE.margin
  const right = PAGE.width - PAGE.margin
  const logoImage = getLogoBuffer()
  if (logoImage) doc.image(logoImage, left, 18, { width: 26, height: 26 })
  const textLeft = left + (logoImage ? 34 : 0)
  text(doc, fonts, 'STARK (NINGBO) TECHNOLOGY INC.', textLeft, 20, { size: 7, color: MUTED })
  text(doc, fonts, '敦阳（宁波）科技有限公司', textLeft, 30, { size: 13, bold: true, color: '#402080' })
  text(doc, fonts, title, 280, 24, { size: 17, bold: true, color: '#111827', width: 282, align: 'center' })
  text(doc, fonts, `V${Number(order.versionNo || order.version_no || 0)}`, right - 112, 21, { size: 9, bold: true, width: 112, align: 'right' })
  text(doc, fonts, `单据编号 ${value(order.ctrlNo || order.ctrl_no)}`, right - 190, 34, { size: 9, width: 190, align: 'right' })
  line(doc, left, 50, right, 50, '#111')
  return 58
}

function summary(doc, fonts, order, y) {
  const left = PAGE.margin
  const right = PAGE.width - PAGE.margin
  const width = (right - left) / 4
  const statusLabels = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }
  const statusLabel = statusLabels[order.status || order.status_code] || value(order.status)
  const invoiceLine = [value(order.invoiceType || order.invoice_type), value(order.billingContent || order.billing_content)].filter(hasValue).join(' · ')
  const cells = [
    { label: '客户 / CUSTOMER', main: value(order.customerName || order.customer_name, '-'), sub: value(order.customerPo || order.customer_po) ? '客户 P/O：' + value(order.customerPo || order.customer_po) : '' },
    { label: '交付 / DELIVERY', main: value(order.latestDeliveryDate || order.latest_delivery_date, '-'), sub: value(orderField(order, 'deliveryLocation', 'delivery_location')) ? '交付地点：' + value(orderField(order, 'deliveryLocation', 'delivery_location')) : '' },
    { label: '交易条款 / TERMS', main: value(order.paymentTerms || order.payment_terms, '-'), sub: invoiceLine ? '发票类型 / 开票内容：' + invoiceLine : '' },
    { label: '状态 / STATUS', main: statusLabel, sub: 'V' + Number(order.versionNo || order.version_no || 0) },
  ]
  cells.forEach((cell, index) => {
    const x = left + width * index
    text(doc, fonts, cell.label, x + 6, y + 3, { size: 6.3, color: MUTED, width: width - 12, ellipsis: true })
    text(doc, fonts, cell.main, x + 6, y + 13, { size: 8.5, bold: true, width: width - 12, height: 12, ellipsis: true })
    if (cell.sub) text(doc, fonts, cell.sub, x + 6, y + 25, { size: 6, color: MUTED, width: width - 12, ellipsis: true })
  })
  line(doc, left, y + 36, right, y + 36, '#e5e7eb')
  return y + 44
}

function itemField(item, camel, snake = camel) {
  return item[camel] ?? item[snake]
}

function itemDescription(item) {
  return [item.name, item.description && item.description !== item.name ? item.description : null].filter(hasValue).join('\n')
}

function itemColumns(items) {
  const definitions = [
    { key: 'index', label: '序号', weight: 3, align: 'center', optional: false, present: () => true, content: (_item, index) => index + 1 },
    { key: 'companyPartNo', label: '公司料号', weight: 7, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'companyPartNo', 'company_part_no')), content: (item) => itemField(item, 'companyPartNo', 'company_part_no') },
    { key: 'oemSpec', label: '原厂规格', weight: 9, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'oemSpec', 'oem_spec')), content: (item) => itemField(item, 'oemSpec', 'oem_spec') },
    { key: 'description', label: '品名及描述', weight: 18, align: 'left', optional: false, present: (item) => hasValue(itemDescription(item)), content: itemDescription },
    { key: 'warranty', label: '保固与服务', weight: 8, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'warrantyService', 'warranty_service')), content: (item) => itemField(item, 'warrantyService', 'warranty_service') },
    { key: 'install', label: '品项装机方', weight: 6, align: 'center', optional: true, present: (item) => hasValue(itemField(item, 'installBy', 'install_by')), content: (item) => itemField(item, 'installBy', 'install_by') },
    { key: 'qty', label: '数量', weight: 4, align: 'center', optional: false, present: (item) => hasValue(item.qty), content: (item) => item.qty },
    { key: 'unitPrice', label: '未税单价', weight: 8, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'unitPrice', 'unit_price')), content: (item) => hasValue(itemField(item, 'unitPrice', 'unit_price')) ? `¥ ${money(itemField(item, 'unitPrice', 'unit_price'))}` : '' },
    { key: 'subtotal', label: '未税小计 / 毛利率', weight: 9, align: 'right', optional: false, present: (item) => hasValue(item.subtotal), content: (item) => [`¥ ${money(item.subtotal)}`, hasValue(itemField(item, 'marginRate', 'margin_rate')) ? `${Number(itemField(item, 'marginRate', 'margin_rate')).toFixed(2)}%` : ''].filter(hasValue).join('\n') },
    { key: 'vendor', label: '供应商', weight: 8, align: 'center', optional: true, present: (item) => hasValue(item.vendor), content: (item) => abbreviateVendor(item.vendor) },
    { key: 'costExcludingTax', label: '采购成本（不含税）', weight: 8, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'costExcludingTax', 'cost_excluding_tax')), content: (item) => hasValue(itemField(item, 'costExcludingTax', 'cost_excluding_tax')) ? `¥ ${money(itemField(item, 'costExcludingTax', 'cost_excluding_tax'))}` : '' },
    { key: 'costInclTax', label: '采购成本（含税）', weight: 9, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'costInclTax', 'cost_incl_tax')) || hasValue(itemField(item, 'taxRate', 'tax_rate')), content: (item) => [hasValue(itemField(item, 'costInclTax', 'cost_incl_tax')) ? `¥ ${money(itemField(item, 'costInclTax', 'cost_incl_tax'))}` : '', hasValue(itemField(item, 'taxRate', 'tax_rate')) ? `${value(itemField(item, 'taxRate', 'tax_rate'))}%` : ''].filter(hasValue).join('\n') },
    { key: 'purchase', label: '采购订单号', weight: 9, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'purchaseOrderNo', 'purchase_order_no')), content: (item) => itemField(item, 'purchaseOrderNo', 'purchase_order_no') },
  ]
  const visible = definitions.filter((column) => !column.optional || items.some(column.present))
  const available = PAGE.width - PAGE.margin * 2
  const totalWeight = visible.reduce((sum, column) => sum + column.weight, 0)
  let used = 0
  return visible.map((column, index) => {
    const width = index === visible.length - 1 ? available - used : available * column.weight / totalWeight
    used += width
    return { ...column, width }
  })
}

function itemHeader(doc, fonts, columns, y) {
  let x = PAGE.margin
  for (const column of columns) {
    text(doc, fonts, column.label, x + 3, y + 8, { size: 6.7, bold: true, color: '#475569', width: column.width - 6, align: column.align, lineGap: 0 })
    x += column.width
  }
  line(doc, PAGE.margin, y + 24, PAGE.width - PAGE.margin, y + 24, '#111827')
  return y + 30
}

function itemRowHeight(doc, fonts, item, index, columns) {
  doc.font(fonts.regular).fontSize(7)
  return Math.max(30, ...columns.map((column) => doc.heightOfString(value(column.content(item, index)), { width: column.width - 6, lineGap: 1 }) + 10))
}

function itemRow(doc, fonts, item, index, columns, y, maxHeight = Infinity) {
  const rowHeight = Math.min(itemRowHeight(doc, fonts, item, index, columns), maxHeight)
  let x = PAGE.margin
  columns.forEach((column) => {
    // ponytail: 超长内容按单元格截断加省略号，避免整行溢出页面；需要全文时再做跨页拆分
    text(doc, fonts, column.content(item, index), x + 3, y + 5, { size: 7, width: column.width - 6, height: rowHeight - 8, align: column.align, lineGap: 1, ellipsis: true })
    x += column.width
  })
  line(doc, PAGE.margin, y + rowHeight - 1, PAGE.width - PAGE.margin, y + rowHeight - 1, '#eef1f5')
  return y + rowHeight
}

function totals(doc, fonts, order, items, y) {
  const totalsValue = order.totals || {}
  const sales = Number(totalsValue.salesExcludingTax ?? items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0))
  const cost = Number(totalsValue.costExcludingTax ?? items.reduce((sum, item) => {
    const amount = Number(item.costInclTax ?? item.cost_incl_tax)
    const rate = Number(item.taxRate ?? item.tax_rate)
    return sum + (Number.isFinite(amount) && Number.isFinite(rate) ? amount / (1 + rate / 100) : 0)
  }, 0))
  const margin = totalsValue.marginRate ?? (sales > 0 ? (sales - cost) / sales * 100 : null)
  const cells = [
    ['未税总计', moneyText(sales)],
    ['销售税额', moneyText(totalsValue.vat)],
    ['含税总计', moneyText(totalsValue.salesIncludingTax)],
    ['采购成本（不含税）', moneyText(cost)],
    ['采购成本（含税）', moneyText(totalsValue.costIncludingTax)],
    ['毛利额', moneyText(sales - cost)],
    ['整单毛利率', margin === null ? '' : `${Number(margin).toFixed(2)}%`],
  ].filter(([, content]) => hasValue(content))
  const totalWidth = PAGE.width - PAGE.margin * 2
  const width = totalWidth / Math.max(1, cells.length)
  doc.roundedRect(PAGE.margin, y, totalWidth, 33, 8).fill('#f5f6fa')
  let x = PAGE.margin
  cells.forEach(([label, content], index) => {
    text(doc, fonts, label, x + 10, y + 5, { size: 6.5, color: MUTED })
    text(doc, fonts, content, x + 10, y + 16, { size: 9, bold: true, color: index === cells.length - 1 ? PURPLE : '#111827', width: width - 14 })
    x += width
  })
  return y + 41
}

function orderField(order, camel, snake = camel) {
  return order[camel] ?? order[snake]
}

const HEADER_DUPLICATES = new Set(['客户名称', '客户 P/O', '业务负责人', 'Ctrl.NO', '未税总计', '最晚交付日期', '填表日期', '发票类型', '开票内容', '付款条件', '交付地点'])

const DETAIL_GROUPS = [
  ['客户与合同', ['客户联系人', '业务负责人', '项目分类', '合同编号', '罚则说明', '填表日期']],
  ['交易与开票', ['计价模式', '发票类型', '开票方式', '开票内容', '开票/收款时间', '付款条件', '付款条件说明']],
  ['交付与验收', ['是否允许分批交付', '验收条件', '验收说明', '装机承担方', '维护承担方', '交付地点', '交付条款', '出货单编号']],
  ['联系与收件', ['采购联系人', '采购联系电话', '采购联系邮箱', '收货人', '收货联系电话', '收货邮箱', '发票收件人', '发票收件电话', '发票收件邮箱']],
]

function detailEntries(order, items = []) {
  const splitDelivery = orderField(order, 'splitDelivery', 'split_delivery')
  const pricing = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }[Number(orderField(order, 'pricingMode', 'pricing_mode'))] || ''
  const entries = [
    ['客户名称', orderField(order, 'customerName', 'customer_name')],
    ['客户联系人', orderField(order, 'contactName', 'contact_name')],
    ['客户 P/O', orderField(order, 'customerPo', 'customer_po')],
    ['Ctrl.NO', orderField(order, 'ctrlNo', 'ctrl_no')],
    ['业务负责人', orderField(order, 'salesOwnerName', 'sales_owner_name')],
    ['项目分类', orderField(order, 'caseCategory', 'case_category')],
    ['计价模式', pricing],
    ['未税总计', hasValue(orderField(order, 'totalExcludingTax', 'total_excluding_tax')) ? `¥ ${money(orderField(order, 'totalExcludingTax', 'total_excluding_tax'))}` : ''],
    ['发票类型', orderField(order, 'invoiceType', 'invoice_type')],
    ['开票方式', orderField(order, 'invoiceProcess', 'invoice_process')],
    ['开票内容', orderField(order, 'billingContent', 'billing_content')],
    ['发票收件人', orderField(order, 'invoiceRecipient', 'invoice_recipient')],
    ['发票收件电话', orderField(order, 'invoiceRecipientTel', 'invoice_recipient_tel')],
    ['发票收件邮箱', orderField(order, 'invoiceRecipientMail', 'invoice_recipient_mail')],
    ['开票/收款时间', orderField(order, 'billingTiming', 'billing_timing')],
    ['采购联系人', order.purchaser],
    ['采购联系电话', orderField(order, 'purchaserTel', 'purchaser_tel')],
    ['采购联系邮箱', orderField(order, 'purchaserMail', 'purchaser_mail')],
    ['收货人', order.recipient],
    ['收货联系电话', orderField(order, 'recipientTel', 'recipient_tel')],
    ['收货邮箱', orderField(order, 'recipientMail', 'recipient_mail')],
    ['付款条件', orderField(order, 'paymentTerms', 'payment_terms')],
    ['付款条件说明', orderField(order, 'paymentOther', 'payment_other')],
    ['是否允许分批交付', hasValue(splitDelivery) ? (Number(splitDelivery) ? '允许分批交付' : '不允许分批交付') : ''],
    ['验收条件', order.acceptance],
    ['验收说明', orderField(order, 'acceptanceOther', 'acceptance_other')],
    ...(items.some((item) => hasValue(itemField(item, 'installBy', 'install_by'))) ? [] : [['装机承担方', options(order.installOptions || order.install_options)]]),
    ['维护承担方', options(order.maintenanceOptions || order.maintenance_options)],
    ['合同编号', orderField(order, 'contractNo', 'contract_no')],
    ['罚则说明', orderField(order, 'penaltyContent', 'penalty_content')],
    ['填表日期', orderField(order, 'fillDate', 'fill_date')],
    ['最晚交付日期', orderField(order, 'latestDeliveryDate', 'latest_delivery_date')],
    ['交付地点', orderField(order, 'deliveryLocation', 'delivery_location')],
    ['出货单编号', orderField(order, 'shipmentNo', 'shipment_no')],
    ['交付条款', orderField(order, 'deliveryTerms', 'delivery_terms')],
  ]
  return entries.filter(([label, content]) => hasValue(content) && !HEADER_DUPLICATES.has(label))
}

function noteEntries(order, includeVoidReason) {
  return [
    ['毛利认列', scheduleEntriesText(
      orderField(order, 'grossProfitRecognitions', 'gross_profit_recognitions'),
      orderField(order, 'grossProfitRecognitionStartMonth', 'gross_profit_recognition_start_month'),
      orderField(order, 'grossProfitRecognitionAmount', 'gross_profit_recognition_amount'),
      orderField(order, 'remainingRecognizableGrossProfit', 'remaining_recognizable_gross_profit'),
      '认列',
    )],
    ['台湾业务转拨', scheduleEntriesText(
      orderField(order, 'taiwanBusinessTransfers', 'taiwan_business_transfers'),
      orderField(order, 'taiwanBusinessTransferStartMonth', 'taiwan_business_transfer_start_month'),
      orderField(order, 'taiwanBusinessTransferAmount', 'taiwan_business_transfer_amount'),
      orderField(order, 'remainingTaiwanBusinessTransfer', 'remaining_taiwan_business_transfer'),
      '转拨',
    )],
    ['备注', order.remark],
    ['作废原因', includeVoidReason ? orderField(order, 'voidReason', 'void_reason') : ''],
  ].filter(([, content]) => hasValue(content))
}

function detailCardHeight(doc, fonts, entries, columns, colWidth) {
  let height = 22
  for (let start = 0; start < entries.length; start += columns) {
    const row = entries.slice(start, start + columns)
    doc.font(fonts.regular).fontSize(6.8)
    height += Math.min(42, Math.max(24, ...row.map(([, content]) => doc.heightOfString(value(content), { width: colWidth - 16, lineGap: 1 }) + 16)))
  }
  return height + 3
}

function drawDetailCard(doc, fonts, group, entries, x, y, width) {
  const columns = 3
  const colWidth = (width - 18) / columns
  const height = detailCardHeight(doc, fonts, entries, columns, colWidth)
  doc.circle(x + 12, y + 12, 2.3).fill(PURPLE)
  text(doc, fonts, group, x + 20, y + 6, { size: 7.8, bold: true, color: '#111827', width: width - 30 })
  let rowY = y + 22
  for (let start = 0; start < entries.length; start += columns) {
    const row = entries.slice(start, start + columns)
    doc.font(fonts.regular).fontSize(6.8)
    const rowHeight = Math.min(42, Math.max(24, ...row.map(([, content]) => doc.heightOfString(value(content), { width: colWidth - 16, lineGap: 1 }) + 16)))
    row.forEach(([label, content], index) => {
      const cellX = x + 9 + index * colWidth
      text(doc, fonts, label, cellX, rowY + 1, { size: 6.1, color: MUTED, width: colWidth - 16 })
      text(doc, fonts, content, cellX, rowY + 11, { size: 6.9, bold: true, width: colWidth - 16, height: rowHeight - 13, lineGap: 1, ellipsis: true })
    })
    rowY += rowHeight
  }
  return height
}

function noteCardHeight(doc, fonts, entries, width) {
  const contentWidth = width - 142
  doc.font(fonts.regular).fontSize(7)
  return 22 + entries.reduce((sum, [, content]) => sum + Math.min(45, Math.max(22, doc.heightOfString(value(content), { width: contentWidth, lineGap: 1 }) + 9)), 0) + 3
}

function drawNoteCard(doc, fonts, entries, x, y, width) {
  const height = noteCardHeight(doc, fonts, entries, width)
  doc.roundedRect(x, y, width, height, 6).fill('#f8f8fb')
  doc.rect(x, y + 7, 3, height - 14).fill(PURPLE)
  text(doc, fonts, '备注与其他', x + 12, y + 6, { size: 7.8, bold: true, color: PURPLE })
  let rowY = y + 22
  entries.forEach(([label, content], index) => {
    doc.font(fonts.regular).fontSize(7)
    const rowHeight = Math.min(45, Math.max(22, doc.heightOfString(value(content), { width: width - 142, lineGap: 1 }) + 9))
    if (index) line(doc, x + 12, rowY, x + width - 12, rowY, '#e5ddec')
    text(doc, fonts, label, x + 12, rowY + 6, { size: 6.6, bold: true, color: PURPLE, width: 104 })
    text(doc, fonts, content, x + 122, rowY + 6, { size: 7, width: width - 142, height: rowHeight - 8, lineGap: 1, ellipsis: true })
    rowY += rowHeight
  })
  return height
}

function details(doc, fonts, order, items, y, includeVoidReason = true) {
  const left = PAGE.margin
  const width = PAGE.width - PAGE.margin * 2
  const bottom = PAGE.height - 32
  const entries = detailEntries(order, items)
  const notes = noteEntries(order, includeVoidReason)
  const groupOf = new Map()
  for (const [group, labels] of DETAIL_GROUPS) for (const label of labels) groupOf.set(label, group)
  const grouped = DETAIL_GROUPS.map(([group]) => [group, entries.filter(([label]) => groupOf.get(label) === group)]).filter(([, list]) => list.length)
  const drawTitle = () => {
    text(doc, fonts, '订购与交付资料', left, y, { size: 10, bold: true, color: '#111827' })
    y += 17
  }
  const newPage = () => {
    doc.addPage()
    y = header(doc, fonts, order, '客户订购申请单 · 资料续页')
    drawTitle()
  }
  drawTitle()
  const cardGap = 8
  const cardWidth = (width - cardGap) / 2
  for (let start = 0; start < grouped.length; start += 2) {
    const cards = grouped.slice(start, start + 2)
    const heights = cards.map(([, groupEntries]) => detailCardHeight(doc, fonts, groupEntries, 3, (cardWidth - 18) / 3))
    const rowHeight = Math.max(...heights)
    if (y + rowHeight > bottom) newPage()
    cards.forEach(([group, groupEntries], index) => drawDetailCard(doc, fonts, group, groupEntries, left + index * (cardWidth + cardGap), y, cardWidth))
    y += rowHeight + 7
  }
  if (notes.length) {
    const height = noteCardHeight(doc, fonts, notes, width)
    if (y + height > bottom) newPage()
    y += drawNoteCard(doc, fonts, notes, left, y, width) + 7
  }
  return y + 2
}

function signatureImage(doc, dataUrl, x, y, width, height) {
  const match = String(dataUrl || '').match(/^data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return false
  try {
    const buffer = Buffer.from(match[1], 'base64')
    const img = doc.openImage(buffer)
    // 按签名自身比例等比 fit 进目标区域（可放大）；不统一高度，保持各签名原始形状
    const scale = Math.min(width / img.width, height / img.height)
    const finalW = img.width * scale
    const finalH = img.height * scale
    doc.image(buffer, x + (width - finalW) / 2, y + (height - finalH) / 2, { width: finalW, height: finalH })
    return true
  } catch {
    return false
  }
}

function approvalBoxHeight(doc, fonts, rows) {
  const width = (PAGE.width - PAGE.margin * 2) / Math.max(1, rows.length)
  doc.font(fonts.regular).fontSize(6)
  const reasonHeight = Math.max(0, ...rows.filter((approval) => hasValue(approval.reason)).map((approval) => doc.heightOfString(value(approval.reason), { width: width - 10, align: 'center' })))
  return 48 + (reasonHeight ? Math.ceil(reasonHeight) + 6 : 0)
}

function approvals(doc, fonts, rows, y) {
  text(doc, fonts, '电子签核记录', PAGE.margin, y, { size: 10, bold: true, color: '#111827' })
  y += 16
  const width = (PAGE.width - PAGE.margin * 2) / Math.max(1, rows.length)
  const boxHeight = approvalBoxHeight(doc, fonts, rows)
  rows.forEach((approval, index) => {
    const x = PAGE.margin + width * index
    const signature = approval.approverSignatureSnapshot || approval.approver_signature_snapshot
    const action = approval.action === 'approve' ? '已同意' : approval.action === 'reject' ? '已驳回' : approval.action === 'skipped' ? '不适用' : ''
    const stepKey = approval.stepKey || approval.step_key
    const stepLabel = stepKey === 'sales' ? '业务负责人' : stepKey === 'engineering' ? '工程会签' : approval.stepLabel || approval.step_label
    if (index > 0) {
      doc.moveTo(x, y + 6).lineTo(x, y + boxHeight - 6).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
    }
    const hasSignature = Boolean(signature) && signatureImage(doc, signature, x + 62, y + 2, 50, 40)
    const textWidth = width - (hasSignature ? 78 : 16)
    text(doc, fonts, stepLabel, x + 8, y + 2, { size: 6.5, bold: true, width: textWidth, align: 'left' })
    text(doc, fonts, action, x + 8, y + 11, { size: 6.5, color: approval.action === 'approve' ? '#047857' : approval.action === 'reject' ? '#b91c1c' : MUTED, width: textWidth, align: 'left' })
    text(doc, fonts, approval.approverNameSnapshot || approval.approver_name_snapshot || approval.approverName, x + 8, y + 22, { size: 6.5, bold: true, width: textWidth, align: 'left' })
    text(doc, fonts, time(approval.decidedAt || approval.decided_at), x + 8, y + 31, { size: 5.5, color: MUTED, width: textWidth, align: 'left' })
    if (hasValue(approval.reason)) text(doc, fonts, approval.reason, x + 8, y + 40, { size: 6, color: MUTED, width: width - 16, height: boxHeight - 42, align: 'left' })
  })
  return y + boxHeight + 8
}

function watermark(doc, fonts, label) {
  if (!label) return
  // 作废水印整页铺满（5×5 均布）并加深，翻拍/涂改无法绕过；作废原因在正文“作废原因”字段展示
  const rows = 5
  const cols = 5
  const cellWidth = PAGE.width / cols
  const cellHeight = PAGE.height / rows
  const size = 36
  const boxWidth = 170
  doc.save().fillColor('#b91c1c').font(fonts.bold)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = cellWidth * (col + 0.5)
      const y = cellHeight * (row + 0.5)
      doc.save()
        .opacity(0.3)
        .rotate(-24, { origin: [x, y] })
        .fontSize(size)
        .text('已作废', x - boxWidth / 2, y - size / 2, { width: boxWidth, align: 'center' })
        .restore()
    }
  }
  doc.restore()
}

function drawWatermarks(doc, fonts, label) {
  if (!label) return
  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index)
    watermark(doc, fonts, label)
  }
}

function drawFooters(doc, fonts, order) {
  const range = doc.bufferedPageRange()
  const fillDate = value(order && (order.fillDate || order.fill_date))
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index)
    const y = PAGE.height - 18
    line(doc, PAGE.margin, y - 7, PAGE.width - PAGE.margin, y - 7, '#eceef2')
    text(doc, fonts, `MR 电子签核归档文件${fillDate ? ` · 填表日期 ${fillDate}` : ''}`, PAGE.margin, y, { size: 6.5, color: MUTED })
    text(doc, fonts, '本文件由系统自动生成，为电子签核归档件', PAGE.margin, y, { size: 6.5, color: MUTED, width: PAGE.width - PAGE.margin * 2, align: 'center' })
    text(doc, fonts, `第 ${index + 1} / ${range.count} 页`, PAGE.width - PAGE.margin - 120, y, { size: 6.5, color: MUTED, width: 120, align: 'right' })
  }
}

function buildMrPdf(order, approvalRows = [], { watermarkLabel = '' } = {}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true, autoFirstPage: true, info: { Title: `${value(order.customerName || order.customer_name, 'MR')}_${value(order.ctrlNo || order.ctrl_no, order.id)}` } })
  const fonts = registerFonts(doc)
  const items = Array.isArray(order.items) ? order.items : []
  const columns = itemColumns(items)
  const bottom = PAGE.height - 45
  let y = summary(doc, fonts, order, header(doc, fonts, order))
  y = itemHeader(doc, fonts, columns, y)
  items.forEach((item, index) => {
    const needed = itemRowHeight(doc, fonts, item, index, columns)
    if (y + needed > bottom) {
      doc.addPage()
      y = itemHeader(doc, fonts, columns, header(doc, fonts, order, '客户订购申请单 · 明细续页'))
    }
    y = itemRow(doc, fonts, item, index, columns, y, bottom - y)
  })
  if (y + 45 > bottom) {
    doc.addPage()
    y = header(doc, fonts, order, '客户订购申请单 · 签核归档')
  }
  y = totals(doc, fonts, order, items, y + 5)
  y = details(doc, fonts, order, items, y, Boolean(watermarkLabel))
  if (approvalRows.length) {
    const approvalSpace = approvalBoxHeight(doc, fonts, approvalRows) + 24
    if (y + approvalSpace > bottom) {
      doc.addPage()
      y = header(doc, fonts, order, '客户订购申请单 · 签核归档')
    }
    approvals(doc, fonts, approvalRows, y)
  }
  drawWatermarks(doc, fonts, watermarkLabel)
  drawFooters(doc, fonts, order)
  return doc
}

module.exports = { buildMrPdf, PDF_FORMAT_VERSION }
