const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { hasAnyPermission, hasPermission } = require('../../permissions/store')

const requestTypes = new Set(['leave', 'overtime', 'comp_time'])
const leaveTypes = new Set(['annual', 'sick', 'personal', 'marriage', 'bereavement'])
const overtimeKinds = new Set(['travel', 'work'])
const overtimeResults = new Set(['comp_time', 'pay'])
const finalStatuses = new Set(['approved', 'rejected', 'withdrawn', 'voided'])
let schemaReadyPromise = null

function text(value) {
  return String(value ?? '').trim()
}

function nullableText(value) {
  const normalized = text(value)
  return normalized || null
}

function positiveNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw badRequest(`${label}必须大于 0`)
  return Math.round(number * 100) / 100
}

function assertTimeRange(startAt, endAt) {
  const startTime = Date.parse(startAt.replace(' ', 'T'))
  const endTime = Date.parse(endAt.replace(' ', 'T'))
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) throw badRequest('开始或结束时间格式不正确')
  if (endTime <= startTime) throw badRequest('结束时间必须晚于开始时间')
}

function optionalDate(value) {
  const normalized = text(value)
  return normalized || null
}

function toIsoMinute(value) {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 16)
}

function userDisplayName(user) {
  return text(user?.real_name || user?.realName || user?.username || `用户 #${user?.id || ''}`)
}

async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS attendance_employee_profiles (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NULL,
          employee_name VARCHAR(100) NOT NULL,
          nationality VARCHAR(32) NOT NULL DEFAULT 'mainland',
          hire_date DATE NULL,
          leave_date DATE NULL,
          supervisor_employee_id BIGINT UNSIGNED NULL,
          attendance_enabled TINYINT(1) NOT NULL DEFAULT 1,
          annual_leave_rule VARCHAR(64) NOT NULL DEFAULT 'mainland',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_attendance_employee_user (user_id),
          KEY idx_attendance_employee_supervisor (supervisor_employee_id),
          KEY idx_attendance_employee_enabled (attendance_enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )

      await query(
        `CREATE TABLE IF NOT EXISTS attendance_requests (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          employee_id BIGINT UNSIGNED NOT NULL,
          request_type VARCHAR(32) NOT NULL,
          leave_type VARCHAR(32) NULL,
          overtime_kind VARCHAR(32) NULL,
          overtime_result VARCHAR(32) NULL,
          source_type VARCHAR(32) NULL,
          source_id BIGINT UNSIGNED NULL,
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          hours DECIMAL(8,2) NOT NULL,
          reason TEXT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'pending_supervisor',
          submitted_by BIGINT UNSIGNED NOT NULL,
          submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          supervisor_approved_by BIGINT UNSIGNED NULL,
          supervisor_approved_at DATETIME NULL,
          admin_approved_by BIGINT UNSIGNED NULL,
          admin_approved_at DATETIME NULL,
          rejected_by BIGINT UNSIGNED NULL,
          rejected_at DATETIME NULL,
          rejected_reason TEXT NULL,
          withdrawn_by BIGINT UNSIGNED NULL,
          withdrawn_at DATETIME NULL,
          voided_by BIGINT UNSIGNED NULL,
          voided_at DATETIME NULL,
          void_reason TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_attendance_requests_employee (employee_id),
          KEY idx_attendance_requests_source (source_type, source_id),
          KEY idx_attendance_requests_status (status),
          KEY idx_attendance_requests_type (request_type),
          KEY idx_attendance_requests_start_at (start_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )

      await query(
        `CREATE TABLE IF NOT EXISTS attendance_balance_ledger (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          employee_id BIGINT UNSIGNED NOT NULL,
          request_id BIGINT UNSIGNED NULL,
          balance_type VARCHAR(32) NOT NULL,
          delta_hours DECIMAL(8,2) NOT NULL,
          action VARCHAR(32) NOT NULL,
          note TEXT NULL,
          created_by BIGINT UNSIGNED NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_attendance_ledger_employee (employee_id),
          KEY idx_attendance_ledger_request (request_id),
          KEY idx_attendance_ledger_balance_type (balance_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )

      await ensureAttendanceRequestSourceColumns()
      await syncUserProfiles()
    })()
  }
  return schemaReadyPromise
}

