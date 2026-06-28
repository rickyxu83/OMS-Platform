const env = require('../../config/env')
const nodemailer = require('nodemailer')
const { badRequest } = require('../../utils/http-error')
const { getSettings, setSettings } = require('./store')

const HIDDEN_SECRET = '********'

const settingKeys = [
  'ai.workSummaryEnabled',
  'ai.serviceDraftEnabled',
  'ai.provider',
  'ai.apiUrl',
  'ai.apiKey',
  'ai.model',
  'mail.enabled',
  'mail.host',
  'mail.port',
  'mail.secure',
  'mail.from',
  'mail.user',
  'mail.password',
  'mail.assignNotifyEnabled',
  'map.amapRestKey',
  'map.amapJsapiKey',
  'map.amapSecurityJsCode',
  'notification.maintenanceExpiryEnabled',
  'notification.maintenanceExpiryDays',
  'notification.maintenanceExpiryRecipients',
  'notification.maintenanceExpiryCron',
  'notification.noMaintenanceReminderEnabled',
  'notification.missingCustomerSalespersonEnabled',
  'notification.missingCustomerSalespersonRecipients',
  'notification.inspectionReminderEnabled',
  'notification.inspectionReminderDays',
  'notification.inspectionReminderRecipients',
  'notification.inspectionReminderCron',
  'notification.inspectionConfirmationEnabled',
  'notification.inspectionConfirmationRecipients',
  'notification.inspectionOverdueEnabled',
  'notification.inspectionOverdueDays',
  'notification.inspectionOverdueRecipients',
  'notification.monthlyOperationsSummaryEnabled',
  'notification.monthlyOperationsSummaryRecipients',
  'notification.serviceOrderSalesNotifyEnabled',
  'notification.serviceOrderSalesDelayMinutes',
  'notification.serviceOrderAdminBaseUrl',
]

function boolText(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback ? 'true' : 'false'
  return String(value) === 'true' || value === true ? 'true' : 'false'
}

function masked(value) {
  return value ? HIDDEN_SECRET : ''
}

async function effectiveSettings() {
  const saved = await getSettings(settingKeys)
  return {
    ai: {
      workSummaryEnabled: boolText(saved['ai.workSummaryEnabled'], env.ai.workSummaryEnabled),
      serviceDraftEnabled: boolText(saved['ai.serviceDraftEnabled'], env.ai.serviceDraftEnabled),
      provider: saved['ai.provider'] ?? env.ai.provider,
      apiUrl: saved['ai.apiUrl'] ?? env.ai.apiUrl,
      apiKey: saved['ai.apiKey'] ?? env.ai.apiKey,
      model: saved['ai.model'] ?? env.ai.model,
    },
    mail: {
      enabled: boolText(saved['mail.enabled'], false),
      host: saved['mail.host'] ?? '',
      port: saved['mail.port'] ?? '465',
      secure: boolText(saved['mail.secure'], true),
      from: saved['mail.from'] ?? '',
      user: saved['mail.user'] ?? '',
      password: saved['mail.password'] ?? '',
      assignNotifyEnabled: boolText(saved['mail.assignNotifyEnabled'], false),
    },
    map: {
      amapRestKey: saved['map.amapRestKey'] ?? env.amapKey,
      amapJsapiKey: saved['map.amapJsapiKey'] ?? '',
      amapSecurityJsCode: saved['map.amapSecurityJsCode'] ?? '',
    },
    notification: {
      maintenanceExpiryEnabled: boolText(saved['notification.maintenanceExpiryEnabled'], true),
      maintenanceExpiryDays: saved['notification.maintenanceExpiryDays'] || '30',
      maintenanceExpiryRecipients: saved['notification.maintenanceExpiryRecipients'] || '',
      maintenanceExpiryCron: saved['notification.maintenanceExpiryCron'] || '0 8 * * *',
      noMaintenanceReminderEnabled: boolText(saved['notification.noMaintenanceReminderEnabled'], true),
      missingCustomerSalespersonEnabled: boolText(saved['notification.missingCustomerSalespersonEnabled'], true),
      missingCustomerSalespersonRecipients: saved['notification.missingCustomerSalespersonRecipients'] || '',
      inspectionReminderEnabled: boolText(saved['notification.inspectionReminderEnabled'], true),
      inspectionReminderDays: saved['notification.inspectionReminderDays'] || '3',
      inspectionReminderRecipients: saved['notification.inspectionReminderRecipients'] || '',
      inspectionReminderCron: saved['notification.inspectionReminderCron'] || '0 7 * * *',
      inspectionConfirmationEnabled: boolText(saved['notification.inspectionConfirmationEnabled'], true),
      inspectionConfirmationRecipients: saved['notification.inspectionConfirmationRecipients'] || '',
      inspectionOverdueEnabled: boolText(saved['notification.inspectionOverdueEnabled'], true),
      inspectionOverdueDays: saved['notification.inspectionOverdueDays'] || '1',
      inspectionOverdueRecipients: saved['notification.inspectionOverdueRecipients'] || '',
      monthlyOperationsSummaryEnabled: boolText(saved['notification.monthlyOperationsSummaryEnabled'], true),
      monthlyOperationsSummaryRecipients: saved['notification.monthlyOperationsSummaryRecipients'] || '',
      serviceOrderSalesNotifyEnabled: boolText(saved['notification.serviceOrderSalesNotifyEnabled'], false),
      serviceOrderSalesDelayMinutes: saved['notification.serviceOrderSalesDelayMinutes'] || '60',
      serviceOrderAdminBaseUrl: saved['notification.serviceOrderAdminBaseUrl'] || '',
    },
  }
}

