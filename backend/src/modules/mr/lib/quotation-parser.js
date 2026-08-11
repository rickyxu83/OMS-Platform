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
  item: ['item', 'no', '序号', '编号', '項次', '项次', '項目', '项目'],
  part: ['partno', 'partnumber', '产品编码', '产品編碼', '产品编号', '型号', '機型', '机型', '产品型号', '產品編號'],
  description: ['description', 'product', '产品描述', '產品描述', '产品名称', '项目名称及说明', '品名', '描述', '項目名稱及說明', '產品', '產品名稱'],
  qty: ['qty', "q'ty", 'quantity', '数量', '總數', '总数', '采购量', '採購量', '數量'],
  unit: ['unitnetprice', 'unitprice', 'unitsellingprice', 'rmb', '人民币单价', '年单价', 'annual list price', '單價', '单价', '售价', '售價'],
  extended: ['extendednetprice', 'extendedprice', 'totalsellingprice', '金额', '金額', '小计', '小計', '总价', '總價', '人民币合计', '合计', '合計'],
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
    const all = {}
    const productColumn = labels.findIndex((value) => value === normalizeLabel('product'))
    const descriptionColumn = labels.findIndex((value) => value === normalizeLabel('description'))
    if (productColumn >= 0 && descriptionColumn >= 0) {
      columns.part = productColumn + 1
      columns.description = descriptionColumn + 1
      all.part = [productColumn + 1]
      all.description = [descriptionColumn + 1]
    }
    for (let col = 1; col <= maxCol; col += 1) {
      const value = ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })]?.v
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (headerMatches(value, aliases)) {
          if (columns[key] === undefined) columns[key] = col
          // 同一字段可能有多个别名列（如 MR 单“采购量”与“Q'ty”并存），全部记录，取数时逐列回退
          ;(all[key] = all[key] || []).push(col)
        }
      }
    }
    const score = ['description', 'qty', 'unit'].filter((key) => columns[key] !== undefined).length + (columns.extended === undefined ? 0 : 1) + (columns.part === undefined ? 0 : 1)
    if (score >= 3 && (!best || score > best.score)) best = { row, columns, all, score }
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

function scanFinancials(reader, maxRow, maxCol, referenceSum = 0) {
  const texts = []
  let taxRate = null
  let taxIncluded = false
  const untaxedCandidates = []
  const discountedCandidates = []
  const totalCandidates = []
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
    if (/(含税|含稅|含\s*\d+%\s*(?:服务|服務)?发票|含\s*\d+%\s*(?:服務)?發票|with\s*\d*%?\s*vat|includ\w*\s+\d*%?\s*vat|vat\d+)/i.test(rowText)) taxIncluded = true
    const taxContext = /(税|稅|vat|发票|發票)/i.test(rowText)
    const percent = taxContext ? rowText.match(/(\d+(?:\.\d+)?)\s*%/) : null
    const vatSuffix = taxContext ? rowText.match(/vat\s*(\d+(?:\.\d+)?)/i) : null
    const rate = percent?.[1] || vatSuffix?.[1]
    if (rate) {
      const parsedRate = Number(rate) <= 1 ? Number(rate) * 100 : Number(rate)
      if ([6, 13].includes(parsedRate)) taxRate = parsedRate
    }
    for (let index = 0; index < rowValues.length - 1; index += 1) {
      if (/(税点|稅點)/.test(rowValues[index].text)) {
        const adjacent = toFloat(rowValues[index + 1].value)
        if (adjacent !== null && adjacent > 0 && adjacent <= 1) taxRate = adjacent * 100
      }
    }
    // 收集标签右侧所有数值，稍后按“与品项合计最接近”定夺（避开同行税率/毛利率/公式等干扰数）
    const numbersAfter = (labelPattern) => {
      const labelIndex = rowValues.findIndex((item) => labelPattern.test(normalizeLabel(item.text)))
      const candidates = labelIndex >= 0 ? rowValues.slice(labelIndex + 1) : rowValues
      return candidates.map((item) => toFloat(item.value)).filter((num) => num !== null)
    }
    const label = normalizeLabel(rowText)
    if (/(未税总计|未稅總計|未税金额|未稅金額|未税合计|未稅合計|合計未稅|合计未税|税前|稅前)/.test(label)) untaxedCandidates.push(...numbersAfter(/(未税总计|未稅總計|未税金额|未稅金額|未税合计|未稅合計|合計未稅|合计未税|税前|稅前)/))
    if (/(优惠总[计計]|優惠[总總][计計]|优惠含[税稅]|優惠含[税稅]|折[后後]含[税稅])/.test(label)) discountedCandidates.push(...numbersAfter(/(优惠总[计計]|優惠[总總][计計]|优惠含[税稅]|優惠含[税稅]|折[后後]含[税稅])/))
    if (/(含税总计|含稅總計|含税金额|含稅金額|含税总价|含稅總價|合计含税|合計含稅|totalamount|total)/.test(label)) totalCandidates.push(...numbersAfter(/(含税总计|含稅總計|含税金额|含稅金額|含税总价|含稅總價|合计含税|合計含稅|totalamount|total)/))
  }
  const pick = (candidates) => {
    if (!candidates.length) return null
    if (referenceSum > 0) {
      return [...candidates].sort((left, right) => Math.abs(Math.abs(left) - referenceSum) - Math.abs(Math.abs(right) - referenceSum))[0]
    }
    return candidates[0]
  }
  const untaxedTotal = pick(untaxedCandidates)
  const discountedTotal = pick(discountedCandidates)
  const total = pick(totalCandidates)
  return { notes: texts, taxRate, taxIncluded, untaxedTotal, discountedTotal, total }
}

