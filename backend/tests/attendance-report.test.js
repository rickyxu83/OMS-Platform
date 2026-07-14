const assert = require('node:assert/strict')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'

const {
  parseReportFilters,
  clipContinuousHours,
  buildReportData,
  buildWorkbook,
} = require('../src/modules/attendance/report')
const { getDefaultPermissionMatrix } = require('../src/permissions/catalog')
const { applyRolePermissionBaselines } = require('../src/permissions/store')

{
  const filters = parseReportFilters({ startDate: '2026-07-01', endDate: '2027-07-01', employeeIds: '3,2,3' })
  assert.deepEqual(filters.employeeIds, [3, 2])
  assert.equal(filters.endExclusive, '2027-07-02 00:00:00')
}

assert.throws(
  () => parseReportFilters({ startDate: '2026-01-01', endDate: '2027-01-02' }),
  /不能超过 366 天/,
)
assert.throws(
  () => parseReportFilters({ startDate: '2026-07-02', endDate: '2026-07-01' }),
  /不能早于/,
)

{
  const filters = parseReportFilters({ startDate: '2026-08-01', endDate: '2026-08-01' })
  assert.equal(clipContinuousHours('2026-07-31 22:00:00', '2026-08-01 03:00:00', filters), 3)
}

{
  const matrix = getDefaultPermissionMatrix()
  assert.equal(matrix.admin['attendance.report.export'], true)
  assert.equal(matrix.administrative_supervisor['attendance.report.export'], true)
  assert.equal(matrix.operations_director['attendance.report.export'], true)
  assert.equal(matrix.engineer['attendance.report.export'], false)
  const custom = getDefaultPermissionMatrix()
  custom.engineer['attendance.report.export'] = true
  custom.engineer['attendance.view'] = false
  applyRolePermissionBaselines(custom)
  assert.equal(custom.engineer['attendance.view'], true)
}

;(async () => {
  const filters = parseReportFilters({ startDate: '2026-08-01', endDate: '2026-08-31' })
  const employee = { id: 1, employee_name: '测试员工', hire_date: '2025-01-01', leave_date: null, attendance_enabled: 1 }
  const annual = {
    id: 11, employee_id: 1, request_type: 'leave', leave_type: 'annual', start_at: '2026-07-31 09:00:00', end_at: '2026-08-03 18:00:00',
    hours: 24, updated_at: '2026-08-04 12:00:00',
  }
  const overtime = {
    id: 12, employee_id: 1, request_type: 'overtime', overtime_kind: 'work', overtime_result: 'pay', overtime_day_type: 'legal_holiday',
    overtime_pay_multiplier: 3, start_at: '2026-08-01 18:00:00', end_at: '2026-08-01 20:00:00', hours: 2, updated_at: '2026-08-02 12:00:00',
  }
  const compEarn = {
    id: 13, employee_id: 1, request_type: 'overtime', overtime_kind: 'work', overtime_result: 'comp_time', overtime_day_type: 'workday',
    overtime_pay_multiplier: 1, start_at: '2026-06-01 18:00:00', end_at: '2026-06-01 20:00:00', hours: 2,
  }
  const data = buildReportData(filters, {
    employees: [employee],
    requests: [annual, overtime],
    balanceRequests: [annual, compEarn],
    manualLedger: [{ id: 21, employee_id: 1, balance_type: 'annual_leave', delta_hours: 10, created_at: '2026-01-01 10:00:00' }],
    holidays: new Set(),
  })

  assert.equal(data.leaveSummary[0].annualDays, 1)
  assert.equal(data.overtimeSummary[0].payHours, 2)
  assert.equal(data.overtimeSummary[0].weightedPayHours, 6)
  assert.equal(data.balanceSummary[0].annualDays, 7)
  assert.equal(data.balanceSummary[0].compTimeHours, 2)
  assert.equal(data.leaveDetails[0].reason, undefined)

  const workbook = buildWorkbook(data)
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['请假统计', '加班统计', '假期余额'])
  assert.equal(workbook.getWorksheet('请假统计').getCell('A3').value, '敦阳（宁波）科技有限公司')
  assert.equal(workbook.getWorksheet('请假统计').getCell('A1').fill.fgColor.argb, 'FF2E1065')
  assert.equal(workbook.getWorksheet('请假统计').getCell('A11').fill.fgColor.argb, 'FF8B5CF6')
  assert.match(workbook.getWorksheet('假期余额').headerFooter.oddFooter, /敦阳（宁波）科技有限公司/)
  const buffer = await workbook.xlsx.writeBuffer()
  assert.ok(buffer.byteLength > 1000)
  if (process.env.ATTENDANCE_REPORT_OUTPUT) {
    require('node:fs').writeFileSync(process.env.ATTENDANCE_REPORT_OUTPUT, Buffer.from(buffer))
  }
  console.log('attendance report tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
