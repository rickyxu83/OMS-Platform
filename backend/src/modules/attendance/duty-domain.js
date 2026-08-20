const DUTY_TYPES = Object.freeze(['weekend_on_call', 'legal_holiday_on_call'])
const ASSIGNMENT_MODES = Object.freeze(['rotation', 'fixed'])

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

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

// 展开一条记录覆盖的日期列表（单日记录只含自身，假期段记录展开为段内每一天）
function expandRecordDates(record) {
  const start = new Date(`${record.date}T00:00:00Z`)
  const end = record.endDate ? new Date(`${record.endDate}T00:00:00Z`) : start
  const dates = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function weekendDates(year) {
  const dates = []
  for (let month = 0; month < 12; month += 1) {
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(Date.UTC(year, month, day))
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) dates.push(isoDate(year, month, day))
    }
  }
  return dates
}

function assignDates(dates, employeeIds, mode) {
  if (!ASSIGNMENT_MODES.includes(mode)) throw new Error('invalid assignment mode')
  if (!employeeIds.length) return []
  if (mode === 'fixed') {
    return dates.flatMap((date) => employeeIds.map((employeeId) => ({ date, employeeId })))
  }
  const weekendIndex = new Map()
  return dates.map((date) => {
    const current = new Date(`${date}T00:00:00Z`)
    const day = current.getUTCDay()
    const daysFromMonday = day === 0 ? 6 : day - 1
    current.setUTCDate(current.getUTCDate() - daysFromMonday)
    const weekKey = current.toISOString().slice(0, 10)
    if (!weekendIndex.has(weekKey)) weekendIndex.set(weekKey, weekendIndex.size)
    return { date, employeeId: employeeIds[weekendIndex.get(weekKey) % employeeIds.length] }
  })
}

function markOverlaps(records) {
  const typesByKey = new Map()
  records.forEach((record) => {
    for (const date of expandRecordDates(record)) {
      const key = `${date}:${record.employeeId}`
      const types = typesByKey.get(key) || new Set()
      types.add(record.dutyType)
      typesByKey.set(key, types)
    }
  })
  return records.map((record) => ({
    ...record,
    overlapState: expandRecordDates(record).some((date) => (typesByKey.get(`${date}:${record.employeeId}`)?.size || 0) > 1) ? 'unresolved' : 'none',
  }))
}

function dedupeRecords(records) {
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

module.exports = { DUTY_TYPES, ASSIGNMENT_MODES, holidaySpans, weekendDates, assignDates, dedupeRecords, markOverlaps, nextBatchStatus }
