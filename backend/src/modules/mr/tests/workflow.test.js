const assert = require('assert')
delete process.env.MR_APPROVAL_EMAIL_DOMAINS
const { assertAssistantMapping, completeTask, _test } = require('../lib/workflow')
const { buildMrPdf } = require('../lib/mr-pdf')
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

function pdfBuffer(order, approvals) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = buildMrPdf(order, approvals)
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
  }, [{ step_label: '助理', action: 'approve', approver_name_snapshot: '助理甲', decided_at: '2026-08-08 10:00:00' }])
  assert.strictEqual(pdf.subarray(0, 4).toString(), '%PDF')
  assert(pdf.length > 1000)

  console.log('mr workflow and PDF tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
