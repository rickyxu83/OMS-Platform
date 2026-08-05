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
  return [part && `part:${part}`, description && `desc:${description}`, name && `name:${name}`].filter(Boolean)
}

function sourceTotal(source) {
  return source.sheets.reduce((sum, sheet) => sum + number(sheet.total), 0)
}

function vendorName(source, vendors) {
  const filename = normalized(path.basename(source.name, path.extname(source.name)))
  const evidence = normalized([
    source.name,
    ...source.sheets.flatMap((sheet) => [sheet.seller?.from, sheet.seller?.email]),
  ].join(' '))
  const match = vendors.find((vendor) => {
    const name = normalized(vendor.name)
    if (name && (filename.includes(name) || evidence.includes(name))) return true
    const website = String(vendor.officialWebsite || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '')
    return website && evidence.includes(normalized(website))
  })
  return match?.name || path.basename(source.name, path.extname(source.name))
}

function flattenedItems(source, sourceIndex, vendors) {
  const vendor = vendorName(source, vendors)
  return source.sheets.flatMap((sheet) => sheet.items.map((item) => ({
    ...item,
    taxRate: [6, 13].includes(Number(sheet.tax_rate)) ? Number(sheet.tax_rate) : 13,
    sourceIndex,
    sourceName: source.name,
    vendor,
  })))
}

function descriptionFields(value, fallback) {
  const description = String(value || '').trim()
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return { name: lines[0] || fallback || '', description }
}

function mergeQuotations(sources, vendors = []) {
  if (!sources.length) return { sources: [], items: [], warnings: [], salesSourceIndex: -1 }

  const totals = sources.map(sourceTotal)
  const salesSourceIndex = totals.reduce((best, total, index) => total > totals[best] ? index : best, 0)
  const purchaseItems = sources.flatMap((source, index) => index === salesSourceIndex ? [] : flattenedItems(source, index, vendors))
  const purchasesByKey = new Map()
  for (const item of purchaseItems) {
    for (const key of itemKeys(item)) {
      const values = purchasesByKey.get(key) || []
      values.push(item)
      purchasesByKey.set(key, values)
    }
  }

  const salesItems = flattenedItems(sources[salesSourceIndex], salesSourceIndex, vendors)
  const warnings = []
  const items = salesItems.slice(0, 200).map((sale, index) => {
    const candidates = itemKeys(sale).flatMap((key) => purchasesByKey.get(key) || [])
    const uniqueCandidates = [...new Map(candidates.map((item) => [`${item.sourceIndex}:${item.item_no}:${item.part_no}`, item])).values()]
    const purchase = uniqueCandidates.sort((left, right) => number(left.unit_price) - number(right.unit_price))[0]
    const qty = number(sale.qty) || 1
    const salePrice = sale.unit_price == null ? null : number(sale.unit_price)
    const fields = descriptionFields(sale.description, sale.part_no)
    if (!purchase) warnings.push(`第 ${index + 1} 项“${fields.name || sale.part_no}”没有匹配到进货报价`)
    return {
      companyPartNo: '',
      oemSpec: sale.part_no || '',
      ...fields,
      warrantyService: '',
      installBy: '',
      qty,
      unitPrice: salePrice,
      vendor: purchase?.vendor || '',
      costInclTax: purchase ? round(number(purchase.unit_price) * qty * (1 + purchase.taxRate / 100)) : null,
      taxRate: purchase?.taxRate || 13,
      purchaseOrderNo: '',
      costSource: purchase?.sourceName || '',
    }
  })

  if (salesItems.length > 200) warnings.push(`销售报价有 ${salesItems.length} 项，MR 最多保留前 200 项`)
  const matchedPurchaseIndexes = new Set()
  for (const sale of salesItems) {
    for (const key of itemKeys(sale)) {
      for (const item of purchasesByKey.get(key) || []) matchedPurchaseIndexes.add(`${item.sourceIndex}:${item.item_no}:${item.part_no}`)
    }
  }
  const unmatchedPurchases = purchaseItems.filter((item) => !matchedPurchaseIndexes.has(`${item.sourceIndex}:${item.item_no}:${item.part_no}`))
  if (unmatchedPurchases.length) warnings.push(`另有 ${unmatchedPurchases.length} 个进货品项未匹配销售报价，请核对原文件`)

  return {
    salesSourceIndex,
    sources: sources.map((source, index) => ({
      index,
      name: source.name,
      role: index === salesSourceIndex ? 'sales' : 'purchase',
      total: round(totals[index]),
      itemCount: source.sheets.reduce((sum, sheet) => sum + sheet.items.length, 0),
      vendor: index === salesSourceIndex ? '' : vendorName(source, vendors),
    })),
    items,
    warnings,
  }
}

module.exports = { mergeQuotations }
