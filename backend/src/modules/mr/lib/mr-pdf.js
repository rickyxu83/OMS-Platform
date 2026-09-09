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
// 39：签名图归一化（笔迹+固定比例留白）且 PDF 签名区加宽按高度缩放，存量归档需重生成
const PDF_FORMAT_VERSION = 47

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
  const categoryLabel = entry.category === 'subscription' ? '订阅费用：' : entry.category === 'service' ? '服务费用：' : ''
  const prefix = categoryLabel + (hasValue(entry.businessName) ? `${entry.businessName}：` : '')
  const type = entry.type || (hasValue(entry.frequency) || hasValue(entry.amount) ? 'installments' : '')
  // 无有效总金额（未填或为 0）视为未填写
  const total = hasValue(entry.totalAmount) && Number(entry.totalAmount) > 0 ? Number(entry.totalAmount) : null
  // 新版：一次性（仅总金额）
  if (type === 'once') return total !== null ? `${prefix}一次性${action}，总金额 ${moneyText(total)}` : ''
  // 新版分期：开始月份 + 期数 + 总金额 → 自动每期金额（季度结算：每年 3、6、9、12 月）
  if (total !== null) {
    const periods = Number(entry.periods) > 0 ? Number(entry.periods) : null
    const per = periods ? total / periods : null
    const head = hasValue(entry.startMonth) ? `自 ${dateText(entry.startMonth)}起` : ''
    const count = periods ? `分 ${periods} 期${action}` : `分期${action}`
    const perText = per !== null ? `，每期 ${moneyText(per)}` : ''
    return `${prefix}${head}${count}${perText}，总金额 ${moneyText(total)}`
  }
  // 旧版：频率 + 每期金额
  if (!hasValue(entry.amount) || Number(entry.amount) <= 0) return ''
  const period = entry.frequency === 'quarterly' ? '每季度' : '每月'
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

// 全局字号放大 20%：用户反馈归档 PDF 字体较网页预览偏小。
// 所有文字经 text() 渲染，此处统一缩放；行高/卡片高度由 heightOfString 实测处同步缩放（见下方各测量点）
const FONT_SCALE = 1.2

function text(doc, fonts, content, x, y, options = {}) {
  const { size = 8, bold = false, color = '#111827', ...rest } = options
  doc.font(bold ? fonts.bold : fonts.regular).fontSize(Math.round(size * FONT_SCALE * 10) / 10).fillColor(color).text(value(content), x, y, rest)
}

function line(doc, x1, y1, x2, y2, color = BORDER) {
  doc.strokeColor(color).lineWidth(0.6).moveTo(x1, y1).lineTo(x2, y2).stroke()
}

// 分节标题：编号+名称粗体，后缀计数浅灰小字（与打印网页版 01/02/03 分节一致）
function sectionTitle(doc, fonts, y, label, suffix = '') {
  text(doc, fonts, label, PAGE.margin, y, { size: 10, bold: true, color: '#111827' })
  if (suffix) {
    doc.font(fonts.bold).fontSize(Math.round(10 * FONT_SCALE * 10) / 10)
    const labelWidth = doc.widthOfString(label)
    text(doc, fonts, suffix, PAGE.margin + labelWidth + 5, y + 1.2, { size: 7.5, color: MUTED })
  }
  return y + 17
}

function header(doc, fonts, order, title = '客户订购申请单（境内单）') {
  const left = PAGE.margin
  const right = PAGE.width - PAGE.margin
  const logoImage = getLogoBuffer()
  // LOGO 随全局字号同步放大（×1.2 = 31pt），页眉带高不变
  if (logoImage) doc.image(logoImage, left, 15.5, { width: 31, height: 31 })
  const textLeft = left + (logoImage ? 39 : 0)
  text(doc, fonts, 'STARK (NINGBO) TECHNOLOGY INC.', textLeft, 19.5, { size: 7, color: MUTED })
  text(doc, fonts, '敦阳（宁波）科技有限公司', textLeft, 29.5, { size: 13, bold: true, color: '#402080' })
  text(doc, fonts, title, 280, 24, { size: 17, bold: true, color: '#111827', width: 282, align: 'center' })
  text(doc, fonts, `Ctrl.No: ${value(order.ctrlNo || order.ctrl_no)}`, right - 190, 34, { size: 9, width: 190, align: 'right' })
  // 标题与分隔线之间留足呼吸空间（字号全局放大后原 50 位置视觉上贴字）
  line(doc, left, 54, right, 54, '#111')
  return 62
}

