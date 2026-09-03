// 特休档位表（spec 005 v2）：方案（陆籍/台籍·常规/台籍·特批）× 满 N 年 → 年度天数，
// 支持「每年加 X 天、封顶 Y 天」递增尾档；行政可配，规则变化不改代码。
// 档位年限 = 当前年份 − 入职年份 − 1（满年对齐自然年底，佬 2026-09-02 裁决）。
const { query, transaction } = require('../../config/db')
const { badRequest } = require('../../utils/http-error')

// 方案清单（佬 2026-09-02 提供规则图）；员工方案存 attendance_employee_profiles.annual_leave_rule
const SCHEMES = Object.freeze([
  { code: 'mainland', label: '陆籍', note: '所有陆籍员工' },
  { code: 'taiwan', label: '台籍·常规', note: '除特批外的台籍员工' },
  { code: 'taiwan_special', label: '台籍·特批', note: '个别台籍员工，由行政在员工档案手工指定' },
])
const SCHEME_CODES = new Set(SCHEMES.map((scheme) => scheme.code))

function schemeOf(value) {
  const code = String(value || '').trim()
  return SCHEME_CODES.has(code) ? code : 'mainland'
}

// seed：佬 2026-09-02 提供的现行规则
const SEED_TIERS = Object.freeze([
  { schemeCode: 'mainland', minYears: 1, days: 5 },
  { schemeCode: 'mainland', minYears: 3, days: 7 },
  { schemeCode: 'mainland', minYears: 5, days: 10 },
  { schemeCode: 'mainland', minYears: 10, days: 15 },
  { schemeCode: 'mainland', minYears: 20, days: 15, plusPerYear: 1, maxDays: 30 },
  { schemeCode: 'taiwan', minYears: 1, days: 15 },
  { schemeCode: 'taiwan', minYears: 20, days: 15, plusPerYear: 1, maxDays: 30 },
  { schemeCode: 'taiwan_special', minYears: 0, days: 15 },
  { schemeCode: 'taiwan_special', minYears: 3, days: 18 },
  { schemeCode: 'taiwan_special', minYears: 5, days: 22 },
  { schemeCode: 'taiwan_special', minYears: 10, days: 22, plusPerYear: 1, maxDays: 30 },
])

async function seedTiers() {
  for (const tier of SEED_TIERS) {
    await query(
      `INSERT INTO attendance_annual_leave_tiers (scheme_code, min_years, days, plus_per_year, max_days, note)
       VALUES (:schemeCode, :minYears, :days, :plusPerYear, :maxDays, :note)`,
      {
        schemeCode: tier.schemeCode,
        minYears: tier.minYears,
        days: tier.days,
        plusPerYear: tier.plusPerYear ?? null,
        maxDays: tier.maxDays ?? null,
        note: tier.note ?? null,
      },
    )
  }
}

async function ensureAnnualLeaveTierSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS attendance_annual_leave_tiers (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      scheme_code VARCHAR(32) NOT NULL DEFAULT 'mainland',
      min_years INT NOT NULL,
      days DECIMAL(4,1) NOT NULL,
      plus_per_year DECIMAL(3,1) NULL,
      max_days DECIMAL(4,1) NULL,
      note VARCHAR(200) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_attendance_annual_leave_tiers_scheme_years (scheme_code, min_years)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  // 既有表升级（v1 单表法定 seed → v2 方案化）：条件加列 + 换唯一键
  const columns = await query(
    `SELECT COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_annual_leave_tiers'`,
  )
  const existing = new Set(columns.map((row) => row.columnName || row.COLUMN_NAME))
  if (!existing.has('scheme_code')) {
    await query(`ALTER TABLE attendance_annual_leave_tiers ADD COLUMN scheme_code VARCHAR(32) NOT NULL DEFAULT 'mainland' AFTER id`)
  }
  if (!existing.has('plus_per_year')) {
    await query(`ALTER TABLE attendance_annual_leave_tiers ADD COLUMN plus_per_year DECIMAL(3,1) NULL AFTER days`)
  }
  if (!existing.has('max_days')) {
    await query(`ALTER TABLE attendance_annual_leave_tiers ADD COLUMN max_days DECIMAL(4,1) NULL AFTER plus_per_year`)
  }

  const indexes = await query(
    `SELECT INDEX_NAME AS indexName FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_annual_leave_tiers'`,
  )
  const indexNames = new Set(indexes.map((row) => row.indexName || row.INDEX_NAME))
  if (indexNames.has('uk_attendance_annual_leave_tiers_years') && !indexNames.has('uk_attendance_annual_leave_tiers_scheme_years')) {
    await query('ALTER TABLE attendance_annual_leave_tiers DROP INDEX uk_attendance_annual_leave_tiers_years, ADD UNIQUE KEY uk_attendance_annual_leave_tiers_scheme_years (scheme_code, min_years)')
  }

  // v1 旧 seed（3 行法定口径、无递增档）整表换成 v2 seed；行政已自定义过的表不动
  const rows = await query('SELECT COUNT(*) AS n, SUM(plus_per_year IS NOT NULL) AS progressive FROM attendance_annual_leave_tiers')
  const total = Number(rows[0]?.n || 0)
  if (total === 0 || (total === 3 && !Number(rows[0]?.progressive || 0))) {
    await query('DELETE FROM attendance_annual_leave_tiers')
    await seedTiers()
  }
}

