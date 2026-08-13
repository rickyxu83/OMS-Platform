const env = require('../../../config/env')
const { query, transaction } = require('../../../config/db')
const { badRequest, forbidden } = require('../../../utils/http-error')
const { ensureUserLoginColumns } = require('../../users/schema')
const { STEP_ROLES } = require('../domain')
const { ROLE_LABELS } = require('../../../permissions/catalog')
const { PDF_FORMAT_VERSION } = require('./mr-pdf')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const allowedDomains = new Set((env.mrApprovalEmailDomains || []).map((value) => value.toLowerCase()))
let workflowTablesReady = false
let workflowTablesPromise = null

async function tableColumns(table) {
  const rows = await query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :table`,
    { table },
  )
  return new Set(rows.map((row) => row.columnName))
}

async function addMissingColumns(table, definitions) {
  const columns = await tableColumns(table)
  for (const [name, definition] of definitions) {
    if (!columns.has(name)) await query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
}

async function ensureWorkflowTables() {
  if (workflowTablesReady) return
  if (workflowTablesPromise) return workflowTablesPromise
  workflowTablesPromise = (async () => {
  await ensureUserLoginColumns()
  await addMissingColumns('mr_orders', [
    ['version_no', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER status'],
    ['return_target', 'VARCHAR(16) NULL AFTER reject_reason'],
    ['withdrawn_at', 'DATETIME NULL AFTER reject_reason'],
    ['withdraw_reason', 'VARCHAR(500) NULL AFTER withdrawn_at'],
    ['archive_status', "VARCHAR(16) NULL AFTER void_reason"],
    ['archive_attempts', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER archive_status'],
    ['archive_next_attempt_at', 'DATETIME NULL AFTER archive_attempts'],
    ['archive_error', 'VARCHAR(500) NULL AFTER archive_next_attempt_at'],
    ['purchase_status', 'VARCHAR(16) NULL AFTER archive_error'],
    ['purchase_assignee_user_id', 'BIGINT UNSIGNED NULL AFTER purchase_status'],
    ['purchase_assignment_error', 'VARCHAR(255) NULL AFTER purchase_assignee_user_id'],
    ['purchased_at', 'DATETIME NULL AFTER purchase_assignment_error'],
    ['purchased_by', 'BIGINT UNSIGNED NULL AFTER purchased_at'],
    ['purchase_note', 'VARCHAR(500) NULL AFTER purchased_by'],
  ])
  await addMissingColumns('mr_approvals', [
    ['assignee_user_id', 'BIGINT UNSIGNED NULL AFTER step_label'],
    ['assignment_error', 'VARCHAR(255) NULL AFTER assignee_user_id'],
    ['approver_name_snapshot', 'VARCHAR(64) NULL AFTER approver_id'],
    ['approver_role_snapshot', 'VARCHAR(32) NULL AFTER approver_name_snapshot'],
    ['approver_signature_snapshot', 'LONGTEXT NULL AFTER approver_role_snapshot'],
    ['version_no', 'INT UNSIGNED NULL AFTER cycle'],
  ])
  await query(
    `UPDATE mr_approvals approval
     JOIN users approver ON approver.id = approval.approver_id
     SET approval.approver_signature_snapshot = approver.engineer_signature
     WHERE approval.action = 'approve'
       AND approval.approver_signature_snapshot IS NULL
       AND approver.engineer_signature IS NOT NULL
       AND approver.engineer_signature <> ''`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS mr_versions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      cycle INT NOT NULL,
      version_no INT UNSIGNED NOT NULL,
      kind VARCHAR(16) NOT NULL,
      snapshot JSON NOT NULL,
      changes JSON NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mr_versions_cycle_kind (mr_id, cycle, kind),
      KEY idx_mr_versions_number (mr_id, version_no),
      CONSTRAINT fk_mr_versions_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS approval_tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      business_type VARCHAR(32) NOT NULL,
      business_id BIGINT UNSIGNED NOT NULL,
      approval_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      assignee_user_id BIGINT UNSIGNED NOT NULL,
      initiator_user_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      detail_path VARCHAR(255) NOT NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_approval_tasks_approval (business_type, approval_id),
      KEY idx_approval_tasks_assignee (assignee_user_id, status, created_at),
      KEY idx_approval_tasks_initiator (initiator_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const taskIndexes = await query(
    `SELECT index_name AS indexName FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'approval_tasks'`,
  )
  const taskIndexNames = new Set(taskIndexes.map((row) => row.indexName))
  if (taskIndexNames.has('uk_approval_tasks_approval')) {
    await query('ALTER TABLE approval_tasks DROP INDEX uk_approval_tasks_approval')
  }
  if (!taskIndexNames.has('idx_approval_tasks_approval')) {
    await query('CREATE INDEX idx_approval_tasks_approval ON approval_tasks (business_type, approval_id)')
  }
  await query(
    `CREATE TABLE IF NOT EXISTS mr_purchase_tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      assignee_user_id BIGINT UNSIGNED NOT NULL,
      initiator_user_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      detail_path VARCHAR(255) NOT NULL,
      completed_at DATETIME NULL,
      completed_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mr_purchase_tasks_assignee (assignee_user_id, status, created_at),
      KEY idx_mr_purchase_tasks_mr (mr_id, status),
      CONSTRAINT fk_mr_purchase_tasks_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS mr_notification_outbox (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      recipient_user_id BIGINT UNSIGNED NOT NULL,
      event VARCHAR(24) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_mr_notification_due (status, next_attempt_at),
      CONSTRAINT fk_mr_notification_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS mr_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      mr_id BIGINT UNSIGNED NOT NULL,
      version_no INT UNSIGNED NOT NULL,
      format_version INT UNSIGNED NOT NULL DEFAULT ${PDF_FORMAT_VERSION},
      document_type VARCHAR(16) NOT NULL,
      storage_path VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      size BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mr_documents_version_type (mr_id, version_no, document_type),
      CONSTRAINT fk_mr_documents_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const documentColumns = await tableColumns('mr_documents')
  if (!documentColumns.has('format_version')) {
    await query('ALTER TABLE mr_documents ADD COLUMN format_version INT UNSIGNED NULL AFTER version_no')
  }
  await query('UPDATE mr_documents SET format_version = 1 WHERE format_version IS NULL')
  // 始终执行 MODIFY，保证上次部署中断后重试仍能把列约束补全
  await query(`ALTER TABLE mr_documents MODIFY COLUMN format_version INT UNSIGNED NOT NULL DEFAULT ${PDF_FORMAT_VERSION}`)
  await query(`UPDATE mr_orders o INNER JOIN mr_documents d ON d.mr_id = o.id
                 AND d.version_no = (SELECT MAX(d2.version_no) FROM mr_documents d2
                                     WHERE d2.mr_id = d.mr_id AND d2.document_type = d.document_type)
               SET o.archive_status = 'pending', o.archive_next_attempt_at = NOW(), o.archive_error = 'PDF 格式升级，等待重新生成'
               WHERE d.format_version < ${PDF_FORMAT_VERSION} AND o.status IN ('approved', 'voided')
                 AND COALESCE(o.archive_status, 'ready') IN ('ready', 'failed')`)
  workflowTablesReady = true
  })()
  try {
    await workflowTablesPromise
  } catch (error) {
    workflowTablesPromise = null
    throw error
  }
}

