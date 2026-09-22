/** 智能报表单测：摘要缓存（spec 017）+ 工具循环对话（2026-09-22 改造）。不依赖数据库与真实 AI。 */
const assert = require('node:assert/strict')
process.env.JWT_SECRET = 'test-secret'
process.env.AI_API_URL = 'https://example.invalid/v1/chat/completions'
process.env.AI_API_KEY = 'test-key'
process.env.AI_MODEL = 'test-model'
const { summaryCacheKey, chat, SYSTEM_PROMPT } = require('../assistant')
const { HttpError } = require('../../../utils/http-error')
const { pool } = require('../../../config/db')

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

// ---- 工具循环 chat ----

function fakeAiResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// 路由调用识别：路由 system prompt 含「数据集路由器」标记；本组测试路由一律返回 null（走全量目录回退路径）
const isRouterCall = (body) => String(body.messages?.[0]?.content || '').includes('数据集路由器')
const ROUTER_NULL = () => fakeAiResponse(JSON.stringify({ dataset: null }))

const FAKE_PREVIEW = {
  spec: { dataset: 'service_orders' },
  specText: '工单 · 本月 · 按工程师分组',
  columns: [{ key: 'engineer', label: '工程师', kind: 'dimension' }, { key: 'count', label: '单数', kind: 'metric' }],
  rows: [{ engineer: '张三', count: 12 }],
  total: 1,
  truncated: false,
  compare: null,
  range: { from: '2026-09-01', to: '2026-09-30' },
}

async function testAgentLoop() {
  // ①直接 final（寒暄/追问）：不执行报表，preview 为 null
  {
    const mains = []
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return ROUTER_NULL()
      mains.push(body)
      return fakeAiResponse(JSON.stringify({ action: 'final', reply: '你好，想看什么报表？', suggestions: ['这个月工单怎么样', '上月请假统计'] }))
    }
    const result = await chat([{ role: 'user', content: '你好' }], { fetchImpl })
    assert.equal(mains.length, 1)
    assert.equal(result.reply, '你好，想看什么报表？')
    assert.deepEqual(result.suggestions, ['这个月工单怎么样', '上月请假统计'])
    assert.equal(result.preview, null)
  }

  // ②run_report → 工具回喂真实数据 → final：preview 透传，AI 第二次调用能看到数据
  {
    const mains = []
    const runReportCalls = []
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return ROUTER_NULL()
      mains.push(body)
      if (mains.length === 1) {
        return fakeAiResponse(JSON.stringify({ action: 'run_report', spec: { dataset: 'service_orders', metrics: ['count'] } }))
      }
      return fakeAiResponse(JSON.stringify({ action: 'final', reply: '本月共 12 单。', suggestions: ['换成按客户分组'] }))
    }
    const runReport = async (spec) => {
      runReportCalls.push(spec)
      return FAKE_PREVIEW
    }
    const result = await chat([{ role: 'user', content: '这个月工单怎么样' }], { fetchImpl, runReport })
    assert.equal(mains.length, 2, 'run_report 后应再来一轮 final')
    assert.equal(runReportCalls.length, 1)
    assert.equal(runReportCalls[0].dataset, 'service_orders')
    // 第二轮请求里带着工具结果（含真实数据）
    const secondCall = JSON.stringify(mains[1].messages)
    assert.ok(secondCall.includes('工具执行结果'), '第二轮应回喂工具结果')
    assert.ok(secondCall.includes('张三'), '工具结果应含真实数据')
    assert.equal(result.preview, FAKE_PREVIEW)
    assert.equal(result.reply, '本月共 12 单。')
  }

  // ③run_report 校验失败 → 错误信息回喂 → AI 修正后 final（自愈路径）
  {
    const mains = []
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return ROUTER_NULL()
      mains.push(body)
      if (mains.length === 1) {
        return fakeAiResponse(JSON.stringify({ action: 'run_report', spec: { dataset: 'service_orders', groupBy: ['salary'] } }))
      }
      return fakeAiResponse(JSON.stringify({ action: 'final', reply: '维度不支持，换个问法吧', suggestion: '' }))
    }
    const runReport = async () => {
      throw new HttpError(422, '报表定义无效', ['数据集「工单」不支持分组维度 salary'])
    }
    const result = await chat([{ role: 'user', content: '按工资分组' }], { fetchImpl, runReport })
    assert.equal(mains.length, 2)
    const secondCall = JSON.stringify(mains[1].messages)
    assert.ok(secondCall.includes('不支持分组维度 salary'), '校验错误应回喂给 AI 自愈')
    assert.equal(result.preview, null, '没成功的报表则 preview 为 null')
    assert.equal(result.reply, '维度不支持，换个问法吧')
  }

  // ④AI 一直输出纯文本 → 循环耗尽且无成功报表 → 502
  {
    const alwaysTextFetch = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return ROUTER_NULL()
      return fakeAiResponse('抱歉，我无法理解这个问题')
    }
    await assert.rejects(
      () => chat([{ role: 'user', content: '随便说说' }], { fetchImpl: alwaysTextFetch }),
      (err) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 502)
        return true
      },
    )
  }

  // ⑤循环耗尽但有成功报表 → 兜底返回报表 + 套话回复
  {
    let mainCalls = 0
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body)
      if (isRouterCall(body)) return ROUTER_NULL()
      mainCalls += 1
      return fakeAiResponse(JSON.stringify({ action: 'run_report', spec: { dataset: 'service_orders' } }))
    }
    const runReport = async () => FAKE_PREVIEW
    const result = await chat([{ role: 'user', content: '这个月工单怎么样' }], { fetchImpl, runReport })
    assert.equal(mainCalls, 4, '应跑满循环上限')
    assert.equal(result.preview, FAKE_PREVIEW)
    assert.ok(result.reply.includes('工单'))
  }

  // ⑥缺少用户消息 → HttpError 400
  await assert.rejects(
    () => chat([], { fetchImpl: async () => fakeAiResponse('{}') }),
    (err) => err instanceof HttpError && err.status === 400,
  )

  // ⑦SYSTEM_PROMPT 含工具循环契约与防编造规则
  assert.ok(SYSTEM_PROMPT.includes('run_report'))
  assert.ok(SYSTEM_PROMPT.includes('final'))
  assert.ok(SYSTEM_PROMPT.includes('严禁编造'))

  console.log('report assistant agent-loop tests passed')
}

testAgentLoop()
  // chat() 内部 resolveAiConnection 会查一次设置表，mysql2 连接池的空闲连接会吊住事件循环，
  // 不关池进程不退（曾致全量 npm test 挂 4 分钟+，超时被杀还得重跑）
  .then(() => pool.end())
  .then(() => console.log('report assistant tests passed'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
