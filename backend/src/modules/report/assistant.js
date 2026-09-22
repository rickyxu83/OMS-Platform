/**
 * 智能报表 AI 助手（spec 014）：大白话 → 报表定义 JSON；查询结果 → 文字摘要。
 *
 * 安全设计（对齐 quote-coach）：AI 只输出白名单内的结构化 JSON（dataset/filters/groupBy/metrics），
 * 由 engine.js 校验并执行，AI 不直接写 SQL、不直接接触数据库。
 *
 * 数据集路由（router.js）：主流程先让路由从 11 个数据集中选一个，命中后主 prompt 只带
 * 该数据集的完整元数据（其余压缩成一句话目录，主模型仍可改选）；路由失败/未命中回退全量目录。
 */
const env = require('../../config/env')
const { resolveAiConnection, callAi, extractJson } = require('../mr/lib/quotation-ai-parser')
const { badRequest, badGateway } = require('../../utils/http-error')
const { createHash } = require('node:crypto')
const { DATASETS } = require('./datasets')
const { RELATIVE_RANGE_LABELS } = require('./engine')
const { routeDataset, compactCatalog } = require('./router')

/** 单个数据集的完整元数据块（主 prompt 用） */
function datasetBlock(ds) {
  const lines = [`【${ds.key}】${ds.label}：${ds.description}`]
    if (ds.timeFields && Object.keys(ds.timeFields).length) {
      lines.push(`  时间字段 timeField（默认 ${ds.defaultTimeField}）：${Object.entries(ds.timeFields).map(([k, v]) => `${k}=${v.label}`).join('，')}`)
    } else {
      lines.push('  时间字段：无（timeRange 只决定统计区间，不筛选记录；仍须输出 timeRange）')
    }
    lines.push(`  分组维度 groupBy：${Object.entries(ds.dimensions).map(([k, v]) => `${k}=${v.label}`).join('，')}`)
    lines.push(`  统计指标 metrics：${Object.entries(ds.metrics).map(([k, v]) => `${k}=${v.label}`).join('，')}`)
    const filters = Object.entries(ds.filters).map(([k, v]) => {
      if (v.type === 'enum') return `${k}=${v.label}（可选值：${Object.entries(v.options).map(([val, label]) => `${val}=${label}`).join('，')}）`
      return `${k}=${v.label}（文本模糊匹配，填关键词）`
    })
    lines.push(`  筛选 filters：${filters.join('；')}`)
  return lines.join('\n')
}

/** 把语义层元数据序列化为 prompt 文本（AI 选字段的唯一依据） */
function catalogPrompt() {
  return Object.values(DATASETS).map(datasetBlock).join('\n\n')
}

