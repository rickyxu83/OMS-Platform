// 客户资讯（公司基本资料）抓取与缓存
// 数据源：天眼查 AI MCP（工商登记、企业简介、风险总览——均为免费层可用接口）
// 缓存到 customer_profiles 表，手动刷新或定时更新
// 注意：主要人员/股东/司法明细等接口均需 VIP，免费 token 调了只会 403，不要加回来

const { query } = require('../config/db')
const tyc = require('./tyc-mcp')

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
      personnel_json JSON COMMENT '主要人员 [{name,title}]（VIP 接口，免费层不再更新）',
      raw_json JSON COMMENT '原始数据备份',
      changed_fields JSON COMMENT '本次刷新变更的字段名列表',
      source VARCHAR(32) DEFAULT 'tianyancha',
      fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_customer_profiles_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
    )`,
  )
  // 兼容已有表：按需补列
  const ADD_COLUMNS = [
    "changed_fields JSON COMMENT '本次刷新变更的字段名列表'",
    "credit_code VARCHAR(32) DEFAULT NULL COMMENT '统一社会信用代码'",
    "business_scope TEXT COMMENT '经营范围'",
    "social_staff_num INT DEFAULT NULL COMMENT '社保人数'",
    "staff_range VARCHAR(32) DEFAULT NULL COMMENT '人员规模'",
    "tags VARCHAR(255) DEFAULT NULL COMMENT '企业标签'",
    "actual_capital VARCHAR(64) DEFAULT NULL COMMENT '实缴资本'",
    "parent_company VARCHAR(255) DEFAULT NULL COMMENT '母公司/集团'",
    "business_term VARCHAR(64) DEFAULT NULL COMMENT '营业期限'",
    "reg_institute VARCHAR(128) DEFAULT NULL COMMENT '登记机关'",
    "tyc_company_id BIGINT DEFAULT NULL COMMENT '天眼查公司 ID（拼官网链接）'",
    "risk_json JSON COMMENT '风险总览 {toolRisks,warnings,fetchedAt}'",
  ]
  const existing = await query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE() AND table_name = 'customer_profiles'`,
  )
  const have = new Set(existing.map((r) => r.COLUMN_NAME))
  for (const col of ADD_COLUMNS) {
    const name = col.split(' ')[0]
    if (!have.has(name)) await query(`ALTER TABLE customer_profiles ADD COLUMN ${col}`)
  }
}

// 解析风险总览：只保留决策需要的计数（原始返回 ~100KB，大部分是股东变更噪音）
function parseRiskOverview(data) {
  if (!data || typeof data !== 'object') return null
  const toolRisks = (Array.isArray(data.toolRisks) ? data.toolRisks : [])
    .map((t) => ({ level: t.riskLevel || '', type: t.riskType || '', count: Number(t.count) || 0 }))
    .filter((t) => t.type)
  const warnings = (Array.isArray(data.warningRisks) ? data.warningRisks : [])
    .map((w) => ({ level: w.riskLevel || '', type: w.riskType || '', count: Number(w.count) || 0 }))
    .filter((w) => w.type)
  return { toolRisks, warnings, fetchedAt: new Date().toISOString() }
}