async function ensureAttendanceRequestSourceColumns() {
  const rows = await query(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance_requests'
       AND COLUMN_NAME IN ('source_type', 'source_id')`,
  )
  const existing = new Set(rows.map((row) => row.columnName))
  if (!existing.has('source_type')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN source_type VARCHAR(32) NULL AFTER overtime_result')
  }
  if (!existing.has('source_id')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN source_id BIGINT UNSIGNED NULL AFTER source_type')
  }
  const indexRows = await query(
    `SELECT INDEX_NAME AS indexName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance_requests'
       AND INDEX_NAME = 'idx_attendance_requests_source'
     LIMIT 1`,
  )
  if (!indexRows[0]) {
    await query('ALTER TABLE attendance_requests ADD KEY idx_attendance_requests_source (source_type, source_id)')
  }
}

async function syncUserProfiles() {
  await query(
    `INSERT INTO attendance_employee_profiles (user_id, employee_name)
     SELECT u.id, COALESCE(NULLIF(u.real_name, ''), u.username)
     FROM users u
     LEFT JOIN attendance_employee_profiles p ON p.user_id = u.id
     WHERE u.status = 'active'
       AND p.id IS NULL`,
  )
}

function profilePayload(row) {
  return {
    id: row.id,
    userId: row.user_id,
    employeeName: row.employee_name,
    username: row.username,
    role: row.role,
    nationality: row.nationality,
    hireDate: row.hire_date,
    leaveDate: row.leave_date,
    supervisorEmployeeId: row.supervisor_employee_id,
    supervisorName: row.supervisor_name,
    attendanceEnabled: Boolean(row.attendance_enabled),
    annualLeaveRule: row.annual_leave_rule,
    annualLeaveBalanceHours: Number(row.annual_leave_balance_hours || 0),
    compTimeBalanceHours: Number(row.comp_time_balance_hours || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requestPayload(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    userId: row.user_id,
    supervisorEmployeeId: row.supervisor_employee_id,
    supervisorName: row.supervisor_name,
    requestType: row.request_type,
    leaveType: row.leave_type,
    overtimeKind: row.overtime_kind,
    overtimeResult: row.overtime_result,
    sourceType: row.source_type,
    sourceId: row.source_id,
    startAt: toIsoMinute(row.start_at),
    endAt: toIsoMinute(row.end_at),
    hours: Number(row.hours || 0),
    reason: row.reason || '',
    status: row.status,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    supervisorApprovedBy: row.supervisor_approved_by,
    supervisorApprovedAt: row.supervisor_approved_at,
    adminApprovedBy: row.admin_approved_by,
    adminApprovedAt: row.admin_approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectedReason: row.rejected_reason,
    withdrawnBy: row.withdrawn_by,
    withdrawnAt: row.withdrawn_at,
    voidedBy: row.voided_by,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function currentEmployee(userId) {
  await syncUserProfiles()
  const rows = await query(
    `SELECT p.*
     FROM attendance_employee_profiles p
     WHERE p.user_id = :userId
       AND p.attendance_enabled = 1
     LIMIT 1`,
    { userId },
  )
  return rows[0] || null
}

async function currentEmployeeForConnection(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT p.*
     FROM attendance_employee_profiles p
     WHERE p.user_id = :userId
       AND p.attendance_enabled = 1
     LIMIT 1`,
    { userId },
  )
  return rows[0] || null
}

async function canViewAll(user) {
  return hasAnyPermission(user.role, ['attendance.view', 'attendance.manage', 'attendance.admin.approve'])
}

async function listEmployees(req, res) {
  await ensureSchema()
  await syncUserProfiles()
  const keyword = text(req.query.keyword)
  const rows = await query(
    `SELECT p.*, u.username, u.role, s.employee_name AS supervisor_name,
            COALESCE(SUM(CASE WHEN l.balance_type = 'annual_leave' THEN l.delta_hours ELSE 0 END), 0) AS annual_leave_balance_hours,
            COALESCE(SUM(CASE WHEN l.balance_type = 'comp_time' THEN l.delta_hours ELSE 0 END), 0) AS comp_time_balance_hours
     FROM attendance_employee_profiles p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN attendance_employee_profiles s ON s.id = p.supervisor_employee_id
     LEFT JOIN attendance_balance_ledger l ON l.employee_id = p.id
     WHERE (:keyword = ''
       OR p.employee_name LIKE :likeKeyword
       OR u.username LIKE :likeKeyword
       OR u.role LIKE :likeKeyword)
     GROUP BY p.id, u.username, u.role, s.employee_name
     ORDER BY p.attendance_enabled DESC, p.employee_name ASC, p.id ASC
     LIMIT 500`,
    { keyword, likeKeyword: `%${keyword}%` },
  )
  res.json({ items: rows.map(profilePayload) })
}

