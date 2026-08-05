const assert = require('assert')
const XLSX = require('xlsx')
const { parseWorkbook, sheetTotal, mergeQuotations } = require('../quotation-parser')

const rows = [
  ['TO:', '测试客户', null, null, 'FROM:', 'Annie Pan'],
  ['ATTN:', '测试联系人', null, null, 'E-Mail:', 'annie@example.com'],
  ['Item', 'Part_no', 'Description', 'Qty', 'Unit Net Price', 'Extended Net price'],
  ['1', 'P-1', '设备包', 2, 100, 200],
  ['', 'P-1-A', '包内明细', 1, null, null],
  ['', '付款方式：月結30天，含13%稅', null, null, null, null],
  ['', '交期：两周', null, null, null, null],
]
const sheet = XLSX.utils.aoa_to_sheet(rows)
sheet['!merges'] = [{ s: { r: 3, c: 4 }, e: { r: 4, c: 4 } }]
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, sheet, '报价')
const parsed = parseWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

assert.equal(parsed.length, 1)
assert.equal(parsed[0].customer, '测试客户')
assert.equal(parsed[0].attn, '测试联系人')
assert.equal(parsed[0].seller.from, 'Annie Pan')
assert.equal(parsed[0].tax_rate, 13)
assert.equal(parsed[0].items.length, 1)
assert.equal(parsed[0].items[0].part_no, 'P-1')
assert.equal(sheetTotal(parsed[0]), 200)

const merged = mergeQuotations([
  { name: '客户报价.xlsx', sheets: [{ ...parsed[0], total: 200 }] },
  { name: '厂商A.xlsx', sheets: [{ ...parsed[0], total: 120, tax_rate: 13, items: [{ ...parsed[0].items[0], unit_price: 60, extended: 120 }] }] },
  { name: '厂商B.xlsx', sheets: [{ ...parsed[0], total: 100, tax_rate: 13, items: [{ ...parsed[0].items[0], unit_price: 50, extended: 100 }] }] },
], [{ name: '厂商B', officialWebsite: '' }])
assert.equal(merged.salesSourceIndex, 0)
assert.deepStrictEqual(merged.sources.map((source) => source.role), ['sales', 'purchase', 'purchase'])
assert.equal(merged.items[0].unitPrice, 100)
assert.equal(merged.items[0].costInclTax, 113)
assert.equal(merged.items[0].vendor, '厂商B')
assert.equal(merged.items[0].costSource, '厂商B.xlsx')

console.log('mr quotation parser and merge OK')