function assertApprovalEmail(user, label) {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw badRequest(`${label}未配置有效公司邮箱`)
  const domain = email.split('@')[1]
  if (allowedDomains.size && !allowedDomains.has(domain)) throw badRequest(`${label}必须使用公司认可的邮箱`)
  return email
}

async function salesWithAssistant(connection, salesId) {
  const [rows] = await connection.execute(
    `SELECT s.id, s.real_name, s.email, s.status, s.assistant_user_id,
            a.id AS assistant_id, a.real_name AS assistant_name, a.email AS assistant_email,
            a.role AS assistant_role, a.status AS assistant_status
     FROM users s
     LEFT JOIN users a ON a.id = s.assistant_user_id
     WHERE s.id = :salesId AND s.role IN ('sales', 'sales_supervisor')
     LIMIT 1`,
    { salesId },
  )
  return rows[0] || null
}

function assertAssistantMapping(row) {
  if (!row || row.status !== 'active') throw badRequest('业务负责人不存在或已停用')
  if (!row.assistant_id || row.assistant_role !== 'assistant' || row.assistant_status !== 'active') {
    throw badRequest('请为当前业务负责人重新设置助理后再提交')
  }
  try {
    assertApprovalEmail({ email: row.assistant_email }, '对应助理')
  } catch (_error) {
    throw badRequest('请为当前业务负责人重新设置助理后再提交')
  }
  return { id: Number(row.assistant_id), name: row.assistant_name, email: row.assistant_email, role: 'assistant' }
}

