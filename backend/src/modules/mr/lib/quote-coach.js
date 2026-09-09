/**
 * 规则教练（spec 008 P1）：销售用自然语言描述期望的识别效果，AI 多轮对话调优，
 * 满意后蒸馏为持久规则卡（mr_recognition_rules）。
 *
 * 安全设计：
 *   - LLM 只输出「变换指令」（JSON），由本模块代码执行，AI 不直接写数据
 *   - 会话全程不落库；仅 distill 后的规则卡经用户确认才入库
 *   - 变换指令只放行白名单动作与字段（价格/数量字段不许 AI 改）
 */
const env = require('../../../config/env')
const { resolveAiConnection, callAi, extractJson } = require('./quotation-ai-parser')
const { summarizeComponents, classifyComponent, CATEGORY_LABELS } = require('./quotation-rules')

/** 变换指令白名单：可编辑字段（价格/数量字段不许 AI 改；oemSpec 为前端料号字段名） */
const EDITABLE_FIELDS = new Set(['name', 'description', 'part_no', 'partNo', 'oemSpec', 'vendor'])

const COACH_SYSTEM = [
  '你是报价单识别效果的调优助手。用户是销售，正在校对系统自动识别的报价品项，他会用中文描述希望调整的效果。',
  '你必须严格只输出一个合法 JSON 对象，不要输出任何其他文字，不要使用 Markdown 代码块。',
  '',
  '输出结构：',
  '{',
  '  "reply": "给用户看的回复（简明中文，说明你将如何调整）",',
  '  "transform": null | { "type": "summarize_components", "keep": ["cpu","memory","disk"] }',
  '                   | { "type": "item_edit", "edits": [{ "index": 0, "fields": { "description": "新描述" } }] }',
  '}',
  '',
  'transform 取值规则：',
  '1. 用户想精简整机品项的组件明细（如“只要 CPU/内存/硬盘”）→ summarize_components，keep 从 [cpu, memory, disk, raid, nic, psu, rail, warranty, software] 中选；该变换只影响带 BOM 组件清单的品项',
  '2. 用户想改写某个品项的品名/描述/料号/供应商 → item_edit，edits 按品项序号（index 从 0 开始）给出新字段值；只许改 name/description/part_no/vendor，严禁改数量与价格',
  '3. 用户只是提问或当前轮次不需要改预览（如寒暄、询问）→ transform 为 null',
  '4. 用户的描述无法落到上述两类动作时，仍在 reply 里说明你会记住这个偏好，transform 为 null（沉淀阶段会处理）',
].join('\n')

const DISTILL_SYSTEM = [
  '你是规则蒸馏助手。根据销售与调优助手的对话记录，提炼出一条可长期复用的识别规则。',
  '你必须严格只输出一个合法 JSON 对象，不要输出任何其他文字，不要使用 Markdown 代码块。',
  '',
  '输出结构：',
  '{',
  '  "scopeType": "category" | "vendor" | "global",',
  '  "scopeValue": "品类关键词（多个用/分隔，如 服务器/伺服器/CTO Svr）或供应商名关键词；global 时为空字符串",',
  '  "actionType": "summarize_components" | "prompt_rule",',
  '  "params": { "keep": ["cpu","memory","disk"] },   // 仅 summarize_components 需要',
  '  "ruleText": "一句话规则描述（给用户确认用，如：服务器类整机品项，明细只保留 CPU/内存/硬盘，其余折叠计数）",',
  '  "promptText": "仅 actionType=prompt_rule 时填：注入识别 prompt 的指令文本"',
  '}',
  '',
  '蒸馏原则：',
  '1. 能用 summarize_components 表达的组件摘要类需求，禁止产 prompt_rule',
  '2. scopeType 优先取最精确的作用域：用户说的是某类产品 → category（scopeValue 从品名推断关键词）；只针对某个供应商的写法 → vendor；普适要求才 global',
  '3. ruleText 必须让非技术人员看懂这条规则以后会干什么',
].join('\n')

/** 品项快照（发给 AI 的上下文，裁剪掉大字段，保留序号/品名/描述/组件数） */
function itemsSnapshot(items) {
  return (items || []).slice(0, 30).map((item, index) => ({
    index,
    name: String(item.name || '').slice(0, 120),
    description: String(item.description || '').slice(0, 300),
    partNo: String(item.part_no || item.partNo || item.oemSpec || '').slice(0, 80),
    vendor: String(item.vendor || '').slice(0, 60),
    bomCount: Array.isArray(item.components) ? item.components.length : 0,
    bomCategories: Array.isArray(item.components)
      ? [...new Set(item.components.map((c) => CATEGORY_LABELS[classifyComponent(c)] || c))]
      : [],
  }))
}

/**
 * 校验并执行变换指令。返回 { items, changes }（items 为新副本，changes 为逐字段变更明细供前端展示）；
 * 非法/无效指令返回 null 表示忽略。
 * @param {Array} items 当前预览品项
 * @param {object} transform AI 输出的变换指令
 */
