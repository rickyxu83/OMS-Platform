const { query } = require('../config/db')
const { effectiveSettings } = require('../modules/settings/controller')
const { WORK_HOURS_PER_DAY } = require('../modules/attendance/workflow')
const { leaveTypeMap, leaveQuotaUsageYtd } = require('../modules/attendance/leave-types')
const { sendAttendanceNotificationMail } = require('./mail')

const MAX_ATTEMPTS = 5
const STALE_SENDING_MINUTES = 10
let tableReady = false

async function executeWith(connection, sql, params = {}) {
  if (connection) {
    const [rows] = await connection.execute(sql, params)
    return rows
  }
  return query(sql, params)
}

async function ensureAttendanceEmailNotificationsTable(connection = null) {
  if (tableReady) return
  await executeWith(
    connection,
    `CREATE TABLE IF NOT EXISTS attendance_email_notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      request_id BIGINT UNSIGNED NOT NULL,
      event_key VARCHAR(160) NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      recipient_emails JSON NOT NULL,
      payload JSON NOT NULL,
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      last_error VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_attendance_email_event (event_key),
      KEY idx_attendance_email_due (status, available_at),
      KEY idx_attendance_email_request (request_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  tableReady = true
}

function recipientEmails(recipients = []) {
  const seen = new Set()
  return recipients
    .map((recipient) => String(recipient?.email || recipient || '').trim())
    .filter((email) => {
      const key = email.toLowerCase()
      if (!email || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function userDisplayName(user) {
  return String(user?.real_name || user?.realName || user?.username || `用户 #${user?.id || ''}`).trim()
}

function requestPayload(request, extra = {}) {
  return {
    requestId: Number(request.id),
    applicantName: request.employee_name || '',
    leaveType: request.leave_type || '',
    // 假别快照（spec 004）：邮件 label/政策文案以提交时快照为准
    leaveTypeLabel: request.leave_type_label || '',
    leaveReferenceDays: request.leave_reference_days || '',
    leavePolicyNote: request.leave_policy_note || '',
    startAt: request.start_at,
    endAt: request.end_at,
    workingDays: request.working_days === null || request.working_days === undefined
      ? null
      : Number(request.working_days),
    hours: Number(request.hours || 0),
    reason: request.reason || '',
    ...extra,
  }
}

async function employeeContact(connection, employeeId) {
  if (!Number(employeeId)) return null
  const [rows] = await connection.execute(
    `SELECT p.id, p.employee_name, u.id AS user_id, u.email
     FROM attendance_employee_profiles p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = :employeeId
     LIMIT 1`,
    { employeeId: Number(employeeId) },
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.user_id,
    employeeId: row.id,
    name: row.employee_name || '',
    email: row.email || '',
  }
}

async function roleRecipients(connection, role, submittedBy) {
  if (!role) return []
  const [rows] = await connection.execute(
    `SELECT id, COALESCE(NULLIF(real_name, ''), username) AS name, email
     FROM users
     WHERE status = 'active'
       AND role = :role
       AND id <> :submittedBy
     ORDER BY id ASC`,
    { role, submittedBy: Number(submittedBy || 0) },
  )
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ id: row.id, name: row.name || '', email: row.email || '' }))
}

function approvalStep(step) {
  return {
    stepType: step?.stepType || step?.step_type || '',
    stepOrder: Number(step?.stepOrder ?? step?.step_order ?? 0),
    assigneeEmployeeId: step?.assigneeEmployeeId ?? step?.assignee_employee_id ?? null,
    assigneeRole: step?.assigneeRole || step?.assignee_role || null,
  }
}