async function resolveStepAssignee(connection, order, stepKey, { required = false } = {}) {
  if (stepKey === 'assistant') {
    const sales = await salesWithAssistant(connection, order.salesOwnerId)
    return assertAssistantMapping(sales)
  }
  if (stepKey === 'sales') {
    const [rows] = await connection.execute(
      "SELECT id, real_name AS name, email, role FROM users WHERE id = :id AND role IN ('sales', 'sales_supervisor') AND status = 'active' LIMIT 1",
      { id: order.salesOwnerId },
    )
    if (!rows[0]) throw badRequest('业务负责人不存在或已停用')
    assertApprovalEmail(rows[0], '业务负责人')
    return { ...rows[0], id: Number(rows[0].id) }
  }
  const role = STEP_ROLES[stepKey]
  const [rows] = await connection.execute(
    `SELECT id, real_name AS name, email, role FROM users
     WHERE role = :role AND status = 'active' ORDER BY id`,
    { role },
  )
  if (rows.length !== 1) {
    const label = ROLE_LABELS[role] || role || stepKey
    if (required) {
      throw badRequest(rows.length
        ? `${label}在职签核人有 ${rows.length} 位，请在用户管理中仅保留 1 位`
        : `${label}未配置在职签核人，请先在用户管理中设置`)
    }
    return null
  }
  assertApprovalEmail(rows[0], rows[0].name || role)
  return { ...rows[0], id: Number(rows[0].id) }
}

async function cancelTaskNotifications(connection, approvalId) {
  await connection.execute(
    `UPDATE mr_notification_outbox notification
     JOIN approval_tasks task
       ON task.business_type = 'mr'
      AND task.business_id = notification.mr_id
      AND task.assignee_user_id = notification.recipient_user_id
     SET notification.status = 'cancelled', notification.last_error = '对应待办已关闭'
     WHERE task.approval_id = :approvalId
       AND notification.event IN ('task', 'transfer')
       AND notification.status IN ('pending', 'failed')`,
    { approvalId },
  )
}

async function createTask(connection, order, approval, assignee, initiatorUserId, event = 'task') {
  await cancelTaskNotifications(connection, approval.id)
  await connection.execute(
    `UPDATE mr_approvals SET assignee_user_id = :assigneeId, assignment_error = NULL WHERE id = :approvalId`,
    { assigneeId: assignee.id, approvalId: approval.id },
  )
  await connection.execute(
    `UPDATE approval_tasks SET status = 'reassigned', completed_at = NOW()
     WHERE business_type = 'mr' AND approval_id = :approvalId AND status = 'pending'`,
    { approvalId: approval.id },
  )
  await connection.execute(
    `INSERT INTO approval_tasks
       (business_type, business_id, approval_id, title, assignee_user_id, initiator_user_id, detail_path)
     VALUES ('mr', :businessId, :approvalId, :title, :assigneeId, :initiatorId, :detailPath)`,
    {
      businessId: order.id,
      approvalId: approval.id,
      title: `${order.customerName || '未选客户'} · ${approval.step_label}`.slice(0, 255),
      assigneeId: assignee.id,
      initiatorId: initiatorUserId,
      detailPath: `/mr/${order.id}`,
    },
  )
  await connection.execute(
    `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
     VALUES (:mrId, :recipientId, :event)`,
    { mrId: order.id, recipientId: assignee.id, event },
  )
}

