// 客户新闻抓取服务
// 数据源：天眼查 API（方案 B）、同花顺 iFinD API（方案 A）、巨潮/公开资讯观测站公告（方案 C）
// 定时任务每天 2 次刷新，结果存 customer_news 表，首页「客户动态」卡片展示

const { query } = require('../config/db')
const https = require('https')
const http = require('http')
const { resolveParent, searchKeywords, listedInfo, TW_STOCK, CN_STOCK } = require('./customer-parent-map')

// ========== 基础设施 ==========

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS customer_news (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(500) NOT NULL,
      url VARCHAR(1000) DEFAULT NULL,
      source VARCHAR(32) NOT NULL COMMENT 'tianyancha/ifind/cninfo/mops',
      source_name VARCHAR(128) DEFAULT NULL COMMENT '来源名称（如东方财富网）',
      summary TEXT,
      published_at DATETIME DEFAULT NULL,
      fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_customer_title_source (customer_id, title(191), source),
      KEY idx_customer (customer_id, published_at),
      KEY idx_published (published_at),
      CONSTRAINT fk_customer_news_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
    )`,
  )
}

function httpGet(url, { headers = {}, timeout = 15000, maxRedirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const doGet = (currentUrl, redirectsLeft) => {
      const req = client.get(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', ...headers },
        timeout,
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
          const nextUrl = new URL(res.headers.location, currentUrl).href
          return doGet(nextUrl, redirectsLeft - 1)
        }
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    }
    doGet(url, maxRedirects)
  })
}

function httpPost(url, body, { headers = {}, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const payload = typeof body === 'string' ? body : JSON.stringify(body)
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OMS-Platform/1.0',
        ...headers,
      },
      timeout,
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(payload)
    req.end()
  })
}

// ========== 方案 D：东方财富新闻搜索（免费，覆盖率高） ==========
// 搜索母公司名+别名，东方财富新闻库覆盖台企/上市/非上市企业

// 相关性判断：检查文本中关键词是否为有效匹配
// 过滤：①更长词的一部分（如“杰捷安特”含“捷安特”）②行业协会（如“中国信托业协会”）
function isRelevantMatch(text, keyword) {
  if (!text || !keyword) return false
  const idx = text.indexOf(keyword)
  if (idx === -1) return false
  // 前面是中文字符：可能是更长词的一部分（如“杰捷安特”中的“捷安特”）
  if (idx > 0 && /[\u4e00-\u9fff]/.test(text[idx - 1])) return false
  // 后面紧跟协会/行业组织后缀：是行业协会不是公司（如“中国信托业协会”）
  const after = text.slice(idx + keyword.length)
  if (/^(业协会|行业协会|协会|商会|联合会)/.test(after)) return false
  // “X业”开头但不是公司名后缀：是行业术语（如“中国信托业”=信托行业，不是中国信托商业银行）
  if (/^业(?!银行|纸|科技|电子|电脑|橡胶|电梯|通讯|金属|医院|动力|射频|半导体|仪器|净化|兴业|精密|发展)/.test(after)) return false
  return true
}

async function fetchEastmoneyNews(customerName) {
  const { searchKeywords } = require('./customer-parent-map')
  const keywords = searchKeywords(customerName)
  const results = []
  const seenUrls = new Set()
  for (const keyword of keywords.slice(0, 3)) { // 最多搜 3 个关键词
    try {
      const param = JSON.stringify({
        uid: '', keyword, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web', clientVersion: 'curr',
        param: { cmsArticleWebOld: { searchScope: 'default', sort: 'default', pageIndex: 1, pageSize: 5, preTag: '', postTag: '' } },
      })
      const { status, data } = await httpGet(
        `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param=${encodeURIComponent(param)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
      )
      if (status !== 200) continue
      // 去掉 jQuery(...) 包装
      const jsonStr = data.replace(/^jQuery\(/, '').replace(/\)$/, '')
      const json = JSON.parse(jsonStr)
      const items = json?.result?.cmsArticleWebOld || []
      for (const item of items) {
        const title = String(item.title || '').trim()
        const url = item.url || null
        const content = String(item.content || '')
        // 去重：同一 URL 只保留一次（多关键词搜索会命中同篇文章）
        if (url && seenUrls.has(url)) continue
        // 相关性判断（严格模式）：只保留标题有效匹配
        // 内容出现不算——“唯乐高融资”内容提到捷安特、“托克锂产品”内容提到捷安特这类不算客户新闻
        const titleMatch = keywords.some((kw) => isRelevantMatch(title, kw))
        if (!titleMatch) continue
        if (url) seenUrls.add(url)
        results.push({
          title,
          url,
          source: 'eastmoney',
          source_name: item.mediaName || '东方财富',
          summary: content.slice(0, 300),
          published_at: item.date ? new Date(item.date.replace(' ', 'T') + '+08:00') : null,
        })
      }
    } catch { /* 单个关键词失败不影响其他 */ }
  }
  return results
}

