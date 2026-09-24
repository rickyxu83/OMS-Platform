/**
 * 智能报表执行引擎（spec 014）：校验报表定义（白名单）→ 拼接参数化 SQL → 执行。
 * 纯函数部分（validateSpec / resolveTimeRange / buildQuery / describeSpec）不依赖数据库，可单测。
 */
const { query } = require('../../config/db')
const { unprocessableEntity } = require('../../utils/http-error')
const { buildLikeSearch } = require('../../utils/chinese')
const { DATASETS } = require('./datasets')

const MAX_GROUP_BY = 3
const MAX_METRICS = 4
const CHART_TYPES = new Set(['table', 'bar', 'line', 'pie'])

const COMPARE_TYPES = new Set(['previous', 'year_ago'])

/** 时间分组维度：含这些维度时 compare 无意义（两期分组键永远对不上），validateSpec 会丢弃 compare */
const TIME_GROUP_DIMS = new Set(['month', 'week', 'day'])
const COMPARE_TYPE_LABELS = { previous: '环比', year_ago: '同比' }

const RELATIVE_RANGES = new Set([
  'this_week', 'last_week', 'this_month', 'last_month',
  'this_quarter', 'last_quarter', 'this_year', 'last_year',
  'last_7d', 'last_30d', 'last_90d', 'all',
])

const RELATIVE_RANGE_LABELS = {
  this_week: '本周', last_week: '上周', this_month: '本月', last_month: '上月',
  this_quarter: '本季度', last_quarter: '上季度', this_year: '今年', last_year: '去年',
  last_7d: '近7天', last_30d: '近30天', last_90d: '近90天', all: '全部时间',
}

/** 上海时区的"今天"（服务器按 UTC 部署，与 scheduler.js 同款 +8h 换算） */
function shanghaiToday(now = Date.now()) {
  return new Date(now + 8 * 3600e3).toISOString().slice(0, 10)
}

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

/**
 * 相对时间范围 → 起止日期（含首尾，基于上海时区）。
 * 返回 { from, to, label }；'all' 返回 { from: null, to: null, label: '全部时间' }。
 */
