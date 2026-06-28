const nodemailer = require('nodemailer')
const { effectiveSettings } = require('../modules/settings/controller')

const MAIL_ACTION_COLOR = '#7c3aed'
const MAIL_BUTTON_STYLE = `display:inline-block;background:${MAIL_ACTION_COLOR};color:#fff;text-decoration:none;border-radius:6px;padding:9px 14px`
const MAIL_LINK_STYLE = `color:${MAIL_ACTION_COLOR};text-decoration:none`

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
    .map((engineer) => String(engineer?.email || engineer || '').trim())
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

function serviceTypeLabel(type) {
  const labels = {
    install: '安装',
    repair: '排障',
    maintain: '保养',
    inspect: '巡检',
    training: '培训',
    remote: '远程支持',
    other: '其他',
  }
  return labels[type] || type || '-'
}

function statusLabel(status) {
  const labels = {
    draft: '草稿',
    pending_confirmation: '待确认',
    assigned: '已派单',
    in_progress: '处理中',
    submitted: '待审核',
    rejected: '已退回',
    approved: '已审核',
    archived: '已归档',
    cancelled: '已取消',
  }
  return labels[status] || status || '-'
}

function maintenanceTypeLabel(type) {
  if (type === 'original_manufacturer') return '原厂维保'
  if (type === 'our_maintenance') return '自维保'
  if (type === 'none') return '无维保'
  return '-'
}

function missingMaintenanceText(device) {
  const missing = []
  if (!device.maintenance_type || device.maintenance_type === 'none') missing.push('维保类型')
  if (device.maintenance_type && device.maintenance_type !== 'none') {
    if (!device.maintenance_start) missing.push('维保开始日期')
    if (!device.maintenance_end) missing.push('维保结束日期')
  }
  return missing.join('、') || '维保信息'
}

function deviceDisplayName(device) {
  const model = String(device?.model || '').trim()
  const serialNo = String(device?.serial_no || device?.serialNo || '').trim()
  const fallbackName = String(device?.name || device?.device_name || device?.deviceName || '').trim()
  return [model, serialNo].filter(Boolean).join(' / ') || fallbackName || '-'
}

function parseMailList(value) {
  return String(value || '')
    .split(/[,;\s，；]+/)
    .map((email) => email.trim())
    .filter(Boolean)
}

function adminLink(baseUrl, path) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  const suffix = String(path || '').startsWith('/') ? path : `/${path || ''}`
  return `${base}${suffix}`
}

function mailFooter() {
  const year = new Date().getFullYear()
  return `
      <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.7">
        <div style="font-weight:700;color:#475569">OMS Platform 运维智管 · 敦阳（宁波）科技有限公司</div>
        <div>本邮件由 OMS Platform 自动发送，请勿直接回复。工单详情仅对授权账号开放，如无法访问请联系系统管理员。</div>
        <div>© ${year} 敦阳（宁波）科技有限公司。保留所有权利。</div>
      </div>`
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
      ${mailFooter()}
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
  const notification = settings.notification || {}
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }
  if (notification.inspectionConfirmationEnabled !== 'true') return { skipped: true, reason: 'inspection_confirmation_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const configured = parseMailList(notification.inspectionConfirmationRecipients)
  const to = recipientEmails(recipients.length ? recipients : configured)
  if (!to.length) {
    return {
      skipped: true,
      reason: 'no_recipient_email',
      recipientIds: recipients.map((recipient) => recipient.id).filter(Boolean),
    }
  }

  const transporter = mailTransporter(mail)

  const subject = `巡检待确认：${order.order_no || order.orderNo || order.id} / ${order.customer_name || order.customerName || ''}`
  const detailUrl = adminLink(notification.serviceOrderAdminBaseUrl, `/service-orders?orderId=${encodeURIComponent(order.id)}`)
  const linkBlock = detailUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(detailUrl)}" style="${MAIL_BUTTON_STYLE}">查看并确认巡检工单</a></p>`
    : ''
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">巡检工单待确认</h2>
      <p>系统已根据巡检计划生成待确认工单，请登录管理端确认并派发。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:680px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">Case ID</td><td>${htmlEscape(order.order_no || order.orderNo || order.id)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">客户</td><td>${htmlEscape(order.customer_name || order.customerName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">设备</td><td>${htmlEscape(order.device_name || order.deviceName || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">计划时间</td><td>${htmlEscape(formatTime(order.planned_start_at || order.plannedStartAt))} 至 ${htmlEscape(formatTime(order.planned_end_at || order.plannedEndAt))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">巡检说明</td><td>${htmlEscape(order.issue_description || order.issueDescription || '-')}</td></tr>
      </table>
      <p style="color:#64748b">确认后，该巡检工单会派发到工程师端。</p>
      ${mailFooter()}
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
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(deviceDisplayName(d))}</td>
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
      <p>以下 ${devices.length} 台设备的维保服务即将到期，请及时安排续保或评估风险。</p>
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
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, deviceCount: devices.length }
}

