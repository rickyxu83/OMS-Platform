// 共享数据字段变更追踪：任何用户修改任何字段，记录变更日志，供其他用户感知
// 覆盖模块：客户档案(customers)、设备资产(devices)、维保方目录(maintenance_parties)
// 列表角标（3 天内有变更）+ 详情字段黄色高亮

const { query } = require('../config/db')

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS field_change_log (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      module VARCHAR(32) NOT NULL COMMENT 'customer/device/maintenance_party',
      record_id BIGINT UNSIGNED NOT NULL,
      changed_fields JSON NOT NULL COMMENT '变更字段名列表',
      changed_by BIGINT UNSIGNED DEFAULT NULL COMMENT '操作人 user id',
      changed_by_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名',
      source VARCHAR(32) DEFAULT 'manual' COMMENT 'manual/tianyancha',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_module_record (module, record_id, created_at),
      KEY idx_created (created_at)
    )`,
  )
}

/**
 * 记录字段变更
 * @param {string} module - 'customer' | 'device' | 'maintenance_party'
 * @param {number} recordId - 记录 ID
 * @param {string[]} fields - 变更的字段名列表
 * @param {object} user - 操作用户（可选，天眼查刷新时无）
 * @param {string} source - 'manual' | 'tianyancha'
 */
async function logChange(module, recordId, fields, user = null, source = 'manual') {
  if (!fields.length) return
  await ensureTables()
  await query(
    `INSERT INTO field_change_log (module, record_id, changed_fields, changed_by, changed_by_name, source)
     VALUES (:module, :recordId, :fields, :userId, :userName, :source)`,
    {
      module,
      recordId,
      fields: JSON.stringify(fields),
      userId: user?.id || null,
      userName: user?.realName || user?.real_name || user?.username || null,
      source,
    },
  )
}

/**
 * 对比新旧数据，返回变更的字段名列表
 * @param {object} oldData - 旧数据
 * @param {object} newData - 新数据
 * @param {string[]} trackedFields - 要追踪的字段名列表
 * @returns {string[]}
 */
function diffFields(oldData, newData, trackedFields) {
  const changed = []
  for (const field of trackedFields) {
    const oldVal = String(oldData?.[field] ?? '').trim()
    const newVal = String(newData?.[field] ?? '').trim()
    if (oldVal !== newVal) changed.push(field)
  }
  return changed
}

/**
 * 查询模块+记录 ID 的最近变更（3 天内）
 * @param {string} module
 * @param {number[]} recordIds
 * @param {number} days
 * @returns {Map<number, {fields: string[], changedBy: string, changedAt: string, source: string}>}
 */
async function recentChanges(module, recordIds, days = 3) {
  if (!recordIds.length) return new Map()
  await ensureTables()
  const placeholders = recordIds.map(() => '?').join(',')
  const rows = await query(
    `SELECT record_id, changed_fields, changed_by_name, source, created_at
     FROM field_change_log
     WHERE module = ? AND record_id IN (${placeholders}) AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY created_at DESC`,
    [module, ...recordIds, days],
  )
  const map = new Map()
  for (const row of rows) {
    const rid = Number(row.record_id)
    if (!map.has(rid)) {
      map.set(rid, {
        fields: typeof row.changed_fields === 'string' ? JSON.parse(row.changed_fields) : (row.changed_fields || []),
        changedBy: row.changed_by_name || (row.source === 'tianyancha' ? '天眼查' : '-'),
        changedAt: row.created_at,
        source: row.source,
      })
    }
  }
  return map
}

/**
 * 查询单条记录最近的变更字段
 * @param {string} module
 * @param {number} recordId
 * @param {number} days
 * @returns {{fields: string[], changedBy: string, changedAt: string, source: string} | null}
 */
async function latestChange(module, recordId, days = 3) {
  await ensureTables()
  const rows = await query(
    `SELECT changed_fields, changed_by_name, source, created_at
     FROM field_change_log
     WHERE module = :module AND record_id = :recordId AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
     ORDER BY created_at DESC LIMIT 1`,
    { module, recordId, days },
  )
  if (!rows[0]) return null
  return {
    fields: typeof rows[0].changed_fields === 'string' ? JSON.parse(rows[0].changed_fields) : (rows[0].changed_fields || []),
    changedBy: rows[0].changed_by_name || (rows[0].source === 'tianyancha' ? '天眼查' : '-'),
    changedAt: rows[0].created_at,
    source: rows[0].source,
  }
}

module.exports = { ensureTables, logChange, diffFields, recentChanges, latestChange }