function applyTransform(items, transform) {
  if (!transform || typeof transform !== 'object') return null
  if (transform.type === 'summarize_components') {
    const keep = Array.isArray(transform.keep)
      ? transform.keep.filter((k) => Object.keys(CATEGORY_LABELS).includes(k) && k !== 'other')
      : []
    if (!keep.length) return null
    const changes = []
    const next = items.map((item, index) => {
      if (!item.components?.length) return item
      const summary = summarizeComponents(item.components, keep)
      if (!summary) return item
      const prefix = item.name ? `${item.name}：` : ''
      const description = `${prefix}${summary}`
      changes.push({ index, field: 'description', from: String(item.description || '').slice(0, 120), to: description.slice(0, 120) })
      return { ...item, description }
    })
    return changes.length ? { items: next, changes } : null
  }
  if (transform.type === 'item_edit') {
    const edits = Array.isArray(transform.edits) ? transform.edits : []
    const next = items.map((item) => ({ ...item }))
    const changes = []
    for (const edit of edits) {
      const index = Number(edit?.index)
      if (!Number.isInteger(index) || index < 0 || index >= next.length) continue
      const fields = edit.fields && typeof edit.fields === 'object' ? edit.fields : {}
      for (const [key, value] of Object.entries(fields)) {
        if (!EDITABLE_FIELDS.has(key)) continue
        changes.push({ index, field: key, from: String(next[index][key] ?? '').slice(0, 120), to: String(value ?? '').slice(0, 120) })
        next[index][key] = String(value ?? '').slice(0, 2000)
      }
    }
    return changes.length ? { items: next, changes } : null
  }
  return null
}

/**
 * 教练对话一轮。返回 { reply, items }（items 为应用变换后的新预览；无变换时为 null）。
 * @param {Array} items 当前预览品项
 * @param {Array} history [{ role: 'user'|'assistant', content }] 会话历史（含本轮用户消息）
 */
async function coachChat(items, history, { fetchImpl = fetch } = {}) {
  if (!env.ai.quoteRecognitionEnabled) throw new Error('AI 识别未启用，请在系统设置中配置 AI 连接')
  const conn = await resolveAiConnection()
  if (!conn.apiUrl || !conn.apiKey || !conn.model) throw new Error('AI 连接未配置完整（系统设置 → AI 连接）')
  const context = [
    `当前识别出的品项（共 ${items.length} 项，JSON）：`,
    JSON.stringify(itemsSnapshot(items)),
  ].join('\n')
  const messages = [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: context },
    ...history.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) })),
  ]
  const content = await callAi(messages, env.ai.quoteTimeoutMs, fetchImpl, conn)
  const payload = extractJson(content)
  if (!payload || typeof payload.reply !== 'string') throw new Error('AI 返回格式异常，请换个说法再试一次')
  const applied = applyTransform(items, payload.transform)
  let reply = payload.reply.slice(0, 1000)
  if (!applied && payload.transform && typeof payload.transform === 'object') {
    reply += '\n（该调整未能落到当前品项上：组件摘要需要品项带 BOM 明细。请先用实验引擎重新识别该文件（AI 会输出 BOM），再让我摘要）'
  }
  return { reply, items: applied ? applied.items : null, changes: applied ? applied.changes : [], transformApplied: applied !== null }
}

/**
 * 蒸馏：把满意后的会话沉淀为规则卡（返回草稿，由用户确认后入库）。
 */
async function coachDistill(items, history, { fetchImpl = fetch } = {}) {
  if (!env.ai.quoteRecognitionEnabled) throw new Error('AI 识别未启用')
  const conn = await resolveAiConnection()
  if (!conn.apiUrl || !conn.apiKey || !conn.model) throw new Error('AI 连接未配置完整')
  const transcript = history.slice(-12).map((m) => `${m.role === 'assistant' ? '助手' : '销售'}：${String(m.content || '').slice(0, 600)}`).join('\n')
  const messages = [
    { role: 'system', content: DISTILL_SYSTEM },
    { role: 'user', content: `品项上下文（供推断品类关键词）：\n${JSON.stringify(itemsSnapshot(items).slice(0, 10))}\n\n对话记录：\n${transcript}` },
  ]
  const content = await callAi(messages, env.ai.quoteTimeoutMs, fetchImpl, conn)
  const card = extractJson(content)
  if (!card || !card.ruleText) throw new Error('规则蒸馏失败，请再多描述几轮你想要的效果')
  const scopeType = ['category', 'vendor', 'global'].includes(card.scopeType) ? card.scopeType : 'global'
  const actionType = card.actionType === 'summarize_components' && Array.isArray(card.params?.keep) && card.params.keep.length
    ? 'summarize_components'
    : 'prompt_rule'
  return {
    scopeType,
    scopeValue: String(card.scopeValue || '').slice(0, 128),
    actionType,
    params: actionType === 'summarize_components'
      ? { keep: card.params.keep.filter((k) => Object.keys(CATEGORY_LABELS).includes(k) && k !== 'other') }
      : null,
    ruleText: String(card.ruleText || '').slice(0, 512),
    promptText: actionType === 'prompt_rule' ? String(card.promptText || card.ruleText || '').slice(0, 500) : '',
  }
}

module.exports = { coachChat, coachDistill, applyTransform, itemsSnapshot }
