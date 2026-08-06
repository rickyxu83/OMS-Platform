const { PDFParse } = require('pdf-parse')

function number(value) {
  const parsed = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function cleanOcrLine(value) {
  return String(value || '').replace(/[|{}\[\]()`]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseLooseItems(lines) {
  const items = []
  let pending = []
  const summary = /(未税|未稅|含税|含稅|总计|總計|合计|合計|總價|总价|备注|備註|付款|交货|交貨|有效期限)/i
  const fiveNumbers = /(?:^|\s)(\d+)\s+([\d,]+(?:\.\d+)?)\D+([\d,]+(?:\.\d+)?)\D+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*$/
  const threeNumbers = /(?:^|\s)(\d+)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*$/
  const flushPending = (fallback = '') => {
    const value = cleanOcrLine([...pending, fallback].filter(Boolean).join(' '))
    pending = []
    return value
  }

  for (const rawLine of lines) {
    const line = cleanOcrLine(rawLine)
    if (!line || summary.test(line)) { pending = []; continue }
    const match = line.match(fiveNumbers) || line.match(threeNumbers)
    if (match) {
      const prefix = cleanOcrLine(line.slice(0, match.index))
      const rawDescription = /^\d+\s/.test(prefix) ? flushPending(prefix) : prefix || flushPending()
      const description = cleanOcrLine(rawDescription.replace(/^\d+\s+/, '')) || '待人工核对品项'
      const partNo = description.match(/\b[A-Za-z][A-Za-z0-9+./-]{2,}\b/)?.[0] || ''
      const unitPrice = number(match[2]) || 0
      const extended = number(match[3]) || unitPrice * (number(match[1]) || 1)
      items.push({ item_no: String(items.length + 1), part_no: partNo, description, qty: number(match[1]) || 1, unit_price: unitPrice, extended })
      pending = []
      continue
    }
    if (line.startsWith('*') || /\b[A-Za-z][A-Za-z0-9+./-]{2,}\b/.test(line)) {
      pending = [...pending.slice(-1), line]
    }
  }
  return items
}
function parsePdfText(text) {
  const clean = String(text || '').replace(/\u00a0/g, ' ').trim()
  if (!clean) return { documentType: 'scanned_pdf', sheets: [], warnings: ['PDF 没有文字层，当前需要人工核对或 OCR 后再导入'] }
  const flat = clean.replace(/\s+/g, ' ')
  const order = /(purchase\s*order|订购单|訂購單|po\s*no)/i.test(clean)
  const taxMatch = clean.match(/(?:VAT|税率|稅率|税点|稅點)\s*([0-9]+(?:\.[0-9]+)?)%?/i)
  const taxRate = taxMatch ? number(taxMatch[1]) : null
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const customer = (lines.find((line) => /(?:公司|科技|有限公司)/.test(line) && !/供应商|厂商|Vendor/i.test(line)) || lines.find((line) => line && !/secret|机密/i.test(line)) || '').replace(/\s+\[[^\]]*(?:secret|机密)[^\]]*\]\s*$/i, '').trim()
  const cleanSegment = (value) => String(value || '').replace(/^[^:：]*[：:]\s*/, '').replace(/^\([^)]*\)\s*[:：]\s*/, '').trim()
  const po = clean.match(/PO\s*NO\.?\)?[^A-Z0-9]{0,12}([A-Z0-9-]+)/i)?.[1] || clean.match(/(?:订购单号|訂購單號)[：:\s]*(\d+)/i)?.[1] || ''
  const payment = cleanSegment(clean.match(/(?:付款方式|Payment)[^\n]*?[:：]\s*([^\n]+)/i)?.[1])
  const delivery = cleanSegment(clean.match(/(?:交货地点|交貨地點|Ship To)[^\n]*?[:：]\s*([^\n]+)/i)?.[1])
  const untaxedTotal = number(clean.match(/(?:未税总计|未稅總計|未税金额|未稅金額)[^\d]{0,40}(?:RMB\s*)?([\d,]+(?:\.\d+)?)/i)?.[1])
  const totalMatch = clean.match(/(?:含税金额|含稅金額|含税总计|含稅總計|含税合计|含稅合計|含稅\s*(?:\([^)]*\))?|含税\s*(?:\([^)]*\))?|总价|總價)[^\d]{0,40}(?:RMB|USD)?\s*([\d,]+(?:\.\d+)?)/i)
  const totalAmount = number(totalMatch?.[1])
  const items = []
  const tableStart = flat.search(/(?:\bQTY\b|数量|數量).*?(?:\bAmount\b|金额|金額)/i)
  const tableText = tableStart >= 0 ? flat.slice(tableStart).split(/未税金额|未稅金額|含税金额|含稅金額/i)[0] : ''
  const itemPattern = /(?:^|\s)(\d+)\s+(.+?)\s+(SET|PCS|PC|件|台|个|只)\s+(\d{4}[/-]\d{2}[/-]\d{2})\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/gi
  let match
  while ((match = itemPattern.exec(tableText))) {
    items.push({
      item_no: match[1],
      part_no: '',
      description: match[2].trim(),
      delivery_date: match[4],
      qty: number(match[6]) || 1,
      unit_price: number(match[5]) || 0,
      extended: number(match[7]) || 0,
    })
  }
  if (!items.length) items.push(...parseLooseItems(lines))
  const sheet = {
    title: 'PDF',
    customer,
    attn: clean.match(/(?:ATTN|经办人)[：:\s]*([^\n]+)/i)?.[1]?.trim() || '',
    payment,
    delivery,
    notes: clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    tax_rate: taxRate,
    tax_included: Boolean(totalAmount && /含税|含稅/.test(clean)),
    untaxed_total: untaxedTotal,
    total_amount: totalAmount,
    discounted_total: null,
    po_no: po,
    latest_delivery_date: items.map((item) => item.delivery_date).find(Boolean) || '',
    items,
  }
  const warnings = []
  if (!items.length) warnings.push('PDF 已提取文字，但没有识别到标准品项行，请人工核对')
  const itemTotal = items.reduce((sum, item) => sum + (item.extended || 0), 0)
  if (untaxedTotal !== null && items.length && Math.abs(itemTotal - untaxedTotal) > 0.01) warnings.push(`识别品项未税金额合计 ${itemTotal.toLocaleString('zh-CN')} 与文件未税总计 ${untaxedTotal.toLocaleString('zh-CN')} 不一致，请人工核对`)
  if (order && po) sheet.documentType = 'customer_order'
  return { documentType: order ? 'customer_order' : 'purchase_quote', sheets: [sheet], warnings }
}

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return parsePdfText(result.text)
  } finally {
    await parser.destroy()
  }
}

module.exports = { parsePdf, parsePdfText }