async function pauseApproval(connection, order, approval, message) {
  await cancelTaskNotifications(connection, approval.id)
  await connection.execute(
    'UPDATE mr_approvals SET assignee_user_id = NULL, assignment_error = :message WHERE id = :id',
    { id: approval.id, message: String(message).slice(0, 255) },
  )
  await connection.execute(
    `UPDATE approval_tasks SET status = 'paused', completed_at = NOW()
     WHERE business_type = 'mr' AND approval_id = :approvalId AND status = 'pending'`,
    { approvalId: approval.id },
  )
  if (!approval.assignment_error && order.salesOwnerId) {
    await connection.execute(
      `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
       VALUES (:mrId, :recipientId, 'assignment_error')`,
      { mrId: order.id, recipientId: order.salesOwnerId },
    )
  }
}

async function activateCurrentStep(connection, order, cycle, initiatorUserId) {
  const [rows] = await connection.execute(
    `SELECT * FROM mr_approvals
     WHERE mr_id = :mrId AND cycle = :cycle AND action IS NULL
     ORDER BY seq LIMIT 1 FOR UPDATE`,
    { mrId: order.id, cycle },
  )
  const approval = rows[0]
  if (!approval) return null
  let assignee
  try {
    assignee = await resolveStepAssignee(connection, order, approval.step_key, { required: true })
  } catch (error) {
    await pauseApproval(connection, order, approval, error.message || '签核人配置异常')
    return null
  }
  if (!assignee) {
    await pauseApproval(connection, order, approval, '当前角色未配置唯一在职签核人')
    return null
  }
  await createTask(connection, order, approval, assignee, initiatorUserId)
  return { approval, assignee }
}

async function completeTask(connection, approvalId, status) {
  await cancelTaskNotifications(connection, approvalId)
  await connection.execute(
    `UPDATE approval_tasks SET status = :status, completed_at = NOW()
     WHERE business_type = 'mr' AND approval_id = :approvalId AND status = 'pending'`,
    { approvalId, status },
  )
}

function comparableSnapshot(value) {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(comparableSnapshot)
  if (!value || typeof value !== 'object') return value
  const ignored = new Set([
    'id', 'status', 'versionNo', 'quotationFileId', 'fileName', 'quotationFiles',
    'createdBy', 'createdByName', 'updatedBy', 'updatedByName', 'createdAt', 'updatedAt',
    'submittedAt', 'approvedAt', 'rejectedAt', 'rejectReason', 'returnTarget',
    'withdrawnAt', 'withdrawReason', 'voidedAt', 'voidReason', 'archiveStatus',
    'archiveAttempts', 'archiveNextAttemptAt', 'archiveError', 'archivedDocumentTypes',
    'purchaseStatus', 'purchaseAssigneeUserId', 'purchaseAssigneeName', 'purchaseAssignmentError',
    'purchasedAt', 'purchasedBy', 'purchasedByName', 'purchaseNote',
    'assistantUserId', 'assistantName', 'currentStepKey', 'currentStepLabel',
    'currentAssigneeUserId', 'currentAssigneeName', 'assignmentError', 'approvalParticipant',
    'permissions', 'approvals', 'approvalHistory', 'currentVersion',
  ])
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !ignored.has(key))
    .map(([key, item]) => [key, comparableSnapshot(item)]))
}

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function diffValues(before, after, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) return [{ field: path || 'document', before: before ?? null, after: after ?? null }]
    return Array.from({ length: Math.max(before.length, after.length) }, (_, index) =>
      diffValues(before[index], after[index], `${path}.${index}`),
    ).flat()
  }
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return [{ field: path || 'document', before: before ?? null, after: after ?? null }]
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].flatMap((key) => diffValues(before[key], after[key], path ? `${path}.${key}` : key))
}