async function me(req, res) {
  await ensureSchema()
  await syncUserProfiles()
  const rows = await query(
    `SELECT p.*, u.username, u.role, s.employee_name AS supervisor_name,
            COALESCE(SUM(CASE WHEN l.balance_type = 'annual_leave' THEN l.delta_hours ELSE 0 END), 0) AS annual_leave_balance_hours,
            COALESCE(SUM(CASE WHEN l.balance_type = 'comp_time' THEN l.delta_hours ELSE 0 END), 0) AS comp_time_balance_hours
     FROM attendance_employee_profiles p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN attendance_employee_profiles s ON s.id = p.supervisor_employee_id
     LEFT JOIN attendance_balance_ledger l ON l.employee_id = p.id
     WHERE p.user_id = :userId
     GROUP BY p.id, u.username, u.role, s.employee_name
     LIMIT 1`,
    { userId: req.user.id },
  )
  res.json({ item: rows[0] ? profilePayload(rows[0]) : null })
}

async function updateEmployee(req, res) {
  await ensureSchema()
  const id = Number(req.params.id)
  if (!id) throw badRequest('员工 ID 不正确')
  const rows = await query('SELECT id FROM attendance_employee_profiles WHERE id = :id LIMIT 1', { id })
  if (!rows[0]) throw notFound('员工档案不存在')

  const supervisorEmployeeId = req.body?.supervisorEmployeeId ? Number(req.body.supervisorEmployeeId) : null
  if (supervisorEmployeeId === id) throw badRequest('直属主管不能是本人')
  if (supervisorEmployeeId) {
    const supervisors = await query('SELECT id FROM attendance_employee_profiles WHERE id = :id LIMIT 1', { id: supervisorEmployeeId })
    if (!supervisors[0]) throw badRequest('直属主管不存在')
  }

  const employeeName = text(req.body?.employeeName)
  if (!employeeName) throw badRequest('员工姓名不能为空')
  const nationality = text(req.body?.nationality) || 'mainland'
  const annualLeaveRule = text(req.body?.annualLeaveRule) || nationality
  const attendanceEnabled = req.body?.attendanceEnabled === false || req.body?.attendanceEnabled === 0 ? 0 : 1

  await query(
    `UPDATE attendance_employee_profiles
     SET employee_name = :employeeName,
         nationality = :nationality,
         hire_date = :hireDate,
         leave_date = :leaveDate,
         supervisor_employee_id = :supervisorEmployeeId,
         attendance_enabled = :attendanceEnabled,
         annual_leave_rule = :annualLeaveRule
     WHERE id = :id`,
    {
      id,
      employeeName,
      nationality,
      hireDate: optionalDate(req.body?.hireDate),
      leaveDate: optionalDate(req.body?.leaveDate),
      supervisorEmployeeId,
      attendanceEnabled,
      annualLeaveRule,
    },
  )

  res.json({ ok: true })
}

function normalizeRequestInput(body) {
  const requestType = text(body?.requestType)
  if (!requestTypes.has(requestType)) throw badRequest('申请类型不正确')

  const hours = positiveNumber(body?.hours, '申请小时数')
  const startAt = text(body?.startAt).replace('T', ' ')
  const endAt = text(body?.endAt).replace('T', ' ')
  if (!startAt || !endAt) throw badRequest('开始和结束时间不能为空')
  assertTimeRange(startAt, endAt)

  const payload = {
    requestType,
    leaveType: null,
    overtimeKind: null,
    overtimeResult: null,
    startAt,
    endAt,
    hours,
    reason: nullableText(body?.reason),
  }

  if (requestType === 'leave') {
    payload.leaveType = text(body?.leaveType)
    if (!leaveTypes.has(payload.leaveType)) throw badRequest('假别不正确')
    if (payload.hours % 4 !== 0) throw badRequest('请假时长必须以半天为单位')
  }

  if (requestType === 'overtime') {
    payload.overtimeKind = text(body?.overtimeKind)
    payload.overtimeResult = text(body?.overtimeResult)
    if (!overtimeKinds.has(payload.overtimeKind)) throw badRequest('加班类型不正确')
    if (!overtimeResults.has(payload.overtimeResult)) throw badRequest('加班处理结果不正确')
    if (payload.overtimeKind === 'travel' && payload.overtimeResult !== 'comp_time') {
      throw badRequest('来回路上实际时间只能转调休')
    }
  }

  return payload
}

