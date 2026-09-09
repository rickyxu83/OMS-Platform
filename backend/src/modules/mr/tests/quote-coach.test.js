/**
 * 规则教练对话自动追问测试（spec 009）：第一轮变换落空 → 后端自动带原因重问一轮。
 * 用 stub fetchImpl 模拟 AI 两轮返回，不依赖真实 AI 连接。
 */
const assert = require('assert')

process.env.NODE_ENV = 'development'
process.env.AI_QUOTE_RECOGNITION_ENABLED = 'true'
process.env.AI_API_URL = 'http://stub.local/chat'
process.env.AI_API_KEY = 'stub-key'
process.env.AI_MODEL = 'stub-model'

const { coachChat } = require('../lib/quote-coach')

/** 构造 fetch stub：依次返回给定的 AI content 文本 */
function stubFetch(contents) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push(JSON.parse(options.body))
    const content = contents.shift()
    if (content === undefined) throw new Error('stub 内容耗尽')
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) }
  }
  return { fetchImpl, calls }
}

// 无 BOM 的单行品项（内联配置文本）——联想服务器单的复刻结构
const items = [
  {
    name: '服務器-VM Server(AMD EPYC 9354 *2, DDR4 32GB*8, 960GB SSD *3)',
    description: 'ThinkSystem SR665 V3 ThinkSystem AMD EPYC 9354 32C 280W 3.25GHz 处理器*2 ThinkSystem 64GB TruDDR5 内存*8 960GB SSD*3 RAID 卡 网卡 电源',
    oemSpec: 'SR665',
    qty: 1,
    unitPrice: 390000,
  },
]
const history = [{ role: 'user', content: '明细描述不需要有那么多，只需要有 CPU 大小数量、硬盘大小数量和内存大小数量' }]

async function main() {
  // 场景 1：第一轮误用 summarize_components（无 BOM 落空）→ 自动追问 → 第二轮 item_edit 命中
  const s1 = stubFetch([
    JSON.stringify({ reply: '好的，我会精简该服务器的描述。', transform: { type: 'summarize_components', keep: ['cpu', 'memory', 'disk'] } }),
    JSON.stringify({ reply: '明白了，该品项没有 BOM 明细，我直接改写描述，只保留 CPU/内存/硬盘。', transform: { type: 'item_edit', edits: [{ index: 0, fields: { description: 'AMD EPYC 9354 32C 处理器 ×2；64GB DDR5 内存 ×8；960GB SSD ×3' } }] } }),
  ])
  const r1 = await coachChat(items, history, { fetchImpl: s1.fetchImpl })
  assert.equal(r1.transformApplied, true, '追问后应命中')
  assert.equal(s1.calls.length, 2, '恰好两轮 AI 调用')
  assert(r1.items[0].description.includes('EPYC'), '描述已改写')
  assert(!r1.items[0].description.includes('RAID'), '未点名类别被移除')
  assert.equal(r1.changes.length, 1)
  assert.equal(r1.changes[0].field, 'description')
  // 追问消息里带了失败原因
  const retryMsg = s1.calls[1].messages[s1.calls[1].messages.length - 1]
  assert(retryMsg.content.includes('未能应用'), '追问消息含失败原因')

  // 场景 2：两轮都落空 → 返回变换未应用 + 提示文案，不抛错
  const s2 = stubFetch([
    JSON.stringify({ reply: '好的，我来精简。', transform: { type: 'summarize_components', keep: ['cpu'] } }),
    JSON.stringify({ reply: '再试试组件摘要。', transform: { type: 'summarize_components', keep: ['disk'] } }),
  ])
  const r2 = await coachChat(items, history, { fetchImpl: s2.fetchImpl })
  assert.equal(r2.transformApplied, false)
  assert.equal(r2.items, null)
  assert(r2.reply.includes('换个说法'), '两轮落空后提示用户换说法')

  // 场景 3：第一轮 item_edit 直接命中 → 不追问
  const s3 = stubFetch([
    JSON.stringify({ reply: '已改写描述。', transform: { type: 'item_edit', edits: [{ index: 0, fields: { description: 'EPYC 9354 ×2；32GB DDR4 ×8；960GB SSD ×3' } }] } }),
  ])
  const r3 = await coachChat(items, history, { fetchImpl: s3.fetchImpl })
  assert.equal(r3.transformApplied, true)
  assert.equal(s3.calls.length, 1, '直接命中不追问')

  console.log('quote-coach auto-retry tests passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
