const PDFDocument = require('pdfkit')
const { registerFonts } = require('../../service-orders/service-record-pdf')

const PAGE = { width: 841.89, height: 595.28, margin: 28 }
const PURPLE = '#4e386e'
const MUTED = '#64748b'
const BORDER = '#94a3b8'
const PDF_FORMAT_VERSION = 4

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

function time(input) {
  return input ? String(input).replace('T', ' ').slice(0, 16) : ''
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
  text(doc, fonts, 'STARK / NINGBO TECHNOLOGY INC.', left, 20, { size: 7, color: MUTED })
  text(doc, fonts, '敦阳（宁波）科技有限公司', left, 30, { size: 13, bold: true, color: PURPLE })
  text(doc, fonts, title, 280, 24, { size: 17, bold: true, color: PURPLE, width: 282, align: 'center' })
  text(doc, fonts, `V${Number(order.versionNo || order.version_no || 0)}`, right - 112, 21, { size: 9, bold: true, width: 112, align: 'right' })
  text(doc, fonts, value(order.ctrlNo || order.ctrl_no), right - 180, 34, { size: 9, width: 180, align: 'right' })
  line(doc, left, 50, right, 50, PURPLE)
  return 58
}

function summary(doc, fonts, order, y) {
  const cells = [
    ['客户', order.customerName || order.customer_name],
    ['客户 P/O', order.customerPo || order.customer_po],
    ['负责业务', order.salesOwnerName || order.sales_owner_name],
    ['最晚交货日', order.latestDeliveryDate || order.latest_delivery_date],
  ].filter(([, content]) => hasValue(content))
  const width = (PAGE.width - PAGE.margin * 2) / Math.max(1, cells.length)
  cells.forEach(([label, content], index) => {
    const x = PAGE.margin + width * index
    doc.rect(x, y, width, 36).strokeColor(BORDER).lineWidth(0.5).stroke()
    text(doc, fonts, label, x + 6, y + 5, { size: 6.5, color: MUTED })
    text(doc, fonts, content, x + 6, y + 16, { size: 8.5, bold: true, width: width - 12, height: 16 })
  })
  return cells.length ? y + 44 : y
}

function itemField(item, camel, snake = camel) {
  return item[camel] ?? item[snake]
}

function itemDescription(item) {
  return [item.name, item.description && item.description !== item.name ? item.description : null].filter(hasValue).join('\n')
}

function itemColumns(items) {
  const definitions = [
    { key: 'index', label: '#', weight: 3, align: 'center', optional: false, present: () => true, content: (_item, index) => index + 1 },
    { key: 'companyPartNo', label: '公司料号', weight: 7, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'companyPartNo', 'company_part_no')), content: (item) => itemField(item, 'companyPartNo', 'company_part_no') },
    { key: 'oemSpec', label: '原厂规格', weight: 9, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'oemSpec', 'oem_spec')), content: (item) => itemField(item, 'oemSpec', 'oem_spec') },
    { key: 'description', label: '品名 / 描述', weight: 18, align: 'left', optional: false, present: (item) => hasValue(itemDescription(item)), content: itemDescription },
    { key: 'warranty', label: '保固服务', weight: 8, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'warrantyService', 'warranty_service')), content: (item) => itemField(item, 'warrantyService', 'warranty_service') },
    { key: 'install', label: '装机方', weight: 6, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'installBy', 'install_by')), content: (item) => itemField(item, 'installBy', 'install_by') },
    { key: 'qty', label: '数量', weight: 4, align: 'right', optional: false, present: (item) => hasValue(item.qty), content: (item) => item.qty },
    { key: 'unitPrice', label: '销售单价', weight: 8, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'unitPrice', 'unit_price')), content: (item) => hasValue(itemField(item, 'unitPrice', 'unit_price')) ? `¥ ${money(itemField(item, 'unitPrice', 'unit_price'))}` : '' },
    { key: 'subtotal', label: '销售小计 / 毛利率', weight: 9, align: 'right', optional: false, present: (item) => hasValue(item.subtotal), content: (item) => [`¥ ${money(item.subtotal)}`, hasValue(itemField(item, 'marginRate', 'margin_rate')) ? `${Number(itemField(item, 'marginRate', 'margin_rate')).toFixed(2)}%` : ''].filter(hasValue).join('\n') },
    { key: 'vendor', label: '厂商', weight: 8, align: 'left', optional: true, present: (item) => hasValue(item.vendor), content: (item) => item.vendor },
    { key: 'costExcludingTax', label: '成本未税', weight: 8, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'costExcludingTax', 'cost_excluding_tax')), content: (item) => hasValue(itemField(item, 'costExcludingTax', 'cost_excluding_tax')) ? `¥ ${money(itemField(item, 'costExcludingTax', 'cost_excluding_tax'))}` : '' },
    { key: 'costInclTax', label: '成本含税 / 税率', weight: 9, align: 'right', optional: false, present: (item) => hasValue(itemField(item, 'costInclTax', 'cost_incl_tax')) || hasValue(itemField(item, 'taxRate', 'tax_rate')), content: (item) => [hasValue(itemField(item, 'costInclTax', 'cost_incl_tax')) ? `¥ ${money(itemField(item, 'costInclTax', 'cost_incl_tax'))}` : '', hasValue(itemField(item, 'taxRate', 'tax_rate')) ? `${value(itemField(item, 'taxRate', 'tax_rate'))}%` : ''].filter(hasValue).join('\n') },
    { key: 'purchase', label: '采购单号 / 来源', weight: 9, align: 'left', optional: true, present: (item) => hasValue(itemField(item, 'purchaseOrderNo', 'purchase_order_no')) || hasValue(itemField(item, 'costSource', 'cost_source')), content: (item) => [itemField(item, 'purchaseOrderNo', 'purchase_order_no'), itemField(item, 'costSource', 'cost_source')].filter(hasValue).join('\n') },
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
    doc.rect(x, y, column.width, 22).fillAndStroke(PURPLE, PURPLE)
    text(doc, fonts, column.label, x + 3, y + 7, { size: 7, bold: true, color: '#fff', width: column.width - 6, align: column.align })
    x += column.width
  }
  return y + 22
}

