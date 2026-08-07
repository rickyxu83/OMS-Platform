const { PDFParse } = require('pdf-parse')

function number(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/,/g, ''))
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

function parsePriceTailItems(lines) {
  const items = []
  let pending = []
  const priceTail = /(?:¥|RMB|USD)?\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*[A-Za-z]+)?\s+(?:¥|RMB|USD)?\s*([\d,]+(?:\.\d+)?)\s*(?:\s+(?:保固至|保固|有效期)[\s\S]*)?(?:\s+\d[\d.\s/-]*)?$/i
  const summary = /(总计|總計|合计|合計|grand\s*total|sub\s*total|税额|稅額|备注|備註|有效期限|人民币|QUOTATION|Item\s+Part)/i
  for (const rawLine of lines) {
    const line = cleanOcrLine(rawLine)
    if (!line) continue
    const match = line.match(priceTail)
    if (match && !summary.test(line)) {
      const beforePrices = cleanOcrLine(line.slice(0, match.index))
      const qtyMatch = beforePrices.match(/^\s*\d+\s*[:：|.]\s*(\d+)/)
      const rowQty = beforePrices.match(/^\s*(\d+)\s*$/)
      const qty = number(qtyMatch?.[1] || rowQty?.[1] || 1) || 1
      const rowDescription = beforePrices.replace(/^\s*\d+\s*[:：|.]\s*/, '').replace(/^\s*\d+\s+/, '').replace(/\s+\d+\s*$/, '')
      const pendingDescription = pending.filter((value) => !/(日期|秘书|報價日期|报价日期|Item\s+Part|公司地址|报价单号|報價單號)/i.test(value)).join(' ')
      const description = cleanOcrLine((/^\d+[\s|.:：]*$/.test(beforePrices) ? pendingDescription : rowDescription) || pendingDescription) || '待人工核对品项'
      const partNo = description.match(/\b[A-Za-z][A-Za-z0-9+./-]{2,}\b/)?.[0] || ''
      items.push({ item_no: String(items.length + 1), part_no: partNo, description, qty, unit_price: number(match[1]) || 0, extended: number(match[2]) || 0 })
      pending = []
      continue
    }
    if (summary.test(line) || /^[-\d\s.]+$/.test(line)) continue
    if (/[A-Za-z\u3400-\u9fff]/.test(line)) pending = [...pending.slice(-5), line]
  }
  return items
}
function averageConfidence(words) {
  const values = words.map((word) => Number(word.confidence)).filter((value) => Number.isFinite(value) && value >= 0)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
}

function numericWord(word) {
  const text = String(word.text || '').replace(/[¥￥$]/g, '').trim().replace(/^[([]/, '').replace(/[\])}|]$/, '')
  const match = text.match(/^([\d,]+(?:\.\d+)?)(?:\/[A-Za-z]+)?$/)
  return match ? number(match[1]) : null
}

