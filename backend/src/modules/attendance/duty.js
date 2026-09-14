// spec 013：值班津贴——极简长期设置 + 每月 1 号生成当月批次 + 待办中心确认提交。
const { query, transaction } = require('../../config/db')
const { hasPermission } = require('../../permissions/store')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { holidaySpans, generateMonthlyRecords, nextBatchStatus } = require('./duty-domain')

let schemaReady
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/
const MIGRATION_MARKER = 'v013_cleanup'

function numberIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
}

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS attendance_duty_settings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      duty_kind VARCHAR(40) NOT NULL,
      holiday_name VARCHAR(100) NULL,
      created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uniq_attendance_duty_setting (duty_kind, holiday_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await query(`CREATE TABLE IF NOT EXISTS attendance_duty_setting_members (
      setting_id BIGINT UNSIGNED NOT NULL, employee_id BIGINT UNSIGNED NOT NULL, sequence_no INT UNSIGNED NOT NULL,
      PRIMARY KEY (setting_id, employee_id),
      KEY idx_attendance_duty_setting_member_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await query(`CREATE TABLE IF NOT EXISTS attendance_duty_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, duty_date DATE NOT NULL, duty_month CHAR(7) NOT NULL,
      employee_id BIGINT UNSIGNED NOT NULL, duty_type VARCHAR(40) NOT NULL, reason VARCHAR(100) NOT NULL,
      units DECIMAL(6,2) NOT NULL DEFAULT 1, overlap_state VARCHAR(20) NOT NULL DEFAULT 'none',
      source_template_id BIGINT UNSIGNED NULL, batch_status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uniq_attendance_duty_record (duty_date, employee_id, duty_type),
      KEY idx_attendance_duty_month_status (duty_month, batch_status), KEY idx_attendance_duty_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await query(`CREATE TABLE IF NOT EXISTS attendance_duty_monthly_batches (
      duty_month CHAR(7) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft',
      supervisor_submitted_by BIGINT UNSIGNED NULL, supervisor_submitted_at DATETIME NULL,
      admin_approved_by BIGINT UNSIGNED NULL, admin_approved_at DATETIME NULL,
      rejected_by BIGINT UNSIGNED NULL, rejected_at DATETIME NULL, rejected_reason TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (duty_month), KEY idx_attendance_duty_batch_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await ensureDutyEndDateColumn()
    await migrateV013()
    })()
  return schemaReady
}

async function ensureDutyEndDateColumn() {
  // 注意：query() 直接返回 rows 数组（勿用 [rows, fields] 解构），避免巡检计划同款 500
  const columns = await query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_duty_records' AND COLUMN_NAME = 'duty_end_date'`)
  if (!columns.length) {
    await query(`ALTER TABLE attendance_duty_records ADD COLUMN duty_end_date DATE NULL AFTER duty_date`)
  }
}

// spec 013 一次性迁移：清理旧年度设置生成的未送审记录与批次（已送审/已终审的保留）。
// 用 settings 表里的标记行保证只执行一次（新逻辑也会产生 draft 记录，不能按状态幂等）。
async function migrateV013() {
  const marker = await query(`SELECT id FROM attendance_duty_settings WHERE duty_kind = '_meta' AND holiday_name = :marker`, { marker: MIGRATION_MARKER })
  if (marker.length) return
  await transaction(async (connection) => {
    const [locked] = await connection.execute(`SELECT id FROM attendance_duty_settings WHERE duty_kind = '_meta' AND holiday_name = :marker FOR UPDATE`, { marker: MIGRATION_MARKER })
    if (locked.length) return
    await connection.execute(`DELETE FROM attendance_duty_records WHERE batch_status IN ('draft', 'rejected')`)
    await connection.execute(`DELETE FROM attendance_duty_monthly_batches WHERE status IN ('draft', 'rejected')`)
    await connection.execute(`INSERT INTO attendance_duty_settings (duty_kind, holiday_name) VALUES ('_meta', :marker)`, { marker: MIGRATION_MARKER })
  })
}

async function enabledEngineers(ids) {
  if (!ids.length) return []
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]))
  return query(`SELECT p.id, p.employee_name FROM attendance_employee_profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.attendance_enabled = 1 AND u.status = 'active' AND u.role = 'engineer'
      AND p.id IN (${ids.map((_, index) => `:id${index}`).join(', ')})`, params)
}

