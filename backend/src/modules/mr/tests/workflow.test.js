const assert = require('assert')
const { PDFParse } = require('pdf-parse')
delete process.env.MR_APPROVAL_EMAIL_DOMAINS
const { assertAssistantMapping, completeTask, resolveStepAssignee, resolvePurchaser, _test } = require('../workflow')
const { normalizeOrder, validateSubmission } = require('../domain')
const { buildMrPdf } = require('../mr-pdf')
const { getDefaultPermissionMatrix } = require('../../../permissions/catalog')

function assistantRow(overrides = {}) {
  return {
    status: 'active',
    assistant_id: 9,
    assistant_name: '助理甲',
    assistant_email: 'assistant@example.com',
    assistant_role: 'assistant',
    assistant_status: 'active',
    ...overrides,
  }
}

function pdfBuffer(order, approvals, options) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = buildMrPdf(order, approvals, options)
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

async function main() {
  const permissions = getDefaultPermissionMatrix()
  assert.strictEqual(permissions.admin['mr.approve'], false)
  assert.strictEqual(permissions.assistant['mr.approve'], true)
  assert.strictEqual(permissions.purchaser['mr.purchase'], true, '采购角色默认可填写采购订单号')
  assert.strictEqual(permissions.purchaser['mr.view'], true, '采购角色默认可查看订购申请')
  assert.strictEqual(permissions.purchaser['workspace.admin'], true, '采购角色默认可进入管理工作台')
  assert.strictEqual(permissions.admin['mr.purchase'], true, '管理员默认可填写采购订单号')
  assert.strictEqual(permissions.sales['mr.purchase'], false, '业务不可填写采购订单号')
  assert.strictEqual(permissions.assistant['mr.purchase'], false, '助理不可填写采购订单号')
  await assert.rejects(
    resolvePurchaser({ async execute() { return [[]] } }),
    /采购角色未配置在职人员/,
  )
  await assert.rejects(
    resolvePurchaser({
      async execute() {
        return [[
          { id: 31, name: '采购甲', email: 'buyer-a@example.com', role: 'purchaser' },
          { id: 32, name: '采购乙', email: 'buyer-b@example.com', role: 'purchaser' },
        ]]
      },
    }),
    /采购角色在职人员有 2 位/,
  )
  const purchaser = await resolvePurchaser({
    async execute() { return [[{ id: 31, name: '采购甲', email: 'buyer-a@example.com', role: 'purchaser' }]] },
  })
  assert.deepStrictEqual(purchaser, { id: 31, name: '采购甲', email: 'buyer-a@example.com', role: 'purchaser' })
  for (const [permission, enabled] of Object.entries(permissions.engineer)) {
    if (enabled) assert.strictEqual(permissions.engineering_supervisor[permission], true, `工程主管缺少工程师权限 ${permission}`)
  }
  for (const [permission, enabled] of Object.entries(permissions.sales)) {
    if (enabled) assert.strictEqual(permissions.sales_supervisor[permission], true, `业务主管缺少业务权限 ${permission}`)
  }
  await assert.rejects(
    resolveStepAssignee({
      async execute() {
        return [[
          { id: 3, name: '工程主管甲', email: 'engineer-a@example.com', role: 'engineering_supervisor' },
          { id: 23, name: '工程主管乙', email: 'engineer-b@example.com', role: 'engineering_supervisor' },
        ]]
      },
    }, {}, 'engineering', { required: true }),
    /工程主管在职签核人有 2 位/,
  )
  assert.deepStrictEqual(assertAssistantMapping(assistantRow()), {
    id: 9,
    name: '助理甲',
    email: 'assistant@example.com',
    role: 'assistant',
  })
  assert.throws(
    () => assertAssistantMapping(assistantRow({ assistant_role: 'sales' })),
    /请为当前业务负责人重新设置助理后再提交/,
  )
  assert.throws(
    () => assertAssistantMapping(assistantRow({ assistant_email: 'invalid' })),
    /请为当前业务负责人重新设置助理后再提交/,
  )

  const vendorOrder = normalizeOrder({
    pricingMode: 2,
    totalExcludingTax: 100,
    invoiceType: '13%增值税',
    items: [
      { name: '主设备', qty: 1, unitPrice: 99, vendor: '厂商甲', costInclTax: 80, taxRate: 13 },
      { name: '技术服务', qty: 1, unitPrice: 1, vendor: '', costInclTax: 0, taxRate: 13 },
    ],
  })
  assert.deepStrictEqual(
    validateSubmission(vendorOrder.order, vendorOrder.items).filter((error) => error.field?.endsWith('.vendor')),
    [],
    '单项系统集成主项已填厂商时不得误报，技术服务行无需厂商',
  )

  const before = _test.comparableSnapshot({
    id: 1,
    status: 'draft',
    customerName: '甲客户',
    items: [{ name: '设备', qty: 1, unitPrice: 100 }],
  })
  const after = _test.comparableSnapshot({
    id: 1,
    status: 'in_review',
    customerName: '甲客户',
    items: [{ name: '设备 A', qty: 2, unitPrice: 100 }],
  })
  assert.deepStrictEqual(_test.diffValues(before, after), [
    { field: 'items.0.name', before: '设备', after: '设备 A' },
    { field: 'items.0.qty', before: 1, after: 2 },
  ])

  const statements = []
  await completeTask({
    async execute(sql, params) { statements.push({ sql, params }); return [{ affectedRows: 1 }] },
  }, 7, 'approved')
  assert.match(statements[0].sql, /mr_notification_outbox/)
  assert.match(statements[1].sql, /UPDATE approval_tasks/)
  assert.deepStrictEqual(statements[1].params, { approvalId: 7, status: 'approved' })

  const pdf = await pdfBuffer({
    id: 1,
    versionNo: 1,
    customerName: '甲客户',
    ctrlNo: 'MR-001',
    salesOwnerName: '业务甲',
    latestDeliveryDate: '2026-08-08',
    invoiceType: '13%增值税',
    pricingMode: 1,
    totalExcludingTax: 100,
    installOptions: ['敦阳'],
    maintenanceOptions: ['NO'],
    splitDelivery: 0,
    grossProfitRecognitionStartMonth: '2026-08-12',
    grossProfitRecognitionAmount: 30,
    remainingRecognizableGrossProfit: 70,
    taiwanBusinessTransferStartMonth: '2026-09-18',
    taiwanBusinessTransferAmount: 20,
    remainingTaiwanBusinessTransfer: 50,
    remark: '按季度确认',
    quotationFiles: [{ name: '内部报价原始附件.xlsx' }],
    items: [{
      name: '服务器',
      description: '测试设备',
      qty: 1,
      unitPrice: 100,
      subtotal: 100,
      vendor: '厂商甲',
      costInclTax: 80,
      taxRate: 13,
    }],
    totals: { salesExcludingTax: 100, costExcludingTax: 70.8, marginRate: 29.2 },
  }, [{
    step_label: '助理',
    action: 'approve',
    approver_name_snapshot: '助理甲',
    approver_signature_snapshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    decided_at: '2026-08-08 10:00:00',
  }, {
    step_label: '业务',
    action: 'approve',
    reason: '确认无误',
    approver_name_snapshot: '业务乙',
    decided_at: '2026-08-08 11:00:00',
  }])
  assert.strictEqual(pdf.subarray(0, 4).toString(), '%PDF')
  assert(pdf.length > 1000)
  assert(pdf.includes(Buffer.from('/Subtype /Image')), 'MR PDF 应嵌入审批人的手写签名')
  assert.strictEqual((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, '正式 MR 不应追加原始文字附录')
  const parser = new PDFParse({ data: pdf })
  const extracted = await parser.getText()
  await parser.destroy()
  assert(extracted.text.includes('多项系统集成'), '正式 PDF 应保留已填写的计价模式')
  assert(extracted.text.includes('确认无误'), '正式 PDF 应保留已填写的签核意见')
  const compactText = extracted.text.replace(/\s+/g, '')
  assert(compactText.includes('2026年8月起每季度认列¥30.00') && compactText.includes('剩余¥70.00（按季）'), '毛利认列字段应组合成一行摘要')
  assert(compactText.includes('2026年9月起每季度转拨¥20.00') && compactText.includes('剩余¥50.00（按季）'), '台湾业务转拨字段应组合成一行摘要')
  assert(!compactText.includes('毛利认列起始日期') && !compactText.includes('剩余需转拨台湾业务总和'), '组合字段不应再逐项展示')
  assert(!compactText.includes('报价原始附件') && !compactText.includes('内部报价原始附件.xlsx'), 'PDF 不应显示报价原始附件')
  assert(!extracted.text.includes('客户 P/O'), '正式 PDF 不应显示空白客户 P/O')
  assert(!extracted.text.includes('采购单号 / 来源'), '正式 PDF 不应显示全为空的采购列')
  assert(!extracted.text.includes('未设置手写签名'), '正式 PDF 不应显示空白签名占位')

  const longPdf = await pdfBuffer({
    id: 2,
    versionNo: 1,
    customerName: '乙客户',
    ctrlNo: 'MR-002',
    remark: '备注'.repeat(5000),
    items: [{ name: '设备', description: '描述'.repeat(2000), qty: 1, unitPrice: 100, subtotal: 100 }],
  }, [])
  assert.strictEqual(longPdf.subarray(0, 4).toString(), '%PDF', '超长内容 PDF 应能正常生成')
  assert((longPdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length <= 4, '超长内容应被截断而不是无限分页')

  const voidedOrder = { id: 3, versionNo: 2, customerName: '丙客户', ctrlNo: 'MR-003', voidReason: '审批后作废原因', items: [{ name: '设备', qty: 1, unitPrice: 100, subtotal: 100 }] }
  const approvedRebuild = await pdfBuffer(voidedOrder, [])
  const approvedParser = new PDFParse({ data: approvedRebuild })
  const approvedText = await approvedParser.getText()
  await approvedParser.destroy()
  assert(!approvedText.text.includes('审批后作废原因'), '重建原审批 PDF 不得带入作废原因')
  const voidedPdf = await pdfBuffer(voidedOrder, [], { watermarkLabel: '已作废 · 审批后作废原因' })
  const voidedParser = new PDFParse({ data: voidedPdf })
  const voidedText = await voidedParser.getText()
  await voidedParser.destroy()
  assert(voidedText.text.includes('审批后作废原因'), '作废 PDF 应保留作废原因')

  assert(!extracted.text.includes('客户名称'), '正式 PDF 明细区不应重复汇总行已展示的客户名称')
  assert(!extracted.text.includes('最晚交付日期'), '明细区不应重复最晚交付日期（汇总条以「交付 / DELIVERY」格展示）')
  assert.strictEqual(extracted.text.split('交付 / DELIVERY').length - 1, 1, '汇总条应包含交付日期格')
  assert(extracted.text.includes('交易与开票') && extracted.text.includes('交付与验收'), '正式 PDF 资料区应按分组小标题展示')
  console.log('mr workflow and PDF tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
