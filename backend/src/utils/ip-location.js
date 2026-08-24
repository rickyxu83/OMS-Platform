const path = require('path')
const Searcher = require('ip2region').default

// 离线 IP 归属地查询（ip2region v4 xdb）。
// 初始化失败或查询失败一律返回空字符串，绝不阻塞业务流程。
let searcher = null
try {
  searcher = new Searcher(path.join(__dirname, '../../data/ip2region_v4.xdb'))
} catch (error) {
  console.error('ip2region init failed:', error.message)
}

/**
 * 解析 IP 归属地，返回展示用字符串：
 * - 国内：省 市 运营商（如 "广东省 深圳市 电信"）
 * - 海外：国家（如 "美国"）；IPv6 库国内数据为主，海外/未收录返回 "未知地区" 或 ""
 * - 内网/本机/链路本地："内网"
 */
const LOCAL_MARKS = ['内网IP', '本机地址', '本地链路单播地址', '本地地址', '链路本地地址']

function resolveIpLocation(ip) {
  if (!searcher || !ip) return ''
  let addr = String(ip).trim()
  if (addr.startsWith('::ffff:')) addr = addr.slice(7)

  try {
    const result = searcher.search(addr)
    if (!result) return ''
    if (LOCAL_MARKS.includes(result.city) || LOCAL_MARKS.includes(result.country) || LOCAL_MARKS.includes(result.isp)) return '内网'

    const clean = (value) => (value && value !== '0' ? value : '')
    const parts = []
    if (clean(result.country) === '中国') {
      parts.push(clean(result.province))
      if (clean(result.city) && clean(result.city) !== clean(result.province)) {
        parts.push(clean(result.city))
      }
    } else {
      parts.push(clean(result.country))
    }
    parts.push(clean(result.isp))
    return parts.filter(Boolean).join(' ')
  } catch {
    return ''
  }
}

module.exports = {
  resolveIpLocation,
}
