/**
 * 智能报表 AI 助手（spec 014）：大白话 → 报表定义 JSON；查询结果 → 文字摘要。
 *
 * 安全设计（对齐 quote-coach）：AI 只输出白名单内的结构化 JSON（dataset/filters/groupBy/metrics），
 * 由 engine.js 校验并执行，AI 不直接写 SQL、不直接接触数据库。
 */
const { resolveAiConnection, callAi, extractJson } = require('../mr/lib/quotation-ai-parser')
const { DATASETS } = require('./datasets')
const { RELATIVE_RANGE_LABELS } = require('./engine')

/** 把语义层元数据序列化为 prompt 文本（AI 选字段的唯一依据） */
function catalogPrompt() {
  const blocks = Object.values(DATASETS).map((ds) => {
    const lines = [`【${ds.key}】${ds.label}：${ds.description}`]
    lines.push(`  时间字段 timeField（默认 ${ds.defaultTimeField}）：${Object.entries(ds.timeFields).map(([k, v]) => `${k}=${v.label}`).join('，')}`)
    lines.push(`  分组维度 groupBy：${Object.entries(ds.dimensions).map(([k, v]) => `${k}=${v.label}`).join('，')}`)
    lines.push(`  统计指标 metrics：${Object.entries(ds.metrics).map(([k, v]) => `${k}=${v.label}`).join('，')}`)
    const filters = Object.entries(ds.filters).map(([k, v]) => {
      if (v.type === 'enum') return `${k}=${v.label}（可选值：${Object.entries(v.options).map(([val, label]) => `${val}=${label}`).join('，')}）`
      return `${k}=${v.label}（文本模糊匹配，填关键词）`
    })
    lines.push(`  筛选 filters：${filters.join('；')}`)
    return lines.join('\n')
  })
  return blocks.join('\n\n')
}

const SYSTEM_PROMPT = [
  '你是运维管理系统（OMS）的智能报表助手。用户是公司主管，用中文大白话描述想看的统计报表，你负责把需求翻译成「报表定义 JSON」。',
  '你必须严格只输出一个合法 JSON 对象，不要输出任何其他文字，不要使用 Markdown 代码块。',
  '',
  '输出结构：',
  '{',
  '  "reply": "给用户看的回复（简明中文，说明你理解了什么、将如何统计）",',
  '  "spec": null | {',
  '    "dataset": "数据集 key",',
  '    "timeField": "时间字段 key（可选，不填用默认）",',
  '    "timeRange": { "type": "relative", "value": "last_month" } 或 { "type": "absolute", "from": "2026-08-01", "to": "2026-08-31" },',
  '    "filters": { "筛选 key": ["枚举值"] 或 "关键词" },',
  '    "groupBy": ["维度 key"],',
  '    "metrics": ["指标 key"],',
  '    "chartType": "table" | "bar" | "line" | "pie"',
  '  }',
  '}',
  '',
  '规则：',
  '1. dataset/groupBy/metrics/filters/timeField 的 key 只能从下方数据目录中选，严禁编造',
  '2. 用户需求不明确（没说统计对象或统计口径）时，spec 输出 null，在 reply 里追问；不要硬猜',
  '3. 用户只说时间没说别的（如"这个月工单怎么样"）→ 选最自然的口径（工单数按状态分组），并在 reply 说明可以继续调整',
  '4. timeRange 相对值可选：' + Object.entries(RELATIVE_RANGE_LABELS).map(([k, v]) => `${k}=${v}`).join('，') + '；用户给了明确起止日期才用 absolute',
  '5. 用户提到"结案/完成"的时间口径 → 工单数据集 timeField 用 reviewed_at；"结了"的工单筛选 status=["approved"]；"未结/进行中"筛选 status 用未结状态集合',
  '6. chartType 选择：含时间维度（month/week/day）→ line；单维度对比 → bar；占比类（用户说"占比/比例"）→ pie；用户要明细 → table',
  '7. groupBy 最多 3 个维度，metrics 最多 4 个指标；用户只是寒暄或提问不需要出报表时 spec 为 null',
  '',
  '数据目录：',
  catalogPrompt(),
].join('\n')

const SUMMARY_PROMPT = [
  '你是报表解读助手。根据报表定义和统计结果，用中文写 2~4 句简明结论：总量、最突出的一两项、值得注意的异常（如某人为 0、集中度高等）。',
  '不要复述每一行数据，不要编造结果中没有的数字。直接输出结论文本，不要任何前缀。',
].join('\n')

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-12)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
}

/**
 * 对话一轮。返回 { reply, spec, chartType }（spec 为 AI 原始输出，由调用方校验执行）。
 * AI 不可用/输出非法时抛错，由 controller 转为友好提示。
 */
async function chat(messages) {
  const history = normalizeMessages(messages)
  if (!history.length || history[history.length - 1].role !== 'user') {
    const err = new Error('缺少用户消息')
    err.status = 400
    throw err
  }
  const conn = await resolveAiConnection()
  const content = await callAi([{ role: 'system', content: SYSTEM_PROMPT }, ...history], 90000, fetch, conn)
  const parsed = extractJson(content)
  if (!parsed || typeof parsed !== 'object') {
    const err = new Error('AI 返回格式异常，请换个说法再试一次')
    err.status = 502
    throw err
  }
  return {
    reply: String(parsed.reply || '').trim() || '好的，请继续描述你的需求。',
    spec: parsed.spec && typeof parsed.spec === 'object' ? parsed.spec : null,
  }
}

/**
 * 基于查询结果生成文字摘要（best-effort：失败返回空串，不阻塞主流程）。
 */
async function summarize(specText, columns, rows) {
  const sample = rows.slice(0, 60)
  if (!sample.length) return ''
  try {
    const conn = await resolveAiConnection()
    const payload = {
      报表: specText,
      列: columns.map((c) => c.label),
      数据行数: rows.length,
      数据: sample,
    }
    const content = await callAi(
      [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      60000,
      fetch,
      conn,
    )
    return String(content || '').trim().replace(/^【?摘要】?[:：]?\s*/, '').slice(0, 800)
  } catch (error) {
    console.error('[report] summary failed:', error?.message || error)
    return ''
  }
}

module.exports = { chat, summarize, catalogPrompt }
