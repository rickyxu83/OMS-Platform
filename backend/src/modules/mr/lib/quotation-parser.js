/** Parse varied customer/vendor quotation workbooks into a common shape. */
const XLSX = require('xlsx')

function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function toFloat(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = cellText(value).replace(/,/g, '').replace(/￥|¥/g, '')
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function normalizeLabel(value) {
  return cellText(value).toLowerCase().replace(/[\s_：:./()（）'"-]+/g, '')
}

function makeReader(ws) {
  const mergedOwner = new Map()
  for (const merge of ws['!merges'] || []) {
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      for (let col = merge.s.c; col <= merge.e.c; col += 1) mergedOwner.set(`${row},${col}`, { r: merge.s.r, c: merge.s.c })
    }
  }
  function address(row, col) {
    const owner = mergedOwner.get(`${row - 1},${col - 1}`) || { r: row - 1, c: col - 1 }
    return XLSX.utils.encode_cell(owner)
  }
  return {
    value(row, col) {
      const cell = ws[address(row, col)]
      return cell ? cell.v : undefined
    },
    text(row, col) {
      return cellText(this.value(row, col))
    },
    price(row, col) {
      return toFloat(this.value(row, col))
    },
  }
}

function rangeSize(ws) {
  const range = ws['!ref']
  return range ? XLSX.utils.decode_range(range) : { e: { r: 0, c: 0 } }
}

const HEADER_ALIASES = {
  item: ['item', '序号', '编号', '項次', '项次', '項目'],
  part: ['partno', 'partnumber', '产品编码', '产品編碼', '产品编号', '型号', '機型', '机型', '产品型号', '產品編號'],
  description: ['description', 'product', '产品描述', '產品描述', '产品名称', '项目名称及说明', '品名', '描述', '项目', '項目名稱及說明', '產品', '產品名稱'],
  qty: ['qty', "q'ty", 'quantity', '数量', '總數', '总数', '采购量', '採購量', '數量'],
  unit: ['unitnetprice', 'unitprice', 'rmb', '人民币单价', '年单价', 'annual list price', '單價', '单价'],
  extended: ['extendednetprice', 'extendedprice', '金额', '金額', '小计', '小計', '总价', '總價', '人民币合计', '合计', '合計'],
}

function headerMatches(value, aliases) {
  const label = normalizeLabel(value)
  return aliases.some((alias) => label === normalizeLabel(alias) || label.includes(normalizeLabel(alias)))
}

function findHeaderSpec(ws) {
  const range = rangeSize(ws)
  const maxRow = Math.min(range.e.r + 1, 120)
  const maxCol = Math.min(range.e.c + 1, 80)
  let best = null
  for (let row = 1; row <= maxRow; row += 1) {
    const values = Array.from({ length: maxCol }, (_, index) => ws[XLSX.utils.encode_cell({ r: row - 1, c: index })]?.v)
    const labels = values.map(normalizeLabel)
    const configColumn = labels.findIndex((value) => value === normalizeLabel('配置'))
    const nameColumn = labels.findIndex((value) => value === normalizeLabel('名称'))
    if (configColumn >= 0 && nameColumn >= 0 && labels.some((value) => value === normalizeLabel('数量'))) {
      const nextRow = row + 2
      if (nextRow <= maxRow) {
        const nextLabels = Array.from({ length: maxCol }, (_, index) => normalizeLabel(ws[XLSX.utils.encode_cell({ r: nextRow - 1, c: index })]?.v))
        if (nextLabels.includes(normalizeLabel('参数')) || nextLabels.includes(normalizeLabel('总价'))) {
          return { row: nextRow, columns: { group: nameColumn + 1, part: nameColumn + 2, description: configColumn + 1, qty: labels.findIndex((value) => value === normalizeLabel('数量')) + 1, unit: labels.findIndex((value) => value === normalizeLabel('单价')) + 1, extended: labels.findIndex((value) => value === normalizeLabel('小计')) + 1 || labels.findIndex((value) => value === normalizeLabel('总价')) + 1 }, aggregate: true, score: 6 }
        }
      }
    }
    const columns = {}
    for (let col = 1; col <= maxCol; col += 1) {
      const value = ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })]?.v
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (columns[key] === undefined && headerMatches(value, aliases)) columns[key] = col
      }
    }
    const score = ['description', 'qty', 'unit'].filter((key) => columns[key] !== undefined).length + (columns.extended === undefined ? 0 : 1) + (columns.part === undefined ? 0 : 1)
    if (score >= 3 && (!best || score > best.score)) best = { row, columns, score }
  }
  return best
}

function findValue(reader, maxRow, labels, preferredColumns = [1, 2, 4, 5, 6]) {
  for (let row = 1; row <= maxRow; row += 1) {
    for (const col of preferredColumns) {
      const text = reader.text(row, col)
      if (!text) continue
      if (labels.some((label) => normalizeLabel(text).includes(normalizeLabel(label)))) {
        for (const valueCol of preferredColumns) {
          if (valueCol === col) continue
          const value = reader.value(row, valueCol)
          if (cellText(value)) return cellText(value)
        }
      }
    }
  }
  return ''
}

