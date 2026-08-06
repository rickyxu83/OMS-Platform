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
  const name = normalized(descriptionText.split(/\r?\n/)[0])
  const keys = [part && `part:${part}`, description && `desc:${description}`, name && `name:${name}`].filter(Boolean)
  if (description.includes('forticare') || description.includes('续保') || description.includes('維保')) keys.push('service:' + description.replace(/\d+/g, ''))
  return keys
}

function sourceTotal(source) {
  return source.sheets.reduce((sum, sheet) => sum + number(sheet.total ?? sheet.discounted_total ?? sheet.total_amount ?? sheet.untaxed_total), 0)
}

function firstSheet(source) {
  return source.sheets?.[0] || {}
}

function sourceTaxRate(source) {
  const rate = firstSheet(source).tax_rate
  return [6, 13].includes(Number(rate)) ? Number(rate) : 13
}

function sourceTaxIncluded(source) {
  return Boolean(firstSheet(source).tax_included)
}

function sourceSalesTotalExcludingTax(source) {
  const sheet = firstSheet(source)
  const rate = sourceTaxRate(source)
  if (source.documentType === 'customer_order') {
    if (sheet.untaxed_total !== null && sheet.untaxed_total !== undefined) return number(sheet.untaxed_total)
    if (sheet.total_amount !== null && sheet.total_amount !== undefined) return number(sheet.total_amount) / (1 + rate / 100)
  }
  if (sheet.discounted_total !== null && sheet.discounted_total !== undefined) {
    return sourceTaxIncluded(source) ? number(sheet.discounted_total) / (1 + rate / 100) : number(sheet.discounted_total)
  }
  if (sheet.untaxed_total !== null && sheet.untaxed_total !== undefined) return number(sheet.untaxed_total)
  const total = sourceTotal(source)
  return sourceTaxIncluded(source) ? total / (1 + rate / 100) : total
}

function vendorName(source, vendors) {
  const filename = normalized(path.basename(source.name, path.extname(source.name)))
  const evidence = normalized([
    source.name,
    ...source.sheets.flatMap((sheet) => [sheet.seller?.from, sheet.vendor, ...(sheet.notes || [])]),
  ].join(' '))
  const match = vendors.find((vendor) => {
    const name = normalized(vendor.name)
    if (name && (filename.includes(name) || evidence.includes(name))) return true
    const website = String(vendor.officialWebsite || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '')
    return website && evidence.includes(normalized(website))
  })
  return match?.name || path.basename(source.name, path.extname(source.name))
}

