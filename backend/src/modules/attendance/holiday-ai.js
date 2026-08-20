/** 节假日 AI 生成：调用项目现有 AI 底座（env.ai，OpenAI 兼容 chat/completions）
 * 生成指定年份中国法定节假日（放假日期 + 名称）。
 *
 * 能力边界：AI 可精确推算公历/农历可确定的节日日期（元旦、春节、清明、端午、
 * 中秋、劳动节、国庆）；调休补班安排由国务院公告决定，AI 无法预知。因此生成结果
 * 一律以"预览"返回，由调用方（管理端提前预览 → 人工确认）把关后再写入。
 */
const env = require('../../config/env')

const HOLIDAY_NAME_HINT = '元旦、春节、清明节、劳动节、端午节、中秋节、国庆节'

function isAiAvailable() {
  return Boolean(env.ai?.apiUrl && env.ai?.apiKey && env.ai?.model)
}

/** 从模型回答中尽力提取一个合法 JSON（容忍 markdown 代码块/前后缀杂质）。 */
function extractJson(content) {
  if (!content) return null
  let text = String(content).trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence) text = fence[1].trim()
  try {
    return JSON.parse(text)
  } catch (_error) {
    /* fall through */
  }
  const blockStart = text.indexOf('{')
  if (blockStart >= 0) {
    const candidate = text.slice(blockStart)
    try {
      return JSON.parse(candidate)
    } catch (_error) {
      /* fall through */
    }
  }
  return null
}

function buildMessages(year) {
  return [
    {
      role: 'system',
      content: '你是中国法定节假日数据助手，擅长按公历/农历/节气精确推算节假日日期，严格只输出合法 JSON。',
    },
    {
      role: 'user',
      content: [
        `请输出 ${year} 年中国全部法定节假日的放假日期。`,
        '',
        '严格只输出一个 JSON 对象，不要任何其他文字、不要 Markdown 代码块：',
        '{ "items": [ { "date": "YYYY-MM-DD", "name": "节日名称" }, ... ] }',
        '',
        `要求：覆盖 ${HOLIDAY_NAME_HINT}。`,
        `- date 为 ${year} 年的放假日期，春节/清明/端午/中秋按农历与节气精确计算，元旦/劳动节/国庆按公历固定`,
        '- 一个节日放假多天时，每个放假日期单独一条（name 相同）',
        `- 只输出属于 ${year} 年的日期，日期去重并升序`,
        '- 宁可只给确定无误的节日当天，也不要臆造不确定的调休补班日期',
      ].join('\n'),
    },
  ]
}

/** OpenAI 兼容 chat completions 调用（可注入 fetchImpl 便于测试）。 */
async function callAi(messages, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 60000)))
  try {
    const response = await fetchImpl(env.ai.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        messages,
        stream: false,
        max_tokens: 2000,
        ...(env.ai.quoteTemperature !== null && Number.isFinite(env.ai.quoteTemperature)
          ? { temperature: env.ai.quoteTemperature }
          : {}),
        thinking: { type: 'disabled' },
      }),
    })
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch (_error) {
      /* fall through */
    }
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `AI provider HTTP ${response.status}`)
    }
    return data?.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeout)
  }
}

/** 规范化并校验 AI 生成的节假日列表：过滤非目标年/格式错误/空名，去重，升序。 */
function normalizeAiHolidays(content, year) {
  const parsed = extractJson(content)
  const items = Array.isArray(parsed?.items) ? parsed.items : []
  const seen = new Set()
  const result = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const date = String(item.date || '').trim()
    const name = String(item.name || '').trim()
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!date.startsWith(`${year}-`)) continue
    if (seen.has(date)) continue
    seen.add(date)
    result.push({ date, name })
  }
  result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return result
}

/**
 * 生成指定年份的法定节假日。AI 不可用/失败返回 null（由调用方提示）；成功返回
 * 规范化后的 [{date, name}]（可能为空数组，表示 AI 未给出有效结果）。
 * @param {number|string} year 目标年份（四位数）
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
async function generateYearHolidays(year, { fetchImpl = fetch } = {}) {
  const targetYear = String(year || '').trim()
  if (!/^\d{4}$/.test(targetYear)) return null
  if (!isAiAvailable()) return null
  const timeoutMs = env.ai.quoteTimeoutMs
  const content = await callAi(buildMessages(targetYear), timeoutMs, fetchImpl)
  return normalizeAiHolidays(content, targetYear)
}

module.exports = { isAiAvailable, extractJson, normalizeAiHolidays, generateYearHolidays, callAi, buildMessages }