// ========== 方案 B：天眼查 API ==========
// 文档：https://open.tianyancha.com

async function fetchTianyanchaNews(customerName, token) {
  if (!token) return []
  const tyc = require('./tyc-mcp')
  const results = []
  try {
    // 用天眼查 MCP 新闻舆情接口（覆盖大陆注册企业，含台企子公司）
    const data = await tyc.getNewsSentiment(customerName, token)
    const items = data?.result?.items || data?.items || (Array.isArray(data) ? data : [])
    for (const item of (Array.isArray(items) ? items : []).slice(0, 5)) {
      results.push({
        title: String(item.title || '').trim(),
        url: item.url || item.link || null,
        source: 'tianyancha',
        source_name: item.source || item.media || '天眼查',
        summary: String(item.content || item.summary || '').slice(0, 300),
        published_at: item.time || item.date || item.publishTime ? new Date(item.time || item.date || item.publishTime) : null,
      })
    }
  } catch { /* 天眼查失败不影响其他源 */ }
  return results
}

// ========== 方案 A：同花顺 iFinD API ==========
// 文档：https://quantapi.51ifind.com

async function fetchIfindNews(customerName, refreshToken) {
  if (!refreshToken) return []
  const parent = resolveParent(customerName)
  const keywords = searchKeywords(customerName)
  const results = []
  for (const keyword of keywords.slice(0, 2)) {
    try {
      // iFinD 新闻搜索接口
      const { status, data } = await httpPost(
        'https://quantapi.51ifind.com/api/v1/news_search',
        { keyword, page: 1, page_size: 5 },
        { headers: { 'Authorization': `Bearer ${refreshToken}` } },
      )
      if (status !== 200) continue
      const json = JSON.parse(data)
      const items = json?.data?.items || json?.result?.items || []
      for (const item of items) {
        results.push({
          title: String(item.title || '').trim(),
          url: item.url || item.link || null,
          source: 'ifind',
          source_name: item.source || '同花顺',
          summary: String(item.summary || item.content || '').slice(0, 300),
          published_at: item.time || item.date ? new Date(item.time || item.date) : null,
        })
      }
    } catch { /* 忽略单个失败 */ }
  }
  return results
}

// ========== 方案 C：上市公司公告抓取 ==========

// C1: 巨潮资讯网（A 股）
async function fetchCninfoAnnouncements(customerName) {
  const listed = listedInfo(customerName)
  if (!listed || listed.exchange !== CN_STOCK) return []
  // 用母公司名搜索（客户全名搜不到）
  const parent = resolveParent(customerName)
  const searchName = parent?.name || customerName
  try {
    const { status, data } = await httpGet(
      `http://www.cninfo.com.cn/new/fulltextSearch/full?searchkey=${encodeURIComponent(searchName)}&sdate=&edate=&isfulltext=false&sortName=pubdate&sortType=desc&pageNum=1&pageSize=5`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
    )
    if (status !== 200) return []
    const json = JSON.parse(data)
    const announcements = json?.announcements || []
    return announcements.map((item) => ({
      title: String(item.announcementTitle || '').replace(/<[^>]+>/g, '').trim(),
      url: item.adjunctUrl ? `http://static.cninfo.com.cn/${item.adjunctUrl}` : null,
      source: 'cninfo',
      source_name: '巨潮资讯',
      summary: null,
      published_at: item.announcementTime ? new Date(Number(item.announcementTime)) : null,
    }))
  } catch { return [] }
}

// C2: 台湾公开资讯观测站（TW 上市）
async function fetchMopsAnnouncements(customerName) {
  const listed = listedInfo(customerName)
  if (!listed || listed.exchange !== TW_STOCK) return []
  try {
    // 公开资讯观测站重大讯息查询
    const { status, data } = await httpGet(
      `https://mops.twse.com.tw/mops/web/ajax_t05st10?encodeURIComponent=1&step=1&keyword=&TYPEK=sii&co_id=${listed.code}&year=${new Date().getFullYear() - 1911}&month=&day=&stype=latest`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
    )
    if (status !== 200) return []
    // 解析 HTML 提取公告标题和日期
    const items = []
    const rows = data.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
    for (const row of rows.slice(0, 8)) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)
      if (!cells || cells.length < 3) continue
      const dateText = cells[0].replace(/<[^>]+>/g, '').trim()
      const title = cells[2].replace(/<[^>]+>/g, '').trim()
      if (!title || title === '主旨') continue
      items.push({
        title,
        url: null,
        source: 'mops',
        source_name: '公开资讯观测站',
        summary: null,
        published_at: parseRocDate(dateText),
      })
    }
    return items.slice(0, 5)
  } catch { return [] }
}

