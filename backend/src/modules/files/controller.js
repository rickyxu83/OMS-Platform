const fs = require('fs')
const path = require('path')
const multer = require('multer')
const env = require('../../config/env')
const { query } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')

const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
fs.mkdirSync(uploadRoot, { recursive: true })

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
  },
}).single('file')

const orderFileOwnerTypes = new Set(['service_order', 'service_report', 'signature'])

function normalizeOwnerType(ownerType) {
  return String(ownerType || '').trim()
}

function normalizeOwnerId(ownerId) {
  const normalized = Number(ownerId)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

function cleanupUploadedFile(file) {
  if (file?.path) fs.rm(file.path, { force: true }, () => {})
}

async function canAccessOrderFile(orderId, user) {
  if (user.role !== 'engineer') return true

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

async function assertCanAccessOwner(ownerType, ownerId, user) {
  if (!orderFileOwnerTypes.has(ownerType)) {
    throw badRequest('文件归属类型不支持')
  }

  const rows = await query('SELECT id FROM service_orders WHERE id = :ownerId LIMIT 1', { ownerId })
  if (!rows[0]) {
    throw notFound('文件归属服务单不存在')
  }

  if (!(await canAccessOrderFile(ownerId, user))) {
    throw forbidden('无权访问该服务单文件')
  }
}

async function assertCanAccessFile(file, user) {
  await assertCanAccessOwner(file.owner_type, Number(file.owner_id), user)
}

async function upload(req, res) {
  const ownerType = normalizeOwnerType(req.body?.ownerType)
  const ownerId = normalizeOwnerId(req.body?.ownerId)
  if (!req.file) {
    throw badRequest('文件不能为空')
  }
  if (!ownerType || !ownerId) {
    cleanupUploadedFile(req.file)
    throw badRequest('文件归属类型和归属 ID 不能为空')
  }

  try {
    await assertCanAccessOwner(ownerType, ownerId, req.user)
  } catch (error) {
    cleanupUploadedFile(req.file)
    throw error
  }

  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')

  const result = await query(
    `INSERT INTO files (owner_type, owner_id, original_name, storage_path, mime_type, size, uploaded_by)
     VALUES (:ownerType, :ownerId, :originalName, :storagePath, :mimeType, :size, :uploadedBy)`,
    {
      ownerType,
      ownerId,
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
    mimeType: req.file.mimetype,
    size: req.file.size,
  })
}

async function download(req, res) {
  const rows = await query('SELECT * FROM files WHERE id = :id LIMIT 1', { id: req.params.id })
  const file = rows[0]
  if (!file) {
    throw notFound('文件不存在')
  }

  await assertCanAccessFile(file, req.user)

  const filename = file.original_name
  const encoded = encodeURIComponent(filename)
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`)
  res.download(file.storage_path)
}

async function remove(req, res) {
  const rows = await query('SELECT * FROM files WHERE id = :id LIMIT 1', { id: req.params.id })
  const file = rows[0]
  if (!file) {
    throw notFound('文件不存在')
  }

  await assertCanAccessFile(file, req.user)

  await query('DELETE FROM files WHERE id = :id', { id: req.params.id })
  fs.rm(file.storage_path, { force: true }, () => {})
  res.status(204).end()
}

module.exports = {
  uploadMiddleware,
  upload,
  download,
  remove,
}
