const assert = require('assert')
const ExcelJS = require('exceljs')
const XLSX = require('xlsx')
const {
  extractWorkbookImages,
  companyCandidates,
  validateParsedQuotation,
  applyQuotationLayoutRule,
  mergeQuotations,
  parsePdfText,
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

  const ruled = applyQuotationLayoutRule({ sheets: [{ title: '报价', vendor: '敦阳宁波有限公司', items: [] }], warnings: [] }, '宽泰报价单.xlsx', 'purchase')
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
  const salesItem = { item_no: '1', part_no: '', name: 'FortiGate 60F 防火墙授权', description: 'FortiGate 60F 防火墙授权', qty: 1, unit_price: 100, extended: 100 }
  const purchaseItem = { item_no: '1', part_no: '', name: 'FortiGate 60F 防火墙授权续保', description: 'FortiGate 60F 防火墙授权续保', qty: 1, unit_price: 60, extended: 60 }
  const merged = mergeQuotations([
    { name: '销售.xlsx', requestedRole: 'sales', documentType: 'sales_quote', sheets: [{ items: [salesItem], total: 100, tax_rate: 13, tax_included: false }] },
    { name: '供应商.xlsx', requestedRole: 'purchase', documentType: 'purchase_quote', sheets: [{ items: [purchaseItem], total: 60, tax_rate: 13, tax_included: true }] },
  ], [])
  assert.equal(merged.items[0].costInclTax, null)
  assert.equal(merged.items[0].matchCandidates.length, 1)
  assert.equal(merged.items[0].matchCandidates[0].costInclTax, 60)
  assert(merged.warnings.some((warning) => warning.includes('未自动采用')))
  console.log('quotation recognition tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
