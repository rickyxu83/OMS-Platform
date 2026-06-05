const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')

const maintenanceTypes = new Set(['none', 'original_manufacturer', 'our_maintenance'])

function maintenancePartyPayload(row) {
  if (!row.maintenance_party_id) return null
  return {
    id: row.maintenance_party_id,
    name: row.maintenance_party_name,
    phone: row.maintenance_party_phone,
  }
}

function normalizeMaintenanceType(value) {
  const maintenanceType = String(value || 'none').trim() || 'none'
  if (!maintenanceTypes.has(maintenanceType)) {
    throw badRequest('维护类型不合法')
  }
  return maintenanceType
}

function normalizeMaintenancePartyId(value, maintenanceType) {
  const id = Number(value || 0)
  if (maintenanceType === 'none') return null
  return id > 0 ? id : null
}

async function ensureMaintenancePartyExists(maintenancePartyId) {
  if (!maintenancePartyId) return
  const rows = await query('SELECT id FROM maintenance_parties WHERE id = :id LIMIT 1', { id: maintenancePartyId })
  if (!rows[0]) {
    throw badRequest('维护方不存在')
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return text || null
}

function devicePayload(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    name: row.name,
    model: row.model,
    pn: row.pn,
    serialNo: row.serial_no,
    remark: row.remark,
    maintenanceType: row.maintenance_type,
    maintenancePartyId: row.maintenance_party_id,
    maintenancePartyName: row.maintenance_party_name,
    maintenancePartyPhone: row.maintenance_party_phone,
    maintenanceParty: maintenancePartyPayload(row),
    maintenanceStart: row.maintenance_start,
    maintenanceEnd: row.maintenance_end,
    installationSourceServiceOrderId: row.installation_source_service_order_id,
    location: row.location,
    warrantyUntil: row.warranty_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function list(req, res) {
  const { customerId = null, keyword = '' } = req.query
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.pn, d.serial_no,
            d.remark, d.maintenance_type, d.maintenance_party_id, mp.name AS maintenance_party_name,
            mp.phone AS maintenance_party_phone, d.maintenance_start, d.maintenance_end,
            d.installation_source_service_order_id, d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id
     WHERE (:customerId IS NULL OR d.customer_id = :customerId)
       AND (:keyword = '' OR d.name LIKE :likeKeyword OR d.model LIKE :likeKeyword OR d.serial_no LIKE :likeKeyword)
     ORDER BY d.id DESC
     LIMIT 200`,
    {
      customerId: customerId || null,
      keyword,
      likeKeyword: `%${keyword}%`,
    },
  )

  res.json({ items: rows.map(devicePayload) })
}

async function create(req, res) {
  const {
    customerId,
    name,
    model,
    pn,
    serialNo,
    remark,
    maintenanceType,
    maintenancePartyId,
    maintenanceStart,
    maintenanceEnd,
    location,
    warrantyUntil,
  } = req.body || {}
  if (!customerId || !name) {
    throw badRequest('客户和设备名称不能为空')
  }
  const normalizedMaintenanceType = normalizeMaintenanceType(maintenanceType)
  const normalizedMaintenancePartyId = normalizeMaintenancePartyId(maintenancePartyId, normalizedMaintenanceType)
  await ensureMaintenancePartyExists(normalizedMaintenancePartyId)

  const result = await query(
    `INSERT INTO devices (
       customer_id, name, model, pn, serial_no, remark, maintenance_type, maintenance_party_id,
       maintenance_start, maintenance_end, location, warranty_until
     )
     VALUES (
       :customerId, :name, :model, :pn, :serialNo, :remark, :maintenanceType, :maintenancePartyId,
       :maintenanceStart, :maintenanceEnd, :location, :warrantyUntil
     )`,
    {
      customerId,
      name,
      model: model || null,
      pn: pn || null,
      serialNo: serialNo || null,
      remark: remark || null,
      maintenanceType: normalizedMaintenanceType,
      maintenancePartyId: normalizedMaintenancePartyId,
      maintenanceStart: normalizeDate(maintenanceStart),
      maintenanceEnd: normalizeDate(maintenanceEnd),
      location: location || null,
      warrantyUntil: warrantyUntil || null,
    },
  )

  res.status(201).json({ id: result.insertId })
}

async function detail(req, res) {
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.pn, d.serial_no,
            d.remark, d.maintenance_type, d.maintenance_party_id, mp.name AS maintenance_party_name,
            mp.phone AS maintenance_party_phone, d.maintenance_start, d.maintenance_end,
            d.installation_source_service_order_id, d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id
     WHERE d.id = :id
     LIMIT 1`,
    { id: req.params.id },
  )

  if (!rows[0]) {
    throw notFound('设备不存在')
  }

  res.json({ item: devicePayload(rows[0]) })
}

async function update(req, res) {
  const {
    customerId,
    name,
    model,
    pn,
    serialNo,
    remark,
    maintenanceType,
    maintenancePartyId,
    maintenanceStart,
    maintenanceEnd,
    location,
    warrantyUntil,
  } = req.body || {}
  const existing = await query('SELECT id FROM devices WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('设备不存在')
  }
  const normalizedMaintenanceType = normalizeMaintenanceType(maintenanceType)
  const normalizedMaintenancePartyId = normalizeMaintenancePartyId(maintenancePartyId, normalizedMaintenanceType)
  await ensureMaintenancePartyExists(normalizedMaintenancePartyId)

  await query(
    `UPDATE devices
     SET customer_id = COALESCE(:customerId, customer_id),
         name = COALESCE(:name, name),
         model = :model,
         pn = :pn,
         serial_no = :serialNo,
         remark = :remark,
         maintenance_type = :maintenanceType,
         maintenance_party_id = :maintenancePartyId,
         maintenance_start = :maintenanceStart,
         maintenance_end = :maintenanceEnd,
         location = :location,
         warranty_until = :warrantyUntil
     WHERE id = :id`,
    {
      id: req.params.id,
      customerId: customerId || null,
      name: name || null,
      model: model || null,
      pn: pn || null,
      serialNo: serialNo || null,
      remark: remark || null,
      maintenanceType: normalizedMaintenanceType,
      maintenancePartyId: normalizedMaintenancePartyId,
      maintenanceStart: normalizeDate(maintenanceStart),
      maintenanceEnd: normalizeDate(maintenanceEnd),
      location: location || null,
      warrantyUntil: warrantyUntil || null,
    },
  )

  res.status(204).end()
}

async function remove(req, res) {
  const rows = await query('SELECT id, name FROM devices WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!rows[0]) {
    throw notFound('设备不存在')
  }

  const [serviceOrders, schedules] = await Promise.all([
    query('SELECT COUNT(*) AS total FROM service_orders WHERE device_id = :id', { id: req.params.id }),
    query('SELECT COUNT(*) AS total FROM inspection_schedules WHERE device_id = :id', { id: req.params.id }),
  ])
  const serviceOrderCount = Number(serviceOrders[0]?.total || 0)
  const scheduleCount = Number(schedules[0]?.total || 0)
  if (serviceOrderCount || scheduleCount) {
    throw badRequest(`设备已被 ${serviceOrderCount} 张工单、${scheduleCount} 个巡检计划引用，不能删除`)
  }

  await query('DELETE FROM devices WHERE id = :id', { id: req.params.id })
  res.status(204).end()
}

module.exports = {
  list,
  create,
  detail,
  update,
  remove,
  normalizeMaintenanceType,
}
