// 客户资讯（公司基本资料）抓取与缓存
// 数据源：天眼查 AI MCP（工商登记、主要人员、企业简介）
// 缓存到 customer_profiles 表，手动刷新或定时更新

const { query } = require('../config/db')
const tyc = require('./tyc-mcp')
const { resolveParent, searchKeywords } = require('./customer-parent-map')

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS customer_profiles (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL UNIQUE,
      company_name VARCHAR(255) DEFAULT NULL COMMENT '工商注册名',
      industry VARCHAR(128) DEFAULT NULL COMMENT '产业/行业',
      legal_person VARCHAR(64) DEFAULT NULL COMMENT '法定代表人',
      registered_capital VARCHAR(64) DEFAULT NULL COMMENT '注册资本',
      found_date VARCHAR(32) DEFAULT NULL COMMENT '成立日期',
      reg_status VARCHAR(32) DEFAULT NULL COMMENT '登记状态',
      company_type VARCHAR(64) DEFAULT NULL COMMENT '企业类型',
      address VARCHAR(500) DEFAULT NULL COMMENT '注册地址',
      website VARCHAR(255) DEFAULT NULL COMMENT '网址',
      phone VARCHAR(64) DEFAULT NULL COMMENT '联系电话',
      email VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
      profile_text TEXT COMMENT '企业简介',
      personnel_json JSON COMMENT '主要人员 [{name,title}]',
      raw_json JSON COMMENT '原始数据备份',
      source VARCHAR(32) DEFAULT 'tianyancha',
      fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_customer_profiles_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
    )`,
  )
}

// 从天眼查抓取客户资讯
// 注意：必须用大陆子公司全名搜（天眼查是大陆企业库，台湾母公司名搜不到）
async function fetchProfile(customerName, token) {
  const [regInfo, profileText, personnel] = await Promise.all([
    tyc.getRegistrationInfo(customerName, token).catch(() => null),
    tyc.getCompanyProfile(customerName, token).catch(() => null),
    tyc.getKeyPersonnel(customerName, token).catch(() => null),
  ])

  // 解析工商登记信息：天眼查 MCP 返回 { sources: { base: {...}, type: {...} } }
  const baseInfo = regInfo?.sources?.base || regInfo?.result?.baseInfo || regInfo?.result || {}
  const contactInfo = regInfo?.sources?.contact || regInfo?.result?.contactInfo || {}

  // 解析主要人员：天眼查返回 { sources: { staff: { items: [...] } } } 或 { result: [...] }
  const personnelList = []
  const staffItems = personnel?.sources?.staff?.items || personnel?.result?.staffList || personnel?.result || []
  if (Array.isArray(staffItems)) {
    for (const person of staffItems.slice(0, 10)) {
      personnelList.push({
        name: person.name || person.personName || '',
        title: person.title || person.position || person.positionName || '',
      })
    }
  }

  return {
    companyName: baseInfo.name || baseInfo.companyName || null,
    industry: baseInfo.industryAll?.categoryBig || baseInfo.industry || baseInfo.industryAll || null,
    legalPerson: baseInfo.legalPersonName || baseInfo.legalPerson || null,
    registeredCapital: baseInfo.regCapital || baseInfo.registeredCapital || null,
    foundDate: baseInfo.estiblishTime || baseInfo.foundDate || baseInfo.establishDate || null,
    regStatus: baseInfo.regStatus || baseInfo.status || null,
    companyType: baseInfo.companyOrgType || baseInfo.companyType || null,
    address: baseInfo.regLocation || baseInfo.address || null,
    website: baseInfo.website || contactInfo.website || null,
    phone: baseInfo.phoneNumber || contactInfo.phoneNumber || contactInfo.phone || null,
    email: baseInfo.email || contactInfo.email || null,
    profileText: typeof profileText === 'string' ? profileText : (profileText?.result?.profile || profileText?.result || null),
    personnel: personnelList,
    raw: { regInfo, profileText, personnel },
  }
}

// 刷新单个客户的资讯
async function refreshCustomerProfile(customerId, token) {
  await ensureTables()
  const customers = await query('SELECT id, name FROM customers WHERE id = :id LIMIT 1', { id: customerId })
  if (!customers[0]) throw new Error('客户不存在')

  const profile = await fetchProfile(customers[0].name, token)

  await query(
    `INSERT INTO customer_profiles
      (customer_id, company_name, industry, legal_person, registered_capital, found_date,
       reg_status, company_type, address, website, phone, email, profile_text, personnel_json, raw_json, fetched_at)
     VALUES
      (:customerId, :companyName, :industry, :legalPerson, :registeredCapital, :foundDate,
       :regStatus, :companyType, :address, :website, :phone, :email, :profileText, :personnel, :raw, NOW())
     ON DUPLICATE KEY UPDATE
      company_name = VALUES(company_name), industry = VALUES(industry),
      legal_person = VALUES(legal_person), registered_capital = VALUES(registered_capital),
      found_date = VALUES(found_date), reg_status = VALUES(reg_status),
      company_type = VALUES(company_type), address = VALUES(address),
      website = VALUES(website), phone = VALUES(phone), email = VALUES(email),
      profile_text = VALUES(profile_text), personnel_json = VALUES(personnel_json),
      raw_json = VALUES(raw_json), fetched_at = NOW()`,
    {
      customerId,
      companyName: profile.companyName?.slice(0, 255) || null,
      industry: profile.industry?.slice(0, 128) || null,
      legalPerson: profile.legalPerson?.slice(0, 64) || null,
      registeredCapital: profile.registeredCapital?.slice(0, 64) || null,
      foundDate: profile.foundDate?.slice(0, 32) || null,
      regStatus: profile.regStatus?.slice(0, 32) || null,
      companyType: profile.companyType?.slice(0, 64) || null,
      address: profile.address?.slice(0, 500) || null,
      website: profile.website?.slice(0, 255) || null,
      phone: profile.phone?.slice(0, 64) || null,
      email: profile.email?.slice(0, 128) || null,
      profileText: profile.profileText || null,
      personnel: JSON.stringify(profile.personnel),
      raw: JSON.stringify(profile.raw),
    },
  )

  return profile
}

// 批量刷新客户资讯（调度器用，分天轮询控制免费额度）
// 免费 token 每天 ~10 次，83 客户分 9 天轮询，每天刷 ~10 个
async function refreshAllProfiles(token, batchSize = 10) {
  if (!token) return { skipped: true, reason: 'no_token' }
  await ensureTables()
  // 按 fetched_at 升序（最久没刷的优先），取前 batchSize 个
  const customers = await query(
    `SELECT c.id, c.name, p.fetched_at
     FROM customers c
     LEFT JOIN customer_profiles p ON p.customer_id = c.id
     ORDER BY COALESCE(p.fetched_at, '1970-01-01') ASC, c.id
     LIMIT ${Math.max(1, Math.min(50, batchSize))}`,
  )
  let updated = 0
  let failed = 0
  for (const customer of customers) {
    try {
      await refreshCustomerProfile(customer.id, token)
      updated++
    } catch (err) {
      failed++
      console.warn(`[customer-profiles] ${customer.name}: ${err.message}`)
      // 402 额度用完立即停止
      if (String(err.message).includes('402')) {
        console.warn('[customer-profiles] 天眼查每日额度已用完，停止本批刷新')
        break
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log(`[customer-profiles] 本批刷新完成：${updated} 成功, ${failed} 失败`)
  return { updated, failed, batchSize: customers.length }
}

// 获取客户资讯
async function getProfile(customerId) {
  await ensureTables()
  const rows = await query(
    `SELECT p.*, c.name AS customer_name, c.level AS customer_level
     FROM customer_profiles p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.customer_id = :customerId LIMIT 1`,
    { customerId },
  )
  if (!rows[0]) return null
  const row = rows[0]
  return {
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerLevel: row.customer_level,
    companyName: row.company_name,
    industry: row.industry,
    legalPerson: row.legal_person,
    registeredCapital: row.registered_capital,
    foundDate: row.found_date,
    regStatus: row.reg_status,
    companyType: row.company_type,
    address: row.address,
    website: row.website,
    phone: row.phone,
    email: row.email,
    profileText: row.profile_text,
    personnel: typeof row.personnel_json === 'string' ? JSON.parse(row.personnel_json) : (row.personnel_json || []),
    source: row.source,
    fetchedAt: row.fetched_at,
  }
}

module.exports = { ensureTables, fetchProfile, refreshCustomerProfile, refreshAllProfiles, getProfile }