function scanFinancials(reader, maxRow, maxCol) {
  const texts = []
  let taxRate = null
  let taxIncluded = false
  let untaxedTotal = null
  let discountedTotal = null
  let total = null
  for (let row = 1; row <= maxRow; row += 1) {
    const rowValues = []
    for (let col = 1; col <= maxCol; col += 1) {
      const value = reader.value(row, col)
      const text = cellText(value)
      if (text) rowValues.push({ col, value, text })
    }
    const rowText = rowValues.map((item) => item.text).join(' | ')
    if (!rowText) continue
    texts.push(rowText)
    if (/(含税|含稅|含\s*\d+%\s*(?:服务|服務)?发票|含\s*\d+%\s*(?:服務)?發票|with\s*\d*%?\s*vat|vat\d+)/i.test(rowText)) taxIncluded = true
    const taxContext = /(税|稅|vat|发票|發票)/i.test(rowText)
    const percent = taxContext ? rowText.match(/(\d+(?:\.\d+)?)\s*%/) : null
    const vatSuffix = taxContext ? rowText.match(/vat\s*(\d+(?:\.\d+)?)/i) : null
    const rate = percent?.[1] || vatSuffix?.[1]
    if (rate) taxRate = Number(rate) <= 1 ? Number(rate) * 100 : Number(rate)
    for (let index = 0; index < rowValues.length - 1; index += 1) {
      if (/(税点|稅點)/.test(rowValues[index].text)) {
        const adjacent = toFloat(rowValues[index + 1].value)
        if (adjacent !== null && adjacent > 0 && adjacent <= 1) taxRate = adjacent * 100
      }
    }
    const number = rowValues.map((item) => toFloat(item.value)).filter((value) => value !== null)
    const label = normalizeLabel(rowText)
    const value = number.length ? number[number.length - 1] : null
    if (value !== null && /(未税总计|未稅總計|未税金额|未稅金額|未税合计|未稅合計)/.test(label)) untaxedTotal = value
    if (value !== null && /(优惠总计|優惠總計|优惠含税|優惠含稅|折后含税|折後含稅)/.test(label)) discountedTotal = value
    if (value !== null && /(含税总计|含稅總計|含税金额|含稅金額|totalamount|total)/.test(label)) total = value
  }
  return { notes: texts, taxRate, taxIncluded, untaxedTotal, discountedTotal, total }
}