function resolveRelativeRange(value, now = Date.now()) {
  const today = shanghaiToday(now)
  const base = new Date(`${today}T00:00:00Z`)
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() // 0-based

  switch (value) {
    case 'this_week': {
      const dow = (base.getUTCDay() + 6) % 7 // 周一=0
      const from = new Date(base.getTime() - dow * 86400e3)
      const to = new Date(from.getTime() + 6 * 86400e3)
      return { from: dayKey(from), to: dayKey(to) }
    }
    case 'last_week': {
      const dow = (base.getUTCDay() + 6) % 7
      const to = new Date(base.getTime() - (dow + 1) * 86400e3)
      const from = new Date(to.getTime() - 6 * 86400e3)
      return { from: dayKey(from), to: dayKey(to) }
    }
    case 'this_month':
      return { from: dayKey(new Date(Date.UTC(y, m, 1))), to: dayKey(new Date(Date.UTC(y, m + 1, 0))) }
    case 'last_month':
      return { from: dayKey(new Date(Date.UTC(y, m - 1, 1))), to: dayKey(new Date(Date.UTC(y, m, 0))) }
    case 'this_quarter': {
      const qm = Math.floor(m / 3) * 3
      return { from: dayKey(new Date(Date.UTC(y, qm, 1))), to: dayKey(new Date(Date.UTC(y, qm + 3, 0))) }
    }
    case 'last_quarter': {
      const qm = Math.floor(m / 3) * 3
      return { from: dayKey(new Date(Date.UTC(y, qm - 3, 1))), to: dayKey(new Date(Date.UTC(y, qm, 0))) }
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'last_7d':
      return { from: dayKey(new Date(base.getTime() - 6 * 86400e3)), to: today }
    case 'last_30d':
      return { from: dayKey(new Date(base.getTime() - 29 * 86400e3)), to: today }
    case 'last_90d':
      return { from: dayKey(new Date(base.getTime() - 89 * 86400e3)), to: today }
    case 'all':
      return { from: null, to: null }
    default:
      return null
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 校验并归一化报表定义。返回 { errors: string[], spec: 归一化后的 spec | null }。
 * 任何不在白名单内的取值都会进入 errors；spec 仅在 errors 为空时非空。
 */
function validateSpec(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') return { errors: ['报表定义缺失'], spec: null }

  const dataset = DATASETS[raw.dataset]
  if (!dataset) {
    return { errors: [`未知数据集：${String(raw.dataset || '').slice(0, 40)}（可选：${Object.keys(DATASETS).join('/')}）`], spec: null }
  }

  // 时间字段（数据集可不声明 timeFields：统计区间仅作用于指标折算，不筛选记录）
  const hasTimeFields = dataset.timeFields && Object.keys(dataset.timeFields).length > 0
  let timeField = hasTimeFields ? dataset.defaultTimeField : null
  if (hasTimeFields && raw.timeField !== undefined && raw.timeField !== null && raw.timeField !== '') {
    if (!dataset.timeFields[raw.timeField]) {
      errors.push(`数据集「${dataset.label}」不支持时间字段 ${String(raw.timeField).slice(0, 40)}（可选：${Object.keys(dataset.timeFields).join('/')}）`)
    } else {
      timeField = raw.timeField
    }
  }

  // 时间范围
  const rangeRaw = raw.timeRange && typeof raw.timeRange === 'object' ? raw.timeRange : {}
  let timeRange
  if (rangeRaw.type === 'absolute') {
    const from = String(rangeRaw.from || '').slice(0, 10)
    const to = String(rangeRaw.to || '').slice(0, 10)
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      errors.push('绝对时间范围需要 from/to（YYYY-MM-DD）')
    } else if (from > to) {
      errors.push('时间范围起止颠倒')
    } else {
      timeRange = { type: 'absolute', from, to }
    }
  } else {
    const value = String(rangeRaw.value || 'this_month')
    if (!RELATIVE_RANGES.has(value)) {
      errors.push(`未知相对时间范围：${value.slice(0, 30)}（可选：${[...RELATIVE_RANGES].join('/')}）`)
    } else {
      timeRange = { type: 'relative', value }
    }
  }

  // 分组维度
  const groupBy = Array.isArray(raw.groupBy) ? raw.groupBy.slice(0, MAX_GROUP_BY + 1) : []
  const dims = []
  for (const key of groupBy) {
    if (!dataset.dimensions[key]) {
      errors.push(`数据集「${dataset.label}」不支持分组维度 ${String(key).slice(0, 40)}（可选：${Object.keys(dataset.dimensions).join('/')}）`)
    } else if (!dims.includes(key)) {
      dims.push(key)
    }
  }
  if (groupBy.length > MAX_GROUP_BY) errors.push(`分组维度最多 ${MAX_GROUP_BY} 个`)

  // 指标
  const metricsRaw = Array.isArray(raw.metrics) ? raw.metrics : []
  const metrics = []
  for (const key of metricsRaw) {
    if (!dataset.metrics[key]) {
      errors.push(`数据集「${dataset.label}」不支持指标 ${String(key).slice(0, 40)}（可选：${Object.keys(dataset.metrics).join('/')}）`)
    } else if (!metrics.includes(key)) {
      metrics.push(key)
    }
  }
  if (!metrics.length) metrics.push(Object.keys(dataset.metrics)[0])
  if (metrics.length > MAX_METRICS) errors.push(`统计指标最多 ${MAX_METRICS} 个`)

  // 筛选
  const filters = {}
  const filtersRaw = raw.filters && typeof raw.filters === 'object' ? raw.filters : {}
  for (const [key, value] of Object.entries(filtersRaw)) {
    const def = dataset.filters[key]
    if (!def) {
      errors.push(`数据集「${dataset.label}」不支持筛选 ${String(key).slice(0, 40)}（可选：${Object.keys(dataset.filters).join('/')}）`)
      continue
    }
    if (def.type === 'enum') {
      const values = (Array.isArray(value) ? value : [value]).map((v) => String(v)).filter((v) => v in def.options)
      if (values.length) filters[key] = values
    } else {
      const text = String(Array.isArray(value) ? value[0] : value || '').trim().slice(0, 60)
      if (text) filters[key] = text
    }
  }

  // 图表类型
  const chartType = CHART_TYPES.has(raw.chartType) ? raw.chartType : null

  // 同比/环比对比（可选）
  let compare = null
  if (raw.compare !== undefined && raw.compare !== null) {
    const type = String((raw.compare && raw.compare.type) || '')
    if (!COMPARE_TYPES.has(type)) {
      errors.push(`未知对比类型：${type.slice(0, 30)}（可选：previous/year_ago）`)
    } else if (timeRange && timeRange.type === 'relative' && timeRange.value === 'all') {
      errors.push('全部时间不支持对比')
    } else {
      compare = { type }
    }
  }

  // 硬保护：分组含时间维度（month/week/day）时丢弃 compare——两期的时间分组键永远对不上，
  // compareOnly 只会多出一堆当期为空的幽灵行（2026-09-22 生产实测：8~9 月按月分组+对比上期，多出 6/7 月空行）
  if (compare && dims.some((k) => TIME_GROUP_DIMS.has(k))) {
    compare = null
  }

  // TopN 限制（可选）：用户说「前 N 名 / top N」。封顶 100，超过按 100 处理
  let topN = null
  if (raw.limit !== undefined && raw.limit !== null) {
    const n = Math.floor(Number(raw.limit))
    if (!Number.isFinite(n) || n < 1) {
      errors.push('limit 必须是正整数')
    } else {
      topN = Math.min(n, 100)
    }
  }

  // 排序指标（可选）：用户说「按某指标最大/最高排序」。必须出自已选 metrics；默认按第一个指标降序
  let sortBy = null
  if (raw.sortBy !== undefined && raw.sortBy !== null) {
    const key = String(raw.sortBy)
    if (!metrics.includes(key)) {
      errors.push(`排序指标 ${key.slice(0, 40)} 不在已选指标中（可选：${metrics.join('/')}）`)
    } else {
      sortBy = key
    }
  }

  // 明细模式（可选）：detail 为明细列 key 数组；sheetBy 为拆 sheet 的列（导出用，如月报按填表人）
  let detail = null
  let sheetBy = null
  if (raw.detail !== undefined && raw.detail !== null) {
    if (!dataset.detailColumns) {
      errors.push(`数据集「${dataset.label}」不支持明细查询`)
    } else {
      const cols = Array.isArray(raw.detail) ? raw.detail : []
      const keys = []
      for (const k of cols.slice(0, 20)) {
        const key = String(k)
        if (!dataset.detailColumns[key]) {
          errors.push(`数据集「${dataset.label}」不支持明细列 ${key.slice(0, 40)}（可选：${Object.keys(dataset.detailColumns).join('/')}）`)
        } else if (!keys.includes(key)) {
          keys.push(key)
        }
      }
      if (!keys.length && !errors.length) errors.push('明细模式至少需要一列')
      if (keys.length) detail = keys
      if (raw.sheetBy !== undefined && raw.sheetBy !== null) {
        const sb = String(raw.sheetBy)
        if (!dataset.detailColumns[sb]) {
          errors.push(`sheetBy ${sb.slice(0, 40)} 不是明细列（可选：${Object.keys(dataset.detailColumns).join('/')}）`)
        } else {
          sheetBy = sb
        }
      }
    }
  }
  // 明细模式下对比无意义，直接丢弃
  if (detail) compare = null

  if (errors.length) return { errors, spec: null }
  return { errors, spec: { dataset: dataset.key, timeField, timeRange, filters, groupBy: dims, metrics, chartType, compare, limit: topN, sortBy, detail, sheetBy } }
}

/** YYYY-MM-DD 偏移指定天数（UTC 安全） */
function shiftDay(key, days) {
  const d = new Date(`${key}T00:00:00Z`)
  return new Date(d.getTime() + days * 86400e3).toISOString().slice(0, 10)
}

/** YYYY-MM-DD 平移一年（2-29 到非闰年收敛为 2-28） */
function shiftYear(key, years) {
  const d = new Date(`${key}T00:00:00Z`)
  const y = d.getUTCFullYear() + years
  const m = d.getUTCMonth()
  const day = Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 对比周期解析：环比=当前范围的前一个等长周期；同比=平移一年。
 * range 需为已解析的 { from, to }（YYYY-MM-DD）；无边界返回 null。
 */
function resolveCompareRange(range, type) {
  if (!range || !range.from || !range.to) return null
  if (type === 'year_ago') {
    return { from: shiftYear(range.from, -1), to: shiftYear(range.to, -1) }
  }
  const lenDays = Math.round((new Date(`${range.to}T00:00:00Z`) - new Date(`${range.from}T00:00:00Z`)) / 86400e3) + 1
  const to = shiftDay(range.from, -1)
  const from = shiftDay(to, -(lenDays - 1))
  return { from, to }
}

/** 两期指标合并单元：返回 { delta, pct }；对比期为 0 时 pct 为 null（避免除零） */
function compareCell(current, base) {
  const cur = Number(current) || 0
  const cmp = Number(base) || 0
  const delta = Number((cur - cmp).toFixed(4))
  const pct = cmp === 0 ? null : Number((((cur - cmp) / cmp) * 100).toFixed(1))
  return { delta, pct }
}

/** 行分组键：维度值拼接（维度为空时全表一组） */
function groupKeyOf(row, groupBy) {
  return groupBy.map((k) => String(row[k] ?? '')).join('\u0001')
}

/** 维度 SQL（时间维度把 __TIME__ 占位替换为 timeField 列） */
function dimensionSql(dataset, timeColumn, key) {
  const def = dataset.dimensions[key]
  if (def.timeFormat) return `DATE_FORMAT(${timeColumn}, '${def.timeFormat}')`
  return def.sql
}

/**
 * 由归一化 spec 生成参数化 SQL。返回 { sql, params, columns }。
 * columns: [{ key, label, kind: 'dimension'|'metric' }]
 */
function buildQuery(spec, { limit = 500 } = {}) {
  const dataset = DATASETS[spec.dataset]
  const timeColumn = spec.timeField ? dataset.timeFields[spec.timeField].column : null
  const params = {}
  const where = dataset.baseWhere ? [dataset.baseWhere] : []

  // 时间范围条件
  let range = null
  if (spec.timeRange.type === 'relative') {
    const resolved = resolveRelativeRange(spec.timeRange.value)
    range = { ...resolved, label: RELATIVE_RANGE_LABELS[spec.timeRange.value] }
  } else {
    range = { from: spec.timeRange.from, to: spec.timeRange.to, label: `${spec.timeRange.from} ~ ${spec.timeRange.to}` }
  }
  // 时间范围条件：数据集声明了时间字段才进 WHERE；params 恒含 timeFrom/timeTo（无界为 NULL），
  // 供无时间字段数据集的折算指标 SQL 引用（如巡检完成率的周期折算）
  if (timeColumn && range.from && range.to) {
    where.push(`DATE(${timeColumn}) >= :timeFrom AND DATE(${timeColumn}) <= :timeTo`)
  }
  params.timeFrom = range.from || null
  params.timeTo = range.to || null

  // 筛选条件
  for (const [key, value] of Object.entries(spec.filters)) {
    const def = dataset.filters[key]
    if (def.type === 'enum') {
      const names = value.map((_, i) => `:f_${key}_${i}`)
      where.push(`${def.column} IN (${names.join(', ')})`)
      value.forEach((v, i) => { params[`f_${key}_${i}`] = v })
    } else {
      // 文本模糊筛选：简繁/日文新字体加法变体（生产实测：库内繁体「陳炫輔」，筛简体「陈炫辅」0 命中）
      const search = buildLikeSearch(String(Array.isArray(value) ? value[0] : value).slice(0, 60), `f_${key}_v`)
      Object.assign(params, search.params)
      where.push(`(${search.sql(def.column)})`)
    }
  }

  const columns = []
  const selectParts = []
  const groupParts = []
  for (const key of spec.groupBy) {
    const sql = dimensionSql(dataset, timeColumn, key)
    selectParts.push(`${sql} AS \`${key}\``)
    groupParts.push(sql)
    columns.push({ key, label: dataset.dimensions[key].label, kind: 'dimension' })
  }
  for (const key of spec.metrics) {
    selectParts.push(`${dataset.metrics[key].sql} AS \`${key}\``)
    columns.push({ key, label: dataset.metrics[key].label, kind: 'metric', unit: dataset.metrics[key].unit || null })
  }

  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 500)), 2000)
  const orderBy = `ORDER BY \`${spec.sortBy || spec.metrics[0]}\` DESC`
  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    dataset.baseSql,
    where.length ? `WHERE ${where.join(' AND ')}` : '',
    groupParts.length ? `GROUP BY ${groupParts.join(', ')}` : '',
    groupParts.length ? orderBy : '',
    `LIMIT ${safeLimit}`,
  ].filter(Boolean).join('\n')

  return { sql, params, columns, range }
}

