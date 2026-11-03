/**
 * 中国法定节假日多源同步模块
 *
 * 背景：AI 凭空推算节假日不可靠（曾生成错误日期污染数据库），官方唯一权威来源是
 * 国务院每年 11~12 月发布的文字公告（无机器可读接口）。本模块从四个独立维护的
 * 官方公告镜像源拉取结构化数据，多数决（≥3 源一致）+ 结构校验通过后才允许写入：
 *
 * - holiday-cn（NateScarlet/holiday-cn，随国务院公告更新的年度 JSON，jsdelivr CDN）
 *   2026 年数据在公告当天 17:33 更新（公告当日上午发布）
 * - lanceliao/china-holiday-calender（gov.cn 爬虫，公告当天 23:59 更新，
 *   数据附公告原文链接与 Memo），raw.githubusercontent 单文件全年份
 * - chinese-days（vsme，AI 流水线自动更新，公告当天 18:42 发版），npm dist 年度 JSON
 * - jiejiariapi（api.jiejiariapi.com，商业 API，更新较慢，仅作多数决补充票）
 *
 * 设计要点：
 * - 确认写入时重新拉取（不信任前端回传的预览数据）
 * - 四源并行拉取；空数据（holiday-cn 公告前的空占位、jiejiariapi 的 "Year not found"）
 *   视为"暂无该年数据"，不参与投票也不阻塞其他源
 * - 比对只比"日期 + 类型（放假/补班）"签名，命名以组内优先级最高源为准
 *   （holiday-cn > lanceliao > chinese-days > jiejiariapi；
 *   jiejiariapi 会把连休命名为"国庆节,中秋节"、除夕单列等，差异仅在命名层）
 * - 共识规则：≥3 源签名一致 → 通过；仅 2 源一致 → 手动预览可用（标注警告），
 *   定时任务自动同步（requireConsensus）拒绝；无多数一致 → 拒绝并列出差异
 * - jiejiariapi 会把小年等民俗节日也标注 isOffDay=false，官方调休补班日一定落在
 *   周六/周日，据此过滤；放假日（isOffDay=true）全量保留
 */

