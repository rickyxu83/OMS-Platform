const ExcelJS = require('exceljs')
const { query } = require('../../config/db')
const { badRequest } = require('../../utils/http-error')
const { calculateWorkingLeaveRange } = require('./workflow')
const { ensureSchema } = require('./controller')
const duty = require('./duty')

const WORK_HOURS_PER_DAY = 8
const MAX_RANGE_DAYS = 366
const DAY_MS = 86400000
const REPORT_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const COMPANY_NAME = '敦阳（宁波）科技有限公司'
// 与管理端网页主题（theme.css --primary: #582b8b）同族的品牌紫配色
const REPORT_COLORS = Object.freeze({
  deep: 'FF38185C',
  primary: 'FF582B8B',
  primaryDark: 'FF4A2375',
  accent: 'FF8B6BC4',
  onDeep: 'FFE9E1F5',
  ink: 'FF1F1B2E',
  muted: 'FF717182',
  line: 'FFE6DFF1',
  soft: 'FFF5F3FA',
  white: 'FFFFFFFF',
  success: 'FF15803D',
  successSoft: 'FFDCFCE7',
  warning: 'FFB45309',
  warningSoft: 'FFFEF3C7',
  neutralSoft: 'FFF1F5F9',
  danger: 'FFB91C1C',
})

const LEAVE_LABELS = Object.freeze({
  annual: '特休',
  sick: '病假',
  personal: '事假',
  marriage: '婚假',
  bereavement: '丧假',
  comp_time: '调休',
})
const OVERTIME_KIND_LABELS = Object.freeze({ travel: '路上时间', work: '工作时间' })
const OVERTIME_RESULT_LABELS = Object.freeze({ comp_time: '转调休', pay: '加班费' })
const DAY_TYPE_LABELS = Object.freeze({ workday: '工作日', rest_day: '休息日', legal_holiday: '法定节假日' })
const BALANCE_LABELS = Object.freeze({ annual_leave: '特休', comp_time: '调休' })

function text(value) {
  return String(value ?? '').trim()
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function dateIndex(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(utc)
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null
  return Math.floor(utc / DAY_MS)
}

function dateFromIndex(index) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}

function parseEmployeeIds(value) {
  if (!text(value)) return []
  const ids = [...new Set(text(value).split(',').map((item) => Number(item.trim())))]
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw badRequest('员工筛选格式不正确')
  if (ids.length > 500) throw badRequest('单次最多选择 500 名员工')
  return ids
}

function parseReportFilters(input = {}) {
  const startDate = text(input.startDate)
  const endDate = text(input.endDate)
  const startIndex = dateIndex(startDate)
  const endIndex = dateIndex(endDate)
  if (startIndex === null || endIndex === null) throw badRequest('统计日期格式必须为 YYYY-MM-DD')
  if (endIndex < startIndex) throw badRequest('结束日期不能早于开始日期')
  if (endIndex - startIndex + 1 > MAX_RANGE_DAYS) throw badRequest(`单次统计范围不能超过 ${MAX_RANGE_DAYS} 天`)
  return {
    startDate,
    endDate,
    startIndex,
    endIndex,
    startAt: `${startDate} 00:00:00`,
    endExclusive: `${dateFromIndex(endIndex + 1)} 00:00:00`,
    employeeIds: parseEmployeeIds(input.employeeIds),
  }
}

