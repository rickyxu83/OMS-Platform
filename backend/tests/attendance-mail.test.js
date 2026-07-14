const assert = require('node:assert/strict')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'

const backendRoot = `${process.cwd()}/src/`
for (const id of Object.keys(require.cache)) {
  if (id.startsWith(backendRoot)) delete require.cache[id]
}

let attendanceNotifyEnabled = 'true'
const sent = []

const settingsPath = require.resolve('../src/modules/settings/controller')
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: {
    effectiveSettings: async () => ({
      mail: {
        enabled: 'true',
        attendanceNotifyEnabled,
        host: 'smtp.example.test',
        port: '465',
        secure: 'true',
        from: 'OMS <oms@example.test>',
        user: 'oms@example.test',
        password: 'secret',
      },
      notification: { serviceOrderAdminBaseUrl: 'https://oms.example.test' },
    }),
  },
}

const nodemailerPath = require.resolve('nodemailer')
require.cache[nodemailerPath] = {
  id: nodemailerPath,
  filename: nodemailerPath,
  loaded: true,
  exports: {
    createTransport: () => ({
      sendMail: async (message) => {
        sent.push(message)
        return { accepted: message.to }
      },
    }),
  },
}

const { sendAttendanceNotificationMail } = require('../src/services/mail')

const basePayload = {
  applicantName: '张三',
  leaveType: 'annual',
  startAt: '2026-07-20 09:00:00',
  endAt: '2026-07-22 18:00:00',
  workingDays: 3,
  reason: '家庭安排',
}

;(async () => {
  const approval = await sendAttendanceNotificationMail(
    { ...basePayload, eventType: 'approval_pending', stepOrder: 1, stepCount: 2 },
    ['approver@example.test'],
  )
  assert.equal(approval.sent, true)
  assert.match(sent[0].subject, /请假待审批/)
  assert.match(sent[0].html, /第 1 \/ 2 级/)
  assert.match(sent[0].html, /https:\/\/oms\.example\.test\/attendance/)

  await sendAttendanceNotificationMail(
    {
      ...basePayload,
      eventType: 'completed',
      annualLeaveUsedDays: 3,
      annualLeaveBalanceDays: 7.5,
    },
    ['applicant@example.test'],
  )
  assert.match(sent[1].html, /本次扣减/)
  assert.match(sent[1].html, /3 天/)
  assert.match(sent[1].html, /剩余年假/)
  assert.match(sent[1].html, /7\.5 天/)

  await sendAttendanceNotificationMail(
    { ...basePayload, eventType: 'completed', leaveType: 'sick' },
    ['applicant@example.test'],
  )
  assert.match(sent[2].html, /该假别不计系统余额/)
  assert.doesNotMatch(sent[2].html, /调休/)

  attendanceNotifyEnabled = 'false'
  const disabled = await sendAttendanceNotificationMail(
    { ...basePayload, eventType: 'delegate_info' },
    ['delegate@example.test'],
  )
  assert.deepEqual(disabled, { skipped: true, reason: 'attendance_notify_disabled' })
  assert.equal(sent.length, 3)

  console.log('attendance mail tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