function itemRowHeight(doc, fonts, item, index, columns) {
  doc.font(fonts.regular).fontSize(7)
  return Math.max(30, ...columns.map((column) => doc.heightOfString(value(column.content(item, index)), { width: column.width - 6, lineGap: 1 }) + 10))
}

function itemRow(doc, fonts, item, index, columns, y, maxHeight = Infinity) {
  const rowHeight = Math.min(itemRowHeight(doc, fonts, item, index, columns), maxHeight)
  let x = PAGE.margin
  columns.forEach((column) => {
    doc.rect(x, y, column.width, rowHeight).strokeColor(BORDER).lineWidth(0.45).stroke()
    // ponytail: 超长内容按单元格截断加省略号，避免整行溢出页面；需要全文时再做跨页拆分
    text(doc, fonts, column.content(item, index), x + 3, y + 5, { size: 7, width: column.width - 6, height: rowHeight - 8, align: column.align, lineGap: 1, ellipsis: true })
    x += column.width
  })
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
    ['未税售价', moneyText(sales)], ['未税成本', moneyText(cost)],
    ['毛利', moneyText(sales - cost)], ['毛利率', margin === null ? '' : `${Number(margin).toFixed(2)}%`],
  ].filter(([, content]) => hasValue(content))
  const width = 150
  let x = PAGE.width - PAGE.margin - width * cells.length
  for (const [label, content] of cells) {
    doc.rect(x, y, width, 31).strokeColor(BORDER).lineWidth(0.5).stroke()
    text(doc, fonts, label, x + 6, y + 4, { size: 6.5, color: MUTED })
    text(doc, fonts, content, x + 6, y + 15, { size: 9, bold: true, width: width - 12, align: 'right' })
    x += width
  }
  return y + 39
}

function orderField(order, camel, snake = camel) {
  return order[camel] ?? order[snake]
}

const HEADER_DUPLICATES = new Set(['客户名称', '客户 P/O', '负责业务', 'Ctrl.NO', '未税总计', '最晚交货日'])

