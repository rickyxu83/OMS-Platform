const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { weekendDates, holidaySpans, assignDates, dedupeRecords, markOverlaps, nextBatchStatus } = require('./duty-domain')

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

async function ensureDutyEndDateColumn() {
  const [columns] = await query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_duty_records' AND COLUMN_NAME = 'duty_end_date'`)
  if (!columns.length) {
    await query(`ALTER TABLE attendance_duty_records ADD COLUMN duty_end_date DATE NULL AFTER duty_date`)
  }
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
    await ensureDutyEndDateColumn()
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
  const [templates, holidayRows, engineers] = await Promise.all([
    query(`SELECT t.id, t.duty_type, t.assignment_mode, t.template_name, m.employee_id, m.sequence_no
      FROM attendance_duty_templates t LEFT JOIN attendance_duty_template_members m ON m.template_id = t.id
      WHERE t.duty_year = :year ORDER BY t.duty_type, m.sequence_no`, { year }),
    query(`SELECT holiday_date, holiday_name FROM attendance_legal_holidays
      WHERE is_active = 1 AND day_type = 'legal_holiday' AND holiday_date >= :start AND holiday_date <= :end ORDER BY holiday_date`, { start: `${year}-01-01`, end: `${year}-12-31` }),
    listEngineers(),
  ])
  const weekend = templates.filter((row) => row.duty_type === 'weekend_on_call')
  const holidays = holidayRows.map((row) => ({ date: row.holiday_date, name: row.holiday_name }))
  const spans = holidaySpans(holidays)
  // 历史按天记录按假期名聚合为已选人员（同一假期多天去重合并）
  const holidayAssignments = await query(`SELECT duty_date, employee_id, reason FROM attendance_duty_records
    WHERE duty_type = 'legal_holiday_on_call' AND duty_date >= :start AND duty_date <= :end AND batch_status IN ('draft', 'rejected')
    ORDER BY duty_date, employee_id`, { start: `${year}-01-01`, end: `${year}-12-31` })
  const assignmentByName = new Map()
  for (const row of holidayAssignments) {
    const name = row.reason || '法定节假日'
    if (!assignmentByName.has(name)) assignmentByName.set(name, new Set())
    assignmentByName.get(name).add(Number(row.employee_id))
  }
  const items = holidaySpans.map((span) => ({
    name: span.name, startDate: span.start, endDate: span.end, days: span.days,
    employeeIds: [...(assignmentByName.get(span.name) || [])],
  }))
  res.json({ year, engineers, weekend: weekend.length ? { mode: weekend[0].assignment_mode, employeeIds: weekend.map((row) => Number(row.employee_id)).filter(Boolean) } : null,
    holidays: items })
}

