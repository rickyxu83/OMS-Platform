/**
 * 识别规则引擎（spec 009 P1 规则教练的规则执行侧）。
 *
 * 规则卡（mr_recognition_rules 表）两形态：
 *   - 结构化：action_type + params，本模块确定性执行（可单测可回归）
 *   - 提示词：rule_text 片段，由 quotation-ai-parser 在 AI 识别时注入（不经过本模块）
 *
 * 作用域匹配：
 *   - category：scope_value 的关键词（/ 分隔多个）命中品项 品名+描述+料号 文本
 *   - vendor：scope_value 命中 sheet 级供应商名
 *   - global：无条件命中
 */

/** BOM 组件标准类别归类（确定性正则，覆盖 HPE/Dell/联想/浪潮等主流描述习惯；不认得进 other 兜底，不丢数据） */
const CATEGORY_PATTERNS = [
  ['cpu', /Xeon|EPYC|CPU|处理器|處理器|Core\s*i\d|至强|霄龙/i],
  ['memory', /\b\d+\s*GB\b.*(PC\d|DDR|RDIMM|UDIMM|Memory)|内存|記憶體|内存条/i],
  ['disk', /\b\d+(?:\.\d+)?\s*(?:TB|GB)\b.*(SAS|SATA|NVMe|SSD|HDD)|硬盘|磁盤|磁盘|SSD\b/i],
  ['raid', /RAID|MR\d|阵列卡|陣列卡|Storage\s*Controller|SPDM/i],
  ['nic', /网卡|網卡|NIC|10GbE|1Gb\s*\d+p|25GbE|BASE-T|SFP\+|QSFP|OCP.*Ad|Adptr|Adapter/i],
  ['psu', /电源|電源|PS\s*Kit|Power\s*Supply|\d+W\s*(FS\s*)?Plat/i],
  ['rail', /导轨|導軌|Rail\s*Kit|滑轨|滑軌/i],
  // software 须在 warranty 之前：iLO/iDRAC 等许可常含“TSU/Support”字样，本质是软件许可
  ['software', /Windows|WS\d{2}|ROK|License|Lic\b|许可|許可|软件|軟體|软体|iLO|iDRAC|Office|TSU/i],
  ['warranty', /保修|保固|维保|維保|质保|質保|warranty|Support|服务\b|服務\b/i],
]
const CATEGORY_LABELS = {
  cpu: 'CPU', memory: '内存', disk: '硬盘', raid: 'RAID 卡', nic: '网卡',
  psu: '电源', rail: '导轨', warranty: '保修服务', software: '软件许可', other: '其他配件',
}

function classifyComponent(component) {
  const text = `${component.part || ''} ${component.description || ''}`
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category
  }
  return 'other'
}

/**
 * 组件摘要：只保留指定类别，同名组件按数量合并；未保留类别折叠为「其他 N 项」。
 * 输出如 "INT Xeon-S 4516Y+ CPU ×2；32GB DDR5 内存 ×4；1.2TB SAS 硬盘 ×6（其他配件 26 项见 BOM）"
 */
function summarizeComponents(components, keepCategories) {
  const keep = new Set(keepCategories)
  const kept = []
  const dropped = []
  for (const component of components || []) {
    // Factory integrated 影子行（#0D1 等）是主料的工艺附属，摘要时并入主料不单独列出
    if (/Factory\s*integrated/i.test(component.description || '') || /#0D1$/i.test(component.part || '')) continue
    const category = classifyComponent(component)
    if (keep.has(category)) kept.push({ ...component, category })
    else dropped.push(component)
  }
  const label = (component) => String(component.description || component.part || '').replace(/\s+/g, ' ').trim()
  const parts = kept.map((component) => {
    const qty = Number(component.qty) || 1
    return qty > 1 ? `${label(component)} ×${qty}` : label(component)
  })
  const droppedCount = dropped.length
  const suffix = droppedCount ? `（其他配件 ${droppedCount} 项见 BOM）` : ''
  return parts.length ? `${parts.join('；')}${suffix}` : ''
}

/** 品项文本是否命中品类作用域（scope_value 用 / 分隔多个关键词，任一命中即中）。 */
function categoryMatches(scopeValue, item) {
  const keywords = String(scopeValue || '').split('/').map((k) => k.trim()).filter(Boolean)
  if (!keywords.length) return false
  const text = `${item.name || ''} ${item.description || ''} ${item.part_no || ''}`
  return keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))
}

function vendorMatches(scopeValue, sheet) {
  const vendor = String(sheet?.vendor || sheet?.seller?.from || '')
  return vendor && String(scopeValue || '').toLowerCase() && vendor.toLowerCase().includes(String(scopeValue).toLowerCase())
}

/**
 * 对解析结果应用命中的结构化规则（就地修改副本并返回）。返回 { parsed, applied: ruleIds[] }。
 * @param {object} parsed 解析结果（{ sheets }）
 * @param {Array} rules 已启用的规则行（mr_recognition_rules）
 */
function applyStructuredRules(parsed, rules) {
  const applied = new Set()
  const sheets = (parsed.sheets || []).map((sheet) => {
    let nextSheet = sheet
    for (const rule of rules) {
      if (rule.action_type === 'prompt_rule') continue
      if (rule.scope_type === 'vendor' && !vendorMatches(rule.scope_value, sheet)) continue
      let params = rule.params
      if (typeof params === 'string') { try { params = JSON.parse(params) } catch (_error) { params = null } }
      if (rule.action_type === 'summarize_components') {
        const keep = Array.isArray(params?.keep) ? params.keep : []
        if (!keep.length) continue
        let touched = false
        const items = (nextSheet.items || []).map((item) => {
          if (!item.components?.length) return item
          if (rule.scope_type === 'category' && !categoryMatches(rule.scope_value, item)) return item
          const summary = summarizeComponents(item.components, keep)
          if (!summary) return item
          touched = true
          // 摘要只改写展示层描述；完整 BOM 保留在 components 供采购下单
          const prefix = item.name ? `${item.name}：` : ''
          return { ...item, description: `${prefix}${summary}`, summary_applied: true }
        })
        if (touched) { applied.add(rule.id); nextSheet = { ...nextSheet, items } }
      }
      // 预留：后续 action_type 在此扩展（字段改写/品项合并等）
    }
    return nextSheet
  })
  return { parsed: { ...parsed, sheets }, applied: [...applied] }
}

module.exports = { classifyComponent, summarizeComponents, applyStructuredRules, categoryMatches, vendorMatches, CATEGORY_LABELS }
