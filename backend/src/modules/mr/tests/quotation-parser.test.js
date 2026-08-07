const assert = require('assert')
const XLSX = require('xlsx')
const { parseWorkbook, parseWorkbookWithMetadata, sheetTotal, mergeQuotations, parsePdfText } = require('../quotation-parser')


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
const workbookBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
const parsed = parseWorkbook(workbookBuffer)
assert.equal(parseWorkbookWithMetadata(workbookBuffer, '客户PO.xlsx').documentType, 'sales_quote')
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
assert.equal(merged.items[0].costInclTax, 100)
assert.equal(merged.items[0].vendor, '厂商B')
assert.equal(merged.items[0].costSource, '厂商B.xlsx')

const unknownTax = mergeQuotations([
  { name: '客户报价.xlsx', sheets: [{ ...parsed[0], total: 200 }] },
  { name: '未标税率厂商.xlsx', sheets: [{ ...parsed[0], total: 100, tax_rate: null, items: [{ ...parsed[0].items[0], unit_price: 50, extended: 100 }] }] },
], [])
assert.equal(unknownTax.items[0].taxRate, 13)
assert(unknownTax.warnings.some((warning) => warning.includes('未识别到明确成本税率')))

const workstationSale = { item_no: '1', part_no: '', description: 'HP Z2工作站', qty: 1, unit_price: 11500, extended: 11500 }
const workstationPurchase = { item_no: '1', part_no: '工作站', name: '工作站', description: 'Z2 SFF G1i U5-235 vPro/32GB/1TB SSD/3年上门', qty: 1, unit_price: 11000, extended: 11000 }
const workstationMerge = mergeQuotations([
  { name: '客户PO.pdf', requestedRole: 'sales', documentType: 'sales_quote', sheets: [{ items: [workstationSale], total: 12995, untaxed_total: 11500, tax_rate: 13, tax_included: true }] },
  { name: '供应商报价.xlsx', requestedRole: 'purchase', documentType: 'purchase_quote', sheets: [{ items: [workstationPurchase], total: 11000, tax_rate: 13, tax_included: true }] },
], [])
assert.equal(workstationMerge.items[0].costInclTax, null)
assert.equal(workstationMerge.items[0].taxRate, 13)
assert.equal(workstationMerge.items[0].matchCandidates.length, 1)
assert.equal(workstationMerge.items[0].matchCandidates[0].costInclTax, 11000)
assert.equal(workstationMerge.sources[0].taxIncluded, true)
assert.equal(workstationMerge.sources[1].taxIncluded, true)
assert(workstationMerge.warnings.some((warning) => warning.includes('未自动采用')))
assert(workstationMerge.warnings.some((warning) => warning.includes('缺少成本')))

const multipleWorkstationQuotes = mergeQuotations([
  { name: '客户PO.pdf', requestedRole: 'sales', sheets: [{ items: [workstationSale], total: 12995, untaxed_total: 11500, tax_rate: 13, tax_included: true }] },
  { name: '供应商甲.xlsx', requestedRole: 'purchase', sheets: [{ items: [workstationPurchase], total: 11000, tax_rate: 13, tax_included: true }] },
  { name: '供应商乙.xlsx', requestedRole: 'purchase', sheets: [{ items: [{ ...workstationPurchase, unit_price: 10500, extended: 10500 }], total: 10500, tax_rate: 13, tax_included: true }] },
], [])
assert.equal(multipleWorkstationQuotes.items[0].costInclTax, null)
assert.equal(multipleWorkstationQuotes.items[0].matchCandidates.length, 2)
assert.equal(multipleWorkstationQuotes.items[0].matchCandidates[0].costInclTax, 10500)
assert.equal(multipleWorkstationQuotes.items[0].matchCandidates[0].costSource, '供应商乙.xlsx')
assert(multipleWorkstationQuotes.warnings.some((warning) => warning.includes('未自动采用')))

