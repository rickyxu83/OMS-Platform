const ExcelJS = require('exceljs')
const XLSX = require('xlsx')

const MAX_DATA_ROWS = 1000
const MAX_COLUMNS = 100

class MaintenanceImportError extends Error {}

function cellText(cell) {
  const value = cell?.value
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return String(value.result ?? '').trim()
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim()
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return String(value.text ?? '').trim()
  }
  return String(value).trim()
}

function serialKey(value) {
  return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase()
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validDateParts(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(year)
    || date.getMonth() + 1 !== Number(month)
    || date.getDate() !== Number(day)
  ) return null
  return formatDate(date)
}

function parseDateCell(cell) {
  const value = cell?.value
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'number' && Number.isFinite(value) && value >= 20000 && value <= 80000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000))
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  const text = cellText(cell)
  if (!text) return null
  let matched = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[ T].*)?$/)
  if (!matched) matched = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  return matched ? validDateParts(matched[1], matched[2], matched[3]) : null
}

function columnName(number) {
  let value = number
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function headerText(worksheet, column, firstDataRow) {
  for (let rowNumber = Math.max(1, firstDataRow - 1); rowNumber >= Math.max(1, firstDataRow - 5); rowNumber -= 1) {
    const text = cellText(worksheet.getRow(rowNumber).getCell(column))
    if (text) return text
  }
  return ''
}

function dateHeaderScore(text, kind) {
  const value = String(text || '').replace(/\s+/g, '').toLowerCase()
  const service = /(服务|維保|维保|保修|warranty|service|support|entitlement)/.test(value) ? 1 : 0
  const direction = kind === 'start'
    ? /(开始|開始|起始|生效|start|begin|effective)/.test(value)
    : /(截止|结束|結束|到期|终止|終止|end|expir|until)/.test(value)
  return service * 0.02 + (direction ? 0.03 : 0)
}

function columnOptions(worksheet, firstDataRow) {
  const count = Math.min(worksheet.actualColumnCount || worksheet.columnCount, MAX_COLUMNS)
  return Array.from({ length: count }, (_, index) => {
    const column = index + 1
    const header = headerText(worksheet, column, firstDataRow)
    return {
      index: column,
      letter: columnName(column),
      header,
      label: `${columnName(column)}${header ? ` · ${header}` : ''}`,
    }
  })
}

function normalizeColumn(value) {
  const column = Number(value)
  return Number.isInteger(column) && column > 0 && column <= MAX_COLUMNS ? column : null
}

function collectWorkbookValues(workbook) {
  const values = new Map()
  for (const worksheet of workbook.worksheets) {
    const rowLimit = Math.min(worksheet.rowCount, MAX_DATA_ROWS + 20)
    const columnLimit = Math.min(worksheet.actualColumnCount || worksheet.columnCount, MAX_COLUMNS)
    for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      for (let column = 1; column <= columnLimit; column += 1) {
        const raw = cellText(row.getCell(column))
        const key = serialKey(raw)
        if (key && key.length <= 128 && !values.has(key)) values.set(key, key)
      }
    }
  }
  return [...values.values()]
}

function serialCandidates(workbook, devicesBySerial) {
  const candidates = []
  for (const worksheet of workbook.worksheets) {
    const rowLimit = Math.min(worksheet.rowCount, MAX_DATA_ROWS + 20)
    const columnLimit = Math.min(worksheet.actualColumnCount || worksheet.columnCount, MAX_COLUMNS)
    for (let column = 1; column <= columnLimit; column += 1) {
      const matchedRows = []
      let nonEmpty = 0
      for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber += 1) {
        const text = cellText(worksheet.getRow(rowNumber).getCell(column))
        if (!text) continue
        nonEmpty += 1
        if (devicesBySerial.has(serialKey(text))) matchedRows.push(rowNumber)
      }
      if (matchedRows.length) {
        candidates.push({
          worksheet,
          column,
          matchedRows,
          matches: matchedRows.length,
          ratio: matchedRows.length / Math.max(nonEmpty, 1),
        })
      }
    }
  }
  return candidates.sort((left, right) => right.matches - left.matches || right.ratio - left.ratio)
}

function chooseSerialCandidate(candidates, requestedColumn) {
  if (requestedColumn) {
    const selected = candidates.find((candidate) => candidate.column === requestedColumn)
    if (!selected) throw new MaintenanceImportError('所选序列号列没有匹配到系统设备')
    return { selected, ambiguous: false }
  }
  const selected = candidates[0]
  if (!selected) throw new MaintenanceImportError('未找到能与系统设备匹配的序列号列')
  const second = candidates.find((candidate) => candidate.worksheet === selected.worksheet && candidate.column !== selected.column)
  const ambiguous = Boolean(second && second.matches >= selected.matches * 0.8 && Math.abs(second.ratio - selected.ratio) < 0.2)
  return { selected, ambiguous }
}

