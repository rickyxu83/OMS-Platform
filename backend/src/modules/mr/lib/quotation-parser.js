/**
 * Quotation (.xlsx) parser — Node port of quotation_parser.py.
 * Converts a vendor/customer quotation workbook into structured item rows.
 * Field rules (from a real TongYang quotation sample):
 * - Customer block: label in col A, value in col B (TO/ATTN/TEL/FAX)
 * - Seller block:   label in col E, value in col F (FROM/E-Mail/TEL/FAX/行動)
 * - TEL/FAX labels appear in BOTH blocks; take the right block.
 * - Item table header: Item / Part_no / Description / Qty / Unit Net Price / Extended Net price
 * - An item is "priced" when the Unit Net Price col has a number.
 * - Merged range on price col = package price (group total).
 * - Tax: notes band may state a rate (default / scan for '%' / explicit).
 */
const XLSX = require('xlsx')

const CUSTOMER_LABELS = ['TO:', 'TO：', 'ATTN:', 'ATTN：', 'TEL:', 'TEL：']
const SELLER_KEYS = [
  ['from', ['FROM:', 'FROM：']],
  ['email', ['E-Mail:', 'E-Mail：']],
  ['tel', ['TEL:', 'TEL：']],
  ['fax', ['FAX:', 'FAX：']],
]

function cellText(v) {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).trim()
}

function toFloat(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v instanceof Date) return null
  const s = cellText(v).replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Read values honoring merged ranges: a covered cell returns its top-left value. */
function makeReader(ws) {
  const mergedOwner = new Map() // "r,c" -> {r, c}
  const merges = ws['!merges'] || []
  for (const m of merges) {
    for (let r = m.s.r; r <= m.e.r; r += 1) {
      for (let c = m.s.c; c <= m.e.c; c += 1) {
        mergedOwner.set(`${r},${c}`, { r: m.s.r, c: m.s.c })
      }
    }
  }
  function raw(r, c) {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })
    const cell = ws[addr]
    return cell ? cell.v : undefined
  }
  return {
    value(r, c) {
      const owner = mergedOwner.get(`${r - 1},${c - 1}`) || { r: r - 1, c: c - 1 }
      const addr = XLSX.utils.encode_cell(owner)
      const cell = ws[addr]
      return cell ? cell.v : undefined
    },
    text(r, c) {
      return cellText(this.value(r, c))
    },
    price(r, c) {
      return toFloat(this.value(r, c))
    },
  }
}

function findLabelRow(reader, maxRow, label, col) {
  const target = String(label).trim()
  for (let r = 1; r <= maxRow; r += 1) {
    if (reader.text(r, col) === target) return r
  }
  return -1
}

function findHeaderRow(ws) {
  const range = ws['!ref']
  if (!range) return -1
  const maxRow = XLSX.utils.decode_range(range).e.r + 1
  for (let r = 1; r <= maxRow; r += 1) {
    const addrA = XLSX.utils.encode_cell({ r: r - 1, c: 0 })
    const a = ws[addrA] ? cellText(ws[addrA].v) : ''
    if (a !== 'Item') continue
    const addrB = XLSX.utils.encode_cell({ r: r - 1, c: 1 })
    const b = ws[addrB] ? cellText(ws[addrB].v) : ''
    if (b === 'Part_no' || b.includes('Part_no')) return r
  }
  return -1
}

/** Parse one worksheet into a sheet dict. Returns null if not a quotation sheet. */
function parseSheet(ws) {
  const headerRow = findHeaderRow(ws)
  if (headerRow < 0) return null
  const reader = makeReader(ws)
  const range = ws['!ref']
  const maxRow = range ? XLSX.utils.decode_range(range).e.r + 1 : 0

  function labelValue(labels, colL, colV) {
    for (const lab of labels) {
      const r = findLabelRow(reader, headerRow - 1, lab, colL)
      if (r >= 0) return reader.text(r, colV)
    }
    return ''
  }

  const customer = labelValue(CUSTOMER_LABELS, 1, 2)
  const attn = labelValue(['ATTN:', 'ATTN：'], 1, 2)

  const seller = { from: '', email: '', tel: '', fax: '', mobile: '' }
  for (const [key, labels] of SELLER_KEYS) {
    for (const lab of labels) {
      const r = findLabelRow(reader, headerRow - 1, lab, 5)
      if (r >= 0) {
        seller[key] = reader.text(r, 6)
        break
      }
    }
  }
  let r = findLabelRow(reader, headerRow - 1, '行動：', 5)
  seller.mobile = r >= 0 ? reader.text(r, 6) : ''
  for (const lab of ['手機：', '手机：']) {
    r = findLabelRow(reader, headerRow - 1, lab, 5)
    if (r >= 0) {
      seller.mobile = reader.text(r, 6)
      break
    }
  }
  if (!seller.email) {
    for (let rr = 1; rr < headerRow; rr += 1) {
      const t = reader.text(rr, 5)
      if (t.includes('E-Mail') || t.toLowerCase().includes('email')) {
        seller.email = reader.text(rr, 6)
        if (rr > 1) seller.from = reader.text(rr - 1, 6)
        break
      }
    }
  }

  const items = []
  let lastPriced = headerRow
  for (let rr = headerRow + 1; rr <= maxRow; rr += 1) {
    // RAW unit-price cell (not merged-aware): rows inside a vertical merged
    // range (pack BOM) have a blank E, so the package group counts once at
    // its top-left row. 'priced line' == E holds a number.
    const price = toFloat(rawCell(ws, rr, 5))
    if (price === null) continue
    lastPriced = rr
    const qty = toFloat(rawCell(ws, rr, 4)) ?? 1
    const pn = cellText(rawCell(ws, rr, 2))
    const desc = cellText(rawCell(ws, rr, 3))
    const ext = toFloat(rawCell(ws, rr, 6))
    const itemNo = cellText(rawCell(ws, rr, 1))
    items.push({
      item_no: itemNo,
      part_no: pn,
      description: desc,
      qty,
      unit_price: price,
      extended: ext !== null ? ext : price,
    })
  }

  // notes band below the item table (col B holds the note text):
  // 付款方式 / 含税% / 到货期. Notes start after the last priced row.
  let payment = ''
  let delivery = ''
  let taxRate = null
  for (let rr = lastPriced + 1; rr <= maxRow; rr += 1) {
    const text = cellText(rawCell(ws, rr, 2))
    if (!text) continue
    if (!payment && (text.includes('付款') || text.includes('帳期') || text.includes('账期'))) payment = text
    if (!delivery && (text.includes('到貨') || text.includes('到货') || text.includes('交期'))) delivery = text
    if (taxRate === null) {
      const idx = text.indexOf('%')
      if (idx >= 0) {
        let j = idx - 1
        while (j >= 0 && /[\d. $＄]/.test(text[j])) j -= 1
        const n = Number(text.slice(j + 1, idx))
        if (Number.isFinite(n)) taxRate = n
      }
    }
  }

  return {
    title: ws['!name'] || 'Sheet',
    customer,
    attn,
    seller,
    payment,
    delivery,
    tax_rate: taxRate,
    items,
    header_row: headerRow,
  }
}

function rawCell(ws, r, c) {
  const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })
  const cell = ws[addr]
  return cell ? cell.v : undefined
}

/** Parse every quotation sheet in the workbook buffer. */
function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const out = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    ws['!name'] = name
    const d = parseSheet(ws)
    if (d) out.push(d)
  }
  return out
}

function sheetTotal(sheetData) {
  return sheetData.items.reduce((sum, i) => sum + (i.extended || 0), 0)
}

module.exports = { parseWorkbook, sheetTotal }