function detailEntries(order, includeVoidReason = true) {
  const splitDelivery = orderField(order, 'splitDelivery', 'split_delivery')
  const files = Array.isArray(order.quotationFiles || order.quotation_files) ? (order.quotationFiles || order.quotation_files).map((file) => file.name).filter(hasValue).join('、') : ''
  const pricing = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }[Number(orderField(order, 'pricingMode', 'pricing_mode'))] || ''
  const entries = [
    ['客户名称', orderField(order, 'customerName', 'customer_name')],
    ['客户联系人', orderField(order, 'contactName', 'contact_name')],
    ['客户 P/O', orderField(order, 'customerPo', 'customer_po')],
    ['Ctrl.NO', orderField(order, 'ctrlNo', 'ctrl_no')],
    ['负责业务', orderField(order, 'salesOwnerName', 'sales_owner_name')],
    ['案分类', orderField(order, 'caseCategory', 'case_category')],
    ['计价模式', pricing],
    ['未税总计', hasValue(orderField(order, 'totalExcludingTax', 'total_excluding_tax')) ? `¥ ${money(orderField(order, 'totalExcludingTax', 'total_excluding_tax'))}` : ''],
    ['发票别', orderField(order, 'invoiceType', 'invoice_type')],
    ['发票处理', orderField(order, 'invoiceProcess', 'invoice_process')],
    ['开票内容', orderField(order, 'billingContent', 'billing_content')],
    ['发票收件人', orderField(order, 'invoiceRecipient', 'invoice_recipient')],
    ['开票 / 收款', orderField(order, 'billingTiming', 'billing_timing')],
    ['采购联系人', order.purchaser],
    ['采购联系电话', orderField(order, 'purchaserTel', 'purchaser_tel')],
    ['货物收件人', order.recipient],
    ['收件电话', orderField(order, 'recipientTel', 'recipient_tel')],
    ['收件邮箱', orderField(order, 'recipientMail', 'recipient_mail')],
    ['付款条件', orderField(order, 'paymentTerms', 'payment_terms')],
    ['付款条件说明', orderField(order, 'paymentOther', 'payment_other')],
    ['分批送机', hasValue(splitDelivery) ? (Number(splitDelivery) ? '可分批' : '不分批') : ''],
    ['验收', order.acceptance],
    ['验收说明', orderField(order, 'acceptanceOther', 'acceptance_other')],
    ['装机对象', options(order.installOptions || order.install_options)],
    ['维护对象', options(order.maintenanceOptions || order.maintenance_options)],
    ['合同号', orderField(order, 'contractNo', 'contract_no')],
    ['罚则说明', orderField(order, 'penaltyContent', 'penalty_content')],
    ['填表日期', orderField(order, 'fillDate', 'fill_date')],
    ['最晚交货日', orderField(order, 'latestDeliveryDate', 'latest_delivery_date')],
    ['送机地点', orderField(order, 'deliveryLocation', 'delivery_location')],
    ['出货单号', orderField(order, 'shipmentNo', 'shipment_no')],
    ['交货条款', orderField(order, 'deliveryTerms', 'delivery_terms')],
    ['报价附件', files],
    ['备注', order.remark],
    ['作废原因', includeVoidReason ? orderField(order, 'voidReason', 'void_reason') : ''],
  ]
  return entries.filter(([label, content]) => hasValue(content) && !HEADER_DUPLICATES.has(label))
}

const DETAIL_GROUPS = [
  ['客户与合同', ['客户联系人', '案分类', '合同号', '罚则说明', '填表日期', '报价附件']],
  ['交易与开票', ['计价模式', '发票别', '发票处理', '开票内容', '发票收件人', '开票 / 收款', '付款条件', '付款条件说明']],
  ['交付与验收', ['分批送机', '验收', '验收说明', '装机对象', '维护对象', '送机地点', '交货条款', '出货单号']],
  ['联系与收件', ['采购联系人', '采购联系电话', '货物收件人', '收件电话', '收件邮箱']],
  ['备注与其他', ['备注', '作废原因']],
]

function details(doc, fonts, order, y, includeVoidReason = true) {
  const left = PAGE.margin
  const width = PAGE.width - PAGE.margin * 2
  const columns = 4
  const colWidth = width / columns
  const bottom = PAGE.height - 32
  const entries = detailEntries(order, includeVoidReason)
  const drawTitle = () => {
    text(doc, fonts, '订购与交付资料', left, y, { size: 10, bold: true, color: PURPLE })
    y += 15
  }
  drawTitle()
  const groupOf = new Map()
  for (const [group, labels] of DETAIL_GROUPS) for (const label of labels) groupOf.set(label, group)
  const grouped = DETAIL_GROUPS.map(([group]) => [group, entries.filter(([label]) => groupOf.get(label) === group)]).filter(([, list]) => list.length)
  for (const [group, groupEntries] of grouped) {
    if (y + 42 > bottom) {
      doc.addPage()
      y = header(doc, fonts, order, '客户订购申请单 · 资料续页')
      drawTitle()
    }
    doc.rect(left, y + 1.5, 3, 8).fill(PURPLE)
    text(doc, fonts, group, left + 7, y, { size: 8, bold: true, color: PURPLE })
    y += 13
    for (let start = 0; start < groupEntries.length; start += columns) {
      const row = groupEntries.slice(start, start + columns)
      doc.font(fonts.regular).fontSize(7)
      const rawHeight = Math.max(27, ...row.map(([, content]) => doc.heightOfString(value(content), { width: colWidth - 12, lineGap: 1 }) + 15))
      if (y + rawHeight > bottom) {
        doc.addPage()
        y = header(doc, fonts, order, '客户订购申请单 · 资料续页')
        drawTitle()
        doc.rect(left, y + 1.5, 3, 8).fill(PURPLE)
        text(doc, fonts, group, left + 7, y, { size: 8, bold: true, color: PURPLE })
        y += 13
      }
      const rowHeight = Math.min(rawHeight, Math.max(27, bottom - y))
      row.forEach(([label, content], index) => {
        const x = left + index * colWidth
        const rowY = y
        doc.rect(x, rowY, colWidth, rowHeight).strokeColor(BORDER).lineWidth(0.45).stroke()
        text(doc, fonts, label, x + 6, rowY + 4, { size: 6.5, color: MUTED, width: colWidth - 12 })
        // ponytail: 超长内容截断加省略号，避免整行溢出页面；需要全文时再做跨页拆分
        text(doc, fonts, content, x + 6, rowY + 14, { size: 7, width: colWidth - 12, height: rowHeight - 17, lineGap: 1, ellipsis: true })
      })
      y += rowHeight
    }
    y += 4
  }
  return y + 4
}

