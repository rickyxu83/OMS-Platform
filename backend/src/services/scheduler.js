const cron = require('node-cron')
const { query } = require('../config/db')
const { getSettings } = require('../modules/settings/store')
const { generateTimesheetWorkSummary } = require('../modules/service-orders/work-summary')
const { generateDueOrders } = require('../modules/inspection-schedules/controller')
const { INTERNAL_CUSTOMER_NAME, INTERNAL_CUSTOMER_NAME_KEY } = require('../modules/customers/internal')
const {
  sendMaintenanceExpiryMail,
  sendNoMaintenanceDevicesMail,
  sendMissingCustomerSalespersonMail,
  sendInspectionScheduleDateMissingMail,
  sendInspectionReminderMail,
  sendInspectionOverdueMail,
  sendMonthlyOperationsSummaryMail,
} = require('./mail')
const { processDueSalesServiceOrderNotifications } = require('./sales-notifications')
const { processMrNotifications } = require('./mr-notifications')
const { processMrArchives } = require('../modules/mr/lib/archive')

const SCHEDULER_TIMEZONE = process.env.SCHEDULER_TIMEZONE || 'Asia/Shanghai'
const INSPECTION_AUTO_GENERATE_DAYS = 14

function scheduleCron(expression, task) {
  return cron.schedule(expression, task, { timezone: SCHEDULER_TIMEZONE })
}

function shanghaiDateKeyAfter(days) {
  return new Date(Date.now() + (8 * 60 + days * 24 * 60) * 60 * 1000).toISOString().slice(0, 10)
}

function deviceDisplaySql(alias = 'd') {
  return `COALESCE(NULLIF(CONCAT_WS(' / ', NULLIF(${alias}.model, ''), NULLIF(${alias}.serial_no, '')), ''), NULLIF(${alias}.name, ''), '-')`
}

async function notificationSettings() {
  const saved = await getSettings([
    'notification.maintenanceExpiryEnabled',
    'notification.maintenanceExpiryDays',
    'notification.maintenanceExpiryRecipients',
    'notification.noMaintenanceReminderEnabled',
    'notification.missingCustomerSalespersonEnabled',
    'notification.missingCustomerSalespersonRecipients',
    'notification.inspectionReminderEnabled',
    'notification.inspectionReminderDays',
    'notification.inspectionReminderRecipients',
    'notification.inspectionReminderSalesNotifyEnabled',
    'notification.inspectionScheduleDateMissingEnabled',
    'notification.inspectionAutoGenerateEnabled',
    'notification.inspectionOverdueEnabled',
    'notification.inspectionOverdueDays',
    'notification.inspectionOverdueRecipients',
    'notification.monthlyOperationsSummaryEnabled',
    'notification.monthlyOperationsSummaryRecipients',
    'notification.monthlyOperationsSummarySalesEnabled',
    'notification.monthlyOperationsSummaryEngineersEnabled',
    'notification.serviceOrderAdminBaseUrl',
  ])
  return {
    maintenanceExpiryEnabled: saved['notification.maintenanceExpiryEnabled'] !== 'false',
    maintenanceExpiryDays: Math.max(1, Math.min(365, Number(saved['notification.maintenanceExpiryDays'] || 30))),
    maintenanceExpiryRecipients: String(saved['notification.maintenanceExpiryRecipients'] || '').trim(),
    noMaintenanceReminderEnabled: saved['notification.noMaintenanceReminderEnabled'] !== 'false',
    missingCustomerSalespersonEnabled: saved['notification.missingCustomerSalespersonEnabled'] !== 'false',
    missingCustomerSalespersonRecipients: String(saved['notification.missingCustomerSalespersonRecipients'] || '').trim(),
    inspectionReminderEnabled: saved['notification.inspectionReminderEnabled'] !== 'false',
    inspectionReminderDays: Math.max(1, Math.min(365, Number(saved['notification.inspectionReminderDays'] || 3))),
    inspectionReminderRecipients: String(saved['notification.inspectionReminderRecipients'] || '').trim(),
    inspectionReminderSalesNotifyEnabled: saved['notification.inspectionReminderSalesNotifyEnabled'] !== 'false',
    inspectionScheduleDateMissingEnabled: saved['notification.inspectionScheduleDateMissingEnabled'] !== 'false',
    inspectionAutoGenerateEnabled: saved['notification.inspectionAutoGenerateEnabled'] !== 'false',
    inspectionOverdueEnabled: saved['notification.inspectionOverdueEnabled'] !== 'false',
    inspectionOverdueDays: Math.max(1, Math.min(365, Number(saved['notification.inspectionOverdueDays'] || 1))),
    inspectionOverdueRecipients: String(saved['notification.inspectionOverdueRecipients'] || '').trim(),
    monthlyOperationsSummaryEnabled: saved['notification.monthlyOperationsSummaryEnabled'] !== 'false',
    monthlyOperationsSummaryRecipients: String(saved['notification.monthlyOperationsSummaryRecipients'] || '').trim(),
    monthlyOperationsSummarySalesEnabled: saved['notification.monthlyOperationsSummarySalesEnabled'] === 'true',
    monthlyOperationsSummaryEngineersEnabled: saved['notification.monthlyOperationsSummaryEngineersEnabled'] === 'true',
    serviceOrderAdminBaseUrl: String(saved['notification.serviceOrderAdminBaseUrl'] || '').trim().replace(/\/+$/, ''),
  }
}

