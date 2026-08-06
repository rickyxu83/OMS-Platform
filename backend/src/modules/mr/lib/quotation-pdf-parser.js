const { PDFParse } = require('pdf-parse')

function number(value) {
  const parsed = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
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
  const untaxedTotal = number(clean.match(/(?:未税金额|未稅金額)[^\d]{0,40}(?:RMB\s*)?([\d,]+(?:\.\d+)?)/i)?.[1])
  const totalAmount = number(clean.match(/(?:含税金额|含稅金額)[^\d]{0,40}(?:RMB\s*)?([\d,]+(?:\.\d+)?)/i)?.[1])
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
  const sheet = {
    title: 'PDF',
    customer,
    attn: clean.match(/(?:ATTN|经办人)[：:\s]*([^\n]+)/i)?.[1]?.trim() || '',
    payment,
    delivery,
    notes: clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    tax_rate: taxRate,
    tax_included: Boolean(totalAmount),
    untaxed_total: untaxedTotal,
    total_amount: totalAmount,
    discounted_total: null,
    po_no: po,
    latest_delivery_date: items.map((item) => item.delivery_date).find(Boolean) || '',
    items,
  }
  const warnings = []
  if (!items.length) warnings.push('PDF 已提取文字，但没有识别到标准品项行，请人工核对')
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
