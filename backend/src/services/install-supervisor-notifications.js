const { query } = require('../config/db')
const { effectiveSettings } = require('../modules/settings/controller')
const { sendInstallSupervisorMail } = require('./mail')

let queueTableReady = false

async function executeWith(optionalConnection, sql, params = {}) {
  if (optionalConnection) {
    const [rows] = await optionalConnection.execute(sql, params)
    return rows
  }
  return query(sql, params)
}

async function ensureInstallSupervisorNotificationQueueTable(connection = null) {
  if (!connection && queueTableReady) return
  await executeWith(
    connection,
    `CREATE TABLE IF NOT EXISTS service_order_install_supervisor_notifications (
      service_order_id BIGINT UNSIGNED NOT NULL,
      due_at DATETIME NOT NULL,
      status ENUM('pending', 'sending', 'sent', 'skipped', 'failed') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      last_error VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (service_order_id),
      KEY idx_install_supervisor_notifications_due (status, due_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  if (!connection) queueTableReady = true
}

function normalizeDelayMinutes(value) {
  return Math.max(5, Math.min(1440, Number(value || 60)))
}

// 仅「现场 + 安装」类工单需要主管确认安装设备/配件栏位
async function loadOrderGate(serviceOrderId, connection = null) {
  const rows = await executeWith(
    connection,
    `SELECT id, status, service_mode, service_type
     FROM service_orders
     WHERE id = :serviceOrderId
     LIMIT 1`,
    { serviceOrderId },
  )
  return rows[0] || null
}

function isInstallOnsiteOrder(order) {
  return order && order.service_mode === 'onsite' && order.service_type === 'install'
}

async function queueInstallSupervisorNotification(serviceOrderId, connection = null) {
  const id = Number(serviceOrderId || 0)
  if (!id) return { skipped: true, reason: 'missing_order_id' }

  const settings = await effectiveSettings()
  const notification = settings.notification || {}
  if (notification.serviceOrderInstallSupervisorNotifyEnabled !== 'true') {
    return { skipped: true, reason: 'install_supervisor_notify_disabled' }
  }

  const order = await loadOrderGate(id, connection)
  if (!order) return { skipped: true, reason: 'service_order_not_found' }
  if (!isInstallOnsiteOrder(order)) return { skipped: true, reason: 'not_install_onsite' }
  if (order.status === 'cancelled') return { skipped: true, reason: 'order_cancelled' }

  await ensureInstallSupervisorNotificationQueueTable(connection)
  const delayMinutes = normalizeDelayMinutes(notification.serviceOrderSalesDelayMinutes)
  // 与销售通知不同：已发送过的工单再次提交时重新排队，主管始终看到最终填写状态
  await executeWith(
    connection,
    `INSERT INTO service_order_install_supervisor_notifications (
       service_order_id, due_at, status, attempts, sent_at, last_error
     )
     VALUES (
       :serviceOrderId, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${delayMinutes} MINUTE), 'pending', 0, NULL, NULL
     )
     ON DUPLICATE KEY UPDATE
       due_at = VALUES(due_at),
       status = 'pending',
       attempts = 0,
       sent_at = NULL,
       last_error = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    { serviceOrderId: id },
  )
  return { queued: true, serviceOrderId: id, delayMinutes }
}

// 删除工单前清理通知队列行(schema.sql 中该表有指向 service_orders 的外键,无 CASCADE);
// 队列表为惰性建表,可能尚不存在,ER_NO_SUCH_TABLE 忽略。
async function deleteInstallSupervisorNotificationsForOrderIds(connection, orderIds) {
  const ids = (Array.isArray(orderIds) ? orderIds : []).map((id) => Number(id)).filter(Boolean)
  if (!ids.length) return
  const params = {}
  const placeholders = ids.map((id, index) => {
    params[`orderId${index}`] = id
    return `:orderId${index}`
  })
  try {
    await executeWith(
      connection,
      `DELETE FROM service_order_install_supervisor_notifications WHERE service_order_id IN (${placeholders.join(',')})`,
      params,
    )
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
  }
}

function compactText(value, maxLength = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}...`
}

function buildOrderDetailUrl(baseUrl, orderId) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/service-orders?orderId=${encodeURIComponent(String(orderId))}`
}

