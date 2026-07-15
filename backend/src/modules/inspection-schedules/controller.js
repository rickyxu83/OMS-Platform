const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { buildOrderNo } = require('../../utils/order-no')
const { sendInspectionConfirmationMail } = require('../../services/mail')
const { assertSalesCanAccessSalesperson, buildSalesCustomerScope } = require('../../permissions/sales-scope')

const allowedCadences = new Set(['monthly', 'bi-monthly', 'quarterly'])
let inspectionSchedulesTableReady = false
let inspectionOrderColumnsReady = false

function deviceDisplaySql(alias = 'd') {
  return `COALESCE(NULLIF(CONCAT_WS(' / ', NULLIF(${alias}.model, ''), NULLIF(${alias}.serial_no, '')), ''), NULLIF(${alias}.name, ''), '-')`
}

const scheduleColumns = `
  s.id, s.name, s.customer_id, c.name AS customer_name, c.salesperson AS customer_salesperson,
  s.target_engineer_id, u.real_name AS target_engineer_name, u.username AS target_engineer_username,
  s.cadence, s.next_run_anchor, s.active, s.end_date, s.next_order_status,
  s.created_by, creator.real_name AS created_by_name, s.updated_by, updater.real_name AS updated_by_name,
  s.created_at, s.updated_at
`

function schedulePayload(row, devices = [], assignments = []) {
  const firstAssignment = assignments[0] || null
  return {
    id: row.id,
    name: row.name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    targetEngineerId: firstAssignment?.targetEngineerId || row.target_engineer_id,
    targetEngineerName: firstAssignment?.targetEngineerName || row.target_engineer_name || row.target_engineer_username,
    deviceIds: devices.map((d) => d.device_id),
    deviceNames: devices.map((d) => d.device_name).filter(Boolean),
    assignments,
    cadence: row.cadence,
    nextRunAnchor: row.next_run_anchor,
    active: Boolean(row.active),
    endDate: row.end_date,
    nextOrderStatus: row.next_order_status || 'pending_confirmation',
    createsEngineerVisibleTaskOnSave: false,
    generationSemantics: {
      targetEngineerField: 'targetEngineerId',
      visibleAssignmentField: 'assignedEngineerId',
      createsServiceOrderOnSave: false,
      createsEngineerVisibleTaskOnSave: false,
      futureGeneratedOrderStatus: row.next_order_status || 'pending_confirmation',
      confirmationRequiredBeforeEngineerVisibility: true,
    },
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function loadScheduleDevices(scheduleIds, connection = null) {
  if (!scheduleIds.length) return {}
  const execute = connection ? connection.execute.bind(connection) : query
  const params = {}
  const placeholders = scheduleIds.map((id, i) => {
    params[`id${i}`] = id
    return `:id${i}`
  })
  const rows = await execute(
    `SELECT sd.schedule_id, sd.device_id,
            ${deviceDisplaySql('d')} AS device_name
     FROM inspection_schedule_devices sd
     LEFT JOIN devices d ON d.id = sd.device_id
     WHERE sd.schedule_id IN (${placeholders.join(',')})`,
    params,
  )
  const result = {}
  for (const row of (Array.isArray(rows) ? rows : rows[0] || [])) {
    const sid = row.schedule_id
    if (!result[sid]) result[sid] = []
    result[sid].push({ device_id: row.device_id, device_name: row.device_name || '' })
  }
  return result
}

async function ensureInspectionSchedulesTable(connection = null) {
  if (inspectionSchedulesTableReady) return
  // query() 直接返回 rows,connection.execute() 返回 [rows, fields],统一包装成后者形态
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  await execute(
    `CREATE TABLE IF NOT EXISTS inspection_schedules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(160) NULL,
      customer_id BIGINT UNSIGNED NOT NULL,
      target_engineer_id BIGINT UNSIGNED NOT NULL,
      cadence ENUM('monthly', 'bi-monthly', 'quarterly') NOT NULL,
      next_run_anchor DATE NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      active_slot TINYINT GENERATED ALWAYS AS (CASE WHEN active = 1 THEN 1 ELSE NULL END) STORED,
      end_date DATE NULL,
      next_order_status ENUM('pending_confirmation') NOT NULL DEFAULT 'pending_confirmation',
      created_by BIGINT UNSIGNED NOT NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_schedule_engineer_cadence (customer_id, target_engineer_id, cadence, active_slot),
      KEY idx_inspection_schedules_customer_id (customer_id),
      KEY idx_inspection_schedules_engineer_active (target_engineer_id, active),
      KEY idx_inspection_schedules_next_run (active, next_run_anchor)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const [nameRows] = await execute(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'inspection_schedules'
       AND column_name = 'name'
     LIMIT 1`,
  )
  if (!nameRows?.[0]) {
    await execute('ALTER TABLE inspection_schedules ADD COLUMN name VARCHAR(160) NULL AFTER id')
  }
  inspectionSchedulesTableReady = true
}

function normalizeScheduleName(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.length > 160) throw badRequest('计划名称不能超过 160 个字符')
  return text
}

function normalizeDate(value, fieldName, required = true) {
  const text = String(value || '').trim()
  if (!text) {
    if (required) throw badRequest(`${fieldName}不能为空`)
    return null
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text)) {
    throw badRequest(`${fieldName}格式必须为 YYYY-MM-DD`)
  }
  return text
}

