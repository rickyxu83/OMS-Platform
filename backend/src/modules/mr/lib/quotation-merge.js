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

function sourceItemPricesTaxIncluded(source) {
  const sheet = firstSheet(source)
  const itemTotal = (sheet.items || []).reduce((sum, item) => sum + number(item.extended ?? number(item.unit_price) * (number(item.qty) || 1)), 0)
  const approximately = (expected) => expected !== null && expected !== undefined && Math.abs(itemTotal - number(expected)) <= Math.max(1, number(expected) * 0.005)
  if (approximately(sheet.untaxed_total)) return false
  if (approximately(sheet.discounted_total ?? sheet.total_amount)) return true
  return sourceTaxIncluded(source)
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
  return match?.name || sourceVendor || ''
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
function looksLikePartNumber(value) {
  const token = String(value || '').trim().replace(/[,:;，；]+$/, '')
  const hyphens = (token.match(/-/g) || []).length
  return /^[A-Z0-9][A-Z0-9+._/-]*$/i.test(token) && hyphens >= 1 && (hyphens >= 2 || /\d/.test(token))
}

function costInclTax(item) {
  const extended = item.extended === null || item.extended === undefined ? number(item.unit_price) * (number(item.qty) || 1) : number(item.extended)
  return item.taxIncluded ? extended : extended * (1 + number(item.taxRate) / 100)
}

function sourceRecognition(source) {
  const items = source.sheets.flatMap((sheet) => sheet.items || [])
  const confidences = items.map((item) => Number(item.confidence?.overall)).filter(Number.isFinite)
  return {
    confidence: confidences.length ? round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : null,
    reviewCount: items.filter((item) => item.review_fields?.length).length,
    method: source.sheets.map((sheet) => sheet.recognition_method).find(Boolean) || '',
  }
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
    const fuzzyPurchase = fuzzy[0]?.purchase
    const fuzzyKey = fuzzyPurchase ? `${fuzzyPurchase.sourceIndex}:${fuzzyPurchase.item_no}:${fuzzyPurchase.part_no}:${fuzzyPurchase.description}` : ''
    const autoFuzzy = purchaseSources.length === 1 && fuzzy.length === 1 && fuzzy[0].score >= 0.9
      && number(sale.qty) > 0 && number(sale.qty) === number(fuzzyPurchase.qty) && fuzzyPurchase.taxRateKnown
      && !matchedPurchaseIndexes.has(fuzzyKey) ? fuzzy[0] : null
    const purchase = pickPurchase(exactCandidates) || autoFuzzy?.purchase
    if (fuzzy.length && !autoFuzzy) warnings.push(`“${sale.name || sale.part_no || sale.description}”找到 ${fuzzy.length} 个供应商候选，未自动采用，请在预览中确认`)
    if (purchase) {
      matchedPurchaseIndexes.add(`${purchase.sourceIndex}:${purchase.item_no}:${purchase.part_no}:${purchase.description}`)
      for (const key of itemKeys(sale)) {
        for (const candidate of purchasesByKey.get(key) || []) matchedPurchaseIndexes.add(`${candidate.sourceIndex}:${candidate.item_no}:${candidate.part_no}:${candidate.description}`)
      }
    }
    const parsedFields = descriptionFields(sale.description, sale.part_no)
    const genericSaleName = !looksLikePartNumber(sale.part_no) && normalized(sale.name) === normalized(sale.part_no)
    const fields = { ...parsedFields, name: genericSaleName ? parsedFields.name : sale.name || parsedFields.name }
    const inferredOemSpec = Boolean(purchase && !looksLikePartNumber(sale.part_no) && looksLikePartNumber(purchase.part_no))
    const reviewFields = new Set(sale.review_fields || [])
    const validationMessages = [...(sale.validation_messages || [])]
    if (inferredOemSpec) {
      reviewFields.add('oemSpec')
      validationMessages.push('原厂规格由供应商报价推断，请核对')
      warnings.push(`“${fields.name}”的原厂规格已根据供应商报价推断为 ${purchase.part_no}，请核对`)
    }
    if (!purchase) {
      if (purchaseItems.length) warnings.push(`“${fields.name || sale.part_no}”没有匹配到进货报价`)
    } else if (!purchase.taxRateKnown) unknownTaxSources.add(purchase.sourceName)
    items.push({
      companyPartNo: '',
      oemSpec: inferredOemSpec ? purchase.part_no : sale.part_no || '',
      ...fields,
      warrantyService: '',
      installBy: '',
      qty: number(sale.qty) || 1,
      unitPrice: null,
      quotedUnitPrice: sale.unit_price === null || sale.unit_price === undefined ? null : round(number(sale.unit_price) / (sourceItemPricesTaxIncluded(salesSource) ? 1 + sourceTaxRate(salesSource) / 100 : 1), 6),
      vendor: purchase?.vendor || '',
      costInclTax: purchase ? round(costInclTax(purchase)) : null,
      taxRate: purchase?.taxRate || 13,
      purchaseOrderNo: '',
      costSource: purchase?.sourceName || '',
      salesSource: sale.sourceName,
      components: sale.components || [],
      recognitionMethod: sale.recognition_method || '',
      confidence: sale.confidence || null,
      reviewFields: [...reviewFields],
      validationMessages,
      costConfidence: purchase?.confidence || null,
      costReviewFields: purchase?.review_fields || [],
      matchCandidates: (autoFuzzy ? [] : fuzzy).map((match) => ({
        description: match.purchase.name || match.purchase.part_no || match.purchase.description,
        vendor: match.purchase.vendor || '',
        costInclTax: round(costInclTax(match.purchase)),
        taxRate: match.purchase.taxRateKnown ? match.purchase.taxRate : null,
        costSource: match.purchase.sourceName || '',
        score: round(match.score * 100),
      })).sort((left, right) => left.costInclTax - right.costInclTax),
    })
  }
  const unmatchedPurchaseItems = []
  for (const purchase of purchaseItems) {
    const key = `${purchase.sourceIndex}:${purchase.item_no}:${purchase.part_no}:${purchase.description}`
    if (matchedPurchaseIndexes.has(key)) continue
    unmatchedPurchaseItems.push(purchase)
  }
  if (unmatchedPurchaseItems.length) {
    const deduped = []
    let duplicateCount = 0
    for (const purchase of unmatchedPurchaseItems) {
      const isDuplicate = deduped.some((existing) => {
        const existingPart = normalized(existing.part_no)
        const purchasePart = normalized(purchase.part_no)
        if (purchasePart && existingPart && purchasePart === existingPart) return true
        if (number(purchase.qty) > 0 && number(purchase.qty) === number(existing.qty) && itemSimilarity(purchase, existing) >= 0.85) return true
        return false
      })
      if (isDuplicate) { duplicateCount += 1; continue }
      deduped.push(purchase)
      const fields = descriptionFields(purchase.description, purchase.part_no)
      items.push({
        companyPartNo: '',
        oemSpec: purchase.part_no || '',
        name: fields.name,
        description: fields.description || fields.name,
        warrantyService: '',
        installBy: '',
        qty: number(purchase.qty) || 1,
        unitPrice: null,
        quotedUnitPrice: null,
        vendor: purchase.vendor || '',
        costInclTax: round(costInclTax(purchase)),
        taxRate: purchase.taxRate || 13,
        purchaseOrderNo: '',
        costSource: purchase.sourceName || '',
        salesSource: '',
        components: purchase.components || [],
        recognitionMethod: purchase.recognition_method || '',
        confidence: purchase.confidence || null,
        reviewFields: [...new Set([...(purchase.review_fields || []), 'unitPrice'])],
        validationMessages: ['售价未识别：该品项仅来自供应商报价且未匹配到销售报价，请在导入后填写售价'],
        costConfidence: purchase.confidence || null,
        costReviewFields: purchase.review_fields || [],
        matchCandidates: [],
        purchaseOnly: true,
      })
    }
    warnings.push(salesSourceIndex >= 0
      ? `供应商报价中 ${deduped.length} 个品项未匹配到销售报价，已按供应商报价导入为待填售价品项，请在导入后填写售价`
      : `未提供销售报价，已按供应商报价导入 ${deduped.length} 个待填售价品项，请在导入后填写售价`)
    if (duplicateCount) warnings.push(`检测到 ${duplicateCount} 个供应商报价品项与已导入品项内容重复，已自动合并（保留第一份），请核对`)
  }
  const salesTotalExcludingTax = salesSourceIndex >= 0 ? sourceSalesTotalExcludingTax(sources[salesSourceIndex]) : null
  const quoteTotal = salesSourceIndex >= 0 ? sourceSalesTotalExcludingTax(sources[salesSourceIndex]) : null
  if (unknownTaxSources.size) warnings.push(`${[...unknownTaxSources].join('、')} 未识别到明确成本税率，暂按 13% 导入，请逐项核对`)

  const missingCost = items.filter((item) => item.costInclTax === null)
  if (missingCost.length) warnings.push(`有 ${missingCost.length} 个品项缺少成本，暂不计算完整毛利；请补充厂商报价`)
  const salesPricedItems = items.filter((item) => item.salesSource)
  const totalCost = salesPricedItems.reduce((sum, item) => sum + (item.costInclTax === null ? 0 : item.costInclTax / (1 + item.taxRate / 100)), 0)
  const preserveQuotedPrices = salesPricedItems.length > 0 && salesPricedItems.every((item) => item.quotedUnitPrice !== null)
  if (preserveQuotedPrices) {
    for (const item of salesPricedItems) item.unitPrice = item.quotedUnitPrice
  } else if (salesTotalExcludingTax !== null && totalCost > 0 && !missingCost.length) {
    for (const item of salesPricedItems) {
      const cost = item.costInclTax / (1 + item.taxRate / 100)
      item.unitPrice = round((cost / totalCost * salesTotalExcludingTax) / Math.max(item.qty, 1), 6)
    }
  } else {
    for (const item of salesPricedItems) if (item.quotedUnitPrice !== null) item.unitPrice = item.quotedUnitPrice
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
      taxIncluded: source.sheets.length ? sourceTaxIncluded(source) : null,
      taxRate: source.sheets.length ? sourceTaxRate(source) : null,
      ...sourceRecognition(source),
    })),
    items,
    warnings,
    quoteTotal,
  }
}

module.exports = { mergeQuotations, sourceSalesTotalExcludingTax, sourceRole }
