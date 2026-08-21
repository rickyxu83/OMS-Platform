import type { MrItem, MrOrder } from '../types'

export function defaultCostTaxRate(invoiceType?: string | null) {
  return String(invoiceType || '').startsWith('6%') ? 6 : 13
}

export function blankItem(taxRate = 13): MrItem {
  return { name: '', description: '', oemSpec: '', companyPartNo: '', qty: 1, unitPrice: null, vendor: '', costInclTax: null, taxRate, warrantyService: '', installBy: '', purchaseOrderNo: '', shipmentNo: '' }
}

export function normalizeCostTaxRates(items: MrItem[], invoiceType?: string | null) {
  const forcedRate = String(invoiceType || '').startsWith('6%') ? 6 : null
  return items.map((item) => ({ ...item, taxRate: forcedRate || ([6, 13].includes(Number(item.taxRate)) ? Number(item.taxRate) : 13) }))
}

export function quotationDetailItems(items: MrItem[]) {
  return items.map((item) => ({ ...item, unitPrice: item.quotedUnitPrice ?? item.unitPrice ?? null }))
}

export function salesSubtotal(item: MrItem) {
  if (item.subtotal !== null && item.subtotal !== undefined) return Number(item.subtotal)
  if (item.quotedUnitPrice === null || item.quotedUnitPrice === undefined) return null
  return round(number(item.qty) * number(item.quotedUnitPrice))
}

export function singleIntegrationItems(items: MrItem[], invoiceType?: string | null, installOptions: string[] = []) {
  const rate = defaultCostTaxRate(invoiceType)
  const main = items[0] || blankItem(rate)
  const candidate = items[1]
  const isService = Boolean(candidate && `${candidate.name || ''}${candidate.description || ''}`.includes('服务'))
  const service = {
    ...(isService ? candidate : blankItem(rate)),
    name: isService ? candidate.name || '技术服务' : '技术服务',
    qty: 1,
    unitPrice: null,
    vendor: '',
    costInclTax: 0,
    taxRate: rate,
    installBy: installOptions.filter((value) => value !== 'NO').join('、'),
  }
  return normalizeCostTaxRates([main, service], invoiceType)
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function costExcludingTax(item: MrItem) {
  if (item.costInclTax === null || item.costInclTax === undefined || item.taxRate === null || item.taxRate === undefined) return null
  return number(item.costInclTax) / (1 + number(item.taxRate) / 100)
}

export function calculateForm(order: MrOrder): MrOrder {
  const mode = number(order.pricingMode)
  const total = number(order.totalExcludingTax)
  let source: MrItem[] = normalizeCostTaxRates((order.items || []).slice(0, 200), order.invoiceType)
  if (mode === 2) {
    source = source.slice(0, 2)
    if (source.length === 0) source = [blankItem(defaultCostTaxRate(order.invoiceType))]
    if (source.length === 1) source = [...source, { ...blankItem(defaultCostTaxRate(order.invoiceType)), name: '技术服务', qty: 1, costInclTax: 0, vendor: '', installBy: (order.installOptions || []).filter((value) => value !== 'NO').join('、') }]
  }
  const costs = source.map(costExcludingTax)
  const costTotal = costs.reduce<number>((sum, cost) => sum + (cost || 0), 0)
  const pricedItems = source.filter((item) => !item.purchaseOnly)
  // 仅有供应商报价品项（无销售来源）时，purchaseOnly 品项就是 MR 主体，应参与总额分摊
  const includePurchaseOnly = pricedItems.length === 0
  const preserveQuotedPrices = mode === 1 && pricedItems.length > 0 && pricedItems.every((item) => item.quotedUnitPrice !== null && item.quotedUnitPrice !== undefined)
  const completeCosts = costs.every((cost) => cost !== null)
  const lastAllocationIndex = source.reduce((last, item, index) => (includePurchaseOnly || !item.purchaseOnly) && number(item.qty) > 0 && costs[index] !== null ? index : last, -1)
  let allocatedSales = 0
  const items = source.map((item, index) => {
    const qty = Math.max(0, number(item.qty))
    const cost = costs[index]
    let unitPrice = item.unitPrice == null ? null : number(item.unitPrice)
    let subtotal: number | null = null
    if (qty > 0 && !item.purchaseOnly && preserveQuotedPrices) unitPrice = number(item.quotedUnitPrice)
    else if (qty > 0 && mode === 1 && (includePurchaseOnly || !item.purchaseOnly) && completeCosts && costTotal > 0) {
      subtotal = index === lastAllocationIndex ? round(total - allocatedSales) : round((cost || 0) / costTotal * total)
      allocatedSales += subtotal
      unitPrice = subtotal / qty
    }
    // mode 2 单项系统集成：主项（第一项）是销售主体，即使仅采购（purchase_only）也必须分配 99%；技术服务分配 1%
    if (qty > 0 && mode === 2 && (index === 0 || !item.purchaseOnly)) unitPrice = total * (index === 0 ? 0.99 : 0.01) / qty
    if (subtotal === null) subtotal = unitPrice === null ? null : round(qty * unitPrice)
    const marginRate = subtotal && cost !== null ? round((subtotal - cost) / subtotal * 100, 4) : null
    return { ...item, rowNo: index + 1, unitPrice: unitPrice === null ? null : round(unitPrice, 6), subtotal, costExcludingTax: cost === null ? null : round(cost), marginRate }
  })
  const sales = items.reduce((sum, item) => sum + number(item.subtotal), 0)
  const costExcl = items.reduce((sum, item) => sum + number(item.costExcludingTax), 0)
  const costIncl = items.reduce((sum, item) => sum + number(item.costInclTax), 0)
  const completeCostTotals = items.every((item) => item.costInclTax !== null && item.costInclTax !== undefined && item.costExcludingTax !== null && item.costExcludingTax !== undefined)
  const salesTotal = mode === 3 ? round(sales) : order.totalExcludingTax
  const tax = String(order.invoiceType || '').startsWith('13%') ? 13 : 6
  return {
    ...order,
    totalExcludingTax: salesTotal,
    items,
    totals: {
      salesExcludingTax: round(sales),
      vat: round(sales * tax / 100),
      salesIncludingTax: round(sales * (1 + tax / 100)),
      costExcludingTax: completeCostTotals ? round(costExcl) : null,
      costIncludingTax: completeCostTotals ? round(costIncl) : null,
      marginRate: completeCostTotals && sales > 0 ? round((sales - costExcl) / sales * 100, 4) : null,
    },
  }
}