const SYSTEM_RULES = [
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
  '    "compare": null 或 { "type": "previous" | "year_ago" }（可选，不需要对比时省略或为 null）',
  '    "limit": null 或正整数（可选，用户说「前 N 名/top N/最多的前几个」时填 N，否则省略或为 null）',
  '    "sortBy": "排序指标 key（可选，默认按第一个指标降序）",',
  '  }',
  '  "suggestion": "给用户的下一轮追问提示（20 字以内的中文短句，不带「例如」前缀）",',
  '}',
  '',
  '规则：',
  '1. dataset/groupBy/metrics/filters/timeField 的 key 只能从下方数据目录中选，严禁编造',
  '2. 用户需求不明确（没说统计对象或统计口径）时，spec 输出 null，在 reply 里追问；不要硬猜',
  '3. 用户只说时间没说别的（如"这个月工单怎么样"）→ 选最自然的口径（工单数按状态分组），并在 reply 说明可以继续调整',
  '4. timeRange 相对值可选：' + Object.entries(RELATIVE_RANGE_LABELS).map(([k, v]) => `${k}=${v}`).join('，') + '；用户给了明确起止日期才用 absolute',
  '5. 用户提到"结案/完成"的时间口径 → 工单数据集 timeField 用 closed_at；"结了/完成"的工单筛选 status=["submitted","approved","archived"]（提交即视为完成，审批是可选后续动作）；"未结/进行中"筛选 status 用 ["draft","pending_confirmation","awaiting_customer_signature","assigned","in_progress","rejected"]',
  '6. chartType 选择：含时间维度（month/week/day）→ line；单维度对比 → bar；占比类（用户说"占比/比例"）→ pie；用户要明细 → table',
  '7. groupBy 最多 3 个维度，metrics 最多 4 个指标；用户只是寒暄或提问不需要出报表时 spec 为 null',
  '8. 用户要求对比（"环比/比上月/与上期相比" → compare.type="previous"；"同比/比去年/去年同期" → compare.type="year_ago"）时在 spec 里加 compare 字段；时间范围为「全部时间」时不要加 compare（不支持）；用户说「取消/去掉/不要对比」时 compare 必须输出 null',
  '9. groupBy 含 month/week/day（按时间分组）时不要加 compare：两期的时间分组键永远对不上，只会多出一堆空行；用户想看不同月份的差异时，按月分组本身就是对比；即使用户要求对比也改为按月分组并在 reply 说明',
  '10. 数据集选择注意同义词区分：问巡检的「完成情况/执行/漏检/应巡」用 inspection_completion（不是 inspection_schedules）；问「备件用量」用 service_parts；问「值班」用 duty_records；问「剩余年假/调休余额」用 leave_balance',
  '11. 无论对话进行到第几轮、无论用户是追问还是调整口径，每次回复都必须严格只输出上面规定的 JSON 对象，严禁只输出纯文本回复',
  '12. suggestion 根据刚生成的报表给一条自然的下一步调整建议（如换分组/换时间范围/加对比/只看某状态，需结合当前报表内容，不要泛泛）；spec 为 null 时给一条引导用户说清需求的提问示例；没有合适建议时填空字符串',
  '13. reply 只说明你理解的统计口径和可以怎么调整：你看不到真实统计数据（结果由系统独立计算后直接展示），严禁在 reply 里编造具体数字、金额、人名、占比或排名——需要提及结果时只说“已按 xx 口径统计，见下方报表”',
  '14. 用户说「前 N 名/top N/最多/最高的前几个」时设置 limit=N；用户改口「改成前 5」时更新 limit；说「不要限制/全部列出」时输出 null',
  '15. 排序：默认按第一个指标降序；用户说「按某指标最大/最高/最多排序」「X 最大的前 N 名」时，sortBy 必须填该指标的 key（且该指标要在 metrics 里）——如「未税金额最大的客户前 3 名」→ metrics 含 amount、sortBy="amount"、limit=3',
].join('\n')

/**
 * 组装主 system prompt。
 * routedKey 命中（数据集路由）：只带该数据集完整元数据 + 其他数据集一句话目录（主模型仍可改选），
 * 大幅缩短 prompt、降低选错率；否则全量目录（路由失败/未命中时的回退行为）。
 */
function buildSystemPrompt(routedKey) {
  const routed = routedKey && DATASETS[routedKey] ? DATASETS[routedKey] : null
  const catalog = routed
    ? `${datasetBlock(routed)}\n\n其他数据集一句话目录（用户问题其实属于下列之一时，改选对应 key）：\n${compactCatalog(routed.key)}`
    : catalogPrompt()
  return `${SYSTEM_RULES}\n\n数据目录：\n${catalog}`
}

const SYSTEM_PROMPT = buildSystemPrompt(null)

/**
 * 摘要缓存（spec 017）：同一报表口径 + 数据结果 → 同一摘要，避免模板反复重跑时重复调 AI。
 * 进程内 Map，TTL 60 分钟，上限 500 条（满时淘汰最旧）。进程重启清空，无正确性影响。
 */
const SUMMARY_CACHE_TTL = 60 * 60 * 1000
const SUMMARY_CACHE_MAX = 500
const summaryCache = new Map() // key → { text, expiresAt }

/** 缓存键：prompt 版本 + 口径 + 列 + 全部数据行内容的哈希（纯函数，可单测） */
function summaryCacheKey(specText, columns, rows) {
  const payload = JSON.stringify({ v: SUMMARY_PROMPT_VERSION, specText, columns: columns.map((c) => c.label), rows })
  return createHash('sha1').update(payload).digest('hex')
}

