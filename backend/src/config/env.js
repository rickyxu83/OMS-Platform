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

if (nodeEnv === 'production' && (!process.env.JWT_SECRET || jwtSecret === jwtPlaceholderSecret)) {
  throw new Error('JWT_SECRET must be set to a non-placeholder value in production')
}

const env = {
  rootDir,
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  jwtSecret,
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  amapKey: process.env.AMAP_KEY || '',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'service_sheet',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
}

module.exports = env