function coordinateItems(layout) {
  const items = []
  for (const page of layout?.pages || []) {
    const lines = [...(page.lines || [])].sort((left, right) => Number(left.top) - Number(right.top) || Number(left.left) - Number(right.left))
    const pageWidth = Number(page.width) || 2400
    let columns = null
    let pending = []
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]
      const words = line.words || []
      const normalizedWords = words.map((word) => ({ ...word, label: String(word.text || '').toLowerCase().replace(/[\s：:()（）]/g, '') }))
      const header = {}
      for (const word of normalizedWords) {
        const center = Number(word.left) + Number(word.width) / 2
        if (/^(数量|數量|qty|quantity)$/.test(word.label) && header.qty === undefined) header.qty = center
        else if (/^(单价|單價|unitprice|price)$/.test(word.label) && header.unit === undefined) header.unit = center
        else if (/^(金额|金額|小计|小計|合计|合計|amount|extended)$/.test(word.label) && header.extended === undefined) header.extended = center
      }
      if (header.qty && header.unit && header.extended && header.qty < header.unit && header.unit < header.extended) {
        columns = header
        pending = []
        continue
      }
      const text = cleanOcrLine(line.text)
      const compactText = text.replace(/\s+/g, '')
      if (!text) continue
      if (/(未税|未稅|含税|含稅|总计|總計|合计|合計|grand\s*total|sub\s*total|税额|稅額|备注|備註)/i.test(compactText)) {
        pending = []
        continue
      }
      const numericWords = normalizedWords.map((word) => ({ ...word, value: numericWord(word) })).filter((word) => word.value !== null && !/^\d{4}[./-]\d{1,2}/.test(word.text))
      const rightWords = numericWords.filter((word) => (Number(word.left) + Number(word.width) / 2) > pageWidth * 0.68)
      if (rightWords.length < 2) {
        if (/[A-Za-z\u3400-\u9fff]/.test(text)) pending = [...pending.slice(-6), line]
        continue
      }
      const center = (word) => Number(word.left) + Number(word.width) / 2
      const nearbyWords = lines
        .filter((candidate, candidateIndex) => candidateIndex !== lineIndex && Math.abs(Number(candidate.top) - Number(line.top)) <= 55)
        .flatMap((candidate) => candidate.words || [])
        .map((word) => ({ ...word, value: numericWord(word), nearby: true }))
        .filter((word) => word.value !== null)
      const allNumericWords = [...numericWords, ...nearbyWords]
      const qtyCenter = columns?.qty || pageWidth * 0.6
      const qtyCandidates = allNumericWords.filter((word) => Number.isInteger(word.value) && word.value > 0 && word.value < 10000 && Math.abs(center(word) - qtyCenter) < pageWidth * 0.035)
      const qtyByValue = new Map()
      for (const word of qtyCandidates) {
        const existing = qtyByValue.get(word.value)
        if (!existing || Math.abs(center(word) - qtyCenter) < Math.abs(center(existing) - qtyCenter)) qtyByValue.set(word.value, word)
      }
      if (!qtyByValue.size) qtyByValue.set(1, { value: 1, confidence: 40, left: qtyCenter, width: 0, synthetic: true })
      const priceCandidates = [...rightWords].sort((left, right) => center(left) - center(right))
      let pair = null
      for (const qtyWordCandidate of qtyByValue.values()) {
        const qtyValue = qtyWordCandidate.value
        const candidates = []
        for (let leftIndex = 0; leftIndex < priceCandidates.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < priceCandidates.length; rightIndex += 1) {
            candidates.push({ unitWord: priceCandidates[leftIndex], extendedWord: priceCandidates[rightIndex], synthetic: false })
          }
        }
        if (columns?.unit && columns?.extended) {
          const unitColumnWord = priceCandidates.reduce((best, word) => Math.abs(center(word) - columns.unit) < Math.abs(center(best) - columns.unit) ? word : best)
          if (Math.abs(center(unitColumnWord) - columns.unit) < pageWidth * 0.1) {
            candidates.push({
              unitWord: unitColumnWord,
              extendedWord: { value: qtyValue * unitColumnWord.value, confidence: 40, left: columns.extended, width: 0, synthetic: true },
              synthetic: true,
            })
          }
        }
        for (const candidate of candidates) {
          const error = Math.abs(qtyValue * candidate.unitWord.value - candidate.extendedWord.value) / Math.max(candidate.extendedWord.value, 1)
          const columnError = columns?.unit && columns?.extended ? Math.abs(center(candidate.unitWord) - columns.unit) + Math.abs(center(candidate.extendedWord) - columns.extended) : 0
          const qtyError = Math.abs(center(qtyWordCandidate) - qtyCenter) / pageWidth + (qtyWordCandidate.nearby ? 0.05 : 0)
          const score = error * 100 + columnError / pageWidth + qtyError + (candidate.synthetic ? 0.2 : 0)
          if (!pair || score < pair.score) pair = { ...candidate, qtyWord: qtyWordCandidate, qty: qtyValue, error, score }
        }
      }
      if (!pair || (pair.unitWord.value < 100 && pair.extendedWord.value < 100)) continue
      const { unitWord, extendedWord, qtyWord, qty } = pair
      const firstPriceX = Math.min(center(unitWord), center(extendedWord))
      const descriptionWords = normalizedWords.filter((word) => center(word) < firstPriceX && numericWord(word) === null).map((word) => word.text)
      const pendingText = pending.filter((entry) => Number(entry.top) >= Number(line.top) - 180).map((entry) => entry.text).join(' ')
      const description = cleanOcrLine([...descriptionWords, pendingText].filter(Boolean).join(' ')) || '待人工核对品项'
      const expected = qty * unitWord.value
      const tolerance = Math.max(0.02, Math.abs(extendedWord.value) * 0.005)
      const amountConsistent = Math.abs(expected - extendedWord.value) <= tolerance
      const descriptionWordsWithConfidence = normalizedWords.filter((word) => center(word) < firstPriceX && numericWord(word) === null)
      const confidence = {
        description: averageConfidence([...descriptionWordsWithConfidence, ...pending.filter((entry) => Number(entry.top) >= Number(line.top) - 180).flatMap((entry) => entry.words || [])]),
        qty: qtyWord ? Math.round(Number(qtyWord.confidence) || 0) : 40,
        unitPrice: Math.round(Number(unitWord.confidence) || 0),
        extended: Math.round(Number(extendedWord.confidence) || 0),
      }
      confidence.overall = Math.min(...Object.values(confidence))
      const reviewFields = Object.entries(confidence).filter(([field, value]) => field !== 'overall' && value < 70).map(([field]) => field)
      if (!amountConsistent) reviewFields.push('extended')
      const partNo = description.match(/\b[A-Za-z][A-Za-z0-9+./-]{2,}\b/)?.[0] || ''
      items.push({
        item_no: String(items.length + 1),
        part_no: partNo,
        description,
        qty,
        unit_price: unitWord.value,
        extended: extendedWord.value,
        confidence,
        review_fields: [...new Set(reviewFields)],
        amount_consistent: amountConsistent,
      })
      pending = []
    }
  }
  return items
}

