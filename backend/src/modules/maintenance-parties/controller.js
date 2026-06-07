const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')

const validPartyTypes = new Set(['original_manufacturer', 'our_maintenance'])
const partyTypeAliases = {
  vendor_contact: 'original_manufacturer',
  vendor: 'original_manufacturer',
  partner: 'our_maintenance',
  our: 'our_maintenance',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizePartyType(value, fallback = 'our_maintenance') {
  const partyType = normalizeText(value) || fallback
  return partyTypeAliases[partyType] || partyType
}

function validatePhone(input) {
  const phone = normalizeText(input)
  if (!phone) return null
  if (!/^[0-9+()\-\s]{7,32}$/.test(phone)) {
    throw badRequest('联系电话格式不正确')
  }
  return phone
}

function partyPayload(row) {
  return {
    id: row.id,
    partyType: row.party_type,
    name: row.name,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function list(req, res) {
  const { keyword = '', partyType = '' } = req.query
  const normalizedPartyType = partyType ? normalizePartyType(partyType, '') : ''
  if (normalizedPartyType && !validPartyTypes.has(normalizedPartyType)) {
    throw badRequest('维护方类型不正确')
  }
  const rows = await query(
    `SELECT id, party_type, name, phone, created_at, updated_at
     FROM maintenance_parties
     WHERE (:partyType = '' OR party_type = :partyType)
       AND (
         :keyword = ''
         OR name LIKE :likeKeyword
         OR phone LIKE :likeKeyword
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
  const partyType = normalizePartyType(req.body?.partyType)
  const name = normalizeText(req.body?.name)
  const phone = validatePhone(req.body?.phone)

  if (!validPartyTypes.has(partyType)) {
    throw badRequest('维护方类型不正确')
  }
  if (!name) {
    throw badRequest('维护方名称不能为空')
  }

  const result = await query(
    `INSERT INTO maintenance_parties (party_type, name, phone)
     VALUES (:partyType, :name, :phone)`,
    { partyType, name, phone },
  )

  res.status(201).json({ id: result.insertId })
}

async function detail(req, res) {
  const rows = await query(
    `SELECT id, party_type, name, phone, created_at, updated_at
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
  const existing = await query('SELECT id FROM maintenance_parties WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('维护方不存在')
  }

  const hasPartyType = Object.prototype.hasOwnProperty.call(req.body || {}, 'partyType')
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name')
  const hasPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')

  const partyType = hasPartyType ? normalizePartyType(req.body.partyType, '') : null
  const name = hasName ? normalizeText(req.body.name) : null
  const phone = hasPhone ? validatePhone(req.body.phone) : null

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
         phone = CASE WHEN :hasPhone THEN :phone ELSE phone END
     WHERE id = :id`,
    {
      id: req.params.id,
      partyType: hasPartyType ? partyType : null,
      name: hasName ? name : null,
      hasPhone,
      phone: hasPhone ? phone : null,
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
