const assert = require('assert')
const { normalizeOrder, validateSubmission, totals, computeApprovalSteps } = require('../domain')

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
  const { order } = normalizeOrder(validBody({ hasContract: 1, contractNo: 'C-1', contractType: '维护/服务', hasPenalty: 0, penaltyContent: '逾期罚则' }))
  assert.equal(order.hasContract, 1)
  assert.equal(order.contractType, null)
  assert.equal(order.hasPenalty, 1)

  const { order: withoutContract } = normalizeOrder(validBody({ contractNo: null, penaltyContent: '不应保留' }))
  assert.equal(withoutContract.hasContract, 0)
  assert.equal(withoutContract.hasPenalty, 0)
  assert.equal(withoutContract.penaltyContent, null)
}

{
  const { order, items } = normalizeOrder(validBody({ fillDate: null }))
  assert(!validateSubmission(order, items).some((error) => error.field === 'fillDate'))
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

{
  const { order, items } = normalizeOrder(validBody({
    invoiceType: '6%普通发票',
    deliveryLocation: '宁波市测试路 1 号',
    items: [{ name: '设备', qty: 1, unitPrice: 100, vendor: '厂商', costInclTax: 106, taxRate: 13 }],
  }))
  assert.equal(order.deliveryLocation, '宁波市测试路 1 号')
  assert.equal(items[0].taxRate, 6)
  assert.equal(items[0].costExcludingTax, 100)
  assert.deepStrictEqual(validateSubmission(order, items), [])
}

{
  const { order, items } = normalizeOrder(validBody({
    invoiceType: '13%增值税',
    items: [
      { name: '6%进货', qty: 1, unitPrice: 150, vendor: '厂商A', costInclTax: 106, taxRate: 6 },
      { name: '13%进货', qty: 1, unitPrice: 150, vendor: '厂商B', costInclTax: 113, taxRate: 13 },
    ],
  }))
  assert.deepStrictEqual(items.map((item) => item.taxRate), [6, 13])
  assert.deepStrictEqual(items.map((item) => item.costExcludingTax), [100, 100])
  assert.deepStrictEqual(validateSubmission(order, items), [])
}

{
  const { order, items } = normalizeOrder(validBody({ salesOwnerId: null }))
  assert.deepStrictEqual(validateSubmission(order, items), [])
}
{
  const { order, items } = normalizeOrder(validBody({
    pricingMode: 1,
    totalExcludingTax: 450000,
    items: [
      { name: 'A', qty: 2, quotedUnitPrice: 130000, vendor: '安稳特', costInclTax: 275634, taxRate: 13 },
      { name: 'B', qty: 1, quotedUnitPrice: 75000, vendor: '安稳特', costInclTax: 73512, taxRate: 13 },
      { name: 'C', qty: 1, quotedUnitPrice: 55000, vendor: '安稳特', costInclTax: 40836, taxRate: 13 },
      { name: 'D', qty: 3, quotedUnitPrice: 20000, vendor: '安稳特', costInclTax: 45900, taxRate: 13 },
    ],
  }))
  assert.deepStrictEqual(items.map((item) => item.unitPrice), [130000, 75000, 55000, 20000])
  assert.deepStrictEqual(validateSubmission(order, items), [])
}

{
  const { items } = normalizeOrder(validBody({
    pricingMode: 1,
    totalExcludingTax: 450000,
    items: [
      { name: 'A', qty: 2, vendor: '安稳特', costInclTax: 275634, taxRate: 13 },
      { name: 'B', qty: 1, vendor: '安稳特', costInclTax: 73512, taxRate: 13 },
      { name: 'C', qty: 1, vendor: '安稳特', costInclTax: 40836, taxRate: 13 },
      { name: 'D', qty: 3, vendor: '安稳特', costInclTax: 45900, taxRate: 13 },
    ],
  }))
  assert.equal(Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100, 450000)
}

{
  const { order, items } = normalizeOrder(validBody({ items: [{ name: '待补成本', qty: 1, unitPrice: 100, vendor: '待补', costInclTax: null, taxRate: 13 }] }))
  assert.deepStrictEqual(totals(order, items), { salesExcludingTax: 100, vat: 13, salesIncludingTax: 113, costExcludingTax: null, costIncludingTax: null, marginRate: null })
}

{
  const { order, items } = normalizeOrder(validBody({
    purchaserTel: '13800000001',
    purchaserMail: 'buyer@example.com',
    recipientTel: '',
    recipientMail: 'receiver@example.com',
    invoiceRecipient: '发票收件人',
    invoiceRecipientTel: '13800000002',
    invoiceRecipientMail: 'invoice@example.com',
  }))
  assert.equal(order.purchaserMail, 'buyer@example.com')
  assert.equal(order.invoiceRecipientTel, '13800000002')
  assert.equal(order.invoiceRecipientMail, 'invoice@example.com')
  assert.deepStrictEqual(validateSubmission(order, items), [])

  const invalid = normalizeOrder(validBody({ purchaserMail: 'invalid-email' }))
  assert(invalid.order.purchaserMail)
  assert(validateSubmission(invalid.order, invalid.items).some((error) => error.field === 'purchaserMail'))
}

console.log('mr domain OK')
