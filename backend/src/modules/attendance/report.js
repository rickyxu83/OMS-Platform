const ExcelJS = require('exceljs')
const { query } = require('../../config/db')
const { badRequest } = require('../../utils/http-error')
const { calculateWorkingLeaveRange } = require('./workflow')
const { ensureSchema } = require('./controller')

const WORK_HOURS_PER_DAY = 8
const MAX_RANGE_DAYS = 366
const DAY_MS = 86400000
const REPORT_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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
              r.start_at, r.end_at, r.hours, r.source_type, r.source_id, r.source_detail,
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
    ...employee, annualDays: 0, sickHours: 0, personalHours: 0, marriageHours: 0, bereavementHours: 0, compTimeHours: 0, totalHours: 0,
  }]))
  const overtimeSummary = new Map(employees.map((employee) => [employee.id, {
    ...employee, totalHours: 0, compTimeHours: 0, payHours: 0, legalHolidayPayHours: 0, weightedPayHours: 0,
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
        approvedAt: finalApprovedAt(row), source: sourceReference(row),
      })
      continue
    }
    if (!['leave', 'comp_time'].includes(row.request_type)) continue
    const summary = leaveSummary.get(employeeId)
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
    const events = balanceEvents.get(employee.id).sort((a, b) => a.sortAt.localeCompare(b.sortAt) || a.reference.localeCompare(b.reference))
    for (const event of events) {
      balances[event.balanceType] = round((balances[event.balanceType] || 0) + event.delta)
      balanceDetails.push({
        employeeId: employee.id, employeeName: employee.name, status: employee.status, businessDate: event.businessDate,
        balanceType: BALANCE_LABELS[event.balanceType] || event.balanceType, delta: event.delta,
        balanceAfter: balances[event.balanceType], sourceType: event.sourceType, reference: event.reference,
      })
    }
    balanceSummary.push({
      ...employee, endDate: filters.endDate, annualDays: round(balances.annual_leave),
      annualHours: round(balances.annual_leave * WORK_HOURS_PER_DAY), compTimeHours: round(balances.comp_time),
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

function styleTitle(sheet, title, filters, generatedAt) {
  sheet.mergeCells('A1:L1')
  sheet.getCell('A1').value = title
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  sheet.getCell('A2').value = '统计范围'
  sheet.getCell('B2').value = `${filters.startDate} 至 ${filters.endDate}（含首尾日期）`
  sheet.getCell('A3').value = '生成时间'
  sheet.getCell('B3').value = generatedAt
  sheet.getCell('A4').value = '统计口径'
  sheet.getCell('B4').value = '仅统计已通过申请；余额按业务发生日期计算；不包含申请原因、证明附件及敏感备注。'
  for (const row of [2, 3, 4]) sheet.getCell(`A${row}`).font = { bold: true }
}

function addSection(sheet, startRow, title, headers, rows, widths) {
  sheet.getCell(`A${startRow}`).value = title
  sheet.getCell(`A${startRow}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const headerRow = sheet.getRow(startRow + 1)
  headerRow.values = headers
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6A91' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  const dataRows = rows.length ? rows : [headers.map((_, index) => index === 0 ? '暂无数据' : '')]
  for (const values of dataRows) sheet.addRow(values)
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

  const leave = workbook.addWorksheet('请假统计', { views: [{ state: 'frozen', ySplit: 6 }] })
  styleTitle(leave, '请假统计', data.filters, generatedAt)
  let next = addSection(leave, 6, '员工汇总', ['员工', '状态', '特休（天）', '病假（小时）', '事假（小时）', '婚假（小时）', '丧假（小时）', '调休（小时）', '请假总时数'],
    data.leaveSummary.map((row) => [row.name, row.status, row.annualDays, row.sickHours, row.personalHours, row.marriageHours, row.bereavementHours, row.compTimeHours, row.totalHours]),
    [18, 10, 12, 13, 13, 13, 13, 13, 14])
  next += 1
  addSection(leave, next, '申请明细', ['员工', '状态', '申请编号', '假别', '开始时间', '结束时间', '区间内时长（小时）', '特休折算（天）', '最终审批时间'],
    data.leaveDetails.map((row) => [row.employeeName, row.status, row.requestId, row.leaveType, row.startAt, row.endAt, row.hours, row.annualDays, row.approvedAt]),
    [18, 10, 12, 12, 20, 20, 18, 16, 20])

  const overtime = workbook.addWorksheet('加班统计', { views: [{ state: 'frozen', ySplit: 6 }] })
  styleTitle(overtime, '加班统计', data.filters, generatedAt)
  next = addSection(overtime, 6, '员工汇总', ['员工', '状态', '加班总时数', '转调休时数', '加班费时数', '法定节假日加班费时数', '加班费折算时数'],
    data.overtimeSummary.map((row) => [row.name, row.status, row.totalHours, row.compTimeHours, row.payHours, row.legalHolidayPayHours, row.weightedPayHours]),
    [18, 10, 14, 14, 14, 22, 18])
  next += 1
  addSection(overtime, next, '申请明细', ['员工', '状态', '申请编号', '加班类型', '开始时间', '结束时间', '区间内时长', '处理方式', '日期类型', '倍率', '折算时数', '最终审批时间', '来源工单'],
    data.overtimeDetails.map((row) => [row.employeeName, row.status, row.requestId, row.kind, row.startAt, row.endAt, row.hours, row.result, row.dayType, row.multiplier, row.weightedHours, row.approvedAt, row.source]),
    [18, 10, 12, 14, 20, 20, 14, 12, 14, 10, 12, 20, 20])

  const balance = workbook.addWorksheet('假期余额', { views: [{ state: 'frozen', ySplit: 6 }] })
  styleTitle(balance, '假期余额', data.filters, generatedAt)
  next = addSection(balance, 6, '期末余额汇总', ['员工', '状态', '截止日期', '特休余额（天）', '特休余额（小时）', '调休余额（小时）'],
    data.balanceSummary.map((row) => [row.name, row.status, row.endDate, row.annualDays, row.annualHours, row.compTimeHours]),
    [18, 10, 14, 16, 18, 18])
  next += 1
  addSection(balance, next, '余额变动明细', ['员工', '状态', '业务日期', '余额类型', '变动量', '变动后余额', '来源类型', '来源编号'],
    data.balanceDetails.map((row) => [row.employeeName, row.status, row.businessDate, row.balanceType, row.delta, row.balanceAfter, row.sourceType, row.reference]),
    [18, 10, 14, 12, 12, 14, 16, 16])

  for (const sheet of workbook.worksheets) {
    sheet.properties.defaultRowHeight = 20
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9E2EC' } }, bottom: { style: 'thin', color: { argb: 'FFD9E2EC' } },
          left: { style: 'thin', color: { argb: 'FFD9E2EC' } }, right: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        }
        if (typeof cell.value === 'number') cell.numFmt = '0.00'
      })
    })
    sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: Math.max(1, sheet.columnCount) } }
  }
  return workbook
}

async function exportReport(req, res) {
  await ensureSchema()
  const filters = parseReportFilters(req.query)
  const rows = await loadReportRows(filters)
  const data = buildReportData(filters, rows)
  const workbook = buildWorkbook(data)
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
