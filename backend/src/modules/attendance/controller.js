const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { hasAnyPermission, hasPermission } = require('../../permissions/store')
const { ALL_ROLES, ROLE_LABELS } = require('../../permissions/catalog')

const requestTypes = new Set(['leave', 'overtime', 'comp_time'])
const leaveTypes = new Set(['annual', 'sick', 'personal', 'marriage', 'bereavement'])
const overtimeKinds = new Set(['travel', 'work'])
const overtimeResults = new Set(['comp_time', 'pay'])
const finalStatuses = new Set(['approved', 'rejected', 'withdrawn', 'voided'])
const roleSet = new Set(ALL_ROLES)
const defaultSupervisorRoleRules = Object.freeze({
  admin: 'admin',
  assistant: 'operations_director',
  dispatcher: 'operations_director',
  operations_director: 'admin',
  engineering_supervisor: 'operations_director',
  administrative_supervisor: 'admin',
  sales_supervisor: 'operations_director',
  sales: 'sales_supervisor',
  engineer: 'engineering_supervisor',
})
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

function assertWholeHour(value, label) {
  if (Math.abs(Number(value) - Math.round(Number(value))) > 0.0001) throw badRequest(`${label}必须以整小时为单位`)
}

function assertTimeRange(startAt, endAt) {
  const startTime = Date.parse(startAt.replace(' ', 'T'))
  const endTime = Date.parse(endAt.replace(' ', 'T'))
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) throw badRequest('开始或结束时间格式不正确')
  if (endTime <= startTime) throw badRequest('结束时间必须晚于开始时间')
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (start.getMinutes() || start.getSeconds() || end.getMinutes() || end.getSeconds()) {
    throw badRequest('开始和结束时间必须为整点')
  }
}

function annualLeaveStartAt(value) {
  const date = text(value).replace('T', ' ').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('开始时间格式不正确')
  return `${date} 09:00:00`
}