/**
 * 明细查询：不分组不聚合，从数据集 detailSql（统一列子查询）选白名单列。
 * 时间范围作用于 detailTimeColumn；筛选走 detailFilters（文本 LIKE）。
 */
function buildDetailQuery(spec, { limit = 500 } = {}) {
  const dataset = DATASETS[spec.dataset]
  const params = {}
  const where = []
  let range = null
  if (spec.timeRange.type === 'relative') {
    const resolved = resolveRelativeRange(spec.timeRange.value)
    range = { ...resolved, label: RELATIVE_RANGE_LABELS[spec.timeRange.value] }
  } else {
    range = { from: spec.timeRange.from, to: spec.timeRange.to, label: `${spec.timeRange.from} ~ ${spec.timeRange.to}` }
  }
  if (range.from && range.to) {
    where.push(`DATE(${dataset.detailTimeColumn}) >= :timeFrom AND DATE(${dataset.detailTimeColumn}) <= :timeTo`)
  }
  params.timeFrom = range.from || null
  params.timeTo = range.to || null

  const columns = []
  for (const key of spec.detail) {
    const def = dataset.detailColumns[key]
    columns.push({ key, label: def.label, kind: 'dimension', unit: null })
  }
  const selectParts = spec.detail.map((key) => `${dataset.detailColumns[key].sql} AS \`${key}\``)

  for (const [key, value] of Object.entries(spec.filters)) {
    const def = dataset.detailFilters?.[key]
    if (!def) continue // 明细模式不支持的筛选静默跳过（与统计模式共享 filters 白名单）
    const search = buildLikeSearch(String(Array.isArray(value) ? value[0] : value).slice(0, 60), `f_${key}_v`)
    Object.assign(params, search.params)
    where.push(`(${search.sql(def.column)})`)
  }

  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 500)), 5000)
  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    dataset.detailSql,
    where.length ? `WHERE ${where.join(' AND ')}` : '',
    `ORDER BY ${dataset.detailOrder || dataset.detailTimeColumn}`,
    `LIMIT ${safeLimit}`,
  ].filter(Boolean).join('\n')

  return { sql, params, columns, range }
}