const HOLIDAY_SYNC_SOURCES = [
  {
    key: 'holiday-cn',
    label: 'holiday-cn（国务院公告镜像）',
    url: (year) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    parse: parseHolidayCn,
  },
  {
    key: 'lanceliao',
    label: 'lanceliao 节假日日历（gov.cn 爬虫镜像）',
    url: () => 'https://raw.githubusercontent.com/lanceliao/china-holiday-calender/master/holidayAPI.json',
    parse: parseLanceliao,
  },
  {
    key: 'chinese-days',
    label: 'chinese-days（AI 流水线镜像）',
    url: (year) => `https://cdn.jsdelivr.net/npm/chinese-days/dist/years/${year}.json`,
    parse: parseChineseDays,
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
const CONSENSUS_QUORUM = 3 // 自动同步要求的最低一致源数

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

// lanceliao：{ Years: { '2026': [{ Name, StartDate, EndDate, CompDays, URL, Memo }] } }
// 假期段为闭区间，逐日展开为放假日；CompDays 为调休补班日
function expandDateRange(startDate, endDate) {
  const dates = []
  const cursor = new Date(`${startDate}T00:00:00Z`)
  const last = new Date(`${endDate}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return dates
  while (cursor <= last && dates.length < 40) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function parseLanceliao(payload, year) {
  const map = new Map()
  const entries = payload?.Years?.[String(year)]
  if (!Array.isArray(entries)) return map
  for (const entry of entries) {
    const name = normalizeName(entry?.Name) || '法定节假日'
    for (const date of expandDateRange(String(entry?.StartDate || ''), String(entry?.EndDate || ''))) {
      if (date.startsWith(`${year}-`)) map.set(date, { date, name, dayType: 'legal_holiday' })
    }
    for (const compDay of Array.isArray(entry?.CompDays) ? entry.CompDays : []) {
      const date = String(compDay || '')
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) map.set(date, { date, name, dayType: 'makeup_workday' })
    }
  }
  return map
}

// chinese-days npm dist：{ holidays: { date: "English,中文,n" }, workdays: {...}, inLieuDays }
// workdays 即调休补班日；中文名取逗号分隔第二段
function parseChineseDays(payload) {
  const map = new Map()
  const readEntries = (group, dayType) => {
    for (const [date, value] of Object.entries(group || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const parts = String(value || '').split(',')
      const name = normalizeName(parts[1] || parts[0]) || (dayType === 'makeup_workday' ? '调休补班' : '法定节假日')
      map.set(date, { date, name, dayType })
    }
  }
  readEntries(payload?.holidays, 'legal_holiday')
  readEntries(payload?.workdays, 'makeup_workday')
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

// 共识比对只比"日期 + 类型"，命名差异不参与（各源命名习惯不同）
function mapSignature(map) {
  return [...map.values()]
    .map((item) => `${item.date}|${item.dayType}`)
    .sort()
    .join('\n')
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
 * 拉取并校验指定年份的法定节假日（四源并行，多数决）。
 * requireConsensus=true（定时任务自动同步）时，须 ≥3 源签名一致才视为成功；
 * 手动预览允许 2 源一致或单源降级（会在 warnings 中标注，由管理员人工核对）。
 * 成功返回 { ok, year, items, warnings, sources }；失败返回 { ok: false, reason, sources }。
 */
async function fetchYearHolidays(year, { requireConsensus = false, fetchImpl } = {}) {
  const targetYear = Number(year)
  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    return { ok: false, reason: '年份格式不正确（需四位数字）', sources: [] }
  }
  const results = await Promise.all(
    HOLIDAY_SYNC_SOURCES.map(async (source) => {
      try {
        const payload = await fetchJson(source.url(targetYear), fetchImpl)
        return { key: source.key, label: source.label, map: source.parse(payload, targetYear) }
      } catch (error) {
        return { key: source.key, label: source.label, map: null, error: error?.message || String(error) }
      }
    }),
  )
  const sources = summarizeSources(results)

  // 空数据（公告前的空占位 / "Year not found"）视为暂无该年数据，不参与投票
  const available = results.filter((result) => result.map && result.map.size > 0)
  if (!available.length) {
    const anyEmpty = results.some((result) => result.map)
    if (anyEmpty) {
      return { ok: false, reason: `各数据源均暂无 ${targetYear} 年数据（国务院可能尚未公布该年安排）`, sources }
    }
    const detail = results.map((result) => `${result.label}：${result.error}`).join('；')
    return { ok: false, reason: `数据源均不可用（${detail}）`, sources }
  }

  // 按"日期+类型"签名分组，找最大一致组
  const groupsBySignature = new Map()
  for (const result of available) {
    const signature = mapSignature(result.map)
    if (!groupsBySignature.has(signature)) groupsBySignature.set(signature, [])
    groupsBySignature.get(signature).push(result)
  }
  const groups = [...groupsBySignature.values()].sort((a, b) => b.length - a.length)
  const topGroup = groups[0]
  const topLabels = topGroup.map((result) => result.label).join('、')

  if (topGroup.length < CONSENSUS_QUORUM) {
    if (groups.length > 1) {
      // 存在分歧：列出最大组与其他组的差异
      const other = groups[1][0]
      const differences = diffSourceMaps(topGroup[0].map, other.map)
      const diffText = differences.length ? `：${differences.slice(0, 5).join('、')}${differences.length > 5 ? ' 等' : ''}` : ''
      return {
        ok: false,
        reason: `数据源不一致（${topLabels} 与 ${other.label} 存在分歧${diffText}），请人工核对`,
        sources,
      }
    }
    // 全部可用源一致，但不足 3 源
    if (requireConsensus) {
      return {
        ok: false,
        reason: `仅 ${topGroup.length} 个数据源一致（${topLabels}），未达到自动同步要求的 ${CONSENSUS_QUORUM} 源共识`,
        sources,
      }
    }
  }

  // 命名以组内优先级最高源为准（HOLIDAY_SYNC_SOURCES 数组序即优先级）
  const minority = available.filter((result) => !topGroup.includes(result))
  const primary = topGroup[0]
  const items = [...primary.map.values()].sort((a, b) => a.date.localeCompare(b.date))
  const warnings = validateYearHolidays(targetYear, items)
  if (minority.length) {
    warnings.unshift(`${minority.map((result) => result.label).join('、')}与多数源（${topLabels}）不一致，已按多数源写入，请人工核对`)
  }
  if (available.length < HOLIDAY_SYNC_SOURCES.length) {
    const failed = results
      .filter((result) => !result.map || result.map.size === 0)
      .map((result) => result.label)
      .join('、')
    warnings.unshift(`部分数据源暂无数据或不可用（${failed}），一致性仅在 ${available.length} 个可用源间达成`)
  }
  if (topGroup.length === 1) {
    warnings.unshift('仅单源数据可用，请人工核对后再写入')
  } else if (topGroup.length < CONSENSUS_QUORUM) {
    warnings.unshift(`仅 ${topGroup.length} 源数据一致，请人工核对后再写入`)
  }
  return { ok: true, year: targetYear, items, warnings, sources }
}

module.exports = { fetchYearHolidays }