function addHoursDateTime(startAt, hours) {
  const start = new Date(String(startAt).replace(' ', 'T'))
  if (!Number.isFinite(start.getTime())) throw badRequest('开始时间格式不正确')
  return formatMysqlDateTime(new Date(start.getTime() + Number(hours) * 3600000))
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
          supervisor_role VARCHAR(64) NULL,
          source_type VARCHAR(32) NULL,
          source_id BIGINT UNSIGNED NULL,
          source_detail VARCHAR(64) NULL,
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

      await query(
        `CREATE TABLE IF NOT EXISTS attendance_supervisor_role_rules (
          applicant_role VARCHAR(64) NOT NULL,
          supervisor_role VARCHAR(64) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (applicant_role),
          KEY idx_attendance_supervisor_role (supervisor_role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )

      await ensureAttendanceRequestColumns()
      await ensureDefaultSupervisorRoleRules()
      await syncUserProfiles()
    })()
  }
  return schemaReadyPromise
}

async function ensureAttendanceRequestColumns() {
  const rows = await query(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance_requests'
       AND COLUMN_NAME IN ('supervisor_role', 'source_type', 'source_id', 'source_detail')`,
  )
  const existing = new Set(rows.map((row) => row.columnName))
  if (!existing.has('supervisor_role')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN supervisor_role VARCHAR(64) NULL AFTER overtime_result')
  }
  if (!existing.has('source_type')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN source_type VARCHAR(32) NULL AFTER supervisor_role')
  }
  if (!existing.has('source_id')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN source_id BIGINT UNSIGNED NULL AFTER source_type')
  }
  if (!existing.has('source_detail')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN source_detail VARCHAR(64) NULL AFTER source_id')
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

async function ensureDefaultSupervisorRoleRules() {
  const values = Object.entries(defaultSupervisorRoleRules)
    .map(([applicantRole, supervisorRole]) => ({ applicantRole, supervisorRole }))
  for (const item of values) {
    await query(
      `INSERT IGNORE INTO attendance_supervisor_role_rules (applicant_role, supervisor_role)
       VALUES (:applicantRole, :supervisorRole)`,
      item,
    )
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
    applicantRole: row.applicant_role,
    supervisorRole: row.supervisor_role,
    requestType: row.request_type,
    leaveType: row.leave_type,
    overtimeKind: row.overtime_kind,
    overtimeResult: row.overtime_result,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceDetail: row.source_detail,
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
    `SELECT p.*, u.role
     FROM attendance_employee_profiles p
     LEFT JOIN users u ON u.id = p.user_id
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

function rolePayload(row) {
  return {
    role: row.role,
    label: ROLE_LABELS[row.role] || row.role,
  }
}

async function listSupervisorRoleRules(req, res) {
  await ensureSchema()
  const rows = await query(
    `SELECT applicant_role, supervisor_role
     FROM attendance_supervisor_role_rules
     ORDER BY FIELD(applicant_role, ${ALL_ROLES.map((_, index) => `:roleOrder${index}`).join(', ')})`,
    Object.fromEntries(ALL_ROLES.map((role, index) => [`roleOrder${index}`, role])),
  )
  const rules = new Map(rows.map((row) => [row.applicant_role, row.supervisor_role]))
  res.json({
    roles: ALL_ROLES.map((role) => rolePayload({ role })),
    items: ALL_ROLES.map((role) => ({
      applicantRole: role,
      applicantRoleLabel: ROLE_LABELS[role] || role,
      supervisorRole: rules.get(role) || defaultSupervisorRoleRules[role] || 'admin',
      supervisorRoleLabel: ROLE_LABELS[rules.get(role) || defaultSupervisorRoleRules[role] || 'admin'] || rules.get(role) || 'admin',
    })),
  })
}

async function updateSupervisorRoleRules(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.manage')) throw forbidden()
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  await transaction(async (connection) => {
    for (const item of items) {
      const applicantRole = text(item?.applicantRole)
      const supervisorRole = text(item?.supervisorRole)
      if (!roleSet.has(applicantRole) || !roleSet.has(supervisorRole)) {
        throw badRequest('角色规则不正确')
      }
      await connection.execute(
        `INSERT INTO attendance_supervisor_role_rules (applicant_role, supervisor_role)
         VALUES (:applicantRole, :supervisorRole)
         ON DUPLICATE KEY UPDATE supervisor_role = VALUES(supervisor_role)`,
        { applicantRole, supervisorRole },
      )
    }
  })
  return listSupervisorRoleRules(req, res)
}

async function supervisorRoleForApplicantRole(role) {
  const normalized = text(role)
  if (!roleSet.has(normalized)) throw badRequest('申请人角色不正确')
  const rows = await query(
    `SELECT supervisor_role
     FROM attendance_supervisor_role_rules
     WHERE applicant_role = :applicantRole
     LIMIT 1`,
    { applicantRole: normalized },
  )
  return rows[0]?.supervisor_role || defaultSupervisorRoleRules[normalized] || 'admin'
}

async function supervisorRoleForApplicantRoleConnection(connection, role) {
  const normalized = text(role)
  if (!roleSet.has(normalized)) return defaultSupervisorRoleRules.engineer
  const [rows] = await connection.execute(
    `SELECT supervisor_role
     FROM attendance_supervisor_role_rules
     WHERE applicant_role = :applicantRole
     LIMIT 1`,
    { applicantRole: normalized },
  )
  return rows[0]?.supervisor_role || defaultSupervisorRoleRules[normalized] || 'admin'
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

  const hasSupervisorEmployeeId = Object.prototype.hasOwnProperty.call(req.body || {}, 'supervisorEmployeeId')
  const supervisorEmployeeId = hasSupervisorEmployeeId && req.body?.supervisorEmployeeId ? Number(req.body.supervisorEmployeeId) : null
  if (hasSupervisorEmployeeId && supervisorEmployeeId === id) throw badRequest('直属主管不能是本人')
  if (hasSupervisorEmployeeId && supervisorEmployeeId) {
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
         supervisor_employee_id = CASE WHEN :hasSupervisorEmployeeId = 1 THEN :supervisorEmployeeId ELSE supervisor_employee_id END,
         attendance_enabled = :attendanceEnabled,
         annual_leave_rule = :annualLeaveRule
     WHERE id = :id`,
    {
      id,
      employeeName,
      nationality,
      hireDate: optionalDate(req.body?.hireDate),
      leaveDate: optionalDate(req.body?.leaveDate),
      hasSupervisorEmployeeId: hasSupervisorEmployeeId ? 1 : 0,
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

  let leaveType = null
  if (requestType === 'leave') {
    leaveType = text(body?.leaveType)
    if (!leaveTypes.has(leaveType)) throw badRequest('假别不正确')
  }

  const hours = positiveNumber(body?.hours, '申请小时数')
  assertWholeHour(hours, '申请小时数')
  let startAt = text(body?.startAt).replace('T', ' ')
  let endAt = text(body?.endAt).replace('T', ' ')
  if (!startAt || !endAt) throw badRequest('开始和结束时间不能为空')
  if (requestType === 'leave' && leaveType === 'annual') {
    startAt = annualLeaveStartAt(startAt)
    endAt = addHoursDateTime(startAt, hours)
  }
  assertTimeRange(startAt, endAt)
  const durationHours = (Date.parse(endAt.replace(' ', 'T')) - Date.parse(startAt.replace(' ', 'T'))) / 3600000
  if (Math.abs(durationHours - hours) > 0.0001) throw badRequest('申请小时数必须与开始、结束时间一致')

  const payload = {
    requestType,
    leaveType,
    overtimeKind: null,
    overtimeResult: null,
    startAt,
    endAt,
    hours,
    reason: nullableText(body?.reason),
  }

  if (requestType === 'leave') {
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
  const input = normalizeRequestInput(req.body)
  const supervisorRole = await supervisorRoleForApplicantRole(req.user.role)

  const result = await query(
    `INSERT INTO attendance_requests
       (employee_id, request_type, leave_type, overtime_kind, overtime_result, supervisor_role, start_at, end_at, hours, reason, status, submitted_by)
     VALUES
       (:employeeId, :requestType, :leaveType, :overtimeKind, :overtimeResult, :supervisorRole, :startAt, :endAt, :hours, :reason, 'pending_supervisor', :submittedBy)`,
    {
      employeeId: employee.id,
      submittedBy: req.user.id,
      supervisorRole,
      ...input,
    },
  )

  res.status(201).json({ id: result.insertId })
}

function toDate(value) {
  const date = new Date(String(value || '').replace(' ', 'T'))
  return Number.isFinite(date.getTime()) ? date : null
}

function ceilToHour(date) {
  const rounded = new Date(date)
  if (rounded.getMinutes() || rounded.getSeconds() || rounded.getMilliseconds()) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0)
  } else {
    rounded.setMinutes(0, 0, 0)
  }
  return rounded
}

function floorToHour(date) {
  const rounded = new Date(date)
  rounded.setMinutes(0, 0, 0)
  return rounded
}

function overtimeWindow(startAt, endAt) {
  const start = toDate(startAt)
  const end = toDate(endAt)
  if (!start || !end || end <= start) return null
  const weekend = start.getDay() === 0 || start.getDay() === 6
  const endHour = end.getHours() + end.getMinutes() / 60
  if (!weekend && endHour <= 18) return null
  const overtimeStart = weekend
    ? start
    : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 18, 0, 0)
  const effectiveStart = ceilToHour(start > overtimeStart ? start : overtimeStart)
  const effectiveEnd = floorToHour(end)
  if (effectiveEnd <= effectiveStart) return null
  const hours = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 3600000)
  if (hours <= 0) return null
  return {
    startAt: formatMysqlDateTime(effectiveStart),
    endAt: formatMysqlDateTime(effectiveEnd),
    hours,
  }
}

function formatMysqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function overtimeSegments(row, usedSegments = new Set()) {
  const candidates = [
    { key: 'travel_out', kind: 'travel', label: '路上时间（出发-到达）', start: row.departure_at, end: row.actual_start_at },
    { key: 'work', kind: 'work', label: '实际工作时间', start: row.actual_start_at, end: row.actual_end_at },
    { key: 'travel_back', kind: 'travel', label: '路上时间（完成-返回）', start: row.actual_end_at, end: row.return_at },
  ]
  return candidates
    .map((segment) => {
      const window = overtimeWindow(segment.start, segment.end)
      if (!window || usedSegments.has(segment.key)) return null
      return {
        key: segment.key,
        kind: segment.kind,
        label: segment.label,
        startAt: toIsoMinute(window.startAt),
        endAt: toIsoMinute(window.endAt),
        hours: window.hours,
        allowedResults: segment.kind === 'travel' ? ['comp_time'] : ['comp_time', 'pay'],
      }
    })
    .filter(Boolean)
}

async function serviceOrderOvertimeRows(userId, serviceOrderId = null, connection = null) {
  const sql = `SELECT so.id, so.order_no, so.status, c.name AS customer_name,
                      COALESCE(NULLIF(so.contact_name, ''), c.contact_name) AS contact_name,
                      COALESCE(NULLIF(so.contact_phone, ''), c.contact_phone) AS contact_phone,
                      so.service_mode, so.service_type, so.issue_description,
                      COALESCE(NULLIF(CONCAT_WS(' / ', NULLIF(d.model, ''), NULLIF(d.serial_no, '')), ''), NULLIF(d.name, ''), '-') AS device_name,
                      sr.departure_at, sr.actual_start_at, sr.actual_end_at, sr.return_at,
                      COALESCE(sr.actual_start_at, so.submitted_at, so.created_at) AS service_at
               FROM service_orders so
               JOIN customers c ON c.id = so.customer_id
               LEFT JOIN devices d ON d.id = so.device_id
               JOIN service_reports sr ON sr.service_order_id = so.id
               WHERE (:serviceOrderId IS NULL OR so.id = :serviceOrderId)
                 AND so.status NOT IN ('draft', 'cancelled')
                 AND (
                   so.assigned_engineer_id = :userId
                   OR EXISTS (
                     SELECT 1
                     FROM service_order_engineers soe
                     WHERE soe.service_order_id = so.id AND soe.engineer_id = :userId
                   )
                 )
               ORDER BY service_at DESC, so.id DESC
               LIMIT 100`
  const params = { userId, serviceOrderId }
  if (connection) {
    const [rows] = await connection.execute(sql, params)
    return rows
  }
  return query(sql, params)
}

async function usedOvertimeSegments(orderIds, userId) {
  const ids = orderIds.map((id) => Number(id)).filter(Boolean)
  if (!ids.length) return new Map()
  const params = Object.fromEntries(ids.map((id, index) => [`orderId${index}`, id]))
  const rows = await query(
    `SELECT source_id, source_detail
     FROM attendance_requests
     WHERE source_type = 'service_order'
       AND source_id IN (${ids.map((_, index) => `:orderId${index}`).join(',')})
       AND submitted_by = :userId
       AND status NOT IN ('rejected', 'withdrawn', 'voided')`,
    { ...params, userId },
  )
  return rows.reduce((map, row) => {
    const key = Number(row.source_id)
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(row.source_detail || 'work')
    return map
  }, new Map())
}

async function listOvertimeServiceOrders(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  if (!employee) throw forbidden('当前账号没有启用的员工档案')
  const rows = await serviceOrderOvertimeRows(req.user.id)
  const usedMap = await usedOvertimeSegments(rows.map((row) => row.id), req.user.id)
  const items = rows
    .map((row) => ({
      id: row.id,
      orderNo: row.order_no,
      customerName: row.customer_name,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      deviceName: row.device_name,
      serviceMode: row.service_mode,
      serviceType: row.service_type,
      issueDescription: row.issue_description,
      status: row.status,
      serviceAt: toIsoMinute(row.service_at),
      departureAt: toIsoMinute(row.departure_at),
      actualStartAt: toIsoMinute(row.actual_start_at),
      actualEndAt: toIsoMinute(row.actual_end_at),
      returnAt: toIsoMinute(row.return_at),
      segments: overtimeSegments(row, usedMap.get(Number(row.id)) || new Set()),
    }))
    .filter((item) => item.segments.length)
  res.json({ items })
}

async function createServiceOrderOvertimeRequest(req, res) {
  await ensureSchema()
  const serviceOrderId = Number(req.params.id)
  if (!serviceOrderId) throw badRequest('工单 ID 不正确')
  const segmentKey = text(req.body?.segmentKey)
  const overtimeResult = text(req.body?.overtimeResult)
  if (!['travel_out', 'work', 'travel_back'].includes(segmentKey)) throw badRequest('工单时段不正确')
  if (!overtimeResults.has(overtimeResult)) throw badRequest('加班处理结果不正确')

  const result = await transaction(async (connection) => {
    const employee = await currentEmployeeForConnection(connection, req.user.id)
    if (!employee) throw forbidden('当前账号没有启用的员工档案')
    const rows = await serviceOrderOvertimeRows(req.user.id, serviceOrderId, connection)
    const order = rows[0]
    if (!order) throw notFound('没有可申请的工单')
    const segment = overtimeSegments(order).find((item) => item.key === segmentKey)
    if (!segment) throw badRequest('该工单时段不符合加班申请条件')
    if (segment.kind === 'travel' && overtimeResult !== 'comp_time') throw badRequest('路上时间只能转调休')
    if (!segment.allowedResults.includes(overtimeResult)) throw badRequest('处理方式不适用于该时段')

    const [existingRows] = await connection.execute(
      `SELECT id
       FROM attendance_requests
       WHERE source_type = 'service_order'
         AND source_id = :serviceOrderId
         AND (source_detail = :segmentKey OR (:segmentKey = 'work' AND source_detail IS NULL))
         AND submitted_by = :userId
         AND status NOT IN ('rejected', 'withdrawn', 'voided')
       LIMIT 1
       FOR UPDATE`,
      { serviceOrderId, segmentKey, userId: req.user.id },
    )
    if (existingRows[0]) throw badRequest('该工单时段已提交加班申请')

    const supervisorRole = await supervisorRoleForApplicantRoleConnection(connection, employee.role)
    const [inserted] = await connection.execute(
      `INSERT INTO attendance_requests
         (employee_id, request_type, leave_type, overtime_kind, overtime_result, supervisor_role, source_type, source_id, source_detail, start_at, end_at, hours, reason, status, submitted_by)
       VALUES
         (:employeeId, 'overtime', NULL, :overtimeKind, :overtimeResult, :supervisorRole, 'service_order', :serviceOrderId, :sourceDetail, :startAt, :endAt, :hours, :reason, 'pending_supervisor', :submittedBy)`,
      {
        employeeId: employee.id,
        overtimeKind: segment.kind,
        overtimeResult,
        supervisorRole,
        serviceOrderId,
        sourceDetail: segment.key,
        startAt: segment.startAt.replace('T', ' '),
        endAt: segment.endAt.replace('T', ' '),
        hours: segment.hours,
        reason: `工单申请：${order.order_no || serviceOrderId} / ${segment.label}`,
        submittedBy: req.user.id,
      },
    )
    return { id: inserted.insertId }
  })

  res.status(201).json(result)
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
      sql: `r.status = 'pending_supervisor'
        AND (
          r.supervisor_role = :currentRole
          OR (r.supervisor_role IS NULL AND p.supervisor_employee_id = :supervisorEmployeeId)
        )`,
      params: { currentRole: user.role, supervisorEmployeeId: employee?.id || 0 },
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
  if (scope === 'supervisor' && !employee && !req.user.role) throw forbidden('当前账号没有员工档案')
  if (scope === 'mine' && !employee) return res.json({ items: [] })

  const scoped = listScopeSql(scope, req.user, employee)
  const rows = await query(
    `SELECT r.*, p.employee_name, p.user_id, u.role AS applicant_role, p.supervisor_employee_id, s.employee_name AS supervisor_name
     FROM attendance_requests r
     JOIN attendance_employee_profiles p ON p.id = r.employee_id
     LEFT JOIN users u ON u.id = p.user_id
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
    `SELECT r.*, p.employee_name, p.user_id, u.role AS applicant_role, p.supervisor_employee_id
     FROM attendance_requests r
     JOIN attendance_employee_profiles p ON p.id = r.employee_id
     LEFT JOIN users u ON u.id = p.user_id
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
  const id = Number(req.params.id)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (request.status !== 'pending_supervisor') throw badRequest('当前状态不能主管审批')
    const isRoleSupervisor = request.supervisor_role && request.supervisor_role === req.user.role
    const isLegacySupervisor = !request.supervisor_role && employee && Number(request.supervisor_employee_id) === Number(employee.id)
    if (!isRoleSupervisor && !isLegacySupervisor) throw forbidden('只有对应审批角色可以审批')
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
    const isRoleSupervisor = request.status === 'pending_supervisor' && request.supervisor_role && request.supervisor_role === req.user.role
    const isLegacySupervisor = request.status === 'pending_supervisor' && !request.supervisor_role && employee && Number(request.supervisor_employee_id) === Number(employee.id)
    const isSupervisor = isRoleSupervisor || isLegacySupervisor
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
  if (balanceType === 'annual_leave' && deltaHours % 4 !== 0) throw badRequest('年假调整必须以半天为单位')
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

module.exports = {
  ensureSchema,
  listEmployees,
  me,
  listSupervisorRoleRules,
  updateSupervisorRoleRules,
  updateEmployee,
  createRequest,
  listOvertimeServiceOrders,
  createServiceOrderOvertimeRequest,
  listRequests,
  approveSupervisor,
  approveAdmin,
  rejectRequest,
  withdrawRequest,
  voidRequest,
  adjustBalance,
  monthlyReport,
}