function summary(doc, fonts, order, y) {
  const left = PAGE.margin
  const right = PAGE.width - PAGE.margin
  // 页眉摘要只留最关键的 客户/交付/状态 三栏；客户 P/O、交付地点、交易条款（付款条件/发票类型/开票内容）
  // 与版本号一律下移或去重到下方资料区——灰色小字打印不清，且头部信息过于分散（用户反馈 2026-09-09）
  const width = (right - left) / 3
  const statusLabels = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }
  const statusLabel = statusLabels[order.status || order.status_code] || value(order.status)
  const cells = [
    { label: '客户 / CUSTOMER', main: value(order.customerName || order.customer_name, '-') },
    { label: '交付 / DELIVERY', main: value(order.latestDeliveryDate || order.latest_delivery_date, '-') },
    { label: '状态 / STATUS', main: statusLabel },
  ]
  cells.forEach((cell, index) => {
    const x = left + width * index
    text(doc, fonts, cell.label, x + 6, y + 2, { size: 6.3, color: MUTED, width: width - 12, ellipsis: true })
    text(doc, fonts, cell.main, x + 6, y + 11.5, { size: 8.5, bold: true, width: width - 12, height: 13, ellipsis: true })
  })
  line(doc, left, y + 26, right, y + 26, '#e5e7eb')
  return y + 32
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
    { key: 'partMerged', label: '公司料号 / 原厂规格', weight: 12, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'companyPartNo', 'company_part_no')) || hasValue(itemField(item, 'oemSpec', 'oem_spec')), content: (item) => [itemField(item, 'companyPartNo', 'company_part_no'), itemField(item, 'oemSpec', 'oem_spec')].filter(hasValue).join('\n') },
    { key: 'description', label: '品名及描述', weight: 21, align: 'left', optional: false, present: (item) => hasValue(itemDescription(item)), content: itemDescription },
    { key: 'warrantyInstall', label: '保固 / 装机', weight: 9, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'warrantyService', 'warranty_service')) || hasValue(itemField(item, 'installBy', 'install_by')), content: (item) => [itemField(item, 'warrantyService', 'warranty_service'), hasValue(itemField(item, 'installBy', 'install_by')) ? `装机：${itemField(item, 'installBy', 'install_by')}` : ''].filter(hasValue).join('\n') },
    { key: 'qty', label: '数量', weight: 4, align: 'center', optional: false, present: (item) => hasValue(item.qty), content: (item) => item.qty },
    { key: 'unitPrice', label: '未税单价', weight: 9, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'unitPrice', 'unit_price')), content: (item) => hasValue(itemField(item, 'unitPrice', 'unit_price')) ? `¥ ${money(itemField(item, 'unitPrice', 'unit_price'))}` : '' },
    { key: 'subtotal', label: '未税小计 / 毛利率', weight: 10, align: 'right', optional: false, present: (item) => hasValue(item.subtotal), content: (item) => [`¥ ${money(item.subtotal)}`, hasValue(itemField(item, 'marginRate', 'margin_rate')) ? `${Number(itemField(item, 'marginRate', 'margin_rate')).toFixed(2)}%` : ''].filter(hasValue).join('\n') },
    { key: 'costBoth', label: '采购价（未税 / 含税）', weight: 12, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'costExcludingTax', 'cost_excluding_tax')) || hasValue(itemField(item, 'costInclTax', 'cost_incl_tax')) || hasValue(itemField(item, 'taxRate', 'tax_rate')), content: (item) => [
      hasValue(itemField(item, 'costExcludingTax', 'cost_excluding_tax')) ? `¥ ${money(itemField(item, 'costExcludingTax', 'cost_excluding_tax'))}` : '',
      [hasValue(itemField(item, 'costInclTax', 'cost_incl_tax')) ? `含税 ¥ ${money(itemField(item, 'costInclTax', 'cost_incl_tax'))}` : '', hasValue(itemField(item, 'taxRate', 'tax_rate')) ? `${value(itemField(item, 'taxRate', 'tax_rate'))}%` : ''].filter(hasValue).join(' · '),
    ].filter(hasValue).join('\n') },
    // 供应商/采购单号列：供应商与采购单号同列两行，有值才印（与打印页同口径）
    { key: 'vendorPo', label: '供应商 / 采购单号', weight: 11, align: 'left', optional: true, present: (item) => hasValue(item.vendor) || hasValue(itemField(item, 'purchaseOrderNo', 'purchase_order_no')), content: (item) => [
      hasValue(item.vendor) ? abbreviateVendor(item.vendor) : '',
      hasValue(itemField(item, 'purchaseOrderNo', 'purchase_order_no')) ? `采购 ${itemField(item, 'purchaseOrderNo', 'purchase_order_no')}` : '',
    ].filter(hasValue).join('\n') },
    // 出货单号列固定保留并独立成列：系统已填则印出，未填留白供出货时手写
    { key: 'shipment', label: '出货单号', weight: 8, align: 'left', optional: false, present: () => true, content: (item) => itemField(item, 'shipmentNo', 'shipment_no') },
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
    // 表头加深加粗加大：打印件上栏位边界更清晰
    text(doc, fonts, column.label, x + 3, y + 7, { size: 7.2, bold: true, color: '#1f2937', width: column.width - 6, align: column.align, lineGap: 0 })
    x += column.width
  }
  line(doc, PAGE.margin, y + 24, PAGE.width - PAGE.margin, y + 24, '#111827')
  return y + 30
}