async function createRequest(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  if (!employee) throw forbidden('当前账号没有启用的员工档案')
  if (!employee.supervisor_employee_id) throw badRequest('员工档案未设置直属主管，暂不能提交申请')
  const input = normalizeRequestInput(req.body)

  const result = await query(
    `INSERT INTO attendance_requests
       (employee_id, request_type, leave_type, overtime_kind, overtime_result, start_at, end_at, hours, reason, status, submitted_by)
     VALUES
       (:employeeId, :requestType, :leaveType, :overtimeKind, :overtimeResult, :startAt, :endAt, :hours, :reason, 'pending_supervisor', :submittedBy)`,
    {
      employeeId: employee.id,
      submittedBy: req.user.id,
      ...input,
    },
  )

  res.status(201).json({ id: result.insertId })
}

function listScopeSql(scope, user, employee) {
  if (scope === 'mine') {
    return {
      sql: 'r.employee_id = :employeeId',
      params: { employeeId: employee?.id || 0 },
    }
  }
  if (scope === 'supervisor') {
    return {
      sql: 'p.supervisor_employee_id = :supervisorEmployeeId',
      params: { supervisorEmployeeId: employee?.id || 0 },
    }
  }
  return {
    sql: '1 = 1',
    params: {},
  }
}

async function listRequests(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  const scope = text(req.query.scope) || 'mine'
  const status = text(req.query.status)
  const requestType = text(req.query.requestType)
  const allAllowed = await canViewAll(req.user)
  if (scope === 'all' && !allAllowed) throw forbidden()
  if (scope === 'supervisor' && !employee) throw forbidden('当前账号没有员工档案')
  if (scope === 'mine' && !employee) return res.json({ items: [] })

  const scoped = listScopeSql(scope, req.user, employee)
  const rows = await query(
    `SELECT r.*, p.employee_name, p.user_id, p.supervisor_employee_id, s.employee_name AS supervisor_name
     FROM attendance_requests r
     JOIN attendance_employee_profiles p ON p.id = r.employee_id
     LEFT JOIN attendance_employee_profiles s ON s.id = p.supervisor_employee_id
     WHERE ${scoped.sql}
       AND (:status = '' OR r.status = :status)
       AND (:requestType = '' OR r.request_type = :requestType)
     ORDER BY r.start_at DESC, r.id DESC
     LIMIT 300`,
    { ...scoped.params, status, requestType },
  )
  res.json({ items: rows.map(requestPayload) })
}

async function requestForUpdate(connection, id) {
  const [rows] = await connection.execute(
    `SELECT r.*, p.employee_name, p.user_id, p.supervisor_employee_id
     FROM attendance_requests r
     JOIN attendance_employee_profiles p ON p.id = r.employee_id
     WHERE r.id = :id
     LIMIT 1
     FOR UPDATE`,
    { id },
  )
  return rows[0] || null
}

async function insertLedger(connection, request, deltaHours, balanceType, action, note, userId) {
  await connection.execute(
    `INSERT INTO attendance_balance_ledger
       (employee_id, request_id, balance_type, delta_hours, action, note, created_by)
     VALUES
       (:employeeId, :requestId, :balanceType, :deltaHours, :action, :note, :createdBy)`,
    {
      employeeId: request.employee_id,
      requestId: request.id,
      balanceType,
      deltaHours,
      action,
      note,
      createdBy: userId,
    },
  )
}

async function balanceHours(connection, employeeId, balanceType) {
  const [rows] = await connection.execute(
    `SELECT COALESCE(SUM(delta_hours), 0) AS balance_hours
     FROM attendance_balance_ledger
     WHERE employee_id = :employeeId
       AND balance_type = :balanceType`,
    { employeeId, balanceType },
  )
  return Number(rows[0]?.balance_hours || 0)
}