function mysqlDate(value) {
  if (!value) return ''
  if (value instanceof Date) {
    const pad = (number) => String(number).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  return text(value).replace('T', ' ').slice(0, 19)
}

function timestamp(value) {
  const normalized = mysqlDate(value)
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return NaN
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
}

function clipContinuousHours(startAt, endAt, filters) {
  const start = Math.max(timestamp(startAt), timestamp(filters.startAt))
  const end = Math.min(timestamp(endAt), timestamp(filters.endExclusive))
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return round((end - start) / 3600000)
}

function clipLeaveRange(row, filters, holidays) {
  const start = mysqlDate(row.start_at)
  const end = mysqlDate(row.end_at)
  const clippedStart = timestamp(start) < timestamp(filters.startAt) ? `${filters.startDate} 09:00:00` : start
  const clippedEnd = timestamp(end) > timestamp(filters.endExclusive) ? `${filters.endDate} 18:00:00` : end
  if (timestamp(clippedEnd) <= timestamp(clippedStart)) return { hours: 0, days: 0 }
  try {
    const result = calculateWorkingLeaveRange({
      startAt: clippedStart,
      endAt: clippedEnd,
      holidays,
      includeNonWorkingDays: row.request_type === 'leave' && ['marriage', 'bereavement'].includes(row.leave_type),
    })
    return { hours: round(result.hours), days: round(result.hours / WORK_HOURS_PER_DAY) }
  } catch {
    return { hours: 0, days: 0 }
  }
}

function requestRangeAmount(row, filters, holidays) {
  if (row.request_type === 'overtime') {
    return { hours: clipContinuousHours(row.start_at, row.end_at, filters), days: 0 }
  }
  return clipLeaveRange(row, filters, holidays)
}

function employeeStatus(row, endDate) {
  const leaveDate = mysqlDate(row.leave_date).slice(0, 10)
  if (leaveDate && leaveDate <= endDate) return '离职'
  if (!Boolean(row.attendance_enabled)) return '停用'
  return '在职'
}

function finalApprovedAt(row) {
  return mysqlDate(row.final_approved_at || row.admin_approved_at || row.supervisor_approved_at || row.updated_at)
}

function sourceReference(row) {
  if (row.source_type === 'service_order') return row.source_detail || (row.source_id ? `工单 #${row.source_id}` : '')
  return ''
}

function selectedSql(ids, column, params) {
  if (!ids.length) return ''
  const placeholders = ids.map((id, index) => {
    params[`employeeId${index}`] = id
    return `:employeeId${index}`
  })
  return ` AND ${column} IN (${placeholders.join(', ')})`
}

async function loadReportRows(filters) {
  const params = { startAt: filters.startAt, endExclusive: filters.endExclusive }
  const requestFilter = selectedSql(filters.employeeIds, 'r.employee_id', params)
  const employeeParams = {}
  const employeeFilter = selectedSql(filters.employeeIds, 'p.id', employeeParams)
  const ledgerParams = { endExclusive: filters.endExclusive }
  const ledgerFilter = selectedSql(filters.employeeIds, 'l.employee_id', ledgerParams)

  const balanceRequestParams = { endExclusive: filters.endExclusive }
  const balanceRequestFilter = selectedSql(filters.employeeIds, 'r.employee_id', balanceRequestParams)
  const [employees, requests, balanceRequests, manualLedger, holidays] = await Promise.all([
    query(
      `SELECT p.id, p.employee_name, p.hire_date, p.leave_date, p.attendance_enabled
       FROM attendance_employee_profiles p
       WHERE 1 = 1${employeeFilter}
       ORDER BY p.employee_name ASC, p.id ASC`,
      employeeParams,
    ),
    query(
      `SELECT r.id, r.employee_id, r.request_type, r.leave_type, r.overtime_kind,
              r.overtime_result, r.overtime_day_type, r.overtime_pay_multiplier,
              r.start_at, r.end_at, r.hours, r.reason, r.source_type, r.source_id, r.source_detail,
              r.supervisor_approved_at, r.admin_approved_at, r.updated_at,
              (SELECT MAX(a.approved_at) FROM attendance_request_approvals a WHERE a.request_id = r.id) AS final_approved_at
       FROM attendance_requests r
       WHERE r.status = 'approved'
         AND r.start_at < :endExclusive
         AND r.end_at > :startAt${requestFilter}
       ORDER BY r.start_at ASC, r.id ASC`,
      params,
    ),
    query(
      `SELECT r.id, r.employee_id, r.request_type, r.leave_type, r.overtime_kind,
              r.overtime_result, r.overtime_day_type, r.overtime_pay_multiplier,
              r.start_at, r.end_at, r.hours, r.source_type, r.source_id, r.source_detail
       FROM attendance_requests r
       WHERE r.status = 'approved'
         AND r.start_at < :endExclusive
         AND ((r.request_type = 'overtime' AND r.overtime_result = 'comp_time')
           OR r.request_type = 'comp_time'
           OR (r.request_type = 'leave' AND r.leave_type = 'annual'))${balanceRequestFilter}
       ORDER BY r.start_at ASC, r.id ASC`,
      balanceRequestParams,
    ),
    query(
      `SELECT l.id, l.employee_id, l.balance_type, l.delta_hours, l.created_at
       FROM attendance_balance_ledger l
       WHERE l.request_id IS NULL
         AND l.created_at < :endExclusive${ledgerFilter}
       ORDER BY l.created_at ASC, l.id ASC`,
      ledgerParams,
    ),
    query(
      `SELECT holiday_date
       FROM attendance_legal_holidays
       WHERE is_active = 1
         AND holiday_date >= :startAt
         AND holiday_date < :endExclusive`,
      { startAt: filters.startDate, endExclusive: dateFromIndex(filters.endIndex + 1) },
    ),
  ])

  return { employees, requests, balanceRequests, manualLedger, holidays: new Set(holidays.map((row) => mysqlDate(row.holiday_date).slice(0, 10))) }
}

function buildReportData(filters, rows) {
  const employeeById = new Map(rows.employees.map((employee) => [Number(employee.id), employee]))
  const activeIds = new Set(rows.employees
    .filter((employee) => Boolean(employee.attendance_enabled) && (!employee.hire_date || mysqlDate(employee.hire_date).slice(0, 10) <= filters.endDate))
    .map((employee) => Number(employee.id)))
  const activityIds = new Set(rows.requests.map((row) => Number(row.employee_id)))
  for (const ledger of rows.manualLedger) {
    const date = mysqlDate(ledger.created_at).slice(0, 10)
    if (date >= filters.startDate && date <= filters.endDate) activityIds.add(Number(ledger.employee_id))
  }
  const includedIds = new Set([...activeIds, ...activityIds])
  if (filters.employeeIds.length) {
    const selected = new Set(filters.employeeIds)
    for (const id of [...includedIds]) if (!selected.has(id)) includedIds.delete(id)
  }
  const employees = rows.employees
    .filter((employee) => includedIds.has(Number(employee.id)))
    .map((employee) => ({ id: Number(employee.id), name: employee.employee_name, status: employeeStatus(employee, filters.endDate) }))
  const included = new Set(employees.map((employee) => employee.id))
  const leaveSummary = new Map(employees.map((employee) => [employee.id, {
    ...employee, requestCount: 0, annualDays: 0, sickHours: 0, personalHours: 0, marriageHours: 0, bereavementHours: 0, compTimeHours: 0, totalHours: 0,
  }]))
  const overtimeSummary = new Map(employees.map((employee) => [employee.id, {
    ...employee, requestCount: 0, totalHours: 0, compTimeHours: 0, payHours: 0, legalHolidayPayHours: 0, weightedPayHours: 0,
  }]))
  const leaveDetails = []
  const overtimeDetails = []

  for (const row of rows.requests) {
    const employeeId = Number(row.employee_id)
    if (!included.has(employeeId)) continue
    const amount = requestRangeAmount(row, filters, rows.holidays)
    if (amount.hours <= 0) continue
    const employee = employeeById.get(employeeId)
    const status = employeeStatus(employee, filters.endDate)
    if (row.request_type === 'overtime') {
      const summary = overtimeSummary.get(employeeId)
      const multiplier = Number(row.overtime_pay_multiplier || 1)
      summary.requestCount += 1
      summary.totalHours = round(summary.totalHours + amount.hours)
      if (row.overtime_result === 'comp_time') summary.compTimeHours = round(summary.compTimeHours + amount.hours)
      if (row.overtime_result === 'pay') {
        summary.payHours = round(summary.payHours + amount.hours)
        summary.weightedPayHours = round(summary.weightedPayHours + amount.hours * multiplier)
        if (row.overtime_day_type === 'legal_holiday') summary.legalHolidayPayHours = round(summary.legalHolidayPayHours + amount.hours)
      }
      overtimeDetails.push({
        employeeId, employeeName: employee.employee_name, status, requestId: Number(row.id),
        kind: OVERTIME_KIND_LABELS[row.overtime_kind] || row.overtime_kind || '-', startAt: mysqlDate(row.start_at), endAt: mysqlDate(row.end_at),
        hours: amount.hours, result: OVERTIME_RESULT_LABELS[row.overtime_result] || row.overtime_result || '-',
        dayType: DAY_TYPE_LABELS[row.overtime_day_type] || row.overtime_day_type || '-', multiplier,
        weightedHours: row.overtime_result === 'pay' ? round(amount.hours * multiplier) : 0,
        reason: text(row.reason) || sourceReference(row) || '-', approvedAt: finalApprovedAt(row), source: sourceReference(row),
      })
      continue
    }
    if (!['leave', 'comp_time'].includes(row.request_type)) continue
    const summary = leaveSummary.get(employeeId)
    summary.requestCount += 1
    if (row.request_type === 'comp_time') summary.compTimeHours = round(summary.compTimeHours + amount.hours)
    else if (row.leave_type === 'annual') summary.annualDays = round(summary.annualDays + amount.days)
    else if (row.leave_type === 'sick') summary.sickHours = round(summary.sickHours + amount.hours)
    else if (row.leave_type === 'personal') summary.personalHours = round(summary.personalHours + amount.hours)
    else if (row.leave_type === 'marriage') summary.marriageHours = round(summary.marriageHours + amount.hours)
    else if (row.leave_type === 'bereavement') summary.bereavementHours = round(summary.bereavementHours + amount.hours)
    summary.totalHours = round(summary.totalHours + amount.hours)
    leaveDetails.push({
      employeeId, employeeName: employee.employee_name, status, requestId: Number(row.id),
      leaveType: row.request_type === 'comp_time' ? LEAVE_LABELS.comp_time : (LEAVE_LABELS[row.leave_type] || row.leave_type || '-'),
      startAt: mysqlDate(row.start_at), endAt: mysqlDate(row.end_at), hours: amount.hours,
      annualDays: row.leave_type === 'annual' ? amount.days : 0, approvedAt: finalApprovedAt(row),
    })
  }

  const balanceEvents = new Map(employees.map((employee) => [employee.id, []]))
  for (const ledger of rows.manualLedger) {
    const employeeId = Number(ledger.employee_id)
    if (!included.has(employeeId)) continue
    balanceEvents.get(employeeId).push({
      sortAt: mysqlDate(ledger.created_at), businessDate: mysqlDate(ledger.created_at).slice(0, 10),
      balanceType: ledger.balance_type, delta: round(ledger.delta_hours), sourceType: '人工调整', reference: `调整 #${ledger.id}`,
    })
  }
  const historyFilters = { ...filters, startDate: '1900-01-01', startAt: '1900-01-01 00:00:00' }
  for (const row of rows.balanceRequests) {
    const employeeId = Number(row.employee_id)
    if (!included.has(employeeId)) continue
    let balanceType = ''
    let sign = 0
    if (row.request_type === 'overtime' && row.overtime_result === 'comp_time') { balanceType = 'comp_time'; sign = 1 }
    if (row.request_type === 'comp_time') { balanceType = 'comp_time'; sign = -1 }
    if (row.request_type === 'leave' && row.leave_type === 'annual') { balanceType = 'annual_leave'; sign = -1 }
    if (!balanceType) continue
    const fullyOccurred = timestamp(row.end_at) <= timestamp(filters.endExclusive)
    const amount = fullyOccurred
      ? { hours: round(row.hours), days: round(Number(row.hours || 0) / WORK_HOURS_PER_DAY) }
      : requestRangeAmount(row, historyFilters, rows.holidays)
    const delta = balanceType === 'annual_leave' ? sign * amount.days : sign * amount.hours
    if (!delta) continue
    const eventDate = fullyOccurred ? mysqlDate(row.end_at).slice(0, 10) : filters.endDate
    balanceEvents.get(employeeId).push({
      sortAt: `${eventDate} 23:59:59`, businessDate: eventDate, balanceType, delta: round(delta),
      sourceType: row.request_type === 'overtime' ? '加班转调休' : (row.request_type === 'comp_time' ? '调休使用' : '特休使用'),
      reference: `申请 #${row.id}`,
    })
  }

  const balanceSummary = []
  const balanceDetails = []
  for (const employee of employees) {
    const balances = { annual_leave: 0, comp_time: 0 }
    const opening = { annual_leave: 0, comp_time: 0 }
    const increases = { annual_leave: 0, comp_time: 0 }
    const decreases = { annual_leave: 0, comp_time: 0 }
    const events = balanceEvents.get(employee.id).sort((a, b) => a.sortAt.localeCompare(b.sortAt) || a.reference.localeCompare(b.reference))
    for (const event of events) {
      balances[event.balanceType] = round((balances[event.balanceType] || 0) + event.delta)
      if (event.businessDate < filters.startDate) {
        opening[event.balanceType] = balances[event.balanceType]
      } else if (event.businessDate <= filters.endDate) {
        if (event.delta >= 0) increases[event.balanceType] = round(increases[event.balanceType] + event.delta)
        else decreases[event.balanceType] = round(decreases[event.balanceType] + Math.abs(event.delta))
      }
      balanceDetails.push({
        employeeId: employee.id, employeeName: employee.name, status: employee.status, businessDate: event.businessDate,
        balanceType: BALANCE_LABELS[event.balanceType] || event.balanceType, delta: event.delta,
        balanceAfter: balances[event.balanceType], sourceType: event.sourceType, reference: event.reference,
      })
    }
    balanceSummary.push({
      ...employee,
      endDate: filters.endDate,
      annualOpeningDays: round(opening.annual_leave),
      annualAddedDays: round(increases.annual_leave),
      annualUsedDays: round(decreases.annual_leave),
      annualAvailableDays: round(opening.annual_leave + increases.annual_leave),
      annualDays: round(balances.annual_leave),
      compOpeningHours: round(opening.comp_time),
      compAddedHours: round(increases.comp_time),
      compUsedHours: round(decreases.comp_time),
      compAvailableHours: round(opening.comp_time + increases.comp_time),
      compTimeHours: round(balances.comp_time),
    })
  }

  return {
    filters,
    employees,
    leaveSummary: [...leaveSummary.values()], leaveDetails,
    overtimeSummary: [...overtimeSummary.values()], overtimeDetails,
    balanceSummary, balanceDetails,
  }
}

function fill(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
}

function columnLetter(number) {
  let value = number
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function styleTitle(sheet, title, filters, generatedAt, maxColumns) {
  const lastColumn = columnLetter(maxColumns)
  sheet.mergeCells(`A1:${lastColumn}1`)
  sheet.getCell('A1').value = title
  sheet.getCell('A1').font = { bold: true, size: 20, color: { argb: REPORT_COLORS.white } }
  sheet.getCell('A1').fill = fill(REPORT_COLORS.deep)
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.getRow(1).height = 34

  sheet.mergeCells(`A2:${lastColumn}2`)
  sheet.getCell('A2').value = 'ATTENDANCE REPORT  ·  考勤数据中心'
  sheet.getCell('A2').font = { bold: true, size: 10, color: { argb: REPORT_COLORS.onDeep } }
  sheet.getCell('A2').fill = fill(REPORT_COLORS.deep)
  sheet.getRow(2).height = 22

  const tagEnd = Math.min(3, maxColumns)
  sheet.mergeCells(3, 1, 3, tagEnd)
  sheet.getCell('A3').value = COMPANY_NAME
  sheet.getCell('A3').font = { bold: true, size: 10, color: { argb: REPORT_COLORS.primaryDark } }
  sheet.getCell('A3').fill = fill(REPORT_COLORS.soft)
  sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' }
  if (maxColumns > tagEnd) {
    sheet.mergeCells(3, tagEnd + 1, 3, maxColumns)
    const metaCell = sheet.getCell(3, tagEnd + 1)
    metaCell.value = `生成时间  ${generatedAt}`
    metaCell.font = { size: 9, color: { argb: REPORT_COLORS.muted } }
    metaCell.alignment = { vertical: 'middle', horizontal: 'right' }
  }
  sheet.getRow(3).height = 24

  sheet.mergeCells(4, 1, 4, 2)
  sheet.getCell('A4').value = '统计周期'
  sheet.getCell('A4').font = { bold: true, color: { argb: REPORT_COLORS.primaryDark } }
  if (maxColumns > 2) sheet.mergeCells(4, 3, 4, maxColumns)
  const rangeCell = sheet.getCell(4, Math.min(3, maxColumns))
  rangeCell.value = `${filters.startDate} 至 ${filters.endDate}（含首尾日期）`
  rangeCell.font = { bold: true, color: { argb: REPORT_COLORS.ink } }
  sheet.getRow(4).height = 23

  sheet.mergeCells(`A5:${lastColumn}5`)
  sheet.getCell('A5').value = '口径说明｜仅统计已通过申请；余额按业务发生日期计算；不包含请假原因、证明附件及敏感备注。'
  sheet.getCell('A5').font = { italic: true, size: 9, color: { argb: REPORT_COLORS.muted } }
  sheet.getCell('A5').fill = fill(REPORT_COLORS.soft)
  sheet.getRow(5).height = 25
}

function addMetricStrip(sheet, startRow, metrics, maxColumns) {
  const groupWidth = Math.floor(maxColumns / metrics.length)
  metrics.forEach((metric, index) => {
    const startColumn = index * groupWidth + 1
    const endColumn = index === metrics.length - 1 ? maxColumns : (index + 1) * groupWidth
    sheet.mergeCells(startRow, startColumn, startRow, endColumn)
    sheet.mergeCells(startRow + 1, startColumn, startRow + 1, endColumn)
    const labelCell = sheet.getCell(startRow, startColumn)
    const valueCell = sheet.getCell(startRow + 1, startColumn)
    labelCell.value = metric.label
    valueCell.value = metric.value
    labelCell.font = { bold: true, size: 9, color: { argb: REPORT_COLORS.muted } }
    valueCell.font = { bold: true, size: 15, color: { argb: REPORT_COLORS.primaryDark } }
    labelCell.fill = fill(REPORT_COLORS.soft)
    valueCell.fill = fill(REPORT_COLORS.soft)
    labelCell.alignment = { vertical: 'middle', horizontal: 'center' }
    valueCell.alignment = { vertical: 'middle', horizontal: 'center' }
    for (const row of [startRow, startRow + 1]) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        sheet.getCell(row, column).border = {
          top: { style: 'thin', color: { argb: REPORT_COLORS.line } },
          bottom: { style: 'thin', color: { argb: REPORT_COLORS.line } },
          left: column === startColumn ? { style: 'thin', color: { argb: REPORT_COLORS.line } } : undefined,
          right: column === endColumn ? { style: 'thin', color: { argb: REPORT_COLORS.line } } : undefined,
        }
      }
    }
  })
  sheet.getRow(startRow).height = 20
  sheet.getRow(startRow + 1).height = 27
}

