const assert = require('assert')
process.env.JWT_SECRET = 'test-secret'
process.env.AI_QUOTE_RECOGNITION_ENABLED = 'true'
process.env.AI_API_URL = 'https://example.invalid/v1/chat/completions'
process.env.AI_API_KEY = 'test-key'
process.env.AI_MODEL = 'test-model'
const XLSX = require('xlsx')
const { normalizeAiResult, extractJson, workbookText, recognizeQuotationWithAi, applyAiEntityKeys, stripPriceFieldClauses } = require('../lib/quotation-ai-parser')

const sampleAi = {
  documentType: 'purchase_quote',
  customer: '敦阳（宁波）科技有限公司',
  vendor: '上海灵沛信息科技有限公司',
  attn: 'Jack',
  payment: '月结30天',
  delivery: '订货周期为7个工作日',
  taxRate: null,
  taxIncluded: true,
  untaxedTotal: null,
  totalAmount: 2827,
  items: [
    { itemNo: 1, partNo: '1米', name: '6类非屏蔽跳线', description: '1米', qty: 8, unitPrice: 10.5, extended: 84 },
    { itemNo: 2, partNo: '', name: 'LC-LC OM4光纤跳线', description: '15米', qty: 5, unitPrice: 156, extended: 780 },
  ],
}

function testExtractJson() {
  assert.deepStrictEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepStrictEqual(extractJson('好的，识别结果如下：\n{"a":1}\n以上为结果'), { a: 1 })
  assert.deepStrictEqual(extractJson('{"a":1}'), { a: 1 })
  assert.equal(extractJson('没有JSON'), null)
}

function testNormalize() {
  const sheet = normalizeAiResult(sampleAi, '报价单.pdf')
  assert.equal(sheet.customer, '敦阳（宁波）科技有限公司')
  assert.equal(sheet.vendor, '上海灵沛信息科技有限公司')
  assert.equal(sheet.tax_included, true)
  assert.equal(sheet.total_amount, 2827)
  assert.equal(sheet.items.length, 2)
  assert.equal(sheet.items[0].qty, 8)
  assert.equal(sheet.items[0].unit_price, 10.5)
  assert.equal(sheet.items[0].extended, 84)
  assert.equal(sheet.items[1].part_no, '')
  assert.equal(normalizeAiResult({ items: [] }, 'x.pdf'), null)
  assert.equal(normalizeAiResult(null, 'x.pdf'), null)
}

function testWorkbookText() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['上海灵沛信息科技有限公司'],
    ['TO:', '敦阳（宁波）科技有限公司'],
    ['Item', '产品名称', '数量', '单价', '金额'],
    ['1', '光纤跳线', 12, 98, 1176],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '报价')
  const text = workbookText(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  assert(text && text[0].text.includes('报价'))
  assert(text[0].text.includes('光纤跳线'))
}

async function testRecognize() {
  const fakeFetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(sampleAi) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const result = await recognizeQuotationWithAi(Buffer.from('x'), '.xlsx', '厂商报价.xlsx', { fetchImpl: fakeFetch })
  assert.equal(result.recognitionMethod, 'ai_text')
  assert.equal(result.documentType, 'purchase_quote')
  assert.equal(result.sheets[0].items.length, 2)

  const badFetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '抱歉，我无法识别' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const badResult = await recognizeQuotationWithAi(Buffer.from('x'), '.xlsx', '厂商报价.xlsx', { fetchImpl: badFetch })
  assert.equal(badResult, null)

  const emptyFetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const emptyResult = await recognizeQuotationWithAi(Buffer.from('x'), '.xlsx', '厂商报价.xlsx', { fetchImpl: emptyFetch })
  assert.equal(emptyResult, null)
}

async function testEntityKeys() {
  const sources = [
    { name: '销售-维保.pdf', sheets: [{ items: [{ item_no: '1', name: 'FAS2750 14+7T 维保', description: '原厂维保1年', part_no: '' }] }] },
    { name: '供应商-硬件.pdf', sheets: [{ items: [{ item_no: '1', name: 'DS224C 960G SSD', description: '序列号 952145001351/952145001204', part_no: '952145001351/952145001204' }] }] },
  ]
  const fakeFetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ items: [
      { sourceIndex: 0, itemIndex: 0, entityKey: 'FAS2750 存储 SN:952145001351/952145001204' },
      { sourceIndex: 1, itemIndex: 0, entityKey: 'FAS2750 存储 SN:952145001351/952145001204' },
    ] }) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  await applyAiEntityKeys(sources, { fetchImpl: fakeFetch })
  assert.equal(sources[0].sheets[0].items[0].entityKey, 'FAS2750 存储 SN:952145001351/952145001204')
  assert.equal(sources[1].sheets[0].items[0].entityKey, 'FAS2750 存储 SN:952145001351/952145001204')
}

function testStripPriceFieldClauses() {
  // AI 误把数量/单价/金额写入描述尾部时应剥离
  assert.equal(stripPriceFieldClauses('6类非屏蔽跳线，1米，数量8PC/BOX，单价10.50元，金额84.00元'), '6类非屏蔽跳线，1米')
  // 字段片段出现在描述中部同样剥离（数量列的数字不进描述）
  assert.equal(stripPriceFieldClauses('6类非屏蔽跳线，数量8PC/BOX，含运费'), '6类非屏蔽跳线，含运费')
  assert.equal(stripPriceFieldClauses('LC-LC OM4光纤跳线, 15米, 数量: 5, 单价: 156.00, 金额: 780.00'), 'LC-LC OM4光纤跳线，15米')
  assert.equal(stripPriceFieldClauses('HPE 960GB SATA RI SFF BC MV SSD'), 'HPE 960GB SATA RI SFF BC MV SSD')
  // 不含数字的“金额”表述（如“金额以合同为准”）不剥离
  assert.equal(stripPriceFieldClauses('光纤跳线，金额以合同为准'), '光纤跳线，金额以合同为准')
  // 多行描述逐行处理，且不会把整行剥空
  assert.equal(stripPriceFieldClauses('DS224C 960G SSD*24\n序列号: 952145001351'), 'DS224C 960G SSD*24\n序列号: 952145001351')
  assert.equal(stripPriceFieldClauses('数量: 8'), '数量: 8')

  const sheet = normalizeAiResult({
    documentType: 'purchase_quote',
    items: [{ itemNo: 1, name: '6类非屏蔽跳线 1米', description: '6类非屏蔽跳线，1米，数量8PC/BOX，单价10.50元，金额84.00元', qty: 8, unitPrice: 10.5, extended: 84 }],
  }, '报价单.pdf')
  assert.equal(sheet.items[0].name, '6类非屏蔽跳线 1米')
  assert.equal(sheet.items[0].description, '6类非屏蔽跳线，1米')
}

async function main() {
  testExtractJson()
  testNormalize()
  testStripPriceFieldClauses()
  testWorkbookText()
  await testRecognize()
  await testEntityKeys()
  console.log('quotation AI parser tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
