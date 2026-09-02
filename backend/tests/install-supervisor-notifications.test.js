const assert = require('node:assert/strict')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'

const backendRoot = `${process.cwd()}/src/`
for (const id of Object.keys(require.cache)) {
  if (id.startsWith(backendRoot)) delete require.cache[id]
}

const orders = new Map()
const devices = []
const parts = []
const supervisors = []
const queue = new Map()
const sent = []
let notifyEnabled = 'true'
let mailBehavior = 'sent'

function seedOrder(overrides = {}) {
  const order = {
    id: 1,
    order_no: 'OMS-2026-0001',
    status: 'submitted',
    service_mode: 'onsite',
    service_type: 'install',
    device_id: null,
    issue_description: '新机安装',
    customer_name: '测试客户',
    engineer_name: '张工',
    submitted_at: '2026-09-02 10:00:00',
    updated_at: '2026-09-02 10:00:00',
    ...overrides,
  }
  orders.set(order.id, order)
  return order
}

const dbPath = require.resolve('../src/config/db')
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params = {}) => {
      if (/CREATE TABLE IF NOT EXISTS service_order_install_supervisor_notifications/.test(sql)) return []
      // 排队门槛：单查询 service_orders 基础字段
      if (/SELECT id, status, service_mode, service_type\s+FROM service_orders/.test(sql)) {
        const order = orders.get(Number(params.serviceOrderId))
        return order ? [{ id: order.id, status: order.status, service_mode: order.service_mode, service_type: order.service_type }] : []
      }
      if (/INSERT INTO service_order_install_supervisor_notifications/.test(sql)) {
        queue.set(Number(params.serviceOrderId), {
          service_order_id: Number(params.serviceOrderId),
          status: 'pending',
          attempts: 0,
          last_error: null,
        })
        return { affectedRows: 1 }
      }
      // 到期队列扫描
      if (/FROM service_order_install_supervisor_notifications/.test(sql) && /status = 'pending'/.test(sql) && /due_at <= CURRENT_TIMESTAMP/.test(sql)) {
        return [...queue.values()].filter((item) => item.status === 'pending').map((item) => ({ service_order_id: item.service_order_id }))
      }
      // 发送认领
      if (/SET status = 'sending'/.test(sql)) {
        const item = queue.get(Number(params.orderId))
        if (!item || item.status !== 'pending') return { affectedRows: 0 }
        item.status = 'sending'
        return { affectedRows: 1 }
      }
      // 结果回写
      if (/SET status = :status/.test(sql)) {
        const item = queue.get(Number(params.serviceOrderId))
        if (!item) return { affectedRows: 0 }
        item.status = params.status
        item.last_error = params.lastError
        return { affectedRows: 1 }
      }
      // 发送上下文：工单详情
      if (/FROM service_orders so/.test(sql)) {
        const order = orders.get(Number(params.serviceOrderId))
        return order ? [{ ...order }] : []
      }
      if (/FROM devices/.test(sql) && /installation_source_service_order_id/.test(sql)) {
        return devices.filter((device) => device.source_order_id === Number(params.serviceOrderId))
      }
      if (/FROM devices/.test(sql) && /WHERE id = :deviceId/.test(sql)) {
        return devices.filter((device) => device.id === Number(params.deviceId))
      }
      if (/FROM service_parts/.test(sql)) {
        return parts.filter((part) => part.service_order_id === Number(params.serviceOrderId) && part.action_type === 'installation')
      }
      if (/FROM users/.test(sql)) {
        return supervisors.filter((user) => user.email)
      }
      return []
    },
    transaction: async (callback) => callback({ execute: async () => [{ affectedRows: 1 }, []] }),
  },
}

const settingsPath = require.resolve('../src/modules/settings/controller')
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: {
    effectiveSettings: async () => ({
      notification: {
        serviceOrderInstallSupervisorNotifyEnabled: notifyEnabled,
        serviceOrderSalesDelayMinutes: '60',
        serviceOrderAdminBaseUrl: 'https://admin.example.test',
      },
    }),
  },
}

const mailPath = require.resolve('../src/services/mail')
require.cache[mailPath] = {
  id: mailPath,
  filename: mailPath,
  loaded: true,
  exports: {
    sendInstallSupervisorMail: async (order, installDevices, installParts, recipients, detailUrl) => {
      if (mailBehavior === 'failed') throw new Error('smtp unavailable')
      if (mailBehavior === 'skipped') return { skipped: true, reason: 'mail_disabled' }
      sent.push({ order, installDevices, installParts, recipients, detailUrl })
      return { sent: true, to: recipients.map((item) => item.email) }
    },
  },
}

const {
  queueInstallSupervisorNotification,
  deleteInstallSupervisorNotificationsForOrderIds,
  processDueInstallSupervisorNotifications,
} = require('../src/services/install-supervisor-notifications')

