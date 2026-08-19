const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { weekendDates, assignDates, dedupeRecords, markOverlaps, nextBatchStatus } = require('./duty-domain')

let schemaReady
const yearPattern = /^20\d{2}$/
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/
const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/

function numberIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
}

function validDate(value, year) {
  if (!datePattern.test(String(value || '')) || !String(value).startsWith(`${year}-`)) return false
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS attendance_duty_templates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, duty_year INT UNSIGNED NOT NULL,
      duty_type VARCHAR(40) NOT NULL, assignment_mode VARCHAR(20) NOT NULL DEFAULT 'fixed',
      template_name VARCHAR(100) NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uniq_attendance_duty_template (duty_year, duty_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await query(`CREATE TABLE IF NOT EXISTS attendance_duty_template_members (
      template_id BIGINT UNSIGNED NOT NULL, employee_id BIGINT UNSIGNED NOT NULL, sequence_no INT UNSIGNED NOT NULL,
      PRIMARY KEY (template_id, employee_id), UNIQUE KEY uniq_attendance_duty_member_sequence (template_id, sequence_no),
      KEY idx_attendance_duty_member_employee (employee_id)
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
  })()
  return schemaReady
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

async function setup(req, res) {
  await ensureSchema()
  const year = Number(req.query.year)
  if (!yearPattern.test(String(year))) throw badRequest('年份格式不正确')
  const [templates, holidays, engineers] = await Promise.all([
    query(`SELECT t.id, t.duty_type, t.assignment_mode, t.template_name, m.employee_id, m.sequence_no
      FROM attendance_duty_templates t LEFT JOIN attendance_duty_template_members m ON m.template_id = t.id
      WHERE t.duty_year = :year ORDER BY t.duty_type, m.sequence_no`, { year }),
    query(`SELECT holiday_date, holiday_name FROM attendance_legal_holidays
      WHERE is_active = 1 AND holiday_date >= :start AND holiday_date <= :end ORDER BY holiday_date`, { start: `${year}-01-01`, end: `${year}-12-31` }),
    listEngineers(),
  ])
  const weekend = templates.filter((row) => row.duty_type === 'weekend_on_call')
  const holidayAssignments = await query(`SELECT duty_date, employee_id, reason FROM attendance_duty_records
    WHERE duty_type = 'legal_holiday_on_call' AND duty_date >= :start AND duty_date <= :end AND batch_status IN ('draft', 'rejected')
    ORDER BY duty_date, employee_id`, { start: `${year}-01-01`, end: `${year}-12-31` })
  res.json({ year, engineers, weekend: weekend.length ? { mode: weekend[0].assignment_mode, employeeIds: weekend.map((row) => Number(row.employee_id)).filter(Boolean) } : null,
    holidays: holidays.map((row) => ({ date: row.holiday_date, name: row.holiday_name })), holidayAssignments })
}

async function saveSetup(req, res) {
  await ensureSchema()
  const year = Number(req.params.year)
  if (!yearPattern.test(String(year))) throw badRequest('年份格式不正确')
  const mode = req.body?.weekend?.mode === 'rotation' ? 'rotation' : 'fixed'
  const weekendEmployeeIds = numberIds(req.body?.weekend?.employeeIds)
  const holidayItems = Array.isArray(req.body?.holidays) ? req.body.holidays : []
  if (!weekendEmployeeIds.length) throw badRequest('请选择至少一名 7×24 值班工程师')
  const holidayRecords = holidayItems.flatMap((item) => {
    if (!validDate(item.date, year)) throw badRequest('法定节假日日期格式不正确')
    const employeeIds = numberIds(item.employeeIds)
    if (!employeeIds.length) return []
    return employeeIds.map((employeeId) => ({ date: item.date, employeeId, reason: String(item.name || '法定节假日值班').slice(0, 100) }))
  })
  const allIds = [...new Set([...weekendEmployeeIds, ...holidayRecords.map((item) => item.employeeId)])]
  const validEngineers = await enabledEngineers(allIds)
  if (validEngineers.length !== allIds.length) throw badRequest('选择中包含停用或非工程师账号')
  const rawRecords = [
    ...assignDates(weekendDates(year), weekendEmployeeIds, mode).map((item) => ({ ...item, dutyType: 'weekend_on_call', reason: '7×24 值班' })),
    ...holidayRecords.map((item) => ({ ...item, dutyType: 'legal_holiday_on_call' })),
  ]
  const records = markOverlaps(dedupeRecords(rawRecords))
  await transaction(async (connection) => {
    const [locked] = await connection.execute(`SELECT duty_month FROM attendance_duty_monthly_batches
      WHERE duty_month LIKE :yearPrefix AND status NOT IN ('draft', 'rejected') FOR UPDATE`, { yearPrefix: `${year}-%` })
    const lockedMonths = new Set(locked.map((row) => row.duty_month))
    const [templateResult] = await connection.execute(`INSERT INTO attendance_duty_templates
      (duty_year, duty_type, assignment_mode, template_name, created_by, updated_by)
      VALUES (:year, 'weekend_on_call', :mode, '7×24 年度值班', :userId, :userId)
      ON DUPLICATE KEY UPDATE assignment_mode = VALUES(assignment_mode), updated_by = VALUES(updated_by), id = LAST_INSERT_ID(id)`, { year, mode, userId: req.user.id })
    const templateId = Number(templateResult.insertId)
    await connection.execute('DELETE FROM attendance_duty_template_members WHERE template_id = :templateId', { templateId })
    for (const [index, employeeId] of weekendEmployeeIds.entries()) await connection.execute(
      'INSERT INTO attendance_duty_template_members (template_id, employee_id, sequence_no) VALUES (:templateId, :employeeId, :sequence)',
      { templateId, employeeId, sequence: index + 1 })
    const editableMonths = [...new Set(records.map((record) => record.date.slice(0, 7)).filter((month) => !lockedMonths.has(month)))]
    if (editableMonths.length) {
      const params = Object.fromEntries(editableMonths.map((month, index) => [`month${index}`, month]))
      await connection.execute(`DELETE FROM attendance_duty_records WHERE duty_month IN (${editableMonths.map((_, index) => `:month${index}`).join(', ')}) AND batch_status IN ('draft', 'rejected')`, params)
    }
    for (const record of records) {
      const month = record.date.slice(0, 7)
      if (lockedMonths.has(month)) continue
      await connection.execute(`INSERT INTO attendance_duty_records
        (duty_date, duty_month, employee_id, duty_type, reason, units, overlap_state, source_template_id, batch_status)
        VALUES (:date, :month, :employeeId, :dutyType, :reason, 1, :overlapState, :templateId, 'draft')`,
      { ...record, month, templateId: record.dutyType === 'weekend_on_call' ? templateId : null })
    }
  })
  res.json({ ok: true, generated: records.length })
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
  res.json({ month, batch: batchRows[0] || { duty_month: month, status: 'draft' }, records })
}

async function resolveOverlap(req, res) {
  await ensureSchema()
  const id = Number(req.params.id)
  const keepType = String(req.body?.keepType || '')
  if (!['weekend_on_call', 'legal_holiday_on_call'].includes(keepType)) throw badRequest('请选择保留的值班类型')
  const rows = await query('SELECT * FROM attendance_duty_records WHERE id = :id', { id })
  const record = rows[0]
  if (!record) throw notFound('值班记录不存在')
  if (!['draft', 'rejected'].includes(record.batch_status)) throw forbidden('该月份已送审，不能修改')
  await transaction(async (connection) => {
    await connection.execute(`DELETE FROM attendance_duty_records WHERE duty_date = :date AND employee_id = :employeeId
      AND duty_type <> :keepType AND batch_status IN ('draft', 'rejected')`, { date: record.duty_date, employeeId: record.employee_id, keepType })
    await connection.execute(`UPDATE attendance_duty_records SET overlap_state = 'resolved' WHERE duty_date = :date AND employee_id = :employeeId AND duty_type = :keepType`,
      { date: record.duty_date, employeeId: record.employee_id, keepType })
  })
  res.json({ ok: true })
}

async function transition(req, res, action) {
  await ensureSchema()
  const month = String(req.params.month || '')
  if (!monthPattern.test(month)) throw badRequest('月份格式不正确')
  await transaction(async (connection) => {
    await connection.execute(`INSERT IGNORE INTO attendance_duty_monthly_batches (duty_month, status) VALUES (:month, 'draft')`, { month })
    const [batches] = await connection.execute('SELECT * FROM attendance_duty_monthly_batches WHERE duty_month = :month FOR UPDATE', { month })
    const current = batches[0]
    const next = nextBatchStatus(current.status, action)
    if (!next) throw badRequest('当前状态不能执行此操作')
    if (action === 'submit') {
      const [counts] = await connection.execute(`SELECT COUNT(*) total, SUM(overlap_state = 'unresolved') unresolved FROM attendance_duty_records WHERE duty_month = :month`, { month })
      if (!Number(counts[0].total)) throw badRequest('该月没有值班记录')
      if (Number(counts[0].unresolved)) throw badRequest('请先处理周末与法定节假日重叠记录')
      await connection.execute(`UPDATE attendance_duty_monthly_batches SET status = :next, supervisor_submitted_by = :userId,
        supervisor_submitted_at = NOW(), rejected_by = NULL, rejected_at = NULL, rejected_reason = NULL WHERE duty_month = :month`, { next, userId: req.user.id, month })
    } else if (action === 'approve') {
      await connection.execute(`UPDATE attendance_duty_monthly_batches SET status = :next, admin_approved_by = :userId, admin_approved_at = NOW() WHERE duty_month = :month`, { next, userId: req.user.id, month })
    } else {
      const reason = String(req.body?.reason || '').trim()
      if (!reason) throw badRequest('请填写退回原因')
      await connection.execute(`UPDATE attendance_duty_monthly_batches SET status = :next, rejected_by = :userId, rejected_at = NOW(), rejected_reason = :reason WHERE duty_month = :month`, { next, userId: req.user.id, reason, month })
    }
    await connection.execute('UPDATE attendance_duty_records SET batch_status = :next WHERE duty_month = :month', { next, month })
  })
  res.json({ ok: true })
}

const submit = (req, res) => transition(req, res, 'submit')
const approve = (req, res) => transition(req, res, 'approve')
const reject = (req, res) => transition(req, res, 'reject')

module.exports = { ensureSchema, setup, saveSetup, monthly, resolveOverlap, submit, approve, reject }
