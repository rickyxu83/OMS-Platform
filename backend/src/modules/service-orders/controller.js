const fs = require('fs')
const path = require('path')
const { query, transaction } = require('../../config/db')
const env = require('../../config/env')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { buildOrderNo } = require('../../utils/order-no')
const { customerNameKey, toTraditional, toTraditionalDeep } = require('../../utils/chinese')
const { normalizePhoneNumber } = require('../../utils/phone')
const { sendAssignmentMail } = require('../../services/mail')
const { generateTimesheetWorkSummary } = require('./work-summary')
const { generateSelfReportAiDraft, selfReportAiDraftStatus } = require('./ai-draft')
const { buildServiceRecordPdf, buildServiceRecordsPdf, serviceRecordPdfFilename } = require('./service-record-pdf')
const { nextCustomerCode } = require('../customers/controller')
const { ensureFilePurposeColumn } = require('../files/controller')
const { ROLE_GROUPS } = require('../../permissions/roles')
const {
  assertSalesCanAccessSalesperson,
  buildSalesCustomerScope,
} = require('../../permissions/sales-scope')

const uploadRoot = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.resolve(env.rootDir, env.uploadDir)
const signatureRoot = path.join(uploadRoot, 'signatures')
fs.mkdirSync(signatureRoot, { recursive: true })

let serviceReportTravelColumnsReady = false
let selfReportDraftsTableReady = false
let serviceOrderInspectionColumnsReady = false
let servicePartsColumnsReady = false

const orderColumns = `
  so.id, so.order_no, so.customer_id, c.name AS customer_name, c.address AS customer_address,
  c.salesperson AS customer_salesperson,
  COALESCE(
    NULLIF(so.contact_name, ''),
    NULLIF((
      SELECT sr.customer_name
      FROM service_reports sr
      WHERE sr.service_order_id = so.id
      ORDER BY sr.id DESC
      LIMIT 1
    ), ''),
    c.contact_name
  ) AS contact_name,
  COALESCE(NULLIF(so.contact_phone, ''), c.contact_phone) AS contact_phone,
  so.contact_name AS order_contact_name, so.contact_phone AS order_contact_phone,
  so.device_id,
  COALESCE(NULLIF(d.model, ''), NULLIF(d.name, ''), NULLIF(d.serial_no, '')) AS device_name,
  so.service_mode, so.service_type, so.timesheet_category, so.timesheet_salesperson,
  so.priority, so.status, so.issue_description, so.assigned_engineer_id,
  u.real_name AS engineer_name, so.inspection_schedule_id, so.inspection_occurrence_date,
  so.target_engineer_id, target_u.real_name AS target_engineer_name, target_u.username AS target_engineer_username,
  so.confirmed_by, confirmer.real_name AS confirmed_by_name, so.confirmed_at,
  so.planned_start_at, so.planned_end_at, so.internal_note,
  so.created_by, so.submitted_at, so.reviewed_by, so.reviewed_at, so.review_comment,
  so.archived_at, so.created_at, so.updated_at
`

const broadListRoles = new Set(['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales_supervisor'])
const engineerScopedRoles = new Set(ROLE_GROUPS.serviceOrderEngineer)

async function hasInspectionDocument(orderId) {
  await ensureFilePurposeColumn()
  const rows = await query(
    `SELECT id
     FROM files
     WHERE owner_type IN ('service_order', 'service_report')
       AND owner_id = :orderId
       AND purpose = 'inspection_document'
     LIMIT 1`,
    { orderId },
  )
  return Boolean(rows[0])
}