function itemRowHeight(doc, fonts, item, index, columns) {
  doc.font(fonts.regular).fontSize(7 * FONT_SCALE)
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
    ['采购价（未税）', moneyText(cost)],
    ['采购价（含税）', moneyText(totalsValue.costIncludingTax)],
    ['毛利额', moneyText(sales - cost)],
    ['整单毛利率', margin === null ? '' : `${Number(margin).toFixed(2)}%`],
  ].filter(([, content]) => hasValue(content))
  const totalWidth = PAGE.width - PAGE.margin * 2
  const width = totalWidth / Math.max(1, cells.length)
  doc.roundedRect(PAGE.margin, y, totalWidth, 33, 8).fill('#f5f6fa')
  // “含税总计”单元格淡紫高亮，整段加外框与分隔线，金额区一眼可辨
  const highlightIndex = cells.findIndex(([label]) => label === '含税总计')
  if (highlightIndex >= 0) {
    doc.save()
    doc.roundedRect(PAGE.margin, y, totalWidth, 33, 8).clip()
    doc.rect(PAGE.margin + width * highlightIndex, y, width, 33).fill('#e9e2f4')
    doc.restore()
  }
  let x = PAGE.margin
  cells.forEach(([label, content], index) => {
    text(doc, fonts, label, x + 10, y + 5, { size: 6.5, color: MUTED })
    text(doc, fonts, content, x + 10, y + 16, { size: 9.5, bold: true, color: index === highlightIndex || index === cells.length - 1 ? PURPLE : '#111827', width: width - 14 })
    if (index > 0) line(doc, x, y + 6, x, y + 27, '#dfe3ea')
    x += width
  })
  doc.roundedRect(PAGE.margin, y, totalWidth, 33, 8).strokeColor('#c7cdd8').lineWidth(0.8).stroke()
  return y + 41
}