// 从天眼查抓取客户资讯
// 注意：必须用大陆子公司全名搜（天眼查是大陆企业库，台湾母公司名搜不到）
// 额度控制：lite=true 只调工商登记（1 次/客户，调度器用）
//          lite=false 调工商登记 + 企业简介 + 风险总览（3 次/客户，手动全量刷新用）
async function fetchProfile(customerName, token, { lite = true } = {}) {
  const [regInfo, profileText, riskOverview] = await Promise.all([
    tyc.getRegistrationInfo(customerName, token).catch(() => null),
    lite ? Promise.resolve(null) : tyc.getCompanyProfile(customerName, token).catch(() => null),
    lite ? Promise.resolve(null) : tyc.getRiskOverview(customerName, token).catch(() => null),
  ])

  // 解析工商登记信息：天眼查 MCP 返回 { sources: { base: {...}, type: {...} } }
  const baseInfo = regInfo?.sources?.base || regInfo?.result?.baseInfo || regInfo?.result || {}
  const contactInfo = regInfo?.sources?.contact || regInfo?.result?.contactInfo || {}

  const businessTerm = baseInfo.fromTime || baseInfo.toTime
    ? `${baseInfo.fromTime || '?'} ~ ${baseInfo.toTime || '长期'}`
    : null

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
    creditCode: baseInfo.creditCode || null,
    businessScope: baseInfo.businessScope || null,
    socialStaffNum: Number.isFinite(Number(baseInfo.socialStaffNum)) && baseInfo.socialStaffNum != null ? Number(baseInfo.socialStaffNum) : null,
    staffRange: baseInfo.staffNumRange || null,
    tags: typeof baseInfo.tags === 'string' ? baseInfo.tags : (Array.isArray(baseInfo.tags) ? baseInfo.tags.join(';') : null),
    actualCapital: baseInfo.actualCapital || null,
    parentCompany: baseInfo.property3 || null,
    businessTerm,
    regInstitute: baseInfo.regInstitute || null,
    tycCompanyId: baseInfo.id || null,
    profileText: typeof profileText === 'string' ? profileText : (profileText?.content?.profile || profileText?.profile || profileText?.result?.profile || profileText?.result || null),
    risk: parseRiskOverview(riskOverview?.content || riskOverview),
    raw: { regInfo, profileText, riskOverview },
  }
}

