const { query } = require('../../config/db')
const { ROLE_GROUPS } = require('../../permissions/roles')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')

const VALID_KINDS = new Set(['info', 'warning', 'success'])
const ALL_ROLES = ROLE_GROUPS.allSignedIn

let tablesReady = false

async function ensureAnnouncementTables() {
  if (tablesReady) return

  await query(
    `CREATE TABLE IF NOT EXISTS announcements (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(160) NOT NULL,
      content_markdown LONGTEXT NOT NULL,
      kind ENUM('info', 'warning', 'success') NOT NULL DEFAULT 'info',
      active TINYINT(1) NOT NULL DEFAULT 1,
      target_roles LONGTEXT NULL,
      starts_at DATETIME NULL,
      ends_at DATETIME NULL,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_announcements_active_time (active, starts_at, ends_at, id),
      KEY idx_announcements_created_by (created_by),
      KEY idx_announcements_updated_by (updated_by),
      CONSTRAINT fk_announcements_created_by FOREIGN KEY (created_by) REFERENCES users (id),
      CONSTRAINT fk_announcements_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS announcement_reads (
      announcement_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, user_id),
      KEY idx_announcement_reads_user (user_id, read_at),
      CONSTRAINT fk_announcement_reads_announcement FOREIGN KEY (announcement_id) REFERENCES announcements (id) ON DELETE CASCADE,
      CONSTRAINT fk_announcement_reads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  tablesReady = true
}

function parseTargetRoles(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map((role) => String(role || '').trim()).filter(Boolean)

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.map((role) => String(role || '').trim()).filter(Boolean)
    }
  } catch {}

  return String(value)
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

function targetRolesForSave(value) {
  const roles = [...new Set(parseTargetRoles(value))]
  const invalid = roles.filter((role) => !ALL_ROLES.includes(role))
  if (invalid.length) throw badRequest(`公告目标角色无效：${invalid.join(', ')}`)
  return roles
}

function normalizeKind(value) {
  const kind = String(value || 'info').trim()
  return VALID_KINDS.has(kind) ? kind : 'info'
}

function normalizeOptionalDate(value, label) {
  const text = String(value || '').trim()
  if (!text) return null

  const normalized = text.replace('T', ' ').replace(/Z$/, '').slice(0, 19)
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    throw badRequest(`${label}格式不正确`)
  }
  return normalized.length === 16 ? `${normalized}:00` : normalized
}

function normalizeAnnouncementBody(body = {}) {
  const title = String(body.title || '').trim()
  const contentMarkdown = String(body.contentMarkdown ?? body.content ?? '').trim()
  const kind = normalizeKind(body.kind)
  const active = body.active === false || body.active === 'false' || body.active === 0 || body.active === '0' ? 0 : 1
  const targetRoles = targetRolesForSave(body.targetRoles)
  const startsAt = normalizeOptionalDate(body.startsAt, '开始时间')
  const endsAt = normalizeOptionalDate(body.endsAt, '结束时间')

  if (!title) throw badRequest('请填写公告标题')
  if (title.length > 160) throw badRequest('公告标题不能超过 160 字')
  if (!contentMarkdown) throw badRequest('请填写公告内容')
  if (contentMarkdown.length > 10000) throw badRequest('公告内容不能超过 10000 字')
  if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
    throw badRequest('结束时间不能早于开始时间')
  }

  return {
    title,
    contentMarkdown,
    kind,
    active,
    targetRoles,
    targetRolesJson: targetRoles.length ? JSON.stringify(targetRoles) : null,
    startsAt,
    endsAt,
  }
}

function announcementPayload(row) {
  return {
    id: row.id,
    title: row.title,
    contentMarkdown: row.content_markdown,
    kind: row.kind,
    active: Boolean(row.active),
    targetRoles: parseTargetRoles(row.target_roles),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || '',
    readAt: row.read_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function canSeeAnnouncement(row, role) {
  const roles = parseTargetRoles(row.target_roles)
  return roles.length === 0 || roles.includes(role)
}

async function list(req, res) {
  await ensureAnnouncementTables()

  const rows = await query(
    `SELECT a.id, a.title, a.content_markdown, a.kind, a.active, a.target_roles,
            a.starts_at, a.ends_at, a.created_by, creator.real_name AS created_by_name,
            a.updated_by, updater.real_name AS updated_by_name, a.created_at, a.updated_at
     FROM announcements a
     LEFT JOIN users creator ON creator.id = a.created_by
     LEFT JOIN users updater ON updater.id = a.updated_by
     ORDER BY a.id DESC
     LIMIT 100`,
  )

  res.json({ items: rows.map(announcementPayload) })
}

async function unread(req, res) {
  await ensureAnnouncementTables()

  const rows = await query(
    `SELECT a.id, a.title, a.content_markdown, a.kind, a.active, a.target_roles,
            a.starts_at, a.ends_at, a.created_by, a.updated_by, a.created_at, a.updated_at,
            ar.read_at
     FROM announcements a
     LEFT JOIN announcement_reads ar
       ON ar.announcement_id = a.id AND ar.user_id = :userId
     WHERE a.active = 1
       AND ar.announcement_id IS NULL
       AND (a.starts_at IS NULL OR a.starts_at <= NOW())
       AND (a.ends_at IS NULL OR a.ends_at >= NOW())
     ORDER BY COALESCE(a.starts_at, a.created_at) ASC, a.id ASC
     LIMIT 100`,
    { userId: req.user.id },
  )

  res.json({ items: rows.filter((row) => canSeeAnnouncement(row, req.user.role)).map(announcementPayload) })
}

async function create(req, res) {
  await ensureAnnouncementTables()
  const item = normalizeAnnouncementBody(req.body)

  const result = await query(
    `INSERT INTO announcements
       (title, content_markdown, kind, active, target_roles, starts_at, ends_at, created_by, updated_by)
     VALUES
       (:title, :contentMarkdown, :kind, :active, :targetRolesJson, :startsAt, :endsAt, :userId, :userId)`,
    {
      ...item,
      userId: req.user.id,
    },
  )

  res.status(201).json({ id: result.insertId })
}

async function update(req, res) {
  await ensureAnnouncementTables()
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('公告 ID 无效')

  const existing = await query('SELECT id FROM announcements WHERE id = :id LIMIT 1', { id })
  if (!existing[0]) throw notFound('公告不存在')

  const item = normalizeAnnouncementBody(req.body)
  await query(
    `UPDATE announcements
     SET title = :title,
         content_markdown = :contentMarkdown,
         kind = :kind,
         active = :active,
         target_roles = :targetRolesJson,
         starts_at = :startsAt,
         ends_at = :endsAt,
         updated_by = :userId,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    {
      ...item,
      id,
      userId: req.user.id,
    },
  )

  res.json({ ok: true })
}

async function remove(req, res) {
  await ensureAnnouncementTables()
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('公告 ID 无效')

  const result = await query('DELETE FROM announcements WHERE id = :id', { id })
  if (!result.affectedRows) throw notFound('公告不存在')
  res.status(204).end()
}

async function markRead(req, res) {
  await ensureAnnouncementTables()
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('公告 ID 无效')

  const rows = await query(
    `SELECT id, target_roles, active, starts_at, ends_at
     FROM announcements
     WHERE id = :id
     LIMIT 1`,
    { id },
  )
  const announcement = rows[0]
  if (!announcement) throw notFound('公告不存在')
  if (!canSeeAnnouncement(announcement, req.user.role)) throw forbidden('无权读取该公告')

  await query(
    `INSERT INTO announcement_reads (announcement_id, user_id)
     VALUES (:id, :userId)
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    { id, userId: req.user.id },
  )

  res.json({ ok: true })
}

module.exports = {
  create,
  list,
  markRead,
  remove,
  unread,
  update,
}
