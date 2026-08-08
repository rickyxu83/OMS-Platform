const assert = require('assert')
const { PDFParse } = require('pdf-parse')
delete process.env.MR_APPROVAL_EMAIL_DOMAINS
const { assertAssistantMapping, completeTask, resolveStepAssignee, _test } = require('../workflow')
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
    /工程主管在职审批人有 2 位/,
  )
  assert.deepStrictEqual(assertAssistantMapping(assistantRow()), {
    id: 9,
    name: '助理甲',
    email: 'assistant@example.com',
    role: 'assistant',
  })
  assert.throws(
    () => assertAssistantMapping(assistantRow({ assistant_role: 'sales' })),
    /当前业务请重新设置助理后再提交/,
  )
  assert.throws(
    () => assertAssistantMapping(assistantRow({ assistant_email: 'invalid' })),
    /当前业务请重新设置助理后再提交/,
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

  console.log('mr workflow and PDF tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