async function listEngineers() {
  return query(`SELECT p.id, p.employee_name, u.username FROM attendance_employee_profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.attendance_enabled = 1 AND u.status = 'active' AND u.role = 'engineer'
    ORDER BY p.employee_name, p.id`)
}

// 读取长期设置：月度名单 + 按假期名称的值班名单（Map<name, ids>）
async function loadSettings() {
  const rows = await query(`SELECT s.id, s.duty_kind, s.holiday_name, m.employee_id, m.sequence_no
    FROM attendance_duty_settings s LEFT JOIN attendance_duty_setting_members m ON m.setting_id = s.id
    WHERE s.duty_kind IN ('monthly_on_call', 'legal_holiday_on_call')
    ORDER BY s.duty_kind, s.holiday_name, m.sequence_no`)
  const monthlyIds = []
  const holidayAssignees = new Map()
  for (const row of rows) {
    if (row.duty_kind === 'monthly_on_call') {
      if (row.employee_id) monthlyIds.push(Number(row.employee_id))
    } else {
      if (!holidayAssignees.has(row.holiday_name)) holidayAssignees.set(row.holiday_name, [])
      if (row.employee_id) holidayAssignees.get(row.holiday_name).push(Number(row.employee_id))
    }
  }
  return { monthlyIds, holidayAssignees }
}

// 生成某月记录（不写库）：月度名单 + 落在当月的法定节假日段
async function buildMonthRecords(month) {
  const { monthlyIds, holidayAssignees } = await loadSettings()
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const holidayRows = await query(`SELECT holiday_date, holiday_name FROM attendance_legal_holidays
    WHERE is_active = 1 AND day_type = 'legal_holiday' AND holiday_date >= :start AND holiday_date <= :end
    ORDER BY holiday_date`, { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` })
  return generateMonthlyRecords({
    month, monthlyIds, holidayAssignees,
    holidayRows: holidayRows.map((row) => ({ date: String(row.holiday_date).slice(0, 10), name: row.holiday_name })),
  })
}

// 把一批记录写入某月（调用方负责批次存在性与状态判断），事务内执行
async function insertMonthRecords(connection, month, records) {
  for (const record of records) {
    await connection.execute(`INSERT INTO attendance_duty_records
      (duty_date, duty_end_date, duty_month, employee_id, duty_type, reason, units, overlap_state, source_template_id, batch_status)
      VALUES (:date, :endDate, :month, :employeeId, :dutyType, :reason, :units, 'none', NULL, 'draft')`,
    { date: record.date, endDate: record.endDate || null, month, employeeId: record.employeeId, dutyType: record.dutyType, reason: String(record.reason).slice(0, 100), units: record.units })
  }
}

async function settings(req, res) {
  await ensureSchema()
  const { monthlyIds, holidayAssignees } = await loadSettings()
  const [engineers, holidayRows] = await Promise.all([
    listEngineers(),
    // 展示当年 + 次年的假期段，便于主管按名称配置时看到最近的发生日期
    query(`SELECT holiday_date, holiday_name FROM attendance_legal_holidays
      WHERE is_active = 1 AND day_type = 'legal_holiday' AND holiday_date >= :start AND holiday_date <= :end
      ORDER BY holiday_date`, { start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear() + 1}-12-31` }),
  ])
  const spans = holidaySpans(holidayRows.map((row) => ({ date: String(row.holiday_date).slice(0, 10), name: row.holiday_name })))
  // 同名假期跨年合并为一项，附最近发生的日期段用于展示
  const byName = new Map()
  for (const span of spans) {
    if (!byName.has(span.name)) byName.set(span.name, { name: span.name, spans: [] })
    byName.get(span.name).spans.push({ startDate: span.start, endDate: span.end, days: span.days })
  }
  const holidays = [...byName.values()].map((item) => ({ ...item, employeeIds: holidayAssignees.get(item.name) || [] }))
  res.json({ engineers, monthly: { employeeIds: monthlyIds }, holidays })
}

