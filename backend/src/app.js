const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const env = require('./config/env')
const { pool } = require('./config/db')
const { authenticate, requireEngineerOnboardingComplete } = require('./middleware/auth')
const { auditLogger } = require('./middleware/audit')
const { errorHandler, notFoundHandler } = require('./middleware/error-handler')
const { simplifyInput } = require('./middleware/simplify-input')

const authRoutes = require('./modules/auth/routes')
const auditLogRoutes = require('./modules/audit-logs/routes')
const customerRoutes = require('./modules/customers/routes')
const deviceRoutes = require('./modules/devices/routes')
const deviceModelRoutes = require('./modules/device-models/routes')
const deviceModelCatalogRoutes = require('./modules/device-model-catalog/routes')
const maintenancePartyRoutes = require('./modules/maintenance-parties/routes')
const fileRoutes = require('./modules/files/routes')
const geoRoutes = require('./modules/geo/routes')
const inspectionScheduleRoutes = require('./modules/inspection-schedules/routes')
const { initializeDeviceModelCatalog } = require('./modules/device-model-catalog')
const serviceOrderRoutes = require('./modules/service-orders/routes')
const userRoutes = require('./modules/users/routes')

const allowedOrigins = new Set([
  'https://eng.starkgrp.com',
  'https://admin.starkgrp.com',
  'https://eng.tinypanel.de',
  'https://admin.tinypanel.de',
  'https://eng-aliyun.tinypanel.de',
  'https://admin-aliyun.tinypanel.de',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.5.60:5173',
])

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }
    callback(null, false)
  },
}

const app = express()
const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)

app.disable('x-powered-by')
app.use(helmet())
app.use(cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(simplifyInput)
app.use('/api/v1/avatars', express.static(path.join(uploadRoot, 'avatars')))

app.get('/api/v1/health', async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ ok: true })
})

pool
  .query('SELECT 1')
  .then(() => initializeDeviceModelCatalog())
  .catch((error) => {
    console.error('[device-model-catalog] Initialization failed', error)
  })

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/users', authenticate, auditLogger, userRoutes)
app.use('/api/v1/customers', authenticate, requireEngineerOnboardingComplete, auditLogger, customerRoutes)
app.use('/api/v1/devices', authenticate, requireEngineerOnboardingComplete, auditLogger, deviceRoutes)
app.use('/api/v1/device-models', authenticate, requireEngineerOnboardingComplete, deviceModelRoutes)
app.use('/api/v1/device-model-catalog', authenticate, requireEngineerOnboardingComplete, deviceModelCatalogRoutes)
app.use('/api/v1/maintenance-parties', authenticate, requireEngineerOnboardingComplete, auditLogger, maintenancePartyRoutes)
app.use('/api/v1/geo', authenticate, requireEngineerOnboardingComplete, auditLogger, geoRoutes)
app.use('/api/v1/inspection-schedules', authenticate, requireEngineerOnboardingComplete, auditLogger, inspectionScheduleRoutes)
app.use('/api/v1/service-orders', authenticate, requireEngineerOnboardingComplete, auditLogger, serviceOrderRoutes)
app.use('/api/v1/files', authenticate, requireEngineerOnboardingComplete, auditLogger, fileRoutes)
app.use('/api/v1/audit-logs', authenticate, requireEngineerOnboardingComplete, auditLogger, auditLogRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
