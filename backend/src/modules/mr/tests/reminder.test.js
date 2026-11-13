const assert = require('node:assert/strict')

// MR 催办回归（2026-11-12 生产事故）：controller.remind/processStaleMrReminders 调用
// ensureWorkflowTables 但漏导入，手动催办与调度器均 ReferenceError。
function clearBackendModuleCache() {
  const backendRoot = `${process.cwd()}/src/`
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(backendRoot)) delete require.cache[id]
  }
}

function installMock(modulePath, exports) {
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports }
}

function createResponse() {
  return {
    body: null,
    json(value) { this.body = value; return this },
  }
}

async function main() {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()

  const executeCalls = []
  const queryCalls = []
  let ensureWorkflowCalls = 0
  const connection = {
    execute: async (sql, params = {}) => {
      executeCalls.push({ sql, params })
      if (/FROM mr_orders o/.test(sql) && /FOR UPDATE/.test(sql)) {
        return [[{
          id: 70,
          status: 'in_review',
          created_by: 42,
          sales_owner_id: 42,
          last_reminded_at: null,
        }], []]
      }
      if (/FROM mr_approvals/.test(sql) && /step_key = 'assistant'/.test(sql)) return [[], []]
      if (/FROM mr_approvals/.test(sql) && /action IS NULL/.test(sql)) {
        return [[{ current_step_key: 'vp', current_step_label: '副总经理', current_assignee_user_id: 88, assignment_error: null }], []]
      }
      return [[], []]
    },
  }

  installMock(require.resolve('../../../config/db'), {
    query: async (sql, params = {}) => {
      queryCalls.push({ sql, params })
      // 自动催办扫描：空列表即可验证 ensureWorkflowTables 调用链与查询执行，无需真实数据
      return []
    },
    transaction: async (callback) => callback(connection),
  })
  installMock(require.resolve('../lib/tables'), { ensureTables: async () => {} })
  installMock(require.resolve('../lib/workflow'), {
    ensureWorkflowTables: async () => { ensureWorkflowCalls += 1 },
    mrDocument: async () => null,
  })

  const controller = require('../lib/controller')

  const res = createResponse()
  await controller.remind({ user: { id: 42, role: 'sales' }, params: { id: '70' }, body: {} }, res)
  assert.equal(res.body.ok, true)
  assert.ok(res.body.remindedAt)
  const notification = executeCalls.find((call) => /INSERT INTO mr_notification_outbox/.test(call.sql))
  assert.ok(notification, '手动催办应写入通知 outbox')
  assert.equal(Number(notification.params.mrId), 70)
  assert.equal(Number(notification.params.recipientId), 88)
  assert.ok(executeCalls.some((call) => /last_reminded_at = NOW\(\)/.test(call.sql)))

  const staleResult = await controller.processStaleMrReminders()
  assert.deepEqual(staleResult, { scanned: 0, reminded: 0 })
  assert.ok(queryCalls.some((call) => /FROM mr_orders o/.test(call.sql) && /in_review/.test(call.sql)))
  assert.equal(ensureWorkflowCalls, 2, '手动与自动催办都应调用 ensureWorkflowTables')

  console.log('mr reminder tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
