const PDFDocument = require('pdfkit')
const { registerFonts } = require('../../service-orders/service-record-pdf')

const PAGE = { width: 841.89, height: 595.28, margin: 28 }
const PURPLE = '#4e386e'
const MUTED = '#64748b'
const BORDER = '#94a3b8'

function value(input, fallback = '-') {
  const text = String(input ?? '').trim()
  return text || fallback
}

function money(input) {
  if (input === null || input === undefined || input === '') return '-'
  const number = Number(input)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
}

function time(input) {
  return input ? String(input).replace('T', ' ').slice(0, 16) : '-'
}

function options(input) {
  return Array.isArray(input) && input.length ? input.join('、') : '-'
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
    ['最晚交货', order.latestDeliveryDate || order.latest_delivery_date],
  ]
  const width = (PAGE.width - PAGE.margin * 2) / cells.length
  cells.forEach(([label, content], index) => {
    const x = PAGE.margin + width * index
    doc.rect(x, y, width, 36).strokeColor(BORDER).lineWidth(0.5).stroke()
    text(doc, fonts, label, x + 6, y + 5, { size: 6.5, color: MUTED })
    text(doc, fonts, content, x + 6, y + 16, { size: 8.5, bold: true, width: width - 12, height: 16 })
  })
  return y + 44
}

const COLUMNS = [
  ['#', 22, 'center'], ['公司料号', 62, 'left'], ['品名 / 原厂规格 / 描述', 170, 'left'],
  ['数量', 38, 'right'], ['销售单价', 70, 'right'], ['销售小计', 72, 'right'],
  ['厂商', 76, 'left'], ['成本含税', 70, 'right'], ['采购单号', 73, 'left'],
]

function itemHeader(doc, fonts, y) {
  let x = PAGE.margin
  for (const [label, width, align] of COLUMNS) {
    doc.rect(x, y, width, 22).fillAndStroke(PURPLE, PURPLE)
    text(doc, fonts, label, x + 3, y + 7, { size: 7, bold: true, color: '#fff', width: width - 6, align })
    x += width
  }
  return y + 22
}

function itemDescription(item) {
  return [
    item.name,
    item.oemSpec || item.oem_spec,
    item.description,
    `保固：${value(item.warrantyService || item.warranty_service)}`,
    `装机：${value(item.installBy || item.install_by)}`,
    `成本来源：${value(item.costSource || item.cost_source)}`,
  ].filter(Boolean).join('\n') || '-'
}

