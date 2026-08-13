const assert = require('assert')
const ExcelJS = require('exceljs')
const XLSX = require('xlsx')
const PDFDocument = require('pdfkit')
const {
  extractWorkbookImages,
  companyCandidates,
  validateParsedQuotation,
  applyQuotationLayoutRule,
  mergeQuotations,
  parsePdfText,
  parsePdf,
} = require('../quotation-parser')

async function main() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('报价')
  const validPng = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=', 'base64'), Buffer.alloc(600)])
  sheet.addImage(workbook.addImage({ buffer: validPng, extension: 'png' }), 'A1:B2')
  const workbookImages = await extractWorkbookImages(await workbook.xlsx.writeBuffer(), '.xlsx')
  assert.equal(workbookImages.length, 1)

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(600, 1),
    Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  ])
  const drawingRecord = Buffer.alloc(4 + png.length)
  drawingRecord.writeUInt16LE(0x00eb, 0)
  drawingRecord.writeUInt16LE(png.length, 2)
  png.copy(drawingRecord, 4)
  const cfb = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(cfb, 'Workbook', drawingRecord)
  const xlsBuffer = Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer' }))
  assert.equal((await extractWorkbookImages(xlsBuffer, '.xls')).length, 1)
  assert.deepStrictEqual(companyCandidates('敦阳（宁波）有限公司\n上 海 宽 泰 信 息 科 技 有 限 公 司'), ['上海宽泰信息科技有限公司'])

  const validated = validateParsedQuotation({ sheets: [{ title: 'OCR', untaxed_total: 100, items: [{ description: '设备', qty: 2, unit_price: 30, extended: 100, confidence: { description: 90, qty: 90, unitPrice: 65, extended: 90 } }] }], warnings: [] }, 'ocr_layout')
  assert.deepStrictEqual(validated.sheets[0].items[0].review_fields, ['extended', 'unitPrice'])
  assert(validated.sheets[0].items[0].validation_messages[0].includes('数量 × 单价'))

  const ruled = await applyQuotationLayoutRule({ sheets: [{ title: '报价', vendor: '敦阳宁波有限公司', items: [] }], warnings: [] }, '宽泰报价单.xlsx', 'purchase')
  assert.equal(ruled.sheets[0].vendor, '上海宽泰信息科技有限公司')

  const coordinatePdf = parsePdfText('Qty Unit Price Amount\nFN-TRAN-SFP+SR 4 442 1,770 500 2,000\nC9500-24Y4C-E 1 54,867 62,000 62,000', { pages: [{ page: 1, width: 2481, height: 3508, lines: [
    { top: 100, text: 'Qty Unit Price Amount', words: [{ text: 'Qty', left: 1430, width: 34, confidence: 95 }, { text: 'Price', left: 1600, width: 80, confidence: 95 }, { text: 'Amount', left: 1810, width: 90, confidence: 95 }] },
    { top: 160, text: 'FN-TRAN-SFP+SR 4 442 1,770 500 2,000', words: [{ text: 'FN-TRAN-SFP+SR', left: 500, width: 200, confidence: 94 }, { text: '4', left: 1480, width: 10, confidence: 93 }, { text: '442', left: 1760, width: 40, confidence: 92 }, { text: '1,770', left: 1980, width: 60, confidence: 91 }, { text: '500', left: 2100, width: 40, confidence: 90 }, { text: '2,000', left: 2200, width: 60, confidence: 89 }] },
    { top: 220, text: 'C9500-24Y4C-E 1 54,867 62,000 62,000', words: [{ text: 'C9500-24Y4C-E', left: 500, width: 180, confidence: 94 }, { text: '1', left: 1480, width: 10, confidence: 93 }, { text: '54,867', left: 1730, width: 70, confidence: 92 }, { text: '62,000', left: 2070, width: 70, confidence: 90 }, { text: '62,000', left: 2190, width: 70, confidence: 89 }] },
  ] }] })
  assert.equal(coordinatePdf.sheets[0].items.length, 2)
  assert.deepStrictEqual([coordinatePdf.sheets[0].items[0].qty, coordinatePdf.sheets[0].items[0].unit_price, coordinatePdf.sheets[0].items[0].extended], [4, 442, 1770])
  assert.deepStrictEqual([coordinatePdf.sheets[0].items[1].qty, coordinatePdf.sheets[0].items[1].unit_price, coordinatePdf.sheets[0].items[1].extended], [1, 54867, 54867])
  assert(coordinatePdf.sheets[0].items[1].review_fields.includes('extended'))
  const nativePdfDocument = new PDFDocument({ size: [600, 400], margin: 0 })
  const nativePdfChunks = []
  nativePdfDocument.on('data', (chunk) => nativePdfChunks.push(chunk))
  const nativePdfDone = new Promise((resolve) => nativePdfDocument.on('end', resolve))
  for (const [text, left] of [['Part_no', 50], ['Description', 130], ['Qty', 330], ['Unit Price', 390], ['Amount', 480]]) nativePdfDocument.text(text, left, 50, { lineBreak: false })
  for (const [text, left] of [['FG-100', 50], ['Firewall appliance', 130], ['2', 340], ['1,200', 400], ['2,400', 490]]) nativePdfDocument.text(text, left, 80, { lineBreak: false })
  nativePdfDocument.end()
  await nativePdfDone
  const nativePdf = await parsePdf(Buffer.concat(nativePdfChunks))
  assert.equal(nativePdf.recognitionMethod, 'pdf_layout')
  assert.deepStrictEqual([nativePdf.sheets[0].items[0].part_no, nativePdf.sheets[0].items[0].qty, nativePdf.sheets[0].items[0].unit_price, nativePdf.sheets[0].items[0].extended], ['FG-100', 2, 1200, 2400])
  const salesItem = { item_no: '1', part_no: '', name: 'FortiGate 60F 防火墙授权', description: 'FortiGate 60F 防火墙授权', qty: 1, unit_price: 100, extended: 100 }
  const purchaseItem = { item_no: '1', part_no: '', name: 'FortiGate 60F 防火墙授权续保', description: 'FortiGate 60F 防火墙授权续保', qty: 1, unit_price: 60, extended: 60 }
  const merged = mergeQuotations([
    { name: '销售.xlsx', requestedRole: 'sales', documentType: 'sales_quote', sheets: [{ items: [salesItem], total: 100, tax_rate: 13, tax_included: false }] },
    { name: '供应商.xlsx', requestedRole: 'purchase', documentType: 'purchase_quote', sheets: [{ items: [purchaseItem], total: 60, tax_rate: null, tax_included: true }] },
  ], [])
  assert.equal(merged.items[0].costInclTax, null)
  assert.equal(merged.items[0].matchCandidates.length, 1)
  assert.equal(merged.items[0].matchCandidates[0].costInclTax, 60)
  assert(merged.warnings.some((warning) => warning.includes('未自动采用')))

  const batchSalesBook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(batchSalesBook, XLSX.utils.aoa_to_sheet([
    ['Item', 'Part_no', 'Description', 'Qty', 'Unit Net Price', 'Extended Net price'],
    ['1', '日志管理系统', 'NP-CLD-RECEIVER-CN N-Receiver platform', 2, 130000, 260000],
    ['人民币未税总计', null, null, null, null, 260000],
    ['(13%)增值税', null, null, null, null, 33800],
    ['人民币含税总计', null, null, null, null, 293800],
  ]), '销售报价')
  const invalidPurchaseBook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(invalidPurchaseBook, XLSX.utils.aoa_to_sheet([['这不是报价明细']]), 'Sheet1')
  const dbPath = require.resolve('../../../config/db')
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async (sql) => /FROM mr_orders o/.test(sql) ? [{ id: 32, status: 'draft', created_by: 1, sales_owner_id: 1, pricing_mode: 1 }] : [],
      transaction: async (callback) => callback({ execute: async () => [[]] }),
    },
  }
  const { importQuotation } = require('../controller')
  const upload = (buffer, name) => ({ buffer, originalname: Buffer.from(name, 'utf8').toString('latin1'), size: buffer.length })
  const request = {
    params: { id: '32' },
    user: { id: 1, role: 'admin' },
    body: { sourceRoles: JSON.stringify(['sales', 'purchase']) },
    files: { files: [
      upload(XLSX.write(batchSalesBook, { type: 'buffer', bookType: 'xlsx' }), '销售报价.xlsx'),
      upload(XLSX.write(invalidPurchaseBook, { type: 'buffer', bookType: 'xlsx' }), '无法识别.xlsx'),
    ] },
  }
  let importPayload
  await importQuotation(request, { json(value) { importPayload = value } })
  assert.equal(importPayload.items.length, 1)
  assert.equal(importPayload.items[0].quotedUnitPrice * importPayload.items[0].qty, 260000)
  assert.equal(importPayload.sources[1].itemCount, 0)
  assert.equal(importPayload.sources[1].taxIncluded, null)
  assert(importPayload.warnings.some((warning) => warning.includes('无法识别.xlsx') && warning.includes('已保留其他来源')))
  console.log('quotation recognition tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
