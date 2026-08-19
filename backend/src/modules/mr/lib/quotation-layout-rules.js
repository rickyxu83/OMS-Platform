const { query } = require('../../../config/db')

const RULES = [
  { id: 'kuantai', file: /宽泰/i, vendor: '上海宽泰信息科技有限公司' },
  { id: 'shiluo', file: /石洛/i, vendor: '上海石洛信息科技有限公司' },
]

const OWN_COMPANY = /(敦阳|敦陽|stark|dunyang)/i

/** 文件名/模式规范化：连字符与下划线统一为空格，避免提取模式与真实文件名分隔符不一致导致匹配失败。 */
function normalizePatternText(input) {
  return String(input || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function applyVendorRule(parsed, vendor, ruleId, sourceLabel) {
  const sheets = (parsed.sheets || []).map((sheet) => {
    const existing = String(sheet.vendor || '').trim()
    return { ...sheet, vendor: existing && !OWN_COMPANY.test(existing) ? existing : vendor, layout_rule: ruleId }
  })
  return {
    ...parsed,
    sheets,
    warnings: [...(parsed.warnings || []), `已应用供应商版式规则：${vendor}${sourceLabel ? `（${sourceLabel}）` : ''}`],
  }
}

/** 从启用的版式规则库匹配文件名（内置规则优先，其次按命中次数排序的自学习/手动规则）。 */
async function resolveLayoutRule(fileName) {
  const text = String(fileName || '')
  const builtin = RULES.find((candidate) => candidate.file.test(text))
  if (builtin) return { vendor: builtin.vendor, id: builtin.id, sourceLabel: '内置规则' }
  try {
    const rows = await query(
      `SELECT rule_key, file_pattern, vendor FROM mr_layout_rules
       WHERE enabled = 1 ORDER BY match_count DESC LIMIT 50`,
    )
    const normalizedFile = normalizePatternText(text)
    const match = rows.find((row) => row.file_pattern && normalizedFile.includes(normalizePatternText(row.file_pattern)))
    if (match) return { vendor: match.vendor, id: match.rule_key, sourceLabel: '学习规则' }
  } catch (_error) {
    // 规则库不可用时静默降级为无规则
  }
  return null
}

async function applyQuotationLayoutRule(parsed, fileName, requestedRole) {
  if (requestedRole !== 'purchase') return parsed
  const rule = await resolveLayoutRule(fileName)
  if (!rule) return parsed
  return applyVendorRule(parsed, rule.vendor, rule.id, rule.sourceLabel)
}

module.exports = { applyQuotationLayoutRule }
