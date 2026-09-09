/**
 * 配置组收敛识别（实验引擎 v2 专用，Issue #86 / spec 008）。
 *
 * 目标场景：HPE 整机 CTO 捆绑报价单——多个配置组，BOM 明细行无单价（或部分有价），
 * 价格只挂在「配置组小计 + 总计」汇总行上。典型结构（列：序号|产品编码|描述|数量|单价|总价）：
 *
 *   序号 | 产品编码                  | 描述 | 数量 | 单价 | 总价
 *   1    | 5154393398-01+DL380 #1    |      |      |      |      ← 配置组头（序号=整数，描述为空）
 *   1_1  | SDD                       |      |      |      |      ← 子组标签（序号=x_y 形式）
 *        | P52534-B21                | HPE DL380 Gen11 8SFF NC CTO Svr | 1 |  |  ← BOM 明细行
 *        | P67093-B21#0D1            | Factory integrated | 2 |  |
 *        | 配置组小计                 |      |      | 159000 |   ← 组级单套价格
 *        | 总计                      |      | 2套  | 318000 |   ← 组级总价（含套数）
 *
 * 收敛规则：
 *   - 每个配置组 → 1 个整机品项：part_no=组头产品编码，name=首个含 CTO/服务器 关键词的 BOM 描述，
 *     qty=总计行套数（默认 1），unit_price=配置组小计，extended=总计金额（缺省=小计×qty）
 *   - BOM 明细入 components[]（保留组/料号/描述/数量/单价/小计），
 *     description 同步拍平为「子组标签；料号 描述；料号 描述；…」（与人工修正口径一致）
 *   - 税率/总价口径文件未标注 → sheet 级税字段一律留空，由人工核对（不编造）
 *
 * 触发门控（不满足即返回 null，调用方回退常规解析路径）：
 *   1. 表内存在「配置组小计/配置組小計」汇总行
 *   2. 至少识别出 1 个配置组头 + 2 行以上 BOM 明细（排除误命中单行小表）
 */
const XLSX = require('xlsx')

const SUBTOTAL_LABEL = /^配置[组組]小计$/
const TOTAL_LABEL = /^总[计計]$/
const HEADER_LABELS = /^(序号|序號|产品编码|產品編碼|品号|品號|描述|品名|数量|數量|单价|單價|总价|總價|金额|金額|备注|備註)$/

function cellText(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[,￥¥\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

/** 合并单元格取值展开：被合并区域的所有格子取锚点值。 */
function makeGrid(ws) {
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  if (!range) return null
  const owner = new Map()
  for (const merge of ws['!merges'] || []) {
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) owner.set(`${r},${c}`, { r: merge.s.r, c: merge.s.c })
    }
  }
  const maxRow = Math.min(range.e.r, 400)
  const maxCol = Math.min(range.e.c, 30)
  const rows = []
  for (let r = 0; r <= maxRow; r += 1) {
    const cells = []
    for (let c = 0; c <= maxCol; c += 1) {
      const anchor = owner.get(`${r},${c}`) || { r, c }
      const cell = ws[XLSX.utils.encode_cell(anchor)]
      cells.push(cell ? cell.v : null)
    }
    rows.push(cells)
  }
  return rows
}

/** 从一行里取前几个非空单元格文本（配置组报表的列位置不完全固定，按非空格序取）。 */
function rowCells(row) {
  return row.map(cellText).filter(Boolean)
}