async function loadInstallSupervisorContext(serviceOrderId) {
  const rows = await query(
    `SELECT
       so.id, so.order_no, so.status, so.service_mode, so.service_type,
       so.device_id, so.issue_description, so.contact_name, so.contact_phone,
       so.submitted_at, so.updated_at,
       c.name AS customer_name,
       engineer.real_name AS engineer_name
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN users engineer ON engineer.id = so.assigned_engineer_id
     WHERE so.id = :serviceOrderId
     LIMIT 1`,
    { serviceOrderId },
  )
  const order = rows[0]
  if (!order) return null

  // 安装设备：优先取本工单来源标记的设备；历史单设备工单兜底取工单 device_id 指向的设备
  let installDevices = await query(
    `SELECT id, name, model, pn, serial_no
     FROM devices
     WHERE installation_source_service_order_id = :serviceOrderId
     ORDER BY id ASC`,
    { serviceOrderId },
  )
  if (!installDevices.length && order.device_id) {
    installDevices = await query(
      `SELECT id, name, model, pn, serial_no
       FROM devices
       WHERE id = :deviceId
       LIMIT 1`,
      { deviceId: order.device_id },
    )
  }

  const installParts = await query(
    `SELECT id, part_name, part_no, quantity, unit, remark
     FROM service_parts
     WHERE service_order_id = :serviceOrderId
       AND action_type = 'installation'
     ORDER BY id ASC`,
    { serviceOrderId },
  )

  const supervisors = await query(
    `SELECT id, real_name, email
     FROM users
     WHERE status = 'active'
       AND role = 'engineering_supervisor'
       AND COALESCE(NULLIF(email, ''), NULL) IS NOT NULL
     ORDER BY id ASC`,
  )

  return {
    order: {
      ...order,
      issue_description: compactText(order.issue_description),
    },
    installDevices,
    installParts,
    supervisors,
  }
}

async function markNotification(serviceOrderId, status, detail = {}) {
  await query(
    `UPDATE service_order_install_supervisor_notifications
     SET status = :status,
         attempts = attempts + :attemptIncrement,
         sent_at = CASE WHEN :status = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
         last_error = :lastError
     WHERE service_order_id = :serviceOrderId`,
    {
      serviceOrderId,
      status,
      attemptIncrement: status === 'sent' || status === 'skipped' ? 0 : 1,
      lastError: detail.lastError ? String(detail.lastError).slice(0, 255) : null,
    },
  )
}

async function processDueInstallSupervisorNotifications(limit = 20) {
  const settings = await effectiveSettings()
  const notification = settings.notification || {}
  if (notification.serviceOrderInstallSupervisorNotifyEnabled !== 'true') {
    return { skipped: true, reason: 'install_supervisor_notify_disabled' }
  }

  await ensureInstallSupervisorNotificationQueueTable()
  const batchLimit = Math.max(1, Math.min(100, Number(limit || 20)))
  const rows = await query(
    `SELECT service_order_id
     FROM service_order_install_supervisor_notifications
     WHERE status = 'pending'
       AND due_at <= CURRENT_TIMESTAMP
     ORDER BY due_at ASC
     LIMIT ${batchLimit}`,
  )
  if (!rows.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 }

  let sent = 0
  let skipped = 0
  let failed = 0
  const adminBaseUrl = notification.serviceOrderAdminBaseUrl || ''

  for (const row of rows) {
    const orderId = Number(row.service_order_id)
    const claimed = await query(
      `UPDATE service_order_install_supervisor_notifications
       SET status = 'sending'
       WHERE service_order_id = :orderId
         AND status = 'pending'`,
      { orderId },
    )
    if (!claimed.affectedRows) continue

    try {
      const context = await loadInstallSupervisorContext(orderId)
      if (!context) {
        await markNotification(orderId, 'skipped', { lastError: 'service_order_not_found' })
        skipped += 1
        continue
      }
      if (!isInstallOnsiteOrder(context.order)) {
        await markNotification(orderId, 'skipped', { lastError: 'not_install_onsite' })
        skipped += 1
        continue
      }
      if (context.order.status === 'cancelled') {
        await markNotification(orderId, 'skipped', { lastError: 'order_cancelled' })
        skipped += 1
        continue
      }
      if (!context.supervisors.length) {
        await markNotification(orderId, 'skipped', { lastError: 'no_active_supervisor_email' })
        skipped += 1
        continue
      }

      const result = await sendInstallSupervisorMail(
        context.order,
        context.installDevices,
        context.installParts,
        context.supervisors,
        buildOrderDetailUrl(adminBaseUrl, orderId),
      )
      if (result?.skipped) {
        await markNotification(orderId, 'failed', { lastError: result.reason || 'mail_skipped' })
        failed += 1
        continue
      }
      await markNotification(orderId, 'sent')
      sent += 1
    } catch (error) {
      await markNotification(orderId, 'failed', { lastError: error?.message || 'send_failed' })
      failed += 1
    }
  }

  return { processed: rows.length, sent, skipped, failed }
}

module.exports = {
  ensureInstallSupervisorNotificationQueueTable,
  queueInstallSupervisorNotification,
  deleteInstallSupervisorNotificationsForOrderIds,
  processDueInstallSupervisorNotifications,
}
