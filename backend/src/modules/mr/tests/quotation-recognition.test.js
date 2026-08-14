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

  // 人工修正回写（corrected）携带的含税成本 cost_incl_tax 应被 merge 直接采用，不再按税率口径二次折算
  const correctedPurchase = mergeQuotations([{
    name: '供应商-修正.xlsx',
    requestedRole: 'purchase',
    documentType: 'purchase_quote',
    sheets: [{ items: [{ item_no: '1', name: 'VMware 服务', description: 'VMware 服务', qty: 1, unit_price: 66371.68, extended: 66371.68, cost_incl_tax: 75000, tax_rate: 13 }] }],
  }], [])
  assert.equal(correctedPurchase.items[0].costInclTax, 75000)

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
      query: async (sql) => {
        if (/FROM mr_orders o/.test(sql)) return [{ id: 32, status: 'draft', created_by: 1, sales_owner_id: 1, pricing_mode: 1 }]
        // 模板学习应用：mock 一份“VM 技术服务”表头模板，unit 列故意指向数量列以验证模板强制生效
        if (/FROM mr_layout_templates/.test(sql)) return [{
          header_signature: '编号|产品|描述|数量|单位|含税单价rmb|含税小计rmb|备注',
          columns_json: JSON.stringify({ item: 2, description: 4, qty: 4, unit: 4, extended: 7 }),
          review_fields_json: JSON.stringify(['unit_price']),
          header_row: 9,
        }]
        // 历史价格校验：mock 上海可明同名品历史成本（中位 70000）
        if (/REPLACE\(LOWER\(name\)/.test(sql)) return [
          { cost_incl_tax: 70000, qty: 1 },
          { cost_incl_tax: 69000, qty: 1 },
          { cost_incl_tax: 71000, qty: 1 },
        ]
        // 旧识别缓存：mock 一份错误结果，验证去缓存后识别不再复用（总是重新识别）
        if (/FROM mr_quote_recognition_cache/.test(sql)) return [{
          result: JSON.stringify({ parsed: { sheets: [{ items: [{ name: '错误缓存品项', qty: 1, unit_price: 1, extended: 1 }] }] } }),
          corrected_result: null,
          corrected_by: null,
          corrected_at: null,
          correction_count: 4,
        }]
        return []
      },
      transaction: async (callback) => callback({ execute: async () => [[{ id: 32, status: 'draft', created_by: 1, sales_owner_id: 1, pricing_mode: 1 }]] }),
    },
  }
  const { importQuotation, normalizeCorrectedItem } = require('../controller')
  // 修正回写归一化：只填“采购成本（含税）”时按税率反推未税单价/小计；缺省字段不得被 Number(null)=0 坑成 0
  const correctedOnlyCost = normalizeCorrectedItem({ rowNo: 1, name: 'VMware 服务', qty: 1, unitPrice: null, costInclTax: 75000, taxRate: 13 })
  assert.deepStrictEqual([correctedOnlyCost.qty, correctedOnlyCost.unit_price, correctedOnlyCost.extended, correctedOnlyCost.cost_incl_tax], [1, 66371.68, 66371.68, 75000])
  const correctedEmpty = normalizeCorrectedItem({ rowNo: 1, name: 'X', qty: null, unitPrice: null, costInclTax: null })
  assert.deepStrictEqual([correctedEmpty.qty, correctedEmpty.unit_price, correctedEmpty.extended], [null, null, null])
  const correctedNormal = normalizeCorrectedItem({ rowNo: 1, name: 'Y', qty: 2, unitPrice: 100, extended: 200, taxRate: 13 })
  assert.deepStrictEqual([correctedNormal.qty, correctedNormal.unit_price, correctedNormal.extended], [2, 100, 200])
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
  // 模板应用集成测试：VM 表头文件命中已学模板（unit 列被模板指到数量列）→ 重解析按模板取数并提示
  const templateBook = XLSX.utils.book_new()
  const templateRows = []
  for (let i = 0; i < 8; i += 1) templateRows.push([''])
  templateRows.push(['编号', '产品', '描述', '数量', '单位', '含税单价(RMB)', '含税小计(RMB)', '备注'])
  templateRows.push([1, 'Vmware技术服务', 'VMWARE软件年度服务', 1, '年', 75000, 75000, '服务周期'])
  XLSX.utils.book_append_sheet(templateBook, XLSX.utils.aoa_to_sheet(templateRows), '报价')
  let templatePayload
  await importQuotation({
    params: { id: '32' },
    user: { id: 1, role: 'admin' },
    body: { sourceRoles: JSON.stringify(['purchase']) },
    files: { files: [upload(XLSX.write(templateBook, { type: 'buffer', bookType: 'xlsx' }), '20251001-VM技术服务-敦阳.xlsx')] },
  }, { json(value) { templatePayload = value } })
  assert(templatePayload.warnings.some((warning) => warning.includes('已应用供应商表头模板')))
  // 模板把 description/qty/unit 列都指向数量列（col 4）→ 描述取自数量列，证明模板列映射覆盖启发式识别
  assert.equal(templatePayload.items[0].description, '1')
  assert.equal(templatePayload.items[0].qty, 1)
  assert.equal(templatePayload.items[0].costInclTax, 75000)
  // 样本反哺：模板 review_fields_json=['unit_price'] → 品项标记 unitPrice 需重点核对 + 警告
  assert(templatePayload.warnings.some((warning) => warning.includes('请重点核对')))
  assert((templatePayload.items[0].reviewFields || []).includes('unitPrice'))
  // 历史价格校验：识别价格 700 vs 历史中位 70000 → 应生成“疑似识别错误”警告；正常价不打扰
  const cheapBook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(cheapBook, XLSX.utils.aoa_to_sheet([
    ['公司名称：上海可明信息科技有限公司'],
    ['Item', 'Description', 'Qty', 'Unit Price', 'Amount'],
    [1, 'VMWARE软件年度服务', 1, 700, 700],
  ]), '报价')
  let cheapPayload
  await importQuotation({
    params: { id: '32' },
    user: { id: 1, role: 'admin' },
    body: { sourceRoles: JSON.stringify(['purchase']) },
    files: { files: [upload(XLSX.write(cheapBook, { type: 'buffer', bookType: 'xlsx' }), '异常价报价.xlsx')] },
  }, { json(value) { cheapPayload = value } })
  assert(cheapPayload.warnings.some((warning) => warning.includes('疑似识别错误')))
  // 正常价格（模板测试文件 costInclTax=75000 ≈ 历史 70000）不生成异常警告
  assert(!templatePayload.warnings.some((warning) => warning.includes('疑似识别错误')))
  // persist 无文件回写：确认导入补漏校对（仅留存文件）不应报“请选择报价单或订单文件”
  let persistPayload
  await importQuotation({
    params: { id: '32' },
    user: { id: 1, role: 'admin' },
    body: { persist: '1', persistOnly: '1', correctedItems: JSON.stringify([]), sourceHashes: JSON.stringify({}) },
    files: { files: [] },
  }, { json(value) { persistPayload = value } })
  assert.equal(persistPayload.corrections.applied, 0)
  assert(Array.isArray(persistPayload.files))
  // 去缓存：mock 存在旧识别缓存（错误结果）时，importQuotation 仍走新识别（不复用缓存、无“已复用”警告）
  let freshPayload
  await importQuotation({
    params: { id: '32' },
    user: { id: 1, role: 'admin' },
    body: { sourceRoles: JSON.stringify(['purchase']) },
    files: { files: [upload(XLSX.write(templateBook, { type: 'buffer', bookType: 'xlsx' }), '20250922-VM技术服务-敦阳.xlsx')] },
  }, { json(value) { freshPayload = value } })
  assert(freshPayload.items.length > 0)
  // 缓存中的错误品项（name='错误缓存品项'）不得出现在新识别结果中
  assert(!freshPayload.items.some((item) => String(item.name || '').includes('错误缓存品项')))
  assert(!freshPayload.warnings.some((warning) => warning.includes('已复用该文件的历史识别结果')))
  assert(!freshPayload.warnings.some((warning) => warning.includes('已应用上次人工修正结果')))
  console.log('quotation recognition tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
