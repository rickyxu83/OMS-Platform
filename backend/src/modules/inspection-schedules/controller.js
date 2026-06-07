const { query, transaction } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')
const { buildOrderNo } = require('../../utils/order-no')

const allowedCadences = new Set(['monthly', 'bi-monthly', 'quarterly'])
let inspectionSchedulesTableReady = false
let inspectionOrderColumnsReady = false

const scheduleColumns = `
  s.id, s.customer_id, c.name AS customer_name, s.device_id, d.name AS device_name,
  s.target_engineer_id, u.real_name AS target_engineer_name, u.username AS target_engineer_username,
  s.cadence, s.next_run_anchor, s.active, s.end_date, s.next_order_status,
  s.created_by, creator.real_name AS created_by_name, s.updated_by, updater.real_name AS updated_by_name,
  s.created_at, s.updated_at
`

function schedulePayload(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    deviceId: row.device_id,
    deviceName: row.device_name || '',
    targetEngineerId: row.target_engineer_id,
    targetEngineerName: row.target_engineer_name || row.target_engineer_username,
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

async function ensureInspectionSchedulesTable(connection = null) {
  if (!connection && inspectionSchedulesTableReady) return
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS inspection_schedules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NULL,
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
      UNIQUE KEY uk_inspection_schedules_active_combo (device_id, target_engineer_id, cadence, active_slot),
      KEY idx_inspection_schedules_customer_id (customer_id),
      KEY idx_inspection_schedules_engineer_active (target_engineer_id, active),
      KEY idx_inspection_schedules_next_run (active, next_run_anchor)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const [deviceRows] = await executor.execute(
    `SELECT is_nullable AS isNullable
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'inspection_schedules'
       AND column_name = 'device_id'
     LIMIT 1`,
  )
  const deviceNullable = deviceRows?.[0]?.isNullable || deviceRows?.[0]?.is_nullable || 'YES'
  if (String(deviceNullable).toUpperCase() !== 'YES') {
    await executor.execute('ALTER TABLE inspection_schedules MODIFY COLUMN device_id BIGINT UNSIGNED NULL')
  }
  if (!connection) {
    inspectionSchedulesTableReady = true
  }
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
  if (!connection && inspectionOrderColumnsReady) return
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
        'draft', 'pending_confirmation', 'assigned', 'in_progress', 'submitted', 'rejected', 'approved', 'archived', 'cancelled'
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
  if (!indexes.has('uk_service_orders_inspection_occurrence')) {
    await execute('ALTER TABLE service_orders ADD UNIQUE KEY uk_service_orders_inspection_occurrence (inspection_schedule_id, inspection_occurrence_date)')
  }
  if (!indexes.has('idx_service_orders_target_engineer')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_target_engineer (target_engineer_id)')
  }
  if (!indexes.has('idx_service_orders_inspection_schedule')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_inspection_schedule (inspection_schedule_id)')
  }

  if (!connection) {
    inspectionOrderColumnsReady = true
  }
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

async function createInspectionOrder(connection, schedule, occurrenceDate) {
  const occurrenceStartAt = toDateTimeValue(occurrenceDate, '09:00:00')
  const occurrenceEndAt = toDateTimeValue(occurrenceDate, '17:00:00')
  const existingRows = await connection.execute(
    `SELECT id
     FROM service_orders
     WHERE inspection_schedule_id = :scheduleId
       AND inspection_occurrence_date = :occurrenceDate
     LIMIT 1`,
    { scheduleId: schedule.id, occurrenceDate },
  )
  if (existingRows[0][0]) return { created: false, orderId: existingRows[0][0].id }

  const orderNo = await nextOrderNo(connection)
  const [insertResult] = await connection.execute(
    `INSERT INTO service_orders (
       order_no, customer_id, device_id, service_mode, service_type, timesheet_category, timesheet_salesperson,
       priority, status, issue_description,
       assigned_engineer_id, planned_start_at, planned_end_at, internal_note, created_by,
       inspection_schedule_id, inspection_occurrence_date, target_engineer_id, confirmed_by, confirmed_at
     )
     VALUES (
       :orderNo, :customerId, :deviceId, 'onsite', 'inspect', NULL, NULL,
      'normal', 'pending_confirmation', :issueDescription,
       NULL, :plannedStartAt, :plannedEndAt, :internalNote, :createdBy,
       :inspectionScheduleId, :inspectionOccurrenceDate, :targetEngineerId, NULL, NULL
     )`,
    {
      orderNo,
      customerId: schedule.customer_id,
      deviceId: schedule.device_id || null,
      issueDescription: schedule.device_name
        ? `巡检计划自动生成：${schedule.customer_name} / ${schedule.device_name}，周期 ${schedule.cadence}`
        : `巡检计划自动生成：${schedule.customer_name}，周期 ${schedule.cadence}`,
      plannedStartAt: occurrenceStartAt,
      plannedEndAt: occurrenceEndAt,
      internalNote: schedule.device_name
        ? `巡检计划 ${schedule.id} 自动生成（设备：${schedule.device_name}），待主管确认`
        : `巡检计划 ${schedule.id} 自动生成（未指定设备），待主管确认`,
      createdBy: schedule.created_by,
      inspectionScheduleId: schedule.id,
      inspectionOccurrenceDate: occurrenceDate,
      targetEngineerId: schedule.target_engineer_id,
    },
  )

  return { created: true, orderId: insertResult.insertId, orderNo }
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
  if (error?.code === 'ER_DUP_ENTRY' && String(error.message || '').includes('uk_inspection_schedules_active_combo')) {
    return badRequest('同一设备、目标工程师和周期已存在启用中的巡检计划')
  }
  return null
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

async function assertNoDuplicateActive(connection, { id = null, customerId, deviceId, targetEngineerId, cadence, active }) {
  if (!active) return
  const [rows] = deviceId
    ? await connection.execute(
        `SELECT id
         FROM inspection_schedules
         WHERE device_id = :deviceId
           AND target_engineer_id = :targetEngineerId
           AND cadence = :cadence
           AND active = 1
           AND (:id IS NULL OR id <> :id)
         LIMIT 1`,
        { id, deviceId, targetEngineerId, cadence },
      )
    : await connection.execute(
        `SELECT id
         FROM inspection_schedules
         WHERE customer_id = :customerId
           AND device_id IS NULL
           AND target_engineer_id = :targetEngineerId
           AND cadence = :cadence
           AND active = 1
           AND (:id IS NULL OR id <> :id)
         LIMIT 1`,
        { id, customerId, targetEngineerId, cadence },
      )
  if (rows[0]) {
    throw badRequest(deviceId ? '同一设备、目标工程师和周期已存在启用中的巡检计划' : '同一客户、目标工程师和周期已存在未指定设备的启用巡检计划')
  }
}

async function loadSchedule(id) {
  const rows = await query(
    `SELECT ${scheduleColumns}
     FROM inspection_schedules s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN devices d ON d.id = s.device_id
     JOIN users u ON u.id = s.target_engineer_id
     JOIN users creator ON creator.id = s.created_by
     LEFT JOIN users updater ON updater.id = s.updated_by
     WHERE s.id = :id
     LIMIT 1`,
    { id },
  )
  return rows[0]
}

async function list(req, res) {
  await ensureInspectionSchedulesTable()
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
  const fromAndWhere = `
    FROM inspection_schedules s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN devices d ON d.id = s.device_id
    JOIN users u ON u.id = s.target_engineer_id
    JOIN users creator ON creator.id = s.created_by
    LEFT JOIN users updater ON updater.id = s.updated_by
    WHERE (:customerId IS NULL OR s.customer_id = :customerId)
      AND (:deviceId IS NULL OR s.device_id = :deviceId)
      AND (:targetEngineerId IS NULL OR s.target_engineer_id = :targetEngineerId)
      AND (:cadence = '' OR s.cadence = :cadence)
      AND (:active IS NULL OR s.active = :active)
  `
  const countRows = await query(`SELECT COUNT(*) AS total ${fromAndWhere}`, params)
  const rows = await query(
    `SELECT ${scheduleColumns}
     ${fromAndWhere}
     ORDER BY s.active DESC, s.next_run_anchor ASC, s.id DESC
     LIMIT ${normalizedPageSize} OFFSET ${offset}`,
    params,
  )

  res.json({
    items: rows.map(schedulePayload),
    total: Number(countRows[0]?.total || 0),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })
}

async function create(req, res) {
  const { customerId, deviceId, targetEngineerId, cadence, nextRunAnchor, active = true, endDate = null } = req.body || {}
  const normalizedCustomerId = Number(customerId || 0)
  const normalizedDeviceId = Number(deviceId || 0) || null
  const normalizedEngineerId = Number(targetEngineerId || 0)
  if (!normalizedCustomerId || !normalizedEngineerId) {
    throw badRequest('客户和目标工程师不能为空')
  }
  const normalizedCadence = normalizeCadence(cadence)
  const normalizedNextRunAnchor = normalizeDate(nextRunAnchor, '下次运行锚点')
  const normalizedEndDate = normalizeDate(endDate, '结束日期', false)
  if (normalizedEndDate && normalizedEndDate < normalizedNextRunAnchor) {
    throw badRequest('结束日期不能早于下次运行锚点')
  }
  const normalizedActive = normalizeActive(active, true)

  let created
  try {
    created = await transaction(async (connection) => {
      await ensureInspectionSchedulesTable(connection)
      await assertDeviceBelongsToCustomer(connection, normalizedCustomerId, normalizedDeviceId)
      await assertActiveEngineer(connection, normalizedEngineerId)
      await assertNoDuplicateActive(connection, {
        customerId: normalizedCustomerId,
        deviceId: normalizedDeviceId,
        targetEngineerId: normalizedEngineerId,
        cadence: normalizedCadence,
        active: normalizedActive,
      })
      const [result] = await connection.execute(
        `INSERT INTO inspection_schedules (
          customer_id, device_id, target_engineer_id, cadence, next_run_anchor,
          active, end_date, next_order_status, created_by
        )
        VALUES (
          :customerId, :deviceId, :targetEngineerId, :cadence, :nextRunAnchor,
          :active, :endDate, 'pending_confirmation', :createdBy
        )`,
        {
          customerId: normalizedCustomerId,
          deviceId: normalizedDeviceId,
          targetEngineerId: normalizedEngineerId,
          cadence: normalizedCadence,
          nextRunAnchor: normalizedNextRunAnchor,
          active: normalizedActive ? 1 : 0,
          endDate: normalizedEndDate,
          createdBy: req.user.id,
        },
      )
      return { id: result.insertId }
    })
  } catch (error) {
    throw duplicateScheduleError(error) || error
  }

  const row = await loadSchedule(created.id)
  res.status(201).json({ item: schedulePayload(row) })
}

async function createBulk(req, res) {
  const { customerId, assignments = [], cadence, nextRunAnchor, active = true, endDate = null } = req.body || {}
  const normalizedCustomerId = Number(customerId || 0)
  if (!normalizedCustomerId) {
    throw badRequest('客户不能为空')
  }
  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw badRequest('请至少选择一台设备和目标工程师')
  }
  if (assignments.length > 200) {
    throw badRequest('单次最多创建 200 条巡检计划')
  }
  const normalizedCadence = normalizeCadence(cadence)
  const normalizedNextRunAnchor = normalizeDate(nextRunAnchor, '下次运行锚点')
  const normalizedEndDate = normalizeDate(endDate, '结束日期', false)
  if (normalizedEndDate && normalizedEndDate < normalizedNextRunAnchor) {
    throw badRequest('结束日期不能早于下次运行锚点')
  }
  const normalizedActive = normalizeActive(active, true)

  const normalizedAssignments = assignments.map((assignment) => ({
    deviceId: Number(assignment?.deviceId || 0),
    targetEngineerId: Number(assignment?.targetEngineerId || 0),
  }))
  if (normalizedAssignments.some((assignment) => !assignment.deviceId || !assignment.targetEngineerId)) {
    throw badRequest('每台设备都必须指定有效的目标工程师')
  }

  const uniqueKeys = new Set()
  for (const assignment of normalizedAssignments) {
    const key = `${assignment.deviceId}:${assignment.targetEngineerId}`
    if (uniqueKeys.has(key)) {
      throw badRequest('批量分配中存在重复的设备和工程师组合')
    }
    uniqueKeys.add(key)
  }

  let createdIds = []
  try {
    createdIds = await transaction(async (connection) => {
      await ensureInspectionSchedulesTable(connection)
      const ids = []
      for (const assignment of normalizedAssignments) {
        await assertDeviceBelongsToCustomer(connection, normalizedCustomerId, assignment.deviceId)
        await assertActiveEngineer(connection, assignment.targetEngineerId)
        await assertNoDuplicateActive(connection, {
          customerId: normalizedCustomerId,
          deviceId: assignment.deviceId,
          targetEngineerId: assignment.targetEngineerId,
          cadence: normalizedCadence,
          active: normalizedActive,
        })
        const [result] = await connection.execute(
          `INSERT INTO inspection_schedules (
            customer_id, device_id, target_engineer_id, cadence, next_run_anchor,
            active, end_date, next_order_status, created_by
          )
          VALUES (
            :customerId, :deviceId, :targetEngineerId, :cadence, :nextRunAnchor,
            :active, :endDate, 'pending_confirmation', :createdBy
          )`,
          {
            customerId: normalizedCustomerId,
            deviceId: assignment.deviceId,
            targetEngineerId: assignment.targetEngineerId,
            cadence: normalizedCadence,
            nextRunAnchor: normalizedNextRunAnchor,
            active: normalizedActive ? 1 : 0,
            endDate: normalizedEndDate,
            createdBy: req.user.id,
          },
        )
        ids.push(result.insertId)
      }
      return ids
    })
  } catch (error) {
    throw duplicateScheduleError(error) || error
  }

  const rows = []
  for (const id of createdIds) {
    const row = await loadSchedule(id)
    if (row) rows.push(schedulePayload(row))
  }
  res.status(201).json({ items: rows, total: rows.length })
}

async function detail(req, res) {
  await ensureInspectionSchedulesTable()
  const row = await loadSchedule(req.params.id)
  if (!row) {
    throw notFound('巡检计划不存在')
  }
  res.json({ item: schedulePayload(row) })
}

async function update(req, res) {
  await ensureInspectionSchedulesTable()
  const existing = await loadSchedule(req.params.id)
  if (!existing) {
    throw notFound('巡检计划不存在')
  }

  const body = req.body || {}
  const normalizedCustomerId = body.customerId !== undefined ? Number(body.customerId || 0) : Number(existing.customer_id)
  const normalizedDeviceId = body.deviceId !== undefined ? Number(body.deviceId || 0) || null : (existing.device_id ? Number(existing.device_id) : null)
  const normalizedEngineerId = body.targetEngineerId !== undefined ? Number(body.targetEngineerId || 0) : Number(existing.target_engineer_id)
  if (!normalizedCustomerId || !normalizedEngineerId) {
    throw badRequest('客户和目标工程师不能为空')
  }
  const normalizedCadence = body.cadence !== undefined ? normalizeCadence(body.cadence) : existing.cadence
  const normalizedNextRunAnchor = body.nextRunAnchor !== undefined ? normalizeDate(body.nextRunAnchor, '下次运行锚点') : existing.next_run_anchor
  const normalizedEndDate = body.endDate !== undefined ? normalizeDate(body.endDate, '结束日期', false) : existing.end_date
  if (normalizedEndDate && normalizedEndDate < normalizedNextRunAnchor) {
    throw badRequest('结束日期不能早于下次运行锚点')
  }
  const normalizedActive = normalizeActive(body.active, Boolean(existing.active))

  try {
    await transaction(async (connection) => {
      await ensureInspectionSchedulesTable(connection)
      await assertDeviceBelongsToCustomer(connection, normalizedCustomerId, normalizedDeviceId)
      await assertActiveEngineer(connection, normalizedEngineerId)
      await assertNoDuplicateActive(connection, {
        id: req.params.id,
        customerId: normalizedCustomerId,
        deviceId: normalizedDeviceId,
        targetEngineerId: normalizedEngineerId,
        cadence: normalizedCadence,
        active: normalizedActive,
      })
      await connection.execute(
        `UPDATE inspection_schedules
         SET customer_id = :customerId,
             device_id = :deviceId,
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
          customerId: normalizedCustomerId,
          deviceId: normalizedDeviceId,
          targetEngineerId: normalizedEngineerId,
          cadence: normalizedCadence,
          nextRunAnchor: normalizedNextRunAnchor,
          active: normalizedActive ? 1 : 0,
          endDate: normalizedEndDate,
          updatedBy: req.user.id,
        },
      )
    })
  } catch (error) {
    throw duplicateScheduleError(error) || error
  }

  const row = await loadSchedule(req.params.id)
  res.json({ item: schedulePayload(row) })
}

async function remove(req, res) {
  await ensureInspectionSchedulesTable()
  const existing = await loadSchedule(req.params.id)
  if (!existing) {
    throw notFound('巡检计划不存在')
  }
  await query('DELETE FROM inspection_schedules WHERE id = :id', { id: req.params.id })
  res.status(204).end()
}

async function generateDue(req, res) {
  await ensureInspectionSchedulesTable()
  await ensureInspectionOrderColumns()

  const dueDate = normalizeDate(req.body?.dueDate || req.query?.dueDate || todayDateKey(), '生成截止日期')
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit || req.query?.limit || 50)))

  const rows = await query(
    `SELECT ${scheduleColumns}
     FROM inspection_schedules s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN devices d ON d.id = s.device_id
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

  const items = []
  await transaction(async (connection) => {
    await ensureInspectionSchedulesTable(connection)
    await ensureInspectionOrderColumns(connection)

    for (const schedule of rows) {
      const occurrenceDate = toDateKey(schedule.next_run_anchor)
      const result = await createInspectionOrder(connection, schedule, occurrenceDate)
      const nextState = nextAnchorAfterOccurrence(schedule, occurrenceDate)
      await advanceSchedule(connection, schedule.id, nextState.nextRunAnchor, nextState.active, req.user.id)
      items.push({
        scheduleId: schedule.id,
        occurrenceDate,
        created: result.created,
        orderId: result.orderId,
        orderNo: result.orderNo || null,
        nextRunAnchor: nextState.nextRunAnchor,
        active: nextState.active,
      })
    }
  })

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