async function publicSettings(_req, res) {
  const settings = await effectiveSettings()
  res.json({
    item: {
      ai: {
        ...settings.ai,
        apiKey: masked(settings.ai.apiKey),
        hasApiKey: Boolean(settings.ai.apiKey),
      },
      mail: {
        ...settings.mail,
        password: masked(settings.mail.password),
        hasPassword: Boolean(settings.mail.password),
      },
      map: {
        ...settings.map,
        amapRestKey: masked(settings.map.amapRestKey),
        hasAmapRestKey: Boolean(settings.map.amapRestKey),
        amapJsapiKey: masked(settings.map.amapJsapiKey),
        hasAmapJsapiKey: Boolean(settings.map.amapJsapiKey),
        amapSecurityJsCode: masked(settings.map.amapSecurityJsCode),
        hasAmapSecurityJsCode: Boolean(settings.map.amapSecurityJsCode),
      },
      notification: settings.notification,
    },
  })
}

async function publicMapSettings(_req, res) {
  const settings = await effectiveSettings()
  res.json({
    item: {
      amapJsapiKey: settings.map.amapJsapiKey,
      amapSecurityJsCode: settings.map.amapSecurityJsCode,
      configured: Boolean(settings.map.amapJsapiKey && settings.map.amapSecurityJsCode),
    },
  })
}

function normalizePort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw badRequest('SMTP 端口不正确')
  }
  return String(port)
}

function normalizeAiSettings(bodyAi = {}, currentAi) {
  const apiKey = String(bodyAi.apiKey || '').trim()
  return {
    workSummaryEnabled: boolText(bodyAi.workSummaryEnabled, currentAi.workSummaryEnabled === 'true'),
    serviceDraftEnabled: boolText(bodyAi.serviceDraftEnabled, currentAi.serviceDraftEnabled === 'true'),
    provider: String(bodyAi.provider || currentAi.provider || 'custom').trim(),
    apiUrl: String(bodyAi.apiUrl || currentAi.apiUrl || '').trim(),
    model: String(bodyAi.model || currentAi.model || '').trim(),
    apiKey: apiKey && apiKey !== HIDDEN_SECRET ? apiKey : currentAi.apiKey,
  }
}