async function applyApprovalLedger(connection, request, userId) {
  if (request.request_type === 'overtime' && request.overtime_result === 'comp_time') {
    await insertLedger(connection, request, Number(request.hours), 'comp_time', 'earn', '加班转调休入账', userId)
  }
  if (request.request_type === 'comp_time') {
    const currentBalance = await balanceHours(connection, request.employee_id, 'comp_time')
    if (currentBalance < Number(request.hours)) throw badRequest('调休余额不足，不能通过终审')
    await insertLedger(connection, request, -Number(request.hours), 'comp_time', 'use', '调休使用', userId)
  }
  if (request.request_type === 'leave' && request.leave_type === 'annual') {
    const currentBalance = await balanceHours(connection, request.employee_id, 'annual_leave')
    if (currentBalance < Number(request.hours)) throw badRequest('年假余额不足，不能通过终审')
    await insertLedger(connection, request, -Number(request.hours), 'annual_leave', 'use', '年假使用', userId)
  }
}

async function reverseApprovalLedger(connection, request, userId) {
  const [rows] = await connection.execute(
    `SELECT balance_type, COALESCE(SUM(delta_hours), 0) AS delta_hours
     FROM attendance_balance_ledger
     WHERE request_id = :requestId
       AND action <> 'void'
     GROUP BY balance_type`,
    { requestId: request.id },
  )
  for (const row of rows) {
    const delta = -Number(row.delta_hours || 0)
    if (delta) {
      await insertLedger(connection, request, delta, row.balance_type, 'void', '申请作废冲回', userId)
    }
  }
}

async function approveSupervisor(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  if (!employee) throw forbidden('当前账号没有员工档案')
  const id = Number(req.params.id)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (request.status !== 'pending_supervisor') throw badRequest('当前状态不能主管审批')
    if (Number(request.supervisor_employee_id) !== Number(employee.id)) throw forbidden('只有直属主管可以审批')
    await connection.execute(
      `UPDATE attendance_requests
       SET status = 'pending_admin',
           supervisor_approved_by = :userId,
           supervisor_approved_at = NOW()
       WHERE id = :id`,
      { id, userId: req.user.id },
    )
  })
  res.json({ ok: true })
}

async function approveAdmin(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.admin.approve')) throw forbidden()
  const id = Number(req.params.id)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (request.status !== 'pending_admin') throw badRequest('当前状态不能行政审批')
    await applyApprovalLedger(connection, request, req.user.id)
    await connection.execute(
      `UPDATE attendance_requests
       SET status = 'approved',
           admin_approved_by = :userId,
           admin_approved_at = NOW()
       WHERE id = :id`,
      { id, userId: req.user.id },
    )
  })
  res.json({ ok: true })
}

async function rejectRequest(req, res) {
  await ensureSchema()
  const id = Number(req.params.id)
  const reason = nullableText(req.body?.reason)
  const employee = await currentEmployee(req.user.id)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (finalStatuses.has(request.status)) throw badRequest('当前状态不能驳回')
    const isSupervisor = request.status === 'pending_supervisor' && employee && Number(request.supervisor_employee_id) === Number(employee.id)
    const isAdmin = request.status === 'pending_admin' && await hasPermission(req.user.role, 'attendance.admin.approve')
    if (!isSupervisor && !isAdmin) throw forbidden()
    await connection.execute(
      `UPDATE attendance_requests
       SET status = 'rejected',
           rejected_by = :userId,
           rejected_at = NOW(),
           rejected_reason = :reason
       WHERE id = :id`,
      { id, userId: req.user.id, reason },
    )
  })
  res.json({ ok: true })
}

async function withdrawRequest(req, res) {
  await ensureSchema()
  const id = Number(req.params.id)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (!['pending_supervisor', 'pending_admin'].includes(request.status)) throw badRequest('当前状态不能撤回')
    if (Number(request.submitted_by) !== Number(req.user.id)) throw forbidden('只有申请人可以撤回')
    await connection.execute(
      `UPDATE attendance_requests
       SET status = 'withdrawn',
           withdrawn_by = :userId,
           withdrawn_at = NOW()
       WHERE id = :id`,
      { id, userId: req.user.id },
    )
  })
  res.json({ ok: true })
}