function hireYearOf(hireDate) {
  if (!hireDate) return null
  const match = String(hireDate).match(/(\d{4})/)
  return match ? Number(match[1]) : null
}

// 档位年限：满年对齐自然年底（当前年 − 入职年 − 1，负值按 0）
function tierYearsOf(hireDate, today = new Date()) {
  const hireYear = hireYearOf(hireDate)
  if (!hireYear) return null
  return Math.max(0, today.getFullYear() - hireYear - 1)
}

// 建议额度：方案内 min_years ≤ 档位年限 的最大档；days + plus×(年限−起点)，封顶 max_days
function suggestedDaysOf(tierYears, tiers, schemeCode = 'mainland') {
  if (tierYears === null || tierYears === undefined) return null
  const scheme = schemeOf(schemeCode)
  let best = null
  for (const tier of tiers) {
    if (schemeOf(tier.scheme_code) !== scheme) continue
    if (Number(tier.min_years) <= tierYears && (!best || Number(tier.min_years) > Number(best.min_years))) best = tier
  }
  if (!best) return 0
  const plus = best.plus_per_year === null || best.plus_per_year === undefined ? 0 : Number(best.plus_per_year)
  let days = Number(best.days) + plus * (tierYears - Number(best.min_years))
  if (best.max_days !== null && best.max_days !== undefined) days = Math.min(days, Number(best.max_days))
  return Math.round(days * 100) / 100
}

let cache = { at: 0, items: [] }
const CACHE_TTL_MS = 30 * 1000

function invalidateTierCache() {
  cache = { at: 0, items: [] }
}

async function listTierRows() {
  if (Date.now() - cache.at < CACHE_TTL_MS && cache.items.length) return cache.items
  const items = await query('SELECT * FROM attendance_annual_leave_tiers ORDER BY scheme_code ASC, min_years ASC')
  cache = { at: Date.now(), items }
  return items
}

function tierPayload(row) {
  return {
    id: Number(row.id),
    schemeCode: row.scheme_code || 'mainland',
    minYears: Number(row.min_years),
    days: Number(row.days),
    plusPerYear: row.plus_per_year === null || row.plus_per_year === undefined ? null : Number(row.plus_per_year),
    maxDays: row.max_days === null || row.max_days === undefined ? null : Number(row.max_days),
    note: row.note || '',
  }
}

function normalizeTiers(body) {
  const items = Array.isArray(body?.items) ? body.items : []
  if (!items.length) throw badRequest('档位表至少保留一行')
  const seen = new Set()
  return items.map((item) => {
    const schemeCode = String(item?.schemeCode || '').trim()
    if (!SCHEME_CODES.has(schemeCode)) throw badRequest('方案代码不正确')
    const minYears = Math.trunc(Number(item?.minYears))
    const days = Number(item?.days)
    const plusPerYear = item?.plusPerYear === null || item?.plusPerYear === undefined || item?.plusPerYear === '' ? null : Number(item.plusPerYear)
    const maxDays = item?.maxDays === null || item?.maxDays === undefined || item?.maxDays === '' ? null : Number(item.maxDays)
    if (!Number.isFinite(minYears) || minYears < 0 || minYears > 100) throw badRequest('满年数需为 0~100 的整数')
    const seenKey = `${schemeCode}:${minYears}`
    if (seen.has(seenKey)) throw badRequest(`${schemeCode} 方案满 ${minYears} 年档位重复`)
    seen.add(seenKey)
    if (!Number.isFinite(days) || days <= 0 || days > 365) throw badRequest('年度天数需为 0~365 之间的数字')
    if (plusPerYear !== null && (!Number.isFinite(plusPerYear) || plusPerYear < 0 || plusPerYear > 30)) throw badRequest('每年加天数需为 0~30 之间的数字')
    if (maxDays !== null && (!Number.isFinite(maxDays) || maxDays <= 0 || maxDays > 365)) throw badRequest('封顶天数需为 0~365 之间的数字')
    return { schemeCode, minYears, days, plusPerYear, maxDays, note: String(item?.note || '').trim().slice(0, 200) || null }
  })
}

// 整表替换：事务内删旧插新
async function replaceTiers(body) {
  const items = normalizeTiers(body)
  await transaction(async (connection) => {
    await connection.execute('DELETE FROM attendance_annual_leave_tiers')
    for (const item of items) {
      await connection.execute(
        `INSERT INTO attendance_annual_leave_tiers (scheme_code, min_years, days, plus_per_year, max_days, note)
         VALUES (:schemeCode, :minYears, :days, :plusPerYear, :maxDays, :note)`,
        item,
      )
    }
  })
  invalidateTierCache()
  return items.length
}

// 给员工 payload 附加档位年限与建议额度（spec 005；建议值仅供参考，入账由行政确认）
async function decorateAnnualLeaveSuggestion(items) {
  const tiers = await listTierRows()
  const today = new Date()
  return items.map((item) => {
    const tierYears = tierYearsOf(item.hireDate, today)
    const schemeCode = schemeOf(item.annualLeaveRule)
    return {
      ...item,
      annualLeaveScheme: schemeCode,
      annualLeaveTierYears: tierYears,
      annualLeaveSuggestedDays: suggestedDaysOf(tierYears, tiers, schemeCode),
    }
  })
}

module.exports = {
  SCHEMES,
  ensureAnnualLeaveTierSchema,
  listTierRows,
  tierPayload,
  tierYearsOf,
  suggestedDaysOf,
  replaceTiers,
  decorateAnnualLeaveSuggestion,
}
