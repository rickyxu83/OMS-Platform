const fs = require('fs')
const path = require('path')
const multer = require('multer')
const env = require('../../config/env')
const { query } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { ROLE_GROUPS } = require('../../permissions/roles')
const { hasAnyPermission, hasPermission } = require('../../permissions/store')
const { buildSalesCustomerScope } = require('../../permissions/sales-scope')

const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
fs.mkdirSync(uploadRoot, { recursive: true })

const allowedUploadExtensions = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.heic',
  '.heif',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.png',
  '.txt',
  '.webp',
  '.xls',
  '.xlsx',
  '.zip',
])
const allowedUploadMimeTypes = new Set([
  'application/msword',
  'application/octet-stream',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
])
const engineerScopedRoles = new Set(ROLE_GROUPS.serviceOrderEngineer)

function isMineRequest(req) {
  const value = req.query?.mine ?? req.body?.mine
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase())
}

function originalNameUtf8(file) {
  return Buffer.from(file?.originalname || '', 'latin1').toString('utf8')
}

function fileFilter(_req, file, cb) {
  const originalName = originalNameUtf8(file)
  const extension = path.extname(originalName || file.originalname || '').toLowerCase()
  const mimeType = String(file.mimetype || '').toLowerCase()
  if (!allowedUploadExtensions.has(extension)) {
    cb(badRequest('附件类型不支持，请上传 PDF、Office 文档、图片、文本、CSV 或 ZIP'))
    return
  }
  if (mimeType && !allowedUploadMimeTypes.has(mimeType)) {
    cb(badRequest('附件 MIME 类型不支持'))
    return
  }
  cb(null, true)
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadRoot)
  },
  filename(req, file, cb) {
    const safeSuffix = file.originalname.replace(/[^\w.\-]+/g, '_')
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeSuffix}`)
  },
})

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
    fields: 8,
    fieldSize: 16 * 1024,
    parts: 12,
  },
  fileFilter,
}).single('file')

const orderFileOwnerTypes = new Set(['service_order', 'service_report', 'signature'])
const filePurposes = new Set(['general', 'inspection_document'])
let filePurposeColumnReady = false

async function ensureFilePurposeColumn() {
  if (filePurposeColumnReady) return
  const rows = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'files'
       AND column_name = 'purpose'
     LIMIT 1`,
  )
  if (!rows[0]) {
    await query("ALTER TABLE files ADD COLUMN purpose VARCHAR(64) NOT NULL DEFAULT 'general' AFTER owner_id")
  }
  filePurposeColumnReady = true
}

function normalizeOwnerType(ownerType) {
  return String(ownerType || '').trim()
}

function normalizeOwnerId(ownerId) {
  const normalized = Number(ownerId)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

function normalizePurpose(purpose) {
  const normalized = String(purpose || 'general').trim()
  return filePurposes.has(normalized) ? normalized : 'general'
}

function cleanupUploadedFile(file) {
  if (file?.path) fs.rm(file.path, { force: true }, () => {})
}

async function isAssignedEngineer(orderId, user) {
  const rows = await query(
    `SELECT 1
     FROM service_orders so
     WHERE so.id = :orderId
       AND (
         so.assigned_engineer_id = :engineerId
         OR EXISTS (
           SELECT 1 FROM service_order_engineers soe
           WHERE soe.service_order_id = so.id AND soe.engineer_id = :engineerId
         )
       )
     LIMIT 1`,
    { orderId, engineerId: user.id },
  )
  return Boolean(rows[0])
}

async function isSalesScopedOrder(orderId, user) {
  const salesScope = buildSalesCustomerScope(user, 'c')
  const rows = await query(
    `SELECT 1
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     WHERE so.id = :orderId
       ${salesScope.sql}
     LIMIT 1`,
    { orderId, ...salesScope.params },
  )
  return Boolean(rows[0])
}

async function canAccessOrderFile(orderId, user, action, req) {
  const canView = await hasPermission(user.role, 'order.view')
  const canManage = await hasAnyPermission(user.role, ['order.create', 'order.edit', 'order.assign'])
  const canOwn = await hasPermission(user.role, 'order.engineer.own')
  if (user.role === 'sales' && action === 'view') return canView && isSalesScopedOrder(orderId, user)
  if (canOwn && (user.role === 'engineer' || (isMineRequest(req) && engineerScopedRoles.has(user.role)))) {
    return isAssignedEngineer(orderId, user)
  }
  return action === 'view' ? canView : canManage
}

async function assertCanAccessOwner(ownerType, ownerId, user, action, req) {
  if (!orderFileOwnerTypes.has(ownerType)) {
    throw badRequest('文件归属类型不支持')
  }

  const rows = await query('SELECT id FROM service_orders WHERE id = :ownerId LIMIT 1', { ownerId })
  if (!rows[0]) {
    throw notFound('文件归属服务单不存在')
  }

  if (!(await canAccessOrderFile(ownerId, user, action, req))) {
    throw forbidden('无权访问该服务单文件')
  }
}

async function assertCanAccessFile(file, user, action, req) {
  await assertCanAccessOwner(file.owner_type, Number(file.owner_id), user, action, req)
}

async function upload(req, res) {
  const ownerType = normalizeOwnerType(req.body?.ownerType)
  const ownerId = normalizeOwnerId(req.body?.ownerId)
  const purpose = normalizePurpose(req.body?.purpose)
  if (!req.file) {
    throw badRequest('文件不能为空')
  }
  if (!ownerType || !ownerId) {
    cleanupUploadedFile(req.file)
    throw badRequest('文件归属类型和归属 ID 不能为空')
  }

  try {
    await ensureFilePurposeColumn()
    await assertCanAccessOwner(ownerType, ownerId, req.user, 'manage', req)
  } catch (error) {
    cleanupUploadedFile(req.file)
    throw error
  }

  const originalName = originalNameUtf8(req.file)

  const result = await query(
    `INSERT INTO files (owner_type, owner_id, purpose, original_name, storage_path, mime_type, size, uploaded_by)
     VALUES (:ownerType, :ownerId, :purpose, :originalName, :storagePath, :mimeType, :size, :uploadedBy)`,
    {
      ownerType,
      ownerId,
      purpose,
      originalName,
      storagePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.id,
    },
  )

  res.status(201).json({
    id: result.insertId,
    originalName,
    purpose,
    mimeType: req.file.mimetype,
    size: req.file.size,
  })
}

async function download(req, res) {
  await ensureFilePurposeColumn()
  const rows = await query('SELECT * FROM files WHERE id = :id LIMIT 1', { id: req.params.id })
  const file = rows[0]
  if (!file) {
    throw notFound('文件不存在')
  }

  await assertCanAccessFile(file, req.user, 'view', req)

  const filename = file.original_name
  const encoded = encodeURIComponent(filename)
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`)
  res.download(file.storage_path)
}

async function remove(req, res) {
  await ensureFilePurposeColumn()
  const rows = await query('SELECT * FROM files WHERE id = :id LIMIT 1', { id: req.params.id })
  const file = rows[0]
  if (!file) {
    throw notFound('文件不存在')
  }

  await assertCanAccessFile(file, req.user, 'manage', req)

  await query('DELETE FROM files WHERE id = :id', { id: req.params.id })
  fs.rm(file.storage_path, { force: true }, () => {})
  res.status(204).end()
}

module.exports = {
  ensureFilePurposeColumn,
  uploadMiddleware,
  upload,
  download,
  remove,
}
