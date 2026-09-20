/** 智能报表摘要缓存单测（spec 017）：summaryCacheKey 纯函数。不依赖数据库与 AI。 */
const assert = require('node:assert/strict')
process.env.JWT_SECRET = 'test-secret'
process.env.AI_API_URL = 'https://example.invalid/v1/chat/completions'
process.env.AI_API_KEY = 'test-key'
process.env.AI_MODEL = 'test-model'
const { summaryCacheKey, chat, SYSTEM_PROMPT } = require('../assistant')
const { HttpError } = require('../../../utils/http-error')

const columns = [{ key: 'engineer', label: '工程师' }, { key: 'count', label: '单数' }]
const rows = [
  { engineer: '张三', count: 30 },
  { engineer: '李四', count: 25 },
]

{
  // 同一输入 → 同一键（缓存可命中）
  assert.equal(summaryCacheKey('工单报表', columns, rows), summaryCacheKey('工单报表', columns, rows))
  assert.match(summaryCacheKey('工单报表', columns, rows), /^[0-9a-f]{40}$/)
}

{
  // 口径变化 → 键变化（新报表重新生成摘要）
  assert.notEqual(summaryCacheKey('工单报表A', columns, rows), summaryCacheKey('工单报表B', columns, rows))
}

{
  // 数据变化 → 键变化（同一报表新数据不会吃到旧摘要）
  const changed = [{ engineer: '张三', count: 31 }, { engineer: '李四', count: 25 }]
  assert.notEqual(summaryCacheKey('工单报表', columns, rows), summaryCacheKey('工单报表', columns, changed))
}

{
  // 列变化 → 键变化
  const cols2 = [{ key: 'engineer', label: '工程师' }, { key: 'count', label: '工单数' }]
  assert.notEqual(summaryCacheKey('工单报表', columns, rows), summaryCacheKey('工单报表', cols2, rows))
}

// ---- chat：AI 只输出纯文本时自动纠正重试一次（生产 kimi-for-coding 实测 4/4 复现的问题） ----

function fakeAiResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function testChatRetry() {
  // ①首次输出非 JSON，重试后成功
  const calls = []
  const flakyFetch = async (url, options) => {
    calls.push(JSON.parse(options.body))
    return calls.length === 1
      ? fakeAiResponse('好的，本月工单共 128 单，其中已结案 96 单。') // 纯文本，无 JSON 信封
      : fakeAiResponse(JSON.stringify({ reply: '本月工单统计如下', spec: { dataset: 'service_orders' } }))
  }
  const result = await chat([{ role: 'user', content: '这个月工单怎么样' }], { fetchImpl: flakyFetch })
  assert.equal(calls.length, 2, '首次解析失败应自动重试一次')
  assert.equal(result.reply, '本月工单统计如下')
  assert.deepEqual(result.spec, { dataset: 'service_orders' })
  // 重试请求应带回 AI 原始输出（assistant）+ 纠正消息（user）
  const retryMessages = calls[1].messages
  assert.equal(retryMessages[retryMessages.length - 2].role, 'assistant')
  assert.ok(retryMessages[retryMessages.length - 2].content.includes('本月工单共 128 单'))
  assert.equal(retryMessages[retryMessages.length - 1].role, 'user')
  assert.ok(retryMessages[retryMessages.length - 1].content.includes('不是合法 JSON'))

  // ②重试仍失败 → 抛 HttpError 502（error-handler 据此透传真实文案，不再吞成 500）
  const alwaysTextFetch = async () => fakeAiResponse('抱歉，我无法理解这个问题')
  await assert.rejects(
    () => chat([{ role: 'user', content: '随便说说' }], { fetchImpl: alwaysTextFetch }),
    (err) => {
      assert.ok(err instanceof HttpError)
      assert.equal(err.status, 502)
      assert.equal(err.message, 'AI 返回格式异常，请换个说法再试一次')
      return true
    },
  )

  // 缺少用户消息 → HttpError 400
  await assert.rejects(
    () => chat([], { fetchImpl: alwaysTextFetch }),
    (err) => {
      assert.ok(err instanceof HttpError)
      assert.equal(err.status, 400)
      assert.equal(err.message, '缺少用户消息')
      return true
    },
  )

  // ③SYSTEM_PROMPT 含多轮对话仍必须输出 JSON 的规则
  assert.ok(SYSTEM_PROMPT.includes('无论对话进行到第几轮'))
  assert.ok(SYSTEM_PROMPT.includes('严禁只输出纯文本'))

  console.log('report assistant chat retry tests passed')
}

testChatRetry().then(() => console.log('report assistant tests passed')).catch((err) => {
  console.error(err)
  process.exit(1)
})
