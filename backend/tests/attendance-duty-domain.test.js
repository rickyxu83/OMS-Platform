const assert = require('node:assert/strict')
const { holidaySpans, clampSpanToMonth, generateMonthlyRecords, nextBatchStatus } = require('../src/modules/attendance/duty-domain')

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

// 段与月份求交：相交裁剪、不相交为 null、跨月段按当月范围裁剪天数
assert.deepEqual(clampSpanToMonth({ name: '中秋节', start: '2026-09-25', end: '2026-09-27', days: 3 }, '2026-09'), { start: '2026-09-25', end: '2026-09-27', days: 3 })
assert.equal(clampSpanToMonth({ name: '中秋节', start: '2026-09-25', end: '2026-09-27', days: 3 }, '2026-10'), null)
assert.deepEqual(clampSpanToMonth({ name: '国庆节', start: '2026-09-29', end: '2026-10-07', days: 9 }, '2026-10'), { start: '2026-10-01', end: '2026-10-07', days: 7 })
assert.deepEqual(clampSpanToMonth({ name: '国庆节', start: '2026-09-29', end: '2026-10-07', days: 9 }, '2026-09'), { start: '2026-09-29', end: '2026-09-30', days: 2 })
assert.throws(() => clampSpanToMonth({ start: '2026-01-01', end: '2026-01-01' }, '2026-13'), /invalid month/)

// 月度生成：固定名单每人每月 1 条
const monthlyOnly = generateMonthlyRecords({ month: '2026-09', monthlyIds: [10, 20] })
assert.deepEqual(monthlyOnly, [
  { date: '2026-09-01', endDate: null, employeeId: 10, dutyType: 'monthly_on_call', reason: '月度值班', units: 1 },
  { date: '2026-09-01', endDate: null, employeeId: 20, dutyType: 'monthly_on_call', reason: '月度值班', units: 1 },
])

// 月度生成：假期段按名称取名单，每人 1 条、units=段内当月天数；未配置的假期不生成
const withHoliday = generateMonthlyRecords({
  month: '2026-09',
  monthlyIds: [10],
  holidayAssignees: new Map([['中秋节', [30, 40]]]),
  holidayRows: [
    { date: '2026-09-25', name: '中秋节' },
    { date: '2026-09-26', name: '中秋节' },
    { date: '2026-09-27', name: '中秋节' },
    { date: '2026-09-29', name: '国庆节' },
    { date: '2026-09-30', name: '国庆节' },
  ],
})
assert.equal(withHoliday.length, 3)
assert.deepEqual(withHoliday.find((r) => r.dutyType === 'legal_holiday_on_call' && r.employeeId === 30), {
  date: '2026-09-25', endDate: '2026-09-27', employeeId: 30, dutyType: 'legal_holiday_on_call', reason: '中秋节', units: 3,
})
// 国庆节未配置名单 → 不生成
assert.equal(withHoliday.filter((r) => r.reason === '国庆节').length, 0)

// 跨月假期：10 月侧只算落在 10 月的天数
const octSpan = generateMonthlyRecords({
  month: '2026-10',
  monthlyIds: [],
  holidayAssignees: new Map([['国庆节', [30]]]),
  holidayRows: [
    { date: '2026-09-29', name: '国庆节' },
    { date: '2026-09-30', name: '国庆节' },
    { date: '2026-10-01', name: '国庆节' },
    { date: '2026-10-02', name: '国庆节' },
  ],
})
// holidayRows 传入的是 10 月查询窗口内的行（后端按当月日期范围查询），此处模拟跨月段完整行验证裁剪
assert.deepEqual(octSpan, [
  { date: '2026-10-01', endDate: '2026-10-02', employeeId: 30, dutyType: 'legal_holiday_on_call', reason: '国庆节', units: 2 },
])

// 去重：同日期同人同类型只留一条
const deduped = generateMonthlyRecords({ month: '2026-09', monthlyIds: [10, 10] })
assert.equal(deduped.length, 1)

// 状态机
assert.equal(nextBatchStatus('draft', 'submit'), 'pending_admin')
assert.equal(nextBatchStatus('rejected', 'submit'), 'pending_admin')
assert.equal(nextBatchStatus('pending_admin', 'approve'), 'approved')
assert.equal(nextBatchStatus('pending_admin', 'reject'), 'rejected')
assert.equal(nextBatchStatus('approved', 'submit'), null)
assert.equal(nextBatchStatus('draft', 'approve'), null)

console.log('attendance-duty-domain tests passed')
