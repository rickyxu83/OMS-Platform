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
  const { order } = normalizeOrder(validBody({ caseCategory: '其它', installOptions: ['厂商'], maintenanceOptions: ['其它'] }))
  assert.equal(order.caseCategory, '其他')
  assert.deepStrictEqual(order.installOptions, ['供应商'])
  assert.deepStrictEqual(order.maintenanceOptions, ['其他'])
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
    grossProfitRecognitionStartMonth: '2026-08-12',
    grossProfitRecognitionAmount: '100.25',
    remainingRecognizableGrossProfit: '200',
    taiwan_business_transfer_start_month: '2026-09-18',
    taiwan_business_transfer_amount: '300.50',
    remaining_taiwan_business_transfer: '400',
    purchaserTel: '13800000001',
    purchaserMail: 'buyer@example.com',
    recipientTel: '',
    recipientMail: 'receiver@example.com',
    invoiceRecipient: '发票收件人',
    invoiceRecipientTel: '13800000002',
    invoiceRecipientMail: 'invoice@example.com',
  }))
  assert.deepStrictEqual([
    order.grossProfitRecognitionStartMonth, order.grossProfitRecognitionAmount, order.remainingRecognizableGrossProfit,
    order.taiwanBusinessTransferStartMonth, order.taiwanBusinessTransferAmount, order.remainingTaiwanBusinessTransfer,
  ], ['2026-08-12', 100.25, 200, '2026-09-18', 300.5, 400])
  assert.equal(normalizeOrder(validBody({ grossProfitRecognitionStartMonth: '2026-08' })).order.grossProfitRecognitionStartMonth, null)
  assert.equal(order.purchaserMail, 'buyer@example.com')
  assert.equal(order.invoiceRecipientTel, '13800000002')
  assert.equal(order.invoiceRecipientMail, 'invoice@example.com')
  assert.deepStrictEqual(validateSubmission(order, items), [])

  const invalid = normalizeOrder(validBody({ purchaserMail: 'invalid-email' }))
  assert(invalid.order.purchaserMail)
  assert(validateSubmission(invalid.order, invalid.items).some((error) => error.field === 'purchaserMail'))

  const purchaseOnly = normalizeOrder(validBody({ pricingMode: 1, totalExcludingTax: 1000, items: [
    { name: '正常品项', qty: 1, unitPrice: null, quotedUnitPrice: 600, vendor: '厂商A', costInclTax: 300, taxRate: 13 },
    { name: '补客户的光纤跳线', qty: 1, unitPrice: null, quotedUnitPrice: null, vendor: '厂商B', costInclTax: 200, taxRate: 13, purchaseOnly: true },
  ] }))
  assert.equal(purchaseOnly.items[0].unitPrice, 600, '有报价单价的销售品项保持报价单价')
  assert.equal(purchaseOnly.items[1].unitPrice, null, '待填售价品项不被成本分摊覆盖')
  assert.equal(purchaseOnly.items[1].subtotal, null)
  assert.equal(purchaseOnly.items[1].purchaseOnly, true, 'purchaseOnly 标记应透传')
  assert.equal(purchaseOnly.items[1].costExcludingTax, 176.99)

  const schedule = normalizeOrder(validBody({
    grossProfitRecognitions: [
      { startMonth: '2026-09', frequency: 'monthly', amount: 10000 },
      { startMonth: '2026-10', frequency: 'quarterly', amount: 30000 },
      { startMonth: '', frequency: 'monthly', amount: null },
    ],
    taiwanBusinessTransfers: JSON.stringify([
      { businessName: '存储项目A', startMonth: '2026-08', frequency: 'monthly', amount: 50000 },
      { businessName: '维保项目B', startMonth: '2026-09', frequency: 'quarterly', amount: 80000 },
    ]),
  }))
  assert.equal(schedule.order.grossProfitRecognitions.length, 2, '空条目应被过滤')
  assert.equal(schedule.order.grossProfitRecognitions[0].frequency, 'monthly')
  assert.equal(schedule.order.grossProfitRecognitions[1].frequency, 'quarterly')
  assert.equal(schedule.order.taiwanBusinessTransfers.length, 2, 'JSON 字符串应被解析')
  assert.equal(schedule.order.taiwanBusinessTransfers[0].businessName, '存储项目A')

  const legacy = normalizeOrder(validBody({ grossProfitRecognitionStartMonth: '2026-08-12', grossProfitRecognitionAmount: 100.25, taiwanBusinessTransferStartMonth: '2026-09-18', taiwanBusinessTransferAmount: 300.5 }))
  assert.deepStrictEqual(legacy.order.grossProfitRecognitions, [{ startMonth: '2026-08', frequency: 'quarterly', amount: 100.25 }], '旧版单值认列字段应升级为一笔排程')
  assert.equal(legacy.order.taiwanBusinessTransfers.length, 1)
  assert.equal(legacy.order.taiwanBusinessTransfers[0].startMonth, '2026-09')
}

console.log('mr domain OK')
