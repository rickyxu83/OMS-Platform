const assert = require('node:assert/strict')
const { weekendDates, assignDates, dedupeRecords, markOverlaps, nextBatchStatus } = require('../src/modules/attendance/duty-domain')

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
assert.equal(nextBatchStatus('draft', 'submit'), 'pending_admin')
assert.equal(nextBatchStatus('pending_admin', 'approve'), 'approved')
assert.equal(nextBatchStatus('pending_admin', 'reject'), 'rejected')
assert.equal(nextBatchStatus('approved', 'submit'), null)

console.log('attendance duty domain tests passed')
