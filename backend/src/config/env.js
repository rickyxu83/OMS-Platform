const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '../..')
const localEnvPath = path.resolve(rootDir, '.env')

if (fs.existsSync(localEnvPath)) {
  const lines = fs.readFileSync(localEnvPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

const jwtPlaceholderSecret = 'change-this-secret-in-production'
const nodeEnv = process.env.NODE_ENV || 'development'
const jwtSecret = process.env.JWT_SECRET || jwtPlaceholderSecret

// 只有显式声明 NODE_ENV=development/test 才允许占位密钥；
// 生产环境忘设 NODE_ENV 时不再静默回退到公开默认值（可被用于伪造 token）
const isExplicitDevEnv = ['development', 'test'].includes(process.env.NODE_ENV || '')
if (!isExplicitDevEnv && (!process.env.JWT_SECRET || jwtSecret === jwtPlaceholderSecret)) {
  throw new Error(
    'JWT_SECRET must be set to a non-placeholder value (or set NODE_ENV=development explicitly for local development)',
  )
}

const aiProvider = process.env.AI_PROVIDER || 'anthropic'
function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const env = {
  rootDir,
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  jwtSecret,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'oms_platform_token',
  sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN || '',
  corsAllowedOrigins: parseCsv(process.env.CORS_ALLOWED_ORIGINS),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  amapKey: process.env.AMAP_KEY || '',
  ai: {
    workSummaryEnabled: process.env.AI_WORK_SUMMARY_ENABLED === 'true',
    serviceDraftEnabled: process.env.AI_SERVICE_DRAFT_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'custom',
    apiUrl: process.env.AI_API_URL || '',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    maxInputItems: Number(process.env.AI_MAX_INPUT_ITEMS || 200),
    maxWorkContentChars: Number(process.env.AI_MAX_WORK_CONTENT_CHARS || 600),
    summaryTimeoutMs: Number(process.env.AI_SUMMARY_TIMEOUT_MS || 120000),
    summaryRetryAttempts: Number(process.env.AI_SUMMARY_RETRY_ATTEMPTS || 5),
    summaryRetryDelayMs: Number(process.env.AI_SUMMARY_RETRY_DELAY_MS || 3000),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'oms_platform',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
}

module.exports = env
