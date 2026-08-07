const path = require('path')

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function itemKeys(item) {
  const part = normalized(item.part_no)
  const descriptionText = String(item.description || '')
  const description = normalized(descriptionText)
  const name = normalized(item.name || descriptionText.split(/\r?\n/)[0])
  const keys = [part && `part:${part}`, description && `desc:${description}`, name && `name:${name}`].filter(Boolean)
  for (const component of item.components || []) {
    const componentText = normalized([component.group, component.part, component.description].filter(Boolean).join(' '))
    if (componentText) keys.push(`component:${componentText}`)
    const componentDescription = normalized(component.description)
    if (componentDescription) keys.push(`component-desc:${componentDescription}`)
  }
  const serviceLike = description.includes('forticare') || description.includes('续保') || description.includes('維保') || description.includes('forti') || /^fc[-_]/i.test(String(item.part_no || ''))
  if (serviceLike) {
    keys.push('service:' + description.replace(/\d+/g, ''))
    const servicePart = String(item.part_no || '').split(/[-_]/).filter(Boolean)
    if (servicePart.length >= 3) keys.push(`service-part-family:${normalized(servicePart.slice(0, -1).join('-'))}`)
  }
  return keys
}

function sourceTotal(source) {
  return source.sheets.reduce((sum, sheet) => {
    const declared = sheet.total ?? sheet.discounted_total ?? sheet.total_amount ?? sheet.untaxed_total
    const itemTotal = (sheet.items || []).reduce((itemSum, item) => itemSum + number(item.extended ?? number(item.unit_price) * (number(item.qty) || 1)), 0)
    return sum + (number(declared) > 0 ? number(declared) : itemTotal)
  }, 0)
}

function firstSheet(source) {
  return source.sheets?.[0] || {}
}

function sourceTaxRate(source) {
  const rate = firstSheet(source).tax_rate
  return [6, 13].includes(Number(rate)) ? Number(rate) : 13
}

function sourceTaxIncluded(source) {
  const sheet = firstSheet(source)
  if (sheet.tax_included) return true
  const text = Array.isArray(sheet.notes) ? sheet.notes.join(' ') : String(sheet.notes || '')
  if (/(未税|未稅|不含税|不含稅|untaxed)/i.test(text)) return false
  return source.role === 'purchase'
}
function sourceSalesTotalExcludingTax(source) {
  const sheet = firstSheet(source)
  const rate = sourceTaxRate(source)
  if (sheet.discounted_total !== null && sheet.discounted_total !== undefined) {
    return sourceTaxIncluded(source) ? number(sheet.discounted_total) / (1 + rate / 100) : number(sheet.discounted_total)
  }
  if (sheet.untaxed_total !== null && sheet.untaxed_total !== undefined) return number(sheet.untaxed_total)
  const total = sourceTotal(source)
  return sourceTaxIncluded(source) ? total / (1 + rate / 100) : total
}

function vendorName(source, vendors) {
  const isOwnCompany = (value) => /(敦阳|敦陽|stark|dunyang)/i.test(String(value || ''))
  const sourceVendor = source.sheets.map((sheet) => String(sheet.vendor || '').trim()).find((value) => value && !isOwnCompany(value)) || ''
  const filename = normalized(path.basename(source.name, path.extname(source.name)))
  const evidence = normalized([source.name, sourceVendor, ...source.sheets.flatMap((sheet) => [sheet.seller?.from, ...(sheet.notes || [])])].join(' '))
  const match = vendors.find((vendor) => {
    if (isOwnCompany(vendor.name)) return false
    const name = normalized(vendor.name)
    if (name && (evidence.includes(name) || filename.includes(name))) return true
    const website = String(vendor.officialWebsite || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '')
    return website && evidence.includes(normalized(website))
  })
  return sourceVendor || match?.name || ''
}

function sourceRole(source, index, sources) {
  if (source.requestedRole === 'sales') return 'sales'
  if (source.requestedRole === 'purchase') return 'purchase'
  if (source.documentType === 'purchase_quote') return 'purchase'
  if (source.documentType === 'customer_order') return 'sales'
  const explicitSalesIndex = sources.findIndex((candidate) => candidate.documentType === 'sales_quote')
  if (explicitSalesIndex >= 0) return index === explicitSalesIndex ? 'sales' : 'purchase'
  const totals = sources.map(sourceTotal)
  const best = totals.reduce((winner, total, sourceIndex) => total > totals[winner] ? sourceIndex : winner, 0)
  return index === best ? 'sales' : 'purchase'
}

function flattenedItems(source, sourceIndex, vendors) {
  const vendor = vendorName(source, vendors)
  const taxRate = sourceTaxRate(source)
  const taxIncluded = sourceTaxIncluded(source)
  return source.sheets.flatMap((sheet) => sheet.items.map((item) => ({
    ...item,
    taxRateKnown: [6, 13].includes(Number(sheet.tax_rate)),
    taxRate,
    taxIncluded,
    sourceIndex,
    sourceName: source.name,
    vendor,
    role: source.role,
  })))
}

