// 天眼查 AI MCP 客户端：直连 shared core REST 端点查询企业数据
// 文档：https://www.tianyancha.com/ai/guide.md
// 端点：https://mcp.tianyancha.com/v1/core/tools/call

const { query } = require('../config/db')

const CORE_URL = 'https://mcp.tianyancha.com/v1/core/tools/call'

async function getTycToken() {
  const rows = await query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'news.tianyanchaToken' LIMIT 1",
  )
  return rows[0]?.setting_value || null
}

// shared core REST 调用（非 JSON-RPC，直接 POST tool_name + arguments）
async function mcpCall(toolName, args = {}, token) {
  if (!token) throw new Error('天眼查 API token 未配置（系统设置 → news.tianyanchaToken）')
  const response = await fetch(CORE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ tool_name: toolName, arguments: args, format: 'json' }),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`天眼查 MCP 响应非 JSON: HTTP ${response.status} ${text.slice(0, 200)}`) }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`天眼查 MCP HTTP ${response.status}: ${data.error_description || data.error || text.slice(0, 200)}`)
  }
  // 返回格式：{ content: [...] } 或直接 content 对象
  const content = data?.content
  if (typeof content === 'string') {
    try { return JSON.parse(content) } catch { return content }
  }
  return content ?? data
}

// 企业工商登记信息
async function getRegistrationInfo(companyName, token) {
  return mcpCall('get_company_registration_info', { searchKey: companyName }, token)
}

// 企业简介
async function getCompanyProfile(companyName, token) {
  return mcpCall('get_company_profile', { searchKey: companyName }, token)
}

// 主要人员（董事长/总经理等）
async function getKeyPersonnel(companyName, token) {
  return mcpCall('get_key_personnel', { searchKey: companyName }, token)
}

// 企业新闻舆情
async function getNewsSentiment(companyName, token) {
  return mcpCall('get_news_sentiment', { searchKey: companyName }, token)
}

// 企业公告
async function getCompanyAnnouncement(companyName, token) {
  return mcpCall('get_company_announcement', { searchKey: companyName }, token)
}

// 企业风险总览
async function getRiskOverview(companyName, token) {
  return mcpCall('get_risk_overview', { searchKey: companyName }, token)
}

// 企业搜索（锚定主体 ID）
async function searchCompany(companyName, token) {
  return mcpCall('search_company', { searchKey: companyName }, token)
}

module.exports = {
  getTycToken,
  mcpCall,
  getRegistrationInfo,
  getCompanyProfile,
  getKeyPersonnel,
  getNewsSentiment,
  getCompanyAnnouncement,
  getRiskOverview,
  searchCompany,
}