function normalizeMailSettings(bodyMail = {}, currentMail) {
  const password = String(bodyMail.password || '').trim()
  return {
    enabled: boolText(bodyMail.enabled, currentMail.enabled === 'true'),
    host: String(bodyMail.host || currentMail.host || '').trim(),
    port: normalizePort(bodyMail.port || currentMail.port || 465),
    secure: boolText(bodyMail.secure, currentMail.secure === 'true'),
    from: String(bodyMail.from || currentMail.from || '').trim(),
    user: String(bodyMail.user || currentMail.user || '').trim(),
    password: password && password !== HIDDEN_SECRET ? password : currentMail.password,
    assignNotifyEnabled: boolText(bodyMail.assignNotifyEnabled, currentMail.assignNotifyEnabled === 'true'),
  }
}

function normalizeMapSettings(bodyMap = {}, currentMap) {
  const amapRestKey = String(bodyMap.amapRestKey || '').trim()
  const amapJsapiKey = String(bodyMap.amapJsapiKey || '').trim()
  const amapSecurityJsCode = String(bodyMap.amapSecurityJsCode || '').trim()
  return {
    amapRestKey: amapRestKey && amapRestKey !== HIDDEN_SECRET ? amapRestKey : currentMap.amapRestKey,
    amapJsapiKey: amapJsapiKey && amapJsapiKey !== HIDDEN_SECRET ? amapJsapiKey : currentMap.amapJsapiKey,
    amapSecurityJsCode: amapSecurityJsCode && amapSecurityJsCode !== HIDDEN_SECRET ? amapSecurityJsCode : currentMap.amapSecurityJsCode,
  }
}

function extractEmail(value) {
  const text = String(value || '').trim()
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0] : text
}

async function update(req, res) {
  const body = req.body || {}
  const current = await effectiveSettings()
  const next = {}

  if (body.ai) {
    const ai = normalizeAiSettings(body.ai, current.ai)
    next['ai.workSummaryEnabled'] = ai.workSummaryEnabled
    next['ai.serviceDraftEnabled'] = ai.serviceDraftEnabled
    next['ai.provider'] = ai.provider
    next['ai.apiUrl'] = ai.apiUrl
    next['ai.model'] = ai.model
    next['ai.apiKey'] = ai.apiKey
  }

  if (body.mail) {
    const mail = normalizeMailSettings(body.mail, current.mail)
    next['mail.enabled'] = mail.enabled
    next['mail.host'] = mail.host
    next['mail.port'] = mail.port
    next['mail.secure'] = mail.secure
    next['mail.from'] = mail.from
    next['mail.user'] = mail.user
    next['mail.assignNotifyEnabled'] = mail.assignNotifyEnabled
    next['mail.password'] = mail.password
  }

  if (body.map) {
    const map = normalizeMapSettings(body.map, current.map)
    next['map.amapRestKey'] = map.amapRestKey
    next['map.amapJsapiKey'] = map.amapJsapiKey
    next['map.amapSecurityJsCode'] = map.amapSecurityJsCode
  }

  if (body.notification) {
    const n = body.notification
    next['notification.maintenanceExpiryEnabled'] = String(n.maintenanceExpiryEnabled === true || n.maintenanceExpiryEnabled === 'true')
    next['notification.maintenanceExpiryDays'] = String(Math.max(1, Math.min(365, Number(n.maintenanceExpiryDays || 30))))
    next['notification.maintenanceExpiryRecipients'] = String(n.maintenanceExpiryRecipients || '').trim()
    next['notification.maintenanceExpiryCron'] = String(n.maintenanceExpiryCron || '0 8 * * *').trim()
    next['notification.noMaintenanceReminderEnabled'] = String(n.noMaintenanceReminderEnabled === true || n.noMaintenanceReminderEnabled === 'true')
    next['notification.missingCustomerSalespersonEnabled'] = String(n.missingCustomerSalespersonEnabled === true || n.missingCustomerSalespersonEnabled === 'true')
    next['notification.missingCustomerSalespersonRecipients'] = String(n.missingCustomerSalespersonRecipients || '').trim()
    next['notification.inspectionReminderEnabled'] = String(n.inspectionReminderEnabled === true || n.inspectionReminderEnabled === 'true')
    next['notification.inspectionReminderDays'] = String(Math.max(1, Math.min(365, Number(n.inspectionReminderDays || 3))))
    next['notification.inspectionReminderRecipients'] = String(n.inspectionReminderRecipients || '').trim()
    next['notification.inspectionReminderCron'] = String(n.inspectionReminderCron || '0 7 * * *').trim()
    next['notification.inspectionConfirmationEnabled'] = String(n.inspectionConfirmationEnabled === true || n.inspectionConfirmationEnabled === 'true')
    next['notification.inspectionConfirmationRecipients'] = String(n.inspectionConfirmationRecipients || '').trim()
    next['notification.inspectionOverdueEnabled'] = String(n.inspectionOverdueEnabled === true || n.inspectionOverdueEnabled === 'true')
    next['notification.inspectionOverdueDays'] = String(Math.max(1, Math.min(365, Number(n.inspectionOverdueDays || 1))))
    next['notification.inspectionOverdueRecipients'] = String(n.inspectionOverdueRecipients || '').trim()
    next['notification.monthlyOperationsSummaryEnabled'] = String(n.monthlyOperationsSummaryEnabled === true || n.monthlyOperationsSummaryEnabled === 'true')
    next['notification.monthlyOperationsSummaryRecipients'] = String(n.monthlyOperationsSummaryRecipients || '').trim()
    next['notification.serviceOrderSalesNotifyEnabled'] = String(n.serviceOrderSalesNotifyEnabled === true || n.serviceOrderSalesNotifyEnabled === 'true')
    next['notification.serviceOrderSalesDelayMinutes'] = String(Math.max(5, Math.min(1440, Number(n.serviceOrderSalesDelayMinutes || 60))))
    next['notification.serviceOrderAdminBaseUrl'] = String(n.serviceOrderAdminBaseUrl || '').trim().replace(/\/+$/, '')
  }

  await setSettings(next, req.user.id)
  res.status(204).end()
}

