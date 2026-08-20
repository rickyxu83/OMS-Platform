const assert = require('node:assert/strict')
const { weekendDates, holidaySpans, assignDates, dedupeRecords, holidayPriorityResolve, markOverlaps, nextBatchStatus } = require('../src/modules/attendance/duty-domain')

const dates2026 = weekendDates(2026)
assert.equal(dates2026.length, 104)
assert.equal(dates2026[0], '2026-01-03')
assert.equal(dates2026.at(-1), '2026-12-27')

assert.deepEqual(assignDates(['2026-01-03', '2026-01-04', '2026-01-10', '2026-01-11'], [10, 20], 'rotation'), [
  { date: '2026-01-03', employeeId: 10 }, { date: '2026-01-04', employeeId: 10 },
  { date: '2026-01-10', employeeId: 20 }, { date: '2026-01-11', employeeId: 20 },
])
assert.equal(assignDates(['2026-01-03', '2026-01-04'], [10, 20], 'fixed').length, 4)
assert.equal(dedupeRecords([
  { date: '2026-01-03', employeeId: 10, dutyType: 'weekend_on_call' },
  { date: '2026-01-03', employeeId: 10, dutyType: 'weekend_on_call' },
]).length, 1)

const overlaps = markOverlaps([
  { date: '2026-02-15', employeeId: 10, dutyType: 'weekend_on_call' },
  { date: '2026-02-15', employeeId: 10, dutyType: 'legal_holiday_on_call' },
  { date: '2026-02-15', employeeId: 20, dutyType: 'legal_holiday_on_call' },
])
assert.deepEqual(overlaps.map((row) => row.overlapState), ['unresolved', 'unresolved', 'none'])

// 假期段：同名称连续假日并段，中间有补班日不并入
assert.deepEqual(holidaySpans([
  { date: '2026-01-01', name: '元旦' },
  { date: '2026-01-02', name: '元旦' },
  { date: '2026-01-03', name: '元旦' },
  { date: '2026-02-15', name: '春节' },
  { date: '2026-02-16', name: '春节' },
  { date: '2026-02-17', name: '春节' },
]), [
  { name: '元旦', start: '2026-01-01', end: '2026-01-03', days: 3 },
  { name: '春节', start: '2026-02-15', end: '2026-02-17', days: 3 },
])
assert.deepEqual(holidaySpans([{ date: '2026-10-01', name: '国庆节' }, { date: '2026-10-03', name: '国庆节' }]), [
  { name: '国庆节', start: '2026-10-01', end: '2026-10-01', days: 1 },
  { name: '国庆节', start: '2026-10-03', end: '2026-10-03', days: 1 },
])

// 节假日优先自动消解：假期段覆盖的周末同人 7×24 让位（删除）
const resolved = holidayPriorityResolve([
  { date: '2026-02-15', endDate: '2026-02-21', days: 7, employeeId: 10, dutyType: 'legal_holiday_on_call' },
  { date: '2026-02-21', employeeId: 10, dutyType: 'weekend_on_call' },   // 段内周六，同人 → 删除
  { date: '2026-02-21', employeeId: 20, dutyType: 'weekend_on_call' },   // 段内周六，不同人 → 保留
  { date: '2026-03-07', employeeId: 10, dutyType: 'weekend_on_call' },   // 段外周末 → 保留
])
assert.deepEqual(resolved.map((r) => `${r.dutyType}:${r.date}:${r.employeeId}`), [
  'legal_holiday_on_call:2026-02-15:10', 'weekend_on_call:2026-02-21:20', 'weekend_on_call:2026-03-07:10',
])

// 假期段与 7×24 按天重叠：段内任一周末与周末值班同人时标记 unresolved
const spanOverlaps = markOverlaps([
  { date: '2026-02-15', endDate: '2026-02-21', days: 7, employeeId: 10, dutyType: 'legal_holiday_on_call' },
  { date: '2026-02-21', employeeId: 10, dutyType: 'weekend_on_call' },
  { date: '2026-02-21', employeeId: 20, dutyType: 'weekend_on_call' },
])
assert.deepEqual(spanOverlaps.map((row) => row.overlapState), ['unresolved', 'unresolved', 'none'])
// 段内无重叠时全部 none
const spanClear = markOverlaps([
  { date: '2026-02-15', endDate: '2026-02-21', days: 7, employeeId: 10, dutyType: 'legal_holiday_on_call' },
  { date: '2026-02-21', employeeId: 30, dutyType: 'weekend_on_call' },
])
assert.deepEqual(spanClear.map((row) => row.overlapState), ['none', 'none'])
assert.equal(nextBatchStatus('draft', 'submit'), 'pending_admin')
assert.equal(nextBatchStatus('pending_admin', 'approve'), 'approved')
assert.equal(nextBatchStatus('pending_admin', 'reject'), 'rejected')
assert.equal(nextBatchStatus('approved', 'submit'), null)

console.log('attendance duty domain tests passed')
