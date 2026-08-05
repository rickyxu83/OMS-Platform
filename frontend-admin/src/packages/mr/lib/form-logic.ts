import type { MrItem, MrOrder, ParsedQuotationSheet } from '../types'

export function blankItem(): MrItem {
  return { name: '', description: '', oemSpec: '', companyPartNo: '', qty: 1, unitPrice: null, vendor: '', costInclTax: null, taxRate: 13, warrantyService: '', installBy: '', purchaseOrderNo: '' }
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
  let source = (order.items || []).slice(0, 20)
  if (mode === 2) {
    source = source.slice(0, 2)
    if (source.length === 0) source = [blankItem()]
    if (source.length === 1) source = [...source, { ...blankItem(), name: '技术服务', qty: 1, costInclTax: 0, taxRate: 6, vendor: '' }]
  }
  const costTotal = source.reduce((sum, item) => sum + (costExcludingTax(item) || 0), 0)
  const items = source.map((item, index) => {
    const qty = Math.max(0, number(item.qty))
    let unitPrice = item.unitPrice == null ? null : number(item.unitPrice)
    if (qty > 0 && mode === 1 && costTotal > 0) unitPrice = (costExcludingTax(item) || 0) / costTotal * total / qty
    if (qty > 0 && mode === 2) unitPrice = total * (index === 0 ? 0.99 : 0.01) / qty
    const subtotal = unitPrice === null ? null : round(qty * unitPrice)
    const cost = costExcludingTax(item)
    const marginRate = subtotal && cost !== null ? round((subtotal - cost) / subtotal * 100, 4) : null
    return { ...item, rowNo: index + 1, unitPrice: unitPrice === null ? null : round(unitPrice, 6), subtotal, costExcludingTax: cost === null ? null : round(cost), marginRate }
  })
  const sales = items.reduce((sum, item) => sum + number(item.subtotal), 0)
  const costExcl = items.reduce((sum, item) => sum + number(item.costExcludingTax), 0)
  const costIncl = items.reduce((sum, item) => sum + number(item.costInclTax), 0)
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
      costExcludingTax: round(costExcl),
      costIncludingTax: round(costIncl),
      marginRate: sales > 0 ? round((sales - costExcl) / sales * 100, 4) : null,
    },
  }
}

export function mapQuotation(sheet: ParsedQuotationSheet, priceTarget: 'unitPrice' | 'costInclTax'): MrItem[] {
  const rate = sheet.tax_rate === 6 || sheet.tax_rate === 13 ? sheet.tax_rate : 13
  return sheet.items.slice(0, 20).map((source) => {
    const lines = String(source.description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const price = source.unit_price == null ? null : Number(source.unit_price)
    const qty = source.qty || 1
    return {
      ...blankItem(),
      oemSpec: source.part_no || '',
      name: lines[0] || source.part_no || '',
      description: source.description || '',
      qty,
      unitPrice: priceTarget === 'unitPrice' ? price : null,
      costInclTax: priceTarget === 'costInclTax' && price !== null ? round(price * qty * (1 + rate / 100)) : null,
      taxRate: rate,
    }
  })
}
