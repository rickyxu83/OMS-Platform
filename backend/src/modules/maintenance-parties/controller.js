const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')
const { isValidNormalizedPhone, normalizePhoneNumber } = require('../../utils/phone')

const validPartyTypes = new Set(['original_manufacturer', 'our_maintenance'])
const partyTypeAliases = {
  vendor_contact: 'original_manufacturer',
  vendor: 'original_manufacturer',
  partner: 'our_maintenance',
  our: 'our_maintenance',
}
let ensureMaintenancePartyColumnsPromise = null

async function ensureMaintenancePartyColumns() {
  if (!ensureMaintenancePartyColumnsPromise) {
    ensureMaintenancePartyColumnsPromise = (async () => {
      const rows = await query(
        `SELECT COLUMN_NAME AS columnName
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'maintenance_parties'
           AND COLUMN_NAME IN ('contact', 'official_website', 'service_scope', 'remark')`,
      )
      const existing = new Set(rows.map((row) => row.columnName))
      if (!existing.has('contact')) {
        await query('ALTER TABLE maintenance_parties ADD COLUMN contact VARCHAR(100) NULL AFTER phone')
      }
      if (existing.has('service_scope') && !existing.has('official_website')) {
        await query('ALTER TABLE maintenance_parties CHANGE COLUMN service_scope official_website VARCHAR(255) NULL')
        existing.delete('service_scope')
        existing.add('official_website')
      }
      if (!existing.has('official_website')) {
        await query('ALTER TABLE maintenance_parties ADD COLUMN official_website VARCHAR(255) NULL AFTER contact')
        existing.add('official_website')
      }
      if (existing.has('service_scope')) {
        await query(
          `UPDATE maintenance_parties
           SET official_website = COALESCE(NULLIF(official_website, ''), service_scope)
           WHERE service_scope IS NOT NULL AND service_scope <> ''`,
        )
        await query('ALTER TABLE maintenance_parties DROP COLUMN service_scope')
      }
      if (!existing.has('remark')) {
        await query('ALTER TABLE maintenance_parties ADD COLUMN remark TEXT NULL AFTER official_website')
      }
    })()
  }
  return ensureMaintenancePartyColumnsPromise
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizePartyType(value, fallback = 'our_maintenance') {
  const partyType = normalizeText(value) || fallback
  return partyTypeAliases[partyType] || partyType
}

function validatePhone(input) {
  const phone = normalizePhoneNumber(input)
  if (!phone) return null
  if (!isValidNormalizedPhone(phone)) {
    throw badRequest('联系电话格式不正确')
  }
  return phone
}

function partyPayload(row) {
  return {
    id: row.id,
    partyType: row.party_type,
    name: row.name,
    contact: row.contact,
    phone: normalizePhoneNumber(row.phone) || row.phone,
    officialWebsite: row.official_website,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function list(req, res) {
  await ensureMaintenancePartyColumns()
  const { partyType = '' } = req.query
  const keyword = String(req.query.keyword ?? req.query.q ?? '').trim()
  const normalizedPartyType = partyType ? normalizePartyType(partyType, '') : ''
  if (normalizedPartyType && !validPartyTypes.has(normalizedPartyType)) {
    throw badRequest('维护方类型不正确')
  }
  const rows = await query(
    `SELECT id, party_type, name, contact, phone, official_website, remark, created_at, updated_at
     FROM maintenance_parties
     WHERE (:partyType = '' OR party_type = :partyType)
       AND (
         :keyword = ''
         OR name LIKE :likeKeyword
         OR contact LIKE :likeKeyword
         OR phone LIKE :likeKeyword
         OR official_website LIKE :likeKeyword
         OR remark LIKE :likeKeyword
       )
     ORDER BY id DESC
     LIMIT 200`,
    {
      keyword,
      partyType: normalizedPartyType,
      likeKeyword: `%${keyword}%`,
    },
  )

  res.json({ items: rows.map(partyPayload) })
}

async function create(req, res) {
  await ensureMaintenancePartyColumns()
  const partyType = normalizePartyType(req.body?.partyType)
  const name = normalizeText(req.body?.name)
  const contact = normalizeText(req.body?.contact) || null
  const phone = validatePhone(req.body?.phone)
  const officialWebsite = normalizeText(req.body?.officialWebsite ?? req.body?.serviceScope) || null
  const remark = normalizeText(req.body?.remark) || null

  if (!validPartyTypes.has(partyType)) {
    throw badRequest('维护方类型不正确')
  }
  if (!name) {
    throw badRequest('维护方名称不能为空')
  }

  const result = await query(
    `INSERT INTO maintenance_parties (party_type, name, contact, phone, official_website, remark)
     VALUES (:partyType, :name, :contact, :phone, :officialWebsite, :remark)`,
    { partyType, name, contact, phone, officialWebsite, remark },
  )

  res.status(201).json({ id: result.insertId })
}

async function detail(req, res) {
  await ensureMaintenancePartyColumns()
  const rows = await query(
    `SELECT id, party_type, name, contact, phone, official_website, remark, created_at, updated_at
     FROM maintenance_parties
     WHERE id = :id
     LIMIT 1`,
    { id: req.params.id },
  )

  if (!rows[0]) {
    throw notFound('维护方不存在')
  }

  res.json({ item: partyPayload(rows[0]) })
}

async function update(req, res) {
  await ensureMaintenancePartyColumns()
  const existing = await query('SELECT id FROM maintenance_parties WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('维护方不存在')
  }

  const hasPartyType = Object.prototype.hasOwnProperty.call(req.body || {}, 'partyType')
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name')
  const hasContact = Object.prototype.hasOwnProperty.call(req.body || {}, 'contact')
  const hasPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')
  const hasOfficialWebsite = Object.prototype.hasOwnProperty.call(req.body || {}, 'officialWebsite')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'serviceScope')
  const hasRemark = Object.prototype.hasOwnProperty.call(req.body || {}, 'remark')

  const partyType = hasPartyType ? normalizePartyType(req.body.partyType, '') : null
  const name = hasName ? normalizeText(req.body.name) : null
  const contact = hasContact ? normalizeText(req.body.contact) || null : null
  const phone = hasPhone ? validatePhone(req.body.phone) : null
  const officialWebsite = hasOfficialWebsite ? normalizeText(req.body.officialWebsite ?? req.body.serviceScope) || null : null
  const remark = hasRemark ? normalizeText(req.body.remark) || null : null

  if (hasPartyType && !validPartyTypes.has(partyType)) {
    throw badRequest('维护方类型不正确')
  }
  if (hasName && !name) {
    throw badRequest('维护方名称不能为空')
  }

  await query(
    `UPDATE maintenance_parties
     SET party_type = COALESCE(:partyType, party_type),
         name = COALESCE(:name, name),
         contact = CASE WHEN :hasContact THEN :contact ELSE contact END,
         phone = CASE WHEN :hasPhone THEN :phone ELSE phone END,
         official_website = CASE WHEN :hasOfficialWebsite THEN :officialWebsite ELSE official_website END,
         remark = CASE WHEN :hasRemark THEN :remark ELSE remark END
     WHERE id = :id`,
    {
      id: req.params.id,
      partyType: hasPartyType ? partyType : null,
      name: hasName ? name : null,
      hasContact,
      contact: hasContact ? contact : null,
      hasPhone,
      phone: hasPhone ? phone : null,
      hasOfficialWebsite,
      officialWebsite: hasOfficialWebsite ? officialWebsite : null,
      hasRemark,
      remark: hasRemark ? remark : null,
    },
  )

  res.status(204).end()
}

async function remove(req, res) {
  const existing = await query('SELECT id FROM maintenance_parties WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('维护方不存在')
  }

  const devices = await query('SELECT COUNT(*) AS total FROM devices WHERE maintenance_party_id = :id', { id: req.params.id })
  if (Number(devices[0]?.total || 0) > 0) {
    throw badRequest('该维护方已被设备引用，不能删除')
  }

  await query('DELETE FROM maintenance_parties WHERE id = :id', { id: req.params.id })
  res.status(204).end()
}

module.exports = {
  list,
  create,
  detail,
  update,
  remove,
}