async function saveSubmissionBaseline(connection, order, cycle, snapshot, userId) {
  await connection.execute(
    `INSERT INTO mr_versions (mr_id, cycle, version_no, kind, snapshot, changes, created_by)
     VALUES (:mrId, :cycle, 0, 'submitted', :snapshot, JSON_ARRAY(), :userId)`,
    { mrId: order.id, cycle, snapshot: JSON.stringify(comparableSnapshot(snapshot)), userId },
  )
}

async function freezeVersion(connection, order, cycle, snapshot, userId) {
  const [baselineRows] = await connection.execute(
    `SELECT snapshot FROM mr_versions WHERE mr_id = :mrId AND cycle = :cycle AND kind = 'submitted' LIMIT 1`,
    { mrId: order.id, cycle },
  )
  if (!baselineRows[0]) throw badRequest('MR 提交基线缺失，无法冻结版本')
  const before = jsonValue(baselineRows[0].snapshot, {})
  const frozen = comparableSnapshot(snapshot)
  const versionNo = Number(order.versionNo || 0) + 1
  const changes = diffValues(before, frozen)
  await connection.execute(
    `INSERT INTO mr_versions (mr_id, cycle, version_no, kind, snapshot, changes, created_by)
     VALUES (:mrId, :cycle, :versionNo, 'frozen', :snapshot, :changes, :userId)`,
    { mrId: order.id, cycle, versionNo, snapshot: JSON.stringify(frozen), changes: JSON.stringify(changes), userId },
  )
  await connection.execute('UPDATE mr_orders SET version_no = :versionNo WHERE id = :mrId', { mrId: order.id, versionNo })
  await connection.execute(
    'UPDATE mr_approvals SET version_no = :versionNo WHERE mr_id = :mrId AND cycle = :cycle',
    { mrId: order.id, cycle, versionNo },
  )
  return { versionNo, changes }
}

async function assistantSetting(userId) {
  await ensureWorkflowTables()
  const rows = await query(
    `SELECT s.assistant_user_id, a.real_name AS assistant_name, a.email AS assistant_email
     FROM users s LEFT JOIN users a ON a.id = s.assistant_user_id
     WHERE s.id = :userId AND s.role IN ('sales', 'sales_supervisor') LIMIT 1`,
    { userId },
  )
  if (!rows[0]) throw forbidden('只有业务或业务主管可以设置对应助理')
  return {
    assistantUserId: rows[0].assistant_user_id || null,
    assistantName: rows[0].assistant_name || null,
    assistantEmail: rows[0].assistant_email || null,
  }
}