function descriptionFields(value, fallback) {
  const description = String(value || '').trim()
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return { name: lines[0] || fallback || '', description }
}

function costInclTax(item) {
  const extended = item.extended === null || item.extended === undefined ? number(item.unit_price) * (number(item.qty) || 1) : number(item.extended)
  return item.taxIncluded ? extended : extended * (1 + number(item.taxRate) / 100)
}

function pickPurchase(candidates) {
  return [...new Map(candidates.map((item) => [`${item.sourceIndex}:${item.item_no}:${item.part_no}:${item.description}`, item])).values()]
    .sort((left, right) => costInclTax(left) / Math.max(number(left.qty), 1) - costInclTax(right) / Math.max(number(right.qty), 1))[0]
}

function bigrams(value) {
  const text = normalized(value)
  if (text.length < 2) return new Set(text ? [text] : [])
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)))
}

function textSimilarity(left, right) {
  const leftText = normalized(left)
  const rightText = normalized(right)
  if (!leftText || !rightText) return 0
  if (leftText === rightText) return 1
  const shorter = leftText.length <= rightText.length ? leftText : rightText
  const longer = leftText.length > rightText.length ? leftText : rightText
  if (shorter.length >= 3 && longer.includes(shorter)) return 0.9
  const a = bigrams(leftText)
  const b = bigrams(rightText)
  const intersection = [...a].filter((value) => b.has(value)).length
  return intersection / (a.size + b.size - intersection)
}

function itemSimilarity(left, right) {
  const leftFields = [left.part_no, left.name, left.description].filter(Boolean)
  const rightFields = [right.part_no, right.name, right.description].filter(Boolean)
  const fieldScores = leftFields.flatMap((leftField) => rightFields.map((rightField) => textSimilarity(leftField, rightField)))
  return Math.max(0, textSimilarity(leftFields.join(' '), rightFields.join(' ')), ...fieldScores)
}

function conservativeCandidates(sale, purchases) {
  const bySource = new Map()
  for (const purchase of purchases) {
    const values = bySource.get(purchase.sourceIndex) || []
    values.push(purchase)
    bySource.set(purchase.sourceIndex, values)
  }
  const matches = []
  for (const sourceItems of bySource.values()) {
    const ranked = sourceItems.map((purchase) => ({
      purchase,
      score: itemSimilarity(sale, purchase),
    })).sort((left, right) => right.score - left.score)
    const best = ranked[0]
    const second = ranked[1]
    if (best && best.score >= 0.72 && (!second || best.score - second.score >= 0.12)) matches.push(best)
  }
  return matches
}

