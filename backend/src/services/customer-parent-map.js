// 客户 → 母公司/集团 映射（台资企业为主）
// 用于新闻搜索：搜母公司名（新闻量大）而非子公司全名（几乎没结果）
// 有上市代码的标注交易所和代码，供公告抓取（方案 C）

const TW_STOCK = 'TW'   // 台湾证券交易所
const CN_STOCK = 'CN'   // A 股

/**
 * @typedef {Object} ParentCompany
 * @property {string} name - 母公司/集团名（搜索关键词）
 * @property {string} [stockCode] - 上市代码
 * @property {string} [stockExchange] - TW / CN
 * @property {string[]} [aliases] - 额外搜索别名（简写、英文名等）
 */

/** @type {Record<string, ParentCompany>} key 为匹配模式（用于匹配客户名） */
const PARENT_MAP = {
  // === 联咏科技 Novatek ===
  '联咏科技': { name: '联咏科技', stockCode: '3034', stockExchange: TW_STOCK, aliases: ['Novatek', '联咏'] },

  // === 永丰余 ===
  '永丰余纸业': { name: '永丰余', stockCode: '1907', stockExchange: TW_STOCK, aliases: ['永丰余集团', 'Yuen Foong Yu'] },
  '永丰馀纸业': { name: '永丰余', stockCode: '1907', stockExchange: TW_STOCK, aliases: ['永丰余集团'] },
  '永丰余造纸': { name: '永丰余', stockCode: '1907', stockExchange: TW_STOCK, aliases: ['永丰余集团'] },
  '永丰馀造纸': { name: '永丰余', stockCode: '1907', stockExchange: TW_STOCK, aliases: ['永丰余集团'] },
  '永丰余集团': { name: '永丰余', stockCode: '1907', stockExchange: TW_STOCK },

  // === 捷安特 Giant ===
  '捷安特': { name: '捷安特', stockCode: '9921', stockExchange: TW_STOCK, aliases: ['Giant', '巨大集团'] },

  // === 颀中科技 ChipMOS ===
  '颀中科技': { name: '颀中科技', stockCode: '688352', stockExchange: CN_STOCK, aliases: ['ChipMOS'] },

  // === 矽品科技 SPIL (日月光投控) ===
  '矽品科技': { name: '矽品科技', stockCode: '2325', stockExchange: TW_STOCK, aliases: ['SPIL', '日月光', 'ASE'] },

  // === 华硕 ASUS ===
  '华硕科技': { name: '华硕', stockCode: '2357', stockExchange: TW_STOCK, aliases: ['ASUS', '华硕电脑'] },

  // === 华硕子公司华普 ===
  '华普电子': { name: '华硕', stockCode: '2357', stockExchange: TW_STOCK, aliases: ['ASUS'] },

  // === 台湾土地银行 ===
  '台湾土地银行': { name: '台湾土地银行', aliases: ['土地银行', 'Land Bank'] },

  // === 中国信托 CTBC ===
  '中国信托商业银行': { name: '中国信托', stockCode: '2891', stockExchange: TW_STOCK, aliases: ['中国信托金融控股', '中信金', 'CTBC'] },

  // === 精元电脑 ===
  '精元电脑': { name: '精元电脑', aliases: [] },

  // === 启佳通讯 / 启新通讯（启基科技 WNC）===
  '启佳通讯': { name: '启基科技', stockCode: '6285', stockExchange: TW_STOCK, aliases: ['WNC', '启基'] },
  '启新通讯': { name: '启基科技', stockCode: '6285', stockExchange: TW_STOCK, aliases: ['WNC', '启基'] },

  // === 达方电子 Darfon ===
  '达方电子': { name: '达方电子', stockCode: '8163', stockExchange: TW_STOCK, aliases: ['Darfon'] },

  // === 联茂电子 ITEQ ===
  '联茂电子': { name: '联茂电子', stockCode: '6213', stockExchange: TW_STOCK, aliases: ['ITEQ'] },

  // === 兴勤电子 Thinking ===
  '兴勤': { name: '兴勤电子', stockCode: '2428', stockExchange: TW_STOCK, aliases: ['Thinking'] },

  // === 正新橡胶 Maxxis ===
  '正新橡胶': { name: '正新橡胶', stockCode: '2105', stockExchange: TW_STOCK, aliases: ['Maxxis', '玛吉斯'] },

  // === 李长荣化工 LCY ===
  '李长荣': { name: '李长荣化工', stockCode: '1704', stockExchange: TW_STOCK, aliases: ['LCY', '李长荣'] },

  // === 永大电梯 ===
  '永大电梯': { name: '永大电梯', stockCode: '1507', stockExchange: TW_STOCK, aliases: ['永大'] },

  // === 特力集团 ===
  '特力集团': { name: '特力集团', stockCode: '2908', stockExchange: TW_STOCK, aliases: ['特力'] },

  // === 新世电子（台达电子子公司）===
  '新世电子': { name: '新世电子', aliases: ['新世'] },

  // === 镭亚电子 ===
  '镭亚电子': { name: '镭亚电子', aliases: ['镭亚'] },

  // === 京隆科技 ===
  '京隆科技': { name: '京隆科技', aliases: ['京隆'] },

  // === 世巨科技 ===
  '世巨科技': { name: '世巨科技', aliases: [] },

  // === 华仪电子 ===
  '华仪电子': { name: '华仪电子', aliases: [] },

  // === 太普动力 ===
  '太普动力': { name: '太普动力', aliases: [] },

  // === 全讯射频 ===
  '全讯射频': { name: '全讯射频', aliases: [] },

  // === 咏传电子 ===
  '咏传电子': { name: '咏传电子', aliases: [] },

  // === 通嘉科技 ===
  '通嘉科技': { name: '通嘉科技', aliases: [] },

  // === 华腾微电子 ===
  '华腾微电子': { name: '华腾微电子', aliases: [] },

  // === 磐时电子 ===
  '磐时电子': { name: '磐时电子', aliases: [] },

  // === 旭福半导体 ===
  '旭福半导体': { name: '旭福半导体', aliases: [] },

  // === 欣芯半导体 ===
  '欣芯半导体': { name: '欣芯半导体', aliases: [] },

  // === 宏远发展 ===
  '宏远发展': { name: '宏远发展', aliases: [] },

  // === 禾新医院 ===
  '禾新医院': { name: '禾新医院', aliases: ['禾新'] },
}

