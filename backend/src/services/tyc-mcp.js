// 天眼查 AI MCP 客户端：直连 MCP HTTP 端点查询企业数据
// 文档：https://www.tianyancha.com/ai/guide.md
// 端点：https://mcp.tianyancha.com/mcp

const { query } = require('../config/db')

const MCP_URL = 'https://mcp.tianyancha.com/mcp'

async function getTycToken() {
  const rows = await query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'news.tianyanchaToken' LIMIT 1",
  )
  return rows[0]?.setting_value || null
}

// MCP JSON-RPC 调用
async function mcpCall(toolName, args = {}, token) {
  if (!token) throw new Error('天眼查 API token 未配置（系统设置 → news.tianyanchaToken）')
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`天眼查 MCP HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  const data = await response.json()
  if (data.error) throw new Error(`天眼查 MCP: ${data.error.message || JSON.stringify(data.error)}`)
  // MCP 返回格式：result.content[0].text 为 JSON 字符串
  const text = data?.result?.content?.[0]?.text || ''
  try { return JSON.parse(text) } catch { return text }
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