/** 报表定义的人类可读描述（展示与导出文件头用） */
function describeSpec(spec, range) {
  const dataset = DATASETS[spec.dataset]
  const parts = [spec.detail ? `${dataset.label}明细` : dataset.label]
  const timeLabel = range?.from && range?.to
    ? `${range.from} ~ ${range.to}（${spec.timeField ? dataset.timeFields[spec.timeField].label : '统计区间'}）`
    : '全部时间'
  parts.push(timeLabel)
  if (spec.groupBy.length) parts.push(`按 ${spec.groupBy.map((k) => dataset.dimensions[k].label).join('、')} 分组`)
  if (spec.limit) parts.push(`前 ${spec.limit} 名`)
  if (spec.sortBy && spec.sortBy !== spec.metrics[0]) parts.push(`按${dataset.metrics[spec.sortBy].label}降序`)
  if (!spec.detail) parts.push(`指标：${spec.metrics.map((k) => dataset.metrics[k].label).join('、')}`)
  const filterTexts = Object.entries(spec.filters).map(([key, value]) => {
    const def = dataset.filters[key]
    const shown = def.type === 'enum' ? value.map((v) => def.options[v] || v).join('/') : value
    return `${def.label}=${shown}`
  })
  if (filterTexts.length) parts.push(`筛选：${filterTexts.join('，')}`)
  return parts.join(' · ')
}

