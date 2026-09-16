/**
 * 智能报表存储（spec 014）：report_templates（收藏的报表定义）+ report_subscriptions（定时推送）。
 * 对话过程不落库；仅用户主动收藏的模板与订阅入库。建表走 ensure* 惰性迁移惯例。
 */
const { query } = require('../../config/db')

let tablesReady = false

async function ensureTables() {
  if (tablesReady) return
  await query(
    `CREATE TABLE IF NOT EXISTS report_templates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      spec JSON NOT NULL,
      chart_type VARCHAR(16) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_report_templates_creator (created_by),
      CONSTRAINT fk_report_templates_created_by FOREIGN KEY (created_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS report_subscriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      template_id BIGINT UNSIGNED NOT NULL,
      frequency ENUM('weekly', 'monthly') NOT NULL,
      recipients VARCHAR(500) NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      last_sent_at DATETIME NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_report_subscriptions_template (template_id),
      CONSTRAINT fk_report_subscriptions_template FOREIGN KEY (template_id) REFERENCES report_templates (id) ON DELETE CASCADE,
      CONSTRAINT fk_report_subscriptions_created_by FOREIGN KEY (created_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  tablesReady = true
}

function parseSpec(value) {
  if (value && typeof value === 'object') return value
  try { return JSON.parse(value || 'null') } catch { return null }
}

function templateView(row) {
  return {
    id: Number(row.id),
    name: row.name,
    spec: parseSpec(row.spec),
    chartType: row.chart_type || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subscription: row.subscription_id
      ? {
          id: Number(row.subscription_id),
          frequency: row.frequency,
          recipients: row.recipients || '',
          enabled: Boolean(row.enabled),
          lastSentAt: row.last_sent_at,
        }
      : null,
  }
}

async function listTemplates(userId) {
  await ensureTables()
  const rows = await query(
    `SELECT t.id, t.name, t.spec, t.chart_type, t.created_at, t.updated_at,
            s.id AS subscription_id, s.frequency, s.recipients, s.enabled, s.last_sent_at
     FROM report_templates t
     LEFT JOIN report_subscriptions s ON s.template_id = t.id
     WHERE t.created_by = :userId
     ORDER BY t.updated_at DESC
     LIMIT 100`,
    { userId },
  )
  return rows.map(templateView)
}

async function getTemplate(id, userId) {
  await ensureTables()
  const rows = await query(
    `SELECT t.id, t.name, t.spec, t.chart_type, t.created_at, t.updated_at,
            s.id AS subscription_id, s.frequency, s.recipients, s.enabled, s.last_sent_at
     FROM report_templates t
     LEFT JOIN report_subscriptions s ON s.template_id = t.id
     WHERE t.id = :id AND t.created_by = :userId
     LIMIT 1`,
    { id, userId },
  )
  return rows[0] ? templateView(rows[0]) : null
}

async function createTemplate({ name, spec, chartType, userId }) {
  await ensureTables()
  const result = await query(
    `INSERT INTO report_templates (name, spec, chart_type, created_by) VALUES (:name, :spec, :chartType, :userId)`,
    { name, spec: JSON.stringify(spec), chartType: chartType || null, userId },
  )
  return getTemplate(Number(result.insertId), userId)
}

async function deleteTemplate(id, userId) {
  await ensureTables()
  const result = await query('DELETE FROM report_templates WHERE id = :id AND created_by = :userId', { id, userId })
  return Number(result.affectedRows || 0) > 0
}

/** 订阅 upsert（每个模板最多一条订阅） */
async function upsertSubscription({ templateId, frequency, recipients, enabled, userId }) {
  await ensureTables()
  await query(
    `INSERT INTO report_subscriptions (template_id, frequency, recipients, enabled, created_by)
     VALUES (:templateId, :frequency, :recipients, :enabled, :userId)
     ON DUPLICATE KEY UPDATE frequency = VALUES(frequency), recipients = VALUES(recipients), enabled = VALUES(enabled)`,
    { templateId, frequency, recipients: recipients || null, enabled: enabled ? 1 : 0, userId },
  )
  return getTemplate(templateId, userId)
}

async function removeSubscription(templateId, userId) {
  await ensureTables()
  await query(
    `DELETE s FROM report_subscriptions s
     JOIN report_templates t ON t.id = s.template_id
     WHERE s.template_id = :templateId AND t.created_by = :userId`,
    { templateId, userId },
  )
}

/** 调度器用：全部启用中的订阅（含模板与创建人邮箱） */
async function listEnabledSubscriptions() {
  await ensureTables()
  return query(
    `SELECT s.id, s.template_id, s.frequency, s.recipients, s.last_sent_at,
            t.name AS template_name, t.spec, t.chart_type,
            u.email AS creator_email, u.real_name AS creator_name
     FROM report_subscriptions s
     JOIN report_templates t ON t.id = s.template_id
     JOIN users u ON u.id = t.created_by
     WHERE s.enabled = 1`,
  )
}

async function markSubscriptionSent(id) {
  await query('UPDATE report_subscriptions SET last_sent_at = NOW() WHERE id = :id', { id })
}

module.exports = {
  ensureTables,
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  upsertSubscription,
  removeSubscription,
  listEnabledSubscriptions,
  markSubscriptionSent,
}
