const DUTY_TYPES = Object.freeze(['weekend_on_call', 'legal_holiday_on_call'])
const ASSIGNMENT_MODES = Object.freeze(['rotation', 'fixed'])

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
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
    const key = `${record.date}:${record.employeeId}`
    const types = typesByKey.get(key) || new Set()
    types.add(record.dutyType)
    typesByKey.set(key, types)
  })
  return records.map((record) => ({
    ...record,
    overlapState: (typesByKey.get(`${record.date}:${record.employeeId}`)?.size || 0) > 1 ? 'unresolved' : 'none',
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

module.exports = { DUTY_TYPES, ASSIGNMENT_MODES, weekendDates, assignDates, dedupeRecords, markOverlaps, nextBatchStatus }
