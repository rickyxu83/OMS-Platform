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

function mailTransporter(mail) {
  return nodemailer.createTransport({
    host: mail.host,
    port: Number(mail.port || 465),
    secure: mail.secure === 'true',
    auth: {
      user: mail.user,
      pass: mail.password,
    },
  })
}

function serviceModeLabel(mode) {
  if (mode === 'office') return '内勤'
  if (mode === 'remote') return '远程'
  return '现场'
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

  const transporter = mailTransporter(mail)

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

async function sendInspectionConfirmationMail(order, recipients = []) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }
  if (mail.assignNotifyEnabled !== 'true') return { skipped: true, reason: 'assign_notify_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients)
  if (!to.length) {
    return {
      skipped: true,
      reason: 'no_recipient_email',
      recipientIds: recipients.map((recipient) => recipient.id).filter(Boolean),
    }
  }

  const transporter = mailTransporter(mail)

  const subject = `巡检待确认：${order.order_no || order.orderNo || order.id} / ${order.customer_name || order.customerName || ''}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">巡检工单待确认</h2>
      <p>系统已根据巡检计划生成待确认工单，请登录管理端确认并派发。</p>
      <table style="border-collapse:collapse;width:100%;max-width:680px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">Case ID</td><td>${htmlEscape(order.order_no || order.orderNo || order.id)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">客户</td><td>${htmlEscape(order.customer_name || order.customerName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">设备</td><td>${htmlEscape(order.device_name || order.deviceName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">计划时间</td><td>${htmlEscape(formatTime(order.planned_start_at || order.plannedStartAt))} 至 ${htmlEscape(formatTime(order.planned_end_at || order.plannedEndAt))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">巡检说明</td><td>${htmlEscape(order.issue_description || order.issueDescription || '-')}</td></tr>
      </table>
      <p style="color:#64748b">确认后，该巡检工单会派发到工程师端。</p>
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

async function sendMaintenanceExpiryMail(devices = [], recipients = []) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)

  const subject = `维保到期提醒：${devices.length} 台设备即将过保`
  const rows = devices
    .map(
      (d) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.customer_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.model || d.name || d.serial_no || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.model || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.serial_no || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(d.maintenance_end || '').slice(0, 10))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.maintenance_type === 'original_manufacturer' ? '原厂维保' : d.maintenance_type === 'our_maintenance' ? '自维保' : '-')}</td>
      </tr>`,
    )
    .join('')

  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">维保到期提醒</h2>
      <p>以下 ${devices.length} 台设备的维保服务将在 <strong>30 天内</strong>到期，请及时安排续保或评估风险。</p>
      <table style="border-collapse:collapse;width:100%;max-width:800px;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">设备</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">型号</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">序列号</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">到期日</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">维保类型</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">请登录管理端查看设备详情，及时处理续保事宜。</p>
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, deviceCount: devices.length }
}

async function sendInspectionReminderMail(schedules = [], recipients = []) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)

  const cadenceLabel = { monthly: '每月', 'bi-monthly': '每两月', quarterly: '每季度' }
  const rows = schedules
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(s.customer_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(s.device_names || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(cadenceLabel[s.cadence] || s.cadence)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(s.next_run_anchor || '').slice(0, 10))}</td>
      </tr>`,
    )
    .join('')

  const subject = `巡检提醒：${schedules.length} 项巡检计划即将执行`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">巡检执行提醒</h2>
      <p>以下巡检计划将在 <strong>3 天内</strong>到达执行日期，请提前安排并登录工程师端查看。</p>
      <table style="border-collapse:collapse;width:100%;max-width:800px;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">设备</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">周期</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">计划日期</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">如有需要，可登录管理端调整巡检计划。</p>
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, scheduleCount: schedules.length }
}

async function sendSalesServiceOrderMail(order, recipients = [], detailUrl = '') {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients)
  if (!to.length) {
    return {
      skipped: true,
      reason: 'no_recipient_email',
      recipientIds: recipients.map((recipient) => recipient.id).filter(Boolean),
    }
  }

  const transporter = mailTransporter(mail)
  const orderNo = order.order_no || order.orderNo || order.id
  const customerName = order.customer_name || order.customerName || '-'
  const subject = `服务单更新：${orderNo} / ${customerName}`
  const linkBlock = detailUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(detailUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;padding:9px 14px">查看 OMS 工单详情</a></p>`
    : '<p style="color:#64748b">请登录 OMS 管理端查看工单详情。</p>'
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">客户服务单已更新</h2>
      <p>你负责的客户有一张服务单已由工程师提交或更新，请查看服务进展。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:760px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">Case ID</td><td>${htmlEscape(orderNo)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">客户</td><td>${htmlEscape(customerName)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">联系人</td><td>${htmlEscape(order.contact_name || order.contactName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务方式</td><td>${htmlEscape(serviceModeLabel(order.service_mode || order.serviceMode))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">工程师</td><td>${htmlEscape(order.engineer_name || order.engineerName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务时间</td><td>${htmlEscape(formatTime(order.actual_start_at || order.actualStartAt || order.submitted_at || order.submittedAt))} 至 ${htmlEscape(formatTime(order.actual_end_at || order.actualEndAt || order.updated_at || order.updatedAt))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">问题/事项</td><td>${htmlEscape(order.issue_description || order.issueDescription || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">处理摘要</td><td>${htmlEscape(order.work_content || order.workContent || order.result_description || order.resultDescription || '-')}</td></tr>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">该邮件延迟发送，用于合并工程师提交后的连续修改。</p>
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to }
}

module.exports = {
  sendAssignmentMail,
  sendInspectionConfirmationMail,
  sendMaintenanceExpiryMail,
  sendInspectionReminderMail,
  sendSalesServiceOrderMail,
}