// 民国年转公历：113/10/15 → 2024-10-15
function parseRocDate(rocStr) {
  const match = String(rocStr).match(/(\d+)\/(\d+)\/(\d+)/)
  if (!match) return null
  const year = Number(match[1]) + 1911
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(year, month - 1, day)
}

// ========== 主流程 ==========

async function getSettings() {
  const rows = await query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('news.tianyanchaToken', 'news.ifindRefreshToken', 'news.enabled')",
  )
  const settings = {}
  for (const row of rows) settings[row.setting_key] = row.setting_value
  return settings
}

async function refreshCustomerNews() {
  await ensureTables()
  const settings = await getSettings()
  if (settings['news.enabled'] === 'false') return { skipped: true, reason: 'news_disabled' }

  // 免费源（巨潮+东方财富）全量刷；付费源（天眼查/同花顺）限批 10 个/天
  const hasPaidSource = settings['news.tianyanchaToken'] || settings['news.ifindRefreshToken']
  const batchSize = hasPaidSource ? 500 : 500 // 免费源全量；付费源在循环内单独控制
  const customers = await query(
    `SELECT c.id, c.name, c.level,
            (SELECT MAX(n.fetched_at) FROM customer_news n WHERE n.customer_id = c.id) AS last_fetched
     FROM customers c
     ORDER BY COALESCE(last_fetched, '1970-01-01') ASC, c.level DESC, c.id
     LIMIT ${batchSize}`,
  )
  let totalFetched = 0
  let totalInserted = 0
  let paidCallsToday = 0
  const errors = []

  for (const customer of customers) {
    try {
      const newsItems = []

      // 方案 C：上市公告（免费，不需要 key）
      const cninfoItems = await fetchCninfoAnnouncements(customer.name)
      const mopsItems = await fetchMopsAnnouncements(customer.name)
      newsItems.push(...cninfoItems, ...mopsItems)

      // 方案 D：东方财富新闻搜索（免费，覆盖率高）
      const eastmoneyItems = await fetchEastmoneyNews(customer.name)
      newsItems.push(...eastmoneyItems)

      // 方案 B：天眼查（需要 token，每日限额 ~10 次，超限自动停止）
      if (settings['news.tianyanchaToken'] && paidCallsToday < 10) {
        const tianyanchaItems = await fetchTianyanchaNews(customer.name, settings['news.tianyanchaToken'])
        newsItems.push(...tianyanchaItems)
        paidCallsToday++
      }

      // 方案 A：同花顺（需要 refresh token，每日限额 ~10 次）
      if (settings['news.ifindRefreshToken'] && paidCallsToday < 10) {
        const ifindItems = await fetchIfindNews(customer.name, settings['news.ifindRefreshToken'])
        newsItems.push(...ifindItems)
        paidCallsToday++
      }

      totalFetched += newsItems.length

      // 入库去重（UNIQUE KEY 已有，用 INSERT IGNORE）
      for (const item of newsItems) {
        if (!item.title) continue
        try {
          const result = await query(
            `INSERT IGNORE INTO customer_news (customer_id, title, url, source, source_name, summary, published_at)
             VALUES (:customerId, :title, :url, :source, :sourceName, :summary, :publishedAt)`,
            {
              customerId: customer.id,
              title: item.title.slice(0, 500),
              url: item.url?.slice(0, 1000) || null,
              source: item.source,
              sourceName: item.source_name?.slice(0, 128) || null,
              summary: item.summary?.slice(0, 500) || null,
              publishedAt: item.published_at,
            },
          )
          if (result.affectedRows > 0) totalInserted++
        } catch (err) {
          errors.push(`${customer.name}: ${err.message}`)
        }
      }
    } catch (err) {
      errors.push(`${customer.name}: ${err.message}`)
    }
  }

  // 清理 90 天前的旧新闻
  await query('DELETE FROM customer_news WHERE fetched_at < DATE_SUB(NOW(), INTERVAL 90 DAY)')

  console.log(`[customer-news] 刷新完成：抓取 ${totalFetched} 条，新增 ${totalInserted} 条，错误 ${errors.length} 个`)
  return { fetched: totalFetched, inserted: totalInserted, errors: errors.slice(0, 10) }
}

module.exports = { ensureTables, refreshCustomerNews, fetchCninfoAnnouncements, fetchMopsAnnouncements, fetchEastmoneyNews, fetchTianyanchaNews, fetchIfindNews }