async function updateAssistantSetting(userId, assistantUserId) {
  await ensureWorkflowTables()
  const assistantId = Number(assistantUserId)
  if (!Number.isInteger(assistantId) || assistantId <= 0) throw badRequest('请选择对应助理')
  await transaction(async (connection) => {
    const [salesRows] = await connection.execute(
      "SELECT id, assistant_user_id FROM users WHERE id = :id AND role IN ('sales', 'sales_supervisor') AND status = 'active' LIMIT 1 FOR UPDATE",
      { id: userId },
    )
    if (!salesRows[0]) throw forbidden('只有业务或业务主管可以设置对应助理')
    const [assistantRows] = await connection.execute(
      "SELECT id, email FROM users WHERE id = :id AND role = 'assistant' AND status = 'active' LIMIT 1",
      { id: assistantId },
    )
    if (!assistantRows[0]) throw badRequest('请选择在职助理')
    assertApprovalEmail(assistantRows[0], '对应助理')
    if (Number(salesRows[0].assistant_user_id) === assistantId) return
    await connection.execute('UPDATE users SET assistant_user_id = :assistantId WHERE id = :salesId', { assistantId, salesId: userId })
    const [pending] = await connection.execute(
      `SELECT a.id, a.mr_id, a.step_label, a.assignee_user_id, a.assignment_error, o.customer_name, o.created_by
       FROM mr_approvals a JOIN mr_orders o ON o.id = a.mr_id
       WHERE o.sales_owner_id = :salesId AND o.status = 'in_review'
         AND a.step_key = 'assistant' AND a.action IS NULL
       FOR UPDATE`,
      { salesId: userId },
    )
    for (const approval of pending) {
      await createTask(
        connection,
        { id: approval.mr_id, customerName: approval.customer_name },
        approval,
        { id: assistantId },
        approval.created_by,
        'transfer',
      )
    }
    const [returnedOrders] = await connection.execute(
      `SELECT id FROM mr_orders
       WHERE sales_owner_id = :salesId AND status = 'rejected' AND return_target = 'assistant'`,
      { salesId: userId },
    )
    for (const order of returnedOrders) {
      if (salesRows[0].assistant_user_id) {
        await connection.execute(
          `UPDATE mr_notification_outbox SET status = 'cancelled', last_error = '对应助理已变更'
           WHERE mr_id = :mrId AND recipient_user_id = :oldAssistantId AND event = 'owner_transfer'
             AND status IN ('pending', 'failed')`,
          { mrId: order.id, oldAssistantId: salesRows[0].assistant_user_id },
        )
      }
      await connection.execute(
        `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
         VALUES (:mrId, :assistantId, 'owner_transfer')`,
        { mrId: order.id, assistantId },
      )
    }
  })
  return assistantSetting(userId)
}

async function reconcilePendingMrAssignments() {
  await ensureWorkflowTables()
  const rows = await query(
    `SELECT o.id, o.sales_owner_id, o.customer_name, o.created_by,
            a.id AS approval_id, a.cycle, a.step_key, a.assignee_user_id, a.assignment_error
     FROM mr_orders o
     JOIN mr_approvals a ON a.id = (
       SELECT id FROM mr_approvals WHERE mr_id = o.id AND action IS NULL ORDER BY cycle DESC, seq LIMIT 1
     )
     WHERE o.status = 'in_review'`,
  )
  let reassigned = 0
  let paused = 0
  for (const row of rows) {
    await transaction(async (connection) => {
      const [approvalRows] = await connection.execute(
        'SELECT * FROM mr_approvals WHERE id = :id AND action IS NULL LIMIT 1 FOR UPDATE',
        { id: row.approval_id },
      )
      const approval = approvalRows[0]
      if (!approval) return
      const order = {
        id: Number(row.id),
        salesOwnerId: Number(row.sales_owner_id),
        customerName: row.customer_name,
        createdBy: Number(row.created_by),
      }
      try {
        const expected = await resolveStepAssignee(connection, order, approval.step_key, { required: true })
        if (!expected) {
          await pauseApproval(connection, order, approval, '当前角色未配置唯一在职签核人')
          paused += 1
          return
        }
        if (Number(approval.assignee_user_id) !== expected.id || approval.assignment_error) {
          await createTask(connection, order, approval, expected, order.createdBy, approval.assignee_user_id ? 'transfer' : 'task')
          reassigned += 1
        }
      } catch (error) {
        await pauseApproval(connection, order, approval, error.message || '签核人配置异常')
        paused += 1
      }
    })
  }
  return { checked: rows.length, reassigned, paused }
}