function signatureImage(doc, dataUrl, x, y, width, height) {
  const match = String(dataUrl || '').match(/^data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return false
  try {
    doc.image(Buffer.from(match[1], 'base64'), x, y, { fit: [width, height], align: 'center', valign: 'center' })
    return true
  } catch {
    return false
  }
}

function approvalBoxHeight(doc, fonts, rows) {
  const width = (PAGE.width - PAGE.margin * 2) / Math.max(1, rows.length)
  doc.font(fonts.regular).fontSize(6)
  const reasonHeight = Math.max(0, ...rows.filter((approval) => hasValue(approval.reason)).map((approval) => doc.heightOfString(value(approval.reason), { width: width - 10, align: 'center' })))
  return 76 + (reasonHeight ? Math.ceil(reasonHeight) + 4 : 0)
}

function approvals(doc, fonts, rows, y) {
  text(doc, fonts, '电子签核记录', PAGE.margin, y, { size: 10, bold: true, color: PURPLE })
  y += 16
  const width = (PAGE.width - PAGE.margin * 2) / Math.max(1, rows.length)
  const boxHeight = approvalBoxHeight(doc, fonts, rows)
  rows.forEach((approval, index) => {
    const x = PAGE.margin + width * index
    const signature = approval.approverSignatureSnapshot || approval.approver_signature_snapshot
    const action = approval.action === 'approve' ? '已签核' : approval.action === 'reject' ? '已驳回' : approval.action === 'skipped' ? '已跳过' : ''
    doc.rect(x, y, width, boxHeight).strokeColor(BORDER).lineWidth(0.5).stroke()
    text(doc, fonts, approval.stepLabel || approval.step_label, x + 5, y + 5, { size: 7, bold: true, width: width - 10, align: 'center' })
    text(doc, fonts, action, x + 5, y + 17, { size: 7, color: approval.action === 'approve' ? '#047857' : approval.action === 'reject' ? '#b91c1c' : MUTED, width: width - 10, align: 'center' })
    signatureImage(doc, signature, x + 8, y + 27, width - 16, 25)
    text(doc, fonts, approval.approverNameSnapshot || approval.approver_name_snapshot || approval.approverName, x + 5, y + 54, { size: 7, bold: true, width: width - 10, align: 'center' })
    text(doc, fonts, time(approval.decidedAt || approval.decided_at), x + 5, y + 65, { size: 6, color: MUTED, width: width - 10, align: 'center' })
    if (hasValue(approval.reason)) text(doc, fonts, approval.reason, x + 5, y + 76, { size: 6, color: MUTED, width: width - 10, height: boxHeight - 78, align: 'center' })
  })
  return y + boxHeight + 8
}

function watermark(doc, fonts, label) {
  if (!label) return
  doc.save().opacity(0.12).fillColor('#b91c1c').font(fonts.bold).fontSize(54)
    .rotate(-24, { origin: [PAGE.width / 2, PAGE.height / 2] })
    .text(label, 160, PAGE.height / 2 - 35, { width: 520, align: 'center' })
    .restore()
}

function drawWatermarks(doc, fonts, label) {
  if (!label) return
  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index)
    watermark(doc, fonts, label)
  }
}

function drawFooters(doc, fonts) {
  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index)
    text(doc, fonts, `MR 审批存档文件 · 第 ${index + 1} 页 / 共 ${range.count} 页`, PAGE.margin, PAGE.height - 18, { size: 6.5, color: MUTED, width: PAGE.width - PAGE.margin * 2, align: 'center' })
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
    y = header(doc, fonts, order, '客户订购申请单 · 审批存档')
  }
  y = totals(doc, fonts, order, items, y + 5)
  y = details(doc, fonts, order, y, Boolean(watermarkLabel))
  if (approvalRows.length) {
    const approvalSpace = approvalBoxHeight(doc, fonts, approvalRows) + 24
    if (y + approvalSpace > bottom) {
      doc.addPage()
      y = header(doc, fonts, order, '客户订购申请单 · 审批存档')
    }
    approvals(doc, fonts, approvalRows, y)
  }
  drawWatermarks(doc, fonts, watermarkLabel)
  drawFooters(doc, fonts)
  return doc
}

module.exports = { buildMrPdf, PDF_FORMAT_VERSION }