function dateCandidates(serialCandidate) {
  const { worksheet, matchedRows } = serialCandidate
  const firstDataRow = Math.min(...matchedRows)
  return columnOptions(worksheet, firstDataRow)
    .filter((column) => column.index !== serialCandidate.column)
    .map((column) => {
      const dates = new Map()
      let nonEmpty = 0
      for (const rowNumber of matchedRows) {
        const cell = worksheet.getRow(rowNumber).getCell(column.index)
        if (cellText(cell)) nonEmpty += 1
        const date = parseDateCell(cell)
        if (date) dates.set(rowNumber, date)
      }
      return { ...column, dates, nonEmpty, parseRatio: dates.size / Math.max(nonEmpty, 1) }
    })
    .filter((column) => column.dates.size > 0 && column.parseRatio >= 0.6)
}

function scoreDatePairs(columns, matchedRowCount) {
  const pairs = []
  for (const start of columns) {
    for (const end of columns) {
      if (start.index === end.index) continue
      let complete = 0
      let ordered = 0
      for (const [rowNumber, startDate] of start.dates) {
        const endDate = end.dates.get(rowNumber)
        if (!endDate) continue
        complete += 1
        if (startDate <= endDate) ordered += 1
      }
      if (!complete) continue
      const coverage = complete / Math.max(matchedRowCount, 1)
      const orderRatio = ordered / complete
      const score = coverage * 0.55 + orderRatio * 0.4
        + dateHeaderScore(start.header, 'start') + dateHeaderScore(end.header, 'end')
      pairs.push({ start, end, complete, coverage, orderRatio, score })
    }
  }
  return pairs.sort((left, right) => right.score - left.score || right.complete - left.complete)
}

function chooseDatePair(columns, matchedRowCount, requestedStart, requestedEnd) {
  const pairs = scoreDatePairs(columns, matchedRowCount)
  if (requestedStart || requestedEnd) {
    if (!requestedStart || !requestedEnd || requestedStart === requestedEnd) {
      throw new MaintenanceImportError('请选择不同的服务开始列和服务截止列')
    }
    const selected = pairs.find((pair) => pair.start.index === requestedStart && pair.end.index === requestedEnd)
    if (!selected) throw new MaintenanceImportError('所选日期列没有足够的有效日期，或日期前后关系不成立')
    return { selected, ambiguous: false }
  }
  const selected = pairs[0]
  if (!selected || selected.orderRatio < 0.9 || selected.coverage < 0.5) {
    throw new MaintenanceImportError('无法可靠识别服务开始和截止日期列，请手动选择')
  }
  const second = pairs.find((pair) => pair.start.index !== selected.start.index || pair.end.index !== selected.end.index)
  const ambiguous = Boolean(second && second.score >= selected.score - 0.08)
  return { selected, ambiguous }
}

function resultStatus(device, startDate, endDate, duplicate) {
  if (duplicate) return { status: 'duplicate', message: '文件内序列号重复' }
  if (!startDate || !endDate) return { status: 'invalid', message: '服务开始或截止日期为空/无法识别' }
  if (startDate > endDate) return { status: 'invalid', message: '服务开始日期晚于截止日期' }
  if (['our_maintenance', 'none'].includes(device.maintenanceType)) {
    return { status: 'conflict', message: device.maintenanceType === 'our_maintenance' ? '当前为我方维保，已保护不覆盖' : '当前明确为无维保，已保护不覆盖' }
  }
  if (device.maintenanceType === 'original_manufacturer' && device.maintenanceStart === startDate && device.maintenanceEnd === endDate) {
    return { status: 'unchanged', message: '维保日期与系统一致' }
  }
  return { status: 'updatable', message: '可更新' }
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
    return workbook
  } catch {
    // ExcelJS does not support the legacy BIFF .xls format; use SheetJS as its adapter.
  }

  try {
    const legacyWorkbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellText: false,
      sheetRows: MAX_DATA_ROWS + 20,
    })
    for (const sheetName of legacyWorkbook.SheetNames) {
      const source = legacyWorkbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(source, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      })
      const worksheet = workbook.addWorksheet(String(sheetName || 'Sheet').slice(0, 31))
      rows.slice(0, MAX_DATA_ROWS + 20).forEach((values, rowIndex) => {
        values.slice(0, MAX_COLUMNS).forEach((value, columnIndex) => {
          if (value !== null && value !== undefined) worksheet.getRow(rowIndex + 1).getCell(columnIndex + 1).value = value
        })
      })
    }
    if (!workbook.worksheets.length) throw new Error('workbook has no worksheets')
    return workbook
  } catch {
    throw new MaintenanceImportError('导入文件无法解析，请确认是有效的 .xls 或 .xlsx 文件')
  }
}