/** 枚举维度值 → 中文标签（未知值原样透出） */
function translateRow(dataset, columns, row) {
  const out = {}
  for (const col of columns) {
    const value = row[col.key]
    if (col.kind === 'dimension') {
      const labels = dataset.dimensions[col.key].labels
      const raw = value === null || value === undefined ? '' : String(value)
      out[col.key] = labels && raw in labels ? labels[raw] : raw || '-'
    } else {
      const num = Number(value)
      const def = dataset.metrics[col.key]
      out[col.key] = Number.isFinite(num) ? (def.round !== undefined ? Number(num.toFixed(def.round)) : num) : 0
    }
  }
  return out
}

/**
 * 校验 + 执行。返回 { spec, columns, rows, total, truncated, specText, range, compare }；校验失败抛 422 业务错。
 * spec.compare 存在时：同口径换对比时间范围再跑一遍，两期结果按分组键取并集合并，
 * 列扩展为 指标 / 指标(对比期) / 指标(差值) / 指标(变化%)。
 */
async function runSpec(rawSpec, { limit = 500 } = {}) {
  const { errors, spec } = validateSpec(rawSpec)
  if (!spec) {
    throw unprocessableEntity(`报表定义无效：${errors.join('；')}`, errors)
  }
  const dataset = DATASETS[spec.dataset]

  // 明细模式：不分组不聚合，直接出行级记录
  if (spec.detail) {
    const detailTopN = spec.limit || null
    const detailQuery = buildDetailQuery(spec, { limit: detailTopN ?? limit + 1 })
    const detailRawRows = await query(detailQuery.sql, detailQuery.params)
    const detailTruncated = !detailTopN && detailRawRows.length > limit
    return {
      spec,
      columns: detailQuery.columns,
      rows: detailRawRows.slice(0, detailTopN ?? limit),
      total: Math.min(detailRawRows.length, detailTopN ?? limit),
      truncated: detailTruncated,
      specText: describeSpec(spec, detailQuery.range),
      range: { ...detailQuery.range },
      compare: null,
    }
  }
  // TopN 时按 TopN 查询（不做截断检测）；否则按预览上限 +1 查询以检测截断
  const topN = spec.limit || null
  const { sql, params, columns, range } = buildQuery(spec, { limit: topN ?? limit + 1 })

  const compareRange = spec.compare ? resolveCompareRange(range, spec.compare.type) : null
  // 对比查询不带 TopN：取对比期全量分组，保证能匹配上当期 TopN 的分组键
  const compareQuery = compareRange
    ? buildQuery({ ...spec, limit: null, timeRange: { type: 'absolute', from: compareRange.from, to: compareRange.to } }, { limit: 2000 })
    : null

  const [rawRows, compareRawRows] = await Promise.all([
    query(sql, params),
    compareQuery ? query(compareQuery.sql, compareQuery.params) : Promise.resolve([]),
  ])
  const truncated = !topN && rawRows.length > limit
  const rows = rawRows.slice(0, topN ?? limit).map((row) => translateRow(dataset, columns, row))

  if (!compareRange) {
    return {
      spec,
      columns,
      rows,
      total: rows.length,
      truncated,
      specText: describeSpec(spec, range),
      range: { ...range },
      compare: null,
    }
  }

  const mergedColumns = [...columns.filter((c) => c.kind === 'dimension')]
  for (const key of spec.metrics) {
    const label = dataset.metrics[key].label
    const unit = dataset.metrics[key].unit || null
    mergedColumns.push(
      { key, label, kind: 'metric', unit },
      { key: `${key}__compare`, label: `${label}(对比期)`, kind: 'metric', unit },
      { key: `${key}__delta`, label: `${label}(差值)`, kind: 'metric', unit },
      { key: `${key}__pct`, label: `${label}(变化%)`, kind: 'metric', unit: null },
    )
  }

  const compareTranslated = compareRawRows.map((row) => translateRow(dataset, columns, row))
  const compareMap = new Map(compareTranslated.map((row) => [groupKeyOf(row, spec.groupBy), row]))

  const buildMerged = (curRow, cmpRow) => {
    const out = {}
    for (const k of spec.groupBy) out[k] = (curRow || cmpRow)[k]
    for (const key of spec.metrics) {
      const cur = curRow ? Number(curRow[key]) || 0 : 0
      const cmp = cmpRow ? Number(cmpRow[key]) || 0 : 0
      const { delta, pct } = compareCell(cur, cmp)
      out[key] = cur
      out[`${key}__compare`] = cmp
      out[`${key}__delta`] = delta
      out[`${key}__pct`] = pct
    }
    return out
  }

  const seen = new Set()
  const mergedRows = []
  for (const row of rows) {
    const gk = groupKeyOf(row, spec.groupBy)
    seen.add(gk)
    mergedRows.push(buildMerged(row, compareMap.get(gk) || null))
  }
  // 仅对比期存在的分组（本期为 0），按对比期第一个指标降序追加
  const compareOnly = compareTranslated
    .filter((row) => !seen.has(groupKeyOf(row, spec.groupBy)))
    .sort((a, b) => (Number(b[spec.metrics[0]]) || 0) - (Number(a[spec.metrics[0]]) || 0))
  // TopN 模式下不追加对比期独有行（会冲破 TopN 限制）
  if (!spec.limit) {
    for (const row of compareOnly) mergedRows.push(buildMerged(null, row))
  }

  const compareLabel = `${COMPARE_TYPE_LABELS[spec.compare.type]}（${compareRange.from} ~ ${compareRange.to}）`
  return {
    spec,
    columns: mergedColumns,
    rows: mergedRows,
    total: mergedRows.length,
    truncated,
    specText: `${describeSpec(spec, range)} · 对比：${compareLabel}`,
    range: { ...range },
    compare: { type: spec.compare.type, label: compareLabel, from: compareRange.from, to: compareRange.to },
  }
}

module.exports = { validateSpec, resolveRelativeRange, resolveCompareRange, compareCell, buildQuery, buildDetailQuery, describeSpec, runSpec, RELATIVE_RANGE_LABELS, CHART_TYPES, COMPARE_TYPE_LABELS }
