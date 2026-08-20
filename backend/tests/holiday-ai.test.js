const assert = require('assert')
process.env.JWT_SECRET = 'test-secret'
process.env.AI_API_URL = 'https://example.invalid/v1/chat/completions'
process.env.AI_API_KEY = 'test-key'
process.env.AI_MODEL = 'test-model'
const {
  isAiAvailable,
  extractJson,
  normalizeAiHolidays,
  generateYearHolidays,
  callAi,
} = require('../src/modules/attendance/holiday-ai')

function fakeOk(content) {
  return async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) })
}

function fakeError(message) {
  return async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { message } }) })
}

async function testNormalize() {
  const content = JSON.stringify({
    items: [
      { date: '2027-02-06', name: '春节' },
      { date: '2027-06-09', name: '端午节' },
      { date: '2026-12-31', name: '跨年（应被过滤，非目标年）' },
      { date: '2027-02-06', name: '春节（重复应去重）' },
      { date: 'not-a-date', name: '坏日期（应被过滤）' },
      { date: '2027-05-01', name: '' },
      null,
    ],
  })
  const normalized = normalizeAiHolidays(content, '2027')
  assert.deepStrictEqual(normalized, [
    { date: '2027-02-06', name: '春节' },
    { date: '2027-06-09', name: '端午节' },
  ], '应按年过滤、去重、丢弃坏数据并按日期升序')
  assert.equal(normalizeAiHolidays('not json at all', '2027').length, 0, '非 JSON 应返回空数组')
  await testGenerate()
}

async function testGenerate() {
  const json = JSON.stringify({
    items: [
      { date: '2027-02-06', name: '春节' },
      { date: '2027-10-01', name: '国庆节' },
      { date: '2028-01-01', name: '元旦(应过滤，非2027)' },
    ],
  })
  const result = await generateYearHolidays('2027', { fetchImpl: fakeOk(json) })
  assert.deepStrictEqual(result, [
    { date: '2027-02-06', name: '春节' },
    { date: '2027-10-01', name: '国庆节' },
  ], 'generateYearHolidays 应返回规范化后的当年节假日')

  const empty = await generateYearHolidays('2027', { fetchImpl: fakeOk('抱歉，我无法推算') })
  assert.deepStrictEqual(empty, [], 'AI 无有效结果应返回空数组')

  await assert.rejects(
    () => generateYearHolidays('2027', { fetchImpl: fakeError('provider down') }),
    /provider down/,
    'AI provider 错误应向上抛出',
  )

  assert.equal(await generateYearHolidays('not-a-year', { fetchImpl: fakeOk('{}') }), null, '非法年份应返回 null')
  assert.equal(isAiAvailable(), true, '配置齐全时 AI 应可用')
}

async function testCallAi() {
  const raw = await callAi([{ role: 'user', content: 'hi' }], 5000, fakeOk('hello'))
  assert.equal(raw, 'hello', 'callAi 应返回 message.content')
  assert.deepStrictEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 }, 'extractJson 兼容 markdown 代码块')
}

async function main() {
  await testNormalize()
  await testCallAi()
  console.log('holiday-ai tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