async function resolvePurchaser(connection, { required = true } = {}) {
  const [rows] = await connection.execute(
    `SELECT id, real_name AS name, email, role FROM users
     WHERE role = 'purchaser' AND status = 'active' ORDER BY id`,
  )
  if (rows.length !== 1) {
    if (required) {
      throw badRequest(rows.length
        ? `采购角色在职人员有 ${rows.length} 位，请在用户管理中仅保留 1 位`
        : '采购角色未配置在职人员，请先在用户管理中设置')
    }
    return null
  }
  assertApprovalEmail(rows[0], rows[0].name || '采购')
  return { ...rows[0], id: Number(rows[0].id) }
}

async function createPurchaseTask(connection, order, purchaser, initiatorUserId, event = 'purchase_task') {
  await connection.execute(
    `UPDATE mr_purchase_tasks SET status = 'cancelled', completed_at = NOW()
     WHERE mr_id = :mrId AND status = 'pending'`,
    { mrId: order.id },
  )
  await connection.execute(
    `UPDATE mr_orders SET purchase_assignee_user_id = :assigneeId, purchase_assignment_error = NULL WHERE id = :mrId`,
    { assigneeId: purchaser.id, mrId: order.id },
  )
  await connection.execute(
    `INSERT INTO mr_purchase_tasks (mr_id, title, assignee_user_id, initiator_user_id, detail_path)
     VALUES (:mrId, :title, :assigneeId, :initiatorId, :detailPath)`,
    {
      mrId: order.id,
      title: `${order.customerName || '未选客户'} · 采购订单号填写`.slice(0, 255),
      assigneeId: purchaser.id,
      initiatorId: initiatorUserId,
      detailPath: `/mr/${order.id}`,
    },
  )
  await connection.execute(
    `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
     VALUES (:mrId, :recipientId, :event)`,
    { mrId: order.id, recipientId: purchaser.id, event },
  )
}

async function pausePurchaseTask(connection, order, message) {
  await connection.execute(
    'UPDATE mr_orders SET purchase_assignee_user_id = NULL, purchase_assignment_error = :message WHERE id = :mrId',
    { mrId: order.id, message: String(message).slice(0, 255) },
  )
  if (order.salesOwnerId) {
    await connection.execute(
      `INSERT INTO mr_notification_outbox (mr_id, recipient_user_id, event)
       VALUES (:mrId, :recipientId, 'purchase_assignment_error')`,
      { mrId: order.id, recipientId: order.salesOwnerId },
    )
  }
}

async function activatePurchaseTask(connection, order, initiatorUserId) {
  try {
    const purchaser = await resolvePurchaser(connection, { required: true })
    await createPurchaseTask(connection, order, purchaser, initiatorUserId)
    return purchaser
  } catch (error) {
    await pausePurchaseTask(connection, order, error.message || '采购人配置异常')
    return null
  }
}

async function reconcilePendingPurchaseAssignments() {
  await ensureWorkflowTables()
  const rows = await query(
    `SELECT o.id, o.sales_owner_id, o.customer_name, o.created_by, o.purchase_assignee_user_id, o.purchase_assignment_error
     FROM mr_orders o
     WHERE o.status = 'approved' AND o.purchase_status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM mr_purchase_tasks t WHERE t.mr_id = o.id AND t.status = 'pending'
       )`,
  )
  let reassigned = 0
  let paused = 0
  for (const row of rows) {
    await transaction(async (connection) => {
      const order = {
        id: Number(row.id),
        salesOwnerId: Number(row.sales_owner_id),
        customerName: row.customer_name,
        createdBy: Number(row.created_by),
      }
      try {
        const purchaser = await resolvePurchaser(connection, { required: true })
        await createPurchaseTask(connection, order, purchaser, order.createdBy, row.purchase_assignment_error ? 'purchase_transfer' : 'purchase_task')
        reassigned += 1
      } catch (error) {
        if (!row.purchase_assignment_error) {
          await pausePurchaseTask(connection, order, error.message || '采购人配置异常')
        }
        paused += 1
      }
    })
  }
  return { checked: rows.length, reassigned, paused }
}