function sourceRole(source, index, sources) {
  if (source.documentType === 'customer_order') return 'order'
  if (source.documentType === 'sales_quote') return 'sales'
  if (source.documentType === 'purchase_quote') return 'purchase'
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

function mergeQuotations(inputSources, vendors = []) {
  if (!inputSources.length) return { sources: [], items: [], warnings: [], salesSourceIndex: -1, orderSourceIndex: -1, salesTotalExcludingTax: null }
  const sources = inputSources.map((source, index) => ({ ...source, role: sourceRole(source, index, inputSources) }))
  const orderSourceIndex = sources.findIndex((source) => source.role === 'order')
  const salesSourceIndex = sources.findIndex((source) => source.role === 'sales')
  const effectiveSalesSourceIndex = salesSourceIndex >= 0 ? salesSourceIndex : orderSourceIndex >= 0 ? orderSourceIndex : 0
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
  const salesSource = sources[effectiveSalesSourceIndex]
  const salesItems = flattenedItems(salesSource, effectiveSalesSourceIndex, vendors)
  const warnings = [...sources.flatMap((source) => source.warnings || [])]
  const unknownTaxSources = new Set()
  const matchedPurchaseIndexes = new Set()
  const items = []

  for (const sale of salesItems) {
    const candidates = itemKeys(sale).flatMap((key) => purchasesByKey.get(key) || [])
    const purchase = pickPurchase(candidates)
    if (purchase) {
      for (const key of itemKeys(sale)) {
        for (const candidate of purchasesByKey.get(key) || []) matchedPurchaseIndexes.add(`${candidate.sourceIndex}:${candidate.item_no}:${candidate.part_no}:${candidate.description}`)
      }
    }
    const fields = descriptionFields(sale.description, sale.part_no)
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
      vendor: purchase?.vendor || '',
      costInclTax: purchase ? round(costInclTax(purchase)) : null,
      taxRate: purchase?.taxRate || 13,
      purchaseOrderNo: '',
      costSource: purchase?.sourceName || '',
      salesSource: sale.sourceName,
    })
  }

  for (const purchase of purchaseItems) {
    const key = `${purchase.sourceIndex}:${purchase.item_no}:${purchase.part_no}:${purchase.description}`
    if (matchedPurchaseIndexes.has(key)) continue
    const fields = descriptionFields(purchase.description, purchase.part_no)
    items.push({
      companyPartNo: '',
      oemSpec: purchase.part_no || '',
      ...fields,
      warrantyService: '',
      installBy: '',
      qty: number(purchase.qty) || 1,
      unitPrice: null,
      vendor: purchase.vendor || '',
      costInclTax: round(costInclTax(purchase)),
      taxRate: purchase.taxRate || 13,
      purchaseOrderNo: '',
      costSource: purchase.sourceName,
      salesSource: '',
    })
    warnings.push(`进货报价“${fields.name || purchase.part_no}”未在客户报价中出现，已作为待确认品项加入预览`)
  }

  const salesTotalExcludingTax = sourceSalesTotalExcludingTax(sources[orderSourceIndex >= 0 ? orderSourceIndex : effectiveSalesSourceIndex])
  const orderTotal = orderSourceIndex >= 0 ? sourceTotal(sources[orderSourceIndex]) : null
  const quoteTotal = salesSourceIndex >= 0 ? sourceSalesTotalExcludingTax(sources[salesSourceIndex]) : null
  if (orderSourceIndex >= 0 && salesSourceIndex >= 0 && Math.abs(number(orderTotal) - number(sourceTotal(sources[salesSourceIndex]))) > 0.01) {
    warnings.push(`最终 PO 金额 ${round(orderTotal)} 覆盖客户报价金额 ${round(sourceTotal(sources[salesSourceIndex]))}`)
  }
  if (unknownTaxSources.size) warnings.push(`${[...unknownTaxSources].join('、')} 未识别到明确成本税率，暂按 13% 导入，请逐项核对`)

  const totalCost = items.reduce((sum, item) => sum + (item.costInclTax === null ? 0 : item.costInclTax / (1 + item.taxRate / 100)), 0)
  const missingCost = items.filter((item) => item.costInclTax === null)
  if (missingCost.length) warnings.push(`有 ${missingCost.length} 个品项缺少成本，暂不计算完整毛利；请补充厂商报价`)
  if (salesTotalExcludingTax !== null && totalCost > 0 && !missingCost.length) {
    for (const item of items) {
      const cost = item.costInclTax / (1 + item.taxRate / 100)
      item.unitPrice = round((cost / totalCost * salesTotalExcludingTax) / Math.max(item.qty, 1), 6)
    }
  } else if (salesSourceIndex >= 0 && orderSourceIndex < 0 && !missingCost.length) {
    const taxRate = sourceTaxRate(sources[salesSourceIndex])
    const taxIncluded = sourceTaxIncluded(sources[salesSourceIndex])
    for (const item of items.slice(0, salesItems.length)) {
      const sale = salesItems.find((candidate) => candidate.sourceName === item.salesSource && candidate.part_no === item.oemSpec && candidate.description === item.description)
      if (sale?.unit_price !== null && sale?.unit_price !== undefined) item.unitPrice = round(number(sale.unit_price) / (taxIncluded ? 1 + taxRate / 100 : 1), 6)
    }
  }

  return {
    salesSourceIndex: effectiveSalesSourceIndex,
    orderSourceIndex,
    salesTotalExcludingTax,
    sources: sources.map((source, index) => ({
      index,
      name: source.name,
      role: source.role,
      total: round(sourceTotal(source)),
      itemCount: source.sheets.reduce((sum, sheet) => sum + sheet.items.length, 0),
      vendor: source.role === 'purchase' ? vendorName(source, vendors) : '',
      documentType: source.documentType || 'unknown',
    })),
    items,
    warnings,
    quoteTotal,
  }
}

module.exports = { mergeQuotations, sourceSalesTotalExcludingTax, sourceRole }