function looksLikePartNumber(value) {
  const token = cellText(value).replace(/[,:;，；]+$/, '')
  const hyphens = (token.match(/-/g) || []).length
  return /^[A-Z0-9][A-Z0-9+._/-]*$/i.test(token) && hyphens >= 1 && (hyphens >= 2 || /\d/.test(token))
}
function partNumberFromDescription(value) {
  const token = cellText(value).split(/\s+/)[0]?.replace(/[,:;，；]+$/, '') || ''
  return looksLikePartNumber(token) ? token : ''
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
    // 汇总标签行（如“数量：”“总价：”“合计：”）不是组件，避免覆盖真正的产品描述
    if (/^(数量|總數|总数|总价|總價|合计|合計|小计|小計|金额|金額|单价|單價|备注|備註|税率|稅率|税|稅|单位|單位)[：:]?$/i.test(cellText(description).replace(/\s+/g, ''))) return
    item.components = item.components || []
    item.components.push({ group: cellText(group), part: cellText(part), description: cellText(description), qty })
  }
  const flush = () => {
    if (!current) return
    if (current.components?.length) {
      // 组件数量保留在结构化 components 字段；描述用纯文本拼装（不引入 Markdown 记号，预览/PDF/Excel 都直接可读）
      const componentLines = current.components.map((component) => {
        const label = component.description || component.part || component.group
        return `${label}`
      })
      current.description = `${current.name || current.description}：${componentLines.join('；')}`
    }
    items.push(current)
    current = null
  }
  const pickCols = (key) => (header.all?.[key]?.length ? header.all[key] : [header.columns[key]].filter(Boolean))
  const firstText = (row, key) => {
    for (const col of pickCols(key)) {
      const text = reader.text(row, col)
      if (text) return text
    }
    return ''
  }
  const firstNumber = (row, key) => {
    for (const col of pickCols(key)) {
      const num = toFloat(rawValue(ws, row, col))
      if (num !== null) return num
    }
    return null
  }
  for (let row = header.row + 1; row <= maxRow; row += 1) {
    const group = header.columns.group ? reader.text(row, header.columns.group) : ''
    const description = firstText(row, 'description')
    const part = firstText(row, 'part')
    let qty = firstNumber(row, 'qty')
    const unitPrice = firstNumber(row, 'unit')
    const extended = header.columns.extended ? firstNumber(row, 'extended') : null
    if (qty === null && unitPrice !== null) {
      // 版式错位容错：数量列被“套/台”等单位文本占用、数量值错到邻列时，在数量列左右一格内找能通过 数量×单价≈小计 验证的数字
      const probe = [...new Set(pickCols('qty').flatMap((col) => [col - 1, col, col + 1]).filter((col) => col >= 1))]
      for (const col of probe) {
        const candidate = toFloat(rawValue(ws, row, col))
        if (candidate === null || candidate <= 0) continue
        if (extended !== null && Math.abs(candidate * unitPrice - extended) > Math.max(1, Math.abs(extended) * 0.01)) continue
        qty = candidate
        break
      }
    }
    const rowText = [group, description, part, reader.text(row, header.columns.item)].join(' ')
    if (/(小计|小計|合计|合計|总价|總價|subtotal|total|税金|稅金|優惠|优惠|未税|未稅|含税|含稅)/i.test(rowText) && unitPrice === null) continue
    // 描述/料号本身就是汇总标签（“合计：”等，含合并单元格扩散）的行不是品项——错位探测可能为它凑出单价，须先拦下
    const rowLabel = (description || part || group).replace(/\s+/g, '')
    if (/^(小计|小計|合计|合計|总价|總價|未税|未稅|含税|含稅|税金|稅金|税额|稅額|优惠|優惠|折扣|人民币|人民幣)\s*[:：]?$/.test(rowLabel)) continue
    if (unitPrice !== null && qty !== null && (description || part || group)) {
      flush()
      const aggregateTitle = header.aggregate ? reader.text(header.row - 1, 1) : ''
      const listedPart = header.aggregate ? group || part : part || group
      const inferredPart = header.aggregate ? '' : partNumberFromDescription(description)
      const resolvedPart = looksLikePartNumber(listedPart) ? listedPart : inferredPart || listedPart
      const fields = descriptionFields(description || part || group, part || group)
      const itemName = aggregateTitle || inferredPart || (looksLikePartNumber(listedPart) ? listedPart : fields.name)
      current = {
        item_no: header.columns.item ? reader.text(row, header.columns.item) : String(items.length + 1),
        part_no: resolvedPart,
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
  const itemSum = items.reduce((sum, item) => sum + (item.extended ?? (item.unit_price || 0) * (item.qty || 1)), 0)
  const financials = scanFinancials(reader, maxRow, maxCol, itemSum)
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
    if (target === 'to') return source === target || /^\s*to\s*[:：]/i.test(String(value))
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
  if (/(purchase\s*order|订购单|訂購單|po\s*no|采购订单|採購訂單)/i.test(normalized)) return 'sales_quote'
  if (sheets.some((sheet) => sheet.customer && !/(dunyang|敦阳|敦陽|stark|敦阳上海|敦陽上海)/i.test(sheet.customer))) return 'sales_quote'
  if (/(购货单位|購貨單位|购买单位|客户名称[：:]敦阳|客戶名稱[：:]敦陽|to:\s*stark|to：stark|to:\s*敦阳|to：敦陽)/i.test(normalized)) return 'purchase_quote'
  if (/(stark|dunyang|敦阳|敦陽)/i.test(fileName)) return 'purchase_quote'
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