async function saveSetup(req, res) {
  await ensureSchema()
  const year = Number(req.params.year)
  if (!yearPattern.test(String(year))) throw badRequest('年份格式不正确')
  const mode = req.body?.weekend?.mode === 'rotation' ? 'rotation' : 'fixed'
  const weekendEmployeeIds = numberIds(req.body?.weekend?.employeeIds)
  const holidayItems = Array.isArray(req.body?.holidays) ? req.body.holidays : []
  if (!weekendEmployeeIds.length) throw badRequest('请选择至少一名 7×24 值班工程师')
  // 假期段校验：一个假期一份配置（起止日期 + 天数），每人一条记录、units 记天数
  const holidayRecords = holidayItems.flatMap((item) => {
    if (!validDate(item.startDate, year) || !validDate(item.endDate, year)) throw badRequest('法定节假日日期格式不正确')
    if (String(item.startDate) > String(item.endDate)) throw badRequest('假期起止日期不正确')
    const days = Number(item.days)
    if (!Number.isInteger(days) || days < 1 || days > 31) throw badRequest('假期天数不正确')
    const employeeIds = numberIds(item.employeeIds)
    if (!employeeIds.length) return []
    const name = String(item.name || '法定节假日').slice(0, 100)
    return employeeIds.map((employeeId) => ({ date: item.startDate, endDate: item.endDate, days, employeeId, name }))
  })
  const allIds = [...new Set([...weekendEmployeeIds, ...holidayRecords.map((item) => item.employeeId)])]
  const validEngineers = await enabledEngineers(allIds)
  if (validEngineers.length !== allIds.length) throw badRequest('选择中包含停用或非工程师账号')
  const rawRecords = [
    ...assignDates(weekendDates(year), weekendEmployeeIds, mode).map((item) => ({ ...item, dutyType: 'weekend_on_call', reason: '7×24 值班' })),
    ...holidayRecords.map((item) => ({ ...item, dutyType: 'legal_holiday_on_call', reason: item.name })),
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
    // 假期段按起始月归属；段内任一月已送审则整段跳过（不删不插，保护已审批数据）
    const spanMonths = (span) => {
      const startMonth = span.date.slice(0, 7)
      const endMonth = String(span.endDate || span.date).slice(0, 7)
      return new Set([startMonth, endMonth])
    }
    const editableMonths = [...new Set(records.map((record) => record.date.slice(0, 7)).filter((month) => !lockedMonths.has(month)))]
    if (editableMonths.length) {
      const params = Object.fromEntries(editableMonths.map((month, index) => [`month${index}`, month]))
      await connection.execute(`DELETE FROM attendance_duty_records WHERE duty_month IN (${editableMonths.map((_, index) => `:month${index}`).join(', ')}) AND batch_status IN ('draft', 'rejected')`, params)
    }
    // 删除假期段范围内的旧按天记录（历史数据），整段未锁定才允许
    const writableSpans = records.filter((record) => record.dutyType === 'legal_holiday_on_call' && [...spanMonths(record)].every((month) => !lockedMonths.has(month)))
    const holidayParams = Object.fromEntries(writableSpans.map((span, index) => [`start${index}`, span.date, `end${index}`, span.endDate]))
    if (writableSpans.length) {
      await connection.execute(`DELETE FROM attendance_duty_records
        WHERE duty_type = 'legal_holiday_on_call' AND batch_status IN ('draft', 'rejected') AND (
          ${writableSpans.map((_, index) => `duty_date BETWEEN :start${index} AND :end${index}`).join(' OR ')}
        )`, holidayParams)
    }
    for (const record of records) {
      const month = record.date.slice(0, 7)
      if (lockedMonths.has(month)) continue
      if (record.dutyType === 'legal_holiday_on_call' && [...spanMonths(record)].some((spanMonth) => lockedMonths.has(spanMonth))) continue
      await connection.execute(`INSERT INTO attendance_duty_records
        (duty_date, duty_end_date, duty_month, employee_id, duty_type, reason, units, overlap_state, source_template_id, batch_status)
        VALUES (:date, :endDate, :month, :employeeId, :dutyType, :reason, :units, :overlapState, :templateId, 'draft')`,
      { ...record, month, endDate: record.endDate || null, units: record.units ?? 1, templateId: record.dutyType === 'weekend_on_call' ? templateId : null })
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
    if (keepType === 'weekend_on_call') {
      // 保留 7×24：删除覆盖该周末日的节假日段记录（段内任一天与之冲突即整段让位）
      await connection.execute(`DELETE FROM attendance_duty_records WHERE duty_type = 'legal_holiday_on_call' AND employee_id = :employeeId
        AND duty_date <= :date AND COALESCE(duty_end_date, duty_date) >= :date AND batch_status IN ('draft', 'rejected')`,
        { date: record.duty_date, employeeId: record.employee_id })
      // 该 weekend 记录不再冲突，置为已处理
      await connection.execute(`UPDATE attendance_duty_records SET overlap_state = 'resolved' WHERE id = :id`, { id })
    } else {
      // 保留法定节假日：删除该假期段内同人的 7×24 记录，假期段记录置为已处理
      await connection.execute(`DELETE FROM attendance_duty_records WHERE duty_type = 'weekend_on_call' AND employee_id = :employeeId
        AND duty_date >= :start AND duty_date <= :end AND batch_status IN ('draft', 'rejected')`,
        { start: record.duty_date, end: record.duty_end_date || record.duty_date, employeeId: record.employee_id })
      await connection.execute(`UPDATE attendance_duty_records SET overlap_state = 'resolved' WHERE id = :id`, { id })
    }
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