/**
 * 从客户全名提取母公司信息
 * @param {string} customerName - 客户全名（如 "联咏科技（苏州）有限公司"）
 * @returns {ParentCompany | null}
 */
function resolveParent(customerName) {
  if (!customerName) return null
  // 按 key 长度降序匹配（优先更具体的匹配）
  const keys = Object.keys(PARENT_MAP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (customerName.includes(key)) return PARENT_MAP[key]
  }
  return null
}

/**
 * 获取客户的搜索关键词列表（母公司名 + 别名）
 * @param {string} customerName
 * @returns {string[]}
 */
function searchKeywords(customerName) {
  const parent = resolveParent(customerName)
  if (!parent) {
    // 无映射：尝试从全名提取核心名（去掉地区后缀和公司后缀）
    const core = customerName
      .replace(/[（(][^）)]*[）)]/g, '')  // 去括号内容（地区）
      .replace(/(有限公司|股份有限公司|分公司|公司)$/, '')
      .trim()
    return core ? [core] : [customerName]
  }
  const keywords = [parent.name]
  if (parent.aliases) keywords.push(...parent.aliases)
  return keywords
}

/**
 * 获取上市代码信息（用于公告抓取）
 * @param {string} customerName
 * @returns {{ code: string, exchange: string } | null}
 */
function listedInfo(customerName) {
  const parent = resolveParent(customerName)
  if (parent?.stockCode) return { code: parent.stockCode, exchange: parent.stockExchange }
  return null
}

module.exports = { PARENT_MAP, resolveParent, searchKeywords, listedInfo, TW_STOCK, CN_STOCK }