function itemRow(doc, fonts, item, index, y) {
  const description = itemDescription(item)
  const rowHeight = Math.max(30, Math.min(72, doc.heightOfString(description, { width: 164, fontSize: 7 }) + 8))
  const values = [
    index + 1, item.companyPartNo || item.company_part_no, description, item.qty,
    `¥ ${money(item.unitPrice ?? item.unit_price)}`, `¥ ${money(item.subtotal)}`,
    item.vendor, `¥ ${money(item.costInclTax ?? item.cost_incl_tax)}\n税率 ${value(item.taxRate ?? item.tax_rate)}%`, item.purchaseOrderNo || item.purchase_order_no,
  ]
  let x = PAGE.margin
  COLUMNS.forEach(([, width, align], column) => {
    doc.rect(x, y, width, rowHeight).strokeColor(BORDER).lineWidth(0.45).stroke()
    text(doc, fonts, values[column], x + 3, y + 5, { size: 7, width: width - 6, height: rowHeight - 8, align })
    x += width
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
    ['未税售价', `¥ ${money(sales)}`], ['未税成本', `¥ ${money(cost)}`],
    ['毛利', `¥ ${money(sales - cost)}`], ['毛利率', margin === null ? '-' : `${Number(margin).toFixed(2)}%`],
  ]
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

function details(doc, fonts, order, y) {
  text(doc, fonts, '交付与交易资料', PAGE.margin, y, { size: 10, bold: true, color: PURPLE })
  y += 15
  const entries = [
    ['客户资料', `${value(order.contactName || order.contact_name)} / P.O ${value(order.customerPo || order.customer_po)} / ${value(order.caseCategory || order.case_category)}`],
    ['采购联系人', `${value(order.purchaser)} / ${value(order.purchaserTel || order.purchaser_tel)}`],
    ['收件资料', `${value(order.recipient)} / ${value(order.recipientTel || order.recipient_tel)} / ${value(order.recipientMail || order.recipient_mail)}`],
    ['交货日期 / 地点', `${value(order.latestDeliveryDate || order.latest_delivery_date)} / ${value(order.deliveryLocation || order.delivery_location)}`],
    ['交货条款 / 出货单', `${value(order.deliveryTerms || order.delivery_terms)} / ${value(order.shipmentNo || order.shipment_no)}`],
    ['付款 / 分批', `${value(order.paymentTerms || order.payment_terms)} ${value(order.paymentOther || order.payment_other, '')} / ${Number(order.splitDelivery ?? order.split_delivery) ? '分批' : '不分批'}`],
    ['发票', `${value(order.invoiceType || order.invoice_type)} / ${value(order.invoiceProcess || order.invoice_process)} / ${value(order.billingContent || order.billing_content)}`],
    ['开票对象 / 时间', `${value(order.invoiceRecipient || order.invoice_recipient)} / ${value(order.billingTiming || order.billing_timing)}`],
    ['验收', `${value(order.acceptance)} ${value(order.acceptanceOther || order.acceptance_other, '')}`],
    ['装机 / 维护', `${options(order.installOptions || order.install_options)} / ${options(order.maintenanceOptions || order.maintenance_options)}`],
    ['合同', value(order.contractNo || order.contract_no)],
    ['罚则', value(order.penaltyContent || order.penalty_content)],
    ['备注', value(order.remark)],
    ['作废原因', value(order.voidReason || order.void_reason)],
  ].filter(([label, content]) => !['罚则', '备注', '作废原因'].includes(label) || content !== '-')
  const colWidth = (PAGE.width - PAGE.margin * 2) / 2
  entries.forEach(([label, content], index) => {
    const x = PAGE.margin + (index % 2) * colWidth
    const rowY = y + Math.floor(index / 2) * 27
    doc.rect(x, rowY, colWidth, 27).strokeColor(BORDER).lineWidth(0.45).stroke()
    text(doc, fonts, label, x + 5, rowY + 4, { size: 6.5, color: MUTED, width: 90 })
    text(doc, fonts, content, x + 92, rowY + 4, { size: 7, width: colWidth - 98, height: 20 })
  })
  return y + Math.ceil(entries.length / 2) * 27 + 8
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

function approvals(doc, fonts, rows, y) {
  text(doc, fonts, '电子签核记录', PAGE.margin, y, { size: 10, bold: true, color: PURPLE })
  y += 16
  const width = (PAGE.width - PAGE.margin * 2) / Math.max(1, rows.length)
  rows.forEach((approval, index) => {
    const x = PAGE.margin + width * index
    const signature = approval.approverSignatureSnapshot || approval.approver_signature_snapshot
    doc.rect(x, y, width, 76).strokeColor(BORDER).lineWidth(0.5).stroke()
    text(doc, fonts, approval.stepLabel || approval.step_label, x + 5, y + 5, { size: 7, bold: true, width: width - 10, align: 'center' })
    text(doc, fonts, approval.action === 'approve' ? '已同意' : approval.action === 'reject' ? '已驳回' : '未签核', x + 5, y + 17, { size: 7, color: approval.action === 'approve' ? '#047857' : '#b91c1c', width: width - 10, align: 'center' })
    if (!signatureImage(doc, signature, x + 8, y + 27, width - 16, 25) && approval.action === 'approve') {
      text(doc, fonts, '未设置手写签名', x + 5, y + 35, { size: 7, color: MUTED, width: width - 10, align: 'center' })
    }
    text(doc, fonts, approval.approverNameSnapshot || approval.approver_name_snapshot || approval.approverName || '-', x + 5, y + 54, { size: 7, bold: true, width: width - 10, align: 'center' })
    text(doc, fonts, time(approval.decidedAt || approval.decided_at), x + 5, y + 65, { size: 6, color: MUTED, width: width - 10, align: 'center' })
  })
  return y + 84
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
  let y = summary(doc, fonts, order, header(doc, fonts, order))
  y = itemHeader(doc, fonts, y)
  items.forEach((item, index) => {
    const description = itemDescription(item)
    const needed = Math.max(30, Math.min(72, doc.heightOfString(description, { width: 164, fontSize: 7 }) + 8))
    if (y + needed > PAGE.height - 45) {
      doc.addPage()
      y = itemHeader(doc, fonts, header(doc, fonts, order, '客户订购申请单 · 明细续页'))
    }
    y = itemRow(doc, fonts, item, index, y)
  })
  if (y + 310 > PAGE.height - 35) {
    doc.addPage()
    y = header(doc, fonts, order, '客户订购申请单 · 审批存档')
  }
  y = totals(doc, fonts, order, items, y + 5)
  y = details(doc, fonts, order, y)
  approvals(doc, fonts, approvalRows, y)
  drawWatermarks(doc, fonts, watermarkLabel)
  drawFooters(doc, fonts)
  return doc
}

module.exports = { buildMrPdf }