async function voidRequest(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.admin.approve')) throw forbidden()
  const id = Number(req.params.id)
  const reason = nullableText(req.body?.reason)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (request.status !== 'approved') throw badRequest('只有已通过申请可以作废')
    await reverseApprovalLedger(connection, request, req.user.id)
    await connection.execute(
      `UPDATE attendance_requests
       SET status = 'voided',
           voided_by = :userId,
           voided_at = NOW(),
           void_reason = :reason
       WHERE id = :id`,
      { id, userId: req.user.id, reason },
    )
  })
  res.json({ ok: true })
}

async function adjustBalance(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.manage')) throw forbidden()
  const employeeId = Number(req.params.id)
  const balanceType = text(req.body?.balanceType)
  if (!['annual_leave', 'comp_time'].includes(balanceType)) throw badRequest('余额类型不正确')
  const deltaHours = Number(req.body?.deltaHours)
  if (!Number.isFinite(deltaHours) || deltaHours === 0) throw badRequest('调整小时数不能为 0')
  const note = nullableText(req.body?.note)
  const employees = await query('SELECT id FROM attendance_employee_profiles WHERE id = :employeeId LIMIT 1', { employeeId })
  if (!employees[0]) throw notFound('员工档案不存在')
  await query(
    `INSERT INTO attendance_balance_ledger
       (employee_id, request_id, balance_type, delta_hours, action, note, created_by)
     VALUES
       (:employeeId, NULL, :balanceType, :deltaHours, 'adjust', :note, :createdBy)`,
    { employeeId, balanceType, deltaHours: Math.round(deltaHours * 100) / 100, note, createdBy: req.user.id },
  )
  res.json({ ok: true })
}

async function monthlyReport(req, res) {
  await ensureSchema()
  const month = /^\d{4}-\d{2}$/.test(text(req.query.month)) ? text(req.query.month) : new Date().toISOString().slice(0, 7)
  const rows = await query(
    `SELECT p.id AS employee_id, p.employee_name,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'leave' AND r.leave_type = 'annual' THEN r.hours ELSE 0 END), 0) AS annual_leave_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'leave' AND r.leave_type = 'sick' THEN r.hours ELSE 0 END), 0) AS sick_leave_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'leave' AND r.leave_type = 'personal' THEN r.hours ELSE 0 END), 0) AS personal_leave_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'leave' AND r.leave_type = 'marriage' THEN r.hours ELSE 0 END), 0) AS marriage_leave_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'leave' AND r.leave_type = 'bereavement' THEN r.hours ELSE 0 END), 0) AS bereavement_leave_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'overtime' THEN r.hours ELSE 0 END), 0) AS overtime_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'overtime' AND r.overtime_result = 'comp_time' THEN r.hours ELSE 0 END), 0) AS overtime_to_comp_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'overtime' AND r.overtime_result = 'pay' THEN r.hours ELSE 0 END), 0) AS overtime_to_pay_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'comp_time' THEN r.hours ELSE 0 END), 0) AS comp_time_used_hours,
            COALESCE((SELECT SUM(l.delta_hours) FROM attendance_balance_ledger l WHERE l.employee_id = p.id AND l.balance_type = 'annual_leave'), 0) AS annual_leave_balance_hours,
            COALESCE((SELECT SUM(l.delta_hours) FROM attendance_balance_ledger l WHERE l.employee_id = p.id AND l.balance_type = 'comp_time'), 0) AS comp_time_balance_hours
     FROM attendance_employee_profiles p
     LEFT JOIN attendance_requests r ON r.employee_id = p.id AND DATE_FORMAT(r.start_at, '%Y-%m') = :month
     WHERE p.attendance_enabled = 1
     GROUP BY p.id, p.employee_name
     ORDER BY p.employee_name ASC, p.id ASC`,
    { month },
  )
  res.json({ month, items: rows.map((row) => ({
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    annualLeaveHours: Number(row.annual_leave_hours || 0),
    sickLeaveHours: Number(row.sick_leave_hours || 0),
    personalLeaveHours: Number(row.personal_leave_hours || 0),
    marriageLeaveHours: Number(row.marriage_leave_hours || 0),
    bereavementLeaveHours: Number(row.bereavement_leave_hours || 0),
    overtimeHours: Number(row.overtime_hours || 0),
    overtimeToCompHours: Number(row.overtime_to_comp_hours || 0),
    overtimeToPayHours: Number(row.overtime_to_pay_hours || 0),
    compTimeUsedHours: Number(row.comp_time_used_hours || 0),
    annualLeaveBalanceHours: Number(row.annual_leave_balance_hours || 0),
    compTimeBalanceHours: Number(row.comp_time_balance_hours || 0),
  })) })
}