const ambiguousWorkstations = mergeQuotations([
  { name: '客户PO.pdf', requestedRole: 'sales', sheets: [{ items: [workstationSale], total: 12995, untaxed_total: 11500, tax_rate: 13, tax_included: true }] },
  { name: '供应商组合报价.xlsx', requestedRole: 'purchase', sheets: [{ items: [workstationPurchase, { ...workstationPurchase, item_no: '2', description: '另一款工作站配置' }], total: 22000, tax_rate: 13, tax_included: true }] },
], [])
assert.equal(ambiguousWorkstations.items[0].costInclTax, null)

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
assert.equal(pdf.documentType, 'sales_quote')
assert.equal(pdf.sheets[0].po_no, '40119508')
assert.equal(pdf.sheets[0].untaxed_total, 63000)
assert.equal(pdf.sheets[0].items.length, 1)
const missingCost = mergeQuotations([{ name: '客户报价.xlsx', documentType: 'sales_quote', sheets: [{ ...parsed[0], total: 200 }] }], [])
assert.equal(missingCost.items[0].unitPrice, null)
const multiplePurchase = mergeQuotations([
  { name: '客户报价.xlsx', documentType: 'sales_quote', sheets: [{ ...parsed[0], total: 200 }] },
  { name: '厂商甲报价.xlsx', documentType: 'unknown', sheets: [{ ...parsed[0], total: 900, items: [{ ...parsed[0].items[0], unit_price: 90, extended: 180 }] }] },
  { name: '厂商乙报价.xlsx', documentType: 'purchase_quote', sheets: [{ ...parsed[0], total: 100, items: [{ ...parsed[0].items[0], unit_price: 50, extended: 100 }] }] },
], [])
assert.deepStrictEqual(multiplePurchase.sources.map((source) => source.role), ['sales', 'purchase', 'purchase'])
assert(multiplePurchase.warnings.some((warning) => warning.includes('其余 1 份未明确来源文件按供应商报价处理')))
const groupedPurchase = mergeQuotations([{ name: '自动误判为PO的供应商报价.xls', documentType: 'customer_order', requestedRole: 'purchase', sheets: [{ ...parsed[0], total: 0, items: [{ ...parsed[0].items[0], unit_price: 25990, extended: 25990 }] }] }], [])
assert.equal(groupedPurchase.sources[0].role, 'purchase')
assert.equal(groupedPurchase.sources[0].total, 25990)
assert.equal(groupedPurchase.salesSourceIndex, -1)
assert.equal(groupedPurchase.items.length, 0)
assert(groupedPurchase.warnings.some((warning) => warning.includes('未导入为 MR 品项')))

