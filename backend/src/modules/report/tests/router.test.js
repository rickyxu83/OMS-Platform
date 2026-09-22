/** 数据集路由单测：routeDataset 解析/降级 + buildSystemPrompt 精简 + chat 集成路由。不依赖数据库与真实 AI。 */
const assert = require('node:assert/strict')
process.env.JWT_SECRET = 'test-secret'
process.env.AI_API_URL = 'https://example.invalid/v1/chat/completions'
process.env.AI_API_KEY = 'test-key'
process.env.AI_MODEL = 'test-model'
const { routeDataset, ROUTER_PROMPT } = require('../router')
const { chat, buildSystemPrompt, SYSTEM_PROMPT } = require('../assistant')
const { DATASETS } = require('../datasets')
const { pool } = require('../../../config/db')

const TEST_CONN = { apiUrl: process.env.AI_API_URL, apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL }
const history = [{ role: 'user', content: '上个月巡检计划完成情况怎么样' }]

function fakeAiResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// 路由调用识别：路由 system prompt 含「数据集路由器」标记
const isRouterCall = (body) => String(body.messages?.[0]?.content || '').includes('数据集路由器')

async function main() {
  // ①路由 prompt 覆盖全部数据集 key（新增数据集后漏改路由 prompt 会在这里暴露）
  for (const key of Object.keys(DATASETS)) {
    assert.ok(ROUTER_PROMPT.includes(key), `路由 prompt 缺少数据集 ${key}`)
  }

  // ②合法 JSON + 已知 key → 返回该 key
  {
    const fetchImpl = async () => fakeAiResponse(JSON.stringify({ dataset: 'inspection_completion' }))
    assert.equal(await routeDataset(history, { fetchImpl, conn: TEST_CONN }), 'inspection_completion')
  }

  // ③降级路径全部返回 null 而不是抛错：未知 key / 非 JSON / fetch 异常 / 显式 null
  {
    const unknownKey = async () => fakeAiResponse(JSON.stringify({ dataset: 'not_a_dataset' }))
    assert.equal(await routeDataset(history, { fetchImpl: unknownKey, conn: TEST_CONN }), null)

    const plainText = async () => fakeAiResponse('我觉得是工单数据集')
    assert.equal(await routeDataset(history, { fetchImpl: plainText, conn: TEST_CONN }), null)

    const boom = async () => { throw new Error('network down') }
    assert.equal(await routeDataset(history, { fetchImpl: boom, conn: TEST_CONN }), null)

    const explicitNull = async () => fakeAiResponse(JSON.stringify({ dataset: null }))
    assert.equal(await routeDataset(history, { fetchImpl: explicitNull, conn: TEST_CONN }), null)
  }

  // ④buildSystemPrompt 命中路由：只带目标数据集完整块，其余压缩成一句话目录，整体明显变短
  {
    const prompt = buildSystemPrompt('inspection_completion')
    assert.ok(prompt.includes('【inspection_completion】'), '应含目标数据集完整块')
    assert.ok(!prompt.includes('【service_orders】'), '不应含其他数据集完整块')
    assert.ok(prompt.includes('service_orders：工单'), '一句话目录保留其他数据集 key（主模型可改选）')
    assert.ok(prompt.length < SYSTEM_PROMPT.length * 0.6, `路由后 prompt 应明显变短（${prompt.length} vs ${SYSTEM_PROMPT.length}）`)
    assert.equal(buildSystemPrompt(null), SYSTEM_PROMPT, '未命中路由时应与全量目录一致')
    assert.equal(buildSystemPrompt('not_a_dataset'), SYSTEM_PROMPT, '未知 key 回退全量目录')
  }

  // ⑤chat 集成：路由命中 → 主调用 system prompt 用精简版
  {
    const mains = []
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return fakeAiResponse(JSON.stringify({ dataset: 'inspection_completion' }))
      mains.push(body)
      return fakeAiResponse(JSON.stringify({ reply: '巡检完成情况统计如下', spec: { dataset: 'inspection_completion' } }))
    }
    const result = await chat(history, { fetchImpl })
    assert.equal(mains.length, 1, '主流程应只调用一次')
    const sys = mains[0].messages[0].content
    assert.ok(sys.includes('【inspection_completion】'))
    assert.ok(!sys.includes('【service_orders】'))
    assert.equal(result.spec.dataset, 'inspection_completion')
  }

  // ⑥chat 集成：路由未命中 → 主调用回退全量目录（旧行为）
  {
    const mains = []
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return fakeAiResponse(JSON.stringify({ dataset: null }))
      mains.push(body)
      return fakeAiResponse(JSON.stringify({ reply: '好的', spec: { dataset: 'service_orders' } }))
    }
    await chat([{ role: 'user', content: '这个月工单怎么样' }], { fetchImpl })
    assert.ok(mains[0].messages[0].content.includes('【service_orders】'), '回退后应带全量目录')
  }

  console.log('report router tests passed')
}

main()
  // 同 assistant.test.js：resolveAiConnection 的空闲连接会吊住事件循环，不关池进程不退
  .then(() => pool.end())
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
