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

function requestColumnRows() {
  return [
    'workflow_version',
    'delegate_employee_id',
    'working_days',
    'supervisor_role',
    'source_type',
    'source_id',
    'source_detail',
    'source_snapshot',
    'overtime_day_type',
    'overtime_pay_multiplier',
  ].map((columnName) => ({ columnName }))
}

async function loadController({
  delegateEmployeeId = 9,
  requestColumns = requestColumnRows(),
  connectionExecute = async () => [[], []],
  queryHandler = null,
  hasPermission = async () => false,
  hasAnyPermission = async () => false,
} = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()

  const calls = []
  async function query(sql, params = {}) {
    calls.push({ sql, params })
    if (/information_schema\.COLUMNS/.test(sql) && /attendance_requests/.test(sql)) return requestColumns
    if (/information_schema\.STATISTICS/.test(sql)) return [{ indexName: 'idx_attendance_requests_source' }]
    if (/FROM attendance_schema_migrations/.test(sql)) return [{ migration_key: 'annual_leave_ledger_days_v1' }]
    if (/SELECT holiday_date, holiday_name/.test(sql) && /is_active = 1/.test(sql)) return []
    if (/SELECT id, start_at, overtime_result/.test(sql)) return []
    if (/SELECT p\.\*/.test(sql) && /p\.user_id = :userId/.test(sql)) {
      return [{ id: 5, user_id: 42, employee_name: '申请人', attendance_enabled: 1 }]
    }
    if (/SELECT p\.id, p\.user_id/.test(sql) && /p\.id = :employeeId/.test(sql)) {
      if (Number(params.employeeId) !== Number(delegateEmployeeId)) return []
      return [{ id: delegateEmployeeId, user_id: 77, employee_name: '代理人', attendance_enabled: 1 }]
    }
    if (/FROM attendance_supervisor_role_rules/.test(sql) && /LIMIT 1/.test(sql)) {
      return [{ supervisor_role: 'engineering_supervisor' }]
    }
    if (queryHandler) {
      const handled = await queryHandler(sql, params)
      if (handled !== undefined) return handled
    }
    if (/INSERT INTO attendance_requests/.test(sql)) return { insertId: 321 }
    return []
  }

  installMock(require.resolve('../src/config/db'), {
    query,
    transaction: async (callback) => callback({ execute: connectionExecute }),
  })
  installMock(require.resolve('../src/permissions/store'), {
    hasAnyPermission,
    hasPermission,
  })

  return { controller: require('../src/modules/attendance/controller'), calls }
}

async function createLeave(bodyOverrides = {}) {
  const { controller, calls } = await loadController()
  const req = {
    user: { id: 42, role: 'engineer' },
    body: {
      requestType: 'leave',
      leaveType: 'annual',
      delegateEmployeeId: 9,
      startAt: '2026-07-10T09:00',
      endAt: '2026-07-14T18:00',
      hours: 40,
      ...bodyOverrides,
    },
  }
  const res = createResponse()
  let thrown = null
  try {
    await controller.createRequest(req, res)
  } catch (error) {
    thrown = error
  }
  return { calls, response: res, thrown }
}

