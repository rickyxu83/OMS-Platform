const { query } = require('../config/db')
const { effectiveSettings } = require('../modules/settings/controller')
const { sendSalesServiceOrderMail } = require('./mail')

let queueTableReady = false

async function executeWith(optionalConnection, sql, params = {}) {
  if (optionalConnection) {
    const [rows] = await optionalConnection.execute(sql, params)
    return rows
  }
  return query(sql, params)
}

async function ensureSalesNotificationQueueTable(connection = null) {
  if (!connection && queueTableReady) return
  await executeWith(
    connection,
    `CREATE TABLE IF NOT EXISTS service_order_sales_notifications (
      service_order_id BIGINT UNSIGNED NOT NULL,
      due_at DATETIME NOT NULL,
      status ENUM('pending', 'sending', 'sent', 'skipped', 'failed') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      last_error VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (service_order_id),
      KEY idx_sales_notifications_due (status, due_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  if (!connection) queueTableReady = true
}

function normalizeDelayMinutes(value) {
  return Math.max(5, Math.min(1440, Number(value || 60)))
}

function isSalesNotifiableOrderStatus(status) {
  return ['submitted', 'approved', 'archived'].includes(String(status || ''))
}

async function currentNotificationStatus(serviceOrderId, connection = null) {
  const rows = await executeWith(
    connection,
    `SELECT status
     FROM service_order_sales_notifications
     WHERE service_order_id = :serviceOrderId
     LIMIT 1`,
    { serviceOrderId },
  )
  return rows[0]?.status || null
}

async function orderHasSalesperson(serviceOrderId, connection = null) {
  const rows = await executeWith(
    connection,
    `SELECT so.id
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     WHERE so.id = :serviceOrderId
       AND COALESCE(NULLIF(c.salesperson, ''), NULLIF(so.timesheet_salesperson, '')) IS NOT NULL
     LIMIT 1`,
    { serviceOrderId },
  )
  return Boolean(rows[0])
}

async function queueSalesServiceOrderNotification(serviceOrderId, connection = null) {
  const id = Number(serviceOrderId || 0)
  if (!id) return { skipped: true, reason: 'missing_order_id' }

  const settings = await effectiveSettings()
  const notification = settings.notification || {}
  if (notification.serviceOrderSalesNotifyEnabled !== 'true') {
    return { skipped: true, reason: 'sales_service_order_notify_disabled' }
  }

  await ensureSalesNotificationQueueTable(connection)
  const existingStatus = await currentNotificationStatus(id, connection)
  if (existingStatus === 'sent') {
    return { skipped: true, reason: 'already_notified', serviceOrderId: id }
  }
  if (!(await orderHasSalesperson(id, connection))) {
    return { skipped: true, reason: 'no_customer_salesperson' }
  }

  const delayMinutes = normalizeDelayMinutes(notification.serviceOrderSalesDelayMinutes)
  await executeWith(
    connection,
    `INSERT INTO service_order_sales_notifications (
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

async function loadSalesNotificationContext(serviceOrderId) {
  const salespersonExpr = "COALESCE(NULLIF(c.salesperson, ''), NULLIF(so.timesheet_salesperson, ''))"
  const rows = await query(
    `SELECT
       so.id, so.order_no, so.status, so.service_mode, so.service_type, so.timesheet_category,
       so.issue_description, so.internal_note, so.submitted_at, so.updated_at,
       c.name AS customer_name, ${salespersonExpr} AS salesperson,
       so.contact_name, so.contact_phone,
       sr.actual_start_at, sr.actual_end_at, sr.work_content, sr.result_description,
       engineer.real_name AS engineer_name,
       sales.id AS sales_id, sales.real_name AS sales_name, sales.email AS sales_email
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     LEFT JOIN users engineer ON engineer.id = so.assigned_engineer_id
     LEFT JOIN users sales ON sales.id = (
       SELECT u.id
       FROM users u
       WHERE u.status = 'active'
         AND u.role IN ('sales', 'sales_supervisor')
         AND (
           u.real_name = ${salespersonExpr}
           OR u.username = ${salespersonExpr}
           OR u.email = ${salespersonExpr}
           OR u.login_alias = ${salespersonExpr}
         )
       ORDER BY CASE u.role WHEN 'sales' THEN 0 ELSE 1 END, u.id ASC
       LIMIT 1
     )
     WHERE so.id = :serviceOrderId
     LIMIT 1`,
    { serviceOrderId },
  )
  const row = rows[0]
  if (!row) return null
  return {
    order: {
      ...row,
      work_content: compactText(row.work_content || row.result_description || row.internal_note),
      issue_description: compactText(row.issue_description),
    },
    salesperson: {
      id: row.sales_id,
      realName: row.sales_name,
      email: row.sales_email,
    },
    salespersonName: row.salesperson,
  }
}

async function markNotification(serviceOrderId, status, detail = {}) {
  await query(
    `UPDATE service_order_sales_notifications
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

async function processDueSalesServiceOrderNotifications(limit = 20) {
  const settings = await effectiveSettings()
  const notification = settings.notification || {}
  if (notification.serviceOrderSalesNotifyEnabled !== 'true') {
    return { skipped: true, reason: 'sales_service_order_notify_disabled' }
  }

  await ensureSalesNotificationQueueTable()
  const batchLimit = Math.max(1, Math.min(100, Number(limit || 20)))
  const rows = await query(
    `SELECT service_order_id
     FROM service_order_sales_notifications
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
      `UPDATE service_order_sales_notifications
       SET status = 'sending'
       WHERE service_order_id = :orderId
         AND status = 'pending'`,
      { orderId },
    )
    if (!claimed.affectedRows) continue

    try {
      const context = await loadSalesNotificationContext(orderId)
      if (!context) {
        await markNotification(orderId, 'skipped', { lastError: 'service_order_not_found' })
        skipped += 1
        continue
      }
      if (!isSalesNotifiableOrderStatus(context.order.status)) {
        await markNotification(orderId, 'skipped', { lastError: `order_status_not_notifiable:${context.order.status || ''}` })
        skipped += 1
        continue
      }
      if (!context.salesperson.email) {
        await markNotification(orderId, 'skipped', { lastError: `no_sales_email:${context.salespersonName || ''}` })
        skipped += 1
        continue
      }

      const result = await sendSalesServiceOrderMail(
        context.order,
        [context.salesperson],
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
  ensureSalesNotificationQueueTable,
  queueSalesServiceOrderNotification,
  processDueSalesServiceOrderNotifications,
}