function summaryCacheGet(key) {
  const hit = summaryCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    summaryCache.delete(key)
    return null
  }
  return hit.text
}

function summaryCacheSet(key, text) {
  if (summaryCache.size >= SUMMARY_CACHE_MAX) {
    // Map 迭代按插入序，淘汰最旧条目
    summaryCache.delete(summaryCache.keys().next().value)
  }
  summaryCache.set(key, { text, expiresAt: Date.now() + SUMMARY_CACHE_TTL })
}

const SUMMARY_PROMPT_VERSION = 2 // prompt 变更时递增，旧缓存摘要自然失效

const SUMMARY_PROMPT = [
  '你是报表解读助手。根据报表定义和统计结果，用中文写 2~4 句简明结论：总量、整体分布、值得注意的客观异常（如某类别为 0、集中度高等）。',
  '不要对工程师、销售等个人之间进行对比或排名：不说谁比谁多/少、谁第一谁垫底，只总结总体结果。',
  '数据中带 __compare / __delta / __pct 后缀的列分别是对比期数值、差值、变化百分比（pct 为 null 表示对比期为 0 无法计算）；有对比数据时摘要可提及总体涨跌幅。',
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
async function chat(messages, { fetchImpl = fetch } = {}) {
  const history = normalizeMessages(messages)
  if (!history.length || history[history.length - 1].role !== 'user') {
    throw badRequest('缺少用户消息')
  }
  const conn = await resolveAiConnection()
  // 数据集路由：命中则主 prompt 只带目标数据集的完整元数据；路由失败/未命中回退全量目录（纯优化，不影响可用性）
  let system = SYSTEM_PROMPT
  if (!env.ai.reportRouterDisabled) {
    const routed = await routeDataset(history, { fetchImpl, conn })
    if (routed) {
      system = buildSystemPrompt(routed)
      console.log(`[report] router → ${routed}`)
    }
  }
  const aiMessages = [{ role: 'system', content: system }, ...history]
  let content = await callAi(aiMessages, 90000, fetchImpl, conn)
  let parsed = extractJson(content)
  if (!parsed || typeof parsed !== 'object') {
    // 重试一次：部分模型（如 kimi-for-coding）多轮追问时偶发只输出纯文本、不输出 JSON 信封；
    // 把原始输出带回对话并明确纠正，可显著提升成功率（参照 mr 报价识别重试写法）
    const retryMessages = [
      ...aiMessages,
      { role: 'assistant', content: String(content || '').slice(0, 4000) },
      { role: 'user', content: '你上次的回复不是合法 JSON。请严格只输出一个符合规定的 JSON 对象，不要输出任何其他文字，不要使用 Markdown 代码块。' },
    ]
    content = await callAi(retryMessages, 90000, fetchImpl, conn)
    parsed = extractJson(content)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw badGateway('AI 返回格式异常，请换个说法再试一次')
  }
  return {
    reply: String(parsed.reply || '').trim() || '好的，请继续描述你的需求。',
    spec: parsed.spec && typeof parsed.spec === 'object' ? parsed.spec : null,
    suggestion: String(parsed.suggestion || '').trim().slice(0, 30),
  }
}

/**
 * 基于查询结果生成文字摘要（best-effort：失败返回空串，不阻塞主流程）。
 */
async function summarize(specText, columns, rows) {
  const sample = rows.slice(0, 60)
  if (!sample.length) return ''
  const cacheKey = summaryCacheKey(specText, columns, sample)
  const cached = summaryCacheGet(cacheKey)
  if (cached !== null) return cached
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
    const text = String(content || '').trim().replace(/^【?摘要】?[:：]?\s*/, '').slice(0, 800)
    if (text) summaryCacheSet(cacheKey, text)
    return text
  } catch (error) {
    console.error('[report] summary failed:', error?.message || error)
    return ''
  }
}

module.exports = { chat, summarize, catalogPrompt, buildSystemPrompt, summaryCacheKey, SYSTEM_PROMPT }