async function saveSettings(req, res) {
  await ensureSchema()
  const monthlyIds = numberIds(req.body?.monthly?.employeeIds)
  const holidayItems = Array.isArray(req.body?.holidays) ? req.body.holidays : []
  if (!monthlyIds.length) throw badRequest('请选择至少一名每月值班工程师')
  const holidays = holidayItems.map((item) => ({ name: String(item.name || '').trim().slice(0, 100), employeeIds: numberIds(item.employeeIds) }))
    .filter((item) => item.name && item.employeeIds.length)
  const allIds = [...new Set([...monthlyIds, ...holidays.flatMap((item) => item.employeeIds)])]
  const validEngineers = await enabledEngineers(allIds)
  if (validEngineers.length !== allIds.length) throw badRequest('选择中包含停用或非工程师账号')
  const month = shanghaiMonthString()
  const result = await transaction(async (connection) => {
    // 重写设置：全删全插（设置规模小，简单可靠）
    const [settingRows] = await connection.execute(`SELECT id FROM attendance_duty_settings WHERE duty_kind IN ('monthly_on_call', 'legal_holiday_on_call')`)
    if (settingRows.length) {
      await connection.execute(`DELETE FROM attendance_duty_setting_members WHERE setting_id IN (${settingRows.map(() => '?').join(', ')})`, settingRows.map((row) => row.id))
      await connection.execute(`DELETE FROM attendance_duty_settings WHERE duty_kind IN ('monthly_on_call', 'legal_holiday_on_call')`)
    }
    const insertSetting = async (kind, holidayName, employeeIds) => {
      const [inserted] = await connection.execute(`INSERT INTO attendance_duty_settings (duty_kind, holiday_name, created_by, updated_by) VALUES (?, ?, ?, ?)`, [kind, holidayName, req.user.id, req.user.id])
      const settingId = Number(inserted.insertId)
      for (const [index, employeeId] of employeeIds.entries()) {
        await connection.execute('INSERT INTO attendance_duty_setting_members (setting_id, employee_id, sequence_no) VALUES (?, ?, ?)', [settingId, employeeId, index + 1])
      }
    }
    await insertSetting('monthly_on_call', null, monthlyIds)
    for (const holiday of holidays) await insertSetting('legal_holiday_on_call', holiday.name, holiday.employeeIds)
    // 当月批次未送审（draft/rejected）时按新设置重算；批次不存在则直接生成（含迁移清理后/首次配置场景）
    const [batches] = await connection.execute('SELECT * FROM attendance_duty_monthly_batches WHERE duty_month = ? FOR UPDATE', [month])
    const batch = batches[0]
    let regenerated = 0
    if (!batch) {
      const records = await buildMonthRecords(month)
      if (records.length) {
        await connection.execute(`INSERT INTO attendance_duty_monthly_batches (duty_month, status) VALUES (?, 'draft')`, [month])
        await insertMonthRecords(connection, month, records)
        regenerated = records.length
      }
    } else if (['draft', 'rejected'].includes(batch.status)) {
      await connection.execute('DELETE FROM attendance_duty_records WHERE duty_month = ?', [month])
      const records = await buildMonthRecords(month)
      await insertMonthRecords(connection, month, records)
      regenerated = records.length
    }
    return { regenerated }
  })
  res.json({ ok: true, regenerated: result.regenerated })
}

async function monthly(req, res) {
  await ensureSchema()
  const month = String(req.query.month || '')
  if (!monthPattern.test(month)) throw badRequest('月份格式不正确')
  const [batchRows, records] = await Promise.all([
    query('SELECT * FROM attendance_duty_monthly_batches WHERE duty_month = :month', { month }),
    query(`SELECT r.*, p.employee_name FROM attendance_duty_records r JOIN attendance_employee_profiles p ON p.id = r.employee_id
      WHERE r.duty_month = :month ORDER BY r.duty_date, p.employee_name, r.duty_type`, { month }),
  ])
  res.json({ month, batch: batchRows[0] || { duty_month: month, status: null }, records })
}

async function transition(req, res, action) {
  await ensureSchema()
  const month = String(req.params.month || '')
  if (!monthPattern.test(month)) throw badRequest('月份格式不正确')
  let notify = false
  await transaction(async (connection) => {
    const [batches] = await connection.execute('SELECT * FROM attendance_duty_monthly_batches WHERE duty_month = :month FOR UPDATE', { month })
    const current = batches[0]
    if (!current) throw notFound('该月值班批次不存在')
    const next = nextBatchStatus(current.status, action)
    if (!next) throw badRequest('当前状态不能执行此操作')
    if (action === 'submit') {
      const [counts] = await connection.execute('SELECT COUNT(*) total FROM attendance_duty_records WHERE duty_month = :month', { month })
      if (!Number(counts[0].total)) throw badRequest('该月没有值班记录')
      await connection.execute(`UPDATE attendance_duty_monthly_batches SET status = :next, supervisor_submitted_by = :userId,
        supervisor_submitted_at = NOW(), rejected_by = NULL, rejected_at = NULL, rejected_reason = NULL WHERE duty_month = :month`, { next, userId: req.user.id, month })
      notify = true
    } else if (action === 'approve') {
      await connection.execute(`UPDATE attendance_duty_monthly_batches SET status = :next, admin_approved_by = :userId, admin_approved_at = NOW() WHERE duty_month = :month`, { next, userId: req.user.id, month })
    } else {
      const reason = String(req.body?.reason || '').trim()
      if (!reason) throw badRequest('请填写退回原因')
      await connection.execute(`UPDATE attendance_duty_monthly_batches SET status = :next, rejected_by = :userId, rejected_at = NOW(), rejected_reason = :reason WHERE duty_month = :month`, { next, userId: req.user.id, reason, month })
    }
    await connection.execute('UPDATE attendance_duty_records SET batch_status = :next WHERE duty_month = :month', { next, month })
  })
  if (notify) await queueDutyPendingAdminNotification(month)
  res.json({ ok: true })
}

