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

function isRequestListQuery(sql) {
  return /FROM attendance_requests r\s+JOIN attendance_employee_profiles p ON p\.id = r\.employee_id[\s\S]*LIMIT 300/.test(sql)
}

function isServiceOrderSnapshotFallbackQuery(sql) {
  return /FROM service_orders so[\s\S]*LEFT JOIN service_reports sr ON sr\.service_order_id = so\.id[\s\S]*WHERE so\.id IN \(:orderId0/.test(sql)
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

async function createLeave(bodyOverrides = {}, loadOptions = {}) {
  const { controller, calls } = await loadController(loadOptions)
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
    const result = await createLeave({}, {
      queryHandler: async (sql) => {
        if (/SELECT r\.id[\s\S]*FROM attendance_requests r[\s\S]*r\.request_type = 'leave'/.test(sql)) {
          return [{ id: 900 }]
        }
        return undefined
      },
    })
    assert.equal(result.thrown?.status, 400)
    assert.match(result.thrown?.message || '', /已有请假/)
    assert.equal(result.calls.some((call) => /INSERT INTO attendance_requests/.test(call.sql)), false)
  }

  {
    const { controller, calls } = await loadController({
      queryHandler: async (sql) => {
        if (/AS unavailable[\s\S]*FROM attendance_employee_profiles p/.test(sql)) {
          return [
            { id: 9, user_id: 77, employee_name: '代理人甲', unavailable: 1 },
            { id: 10, user_id: 78, employee_name: '代理人乙', unavailable: 0 },
          ]
        }
        return undefined
      },
    })
    const req = {
      user: { id: 42, role: 'engineer' },
      query: { startAt: '2026-07-14T09:00', endAt: '2026-07-14T18:00' },
    }
    const res = createResponse()
    await controller.listDelegates(req, res)
    assert.deepEqual(res.body.items, [
      { id: 9, userId: 77, employeeName: '代理人甲', unavailable: true, unavailableReason: '所选时段已有请假' },
      { id: 10, userId: 78, employeeName: '代理人乙', unavailable: false, unavailableReason: null },
    ])
    const delegateQuery = calls.find((call) => /AS unavailable[\s\S]*FROM attendance_employee_profiles p/.test(call.sql))
    assert.ok(delegateQuery)
    assert.equal(delegateQuery.params.startAt, '2026-07-14 09:00:00')
    assert.equal(delegateQuery.params.endAt, '2026-07-14 18:00:00')
    assert.match(delegateQuery.sql, /pending_supervisor/)
    assert.match(delegateQuery.sql, /approved/)
    assert.doesNotMatch(delegateQuery.sql, /status IN \([^)]*draft/)
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
            start_at: '2026-07-10 09:00:00',
            end_at: '2026-07-14 18:00:00',
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
    assert.equal(res.body.status, 'pending_supervisor')
    const stepInserts = executeCalls.filter((call) => /INSERT INTO attendance_request_approvals/.test(call.sql))
    assert.equal(stepInserts.length, 3)
    assert.equal(stepInserts[0].params.stepType, 'supervisor')
    assert.equal(stepInserts[0].params.status, 'pending')
    assert.equal(stepInserts[1].params.status, 'waiting')
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 324,
            workflow_version: 2,
            employee_id: 5,
            delegate_employee_id: 9,
            request_type: 'leave',
            leave_type: 'annual',
            working_days: 1,
            start_at: '2026-07-14 09:00:00',
            end_at: '2026-07-14 18:00:00',
            supervisor_role: 'engineering_supervisor',
            status: 'draft',
            submitted_by: 42,
          }], []]
        }
        if (/SELECT r\.id[\s\S]*FROM attendance_requests r/.test(sql)) return [[{ id: 901 }], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, params: { id: '324' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.submitRequest(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /已有请假/)
    assert.equal(executeCalls.some((call) => /INSERT INTO attendance_request_approvals/.test(call.sql)), false)
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
    const firstSnapshot = {
      id: 88,
      orderNo: 'SO-SNAPSHOT-FIRST',
      customerName: '首次申请客户',
      contactName: '首次申请联系人',
      contactPhone: '13800000000',
      deviceName: '首次申请设备',
      serviceMode: 'onsite',
      serviceType: 'repair',
      issueDescription: '首次申请问题',
      serviceAt: '2026-07-14 18:00',
      departureAt: '2026-07-14 17:00',
      actualStartAt: '2026-07-14 18:00',
      actualEndAt: '2026-07-14 21:00',
      returnAt: '2026-07-14 22:00',
    }
    const secondSnapshot = {
      id: 88,
      orderNo: 'SO-SNAPSHOT-SECOND',
      customerName: '二次申请客户',
      contactName: '二次申请联系人',
      contactPhone: '13900000000',
      deviceName: '二次申请设备',
      serviceMode: 'remote',
      serviceType: 'support',
      issueDescription: '二次申请问题',
      serviceAt: '2026-07-15 19:00',
      departureAt: '2026-07-15 18:00',
      actualStartAt: '2026-07-15 19:00',
      actualEndAt: '2026-07-15 22:00',
      returnAt: '2026-07-15 23:00',
    }
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (isRequestListQuery(sql)) return [
          {
            id: 902, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 88,
            source_snapshot: JSON.stringify(firstSnapshot), start_at: '2026-07-14 18:00:00', end_at: '2026-07-14 21:00:00', hours: 3,
          },
          {
            id: 906, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 88,
            source_snapshot: secondSnapshot, start_at: '2026-07-15 19:00:00', end_at: '2026-07-15 22:00:00', hours: 3,
          },
        ]
        if (isServiceOrderSnapshotFallbackQuery(sql)) {
          fallbackQueries += 1
          return []
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.deepEqual(res.body.items.map((item) => ({ id: item.id, serviceOrder: item.serviceOrder })), [
      { id: 902, serviceOrder: firstSnapshot },
      { id: 906, serviceOrder: secondSnapshot },
    ])
    assert.equal(res.body.items.every((item) => !Object.hasOwn(item, 'source_snapshot')), true)
    assert.equal(fallbackQueries, 0)
  }

  {
    let fallbackQueries = 0
    let fallbackQuery = null
    const currentOrder89 = {
      id: 89,
      orderNo: 'SO-CURRENT-89',
      customerName: '当前客户 89',
      contactName: '当前联系人 89',
      contactPhone: '13900000089',
      deviceName: '当前设备 89',
      serviceMode: 'remote',
      serviceType: 'support',
      issueDescription: '当前问题 89',
      serviceAt: '2026-07-15 18:00',
      departureAt: '',
      actualStartAt: '2026-07-15 18:00',
      actualEndAt: '2026-07-15 20:00',
      returnAt: '',
    }
    const currentOrder91 = {
      id: 91,
      orderNo: 'SO-CURRENT-91',
      customerName: '当前客户 91',
      contactName: '当前联系人 91',
      contactPhone: '13900000091',
      deviceName: '当前设备 91',
      serviceMode: 'onsite',
      serviceType: 'repair',
      issueDescription: '当前问题 91',
      serviceAt: '2026-07-16 19:00',
      departureAt: '2026-07-16 18:00',
      actualStartAt: '2026-07-16 19:00',
      actualEndAt: '2026-07-16 22:00',
      returnAt: '2026-07-16 23:00',
    }
    const { controller } = await loadController({
      queryHandler: async (sql, params) => {
        if (isRequestListQuery(sql)) return [
          {
            id: 903, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 89,
            source_snapshot: null, start_at: '2026-07-15 18:00:00', end_at: '2026-07-15 20:00:00', hours: 2,
          },
          {
            id: 907, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 91,
            source_snapshot: null, start_at: '2026-07-16 19:00:00', end_at: '2026-07-16 22:00:00', hours: 3,
          },
          {
            id: 908, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 89,
            source_snapshot: null, start_at: '2026-07-17 18:00:00', end_at: '2026-07-17 20:00:00', hours: 2,
          },
        ]
        if (isServiceOrderSnapshotFallbackQuery(sql)) {
          fallbackQueries += 1
          fallbackQuery = { sql, params }
          return [
            {
              id: 89, order_no: 'SO-CURRENT-89', customer_name: '当前客户 89',
              contact_name: '当前联系人 89', contact_phone: '13900000089',
              device_name: '当前设备 89', service_mode: 'remote',
              service_type: 'support', issue_description: '当前问题 89',
              service_at: '2026-07-15 18:00:00', departure_at: null,
              actual_start_at: '2026-07-15 18:00:00', actual_end_at: '2026-07-15 20:00:00', return_at: null,
            },
            {
              id: 91, order_no: 'SO-CURRENT-91', customer_name: '当前客户 91',
              contact_name: '当前联系人 91', contact_phone: '13900000091',
              device_name: '当前设备 91', service_mode: 'onsite',
              service_type: 'repair', issue_description: '当前问题 91',
              service_at: '2026-07-16 19:00:00', departure_at: '2026-07-16 18:00:00',
              actual_start_at: '2026-07-16 19:00:00', actual_end_at: '2026-07-16 22:00:00', return_at: '2026-07-16 23:00:00',
            },
          ]
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.equal(fallbackQueries, 1)
    assert.ok(fallbackQuery)
    assert.equal(fallbackQuery.params.orderId0, 89)
    assert.equal(fallbackQuery.params.orderId1, 91)
    assert.equal(Object.hasOwn(fallbackQuery.params, 'orderId2'), false)
    assert.doesNotMatch(fallbackQuery.sql, /:orderId2/)
    assert.deepEqual(res.body.items.map((item) => ({ id: item.id, serviceOrder: item.serviceOrder })), [
      { id: 903, serviceOrder: currentOrder89 },
      { id: 907, serviceOrder: currentOrder91 },
      { id: 908, serviceOrder: currentOrder89 },
    ])
  }

  {
    let fallbackQueries = 0
    let fallbackQuery = null
    const { controller } = await loadController({
      queryHandler: async (sql, params) => {
        if (isRequestListQuery(sql)) return [
          {
            id: 904, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 90,
            source_snapshot: '{invalid-json', start_at: '2026-07-16 18:00:00', end_at: '2026-07-16 20:00:00', hours: 2,
          },
          {
            id: 909, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 92,
            source_snapshot: [], start_at: '2026-07-17 18:00:00', end_at: '2026-07-17 20:00:00', hours: 2,
          },
          {
            id: 910, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 93,
            source_snapshot: { orderNo: 'SO-MISSING-ID' }, start_at: '2026-07-18 18:00:00', end_at: '2026-07-18 20:00:00', hours: 2,
          },
          {
            id: 911, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 94,
            source_snapshot: { id: 999, orderNo: 'SO-WRONG-SOURCE' }, start_at: '2026-07-19 18:00:00', end_at: '2026-07-19 20:00:00', hours: 2,
          },
          {
            id: 912, employee_id: 5, request_type: 'overtime', source_type: 'service_order', source_id: 95,
            source_snapshot: { id: 95, customerName: { name: '嵌套客户' } }, start_at: '2026-07-20 18:00:00', end_at: '2026-07-20 20:00:00', hours: 2,
          },
        ]
        if (isServiceOrderSnapshotFallbackQuery(sql)) {
          fallbackQueries += 1
          fallbackQuery = { sql, params }
          return []
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }, res)
    assert.equal(fallbackQueries, 1)
    assert.ok(fallbackQuery)
    assert.deepEqual(fallbackQuery.params, {
      orderId0: 90,
      orderId1: 92,
      orderId2: 93,
      orderId3: 94,
      orderId4: 95,
    })
    assert.match(fallbackQuery.sql, /:orderId4/)
    assert.doesNotMatch(fallbackQuery.sql, /:orderId5/)
    assert.deepEqual(res.body.items.map((item) => item.serviceOrder), [
      { id: 90, unavailable: true },
      { id: 92, unavailable: true },
      { id: 93, unavailable: true },
      { id: 94, unavailable: true },
      { id: 95, unavailable: true },
    ])
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
