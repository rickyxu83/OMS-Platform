const { query } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { assertSalesCanAccessSalesperson, buildSalesCustomerScope } = require('../../permissions/sales-scope')
const { normalizePhoneNumber } = require('../../utils/phone')

const maintenanceTypes = new Set(['none', 'original_manufacturer', 'our_maintenance'])
let deviceIdentityColumnsReady = false
let devicePartHistoryColumnsReady = false

function maintenancePartyPayload(row) {
  if (!row.maintenance_party_id) return null
  return {
    id: row.maintenance_party_id,
    name: row.maintenance_party_name,
    phone: normalizePhoneNumber(row.maintenance_party_phone) || row.maintenance_party_phone,
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

async function customerSalesperson(customerId) {
  const rows = await query('SELECT id, salesperson FROM customers WHERE id = :id LIMIT 1', { id: customerId })
  if (!rows[0]) {
    throw badRequest('客户不存在')
  }
  return rows[0].salesperson
}

async function assertSalesCanUseCustomer(customerId, user) {
  if (user?.role !== 'sales') return
  const salesperson = await customerSalesperson(customerId)
  assertSalesCanAccessSalesperson(salesperson, user, forbidden)
}

async function assertSalesCanUpdateDevices(deviceIds, user) {
  if (user?.role !== 'sales') return
  const ids = [...new Set(deviceIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (!ids.length) return
  const params = {}
  const placeholders = ids.map((id, index) => {
    const key = `accessDeviceId${index}`
    params[key] = id
    return `:${key}`
  }).join(', ')
  const rows = await query(
    `SELECT d.id, c.salesperson AS customer_salesperson
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id IN (${placeholders})`,
    params,
  )
  for (const row of rows) {
    assertSalesCanAccessSalesperson(row.customer_salesperson, user, forbidden)
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeText(value) {
  const text = String(value || '').trim()
  return text || null
}

async function ensureDeviceIdentityColumns() {
  if (deviceIdentityColumnsReady) return

  const rows = await query(
    `SELECT column_name, is_nullable
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'devices'
       AND column_name IN ('name', 'mr_no')`,
  )
  const nameColumn = rows.find((row) => String(row.column_name).toLowerCase() === 'name')
  if (nameColumn && String(nameColumn.is_nullable || '').toUpperCase() !== 'YES') {
    await query('ALTER TABLE devices MODIFY COLUMN name VARCHAR(128) NULL')
  }
  const mrNoColumn = rows.find((row) => String(row.column_name).toLowerCase() === 'mr_no')
  if (!mrNoColumn) {
    await query('ALTER TABLE devices ADD COLUMN mr_no VARCHAR(128) NULL AFTER serial_no')
  }

  deviceIdentityColumnsReady = true
}

async function ensureDevicePartHistoryColumns() {
  if (devicePartHistoryColumnsReady) return
  await query(
    `CREATE TABLE IF NOT EXISTS service_parts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      service_order_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NULL,
      action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general',
      part_name VARCHAR(128) NOT NULL,
      part_no VARCHAR(128) NULL,
      quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
      unit VARCHAR(32) NULL,
      remark VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_service_parts_order_id (service_order_id),
      KEY idx_service_parts_device_id (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const rows = await query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_parts'
       AND column_name IN ('device_id', 'action_type')`,
  )
  const columns = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!columns.has('device_id')) {
    await query('ALTER TABLE service_parts ADD COLUMN device_id BIGINT UNSIGNED NULL AFTER service_order_id')
  }
  if (!columns.has('action_type')) {
    await query(
      "ALTER TABLE service_parts ADD COLUMN action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general' AFTER device_id",
    )
  }
  const indexRows = await query(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_parts'
       AND index_name = 'idx_service_parts_device_id'`,
  )
  if (!indexRows.length) {
    await query('ALTER TABLE service_parts ADD KEY idx_service_parts_device_id (device_id)')
  }
  devicePartHistoryColumnsReady = true
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
    mrNo: row.mr_no,
    remark: row.remark,
    maintenanceType: row.maintenance_type,
    maintenancePartyId: row.maintenance_party_id,
    maintenancePartyName: row.maintenance_party_name,
    maintenancePartyPhone: normalizePhoneNumber(row.maintenance_party_phone) || row.maintenance_party_phone,
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
  await ensureDeviceIdentityColumns()
  const { customerId = null } = req.query
  const keyword = String(req.query.keyword ?? req.query.q ?? '').trim()
  const salesScope = buildSalesCustomerScope(req.user, 'c')
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.pn, d.serial_no, d.mr_no,
            d.remark, d.maintenance_type, d.maintenance_party_id, mp.name AS maintenance_party_name,
            mp.phone AS maintenance_party_phone, d.maintenance_start, d.maintenance_end,
            d.installation_source_service_order_id, d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id
     WHERE (:customerId IS NULL OR d.customer_id = :customerId)
       ${salesScope.sql}
       AND (
         :keyword = ''
         OR d.name LIKE :likeKeyword
         OR d.model LIKE :likeKeyword
         OR d.pn LIKE :likeKeyword
         OR d.serial_no LIKE :likeKeyword
         OR d.mr_no LIKE :likeKeyword
         OR c.name LIKE :likeKeyword
         OR mp.name LIKE :likeKeyword
         OR d.location LIKE :likeKeyword
         OR d.remark LIKE :likeKeyword
       )
     ORDER BY d.id DESC
     LIMIT 200`,
    {
      customerId: customerId || null,
      keyword,
      likeKeyword: `%${keyword}%`,
      ...salesScope.params,
    },
  )

  res.json({ items: rows.map(devicePayload) })
}

async function create(req, res) {
  await ensureDeviceIdentityColumns()
  const {
    customerId,
    name,
    model,
    pn,
    serialNo,
    mrNo,
    remark,
    maintenanceType,
    maintenancePartyId,
    maintenanceStart,
    maintenanceEnd,
    location,
    warrantyUntil,
  } = req.body || {}
  const normalizedModel = normalizeText(model)
  const normalizedSerialNo = normalizeText(serialNo)
  if (!customerId || !normalizedModel || !normalizedSerialNo) {
    throw badRequest('客户、设备型号和 S/N 序列号不能为空')
  }
  await assertSalesCanUseCustomer(customerId, req.user)
  const normalizedName = normalizeText(name)
  const normalizedMaintenanceType = normalizeMaintenanceType(maintenanceType)
  const normalizedMaintenancePartyId = normalizeMaintenancePartyId(maintenancePartyId, normalizedMaintenanceType)
  await ensureMaintenancePartyExists(normalizedMaintenancePartyId)

  const result = await query(
    `INSERT INTO devices (
       customer_id, name, model, pn, serial_no, remark, maintenance_type, maintenance_party_id,
       mr_no, maintenance_start, maintenance_end, location, warranty_until
     )
     VALUES (
       :customerId, :name, :model, :pn, :serialNo, :remark, :maintenanceType, :maintenancePartyId,
       :mrNo, :maintenanceStart, :maintenanceEnd, :location, :warrantyUntil
     )`,
    {
      customerId,
      name: normalizedName,
      model: normalizedModel,
      pn: normalizeText(pn),
      serialNo: normalizedSerialNo,
      mrNo: normalizeText(mrNo),
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
  await ensureDeviceIdentityColumns()
  await ensureDevicePartHistoryColumns()
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, c.salesperson AS customer_salesperson, d.name, d.model, d.pn, d.serial_no, d.mr_no,
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
  assertSalesCanAccessSalesperson(rows[0].customer_salesperson, req.user, forbidden)

  const partRows = await query(
    `SELECT sp.id, sp.service_order_id, sp.device_id, sp.action_type, sp.part_name, sp.part_no,
            sp.quantity, sp.unit, sp.remark, sp.created_at, sp.updated_at,
            so.order_no, so.service_mode, so.service_type, so.issue_description,
            so.submitted_at, so.created_at AS order_created_at,
            sr.work_content, u.real_name AS engineer_name, u.username AS engineer_username
     FROM service_parts sp
     JOIN service_orders so ON so.id = sp.service_order_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     LEFT JOIN users u ON u.id = so.assigned_engineer_id
     WHERE sp.device_id = :id
     ORDER BY COALESCE(so.submitted_at, sp.created_at) DESC, sp.id DESC
     LIMIT 100`,
    { id: req.params.id },
  )

  res.json({
    item: {
      ...devicePayload(rows[0]),
      partHistory: partRows.map((part) => ({
        id: part.id,
        serviceOrderId: part.service_order_id,
        orderNo: part.order_no,
        serviceMode: part.service_mode,
        serviceType: part.service_type,
        actionType: part.action_type || 'general',
        partName: part.part_name,
        partNo: part.part_no,
        quantity: part.quantity,
        unit: part.unit,
        remark: part.remark,
        issueDescription: part.issue_description,
        workContent: part.work_content,
        engineerName: part.engineer_name || part.engineer_username,
        serviceAt: part.submitted_at || part.order_created_at || part.created_at,
        createdAt: part.created_at,
        updatedAt: part.updated_at,
      })),
    },
  })
}

async function batchUpdate(req, res) {
  await ensureDeviceIdentityColumns()
  const { ids, fields = {} } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    throw badRequest('请选择至少一台设备')
  }
  const numericIds = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  if (numericIds.length === 0) {
    throw badRequest('设备 ID 不合法')
  }
  await assertSalesCanUpdateDevices(numericIds, req.user)

  const setClauses = []
  const params = {}

  if (Object.prototype.hasOwnProperty.call(fields, 'maintenanceType')) {
    const maintenanceType = normalizeMaintenanceType(fields.maintenanceType)
    setClauses.push('maintenance_type = :maintenanceType')
    params.maintenanceType = maintenanceType
    if (maintenanceType === 'none') {
      setClauses.push('maintenance_party_id = NULL')
    } else if (Object.prototype.hasOwnProperty.call(fields, 'maintenancePartyId')) {
      const partyId = normalizeMaintenancePartyId(fields.maintenancePartyId, maintenanceType)
      if (partyId) await ensureMaintenancePartyExists(partyId)
      setClauses.push('maintenance_party_id = :maintenancePartyId')
      params.maintenancePartyId = partyId
    }
  } else if (Object.prototype.hasOwnProperty.call(fields, 'maintenancePartyId')) {
    const partyId = normalizeMaintenancePartyId(fields.maintenancePartyId, 'original_manufacturer')
    if (partyId) await ensureMaintenancePartyExists(partyId)
    setClauses.push('maintenance_party_id = :maintenancePartyId')
    params.maintenancePartyId = partyId
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'maintenanceStart')) {
    setClauses.push('maintenance_start = :maintenanceStart')
    params.maintenanceStart = normalizeDate(fields.maintenanceStart)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'maintenanceEnd')) {
    setClauses.push('maintenance_end = :maintenanceEnd')
    params.maintenanceEnd = normalizeDate(fields.maintenanceEnd)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'warrantyUntil')) {
    setClauses.push('warranty_until = :warrantyUntil')
    params.warrantyUntil = normalizeDate(fields.warrantyUntil)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'location')) {
    setClauses.push('location = :location')
    params.location = normalizeText(fields.location)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'remark')) {
    setClauses.push('remark = :remark')
    params.remark = normalizeText(fields.remark)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
    setClauses.push('name = :name')
    params.name = normalizeText(fields.name)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'pn')) {
    setClauses.push('pn = :pn')
    params.pn = normalizeText(fields.pn)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'mrNo')) {
    setClauses.push('mr_no = :mrNo')
    params.mrNo = normalizeText(fields.mrNo)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'location')) {
    setClauses.push('location = :location')
    params.location = normalizeText(fields.location)
  }

  if (setClauses.length === 0) {
    throw badRequest('没有需要更新的字段')
  }

  const placeholders = numericIds.map((_, i) => `:id${i}`).join(', ')
  numericIds.forEach((id, i) => { params[`id${i}`] = id })

  await query(
    `UPDATE devices SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`,
    params,
  )

  res.status(204).end()
}

