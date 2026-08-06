const assert = require('assert')
const XLSX = require('xlsx')
const { parseWorkbook, sheetTotal, mergeQuotations } = require('../quotation-parser')
const { parsePdfText } = require('../lib/quotation-pdf-parser')


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

const unknownTax = mergeQuotations([
  { name: '客户报价.xlsx', sheets: [{ ...parsed[0], total: 200 }] },
  { name: '未标税率厂商.xlsx', sheets: [{ ...parsed[0], total: 100, tax_rate: null, items: [{ ...parsed[0].items[0], unit_price: 50, extended: 100 }] }] },
], [])
assert.equal(unknownTax.items[0].taxRate, 13)
assert(unknownTax.warnings.some((warning) => warning.includes('未识别到明确成本税率')))

const varied = XLSX.utils.aoa_to_sheet([
  ['客户名称：上海禾新医院有限公司'],
  ['项目', '产品编码', '产品描述', '数量', '单价', '金额'],
  ['1', 'WS-C4506-E', '一年保固服务', 2, 11000, 22000],
  ['合计', null, null, null, null, 41500],
  ['含6%服务发票'],
])
const variedBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(variedBook, varied, '报价')
const variedParsed = parseWorkbook(XLSX.write(variedBook, { type: 'buffer', bookType: 'xlsx' }))[0]
assert.equal(variedParsed.customer, '上海禾新医院有限公司')
assert.equal(variedParsed.items[0].part_no, 'WS-C4506-E')
assert.equal(variedParsed.tax_rate, 6)
assert.equal(variedParsed.tax_included, true)
const pdf = parsePdfText('京隆科技(蘇州)有限公司 [机密 Secret]\n订购单号(PO NO.): 40119508\n税率(Tax): VAT13\n付款方式(Payment): 月结90天(月底)\n交货地点(Ship To): 苏州市吴中区星通街13号\n项次 料号 品名规格 单位 交货日 单价 数量 金额 1 接入层交换机 SET 2026/07/31 12,600 5 63,000\n未税金额(Amount): RMB 63,000\n含税金额(Total): RMB 71,190')
assert.equal(pdf.documentType, 'customer_order')
assert.equal(pdf.sheets[0].po_no, '40119508')
assert.equal(pdf.sheets[0].untaxed_total, 63000)
assert.equal(pdf.sheets[0].items.length, 1)
const missingCost = mergeQuotations([{ name: '客户报价.xlsx', documentType: 'sales_quote', sheets: [{ ...parsed[0], total: 200 }] }], [])
assert.equal(missingCost.items[0].unitPrice, null)
assert(missingCost.warnings.some((warning) => warning.includes('缺少成本')))
