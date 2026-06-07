const nodemailer = require('nodemailer')
const { effectiveSettings } = require('../modules/settings/controller')

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16) || '-'
}

function recipientEmails(engineers = []) {
  const seen = new Set()
  return engineers
    .map((engineer) => String(engineer.email || '').trim())
    .filter((email) => {
      const key = email.toLowerCase()
      if (!email || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function missingMailFields(mail) {
  return ['host', 'port', 'from', 'user', 'password'].filter((key) => !mail[key])
}

async function sendAssignmentMail(order, engineers = []) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }
  if (mail.assignNotifyEnabled !== 'true') return { skipped: true, reason: 'assign_notify_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(engineers)
  if (!to.length) {
    return {
      skipped: true,
      reason: 'no_recipient_email',
      engineerIds: engineers.map((engineer) => engineer.id).filter(Boolean),
    }
  }

  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: Number(mail.port || 465),
    secure: mail.secure === 'true',
    auth: {
      user: mail.user,
      pass: mail.password,
    },
  })

  const subject = `派单通知：${order.order_no || order.orderNo || order.id} / ${order.customer_name || order.customerName || ''}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">新工单派发</h2>
      <p>你有一张新的服务工单，请登录工程师端查看并处理。</p>
      <table style="border-collapse:collapse;width:100%;max-width:680px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">Case ID</td><td>${htmlEscape(order.order_no || order.orderNo || order.id)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">客户</td><td>${htmlEscape(order.customer_name || order.customerName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务时间</td><td>${htmlEscape(formatTime(order.planned_start_at || order.plannedStartAt))} 至 ${htmlEscape(formatTime(order.planned_end_at || order.plannedEndAt))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务需求</td><td>${htmlEscape(order.issue_description || order.issueDescription || '-')}</td></tr>
      </table>
      <p style="color:#64748b">如工单附带装机清单、报错截图或客户资料，可在工单详情页下载查看。</p>
    </div>
  `

  await transporter.sendMail({
    from: mail.from,
    to,
    subject,
    html,
  })
  return { sent: true, to }
}

module.exports = {
  sendAssignmentMail,
}