async function listApprovalTasks(userId, view = 'pending') {
  await ensureWorkflowTables()
  const where = view === 'initiated'
    ? 'merged.initiator_user_id = :userId'
    : view === 'completed'
      ? "merged.assignee_user_id = :userId AND merged.status <> 'pending'"
      : "merged.assignee_user_id = :userId AND merged.status = 'pending'"
  const rows = await query(
    `SELECT * FROM (
       SELECT t.*, assignee.real_name AS assignee_name, initiator.real_name AS initiator_name,
              o.status AS business_status, approval.step_label AS current_step_label, o.customer_name, o.ctrl_no
       FROM approval_tasks t
       LEFT JOIN users assignee ON assignee.id = t.assignee_user_id
       LEFT JOIN users initiator ON initiator.id = t.initiator_user_id
       LEFT JOIN mr_orders o ON t.business_type = 'mr' AND o.id = t.business_id
       LEFT JOIN mr_approvals approval ON t.business_type = 'mr' AND approval.id = t.approval_id
       UNION ALL
       SELECT t.id, 'mr_purchase' AS business_type, t.mr_id AS business_id, NULL AS approval_id,
              t.title, t.assignee_user_id, t.initiator_user_id, t.status, t.detail_path,
              t.completed_at, t.created_at, t.updated_at,
              assignee.real_name AS assignee_name, initiator.real_name AS initiator_name,
              o.status AS business_status, '采购订单号填写' AS current_step_label, o.customer_name, o.ctrl_no
       FROM mr_purchase_tasks t
       LEFT JOIN users assignee ON assignee.id = t.assignee_user_id
       LEFT JOIN users initiator ON initiator.id = t.initiator_user_id
       LEFT JOIN mr_orders o ON o.id = t.mr_id
     ) merged
     WHERE ${where}
     ORDER BY CASE WHEN merged.status = 'pending' THEN 0 ELSE 1 END, merged.updated_at DESC
     LIMIT 500`,
    { userId },
  )
  const countRows = await query(
    `SELECT (
       (SELECT COUNT(*) FROM approval_tasks WHERE assignee_user_id = :userId AND status = 'pending')
       + (SELECT COUNT(*) FROM mr_purchase_tasks WHERE assignee_user_id = :userId AND status = 'pending')
     ) AS count`,
    { userId },
  )
  return { items: rows.map((row) => ({
    id: row.id,
    businessType: row.business_type,
    businessId: row.business_id,
    title: row.title,
    assigneeName: row.assignee_name,
    initiatorName: row.initiator_name,
    status: row.status,
    businessStatus: row.business_status,
    currentStepLabel: row.current_step_label,
    customerName: row.customer_name,
    ctrlNo: row.ctrl_no,
    detailPath: row.detail_path,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  })), pendingCount: Number(countRows[0]?.count || 0) }
}

async function mrDocument(mrId, type = null) {
  await ensureWorkflowTables()
  const rows = await query(
    `SELECT * FROM mr_documents WHERE mr_id = :mrId
       AND (:type IS NULL OR document_type = :type)
     ORDER BY CASE document_type WHEN 'voided' THEN 0 ELSE 1 END, version_no DESC LIMIT 1`,
    { mrId, type: type || null },
  )
  return rows[0] || null
}

module.exports = {
  ensureWorkflowTables,
  assertAssistantMapping,
  salesWithAssistant,
  resolveStepAssignee,
  resolvePurchaser,
  activateCurrentStep,
  activatePurchaseTask,
  completeTask,
  saveSubmissionBaseline,
  freezeVersion,
  assistantSetting,
  updateAssistantSetting,
  listApprovalTasks,
  reconcilePendingMrAssignments,
  reconcilePendingPurchaseAssignments,
  mrDocument,
  _test: { comparableSnapshot, diffValues, jsonValue },
}
