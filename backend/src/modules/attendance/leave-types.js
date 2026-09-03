// 假别元数据（spec 004）：表驱动替代前后端写死枚举。
// 产假等政策性强假别再配置化——参考天数/政策说明仅展示不校验，审批人把关；
// 申请提交时把名称/参考天数/政策说明快照进 attendance_requests，政策文案调整不影响历史单据口径。
const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')

const LEAVE_TYPE_SEED = Object.freeze([
  // 与写死版本行为对齐：requiresLeaveProof=sick+marriage（workflow.js），includeNonWorkingDays=marriage+bereavement
  { code: 'annual', label: '特休', sortOrder: 10, requiresProof: 0, includeNonWorkingDays: 0, countsBalance: 1, systemReserved: 1 },
  { code: 'sick', label: '病假', sortOrder: 20, requiresProof: 1, includeNonWorkingDays: 0, countsBalance: 0, systemReserved: 0, paidQuotaDays: 3, exceedDeductionPercent: 30 },
  { code: 'personal', label: '事假', sortOrder: 30, requiresProof: 0, includeNonWorkingDays: 0, countsBalance: 0, systemReserved: 0 },
  { code: 'marriage', label: '婚假', sortOrder: 40, requiresProof: 1, includeNonWorkingDays: 1, countsBalance: 0, systemReserved: 0 },
  { code: 'bereavement', label: '丧假', sortOrder: 50, requiresProof: 0, includeNonWorkingDays: 1, countsBalance: 0, systemReserved: 0 },
])

