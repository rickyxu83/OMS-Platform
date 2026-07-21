// 高/中危 bug 修复回归测试(对应审查报告 B1/B2/B3/B6)
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const customersController = fs.readFileSync(path.join(root, 'src/modules/customers/controller.js'), 'utf8')
const serviceOrdersController = fs.readFileSync(path.join(root, 'src/modules/service-orders/controller.js'), 'utf8')

function stubConnection(rows = [], capture = {}) {
  return {
    async execute(sql, params) {
      capture.sql = sql
      capture.params = params
      return [rows]
    },
  }
}

async function main() {
  // B1: 强删客户时 inspection_schedules 的 DELETE 不得引用不存在的 device_id 列
  assert.doesNotMatch(
    customersController,
    /DELETE FROM inspection_schedules[\s\S]{0,300}?device_id/,
    'inspection_schedules 无 device_id 列,删除只能按 customer_id',
  )

  // B2: 复用历史签名必须校验归属(同客户 + 工程师仅限本人参与的工单)
  const { validateReusableSignatureFile, deletableOrderStatuses } = require('../src/modules/service-orders/controller')

  assert.equal(await validateReusableSignatureFile(stubConnection(), 0), null, '空 id 直接返回 null')

  const adminCapture = {}
  const adminConn = stubConnection([{ id: 42 }], adminCapture)
  const okId = await validateReusableSignatureFile(adminConn, 42, { customerId: 7, user: { id: 1, role: 'admin' } })
  assert.equal(okId, 42)
  assert.match(adminCapture.sql, /service_reports/, '归属校验必须查 service_reports 引用')
  assert.match(adminCapture.sql, /so\.customer_id = :customerId/, '必须限定同客户')
  assert.equal(adminCapture.params.customerId, 7)
  assert.doesNotMatch(adminCapture.sql, /scopeEngineerId/, '非工程师角色不加工程师范围')

  const engineerCapture = {}
  const engineerConn = stubConnection([{ id: 42 }], engineerCapture)
  await validateReusableSignatureFile(engineerConn, 42, { customerId: 7, user: { id: 9, role: 'engineer' } })
  assert.match(engineerCapture.sql, /service_order_engineers/, '工程师角色须限定本人参与的工单')
  assert.equal(engineerCapture.params.scopeEngineerId, 9)

  const denied = await validateReusableSignatureFile(stubConnection([]), 42, { customerId: 7, user: { id: 9, role: 'engineer' } })
  assert.equal(denied, null, '非本客户/无权访问的签名文件必须被拒绝')

  // B3: 删除工单必须清理 service_order_sales_notifications(容错惰性建表不存在)
  const { deleteSalesNotificationsForOrderIds } = require('../src/services/sales-notifications')

  const notifyCapture = {}
  await deleteSalesNotificationsForOrderIds(stubConnection([], notifyCapture), [1, 2])
  assert.match(notifyCapture.sql, /DELETE FROM service_order_sales_notifications WHERE service_order_id IN \(:orderId0,:orderId1\)/)
  assert.deepEqual(notifyCapture.params, { orderId0: 1, orderId1: 2 })

  const missingTableConn = { async execute() { const e = new Error('no such table'); e.code = 'ER_NO_SUCH_TABLE'; throw e } }
  await deleteSalesNotificationsForOrderIds(missingTableConn, [1]) // 不得抛出

  const realErrorConn = { async execute() { const e = new Error('deadlock'); e.code = 'ER_LOCK_DEADLOCK'; throw e } }
  await assert.rejects(() => deleteSalesNotificationsForOrderIds(realErrorConn, [1]), /deadlock/)

  await deleteSalesNotificationsForOrderIds(stubConnection(), []) // 空列表不执行 SQL

  // 三条删除路径都必须调用清理
  const soCallSites = serviceOrdersController.split('deleteSalesNotificationsForOrderIds').length - 1
  assert.ok(soCallSites >= 3, `service-orders 导入 + remove + bulkDelete 至少 3 处引用,实际 ${soCallSites}`)
  assert.match(customersController, /deleteSalesNotificationsForOrderIds\(connection, orderIds\)/, 'deleteServiceOrders 须清理通知队列')

  // B6: 批量删除与单删共用状态白名单
  assert.deepEqual(deletableOrderStatuses('engineer'), ['draft', 'assigned', 'rejected'])
  assert.deepEqual(deletableOrderStatuses('operations_director'), ['draft', 'assigned', 'rejected'])
  assert.deepEqual(deletableOrderStatuses('admin'), ['draft', 'assigned', 'rejected', 'cancelled'])
  assert.match(serviceOrdersController, /if \(!deletableOrderStatuses\(req\.user\.role\)\.includes\(order\.status\)\)/, 'remove 须使用共享白名单')
  assert.match(serviceOrdersController, /allowedStatuses\.includes\(row\.status\)/, 'bulkDelete 须做状态守卫')

  console.log('bugfix high/med regression tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