const submit = (req, res) => transition(req, res, 'submit')
const approve = (req, res) => transition(req, res, 'approve')
const reject = (req, res) => transition(req, res, 'reject')

// 每月 1 号生成当月值班批次：批次不存在且设置能产出记录时创建 draft 批次，
// 主管随后在待办中心确认提交（spec 013：不再自动提交行政）。
// 幂等：批次已存在 / 无记录产出时跳过并返回原因。
function shanghaiMonthString(reference) {
  const shifted = new Date((reference || new Date()).getTime() + 8 * 60 * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

async function generateMonthlyBatch(reference) {
  await ensureSchema()
  const month = shanghaiMonthString(reference)
  const records = await buildMonthRecords(month)
  if (!records.length) return { month, generated: false, reason: 'no_records' }
  const generated = await transaction(async (connection) => {
    const [batches] = await connection.execute('SELECT duty_month, status FROM attendance_duty_monthly_batches WHERE duty_month = :month FOR UPDATE', { month })
    if (batches.length) return false
    await connection.execute(`INSERT INTO attendance_duty_monthly_batches (duty_month, status) VALUES (:month, 'draft')`, { month })
    await insertMonthRecords(connection, month, records)
    return true
  })
  return { month, generated, count: generated ? records.length : 0, reason: generated ? undefined : 'batch_exists' }
}

async function queueDutyPendingAdminNotification(month) {
  const { enqueueAttendanceEmailNotification } = require('../../services/attendance-notifications')
  const admins = await query(`SELECT id, real_name, username, email FROM users
    WHERE status = 'active' AND role IN ('admin') AND email IS NOT NULL AND email <> ''`)
  if (!admins.length) return { queued: false, reason: 'no_admin_email' }
  const [stats] = await query(`SELECT COUNT(*) total, SUM(units) units FROM attendance_duty_records WHERE duty_month = :month AND batch_status = 'pending_admin'`, { month })
  const total = Number(stats[0]?.total || 0)
  const units = Number(stats[0]?.units || 0)
  const result = await enqueueAttendanceEmailNotification(null, {
    requestId: 0,
    eventKey: `duty:${month}:submitted`,
    eventType: 'duty_pending_admin',
    recipients: admins,
    payload: { month, total, units, auto: false },
  })
  return result
}

async function listMonthlyBatches(status) {
  await ensureSchema()
  const rows = await query(`SELECT b.duty_month, b.status, b.supervisor_submitted_by, b.supervisor_submitted_at, b.admin_approved_at, b.rejected_at, b.rejected_reason,
      COUNT(r.id) AS record_count, COALESCE(SUM(r.units), 0) AS units_sum
    FROM attendance_duty_monthly_batches b
    LEFT JOIN attendance_duty_records r ON r.duty_month = b.duty_month
    WHERE (:status = '' OR b.status = :status)
    GROUP BY b.duty_month, b.status, b.supervisor_submitted_by, b.supervisor_submitted_at, b.admin_approved_at, b.rejected_at, b.rejected_reason
    ORDER BY b.duty_month DESC`,
  { status: String(status || '') })
  return rows.map((row) => ({
    month: row.duty_month, status: row.status,
    submittedAt: row.supervisor_submitted_at, approvedAt: row.admin_approved_at,
    rejectedAt: row.rejected_at, rejectedReason: row.rejected_reason,
    recordCount: Number(row.record_count), unitsSum: Number(row.units_sum),
    autoSubmitted: !row.supervisor_submitted_by,
  }))
}

// —— 待办中心接入（spec 013 三）：与考勤审批同构，由 approval-tasks 聚合 ——

function dutyTaskPayload(row, view) {
  const actedAt = row.supervisor_submitted_at || row.admin_approved_at || row.rejected_at || null
  return {
    id: `duty-${row.duty_month}`,
    businessType: 'duty',
    businessId: 0,
    title: `${row.duty_month} 值班津贴确认`,
    assigneeName: null,
    initiatorName: '系统（每月 1 号自动生成）',
    status: view === 'pending' ? 'pending' : row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'pending',
    businessStatus: row.status,
    currentStepLabel: view === 'pending' ? (['draft', 'rejected'].includes(row.status) ? '主管确认提交' : '行政终审') : null,
    customerName: null,
    ctrlNo: null,
    timeLabel: `${row.record_count} 条记录 · ${row.units_sum} 人次`,
    detailPath: '/attendance?tab=duty',
    createdAt: row.created_at,
    completedAt: view === 'pending' ? null : actedAt || row.updated_at,
  }
}

const DUTY_TASK_SELECT = `SELECT b.duty_month, b.status, b.supervisor_submitted_by, b.supervisor_submitted_at,
    b.admin_approved_by, b.admin_approved_at, b.rejected_by, b.rejected_at, b.created_at, b.updated_at,
    COUNT(r.id) AS record_count, COALESCE(SUM(r.units), 0) AS units_sum
  FROM attendance_duty_monthly_batches b
  LEFT JOIN attendance_duty_records r ON r.duty_month = b.duty_month`

async function listDutyApprovalTaskItems(user, view = 'pending') {
  await ensureSchema()
  const canManage = await hasPermission(user.role, 'attendance.duty.manage')
  const canApprove = await hasPermission(user.role, 'attendance.duty.admin.approve')
  if (!canManage && !canApprove) return []
  if (view === 'initiated') return [] // 系统生成，无人工发起人
  if (view === 'completed') {
    const rows = await query(`${DUTY_TASK_SELECT}
      WHERE b.supervisor_submitted_by = :userId OR b.admin_approved_by = :userId OR b.rejected_by = :userId
      GROUP BY b.duty_month ORDER BY b.updated_at DESC LIMIT 200`, { userId: user.id })
    return rows.map((row) => dutyTaskPayload(row, view))
  }
  // 待我处理：主管待确认（draft/rejected）+ 行政待终审（pending_admin），按权限取并集
  const statuses = [...(canManage ? ['draft', 'rejected'] : []), ...(canApprove ? ['pending_admin'] : [])]
  const rows = await query(`${DUTY_TASK_SELECT}
    WHERE b.status IN (${statuses.map((status) => `'${status}'`).join(', ')})
    GROUP BY b.duty_month ORDER BY b.duty_month DESC LIMIT 200`)
  return rows.map((row) => dutyTaskPayload(row, view))
}

async function pendingDutyApprovalCountValue(user) {
  await ensureSchema()
  const canManage = await hasPermission(user.role, 'attendance.duty.manage')
  const canApprove = await hasPermission(user.role, 'attendance.duty.admin.approve')
  const statuses = [...(canManage ? ['draft', 'rejected'] : []), ...(canApprove ? ['pending_admin'] : [])]
  if (!statuses.length) return 0
  const [row] = await query(`SELECT COUNT(*) AS total FROM attendance_duty_monthly_batches
    WHERE status IN (${statuses.map((status) => `'${status}'`).join(', ')})`)
  return Number(row?.total || 0)
}

async function dutyApprovalTaskCountsValue(user) {
  await ensureSchema()
  const canManage = await hasPermission(user.role, 'attendance.duty.manage')
  const canApprove = await hasPermission(user.role, 'attendance.duty.admin.approve')
  if (!canManage && !canApprove) return { pending: 0, initiated: 0, completed: 0 }
  const pending = await pendingDutyApprovalCountValue(user)
  const [completed] = await query(`SELECT COUNT(*) AS total FROM attendance_duty_monthly_batches
    WHERE supervisor_submitted_by = :userId OR admin_approved_by = :userId OR rejected_by = :userId`, { userId: user.id })
  return { pending, initiated: 0, completed: Number(completed?.total || 0) }
}

module.exports = {
  ensureSchema, settings, saveSettings, monthly, submit, approve, reject,
  generateMonthlyBatch, listMonthlyBatches,
  listDutyApprovalTaskItems, pendingDutyApprovalCountValue, dutyApprovalTaskCountsValue,
}