;(async () => {
  // 1. 开关关闭时不排队
  notifyEnabled = 'false'
  seedOrder()
  const disabled = await queueInstallSupervisorNotification(1)
  assert.equal(disabled.skipped, true)
  assert.equal(disabled.reason, 'install_supervisor_notify_disabled')
  notifyEnabled = 'true'

  // 2. 非安装 / 非现场工单不排队
  seedOrder({ id: 2, service_type: 'repair' })
  const repair = await queueInstallSupervisorNotification(2)
  assert.equal(repair.skipped, true)
  assert.equal(repair.reason, 'not_install_onsite')

  seedOrder({ id: 3, service_mode: 'remote' })
  const remote = await queueInstallSupervisorNotification(3)
  assert.equal(remote.skipped, true)
  assert.equal(remote.reason, 'not_install_onsite')

  // 3. 现场安装工单正常排队；已作废工单不排队
  seedOrder({ id: 4, status: 'cancelled' })
  const cancelled = await queueInstallSupervisorNotification(4)
  assert.equal(cancelled.skipped, true)
  assert.equal(cancelled.reason, 'order_cancelled')

  const queued = await queueInstallSupervisorNotification(1)
  assert.equal(queued.queued, true)
  assert.equal(queue.get(1).status, 'pending')

  // 4. 无主管邮箱时发送阶段跳过
  let result = await processDueInstallSupervisorNotifications()
  assert.equal(result.skipped, 1)
  assert.equal(queue.get(1).status, 'skipped')
  assert.equal(queue.get(1).last_error, 'no_active_supervisor_email')

  // 5. 已跳过的工单再次提交可重新排队（状态重置）
  const requeued = await queueInstallSupervisorNotification(1)
  assert.equal(requeued.queued, true)
  assert.equal(queue.get(1).status, 'pending')

  // 6. 正常发送：安装设备与配件栏位都进入邮件上下文
  supervisors.push({ id: 20, real_name: '王主管', email: 'supervisor@example.test' })
  devices.push({ id: 100, source_order_id: 1, name: '交换机', model: 'S5130', pn: 'PN-1', serial_no: 'SN-1' })
  parts.push({ id: 200, service_order_id: 1, action_type: 'installation', part_name: '光模块', part_no: 'SFP+', quantity: 2, unit: '个', remark: null })
  parts.push({ id: 201, service_order_id: 1, action_type: 'general', part_name: '扎带', part_no: null, quantity: 10, unit: '根', remark: null })

  result = await processDueInstallSupervisorNotifications()
  assert.equal(result.sent, 1)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].installDevices.length, 1)
  assert.equal(sent[0].installParts.length, 1)
  assert.equal(sent[0].installParts[0].part_name, '光模块')
  assert.equal(sent[0].recipients[0].email, 'supervisor@example.test')
  assert.equal(sent[0].detailUrl, 'https://admin.example.test/service-orders?orderId=1')
  assert.equal(queue.get(1).status, 'sent')

  // 7. 已发送的工单再次提交会重新排队再通知（主管看到最终状态）
  const again = await queueInstallSupervisorNotification(1)
  assert.equal(again.queued, true)
  assert.equal(queue.get(1).status, 'pending')
  devices.length = 0
  result = await processDueInstallSupervisorNotifications()
  assert.equal(result.sent, 1)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].installDevices.length, 0)

  // 8. 历史单设备工单：无来源标记设备时兜底取工单 device_id
  seedOrder({ id: 5, device_id: 300 })
  devices.push({ id: 300, source_order_id: null, name: '旧设备', model: 'Old-1', pn: null, serial_no: null })
  await queueInstallSupervisorNotification(5)
  result = await processDueInstallSupervisorNotifications()
  assert.equal(result.sent, 1)
  assert.equal(sent[2].installDevices.length, 1)
  assert.equal(sent[2].installDevices[0].name, '旧设备')

  // 9. 邮件通道失败时标记 failed，不丢队列
  seedOrder({ id: 6 })
  await queueInstallSupervisorNotification(6)
  mailBehavior = 'failed'
  result = await processDueInstallSupervisorNotifications()
  assert.equal(result.failed, 1)
  assert.equal(queue.get(6).status, 'failed')
  mailBehavior = 'sent'

  // 10. 发送时工单已被作废则跳过
  seedOrder({ id: 7 })
  await queueInstallSupervisorNotification(7)
  orders.get(7).status = 'cancelled'
  result = await processDueInstallSupervisorNotifications()
  assert.equal(result.skipped, 1)
  assert.equal(queue.get(7).last_error, 'order_cancelled')

  // 11. 删除清理不抛错（表不存在场景由 ER_NO_SUCH_TABLE 容忍，此处正常路径）
  await deleteInstallSupervisorNotificationsForOrderIds(null, [1, 2])

  console.log('install-supervisor-notifications tests passed')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
