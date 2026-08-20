/**
 * 中国法定节假日双源同步模块
 *
 * 背景：AI 凭空推算节假日不可靠（曾生成错误日期污染数据库），官方唯一权威来源是
 * 国务院每年 11~12 月发布的文字公告（无机器可读接口）。本模块改为从两个独立维护的
 * 官方公告镜像源拉取结构化数据，双源比对一致 + 结构校验通过后才允许写入：
 *
 * - holiday-cn（NateScarlet/holiday-cn，随国务院公告更新的年度 JSON，jsdelivr CDN）
 * - jiejiariapi（api.jiejiariapi.com，同样镜像官方公告）
 *
 * 设计要点：
 * - 确认写入时重新拉取（不信任前端回传的预览数据）
 * - jiejiariapi 会把小年等民俗节日也标注 isOffDay=false，官方调休补班日一定落在
 *   周六/周日，据此过滤；放假日（isOffDay=true）全量保留
 * - 双源比对只比"日期 + 类型（放假/补班）"，命名以 holiday-cn 为准
 *   （jiejiariapi 会把连休命名为"国庆节,中秋节"、除夕单列等，差异仅在命名层）
 * - 任一源无该年数据（国务院尚未公布）或双源不一致时拒绝写入并说明原因
 */

const HOLIDAY_SYNC_SOURCES = [
  {
    key: 'holiday-cn',
    label: 'holiday-cn（国务院公告镜像）',
    url: (year) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    parse: parseHolidayCn,
  },
  {
    key: 'jiejiariapi',
    label: 'jiejiariapi（节假日 API）',
    url: (year) => `https://api.jiejiariapi.com/v1/holidays/${year}`,
    parse: parseJiejiariapi,
  },
]

const MAJOR_HOLIDAY_KEYWORDS = ['元旦', '春节', '清明', '劳动节', '端午', '中秋', '国庆']
const FETCH_TIMEOUT_MS = 10000
const MIN_OFF_DAYS = 11 // 法定假日 13 天 + 周末连休，全年放假日常态 28~33 天，留足下限
const MAX_OFF_DAYS = 40
const MAX_MAKEUP_DAYS = 12