/** 配置组头：首个非空格为纯整数序号，第二格为产品编码（含 - 或 + 或 # 的编码样式），无描述。 */
function isGroupHeader(cells) {
  if (cells.length < 2 || cells.length > 3) return false
  if (!/^\d{1,2}$/.test(cells[0])) return false
  const code = cells[1]
  if (code.length < 6) return false
  // 编码样式：含 - 或 + 的字母数字组合（如 5154393398-01+DL380 Gen11 #1）；版本号 V1.0_3 之类不算
  return /[a-z0-9][-+#]/i.test(code) && !/^v\d/i.test(code)
}

/** 子组标签：序号形如 1_1 / 1-1，第二格为标签文本。 */
function isSubgroup(cells) {
  return cells.length >= 2 && /^\d{1,2}[_-]\d{1,2}$/.test(cells[0])
}

/** 组级汇总行：某格为「配置组小计」或「总计」，行内含金额；返回 { label, qty, amount }。 */
function summaryRow(cells, rawRow) {
  const labelIndex = cells.findIndex((text) => SUBTOTAL_LABEL.test(text) || TOTAL_LABEL.test(text))
  if (labelIndex < 0) return null
  const label = cells[labelIndex]
  // 金额：标签之后的第一个数字（原始行取值，避开文本格）
  const rawTexts = rawRow.map((v) => ({ text: cellText(v), num: toNumber(v) }))
  const afterLabel = rawTexts.filter(({ text }, index) => {
    if (!text) return false
    const labelAt = rawTexts.findIndex((c) => c.text === label)
    return index > labelAt
  })
  const qtyCell = afterLabel.find(({ text, num }) => num === null && /^\d+\s*(套|台|套裝|set)/i.test(text))
  const amounts = afterLabel.filter(({ num }) => num !== null && num > 0).map(({ num }) => num)
  let qty = 1
  if (qtyCell) {
    const match = qtyCell.text.match(/(\d+)/)
    if (match) qty = Number(match[1]) || 1
  }
  return { label, qty, amount: amounts.length ? amounts[amounts.length - 1] : null }
}

/** BOM 明细行：首格为料号样式，第二格为描述；数量在后续格。 */
function bomRow(cells, rawRow) {
  if (cells.length < 2) return null
  const part = cells[0]
  // 料号样式：字母数字加 -/# 组合（P52534-B21、P67093-B21#0D1、BD505A、512485-B21）
  if (!/^[A-Za-z0-9][A-Za-z0-9-]+(?:#[A-Za-z0-9]+)?$/.test(part)) return null
  if (part.length < 5) return null
  const description = cells[1]
  if (HEADER_LABELS.test(description)) return null
  const numbers = rawRow.map(toNumber).filter((v) => v !== null)
  const qty = numbers.length ? numbers[0] : 1
  const unitPrice = numbers.length >= 2 ? numbers[1] : null
  const extended = numbers.length >= 3 ? numbers[numbers.length - 1] : (unitPrice !== null ? unitPrice * qty : null)
  return { part, description, qty, unit_price: unitPrice, extended }
}

/** 拍平 BOM 为人工口径描述：子组标签；料号 描述；料号 描述；… */
function flattenComponents(components) {
  const lines = []
  let lastGroup = ''
  for (const component of components) {
    if (component.group && component.group !== lastGroup) {
      lines.push(component.group)
      lastGroup = component.group
    }
    lines.push(`${component.part} ${component.description}`.trim())
  }
  return lines.join('; ')
}

/** 整机品名：优先首个含 CTO/服务器/Svr 关键词的 BOM 描述，其次首条 BOM 描述。 */
function machineName(components, fallback) {
  const cto = components.find((component) => /CTO|Svr|服务器|伺服器|主機|主机/i.test(component.description))
  return (cto || components[0])?.description || fallback || ''
}

function collapseSheet(sheetName, rows) {
  const groups = []
  let current = null
  let subgroup = ''
  for (const rawRow of rows) {
    const cells = rowCells(rawRow)
    if (!cells.length) continue
    // 表头行：跳过（配置组 2 开始处会重复出现表头）
    if (cells.length >= 3 && cells.every((text) => HEADER_LABELS.test(text))) continue
    const summary = summaryRow(cells, rawRow)
    if (summary && SUBTOTAL_LABEL.test(summary.label)) {
      if (current) current.subtotal = summary.amount
      continue
    }
    if (summary && TOTAL_LABEL.test(summary.label)) {
      if (current) {
        current.total = summary.amount
        current.qty = summary.qty > 1 ? summary.qty : current.qty
        groups.push(current)
        current = null
        subgroup = ''
      }
      continue
    }
    if (isGroupHeader(cells)) {
      // 组头出现即开新组（上一个组没有总计行时在此收尾）
      if (current && current.components.length) groups.push(current)
      current = { code: cells[1], qty: 1, subtotal: null, total: null, components: [] }
      subgroup = ''
      continue
    }
    if (isSubgroup(cells)) {
      subgroup = cells[1]
      continue
    }
    if (!current) continue
    const bom = bomRow(cells, rawRow)
    if (bom) current.components.push({ group: subgroup, ...bom })
  }
  if (current && current.components.length) groups.push(current)
  // 门控：至少 1 个组 + 全表合计 2 行以上 BOM
  const bomCount = groups.reduce((sum, group) => sum + group.components.length, 0)
  if (!groups.length || bomCount < 2) return null
  const items = groups.map((group, index) => {
    const unitPrice = group.subtotal
    const qty = group.qty || 1
    const extended = group.total ?? (unitPrice !== null ? unitPrice * qty : null)
    return {
      item_no: String(index + 1),
      part_no: group.code,
      entityKey: '',
      name: machineName(group.components, group.code),
      description: flattenComponents(group.components),
      qty,
      unit_price: unitPrice ?? 0,
      extended: extended ?? (unitPrice ?? 0) * qty,
      components: group.components.map((component) => ({
        group: component.group,
        part: component.part,
        description: component.description,
        qty: component.qty,
        unit_price: component.unit_price,
        extended: component.extended,
      })),
    }
  })
  return {
    title: sheetName,
    customer: '',
    attn: '',
    seller: { from: '' },
    vendor: '',
    payment: '',
    delivery: '',
    notes: [],
    tax_rate: null,
    tax_included: false,
    untaxed_total: null,
    discounted_total: null,
    total_amount: null,
    items,
    // 模板学习元数据留空：配置组结构与常规模板不兼容，不参与模板匹配
    header_signature: '',
    columns_json: '{}',
  }
}

/**
 * 尝试把整本工作簿按配置组结构收敛。门控不命中返回 null（调用方走常规解析）。
 * @param {Buffer} buffer Excel 文件内容
 * @returns {{sheets: object[], documentType: string, recognitionMethod: string, warnings: string[]} | null}
 */
function collapseConfigGroups(buffer) {
  let workbook = null
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  } catch (_error) {
    return null
  }
  const sheets = []
  let sawSubtotal = false
  for (const sheetName of workbook.SheetNames) {
    const rows = makeGrid(workbook.Sheets[sheetName])
    if (!rows) continue
    if (!sawSubtotal) {
      sawSubtotal = rows.some((row) => rowCells(row).some((text) => SUBTOTAL_LABEL.test(text)))
    }
    const collapsed = collapseSheet(sheetName, rows)
    if (collapsed) sheets.push(collapsed)
  }
  // 门控 1：表内必须存在「配置组小计」汇总行（否则只是普通无单价清单，不接管）
  if (!sawSubtotal || !sheets.length) return null
  const itemCount = sheets.reduce((sum, sheet) => sum + sheet.items.length, 0)
  const bomCount = sheets.reduce((sum, sheet) => sum + sheet.items.reduce((inner, item) => inner + item.components.length, 0), 0)
  return {
    sheets,
    documentType: 'unknown',
    recognitionMethod: 'excel_config_group_v2',
    warnings: [
      `⚡ 实验引擎 v2：识别到 ${itemCount} 个配置组，已收敛为 ${itemCount} 个整机品项（单套 BOM 共 ${bomCount} 个料号，明细已写入品项描述）`,
      '配置组报价单未标注税率与总价口径：总计/税率请人工确认后填写',
    ],
  }
}

module.exports = { collapseConfigGroups }