function recipientList(value) {
  return String(value || '')
    .split(/[,;\s，；]+/)
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }))
}

function serviceModeLabel(mode) {
  if (mode === 'office') return '内勤'
  if (mode === 'remote') return '远程'
  return '现场'
}

function timesheetType(serviceType, serviceMode = 'onsite') {
  if (serviceMode === 'office') return ['内部工作', '其他']
  if (serviceMode === 'remote') return ['远程服务', '排障']
  const map = {
    install: ['售后服务', '安装'],
    repair: ['维护服务', '排障'],
    maintain: ['维护服务', '调优', '保养'],
    inspect: ['维护服务', '巡检'],
    training: ['售后服务', '培训'],
    other: ['维护服务', '其他'],
  }
  return map[serviceType] || map.other
}

function joinWorkContent(...values) {
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

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase()
}

function userIdentitySet(user) {
  return new Set([user.real_name, user.username, user.email, user.login_alias]
    .map(normalizeIdentity)
    .filter(Boolean))
}

function identityMatches(value, identities) {
  const normalized = normalizeIdentity(value)
  return Boolean(normalized && identities.has(normalized))
}

function shanghaiDateParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function previousMonthRange() {
  const now = shanghaiDateParts()
  const previousMonth = new Date(Date.UTC(now.year, now.month - 2, 1))
  const year = previousMonth.getUTCFullYear()
  const month = previousMonth.getUTCMonth() + 1
  const monthText = `${year}-${String(month).padStart(2, '0')}`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    month: monthText,
    startDate: `${monthText}-01`,
    endDate: `${monthText}-${String(lastDay).padStart(2, '0')}`,
    label: monthText,
  }
}

function monthlyReportStats(items) {
  const serviceOrderIds = new Set()
  const customerNames = new Set()
  const engineerKeys = new Set()
  let totalHours = 0

  for (const item of items) {
    if (item.source === 'service_order' && item.serviceOrderId) {
      serviceOrderIds.add(String(item.serviceOrderId))
    }
    if (item.customerName) customerNames.add(String(item.customerName))

    const engineerIds = Array.isArray(item.engineerIds) ? item.engineerIds : []
    if (engineerIds.length) {
      engineerIds.forEach((id) => engineerKeys.add(`id:${id}`))
    } else if (item.engineerName) {
      engineerKeys.add(`name:${item.engineerName}`)
    }

    totalHours += Number(item.workHours || 0) || 0
  }

  return {
    serviceOrders: serviceOrderIds.size,
    customers: customerNames.size,
    engineers: engineerKeys.size,
    workHours: Number(totalHours.toFixed(1)),
  }
}

async function finalizeMonthlyOperationsReport(range, items, scope = {}) {
  const sortedItems = [...items].sort((left, right) => String(left.date).localeCompare(String(right.date)))
  const workSummary = await generateTimesheetWorkSummary({
    ...range,
    label: scope.label || range.label,
    scope: scope.type ? scope : { type: 'overall', name: '', description: '总览月报' },
    items: sortedItems,
  })
  return {
    ...range,
    label: scope.label || range.label,
    scope,
    stats: monthlyReportStats(sortedItems),
    items: sortedItems,
    workSummary,
  }
}