const bundledSheet = XLSX.utils.aoa_to_sheet([
  ['上海石洛信息科技有限公司'],
  [],
  [],
  [],
  [],
  [],
  [],
  ['名称', '型号', '配置', '数量', '单价', '小计'],
  ['IBM TS4300 StorageWorks Tape Drivers（光纤）'],
  ['型号', '参数', '', '数量', '单价', '总价'],
  ['TS4300主机', '笼子', 'IBM TS4300 3U Tape Library-Base Unit', 1, 315000, 315000],
  ['', '半高驱动器', 'LTO 8 HH Fibre Channel Drive', 2, null, null],
  ['', '导轨', 'Rack Mount Kit TS4300', 1, null, null],
])
bundledSheet['!merges'] = [{ s: { r: 8, c: 0 }, e: { r: 8, c: 5 } }]
const bundledBook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(bundledBook, bundledSheet, 'SPIL')
const bundledParsed = parseWorkbook(XLSX.write(bundledBook, { type: 'buffer', bookType: 'xlsx' }))[0]
assert.equal(bundledParsed.items.length, 1)
assert.equal(bundledParsed.items[0].name, 'IBM TS4300 StorageWorks Tape Drivers（光纤）')
assert.equal(bundledParsed.items[0].unit_price, 315000)
assert(bundledParsed.items[0].description.includes('LTO 8 HH Fibre Channel Drive'))
assert.equal(bundledParsed.items[0].components.length, 2)
const bundledMerge = mergeQuotations([
  { name: '客户磁带机报价.xlsx', documentType: 'sales_quote', sheets: [{ ...bundledParsed, total: 365000 }] },
  { name: '供应商磁带机报价.xlsx', documentType: 'purchase_quote', sheets: [{ ...bundledParsed, tax_included: false, notes: [] }] },
], [])
assert.equal(bundledMerge.items.length, 1)
assert.equal(bundledMerge.items[0].costInclTax, 315000)
const fortiServiceMerge = mergeQuotations([
  { name: '客户续保报价.xlsx', documentType: 'sales_quote', sheets: [{ ...parsed[0], tax_rate: 6, tax_included: true, items: [{ ...parsed[0].items[0], part_no: 'FC-10-A100F-247-02-12', description: '24x7 FortiCare Contract', name: 'FC-10-A100F-247-02-12', qty: 1, unit_price: 12000, extended: 12000 }], total: 12000 }] },
  { name: '供应商续保报价.xlsx', documentType: 'purchase_quote', sheets: [{ ...parsed[0], items: [{ ...parsed[0].items[0], part_no: 'FC-10-A100F-247-02-DD', description: 'FortiADC-100F 1 Year FortiCare Premium Support', name: 'FC-10-A100F-247-02-DD', qty: 1, unit_price: 8647, extended: 8647 }], total: 8647, tax_rate: 6, tax_included: true }] },
], [])
assert.equal(fortiServiceMerge.items.length, 1)
assert.equal(fortiServiceMerge.items[0].oemSpec, 'FC-10-A100F-247-02-12')
assert.equal(fortiServiceMerge.items[0].costInclTax, 8647)
assert.equal(fortiServiceMerge.items[0].vendor, '')
assert(Math.abs(fortiServiceMerge.items[0].unitPrice - 12000 / 1.06) < 0.000001)
const ocrParsed = parsePdfText(`FortiGate-121G 18 x GE RJ45 ports 1 20,944 20,944 23,667 23,667\nFC-10-F121G-950-02-12 1 11,603 11,603 13,111 13,111\n*FTP Discovery (SFTP Server) : 安全檔案傳輸伺服器軟體授權\n1 10,200 10,200\n總價 USD 10,200`)
assert.equal(ocrParsed.sheets[0].items.length, 3)
assert.equal(ocrParsed.sheets[0].items[0].part_no, 'FortiGate-121G')
assert.equal(ocrParsed.sheets[0].items[2].name, undefined)
assert.equal(ocrParsed.sheets[0].items[2].unit_price, 10200)
const layoutParsed = parsePdfText('品名 数量 单价 金额\nFG-100F 2 21,500 43,000\n未税总计 43,000', { pages: [{ page: 1, width: 1000, height: 1400, lines: [
  { top: 100, left: 20, text: '品名 数量 单价 金额', words: [{ text: '品名', left: 30, width: 80, confidence: 95 }, { text: '数量', left: 500, width: 60, confidence: 96 }, { text: '单价', left: 650, width: 60, confidence: 94 }, { text: '金额', left: 830, width: 60, confidence: 93 }] },
  { top: 150, left: 20, text: 'FG-100F 2 21,500 43,000', words: [{ text: 'FG-100F', left: 30, width: 150, confidence: 91 }, { text: '2', left: 510, width: 20, confidence: 92 }, { text: '21,500', left: 650, width: 90, confidence: 90 }, { text: '43,000', left: 830, width: 90, confidence: 89 }] },
  { top: 220, left: 20, text: '未税总计 43,000', words: [{ text: '未税总计', left: 650, width: 100, confidence: 94 }, { text: '43,000', left: 830, width: 90, confidence: 95 }] },
] }] })
assert.equal(layoutParsed.sheets[0].items.length, 1)
assert.equal(layoutParsed.sheets[0].items[0].description, 'FG-100F')
assert.equal(layoutParsed.sheets[0].items[0].qty, 2)
assert.equal(layoutParsed.sheets[0].items[0].unit_price, 21500)
assert.equal(layoutParsed.sheets[0].items[0].extended, 43000)
assert.equal(layoutParsed.sheets[0].items[0].confidence.overall, 89)
assert.deepStrictEqual(layoutParsed.sheets[0].items[0].review_fields, [])
assert.equal(ocrParsed.sheets[0].tax_included, false)
console.log('quotation parser OCR loose-row tests passed')