function addSection(sheet, startRow, title, headers, rows, widths, options = {}) {
  sheet.mergeCells(startRow, 1, startRow, headers.length)
  sheet.getCell(`A${startRow}`).value = title
  sheet.getCell(`A${startRow}`).font = { bold: true, size: 12, color: { argb: REPORT_COLORS.primaryDark } }
  sheet.getCell(`A${startRow}`).fill = fill(REPORT_COLORS.soft)
  sheet.getCell(`A${startRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.getRow(startRow).height = 25
  const headerRow = sheet.getRow(startRow + 1)
  headerRow.values = headers
  headerRow.font = { bold: true, color: { argb: REPORT_COLORS.white } }
  headerRow.fill = fill(REPORT_COLORS.primary)
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 28
  const dataRows = rows.length ? rows : [headers.map((_, index) => index === 0 ? '暂无数据' : '')]
  dataRows.forEach((values, index) => {
    const row = sheet.addRow(values)
    row.height = 22
    if (index % 2 === 1) row.fill = fill(REPORT_COLORS.soft)
    row.eachCell((cell, column) => {
      cell.font = { color: { argb: REPORT_COLORS.ink } }
      if (headers[column - 1] === '状态') {
        const status = String(cell.value || '')
        if (status === '在职') {
          cell.font = { bold: true, color: { argb: REPORT_COLORS.success } }
          cell.fill = fill(REPORT_COLORS.successSoft)
        } else if (status === '离职' || status === '停用') {
          cell.font = { bold: true, color: { argb: REPORT_COLORS.warning } }
          cell.fill = fill(REPORT_COLORS.warningSoft)
        }
      }
      if (options.deltaColumn === column && typeof cell.value === 'number') {
        cell.font = { bold: true, color: { argb: cell.value < 0 ? REPORT_COLORS.danger : REPORT_COLORS.success } }
      }
    })
  })
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = Math.max(sheet.getColumn(index + 1).width || 0, width) })
  return startRow + 2 + dataRows.length
}

function buildWorkbook(data) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OMS Platform'
  workbook.created = new Date()
  const generatedAt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date()).replaceAll('/', '-')

  const leaveTotalHours = round(data.leaveSummary.reduce((sum, row) => sum + Number(row.totalHours || 0), 0))
  const annualTotalDays = round(data.leaveSummary.reduce((sum, row) => sum + Number(row.annualDays || 0), 0))
  const leaveRequestCount = data.leaveSummary.reduce((sum, row) => sum + Number(row.requestCount || 0), 0)
  const leave = workbook.addWorksheet('请假统计', { views: [{ state: 'frozen', ySplit: 11 }], properties: { tabColor: { argb: REPORT_COLORS.primary } } })
  styleTitle(leave, '请假统计', data.filters, generatedAt, 10)
  addMetricStrip(leave, 7, [
    { label: '统计员工', value: `${data.leaveSummary.length} 人` },
    { label: '请假申请', value: `${leaveRequestCount} 次` },
    { label: '请假总时数', value: `${leaveTotalHours} 小时` },
    { label: '特休使用', value: `${annualTotalDays} 天` },
  ], 10)
  let next = addSection(leave, 10, '01  员工汇总', ['员工', '状态', '请假次数', '特休（天）', '病假（小时）', '事假（小时）', '婚假（小时）', '丧假（小时）', '调休（小时）', '请假总时数'],
    data.leaveSummary.map((row) => [row.name, row.status, row.requestCount, row.annualDays, row.sickHours, row.personalHours, row.marriageHours, row.bereavementHours, row.compTimeHours, row.totalHours]),
    [18, 10, 12, 12, 13, 13, 13, 13, 13, 14])
  next += 1
  addSection(leave, next, '02  申请明细', ['员工', '状态', '申请编号', '假别', '开始时间', '结束时间', '区间内时长（小时）', '特休折算（天）', '最终审批时间'],
    data.leaveDetails.map((row) => [row.employeeName, row.status, row.requestId, row.leaveType, row.startAt, row.endAt, row.hours, row.annualDays, row.approvedAt]),
    [18, 10, 12, 12, 20, 20, 18, 16, 20])
  leave.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11, column: 10 } }

  const overtimeTotalHours = round(data.overtimeSummary.reduce((sum, row) => sum + Number(row.totalHours || 0), 0))
  const overtimeCompHours = round(data.overtimeSummary.reduce((sum, row) => sum + Number(row.compTimeHours || 0), 0))
  const overtimePayHours = round(data.overtimeSummary.reduce((sum, row) => sum + Number(row.payHours || 0), 0))
  const overtimeRequestCount = data.overtimeSummary.reduce((sum, row) => sum + Number(row.requestCount || 0), 0)
  const overtime = workbook.addWorksheet('加班统计', { views: [{ state: 'frozen', ySplit: 11 }], properties: { tabColor: { argb: REPORT_COLORS.accent } } })
  styleTitle(overtime, '加班统计', data.filters, generatedAt, 14)
  addMetricStrip(overtime, 7, [
    { label: '加班申请', value: `${overtimeRequestCount} 次` },
    { label: '加班总时数', value: `${overtimeTotalHours} 小时` },
    { label: '转调休', value: `${overtimeCompHours} 小时` },
    { label: '计加班费', value: `${overtimePayHours} 小时` },
  ], 14)
  next = addSection(overtime, 10, '01  员工汇总', ['员工', '状态', '加班次数', '加班总时数', '转调休时数', '加班费时数', '法定节假日加班费时数', '加班费折算时数'],
    data.overtimeSummary.map((row) => [row.name, row.status, row.requestCount, row.totalHours, row.compTimeHours, row.payHours, row.legalHolidayPayHours, row.weightedPayHours]),
    [18, 10, 12, 14, 14, 14, 22, 18])
  next += 1
  addSection(overtime, next, '02  申请明细', ['员工', '状态', '申请编号', '加班类型', '加班事由', '开始时间', '结束时间', '区间内时长', '处理方式', '日期类型', '倍率', '折算时数', '最终审批时间', '来源工单'],
    data.overtimeDetails.map((row) => [row.employeeName, row.status, row.requestId, row.kind, row.reason, row.startAt, row.endAt, row.hours, row.result, row.dayType, row.multiplier, row.weightedHours, row.approvedAt, row.source]),
    [18, 10, 12, 14, 28, 20, 20, 14, 12, 14, 10, 12, 20, 20])
  overtime.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11, column: 8 } }

  const annualBalanceDays = round(data.balanceSummary.reduce((sum, row) => sum + Number(row.annualDays || 0), 0))
  const compBalanceHours = round(data.balanceSummary.reduce((sum, row) => sum + Number(row.compTimeHours || 0), 0))
  const balance = workbook.addWorksheet('假期余额', { views: [{ state: 'frozen', ySplit: 11 }], properties: { tabColor: { argb: REPORT_COLORS.primaryDark } } })
  styleTitle(balance, '假期余额', data.filters, generatedAt, 11)
  addMetricStrip(balance, 7, [
    { label: '统计员工', value: `${data.balanceSummary.length} 人` },
    { label: '特休余额合计', value: `${annualBalanceDays} 天` },
    { label: '调休余额合计', value: `${compBalanceHours} 小时` },
  ], 11)
  next = addSection(balance, 10, '01  余额变化汇总', ['员工', '状态', '截止日期', '期初特休（天）', '本期特休增加', '本期特休使用/扣减', '期末特休（天）', '期初调休（小时）', '本期调休增加', '本期调休使用/扣减', '期末调休（小时）'],
    data.balanceSummary.map((row) => [row.name, row.status, row.endDate, row.annualOpeningDays, row.annualAddedDays, row.annualUsedDays, row.annualDays, row.compOpeningHours, row.compAddedHours, row.compUsedHours, row.compTimeHours]),
    [18, 10, 14, 16, 16, 20, 16, 18, 16, 20, 18])
  next += 1
  addSection(balance, next, '02  余额变动明细', ['员工', '状态', '业务日期', '余额类型', '变动量', '变动后余额', '来源类型', '来源编号'],
    data.balanceDetails.map((row) => [row.employeeName, row.status, row.businessDate, row.balanceType, row.delta, row.balanceAfter, row.sourceType, row.reference]),
    [18, 10, 14, 12, 12, 14, 16, 16], { deltaColumn: 5 })
  balance.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11, column: 11 } }

  for (const sheet of workbook.worksheets) {
    sheet.properties.defaultRowHeight = 20
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
    sheet.headerFooter = {
      oddHeader: `&L&9${sheet.name}&R&9考勤报表`,
      oddFooter: `&L&8${COMPANY_NAME}&C&8第 &P / &N 页&R&8OMS Platform`,
    }
    sheet.pageSetup.printTitlesRow = '1:11'
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
        if (row.number >= 10 && !cell.border?.top) cell.border = {
          top: { style: 'thin', color: { argb: REPORT_COLORS.line } }, bottom: { style: 'thin', color: { argb: REPORT_COLORS.line } },
          left: { style: 'thin', color: { argb: REPORT_COLORS.line } }, right: { style: 'thin', color: { argb: REPORT_COLORS.line } },
        }
        if (typeof cell.value === 'number') cell.numFmt = '0.00'
      })
    })
  }
  return workbook
}

async function addDutyWorksheet(workbook, filters) {
  await duty.ensureSchema()
  const params = { startDate: filters.startDate, endDate: filters.endDate }
  const employeeFilter = selectedSql(filters.employeeIds, 'r.employee_id', params)
  const rows = await query(
    `SELECT r.id, r.duty_date, r.employee_id, p.employee_name, r.duty_type, r.reason, r.units,
            b.supervisor_submitted_at, b.admin_approved_at,
            COALESCE(supervisor.real_name, supervisor.username) AS supervisor_name,
            COALESCE(admin.real_name, admin.username) AS admin_name
     FROM attendance_duty_records r
     JOIN attendance_duty_monthly_batches b ON b.duty_month = r.duty_month AND b.status = 'approved'
     JOIN attendance_employee_profiles p ON p.id = r.employee_id
     LEFT JOIN users supervisor ON supervisor.id = b.supervisor_submitted_by
     LEFT JOIN users admin ON admin.id = b.admin_approved_by
     WHERE r.duty_date >= :startDate AND r.duty_date <= :endDate${employeeFilter}
     ORDER BY r.duty_date, p.employee_name, r.duty_type`,
    params,
  )
  const sheet = workbook.addWorksheet('值班津贴', { views: [{ state: 'frozen', ySplit: 11 }], properties: { tabColor: { argb: REPORT_COLORS.warning } } })
  const generatedAt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replaceAll('/', '-')
  styleTitle(sheet, '工程师值班津贴', filters, generatedAt, 10)
  addMetricStrip(sheet, 7, [
    { label: '值班记录', value: `${rows.length} 次` },
    { label: '涉及员工', value: `${new Set(rows.map((row) => row.employee_id)).size} 人` },
    { label: '7×24 值班', value: `${rows.filter((row) => row.duty_type === 'weekend_on_call').length} 次` },
    { label: '法定节假日值班', value: `${rows.filter((row) => row.duty_type === 'legal_holiday_on_call').length} 次` },
  ], 10)
  addSection(sheet, 10, '01  已终审津贴明细', ['记录编号', '值班日期', '员工', '值班类型', '目的／类别', '事由', '次数', '主管提交', '行政终审', '终审时间'],
    rows.map((row) => [row.id, row.duty_date, row.employee_name, row.duty_type === 'weekend_on_call' ? '7×24 值班' : '法定节假日值班', '加班费', row.reason, Number(row.units), row.supervisor_name || '', row.admin_name || '', mysqlDate(row.admin_approved_at)]),
    [12, 14, 18, 20, 14, 22, 10, 16, 16, 20])
  sheet.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11, column: 10 } }
  sheet.properties.defaultRowHeight = 20
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  sheet.eachRow((row) => row.eachCell((cell) => {
    cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
    if (typeof cell.value === 'number') cell.numFmt = '0.00'
  }))
}

async function exportReport(req, res) {
  await ensureSchema()
  const filters = parseReportFilters(req.query)
  const rows = await loadReportRows(filters)
  const data = buildReportData(filters, rows)
  const workbook = buildWorkbook(data)
  await addDutyWorksheet(workbook, filters)
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `考勤报表-${filters.startDate.replaceAll('-', '')}-${filters.endDate.replaceAll('-', '')}.xlsx`
  res.setHeader('Content-Type', REPORT_CONTENT_TYPE)
  res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${filters.startDate}-${filters.endDate}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.setHeader('Content-Length', buffer.length)
  res.end(Buffer.from(buffer))
}

module.exports = {
  MAX_RANGE_DAYS,
  parseReportFilters,
  clipContinuousHours,
  requestRangeAmount,
  buildReportData,
  buildWorkbook,
  exportReport,
}