async function fetchJson(url, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'oms-platform-holiday-sync' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function isWeekendDate(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

// jiejiariapi 连休命名为“国庆节,中秋节”，统一取主名便于按名称合并假期段
function normalizeName(name) {
  return String(name || '').split(/[,，]/)[0].trim()
}

function parseHolidayCn(payload) {
  const days = Array.isArray(payload?.days) ? payload.days : []
  const map = new Map()
  for (const day of days) {
    const date = String(day?.date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    map.set(date, {
      date,
      name: normalizeName(day?.name) || '法定节假日',
      dayType: day?.isOffDay === false ? 'makeup_workday' : 'legal_holiday',
    })
  }
  return map
}

function parseJiejiariapi(payload) {
  const map = new Map()
  for (const value of Object.values(payload || {})) {
    const date = String(value?.date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (value?.isOffDay === true) {
      map.set(date, { date, name: normalizeName(value?.name) || '法定节假日', dayType: 'legal_holiday' })
    } else if (isWeekendDate(date)) {
      // 工作日的 isOffDay=false 多为小年等民俗标注，不是调休补班；补班日一定在周末
      map.set(date, { date, name: normalizeName(value?.name) || '调休补班', dayType: 'makeup_workday' })
    }
  }
  return map
}

function diffSourceMaps(primary, secondary) {
  const differences = []
  for (const [date, item] of primary) {
    const other = secondary.get(date)
    if (!other) differences.push(`${date}（仅一方收录）`)
    else if (other.dayType !== item.dayType) differences.push(`${date}（放假/补班类型不一致）`)
  }
  for (const date of secondary.keys()) {
    if (!primary.has(date)) differences.push(`${date}（仅一方收录）`)
  }
  return differences
}

function validateYearHolidays(year, items) {
  const warnings = []
  const offDays = items.filter((item) => item.dayType !== 'makeup_workday')
  const makeupDays = items.filter((item) => item.dayType === 'makeup_workday')
  if (offDays.length < MIN_OFF_DAYS || offDays.length > MAX_OFF_DAYS) {
    warnings.push(`放假日共 ${offDays.length} 天，超出合理区间（${MIN_OFF_DAYS}~${MAX_OFF_DAYS} 天）`)
  }
  if (makeupDays.length > MAX_MAKEUP_DAYS) {
    warnings.push(`调休补班日共 ${makeupDays.length} 天，超出合理上限（${MAX_MAKEUP_DAYS} 天）`)
  }
  const weekdayMakeup = makeupDays.filter((item) => !isWeekendDate(item.date))
  if (weekdayMakeup.length) {
    warnings.push(`补班日落在了工作日：${weekdayMakeup.map((item) => item.date).join('、')}`)
  }
  const offNames = offDays.map((item) => item.name).join('、')
  for (const keyword of MAJOR_HOLIDAY_KEYWORDS) {
    if (!offNames.includes(keyword)) warnings.push(`缺少「${keyword}」相关放假日`)
  }
  const outOfYear = items.filter((item) => !item.date.startsWith(`${year}-`))
  if (outOfYear.length) {
    warnings.push(`存在不属于 ${year} 年的日期：${outOfYear.map((item) => item.date).join('、')}`)
  }
  return warnings
}

function summarizeSources(results) {
  return results.map((result) => ({
    key: result.key,
    label: result.label,
    count: result.map ? result.map.size : 0,
    error: result.error || null,
  }))
}

/**
 * 拉取并校验指定年份的法定节假日。
 * requireDualSource=true（定时任务自动同步）时，任一源不可用即视为失败；
 * 手动预览默认允许单源降级（会在 warnings 中标注，由管理员人工核对）。
 * 成功返回 { ok, year, items, warnings, sources }；失败返回 { ok: false, reason, sources }。
 */
async function fetchYearHolidays(year, { requireDualSource = false, fetchImpl } = {}) {
  const targetYear = Number(year)
  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    return { ok: false, reason: '年份格式不正确（需四位数字）', sources: [] }
  }
  const results = []
  for (const source of HOLIDAY_SYNC_SOURCES) {
    try {
      const payload = await fetchJson(source.url(targetYear), fetchImpl)
      results.push({ key: source.key, label: source.label, map: source.parse(payload) })
    } catch (error) {
      results.push({ key: source.key, label: source.label, map: null, error: error?.message || String(error) })
    }
  }
  const sources = summarizeSources(results)
  const available = results.filter((result) => result.map)
  if (!available.length) {
    const detail = results.map((result) => `${result.label}：${result.error}`).join('；')
    return { ok: false, reason: `两个数据源均不可用（${detail}）`, sources }
  }
  const emptySource = available.find((result) => result.map.size === 0)
  if (emptySource) {
    return { ok: false, reason: `${emptySource.label}暂无 ${targetYear} 年数据（国务院可能尚未公布该年安排）`, sources }
  }
  if (available.length < HOLIDAY_SYNC_SOURCES.length) {
    const failed = results.filter((result) => !result.map).map((result) => `${result.label}（${result.error}）`).join('、')
    if (requireDualSource) {
      return { ok: false, reason: `部分数据源不可用：${failed}`, sources }
    }
  }
  if (available.length === HOLIDAY_SYNC_SOURCES.length) {
    const differences = diffSourceMaps(available[0].map, available[1].map)
    if (differences.length) {
      return { ok: false, reason: `两个数据源不一致：${differences.slice(0, 5).join('、')}${differences.length > 5 ? ' 等' : ''}`, sources }
    }
  }
  // 命名以 holiday-cn 为准（更贴近国务院公告原文的分节命名）
  const primary = available.find((result) => result.key === 'holiday-cn') || available[0]
  const items = [...primary.map.values()].sort((a, b) => a.date.localeCompare(b.date))
  const warnings = validateYearHolidays(targetYear, items)
  if (available.length < HOLIDAY_SYNC_SOURCES.length) {
    warnings.unshift('仅单源数据可用，请人工核对后再写入')
  }
  return { ok: true, year: targetYear, items, warnings, sources }
}

module.exports = { fetchYearHolidays }
