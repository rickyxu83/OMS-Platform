// spec 013：值班津贴改为「极简设置 + 每月 1 号生成当月批次」。
// 旧版的周末 7×24 计算（weekendDates/assignDates）、轮值模式与重叠消解
// （markOverlaps/holidayPriorityResolve）已随年度设置一并废弃删除。
const DUTY_TYPES = Object.freeze(['monthly_on_call', 'legal_holiday_on_call'])
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/

// 把按天的假期日历聚合为假期段（一个假期一个段：名称 + 起止日期 + 天数）。
// 入参为按日期升序的 { date, name } 行；同名称且日期连续者并段（防御性：同一名称出现两段则拆段）。
function holidaySpans(holidayRows) {
  const spans = []
  let current = null
  for (const row of holidayRows) {
    const gap = current ? (Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${current.end}T00:00:00Z`)) / 86400000 : 0
    if (!current || current.name !== row.name || gap > 1) {
      current = { name: row.name, start: row.date, end: row.date, days: 1 }
      spans.push(current)
    } else {
      current.end = row.date
      current.days += 1
    }
  }
  return spans
}

// 假期段与目标月份求交：返回裁剪到当月范围的 { start, end, days }，不相交返回 null
function clampSpanToMonth(span, month) {
  if (!monthPattern.test(month)) throw new Error('invalid month')
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`
  const start = span.start > monthStart ? span.start : monthStart
  const end = span.end < monthEnd ? span.end : monthEnd
  if (start > end) return null
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
  return { start, end, days }
}

// 月度批次记录生成：
// - 月度值班：固定名单每人每月 1 条（units=1）
// - 法定节假日：假期段与当月求交，按名称取值班名单，每人 1 条（units=段内当月天数，跨月段按天拆到各月）
// holidayAssignees: Map<假期名称, employeeId[]>
function generateMonthlyRecords({ month, monthlyIds = [], holidayAssignees = new Map(), holidayRows = [] }) {
  if (!monthPattern.test(month)) throw new Error('invalid month')
  const records = []
  for (const employeeId of monthlyIds) {
    records.push({ date: `${month}-01`, endDate: null, employeeId, dutyType: 'monthly_on_call', reason: '月度值班', units: 1 })
  }
  for (const span of holidaySpans(holidayRows)) {
    const clipped = clampSpanToMonth(span, month)
    if (!clipped) continue
    const ids = holidayAssignees.get(span.name) || []
    for (const employeeId of ids) {
      records.push({ date: clipped.start, endDate: clipped.end, employeeId, dutyType: 'legal_holiday_on_call', reason: span.name, units: clipped.days })
    }
  }
  const unique = new Map()
  records.forEach((record) => unique.set(`${record.date}:${record.employeeId}:${record.dutyType}`, record))
  return [...unique.values()]
}

function nextBatchStatus(current, action) {
  const transitions = {
    submit: { draft: 'pending_admin', rejected: 'pending_admin' },
    approve: { pending_admin: 'approved' },
    reject: { pending_admin: 'rejected' },
  }
  return transitions[action]?.[current] || null
}

module.exports = { DUTY_TYPES, holidaySpans, clampSpanToMonth, generateMonthlyRecords, nextBatchStatus }
