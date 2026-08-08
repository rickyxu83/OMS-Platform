const { query } = require('../config/db')
const { ensureWorkflowTables, reconcilePendingMrAssignments } = require('../modules/mr/lib/workflow')
const { sendMrApprovalMail } = require('./mail')

async function notificationContext(mrId, recipientUserId) {
  const [orders, items, recipients, files] = await Promise.all([
    query(
      `SELECT o.*, sales.real_name AS sales_owner_name,
              pending.step_label AS current_step_label
       FROM mr_orders o
       LEFT JOIN users sales ON sales.id = o.sales_owner_id
       LEFT JOIN mr_approvals pending ON pending.id = (
         SELECT id FROM mr_approvals
         WHERE mr_id = o.id AND action IS NULL ORDER BY cycle DESC, seq LIMIT 1
       )
       WHERE o.id = :mrId LIMIT 1`,
      { mrId },
    ),
    query('SELECT * FROM mr_items WHERE mr_id = :mrId ORDER BY row_no, id', { mrId }),
    query(
      "SELECT id, username, real_name, email FROM users WHERE id = :userId AND status = 'active' LIMIT 1",
      { userId: recipientUserId },
    ),
    query(
      `SELECT original_name AS name, size FROM files
       WHERE owner_type = 'mr_order' AND owner_id = :mrId ORDER BY id`,
      { mrId },
    ),
  ])
  if (!orders[0]) throw new Error('MR 不存在')
  if (!recipients[0]?.email) throw new Error('收件人没有有效邮箱')
  return { order: { ...orders[0], items, quotationFiles: files }, recipient: recipients[0] }
}

async function processMrNotifications(limit = 20) {
  await require('../modules/mr/lib/controller').ensureTables()
  await ensureWorkflowTables()
  await reconcilePendingMrAssignments()
  await query(
    `UPDATE mr_notification_outbox
     SET status = 'failed', last_error = '发送任务超时，自动重试'
     WHERE status = 'sending' AND next_attempt_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
  )
  const batchLimit = Math.max(1, Math.min(100, Number(limit) || 20))
  const rows = await query(
    `SELECT id, mr_id, recipient_user_id, event, attempts
     FROM mr_notification_outbox
     WHERE status IN ('pending', 'failed') AND next_attempt_at <= NOW()
     ORDER BY id LIMIT ${batchLimit}`,
  )
  let sent = 0
  let failed = 0
  for (const row of rows) {
    const claimed = await query(
      `UPDATE mr_notification_outbox SET status = 'sending', attempts = attempts + 1, next_attempt_at = NOW()
       WHERE id = :id AND status IN ('pending', 'failed')`,
      { id: row.id },
    )
    if (!claimed.affectedRows) continue
    try {
      const context = await notificationContext(row.mr_id, row.recipient_user_id)
      const result = await sendMrApprovalMail(context.order, context.recipient, row.event)
      if (!result?.sent) throw new Error(result?.reason || '邮件发送已跳过')
      await query(
        `UPDATE mr_notification_outbox
         SET status = 'sent', sent_at = NOW(), last_error = NULL WHERE id = :id`,
        { id: row.id },
      )
      sent += 1
    } catch (error) {
      const minutes = Math.min(360, 2 ** Math.min(Number(row.attempts || 0) + 1, 8))
      await query(
        `UPDATE mr_notification_outbox
         SET status = 'failed', last_error = :message,
             next_attempt_at = DATE_ADD(NOW(), INTERVAL ${minutes} MINUTE)
         WHERE id = :id`,
        { id: row.id, message: String(error.message || '邮件发送失败').slice(0, 500) },
      )
      failed += 1
    }
  }
  return { processed: rows.length, sent, failed }
}

module.exports = { processMrNotifications }