function orderField(order, camel, snake = camel) {
  return order[camel] ?? order[snake]
}

// 页眉已精简为 客户/交付/状态 三栏：客户 P/O、交付地点、付款条件、发票类型、开票内容、业务负责人均归入下方资料区
const HEADER_DUPLICATES = new Set(['客户名称', 'Ctrl.NO', '未税总计', '最晚交付日期', '填表日期'])

const DETAIL_GROUPS = [
  ['客户与合同', ['客户联系人', '客户 P/O', '业务负责人', '项目分类', '合同编号', '罚则说明', '填表日期']],
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
    // 有合同但合同流程未走完时编号暂空，归档 PDF 上显式标注待补，避免空白歧义
    ['合同编号', orderField(order, 'contractNo', 'contract_no') || (Number(order.hasContract ?? order.has_contract) === 1 ? '合同流程中，待补编号' : '')],
    ['罚则说明', orderField(order, 'penaltyContent', 'penalty_content')],
    ['填表日期', orderField(order, 'fillDate', 'fill_date')],
    ['最晚交付日期', orderField(order, 'latestDeliveryDate', 'latest_delivery_date')],
    ['交付地点', orderField(order, 'deliveryLocation', 'delivery_location')],
    ['出货单编号', orderField(order, 'shipmentNo', 'shipment_no')],
    ['交付条款', orderField(order, 'deliveryTerms', 'delivery_terms')],
  ]
  return entries.filter(([label, content]) => hasValue(content) && !HEADER_DUPLICATES.has(label))
}

/** 转拨后留存毛利/留存毛利率的附注文本（附在“台湾业务转拨”行后，不占汇总格）。 */
function retentionSuffix(order) {
  const transferTotal = parseJsonList(orderField(order, 'taiwanBusinessTransfers', 'taiwan_business_transfers'))
    .reduce((sum, entry) => sum + (Number(entry?.totalAmount) || 0), 0)
  if (!(transferTotal > 0)) return ''
  const totalsValue = order.totals || {}
  const sales = Number(totalsValue.salesExcludingTax)
  const cost = Number(totalsValue.costExcludingTax)
  if (!Number.isFinite(sales) || !Number.isFinite(cost) || sales <= 0) return ''
  return `；扣除转拨后留存毛利 ${moneyText(sales - cost - transferTotal)} · 留存毛利率 ${((sales - cost - transferTotal) / sales * 100).toFixed(2)}%`
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
    ) + retentionSuffix(order)],
    ['备注', order.remark],
    ['作废原因', includeVoidReason ? orderField(order, 'voidReason', 'void_reason') : ''],
  ].filter(([, content]) => hasValue(content))
}

function detailCardHeight(doc, fonts, entries, columns, colWidth) {
  let height = 24
  for (let start = 0; start < entries.length; start += columns) {
    const row = entries.slice(start, start + columns)
    doc.font(fonts.regular).fontSize(6.8 * FONT_SCALE)
    height += Math.min(46, Math.max(26, ...row.map(([, content]) => doc.heightOfString(value(content), { width: colWidth - 16, lineGap: 1 }) + 16)))
  }
  return height + 3
}

