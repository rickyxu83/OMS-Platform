const OpenCC = require('opencc-js')

const toTraditionalConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })
const toSimplifiedConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })
const japaneseToSimplifiedConverter = OpenCC.Converter({ from: 'jp', to: 'cn' })

// 业务词组手动修正：OpenCC 字符级映射把“签”转成“籤”（竹籤的籤），业务用词需用“簽”。
// 前置：转换前直接替换简体词组；后置：接住任何绕过前置的拼接文本。只按词组替换，不误伤抽籤/竹籤等正确用法。
const TRADITIONAL_PRE_FIXES = [
  ['签核', '簽核'],
  ['会签', '會簽'],
]
const TRADITIONAL_POST_FIXES = [
  ['籤核', '簽核'],
  ['會籤', '會簽'],
]

function applyPhraseFixes(value, fixes) {
  let output = value
  for (const [source, target] of fixes) output = output.split(source).join(target)
  return output
}

function toTraditional(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value
  const normalized = applyPhraseFixes(value, TRADITIONAL_PRE_FIXES)
  return applyPhraseFixes(toTraditionalConverter(japaneseToSimplifiedConverter(normalized)), TRADITIONAL_POST_FIXES)
}

function toSimplified(value) {
  if (value === null || value === undefined) return value
  return typeof value === 'string' ? japaneseToSimplifiedConverter(toSimplifiedConverter(value)) : value
}

function searchTextVariants(value) {
  const text = String(value ?? '').trim()
  if (!text) return []
  return [...new Set([
    text,
    toSimplified(text),
    toTraditional(text),
    toTraditional(toSimplified(text)),
    toSimplified(toTraditional(text)),
  ].map((item) => String(item || '').toLowerCase().replace(/\s+/g, '').trim()).filter(Boolean))]
}

function buildLikeSearch(value, prefix = 'likeKeyword') {
  const variants = searchTextVariants(value)
  const params = Object.fromEntries(variants.map((variant, index) => [`${prefix}${index}`, `%${variant}%`]))
  const sql = (column) => variants.length
    ? variants.map((_, index) => `${column} LIKE :${prefix}${index}`).join(' OR ')
    : '1 = 0'
  return { variants, params, sql }
}

function buildLikeSearchTerms(value, prefix = 'likeTerm') {
  const terms = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  const searches = terms.map((term, index) => buildLikeSearch(term, `${prefix}${index}Variant`))
  const params = Object.assign({}, ...searches.map((search) => search.params))
  const sql = (columns) => searches.length
    ? searches.map((search) => `(${columns.map((column) => `(${search.sql(column)})`).join(' OR ')})`).join(' AND ')
    : '1 = 0'
  return { terms, params, sql }
}

function toTraditionalDeep(value) {
  if (Array.isArray(value)) return value.map(toTraditionalDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toTraditionalDeep(item)]))
  }
  return toTraditional(value)
}

function toSimplifiedDeep(value, skippedKeys = new Set()) {
  if (Array.isArray(value)) return value.map((item) => toSimplifiedDeep(item, skippedKeys))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, skippedKeys.has(key) ? item : toSimplifiedDeep(item, skippedKeys)]),
    )
  }
  return toSimplified(value)
}

function customerNameKey(value) {
  return String(toSimplified(value) || '')
    .toLowerCase()
    .replace(/[\s　()（）【】\[\]《》<>.,，。;；:：'"“”‘’、/\\|-]/g, '')
    .trim()
}

module.exports = {
  toTraditional,
  toSimplified,
  toTraditionalDeep,
  toSimplifiedDeep,
  customerNameKey,
  searchTextVariants,
  buildLikeSearch,
  buildLikeSearchTerms,
}
