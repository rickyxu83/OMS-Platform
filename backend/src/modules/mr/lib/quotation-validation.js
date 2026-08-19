function number(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function defaultConfidence(method) {
  if (method === 'excel_cells') return 100
  if (method === 'ocr_layout') return 80
  if (method === 'pdf_text') return 85
  return 55
}

function validateParsedQuotation(parsed, method) {
  const warnings = [...(parsed.warnings || [])]
  let reviewCount = 0
  const sheets = (parsed.sheets || []).map((sheet) => {
    const recognitionMethod = sheet.recognition_method || method || 'unknown'
    const items = (sheet.items || []).map((item, index) => {
      const fallback = defaultConfidence(recognitionMethod)
      const confidence = {
        description: item.confidence?.description ?? fallback,
        qty: item.confidence?.qty ?? fallback,
        unitPrice: item.confidence?.unitPrice ?? fallback,
        extended: item.confidence?.extended ?? fallback,
      }
      confidence.overall = item.confidence?.overall ?? Math.min(...Object.values(confidence))
      const reviewFields = new Set(item.review_fields || [])
      const messages = [...(item.validation_messages || [])]
      const label = item.name || item.part_no || item.description || `第 ${index + 1} 项`
      const qty = number(item.qty)
      const unitPrice = number(item.unit_price)
      const extended = number(item.extended)
      if (!String(item.description || item.name || item.part_no || '').trim()) {
        reviewFields.add('description')
        messages.push('品名/描述未识别')
      }
      if (qty === null || qty <= 0) {
        reviewFields.add('qty')
        messages.push('数量无效')
      }
      if (unitPrice === null || unitPrice < 0) {
        reviewFields.add('unitPrice')
        messages.push('单价未识别')
      }
      if (extended === null || extended < 0) {
        reviewFields.add('extended')
        messages.push('小计未识别')
      }
      if (qty > 0 && unitPrice >= 0 && extended >= 0) {
        const expected = qty * unitPrice
        const tolerance = Math.max(0.02, Math.abs(extended) * 0.005)
        if (Math.abs(expected - extended) > tolerance) {
          reviewFields.add('extended')
          messages.push(`数量 × 单价为 ${expected.toLocaleString('zh-CN')}，与小计 ${extended.toLocaleString('zh-CN')} 不一致`)
        }
      }
      for (const [field, value] of Object.entries(confidence)) {
        if (field !== 'overall' && value < 70) reviewFields.add(field)
      }
      if (reviewFields.size) {
        reviewCount += 1
        warnings.push(`“${label}”需要核对：${messages[0] || [...reviewFields].join('、')}`)
      }
      return {
        ...item,
        confidence,
        review_fields: [...reviewFields],
        validation_messages: messages,
        recognition_method: recognitionMethod,
      }
    })
    const itemTotal = items.reduce((sum, item) => sum + (number(item.extended) || 0), 0)
    const declared = number(sheet.untaxed_total ?? (!sheet.tax_included ? sheet.total : null))
    if (items.length && declared !== null) {
      const tolerance = Math.max(1, Math.abs(declared) * 0.005)
      if (Math.abs(itemTotal - declared) > tolerance) warnings.push(`识别品项合计 ${itemTotal.toLocaleString('zh-CN')} 与文件未税总额 ${declared.toLocaleString('zh-CN')} 不一致，请核对`)
    }
    return { ...sheet, recognition_method: recognitionMethod, items }
  })
  return { ...parsed, sheets, warnings: [...new Set(warnings)], reviewCount }
}

module.exports = { validateParsedQuotation }
