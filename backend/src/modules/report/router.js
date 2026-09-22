/**
 * 数据集路由器：用户问题 → 数据集 key（或 null），先于主生成调用执行。
 *
 * 动机：主 prompt 原本塞全部数据集元数据，数据集变多后 token 膨胀、AI 易选错数据集
 * （如"巡检"同时命中巡检计划与巡检执行）。路由用小请求先选一数据集，主 prompt 只带
 * 该数据集的完整元数据 + 其他数据集的一句话目录（主模型仍可改选）。
 *
 * 降级设计：路由任何失败（超时/非 JSON/未知 key/未启用）一律返回 null，调用方回退
 * 全量目录的原始行为——路由是纯优化，永远不影响可用性。
 */
const env = require('../../config/env')
const { resolveAiConnection, callAi, extractJson } = require('../mr/lib/quotation-ai-parser')
const { DATASETS } = require('./datasets')

/** 一句话目录：路由 prompt 用，也是主 prompt 里"其他数据集"的精简列表 */
function compactCatalog(excludeKey) {
  return Object.values(DATASETS)
    .filter((ds) => ds.key !== excludeKey)
    .map((ds) => `${ds.key}：${ds.label}——${ds.description}`)
    .join('\n')
}

const ROUTER_PROMPT = [
  '你是运维管理系统（OMS）智能报表的数据集路由器。根据对话（重点是用户最新消息），判断用户想看的统计报表属于下列哪个数据集。',
  '你必须严格只输出一个合法 JSON 对象，不要输出任何其他文字，不要使用 Markdown 代码块。',
  '',
  '输出结构：{"dataset":"数据集key"} 或 {"dataset":null}',
  '- 用户只是寒暄、提问与统计报表无关、或无法判断属于哪个数据集时，输出 {"dataset":null}',
  '- 拿不准时不要硬猜，输出 null（交给主流程用全量目录处理）',
  '',
  '数据集列表：',
  compactCatalog(),
  '',
  '同义词区分：问巡检的「完成情况/执行/漏检/应巡」选 inspection_completion（不是 inspection_schedules）；问「备件用量」选 service_parts；问「值班」选 duty_records；问「剩余年假/调休余额」选 leave_balance',
].join('\n')

/**
 * 路由一轮。返回数据集 key 或 null。
 * @param messages 已归一化的对话历史（末条为 user）
 * @param opts.fetchImpl 可注入假 fetch（单测）
 * @param opts.conn 可复用调用方已解析的 AI 连接（避免重复查设置表）
 */
async function routeDataset(messages, { fetchImpl = fetch, conn } = {}) {
  try {
    const base = conn || (await resolveAiConnection())
    // 路由可用独立的小模型（AI_REPORT_ROUTER_MODEL），未配置时沿用主模型
    const connection = env.ai.reportRouterModel ? { ...base, model: env.ai.reportRouterModel } : base
    const content = await callAi([{ role: 'system', content: ROUTER_PROMPT }, ...messages], 20000, fetchImpl, connection)
    const parsed = extractJson(content)
    const key = parsed && typeof parsed === 'object' ? parsed.dataset : null
    return key && DATASETS[key] ? key : null
  } catch (error) {
    console.error('[report] router failed, fallback to full catalog:', error?.message || error)
    return null
  }
}

module.exports = { routeDataset, compactCatalog, ROUTER_PROMPT }