function normalizeCadence(value) {
  const cadence = String(value || '').trim()
  if (!allowedCadences.has(cadence)) {
    throw badRequest('巡检周期只能是 monthly、bi-monthly 或 quarterly')
  }
  return cadence
}

function normalizeActive(value, fallback = true) {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

function cadenceMonths(cadence) {
  if (cadence === 'bi-monthly') return 2
  if (cadence === 'quarterly') return 3
  return 1
}

function toDateKey(value) {
  const text = String(value || '').trim()
  if (!text) throw badRequest('日期不能为空')
  const date = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw badRequest('日期格式不正确')
  }
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDateByMonths(dateKey, months) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toDateTimeValue(dateKey, timeText = '09:00:00') {
  return `${dateKey} ${timeText}`
}

function todayDateKey() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function ensureInspectionOrderColumns(connection = null) {
  if (inspectionOrderColumnsReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  const [rows] = await execute(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND column_name IN (
         'inspection_schedule_id', 'inspection_occurrence_date', 'target_engineer_id', 'confirmed_by', 'confirmed_at'
       )`,
  )
  const existing = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!existing.has('inspection_schedule_id')) {
    await execute('ALTER TABLE service_orders ADD COLUMN inspection_schedule_id BIGINT UNSIGNED NULL AFTER internal_note')
  }
  if (!existing.has('inspection_occurrence_date')) {
    await execute('ALTER TABLE service_orders ADD COLUMN inspection_occurrence_date DATE NULL AFTER inspection_schedule_id')
  }
  if (!existing.has('target_engineer_id')) {
    await execute('ALTER TABLE service_orders ADD COLUMN target_engineer_id BIGINT UNSIGNED NULL AFTER inspection_occurrence_date')
  }
  if (!existing.has('confirmed_by')) {
    await execute('ALTER TABLE service_orders ADD COLUMN confirmed_by BIGINT UNSIGNED NULL AFTER target_engineer_id')
  }
  if (!existing.has('confirmed_at')) {
    await execute('ALTER TABLE service_orders ADD COLUMN confirmed_at DATETIME NULL AFTER confirmed_by')
  }
  await execute(
    `CREATE TABLE IF NOT EXISTS service_order_devices (
      service_order_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (service_order_id, device_id),
      KEY idx_service_order_devices_device_id (device_id),
      CONSTRAINT fk_service_order_devices_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id),
      CONSTRAINT fk_service_order_devices_device_id FOREIGN KEY (device_id) REFERENCES devices (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  const [statusRows] = await execute(
    `SELECT column_type AS columnType
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND column_name = 'status'
     LIMIT 1`,
  )
  const statusType = statusRows[0]?.columnType || statusRows[0]?.column_type || ''
  if (!String(statusType).includes("'pending_confirmation'")) {
    await execute(
      `ALTER TABLE service_orders MODIFY COLUMN status ENUM(
        'draft', 'pending_confirmation', 'awaiting_customer_signature', 'assigned', 'in_progress', 'submitted', 'rejected', 'approved', 'archived', 'cancelled'
      ) NOT NULL DEFAULT 'draft'`,
    )
  } else if (!String(statusType).includes("'awaiting_customer_signature'")) {
    await execute(
      `ALTER TABLE service_orders MODIFY COLUMN status ENUM(
        'draft', 'pending_confirmation', 'awaiting_customer_signature', 'assigned', 'in_progress', 'submitted', 'rejected', 'approved', 'archived', 'cancelled'
      ) NOT NULL DEFAULT 'draft'`,
    )
  }

  const [indexRows] = await execute(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND index_name IN (
         'uk_service_orders_inspection_occurrence', 'idx_service_orders_target_engineer', 'idx_service_orders_inspection_schedule'
       )`,
  )
  const indexes = new Set(indexRows.map((row) => row.indexName || row.index_name))
  if (indexes.has('uk_service_orders_inspection_occurrence')) {
    const [indexColumns] = await execute(
      `SELECT column_name AS columnName
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'service_orders'
         AND index_name = 'uk_service_orders_inspection_occurrence'
       ORDER BY seq_in_index`,
    )
    const columns = indexColumns.map((row) => row.columnName || row.column_name)
    if (!columns.includes('target_engineer_id')) {
      await execute('ALTER TABLE service_orders DROP KEY uk_service_orders_inspection_occurrence')
      indexes.delete('uk_service_orders_inspection_occurrence')
    }
  }
  if (!indexes.has('uk_service_orders_inspection_occurrence')) {
    await execute('ALTER TABLE service_orders ADD UNIQUE KEY uk_service_orders_inspection_occurrence (inspection_schedule_id, inspection_occurrence_date, target_engineer_id)')
  }
  if (!indexes.has('idx_service_orders_target_engineer')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_target_engineer (target_engineer_id)')
  }
  if (!indexes.has('idx_service_orders_inspection_schedule')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_inspection_schedule (inspection_schedule_id)')
  }

  inspectionOrderColumnsReady = true
}

async function nextOrderNo(connection, now = new Date()) {
  const prefix = buildOrderNo(0, now).slice(0, 10)
  const [countRows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM service_orders
     WHERE order_no LIKE :prefix`,
    { prefix: `${prefix}%` },
  )
  return buildOrderNo(Number(countRows[0]?.total || 0) + 1, now)
}

async function createInspectionOrder(connection, schedule, occurrenceDate, assignment) {
  const deviceList = assignment.devices || []
  const targetEngineerId = Number(assignment.targetEngineerId || 0)
  const occurrenceStartAt = toDateTimeValue(occurrenceDate, '09:00:00')
  const occurrenceEndAt = toDateTimeValue(occurrenceDate, '17:00:00')
  const existingRows = await connection.execute(
    `SELECT id
     FROM service_orders
     WHERE inspection_schedule_id = :scheduleId
       AND inspection_occurrence_date = :occurrenceDate
       AND target_engineer_id = :targetEngineerId
     LIMIT 1`,
    { scheduleId: schedule.id, occurrenceDate, targetEngineerId },
  )
  if (existingRows[0][0]) return { created: false, orderId: existingRows[0][0].id, targetEngineerId }

  const deviceNames = deviceList.filter((device) => device.deviceName).map((device) => device.deviceName)
  const deviceNameText = deviceNames.length > 0 ? deviceNames.join('、') : ''
  const orderNo = await nextOrderNo(connection)
  const [insertResult] = await connection.execute(
    `INSERT INTO service_orders (
       order_no, customer_id, device_id, service_mode, service_type, timesheet_category, timesheet_salesperson,
       priority, status, issue_description,
       assigned_engineer_id, planned_start_at, planned_end_at, internal_note, created_by,
       inspection_schedule_id, inspection_occurrence_date, target_engineer_id, confirmed_by, confirmed_at
     )
     VALUES (
       :orderNo, :customerId, NULL, 'onsite', 'inspect', NULL, NULL,
      'normal', 'pending_confirmation', :issueDescription,
       NULL, :plannedStartAt, :plannedEndAt, :internalNote, :createdBy,
       :inspectionScheduleId, :inspectionOccurrenceDate, :targetEngineerId, NULL, NULL
     )`,
    {
      orderNo,
      customerId: schedule.customer_id,
      issueDescription: '设备巡检',
      plannedStartAt: occurrenceStartAt,
      plannedEndAt: occurrenceEndAt,
      internalNote: deviceNameText
        ? `巡检计划 ${schedule.id} 自动生成（设备：${deviceNameText}），待主管确认`
        : `巡检计划 ${schedule.id} 自动生成，待主管确认`,
      createdBy: schedule.created_by,
      inspectionScheduleId: schedule.id,
      inspectionOccurrenceDate: occurrenceDate,
      targetEngineerId,
    },
  )

  for (const device of deviceList) {
    await connection.execute(
      `INSERT IGNORE INTO service_order_devices (service_order_id, device_id)
       VALUES (:orderId, :deviceId)`,
      { orderId: insertResult.insertId, deviceId: device.deviceId },
    )
  }

  return { created: true, orderId: insertResult.insertId, orderNo, targetEngineerId }
}

async function loadInspectionOrderForMail(orderId) {
  const rows = await query(
    `SELECT so.id, so.order_no, so.customer_id, c.name AS customer_name,
            so.device_id,
            ${deviceDisplaySql('d')} AS device_name,
            so.issue_description,
            so.planned_start_at, so.planned_end_at
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     WHERE so.id = :orderId
     LIMIT 1`,
    { orderId },
  )
  return rows[0] || null
}

function triggerInspectionConfirmationMail(orderId) {
  loadInspectionOrderForMail(orderId)
    .then((order) => {
      if (!order) return { skipped: true, reason: 'order_not_found' }
      return sendInspectionConfirmationMail(order)
    })
    .then((result) => {
      if (result?.skipped) {
        console.warn('[mail] inspection confirmation notification skipped', {
          orderId,
          reason: result.reason || 'unknown',
          missing: result.missing,
          recipientIds: result.recipientIds,
        })
      }
    })
    .catch((error) => {
      console.error('[mail] inspection confirmation notification failed', { orderId, message: error?.message })
    })
}

function nextAnchorAfterOccurrence(schedule, occurrenceDate) {
  let nextRunAnchor = shiftDateByMonths(occurrenceDate, cadenceMonths(schedule.cadence))
  if (schedule.end_date && nextRunAnchor > toDateKey(schedule.end_date)) {
    return { nextRunAnchor, active: false }
  }
  return { nextRunAnchor, active: Boolean(schedule.active) }
}

async function advanceSchedule(connection, scheduleId, nextRunAnchor, active, updatedBy) {
  await connection.execute(
    `UPDATE inspection_schedules
     SET next_run_anchor = :nextRunAnchor,
         active = :active,
         updated_by = :updatedBy
     WHERE id = :id`,
    {
      id: scheduleId,
      nextRunAnchor,
      active: active ? 1 : 0,
      updatedBy,
    },
  )
}

function duplicateScheduleError(error) {
  if (error?.code === 'ER_DUP_ENTRY' && String(error.message || '').includes('uk_schedule_engineer_cadence')) {
    return badRequest('该客户、工程师和周期组合已存在启用中的巡检计划')
  }
  return null
}

let inspectionScheduleDevicesReady = false
let inspectionScheduleAssignmentsReady = false

async function ensureInspectionScheduleDevicesTable(connection = null) {
  if (inspectionScheduleDevicesReady) return
  // query() 直接返回 rows,connection.execute() 返回 [rows, fields],统一包装成后者形态
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  await execute(
    `CREATE TABLE IF NOT EXISTS inspection_schedule_devices (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      schedule_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_schedule_device (schedule_id, device_id),
      KEY idx_schedule_devices_device (device_id),
      CONSTRAINT fk_schedule_devices_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
      CONSTRAINT fk_schedule_devices_device FOREIGN KEY (device_id) REFERENCES devices (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  if (inspectionScheduleDevicesReady === false) inspectionScheduleDevicesReady = true
}

async function ensureInspectionScheduleAssignmentsTable(connection = null) {
  if (inspectionScheduleAssignmentsReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  await execute(
    `CREATE TABLE IF NOT EXISTS inspection_schedule_assignments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      schedule_id BIGINT UNSIGNED NOT NULL,
      engineer_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_inspection_assignment_device (schedule_id, device_id),
      KEY idx_inspection_assignments_engineer (engineer_id),
      KEY idx_inspection_assignments_device (device_id),
      CONSTRAINT fk_inspection_assignments_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
      CONSTRAINT fk_inspection_assignments_engineer FOREIGN KEY (engineer_id) REFERENCES users (id),
      CONSTRAINT fk_inspection_assignments_device FOREIGN KEY (device_id) REFERENCES devices (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await execute(
    `INSERT IGNORE INTO inspection_schedule_assignments (schedule_id, engineer_id, device_id)
     SELECT sd.schedule_id, s.target_engineer_id, sd.device_id
     FROM inspection_schedule_devices sd
     JOIN inspection_schedules s ON s.id = sd.schedule_id
     WHERE s.target_engineer_id IS NOT NULL`,
  )
  const [legacyUnique] = await execute(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'inspection_schedules'
       AND index_name = 'uk_schedule_engineer_cadence'
     LIMIT 1`,
  )
  if (legacyUnique?.[0]) {
    const [engineerIndex] = await execute(
      `SELECT index_name AS indexName
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'inspection_schedules'
         AND index_name = 'idx_inspection_schedules_target_engineer'
       LIMIT 1`,
    )
    if (!engineerIndex?.[0]) {
      await execute('ALTER TABLE inspection_schedules ADD KEY idx_inspection_schedules_target_engineer (target_engineer_id)')
    }
    await execute('ALTER TABLE inspection_schedules DROP KEY uk_schedule_engineer_cadence')
  }
  inspectionScheduleAssignmentsReady = true
}

function normalizeAssignments(value) {
  if (!Array.isArray(value) || value.length === 0) throw badRequest('请至少配置一条巡检分工')
  if (value.length > 200) throw badRequest('巡检设备数量不能超过 200 台')
  const deviceIds = new Set()
  const assignments = []
  for (const item of value) {
    const targetEngineerId = Number(item?.targetEngineerId || item?.engineerId || 0)
    const deviceId = Number(item?.deviceId || 0)
    if (!targetEngineerId || !deviceId) throw badRequest('巡检分工必须同时指定工程师和设备')
    if (deviceIds.has(deviceId)) throw badRequest('同一台设备在一个巡检计划中只能分配给一名工程师')
    deviceIds.add(deviceId)
    assignments.push({ targetEngineerId, deviceId })
  }
  return assignments
}

async function replaceScheduleAssignments(connection, scheduleId, assignments) {
  await connection.execute('DELETE FROM inspection_schedule_assignments WHERE schedule_id = :scheduleId', { scheduleId })
  await connection.execute('DELETE FROM inspection_schedule_devices WHERE schedule_id = :scheduleId', { scheduleId })
  for (const assignment of assignments) {
    await connection.execute(
      `INSERT INTO inspection_schedule_assignments (schedule_id, engineer_id, device_id)
       VALUES (:scheduleId, :engineerId, :deviceId)`,
      { scheduleId, engineerId: assignment.targetEngineerId, deviceId: assignment.deviceId },
    )
    await connection.execute(
      `INSERT INTO inspection_schedule_devices (schedule_id, device_id)
       VALUES (:scheduleId, :deviceId)`,
      { scheduleId, deviceId: assignment.deviceId },
    )
  }
}

async function loadScheduleAssignments(scheduleIds, connection = null) {
  if (!scheduleIds.length) return {}
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  const params = {}
  const placeholders = scheduleIds.map((id, index) => {
    params[`scheduleId${index}`] = id
    return `:scheduleId${index}`
  })
  const [rows] = await execute(
    `SELECT isa.schedule_id, isa.engineer_id, isa.device_id,
            u.real_name AS engineer_name, u.username AS engineer_username,
            ${deviceDisplaySql('d')} AS device_name
     FROM inspection_schedule_assignments isa
     JOIN users u ON u.id = isa.engineer_id
     JOIN devices d ON d.id = isa.device_id
     WHERE isa.schedule_id IN (${placeholders.join(',')})
     ORDER BY isa.schedule_id, u.real_name, u.username, isa.id`,
    params,
  )
  const grouped = {}
  for (const row of rows) {
    if (!grouped[row.schedule_id]) grouped[row.schedule_id] = new Map()
    const engineerId = Number(row.engineer_id)
    if (!grouped[row.schedule_id].has(engineerId)) {
      grouped[row.schedule_id].set(engineerId, {
        targetEngineerId: engineerId,
        targetEngineerName: row.engineer_name || row.engineer_username || '',
        deviceIds: [],
        deviceNames: [],
        devices: [],
      })
    }
    const assignment = grouped[row.schedule_id].get(engineerId)
    assignment.deviceIds.push(Number(row.device_id))
    assignment.deviceNames.push(row.device_name || '')
    assignment.devices.push({ deviceId: Number(row.device_id), deviceName: row.device_name || '' })
  }
  return Object.fromEntries(Object.entries(grouped).map(([scheduleId, byEngineer]) => [scheduleId, [...byEngineer.values()]]))
}

async function prewarmInspectionSchema() {
  // 事务内 CREATE/ALTER 会触发 MySQL 隐式提交、破坏原子性,统一在事务外提前完成惰性 DDL
  await ensureInspectionSchedulesTable()
  await ensureInspectionScheduleDevicesTable()
  await ensureInspectionScheduleAssignmentsTable()
  await ensureInspectionOrderColumns()
}

async function assertDeviceBelongsToCustomer(connection, customerId, deviceId) {
  if (!deviceId) return
  const [rows] = await connection.execute(
    `SELECT d.id
     FROM devices d
     WHERE d.id = :deviceId AND d.customer_id = :customerId
     LIMIT 1`,
    { customerId, deviceId },
  )
  if (!rows[0]) {
    throw badRequest('设备不属于所选客户')
  }
}

async function assertActiveEngineer(connection, engineerId) {
  const [rows] = await connection.execute(
    `SELECT id
     FROM users
     WHERE id = :engineerId AND role = 'engineer' AND status = 'active'
     LIMIT 1`,
    { engineerId },
  )
  if (!rows[0]) {
    throw badRequest('目标工程师不存在或未启用')
  }
}

async function assertNoDuplicateActive(connection, { id = null, customerId, targetEngineerId, cadence, active }) {
  if (!active) return
  const [rows] = await connection.execute(
    `SELECT id
     FROM inspection_schedules
     WHERE customer_id = :customerId
       AND target_engineer_id = :targetEngineerId
       AND cadence = :cadence
       AND active = 1
       AND (:id IS NULL OR id <> :id)
     LIMIT 1`,
    { id, customerId, targetEngineerId, cadence },
  )
  if (rows[0]) {
    throw badRequest('该客户、工程师和周期组合已存在启用中的巡检计划')
  }
}

async function loadSchedule(id) {
  await ensureInspectionScheduleDevicesTable()
  await ensureInspectionScheduleAssignmentsTable()
  const rows = await query(
    `SELECT ${scheduleColumns}
     FROM inspection_schedules s
     JOIN customers c ON c.id = s.customer_id
     JOIN users u ON u.id = s.target_engineer_id
     JOIN users creator ON creator.id = s.created_by
     LEFT JOIN users updater ON updater.id = s.updated_by
     WHERE s.id = :id
     LIMIT 1`,
    { id },
  )
  if (!rows[0]) return null
  const devices = (await loadScheduleDevices([id]))[id] || []
  const assignments = (await loadScheduleAssignments([id]))[id] || []
  return { ...rows[0], _devices: devices, _assignments: assignments }
}

async function list(req, res) {
  await ensureInspectionSchedulesTable()
  await ensureInspectionScheduleDevicesTable()
  await ensureInspectionScheduleAssignmentsTable()
  const { customerId = null, deviceId = null, targetEngineerId = null, cadence = '', active = '', page = '1', pageSize = '50' } = req.query
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50))
  const offset = (normalizedPage - 1) * normalizedPageSize
  const activeFilter = active === '' ? null : ['1', 'true', 'active'].includes(String(active).toLowerCase()) ? 1 : 0

  if (cadence) normalizeCadence(cadence)

  const params = {
    customerId: customerId || null,
    deviceId: deviceId || null,
    targetEngineerId: targetEngineerId || null,
    cadence,
    active: activeFilter,
  }
  const salesScope = buildSalesCustomerScope(req.user, 'c')
  const fromAndWhere = `
    FROM inspection_schedules s
    JOIN customers c ON c.id = s.customer_id
    JOIN users u ON u.id = s.target_engineer_id
    JOIN users creator ON creator.id = s.created_by
    LEFT JOIN users updater ON updater.id = s.updated_by
    WHERE (:customerId IS NULL OR s.customer_id = :customerId)
      ${salesScope.sql}
      AND (:deviceId IS NULL OR EXISTS (
        SELECT 1 FROM inspection_schedule_devices sd WHERE sd.schedule_id = s.id AND sd.device_id = :deviceId
      ))
      AND (:targetEngineerId IS NULL OR EXISTS (
        SELECT 1 FROM inspection_schedule_assignments isa
        WHERE isa.schedule_id = s.id AND isa.engineer_id = :targetEngineerId
      ))
      AND (:cadence = '' OR s.cadence = :cadence)
      AND (:active IS NULL OR s.active = :active)
  `
  const scopedParams = { ...params, ...salesScope.params }
  const countRows = await query(`SELECT COUNT(*) AS total ${fromAndWhere}`, scopedParams)
  const rows = await query(
    `SELECT ${scheduleColumns}
     ${fromAndWhere}
     ORDER BY s.active DESC, s.next_run_anchor ASC, s.id DESC
     LIMIT ${normalizedPageSize} OFFSET ${offset}`,
    scopedParams,
  )

  const scheduleIds = rows.map((r) => r.id)
  const deviceMap = await loadScheduleDevices(scheduleIds)
  const assignmentMap = await loadScheduleAssignments(scheduleIds)
  const items = rows.map((row) => schedulePayload(row, deviceMap[row.id] || [], assignmentMap[row.id] || []))

  res.json({
    items,
    total: Number(countRows[0]?.total || 0),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })
}

async function create(req, res) {
  const { name = '', customerId, deviceIds = [], targetEngineerId, assignments: rawAssignments, cadence, nextRunAnchor, active = true, endDate = null } = req.body || {}
  const normalizedCustomerId = Number(customerId || 0)
  if (!normalizedCustomerId) throw badRequest('客户不能为空')
  const fallbackAssignments = Array.isArray(deviceIds)
    ? deviceIds.map((deviceId) => ({ deviceId, targetEngineerId }))
    : []
  const normalizedAssignments = normalizeAssignments(rawAssignments || fallbackAssignments)
  const normalizedName = normalizeScheduleName(name)
  const normalizedCadence = normalizeCadence(cadence)
  const normalizedNextRunAnchor = normalizeDate(nextRunAnchor, '下次运行锚点')
  const normalizedEndDate = normalizeDate(endDate, '结束日期', false)
  if (normalizedEndDate && normalizedEndDate < normalizedNextRunAnchor) {
    throw badRequest('结束日期不能早于下次运行锚点')
  }
  const normalizedActive = normalizeActive(active, true)

  let created
  try {
    await prewarmInspectionSchema()
    created = await transaction(async (connection) => {
      await ensureInspectionSchedulesTable(connection)
      await ensureInspectionScheduleDevicesTable(connection)
      await ensureInspectionScheduleAssignmentsTable(connection)
      const engineerIds = [...new Set(normalizedAssignments.map((item) => item.targetEngineerId))]
      for (const engineerId of engineerIds) await assertActiveEngineer(connection, engineerId)
      for (const item of normalizedAssignments) await assertDeviceBelongsToCustomer(connection, normalizedCustomerId, item.deviceId)
      const legacyTargetEngineerId = engineerIds[0]
      const [result] = await connection.execute(
        `INSERT INTO inspection_schedules (
          name, customer_id, target_engineer_id, cadence, next_run_anchor,
          active, end_date, next_order_status, created_by
        )
        VALUES (
          :name, :customerId, :targetEngineerId, :cadence, :nextRunAnchor,
          :active, :endDate, 'pending_confirmation', :createdBy
        )`,
        {
          name: normalizedName,
          customerId: normalizedCustomerId,
          targetEngineerId: legacyTargetEngineerId,
          cadence: normalizedCadence,
          nextRunAnchor: normalizedNextRunAnchor,
          active: normalizedActive ? 1 : 0,
          endDate: normalizedEndDate,
          createdBy: req.user.id,
        },
      )
      const scheduleId = result.insertId
      await replaceScheduleAssignments(connection, scheduleId, normalizedAssignments)
      return { id: scheduleId }
    })
  } catch (error) {
    throw duplicateScheduleError(error) || error
  }

  const row = await loadSchedule(created.id)
  res.status(201).json({ item: schedulePayload(row, row._devices, row._assignments) })
}

async function createBulk(req, res) {
  return create(req, res)
}

async function detail(req, res) {
  await ensureInspectionSchedulesTable()
  await ensureInspectionScheduleDevicesTable()
  await ensureInspectionScheduleAssignmentsTable()
  const row = await loadSchedule(req.params.id)
  if (!row) {
    throw notFound('巡检计划不存在')
  }
  assertSalesCanAccessSalesperson(row.customer_salesperson, req.user, forbidden)
  res.json({ item: schedulePayload(row, row._devices, row._assignments) })
}

async function update(req, res) {
  await prewarmInspectionSchema()
  const existing = await loadSchedule(req.params.id)
  if (!existing) {
    throw notFound('巡检计划不存在')
  }

  const body = req.body || {}
  const normalizedCustomerId = body.customerId !== undefined ? Number(body.customerId || 0) : Number(existing.customer_id)
  if (!normalizedCustomerId) throw badRequest('客户不能为空')
  const existingAssignments = (existing._assignments || []).flatMap((group) =>
    group.deviceIds.map((deviceId) => ({ targetEngineerId: group.targetEngineerId, deviceId })))
  const fallbackAssignments = Array.isArray(body.deviceIds)
    ? body.deviceIds.map((deviceId) => ({ deviceId, targetEngineerId: body.targetEngineerId || body.targetEngineerIds?.[0] }))
    : existingAssignments
  const normalizedAssignments = normalizeAssignments(body.assignments || fallbackAssignments)

  const normalizedCadence = body.cadence !== undefined ? normalizeCadence(body.cadence) : existing.cadence
  const normalizedNextRunAnchor = body.nextRunAnchor !== undefined ? normalizeDate(body.nextRunAnchor, '下次运行锚点') : existing.next_run_anchor
  const normalizedEndDate = body.endDate !== undefined ? normalizeDate(body.endDate, '结束日期', false) : existing.end_date
  const normalizedName = body.name !== undefined ? normalizeScheduleName(body.name) : existing.name
  if (normalizedEndDate && normalizedEndDate < normalizedNextRunAnchor) throw badRequest('结束日期不能早于下次运行锚点')
  const normalizedActive = normalizeActive(body.active, Boolean(existing.active))

  try {
    await transaction(async (connection) => {
      await ensureInspectionSchedulesTable(connection)
      await ensureInspectionScheduleDevicesTable(connection)
      await ensureInspectionScheduleAssignmentsTable(connection)
      const engineerIds = [...new Set(normalizedAssignments.map((item) => item.targetEngineerId))]
      for (const engineerId of engineerIds) await assertActiveEngineer(connection, engineerId)
      for (const item of normalizedAssignments) await assertDeviceBelongsToCustomer(connection, normalizedCustomerId, item.deviceId)
      await connection.execute(
        `UPDATE inspection_schedules
         SET name = :name,
             customer_id = :customerId,
             target_engineer_id = :targetEngineerId,
             cadence = :cadence,
             next_run_anchor = :nextRunAnchor,
             active = :active,
             end_date = :endDate,
             next_order_status = 'pending_confirmation',
             updated_by = :updatedBy
         WHERE id = :id`,
        {
          id: req.params.id,
          name: normalizedName,
          customerId: normalizedCustomerId,
          targetEngineerId: engineerIds[0],
          cadence: normalizedCadence,
          nextRunAnchor: normalizedNextRunAnchor,
          active: normalizedActive ? 1 : 0,
          endDate: normalizedEndDate,
          updatedBy: req.user.id,
        },
      )
      await replaceScheduleAssignments(connection, req.params.id, normalizedAssignments)
    })
  } catch (error) {
    throw duplicateScheduleError(error) || error
  }

  const row = await loadSchedule(req.params.id)
  res.json({ item: schedulePayload(row, row._devices, row._assignments) })
}

async function remove(req, res) {
  await ensureInspectionSchedulesTable()
  await ensureInspectionOrderColumns()
  const existing = await loadSchedule(req.params.id)
  if (!existing) {
    throw notFound('巡检计划不存在')
  }
  if (req.user.role === 'assistant') {
    const orders = await query('SELECT COUNT(*) AS total FROM service_orders WHERE inspection_schedule_id = :id', { id: req.params.id })
    if (Number(orders[0]?.total || 0) > 0) {
      throw badRequest('该巡检计划已生成工单，助理不能删除')
    }
  }
  await query('DELETE FROM inspection_schedules WHERE id = :id', { id: req.params.id })
  res.status(204).end()
}

async function generateDue(req, res) {
  await ensureInspectionSchedulesTable()
  await ensureInspectionScheduleDevicesTable()
  await ensureInspectionScheduleAssignmentsTable()
  await ensureInspectionOrderColumns()

  const dueDate = normalizeDate(req.body?.dueDate || req.query?.dueDate || todayDateKey(), '生成截止日期')
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit || req.query?.limit || 50)))

  const rows = await query(
    `SELECT ${scheduleColumns}
     FROM inspection_schedules s
     JOIN customers c ON c.id = s.customer_id
     JOIN users u ON u.id = s.target_engineer_id
     JOIN users creator ON creator.id = s.created_by
     LEFT JOIN users updater ON updater.id = s.updated_by
     WHERE s.active = 1
       AND s.next_run_anchor <= :dueDate
       AND (s.end_date IS NULL OR s.next_run_anchor <= s.end_date)
     ORDER BY s.next_run_anchor ASC, s.id ASC
     LIMIT ${limit}`,
    { dueDate },
  )

  const scheduleIds = rows.map((r) => r.id)
  const assignmentMap = scheduleIds.length ? await loadScheduleAssignments(scheduleIds) : {}

  const items = []
  const createdOrderIds = []
  await transaction(async (connection) => {
    await ensureInspectionSchedulesTable(connection)
    await ensureInspectionScheduleDevicesTable(connection)
    await ensureInspectionScheduleAssignmentsTable(connection)
    await ensureInspectionOrderColumns(connection)

    for (const schedule of rows) {
      const occurrenceDate = toDateKey(schedule.next_run_anchor)
      const assignments = assignmentMap[schedule.id] || []
      const results = []
      for (const assignment of assignments) {
        results.push(await createInspectionOrder(connection, schedule, occurrenceDate, assignment))
      }
      const nextState = nextAnchorAfterOccurrence(schedule, occurrenceDate)
      await advanceSchedule(connection, schedule.id, nextState.nextRunAnchor, nextState.active, req.user.id)
      for (const result of results) {
        items.push({
          scheduleId: schedule.id,
          occurrenceDate,
          targetEngineerId: result.targetEngineerId || null,
          created: result.created,
          orderId: result.orderId,
          orderNo: result.orderNo || null,
          nextRunAnchor: nextState.nextRunAnchor,
          active: nextState.active,
        })
        if (result.created) createdOrderIds.push(result.orderId)
      }
    }
  })

  createdOrderIds.forEach((orderId) => triggerInspectionConfirmationMail(orderId))

  res.json({
    dueDate,
    generated: items.filter((item) => item.created).length,
    skipped: items.filter((item) => !item.created).length,
    items,
  })
}

module.exports = {
  list,
  create,
  createBulk,
  generateDue,
  detail,
  update,
  remove,
}