;(async () => {
  {
    const result = await createLeave()
    assert.equal(result.thrown, null)
    assert.equal(result.response.statusCode, 201)
    assert.equal(result.response.body.id, 321)
    assert.equal(result.response.body.status, 'draft')
    const insert = result.calls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.ok(insert)
    assert.match(insert.sql, /workflow_version/)
    assert.equal(insert.params.workflowVersion, 2)
    assert.equal(insert.params.delegateEmployeeId, 9)
    assert.equal(insert.params.workingDays, 3)
    assert.equal(insert.params.hours, 24)
  }

  {
    const result = await createLeave({ delegateEmployeeId: null })
    assert.equal(result.thrown?.status, 400)
    assert.match(result.thrown?.message || '', /代理人/)
  }

  {
    const result = await createLeave({ delegateEmployeeId: 5 })
    assert.equal(result.thrown?.status, 400)
    assert.match(result.thrown?.message || '', /本人/)
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 321,
            workflow_version: 2,
            employee_id: 5,
            delegate_employee_id: 9,
            request_type: 'leave',
            leave_type: 'annual',
            working_days: 3,
            supervisor_role: 'engineering_supervisor',
            status: 'draft',
            submitted_by: 42,
          }], []]
        }
        if (/FROM files/.test(sql)) return [[{ proof_count: 0 }], []]
        return [{ affectedRows: 1, insertId: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, params: { id: '321' }, body: {} }
    const res = createResponse()
    await controller.submitRequest(req, res)
    assert.equal(res.body.ok, true)
    assert.equal(res.body.status, 'pending_delegate')
    const stepInserts = executeCalls.filter((call) => /INSERT INTO attendance_request_approvals/.test(call.sql))
    assert.equal(stepInserts.length, 4)
    assert.equal(stepInserts[0].params.status, 'pending')
    assert.equal(stepInserts[1].params.status, 'waiting')
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 322,
            workflow_version: 2,
            employee_id: 5,
            delegate_employee_id: 9,
            request_type: 'leave',
            leave_type: 'sick',
            working_days: 1,
            supervisor_role: 'engineering_supervisor',
            status: 'draft',
            submitted_by: 42,
          }], []]
        }
        if (/FROM files/.test(sql)) return [[{ proof_count: 0 }], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, params: { id: '322' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.submitRequest(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /上传证明/)
  }

  {
    clearBackendModuleCache()
    const fileCalls = []
    installMock(require.resolve('../src/config/db'), {
      query: async (sql, params = {}) => {
        fileCalls.push({ sql, params })
        if (/information_schema\.columns/.test(sql)) return [{ exists: 1 }]
        if (/FROM attendance_requests r/.test(sql)) {
          return [{
            id: 321,
            status: 'draft',
            submitted_by: 42,
            is_current_approver: 0,
          }]
        }
        if (/INSERT INTO files/.test(sql)) return { insertId: 700 }
        return []
      },
    })
    installMock(require.resolve('../src/permissions/store'), {
      hasAnyPermission: async () => false,
      hasPermission: async () => false,
    })
    const fileController = require('../src/modules/files/controller')
    const req = {
      user: { id: 42, role: 'engineer' },
      query: {},
      body: { ownerType: 'attendance_request', ownerId: '321', purpose: 'leave_proof' },
      file: {
        originalname: 'proof.pdf',
        path: '/tmp/oms-attendance-proof-test.pdf',
        mimetype: 'application/pdf',
        size: 128,
      },
    }
    const res = createResponse()
    await fileController.upload(req, res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.id, 700)
    assert.equal(res.body.purpose, 'leave_proof')
    assert.ok(fileCalls.some((call) => /FROM attendance_requests r/.test(call.sql)))
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 321,
            workflow_version: 2,
            employee_id: 5,
            request_type: 'leave',
            leave_type: 'annual',
            hours: 24,
            working_days: 3,
            status: 'pending_delegate',
            submitted_by: 42,
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{
            id: 11,
            request_id: 321,
            step_type: 'delegate',
            step_order: 1,
            assignee_employee_id: 9,
            assignee_role: null,
            assignee_user_id: 77,
            status: 'pending',
          }], []]
        }
        if (/FROM attendance_request_approvals/.test(sql) && /status = 'waiting'/.test(sql)) {
          return [[{
            id: 12,
            request_id: 321,
            step_type: 'supervisor',
            step_order: 2,
            assignee_employee_id: null,
            assignee_role: 'engineering_supervisor',
            status: 'waiting',
          }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 77, role: 'engineer' }, params: { id: '321' }, body: {} }
    const res = createResponse()
    await controller.approveDelegate(req, res)
    assert.equal(res.body.ok, true)
    assert.equal(res.body.status, 'pending_supervisor')
    assert.ok(executeCalls.some((call) => /SET status = 'approved'/.test(call.sql) && call.params.id === 11))
    assert.ok(executeCalls.some((call) => /SET status = 'pending'/.test(call.sql) && call.params.id === 12))
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{ id: 323, workflow_version: 2, status: 'pending_delegate' }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{
            id: 13,
            request_id: 323,
            step_type: 'delegate',
            assignee_employee_id: 9,
            assignee_user_id: 77,
            status: 'pending',
          }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 78, role: 'engineer' }, params: { id: '323' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.approveDelegate(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 403)
  }

  {
    const requestColumns = requestColumnRows().filter((row) => row.columnName !== 'source_snapshot')
    const { controller, calls } = await loadController({ requestColumns })
    const req = { user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }
    const res = createResponse()
    await controller.listRequests(req, res)
    assert.ok(calls.some((call) => /ADD COLUMN source_snapshot JSON NULL/.test(call.sql)))
  }

  {
    const executeCalls = []
    const orderRow = {
      id: 88,
      order_no: 'SO-20260713-088',
      status: 'completed',
      customer_name: '测试客户',
      contact_name: '王小姐',
      contact_phone: '13800000000',
      device_name: 'PowerVault ME5 / SN-88',
      service_mode: 'onsite',
      service_type: 'repair',
      issue_description: '存储控制器告警',
      service_at: '2026-07-14 18:00:00',
      departure_at: '2026-07-14 17:00:00',
      actual_start_at: '2026-07-14 18:00:00',
      actual_end_at: '2026-07-14 21:00:00',
      return_at: '2026-07-14 22:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        if (/SELECT id\s+FROM attendance_requests/.test(sql)) return [[], []]
        if (/FROM attendance_supervisor_role_rules/.test(sql)) {
          return [[{ supervisor_role: 'engineering_supervisor' }], []]
        }
        if (/INSERT INTO attendance_requests/.test(sql)) return [{ insertId: 901 }, []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { segmentKey: 'work', overtimeResult: 'comp_time' },
    }
    const res = createResponse()
    await controller.createServiceOrderOvertimeRequest(req, res)

    assert.equal(res.statusCode, 201)
    const insert = executeCalls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.ok(insert)
    assert.match(insert.sql, /source_snapshot/)
    assert.deepEqual(JSON.parse(insert.params.sourceSnapshot), {
      id: 88,
      orderNo: 'SO-20260713-088',
      customerName: '测试客户',
      contactName: '王小姐',
      contactPhone: '13800000000',
      deviceName: 'PowerVault ME5 / SN-88',
      serviceMode: 'onsite',
      serviceType: 'repair',
      issueDescription: '存储控制器告警',
      serviceAt: '2026-07-14 18:00',
      departureAt: '2026-07-14 17:00',
      actualStartAt: '2026-07-14 18:00',
      actualEndAt: '2026-07-14 21:00',
      returnAt: '2026-07-14 22:00',
    })
  }

  {
    let fallbackQueries = 0
    const snapshot = {
      id: 88,
      orderNo: 'SO-SNAPSHOT',
      customerName: '申请时客户',
      contactName: '申请时联系人',
      contactPhone: '13800000000',
      deviceName: '申请时设备',
      serviceMode: 'onsite',
      serviceType: 'repair',
      issueDescription: '申请时问题',
      serviceAt: '2026-07-14 18:00',
      departureAt: '2026-07-14 17:00',
      actualStartAt: '2026-07-14 18:00',
      actualEndAt: '2026-07-14 21:00',
      returnAt: '2026-07-14 22:00',
    }
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql)) return [{
          id: 902, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 88,
          source_snapshot: JSON.stringify(snapshot), start_at: '2026-07-14 18:00:00', end_at: '2026-07-14 21:00:00', hours: 3,
        }]
        if (/FROM service_orders so/.test(sql)) {
          fallbackQueries += 1
          return []
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.deepEqual(res.body.items[0].serviceOrder, snapshot)
    assert.equal(fallbackQueries, 0)
  }

  {
    let fallbackQueries = 0
    const { controller } = await loadController({
      queryHandler: async (sql, params) => {
        if (/FROM attendance_requests r/.test(sql)) return [{
          id: 903, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 89,
          source_snapshot: null, start_at: '2026-07-15 18:00:00', end_at: '2026-07-15 20:00:00', hours: 2,
        }]
        if (/FROM service_orders so/.test(sql)) {
          fallbackQueries += 1
          assert.equal(params.orderId0, 89)
          return [{ id: 89, order_no: 'SO-CURRENT', customer_name: '当前客户' }]
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.equal(res.body.items[0].serviceOrder.orderNo, 'SO-CURRENT')
    assert.equal(res.body.items[0].serviceOrder.customerName, '当前客户')
    assert.equal(fallbackQueries, 1)
  }

  {
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql)) return [{
          id: 904, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 90,
          source_snapshot: '{invalid-json', start_at: '2026-07-16 18:00:00', end_at: '2026-07-16 20:00:00', hours: 2,
        }]
        if (/FROM service_orders so/.test(sql)) return []
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.deepEqual(res.body.items[0].serviceOrder, { id: 90, unavailable: true })
  }

  {
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql)) return [{
          id: 905, employee_id: 5, request_type: 'leave', leave_type: 'annual', source_type: null, source_id: null,
          source_snapshot: null, start_at: '2026-07-17 09:00:00', end_at: '2026-07-17 18:00:00', hours: 8,
        }]
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.equal(res.body.items[0].serviceOrder, null)
  }

  {
    const { controller } = await loadController()
    const req = {
      user: { id: 42, role: 'engineer' },
      query: { scope: 'anything' },
    }
    const res = createResponse()
    let thrown = null
    try {
      await controller.listRequests(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /查询范围/)
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 400,
            workflow_version: 2,
            employee_id: 5,
            request_type: 'leave',
            leave_type: 'personal',
            hours: 4,
            status: 'pending_supervisor',
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{
            id: 20,
            request_id: 400,
            step_type: 'supervisor',
            assignee_role: 'engineering_supervisor',
            status: 'pending',
          }], []]
        }
        if (/status = 'waiting'/.test(sql)) return [[{ id: 21, step_type: 'hr', status: 'waiting' }], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 1, role: 'admin' }, params: { id: '400' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.approveSupervisor(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 403)
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 401,
            workflow_version: 2,
            employee_id: 5,
            request_type: 'leave',
            leave_type: 'annual',
            hours: 4,
            status: 'pending_supervisor',
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{
            id: 22,
            request_id: 401,
            step_type: 'supervisor',
            assignee_role: 'engineering_supervisor',
            status: 'pending',
          }], []]
        }
        if (/status = 'waiting'/.test(sql)) return [[], []]
        if (/FROM attendance_employee_profiles/.test(sql) && /FOR UPDATE/.test(sql)) return [[{ id: 5 }], []]
        if (/COALESCE\(SUM\(delta_hours\)/.test(sql)) return [[{ balance_hours: 10 }], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 88, role: 'engineering_supervisor' }, params: { id: '401' }, body: {} }
    const res = createResponse()
    await controller.approveSupervisor(req, res)
    assert.equal(res.body.status, 'approved')
    assert.ok(executeCalls.some((call) => /FROM attendance_employee_profiles/.test(call.sql) && /FOR UPDATE/.test(call.sql)))
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      hasPermission: async () => true,
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 402,
            workflow_version: 2,
            employee_id: 5,
            request_type: 'leave',
            leave_type: 'annual',
            hours: 4,
            status: 'approved',
          }], []]
        }
        if (/FROM attendance_employee_profiles/.test(sql) && /FOR UPDATE/.test(sql)) return [[{ id: 5 }], []]
        if (/FROM attendance_balance_ledger/.test(sql) && /GROUP BY balance_type/.test(sql)) return [[], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 1, role: 'admin' }, params: { id: '402' }, body: { reason: '测试冲回' } }
    const res = createResponse()
    await controller.voidRequest(req, res)
    assert.equal(res.body.ok, true)
    assert.ok(executeCalls.some((call) => /FROM attendance_employee_profiles/.test(call.sql) && /FOR UPDATE/.test(call.sql)))
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
