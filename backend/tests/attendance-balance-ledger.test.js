const assert = require('node:assert/strict')

function clearBackendModuleCache() {
  const backendRoot = `${process.cwd()}/src/`
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(backendRoot)) delete require.cache[id]
  }
}

function installMock(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

// 本人额度流水接口（GET /attendance/me/balance-ledger）：
// 余额变动后值由 JS 按时间正序累算（与 SUM(delta) 余额口径同源），整体倒序返回。
async function loadController({ profileRows, ledgerRows = [] }) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()

  const calls = []
  async function query(sql, params = {}) {
    calls.push({ sql, params })
    // 惰迁标记：视为已应用，跳过 annual_leave 历史数据转换
    if (/FROM attendance_schema_migrations/.test(sql)) return [{ migration_key: 'annual_leave_ledger_days_v1' }]
    if (/SELECT id FROM attendance_employee_profiles WHERE user_id = :userId/.test(sql)) return profileRows
    if (/FROM attendance_balance_ledger l/.test(sql) && /LEFT JOIN attendance_requests/.test(sql)) return ledgerRows
    return []
  }

  installMock(require.resolve('../src/config/db'), {
    query,
    transaction: async (callback) => callback({ execute: async () => [[], []] }),
  })

  return { controller: require('../src/modules/attendance/controller'), calls }
}

async function fetchLedger(loadOptions) {
  const { controller, calls } = await loadController(loadOptions)
  const req = { user: { id: 42, role: 'engineer' } }
  const res = createResponse()
  let thrown = null
  try {
    await controller.myBalanceLedger(req, res)
  } catch (error) {
    thrown = error
  }
  return { calls, response: res, thrown }
}

;(async () => {
  // 场景 1：多类型流水混合——正序累算 balanceAfter、整体倒序、申请概要与操作人映射
  {
    const ledgerRows = [
      // 行政初始化特休 10 天（无关联申请，操作人有档案姓名）
      {
        id: 1, request_id: null, balance_type: 'annual_leave', delta_hours: 10, action: 'adjust',
        note: '批量初始化（设定为 10 天，原 0 天）', created_at: '2026-01-01 09:00:00',
        request_type: null, leave_type: null, overtime_result: null, request_hours: null,
        start_at: null, end_at: null, request_status: null,
        created_by_name: '行政主管', created_by_username: 'admin_sup',
      },
      // 加班转调休入账 8 小时
      {
        id: 2, request_id: 101, balance_type: 'comp_time', delta_hours: 8, action: 'earn',
        note: '加班转调休入账', created_at: '2026-03-01 22:00:00',
        request_type: 'overtime', leave_type: null, overtime_result: 'comp_time', request_hours: 8,
        start_at: '2026-03-01 18:00:00', end_at: '2026-03-01 22:00:00', request_status: 'approved',
        created_by_name: null, created_by_username: null,
      },
      // 特休使用扣 2 天
      {
        id: 3, request_id: 102, balance_type: 'annual_leave', delta_hours: -2, action: 'use',
        note: '年假使用', created_at: '2026-04-10 10:00:00',
        request_type: 'leave', leave_type: 'annual', overtime_result: null, request_hours: 16,
        start_at: '2026-04-15 09:00:00', end_at: '2026-04-16 18:00:00', request_status: 'approved',
        created_by_name: null, created_by_username: null,
      },
      // 申请作废冲回 2 天
      {
        id: 4, request_id: 102, balance_type: 'annual_leave', delta_hours: 2, action: 'void',
        note: '申请作废冲回', created_at: '2026-04-20 15:00:00',
        request_type: 'leave', leave_type: 'annual', overtime_result: null, request_hours: 16,
        start_at: '2026-04-15 09:00:00', end_at: '2026-04-16 18:00:00', request_status: 'voided',
        created_by_name: null, created_by_username: null,
      },
    ]
    const { response, thrown } = await fetchLedger({ profileRows: [{ id: 5 }], ledgerRows })
    assert.equal(thrown, null)
    const items = response.body.items
    assert.equal(items.length, 4)
    // 整体倒序：最新（作废冲回）在最前
    assert.deepEqual(items.map((item) => item.id), [4, 3, 2, 1])
    // balanceAfter 按类型独立正序累算：特休 10 → 8 → 10；调休 8
    assert.equal(items[3].balanceAfter, 10)
    assert.equal(items[1].balanceAfter, 8)
    assert.equal(items[2].balanceAfter, 8)
    assert.equal(items[0].balanceAfter, 10)
    // 字段映射（items[1] = 特休使用扣 2 天）：变动量、动作、备注、时间
    assert.equal(items[1].delta, -2)
    assert.equal(items[1].balanceType, 'annual_leave')
    assert.equal(items[1].action, 'use')
    assert.equal(items[1].note, '年假使用')
    assert.equal(items[1].createdAt, '2026-04-10 10:00:00')
    // 关联申请概要
    assert.deepEqual(items[1].request, {
      id: 102,
      requestType: 'leave',
      leaveType: 'annual',
      overtimeResult: null,
      hours: 16,
      startAt: '2026-04-15 09:00:00',
      endAt: '2026-04-16 18:00:00',
      status: 'approved',
    })
    // 无关联申请的调整为 null，操作人优先取档案姓名
    assert.equal(items[3].request, null)
    assert.equal(items[3].createdByName, '行政主管')
    // 无操作人信息时为空串
    assert.equal(items[1].createdByName, '')
  }

  // 场景 2：无员工档案 → 空列表，且不查询流水
  {
    const { calls, response, thrown } = await fetchLedger({ profileRows: [] })
    assert.equal(thrown, null)
    assert.deepEqual(response.body, { items: [] })
    assert.equal(calls.some((call) => /FROM attendance_balance_ledger l/.test(call.sql)), false)
  }

  // 场景 3：档案存在但无流水 → 空列表
  {
    const { response, thrown } = await fetchLedger({ profileRows: [{ id: 5 }], ledgerRows: [] })
    assert.equal(thrown, null)
    assert.deepEqual(response.body, { items: [] })
  }

  // 场景 4：操作人只有用户名（无档案）时回退 username
  {
    const ledgerRows = [{
      id: 9, request_id: null, balance_type: 'comp_time', delta_hours: 4, action: 'adjust',
      note: '手动调整', created_at: '2026-05-01 09:00:00',
      request_type: null, leave_type: null, overtime_result: null, request_hours: null,
      start_at: null, end_at: null, request_status: null,
      created_by_name: null, created_by_username: 'hr_admin',
    }]
    const { response, thrown } = await fetchLedger({ profileRows: [{ id: 5 }], ledgerRows })
    assert.equal(thrown, null)
    assert.equal(response.body.items[0].createdByName, 'hr_admin')
    assert.equal(response.body.items[0].balanceAfter, 4)
  }

  console.log('attendance-balance-ledger.test.js: all assertions passed')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