// 刷新单个客户的资讯
// mode='full'：工商登记 + 简介 + 风险总览（3 次调用）
// mode='risk'：只刷风险总览（1 次调用，合并进已有记录；无记录时自动升级为 full）
async function refreshCustomerProfile(customerId, token, { mode = 'full' } = {}) {
  await ensureTables()
  const customers = await query('SELECT id, name FROM customers WHERE id = :id LIMIT 1', { id: customerId })
  if (!customers[0]) throw new Error('客户不存在')

  // 先取旧数据用于变更对比
  const oldRows = await query('SELECT * FROM customer_profiles WHERE customer_id = :customerId LIMIT 1', { customerId })
  const oldProfile = oldRows[0] || null

  if (mode === 'risk' && oldProfile) {
    const riskData = await tyc.getRiskOverview(customers[0].name, token)
    const risk = parseRiskOverview(riskData?.content || riskData)
    await query(
      'UPDATE customer_profiles SET risk_json = :risk WHERE customer_id = :customerId',
      { customerId, risk: JSON.stringify(risk) },
    )
    return { ...rowToProfile({ ...oldProfile, risk_json: risk }), changedFields: [] }
  }

  const profile = await fetchProfile(customers[0].name, token, { lite: false })

  // 对比变更字段
  const TRACKED_FIELDS = ['company_name', 'industry', 'legal_person', 'registered_capital', 'found_date', 'reg_status', 'company_type', 'address', 'website', 'phone', 'social_staff_num', 'tags']
  const changedFields = []
  if (oldProfile) {
    const newValues = {
      company_name: profile.companyName, industry: profile.industry, legal_person: profile.legalPerson,
      registered_capital: profile.registeredCapital, found_date: profile.foundDate, reg_status: profile.regStatus,
      company_type: profile.companyType, address: profile.address, website: profile.website, phone: profile.phone,
      social_staff_num: profile.socialStaffNum, tags: profile.tags,
    }
    for (const field of TRACKED_FIELDS) {
      const oldVal = String(oldProfile[field] ?? '').trim()
      const newVal = String(newValues[field] ?? '').trim()
      if (oldVal !== newVal) changedFields.push(field)
    }
  }

  // mode='risk' 但无缓存记录：只建基础档案 + 风险，不重复调工商/简介
  // （此时 fetchProfile 已全量调过，直接落库即可，两种模式到这里走的是同一段）

  await query(
    `INSERT INTO customer_profiles
      (customer_id, company_name, industry, legal_person, registered_capital, found_date,
       reg_status, company_type, address, website, phone, email, profile_text,
       credit_code, business_scope, social_staff_num, staff_range, tags, actual_capital,
       parent_company, business_term, reg_institute, tyc_company_id, risk_json,
       raw_json, changed_fields, fetched_at)
     VALUES
      (:customerId, :companyName, :industry, :legalPerson, :registeredCapital, :foundDate,
       :regStatus, :companyType, :address, :website, :phone, :email, :profileText,
       :creditCode, :businessScope, :socialStaffNum, :staffRange, :tags, :actualCapital,
       :parentCompany, :businessTerm, :regInstitute, :tycCompanyId, :risk,
       :raw, :changedFields, NOW())
     ON DUPLICATE KEY UPDATE
      company_name = VALUES(company_name), industry = VALUES(industry),
      legal_person = VALUES(legal_person), registered_capital = VALUES(registered_capital),
      found_date = VALUES(found_date), reg_status = VALUES(reg_status),
      company_type = VALUES(company_type), address = VALUES(address),
      website = VALUES(website), phone = VALUES(phone), email = VALUES(email),
      profile_text = VALUES(profile_text),
      credit_code = VALUES(credit_code), business_scope = VALUES(business_scope),
      social_staff_num = VALUES(social_staff_num), staff_range = VALUES(staff_range),
      tags = VALUES(tags), actual_capital = VALUES(actual_capital),
      parent_company = VALUES(parent_company), business_term = VALUES(business_term),
      reg_institute = VALUES(reg_institute), tyc_company_id = VALUES(tyc_company_id),
      risk_json = VALUES(risk_json),
      raw_json = VALUES(raw_json), changed_fields = VALUES(changed_fields), fetched_at = NOW()`,
    {
      customerId,
      companyName: profile.companyName?.slice(0, 255) || null,
      industry: String(profile.industry || '')?.slice(0, 128) || null,
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
      creditCode: profile.creditCode?.slice(0, 32) || null,
      businessScope: profile.businessScope || null,
      socialStaffNum: profile.socialStaffNum,
      staffRange: profile.staffRange?.slice(0, 32) || null,
      tags: profile.tags?.slice(0, 255) || null,
      actualCapital: profile.actualCapital?.slice(0, 64) || null,
      parentCompany: profile.parentCompany?.slice(0, 255) || null,
      businessTerm: profile.businessTerm?.slice(0, 64) || null,
      regInstitute: profile.regInstitute?.slice(0, 128) || null,
      tycCompanyId: profile.tycCompanyId || null,
      risk: JSON.stringify(profile.risk),
      raw: JSON.stringify(profile.raw),
      changedFields: JSON.stringify(changedFields),
    },
  )

  return { ...profile, changedFields }
}

