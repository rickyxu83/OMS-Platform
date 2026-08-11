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
const announcementRoutes = require('./modules/announcements/routes')
const auditLogRoutes = require('./modules/audit-logs/routes')
const approvalTaskRoutes = require('./modules/approval-tasks/routes')
const customerRoutes = require('./modules/customers/routes')
const deviceRoutes = require('./modules/devices/routes')
const deviceModelCatalogRoutes = require('./modules/device-model-catalog/routes')
const maintenancePartyRoutes = require('./modules/maintenance-parties/routes')
const fileRoutes = require('./modules/files/routes')
const feedbackRoutes = require('./modules/feedback/routes')
const geoRoutes = require('./modules/geo/routes')
const inspectionScheduleRoutes = require('./modules/inspection-schedules/routes')
const mrRoutes = require('./modules/mr/routes')
const { initializeDeviceModelCatalog } = require('./modules/device-model-catalog')
const roleRoutes = require('./modules/roles/routes')
const serviceOrderRoutes = require('./modules/service-orders/routes')
const customerSignatureRequestRoutes = require('./modules/service-orders/public-routes')
const settingsRoutes = require('./modules/settings/routes')
const userSignatureRequestRoutes = require('./modules/user-signature/public-routes')
const userRoutes = require('./modules/users/routes')

const developmentOrigins = env.nodeEnv === 'production' ? [] : [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]
const allowedOrigins = new Set([
  ...developmentOrigins,
  ...env.corsAllowedOrigins,
])

const corsOptions = {
  credentials: true,
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
// 只信任最近一跳反向代理（nginx），避免伪造 X-Forwarded-For 绕过基于 IP 的限流
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(simplifyInput)
app.use('/api/v1/avatars', express.static(path.join(uploadRoot, 'avatars'), {
  setHeaders(res) {
    // 防止历史遗留的非图片文件被浏览器嗅探/渲染为 HTML
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Content-Security-Policy', "default-src 'none'")
  },
}))

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
app.use('/api/v1/customer-signature-requests', customerSignatureRequestRoutes)
app.use('/api/v1/user-signature', userSignatureRequestRoutes)
app.use('/api/v1/announcements', authenticate, auditLogger, announcementRoutes)
app.use('/api/v1/users', authenticate, auditLogger, userRoutes)
app.use('/api/v1/customers', authenticate, requireEngineerOnboardingComplete, auditLogger, customerRoutes)
app.use('/api/v1/devices', authenticate, requireEngineerOnboardingComplete, auditLogger, deviceRoutes)
app.use('/api/v1/device-model-catalog', authenticate, requireEngineerOnboardingComplete, deviceModelCatalogRoutes)
app.use('/api/v1/maintenance-parties', authenticate, requireEngineerOnboardingComplete, auditLogger, maintenancePartyRoutes)
app.use('/api/v1/geo', authenticate, requireEngineerOnboardingComplete, auditLogger, geoRoutes)
app.use('/api/v1/inspection-schedules', authenticate, requireEngineerOnboardingComplete, auditLogger, inspectionScheduleRoutes)
app.use('/api/v1/mr', authenticate, requireEngineerOnboardingComplete, auditLogger, mrRoutes)
app.use('/api/v1/approval-tasks', authenticate, requireEngineerOnboardingComplete, auditLogger, approvalTaskRoutes)
app.use('/api/v1/service-orders', authenticate, requireEngineerOnboardingComplete, auditLogger, serviceOrderRoutes)
app.use('/api/v1/files', authenticate, requireEngineerOnboardingComplete, auditLogger, fileRoutes)
app.use('/api/v1/feedback', authenticate, requireEngineerOnboardingComplete, auditLogger, feedbackRoutes)
app.use('/api/v1/settings', authenticate, requireEngineerOnboardingComplete, auditLogger, settingsRoutes)
app.use('/api/v1/audit-logs', authenticate, requireEngineerOnboardingComplete, auditLogger, auditLogRoutes)
app.use('/api/v1/roles', authenticate, requireEngineerOnboardingComplete, auditLogger, roleRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