function drawDetailCard(doc, fonts, group, entries, x, y, width) {
  const columns = 3
  const colWidth = (width - 18) / columns
  const height = detailCardHeight(doc, fonts, entries, columns, colWidth)
  doc.circle(x + 12, y + 12, 2.3).fill(PURPLE)
  text(doc, fonts, group, x + 20, y + 6, { size: 7.8, bold: true, color: '#111827', width: width - 30 })
  let rowY = y + 24
  for (let start = 0; start < entries.length; start += columns) {
    const row = entries.slice(start, start + columns)
    doc.font(fonts.regular).fontSize(6.8 * FONT_SCALE)
    const rowHeight = Math.min(46, Math.max(26, ...row.map(([, content]) => doc.heightOfString(value(content), { width: colWidth - 16, lineGap: 1 }) + 16)))
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
  doc.font(fonts.regular).fontSize(7 * FONT_SCALE)
  return 24 + entries.reduce((sum, [, content]) => sum + Math.min(50, Math.max(24, doc.heightOfString(value(content), { width: contentWidth, lineGap: 1 }) + 9)), 0) + 3
}

function drawNoteCard(doc, fonts, entries, x, y, width) {
  const height = noteCardHeight(doc, fonts, entries, width)
  doc.roundedRect(x, y, width, height, 6).fill('#f8f8fb')
  doc.rect(x, y + 7, 3, height - 14).fill(PURPLE)
  text(doc, fonts, '备注与其他', x + 12, y + 6, { size: 7.8, bold: true, color: PURPLE })
  let rowY = y + 24
  entries.forEach(([label, content], index) => {
    doc.font(fonts.regular).fontSize(7 * FONT_SCALE)
    const rowHeight = Math.min(50, Math.max(24, doc.heightOfString(value(content), { width: width - 142, lineGap: 1 }) + 9))
    if (index) line(doc, x + 12, rowY, x + width - 12, rowY, '#e5ddec')
    text(doc, fonts, label, x + 12, rowY + 6, { size: 6.6, bold: true, color: PURPLE, width: 104 })
    text(doc, fonts, content, x + 122, rowY + 6, { size: 7, width: width - 142, height: rowHeight - 8, lineGap: 1, ellipsis: true })
    rowY += rowHeight
  })
  return height
}

// 与 details() 同口径的高度估算：签名区防孤儿页时用来预判“合计+资料+签核”整段高度
function detailsHeight(doc, fonts, order, items, includeVoidReason = true) {
  const width = PAGE.width - PAGE.margin * 2
  const entries = detailEntries(order, items)
  const notes = noteEntries(order, includeVoidReason)
  const groupOf = new Map()
  for (const [group, labels] of DETAIL_GROUPS) for (const label of labels) groupOf.set(label, group)
  const grouped = DETAIL_GROUPS.map(([group]) => [group, entries.filter(([label]) => groupOf.get(label) === group)]).filter(([, list]) => list.length)
  const cardGap = 8
  const cardWidth = (width - cardGap) / 2
  let height = 17
  for (let start = 0; start < grouped.length; start += 2) {
    const cards = grouped.slice(start, start + 2)
    height += Math.max(...cards.map(([, groupEntries]) => detailCardHeight(doc, fonts, groupEntries, 3, (cardWidth - 18) / 3))) + 7
  }
  if (notes.length) height += noteCardHeight(doc, fonts, notes, width) + 7
  return height + 2
}

function details(doc, fonts, order, items, y, includeVoidReason = true, reserveBottom = 0) {
  const left = PAGE.margin
  const width = PAGE.width - PAGE.margin * 2
  // reserveBottom：为后续签核区预留的高度（防签名孤儿页），资料卡片分页按收紧后的底线判断
  const bottom = PAGE.height - 32 - reserveBottom
  const entries = detailEntries(order, items)
  const notes = noteEntries(order, includeVoidReason)
  const groupOf = new Map()
  for (const [group, labels] of DETAIL_GROUPS) for (const label of labels) groupOf.set(label, group)
  const grouped = DETAIL_GROUPS.map(([group]) => [group, entries.filter(([label]) => groupOf.get(label) === group)]).filter(([, list]) => list.length)
  const drawTitle = () => {
    y = sectionTitle(doc, fonts, y, '02 订购与交付资料', `· 共 ${entries.length + notes.length} 项`)
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
    // 签名图已归一化（笔迹+固定比例留白）：按高度等比缩放，各签名笔迹视觉高度一致；
    // 超宽签名超过宽度上限时退化为按宽度缩放
    let scale = height / img.height
    if (img.width * scale > width) scale = width / img.width
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
  doc.font(fonts.regular).fontSize(6 * FONT_SCALE)
  const reasonHeight = Math.max(0, ...rows.filter((approval) => hasValue(approval.reason)).map((approval) => doc.heightOfString(value(approval.reason), { width: width - 10, align: 'center' })))
  return 54 + (reasonHeight ? Math.ceil(reasonHeight) + 6 : 0)
}

function approvals(doc, fonts, rows, y) {
  y = sectionTitle(doc, fonts, y, '03 电子签核记录')
  y -= 1
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
    // 签名图右对齐钳制在单元格内（x + width - 98 起，宽 92）：超宽签名（如横屏英文连笔）
    // 按宽缩放且不再溢出压到下一格文本；文本相应收窄
    const signatureX = x + Math.max(8, width - 98)
    const hasSignature = Boolean(signature) && signatureImage(doc, signature, signatureX, y + 2, 92, 44)
    const textWidth = width - (hasSignature ? 112 : 16)
    text(doc, fonts, stepLabel, x + 8, y + 2, { size: 6.5, bold: true, width: textWidth, align: 'left' })
    text(doc, fonts, action, x + 8, y + 11, { size: 6.5, color: approval.action === 'approve' ? '#047857' : approval.action === 'reject' ? '#b91c1c' : MUTED, width: textWidth, align: 'left' })
    text(doc, fonts, approval.approverNameSnapshot || approval.approver_name_snapshot || approval.approverName, x + 8, y + 22, { size: 6.5, bold: true, width: textWidth, align: 'left' })
    text(doc, fonts, time(approval.decidedAt || approval.decided_at), x + 8, y + 31, { size: 5.5, color: MUTED, width: textWidth, align: 'left' })
    if (hasValue(approval.reason)) text(doc, fonts, approval.reason, x + 8, y + 40, { size: 6, color: MUTED, width: width - 16, height: boxHeight - 44, align: 'left' })
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
  y = sectionTitle(doc, fonts, y, '01 采购与销售明细', `· ${items.length} 个品项`)
  y = itemHeader(doc, fonts, columns, y)
  items.forEach((item, index) => {
    const needed = itemRowHeight(doc, fonts, item, index, columns)
    if (y + needed > bottom) {
      doc.addPage()
      y = itemHeader(doc, fonts, columns, header(doc, fonts, order, '客户订购申请单 · 明细续页'))
    }
    y = itemRow(doc, fonts, item, index, columns, y, bottom - y)
  })
  // 签名区防孤儿页：仅当当前页剩余空间已不足一小截（<150pt）、且整段能放进新页时，才把
  // “合计+资料+签核”整段移到新页；剩余空间尚可时让合计与资料卡片自然续排（资料区内部、
  // 签核区各有分页保护），避免表格后剩半页空白却整段跳到新页
  const approvalSpace = approvalRows.length ? approvalBoxHeight(doc, fonts, approvalRows) + 24 : 0
  const tailSpace = 5 + 41 + detailsHeight(doc, fonts, order, items, Boolean(watermarkLabel)) + approvalSpace
  const freshPageCapacity = (PAGE.height - 45) - 62
  if (y + tailSpace > bottom && bottom - y < 150 && tailSpace <= freshPageCapacity) {
    doc.addPage()
    y = header(doc, fonts, order, '客户订购申请单 · 签核归档')
  }
  if (y + 45 > bottom) {
    doc.addPage()
    y = header(doc, fonts, order, '客户订购申请单 · 签核归档')
  }
  y = totals(doc, fonts, order, items, y + 5)
  // 防签名孤儿页：给资料区预留签核区高度（含两侧底线差 13pt），排不进预留带的卡片/备注自动落到
  // 下一页与签核作伴；签核区因此总能跟在最后一张卡片/备注后面，不会单独成页
  y = details(doc, fonts, order, items, y, Boolean(watermarkLabel), approvalRows.length ? approvalSpace + 13 : 0)
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
