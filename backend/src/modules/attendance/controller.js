const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { hasAnyPermission, hasPermission } = require('../../permissions/store')
const { ALL_ROLES, ROLE_LABELS } = require('../../permissions/catalog')
const { ensureFilePurposeColumn } = require('../files/controller')
const {
  buildApprovalSteps,
  calculateWorkingLeaveRange,
  requestStatusForStep,
  requiresLeaveProof,
} = require('./workflow')

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

const WORK_HOURS_PER_DAY = 8
const LEGAL_HOLIDAY_PAY_MULTIPLIER = 3
const DEFAULT_PAY_MULTIPLIER = 1
const BUILTIN_LEGAL_HOLIDAYS = Object.freeze([
  { date: '2026-01-01', name: '元旦' },
  { date: '2026-02-16', name: '春节' },
  { date: '2026-02-17', name: '春节' },
  { date: '2026-02-18', name: '春节' },
  { date: '2026-02-19', name: '春节' },
  { date: '2026-04-05', name: '清明节' },
  { date: '2026-05-01', name: '劳动节' },
  { date: '2026-05-02', name: '劳动节' },
  { date: '2026-06-19', name: '端午节' },
  { date: '2026-09-25', name: '中秋节' },
  { date: '2026-10-01', name: '国庆节' },
  { date: '2026-10-02', name: '国庆节' },
  { date: '2026-10-03', name: '国庆节' },
])
const legalHolidayCache = new Map()
const holidaySources = new Set(['builtin', 'manual', 'auto'])

function text(value) {
  return String(value ?? '').trim()
}

function nullableText(value) {
  const normalized = text(value)
  return normalized || null
}

function normalizeHolidayDate(value) {
  const normalized = text(value).replace('T', ' ').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw badRequest('节假日日期格式不正确')
  return normalized
}

function normalizeHolidayYear(value) {
  const normalized = text(value)
  if (!normalized) return ''
  if (!/^\d{4}$/.test(normalized)) throw badRequest('节假日年份格式不正确')
  return normalized
}

function positiveNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw badRequest(`${label}必须大于 0`)
  return Math.round(number * 100) / 100
}

function roundBalance(value) {
  return Math.round(Number(value) * 100) / 100
}

function annualLeaveDaysFromHours(hours) {
  return roundBalance(Number(hours || 0) / WORK_HOURS_PER_DAY)
}

function assertHalfUnit(value, label) {
  if (Math.abs(Number(value) * 2 - Math.round(Number(value) * 2)) > 0.0001) {
    throw badRequest(`${label}必须以 0.5 为单位`)
  }
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

function leaveSlot(value, boundary) {
  const normalized = text(value).replace('T', ' ')
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) throw badRequest(boundary === 'start' ? '请假开始时间格式不正确' : '请假结束时间格式不正确')
  const [, date, hour, minute, second = '00'] = match
  if (minute !== '00' || second !== '00') throw badRequest('请假时段必须以整点为单位')
  if (boundary === 'start') {
    if (hour === '09') return { date, half: 0, value: `${date} 09:00:00` }
    if (hour === '14') return { date, half: 1, value: `${date} 14:00:00` }
    throw badRequest('请假开始时段必须是上午或下午')
  }
  if (hour === '14') return { date, half: 0, value: `${date} 14:00:00` }
  if (hour === '18') return { date, half: 1, value: `${date} 18:00:00` }
  throw badRequest('请假结束时段必须是上午或下午')
}

function leaveDateIndex(date) {
  const match = text(date).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw badRequest('请假日期格式不正确')
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Math.floor(utc / 86400000)
}