function splitSearchTerms(value) {
  return String(value || '')
    .trim()
    .split(/[\s,，、]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function serviceOrderSearchClause(index) {
  const likeParam = `:likeKeyword${index}`
  return `
        (
          so.order_no LIKE ${likeParam}
          OR c.name LIKE ${likeParam}
          OR c.address LIKE ${likeParam}
          OR d.name LIKE ${likeParam}
          OR d.model LIKE ${likeParam}
          OR d.serial_no LIKE ${likeParam}
          OR so.issue_description LIKE ${likeParam}
          OR so.internal_note LIKE ${likeParam}
          OR so.timesheet_category LIKE ${likeParam}
          OR so.timesheet_salesperson LIKE ${likeParam}
          OR so.service_type LIKE ${likeParam}
          OR so.service_mode LIKE ${likeParam}
          OR so.status LIKE ${likeParam}
          OR CASE so.service_type
               WHEN 'install' THEN '安装 install'
               WHEN 'repair' THEN '排障 维修 repair'
               WHEN 'maintain' THEN '保养 维护 maintain'
               WHEN 'inspect' THEN '巡检 巡检类 inspect'
               WHEN 'training' THEN '培训 training'
               WHEN 'remote' THEN '远程 远程支持 remote'
               WHEN 'other' THEN '其他 other'
               ELSE COALESCE(so.service_type, '')
             END LIKE ${likeParam}
          OR CASE so.service_mode
               WHEN 'onsite' THEN '现场 现场服务 onsite'
               WHEN 'remote' THEN '远程 远程服务 remote'
               WHEN 'office' THEN '内勤 内勤工作 office'
               ELSE COALESCE(so.service_mode, '')
             END LIKE ${likeParam}
          OR CASE so.status
               WHEN 'draft' THEN '草稿 draft'
               WHEN 'pending_confirmation' THEN '待确认 pending confirmation'
               WHEN 'assigned' THEN '已派发 assigned'
               WHEN 'in_progress' THEN '进行中 in progress'
               WHEN 'submitted' THEN '已结案 submitted'
               WHEN 'approved' THEN '已审核 approved'
               WHEN 'archived' THEN '已归档 archived'
               WHEN 'cancelled' THEN '已作废 cancelled'
               WHEN 'completed' THEN '已完成 completed'
               WHEN 'rejected' THEN '已退回 rejected'
               ELSE COALESCE(so.status, '')
             END LIKE ${likeParam}
          OR u.real_name LIKE ${likeParam}
          OR u.username LIKE ${likeParam}
          OR target_u.real_name LIKE ${likeParam}
          OR target_u.username LIKE ${likeParam}
          OR EXISTS (
            SELECT 1
            FROM service_order_engineers keyword_soe
            JOIN users keyword_u ON keyword_u.id = keyword_soe.engineer_id
            WHERE keyword_soe.service_order_id = so.id
              AND (keyword_u.real_name LIKE ${likeParam} OR keyword_u.username LIKE ${likeParam})
          )
        )`
}

function orderPayload(row) {
  const targetEngineerName = row.target_engineer_name || row.target_engineer_username
  return {
    id: row.id,
    orderNo: row.order_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    contactName: row.contact_name,
    contactPhone: normalizePhoneNumber(row.contact_phone) || row.contact_phone,
    deviceId: row.device_id,
    deviceName: row.device_name,
    serviceMode: row.service_mode || 'onsite',
    serviceType: row.service_type,
    timesheetCategory: row.timesheet_category,
    timesheetSalesperson: row.timesheet_salesperson,
    priority: row.priority,
    status: publicStatus(row.status),
    workflowStatus: row.status,
    issueDescription: row.issue_description,
    engineerName: row.engineer_name || (row.status === 'pending_confirmation' ? targetEngineerName : null),
    inspectionScheduleId: row.inspection_schedule_id,
    inspectionOccurrenceDate: row.inspection_occurrence_date,
    targetEngineerId: row.target_engineer_id,
    targetEngineerName,
    pendingConfirmation: row.status === 'pending_confirmation',
    confirmedBy: row.confirmed_by,
    confirmedByName: row.confirmed_by_name,
    confirmedAt: row.confirmed_at,
    serviceAt: row.planned_start_at || row.submitted_at || row.created_at,
    engineers: row.engineers || [],
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    internalNote: row.internal_note,
    createdBy: row.created_by,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment,
    report: reportPayload(row.report),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function publicStatus(status) {
  if (status === 'pending_confirmation') return 'pending_confirmation'
  if (status === 'assigned' || status === 'rejected') return 'draft'
  if (status === 'approved' || status === 'archived') return 'submitted'
  return status
}

async function ensureServiceOrderInspectionColumns(connection = null) {
  if (!connection && serviceOrderInspectionColumnsReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  const [rows] = await execute(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND column_name IN (
         'contact_name', 'contact_phone',
         'inspection_schedule_id', 'inspection_occurrence_date', 'target_engineer_id', 'confirmed_by', 'confirmed_at'
       )`,
  )
  const existing = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!existing.has('contact_name')) {
    await execute('ALTER TABLE service_orders ADD COLUMN contact_name VARCHAR(64) NULL AFTER customer_id')
  }
  if (!existing.has('contact_phone')) {
    await execute('ALTER TABLE service_orders ADD COLUMN contact_phone VARCHAR(32) NULL AFTER contact_name')
  }
  if (!existing.has('contact_name') || !existing.has('contact_phone')) {
    await execute(
      `UPDATE service_orders so
       LEFT JOIN service_reports sr ON sr.service_order_id = so.id
       JOIN customers c ON c.id = so.customer_id
       SET so.contact_name = COALESCE(NULLIF(so.contact_name, ''), NULLIF(sr.customer_name, ''), c.contact_name),
           so.contact_phone = COALESCE(NULLIF(so.contact_phone, ''), c.contact_phone)
       WHERE so.contact_name IS NULL OR so.contact_name = '' OR so.contact_phone IS NULL OR so.contact_phone = ''`,
    )
  }
  if (!existing.has('inspection_schedule_id')) {
    await execute('ALTER TABLE service_orders ADD COLUMN inspection_schedule_id BIGINT UNSIGNED NULL AFTER internal_note')
  }
  if (!existing.has('inspection_occurrence_date')) {
    await execute('ALTER TABLE service_orders ADD COLUMN inspection_occurrence_date DATE NULL AFTER inspection_schedule_id')
  }
  if (!existing.has('target_engineer_id')) {
    await execute('ALTER TABLE service_orders ADD COLUMN target_engineer_id BIGINT UNSIGNED NULL AFTER inspection_occurrence_date')
  }
  if (!existing.has('confirmed_by')) {
    await execute('ALTER TABLE service_orders ADD COLUMN confirmed_by BIGINT UNSIGNED NULL AFTER target_engineer_id')
  }
  if (!existing.has('confirmed_at')) {
    await execute('ALTER TABLE service_orders ADD COLUMN confirmed_at DATETIME NULL AFTER confirmed_by')
  }

  const [statusRows] = await execute(
    `SELECT column_type AS columnType
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND column_name = 'status'
     LIMIT 1`,
  )
  const statusType = statusRows[0]?.columnType || statusRows[0]?.column_type || ''
  if (!String(statusType).includes("'pending_confirmation'")) {
    await execute(
      `ALTER TABLE service_orders MODIFY COLUMN status ENUM(
        'draft', 'pending_confirmation', 'assigned', 'in_progress', 'submitted', 'rejected', 'approved', 'archived', 'cancelled'
      ) NOT NULL DEFAULT 'draft'`,
    )
  }

  const [indexRows] = await execute(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_orders'
       AND index_name IN (
         'uk_service_orders_inspection_occurrence', 'idx_service_orders_target_engineer', 'idx_service_orders_inspection_schedule'
       )`,
  )
  const indexes = new Set(indexRows.map((row) => row.indexName || row.index_name))
  if (!indexes.has('uk_service_orders_inspection_occurrence')) {
    await execute('ALTER TABLE service_orders ADD UNIQUE KEY uk_service_orders_inspection_occurrence (inspection_schedule_id, inspection_occurrence_date)')
  }
  if (!indexes.has('idx_service_orders_target_engineer')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_target_engineer (target_engineer_id)')
  }
  if (!indexes.has('idx_service_orders_inspection_schedule')) {
    await execute('ALTER TABLE service_orders ADD KEY idx_service_orders_inspection_schedule (inspection_schedule_id)')
  }

  if (!connection) {
    serviceOrderInspectionColumnsReady = true
  }
}

function shanghaiDateKey(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000)
  date.setUTCDate(date.getUTCDate() - offsetDays)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeMonth(month) {
  const value = String(month || '').trim()
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value
  return shanghaiDateKey(0).slice(0, 7)
}

function normalizeDateInput(value, fallback) {
  const text = String(value || '').trim()
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text)) return text
  return fallback
}

function timesheetDateRange(query = {}) {
  const month = normalizeMonth(query.month)
  const fallbackStart = `${month}-01`
  const fallbackEnd = `${month}-31`
  let startDate = normalizeDateInput(query.startDate, fallbackStart)
  let endDate = normalizeDateInput(query.endDate, fallbackEnd)
  if (startDate > endDate) {
    const temp = startDate
    startDate = endDate
    endDate = temp
  }
  const label = startDate === fallbackStart && endDate === fallbackEnd ? month : `${startDate} 至 ${endDate}`
  return { month, startDate, endDate, label }
}

function weekdayText(dateText) {
  const [year, month, day] = String(dateText).split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getUTCDay()]
}

function timesheetType(serviceType, serviceMode = 'onsite') {
  if (serviceMode === 'office') return ['内部工作', '其他']
  if (serviceMode === 'remote') return ['远程服务', '排障']
  const map = {
    install: ['售后服务', '安装'],
    repair: ['维护服务', '排障'],
    maintain: ['维护服务', '保养'],
    inspect: ['维护服务', '巡检'],
    training: ['售后服务', '培训'],
    other: ['维护服务', '其他'],
  }
  return map[serviceType] || map.other
}

function normalizeManualEntryCategory(value) {
  const category = String(value || '').trim()
  const allowed = new Set(['方案准备', '文档整理', '网络会议', '培训学习', '其他'])
  return allowed.has(category) ? category : ''
}

function normalizeProgress(value) {
  return String(value || '已完成').trim() || '已完成'
}

function normalizeReportResult(value) {
  const result = String(value || '').trim()
  return ['resolved', 'unresolved', 'follow_up_required'].includes(result) ? result : null
}

function normalizePartActionType(value, fallback = 'general') {
  const actionType = String(value || fallback || 'general').trim()
  return ['replacement', 'installation', 'general'].includes(actionType) ? actionType : 'general'
}

async function ensureTimesheetManualEntriesTable(connection = null) {
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS timesheet_manual_entries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      engineer_id BIGINT UNSIGNED NOT NULL,
      entry_date DATE NOT NULL,
      category VARCHAR(64) NOT NULL,
      customer_project VARCHAR(128) NULL,
      work_content TEXT NOT NULL,
      progress VARCHAR(64) NULL,
      remark VARCHAR(255) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_timesheet_manual_entries_engineer_date (engineer_id, entry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

async function ensureServiceReportWorkEntriesTable(connection = null) {
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS service_report_work_entries (
      service_order_id BIGINT UNSIGNED NOT NULL,
      engineer_id BIGINT UNSIGNED NOT NULL,
      work_content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (service_order_id, engineer_id),
      KEY idx_service_report_work_entries_engineer_id (engineer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

async function ensureServiceReportTravelColumns() {
  if (serviceReportTravelColumnsReady) return
  const rows = await query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_reports'
       AND column_name IN ('departure_at', 'return_at')`,
  )
  const existing = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!existing.has('departure_at')) {
    await query('ALTER TABLE service_reports ADD COLUMN departure_at DATETIME NULL AFTER service_order_id')
  }
  if (!existing.has('return_at')) {
    await query('ALTER TABLE service_reports ADD COLUMN return_at DATETIME NULL AFTER actual_end_at')
  }
  serviceReportTravelColumnsReady = true
}

async function ensureSelfReportDraftsTable(connection = null) {
  if (!connection && selfReportDraftsTableReady) return
  const executor = connection || { execute: query }
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS self_report_drafts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      engineer_id BIGINT UNSIGNED NOT NULL,
      draft_scope VARCHAR(16) NOT NULL,
      service_order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      payload_json LONGTEXT NOT NULL,
      client_updated_at VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_self_report_drafts_engineer_scope_order (engineer_id, draft_scope, service_order_id),
      KEY idx_self_report_drafts_service_order_id (service_order_id),
      CONSTRAINT fk_self_report_drafts_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  if (!connection) {
    selfReportDraftsTableReady = true
  }
}

async function ensureServicePartsColumns(connection = null) {
  if (!connection && servicePartsColumnsReady) return
  const execute = connection ? connection.execute.bind(connection) : async (sql, params = {}) => [await query(sql, params)]
  await execute(
    `CREATE TABLE IF NOT EXISTS service_parts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      service_order_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NULL,
      action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general',
      part_name VARCHAR(128) NOT NULL,
      part_no VARCHAR(128) NULL,
      quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
      unit VARCHAR(32) NULL,
      remark VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_service_parts_order_id (service_order_id),
      KEY idx_service_parts_device_id (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const [columnRows] = await execute(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_parts'
       AND column_name IN ('device_id', 'action_type')`,
  )
  const columns = new Set(columnRows.map((row) => row.columnName || row.column_name))
  if (!columns.has('device_id')) {
    await execute('ALTER TABLE service_parts ADD COLUMN device_id BIGINT UNSIGNED NULL AFTER service_order_id')
  }
  if (!columns.has('action_type')) {
    await execute(
      "ALTER TABLE service_parts ADD COLUMN action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general' AFTER device_id",
    )
  }

  const [indexRows] = await execute(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_parts'
       AND index_name = 'idx_service_parts_device_id'`,
  )
  if (!indexRows.length) {
    await execute('ALTER TABLE service_parts ADD KEY idx_service_parts_device_id (device_id)')
  }

  if (!connection) {
    servicePartsColumnsReady = true
  }
}

function normalizeDraftScope(orderId) {
  return Number(orderId) > 0 ? 'edit' : 'create'
}

function normalizeDraftOrderId(orderId) {
  const value = Number(orderId || 0)
  return value > 0 ? value : 0
}

function parseDraftPayload(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeWorkEntries(workEntries = []) {
  if (!Array.isArray(workEntries)) return []
  const entries = []
  const seen = new Set()
  for (const entry of workEntries) {
    const engineerId = Number(entry?.engineerId || entry?.engineer_id || 0)
    const workContent = String(entry?.workContent || entry?.work_content || '').trim()
    if (!engineerId || !workContent || seen.has(engineerId)) continue
    seen.add(engineerId)
    entries.push({ engineerId, workContent })
  }
  return entries
}

function mergedWorkContent(entries, fallback = '') {
  const filledEntries = Array.isArray(entries)
    ? entries
        .map((entry) => ({
          engineerName: String(entry?.engineerName || entry?.engineer_name || '').trim(),
          workContent: String(entry?.workContent || entry?.work_content || '').trim(),
        }))
        .filter((entry) => entry.workContent)
    : []
  if (filledEntries.length === 1) return filledEntries[0].workContent
  if (filledEntries.length > 1) {
    return filledEntries.map((entry) => `${entry.engineerName || '工程师'}：\n${entry.workContent}`).join('\n\n')
  }
  return String(fallback || '').trim()
}

function joinTimesheetWorkContent(...values) {
  const parts = []
  const seen = new Set()
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    parts.push(text)
  }
  return parts.join('\n')
}

function hasSubmittedWorkContent(workContent, workEntries) {
  return Boolean(String(workContent || '').trim() || normalizeWorkEntries(workEntries).length)
}

function idParams(ids, prefix = 'id') {
  const params = {}
  const placeholders = ids.map((id, index) => {
    const key = `${prefix}${index}`
    params[key] = id
    return `:${key}`
  })
  return { params, placeholders: placeholders.join(',') }
}

async function loadWorkEntries(orderIds) {
  await ensureServiceReportWorkEntriesTable()
  if (!orderIds.length) return new Map()
  const params = orderIds.reduce((values, id, index) => {
    values[`orderId${index}`] = id
    return values
  }, {})
  const rows = await query(
    `SELECT srwe.service_order_id, srwe.engineer_id, srwe.work_content, srwe.created_at, srwe.updated_at,
            u.real_name AS engineer_name, u.username AS engineer_username
     FROM service_report_work_entries srwe
     JOIN users u ON u.id = srwe.engineer_id
     WHERE srwe.service_order_id IN (${orderIds.map((_, index) => `:orderId${index}`).join(',')})
     ORDER BY srwe.updated_at ASC, srwe.created_at ASC, srwe.engineer_id ASC`,
    params,
  )
  return rows.reduce((groups, row) => {
    if (!groups.has(row.service_order_id)) groups.set(row.service_order_id, [])
    groups.get(row.service_order_id).push({
      engineerId: row.engineer_id,
      engineerName: row.engineer_name || row.engineer_username || '工程师',
      workContent: row.work_content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
    return groups
  }, new Map())
}

async function saveWorkEntries(connection, orderId, workEntries, fallbackWorkContent, currentEngineerId) {
  const normalizedEntries = normalizeWorkEntries(workEntries)
  const hasExplicitEntries = Array.isArray(workEntries)
  const currentId = Number(currentEngineerId || 0)

  if (currentId) {
    const currentEntry = normalizedEntries.find((entry) => Number(entry.engineerId) === currentId)
    const currentWorkContent = currentEntry?.workContent || (hasExplicitEntries ? '' : String(fallbackWorkContent || '').trim())
    if (currentWorkContent) {
      await connection.execute(
        `INSERT INTO service_report_work_entries (service_order_id, engineer_id, work_content)
         VALUES (:orderId, :engineerId, :workContent)
         ON DUPLICATE KEY UPDATE
           work_content = VALUES(work_content),
           updated_at = CURRENT_TIMESTAMP`,
        { orderId, engineerId: currentId, workContent: currentWorkContent },
      )
    } else {
      await connection.execute(
        `DELETE FROM service_report_work_entries
         WHERE service_order_id = :orderId AND engineer_id = :engineerId`,
        { orderId, engineerId: currentId },
      )
    }
  } else {
    const replacementEntries = [...normalizedEntries]
    if (!replacementEntries.length) {
      const fallback = String(fallbackWorkContent || '').trim()
      if (fallback) replacementEntries.push({ engineerId: 0, workContent: fallback })
    }
    const keepEngineerIds = []
    for (const entry of replacementEntries.filter((item) => item.engineerId)) {
      keepEngineerIds.push(entry.engineerId)
      await connection.execute(
        `INSERT INTO service_report_work_entries (service_order_id, engineer_id, work_content)
         VALUES (:orderId, :engineerId, :workContent)
         ON DUPLICATE KEY UPDATE
           work_content = VALUES(work_content),
           updated_at = CURRENT_TIMESTAMP`,
        { orderId, engineerId: entry.engineerId, workContent: entry.workContent },
      )
    }
    if (keepEngineerIds.length) {
      const params = keepEngineerIds.reduce(
        (values, id, index) => {
          values[`engineerId${index}`] = id
          return values
        },
        { orderId },
      )
      await connection.execute(
        `DELETE FROM service_report_work_entries
         WHERE service_order_id = :orderId
           AND engineer_id NOT IN (${keepEngineerIds.map((_, index) => `:engineerId${index}`).join(',')})`,
        params,
      )
    }
  }

  const [rows] = await connection.execute(
    `SELECT srwe.engineer_id, srwe.work_content, u.real_name AS engineer_name, u.username AS engineer_username
     FROM service_report_work_entries srwe
     JOIN users u ON u.id = srwe.engineer_id
     WHERE srwe.service_order_id = :orderId
     ORDER BY srwe.updated_at ASC, srwe.created_at ASC, srwe.engineer_id ASC`,
    { orderId },
  )
  return rows.map((row) => ({
    engineerId: row.engineer_id,
    engineerName: row.engineer_name || row.engineer_username || '工程师',
    workContent: row.work_content,
  }))
}

async function pruneWorkEntriesToEngineers(connection, orderId, engineerIds) {
  const keepEngineerIds = [...new Set((engineerIds || []).map(Number).filter(Boolean))]
  if (!keepEngineerIds.length) {
    await connection.execute('DELETE FROM service_report_work_entries WHERE service_order_id = :orderId', { orderId })
    return []
  }
  const params = keepEngineerIds.reduce(
    (values, id, index) => {
      values[`engineerId${index}`] = id
      return values
    },
    { orderId },
  )
  await connection.execute(
    `DELETE FROM service_report_work_entries
     WHERE service_order_id = :orderId
       AND engineer_id NOT IN (${keepEngineerIds.map((_, index) => `:engineerId${index}`).join(',')})`,
    params,
  )
}

function reportPayload(row) {
  if (!row) return null
  return {
    id: row.id,
    serviceOrderId: row.service_order_id,
    departureAt: row.departure_at,
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    returnAt: row.return_at,
    workContent: row.work_content,
    workEntries: row.workEntries || [],
    result: row.result,
    resultDescription: row.result_description,
    customerConfirmName: row.customer_name,
    customerName: row.customer_name,
    customerSignatureFileId: row.customer_signature_file_id,
    customerSignature: row.customer_signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseSignatureDataUrl(dataUrl) {
  if (!dataUrl) return null
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) return null
  if (buffer.length > 1024 * 1024) {
    throw badRequest('签名图片过大')
  }
  return {
    mimeType: match[1],
    extension: match[1] === 'image/jpeg' ? 'jpg' : 'png',
    buffer,
  }
}

async function saveSignatureFile(connection, orderId, dataUrl, userId) {
  const parsed = parseSignatureDataUrl(dataUrl)
  if (!parsed) return null

  const filename = `signature-${orderId}-${Date.now()}.${parsed.extension}`
  const storagePath = path.join(signatureRoot, filename)
  await fs.promises.writeFile(storagePath, parsed.buffer)

  const [result] = await connection.execute(
    `INSERT INTO files (owner_type, owner_id, original_name, storage_path, mime_type, size, uploaded_by)
     VALUES ('signature', :ownerId, :originalName, :storagePath, :mimeType, :size, :uploadedBy)`,
    {
      ownerId: orderId,
      originalName: filename,
      storagePath,
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      uploadedBy: userId,
    },
  )

  return result.insertId
}

async function validateReusableSignatureFile(connection, fileId) {
  const id = Number(fileId || 0)
  if (!id) return null
  const [rows] = await connection.execute(
    `SELECT id
     FROM files
     WHERE id = :id
       AND owner_type = 'signature'
     LIMIT 1`,
    { id },
  )
  return rows[0] ? id : null
}

async function signatureDataUrl(fileId) {
  if (!fileId) return ''
  const rows = await query('SELECT storage_path, mime_type FROM files WHERE id = :id LIMIT 1', { id: fileId })
  const file = rows[0]
  if (!file) return ''
  try {
    const buffer = await fs.promises.readFile(file.storage_path)
    return `data:${file.mime_type};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

async function hydrateReportSignature(report) {
  if (!report) return null
  if (report.customer_signature_file_id) {
    return {
      ...report,
      customer_signature: await signatureDataUrl(report.customer_signature_file_id),
    }
  }
  return report
}

async function getOrder(id) {
  await ensureServiceOrderInspectionColumns()
  const rows = await query(
    `SELECT ${orderColumns}
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN users u ON u.id = so.assigned_engineer_id
     LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
     LEFT JOIN users confirmer ON confirmer.id = so.confirmed_by
     WHERE so.id = :id
     LIMIT 1`,
    { id },
  )
  return rows[0]
}

function assertEditable(order) {
  if (['approved', 'archived', 'cancelled'].includes(order.status)) {
    throw badRequest('当前状态不允许修改')
  }
}

async function writeAudit(connection, actorId, targetId, action, detail = {}) {
  await connection.execute(
    `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
     VALUES (:actorId, 'service_order', :targetId, :action, :detailJson)`,
    {
      actorId,
      targetId,
      action,
      detailJson: JSON.stringify(detail),
    },
  )
}

function normalizeCustomerContactPhone(phone) {
  return normalizePhoneNumber(phone)
}

function cleanupStorageFiles(filePaths = []) {
  for (const filePath of filePaths) {
    if (filePath) fs.rm(filePath, { force: true }, () => {})
  }
}

async function deleteFileRowsForOrderIds(connection, orderIds) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [orderIds]).map(Number).filter(Boolean))]
  if (!ids.length) return []
  const found = idParams(ids, 'fileOrderId')
  const [rows] = await connection.execute(
    `SELECT id, storage_path
     FROM files
     WHERE (owner_type = 'service_order' AND owner_id IN (${found.placeholders}))
        OR (owner_type = 'service_report' AND owner_id IN (${found.placeholders}))
        OR (
          owner_type = 'signature'
          AND owner_id IN (${found.placeholders})
          AND NOT EXISTS (
            SELECT 1
            FROM service_reports sr
            WHERE sr.customer_signature_file_id = files.id
              AND sr.service_order_id NOT IN (${found.placeholders})
          )
        )`,
    found.params,
  )
  if (!rows.length) return []
  const fileIds = idParams(rows.map((row) => row.id), 'deleteFileId')
  await connection.execute(`DELETE FROM files WHERE id IN (${fileIds.placeholders})`, fileIds.params)
  return rows.map((row) => row.storage_path).filter(Boolean)
}

async function recordCustomerContact(connection, customerId, name, phone = null, engineerId = null) {
  if (!customerId || !name) return
  const normalizedPhone = normalizeCustomerContactPhone(phone)

  const [existingRows] = await connection.execute(
    `SELECT id, use_count
     FROM customer_contacts
     WHERE customer_id = :customerId AND name = :name
     ORDER BY last_used_at DESC, id DESC`,
    { customerId, name },
  )
  if (existingRows[0]) {
    const keeper = existingRows[0]
    const duplicateIds = existingRows.slice(1).map((row) => row.id)
    const duplicateUseCount = existingRows.slice(1).reduce((total, row) => total + Number(row.use_count || 0), 0)
    await connection.execute(
      `UPDATE customer_contacts
       SET phone = COALESCE(:phone, phone),
           use_count = use_count + :duplicateUseCount + 1,
           last_used_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: keeper.id, phone: normalizedPhone || null, duplicateUseCount },
    )
    if (duplicateIds.length) {
      await mergeDuplicateCustomerContacts(connection, keeper.id, duplicateIds)
    }
    if (engineerId) {
      await recordCustomerContactUsage(connection, keeper.id, engineerId)
    }
    return
  }

  const [result] = await connection.execute(
    `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
     VALUES (:customerId, :name, :phone, 1, CURRENT_TIMESTAMP)`,
    {
      customerId,
      name,
      phone: normalizedPhone || null,
    },
  )
  if (engineerId && result.insertId) {
    await recordCustomerContactUsage(connection, result.insertId, engineerId)
  }
}

async function recordCustomerContactUsage(connection, customerContactId, engineerId) {
  await connection.execute(
    `INSERT INTO customer_contact_usage (customer_contact_id, engineer_id, use_count, last_used_at)
     VALUES (:customerContactId, :engineerId, 1, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       use_count = use_count + 1,
       last_used_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    {
      customerContactId,
      engineerId,
    },
  )
}

async function mergeDuplicateCustomerContacts(connection, keeperId, duplicateIds) {
  if (!duplicateIds.length) return
  const params = duplicateIds.reduce(
    (values, id, index) => {
      values[`duplicateId${index}`] = id
      return values
    },
    { keeperId },
  )
  const placeholders = duplicateIds.map((_, index) => `:duplicateId${index}`).join(',')
  const [usageRows] = await connection.execute(
    `SELECT engineer_id, SUM(use_count) AS use_count, MAX(last_used_at) AS last_used_at
     FROM customer_contact_usage
     WHERE customer_contact_id IN (${placeholders})
     GROUP BY engineer_id`,
    params,
  )
  for (const usage of usageRows) {
    await connection.execute(
      `INSERT INTO customer_contact_usage (customer_contact_id, engineer_id, use_count, last_used_at)
       VALUES (:keeperId, :engineerId, :useCount, :lastUsedAt)
       ON DUPLICATE KEY UPDATE
         use_count = use_count + VALUES(use_count),
         last_used_at = GREATEST(last_used_at, VALUES(last_used_at)),
         updated_at = CURRENT_TIMESTAMP`,
      {
        keeperId,
        engineerId: usage.engineer_id,
        useCount: Number(usage.use_count || 0),
        lastUsedAt: usage.last_used_at,
      },
    )
  }
  await connection.execute(`DELETE FROM customer_contact_usage WHERE customer_contact_id IN (${placeholders})`, params)
  await connection.execute(`DELETE FROM customer_contacts WHERE id IN (${placeholders})`, params)
}

function normalizeEngineerIds(engineerIds, currentUserId) {
  return [...new Set([currentUserId, ...(Array.isArray(engineerIds) ? engineerIds : [])].map(Number).filter(Boolean))]
}

async function replaceOrderEngineers(connection, orderId, engineerIds, joinedBy) {
  await connection.execute('DELETE FROM service_order_engineers WHERE service_order_id = :orderId', { orderId })
  for (const engineerId of engineerIds) {
    await connection.execute(
      `INSERT INTO service_order_engineers (service_order_id, engineer_id, joined_by)
       VALUES (:orderId, :engineerId, :joinedBy)`,
      { orderId, engineerId, joinedBy },
    )
  }
}

async function listOrderEngineers(orderIds) {
  if (!orderIds.length) return new Map()
  const params = orderIds.reduce((values, id, index) => {
    values[`orderId${index}`] = id
    return values
  }, {})
  const rows = await query(
    `SELECT soe.service_order_id, u.id, u.real_name, u.username, u.phone, u.email, u.engineer_signature
     FROM service_order_engineers soe
     JOIN users u ON u.id = soe.engineer_id
     WHERE soe.service_order_id IN (${orderIds.map((_, index) => `:orderId${index}`).join(',')})
     ORDER BY soe.created_at ASC, u.real_name ASC`,
    params,
  )
  return rows.reduce((groups, row) => {
    if (!groups.has(row.service_order_id)) groups.set(row.service_order_id, [])
    groups.get(row.service_order_id).push({
      id: row.id,
      realName: row.real_name,
      username: row.username,
      phone: normalizePhoneNumber(row.phone) || row.phone,
      email: row.email,
      engineerSignature: row.engineer_signature || '',
    })
    return groups
  }, new Map())
}

async function attachEngineers(rows) {
  const engineersByOrder = await listOrderEngineers(rows.map((row) => row.id))
  return rows.map((row) => ({
    ...row,
    engineers:
      engineersByOrder.get(row.id) ||
      (row.assigned_engineer_id
        ? [
            {
              id: row.assigned_engineer_id,
              realName: row.engineer_name,
              username: null,
              phone: null,
              engineerSignature: '',
            },
          ]
        : []),
  }))
}

function triggerAssignmentMail(order, orderId = order?.id) {
  sendAssignmentMail(order, order?.engineers || [])
    .then((result) => {
      if (result?.skipped) {
        console.warn('[mail] assignment notification skipped', {
          orderId,
          reason: result.reason || 'unknown',
          missing: result.missing,
          engineerIds: result.engineerIds,
        })
      }
    })
    .catch((error) => {
      console.error('[mail] assignment notification failed', { orderId, message: error?.message })
    })
}

async function attachReports(rows) {
  const orderIds = rows.map((row) => Number(row.id)).filter(Boolean)
  if (!orderIds.length) return rows
  const found = idParams(orderIds, 'orderId')
  const [reportsByOrder, workEntriesByOrder] = await Promise.all([
    query(
      `SELECT sr.*
       FROM service_reports sr
       JOIN (
         SELECT service_order_id, MAX(id) AS latest_report_id
         FROM service_reports
         WHERE service_order_id IN (${found.placeholders})
         GROUP BY service_order_id
       ) latest
         ON latest.latest_report_id = sr.id`,
      found.params,
    ),
    loadWorkEntries(orderIds),
  ])
  const reportMap = reportsByOrder.reduce((groups, row) => {
    groups.set(Number(row.service_order_id), {
      ...row,
      workEntries: workEntriesByOrder.get(Number(row.service_order_id)) || [],
    })
    return groups
  }, new Map())
  return rows.map((row) => ({ ...row, report: reportMap.get(Number(row.id)) || null }))
}

function isMineRequest(req) {
  return ['1', 'true', 'yes'].includes(String(req.query?.mine || '').toLowerCase())
}

async function participantCanAccess(orderId, user) {
  const rows = await query(
    `SELECT 1
     FROM service_orders so
     WHERE so.id = :orderId
       AND (
         so.assigned_engineer_id = :engineerId
         OR EXISTS (
           SELECT 1
           FROM service_order_engineers soe
           WHERE soe.service_order_id = so.id AND soe.engineer_id = :engineerId
         )
       )
     LIMIT 1`,
    { orderId, engineerId: user.id },
  )
  return Boolean(rows[0])
}

async function assertEngineerOwns(order, user) {
  if (!engineerScopedRoles.has(user.role)) return
  if (Number(order.assigned_engineer_id) === Number(user.id)) return
  if (await participantCanAccess(order.id, user)) return
  throw forbidden('只能操作自己参与的服务单')
}

async function assertCanViewOrder(order, user, options = {}) {
  if (user.role === 'sales') {
    assertSalesCanAccessSalesperson(order.customer_salesperson, user, forbidden)
    return
  }

  if (user.role === 'engineer' || (options.mine && engineerScopedRoles.has(user.role))) {
    await assertEngineerOwns(order, user)
  }
}

function buildListQueryParts(req) {
  const {
    status = null,
    customerId = null,
    engineerId = null,
    keyword = '',
    customer = '',
    startDate = '',
    endDate = '',
    sortBy = 'createdAt',
    sortDir = 'desc',
  } = req.query
  const mineQuery = isMineRequest(req)
  const isEngineer = req.user.role === 'engineer'
  const isBroadRole = broadListRoles.has(req.user.role)
  const canListBroadly = isBroadRole && !mineQuery
  const effectiveEngineerId = (mineQuery || isEngineer) ? req.user.id : canListBroadly ? engineerId || null : null
  const salesScope = buildSalesCustomerScope(req.user, 'c')
  let statusWhereSql = '1 = 1'
  if (status === 'draft') {
    statusWhereSql = "so.status IN ('draft', 'assigned', 'rejected')"
  } else if (status === 'submitted') {
    statusWhereSql = "so.status IN ('submitted', 'approved', 'archived')"
  } else if (status) {
    statusWhereSql = 'so.status = :status'
  }
  const sortColumns = {
    orderNo: 'so.order_no',
    customerName: 'c.name',
    deviceName: "COALESCE(NULLIF(d.model, ''), NULLIF(d.name, ''), NULLIF(d.serial_no, ''))",
    serviceType: 'so.service_type',
    priority: 'so.priority',
    engineerName: 'u.real_name',
    status: 'so.status',
    serviceAt: 'COALESCE(so.planned_start_at, so.submitted_at, so.created_at)',
    plannedStartAt: 'COALESCE(so.planned_start_at, so.submitted_at, so.created_at)',
    createdAt: 'so.id',
  }
  const sortColumn = sortColumns[sortBy] || sortColumns.createdAt
  const sortDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  const keywordTerms = splitSearchTerms(keyword)
  const keywordWhereSql = keywordTerms.length
    ? keywordTerms.map((_, index) => serviceOrderSearchClause(index)).join('\n        AND ')
    : '1 = 1'
  const keywordParams = keywordTerms.reduce((params, term, index) => {
    params[`likeKeyword${index}`] = `%${term}%`
    return params
  }, {})

  const fromAndWhere = `
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN devices d ON d.id = so.device_id
    LEFT JOIN users u ON u.id = so.assigned_engineer_id
    LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
    LEFT JOIN users confirmer ON confirmer.id = so.confirmed_by
    WHERE ${statusWhereSql}
      AND (:customerId IS NULL OR so.customer_id = :customerId)
      AND (:customer = '' OR c.name LIKE :likeCustomer)
      AND (:startDate = '' OR DATE(COALESCE(so.planned_start_at, so.submitted_at, so.created_at)) >= :startDate)
      AND (:endDate = '' OR DATE(COALESCE(so.planned_start_at, so.submitted_at, so.created_at)) <= :endDate)
      AND (
        :engineerId IS NULL
        OR so.assigned_engineer_id = :engineerId
        OR EXISTS (
          SELECT 1 FROM service_order_engineers soe
          WHERE soe.service_order_id = so.id AND soe.engineer_id = :engineerId
        )
      )
      ${salesScope.sql}
      AND (${keywordWhereSql})
  `
  const params = {
    status: status || null,
    customerId: customerId || null,
    engineerId: effectiveEngineerId,
    keyword,
    customer,
    startDate,
    endDate,
    likeCustomer: `%${customer}%`,
    ...keywordParams,
    ...salesScope.params,
  }
  return { params, fromAndWhere, sortColumn, sortDirection }
}

async function list(req, res) {
  await ensureServiceOrderInspectionColumns()
  const { page = '1', pageSize = '20' } = req.query
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
  const offset = (normalizedPage - 1) * normalizedPageSize
  const { params, fromAndWhere, sortColumn, sortDirection } = buildListQueryParts(req)

  const countRows = await query(`SELECT COUNT(*) AS total ${fromAndWhere}`, params)
  const rows = await query(
    `SELECT ${orderColumns}
     ${fromAndWhere}
     ORDER BY ${sortColumn} ${sortDirection}, so.id DESC
     LIMIT ${normalizedPageSize} OFFSET ${offset}`,
    {
      ...params,
    },
  )

  res.json({
    items: (await attachReports(await attachEngineers(rows))).map(orderPayload),
    total: Number(countRows[0].total),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  })
}

async function statsOverview(req, res) {
  await ensureServiceOrderInspectionColumns()
  const salesScope = buildSalesCustomerScope(req.user, 'c')

  const [summaryRows, trendRows, recentRows] = await Promise.all([
    query(
      `SELECT
         SUM(DATE(COALESCE(so.submitted_at, so.created_at)) = CURDATE()) AS todayTotal,
         SUM(DATE_FORMAT(COALESCE(so.submitted_at, so.created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS monthTotal,
         COUNT(DISTINCT CASE
           WHEN DATE_FORMAT(COALESCE(so.submitted_at, so.created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
           THEN so.customer_id
         END) AS monthCustomers
       FROM service_orders so
       JOIN customers c ON c.id = so.customer_id
       WHERE 1 = 1
       ${salesScope.sql}`,
      salesScope.params,
    ),
    query(
      `SELECT DATE(COALESCE(so.submitted_at, so.created_at)) AS service_date, COUNT(*) AS total
       FROM service_orders so
       JOIN customers c ON c.id = so.customer_id
       WHERE DATE(COALESCE(so.submitted_at, so.created_at)) >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
       ${salesScope.sql}
       GROUP BY service_date
       ORDER BY service_date ASC`,
      salesScope.params,
    ),
    query(
      `SELECT ${orderColumns}
       FROM service_orders so
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN devices d ON d.id = so.device_id
       LEFT JOIN users u ON u.id = so.assigned_engineer_id
       LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
       LEFT JOIN users confirmer ON confirmer.id = so.confirmed_by
       WHERE 1 = 1
       ${salesScope.sql}
       ORDER BY so.id DESC
       LIMIT 8`,
      salesScope.params,
    ),
  ])

  const engineerRows = await query(
    `SELECT COUNT(*) AS total
     FROM service_order_engineers soe
     JOIN service_orders so ON so.id = soe.service_order_id
     JOIN customers c ON c.id = so.customer_id
     WHERE DATE_FORMAT(COALESCE(so.submitted_at, so.created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
     ${salesScope.sql}`,
    salesScope.params,
  )

  const trendMap = new Map(trendRows.map((row) => [String(row.service_date).slice(0, 10), Number(row.total)]))
  const trend = []
  for (let index = 13; index >= 0; index -= 1) {
    const key = shanghaiDateKey(index)
    trend.push({
      date: key,
      total: trendMap.get(key) || 0,
    })
  }

  const summary = summaryRows[0] || {}
  res.json({
    summary: {
      todayTotal: Number(summary.todayTotal || 0),
      monthTotal: Number(summary.monthTotal || 0),
      monthCustomers: Number(summary.monthCustomers || 0),
      monthEngineerVisits: Number(engineerRows[0]?.total || 0),
    },
    trend,
    recent: (await attachEngineers(recentRows)).map(orderPayload),
  })
}

async function timesheetMonthly(req, res) {
  await ensureServiceOrderInspectionColumns()
  await ensureTimesheetManualEntriesTable()
  const includeWorkSummary = String(req.query.includeWorkSummary || '') === '1'
  if (includeWorkSummary && req.user.role === 'assistant') {
    throw forbidden('助理无权生成 AI 运营总结')
  }
  const { month, startDate, endDate, label } = timesheetDateRange(req.query)
  const requestedEngineerId = req.user.role === 'engineer' || (isMineRequest(req) && engineerScopedRoles.has(req.user.role))
    ? req.user.id
    : req.query.engineerId || ''
  const filterEngineerId = requestedEngineerId && requestedEngineerId !== 'all' ? Number(requestedEngineerId) : null
  const engineerFilterSql = filterEngineerId ? 'AND participants.engineer_id = :engineerId' : ''
  const salesScope = buildSalesCustomerScope(req.user, 'c')
  const requestedCustomerId = String(req.query.customerId || '').trim()
  const filterCustomerId = requestedCustomerId && requestedCustomerId !== 'all' ? Number(requestedCustomerId) : null
  const customerFilterSql = filterCustomerId ? 'AND so.customer_id = :customerId' : ''
  const requestedSalesperson = String(req.query.salesperson || '').trim()
  const filterSalesperson = req.user.role === 'sales' || requestedSalesperson === 'all' ? '' : requestedSalesperson
  const salespersonFilterSql = filterSalesperson
    ? filterSalesperson === '__unassigned'
      ? "AND (c.salesperson IS NULL OR c.salesperson = '')"
      : 'AND c.salesperson = :salesperson'
    : ''

  const rows = await query(
    `SELECT
       so.id, so.order_no, so.service_mode, so.service_type, so.timesheet_category, so.timesheet_salesperson,
       so.issue_description, so.internal_note, so.planned_start_at,
       so.submitted_at, so.created_at, c.name AS customer_name, c.salesperson AS customer_salesperson,
       COALESCE(NULLIF(d.model, ''), NULLIF(d.name, ''), NULLIF(d.serial_no, '')) AS device_name,
       sr.actual_start_at, sr.work_hours, sr.work_content, sr.fault_summary, sr.result, sr.result_description,
       work_entries.work_content AS work_entries_content,
       u.real_name AS engineer_name
     FROM service_orders so
     JOIN (
       SELECT service_order_id, engineer_id FROM service_order_engineers
       UNION
       SELECT id AS service_order_id, assigned_engineer_id AS engineer_id
       FROM service_orders
       WHERE assigned_engineer_id IS NOT NULL
     ) participants ON participants.service_order_id = so.id
     JOIN users u ON u.id = participants.engineer_id AND u.role = 'engineer'
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     LEFT JOIN (
       SELECT srwe.service_order_id,
              GROUP_CONCAT(CONCAT(COALESCE(uwe.real_name, uwe.username, '工程师'), '：', srwe.work_content) SEPARATOR '\n\n') AS work_content
       FROM service_report_work_entries srwe
       JOIN users uwe ON uwe.id = srwe.engineer_id
       GROUP BY srwe.service_order_id
     ) work_entries ON work_entries.service_order_id = so.id
     WHERE DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) >= :startDate
       AND DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) <= :endDate
       AND so.status <> 'cancelled'
       ${engineerFilterSql}
       ${customerFilterSql}
       ${salespersonFilterSql}
       ${salesScope.sql}
     ORDER BY u.real_name, COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at), so.id`,
    {
      engineerId: filterEngineerId,
      customerId: filterCustomerId,
      salesperson: filterSalesperson,
      startDate,
      endDate,
      ...salesScope.params,
    },
  )
  const shouldExcludeManualRows = req.user.role === 'sales' || Boolean(filterCustomerId || filterSalesperson)
  const manualRows = shouldExcludeManualRows
    ? []
    : await query(
        `SELECT tme.id, tme.engineer_id, tme.entry_date, tme.category, tme.customer_project,
                tme.work_content, tme.progress, tme.remark, u.real_name AS engineer_name
         FROM timesheet_manual_entries tme
         JOIN users u ON u.id = tme.engineer_id AND u.role = 'engineer'
         WHERE tme.entry_date >= :startDate
           AND tme.entry_date <= :endDate
           ${filterEngineerId ? 'AND tme.engineer_id = :engineerId' : ''}
         ORDER BY u.real_name, tme.entry_date, tme.id`,
        {
          engineerId: filterEngineerId,
          startDate,
          endDate,
        },
      )

  const serviceItems = rows.map((row) => {
    const date = String(row.actual_start_at || row.planned_start_at || row.submitted_at || row.created_at).slice(0, 10)
    const [workNature, category] = timesheetType(row.service_type, row.service_mode)
    return toTraditionalDeep({
      source: 'service_order',
      serviceOrderId: row.id,
      orderNo: row.order_no,
      serviceMode: row.service_mode || 'onsite',
      engineerName: row.engineer_name || req.user.real_name || req.user.username,
      date,
      weekday: weekdayText(date),
      workNature,
      category:
        row.service_mode === 'remote'
          ? row.timesheet_category || category
          : row.service_mode === 'office'
            ? row.timesheet_category || category
            : category,
      customerName: row.customer_name,
      productName: row.service_mode === 'office' ? row.internal_note || '' : row.device_name || '',
      workContent: joinTimesheetWorkContent(
        row.work_entries_content,
        row.work_content,
        row.fault_summary,
        row.result_description,
        row.issue_description,
      ),
      salesperson: row.timesheet_salesperson || row.customer_salesperson || '',
      progress:
        {
          resolved: '已完成',
          unresolved: '未完成',
          follow_up_required: '擱置中',
        }[row.result] || '已完成',
      workHours: Number(row.work_hours || 1),
      remark: row.order_no,
    })
  })
  const manualItems = manualRows.map((row) => {
    const date = String(row.entry_date).slice(0, 10)
    return toTraditionalDeep({
      source: 'manual',
      manualEntryId: row.id,
      serviceOrderId: null,
      orderNo: '',
      serviceMode: 'manual',
      engineerName: row.engineer_name || req.user.real_name || req.user.username,
      date,
      weekday: weekdayText(date),
      workNature: '内部工作',
      category: row.category,
      customerName: row.customer_project || '',
      productName: row.customer_project || '',
      workContent: row.work_content,
      salesperson: '',
      progress: row.progress || '已完成',
      remark: row.remark || '',
    })
  })
  const items = [...serviceItems, ...manualItems].sort((left, right) => {
    const dateCompare = String(left.date).localeCompare(String(right.date))
    if (dateCompare) return dateCompare
    return String(left.engineerName).localeCompare(String(right.engineerName), 'zh-Hans-CN')
  })

  const response = {
    month,
    startDate,
    endDate,
    label,
    engineerName: toTraditional(filterEngineerId ? rows[0]?.engineer_name || manualRows[0]?.engineer_name || req.user.real_name || req.user.username : '全部工程師'),
    filters: {
      customerId: filterCustomerId || null,
      salesperson: filterSalesperson || '',
      engineerId: filterEngineerId || null,
    },
    items,
  }

  if (includeWorkSummary) {
    response.workSummary = await generateTimesheetWorkSummary(response)
  }

  res.json(response)
}

async function createTimesheetManualEntry(req, res) {
  await ensureTimesheetManualEntriesTable()
  const { entryDate, category, customerProject, workContent, progress, remark } = req.body || {}
  const normalizedDate = normalizeDateInput(entryDate, '')
  const normalizedCategory = normalizeManualEntryCategory(category)
  const missing = []
  if (!normalizedDate) missing.push('日期')
  if (!normalizedCategory) missing.push('类别')
  if (!String(workContent || '').trim()) missing.push('工作内容')
  if (missing.length) {
    throw badRequest(`请先补充必填项：${missing.join('、')}`)
  }

  const created = await transaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO timesheet_manual_entries (
         engineer_id, entry_date, category, customer_project, work_content, progress, remark, created_by
       )
       VALUES (
         :engineerId, :entryDate, :category, :customerProject, :workContent, :progress, :remark, :createdBy
       )`,
      {
        engineerId: req.user.id,
        entryDate: normalizedDate,
        category: normalizedCategory,
        customerProject: String(customerProject || '').trim() || null,
        workContent: String(workContent || '').trim(),
        progress: normalizeProgress(progress),
        remark: String(remark || '').trim() || null,
        createdBy: req.user.id,
      },
    )
    await writeAudit(connection, req.user.id, result.insertId, 'timesheet_manual_entry_create')
    return { id: result.insertId }
  })

  res.status(201).json(created)
}

async function deleteTimesheetManualEntry(req, res) {
  await ensureTimesheetManualEntriesTable()
  const rows = await query('SELECT id, engineer_id FROM timesheet_manual_entries WHERE id = :id LIMIT 1', { id: req.params.id })
  const entry = rows[0]
  if (!entry) {
    throw notFound('月报条目不存在')
  }
  if (Number(entry.engineer_id) !== Number(req.user.id)) {
    throw forbidden('只能删除自己的月报条目')
  }

  await transaction(async (connection) => {
    await connection.execute('DELETE FROM timesheet_manual_entries WHERE id = :id', { id: req.params.id })
    await writeAudit(connection, req.user.id, req.params.id, 'timesheet_manual_entry_delete')
  })
  res.status(204).end()
}

async function customerSalesperson(connection, customerId) {
  if (!customerId) return null
  const [rows] = await connection.execute('SELECT salesperson FROM customers WHERE id = :customerId LIMIT 1', { customerId })
  return rows[0]?.salesperson || null
}

async function customerDefaultContact(connection, customerId) {
  if (!customerId) return { contactName: null, contactPhone: null }
  const [rows] = await connection.execute(
    'SELECT contact_name, contact_phone FROM customers WHERE id = :customerId LIMIT 1',
    { customerId },
  )
  const row = rows[0] || {}
  return {
    contactName: row.contact_name || null,
    contactPhone: normalizeCustomerContactPhone(row.contact_phone) || row.contact_phone || null,
  }
}

async function assertDeviceBelongsToCustomer(connection, deviceId, customerId) {
  if (!deviceId) return
  const [rows] = await connection.execute('SELECT id FROM devices WHERE id = :deviceId AND customer_id = :customerId LIMIT 1', {
    deviceId,
    customerId,
  })
  if (!rows[0]) {
    throw badRequest('设备不属于所选客户')
  }
}

function normalizeServiceParts(parts = [], { fallbackActionType = 'general', fallbackDeviceId = null } = {}) {
  if (!Array.isArray(parts)) return []
  return parts
    .map((part) => {
      const partName = String(part?.partName || part?.part_name || '').trim()
      if (!partName) return null
      const deviceId = Number(part?.deviceId || part?.device_id || fallbackDeviceId || 0) || null
      return {
        deviceId,
        actionType: normalizePartActionType(part?.actionType || part?.action_type, fallbackActionType),
        partName,
        partNo: String(part?.partNo || part?.part_no || '').trim() || null,
        quantity: Number(part?.quantity || 1) || 1,
        unit: String(part?.unit || '').trim() || null,
        remark: String(part?.remark || '').trim() || null,
      }
    })
    .filter(Boolean)
}

async function saveServiceParts(connection, orderId, parts, { customerId, fallbackActionType = 'general', fallbackDeviceId = null } = {}) {
  await ensureServicePartsColumns(connection)
  const normalizedParts = normalizeServiceParts(parts, { fallbackActionType, fallbackDeviceId })
  for (const part of normalizedParts) {
    if (['replacement', 'installation'].includes(part.actionType) && !part.deviceId) {
      throw badRequest('请选择配件关联设备')
    }
    if (part.deviceId) {
      await assertDeviceBelongsToCustomer(connection, part.deviceId, customerId)
    }
    await connection.execute(
      `INSERT INTO service_parts (service_order_id, device_id, action_type, part_name, part_no, quantity, unit, remark)
       VALUES (:orderId, :deviceId, :actionType, :partName, :partNo, :quantity, :unit, :remark)`,
      {
        orderId,
        deviceId: part.deviceId,
        actionType: part.actionType,
        partName: part.partName,
        partNo: part.partNo,
        quantity: part.quantity,
        unit: part.unit,
        remark: part.remark,
      },
    )
  }
}

function defaultPartActionType(serviceMode, serviceType, timesheetCategory = '') {
  const remoteCategory = String(timesheetCategory || '').trim()
  if (serviceMode === 'remote' && ['协调', '远程协调', '沟通协调'].includes(remoteCategory)) return 'replacement'
  if (serviceMode !== 'onsite') return 'general'
  if (serviceType === 'repair') return 'replacement'
  if (serviceType === 'install') return 'installation'
  return 'general'
}

async function create(req, res) {
  await ensureServiceOrderInspectionColumns()
  const {
    customerId,
    deviceId,
    serviceMode = 'onsite',
    serviceType,
    timesheetCategory,
    timesheetSalesperson,
    engineerId,
    primaryEngineerId,
    engineerIds = [],
    plannedStartAt,
    plannedEndAt,
    priority = 'normal',
    issueDescription,
    internalNote,
  } =
    req.body || {}

  if (!customerId || !serviceType || !issueDescription) {
    throw badRequest('客户、服务类型和问题描述不能为空')
  }
  const requestedEngineerIds = Array.isArray(engineerIds) ? engineerIds : []
  const normalizedPrimaryEngineerId = Number(primaryEngineerId || engineerId || requestedEngineerIds[0] || 0)
  const normalizedEngineerIds = [...new Set([normalizedPrimaryEngineerId, ...requestedEngineerIds].map(Number).filter(Boolean))]
  const normalizedPlannedStartAt = String(plannedStartAt || '').trim() || null
  const normalizedPlannedEndAt = String(plannedEndAt || '').trim() || null
  if (normalizedPlannedStartAt && normalizedPlannedEndAt && normalizedPlannedEndAt < normalizedPlannedStartAt) {
    throw badRequest('计划结束时间不能早于开始时间')
  }

  const result = await transaction(async (connection) => {
    if (normalizedEngineerIds.length) {
      const found = idParams(normalizedEngineerIds, 'engineerId')
      const [engineerRows] = await connection.execute(
        `SELECT id
         FROM users
         WHERE id IN (${found.placeholders})
           AND role IN ('engineer', 'engineering_supervisor')
           AND status = 'active'`,
        found.params,
      )
      if (engineerRows.length !== normalizedEngineerIds.length) {
        throw badRequest('派发工程师不存在或未启用')
      }
    }
    const now = new Date()
    const prefix = buildOrderNo(0, now).slice(0, 10)
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM service_orders
       WHERE order_no LIKE :prefix`,
      { prefix: `${prefix}%` },
    )
    const orderNo = buildOrderNo(Number(countRows[0].total) + 1, now)
    const status = normalizedPrimaryEngineerId ? 'assigned' : 'draft'
    const salespersonSnapshot = timesheetSalesperson || (await customerSalesperson(connection, customerId))
    const defaultContact = await customerDefaultContact(connection, customerId)

    const [insertResult] = await connection.execute(
      `INSERT INTO service_orders (
         order_no, customer_id, contact_name, contact_phone, device_id, service_mode, service_type, timesheet_category, timesheet_salesperson,
         priority, status, issue_description,
         assigned_engineer_id, target_engineer_id, planned_start_at, planned_end_at, internal_note, created_by
       )
       VALUES (
         :orderNo, :customerId, :contactName, :contactPhone, :deviceId, :serviceMode, :serviceType, :timesheetCategory, :timesheetSalesperson,
         :priority, :status, :issueDescription,
         :assignedEngineerId, :targetEngineerId, :plannedStartAt, :plannedEndAt, :internalNote, :createdBy
       )`,
      {
        orderNo,
        customerId,
        contactName: defaultContact.contactName,
        contactPhone: defaultContact.contactPhone,
        deviceId: deviceId || null,
        serviceMode: ['remote', 'office'].includes(serviceMode) ? serviceMode : 'onsite',
        serviceType,
        timesheetCategory: timesheetCategory || null,
        timesheetSalesperson: salespersonSnapshot,
        priority,
        status,
        issueDescription,
        assignedEngineerId: normalizedPrimaryEngineerId || null,
        targetEngineerId: normalizedPrimaryEngineerId || null,
        plannedStartAt: normalizedPlannedStartAt,
        plannedEndAt: normalizedPlannedEndAt,
        internalNote: internalNote || null,
        createdBy: req.user.id,
      },
    )

    if (normalizedEngineerIds.length) {
      await replaceOrderEngineers(connection, insertResult.insertId, normalizedEngineerIds, req.user.id)
    }

    await writeAudit(connection, req.user.id, insertResult.insertId, 'create', {
      status,
      primaryEngineerId: normalizedPrimaryEngineerId || null,
      engineerIds: normalizedEngineerIds,
      plannedStartAt: normalizedPlannedStartAt,
      plannedEndAt: normalizedPlannedEndAt,
    })
    return { id: insertResult.insertId, orderNo }
  })

  if (normalizedEngineerIds.length) {
    const createdOrder = (await attachEngineers([await getOrder(result.id)]))[0]
    triggerAssignmentMail(createdOrder, result.id)
  }

  res.status(201).json(result)
}

async function createSelfReport(req, res) {
  const {
    customerId,
    customerName,
    customerAddress,
    customerLatitude,
    customerLongitude,
    customerMapProvider,
    customerMapPoiId,
    customerMapPoiName,
    customerMapAddress,
    contactName,
    contactPhone,
    deviceId,
    deviceName,
    deviceModel,
    devicePn,
    deviceSerialNo,
    deviceRemark,
    serviceMode = 'onsite',
    serviceType = 'repair',
    timesheetCategory,
    timesheetSalesperson,
    priority = 'normal',
    issueDescription,
    internalNote,
    departureAt,
    actualStartAt,
    actualEndAt,
    returnAt,
    workContent,
    workEntries = [],
    result,
    resultDescription,
    customerSignature,
    customerSignatureFileId,
    engineerIds = [],
    parts = [],
  } = req.body || {}

  const effectiveServiceMode = ['remote', 'office'].includes(serviceMode) ? serviceMode : 'onsite'
  const shouldSyncCustomerProfile = effectiveServiceMode !== 'office'
  const customerProfileContactName = shouldSyncCustomerProfile ? contactName : null
  const customerProfileContactPhone = shouldSyncCustomerProfile ? normalizeCustomerContactPhone(contactPhone) : null
  const normalizedResult = normalizeReportResult(result)
  const missing = []
  if (!customerId && !customerName) missing.push('客户名称')
  if (effectiveServiceMode === 'onsite' && !customerAddress) missing.push('客户地址')
  if (effectiveServiceMode !== 'office' && !contactName) missing.push('客户联系人')
  if (effectiveServiceMode !== 'office' && !contactPhone) missing.push('联系人电话')
  if (effectiveServiceMode === 'onsite' && !serviceType) missing.push('服务类型')
  if (effectiveServiceMode !== 'onsite' && !timesheetCategory) missing.push('月报类别')
  if (!issueDescription) missing.push(effectiveServiceMode === 'onsite' ? '问题描述' : '月报工作内容')
  if (!hasSubmittedWorkContent(workContent, workEntries)) missing.push(effectiveServiceMode === 'onsite' ? '现场处理记录' : '处理记录')
  if (effectiveServiceMode !== 'office' && !normalizedResult) missing.push(effectiveServiceMode === 'onsite' ? '服务结果' : '处理进度')
  if (!actualStartAt) missing.push(effectiveServiceMode === 'onsite' ? '到达时间' : '开始时间')
  if (!actualEndAt) missing.push(effectiveServiceMode === 'onsite' ? '完成时间' : '结束时间')
  if (effectiveServiceMode === 'onsite' && !customerSignature && !customerSignatureFileId) missing.push('客户手写签名')

  if (missing.length) {
    const filtered = effectiveServiceMode === 'office' ? missing.filter(m => m !== '处理进度' && m !== '服务结果') : missing
    if (filtered.length) {
      throw badRequest(`请先补充必填项：${filtered.join('、')}`)
    }
  }

  if (effectiveServiceMode === 'onsite') {
    await ensureServiceReportWorkEntriesTable()
  }
  await ensureServiceReportTravelColumns()
  await ensureSelfReportDraftsTable()

  const created = await transaction(async (connection) => {
    await ensureSelfReportDraftsTable(connection)
    let effectiveCustomerId = customerId || null
    if (!effectiveCustomerId) {
      const nameKey = customerNameKey(customerName)
      const [existingCustomers] = await connection.execute('SELECT id FROM customers WHERE name_key = :nameKey LIMIT 1', { nameKey })
      if (existingCustomers[0]) {
        effectiveCustomerId = existingCustomers[0].id
        await connection.execute(
          `UPDATE customers
           SET address = COALESCE(NULLIF(address, ''), :customerAddress),
               contact_name = COALESCE(NULLIF(contact_name, ''), :contactName),
               contact_phone = COALESCE(NULLIF(contact_phone, ''), :contactPhone),
               latitude = COALESCE(latitude, :customerLatitude),
               longitude = COALESCE(longitude, :customerLongitude),
               map_provider = COALESCE(NULLIF(map_provider, ''), :customerMapProvider),
               map_poi_id = COALESCE(NULLIF(map_poi_id, ''), :customerMapPoiId),
               map_poi_name = COALESCE(NULLIF(map_poi_name, ''), :customerMapPoiName),
               map_address = COALESCE(NULLIF(map_address, ''), :customerMapAddress)
           WHERE id = :customerId`,
          {
            customerId: effectiveCustomerId,
            customerAddress: shouldSyncCustomerProfile ? customerAddress || null : null,
            contactName: customerProfileContactName || null,
            contactPhone: customerProfileContactPhone || null,
            customerLatitude: shouldSyncCustomerProfile ? customerLatitude || null : null,
            customerLongitude: shouldSyncCustomerProfile ? customerLongitude || null : null,
            customerMapProvider: shouldSyncCustomerProfile ? customerMapProvider || null : null,
            customerMapPoiId: shouldSyncCustomerProfile ? customerMapPoiId || null : null,
            customerMapPoiName: shouldSyncCustomerProfile ? customerMapPoiName || null : null,
            customerMapAddress: shouldSyncCustomerProfile ? customerMapAddress || null : null,
          },
        )
      } else {
        const customerCode = await nextCustomerCode(connection)
        const [customerResult] = await connection.execute(
          `INSERT INTO customers (
           name, name_key, code, address, contact_name, contact_phone, latitude, longitude,
           map_provider, map_poi_id, map_poi_name, map_address
         )
         VALUES (
           :customerName, :nameKey, :customerCode, :customerAddress, :contactName, :contactPhone, :customerLatitude, :customerLongitude,
           :customerMapProvider, :customerMapPoiId, :customerMapPoiName, :customerMapAddress
         )`,
          {
            customerName,
            nameKey,
            customerCode,
            customerAddress: shouldSyncCustomerProfile ? customerAddress || null : null,
            contactName: customerProfileContactName || null,
            contactPhone: customerProfileContactPhone || null,
            customerLatitude: shouldSyncCustomerProfile ? customerLatitude || null : null,
            customerLongitude: shouldSyncCustomerProfile ? customerLongitude || null : null,
            customerMapProvider: shouldSyncCustomerProfile ? customerMapProvider || null : null,
            customerMapPoiId: shouldSyncCustomerProfile ? customerMapPoiId || null : null,
            customerMapPoiName: shouldSyncCustomerProfile ? customerMapPoiName || null : null,
            customerMapAddress: shouldSyncCustomerProfile ? customerMapAddress || null : null,
          },
        )
        effectiveCustomerId = customerResult.insertId
      }
    } else {
      await connection.execute(
        `UPDATE customers
         SET name = COALESCE(NULLIF(:customerName, ''), name),
             name_key = COALESCE(NULLIF(:customerNameKey, ''), name_key),
             latitude = COALESCE(:customerLatitude, latitude),
             longitude = COALESCE(:customerLongitude, longitude),
             map_provider = COALESCE(NULLIF(:customerMapProvider, ''), map_provider),
             map_poi_id = COALESCE(NULLIF(:customerMapPoiId, ''), map_poi_id),
             map_poi_name = COALESCE(NULLIF(:customerMapPoiName, ''), map_poi_name),
             map_address = COALESCE(NULLIF(:customerMapAddress, ''), map_address),
             address = COALESCE(NULLIF(:customerAddress, ''), address),
             contact_name = COALESCE(NULLIF(contact_name, ''), :contactName),
             contact_phone = COALESCE(NULLIF(contact_phone, ''), :contactPhone)
         WHERE id = :customerId`,
        {
          customerId: effectiveCustomerId,
          customerName: shouldSyncCustomerProfile ? customerName || null : null,
          customerNameKey: shouldSyncCustomerProfile && customerName ? customerNameKey(customerName) : null,
          customerAddress: shouldSyncCustomerProfile ? customerAddress || null : null,
          contactName: customerProfileContactName || null,
          contactPhone: customerProfileContactPhone || null,
          customerLatitude: shouldSyncCustomerProfile ? customerLatitude || null : null,
          customerLongitude: shouldSyncCustomerProfile ? customerLongitude || null : null,
          customerMapProvider: shouldSyncCustomerProfile ? customerMapProvider || null : null,
          customerMapPoiId: shouldSyncCustomerProfile ? customerMapPoiId || null : null,
          customerMapPoiName: shouldSyncCustomerProfile ? customerMapPoiName || null : null,
          customerMapAddress: shouldSyncCustomerProfile ? customerMapAddress || null : null,
        },
      )
    }

    if (effectiveServiceMode !== 'office') {
      await recordCustomerContact(connection, effectiveCustomerId, contactName, contactPhone, req.user.id)
    }

    const shouldManageInstallDevice = effectiveServiceMode === 'onsite' && serviceType === 'install'
    let effectiveDeviceId = Number(deviceId || 0) || null
    if (effectiveDeviceId) {
      await assertDeviceBelongsToCustomer(connection, effectiveDeviceId, effectiveCustomerId)
    }
    const hasInstallDeviceFields = shouldManageInstallDevice
      && [deviceModel, devicePn, deviceSerialNo, deviceRemark].some((value) => String(value || '').trim())
    const effectiveDeviceName = String(deviceName || '').trim() || null
    const effectiveDeviceModel = String(deviceModel || '').trim() || null
    const hasInstallDevicePayload = Boolean(effectiveDeviceName) || hasInstallDeviceFields
    if (shouldManageInstallDevice && !effectiveDeviceId && hasInstallDevicePayload && !effectiveDeviceModel) {
      throw badRequest('安装设备型号不能为空')
    }
    if (shouldManageInstallDevice && !effectiveDeviceId && hasInstallDevicePayload) {
      const [deviceResult] = await connection.execute(
        `INSERT INTO devices (customer_id, name, model, pn, serial_no, remark)
         VALUES (:customerId, :deviceName, :deviceModel, :devicePn, :deviceSerialNo, :deviceRemark)`,
        {
          customerId: effectiveCustomerId,
          deviceName: effectiveDeviceName,
          deviceModel: effectiveDeviceModel,
          devicePn: devicePn || null,
          deviceSerialNo: deviceSerialNo || null,
          deviceRemark: deviceRemark || null,
        },
      )
      effectiveDeviceId = deviceResult.insertId
    }

    const now = new Date()
    const prefix = buildOrderNo(0, now).slice(0, 10)
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM service_orders
       WHERE order_no LIKE :prefix`,
      { prefix: `${prefix}%` },
    )
    const orderNo = buildOrderNo(Number(countRows[0].total) + 1, now)
    const salespersonSnapshot = timesheetSalesperson || (await customerSalesperson(connection, effectiveCustomerId))

    const [orderResult] = await connection.execute(
      `INSERT INTO service_orders (
         order_no, customer_id, contact_name, contact_phone, device_id, service_mode, service_type, timesheet_category, timesheet_salesperson,
         priority, status, issue_description,
         assigned_engineer_id, internal_note, created_by, submitted_at
       )
       VALUES (
         :orderNo, :customerId, :contactName, :contactPhone, :deviceId, :serviceMode, :serviceType, :timesheetCategory, :timesheetSalesperson,
         :priority, 'submitted', :issueDescription,
         :engineerId, :internalNote, :createdBy, CURRENT_TIMESTAMP
       )`,
      {
        orderNo,
        customerId: effectiveCustomerId,
        contactName: contactName || null,
        contactPhone: customerProfileContactPhone || null,
        deviceId: effectiveDeviceId,
        serviceMode: effectiveServiceMode,
        serviceType,
        timesheetCategory: effectiveServiceMode === 'onsite' ? null : timesheetCategory || '其他',
        timesheetSalesperson: salespersonSnapshot,
        priority,
        issueDescription,
        engineerId: req.user.id,
        internalNote: internalNote || null,
        createdBy: req.user.id,
      },
    )

    if (shouldManageInstallDevice && !deviceId && effectiveDeviceId) {
      await connection.execute(
        `UPDATE devices
         SET installation_source_service_order_id = COALESCE(installation_source_service_order_id, :serviceOrderId)
         WHERE id = :deviceId`,
        {
          deviceId: effectiveDeviceId,
          serviceOrderId: orderResult.insertId,
        },
      )
    }

    await replaceOrderEngineers(connection, orderResult.insertId, normalizeEngineerIds(engineerIds, req.user.id), req.user.id)
    const savedWorkEntries =
      effectiveServiceMode === 'office'
        ? []
        : await saveWorkEntries(connection, orderResult.insertId, workEntries, workContent, req.user.id)
    const effectiveWorkContent = String(workContent || '').trim() || mergedWorkContent(savedWorkEntries, workContent)

    const reusableSignatureFileId = await validateReusableSignatureFile(connection, customerSignatureFileId)
    if (customerSignatureFileId && !reusableSignatureFileId && !customerSignature) {
      throw badRequest('历史签名文件不存在，请重新签名')
    }
    const savedSignatureFileId = reusableSignatureFileId || await saveSignatureFile(connection, orderResult.insertId, customerSignature, req.user.id)

    await connection.execute(
      `INSERT INTO service_reports (
         service_order_id, departure_at, actual_start_at, actual_end_at, return_at, work_content,
         result, result_description, customer_name, customer_signature_file_id, customer_signature
       )
       VALUES (
         :orderId, :departureAt, :actualStartAt, :actualEndAt, :returnAt, :workContent,
         :result, :resultDescription, :customerConfirmName, :customerSignatureFileId, NULL
       )`,
      {
        orderId: orderResult.insertId,
        departureAt: departureAt || null,
        actualStartAt: actualStartAt || null,
        actualEndAt: actualEndAt || null,
        returnAt: returnAt || null,
        workContent: effectiveWorkContent,
        result: normalizedResult,
        resultDescription: resultDescription || null,
        customerConfirmName: contactName || null,
        customerSignatureFileId: savedSignatureFileId,
      },
    )

    await saveServiceParts(connection, orderResult.insertId, parts, {
      customerId: effectiveCustomerId,
      fallbackActionType: defaultPartActionType(effectiveServiceMode, serviceType, timesheetCategory),
      fallbackDeviceId: effectiveServiceMode === 'onsite' && serviceType === 'repair' ? effectiveDeviceId : null,
    })

    await writeAudit(connection, req.user.id, orderResult.insertId, 'self_report_submit')
    await connection.execute(
      `DELETE FROM self_report_drafts
       WHERE engineer_id = :engineerId
         AND draft_scope = 'create'
         AND service_order_id = 0`,
      { engineerId: req.user.id },
    )
    return {
      id: orderResult.insertId,
      orderNo,
    }
  })

  res.status(201).json(created)
}

async function loadDetailItem(orderId, user, options = {}) {
  await ensureServiceOrderInspectionColumns()
  await ensureServicePartsColumns()
  await ensureFilePurposeColumn()
  let order = await getOrder(orderId)
  if (!order) {
    throw notFound('服务单不存在')
  }
  await assertCanViewOrder(order, user, options)
  order = (await attachEngineers([order]))[0]

  const reports = await query(
    `SELECT *
     FROM service_reports
     WHERE service_order_id = :id
     ORDER BY id DESC
     LIMIT 1`,
    { id: orderId },
  )
  const hydratedReport = await hydrateReportSignature(reports[0])
  const workEntriesByOrder = await loadWorkEntries([Number(orderId)])
  const report = hydratedReport ? { ...hydratedReport, workEntries: workEntriesByOrder.get(Number(orderId)) || [] } : null
  const contacts = await query(
    `SELECT cc.id, cc.customer_id, cc.name, cc.phone, cc.use_count, cc.last_used_at,
            COALESCE(ccu.use_count, 0) AS engineer_use_count,
            ccu.last_used_at AS engineer_last_used_at
     FROM customer_contacts cc
     LEFT JOIN customer_contact_usage ccu
       ON ccu.customer_contact_id = cc.id AND ccu.engineer_id = :engineerId
     WHERE cc.customer_id = :customerId
     ORDER BY engineer_use_count DESC, engineer_last_used_at DESC, cc.use_count DESC, cc.last_used_at DESC, cc.id DESC
     LIMIT 20`,
    { customerId: order.customer_id, engineerId: user.id },
  )
  const parts = await query(
    `SELECT sp.id, sp.service_order_id, sp.device_id, sp.action_type, sp.part_name, sp.part_no,
            sp.quantity, sp.unit, sp.remark, sp.created_at, sp.updated_at,
            COALESCE(NULLIF(d.model, ''), NULLIF(d.name, ''), NULLIF(d.serial_no, '')) AS device_name
     FROM service_parts sp
     LEFT JOIN devices d ON d.id = sp.device_id
     WHERE service_order_id = :id
     ORDER BY sp.id ASC`,
    { id: orderId },
  )
  const files = await query(
    `SELECT id, owner_type, owner_id, purpose, original_name, mime_type, size, uploaded_by, created_at
     FROM files
     WHERE owner_type IN ('service_order', 'service_report', 'signature') AND owner_id = :id
     ORDER BY id ASC`,
    { id: orderId },
  )

  return {
    ...orderPayload(order),
    report: reportPayload(report),
    contacts: contacts.map((contact) => ({
      id: contact.id,
      customerId: contact.customer_id,
      name: contact.name,
      phone: contact.phone,
      useCount: contact.use_count,
      lastUsedAt: contact.last_used_at,
    })),
    parts: parts.map((part) => ({
      id: part.id,
      serviceOrderId: part.service_order_id,
      deviceId: part.device_id,
      deviceName: part.device_name,
      actionType: part.action_type || 'general',
      partName: part.part_name,
      partNo: part.part_no,
      quantity: part.quantity,
      unit: part.unit,
      remark: part.remark,
      createdAt: part.created_at,
      updatedAt: part.updated_at,
    })),
    files: files.map((file) => ({
      id: file.id,
      ownerType: file.owner_type,
      ownerId: file.owner_id,
      purpose: file.purpose || 'general',
      originalName: file.original_name,
      mimeType: file.mime_type,
      size: file.size,
      uploadedBy: file.uploaded_by,
      createdAt: file.created_at,
    })),
  }
}

async function detail(req, res) {
  const item = await loadDetailItem(req.params.id, req.user, { mine: isMineRequest(req) })
  res.json({ item })
}

async function exportPdf(req, res) {
  const item = await loadDetailItem(req.params.id, req.user, { mine: isMineRequest(req) })
  if (item.serviceMode === 'office') {
    throw badRequest('内勤记录不生成单独服务表，请在月报中统一导出')
  }
  if (!item.report) {
    throw badRequest('请先填写并提交服务记录')
  }

  const filename = serviceRecordPdfFilename(item)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
  buildServiceRecordPdf(item).pipe(res)
}

async function exportPdfBatch(req, res) {
  await ensureServiceOrderInspectionColumns()
  await ensureFilePurposeColumn()
  const { params, fromAndWhere, sortColumn, sortDirection } = buildListQueryParts(req)

  // 勾选导出：传了 ids 就只导这些(仍受角色可见范围约束)；不传则按筛选导全部。
  const selectedIds = String(req.query.ids || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 500)
  const queryParams = { ...params }
  let where = fromAndWhere
  if (selectedIds.length) {
    const placeholders = selectedIds.map((id, index) => {
      queryParams[`expId${index}`] = id
      return `:expId${index}`
    })
    where += ` AND so.id IN (${placeholders.join(',')})`
  }

  const rows = await query(
    `SELECT so.id ${where}
     ORDER BY ${sortColumn} ${sortDirection}, so.id DESC
     LIMIT 500`,
    queryParams,
  )

  const eligible = []
  for (const row of rows) {
    const item = await loadDetailItem(row.id, req.user, { mine: isMineRequest(req) })
    if (item.serviceMode === 'office' || !item.report) continue
    eligible.push(item)
  }

  if (!eligible.length) {
    throw badRequest(selectedIds.length
      ? '所选工单中没有可导出的服务记录（需已提交且非内勤）'
      : '当前筛选条件下没有可导出的服务记录（需已提交且非内勤）')
  }

  const pdfFilename = `service-records-${shanghaiDateKey(0)}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"; filename*=UTF-8''${encodeURIComponent(pdfFilename)}`)
  buildServiceRecordsPdf(eligible).pipe(res)
}

async function latestCustomerSignature(req, res) {
  const customerId = Number(req.query.customerId || 0)
  const nameKey = customerNameKey(req.query.customerName || '')
  const contactName = String(req.query.contactName || '').trim()
  const customerFilters = []
  const contactFilters = []
  const params = {}

  if (customerId) {
    customerFilters.push('so.customer_id = :customerId')
    params.customerId = customerId
  }
  if (nameKey) {
    customerFilters.push('c.name_key = :customerNameKey')
    params.customerNameKey = nameKey
  }
  if (contactName) {
    contactFilters.push('TRIM(sr.customer_name) = :contactName')
    params.contactName = contactName
  }
  const filters = [...customerFilters, ...contactFilters]
  if (!filters.length) {
    throw badRequest('请先选择或填写客户名称或联系人')
  }
  const customerMatchRank = customerFilters.length && contactFilters.length
    ? `CASE WHEN (${customerFilters.join(' OR ')}) THEN 0 ELSE 1 END,`
    : ''

  const rows = await query(
    `SELECT sr.customer_signature_file_id, sr.customer_signature
     FROM service_reports sr
     JOIN service_orders so ON so.id = sr.service_order_id
     JOIN customers c ON c.id = so.customer_id
     WHERE (sr.customer_signature_file_id IS NOT NULL OR sr.customer_signature IS NOT NULL)
       AND (${filters.join(' OR ')})
     ORDER BY ${customerMatchRank} COALESCE(sr.updated_at, sr.created_at) DESC, sr.id DESC
     LIMIT 1`,
    params,
  )
  const signature = rows[0]?.customer_signature_file_id
    ? await signatureDataUrl(rows[0].customer_signature_file_id)
    : rows[0]?.customer_signature || ''

  res.json({
    customerSignature: signature,
    customerSignatureFileId: rows[0]?.customer_signature_file_id || null,
  })
}

async function getSelfReportDraft(req, res) {
  await ensureSelfReportDraftsTable()
  const orderId = normalizeDraftOrderId(req.query.serviceOrderId)
  const draftScope = normalizeDraftScope(orderId)
  const rows = await query(
    `SELECT id, engineer_id, draft_scope, service_order_id, payload_json, client_updated_at, created_at, updated_at
     FROM self_report_drafts
     WHERE engineer_id = :engineerId
       AND draft_scope = :draftScope
       AND service_order_id = :serviceOrderId
     LIMIT 1`,
    {
      engineerId: req.user.id,
      draftScope,
      serviceOrderId: orderId,
    },
  )
  const item = rows[0]
  if (!item) {
    res.json({ item: null })
    return
  }
  res.json({
    item: {
      scope: item.draft_scope,
      serviceOrderId: item.service_order_id,
      payload: parseDraftPayload(item.payload_json) || {},
      clientUpdatedAt: item.client_updated_at || '',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    },
  })
}

async function saveSelfReportDraft(req, res) {
  const payload = req.body?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('草稿内容不能为空')
  }
  const orderId = normalizeDraftOrderId(req.body?.serviceOrderId)
  const draftScope = normalizeDraftScope(orderId)
  const clientUpdatedAt = String(req.body?.clientUpdatedAt || '').trim() || null
  await ensureSelfReportDraftsTable()

  await transaction(async (connection) => {
    await ensureSelfReportDraftsTable(connection)
    if (orderId) {
      const order = await getOrder(orderId)
      if (!order) throw notFound('服务单不存在')
      await assertEngineerOwns(order, req.user)
      assertEditable(order)
    }

    await connection.execute(
      `INSERT INTO self_report_drafts (engineer_id, draft_scope, service_order_id, payload_json, client_updated_at)
       VALUES (:engineerId, :draftScope, :serviceOrderId, :payloadJson, :clientUpdatedAt)
       ON DUPLICATE KEY UPDATE
         payload_json = VALUES(payload_json),
         client_updated_at = VALUES(client_updated_at),
         updated_at = CURRENT_TIMESTAMP`,
      {
        engineerId: req.user.id,
        draftScope,
        serviceOrderId: orderId,
        payloadJson: JSON.stringify(payload),
        clientUpdatedAt,
      },
    )
  })

  res.status(204).end()
}

async function deleteSelfReportDraft(req, res) {
  await ensureSelfReportDraftsTable()
  const orderId = normalizeDraftOrderId(req.query.serviceOrderId || req.body?.serviceOrderId)
  const draftScope = normalizeDraftScope(orderId)
  await query(
    `DELETE FROM self_report_drafts
     WHERE engineer_id = :engineerId
       AND draft_scope = :draftScope
       AND service_order_id = :serviceOrderId`,
    {
      engineerId: req.user.id,
      draftScope,
      serviceOrderId: orderId,
    },
  )
  res.status(204).end()
}

async function aiSelfReportDraft(req, res) {
  const result = await generateSelfReportAiDraft({
    transcript: req.body?.transcript,
    serviceMode: req.body?.serviceMode,
    currentDraft: req.body?.currentDraft,
    engineerId: req.user.id,
  })
  res.json(result)
}

async function aiSelfReportDraftStatus(_req, res) {
  res.json({ item: await selfReportAiDraftStatus() })
}

async function updateSelfReport(req, res) {
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  await assertEngineerOwns(order, req.user)
  assertEditable(order)

  const {
    customerId,
    customerName,
    customerAddress,
    customerLatitude,
    customerLongitude,
    customerMapProvider,
    customerMapPoiId,
    customerMapPoiName,
    customerMapAddress,
    contactName,
    contactPhone,
    deviceId,
    deviceName,
    deviceModel,
    devicePn,
    deviceSerialNo,
    deviceRemark,
    serviceMode = order.service_mode || 'onsite',
    serviceType = order.service_type,
    timesheetCategory,
    timesheetSalesperson,
    priority = order.priority,
    issueDescription,
    internalNote,
    departureAt,
    actualStartAt,
    actualEndAt,
    returnAt,
    workContent,
    workEntries = [],
    result,
    resultDescription,
    customerConfirmName,
    customerSignature,
    customerSignatureFileId,
    engineerIds = [],
    parts = [],
  } = req.body || {}

  const effectiveServiceMode = ['remote', 'office'].includes(serviceMode) ? serviceMode : 'onsite'
  const shouldSyncCustomerProfile = effectiveServiceMode !== 'office'
  const customerProfileContactPhone = shouldSyncCustomerProfile ? normalizeCustomerContactPhone(contactPhone) : null
  const normalizedResult = normalizeReportResult(result)
  const hasDeviceIdField = Object.prototype.hasOwnProperty.call(req.body || {}, 'deviceId')
  const existingSignature = await query(
    `SELECT customer_signature_file_id, customer_signature
     FROM service_reports
     WHERE service_order_id = :id
     ORDER BY id DESC
     LIMIT 1`,
    { id: req.params.id },
  )
  const hasExistingSignature = Boolean(existingSignature[0]?.customer_signature_file_id || existingSignature[0]?.customer_signature)
  const missing = []
  if (!customerName) missing.push('客户名称')
  if (effectiveServiceMode === 'onsite' && !customerAddress) missing.push('客户地址')
  if (effectiveServiceMode !== 'office' && !contactName && !customerConfirmName) missing.push('客户联系人')
  if (effectiveServiceMode !== 'office' && !contactPhone) missing.push('联系人电话')
  if (effectiveServiceMode === 'onsite' && !serviceType) missing.push('服务类型')
  if (effectiveServiceMode !== 'onsite' && !timesheetCategory) missing.push('月报类别')
  if (!issueDescription) missing.push(effectiveServiceMode === 'onsite' ? '问题描述' : '月报工作内容')
  if (!hasSubmittedWorkContent(workContent, workEntries)) missing.push(effectiveServiceMode === 'onsite' ? '现场处理记录' : '处理记录')
  if (effectiveServiceMode !== 'office' && !normalizedResult) missing.push(effectiveServiceMode === 'onsite' ? '服务结果' : '处理进度')
  if (!actualStartAt) missing.push(effectiveServiceMode === 'onsite' ? '到达时间' : '开始时间')
  if (!actualEndAt) missing.push(effectiveServiceMode === 'onsite' ? '完成时间' : '结束时间')
  if (effectiveServiceMode === 'onsite' && !customerSignature && !customerSignatureFileId && !hasExistingSignature) missing.push('客户手写签名')
  const isInspectionSubmit = effectiveServiceMode === 'onsite' && (serviceType === 'inspect' || order.service_type === 'inspect')
  if (isInspectionSubmit && !(await hasInspectionDocument(req.params.id))) {
    missing.push('巡检文档')
  }

  if (missing.length) {
    const filtered = effectiveServiceMode === 'office' ? missing.filter(m => m !== '处理进度' && m !== '服务结果') : missing
    if (filtered.length) {
      throw badRequest(`请先补充必填项：${filtered.join('、')}`)
    }
  }

  if (effectiveServiceMode === 'onsite') {
    await ensureServiceReportWorkEntriesTable()
  }
  await ensureServiceReportTravelColumns()
  await ensureSelfReportDraftsTable()

  await transaction(async (connection) => {
    await ensureSelfReportDraftsTable(connection)
    let effectiveCustomerId = order.customer_id
    let customerChanged = false
    const requestedCustomerId = Number(customerId || 0) || null
    if (effectiveServiceMode === 'office') {
      if (requestedCustomerId) {
        const [matchedCustomers] = await connection.execute(
          'SELECT id FROM customers WHERE id = :customerId LIMIT 1',
          { customerId: requestedCustomerId },
        )
        if (!matchedCustomers[0]) {
          throw badRequest('客户不存在或已删除')
        }
        effectiveCustomerId = matchedCustomers[0].id
      } else {
        const nameKey = customerNameKey(customerName)
        const [matchedCustomers] = await connection.execute(
          'SELECT id FROM customers WHERE name_key = :nameKey LIMIT 1',
          { nameKey },
        )
        if (matchedCustomers[0]) {
          effectiveCustomerId = matchedCustomers[0].id
        } else {
          const customerCode = await nextCustomerCode(connection)
          const [customerResult] = await connection.execute(
            `INSERT INTO customers (name, name_key, code)
             VALUES (:customerName, :nameKey, :customerCode)`,
            {
              customerName,
              nameKey,
              customerCode,
            },
          )
          effectiveCustomerId = customerResult.insertId
        }
      }
      customerChanged = Number(effectiveCustomerId) !== Number(order.customer_id)
    } else if (shouldSyncCustomerProfile) {
      const nameKey = customerNameKey(customerName)
      if (requestedCustomerId) {
        const [matchedCustomers] = await connection.execute(
          'SELECT id FROM customers WHERE id = :customerId LIMIT 1',
          { customerId: requestedCustomerId },
        )
        if (!matchedCustomers[0]) {
          throw badRequest('客户不存在或已删除')
        }
        effectiveCustomerId = matchedCustomers[0].id
      } else {
        const [matchedCustomers] = await connection.execute(
          'SELECT id FROM customers WHERE name_key = :nameKey LIMIT 1',
          { nameKey },
        )
        if (matchedCustomers[0]) {
          effectiveCustomerId = matchedCustomers[0].id
        } else {
          const customerCode = await nextCustomerCode(connection)
          const [customerResult] = await connection.execute(
            `INSERT INTO customers (
             name, name_key, code, address, contact_name, contact_phone, latitude, longitude,
             map_provider, map_poi_id, map_poi_name, map_address
           )
           VALUES (
             :customerName, :nameKey, :customerCode, :customerAddress, :contactName, :contactPhone, :customerLatitude, :customerLongitude,
             :customerMapProvider, :customerMapPoiId, :customerMapPoiName, :customerMapAddress
           )`,
            {
              customerName,
              nameKey,
              customerCode,
              customerAddress: customerAddress || null,
              contactName: contactName || customerConfirmName || null,
              contactPhone: customerProfileContactPhone || null,
              customerLatitude: customerLatitude || null,
              customerLongitude: customerLongitude || null,
              customerMapProvider: customerMapProvider || null,
              customerMapPoiId: customerMapPoiId || null,
              customerMapPoiName: customerMapPoiName || null,
              customerMapAddress: customerMapAddress || null,
            },
          )
          effectiveCustomerId = customerResult.insertId
        }
      }
      const isSwitchingCustomer = Number(effectiveCustomerId) !== Number(order.customer_id)
      customerChanged = isSwitchingCustomer
      if (isSwitchingCustomer) {
        await connection.execute(
          `UPDATE customers
           SET address = COALESCE(NULLIF(:customerAddress, ''), address),
               contact_name = COALESCE(NULLIF(contact_name, ''), :contactName),
               contact_phone = COALESCE(NULLIF(contact_phone, ''), :contactPhone),
               latitude = COALESCE(:customerLatitude, latitude),
               longitude = COALESCE(:customerLongitude, longitude),
               map_provider = COALESCE(:customerMapProvider, map_provider),
               map_poi_id = COALESCE(:customerMapPoiId, map_poi_id),
               map_poi_name = COALESCE(:customerMapPoiName, map_poi_name),
               map_address = COALESCE(:customerMapAddress, map_address)
           WHERE id = :customerId`,
          {
            customerId: effectiveCustomerId,
            customerAddress: customerAddress || null,
            contactName: contactName || customerConfirmName || null,
            contactPhone: customerProfileContactPhone || null,
            customerLatitude: customerLatitude || null,
            customerLongitude: customerLongitude || null,
            customerMapProvider: customerMapProvider || null,
            customerMapPoiId: customerMapPoiId || null,
            customerMapPoiName: customerMapPoiName || null,
            customerMapAddress: customerMapAddress || null,
          },
        )
      } else {
        await connection.execute(
          `UPDATE customers
           SET name = :customerName,
               name_key = :customerNameKey,
               address = :customerAddress,
               contact_name = COALESCE(NULLIF(contact_name, ''), :contactName),
               contact_phone = COALESCE(NULLIF(contact_phone, ''), :contactPhone),
               latitude = COALESCE(:customerLatitude, latitude),
               longitude = COALESCE(:customerLongitude, longitude),
               map_provider = COALESCE(:customerMapProvider, map_provider),
               map_poi_id = COALESCE(:customerMapPoiId, map_poi_id),
               map_poi_name = COALESCE(:customerMapPoiName, map_poi_name),
               map_address = COALESCE(:customerMapAddress, map_address)
           WHERE id = :customerId`,
          {
            customerId: effectiveCustomerId,
            customerName,
            customerNameKey: nameKey,
            customerAddress: customerAddress || null,
            contactName: contactName || customerConfirmName || null,
            contactPhone: customerProfileContactPhone || null,
            customerLatitude: customerLatitude || null,
            customerLongitude: customerLongitude || null,
            customerMapProvider: customerMapProvider || null,
            customerMapPoiId: customerMapPoiId || null,
            customerMapPoiName: customerMapPoiName || null,
            customerMapAddress: customerMapAddress || null,
          },
        )
      }
    }
    const effectiveTimesheetSalesperson = timesheetSalesperson || (customerChanged
      ? await customerSalesperson(connection, effectiveCustomerId)
      : null)

    const shouldManageInstallDevice = effectiveServiceMode === 'onsite' && serviceType === 'install'
    let effectiveDeviceId = shouldManageInstallDevice
      ? (hasDeviceIdField ? Number(deviceId || 0) || null : order.device_id || null)
      : (hasDeviceIdField ? Number(deviceId || 0) || null : order.device_id || null)
    if (effectiveDeviceId) {
      await assertDeviceBelongsToCustomer(connection, effectiveDeviceId, effectiveCustomerId)
    }
    const hasInstallDeviceFields = shouldManageInstallDevice
      && [deviceModel, devicePn, deviceSerialNo, deviceRemark].some((value) => String(value || '').trim())
    const effectiveDeviceName = String(deviceName || '').trim() || null
    const effectiveDeviceModel = String(deviceModel || '').trim() || null
    const hasInstallDevicePayload = Boolean(effectiveDeviceName) || hasInstallDeviceFields
    if (shouldManageInstallDevice && !effectiveDeviceId && hasInstallDevicePayload && !effectiveDeviceModel) {
      throw badRequest('安装设备型号不能为空')
    }
    if (shouldManageInstallDevice && effectiveDeviceId && hasInstallDevicePayload && !effectiveDeviceModel) {
      throw badRequest('安装设备型号不能为空')
    }
    if (shouldManageInstallDevice && !effectiveDeviceId && hasInstallDevicePayload) {
      const [deviceResult] = await connection.execute(
        `INSERT INTO devices (
           customer_id, name, model, pn, serial_no, remark, maintenance_type, installation_source_service_order_id
         )
         VALUES (:customerId, :deviceName, :deviceModel, :devicePn, :deviceSerialNo, :deviceRemark, 'none', :serviceOrderId)`,
        {
          customerId: effectiveCustomerId,
          deviceName: effectiveDeviceName,
          deviceModel: effectiveDeviceModel,
          devicePn: devicePn || null,
          deviceSerialNo: deviceSerialNo || null,
          deviceRemark: deviceRemark || null,
          serviceOrderId: req.params.id,
        },
      )
      effectiveDeviceId = deviceResult.insertId
    } else if (shouldManageInstallDevice && effectiveDeviceId && hasInstallDevicePayload) {
      await connection.execute(
        `UPDATE devices
         SET name = :deviceName,
             model = :deviceModel,
             pn = :devicePn,
             serial_no = :deviceSerialNo,
             remark = :deviceRemark
         WHERE id = :deviceId`,
        {
          deviceId: effectiveDeviceId,
          deviceName: effectiveDeviceName,
          deviceModel: effectiveDeviceModel,
          devicePn: devicePn || null,
          deviceSerialNo: deviceSerialNo || null,
          deviceRemark: deviceRemark || null,
        },
      )
    }

    await connection.execute(
      `UPDATE service_orders
       SET customer_id = :customerId,
           contact_name = :contactName,
           contact_phone = :contactPhone,
           device_id = :deviceId,
           service_mode = :serviceMode,
           service_type = :serviceType,
           timesheet_category = :timesheetCategory,
           timesheet_salesperson = CASE
             WHEN :customerChanged THEN :timesheetSalesperson
             ELSE COALESCE(:timesheetSalesperson, timesheet_salesperson)
           END,
           priority = :priority,
           issue_description = :issueDescription,
           assigned_engineer_id = COALESCE(assigned_engineer_id, :engineerId),
           internal_note = :internalNote,
           status = 'submitted',
           submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP)
       WHERE id = :id`,
      {
        id: req.params.id,
        customerId: effectiveCustomerId,
        contactName: contactName || customerConfirmName || null,
        contactPhone: customerProfileContactPhone || null,
        deviceId: effectiveDeviceId,
        serviceMode: effectiveServiceMode,
        serviceType,
        timesheetCategory: effectiveServiceMode === 'onsite' ? null : timesheetCategory || '其他',
        timesheetSalesperson: effectiveTimesheetSalesperson || null,
        customerChanged: customerChanged ? 1 : 0,
        priority,
        issueDescription,
        engineerId: req.user.id,
        internalNote: internalNote || null,
      },
    )

    const normalizedEngineerIds = normalizeEngineerIds(engineerIds, req.user.id)
    await replaceOrderEngineers(connection, req.params.id, normalizedEngineerIds, req.user.id)
    await pruneWorkEntriesToEngineers(connection, req.params.id, normalizedEngineerIds)

    const reusableSignatureFileId = await validateReusableSignatureFile(connection, customerSignatureFileId)
    if (customerSignatureFileId && !reusableSignatureFileId && !customerSignature) {
      throw badRequest('历史签名文件不存在，请重新签名')
    }
    const savedSignatureFileId = reusableSignatureFileId || await saveSignatureFile(connection, req.params.id, customerSignature, req.user.id)
    const savedWorkEntries =
      effectiveServiceMode === 'office'
        ? []
        : await saveWorkEntries(connection, req.params.id, workEntries, workContent, req.user.id)
    const effectiveWorkContent = String(workContent || '').trim() || mergedWorkContent(savedWorkEntries, workContent)

    await connection.execute(
      `INSERT INTO service_reports (
         service_order_id, departure_at, actual_start_at, actual_end_at, return_at, work_content,
         result, result_description, customer_name, customer_signature_file_id, customer_signature
       )
       VALUES (
         :id, :departureAt, :actualStartAt, :actualEndAt, :returnAt, :workContent,
         :result, :resultDescription, :customerConfirmName, :customerSignatureFileId, NULL
       )
       ON DUPLICATE KEY UPDATE
         departure_at = VALUES(departure_at),
         actual_start_at = VALUES(actual_start_at),
         actual_end_at = VALUES(actual_end_at),
         return_at = VALUES(return_at),
         work_content = VALUES(work_content),
         result = VALUES(result),
         result_description = VALUES(result_description),
         customer_name = VALUES(customer_name),
         customer_signature_file_id = COALESCE(VALUES(customer_signature_file_id), customer_signature_file_id),
         customer_signature = IF(VALUES(customer_signature_file_id) IS NULL, customer_signature, NULL)`,
      {
        id: req.params.id,
        departureAt: departureAt || null,
        actualStartAt: actualStartAt || null,
        actualEndAt: actualEndAt || null,
        returnAt: returnAt || null,
        workContent: effectiveWorkContent,
        result: normalizedResult,
        resultDescription: resultDescription || null,
        customerConfirmName: contactName || customerConfirmName || null,
        customerSignatureFileId: savedSignatureFileId,
      },
    )

    await connection.execute('DELETE FROM service_parts WHERE service_order_id = :id', { id: req.params.id })
    await saveServiceParts(connection, req.params.id, parts, {
      customerId: effectiveCustomerId,
      fallbackActionType: defaultPartActionType(effectiveServiceMode, serviceType, timesheetCategory),
      fallbackDeviceId: effectiveServiceMode === 'onsite' && serviceType === 'repair' ? effectiveDeviceId : null,
    })

    if (effectiveServiceMode !== 'office') {
      await recordCustomerContact(connection, effectiveCustomerId, contactName || customerConfirmName, contactPhone, req.user.id)
    }
    await writeAudit(connection, req.user.id, req.params.id, 'self_report_update')
    await connection.execute(
      `DELETE FROM self_report_drafts
       WHERE engineer_id = :engineerId
         AND draft_scope = 'edit'
         AND service_order_id = :serviceOrderId`,
      {
        engineerId: req.user.id,
        serviceOrderId: req.params.id,
      },
    )
  })

  res.status(204).end()
}

async function update(req, res) {
  await ensureServiceOrderInspectionColumns()
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  assertEditable(order)

  const { customerId, deviceId, serviceMode, serviceType, timesheetCategory, timesheetSalesperson, priority, issueDescription, internalNote } = req.body || {}
  const normalizedServiceMode = ['remote', 'onsite', 'office'].includes(serviceMode) ? serviceMode : null
  const effectiveServiceMode = normalizedServiceMode || order.service_mode || 'onsite'
  const effectiveTimesheetCategory =
    effectiveServiceMode === 'remote' ? timesheetCategory || order.timesheet_category || '排障' : null
  await query(
    `UPDATE service_orders
     SET customer_id = COALESCE(:customerId, customer_id),
         device_id = :deviceId,
         service_mode = COALESCE(:serviceMode, service_mode),
         service_type = COALESCE(:serviceType, service_type),
         timesheet_category = :timesheetCategory,
         timesheet_salesperson = COALESCE(:timesheetSalesperson, timesheet_salesperson),
         priority = COALESCE(:priority, priority),
         issue_description = COALESCE(:issueDescription, issue_description),
         internal_note = :internalNote
     WHERE id = :id`,
    {
      id: req.params.id,
      customerId: customerId || null,
      deviceId: deviceId || null,
      serviceMode: normalizedServiceMode,
      serviceType: serviceType || null,
      timesheetCategory: effectiveTimesheetCategory,
      timesheetSalesperson: timesheetSalesperson || null,
      priority: priority || null,
      issueDescription: issueDescription || null,
      internalNote: internalNote || null,
    },
  )

  res.status(204).end()
}

async function assign(req, res) {
  await ensureServiceOrderInspectionColumns()
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  assertEditable(order)

  const primaryEngineerId = Number(req.body?.primaryEngineerId || req.body?.engineerId || 0)
  const engineerIds = [...new Set([primaryEngineerId, ...(Array.isArray(req.body?.engineerIds) ? req.body.engineerIds : [])].map(Number).filter(Boolean))]
  if (!primaryEngineerId || !engineerIds.length) {
    throw badRequest('请选择派发工程师')
  }
  const plannedStartAt = String(req.body?.plannedStartAt || order.planned_start_at || '').trim() || null
  const plannedEndAt = String(req.body?.plannedEndAt || order.planned_end_at || '').trim() || null
  const note = String(req.body?.note || '').trim()
  if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt) {
    throw badRequest('计划结束时间不能早于开始时间')
  }

  await transaction(async (connection) => {
    const found = idParams(engineerIds, 'engineerId')
    const [engineerRows] = await connection.execute(
      `SELECT id
       FROM users
       WHERE id IN (${found.placeholders})
         AND role IN ('engineer', 'engineering_supervisor')
         AND status = 'active'`,
      found.params,
    )
    if (engineerRows.length !== engineerIds.length) {
      throw badRequest('派发工程师不存在或未启用')
    }
    await connection.execute(
      `UPDATE service_orders
       SET assigned_engineer_id = :primaryEngineerId,
           target_engineer_id = :primaryEngineerId,
           status = CASE WHEN status IN ('draft', 'pending_confirmation', 'rejected') THEN 'assigned' ELSE status END,
           planned_start_at = :plannedStartAt,
           planned_end_at = :plannedEndAt,
           internal_note = CASE
             WHEN :note = '' THEN internal_note
             WHEN internal_note IS NULL OR internal_note = '' THEN :note
             ELSE CONCAT(internal_note, '\n', :note)
           END
       WHERE id = :id`,
      { id: req.params.id, primaryEngineerId, plannedStartAt, plannedEndAt, note },
    )
    await replaceOrderEngineers(connection, req.params.id, engineerIds, req.user.id)
    await writeAudit(connection, req.user.id, req.params.id, 'assign', {
      previousStatus: order.status,
      primaryEngineerId,
      engineerIds,
      plannedStartAt,
      plannedEndAt,
    })
  })

  const updatedOrder = (await attachEngineers([await getOrder(req.params.id)]))[0]
  triggerAssignmentMail(updatedOrder, req.params.id)
  res.json({ item: orderPayload(updatedOrder) })
}

async function transition(req, res) {
  await ensureServiceOrderInspectionColumns()
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  const status = String(req.body?.status || '').trim()
  const reason = String(req.body?.reason || '').trim()
  const allowedStatuses = new Set(['draft', 'assigned', 'in_progress', 'submitted', 'approved', 'archived', 'cancelled'])
  if (!allowedStatuses.has(status)) {
    throw badRequest('目标状态不正确')
  }
  if (order.status === 'archived' && status !== 'archived') {
    throw badRequest('已归档服务单不允许变更状态')
  }
  if (order.status === status) {
    res.json({ item: orderPayload((await attachEngineers([order]))[0]) })
    return
  }

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE service_orders
       SET status = :status,
           submitted_at = CASE WHEN :status = 'submitted' THEN COALESCE(submitted_at, CURRENT_TIMESTAMP) ELSE submitted_at END,
           reviewed_by = CASE WHEN :status IN ('approved', 'archived') THEN :actorId ELSE reviewed_by END,
           reviewed_at = CASE WHEN :status IN ('approved', 'archived') THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
           archived_at = CASE WHEN :status = 'archived' THEN CURRENT_TIMESTAMP ELSE archived_at END,
           internal_note = CASE
             WHEN :reason = '' THEN internal_note
             WHEN internal_note IS NULL OR internal_note = '' THEN :reason
             ELSE CONCAT(internal_note, '\n', :reason)
           END
       WHERE id = :id`,
      { id: req.params.id, status, actorId: req.user.id, reason },
    )
    await writeAudit(connection, req.user.id, req.params.id, 'transition', {
      from: order.status,
      to: status,
      reason,
    })
  })

  res.json({ item: orderPayload((await attachEngineers([await getOrder(req.params.id)]))[0]) })
}

async function confirmInspectionOrder(req, res) {
  await ensureServiceOrderInspectionColumns()
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  if (order.status !== 'pending_confirmation') {
    throw badRequest('仅待确认巡检工单可以确认派发')
  }
  if (!order.inspection_schedule_id || order.service_type !== 'inspect') {
    throw badRequest('仅巡检计划生成的工单可以走确认派发')
  }

  const engineerId = Number(order.target_engineer_id || 0)
  if (!engineerId) {
    throw badRequest('巡检工单缺少目标工程师，请使用派单 / 改派设置')
  }
  const plannedStartAt = String(order.planned_start_at || `${order.inspection_occurrence_date} 09:00:00`).trim()
  const plannedEndAt = String(order.planned_end_at || '').trim() || null

  await transaction(async (connection) => {
    await ensureServiceOrderInspectionColumns(connection)
    const [engineerRows] = await connection.execute(
      `SELECT id
       FROM users
       WHERE id = :engineerId AND role = 'engineer' AND status = 'active'
       LIMIT 1`,
      { engineerId },
    )
    if (!engineerRows[0]) {
      throw badRequest('派发工程师不存在或未启用')
    }
    const [updateResult] = await connection.execute(
      `UPDATE service_orders
       SET status = 'assigned',
           assigned_engineer_id = :engineerId,
           target_engineer_id = :engineerId,
           planned_start_at = :plannedStartAt,
           planned_end_at = :plannedEndAt,
           confirmed_by = :confirmedBy,
           confirmed_at = CURRENT_TIMESTAMP
       WHERE id = :id
         AND status = 'pending_confirmation'`,
      {
        id: req.params.id,
        engineerId,
        plannedStartAt,
        plannedEndAt,
        confirmedBy: req.user.id,
      },
    )
    if (!updateResult.affectedRows) {
      throw badRequest('当前服务单状态已变化，请刷新后重试')
    }
    await replaceOrderEngineers(connection, req.params.id, [engineerId], req.user.id)
    await writeAudit(connection, req.user.id, req.params.id, 'inspection_order_confirm', {
      inspectionScheduleId: order.inspection_schedule_id,
      inspectionOccurrenceDate: order.inspection_occurrence_date,
      engineerId,
      plannedStartAt,
    })
  })

  const updatedOrder = (await attachEngineers([await getOrder(req.params.id)]))[0]
  triggerAssignmentMail(updatedOrder, req.params.id)
  res.json({ item: orderPayload(updatedOrder) })
}

async function cancelByEngineer(req, res) {
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }
  await assertEngineerOwns(order, req.user)

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE service_orders
       SET status = 'cancelled'
       WHERE id = :id`,
      { id: req.params.id },
    )
    await writeAudit(connection, req.user.id, req.params.id, 'cancel', {
      orderNo: order.order_no,
      previousStatus: order.status,
      source: 'engineer_rc',
    })
  })

  res.status(204).end()
}

async function remove(req, res) {
  const order = await getOrder(req.params.id)
  if (!order) {
    throw notFound('服务单不存在')
  }

  if (req.user.role === 'assistant' && order.status !== 'draft') {
    throw badRequest('助理只能删除未派发的草稿工单')
  }
  if (!['draft', 'assigned', 'rejected'].includes(order.status)) {
    throw badRequest('仅未提交的草稿服务单可以删除')
  }
  if (engineerScopedRoles.has(req.user.role)) {
    await assertEngineerOwns(order, req.user)
  }

  const filePathsToCleanup = await transaction(async (connection) => {
    await ensureServiceReportWorkEntriesTable(connection)
    await ensureSelfReportDraftsTable(connection)
    await connection.execute('DELETE FROM service_report_work_entries WHERE service_order_id = :id', { id: req.params.id })
    await connection.execute('DELETE FROM service_parts WHERE service_order_id = :id', { id: req.params.id })
    const deletedFilePaths = await deleteFileRowsForOrderIds(connection, [req.params.id])
    await connection.execute('DELETE FROM service_reports WHERE service_order_id = :id', { id: req.params.id })
    await connection.execute('DELETE FROM service_order_engineers WHERE service_order_id = :id', { id: req.params.id })
    await connection.execute(
      `DELETE FROM self_report_drafts
       WHERE draft_scope = 'edit'
         AND service_order_id = :id`,
      { id: req.params.id },
    )
    await connection.execute('DELETE FROM service_orders WHERE id = :id', { id: req.params.id })
    await writeAudit(connection, req.user.id, req.params.id, 'delete', {
      orderNo: order.order_no,
      previousStatus: order.status,
      source: engineerScopedRoles.has(req.user.role) ? 'engineer' : 'ops',
    })
    return deletedFilePaths
  })
  cleanupStorageFiles(filePathsToCleanup)

  res.status(204).end()
}

async function bulkDelete(req, res) {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => Number(id)).filter(Boolean))]
    : []
  if (!ids.length) {
    throw badRequest('请选择要删除的服务表')
  }

  const { params, placeholders } = idParams(ids, 'orderId')
  const rows = await query(
    `SELECT id, order_no
     FROM service_orders
     WHERE id IN (${placeholders})`,
    params,
  )
  if (!rows.length) {
    throw notFound('服务表不存在')
  }
  const foundIds = rows.map((row) => Number(row.id))
  const found = idParams(foundIds, 'orderId')

  const filePathsToCleanup = await transaction(async (connection) => {
    await ensureServiceReportWorkEntriesTable(connection)
    await connection.execute(`DELETE FROM service_report_work_entries WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(`DELETE FROM service_parts WHERE service_order_id IN (${found.placeholders})`, found.params)
    const deletedFilePaths = await deleteFileRowsForOrderIds(connection, foundIds)
    await connection.execute(`DELETE FROM service_reports WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(`DELETE FROM service_order_engineers WHERE service_order_id IN (${found.placeholders})`, found.params)
    await connection.execute(`DELETE FROM service_orders WHERE id IN (${found.placeholders})`, found.params)

    for (const row of rows) {
      await writeAudit(connection, req.user.id, row.id, 'delete', { orderNo: row.order_no })
    }
    return deletedFilePaths
  })
  cleanupStorageFiles(filePathsToCleanup)

  res.json({ deleted: foundIds.length })
}

module.exports = {
  list,
  statsOverview,
  timesheetMonthly,
  createTimesheetManualEntry,
  deleteTimesheetManualEntry,
  create,
  aiSelfReportDraft,
  aiSelfReportDraftStatus,
  createSelfReport,
  updateSelfReport,
  detail,
  exportPdf,
  exportPdfBatch,
  latestCustomerSignature,
  getSelfReportDraft,
  saveSelfReportDraft,
  deleteSelfReportDraft,
  cancelByEngineer,
  remove,
  assign,
  transition,
  confirmInspectionOrder,
  update,
  bulkDelete,
}