function descriptionFields(value, fallback = '') {
  const description = cellText(value)
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return { name: lines[0] || fallback, description }
}
function rawValue(ws, row, col) {
  const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })]
  return cell?.v
}
function parseSheet(ws) {
  const header = findHeaderSpec(ws)
  if (!header) return null
  const reader = makeReader(ws)
  const range = rangeSize(ws)
  const maxRow = range.e.r + 1
  const maxCol = range.e.c + 1
  const items = []
  let current = null
  let lastItemRow = header.row
  const addComponent = (item, group, part, description, qty) => {
    const text = [group, part, description].map(cellText).filter(Boolean).join('：')
    if (!text || qty === null) return
    item.components = item.components || []
    item.components.push({ group: cellText(group), part: cellText(part), description: cellText(description), qty })
  }
  const flush = () => {
    if (!current) return
    if (current.components?.length) {
      const componentLines = current.components.map((component) => {
        const label = component.description || component.part || component.group
        return `- ${label} × ${component.qty}`
      })
      current.description = `${current.name || current.description}：\n${componentLines.join('\n')}`
    }
    items.push(current)
    current = null
  }
  for (let row = header.row + 1; row <= maxRow; row += 1) {
    const group = header.columns.group ? reader.text(row, header.columns.group) : ''
    const description = reader.text(row, header.columns.description)
    const part = header.columns.part ? reader.text(row, header.columns.part) : ''
    const qty = toFloat(rawValue(ws, row, header.columns.qty))
    const unitPrice = toFloat(rawValue(ws, row, header.columns.unit))
    const extended = header.columns.extended ? toFloat(rawValue(ws, row, header.columns.extended)) : null
    const rowText = [group, description, part, reader.text(row, header.columns.item)].join(' ')
    if (/(小计|小計|合计|合計|subtotal|total|税金|稅金|優惠|优惠|未税|未稅|含税|含稅)/i.test(rowText) && unitPrice === null) continue
    if (unitPrice !== null && qty !== null && (description || part || group)) {
      flush()
      const aggregateTitle = header.aggregate ? reader.text(header.row - 1, 1) : ''
      const itemName = aggregateTitle || group || part || description
      const fields = descriptionFields(description || part || group, part || group)
      current = {
        item_no: header.columns.item ? reader.text(row, header.columns.item) : String(items.length + 1),
        part_no: header.aggregate ? group || part : part || group,
        name: itemName,
        description: fields.description || fields.name,
        qty,
        unit_price: unitPrice,
        extended: extended === null ? unitPrice * qty : extended,
        components: [],
      }
      lastItemRow = row
      continue
    }
    if (current && qty !== null && (description || part || group)) {
      addComponent(current, group, part, description, qty)
      lastItemRow = row
    }
  }
  flush()
  const financials = scanFinancials(reader, maxRow, maxCol)
  const beforeText = []
  for (let row = 1; row < header.row; row += 1) {
    for (let col = 1; col <= maxCol; col += 1) {
      const text = reader.text(row, col)
      if (text) beforeText.push(text)
    }
  }
  const allText = [...beforeText, ...financials.notes]
  const vendor = allText.find((value) => {
    const candidate = String(value || '').trim()
    return candidate && /(?:有限公司|有限责任公司|股份有限公司|公司)$/.test(candidate) && !/(客户|供应商|报价单|报价方|敬启者|敬啟者)/.test(candidate)
  }) || ''
  const findLine = (labels) => allText.find((value) => labels.some((label) => {
    const source = normalizeLabel(value)
    const target = normalizeLabel(label)
    return source === target || source.startsWith(target)
  })) || ''
  const valueAfterLabel = (line) => line.replace(/^[^:：]*[:：]\s*/, '').trim()
  const findValue = (labels) => valueAfterLabel(findLine(labels))
  const findCellValue = (labels) => {
    for (let row = 1; row < header.row; row += 1) {
      for (let col = 1; col <= maxCol; col += 1) {
        const cell = reader.text(row, col)
        if (!cell) continue
        const source = normalizeLabel(cell)
        const match = labels.some((label) => source === normalizeLabel(label) || source.startsWith(normalizeLabel(label)))
        if (!match) continue
        const inline = valueAfterLabel(cell)
        if (inline && inline !== cell) return inline
        for (let next = col + 1; next <= maxCol; next += 1) {
          const value = reader.text(row, next)
          if (value) return value
        }
      }
    }
    return ''
  }
  return {
    title: ws['!name'] || 'Sheet',
    customer: findCellValue(['to:', 'to：', '客户名称', '客戶名稱', '購貨單位', '购货单位']) || findValue(['to:', 'to：', '客户名称', '客戶名稱', '購貨單位', '购货单位']),
    attn: findCellValue(['attn:', 'attn：', '联系人', '聯絡人']) || findValue(['attn:', 'attn：', '联系人', '聯絡人']),
    seller: { from: findCellValue(['from:', 'from：', '供应商', '供應商', '供方']) || findValue(['from:', 'from：', '供应商', '供應商', '供方']) },
    vendor,
    payment: findLine(['付款方式', '付款條件', '付款条件', '帳期', '账期']),
    delivery: findLine(['交货期限', '交貨期限', '交期', '到货', '到貨']),
    notes: allText,
    tax_rate: financials.taxRate,
    tax_included: financials.taxIncluded,
    untaxed_total: financials.untaxedTotal,
    discounted_total: financials.discountedTotal,
    total_amount: financials.total,
    items,
    header_row: header.row,
    last_item_row: lastItemRow,
  }
}

function classifyWorkbook(sheets, fileName = '') {
  const text = sheets.flatMap((sheet) => [sheet.customer, sheet.attn, sheet.payment, sheet.delivery, ...(sheet.notes || [])]).join(' ')
  const normalized = `${fileName} ${text}`.toLowerCase()
  if (/(purchase\s*order|订购单|訂購單|po\s*no|采购订单|採購訂單)/i.test(normalized)) return 'customer_order'
  if (sheets.some((sheet) => sheet.customer && !/(dunyang|敦阳|敦陽|stark|敦阳上海|敦陽上海)/i.test(sheet.customer))) return 'sales_quote'
  if (/(购货单位|購貨單位|购买单位|客户名称[：:]敦阳|客戶名稱[：:]敦陽|to:\s*stark|to：stark|to:\s*敦阳|to：敦陽)/i.test(normalized)) return 'purchase_quote'
  if (/(dunyang|敦阳|敦陽)/i.test(fileName)) return 'purchase_quote'
  return 'unknown'
}

function parseWorkbookWithMetadata(buffer, fileName = '') {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheets = []
  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name]
    worksheet['!name'] = name
    const parsed = parseSheet(worksheet)
    if (parsed) sheets.push(parsed)
  }
  if (!sheets.length) return { sheets: [], documentType: 'unknown', warnings: [] }
  return { sheets, documentType: classifyWorkbook(sheets, fileName), warnings: [] }
}

function parseWorkbook(buffer, fileName = '') {
  return parseWorkbookWithMetadata(buffer, fileName).sheets
}

function sheetTotal(sheetData) {
  return sheetData.discounted_total ?? sheetData.total_amount ?? sheetData.untaxed_total ?? sheetData.items.reduce((sum, item) => sum + (item.extended || 0), 0)
}
const { mergeQuotations } = require('./quotation-merge')
module.exports = { parseWorkbook, parseWorkbookWithMetadata, sheetTotal, toFloat, cellText, mergeQuotations }