function layoutSummaryAmount(layout, labelPattern) {
  for (const page of layout?.pages || []) {
    for (const line of page.lines || []) {
      const text = cleanOcrLine(line.text).replace(/\s+/g, '')
      if (!labelPattern.test(text) || /(优惠|優惠|最低)/.test(text)) continue
      const values = (line.words || []).map(numericWord).filter((value) => value !== null && value >= 100)
      if (values.length) return Math.max(...values)
    }
  }
  return null
}

function parsePdfText(text, layout = null) {
  const clean = String(text || '').replace(/\u00a0/g, ' ').trim()
  if (!clean) return { documentType: 'scanned_pdf', sheets: [], warnings: ['PDF 没有文字层，当前需要人工核对或 OCR 后再导入'] }
  const flat = clean.replace(/\s+/g, ' ')
  const compact = clean.replace(/\s+/g, '')
  const order = /(purchase\s*order|订购单|訂購單|po\s*no)/i.test(clean)
  const taxMatch = clean.match(/(?:VAT|税率|稅率|税点|稅點)\s*([0-9]+(?:\.[0-9]+)?)%?/i) || compact.match(/(?:VAT|税率|稅率|税点|稅點)([0-9]+(?:\.[0-9]+)?)%?/i)
  let taxRate = taxMatch ? number(taxMatch[1]) : null
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const customer = (lines.find((line) => /(?:公司|科技|有限公司)/.test(line) && !/供应商|厂商|Vendor/i.test(line)) || lines.find((line) => line && !/secret|机密/i.test(line)) || '').replace(/\s+\[[^\]]*(?:secret|机密)[^\]]*\]\s*$/i, '').trim()
  const cleanSegment = (value) => String(value || '').replace(/^[^:：]*[：:]\s*/, '').replace(/^\([^)]*\)\s*[:：]\s*/, '').trim()
  const po = clean.match(/PO\s*NO\.?\)?[^A-Z0-9]{0,12}([A-Z0-9-]+)/i)?.[1] || clean.match(/(?:订购单号|訂購單號)[：:\s]*(\d+)/i)?.[1] || ''
  const payment = cleanSegment(clean.match(/(?:付款方式|Payment)[^\n]*?[:：]\s*([^\n]+)/i)?.[1])
  const delivery = cleanSegment(clean.match(/(?:交货地点|交貨地點|Ship To)[^\n]*?[:：]\s*([^\n]+)/i)?.[1])
  let untaxedTotal = number((clean.match(/(?:未\s*[税稅]\s*(?:总计|總計|金额|金額)|sub\s*total)[^\d]{0,40}(?:RMB\s*)?([\d,]+(?:\.\d+)?)/i) || compact.match(/(?:未[税稅](?:总计|總計|金额|金額)|subtotal)[^\d]{0,40}([\d,]+(?:\.\d+)?)/i))?.[1])
  const totalMatch = clean.match(/(?:含\s*[税稅]\s*(?:金额|金額|总计|總計|合计|合計)|总价|總價|grand\s*total)[^\d]{0,40}(?:RMB|USD)?\s*([\d,]+(?:\.\d+)?)/i) || compact.match(/(?:含[税稅](?:金额|金額|总计|總計|合计|合計)|总价|總價|grandtotal)[^\d]{0,40}([\d,]+(?:\.\d+)?)/i)
  let totalAmount = number(totalMatch?.[1])
  const currencyAmounts = [...clean.matchAll(/(?:¥|RMB|USD)\s*([\d,]+(?:\.\d+)?)/gi)].map((match) => number(match[1])).filter((value) => value !== null)
  if (/(?:人民币|人民幣)未税总计|sub\s*total/i.test(compact) && currencyAmounts.length >= 2) untaxedTotal = currencyAmounts.length >= 3 ? currencyAmounts[currencyAmounts.length - 3] : currencyAmounts[0]
  if (/(?:人民币|人民幣)含税总计|grand\s*total/i.test(compact) && currencyAmounts.length) totalAmount = currencyAmounts[currencyAmounts.length - 1]
  const layoutUntaxedTotal = layoutSummaryAmount(layout, /未[税稅]/)
  const layoutTaxedTotal = layoutSummaryAmount(layout, /含[税稅]/)
  if (layoutUntaxedTotal !== null) untaxedTotal = layoutUntaxedTotal
  if (layoutTaxedTotal !== null) totalAmount = layoutTaxedTotal
  if (![6, 13].includes(Number(taxRate)) && untaxedTotal > 0 && totalAmount > untaxedTotal) {
    const inferredRate = Math.round((totalAmount / untaxedTotal - 1) * 100)
    if ([6, 13].includes(inferredRate)) taxRate = inferredRate
  }
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
  if (!items.length && layout) items.push(...coordinateItems(layout))
  if (!items.length) items.push(...parsePriceTailItems(lines))
  const warnings = []
  let itemTotal = items.reduce((sum, item) => sum + (item.extended || 0), 0)
  const declaredTotal = untaxedTotal ?? totalAmount
  if (declaredTotal > 0 && items.length > 1) {
    const originalDifference = Math.abs(itemTotal - declaredTotal)
    const removable = items.map((item, index) => ({
      index,
      item,
      difference: Math.abs(itemTotal - (item.extended || 0) - declaredTotal),
    })).sort((left, right) => left.difference - right.difference)[0]
    const removableAmount = removable?.item?.extended || 0
    const removableConfidence = Number(removable?.item?.confidence?.overall ?? 100)
    if (removable && removable.difference < originalDifference && removable.difference <= Math.max(1, declaredTotal * 0.001) && removableAmount / declaredTotal < 0.02 && (removable.item.review_fields?.length || removableConfidence < 70)) {
      warnings.push(`已排除疑似页脚噪声品项“${removable.item.description || removable.item.part_no || removable.index + 1}”，金额 ${removableAmount.toLocaleString('zh-CN')}，请在预览中核对`)
      items.splice(removable.index, 1)
      itemTotal = items.reduce((sum, item) => sum + (item.extended || 0), 0)
    }
  }
  const maxItemAmount = Math.max(0, ...items.map((item) => Number(item.extended) || 0))
  if (totalAmount !== null && totalAmount > 0 && maxItemAmount > totalAmount) {
    warnings.push(`文件总额 ${totalAmount.toLocaleString('zh-CN')} 小于品项金额，已忽略该低置信度总额`)
    totalAmount = null
  }
  const sheet = {
    title: 'PDF',
    customer,
    attn: clean.match(/(?:ATTN|经办人)[：:\s]*([^\n]+)/i)?.[1]?.trim() || '',
    payment,
    delivery,
    notes: clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    tax_rate: taxRate,
    tax_included: /含税|含稅|增值税|增值稅|inclusive/i.test(compact),
    untaxed_total: untaxedTotal,
    total_amount: totalAmount,
    discounted_total: null,
    po_no: po,
    latest_delivery_date: items.map((item) => item.delivery_date).find(Boolean) || '',
    items,
  }
  if (!items.length) warnings.push('PDF 已提取文字，但没有识别到标准品项行，请人工核对')
  if (untaxedTotal !== null && items.length && Math.abs(itemTotal - untaxedTotal) > Math.max(0.01, untaxedTotal * 0.001)) warnings.push(`识别品项未税金额合计 ${itemTotal.toLocaleString('zh-CN')} 与文件未税总计 ${untaxedTotal.toLocaleString('zh-CN')} 不一致，请人工核对`)
  if (order && po) sheet.documentType = 'sales_quote'
  return { documentType: order ? 'sales_quote' : 'purchase_quote', sheets: [sheet], warnings }
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
