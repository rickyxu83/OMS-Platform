const env = require('../../config/env')
const { badRequest } = require('../../utils/http-error')
const { getSettings, setSettings } = require('./store')

const HIDDEN_SECRET = '********'

const settingKeys = [
  'ai.workSummaryEnabled',
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

async function update(req, res) {
  const body = req.body || {}
  const current = await effectiveSettings()
  const next = {}

  if (body.ai) {
    next['ai.workSummaryEnabled'] = boolText(body.ai.workSummaryEnabled)
    next['ai.provider'] = String(body.ai.provider || 'custom').trim()
    next['ai.apiUrl'] = String(body.ai.apiUrl || '').trim()
    next['ai.model'] = String(body.ai.model || '').trim()
    const apiKey = String(body.ai.apiKey || '').trim()
    next['ai.apiKey'] = apiKey && apiKey !== HIDDEN_SECRET ? apiKey : current.ai.apiKey
  }

  if (body.mail) {
    next['mail.enabled'] = boolText(body.mail.enabled)
    next['mail.host'] = String(body.mail.host || '').trim()
    next['mail.port'] = normalizePort(body.mail.port || current.mail.port || 465)
    next['mail.secure'] = boolText(body.mail.secure)
    next['mail.from'] = String(body.mail.from || '').trim()
    next['mail.user'] = String(body.mail.user || '').trim()
    next['mail.assignNotifyEnabled'] = boolText(body.mail.assignNotifyEnabled)
    const password = String(body.mail.password || '').trim()
    next['mail.password'] = password && password !== HIDDEN_SECRET ? password : current.mail.password
  }

  await setSettings(next, req.user.id)
  res.status(204).end()
}

module.exports = {
  HIDDEN_SECRET,
  effectiveSettings,
  list: publicSettings,
  update,
}
