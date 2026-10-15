const nodemailer = require('nodemailer')
const env = require('../config/env')
const { effectiveSettings } = require('../modules/settings/controller')

// 品牌紫：与公司 logo/打印文件一致（深紫主色 + 浅紫 accent）
const MAIL_ACTION_COLOR = '#4e386e'
const MAIL_ACCENT_COLOR = '#73529b'
const MAIL_BUTTON_STYLE = `display:inline-block;background:${MAIL_ACTION_COLOR};color:#fff;text-decoration:none;border-radius:6px;padding:9px 14px;font-weight:600`
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
    maintain: '调优',
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
    awaiting_customer_signature: '待客户签署',
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
  if (type === 'pending_confirmation') return '待确认'
  if (type === 'original_manufacturer') return '原厂维保'
  if (type === 'our_maintenance') return '自维保'
  if (type === 'none') return '无维保'
  return '-'
}

function missingMaintenanceText(device) {
  const missing = []
  if (!device.maintenance_type || device.maintenance_type === 'pending_confirmation') missing.push('确认是否纳入维保')
  if (['original_manufacturer', 'our_maintenance'].includes(device.maintenance_type)) {
    if (!device.maintenance_end) missing.push('维保截止日期')
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

async function sendNewDeviceLoginMail({ to, realName = '', methodLabel = '', ip = '', location = '', deviceLabel = '' }) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const recipient = String(to || '').trim()
  if (!recipient || !recipient.includes('@')) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const subject = '【OMS Platform】您的账号在新设备上登录'
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">新设备登录提醒</h2>
      <p>${htmlEscape(realName || '您好')}，您的账号刚刚在一台此前未使用过的设备上登录成功：</p>
      <table style="border-collapse:collapse;width:100%;max-width:680px;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">时间</td><td>${htmlEscape(formatTime(new Date()))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">登录方式</td><td>${htmlEscape(methodLabel || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">设备</td><td>${htmlEscape(deviceLabel || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">IP</td><td>${htmlEscape(ip || '-')}${location ? `（${htmlEscape(location)}）` : ''}</td></tr>
      </table>
      <p style="margin-top:14px">如这是您本人操作，可忽略本邮件。<strong>如非本人操作</strong>，请立即联系系统管理员重置密码，并在「我的设置」中检查通行密钥列表是否有陌生设备。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to: recipient, subject, html })
  return { sent: true, to: recipient }
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

async function sendNoMaintenanceDevicesMail(devices = [], recipients = [], detailBaseUrl = '', options = {}) {
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

  const audienceNote = options.audience === 'engineer'
    ? '该提醒发送给设备安装工单的工程师，用于补齐所装设备的维保信息。系统每周一检查并提醒一次，相关信息补齐后将自动停止提醒。'
    : '该提醒仅针对客户关联销售发送，用于补齐客户设备维保信息。系统每周一检查并提醒一次，相关信息补齐后将自动停止提醒。'
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
      <p style="margin-top:16px;color:#64748b;font-size:13px">${audienceNote}</p>
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

function engineerSummarySections(summary = {}) {
  const customerReports = Array.isArray(summary.customerReports) ? summary.customerReports.filter((item) => item?.customerName || item?.report) : []
  const coordinationNeeds = Array.isArray(summary.coordinationNeeds) ? summary.coordinationNeeds.filter(Boolean) : []
  return `
    ${customerReports.length ? `
      <div style="margin-top:16px">
        <div style="font-weight:700;margin-bottom:6px">客户工作情况</div>
        ${customerReports.map((item) => `
          <div style="padding:10px 0;border-top:1px solid #e2e8f0">
            <div style="font-weight:700">${htmlEscape(item.customerName || '未命名客户')}</div>
            <div style="margin-top:4px;color:#334155">${htmlEscape(item.report || '-')}</div>
          </div>`).join('')}
      </div>` : ''}
    ${summary.internalWork ? `
      <div style="margin-top:16px">
        <div style="font-weight:700;margin-bottom:6px">内部工作</div>
        <div style="color:#334155">${htmlEscape(summary.internalWork)}</div>
      </div>` : ''}
    ${summarySection('需要协调的事项', coordinationNeeds)}
    ${summary.nextPlan ? `
      <div style="margin-top:16px">
        <div style="font-weight:700;margin-bottom:6px">下一步计划</div>
        <div style="color:#334155">${htmlEscape(summary.nextPlan)}</div>
      </div>` : ''}`
}

function monthlySummarySectionLabels(scopeType) {
  if (scopeType === 'sales') {
    return {
      themes: '客户服务重点',
      impact: '客户影响与机会',
      risks: '客户风险信号',
      followUp: '销售跟进建议',
    }
  }
  if (scopeType === 'engineer') {
    return {
      themes: '本月工作重点',
      impact: '服务成效',
      risks: '问题与风险',
      followUp: '月会汇报建议',
    }
  }
  return {
    themes: '经营重点',
    impact: '客户影响',
    risks: '风险信号',
    followUp: '管理建议',
  }
}

async function sendMonthlySummaryFailureMail({ transporter, mail, report, recipients, reason, options }) {
  const alertTo = 'oms@starkgrp.com'
  const title = options.title || '月度营运总结'
  const scopeName = report.scope?.name || ''
  const stats = report.stats || {}
  const intendedRecipients = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  const subject = `月报发送失败：${title} / ${report.label || report.month || '-'}${scopeName ? ` / ${scopeName}` : ''}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">月报发送失败</h2>
      <p>系统未能生成可用的 AI 月报摘要，因此已跳过向原收件人发送月报。</p>
      <table style="border-collapse:collapse;width:100%;max-width:760px">
        <tr><td style="padding:6px 0;color:#64748b;width:120px">月报类型</td><td>${htmlEscape(title)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">统计期间</td><td>${htmlEscape(report.label || report.month || '-')}</td></tr>
        ${scopeName ? `<tr><td style="padding:6px 0;color:#64748b">统计范围</td><td>${htmlEscape(scopeName)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#64748b">失败原因</td><td>${htmlEscape(reason || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">原收件人数</td><td>${htmlEscape(intendedRecipients.length)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">工单数</td><td>${htmlEscape(stats.serviceOrders || 0)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务客户</td><td>${htmlEscape(stats.customers || 0)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">参与工程师</td><td>${htmlEscape(stats.engineers || 0)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">登记工时</td><td>${htmlEscape(stats.workHours || 0)}</td></tr>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">请检查 AI 服务配置、网络连通性或模型响应耗时后重试。</p>
      ${mailFooter()}
    </div>
  `
  await transporter.sendMail({ from: mail.from, to: alertTo, subject, html })
  return { to: [alertTo] }
}

async function sendMonthlyOperationsSummaryMail(report, recipients = [], detailBaseUrl = '', options = {}) {
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
  const summaryText = String(summary.executiveSummary || '').trim()
  if (!ai.available || !summaryText) {
    let failureNoticeTo = []
    let failureNoticeError = ''
    try {
      const failure = await sendMonthlySummaryFailureMail({
        transporter,
        mail,
        report,
        recipients,
        reason: ai.reason || 'AI summary is required before sending monthly operations summary',
        options,
      })
      failureNoticeTo = failure.to
    } catch (error) {
      failureNoticeError = error?.message || 'failure_notice_send_failed'
      console.error('[mail] monthly summary failure notice failed', {
        month: report.month,
        scope: report.scope?.name,
        message: failureNoticeError,
      })
    }
    return {
      skipped: true,
      reason: 'monthly_summary_unavailable',
      detail: ai.reason || 'AI summary is required before sending monthly operations summary',
      failureNoticeTo,
      failureNoticeError,
    }
  }
  const title = options.title || '月度营运总结'
  const description = options.description || report.scope?.description || ''
  const scopeName = report.scope?.name || ''
  const sectionLabels = monthlySummarySectionLabels(report.scope?.type)
  const dashboardUrl = adminLink(detailBaseUrl, '/dashboard')
  const timesheetUrl = adminLink(detailBaseUrl, `/timesheets?month=${encodeURIComponent(report.month || '')}`)
  const linkBlock = options.showLinks === false ? '' : dashboardUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(dashboardUrl)}" style="${MAIL_BUTTON_STYLE}">查看 OMS 运营总览</a>${timesheetUrl ? ` <a href="${htmlEscape(timesheetUrl)}" style="display:inline-block;${MAIL_LINK_STYLE};padding:9px 10px">月报导出</a>` : ''}</p>`
    : ''
  const themeRows = Array.isArray(summary.keyThemes) ? summary.keyThemes.map((item) => `${item.theme || '主题'}：${item.details || ''}`) : []
  const summarySections = summary.reportFormat === 'engineer'
    ? engineerSummarySections(summary)
    : [
      summarySection(sectionLabels.themes, themeRows),
      summarySection(sectionLabels.impact, summary.customerImpact),
      summarySection(sectionLabels.risks, summary.riskSignals),
      summarySection(sectionLabels.followUp, summary.followUpRecommendations),
    ].join('')
  const subject = `${options.subjectPrefix || title}：${report.label || report.month || ''}${scopeName ? ` / ${scopeName}` : ''}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">${htmlEscape(title)}</h2>
      <p style="margin:0 0 8px;color:#64748b">统计期间：${htmlEscape(report.label || '-')}</p>
      ${scopeName ? `<p style="margin:0 0 8px;color:#64748b">统计范围：${htmlEscape(scopeName)}</p>` : ''}
      ${description ? `<p style="margin:0 0 10px;color:#475569">${htmlEscape(description)}</p>` : ''}
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
      ${summarySections}
      ${summary.coverageNotes ? `<p style="margin-top:16px;color:#64748b;font-size:13px">${htmlEscape(summary.coverageNotes)}</p>` : ''}
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to, month: report.month }
}

/**
 * 智能报表订阅推送（spec 014）：定时把收藏的报表跑一遍，HTML 预览 + xlsx 附件发送。
 * 配置与月度营运总结共用 effectiveSettings().mail；AI 摘要失败不阻塞发送。
 */
async function sendReportSubscriptionMail({ templateName, frequency, specText, summary, columns = [], rows = [], xlsxBuffer, fileName, recipients = [] }) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const freqLabel = frequency === 'weekly' ? '每周' : '每月'
  const previewRows = rows.slice(0, 10)
  const tableHtml = previewRows.length
    ? `<table style="border-collapse:collapse;width:100%;font-size:13px;max-width:760px">
        <tr style="background:#f8fafc">${columns.map((c) => `<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">${htmlEscape(c.label)}</th>`).join('')}</tr>
        ${previewRows.map((row) => `<tr>${columns.map((c) => `<td style="padding:6px 10px;border:1px solid #e2e8f0">${htmlEscape(row[c.key])}</td>`).join('')}</tr>`).join('')}
      </table>
      ${rows.length > previewRows.length ? `<p style="color:#64748b;font-size:12px">（共 ${rows.length} 行，完整数据见附件 Excel）</p>` : ''}`
    : '<p style="color:#64748b">本期无数据。</p>'

  const subject = `智能报表${freqLabel}推送：${templateName}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">${htmlEscape(templateName)}</h2>
      <p style="margin:0 0 10px;color:#64748b">统计口径：${htmlEscape(specText || '-')}</p>
      ${summary ? `<div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:12px">${htmlEscape(summary)}</div>` : ''}
      ${tableHtml}
      <div style="margin-top:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#9a3412;font-size:13px;line-height:1.7">
        AI 免责说明：本报表由 OMS 智能报表按订阅自动生成，摘要由 AI 辅助生成，仅供内部管理参考；请以 OMS 原始记录和人工判断为准。
      </div>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({
    from: mail.from,
    to,
    subject,
    html,
    attachments: xlsxBuffer ? [{ filename: fileName || 'report.xlsx', content: xlsxBuffer }] : [],
  })
  return { sent: true, to }
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

function installFieldStatusText(filled, count, unit) {
  return filled ? `已填写 ${count} ${unit}` : '未填写'
}

function installFieldStatusStyle(filled) {
  return filled ? 'color:#15803d;font-weight:600' : 'color:#b91c1c;font-weight:600'
}

async function sendInstallSupervisorMail(order, installDevices = [], installParts = [], recipients = [], detailUrl = '') {
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
  const devicesFilled = installDevices.length > 0
  const partsFilled = installParts.length > 0
  const devicesText = installFieldStatusText(devicesFilled, installDevices.length, '台')
  const partsText = installFieldStatusText(partsFilled, installParts.length, '项')
  const subject = `安装工单提交：${orderNo} / ${customerName}（安装设备${devicesFilled ? '已填' : '未填'}、配件${partsFilled ? '已填' : '未填'}）`
  const linkBlock = detailUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(detailUrl)}" style="${MAIL_BUTTON_STYLE}">查看 OMS 工单详情</a></p>`
    : '<p style="color:#64748b">请登录 OMS 管理端查看工单详情。</p>'
  const deviceRows = devicesFilled
    ? installDevices
        .map(
          (device) =>
            `<tr><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(device.name || '-')}</td><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(device.model || '-')}</td><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(device.pn || '-')}</td><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(device.serial_no || '-')}</td></tr>`,
        )
        .join('')
    : ''
  const deviceSection = devicesFilled
    ? `<h3 style="margin:20px 0 8px">安装设备明细</h3>
       <table style="border-collapse:collapse;width:100%;max-width:760px">
         <tr style="background:#f8fafc"><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">名称</th><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">型号</th><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">PN</th><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">序列号</th></tr>
         ${deviceRows}
       </table>`
    : ''
  const partRows = partsFilled
    ? installParts
        .map(
          (part) =>
            `<tr><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(part.part_name || '-')}</td><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(part.part_no || '-')}</td><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(`${part.quantity ?? 1}${part.unit || ''}`)}</td><td style="padding:4px 8px;border:1px solid #e2e8f0">${htmlEscape(part.remark || '-')}</td></tr>`,
        )
        .join('')
    : ''
  const partSection = partsFilled
    ? `<h3 style="margin:20px 0 8px">安装配件明细</h3>
       <table style="border-collapse:collapse;width:100%;max-width:760px">
         <tr style="background:#f8fafc"><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">配件名称</th><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">料号</th><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">数量</th><th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left">备注</th></tr>
         ${partRows}
       </table>`
    : ''
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">现场安装工单已提交</h2>
      <p>工程师提交了一张现场安装工单，请核对「安装设备」与「安装配件」栏位的填写情况${!devicesFilled || !partsFilled ? '，<strong style="color:#b91c1c">存在未填写项</strong>' : ''}。</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:760px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">Case ID</td><td>${htmlEscape(orderNo)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">客户</td><td>${htmlEscape(customerName)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">工程师</td><td>${htmlEscape(order.engineer_name || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">提交时间</td><td>${htmlEscape(formatTime(order.submitted_at || order.updated_at))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">安装设备栏位</td><td style="${installFieldStatusStyle(devicesFilled)}">${htmlEscape(devicesText)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">安装配件栏位</td><td style="${installFieldStatusStyle(partsFilled)}">${htmlEscape(partsText)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">问题/事项</td><td>${htmlEscape(order.issue_description || '-')}</td></tr>
      </table>
      ${deviceSection}
      ${partSection}
      <p style="margin-top:16px;color:#64748b;font-size:13px">该邮件延迟发送，用于合并工程师提交后的连续修改，反映的是最终填写状态。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to }
}

async function sendCustomerSignatureRequestMail(order, recipientEmail, signUrl, expiresAt) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails([recipientEmail])
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const orderNo = order.order_no || order.orderNo || order.id || '-'
  const customerName = order.customer_name || order.customerName || '-'
  const report = order.report || {}
  const engineers = Array.isArray(order.engineers)
    ? order.engineers.map((engineer) => engineer.realName || engineer.real_name || engineer.username).filter(Boolean).join('、')
    : (order.engineerName || order.engineer_name || '-')
  const expiresAtText = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt
  const subject = `客户服务确认函：${orderNo} / ${customerName}`
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">客户服务确认函</h2>
      <p>工程师已提交本次现场服务记录。请打开下方链接核对服务内容，并在页面中完成签字确认。</p>
      <p style="margin:18px 0"><a href="${htmlEscape(signUrl)}" style="${MAIL_BUTTON_STYLE}">查看并签字确认</a></p>
      <table style="border-collapse:collapse;width:100%;max-width:760px">
        <tr><td style="padding:6px 0;color:#64748b;width:96px">Case ID</td><td>${htmlEscape(orderNo)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">客户</td><td>${htmlEscape(customerName)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">联系人</td><td>${htmlEscape(order.contactName || order.contact_name || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务方式</td><td>${htmlEscape(serviceModeLabel(order.serviceMode || order.service_mode))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务事项</td><td>${htmlEscape(serviceTypeLabel(order.serviceType || order.service_type))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">工程师</td><td>${htmlEscape(engineers || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">服务时间</td><td>${htmlEscape(formatTime(report.actualStartAt || report.actual_start_at))} 至 ${htmlEscape(formatTime(report.actualEndAt || report.actual_end_at))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">问题/事项</td><td>${htmlEscape(order.issueDescription || order.issue_description || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">处理记录</td><td>${htmlEscape(report.workContent || report.work_content || '-')}</td></tr>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:13px">链接有效期至 ${htmlEscape(formatTime(expiresAtText))}。如链接过期或内容有误，请联系服务工程师重新发送。</p>
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to }
}

// 假别 label：优先提交时快照（spec 004），历史数据回退写死映射
function attendanceLeaveTypeLabel(type, snapshotLabel) {
  return snapshotLabel || {
    annual: '年假',
    sick: '病假',
    personal: '事假',
    marriage: '婚假',
    bereavement: '丧假',
  }[type] || type || '请假'
}

function attendanceDateRange(payload) {
  return `${formatTime(payload.startAt)} 至 ${formatTime(payload.endAt)}`
}

function attendanceMailRows(payload) {
  const rows = [
    ['申请人', payload.applicantName || '-'],
    ['假别', attendanceLeaveTypeLabel(payload.leaveType, payload.leaveTypeLabel)],
    ['请假时间', attendanceDateRange(payload)],
    ['核算天数', payload.workingDays === null || payload.workingDays === undefined ? '-' : `${payload.workingDays} 天`],
  ]
  if (payload.leaveReferenceDays) rows.push(['参考天数', payload.leaveReferenceDays])
  if (payload.leavePolicyNote) rows.push(['政策说明', payload.leavePolicyNote])
  if (payload.quotaDays !== null && payload.quotaDays !== undefined && payload.quotaDays !== '') {
    rows.push(['带薪额度', `年度 ${payload.quotaDays} 天，此前已批 ${payload.quotaUsedDays || 0} 天`])
    if (Number(payload.quotaExceedDays || 0) > 0) {
      rows.push(['超额提示', `本次申请超出带薪额度 ${payload.quotaExceedDays} 天${payload.quotaDeductionPercent ? `，超出部分按政策扣 ${payload.quotaDeductionPercent}% 计` : ''}`])
    }
  }
  if (payload.delegateName) rows.push(['工作代理人', payload.delegateName])
  if (payload.reason) rows.push(['申请原因', payload.reason])
  if (payload.stepOrder && payload.stepCount) rows.push(['审批进度', `第 ${payload.stepOrder} / ${payload.stepCount} 级`])
  return rows
}

async function sendAttendanceNotificationMail(payload = {}, recipients = []) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }
  if (mail.attendanceNotifyEnabled !== 'true') return { skipped: true, reason: 'attendance_notify_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients)
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const eventType = String(payload.eventType || '')
  const leaveType = attendanceLeaveTypeLabel(payload.leaveType, payload.leaveTypeLabel)
  const subjectByType = {
    approval_pending: `请假待审批：${payload.applicantName || '-'} / ${leaveType}`,
    delegate_info: `请假代理通知：${payload.applicantName || '-'} / ${leaveType}`,
    rejected: `请假申请已驳回：${payload.applicantName || '-'} / ${leaveType}`,
    completed: `请假流程已完成：${payload.applicantName || '-'} / ${leaveType}`,
    duty_pending_admin: `值班津贴待终审：${payload.month || '-'}（${payload.total || 0} 条）`,
    reminder: `催办提醒：${payload.applicantName || '-'} 的${payload.requestTypeLabel || '申请'}待您审批`,
    comp_expiry_reminder: `调休即将清零提醒：${payload.remainingHours || 0} 小时 · ${payload.expiresAt || '-'} 清零`,
    annual_carryover_reminder: `特休年末折算提醒：当前余额 ${payload.balanceDays || 0} 天`,
  }
  const headingByType = {
    approval_pending: '请假待审批',
    delegate_info: '请假代理通知',
    rejected: '请假申请已驳回',
    completed: '请假流程已完成',
    duty_pending_admin: '值班津贴待终审',
    reminder: '审批催办提醒',
    comp_expiry_reminder: '调休即将清零提醒',
    annual_carryover_reminder: '特休年末折算提醒',
  }
  const subject = subjectByType[eventType] || `请假通知：${payload.applicantName || '-'}`
  const heading = headingByType[eventType] || '请假通知'
  const rows = attendanceMailRows(payload)
  if (eventType === 'duty_pending_admin') {
    rows.length = 0
    rows.push(['值班月份', payload.month || '-'])
    rows.push(['记录条数', `${payload.total || 0} 条`])
    rows.push(['值班人次', `${payload.units || 0} 人次`])
    rows.push(['提交方式', payload.auto ? '系统每月自动提交' : '工程主管提交'])
  }
  // 催办提醒（spec 007）：行项目自建，覆盖请假/调休/加班全类型
  if (eventType === 'reminder') {
    rows.length = 0
    rows.push(['申请人', payload.applicantName || '-'])
    rows.push(['申请类型', payload.requestTypeLabel || '请假'])
    if (payload.leaveType) rows.push(['假别', attendanceLeaveTypeLabel(payload.leaveType)])
    rows.push(['时间范围', attendanceDateRange(payload)])
    if (payload.stepOrder && payload.stepCount) rows.push(['审批进度', `第 ${payload.stepOrder} / ${payload.stepCount} 级`])
    rows.push(['已等待', `${payload.waitingHours || 0} 小时`])
    rows.push(['提醒方式', payload.reminderKind === 'auto' ? '系统自动（环节停留超 24 小时）' : '申请人手动催办'])
    if (payload.reason) rows.push(['申请原因', payload.reason])
  }
  if (eventType === 'rejected') {
    rows.push(['驳回人', payload.rejectedByName || '-'])
    rows.push(['驳回原因', payload.rejectedReason || '未填写'])
  }
  if (eventType === 'completed') {
    if (payload.leaveType === 'annual') {
      rows.push(['本次扣减', `${payload.annualLeaveUsedDays || 0} 天`])
      rows.push(['剩余年假', `${payload.annualLeaveBalanceDays || 0} 天`])
    } else {
      rows.push(['余额说明', '该假别不计系统余额'])
    }
  }
  // 到期提醒（2026-09-04）：调休次季末清零 / 特休年末折算
  if (eventType === 'comp_expiry_reminder') {
    rows.length = 0
    rows.push(['员工', payload.employeeName || '-'])
    rows.push(['将清零调休', `${payload.remainingHours || 0} 小时`])
    rows.push(['清零日期', `${payload.expiresAt || '-'}（当日 24:00 生效）`])
    rows.push(['规则', '当季入账的调休（含行政手动设定）需在下一季度末前用完，逾期自动清零'])
  }
  if (eventType === 'annual_carryover_reminder') {
    rows.length = 0
    rows.push(['员工', payload.employeeName || '-'])
    rows.push(['当前特休余额', `${payload.balanceDays || 0} 天`])
    rows.push(['折算规则', `12-31 晚按 ${Math.round(Number(payload.carryoverRate || 0) * 100)}% 折算，向下取整至 0.5 天`])
    rows.push(['预计结转次年', `${payload.resultDays || 0} 天`])
    rows.push(['提醒', '未休完部分按上述比例折算，请尽早在年内安排休假'])
  }
  const detailUrl = adminLink(settings.notification?.serviceOrderAdminBaseUrl, '/attendance')
  const linkBlock = detailUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(detailUrl)}" style="${MAIL_BUTTON_STYLE}">打开 OMS 假勤管理</a></p>`
    : '<p style="color:#64748b">请登录 OMS 管理端查看假勤详情。</p>'
  const introByType = {
    approval_pending: '当前请假申请已进入你的审批步骤，请登录 OMS 处理。',
    delegate_info: '你被指定为本次请假期间的工作代理人，请提前做好工作交接；此邮件不需要你在系统中确认。',
    rejected: '本次请假申请未通过审批，请查看驳回原因并按需重新提交。',
    completed: '本次请假申请已完成审批，以下为最终结果和结算后的余额信息。',
    duty_pending_admin: '本月值班津贴（7×24 值班 + 法定节假日值班）已自动提交，请在假勤页「审批」中完成终审。',
    comp_expiry_reminder: '您有即将到期的调休余额，请在清零日期前安排调休。',
    annual_carryover_reminder: '年底将至，您的特休余额将于 12 月 31 日晚按规则折算结转次年，请合理安排休假。',
  }
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">${htmlEscape(heading)}</h2>
      <p>${htmlEscape(introByType[eventType] || '请查看本次请假流程通知。')}</p>
      ${linkBlock}
      <table style="border-collapse:collapse;width:100%;max-width:680px">
        ${rows.map(([label, value]) => `<tr><td style="padding:6px 0;color:#64748b;width:96px;vertical-align:top">${htmlEscape(label)}</td><td style="padding:6px 0">${htmlEscape(value)}</td></tr>`).join('')}
      </table>
      ${mailFooter()}
    </div>
  `

  const transporter = mailTransporter(mail)
  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to }
}

function mrMoney(value) {
  if (value === null || value === undefined || value === '') return '-'
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
}

function mrOptionText(value) {
  if (Array.isArray(value)) return value.join('、') || '-'
  if (!value) return '-'
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.join('、') || '-' : String(value)
  } catch (_error) {
    return String(value)
  }
}

async function sendMrApprovalMail(order, recipient, event = 'task', extras = {}) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }
  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }
  const to = recipientEmails([recipient])
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }
  const items = Array.isArray(order.items) ? order.items : []
  const salesValues = items.map((item) => item.subtotal)
  const sales = salesValues.every((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    ? salesValues.reduce((sum, value) => sum + Number(value), 0)
    : null
  const costValues = items.map((item) => {
    const rawAmount = item.costInclTax ?? item.cost_incl_tax
    const rawRate = item.taxRate ?? item.tax_rate
    if (rawAmount === null || rawAmount === undefined || rawRate === null || rawRate === undefined) return null
    const amount = Number(rawAmount)
    const rate = Number(rawRate)
    return Number.isFinite(amount) && Number.isFinite(rate) ? amount / (1 + rate / 100) : null
  })
  const cost = costValues.every((value) => value !== null) ? costValues.reduce((sum, value) => sum + value, 0) : null
  const grossProfit = sales !== null && cost !== null ? sales - cost : null
  const margin = sales > 0 && grossProfit !== null ? grossProfit / sales * 100 : null

  // 事件标签与主题标签
  const eventLabels = {
    task: '待你签核',
    transfer: '签核待办已转交给你',
    owner_transfer: 'MR 业务负责人已变更，请重新核对',
    reject: 'MR 已驳回并退回修改',
    approved: 'MR 已全部签核通过',
    purchase_task: 'MR 已签核通过，待你填写公司料号/采购单号',
    purchase_transfer: '采购填写（料号/采购单号）待办已转交给你',
    contract_no_task: 'MR 已签核通过，待你补填合同编号（补填后流转采购）',
    contract_no_transfer: '合同编号补填待办已转交给你',
    contract_no_filled: '合同编号已补填，MR 已流转采购',
    purchase_assignment_error: 'MR 采购人配置异常，采购环节已暂停',
    purchase_done: '采购信息（料号/采购单号）已填写',
    withdraw: '业务负责人已撤回 MR',
    remind_manual: 'MR 签核待办催办提醒',
    remind_auto: 'MR 签核停留超 24 小时，请尽快处理',
    void: 'MR 已作废',
    void_request_supervisor: 'MR 作废申请待你审批',
    void_request_purchaser: 'MR 进入作废审批，请暂停采购动作',
    void_request_admin: 'MR 作废申请待你审批（行政复核）',
    void_request_supervisor2: 'MR 作废申请待你审批（业务复核）',
    void_rejected: 'MR 作废申请已被驳回',
    assignment_error: 'MR 签核人配置异常，签核流程已暂停',
  }
  // 主题行标签：让用户一眼知道这封邮件要干嘛
  const subjectTags = {
    task: '待签核',
    transfer: '转交',
    owner_transfer: '负责人变更',
    reject: '已驳回',
    approved: '已通过',
    purchase_task: '待采购',
    purchase_transfer: '采购转交',
    contract_no_task: '待补编号',
    contract_no_transfer: '补编号转交',
    contract_no_filled: '编号已补',
    purchase_assignment_error: '采购异常',
    purchase_done: '采购完成',
    withdraw: '已撤回',
    remind_manual: '催办',
    remind_auto: '催办',
    void: '已作废',
    void_request_supervisor: '作废审批',
    void_request_purchaser: '作废审批',
    void_request_admin: '作废审批',
    void_request_supervisor2: '作废审批',
    void_rejected: '作废被拒',
    assignment_error: '签核异常',
  }
  // 按钮文案按事件类型区分
  const buttonLabels = {
    task: '去签核',
    transfer: '去签核',
    remind_manual: '去签核',
    remind_auto: '去签核',
    reject: '查看驳回详情',
    approved: '查看 MR 详情',
    purchase_task: '去填写采购信息',
    purchase_transfer: '去填写采购信息',
    contract_no_task: '去补填合同编号',
    contract_no_transfer: '去补填合同编号',
    contract_no_filled: '查看 MR 详情',
    purchase_assignment_error: '查看详情',
    purchase_done: '查看 MR 详情',
    withdraw: '查看详情',
    void: '查看详情',
    void_request_supervisor: '去审批作废申请',
    void_request_purchaser: '查看详情',
    void_request_admin: '去审批作废申请',
    void_request_supervisor2: '去审批作废申请',
    void_rejected: '查看详情',
    assignment_error: '去配置签核人',
  }
  // 通知类事件（不需要完整品项明细，摘要即可）
  const NOTIFY_ONLY_EVENTS = new Set([
    'approved', 'withdraw', 'void', 'void_request_supervisor', 'void_request_purchaser',
    'void_request_admin', 'void_request_supervisor2', 'void_rejected',
    'contract_no_filled', 'purchase_done', 'purchase_assignment_error', 'assignment_error',
  ])
  const isNotifyOnly = NOTIFY_ONLY_EVENTS.has(event)

  const action = eventLabels[event] || 'MR 状态已更新'
  const subjectTag = subjectTags[event] || '通知'
  const buttonLabel = buttonLabels[event] || '查看 MR 详情'
  // spec 019：有合同的 task 邮件主题加用印标记
  const subjectTagFinal = extras.contractSeal ? `${subjectTag}·需用印` : subjectTag

  // 驳回原因独立显示（不与作废混用）
  const rejectNote = event === 'reject' ? (order.rejectReason || order.reject_reason || '-') : null
  // 作废相关邮件带出原因
  const voidNote = event === 'void_rejected'
    ? `驳回原因：${order.void_reject_reason || '-'}`
    : (event === 'void' || String(event).startsWith('void_request') ? `作废原因：${order.void_reason || '-'}` : null)
  // spec 019：用印流程提示——合并进 task 邮件（extras.contractSeal）或兼容旧 contract_seal 事件
  const contractSealNote = (extras.contractSeal || event === 'contract_seal')
    ? '该 MR 有合同：附件为销售上传的未盖章合约，请走合约用印流程；完成后打开 MR 单，在「合同与罚则」栏位上传盖章合约并填写合同编号，方可继续签核。'
    : null

  const currentStepKey = order.currentStepKey || order.current_step_key
  const rawCurrentStepLabel = order.currentStepLabel || order.current_step_label
  const currentStepLabel = currentStepKey === 'sales' ? '业务负责人' : currentStepKey === 'engineering' ? '工程会签' : rawCurrentStepLabel || '-'
  const detailBaseUrl = settings.notification?.serviceOrderAdminBaseUrl || env.corsAllowedOrigins?.[0] || ''
  const detailUrl = adminLink(detailBaseUrl, `/mr/${encodeURIComponent(order.id)}`)
  if (!detailUrl) return { skipped: true, reason: 'admin_base_url_missing' }

  // 品项明细行
  const rows = items.map((item, index) => {
    const rawCostIncludingTax = item.costInclTax ?? item.cost_incl_tax
    const rawTaxRate = item.taxRate ?? item.tax_rate
    const costIncludingTax = rawCostIncludingTax === null || rawCostIncludingTax === undefined || rawTaxRate === null || rawTaxRate === undefined ? null : Number(rawCostIncludingTax)
    const taxRate = rawTaxRate === null || rawTaxRate === undefined ? null : Number(rawTaxRate)
    const costExcludingTax = Number.isFinite(costIncludingTax) && Number.isFinite(taxRate) ? costIncludingTax / (1 + taxRate / 100) : null
    return `
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">${index + 1}</td>
      <td style="border:1px solid #cbd5e1;padding:6px"><strong>${htmlEscape(item.name || '-')}</strong><br>${htmlEscape(item.description || '-')}<br><small>保固与服务：${htmlEscape(item.warrantyService || item.warranty_service || '-')}；装机方：${htmlEscape(item.installBy || item.install_by || '-')}</small></td>
      <td style="border:1px solid #cbd5e1;padding:6px">${htmlEscape(item.companyPartNo || item.company_part_no || '-')}<br><small>${htmlEscape(item.oemSpec || item.oem_spec || '-')}</small></td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:right">${htmlEscape(item.qty ?? '-')}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:right">¥ ${mrMoney(item.unitPrice ?? item.unit_price)}<br><strong>¥ ${mrMoney(item.subtotal)}</strong></td>
      <td style="border:1px solid #cbd5e1;padding:6px">${htmlEscape(item.vendor || '-')}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:right">含税 ¥ ${mrMoney(costIncludingTax)}<br>不含税 ¥ ${mrMoney(costExcludingTax)}<br><small>采购税率 ${htmlEscape(item.taxRate ?? item.tax_rate ?? '-')}%</small></td>
      <td style="border:1px solid #cbd5e1;padding:6px">${htmlEscape(item.purchaseOrderNo || item.purchase_order_no || '-')}<br><small>${htmlEscape(item.costSource || item.cost_source || '-')}</small></td>
    </tr>`
  }).join('')

  // 附件列表：标记合约件
  const quotationFiles = Array.isArray(order.quotationFiles) ? order.quotationFiles : []
  const fileRoleBadge = (file) => {
    if (file.quoteRole === 'contract') return '<span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:11px;padding:1px 6px;border-radius:3px;margin-left:6px">未盖章合约</span>'
    if (file.quoteRole === 'contract_signed') return '<span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:11px;padding:1px 6px;border-radius:3px;margin-left:6px">盖章合约</span>'
    return ''
  }
  const quotationList = quotationFiles.length
    ? `<ul style="margin:6px 0 14px;padding-left:20px">${quotationFiles.map((file) => `<li>${htmlEscape(file.name || '-')}（${mrMoney(Number(file.size || 0) / 1024)} KB）${fileRoleBadge(file)}</li>`).join('')}</ul>`
    : '<p style="color:#64748b">无附件</p>'

  const subject = `[MR] 【${subjectTagFinal}】${order.customerName || order.customer_name || '未选客户'} - ${order.ctrlNo || `#${order.id}`}`
  const linkBlock = detailUrl
    ? `<p style="margin:18px 0"><a href="${htmlEscape(detailUrl)}" style="${MAIL_BUTTON_STYLE}">${htmlEscape(buttonLabel)}</a></p>`
    : '<p style="color:#64748b">请登录 OMS 管理端，在待办中心打开该 MR。</p>'

  // 合约用印说明：醒目提示块（放按钮旁边）
  const contractSealBlock = contractSealNote
    ? `<div style="margin:14px 0;padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af;line-height:1.6">${htmlEscape(contractSealNote)}</div>`
    : ''

  // 品项明细：通知类邮件省略，操作类邮件完整显示
  const itemsSection = isNotifyOnly ? '' : `
      <h3 style="margin:18px 0 6px;color:${MAIL_ACTION_COLOR};font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">品项明细</h3>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%;min-width:860px;font-size:13px">
          <thead><tr style="background:${MAIL_ACTION_COLOR};color:#fff">
            <th style="padding:7px">#</th><th style="padding:7px">品名及描述 / 履约信息</th><th style="padding:7px">公司料号 / 原厂规格</th>
            <th style="padding:7px">数量</th><th style="padding:7px">未税单价 / 未税小计</th><th style="padding:7px">供应商</th>
            <th style="padding:7px">采购价 / 采购税率</th><th style="padding:7px">采购单号 / 采购价来源</th>
          </tr></thead><tbody>${rows || '<tr><td colspan="8" style="padding:12px;text-align:center">暂无品项</td></tr>'}</tbody>
        </table>
      </div>`

  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.6;color:#1f2937;max-width:720px;margin:0 auto">
      <!-- 头部 -->
      <div style="border-bottom:3px solid ${MAIL_ACTION_COLOR};padding-bottom:12px;margin-bottom:16px">
        <h2 style="margin:0;color:${MAIL_ACTION_COLOR};font-size:20px">${htmlEscape(action)}</h2>
      </div>

      <!-- 问候语 -->
      <p style="margin:0 0 4px">${htmlEscape(recipient.realName || recipient.real_name || recipient.username || '')}，你好。</p>
      <p style="margin:0 0 14px;color:#64748b;font-size:13px">${isNotifyOnly ? '以下为 MR 状态变更通知。' : '请核对以下 MR 内容，点击下方按钮进入系统处理。'}</p>

      ${linkBlock}
      ${contractSealBlock}

      <!-- 基本信息 -->
      <h3 style="margin:18px 0 6px;color:${MAIL_ACTION_COLOR};font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">基本信息</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <tr><td style="padding:5px 0;color:#64748b;width:90px;vertical-align:top">客户</td><td style="padding:5px 0">${htmlEscape(order.customerName || order.customer_name || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">Ctrl.NO</td><td style="padding:5px 0">${htmlEscape(order.ctrlNo || order.ctrl_no || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">业务负责人</td><td style="padding:5px 0">${htmlEscape(order.salesOwnerName || order.sales_owner_name || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">当前签核步骤</td><td style="padding:5px 0">${htmlEscape(currentStepLabel)}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">填表日期</td><td style="padding:5px 0">${htmlEscape(order.fillDate || order.fill_date || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">项目分类</td><td style="padding:5px 0">${htmlEscape(order.caseCategory || order.case_category || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">客户联系人</td><td style="padding:5px 0">${htmlEscape(order.contactName || order.contact_name || '-')}${order.customerPo || order.customer_po ? `（P/O：${htmlEscape(order.customerPo || order.customer_po)}）` : ''}</td></tr>
        ${rejectNote ? `<tr><td style="padding:5px 0;color:#b91c1c;vertical-align:top">驳回原因</td><td style="padding:5px 0;color:#b91c1c;font-weight:600">${htmlEscape(rejectNote)}</td></tr>` : ''}
        ${voidNote ? `<tr><td style="padding:5px 0;color:#b91c1c;vertical-align:top">作废说明</td><td style="padding:5px 0;color:#b91c1c;font-weight:600">${htmlEscape(voidNote)}</td></tr>` : ''}
      </table>

      <!-- 开票与交付 -->
      <h3 style="margin:18px 0 6px;color:${MAIL_ACTION_COLOR};font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">开票与交付</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <tr><td style="padding:5px 0;color:#64748b;width:90px;vertical-align:top">发票类型</td><td style="padding:5px 0">${htmlEscape(order.invoiceType || order.invoice_type || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">开票方式</td><td style="padding:5px 0">${htmlEscape(order.invoiceProcess || order.invoice_process || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">开票内容</td><td style="padding:5px 0">${htmlEscape(order.billingContent || order.billing_content || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">发票收件人</td><td style="padding:5px 0">${htmlEscape(order.invoiceRecipient || order.invoice_recipient || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">付款条件</td><td style="padding:5px 0">${htmlEscape(order.paymentTerms || order.payment_terms || '-')}${order.paymentOther || order.payment_other ? `（${htmlEscape(order.paymentOther || order.payment_other)}）` : ''}${Number(order.splitDelivery ?? order.split_delivery) ? '；允许分批交付' : ''}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">验收条件</td><td style="padding:5px 0">${htmlEscape(order.acceptance || '-')}${order.acceptanceOther || order.acceptance_other ? `（${htmlEscape(order.acceptanceOther || order.acceptance_other)}）` : ''}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">交付日期</td><td style="padding:5px 0">${htmlEscape(order.latestDeliveryDate || order.latest_delivery_date || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">交付地点</td><td style="padding:5px 0">${htmlEscape(order.deliveryLocation || order.delivery_location || '-')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">装机/维护方</td><td style="padding:5px 0">${htmlEscape(mrOptionText(order.installOptions || order.install_options))} / ${htmlEscape(mrOptionText(order.maintenanceOptions || order.maintenance_options))}</td></tr>
        ${order.contractNo || order.contract_no ? `<tr><td style="padding:5px 0;color:#64748b;vertical-align:top">合同编号</td><td style="padding:5px 0">${htmlEscape(order.contractNo || order.contract_no)}</td></tr>` : ''}
        ${order.remark ? `<tr><td style="padding:5px 0;color:#64748b;vertical-align:top">备注</td><td style="padding:5px 0">${htmlEscape(order.remark)}</td></tr>` : ''}
      </table>

      <!-- 联系人 -->
      <h3 style="margin:18px 0 6px;color:${MAIL_ACTION_COLOR};font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">联系人</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <tr><td style="padding:5px 0;color:#64748b;width:90px;vertical-align:top">采购联系人</td><td style="padding:5px 0">${htmlEscape(order.purchaser || '-')} ${htmlEscape(order.purchaserTel || order.purchaser_tel || '')}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b;vertical-align:top">收货人</td><td style="padding:5px 0">${htmlEscape(order.recipient || '-')} ${htmlEscape(order.recipientTel || order.recipient_tel || '')} ${htmlEscape(order.recipientMail || order.recipient_mail || '')}</td></tr>
      </table>

      <!-- 附件 -->
      <h3 style="margin:18px 0 6px;color:${MAIL_ACTION_COLOR};font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">附件</h3>
      ${quotationList}

      <!-- 品项明细（通知类邮件省略） -->
      ${itemsSection}

      <!-- 金额汇总 -->
      <h3 style="margin:18px 0 6px;color:${MAIL_ACTION_COLOR};font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">金额汇总</h3>
      <table style="border-collapse:collapse;width:100%;max-width:400px;font-size:13px">
        <tr><td style="padding:6px;background:#f8fafc;color:#64748b">未税总计</td><td style="padding:6px;text-align:right;font-weight:600">¥ ${mrMoney(sales)}</td></tr>
        <tr><td style="padding:6px;background:#f8fafc;color:#64748b">采购价（未税）</td><td style="padding:6px;text-align:right">¥ ${mrMoney(cost)}</td></tr>
        <tr><td style="padding:6px;background:#f8fafc;color:#64748b">毛利额</td><td style="padding:6px;text-align:right">¥ ${mrMoney(grossProfit)}</td></tr>
        <tr><td style="padding:6px;background:#f8fafc;color:#64748b">整单毛利率</td><td style="padding:6px;text-align:right;font-weight:600;color:${margin !== null && margin < 15 ? '#b91c1c' : '#1f2937'}">${margin === null ? '-' : `${margin.toFixed(2)}%`}</td></tr>
      </table>

      <p style="margin-top:20px;color:#b91c1c;font-size:12px">本邮件包含采购价和毛利等内部商业信息，请勿转发给无关人员。</p>
      ${mailFooter()}
    </div>`
  await mailTransporter(mail).sendMail({ from: mail.from, to, subject, html, attachments: extras.attachments || [] })
  return { sent: true, to }
}

async function sendHolidaySyncMail({ year, synced, count = 0, warnings = [], reason = '', recipients = [] }) {
  const settings = await effectiveSettings()
  const mail = settings.mail
  if (mail.enabled !== 'true') return { skipped: true, reason: 'mail_disabled' }

  const missing = missingMailFields(mail)
  if (missing.length) return { skipped: true, reason: 'smtp_config_incomplete', missing }

  const to = recipientEmails(recipients.map((r) => ({ email: r.email || r })))
  if (!to.length) return { skipped: true, reason: 'no_recipient_email' }

  const transporter = mailTransporter(mail)
  const subject = synced
    ? `法定节假日自动同步完成：${year} 年（${count} 天）`
    : `法定节假日自动同步失败：${year} 年需要人工介入`
  const warningList = warnings.length
    ? `<p style="color:#b45309">校验提醒：${warnings.map(htmlEscape).join('；')}</p>`
    : ''
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 12px">${synced ? '法定节假日自动同步完成' : '法定节假日自动同步失败'}</h2>
      ${synced
        ? `<p>系统已从国务院公告镜像双源自动同步 <b>${htmlEscape(String(year))} 年</b>法定节假日与调休补班安排，共 <b>${count}</b> 天，并已生效于加班折算规则。</p>
           ${warningList}
           <p>请登录管理端「假勤设置 → 法定节假日」抽查确认。</p>`
        : `<p>系统尝试自动同步 <b>${htmlEscape(String(year))} 年</b>法定节假日失败：</p>
           <p style="color:#b91c1c">${htmlEscape(reason || '未知原因')}</p>
           <p>请登录管理端「假勤设置 → 法定节假日」使用「同步官方数据」按钮手动同步，或手工录入。</p>`}
      ${mailFooter()}
    </div>
  `

  await transporter.sendMail({ from: mail.from, to, subject, html })
  return { sent: true, to }
}

module.exports = {
  sendNewDeviceLoginMail,
  sendAssignmentMail,
  sendInspectionConfirmationMail,
  sendMaintenanceExpiryMail,
  sendNoMaintenanceDevicesMail,
  sendMissingCustomerSalespersonMail,
  sendInspectionScheduleDateMissingMail,
  sendInspectionReminderMail,
  sendInspectionOverdueMail,
  sendMonthlyOperationsSummaryMail,
  sendReportSubscriptionMail,
  sendSalesServiceOrderMail,
  sendInstallSupervisorMail,
  sendCustomerSignatureRequestMail,
  sendAttendanceNotificationMail,
  sendMrApprovalMail,
  sendHolidaySyncMail,
}