async function testAi(req, res) {
  const current = await effectiveSettings()
  const ai = normalizeAiSettings(req.body?.ai || {}, current.ai)
  if (!ai.apiUrl || !ai.apiKey || !ai.model) {
    throw badRequest('请先填写 AI API 地址、Token 和模型')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(env.ai.summaryTimeoutMs || 30000)))
  try {
    const response = await fetch(ai.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: '你是 OMS Platform 的连通性测试助手。' },
          { role: 'user', content: '请只回复“测试成功”。' },
        ],
        stream: false,
        max_tokens: 32,
      }),
    })

    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch {}
    if (!response.ok) {
      const message = data?.error?.message || data?.message || `AI 服务返回 HTTP ${response.status}`
      throw badRequest(message)
    }

    res.json({
      ok: true,
      message: 'AI 连接测试成功',
      item: {
        provider: ai.provider,
        model: ai.model,
        usage: data?.usage || null,
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw badRequest('AI 连接测试超时')
    }
    if (error.status) throw error
    throw badRequest(`AI 连接测试失败：${error.message || '无法连接 AI 服务'}`)
  } finally {
    clearTimeout(timeout)
  }
}

async function testMail(req, res) {
  const current = await effectiveSettings()
  const mail = normalizeMailSettings(req.body?.mail || {}, current.mail)
  if (!mail.host || !mail.port || !mail.from || !mail.user || !mail.password) {
    throw badRequest('请先填写 SMTP 主机、端口、发件人、账号和密码')
  }

  const to = extractEmail(req.body?.to || mail.user || mail.from)
  if (!to) {
    throw badRequest('请填写测试收件人邮箱')
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

  try {
    await transporter.sendMail({
      from: mail.from,
      to,
      subject: 'OMS Platform SMTP 测试',
      text: `这是一封 OMS Platform SMTP 连通性测试邮件。\n发送时间：${new Date().toISOString()}`,
    })
  } catch (error) {
    throw badRequest(`SMTP 测试失败：${error.message || '邮件发送失败'}`)
  }

  res.json({
    ok: true,
    message: `SMTP 测试邮件已发送至 ${to}`,
  })
}

module.exports = {
  HIDDEN_SECRET,
  effectiveSettings,
  list: publicSettings,
  publicMapSettings,
  update,
  testAi,
  testMail,
}