// 批量刷新客户资讯（调度器用，分天轮询控制免费额度）
// 免费 token 每天 ~10 次，lite 模式每客户 1 次（只工商登记），83 客户分 9 天轮询
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
      const profile = await fetchProfile(customer.name, token, { lite: true })
      if (!profile.companyName) { failed++; continue }
      await query(
        `INSERT INTO customer_profiles
          (customer_id, company_name, industry, legal_person, registered_capital, found_date,
           reg_status, company_type, address, website, phone, email,
           credit_code, business_scope, social_staff_num, staff_range, tags, actual_capital,
           parent_company, business_term, reg_institute, tyc_company_id,
           raw_json, changed_fields, fetched_at)
         VALUES
          (:customerId, :companyName, :industry, :legalPerson, :registeredCapital, :foundDate,
           :regStatus, :companyType, :address, :website, :phone, :email,
           :creditCode, :businessScope, :socialStaffNum, :staffRange, :tags, :actualCapital,
           :parentCompany, :businessTerm, :regInstitute, :tycCompanyId,
           :raw, '[]', NOW())
         ON DUPLICATE KEY UPDATE
          company_name = VALUES(company_name), industry = VALUES(industry),
          legal_person = VALUES(legal_person), registered_capital = VALUES(registered_capital),
          found_date = VALUES(found_date), reg_status = VALUES(reg_status),
          company_type = VALUES(company_type), address = VALUES(address),
          website = VALUES(website), phone = VALUES(phone), email = VALUES(email),
          credit_code = VALUES(credit_code), business_scope = VALUES(business_scope),
          social_staff_num = VALUES(social_staff_num), staff_range = VALUES(staff_range),
          tags = VALUES(tags), actual_capital = VALUES(actual_capital),
          parent_company = VALUES(parent_company), business_term = VALUES(business_term),
          reg_institute = VALUES(reg_institute), tyc_company_id = VALUES(tyc_company_id),
          raw_json = VALUES(raw_json), changed_fields = '[]', fetched_at = NOW()`,
        {
          customerId: customer.id,
          companyName: profile.companyName?.slice(0, 255) || null,
          industry: String(profile.industry || '')?.slice(0, 128) || null,
          legalPerson: profile.legalPerson?.slice(0, 64) || null,
          registeredCapital: profile.registeredCapital?.slice(0, 64) || null,
          foundDate: profile.foundDate?.slice(0, 32) || null,
          regStatus: profile.regStatus?.slice(0, 32) || null,
          companyType: profile.companyType?.slice(0, 64) || null,
          address: profile.address?.slice(0, 500) || null,
          website: profile.website?.slice(0, 255) || null,
          phone: profile.phone?.slice(0, 64) || null,
          email: profile.email?.slice(0, 128) || null,
          creditCode: profile.creditCode?.slice(0, 32) || null,
          businessScope: profile.businessScope || null,
          socialStaffNum: profile.socialStaffNum,
          staffRange: profile.staffRange?.slice(0, 32) || null,
          tags: profile.tags?.slice(0, 255) || null,
          actualCapital: profile.actualCapital?.slice(0, 64) || null,
          parentCompany: profile.parentCompany?.slice(0, 255) || null,
          businessTerm: profile.businessTerm?.slice(0, 64) || null,
          regInstitute: profile.regInstitute?.slice(0, 128) || null,
          tycCompanyId: profile.tycCompanyId || null,
          raw: JSON.stringify(profile.raw),
        },
      )
      updated++
    } catch (err) {
      failed++
      console.warn(`[customer-profiles] ${customer.name}: ${err.message}`)
      // 额度用完立即停止
      if (String(err.message).includes('402') || String(err.message).includes('额度') || String(err.message).includes('quota')) {
        console.warn('[customer-profiles] 天眼查每日额度已用完，停止本批刷新')
        break
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log(`[customer-profiles] 本批刷新完成：${updated} 成功, ${failed} 失败`)
  return { updated, failed, batchSize: customers.length }
}

function rowToProfile(row) {
  const parseJson = (v, fallback) => {
    if (v == null) return fallback
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
    return v
  }
  const risk = parseJson(row.risk_json, null)
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
    creditCode: row.credit_code,
    businessScope: row.business_scope,
    socialStaffNum: row.social_staff_num,
    staffRange: row.staff_range,
    tags: row.tags,
    actualCapital: row.actual_capital,
    parentCompany: row.parent_company,
    businessTerm: row.business_term,
    regInstitute: row.reg_institute,
    tycCompanyId: row.tyc_company_id != null ? Number(row.tyc_company_id) : null,
    tycUrl: row.tyc_company_id ? `https://www.tianyancha.com/company/${row.tyc_company_id}` : null,
    risk,
    personnel: parseJson(row.personnel_json, []),
    changedFields: parseJson(row.changed_fields, []),
    source: row.source,
    fetchedAt: row.fetched_at,
  }
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
  return rowToProfile(rows[0])
}

module.exports = { ensureTables, fetchProfile, refreshCustomerProfile, refreshAllProfiles, getProfile }