function normalizeLeaveRange(startAt, endAt, inputHours) {
  const start = leaveSlot(startAt, 'start')
  const end = leaveSlot(endAt, 'end')
  const startIndex = leaveDateIndex(start.date) * 2 + start.half
  const endIndex = leaveDateIndex(end.date) * 2 + end.half
  if (endIndex < startIndex) throw badRequest('请假结束时段不能早于开始时段')
  const hours = (endIndex - startIndex + 1) * 4
  if (Math.abs(hours - Number(inputHours)) > 0.0001) throw badRequest('请假时长必须与开始、结束时段一致')
  return {
    startAt: start.value,
    endAt: end.value,
    hours,
  }
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

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function overtimeDayType(startAt) {
  const date = toDate(startAt)
  if (!date) return 'workday'
  if (legalHolidayCache.has(dateKey(date))) return 'legal_holiday'
  if (date.getDay() === 0 || date.getDay() === 6) return 'rest_day'
  return 'workday'
}

function overtimePayMultiplier(dayType, result = '') {
  if (result !== 'pay') return null
  return dayType === 'legal_holiday' ? LEGAL_HOLIDAY_PAY_MULTIPLIER : DEFAULT_PAY_MULTIPLIER
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
          workflow_version INT UNSIGNED NOT NULL DEFAULT 1,
          employee_id BIGINT UNSIGNED NOT NULL,
          delegate_employee_id BIGINT UNSIGNED NULL,
          request_type VARCHAR(32) NOT NULL,
          leave_type VARCHAR(32) NULL,
          overtime_kind VARCHAR(32) NULL,
          overtime_result VARCHAR(32) NULL,
          overtime_day_type VARCHAR(32) NULL,
          overtime_pay_multiplier DECIMAL(4,2) NULL,
          supervisor_role VARCHAR(64) NULL,
          source_type VARCHAR(32) NULL,
          source_id BIGINT UNSIGNED NULL,
          source_detail VARCHAR(64) NULL,
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          hours DECIMAL(8,2) NOT NULL,
          working_days DECIMAL(6,2) NULL,
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
        `CREATE TABLE IF NOT EXISTS attendance_request_approvals (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          request_id BIGINT UNSIGNED NOT NULL,
          step_type VARCHAR(32) NOT NULL,
          step_order INT UNSIGNED NOT NULL,
          assignee_employee_id BIGINT UNSIGNED NULL,
          assignee_role VARCHAR(64) NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'waiting',
          approved_by BIGINT UNSIGNED NULL,
          approved_at DATETIME NULL,
          rejected_by BIGINT UNSIGNED NULL,
          rejected_at DATETIME NULL,
          rejected_reason TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_attendance_request_step (request_id, step_order),
          KEY idx_attendance_approval_pending (status, step_type),
          KEY idx_attendance_approval_assignee (assignee_employee_id, status),
          KEY idx_attendance_approval_role (assignee_role, status)
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
        `CREATE TABLE IF NOT EXISTS attendance_schema_migrations (
          migration_key VARCHAR(100) NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (migration_key)
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

      await query(
        `CREATE TABLE IF NOT EXISTS attendance_legal_holidays (
          holiday_date DATE NOT NULL,
          holiday_name VARCHAR(100) NOT NULL,
          source VARCHAR(32) NOT NULL DEFAULT 'manual',
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_by BIGINT UNSIGNED NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (holiday_date),
          KEY idx_attendance_legal_holidays_source (source),
          KEY idx_attendance_legal_holidays_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )

      await seedBuiltinLegalHolidays()
      await refreshLegalHolidayCache()
      await ensureFilePurposeColumn()
      await ensureAttendanceRequestColumns()
      await ensureAnnualLeaveLedgerUnit()
      await ensureDefaultSupervisorRoleRules()
      await syncUserProfiles()
    })()
  }
  return schemaReadyPromise
}

async function seedBuiltinLegalHolidays() {
  for (const item of BUILTIN_LEGAL_HOLIDAYS) {
    await query(
      `INSERT IGNORE INTO attendance_legal_holidays (holiday_date, holiday_name, source, is_active)
       VALUES (:date, :name, 'builtin', 1)`,
      item,
    )
  }
}

async function refreshLegalHolidayCache() {
  const rows = await query(
    `SELECT holiday_date, holiday_name
     FROM attendance_legal_holidays
     WHERE is_active = 1`,
  )
  legalHolidayCache.clear()
  rows.forEach((row) => {
    legalHolidayCache.set(normalizeHolidayDate(row.holiday_date), row.holiday_name)
  })
}

async function recalculateOvertimeRulesForDate(date) {
  const targetDate = normalizeHolidayDate(date)
  const rows = await query(
    `SELECT id, start_at, overtime_result
     FROM attendance_requests
     WHERE request_type = 'overtime'
       AND DATE(start_at) = :targetDate`,
    { targetDate },
  )
  for (const row of rows) {
    const dayType = overtimeDayType(row.start_at)
    await query(
      `UPDATE attendance_requests
       SET overtime_day_type = :dayType,
           overtime_pay_multiplier = :payMultiplier
       WHERE id = :id`,
      {
        id: row.id,
        dayType,
        payMultiplier: overtimePayMultiplier(dayType, row.overtime_result),
      },
    )
  }
}

async function ensureAnnualLeaveLedgerUnit() {
  const key = 'annual_leave_ledger_days_v1'
  const rows = await query(
    `SELECT migration_key
     FROM attendance_schema_migrations
     WHERE migration_key = :key
     LIMIT 1`,
    { key },
  )
  if (rows[0]) return
  await transaction(async (connection) => {
    const [inserted] = await connection.execute(
      `INSERT IGNORE INTO attendance_schema_migrations (migration_key)
       VALUES (:key)`,
      { key },
    )
    if (!inserted.affectedRows) return
    await connection.execute(
      `UPDATE attendance_balance_ledger
       SET delta_hours = ROUND(delta_hours / :workHoursPerDay, 2)
       WHERE balance_type = 'annual_leave'`,
      { workHoursPerDay: WORK_HOURS_PER_DAY },
    )
  })
}

async function ensureAttendanceRequestColumns() {
  const rows = await query(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance_requests'
       AND COLUMN_NAME IN ('workflow_version', 'delegate_employee_id', 'working_days', 'supervisor_role', 'source_type', 'source_id', 'source_detail', 'overtime_day_type', 'overtime_pay_multiplier')`,
  )
  const existing = new Set(rows.map((row) => row.columnName))
  if (!existing.has('workflow_version')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN workflow_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER id')
  }
  if (!existing.has('delegate_employee_id')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN delegate_employee_id BIGINT UNSIGNED NULL AFTER employee_id')
  }
  if (!existing.has('overtime_day_type')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN overtime_day_type VARCHAR(32) NULL AFTER overtime_result')
  }
  if (!existing.has('overtime_pay_multiplier')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN overtime_pay_multiplier DECIMAL(4,2) NULL AFTER overtime_day_type')
  }
  if (!existing.has('supervisor_role')) {
    const afterColumn = existing.has('overtime_pay_multiplier') ? 'overtime_pay_multiplier' : 'overtime_result'
    await query(`ALTER TABLE attendance_requests ADD COLUMN supervisor_role VARCHAR(64) NULL AFTER ${afterColumn}`)
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
  if (!existing.has('working_days')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN working_days DECIMAL(6,2) NULL AFTER hours')
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
  await backfillOvertimeRuleColumns()
}

async function backfillOvertimeRuleColumns() {
  const rows = await query(
    `SELECT id, start_at, overtime_result
     FROM attendance_requests
     WHERE request_type = 'overtime'
       AND overtime_day_type IS NULL
     LIMIT 1000`,
  )
  for (const row of rows) {
    const dayType = overtimeDayType(row.start_at)
    await query(
      `UPDATE attendance_requests
       SET overtime_day_type = :dayType,
           overtime_pay_multiplier = :payMultiplier
       WHERE id = :id`,
      {
        id: row.id,
        dayType,
        payMultiplier: overtimePayMultiplier(dayType, row.overtime_result),
      },
    )
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
  const annualLeaveBalanceDays = Number(row.annual_leave_balance_days ?? row.annual_leave_balance_hours ?? 0)
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
    annualLeaveBalanceDays,
    annualLeaveBalanceHours: roundBalance(annualLeaveBalanceDays * WORK_HOURS_PER_DAY),
    compTimeBalanceHours: Number(row.comp_time_balance_hours || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requestPayload(row) {
  return {
    id: row.id,
    workflowVersion: Number(row.workflow_version || 1),
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    userId: row.user_id,
    delegateEmployeeId: row.delegate_employee_id,
    delegateEmployeeName: row.delegate_employee_name,
    supervisorEmployeeId: row.supervisor_employee_id,
    supervisorName: row.supervisor_name,
    applicantRole: row.applicant_role,
    supervisorRole: row.supervisor_role,
    requestType: row.request_type,
    leaveType: row.leave_type,
    overtimeKind: row.overtime_kind,
    overtimeResult: row.overtime_result,
    overtimeDayType: row.overtime_day_type,
    overtimePayMultiplier: row.overtime_pay_multiplier === null || row.overtime_pay_multiplier === undefined ? null : Number(row.overtime_pay_multiplier),
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceDetail: row.source_detail,
    startAt: toIsoMinute(row.start_at),
    endAt: toIsoMinute(row.end_at),
    hours: Number(row.hours || 0),
    workingDays: row.working_days === null || row.working_days === undefined ? null : Number(row.working_days),
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

async function enabledEmployeeById(employeeId) {
  const rows = await query(
    `SELECT p.id, p.user_id, p.employee_name, p.attendance_enabled
     FROM attendance_employee_profiles p
     WHERE p.id = :employeeId
       AND p.attendance_enabled = 1
     LIMIT 1`,
    { employeeId },
  )
  return rows[0] || null
}

async function canViewAll(user) {
  return hasAnyPermission(user.role, [
    'attendance.view',
    'attendance.manage',
    'attendance.admin.approve',
    'attendance.hr.approve',
    'attendance.vp.approve',
  ])
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

function legalHolidayPayload(row) {
  return {
    date: normalizeHolidayDate(row.holiday_date),
    name: row.holiday_name,
    source: row.source,
    active: Boolean(row.is_active),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listLegalHolidays(req, res) {
  await ensureSchema()
  const year = normalizeHolidayYear(req.query.year)
  const where = year ? 'WHERE holiday_date >= :startDate AND holiday_date < :endDate' : ''
  const params = year ? { startDate: `${year}-01-01`, endDate: `${Number(year) + 1}-01-01` } : {}
  const rows = await query(
    `SELECT holiday_date, holiday_name, source, is_active, created_by, created_at, updated_at
     FROM attendance_legal_holidays
     ${where}
     ORDER BY holiday_date ASC`,
    params,
  )
  res.json({ year: year || null, items: rows.map(legalHolidayPayload) })
}

async function upsertLegalHoliday(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.manage')) throw forbidden()
  const date = normalizeHolidayDate(req.params.date || req.body?.date)
  const name = text(req.body?.name)
  if (!name) throw badRequest('节假日名称不能为空')
  const requestedSource = text(req.body?.source) || 'manual'
  const source = holidaySources.has(requestedSource) ? requestedSource : 'manual'
  await query(
    `INSERT INTO attendance_legal_holidays (holiday_date, holiday_name, source, is_active, created_by)
     VALUES (:date, :name, :source, 1, :createdBy)
     ON DUPLICATE KEY UPDATE
       holiday_name = VALUES(holiday_name),
       source = CASE WHEN source = 'builtin' AND VALUES(source) = 'manual' THEN source ELSE VALUES(source) END,
       is_active = 1`,
    { date, name, source, createdBy: req.user.id },
  )
  await refreshLegalHolidayCache()
  await recalculateOvertimeRulesForDate(date)
  const rows = await query(
    `SELECT holiday_date, holiday_name, source, is_active, created_by, created_at, updated_at
     FROM attendance_legal_holidays
     WHERE holiday_date = :date
     LIMIT 1`,
    { date },
  )
  res.json({ item: legalHolidayPayload(rows[0]) })
}

async function deleteLegalHoliday(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.manage')) throw forbidden()
  const date = normalizeHolidayDate(req.params.date)
  const result = await query(
    `UPDATE attendance_legal_holidays
     SET is_active = 0
     WHERE holiday_date = :date`,
    { date },
  )
  if (!result.affectedRows) throw notFound('节假日不存在')
  await refreshLegalHolidayCache()
  await recalculateOvertimeRulesForDate(date)
  res.json({ ok: true })
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
            COALESCE(SUM(CASE WHEN l.balance_type = 'annual_leave' THEN l.delta_hours ELSE 0 END), 0) AS annual_leave_balance_days,
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

async function listDelegates(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  if (!employee) throw forbidden('当前账号没有启用的员工档案')
  const rows = await query(
    `SELECT p.id, p.user_id, p.employee_name
     FROM attendance_employee_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.attendance_enabled = 1
       AND u.status = 'active'
       AND p.id <> :employeeId
     ORDER BY p.employee_name ASC, p.id ASC`,
    { employeeId: employee.id },
  )
  res.json({ items: rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    employeeName: row.employee_name,
  })) })
}

async function me(req, res) {
  await ensureSchema()
  await syncUserProfiles()
  const rows = await query(
    `SELECT p.*, u.username, u.role, s.employee_name AS supervisor_name,
            COALESCE(SUM(CASE WHEN l.balance_type = 'annual_leave' THEN l.delta_hours ELSE 0 END), 0) AS annual_leave_balance_days,
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

  let hours = positiveNumber(body?.hours, '申请小时数')
  assertWholeHour(hours, '申请小时数')
  let startAt = text(body?.startAt).replace('T', ' ')
  let endAt = text(body?.endAt).replace('T', ' ')
  if (!startAt || !endAt) throw badRequest('开始和结束时间不能为空')
  if (requestType === 'leave') {
    startAt = leaveSlot(startAt, 'start').value
    endAt = leaveSlot(endAt, 'end').value
  }
  assertTimeRange(startAt, endAt)
  const durationHours = (Date.parse(endAt.replace(' ', 'T')) - Date.parse(startAt.replace(' ', 'T'))) / 3600000
  if (requestType !== 'leave' && Math.abs(durationHours - hours) > 0.0001) {
    throw badRequest('申请小时数必须与开始、结束时间一致')
  }

  const payload = {
    requestType,
    leaveType,
    overtimeKind: null,
    overtimeResult: null,
    overtimeDayType: null,
    overtimePayMultiplier: null,
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
    payload.overtimeDayType = overtimeDayType(payload.startAt)
    payload.overtimePayMultiplier = overtimePayMultiplier(payload.overtimeDayType, payload.overtimeResult)
  }

  return payload
}

async function createRequest(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  if (!employee) throw forbidden('当前账号没有启用的员工档案')
  const input = normalizeRequestInput(req.body)
  const supervisorRole = await supervisorRoleForApplicantRole(req.user.role)

  let delegateEmployeeId = null
  let workingDays = null
  if (input.requestType === 'leave' || input.requestType === 'comp_time') {
    delegateEmployeeId = Number(req.body?.delegateEmployeeId)
    if (!delegateEmployeeId) throw badRequest('请选择代理人')
    if (delegateEmployeeId === Number(employee.id)) throw badRequest('代理人不能是本人')
    const delegate = await enabledEmployeeById(delegateEmployeeId)
    if (!delegate) throw badRequest('代理人不存在或未启用考勤')

    if (input.requestType === 'leave') {
      try {
        const range = calculateWorkingLeaveRange({
          startAt: input.startAt,
          endAt: input.endAt,
          holidays: new Set(legalHolidayCache.keys()),
        })
        input.startAt = range.startAt
        input.endAt = range.endAt
        input.hours = range.hours
        workingDays = range.workingDays
      } catch (error) {
        throw badRequest(error.message)
      }
    } else {
      workingDays = roundBalance(Number(input.hours) / WORK_HOURS_PER_DAY)
    }
  }

  const result = await query(
    `INSERT INTO attendance_requests
       (workflow_version, employee_id, delegate_employee_id, request_type, leave_type, overtime_kind, overtime_result, overtime_day_type, overtime_pay_multiplier, supervisor_role, start_at, end_at, hours, working_days, reason, status, submitted_by)
     VALUES
       (:workflowVersion, :employeeId, :delegateEmployeeId, :requestType, :leaveType, :overtimeKind, :overtimeResult, :overtimeDayType, :overtimePayMultiplier, :supervisorRole, :startAt, :endAt, :hours, :workingDays, :reason, 'draft', :submittedBy)`,
    {
      workflowVersion: 2,
      employeeId: employee.id,
      delegateEmployeeId,
      submittedBy: req.user.id,
      supervisorRole,
      workingDays,
      ...input,
    },
  )

  res.status(201).json({ id: result.insertId, status: 'draft', hours: input.hours, workingDays })
}

function toDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
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
  const dayType = overtimeDayType(start)
  const fullDayOvertime = dayType === 'legal_holiday' || dayType === 'rest_day'
  const endHour = end.getHours() + end.getMinutes() / 60
  if (!fullDayOvertime && endHour <= 18) return null
  const overtimeStart = fullDayOvertime
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
    dayType,
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
        dayType: window.dayType,
        payMultiplier: overtimePayMultiplier(window.dayType, 'pay') || DEFAULT_PAY_MULTIPLIER,
        allowedResults: segment.kind === 'travel' ? ['comp_time'] : ['comp_time', 'pay'],
      }
    })
    .filter(Boolean)
}

function combineTravelSegments(segments) {
  const items = segments.filter((item) => item.kind === 'travel')
  if (!items.length) return null
  return {
    key: 'travel',
    kind: 'travel',
    label: '来回路上实际时间',
    startAt: items[0].startAt,
    endAt: items[items.length - 1].endAt,
    hours: Math.round(items.reduce((sum, item) => sum + Number(item.hours || 0), 0) * 100) / 100,
    dayType: items.some((item) => item.dayType === 'legal_holiday') ? 'legal_holiday' : items[0].dayType,
    payMultiplier: null,
    allowedResults: ['comp_time'],
  }
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
    const detail = row.source_detail || 'work'
    map.get(key).add(detail)
    if (detail === 'travel') {
      map.get(key).add('travel_out')
      map.get(key).add('travel_back')
    }
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
  if (!['travel', 'travel_out', 'work', 'travel_back'].includes(segmentKey)) throw badRequest('工单时段不正确')
  if (!overtimeResults.has(overtimeResult)) throw badRequest('加班处理结果不正确')

  const result = await transaction(async (connection) => {
    const employee = await currentEmployeeForConnection(connection, req.user.id)
    if (!employee) throw forbidden('当前账号没有启用的员工档案')
    const rows = await serviceOrderOvertimeRows(req.user.id, serviceOrderId, connection)
    const order = rows[0]
    if (!order) throw notFound('没有可申请的工单')
    const segments = overtimeSegments(order)
    const segment = segmentKey === 'travel'
      ? combineTravelSegments(segments)
      : segments.find((item) => item.key === segmentKey)
    if (!segment) throw badRequest('该工单时段不符合加班申请条件')
    if (segment.kind === 'travel' && overtimeResult !== 'comp_time') throw badRequest('路上时间只能转调休')
    if (!segment.allowedResults.includes(overtimeResult)) throw badRequest('处理方式不适用于该时段')
    const dayType = segment.dayType || overtimeDayType(segment.startAt)
    const payMultiplier = overtimePayMultiplier(dayType, overtimeResult)

    const [existingRows] = await connection.execute(
      `SELECT id
       FROM attendance_requests
       WHERE source_type = 'service_order'
         AND source_id = :serviceOrderId
         AND (
           source_detail = :segmentKey
           OR (:segmentKey = 'work' AND source_detail IS NULL)
           OR (:segmentKey = 'travel' AND source_detail IN ('travel_out', 'travel_back'))
           OR (:segmentKey IN ('travel_out', 'travel_back') AND source_detail = 'travel')
         )
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
         (workflow_version, employee_id, request_type, leave_type, overtime_kind, overtime_result, overtime_day_type, overtime_pay_multiplier, supervisor_role, source_type, source_id, source_detail, start_at, end_at, hours, working_days, reason, status, submitted_by)
       VALUES
         (2, :employeeId, 'overtime', NULL, :overtimeKind, :overtimeResult, :overtimeDayType, :overtimePayMultiplier, :supervisorRole, 'service_order', :serviceOrderId, :sourceDetail, :startAt, :endAt, :hours, NULL, :reason, 'pending_supervisor', :submittedBy)`,
      {
        employeeId: employee.id,
        overtimeKind: segment.kind,
        overtimeResult,
        overtimeDayType: dayType,
        overtimePayMultiplier: payMultiplier,
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
    await insertApprovalSteps(connection, inserted.insertId, buildApprovalSteps({
      requestType: 'overtime',
      workingDays: 0,
      delegateEmployeeId: null,
      supervisorRole,
    }))
    return { id: inserted.insertId, status: 'pending_supervisor' }
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
      sql: `(
        (COALESCE(r.workflow_version, 1) = 1
          AND r.status = 'pending_supervisor'
          AND (
            r.supervisor_role = :currentRole
            OR (r.supervisor_role IS NULL AND p.supervisor_employee_id = :supervisorEmployeeId)
          ))
        OR
        (COALESCE(r.workflow_version, 1) = 2
          AND EXISTS (
            SELECT 1
            FROM attendance_request_approvals a
            LEFT JOIN attendance_employee_profiles ap ON ap.id = a.assignee_employee_id
            WHERE a.request_id = r.id
              AND a.status = 'pending'
              AND (
                ap.user_id = :currentUserId
                OR a.assignee_role = :currentRole
                OR (:isAdmin = 1 AND a.step_type <> 'delegate')
              )
          ))
      )`,
      params: {
        currentRole: user.role,
        currentUserId: user.id,
        isAdmin: user.role === 'admin' ? 1 : 0,
        supervisorEmployeeId: employee?.id || 0,
      },
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
    `SELECT r.*, p.employee_name, p.user_id, u.role AS applicant_role, p.supervisor_employee_id,
            s.employee_name AS supervisor_name, d.employee_name AS delegate_employee_name,
            (SELECT COUNT(*) FROM files f
             WHERE f.owner_type = 'attendance_request'
               AND f.owner_id = r.id
               AND f.purpose = 'leave_proof') AS proof_file_count
     FROM attendance_requests r
     JOIN attendance_employee_profiles p ON p.id = r.employee_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN attendance_employee_profiles s ON s.id = p.supervisor_employee_id
     LEFT JOIN attendance_employee_profiles d ON d.id = r.delegate_employee_id
     WHERE ${scoped.sql}
       AND (:status = '' OR r.status = :status)
       AND (:requestType = '' OR r.request_type = :requestType)
     ORDER BY r.start_at DESC, r.id DESC
     LIMIT 300`,
    { ...scoped.params, status, requestType },
  )
  const approvalMap = new Map()
  if (rows.length) {
    const params = {}
    const placeholders = rows.map((row, index) => {
      params[`requestId${index}`] = row.id
      return `:requestId${index}`
    })
    const approvalRows = await query(
      `SELECT a.*, ep.employee_name AS assignee_employee_name,
              COALESCE(au.real_name, au.username) AS approved_by_name,
              COALESCE(ru.real_name, ru.username) AS rejected_by_name
       FROM attendance_request_approvals a
       LEFT JOIN attendance_employee_profiles ep ON ep.id = a.assignee_employee_id
       LEFT JOIN users au ON au.id = a.approved_by
       LEFT JOIN users ru ON ru.id = a.rejected_by
       WHERE a.request_id IN (${placeholders.join(', ')})
       ORDER BY a.request_id ASC, a.step_order ASC`,
      params,
    )
    for (const row of approvalRows) {
      const items = approvalMap.get(Number(row.request_id)) || []
      items.push({
        id: row.id,
        stepType: row.step_type,
        stepOrder: Number(row.step_order),
        assigneeEmployeeId: row.assignee_employee_id,
        assigneeEmployeeName: row.assignee_employee_name,
        assigneeRole: row.assignee_role,
        status: row.status,
        approvedBy: row.approved_by,
        approvedByName: row.approved_by_name,
        approvedAt: row.approved_at,
        rejectedBy: row.rejected_by,
        rejectedByName: row.rejected_by_name,
        rejectedAt: row.rejected_at,
        rejectedReason: row.rejected_reason,
      })
      approvalMap.set(Number(row.request_id), items)
    }
  }
  res.json({ items: rows.map((row) => ({
    ...requestPayload(row),
    proofFileCount: Number(row.proof_file_count || 0),
    approvals: approvalMap.get(Number(row.id)) || [],
  })) })
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

async function insertApprovalSteps(connection, requestId, steps) {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    await connection.execute(
      `INSERT INTO attendance_request_approvals
         (request_id, step_type, step_order, assignee_employee_id, assignee_role, status)
       VALUES
         (:requestId, :stepType, :stepOrder, :assigneeEmployeeId, :assigneeRole, :status)`,
      {
        requestId,
        stepType: step.stepType,
        stepOrder: index + 1,
        assigneeEmployeeId: step.assigneeEmployeeId,
        assigneeRole: step.assigneeRole,
        status: index === 0 ? 'pending' : 'waiting',
      },
    )
  }
}

async function submitRequest(req, res) {
  await ensureSchema()
  const id = Number(req.params.id)
  if (!id) throw badRequest('申请 ID 不正确')
  const result = await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (Number(request.workflow_version || 1) !== 2 || request.status !== 'draft') throw badRequest('当前申请不能提交')
    if (Number(request.submitted_by) !== Number(req.user.id)) throw forbidden('只有申请人可以提交草稿')

    if (request.request_type !== 'overtime' && !request.delegate_employee_id) throw badRequest('请选择代理人')
    if (request.request_type === 'leave' && requiresLeaveProof(request.leave_type)) {
      const [proofRows] = await connection.execute(
        `SELECT COUNT(*) AS proof_count
         FROM files
         WHERE owner_type = 'attendance_request'
           AND owner_id = :requestId
           AND purpose = 'leave_proof'`,
        { requestId: request.id },
      )
      if (!Number(proofRows[0]?.proof_count || 0)) throw badRequest('病假或婚假必须上传证明')
    }

    const steps = buildApprovalSteps({
      requestType: request.request_type,
      workingDays: Number(request.working_days || 0),
      delegateEmployeeId: request.delegate_employee_id,
      supervisorRole: request.supervisor_role,
    })
    if (!steps.length) throw badRequest('审批流程不能为空')
    await insertApprovalSteps(connection, request.id, steps)
    const status = requestStatusForStep(steps[0].stepType)
    await connection.execute(
      `UPDATE attendance_requests
       SET status = :status
       WHERE id = :id`,
      { id: request.id, status },
    )
    return { status }
  })
  res.json({ ok: true, status: result.status })
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
    const annualLeaveDays = annualLeaveDaysFromHours(request.hours)
    const currentBalance = await balanceHours(connection, request.employee_id, 'annual_leave')
    if (currentBalance < annualLeaveDays) throw badRequest('年假余额不足，不能通过终审')
    await insertLedger(connection, request, -annualLeaveDays, 'annual_leave', 'use', '年假使用', userId)
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

async function pendingApprovalStep(connection, requestId) {
  const [rows] = await connection.execute(
    `SELECT a.*, ep.user_id AS assignee_user_id
     FROM attendance_request_approvals a
     LEFT JOIN attendance_employee_profiles ep ON ep.id = a.assignee_employee_id
     WHERE a.request_id = :requestId
       AND a.status = 'pending'
     ORDER BY a.step_order ASC
     LIMIT 1
     FOR UPDATE`,
    { requestId },
  )
  return rows[0] || null
}

async function nextWaitingApprovalStep(connection, requestId) {
  const [rows] = await connection.execute(
    `SELECT *
     FROM attendance_request_approvals
     WHERE request_id = :requestId
       AND status = 'waiting'
     ORDER BY step_order ASC
     LIMIT 1
     FOR UPDATE`,
    { requestId },
  )
  return rows[0] || null
}

function assertWorkflowStepApprover(step, user) {
  if (step.step_type === 'delegate') {
    if (Number(step.assignee_user_id) !== Number(user.id)) throw forbidden('只有指定代理人可以审批')
    return
  }
  if (user.role !== 'admin' && step.assignee_role !== user.role) throw forbidden('当前用户不是此步骤审批人')
}

async function approveLockedWorkflowStep(connection, request, expectedStepType, user) {
  const step = await pendingApprovalStep(connection, request.id)
  if (!step || step.step_type !== expectedStepType) throw badRequest('当前状态不能执行此审批')
  assertWorkflowStepApprover(step, user)
  await connection.execute(
    `UPDATE attendance_request_approvals
     SET status = 'approved',
         approved_by = :userId,
         approved_at = NOW()
     WHERE id = :id`,
    { id: step.id, userId: user.id },
  )

  const next = await nextWaitingApprovalStep(connection, request.id)
  if (next) {
    await connection.execute(
      `UPDATE attendance_request_approvals
       SET status = 'pending'
       WHERE id = :id`,
      { id: next.id },
    )
    const status = requestStatusForStep(next.step_type)
    await connection.execute(
      `UPDATE attendance_requests
       SET status = :status
       WHERE id = :id`,
      { id: request.id, status },
    )
    return status
  }

  await applyApprovalLedger(connection, request, user.id)
  await connection.execute(
    `UPDATE attendance_requests
     SET status = 'approved'
     WHERE id = :id`,
    { id: request.id },
  )
  return 'approved'
}

async function approveWorkflowStep(req, res, expectedStepType) {
  await ensureSchema()
  const id = Number(req.params.id)
  const status = await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (Number(request.workflow_version || 1) !== 2) throw badRequest('申请不属于新版审批流程')
    return approveLockedWorkflowStep(connection, request, expectedStepType, req.user)
  })
  res.json({ ok: true, status })
}

async function approveDelegate(req, res) {
  return approveWorkflowStep(req, res, 'delegate')
}

async function approveHr(req, res) {
  return approveWorkflowStep(req, res, 'hr')
}

async function approveVp(req, res) {
  return approveWorkflowStep(req, res, 'vp')
}

async function approveSupervisor(req, res) {
  await ensureSchema()
  const employee = await currentEmployee(req.user.id)
  const id = Number(req.params.id)
  const status = await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (Number(request.workflow_version || 1) === 2) {
      return approveLockedWorkflowStep(connection, request, 'supervisor', req.user)
    }
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
    return 'pending_admin'
  })
  res.json({ ok: true, status })
}

async function approveAdmin(req, res) {
  await ensureSchema()
  if (!await hasPermission(req.user.role, 'attendance.admin.approve')) throw forbidden()
  const id = Number(req.params.id)
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id)
    if (!request) throw notFound('申请不存在')
    if (Number(request.workflow_version || 1) === 2) throw badRequest('新版申请请使用人事或副总审批')
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
    if (Number(request.workflow_version || 1) === 2) {
      const step = await pendingApprovalStep(connection, request.id)
      if (!step) throw badRequest('当前申请没有待审批步骤')
      assertWorkflowStepApprover(step, req.user)
      await connection.execute(
        `UPDATE attendance_request_approvals
         SET status = 'rejected',
             rejected_by = :userId,
             rejected_at = NOW(),
             rejected_reason = :reason
         WHERE id = :id`,
        { id: step.id, userId: req.user.id, reason },
      )
      await connection.execute(
        `UPDATE attendance_requests
         SET status = 'rejected',
             rejected_by = :userId,
             rejected_at = NOW(),
             rejected_reason = :reason
         WHERE id = :id`,
        { id, userId: req.user.id, reason },
      )
      return
    }
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
    if (!['draft', 'pending_delegate', 'pending_supervisor', 'pending_hr', 'pending_vp', 'pending_admin'].includes(request.status)) {
      throw badRequest('当前状态不能撤回')
    }
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
  const hasDeltaDays = Object.prototype.hasOwnProperty.call(req.body || {}, 'deltaDays')
  const deltaAmount = balanceType === 'annual_leave'
    ? Number(hasDeltaDays ? req.body?.deltaDays : Number(req.body?.deltaHours) / WORK_HOURS_PER_DAY)
    : Number(req.body?.deltaHours)
  if (!Number.isFinite(deltaAmount) || deltaAmount === 0) {
    throw badRequest(balanceType === 'annual_leave' ? '调整天数不能为 0' : '调整小时数不能为 0')
  }
  if (balanceType === 'annual_leave') {
    assertHalfUnit(deltaAmount, '年假调整')
  } else {
    assertHalfUnit(deltaAmount, '调休调整')
  }
  const note = nullableText(req.body?.note)
  const employees = await query('SELECT id FROM attendance_employee_profiles WHERE id = :employeeId LIMIT 1', { employeeId })
  if (!employees[0]) throw notFound('员工档案不存在')
  await query(
    `INSERT INTO attendance_balance_ledger
       (employee_id, request_id, balance_type, delta_hours, action, note, created_by)
     VALUES
       (:employeeId, NULL, :balanceType, :deltaHours, 'adjust', :note, :createdBy)`,
    { employeeId, balanceType, deltaHours: roundBalance(deltaAmount), note, createdBy: req.user.id },
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
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'overtime' AND r.overtime_result = 'pay' AND r.overtime_day_type = 'legal_holiday' THEN r.hours ELSE 0 END), 0) AS legal_holiday_overtime_pay_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'overtime' AND r.overtime_result = 'pay' THEN r.hours * COALESCE(r.overtime_pay_multiplier, 1) ELSE 0 END), 0) AS overtime_pay_weighted_hours,
            COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.request_type = 'comp_time' THEN r.hours ELSE 0 END), 0) AS comp_time_used_hours,
            COALESCE((SELECT SUM(l.delta_hours) FROM attendance_balance_ledger l WHERE l.employee_id = p.id AND l.balance_type = 'annual_leave'), 0) AS annual_leave_balance_days,
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
    annualLeaveDays: annualLeaveDaysFromHours(row.annual_leave_hours),
    annualLeaveHours: Number(row.annual_leave_hours || 0),
    sickLeaveHours: Number(row.sick_leave_hours || 0),
    personalLeaveHours: Number(row.personal_leave_hours || 0),
    marriageLeaveHours: Number(row.marriage_leave_hours || 0),
    bereavementLeaveHours: Number(row.bereavement_leave_hours || 0),
    overtimeHours: Number(row.overtime_hours || 0),
    overtimeToCompHours: Number(row.overtime_to_comp_hours || 0),
    overtimeToPayHours: Number(row.overtime_to_pay_hours || 0),
    legalHolidayOvertimePayHours: Number(row.legal_holiday_overtime_pay_hours || 0),
    overtimePayWeightedHours: Number(row.overtime_pay_weighted_hours || 0),
    compTimeUsedHours: Number(row.comp_time_used_hours || 0),
    annualLeaveBalanceDays: Number(row.annual_leave_balance_days || 0),
    annualLeaveBalanceHours: roundBalance(Number(row.annual_leave_balance_days || 0) * WORK_HOURS_PER_DAY),
    compTimeBalanceHours: Number(row.comp_time_balance_hours || 0),
  })) })
}

module.exports = {
  ensureSchema,
  listEmployees,
  listDelegates,
  me,
  listSupervisorRoleRules,
  updateSupervisorRoleRules,
  listLegalHolidays,
  upsertLegalHoliday,
  deleteLegalHoliday,
  updateEmployee,
  createRequest,
  submitRequest,
  listOvertimeServiceOrders,
  createServiceOrderOvertimeRequest,
  listRequests,
  approveDelegate,
  approveSupervisor,
  approveHr,
  approveVp,
  approveAdmin,
  rejectRequest,
  withdrawRequest,
  voidRequest,
  adjustBalance,
  monthlyReport,
}