async function update(req, res) {
  await ensureDeviceIdentityColumns()
  const {
    customerId,
    name,
    model,
    pn,
    serialNo,
    mrNo,
    remark,
    maintenanceType,
    maintenancePartyId,
    maintenanceStart,
    maintenanceEnd,
    location,
    warrantyUntil,
  } = req.body || {}
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name')
  const normalizedName = hasName ? normalizeText(name) : null
  const normalizedModel = normalizeText(model)
  if (!normalizedModel) {
    throw badRequest('设备型号不能为空')
  }
  const existing = await query(
    `SELECT d.id, d.customer_id, c.salesperson AS customer_salesperson
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id = :id
     LIMIT 1`,
    { id: req.params.id },
  )
  if (!existing[0]) {
    throw notFound('设备不存在')
  }
  assertSalesCanAccessSalesperson(existing[0].customer_salesperson, req.user, forbidden)
  if (customerId && String(customerId) !== String(existing[0].customer_id)) {
    await assertSalesCanUseCustomer(customerId, req.user)
  }
  const normalizedMaintenanceType = normalizeMaintenanceType(maintenanceType)
  const normalizedMaintenancePartyId = normalizeMaintenancePartyId(maintenancePartyId, normalizedMaintenanceType)
  await ensureMaintenancePartyExists(normalizedMaintenancePartyId)

  await query(
    `UPDATE devices
     SET customer_id = COALESCE(:customerId, customer_id),
         name = CASE WHEN :hasName = 1 THEN :name ELSE name END,
         model = :model,
         pn = :pn,
         serial_no = :serialNo,
         mr_no = :mrNo,
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
      hasName: hasName ? 1 : 0,
      name: normalizedName,
      model: normalizedModel,
      pn: pn || null,
      serialNo: serialNo || null,
      mrNo: normalizeText(mrNo),
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

  await ensureDevicePartHistoryColumns()
  const [serviceOrders, schedules, serviceParts] = await Promise.all([
    query('SELECT COUNT(*) AS total FROM service_orders WHERE device_id = :id', { id: req.params.id }),
    query('SELECT COUNT(*) AS total FROM inspection_schedules WHERE device_id = :id', { id: req.params.id }),
    query('SELECT COUNT(*) AS total FROM service_parts WHERE device_id = :id', { id: req.params.id }),
  ])
  const serviceOrderCount = Number(serviceOrders[0]?.total || 0)
  const scheduleCount = Number(schedules[0]?.total || 0)
  const servicePartCount = Number(serviceParts[0]?.total || 0)
  if (serviceOrderCount || scheduleCount || servicePartCount) {
    throw badRequest(`设备已被 ${serviceOrderCount} 张工单、${scheduleCount} 个巡检计划、${servicePartCount} 条配件记录引用，不能删除`)
  }

  await query('DELETE FROM devices WHERE id = :id', { id: req.params.id })
  res.status(204).end()
}

module.exports = {
  list,
  create,
  detail,
  batchUpdate,
  update,
  remove,
  normalizeMaintenanceType,
}
