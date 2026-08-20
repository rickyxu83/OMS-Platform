const assert = require('assert')
const { buildLikeSearchTerms, toSimplified, toTraditional, searchTextVariants } = require('../src/utils/chinese')

// ===== 回归不变量：简体字恒等（防“沪→滤/么→幺”式静默数据污染） =====

// 1) 受害词表：曾被子机(日语新字体)+繁简词典误映射的中文常用词，修复后必须逐字原样保留
const VICTIM_WORDS = [
  '沪坊', '上海沪', '研究', '欠费', '予以', '瓶子', '新郎', '翻译', '概念', '萌芽', '谨慎',
  '什么', '这么', '怎么', '多么', '幺', '么',
]
for (const word of VICTIM_WORDS) {
  const simplified = toSimplified(word)
  assert.strictEqual(simplified, word, `toSimplified 不得改动简体字词: ${word} -> ${simplified}`)
}

// 2) 全字符集恒等：GB2312 一级+二级汉字经 toSimplified 必须逐字不变，
//    白名单仅登记“有意为之”的传统字/异体字归并（乾→干、後→后、於→于 等，共 17 个，均为繁体字正确简化）
const gbkDecoder = new TextDecoder('gbk')
function gb2312HanChars() {
  const out = []
  for (let hi = 0xb0; hi <= 0xf7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      if (hi === 0xd7 && lo > 0xf9) continue
      const decoded = gbkDecoder.decode(Buffer.from([hi, lo]))
      if (decoded && /[\u4e00-\u9fff]/.test(decoded)) out.push(decoded)
    }
  }
  return out
}
const GB2312_HAN = gb2312HanChars()
// 白名单：OpenCC 词典的“传统字→简体”正确归并单字。若未来发现新的简体常用字被误改，应优先加保护字而非白名单。
const TRADITIONAL_SIMPLIFIED_WHITELIST = new Set(['乾', '抬', '著', '菸', '薹', '捱', '摺', '吒', '後', '徵', '夥', '甯', '榘', '於', '麴', '醣', '麽'])
for (const ch of GB2312_HAN) {
  if (TRADITIONAL_SIMPLIFIED_WHITELIST.has(ch)) continue
  const simplified = toSimplified(ch)
  assert.strictEqual(simplified, ch, `GB2312 汉字被 toSimplified 误改: ${ch} -> ${simplified} (U+${ch.codePointAt(0).toString(16)})`)
}

// 3) 繁体方向正确性：典型繁体转换仍必须工作
assert.strictEqual(toTraditional('沪坊'), '滬坊')
assert.strictEqual(toTraditional('什么'), '什麼')
assert.strictEqual(toTraditional('欠费'), '欠費')
assert.strictEqual(toTraditional('翻译'), '翻譯')
assert.strictEqual(toTraditional('谨慎'), '謹慎')

// 4) 搜索加法变体：日文新字体 + 历史污染形态只能“加”不能“替”
const huVariants = searchTextVariants('沪坊')
assert.ok(huVariants.includes('沪坊'), '搜索变体必须保留原值')
assert.ok(huVariants.includes('滬坊'), '搜索变体应含繁体形式')
assert.ok(huVariants.includes('滤坊'), '搜索变体应含历史污染形态(沪→滤)，兼容检索旧脏数据')
const whatVariants = searchTextVariants('什么')
assert.ok(whatVariants.includes('什么'), '搜索变体必须保留原值')
assert.ok(whatVariants.includes('什麼'), '搜索变体应含繁体形式')
assert.ok(whatVariants.includes('什幺'), '搜索变体应含历史污染形态(么→幺)，兼容检索旧脏数据')
const sawaVariants = searchTextVariants('沢田')
assert.ok(sawaVariants.includes('泽田'), '搜索变体应含中文新字体形态(沢→泽)，兼容检索日文数据')

const search = buildLikeSearchTerms('Huawei 华为', 'deviceTerm')
const sql = search.sql(['d.model', 'mp.name'])

assert(sql.includes(' AND '), '空格分隔的关键词应使用 AND 连接')
assert(sql.includes('d.model LIKE'), '每个关键词应搜索设备型号')
assert(sql.includes('mp.name LIKE'), '每个关键词应搜索维保方名称')
assert(Object.values(search.params).includes('%huawei%'))
assert(Object.values(search.params).includes('%华为%'))

const single = buildLikeSearchTerms('OceanStor', 'singleTerm')
assert(!single.sql(['d.model', 'mp.name']).includes(' AND '))

console.log('chinese search tests passed')