async function approvalStepCount(connection, requestId) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS step_count
     FROM attendance_request_approvals
     WHERE request_id = :requestId`,
    { requestId },
  )
  return Number(rows[0]?.step_count || 0)
}

async function runSafely(input, work) {
  try {
    return await work()
  } catch (error) {
    console.error('[attendance-mail] notification queue failed', {
      requestId: input.requestId,
      eventKey: input.eventKey,
      eventType: input.eventType,
      message: error?.message,
    })
    return { queued: false, error: error?.message || 'queue_failed' }
  }
}

async function employeeContactSafely(connection, employeeId, requestId, eventType) {
  const result = await runSafely(
    { requestId, eventType, eventKey: `request:${requestId}:${eventType}:recipient` },
    () => employeeContact(connection, employeeId),
  )
  return result?.error ? null : result
}

// 年度带薪假别额度提示（spec 004，当前为病假）：读取的是已提交口径（不含当前在途事务），邮件仅作提示
async function leaveQuotaExtra(request) {
  if (request.request_type !== 'leave' || !request.leave_type) return {}
  try {
    const map = await leaveTypeMap()
    const type = map.get(request.leave_type)
    if (!type || type.paid_quota_days === null || type.paid_quota_days === undefined) return {}
    const year = new Date(request.start_at).getFullYear()
    const usage = await leaveQuotaUsageYtd([request.employee_id], year, map)
    const quota = usage.get(`${request.employee_id}:${request.leave_type}`)
    if (!quota) return {}
    const thisDays = Math.round((Number(request.hours || 0) / 8) * 100) / 100
    const exceedDays = Math.max(0, Math.round((quota.usedDays + thisDays - quota.quotaDays) * 100) / 100)
    return {
      quotaDays: quota.quotaDays,
      quotaUsedDays: quota.usedDays,
      quotaExceedDays: exceedDays,
      quotaDeductionPercent: quota.deductionPercent,
    }
  } catch {
    return {}
  }
}

async function queueApprovalNotification(connection, request, step, stepCount, delegate = null) {
  if (request.request_type !== 'leave') return
  const normalized = approvalStep(step)
  const eventKey = `request:${request.id}:approval:${normalized.stepOrder}`
  await runSafely(
    { requestId: request.id, eventKey, eventType: 'approval_pending' },
    async () => {
      const totalSteps = Number(stepCount || 0) || await approvalStepCount(connection, request.id)
      let recipients = []
      if (normalized.assigneeRole) {
        recipients = await roleRecipients(connection, normalized.assigneeRole, request.submitted_by)
      } else if (normalized.assigneeEmployeeId) {
        const contact = await employeeContact(connection, normalized.assigneeEmployeeId)
        if (contact) recipients = [contact]
      } else if (normalized.stepType === 'supervisor' && request.supervisor_employee_id) {
        const contact = await employeeContact(connection, request.supervisor_employee_id)
        if (contact) recipients = [contact]
      }
      return enqueueAttendanceEmailNotification(connection, {
        requestId: request.id,
        eventKey,
        eventType: 'approval_pending',
        recipients,
        payload: requestPayload(request, {
          delegateName: delegate?.name || '',
          stepOrder: normalized.stepOrder,
          stepCount: totalSteps,
          approverRole: normalized.assigneeRole || '',
          missingRecipientNames: recipients.filter((recipient) => !recipient.email).map((recipient) => recipient.name),
          ...(await leaveQuotaExtra(request)),
        }),
      })
    },
  )
}

async function queueDelegateNotification(connection, request, delegate) {
  if (request.request_type !== 'leave' || !delegate) return
  const eventKey = `request:${request.id}:delegate`
  await runSafely(
    { requestId: request.id, eventKey, eventType: 'delegate_info' },
    () => enqueueAttendanceEmailNotification(connection, {
      requestId: request.id,
      eventKey,
      eventType: 'delegate_info',
      recipients: [delegate],
      payload: requestPayload(request, { delegateName: delegate.name || '' }),
    }),
  )
}

async function queueSubmittedLeaveNotifications(connection, request, steps) {
  if (request.request_type !== 'leave') return
  const delegate = await employeeContactSafely(
    connection,
    request.delegate_employee_id,
    request.id,
    'delegate_info',
  )
  await queueApprovalNotification(connection, request, { ...steps[0], stepOrder: 1 }, steps.length, delegate)
  await queueDelegateNotification(connection, request, delegate)
}

async function queueNextApprovalNotification(connection, request, step) {
  if (request.request_type !== 'leave') return
  const delegate = await employeeContactSafely(
    connection,
    request.delegate_employee_id,
    request.id,
    'approval_pending',
  )
  await queueApprovalNotification(connection, request, step, null, delegate)
}

// 催办提醒（spec 007）：手动/自动共用本函数，收件人 = 当前待审环节审批人。
// 不限假别（请假/调休/加班均可催），eventKey 带时间戳保证每次催办都能入队（表对 event_key 唯一约束）。
async function queueReminderNotification(connection, request, step, { kind = 'manual', waitingHours = 0 } = {}) {
  const normalized = approvalStep(step)
  const eventKey = `request:${request.id}:reminder:${normalized.stepOrder}:${kind}:${Date.now()}`
  await runSafely(
    { requestId: request.id, eventKey, eventType: 'reminder' },
    async () => {
      let recipients = []
      if (normalized.assigneeRole) {
        recipients = await roleRecipients(connection, normalized.assigneeRole, request.submitted_by)
      } else if (normalized.assigneeEmployeeId) {
        const contact = await employeeContact(connection, normalized.assigneeEmployeeId)
        if (contact) recipients = [contact]
      } else if (normalized.stepType === 'supervisor' && request.supervisor_employee_id) {
        const contact = await employeeContact(connection, request.supervisor_employee_id)
        if (contact) recipients = [contact]
      }
      const totalSteps = await approvalStepCount(connection, request.id)
      return enqueueAttendanceEmailNotification(connection, {
        requestId: request.id,
        eventKey,
        eventType: 'reminder',
        recipients,
        payload: requestPayload(request, {
          requestTypeLabel: { leave: '请假', comp_time: '调休', overtime: '加班' }[request.request_type] || '申请',
          stepOrder: normalized.stepOrder,
          stepCount: totalSteps,
          reminderKind: kind,
          waitingHours: Math.max(0, Math.round(waitingHours)),
          missingRecipientNames: recipients.filter((recipient) => !recipient.email).map((recipient) => recipient.name),
        }),
      })
    },
  )
}

async function queueRejectedLeaveNotification(connection, request, user, reason) {
  if (request.request_type !== 'leave') return
  const eventKey = `request:${request.id}:rejected`
  await runSafely(
    { requestId: request.id, eventKey, eventType: 'rejected' },
    () => enqueueAttendanceEmailNotification(connection, {
      requestId: request.id,
      eventKey,
      eventType: 'rejected',
      recipients: [request.applicant_email || ''],
      payload: requestPayload(request, {
        rejectedByName: userDisplayName(user),
        rejectedReason: reason || '',
      }),
    }),
  )
}

async function annualLeaveBalanceDays(connection, employeeId) {
  const [rows] = await connection.execute(
    `SELECT COALESCE(SUM(delta_hours), 0) AS balance_days
     FROM attendance_balance_ledger
     WHERE employee_id = :employeeId
       AND balance_type = 'annual_leave'`,
    { employeeId },
  )
  return Number(rows[0]?.balance_days || 0)
}

async function queueCompletedLeaveNotification(connection, request) {
  if (request.request_type !== 'leave') return
  const eventKey = `request:${request.id}:completed`
  await runSafely(
    { requestId: request.id, eventKey, eventType: 'completed' },
    async () => {
      const isAnnualLeave = request.leave_type === 'annual'
      const usedDays = isAnnualLeave
        ? Math.round((Number(request.hours || 0) / WORK_HOURS_PER_DAY) * 100) / 100
        : null
      const balanceDays = isAnnualLeave ? await annualLeaveBalanceDays(connection, request.employee_id) : null
      return enqueueAttendanceEmailNotification(connection, {
        requestId: request.id,
        eventKey,
        eventType: 'completed',
        recipients: [request.applicant_email || ''],
        payload: requestPayload(request, {
          annualLeaveUsedDays: usedDays,
          annualLeaveBalanceDays: balanceDays,
          ...(await leaveQuotaExtra(request)),
        }),
      })
    },
  )
}

async function enqueueAttendanceEmailNotification(connection, {
  requestId,
  eventKey,
  eventType,
  recipients = [],
  payload = {},
}) {
  await ensureAttendanceEmailNotificationsTable()
  const emails = recipientEmails(recipients)
  const settings = await effectiveSettings()
  const mail = settings.mail || {}
  const skipReason = mail.attendanceNotifyEnabled !== 'true'
    ? 'attendance_notify_disabled'
    : mail.enabled !== 'true'
      ? 'mail_disabled'
      : !emails.length
        ? 'no_recipient_email'
        : null
  const status = skipReason ? 'skipped' : 'pending'
  const lastError = skipReason
  const result = await executeWith(
    connection,
    `INSERT IGNORE INTO attendance_email_notifications (
       request_id, event_key, event_type, status, recipient_emails, payload, last_error
     ) VALUES (
       :requestId, :eventKey, :eventType, :status, :recipientEmails, :payload, :lastError
     )`,
    {
      requestId: Number(requestId),
      eventKey: String(eventKey || '').slice(0, 160),
      eventType: String(eventType || '').slice(0, 40),
      status,
      recipientEmails: JSON.stringify(emails),
      payload: JSON.stringify({ ...payload, eventType }),
      lastError,
    },
  )
  return {
    queued: Boolean(result.affectedRows),
    duplicate: !result.affectedRows,
    skipped: status === 'skipped',
    recipients: emails,
  }
}

function jsonValue(value, fallback) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return value
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

async function markNotification(id, status, { lastError = null, retryMinutes = 0 } = {}) {
  const retryClause = retryMinutes > 0
    ? `, available_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${Math.max(1, Math.round(retryMinutes))} MINUTE)`
    : ''
  await query(
    `UPDATE attendance_email_notifications
     SET status = :status,
         sent_at = CASE WHEN :status = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
         last_error = :lastError
         ${retryClause}
     WHERE id = :id`,
    { id, status, lastError: lastError ? String(lastError).slice(0, 255) : null },
  )
}

async function processDueAttendanceEmailNotifications(limit = 30) {
  await ensureAttendanceEmailNotificationsTable()
  await query(
    `UPDATE attendance_email_notifications
     SET status = 'pending',
         last_error = COALESCE(last_error, 'reclaimed_stale_sending')
     WHERE status = 'sending'
       AND updated_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${STALE_SENDING_MINUTES} MINUTE)`,
  )

  const requestedLimit = Number(limit || 30)
  const safeLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
    : 30
  const rows = await query(
    `SELECT id, request_id, event_key, event_type, recipient_emails, payload, attempts
     FROM attendance_email_notifications
     WHERE status IN ('pending', 'failed')
       AND attempts < :maxAttempts
       AND available_at <= CURRENT_TIMESTAMP
     ORDER BY available_at ASC, id ASC
     LIMIT ${safeLimit}`,
    { maxAttempts: MAX_ATTEMPTS },
  )

  let sent = 0
  let skipped = 0
  let failed = 0
  for (const row of rows) {
    const claimed = await query(
      `UPDATE attendance_email_notifications
       SET status = 'sending', attempts = attempts + 1, last_error = NULL
       WHERE id = :id
         AND status IN ('pending', 'failed')`,
      { id: row.id },
    )
    if (!claimed.affectedRows) continue

    const attempt = Number(row.attempts || 0) + 1
    try {
      const recipients = jsonValue(row.recipient_emails, [])
      const payload = jsonValue(row.payload, {})
      const result = await sendAttendanceNotificationMail(payload, recipients)
      if (result?.skipped) {
        await markNotification(row.id, 'skipped', { lastError: result.reason || 'mail_skipped' })
        skipped += 1
        continue
      }
      await markNotification(row.id, 'sent')
      sent += 1
    } catch (error) {
      const retryMinutes = Math.min(60, 2 ** Math.max(0, attempt - 1))
      await markNotification(row.id, 'failed', {
        lastError: error?.message || 'send_failed',
        retryMinutes: attempt < MAX_ATTEMPTS ? retryMinutes : 0,
      })
      failed += 1
    }
  }

  return { processed: rows.length, sent, skipped, failed }
}

module.exports = {
  ensureAttendanceEmailNotificationsTable,
  enqueueAttendanceEmailNotification,
  processDueAttendanceEmailNotifications,
  queueSubmittedLeaveNotifications,
  queueNextApprovalNotification,
  queueRejectedLeaveNotification,
  queueCompletedLeaveNotification,
  queueReminderNotification,
}
