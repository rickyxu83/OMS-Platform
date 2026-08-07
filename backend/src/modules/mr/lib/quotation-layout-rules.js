const RULES = [
  { id: 'kuantai', file: /宽泰/i, vendor: '上海宽泰信息科技有限公司' },
  { id: 'shiluo', file: /石洛/i, vendor: '上海石洛信息科技有限公司' },
]

const OWN_COMPANY = /(敦阳|敦陽|stark|dunyang)/i

function applyQuotationLayoutRule(parsed, fileName, requestedRole) {
  if (requestedRole !== 'purchase') return parsed
  const rule = RULES.find((candidate) => candidate.file.test(String(fileName || '')))
  if (!rule) return parsed
  const sheets = (parsed.sheets || []).map((sheet) => {
    const existing = String(sheet.vendor || '').trim()
    return { ...sheet, vendor: existing && !OWN_COMPANY.test(existing) ? existing : rule.vendor, layout_rule: rule.id }
  })
  return {
    ...parsed,
    sheets,
    warnings: [...(parsed.warnings || []), `已应用供应商版式规则：${rule.vendor}`],
  }
}

module.exports = { applyQuotationLayoutRule }
