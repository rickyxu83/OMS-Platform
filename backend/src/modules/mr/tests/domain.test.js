const assert = require('assert')
const { normalizeOrder, validateSubmission, computeApprovalSteps } = require('../domain')

function validBody(overrides = {}) {
  return {
    customerId: 1,
    salesOwnerId: 2,
    customerName: '测试客户',
    fillDate: '2026-08-05',
    latestDeliveryDate: '2026-08-20',
    purchaser: '采购人',
    recipient: '收件人',
    billingTiming: '随货',
    invoiceType: '13%增值税',
    pricingMode: 3,
    hasContract: false,
    invoiceProcess: '随货开立',
    billingContent: '设备',
    paymentTerms: '月结30天',
    splitDelivery: false,
    caseCategory: '硬件买卖',
    acceptance: '交货即验收',
    installOptions: ['NO'],
    maintenanceOptions: ['NO'],
    items: [{ name: '设备', qty: 1, unitPrice: 100, vendor: '厂商', costInclTax: 50, taxRate: 6 }],
    ...overrides,
  }
}

{
  const { order, items } = normalizeOrder(validBody())
  assert.deepStrictEqual(validateSubmission(order, items), [])
  assert.equal(order.totalExcludingTax, 100)
  assert.equal(items[0].subtotal, 100)
}

{
  const { order, items } = normalizeOrder(validBody({ fillDate: '2026-99-99' }))
  assert(validateSubmission(order, items).some((error) => error.field === 'fillDate'))
}

{
  const { order, items } = normalizeOrder(validBody({ installOptions: ['NO', '敦阳'] }))
  assert(validateSubmission(order, items).some((error) => error.message.includes('NO')))
}

{
  const { order, items } = normalizeOrder(validBody({
    pricingMode: 1,
    totalExcludingTax: 1000000,
    installOptions: ['敦阳'],
    items: [
      { name: 'A', qty: 1, vendor: '厂商', costInclTax: 113, taxRate: 13 },
      { name: 'B', qty: 2, vendor: '厂商', costInclTax: 226, taxRate: 13 },
    ],
  }))
  assert(Math.abs(items[0].marginRate - items[1].marginRate) < 0.01)
  assert.deepStrictEqual(computeApprovalSteps(order, items).map((step) => step.key), ['assistant', 'sales', 'engineering', 'supervisor', 'vp'])
}

{
  const { order, items } = normalizeOrder(validBody({
    pricingMode: 3,
    items: [{ name: '低毛利设备', qty: 1, unitPrice: 100, vendor: '厂商', costInclTax: 91, taxRate: 6 }],
  }))
  assert.deepStrictEqual(computeApprovalSteps(order, items).map((step) => step.key), ['assistant', 'sales', 'supervisor', 'vp'])
}

{
  const { order, items } = normalizeOrder(validBody({
    pricingMode: 2,
    totalExcludingTax: 10000,
    items: [{ name: '主设备', qty: 2, vendor: '厂商', costInclTax: 6000, taxRate: 13 }],
  }))
  assert.equal(items.length, 2)
  assert.equal(items[0].subtotal, 9900)
  assert.equal(items[1].name, '技术服务')
  assert.equal(items[1].subtotal, 100)
  assert.deepStrictEqual(validateSubmission(order, items), [])
}

{
  const manyItems = Array.from({ length: 25 }, (_, index) => ({ name: `设备 ${index + 1}`, qty: 1, unitPrice: 100, vendor: '厂商', costInclTax: 50, taxRate: 6 }))
  const { items } = normalizeOrder(validBody({ items: manyItems }))
  assert.equal(items.length, 25)
}

console.log('mr domain OK')