async function ensureTimesheetManualEntriesTable() {
  await query(
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

async function ensureServiceReportWorkEntriesTable() {
  await query(
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

async function buildMonthlyOperationsReport(range) {
  await ensureTimesheetManualEntriesTable()
  await ensureServiceReportWorkEntriesTable()
  const serviceRows = await query(
    `SELECT
       so.id, so.order_no, so.service_mode, so.service_type, so.timesheet_category, so.timesheet_salesperson,
       so.assigned_engineer_id,
       so.issue_description, so.internal_note, so.planned_start_at, so.submitted_at, so.created_at,
       c.name AS customer_name, c.salesperson AS customer_salesperson,
       ${deviceDisplaySql('d')} AS device_name,
       sr.actual_start_at, sr.work_content, sr.result, sr.result_description,
       work_entries.work_content AS work_entries_content,
       u.real_name AS engineer_name
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     LEFT JOIN users u ON u.id = so.assigned_engineer_id
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
     ORDER BY COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at), so.id`,
    range,
  )
  const manualRows = await query(
    `SELECT tme.id, tme.engineer_id, tme.entry_date, tme.category, tme.customer_project,
            tme.work_content, tme.progress, tme.remark, u.real_name AS engineer_name
     FROM timesheet_manual_entries tme
     JOIN users u ON u.id = tme.engineer_id
     WHERE tme.entry_date >= :startDate
       AND tme.entry_date <= :endDate
     ORDER BY tme.entry_date, u.real_name, tme.id`,
    range,
  )
  const participantRows = await query(
    `SELECT DISTINCT participants.service_order_id, participants.engineer_id, u.real_name, u.username, u.email
     FROM (
       SELECT service_order_id, engineer_id FROM service_order_engineers
       UNION
       SELECT id AS service_order_id, assigned_engineer_id AS engineer_id
       FROM service_orders
       WHERE assigned_engineer_id IS NOT NULL
     ) participants
     JOIN service_orders so ON so.id = participants.service_order_id
     JOIN users u ON u.id = participants.engineer_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     WHERE DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) >= :startDate
       AND DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) <= :endDate
       AND so.status <> 'cancelled'`,
    range,
  )
  const workEntryRows = await query(
    `SELECT srwe.service_order_id, srwe.engineer_id, srwe.work_content,
            COALESCE(u.real_name, u.username, '工程师') AS engineer_name
     FROM service_report_work_entries srwe
     JOIN service_orders so ON so.id = srwe.service_order_id
     JOIN users u ON u.id = srwe.engineer_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     WHERE DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) >= :startDate
       AND DATE(COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)) <= :endDate
       AND so.status <> 'cancelled'`,
    range,
  )

  const participantsByOrder = new Map()
  for (const row of participantRows) {
    const orderId = String(row.service_order_id)
    if (!participantsByOrder.has(orderId)) participantsByOrder.set(orderId, [])
    participantsByOrder.get(orderId).push({
      id: Number(row.engineer_id),
      name: row.real_name || row.username || '工程师',
      email: row.email || '',
    })
  }

  const workEntriesByOrder = new Map()
  for (const row of workEntryRows) {
    const orderId = String(row.service_order_id)
    const engineerId = String(row.engineer_id)
    if (!workEntriesByOrder.has(orderId)) workEntriesByOrder.set(orderId, new Map())
    const existing = workEntriesByOrder.get(orderId).get(engineerId)
    const content = joinWorkContent(existing, row.work_content)
    workEntriesByOrder.get(orderId).set(engineerId, content)
  }

  const serviceItems = serviceRows.map((row) => {
    const date = String(row.actual_start_at || row.planned_start_at || row.submitted_at || row.created_at).slice(0, 10)
    const [workNature, fallbackCategory] = timesheetType(row.service_type, row.service_mode)
    const workHours = 1
    const participants = participantsByOrder.get(String(row.id)) || []
    const engineerIds = participants.map((engineer) => engineer.id).filter(Boolean)
    const engineerNames = participants.map((engineer) => engineer.name).filter(Boolean)
    const workEntriesMap = workEntriesByOrder.get(String(row.id)) || new Map()
    const workEntriesByEngineer = {}
    for (const [engineerId, content] of workEntriesMap.entries()) {
      workEntriesByEngineer[engineerId] = content
    }
    return {
      source: 'service_order',
      serviceOrderId: row.id,
      orderNo: row.order_no,
      serviceMode: row.service_mode || 'onsite',
      engineerIds,
      engineerNames,
      engineerName: engineerNames.join('、') || row.engineer_name || '工程师',
      date,
      workNature,
      category: row.timesheet_category || fallbackCategory || serviceModeLabel(row.service_mode),
      customerName: row.customer_name,
      productName: row.service_mode === 'office' ? row.internal_note || '' : row.device_name || '',
      workContent: joinWorkContent(
        row.work_entries_content,
        row.work_content,
        row.result_description,
        row.issue_description,
      ),
      workEntriesByEngineer,
      reportWorkContent: row.work_content,
      faultSummary: null,
      resultDescription: row.result_description,
      issueDescription: row.issue_description,
      salesperson: row.timesheet_salesperson || row.customer_salesperson || '',
      progress:
        {
          resolved: '已完成',
          unresolved: '未完成',
          follow_up_required: '搁置中',
        }[row.result] || '已完成',
      workHours,
      remark: row.order_no,
    }
  })
  const manualItems = manualRows.map((row) => {
    const workHours = 1
    return {
      source: 'manual',
      manualEntryId: row.id,
      engineerIds: [Number(row.engineer_id)].filter(Boolean),
      engineerNames: [row.engineer_name || '工程师'],
      serviceMode: 'manual',
      engineerName: row.engineer_name || '工程师',
      date: String(row.entry_date).slice(0, 10),
      workNature: '内部工作',
      category: row.category,
      customerName: row.customer_project || '',
      productName: row.customer_project || '',
      workContent: row.work_content,
      salesperson: '',
      progress: row.progress || '已完成',
      workHours,
      remark: row.remark || '',
    }
  })
  return finalizeMonthlyOperationsReport(range, [...serviceItems, ...manualItems])
}

async function activeUsersByRoles(roles) {
  const params = {}
  const placeholders = roles.map((role, index) => {
    const key = `role${index}`
    params[key] = role
    return `:${key}`
  }).join(', ')
  return query(
    `SELECT id, username, real_name, email, login_alias, role
     FROM users
     WHERE status = 'active'
       AND role IN (${placeholders})
       AND email IS NOT NULL AND email <> ''
     ORDER BY real_name ASC, username ASC`,
    params,
  )
}

function monthlySalesItemsForUser(items, user) {
  const identities = userIdentitySet(user)
  return items.filter((item) => item.source === 'service_order' && identityMatches(item.salesperson, identities))
}

function monthlyEngineerItemsForUser(items, user) {
  const engineerId = String(user.id)
  const engineerName = user.real_name || user.username || '工程师'
  return items
    .filter((item) => (Array.isArray(item.engineerIds) ? item.engineerIds : []).map(String).includes(engineerId))
    .map((item) => {
      if (item.source !== 'service_order') {
        return {
          ...item,
          engineerIds: [Number(user.id)],
          engineerNames: [engineerName],
          engineerName,
        }
      }
      return {
        ...item,
        engineerIds: [Number(user.id)],
        engineerNames: [engineerName],
        engineerName,
        workContent: joinWorkContent(
          item.workEntriesByEngineer?.[engineerId],
          item.reportWorkContent,
          item.faultSummary,
          item.resultDescription,
          item.issueDescription,
        ),
      }
    })
}

async function sendMonthlyScopedSummaries({ report, users, itemsForUser, mailOptions, detailBaseUrl }) {
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    const items = itemsForUser(report.items, user)
    if (!items.length) {
      skipped += 1
      continue
    }
    const displayName = user.real_name || user.username || user.email
    try {
      const scopedReport = await finalizeMonthlyOperationsReport(
        report,
        items,
        {
          type: mailOptions.scopeType,
          name: displayName,
          label: report.label,
          description: mailOptions.scopeDescription,
        },
      )
      const result = await sendMonthlyOperationsSummaryMail(
        scopedReport,
        [user],
        detailBaseUrl,
        {
          title: mailOptions.title,
          subjectPrefix: mailOptions.subjectPrefix,
          description: mailOptions.description,
          showLinks: false,
        },
      )
      if (result?.skipped) {
        skipped += 1
        console.warn('[scheduler] Monthly scoped summary skipped', {
          recipient: user.email,
          scope: mailOptions.scopeType,
          reason: result.reason,
          missing: result.missing,
        })
      } else {
        sent += 1
      }
    } catch (error) {
      failed += 1
      console.error('[scheduler] Monthly scoped summary failed', {
        recipient: user.email,
        scope: mailOptions.scopeType,
        message: error?.message,
      })
    }
  }

  return { sent, skipped, failed }
}

async function sendMonthlySalesSummaries(report, nSettings) {
  const salespeople = await activeUsersByRoles(['sales', 'sales_supervisor'])
  if (!salespeople.length) return { sent: 0, skipped: 0, failed: 0 }
  return sendMonthlyScopedSummaries({
    report,
    users: salespeople,
    itemsForUser: monthlySalesItemsForUser,
    detailBaseUrl: nSettings.serviceOrderAdminBaseUrl,
    mailOptions: {
      scopeType: 'sales',
      title: '销售月度客户营运总结',
      subjectPrefix: '销售月度客户营运总结',
      scopeDescription: '仅包含该销售负责客户在统计期间内产生的服务工单。',
      description: '以下内容为你负责客户的上月服务工单摘要，供客户跟进、续保沟通和风险预判使用。',
    },
  })
}

async function sendMonthlyEngineerSummaries(report, nSettings) {
  const engineers = await activeUsersByRoles(['engineer', 'engineering_supervisor'])
  if (!engineers.length) return { sent: 0, skipped: 0, failed: 0 }
  return sendMonthlyScopedSummaries({
    report,
    users: engineers,
    itemsForUser: monthlyEngineerItemsForUser,
    detailBaseUrl: nSettings.serviceOrderAdminBaseUrl,
    mailOptions: {
      scopeType: 'engineer',
      title: '工程师月度工单总结',
      subjectPrefix: '工程师月度工单总结',
      scopeDescription: '仅包含该工程师在统计期间内参与或负责的服务工单及手工工时记录。',
      description: '以下内容为你上月参与或负责工单的工作摘要，供复盘工作重点和后续事项使用。',
    },
  })
}

function startScheduler() {
  scheduleCron('0 8 * * *', async () => {
    console.log('[scheduler] Running maintenance expiry check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.maintenanceExpiryEnabled) {
        console.log('[scheduler] Maintenance expiry notification is disabled')
        return
      }

      const devices = await query(
        `SELECT d.id, d.name, d.model, d.serial_no, d.maintenance_end, d.maintenance_type,
                c.name AS customer_name, c.salesperson
         FROM devices d
         JOIN customers c ON c.id = d.customer_id
         WHERE d.maintenance_end IS NOT NULL
           AND DATEDIFF(d.maintenance_end, CURDATE()) = :expiryDays
           AND d.maintenance_type IN ('original_manufacturer', 'our_maintenance')`,
        { expiryDays: nSettings.maintenanceExpiryDays },
      )
      if (!devices.length) {
        console.log(`[scheduler] No devices expiring in ${nSettings.maintenanceExpiryDays} days`)
        return
      }

      const configuredRows = recipientList(nSettings.maintenanceExpiryRecipients)

      const salespersonNames = [...new Set(devices.map((d) => (d.salesperson || '').trim()).filter(Boolean))]
      let salespersonRows = []
      if (salespersonNames.length) {
        const placeholders = salespersonNames.map((_, i) => `:sp${i}`).join(',')
        const params = {}
        salespersonNames.forEach((name, i) => { params[`sp${i}`] = name })
        salespersonRows = await query(
          `SELECT email, real_name FROM users
           WHERE (real_name IN (${placeholders}) OR username IN (${placeholders}))
             AND email IS NOT NULL AND email <> ''`,
          params,
        )
        if (salespersonRows.length) {
          console.log(`[scheduler] Found ${salespersonRows.length} salespeople with emails: ${salespersonRows.map((r) => `${r.real_name}<${r.email}>`).join(', ')}`)
        }
      }

      const allRecipients = [...configuredRows, ...salespersonRows]
      const seen = new Set()
      const deduped = allRecipients.filter((r) => {
        const key = r.email.toLowerCase().trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })

      if (!deduped.length) {
        console.warn('[scheduler] No recipients for maintenance expiry mail')
        return
      }

      const result = await sendMaintenanceExpiryMail(devices, deduped)
      if (result?.skipped) {
        console.warn('[scheduler] Maintenance expiry mail skipped', {
          reason: result.reason,
          missing: result.missing,
        })
      } else {
        console.log(`[scheduler] Maintenance expiry mail sent: ${result.deviceCount} devices to ${result.to}`)
      }
    } catch (error) {
      console.error('[scheduler] Maintenance expiry check failed', error?.message)
    }
  })

  scheduleCron('30 8 * * 1', async () => {
    console.log('[scheduler] Running incomplete maintenance device check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.noMaintenanceReminderEnabled) {
        console.log('[scheduler] Incomplete maintenance device notification is disabled')
        return
      }

      const devices = await query(
        `SELECT d.id, d.name, d.model, d.serial_no, d.location,
                d.maintenance_type, d.maintenance_start, d.maintenance_end,
                d.installation_source_service_order_id,
                c.name AS customer_name, c.salesperson
         FROM devices d
         JOIN customers c ON c.id = d.customer_id
         WHERE (
             d.maintenance_type IS NULL
             OR d.maintenance_type = ''
             OR d.maintenance_type = 'pending_confirmation'
             OR (
               d.maintenance_type IN ('original_manufacturer', 'our_maintenance')
               AND d.maintenance_end IS NULL
             )
           )
         ORDER BY c.salesperson ASC, c.name ASC, d.model ASC, d.name ASC, d.id ASC`,
      )
      if (!devices.length) {
        console.log('[scheduler] No devices with incomplete maintenance info')
        return
      }

      let sent = 0
      let skipped = 0
      const salesDevices = devices.filter((device) => String(device.salesperson || '').trim())
      const salespersonNames = [...new Set(salesDevices.map((d) => (d.salesperson || '').trim()).filter(Boolean))]
      const placeholders = salespersonNames.map((_, i) => `:sp${i}`).join(',')
      const params = {}
      salespersonNames.forEach((name, i) => { params[`sp${i}`] = name })
      const salespersonRows = await query(
        `SELECT email, real_name, username
         FROM users
         WHERE (real_name IN (${placeholders}) OR username IN (${placeholders}))
           AND email IS NOT NULL AND email <> ''`,
        params,
      )
      if (!salespersonRows.length) {
        console.warn('[scheduler] No salespeople with emails for incomplete maintenance devices')
      }

      for (const salesperson of salespersonRows) {
        const names = new Set([salesperson.real_name, salesperson.username].map((value) => String(value || '').trim()).filter(Boolean))
        const scopedDevices = salesDevices.filter((device) => names.has(String(device.salesperson || '').trim()))
        if (!scopedDevices.length) continue
        const result = await sendNoMaintenanceDevicesMail(scopedDevices, [salesperson], nSettings.serviceOrderAdminBaseUrl)
        if (result?.skipped) {
          skipped += 1
          console.warn('[scheduler] Incomplete maintenance device mail skipped', {
            salesperson: salesperson.email,
            reason: result.reason,
            missing: result.missing,
          })
        } else {
          sent += 1
          console.log(`[scheduler] Incomplete maintenance device mail sent to ${salesperson.email}: ${result.deviceCount} devices`)
        }
      }
      // 同步提醒创建设备的安装工单工程师:设备由哪张工单创建,就发给该工单的全部工程师
      const sourceOrderIds = [...new Set(devices.map((d) => Number(d.installation_source_service_order_id)).filter(Boolean))]
      if (sourceOrderIds.length) {
        const orderPlaceholders = sourceOrderIds.map((_, i) => `:so${i}`).join(',')
        const orderParams = {}
        sourceOrderIds.forEach((id, i) => { orderParams[`so${i}`] = id })
        // 工程师取工单协作表 + 历史工单的 assigned_engineer_id(老数据可能没有关联表记录)
        const engineerRows = await query(
          `SELECT soe.service_order_id, u.email
           FROM service_order_engineers soe
           JOIN users u ON u.id = soe.engineer_id
           WHERE soe.service_order_id IN (${orderPlaceholders})
             AND u.email IS NOT NULL AND u.email <> ''
           UNION
           SELECT so.id, u.email
           FROM service_orders so
           JOIN users u ON u.id = so.assigned_engineer_id
           WHERE so.id IN (${orderPlaceholders})
             AND u.email IS NOT NULL AND u.email <> ''`,
          orderParams,
        )
        const engineersByOrderId = new Map()
        for (const row of engineerRows) {
          const key = Number(row.service_order_id)
          if (!engineersByOrderId.has(key)) engineersByOrderId.set(key, [])
          const list = engineersByOrderId.get(key)
          if (!list.some((engineer) => engineer.email === row.email)) list.push({ email: row.email })
        }
        for (const [orderId, engineers] of engineersByOrderId) {
          const engineerDevices = devices.filter((d) => Number(d.installation_source_service_order_id) === orderId)
          if (!engineerDevices.length) continue
          const result = await sendNoMaintenanceDevicesMail(engineerDevices, engineers, nSettings.serviceOrderAdminBaseUrl, { audience: 'engineer' })
          if (result?.skipped) {
            skipped += 1
            console.warn('[scheduler] Incomplete maintenance device mail to engineers skipped', {
              orderId,
              reason: result.reason,
              missing: result.missing,
            })
          } else {
            sent += 1
            console.log(`[scheduler] Incomplete maintenance device mail sent to ${engineers.length} engineer(s) of order ${orderId}: ${result.deviceCount} devices`)
          }
        }
      }
      console.log(`[scheduler] Incomplete maintenance device notifications processed: sent=${sent}, skipped=${skipped}`)
    } catch (error) {
      console.error('[scheduler] Incomplete maintenance device check failed', error?.message)
    }
  })

  scheduleCron('35 8 * * 1', async () => {
    console.log('[scheduler] Running missing customer salesperson check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.missingCustomerSalespersonEnabled) {
        console.log('[scheduler] Missing customer salesperson notification is disabled')
        return
      }

      const customers = await query(
        `SELECT id, name, code, address, contact_name, contact_phone, salesperson
         FROM customers
         WHERE (salesperson IS NULL OR salesperson = '')
           AND NOT (name = :internalCustomerName OR name_key = :internalCustomerNameKey)
         ORDER BY updated_at DESC, id DESC`,
        {
          internalCustomerName: INTERNAL_CUSTOMER_NAME,
          internalCustomerNameKey: INTERNAL_CUSTOMER_NAME_KEY,
        },
      )
      if (!customers.length) {
        console.log('[scheduler] No customers missing salesperson')
        return
      }

      const recipients = recipientList(nSettings.missingCustomerSalespersonRecipients)
      if (!recipients.length) {
        console.warn('[scheduler] No configured recipients for missing customer salesperson mail')
        return
      }

      const result = await sendMissingCustomerSalespersonMail(customers, recipients, nSettings.serviceOrderAdminBaseUrl)
      if (result?.skipped) {
        console.warn('[scheduler] Missing customer salesperson mail skipped', {
          reason: result.reason,
          missing: result.missing,
        })
      } else {
        console.log(`[scheduler] Missing customer salesperson mail sent: ${result.customerCount} customers to ${result.to}`)
      }
    } catch (error) {
      console.error('[scheduler] Missing customer salesperson check failed', error?.message)
    }
  })

  scheduleCron('40 8 * * 1', async () => {
    console.log('[scheduler] Running inspection schedule date completeness check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.inspectionScheduleDateMissingEnabled) {
        console.log('[scheduler] Inspection schedule date completeness notification is disabled')
        return
      }

      const schedules = await query(
        `SELECT s.id, s.name, s.cadence, s.next_run_anchor, s.end_date,
                c.name AS customer_name, c.salesperson,
                (SELECT GROUP_CONCAT(${deviceDisplaySql('d2')} SEPARATOR '、')
                 FROM inspection_schedule_devices sd2
                 LEFT JOIN devices d2 ON d2.id = sd2.device_id
                 WHERE sd2.schedule_id = s.id) AS device_names
         FROM inspection_schedules s
         JOIN customers c ON c.id = s.customer_id
         WHERE s.active = 1
           AND (s.next_run_anchor IS NULL OR s.end_date IS NULL)
           AND c.salesperson IS NOT NULL
           AND c.salesperson <> ''
         ORDER BY c.salesperson ASC, c.name ASC, s.id ASC`,
      )
      if (!schedules.length) {
        console.log('[scheduler] No inspection schedules with missing dates')
        return
      }

      let sent = 0
      let skipped = 0
      const salespersonNames = [...new Set(schedules.map((s) => (s.salesperson || '').trim()).filter(Boolean))]
      const placeholders = salespersonNames.map((_, i) => `:sp${i}`).join(',')
      const params = {}
      salespersonNames.forEach((name, i) => { params[`sp${i}`] = name })
      const salespersonRows = await query(
        `SELECT email, real_name, username
         FROM users
         WHERE (real_name IN (${placeholders}) OR username IN (${placeholders}))
           AND email IS NOT NULL AND email <> ''`,
        params,
      )
      if (!salespersonRows.length) {
        console.warn('[scheduler] No salespeople with emails for inspection schedules missing dates')
      }

      for (const salesperson of salespersonRows) {
        const names = new Set([salesperson.real_name, salesperson.username].map((value) => String(value || '').trim()).filter(Boolean))
        const scopedSchedules = schedules.filter((schedule) => names.has(String(schedule.salesperson || '').trim()))
        if (!scopedSchedules.length) continue
        const result = await sendInspectionScheduleDateMissingMail(scopedSchedules, [salesperson], nSettings.serviceOrderAdminBaseUrl)
        if (result?.skipped) {
          skipped += 1
          console.warn('[scheduler] Inspection schedule date completeness mail skipped', {
            salesperson: salesperson.email,
            reason: result.reason,
            missing: result.missing,
          })
        } else {
          sent += 1
          console.log(`[scheduler] Inspection schedule date completeness mail sent to ${salesperson.email}: ${result.scheduleCount} schedules`)
        }
      }
      console.log(`[scheduler] Inspection schedule date completeness notifications processed: sent=${sent}, skipped=${skipped}`)
    } catch (error) {
      console.error('[scheduler] Inspection schedule date completeness check failed', error?.message)
    }
  })

  scheduleCron('30 6 * * *', async () => {
    console.log('[scheduler] Running inspection auto-generation...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.inspectionAutoGenerateEnabled) {
        console.log('[scheduler] Inspection auto-generation is disabled')
        return
      }
      const dueDate = shanghaiDateKeyAfter(INSPECTION_AUTO_GENERATE_DAYS)
      const result = await generateDueOrders({ dueDate, limit: 100 })
      console.log(`[scheduler] Inspection auto-generation processed through ${dueDate}: generated=${result.generated}, skipped=${result.skipped}`)
    } catch (error) {
      console.error('[scheduler] Inspection auto-generation failed', error?.message)
    }
  })

  scheduleCron('0 7 * * *', async () => {
    console.log('[scheduler] Running inspection reminder check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.inspectionReminderEnabled) {
        console.log('[scheduler] Inspection reminder notification is disabled')
        return
      }

      const schedules = await query(
        `SELECT s.id, s.cadence, s.next_run_anchor, s.target_engineer_id,
                c.name AS customer_name, c.salesperson,
                u.email AS engineer_email, u.real_name AS engineer_name,
                (SELECT GROUP_CONCAT(${deviceDisplaySql('d2')} SEPARATOR '、')
                 FROM inspection_schedule_devices sd2
                 LEFT JOIN devices d2 ON d2.id = sd2.device_id
                 WHERE sd2.schedule_id = s.id) AS device_names
         FROM inspection_schedules s
         JOIN customers c ON c.id = s.customer_id
         JOIN users u ON u.id = s.target_engineer_id
         WHERE s.active = 1
           AND DATEDIFF(s.next_run_anchor, CURDATE()) = :reminderDays
           AND u.email IS NOT NULL AND u.email <> ''`,
        { reminderDays: nSettings.inspectionReminderDays },
      )
      if (!schedules.length) {
        console.log(`[scheduler] No inspections due in ${nSettings.inspectionReminderDays} days`)
        return
      }

      const byEngineer = new Map()
      for (const schedule of schedules) {
        const key = schedule.engineer_email.toLowerCase()
        if (!byEngineer.has(key)) {
          byEngineer.set(key, { email: schedule.engineer_email, name: schedule.engineer_name, items: [] })
        }
        byEngineer.get(key).items.push(schedule)
      }

      for (const [, group] of byEngineer) {
        const result = await sendInspectionReminderMail(group.items, [group])
        if (result?.skipped) {
          console.warn('[scheduler] Inspection reminder mail skipped', {
            engineer: group.email,
            reason: result.reason,
          })
        } else {
          console.log(`[scheduler] Inspection reminder sent to ${group.email}: ${result.scheduleCount} schedules`)
        }
      }

      const configuredRecipients = recipientList(nSettings.inspectionReminderRecipients)
      if (configuredRecipients.length) {
        const result = await sendInspectionReminderMail(schedules, configuredRecipients)
        if (result?.skipped) {
          console.warn('[scheduler] Inspection reminder summary mail skipped', {
            reason: result.reason,
          })
        } else {
          console.log(`[scheduler] Inspection reminder summary sent: ${result.scheduleCount} schedules to ${result.to}`)
        }
      }

      if (nSettings.inspectionReminderSalesNotifyEnabled) {
        const salespersonNames = [...new Set(schedules.map((schedule) => String(schedule.salesperson || '').trim()).filter(Boolean))]
        if (salespersonNames.length) {
          const placeholders = salespersonNames.map((_, i) => `:sp${i}`).join(',')
          const params = {}
          salespersonNames.forEach((name, i) => { params[`sp${i}`] = name })
          const salespersonRows = await query(
            `SELECT email, real_name, username, login_alias
             FROM users
             WHERE status = 'active'
               AND role IN ('sales', 'sales_supervisor')
               AND email IS NOT NULL AND email <> ''
               AND (
                 real_name IN (${placeholders})
                 OR username IN (${placeholders})
                 OR email IN (${placeholders})
                 OR login_alias IN (${placeholders})
               )`,
            params,
          )
          if (!salespersonRows.length) {
            console.warn('[scheduler] No salespeople with emails for inspection reminder')
          }

          for (const salesperson of salespersonRows) {
            const identities = new Set([salesperson.real_name, salesperson.username, salesperson.email, salesperson.login_alias].map((value) => String(value || '').trim()).filter(Boolean))
            const scopedSchedules = schedules.filter((schedule) => identities.has(String(schedule.salesperson || '').trim()))
            if (!scopedSchedules.length) continue
            const result = await sendInspectionReminderMail(scopedSchedules, [salesperson])
            if (result?.skipped) {
              console.warn('[scheduler] Inspection reminder sales mail skipped', {
                salesperson: salesperson.email,
                reason: result.reason,
              })
            } else {
              console.log(`[scheduler] Inspection reminder sent to salesperson ${salesperson.email}: ${result.scheduleCount} schedules`)
            }
          }
        }
      }
    } catch (error) {
      console.error('[scheduler] Inspection reminder check failed', error?.message)
    }
  })

  scheduleCron('10 8 * * *', async () => {
    console.log('[scheduler] Running overdue inspection check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.inspectionOverdueEnabled) {
        console.log('[scheduler] Inspection overdue notification is disabled')
        return
      }
      const recipients = recipientList(nSettings.inspectionOverdueRecipients)
      if (!recipients.length) {
        console.warn('[scheduler] No configured recipients for overdue inspection mail')
        return
      }

      const orders = await query(
        `SELECT *
         FROM (
           SELECT so.id, so.order_no, so.customer_id, c.name AS customer_name,
                  so.status, so.planned_start_at, so.planned_end_at, so.inspection_occurrence_date,
                  u.real_name AS engineer_name,
                  target_u.real_name AS target_engineer_name,
                  DATEDIFF(CURDATE(), DATE(COALESCE(so.planned_end_at, so.planned_start_at, so.inspection_occurrence_date))) AS overdue_days
           FROM service_orders so
           JOIN customers c ON c.id = so.customer_id
           LEFT JOIN users u ON u.id = so.assigned_engineer_id
           LEFT JOIN users target_u ON target_u.id = so.target_engineer_id
           WHERE so.inspection_schedule_id IS NOT NULL
             AND so.service_type = 'inspect'
             AND so.status NOT IN ('submitted', 'approved', 'archived', 'cancelled')
             AND COALESCE(so.planned_end_at, so.planned_start_at, so.inspection_occurrence_date) IS NOT NULL
         ) overdue_orders
         WHERE overdue_days >= :overdueDays
         ORDER BY overdue_days DESC, planned_end_at ASC, id ASC`,
        { overdueDays: nSettings.inspectionOverdueDays },
      )
      if (!orders.length) {
        console.log(`[scheduler] No overdue inspection orders over ${nSettings.inspectionOverdueDays} days`)
        return
      }

      const result = await sendInspectionOverdueMail(orders, recipients, nSettings.serviceOrderAdminBaseUrl)
      if (result?.skipped) {
        console.warn('[scheduler] Overdue inspection mail skipped', {
          reason: result.reason,
          missing: result.missing,
        })
      } else {
        console.log(`[scheduler] Overdue inspection mail sent: ${result.orderCount} orders to ${result.to}`)
      }
    } catch (error) {
      console.error('[scheduler] Overdue inspection check failed', error?.message)
    }
  })

  scheduleCron('20 8 1 * *', async () => {
    console.log('[scheduler] Running monthly operations summary...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.monthlyOperationsSummaryEnabled) {
        console.log('[scheduler] Monthly operations summary is disabled')
        return
      }
      const recipients = recipientList(nSettings.monthlyOperationsSummaryRecipients)
      if (!recipients.length && !nSettings.monthlyOperationsSummarySalesEnabled && !nSettings.monthlyOperationsSummaryEngineersEnabled) {
        console.warn('[scheduler] No configured recipients or scoped monthly operations summary targets')
        return
      }

      const report = await buildMonthlyOperationsReport(previousMonthRange())
      if (recipients.length) {
        const result = await sendMonthlyOperationsSummaryMail(report, recipients, nSettings.serviceOrderAdminBaseUrl)
        if (result?.skipped) {
          console.warn('[scheduler] Monthly operations summary skipped', {
            reason: result.reason,
            missing: result.missing,
          })
        } else {
          console.log(`[scheduler] Monthly operations summary sent for ${result.month} to ${result.to}`)
        }
      } else {
        console.log('[scheduler] Monthly operations summary fixed recipients are not configured')
      }

      if (nSettings.monthlyOperationsSummarySalesEnabled) {
        const salesResult = await sendMonthlySalesSummaries(report, nSettings)
        console.log(`[scheduler] Monthly sales summaries processed: sent=${salesResult.sent}, skipped=${salesResult.skipped}, failed=${salesResult.failed}`)
      }

      if (nSettings.monthlyOperationsSummaryEngineersEnabled) {
        const engineerResult = await sendMonthlyEngineerSummaries(report, nSettings)
        console.log(`[scheduler] Monthly engineer summaries processed: sent=${engineerResult.sent}, skipped=${engineerResult.skipped}, failed=${engineerResult.failed}`)
      }
    } catch (error) {
      console.error('[scheduler] Monthly operations summary failed', error?.message)
    }
  })

  scheduleCron('*/5 * * * *', async () => {
    try {
      const result = await processDueSalesServiceOrderNotifications(20)
      if (result?.skipped) return
      if (result?.processed) {
        console.log(`[scheduler] Sales service-order notifications processed: sent=${result.sent}, skipped=${result.skipped}, failed=${result.failed}`)
      }
    } catch (error) {
      console.error('[scheduler] Sales service-order notification check failed', error?.message)
    }
  })

  scheduleCron('* * * * *', async () => {
    try {
      const result = await processMrNotifications(20)
      if (result.processed) console.log(`[scheduler] MR notifications processed: sent=${result.sent}, failed=${result.failed}`)
    } catch (error) {
      console.error('[scheduler] MR notification check failed', error?.message)
    }
  })

  scheduleCron('*/2 * * * *', async () => {
    try {
      const result = await processMrArchives(5)
      if (result.processed) console.log(`[scheduler] MR archives processed: ready=${result.archived}, failed=${result.failed}`)
    } catch (error) {
      console.error('[scheduler] MR archive check failed', error?.message)
    }
  })

  console.log(`[scheduler] Started (${SCHEDULER_TIMEZONE}): maintenance expiry (08:00), incomplete maintenance devices (08:30 Monday), missing customer salesperson (08:35 Monday), inspection schedule date completeness (08:40 Monday), inspection auto-generation (06:30, 14 days ahead), inspection reminder (07:00), overdue inspection (08:10), monthly operations summary (08:20 on day 1), sales service-order notifications (every 5 minutes), MR approval notifications (1m), MR PDF archive retry (2m)`)}

module.exports = { startScheduler }