function mergeQuotations(inputSources, vendors = []) {
  if (!inputSources.length) return { sources: [], items: [], warnings: [], salesSourceIndex: -1, salesTotalExcludingTax: null }
  const sources = inputSources.map((source, index) => ({ ...source, role: sourceRole(source, index, inputSources) }))
  const salesSourceIndex = sources.findIndex((source) => source.role === 'sales')
  const purchaseSources = sources.filter((source) => source.role === 'purchase')
  const purchaseItems = purchaseSources.flatMap((source) => flattenedItems(source, sources.indexOf(source), vendors))
  const purchasesByKey = new Map()
  for (const item of purchaseItems) {
    for (const key of itemKeys(item)) {
      const values = purchasesByKey.get(key) || []
      values.push(item)
      purchasesByKey.set(key, values)
    }
  }
  const salesSource = salesSourceIndex >= 0 ? sources[salesSourceIndex] : null
  const salesItems = salesSource ? flattenedItems(salesSource, salesSourceIndex, vendors) : []
  const explicitSalesCount = sources.filter((source) => source.role === 'sales').length
  const unknownSourceCount = sources.filter((source) => !source.requestedRole && !['sales_quote', 'purchase_quote', 'customer_order'].includes(source.documentType)).length
  const roleWarnings = []
  if (salesSourceIndex < 0) roleWarnings.push('当前仅识别到供应商报价，未提供销售报价，销售金额需在后续补充')
  if (explicitSalesCount > 1) roleWarnings.push(`识别到 ${explicitSalesCount} 份销售报价，已采用第一份，其余按供应商报价处理，请核对文件角色`)
  else if (explicitSalesCount === 1 && unknownSourceCount) roleWarnings.push(`已识别销售报价，其余 ${unknownSourceCount} 份未明确来源文件按供应商报价处理`)
  else if (explicitSalesCount === 0 && unknownSourceCount) roleWarnings.push('未明确识别到销售报价，已按报价总额最高的文件作为销售报价，请核对文件角色')
  const warnings = [...sources.flatMap((source) => source.warnings || []), ...roleWarnings]
  const unknownTaxSources = new Set()
  const matchedPurchaseIndexes = new Set()
  const items = []

  for (const sale of salesItems) {
    const exactCandidates = itemKeys(sale).flatMap((key) => purchasesByKey.get(key) || [])
    const fuzzy = exactCandidates.length ? [] : conservativeCandidates(sale, purchaseItems)
    const candidates = exactCandidates.length ? exactCandidates : fuzzy.map((match) => match.purchase)
    const purchase = pickPurchase(candidates)
    const selectedFuzzy = fuzzy.find((match) => match.purchase === purchase)
    if (selectedFuzzy) warnings.push(`“${sale.name || sale.part_no || sale.description}”与“${selectedFuzzy.purchase.name || selectedFuzzy.purchase.part_no || selectedFuzzy.purchase.description}”为候选匹配（${Math.round(selectedFuzzy.score * 100)}%），请核对`)
    if (purchase) {
      matchedPurchaseIndexes.add(`${purchase.sourceIndex}:${purchase.item_no}:${purchase.part_no}:${purchase.description}`)
      for (const match of fuzzy) matchedPurchaseIndexes.add(`${match.purchase.sourceIndex}:${match.purchase.item_no}:${match.purchase.part_no}:${match.purchase.description}`)
      for (const key of itemKeys(sale)) {
        for (const candidate of purchasesByKey.get(key) || []) matchedPurchaseIndexes.add(`${candidate.sourceIndex}:${candidate.item_no}:${candidate.part_no}:${candidate.description}`)
      }
    }
    const fields = { ...descriptionFields(sale.description, sale.part_no), name: sale.name || descriptionFields(sale.description, sale.part_no).name }
    if (!purchase) warnings.push(`“${fields.name || sale.part_no}”没有匹配到进货报价`)
    else if (!purchase.taxRateKnown) unknownTaxSources.add(purchase.sourceName)
    items.push({
      companyPartNo: '',
      oemSpec: sale.part_no || '',
      ...fields,
      warrantyService: '',
      installBy: '',
      qty: number(sale.qty) || 1,
      unitPrice: null,
    quotedUnitPrice: sale.unit_price === null || sale.unit_price === undefined ? null : round(number(sale.unit_price) / (sourceTaxIncluded(salesSource) ? 1 + sourceTaxRate(salesSource) / 100 : 1), 6),
      vendor: purchase?.vendor || '',
      costInclTax: purchase ? round(costInclTax(purchase)) : null,
      taxRate: purchase?.taxRate || 13,
      purchaseOrderNo: '',
      costSource: purchase?.sourceName || '',
      salesSource: sale.sourceName,
      components: sale.components || [],
    })
  }
  for (const purchase of purchaseItems) {
    const key = `${purchase.sourceIndex}:${purchase.item_no}:${purchase.part_no}:${purchase.description}`
    if (matchedPurchaseIndexes.has(key)) continue
    warnings.push(`供应商报价品项“${purchase.name || purchase.part_no || purchase.description}”未匹配到销售报价，未导入为 MR 品项`)
  }
  const salesTotalExcludingTax = salesSourceIndex >= 0 ? sourceSalesTotalExcludingTax(sources[salesSourceIndex]) : null
  const quoteTotal = salesSourceIndex >= 0 ? sourceSalesTotalExcludingTax(sources[salesSourceIndex]) : null
  if (unknownTaxSources.size) warnings.push(`${[...unknownTaxSources].join('、')} 未识别到明确成本税率，暂按 13% 导入，请逐项核对`)

  const totalCost = items.reduce((sum, item) => sum + (item.costInclTax === null ? 0 : item.costInclTax / (1 + item.taxRate / 100)), 0)
  const missingCost = items.filter((item) => item.costInclTax === null)
  if (missingCost.length) warnings.push(`有 ${missingCost.length} 个品项缺少成本，暂不计算完整毛利；请补充厂商报价`)
  if (salesTotalExcludingTax !== null && totalCost > 0 && !missingCost.length) {
    for (const item of items) {
      const cost = item.costInclTax / (1 + item.taxRate / 100)
      item.unitPrice = round((cost / totalCost * salesTotalExcludingTax) / Math.max(item.qty, 1), 6)
    }
  } else if (salesSourceIndex >= 0 && !missingCost.length) {
    const taxRate = sourceTaxRate(sources[salesSourceIndex])
    const taxIncluded = sourceTaxIncluded(sources[salesSourceIndex])
    for (const item of items.slice(0, salesItems.length)) {
      const sale = salesItems.find((candidate) => candidate.sourceName === item.salesSource && candidate.part_no === item.oemSpec && candidate.description === item.description)
      if (sale?.unit_price !== null && sale?.unit_price !== undefined) item.unitPrice = round(number(sale.unit_price) / (taxIncluded ? 1 + taxRate / 100 : 1), 6)
    }
  }
  return {
    salesSourceIndex,
    salesTotalExcludingTax,
    sources: sources.map((source, index) => ({
      index,
      name: source.name,
      role: source.role,
      total: round(sourceTotal(source)),
      itemCount: source.sheets.reduce((sum, sheet) => sum + sheet.items.length, 0),
      vendor: source.role === 'purchase' ? vendorName(source, vendors) : '',
      documentType: source.documentType || 'unknown',
      taxIncluded: sourceTaxIncluded(source),
      taxRate: sourceTaxRate(source),
    })),
    items,
    warnings,
    quoteTotal,
  }
}

module.exports = { mergeQuotations, sourceSalesTotalExcludingTax, sourceRole }