async function ensureLeaveTypeSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS attendance_leave_types (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(32) NOT NULL,
      label VARCHAR(64) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      requires_proof TINYINT(1) NOT NULL DEFAULT 0,
      include_non_working_days TINYINT(1) NOT NULL DEFAULT 0,
      counts_balance TINYINT(1) NOT NULL DEFAULT 0,
      reference_days VARCHAR(64) NULL,
      policy_note VARCHAR(500) NULL,
      paid_quota_days DECIMAL(5,1) NULL,
      exceed_deduction_percent INT NULL,
      system_reserved TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_attendance_leave_types_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  const count = await query('SELECT COUNT(*) AS n FROM attendance_leave_types')
  if (!Number(count[0]?.n || 0)) {
    for (const item of LEAVE_TYPE_SEED) {
      await query(
        `INSERT INTO attendance_leave_types
           (code, label, sort_order, requires_proof, include_non_working_days, counts_balance, reference_days, policy_note, paid_quota_days, exceed_deduction_percent, system_reserved)
         VALUES
           (:code, :label, :sortOrder, :requiresProof, :includeNonWorkingDays, :countsBalance, :referenceDays, :policyNote, :paidQuotaDays, :exceedDeductionPercent, :systemReserved)`,
        {
          code: item.code,
          label: item.label,
          sortOrder: item.sortOrder,
          requiresProof: item.requiresProof,
          includeNonWorkingDays: item.includeNonWorkingDays,
          countsBalance: item.countsBalance,
          referenceDays: item.referenceDays ?? null,
          policyNote: item.policyNote ?? null,
          paidQuotaDays: item.paidQuotaDays ?? null,
          exceedDeductionPercent: item.exceedDeductionPercent ?? null,
          systemReserved: item.systemReserved,
        },
      )
    }
  }

  // attendance_requests 快照列（条件 ALTER，跟随 ensureSchema 既有模式）
  const columns = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_requests'
       AND COLUMN_NAME IN ('leave_type_label', 'leave_reference_days', 'leave_policy_note')`,
  )
  const existing = new Set(columns.map((row) => row.COLUMN_NAME))
  if (!existing.has('leave_type_label')) {
    await query(`ALTER TABLE attendance_requests ADD COLUMN leave_type_label VARCHAR(64) NULL AFTER leave_type`)
  }
  if (!existing.has('leave_reference_days')) {
    await query(`ALTER TABLE attendance_requests ADD COLUMN leave_reference_days VARCHAR(64) NULL AFTER leave_type_label`)
  }
  if (!existing.has('leave_policy_note')) {
    await query(`ALTER TABLE attendance_requests ADD COLUMN leave_policy_note VARCHAR(500) NULL AFTER leave_reference_days`)
  }
}

// 进程内缓存：表极小，30s TTL，管理写操作后主动失效
let cache = { at: 0, items: [] }
const CACHE_TTL_MS = 30 * 1000

function invalidateLeaveTypeCache() {
  cache = { at: 0, items: [] }
}

function payload(row) {
  return {
    id: Number(row.id),
    code: row.code,
    label: row.label,
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    requiresProof: Boolean(row.requires_proof),
    includeNonWorkingDays: Boolean(row.include_non_working_days),
    countsBalance: Boolean(row.counts_balance),
    referenceDays: row.reference_days || '',
    policyNote: row.policy_note || '',
    paidQuotaDays: row.paid_quota_days === null || row.paid_quota_days === undefined ? null : Number(row.paid_quota_days),
    exceedDeductionPercent: row.exceed_deduction_percent === null || row.exceed_deduction_percent === undefined ? null : Number(row.exceed_deduction_percent),
    systemReserved: Boolean(row.system_reserved),
  }
}

async function listLeaveTypeRows() {
  if (Date.now() - cache.at < CACHE_TTL_MS && cache.items.length) return cache.items
  const items = await query('SELECT * FROM attendance_leave_types ORDER BY sort_order ASC, id ASC')
  cache = { at: Date.now(), items }
  return items
}

async function leaveTypeMap() {
  const rows = await listLeaveTypeRows()
  return new Map(rows.map((row) => [row.code, row]))
}

// 展示取值链：单据快照 label → 表现行 label → code 原文（spec 004 data-model）
function leaveTypeLabelOf(code, map, snapshotLabel) {
  if (snapshotLabel) return snapshotLabel
  const row = code ? map.get(code) : null
  return row?.label || code || '请假'
}

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/

function normalizeInput(body, { forCreate = false } = {}) {
  const label = String(body?.label || '').trim()
  if (!label) throw badRequest('假别名称不能为空')
  if (label.length > 64) throw badRequest('假别名称最长 64 字')
  const out = {
    label,
    enabled: body?.enabled === false || body?.enabled === 0 ? 0 : 1,
    sortOrder: Number.isFinite(Number(body?.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0,
    requiresProof: body?.requiresProof ? 1 : 0,
    includeNonWorkingDays: body?.includeNonWorkingDays ? 1 : 0,
    referenceDays: String(body?.referenceDays || '').trim().slice(0, 64) || null,
    policyNote: String(body?.policyNote || '').trim().slice(0, 500) || null,
    paidQuotaDays: body?.paidQuotaDays === null || body?.paidQuotaDays === undefined || body?.paidQuotaDays === ''
      ? null
      : Number(body.paidQuotaDays),
    exceedDeductionPercent: body?.exceedDeductionPercent === null || body?.exceedDeductionPercent === undefined || body?.exceedDeductionPercent === ''
      ? null
      : Math.trunc(Number(body.exceedDeductionPercent)),
  }
  if (out.paidQuotaDays !== null && (!Number.isFinite(out.paidQuotaDays) || out.paidQuotaDays <= 0 || out.paidQuotaDays > 365)) {
    throw badRequest('年度带薪额度需为 0~365 之间的数字')
  }
  if (out.exceedDeductionPercent !== null && (!Number.isFinite(out.exceedDeductionPercent) || out.exceedDeductionPercent < 0 || out.exceedDeductionPercent > 100)) {
    throw badRequest('超额减薪比例需为 0~100 的整数')
  }
  if (forCreate) {
    const code = String(body?.code || '').trim().toLowerCase()
    if (!CODE_PATTERN.test(code)) throw badRequest('假别代码需为小写字母开头的字母/数字/下划线（最长 32 位）')
    out.code = code
  }
  return out
}

async function createLeaveType(body) {
  const input = normalizeInput(body, { forCreate: true })
  const dup = await query('SELECT id FROM attendance_leave_types WHERE code = :code LIMIT 1', { code: input.code })
  if (dup.length) throw badRequest('假别代码已存在')
  const result = await query(
    `INSERT INTO attendance_leave_types
       (code, label, enabled, sort_order, requires_proof, include_non_working_days, reference_days, policy_note, paid_quota_days, exceed_deduction_percent, system_reserved)
     VALUES
       (:code, :label, :enabled, :sortOrder, :requiresProof, :includeNonWorkingDays, :referenceDays, :policyNote, :paidQuotaDays, :exceedDeductionPercent, 0)`,
    input,
  )
  invalidateLeaveTypeCache()
  return Number(result.insertId)
}

async function updateLeaveType(id, body) {
  const rows = await query('SELECT * FROM attendance_leave_types WHERE id = :id LIMIT 1', { id })
  if (!rows[0]) throw notFound('假别不存在')
  const existing = rows[0]
  const input = normalizeInput(body)
  if (existing.system_reserved && !input.enabled) throw badRequest('系统保留假别不可停用')
  await query(
    `UPDATE attendance_leave_types
     SET label = :label,
         enabled = :enabled,
         sort_order = :sortOrder,
         requires_proof = :requiresProof,
         include_non_working_days = :includeNonWorkingDays,
         reference_days = :referenceDays,
         policy_note = :policyNote,
         paid_quota_days = :paidQuotaDays,
         exceed_deduction_percent = :exceedDeductionPercent
     WHERE id = :id`,
    { ...input, id },
  )
  invalidateLeaveTypeCache()
}

async function deleteLeaveType(id) {
  const rows = await query('SELECT * FROM attendance_leave_types WHERE id = :id LIMIT 1', { id })
  if (!rows[0]) throw notFound('假别不存在')
  if (rows[0].system_reserved) throw badRequest('系统保留假别不可删除')
  const refs = await query(
    'SELECT COUNT(*) AS n FROM attendance_requests WHERE leave_type = :code',
    { code: rows[0].code },
  )
  const refCount = Number(refs[0]?.n || 0)
  if (refCount > 0) throw badRequest(`已被 ${refCount} 条单据引用，请改用停用`)
  await query('DELETE FROM attendance_leave_types WHERE id = :id', { id })
  invalidateLeaveTypeCache()
}

async function referencedCounts() {
  const rows = await query(
    `SELECT leave_type AS code, COUNT(*) AS n FROM attendance_requests
     WHERE request_type = 'leave' AND leave_type IS NOT NULL GROUP BY leave_type`,
  )
  return new Map(rows.map((row) => [row.code, Number(row.n || 0)]))
}

// 病假等年度带薪额度：按自然年统计已批准天数（8h=1天）
async function leaveQuotaUsageYtd(employeeIds, year, map) {
  const quotaTypes = [...map.values()].filter((row) => row.paid_quota_days !== null && row.paid_quota_days !== undefined)
  if (!quotaTypes.length || !employeeIds.length) return new Map()
  const codes = quotaTypes.map((row) => row.code)
  const placeholders = {}
  const codeList = codes.map((code, index) => {
    placeholders[`code${index}`] = code
    return `:code${index}`
  })
  const idList = employeeIds.map((id, index) => {
    placeholders[`emp${index}`] = Number(id)
    return `:emp${index}`
  })
  const rows = await query(
    `SELECT employee_id, leave_type, COALESCE(SUM(hours), 0) AS used_hours
     FROM attendance_requests
     WHERE request_type = 'leave' AND status = 'approved'
       AND leave_type IN (${codeList.join(', ')})
       AND employee_id IN (${idList.join(', ')})
       AND YEAR(start_at) = :year
     GROUP BY employee_id, leave_type`,
    { ...placeholders, year },
  )
  // key: `${employeeId}:${code}` → { quotaDays, usedDays, exceedDays, deductionPercent }
  const result = new Map()
  for (const row of rows) {
    const type = map.get(row.leave_type)
    if (!type) continue
    const quotaDays = Number(type.paid_quota_days)
    const usedDays = Math.round((Number(row.used_hours || 0) / 8) * 100) / 100
    result.set(`${row.employee_id}:${row.leave_type}`, {
      quotaDays,
      usedDays,
      exceedDays: Math.max(0, Math.round((usedDays - quotaDays) * 100) / 100),
      deductionPercent: type.exceed_deduction_percent === null || type.exceed_deduction_percent === undefined ? null : Number(type.exceed_deduction_percent),
    })
  }
  // 没产生已批准单据的员工也要能拿到额度配置（申请页实时提示用）
  for (const type of quotaTypes) {
    for (const employeeId of employeeIds) {
      const key = `${employeeId}:${type.code}`
      if (!result.has(key)) {
        result.set(key, {
          quotaDays: Number(type.paid_quota_days),
          usedDays: 0,
          exceedDays: 0,
          deductionPercent: type.exceed_deduction_percent === null || type.exceed_deduction_percent === undefined ? null : Number(type.exceed_deduction_percent),
        })
      }
    }
  }
  return result
}

module.exports = {
  ensureLeaveTypeSchema,
  listLeaveTypeRows,
  leaveTypeMap,
  leaveTypeLabelOf,
  leaveQuotaUsageYtd,
  invalidateLeaveTypeCache,
  payload,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  referencedCounts,
}
