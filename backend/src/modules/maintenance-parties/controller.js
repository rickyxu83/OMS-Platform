const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')
const { isValidNormalizedPhone, normalizePhoneNumber } = require('../../utils/phone')
const { buildLikeSearch } = require('../../utils/chinese')

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
           AND COLUMN_NAME IN ('contact', 'contacts', 'official_website', 'service_scope', 'remark')`,
      )
      const existing = new Set(rows.map((row) => row.columnName))
      if (!existing.has('contact')) {
        await query('ALTER TABLE maintenance_parties ADD COLUMN contact VARCHAR(100) NULL AFTER phone')
        existing.add('contact')
      }
      if (!existing.has('contacts')) {
        await query('ALTER TABLE maintenance_parties ADD COLUMN contacts LONGTEXT NULL AFTER contact')
        existing.add('contacts')
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

function normalizeListLimit(value) {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) return 200
  return Math.min(1000, Math.max(1, Math.floor(limit)))
}

function validatePhone(input) {
  const phone = normalizePhoneNumber(input)
  if (!phone) return null
  if (!isValidNormalizedPhone(phone)) {
    throw badRequest('联系电话格式不正确')
  }
  return phone
}

function parseContacts(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeContacts(value, fallbackContact = '', fallbackPhone = '') {
  const parsed = parseContacts(value)
  const source = parsed.length ? parsed : [{ name: fallbackContact, phone: fallbackPhone }]
  return source
    .map((item) => {
      const name = normalizeText(item?.name)
      const phone = validatePhone(item?.phone)
      return name || phone ? { name, phone: phone || '' } : null
    })
    .filter(Boolean)
    .slice(0, 20)
}

function contactsJson(contacts) {
  return contacts.length ? JSON.stringify(contacts) : null
}

function partyPayload(row) {
  const contacts = normalizeContacts(row.contacts, row.contact, row.phone)
  return {
    id: row.id,
    partyType: row.party_type,
    name: row.name,
    contact: row.contact,
    phone: normalizePhoneNumber(row.phone) || row.phone,
    contacts,
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
  const keywordSearch = buildLikeSearch(keyword)
  const limit = normalizeListLimit(req.query.limit)
  const normalizedPartyType = partyType ? normalizePartyType(partyType, '') : ''
  if (normalizedPartyType && !validPartyTypes.has(normalizedPartyType)) {
    throw badRequest('维护方类型不正确')
  }
  const rows = await query(
    `SELECT id, party_type, name, contact, contacts, phone, official_website, remark, created_at, updated_at
     FROM maintenance_parties
     WHERE (:partyType = '' OR party_type = :partyType)
       AND (
         :keyword = ''
         OR ${keywordSearch.sql('name')}
         OR ${keywordSearch.sql('contact')}
         OR ${keywordSearch.sql('contacts')}
         OR ${keywordSearch.sql('phone')}
         OR ${keywordSearch.sql('official_website')}
         OR ${keywordSearch.sql('remark')}
       )
     ORDER BY id DESC
     LIMIT ${limit}`,
    {
      keyword,
      partyType: normalizedPartyType,
      ...keywordSearch.params,
    },
  )

  res.json({ items: rows.map(partyPayload) })
}

async function create(req, res) {
  await ensureMaintenancePartyColumns()
  const partyType = normalizePartyType(req.body?.partyType)
  const name = normalizeText(req.body?.name)
  const contacts = normalizeContacts(req.body?.contacts, req.body?.contact, req.body?.phone)
  const primaryContact = contacts[0] || {}
  const contact = primaryContact.name || null
  const phone = primaryContact.phone || validatePhone(req.body?.phone)
  const officialWebsite = normalizeText(req.body?.officialWebsite ?? req.body?.serviceScope) || null
  const remark = normalizeText(req.body?.remark) || null

  if (!validPartyTypes.has(partyType)) {
    throw badRequest('维护方类型不正确')
  }
  if (!name) {
    throw badRequest('维护方名称不能为空')
  }

  const result = await query(
    `INSERT INTO maintenance_parties (party_type, name, contact, contacts, phone, official_website, remark)
     VALUES (:partyType, :name, :contact, :contacts, :phone, :officialWebsite, :remark)`,
    { partyType, name, contact, contacts: contactsJson(contacts), phone, officialWebsite, remark },
  )

  res.status(201).json({ id: result.insertId })
}

async function detail(req, res) {
  await ensureMaintenancePartyColumns()
  const rows = await query(
    `SELECT id, party_type, name, contact, contacts, phone, official_website, remark, created_at, updated_at
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
  const existing = await query('SELECT id, contact, contacts, phone FROM maintenance_parties WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('维护方不存在')
  }

  const hasPartyType = Object.prototype.hasOwnProperty.call(req.body || {}, 'partyType')
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name')
  const hasContact = Object.prototype.hasOwnProperty.call(req.body || {}, 'contact')
  const hasContacts = Object.prototype.hasOwnProperty.call(req.body || {}, 'contacts')
  const hasPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')
  const hasOfficialWebsite = Object.prototype.hasOwnProperty.call(req.body || {}, 'officialWebsite')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'serviceScope')
  const hasRemark = Object.prototype.hasOwnProperty.call(req.body || {}, 'remark')

  const partyType = hasPartyType ? normalizePartyType(req.body.partyType, '') : null
  const name = hasName ? normalizeText(req.body.name) : null
  const normalizedContacts = hasContacts
    ? normalizeContacts(req.body.contacts, req.body.contact, req.body.phone)
    : hasContact || hasPhone
      ? normalizeContacts(null, hasContact ? req.body.contact : existing[0].contact, hasPhone ? req.body.phone : existing[0].phone)
      : null
  const primaryContact = normalizedContacts?.[0] || {}
  const contact = hasContacts || hasContact ? primaryContact.name || null : null
  const phone = hasContacts || hasPhone ? primaryContact.phone || null : null
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
         contact = CASE WHEN :hasContactOrContacts THEN :contact ELSE contact END,
         contacts = CASE WHEN :hasContacts THEN :contacts ELSE contacts END,
         phone = CASE WHEN :hasPhoneOrContacts THEN :phone ELSE phone END,
         official_website = CASE WHEN :hasOfficialWebsite THEN :officialWebsite ELSE official_website END,
         remark = CASE WHEN :hasRemark THEN :remark ELSE remark END
     WHERE id = :id`,
    {
      id: req.params.id,
      partyType: hasPartyType ? partyType : null,
      name: hasName ? name : null,
      hasContactOrContacts: hasContact || hasContacts,
      contact: hasContact || hasContacts ? contact : null,
      hasContacts,
      contacts: hasContacts ? contactsJson(normalizedContacts) : null,
      hasPhoneOrContacts: hasPhone || hasContacts,
      phone: hasPhone || hasContacts ? phone : null,
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