async function sendNoMaintenanceDevicesMail(devices = [], recipients = [], detailBaseUrl = '') {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const devicesUrl = adminLink(detailBaseUrl, '/devices')
  const linkBlock = devicesUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(devicesUrl)}" style="${MAIL_BUTTON_STYLE}">查看设备台账</a></p>`
    : ''
  const rows = devices
    .map(
      (d) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.customer_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(deviceDisplayName(d))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.model || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(d.serial_no || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(maintenanceTypeLabel(d.maintenance_type))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(d.maintenance_start || '').slice(0, 10) || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(d.maintenance_end || '').slice(0, 10) || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(missingMaintenanceText(d))}</td>
      </tr>`,
    )
    .join('')

  const subject = `维保信息待完善提醒：${devices.length} 台客户设备需补齐维保资料`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">客户设备维保信息待完善提醒</h2>
      <p>以下客户设备当前缺少维保类型或维保周期，请根据客户实际情况跟进确认。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:980px;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">设备</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">型号</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">序列号</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">维保类型</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">开始日期</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">结束日期</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">待补内容</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">该提醒仅针对客户关联销售发送，用于补齐客户设备维保信息。系统每周一检查并提醒一次，相关信息补齐后将自动停止提醒。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, deviceCount: devices.length }
}

async function sendInspectionScheduleDateMissingMail(schedules = [], recipients = [], detailBaseUrl = '') {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const schedulesUrl = adminLink(detailBaseUrl, '/inspection-schedules')
  const linkBlock = schedulesUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(schedulesUrl)}" style="${MAIL_BUTTON_STYLE}">查看巡检计划</a></p>`
    : ''
  const cadenceLabel = { monthly: '每月', 'bi-monthly': '每两月', quarterly: '每季度' }
  const rows = schedules
    .map((schedule) => {
      const missingFields = [
        !schedule.next_run_anchor ? '开始日期' : '',
        !schedule.end_date ? '结束日期' : '',
      ].filter(Boolean).join('、') || '巡检日期'
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(schedule.customer_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(schedule.name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(schedule.device_names || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(cadenceLabel[schedule.cadence] || schedule.cadence || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(schedule.next_run_anchor || '').slice(0, 10) || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(schedule.end_date || '').slice(0, 10) || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(missingFields)}</td>
      </tr>`
    })
    .join('')

  const subject = `巡检日期待完善提醒：${schedules.length} 项巡检计划需补齐日期`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">巡检日期待完善提醒</h2>
      <p>以下客户已建立巡检计划，但巡检起止日期尚未完整，请跟进补齐。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:980px;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">计划</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">设备</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">周期</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">开始日期</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">结束日期</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">待补内容</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">该提醒仅针对客户关联销售发送，用于补齐客户巡检计划日期。系统每周一检查并提醒一次，相关信息补齐后将自动停止提醒。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, scheduleCount: schedules.length }
}

async function sendMissingCustomerSalespersonMail(customers = [], recipients = [], detailBaseUrl = '') {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const customersUrl = adminLink(detailBaseUrl, '/customers')
  const linkBlock = customersUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(customersUrl)}" style="${MAIL_BUTTON_STYLE}">查看客户台账</a></p>`
    : ''
  const rows = customers
    .map(
      (customer) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(customer.name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(customer.code || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(customer.contact_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(customer.contact_phone || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(customer.address || '-')}</td>
      </tr>`,
    )
    .join('')

  const subject = `客户缺少销售提醒：${customers.length} 个客户未填写销售`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">客户缺少销售提醒</h2>
      <p>以下客户档案尚未填写销售人员，请补齐客户销售归属，避免后续通知无法送达对应销售。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:920px;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户编号</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">联系人</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">联系电话</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">地址</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">该提醒发送给助理，用于补齐客户销售归属。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, customerCount: customers.length }
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
      <p>以下巡检计划即将到达执行日期，请提前协调执行安排与客户沟通。</p>
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
      <p style="margin-top:16px;color:#64748b;font-size:13px">该提醒会发送给执行工程师；系统设置开启后，也会同步给客户关联销售和指定管理收件人。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, scheduleCount: schedules.length }
}

async function sendInspectionOverdueMail(orders = [], recipients = [], detailBaseUrl = '') {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const rows = orders
    .map((order) => {
      const detailUrl = adminLink(detailBaseUrl, `/service-orders?orderId=${encodeURIComponent(order.id)}`)
      const orderText = detailUrl
        ? `<a href="${htmlEscape(detailUrl)}" style="${MAIL_LINK_STYLE}">${htmlEscape(order.order_no || order.id)}</a>`
        : htmlEscape(order.order_no || order.id)
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${orderText}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(order.customer_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(order.engineer_name || order.target_engineer_name || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(formatTime(order.planned_end_at || order.planned_start_at || order.inspection_occurrence_date))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(String(order.overdue_days || 0))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${htmlEscape(statusLabel(order.status))}</td>
      </tr>`
    })
    .join('')

  const subject = `巡检逾期提醒：${orders.length} 张巡检工单未提交`
  const listUrl = adminLink(detailBaseUrl, '/service-orders?status=in_progress')
  const linkBlock = listUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(listUrl)}" style="${MAIL_BUTTON_STYLE}">查看巡检工单列表</a></p>`
    : ''
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">巡检逾期未提交提醒</h2>
      <p>以下巡检工单已超过计划时间且尚未提交，请跟进确认。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:900px;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Case ID</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">客户</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">工程师</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">计划结束</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">逾期天数</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">状态</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, orderCount: orders.length }
}

function summarySection(title, items = []) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : []
  if (!rows.length) return ''
  return `
    <div style="margin-top:16px">
      <div style="font-weight:700;margin-bottom:6px">${htmlEscape(title)}</div>
      <ul style="margin:0;padding-left:20px;color:#334155">${rows.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul>
    </div>`
}

async function sendMonthlyOperationsSummaryMail(report, recipients = [], detailBaseUrl = '') {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const stats = report.stats || {}
  const ai = report.workSummary || {}
  const summary = ai.summary || {}
  const summaryText = summary.executiveSummary || ai.reason || '本月暂无可生成 AI 摘要的工作内容，以下为系统基础统计。'
  const dashboardUrl = adminLink(detailBaseUrl, '/dashboard')
  const timesheetUrl = adminLink(detailBaseUrl, `/timesheets?month=${encodeURIComponent(report.month || '')}`)
  const linkBlock = dashboardUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(dashboardUrl)}" style="${MAIL_BUTTON_STYLE}">查看 OMS 运营总览</a>${timesheetUrl ? ` <a href="${htmlEscape(timesheetUrl)}" style="display:inline-block;${MAIL_LINK_STYLE};padding:9px 10px">月报导出</a>` : ''}</p>`
    : ''
  const themeRows = Array.isArray(summary.keyThemes) ? summary.keyThemes.map((item) => `${item.theme || '主题'}：${item.details || ''}`) : []
  const subject = `月度营运总结：${report.label || report.month || ''}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">月度营运总结</h2>
      <p style="margin:0 0 8px;color:#64748b">统计期间：${htmlEscape(report.label || '-')}</p>
      ${linkBlock}
      <div style="display:block;max-width:760px;margin:14px 0">
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr style="background:#f8fafc">
            <td style="padding:10px 12px;border:1px solid #e2e8f0">工单数<br><strong style="font-size:20px;color:#0f172a">${htmlEscape(stats.serviceOrders || 0)}</strong></td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0">服务客户<br><strong style="font-size:20px;color:#0f172a">${htmlEscape(stats.customers || 0)}</strong></td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0">参与工程师<br><strong style="font-size:20px;color:#0f172a">${htmlEscape(stats.engineers || 0)}</strong></td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0">登记工时<br><strong style="font-size:20px;color:#0f172a">${htmlEscape(stats.workHours || 0)}</strong></td>
          </tr>
        </table>
      </div>
      <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">${htmlEscape(summaryText)}</div>
      <div style="margin-top:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#9a3412;font-size:13px;line-height:1.7">
        AI 免责说明：本摘要由系统基于 OMS 已记录数据自动整理，并由 AI 辅助生成，仅供内部管理参考；请以 OMS 原始工单、月报记录和人工判断为准。
      </div>
      ${summarySection('重点主题', themeRows)}
      ${summarySection('客户影响', summary.customerImpact)}
      ${summarySection('风险信号', summary.riskSignals)}
      ${summarySection('后续建议', summary.followUpRecommendations)}
      ${summary.coverageNotes ? `<p style="margin-top:16px;color:#64748b;font-size:13px">${htmlEscape(summary.coverageNotes)}</p>` : ''}
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, month: report.month }
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
    ? `<p style="margin:18px 0"><a href="${htmlEscape(detailUrl)}" style="${MAIL_BUTTON_STYLE}">查看 OMS 工单详情</a></p>`
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
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to }
}

module.exports = {
  sendAssignmentMail,
  sendInspectionConfirmationMail,
  sendMaintenanceExpiryMail,
  sendNoMaintenanceDevicesMail,
  sendMissingCustomerSalespersonMail,
  sendInspectionScheduleDateMissingMail,
  sendInspectionReminderMail,
  sendInspectionOverdueMail,
  sendMonthlyOperationsSummaryMail,
  sendSalesServiceOrderMail,
}