async function analyzeMaintenanceWorkbook(buffer, options = {}) {
  const workbook = await loadWorkbook(buffer)
  if (!workbook.worksheets.length) throw new MaintenanceImportError('导入文件没有工作表')
  const allValues = collectWorkbookValues(workbook)
  const devices = await options.loadDevicesBySerials(allValues)
  const devicesBySerial = new Map(devices.map((device) => [serialKey(device.serialNo), device]))
  const requestedSerial = normalizeColumn(options.columns?.serialNo)
  const requestedStart = normalizeColumn(options.columns?.maintenanceStart)
  const requestedEnd = normalizeColumn(options.columns?.maintenanceEnd)
  const serialChoice = chooseSerialCandidate(serialCandidates(workbook, devicesBySerial), requestedSerial)
  const serial = serialChoice.selected
  if (serial.matchedRows.length > MAX_DATA_ROWS) throw new MaintenanceImportError(`一次最多处理 ${MAX_DATA_ROWS} 行设备`)
  const dates = dateCandidates(serial)
  const dateChoice = chooseDatePair(dates, serial.matchedRows.length, requestedStart, requestedEnd)
  const pair = dateChoice.selected
  const worksheet = serial.worksheet
  const firstDataRow = Math.min(...serial.matchedRows)
  const optionsForColumns = columnOptions(worksheet, firstDataRow)
  const serialCounts = new Map()
  for (const rowNumber of serial.matchedRows) {
    const key = serialKey(cellText(worksheet.getRow(rowNumber).getCell(serial.column)))
    serialCounts.set(key, (serialCounts.get(key) || 0) + 1)
  }
  const items = serial.matchedRows.map((rowNumber) => {
    const sn = cellText(worksheet.getRow(rowNumber).getCell(serial.column))
    const device = devicesBySerial.get(serialKey(sn))
    const maintenanceStart = pair.start.dates.get(rowNumber) || null
    const maintenanceEnd = pair.end.dates.get(rowNumber) || null
    const outcome = resultStatus(device, maintenanceStart, maintenanceEnd, serialCounts.get(serialKey(sn)) > 1)
    return {
      rowNumber,
      deviceId: device.id,
      serialNo: device.serialNo || sn,
      customerName: device.customerName || '',
      model: device.model || '',
      currentMaintenanceType: device.maintenanceType,
      currentMaintenanceStart: device.maintenanceStart,
      currentMaintenanceEnd: device.maintenanceEnd,
      maintenanceStart,
      maintenanceEnd,
      ...outcome,
    }
  })
  const matchedKeys = new Set(serial.matchedRows.map((rowNumber) => serialKey(cellText(worksheet.getRow(rowNumber).getCell(serial.column)))))
  const nonMatched = []
  const rowLimit = Math.min(worksheet.rowCount, MAX_DATA_ROWS + 20)
  for (let rowNumber = firstDataRow; rowNumber <= rowLimit; rowNumber += 1) {
    const sn = cellText(worksheet.getRow(rowNumber).getCell(serial.column))
    if (!sn || matchedKeys.has(serialKey(sn))) continue
    const startDate = parseDateCell(worksheet.getRow(rowNumber).getCell(pair.start.index))
    const endDate = parseDateCell(worksheet.getRow(rowNumber).getCell(pair.end.index))
    if (startDate || endDate) nonMatched.push({ rowNumber, serialNo: sn, status: 'not_found', message: '系统中未找到该序列号' })
  }
  items.push(...nonMatched)
  items.sort((left, right) => left.rowNumber - right.rowNumber)
  const count = (status) => items.filter((item) => item.status === status).length
  return {
    sheetName: worksheet.name,
    columns: {
      serialNo: serial.column,
      maintenanceStart: pair.start.index,
      maintenanceEnd: pair.end.index,
    },
    detected: {
      serialNoMatches: serial.matches,
      serialNoRatio: serial.ratio,
      dateCompleteRows: pair.complete,
      dateCoverage: pair.coverage,
      dateOrderRatio: pair.orderRatio,
    },
    columnOptions: optionsForColumns,
    requiresColumnConfirmation: serialChoice.ambiguous || dateChoice.ambiguous,
    summary: {
      total: items.length,
      updatable: count('updatable'),
      unchanged: count('unchanged'),
      notFound: count('not_found'),
      conflicts: count('conflict'),
      invalid: count('invalid') + count('duplicate'),
    },
    items,
  }
}

function selectMaintenanceUpdates(items, selectedDeviceIds) {
  const updatable = items.filter((item) => item.status === 'updatable')
  if (selectedDeviceIds === undefined) return updatable
  if (!Array.isArray(selectedDeviceIds) || !selectedDeviceIds.length) {
    throw new MaintenanceImportError('请至少选择一台要更新的设备')
  }
  const selected = new Set(selectedDeviceIds.map((id) => String(id)))
  const available = new Set(updatable.map((item) => String(item.deviceId)))
  if ([...selected].some((id) => !available.has(id))) {
    throw new MaintenanceImportError('所选设备已不在当前可更新范围，请重新预览')
  }
  return updatable.filter((item) => selected.has(String(item.deviceId)))
}

module.exports = {
  MaintenanceImportError,
  analyzeMaintenanceWorkbook,
  parseDateCell,
  selectMaintenanceUpdates,
  serialKey,
}