function overtimeWindow(startAt, endAt) {
  const start = new Date(String(startAt || '').replace(' ', 'T'))
  const end = new Date(String(endAt || '').replace(' ', 'T'))
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null
  const weekend = start.getDay() === 0 || start.getDay() === 6
  const startHour = start.getHours() + start.getMinutes() / 60
  const endHour = end.getHours() + end.getMinutes() / 60
  if (!weekend && endHour <= 18) return null
  const overtimeStart = weekend
    ? start
    : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 18, 0, 0)
  const effectiveStart = start > overtimeStart ? start : overtimeStart
  if (end <= effectiveStart) return null
  const hours = Math.round(((end.getTime() - effectiveStart.getTime()) / 3600000) * 100) / 100
  if (hours <= 0) return null
  return {
    startAt: formatMysqlDateTime(effectiveStart),
    endAt: formatMysqlDateTime(end),
    hours,
  }
}

function formatMysqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function upsertServiceOrderOvertimeRequest(connection, {
  userId,
  serviceOrderId,
  orderNo,
  actualStartAt,
  actualEndAt,
}) {
  const employee = await currentEmployeeForConnection(connection, userId)
  if (!employee || !employee.supervisor_employee_id) return { skipped: true, reason: 'missing_employee_or_supervisor' }

  const overtime = overtimeWindow(actualStartAt, actualEndAt)
  const [existingRows] = await connection.execute(
    `SELECT id, status
     FROM attendance_requests
     WHERE source_type = 'service_order'
       AND source_id = :serviceOrderId
       AND submitted_by = :userId
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    { serviceOrderId, userId },
  )
  const existing = existingRows[0]
  const note = orderNo ? `工单自动生成：${orderNo}` : '工单自动生成'

  if (!overtime) {
    if (existing && !finalStatuses.has(existing.status)) {
      await connection.execute(
        `UPDATE attendance_requests
         SET status = 'withdrawn',
             withdrawn_by = :userId,
             withdrawn_at = NOW()
         WHERE id = :id`,
        { id: existing.id, userId },
      )
    }
    return { skipped: true, reason: 'not_overtime' }
  }

  if (existing && finalStatuses.has(existing.status)) {
    return { skipped: true, reason: 'final_request_exists' }
  }

  if (existing) {
    await connection.execute(
      `UPDATE attendance_requests
       SET employee_id = :employeeId,
           request_type = 'overtime',
           leave_type = NULL,
           overtime_kind = 'work',
           overtime_result = 'comp_time',
           start_at = :startAt,
           end_at = :endAt,
           hours = :hours,
           reason = :reason,
           status = 'pending_supervisor',
           supervisor_approved_by = NULL,
           supervisor_approved_at = NULL,
           admin_approved_by = NULL,
           admin_approved_at = NULL,
           rejected_by = NULL,
           rejected_at = NULL,
           rejected_reason = NULL,
           withdrawn_by = NULL,
           withdrawn_at = NULL
       WHERE id = :id`,
      {
        id: existing.id,
        employeeId: employee.id,
        startAt: overtime.startAt,
        endAt: overtime.endAt,
        hours: overtime.hours,
        reason: note,
      },
    )
    return { id: existing.id, updated: true }
  }

  const [result] = await connection.execute(
    `INSERT INTO attendance_requests
       (employee_id, request_type, leave_type, overtime_kind, overtime_result, source_type, source_id, start_at, end_at, hours, reason, status, submitted_by)
     VALUES
       (:employeeId, 'overtime', NULL, 'work', 'comp_time', 'service_order', :serviceOrderId, :startAt, :endAt, :hours, :reason, 'pending_supervisor', :userId)`,
    {
      employeeId: employee.id,
      serviceOrderId,
      startAt: overtime.startAt,
      endAt: overtime.endAt,
      hours: overtime.hours,
      reason: note,
      userId,
    },
  )
  return { id: result.insertId, created: true }
}

module.exports = {
  ensureSchema,
  listEmployees,
  me,
  updateEmployee,
  createRequest,
  listRequests,
  approveSupervisor,
  approveAdmin,
  rejectRequest,
  withdrawRequest,
  voidRequest,
  adjustBalance,
  monthlyReport,
  upsertServiceOrderOvertimeRequest,
}
