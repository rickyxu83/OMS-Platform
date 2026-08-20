const OpenCC = require('opencc-js')

const toTraditionalConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })
const toSimplifiedConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })
// 警告：japaneseToSimplifiedConverter（jp→cn）只允许作为搜索加法变体使用，禁止进入主转换链！
// jp→cn 是“日语新字体→中文标准字”的单向映射，会把 216 个中文正常用字误映射成别的字：
// 沪→滤（日语里“沪”是“濾”的新字体，過濾写作過沪）、研→硏、欠→缺、予→豫、瓶→甁、翻→飜、概→槪 等。
// 曾因把它串进 toSimplified/toTraditional，导致用户输入“沪坊”入库/显示成“滤坊”（2026-08 数据污染事件）。
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

// 简体保护字：这些是简体中文正常用字，OpenCC 的 tw→cn/jp→cn 词典会把它们误归并成别的简体字，
// 导致“什么→什幺、沪坊→滤坊”式的静默数据污染。转换前用私用区字符占位、转换后还原，保证简体输入恒等。
// 注意：只能保护“合法简体字”，繁体字（滬、麼…）不在此列，它们应正常归并。
const SIMPLIFIED_GUARDS = { 么: '\uE000' }
const TRADITIONAL_GUARDS = { 幺: '\uE001' }
// 历史污染形态：修复前词典曾把“么→幺、沪→滤”写入数据（什么→什幺）。
// 为兼容检索这类历史脏数据，把词典错误方向形态作为搜索追加变体（纯加法，只用于匹配，永不写入/展示）。
const LEGACY_MISFORMS = { 么: '幺' }
function guard(value, guards) {
  let output = String(value ?? '')
  for (const [ch, placeholder] of Object.entries(guards)) output = output.split(ch).join(placeholder)
  return output
}
function unguard(value, guards) {
  let output = String(value ?? '')
  for (const [ch, placeholder] of Object.entries(guards)) output = output.split(placeholder).join(ch)
  return output
}
function applyMisform(value, misforms) {
  let output = String(value ?? '')
  for (const [source, target] of Object.entries(misforms)) output = output.split(source).join(target)
  return output
}

function toTraditional(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value
  const normalized = applyPhraseFixes(value, TRADITIONAL_PRE_FIXES)
  const guarded = guard(normalized, TRADITIONAL_GUARDS)
  return applyPhraseFixes(unguard(toTraditionalConverter(guarded), TRADITIONAL_GUARDS), TRADITIONAL_POST_FIXES)
}

function toSimplified(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value
  return unguard(toSimplifiedConverter(guard(value, SIMPLIFIED_GUARDS)), SIMPLIFIED_GUARDS)
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
    applyMisform(text, LEGACY_MISFORMS),
    // 日文新字体作为“加法变体”只追加、不替换：搜“泽”能命中“沢”，搜“沪”也能命中历史污染数据“滤”。
    // 加法变体最坏只是多匹配，永远不会改写任何存储值/显示值。
    japaneseToSimplifiedConverter(text),
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
