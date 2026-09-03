// 特休档位表（spec 005）：满 N 年 → 年度天数，行政可配，政策变化不改代码。
// 档位年限 = 当前年份 − 入职年份 − 1（满年对齐自然年底，佬 2026-09-02 裁决）：
// 入职 Y0 年（不论几月）→ Y0+1 年 12 月底满一年 → Y0+2 年 1 月起享受满 1 年档。
const { query, transaction } = require('../../config/db')
const { badRequest } = require('../../utils/http-error')

// seed 为法定口径初始值，行政可在界面按公司规则修改
const SEED_TIERS = Object.freeze([
  { minYears: 1, days: 5, note: '法定：累计工龄满 1 年' },
  { minYears: 10, days: 10, note: '法定：累计工龄满 10 年' },
  { minYears: 20, days: 15, note: '法定：累计工龄满 20 年' },
])

async function ensureAnnualLeaveTierSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS attendance_annual_leave_tiers (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      min_years INT NOT NULL,
      days DECIMAL(4,1) NOT NULL,
      note VARCHAR(200) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_attendance_annual_leave_tiers_years (min_years)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const count = await query('SELECT COUNT(*) AS n FROM attendance_annual_leave_tiers')
  if (!Number(count[0]?.n || 0)) {
    for (const tier of SEED_TIERS) {
      await query(
        'INSERT INTO attendance_annual_leave_tiers (min_years, days, note) VALUES (:minYears, :days, :note)',
        tier,
      )
    }
  }
}

// hireDate 可能是 'YYYY-MM-DD' 字符串或 Date；取年份不做时区换算（纯自然年口径）
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

// 建议额度：min_years ≤ 档位年限 的最大档；无匹配为 0
function suggestedDaysOf(tierYears, tiers) {
  if (tierYears === null || tierYears === undefined) return null
  let best = null
  for (const tier of tiers) {
    if (Number(tier.min_years) <= tierYears && (!best || Number(tier.min_years) > Number(best.min_years))) best = tier
  }
  return best ? Number(best.days) : 0
}

let cache = { at: 0, items: [] }
const CACHE_TTL_MS = 30 * 1000

function invalidateTierCache() {
  cache = { at: 0, items: [] }
}

async function listTierRows() {
  if (Date.now() - cache.at < CACHE_TTL_MS && cache.items.length) return cache.items
  const items = await query('SELECT * FROM attendance_annual_leave_tiers ORDER BY min_years ASC')
  cache = { at: Date.now(), items }
  return items
}

function tierPayload(row) {
  return {
    id: Number(row.id),
    minYears: Number(row.min_years),
    days: Number(row.days),
    note: row.note || '',
  }
}

function normalizeTiers(body) {
  const items = Array.isArray(body?.items) ? body.items : []
  if (!items.length) throw badRequest('档位表至少保留一行')
  const seen = new Set()
  return items.map((item) => {
    const minYears = Math.trunc(Number(item?.minYears))
    const days = Number(item?.days)
    if (!Number.isFinite(minYears) || minYears < 1 || minYears > 100) throw badRequest('满年数需为 1~100 的整数')
    if (seen.has(minYears)) throw badRequest(`满 ${minYears} 年档位重复`)
    seen.add(minYears)
    if (!Number.isFinite(days) || days <= 0 || days > 365) throw badRequest('年度天数需为 0~365 之间的数字')
    return { minYears, days, note: String(item?.note || '').trim().slice(0, 200) || null }
  })
}

// 整表替换：事务内删旧插新
async function replaceTiers(body) {
  const items = normalizeTiers(body)
  await transaction(async (connection) => {
    await connection.execute('DELETE FROM attendance_annual_leave_tiers')
    for (const item of items) {
      await connection.execute(
        'INSERT INTO attendance_annual_leave_tiers (min_years, days, note) VALUES (:minYears, :days, :note)',
        item,
      )
    }
  })
  invalidateTierCache()
  return items.length
}

// 给员工 payload 附加档位年限与建议额度（spec 005；建议值仅供参考，入账由行政确认）
async function decorateAnnualLeaveSuggestion(items) {
  const tiers = (await listTierRows()).map(tierPayload)
  const today = new Date()
  return items.map((item) => {
    const tierYears = tierYearsOf(item.hireDate, today)
    return {
      ...item,
      annualLeaveTierYears: tierYears,
      annualLeaveSuggestedDays: suggestedDaysOf(tierYears, tiers),
    }
  })
}

module.exports = {
  ensureAnnualLeaveTierSchema,
  listTierRows,
  tierPayload,
  tierYearsOf,
  suggestedDaysOf,
  replaceTiers,
  decorateAnnualLeaveSuggestion,
}
