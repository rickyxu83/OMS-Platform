const assert = require('node:assert/strict')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'

const backendRoot = `${process.cwd()}/src/`
for (const id of Object.keys(require.cache)) {
  if (id.startsWith(backendRoot)) delete require.cache[id]
}

const queue = []
const sent = []
const eventKeys = new Set()
let mailBehavior = 'sent'
let attendanceEnabled = 'true'

const dbPath = require.resolve('../src/config/db')
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params = {}) => {
      if (/CREATE TABLE IF NOT EXISTS attendance_email_notifications/.test(sql)) return []
      if (/INSERT IGNORE INTO attendance_email_notifications/.test(sql)) {
        if (eventKeys.has(params.eventKey)) return { affectedRows: 0 }
        eventKeys.add(params.eventKey)
        queue.push({
          id: queue.length + 1,
          request_id: params.requestId,
          event_key: params.eventKey,
          event_type: params.eventType,
          recipient_emails: params.recipientEmails,
          payload: params.payload,
          attempts: 0,
          status: params.status,
          last_error: params.lastError,
        })
        return { affectedRows: 1 }
      }
      if (/SET status = 'pending'/.test(sql) && /reclaimed_stale_sending/.test(sql)) return { affectedRows: 0 }
      if (/SELECT id, request_id, event_key/.test(sql)) {
        return queue.filter((item) => ['pending', 'failed'].includes(item.status) && item.attempts < 5)
      }
      if (/SET status = 'sending', attempts = attempts \+ 1/.test(sql)) {
        const item = queue.find((entry) => entry.id === params.id)
        if (!item || !['pending', 'failed'].includes(item.status)) return { affectedRows: 0 }
        item.status = 'sending'
        item.attempts += 1
        return { affectedRows: 1 }
      }
      if (/UPDATE attendance_email_notifications/.test(sql) && /SET status = :status/.test(sql)) {
        const item = queue.find((entry) => entry.id === params.id)
        item.status = params.status
        item.last_error = params.lastError
        return { affectedRows: 1 }
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
      mail: { enabled: 'true', attendanceNotifyEnabled: attendanceEnabled },
    }),
  },
}

const mailPath = require.resolve('../src/services/mail')
require.cache[mailPath] = {
  id: mailPath,
  filename: mailPath,
  loaded: true,
  exports: {
    sendAttendanceNotificationMail: async (payload, recipients) => {
      if (mailBehavior === 'failed') throw new Error('smtp unavailable')
      if (mailBehavior === 'skipped') return { skipped: true, reason: 'attendance_notify_disabled' }
      sent.push({ payload, recipients })
      return { sent: true, to: recipients }
    },
  },
}

const {
  enqueueAttendanceEmailNotification,
  processDueAttendanceEmailNotifications,
} = require('../src/services/attendance-notifications')

;(async () => {
  const first = await enqueueAttendanceEmailNotification(null, {
    requestId: 10,
    eventKey: 'request:10:approval:1',
    eventType: 'approval_pending',
    recipients: ['approver@example.test', 'APPROVER@example.test', ''],
    payload: { applicantName: '申请人' },
  })
  assert.equal(first.queued, true)
  assert.deepEqual(first.recipients, ['approver@example.test'])

  const duplicate = await enqueueAttendanceEmailNotification(null, {
    requestId: 10,
    eventKey: 'request:10:approval:1',
    eventType: 'approval_pending',
    recipients: ['approver@example.test'],
    payload: {},
  })
  assert.equal(duplicate.duplicate, true)

  const noRecipient = await enqueueAttendanceEmailNotification(null, {
    requestId: 10,
    eventKey: 'request:10:delegate',
    eventType: 'delegate_info',
    recipients: [],
    payload: {},
  })
  assert.equal(noRecipient.skipped, true)
  assert.equal(queue.find((item) => item.event_key === 'request:10:delegate').status, 'skipped')

  const processed = await processDueAttendanceEmailNotifications(10)
  assert.deepEqual(processed, { processed: 1, sent: 1, skipped: 0, failed: 0 })
  assert.equal(queue.find((item) => item.event_key === 'request:10:approval:1').status, 'sent')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].payload.eventType, 'approval_pending')
  assert.deepEqual(sent[0].recipients, ['approver@example.test'])

  await enqueueAttendanceEmailNotification(null, {
    requestId: 11,
    eventKey: 'request:11:completed',
    eventType: 'completed',
    recipients: ['applicant@example.test'],
    payload: { applicantName: '申请人' },
  })
  mailBehavior = 'failed'
  const failed = await processDueAttendanceEmailNotifications(10)
  assert.deepEqual(failed, { processed: 1, sent: 0, skipped: 0, failed: 1 })
  assert.equal(queue.find((item) => item.event_key === 'request:11:completed').status, 'failed')

  mailBehavior = 'sent'
  const retried = await processDueAttendanceEmailNotifications(10)
  assert.deepEqual(retried, { processed: 1, sent: 1, skipped: 0, failed: 0 })
  assert.equal(queue.find((item) => item.event_key === 'request:11:completed').status, 'sent')

  await enqueueAttendanceEmailNotification(null, {
    requestId: 12,
    eventKey: 'request:12:delegate',
    eventType: 'delegate_info',
    recipients: ['delegate@example.test'],
    payload: { applicantName: '申请人' },
  })
  mailBehavior = 'skipped'
  const skipped = await processDueAttendanceEmailNotifications(10)
  assert.deepEqual(skipped, { processed: 1, sent: 0, skipped: 1, failed: 0 })
  assert.equal(queue.find((item) => item.event_key === 'request:12:delegate').status, 'skipped')

  attendanceEnabled = 'false'
  const disabledAtCreation = await enqueueAttendanceEmailNotification(null, {
    requestId: 13,
    eventKey: 'request:13:approval:1',
    eventType: 'approval_pending',
    recipients: ['approver@example.test'],
    payload: { applicantName: '申请人' },
  })
  assert.equal(disabledAtCreation.skipped, true)
  assert.equal(queue.find((item) => item.event_key === 'request:13:approval:1').last_error, 'attendance_notify_disabled')
  attendanceEnabled = 'true'
  mailBehavior = 'sent'
  const noBackfill = await processDueAttendanceEmailNotifications(10)
  assert.deepEqual(noBackfill, { processed: 0, sent: 0, skipped: 0, failed: 0 })

  await enqueueAttendanceEmailNotification(null, {
    requestId: 14,
    eventKey: 'request:14:completed',
    eventType: 'completed',
    recipients: ['applicant@example.test'],
    payload: { applicantName: '申请人' },
  })
  mailBehavior = 'failed'
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await processDueAttendanceEmailNotifications(10)
    assert.equal(result.failed, 1)
  }
  const exhausted = queue.find((item) => item.event_key === 'request:14:completed')
  assert.equal(exhausted.status, 'failed')
  assert.equal(exhausted.attempts, 5)
  const afterLimit = await processDueAttendanceEmailNotifications(10)
  assert.deepEqual(afterLimit, { processed: 0, sent: 0, skipped: 0, failed: 0 })

  console.log('attendance notification tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
