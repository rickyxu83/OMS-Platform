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

async function createLeave(bodyOverrides = {}, loadOptions = {}, userRole = 'engineer') {
  const { controller, calls } = await loadController(loadOptions)
  const req = {
    user: { id: 42, role: userRole },
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
    assert.equal(insert.params.workflowVersion, 3)
    assert.equal(insert.params.delegateEmployeeId, 9)
    assert.equal(insert.params.workingDays, 3)
    assert.equal(insert.params.hours, 24)
    assert.ok(result.calls.some((call) => /INSERT IGNORE INTO attendance_approval_role_rule_steps/.test(call.sql)))
    assert.ok(result.calls.some((call) => /DELETE FROM attendance_approval_role_rule_steps/.test(call.sql)))
    assert.ok(result.calls.some((call) => /DELETE FROM attendance_supervisor_role_rules/.test(call.sql)))
    assert.equal(result.calls.some((call) => /DELETE FROM attendance_requests/.test(call.sql)), false)
  }

  for (const role of ['admin', 'dispatcher', 'operations_director']) {
    const result = await createLeave({}, {}, role)
    assert.equal(result.thrown?.status, 403)
    assert.match(result.thrown?.message || '', /无需提交考勤申请/)
    assert.equal(result.calls.some((call) => /INSERT INTO attendance_requests/.test(call.sql)), false)
  }

  {
    const result = await createLeave({
      leaveType: 'marriage',
      startAt: '2026-07-10T09:00',
      endAt: '2026-07-16T18:00',
      hours: 56,
    })
    assert.equal(result.thrown, null)
    const insert = result.calls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.equal(insert.params.workingDays, 7)
    assert.equal(insert.params.hours, 56)
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
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/SELECT applicant_role, step_order, approver_role/.test(sql)) {
          return [
            { applicant_role: 'admin', step_order: 1, approver_role: 'administrative_supervisor' },
            { applicant_role: 'assistant', step_order: 1, approver_role: 'operations_director' },
            { applicant_role: 'dispatcher', step_order: 1, approver_role: 'operations_director' },
            { applicant_role: 'operations_director', step_order: 1, approver_role: 'admin' },
            { applicant_role: 'engineer', step_order: 1, approver_role: 'engineering_supervisor' },
          ]
        }
        return undefined
      },
    })
    const req = { user: { id: 1, role: 'admin' }, body: {} }
    const res = createResponse()
    await controller.listApprovalRoleRules(req, res)
    assert.deepEqual(res.body.items.map((item) => item.applicantRole), [
      'assistant',
      'engineering_supervisor',
      'administrative_supervisor',
      'sales_supervisor',
      'sales',
      'engineer',
    ])
    assert.ok(res.body.roles.some((item) => item.role === 'admin'))
    assert.ok(res.body.roles.some((item) => item.role === 'operations_director'))
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
            employee_name: '申请人',
            applicant_email: 'applicant@example.test',
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
        if (/FROM users/.test(sql) && /role = :role/.test(sql)) {
          return [[
            { id: 88, name: '工程主管甲', email: 'supervisor-a@example.test' },
            { id: 89, name: '工程主管乙', email: 'supervisor-b@example.test' },
          ], []]
        }
        if (/FROM attendance_employee_profiles p/.test(sql) && /p\.id = :employeeId/.test(sql)) {
          return [[{ id: 9, employee_name: '代理人', user_id: 77, email: 'delegate@example.test' }], []]
        }
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
    const notificationInserts = executeCalls.filter((call) => /INSERT IGNORE INTO attendance_email_notifications/.test(call.sql))
    assert.equal(notificationInserts.length, 2)
    assert.deepEqual(JSON.parse(notificationInserts[0].params.recipientEmails), [
      'supervisor-a@example.test',
      'supervisor-b@example.test',
    ])
    assert.equal(notificationInserts[0].params.eventType, 'approval_pending')
    assert.deepEqual(JSON.parse(notificationInserts[1].params.recipientEmails), ['delegate@example.test'])
    assert.equal(notificationInserts[1].params.eventType, 'delegate_info')
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 325,
            workflow_version: 2,
            employee_id: 5,
            delegate_employee_id: 9,
            request_type: 'leave',
            leave_type: 'annual',
            working_days: 1,
            supervisor_role: 'engineering_supervisor',
            status: 'draft',
            submitted_by: 42,
          }], []]
        }
        if (/FROM files/.test(sql)) return [[{ proof_count: 0 }], []]
        if (/INSERT IGNORE INTO attendance_email_notifications/.test(sql)) throw new Error('queue unavailable')
        return [{ affectedRows: 1, insertId: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, params: { id: '325' }, body: {} }
    const res = createResponse()
    const originalConsoleError = console.error
    console.error = () => {}
    try {
      await controller.submitRequest(req, res)
    } finally {
      console.error = originalConsoleError
    }
    assert.equal(res.body.ok, true)
    assert.equal(res.body.status, 'pending_supervisor')
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
    const executeCalls = []
    const { controller } = await loadController({
      hasPermission: async () => true,
      queryHandler: async (sql) => {
        if (/SELECT applicant_role, step_order, approver_role/.test(sql)) {
          return [
            { applicant_role: 'assistant', step_order: 1, approver_role: 'administrative_supervisor' },
            { applicant_role: 'assistant', step_order: 2, approver_role: 'operations_director' },
          ]
        }
        return undefined
      },
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = {
      user: { id: 1, role: 'admin' },
      body: {
        items: [{
          applicantRole: 'assistant',
          steps: [
            { approverRole: 'administrative_supervisor' },
            { approverRole: 'operations_director' },
          ],
        }],
      },
    }
    const res = createResponse()
    await controller.updateApprovalRoleRules(req, res)
    assert.deepEqual(
      res.body.items.find((item) => item.applicantRole === 'assistant').steps.map((step) => step.approverRole),
      ['administrative_supervisor', 'operations_director'],
    )
    const inserts = executeCalls.filter((call) => /INSERT INTO attendance_approval_role_rule_steps/.test(call.sql))
    assert.deepEqual(inserts.map((call) => call.params.stepOrder), [1, 2])
    assert.ok(executeCalls.some((call) => /DELETE FROM attendance_approval_role_rule_steps/.test(call.sql)))
    assert.ok(executeCalls.some((call) => /INSERT INTO attendance_supervisor_role_rules/.test(call.sql) && call.params.supervisorRole === 'administrative_supervisor'))
  }

  {
    const { controller } = await loadController({ hasPermission: async () => true })
    const req = {
      user: { id: 1, role: 'admin' },
      body: {
        items: [{
          applicantRole: 'admin',
          steps: [{ approverRole: 'administrative_supervisor' }],
        }],
      },
    }
    const res = createResponse()
    let thrown = null
    try {
      await controller.updateApprovalRoleRules(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /申请人角色规则不正确/)
  }

  {
    const { controller } = await loadController({ hasPermission: async () => true })
    const req = {
      user: { id: 1, role: 'admin' },
      body: {
        items: [{
          applicantRole: 'assistant',
          steps: [
            { approverRole: 'administrative_supervisor' },
            { approverRole: 'administrative_supervisor' },
          ],
        }],
      },
    }
    const res = createResponse()
    let thrown = null
    try {
      await controller.updateApprovalRoleRules(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /不能重复/)
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 330,
            workflow_version: 3,
            employee_id: 5,
            delegate_employee_id: 9,
            request_type: 'leave',
            leave_type: 'annual',
            working_days: 5,
            start_at: '2026-07-14 09:00:00',
            end_at: '2026-07-18 18:00:00',
            applicant_role: 'assistant',
            status: 'draft',
            submitted_by: 42,
          }], []]
        }
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) {
          return [[{ approver_role: 'administrative_supervisor' }], []]
        }
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) {
          return [[
            { role: 'administrative_supervisor', user_count: 2 },
            { role: 'operations_director', user_count: 1 },
          ], []]
        }
        return [{ affectedRows: 1, insertId: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'assistant' }, params: { id: '330' }, body: {} }
    const res = createResponse()
    await controller.submitRequest(req, res)
    assert.equal(res.body.status, 'pending_approval')
    const stepInserts = executeCalls.filter((call) => /INSERT INTO attendance_request_approvals/.test(call.sql))
    assert.equal(stepInserts.length, 2)
    assert.deepEqual(stepInserts.map((call) => call.params.assigneeRole), ['administrative_supervisor', 'operations_director'])
    assert.deepEqual(stepInserts.map((call) => call.params.status), ['pending', 'waiting'])
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 331,
            workflow_version: 3,
            employee_id: 5,
            delegate_employee_id: 9,
            request_type: 'leave',
            leave_type: 'annual',
            working_days: 5,
            applicant_role: 'assistant',
            status: 'draft',
            submitted_by: 42,
          }], []]
        }
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) {
          return [[{ approver_role: 'administrative_supervisor' }], []]
        }
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) {
          return [[{ role: 'administrative_supervisor', user_count: 1 }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'assistant' }, params: { id: '331' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.submitRequest(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /运营负责人/)
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
            employee_name: '申请人',
            applicant_email: 'applicant@example.test',
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
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) {
          return [[{ approver_role: 'engineering_supervisor' }], []]
        }
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) {
          return [[{ role: 'engineering_supervisor', user_count: 1 }], []]
        }
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
    assert.equal(res.body.status, 'pending_approval')
    const insert = executeCalls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.ok(insert)
    assert.match(insert.sql, /\(3, :employeeId/)
    assert.match(insert.sql, /source_snapshot/)
    const approvalInsert = executeCalls.find((call) => /INSERT INTO attendance_request_approvals/.test(call.sql))
    assert.equal(approvalInsert?.params.stepType, 'role')
    assert.equal(approvalInsert?.params.assigneeRole, 'engineering_supervisor')
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

  // 路上时间：工程师自报去程出发/回程返回，合并成一条 travel 申请，原始时间留痕进快照
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
      departure_at: '2026-07-14 16:00:00',
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
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) {
          return [[{ approver_role: 'engineering_supervisor' }], []]
        }
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) {
          return [[{ role: 'engineering_supervisor', user_count: 1 }], []]
        }
        if (/FROM attendance_supervisor_role_rules/.test(sql)) {
          return [[{ supervisor_role: 'engineering_supervisor' }], []]
        }
        if (/INSERT INTO attendance_requests/.test(sql)) return [{ insertId: 902 }, []]
        return [{ affectedRows: 1 }, []]
      },
    })
    // 自报去程 15:00 出发（早于工单 16:00），回程 23:00 返回（晚于工单 22:00）
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { segmentKey: 'travel', overtimeResult: 'comp_time', departureAt: '2026-07-14 15:00', returnAt: '2026-07-14 23:00' },
    }
    const res = createResponse()
    await controller.createServiceOrderOvertimeRequest(req, res)

    assert.equal(res.statusCode, 201)
    const insert = executeCalls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.ok(insert)
    assert.equal(insert.params.overtimeKind, 'travel')
    assert.equal(insert.params.sourceDetail, 'travel')
    assert.equal(insert.params.overtimeResult, 'comp_time')
    // 去程 15:00->18:00（掐 18:00 后为 15-18=3h... 平日 18:00 前不计），回程 21:00->23:00=2h
    // 去程整段在 18:00 前，overtimeWindow 判定无有效加班；回程 21:00->23:00 计 2h
    assert.equal(insert.params.hours, 2)
    const snapshot = JSON.parse(insert.params.sourceSnapshot)
    assert.equal(snapshot.reportedDepartureAt, '2026-07-14 15:00')
    assert.equal(snapshot.reportedReturnAt, '2026-07-14 23:00')
    // 工单原始时间不被覆盖
    assert.equal(snapshot.departureAt, '2026-07-14 16:00')
    assert.equal(snapshot.returnAt, '2026-07-14 22:00')
  }

  // 路上时间零差异：提交与工单相同的默认时间，不应写入 reported* 留痕（避免污染无差异快照）
  {
    const executeCalls = []
    const orderRow = {
      id: 88, order_no: 'SO-1', status: 'completed', customer_name: 'C',
      service_at: '2026-07-14 18:00:00', departure_at: '2026-07-14 16:00:00',
      actual_start_at: '2026-07-14 18:00:00', actual_end_at: '2026-07-14 21:00:00', return_at: '2026-07-14 23:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        if (/SELECT id\s+FROM attendance_requests/.test(sql)) return [[], []]
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) {
          return [[{ approver_role: 'engineering_supervisor' }], []]
        }
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) {
          return [[{ role: 'engineering_supervisor', user_count: 1 }], []]
        }
        if (/FROM attendance_supervisor_role_rules/.test(sql)) {
          return [[{ supervisor_role: 'engineering_supervisor' }], []]
        }
        if (/INSERT INTO attendance_requests/.test(sql)) return [{ insertId: 903 }, []]
        return [{ affectedRows: 1 }, []]
      },
    })
    // 提交与工单完全一致的默认时间
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { segmentKey: 'travel', overtimeResult: 'comp_time', departureAt: '2026-07-14 16:00', returnAt: '2026-07-14 23:00' },
    }
    const res = createResponse()
    await controller.createServiceOrderOvertimeRequest(req, res)
    assert.equal(res.statusCode, 201)
    const insert = executeCalls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    const snapshot = JSON.parse(insert.params.sourceSnapshot)
    assert.equal(Object.hasOwn(snapshot, 'reportedDepartureAt'), false)
    assert.equal(Object.hasOwn(snapshot, 'reportedReturnAt'), false)
  }

  // 路上时间防倒挂：去程出发晚于工单到达 -> 400
  {
    const orderRow = {
      id: 88, order_no: 'SO-1', status: 'completed', customer_name: 'C',
      service_at: '2026-07-14 18:00:00', departure_at: '2026-07-14 16:00:00',
      actual_start_at: '2026-07-14 18:00:00', actual_end_at: '2026-07-14 21:00:00', return_at: '2026-07-14 22:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { segmentKey: 'travel', overtimeResult: 'comp_time', departureAt: '2026-07-14 19:00' },
    }
    const res = createResponse()
    let thrown = null
    try {
      await controller.createServiceOrderOvertimeRequest(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /去程出发时间不能晚于工单到达时间/)
  }

  // 路上时间防倒挂：回程返回早于工单完工 -> 400
  {
    const orderRow = {
      id: 88, order_no: 'SO-1', status: 'completed', customer_name: 'C',
      service_at: '2026-07-14 18:00:00', departure_at: '2026-07-14 16:00:00',
      actual_start_at: '2026-07-14 18:00:00', actual_end_at: '2026-07-14 21:00:00', return_at: '2026-07-14 22:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { segmentKey: 'travel', overtimeResult: 'comp_time', returnAt: '2026-07-14 20:00' },
    }
    const res = createResponse()
    let thrown = null
    try {
      await controller.createServiceOrderOvertimeRequest(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /回程返回时间不能早于工单完工时间/)
  }

  // travel_out / travel_back 已退役：不再是合法 segmentKey -> 400
  {
    const { controller } = await loadController()
    for (const segmentKey of ['travel_out', 'travel_back']) {
      const req = {
        user: { id: 42, role: 'engineer' },
        params: { id: '88' },
        body: { segmentKey, overtimeResult: 'comp_time' },
      }
      const res = createResponse()
      let thrown = null
      try {
        await controller.createServiceOrderOvertimeRequest(req, res)
      } catch (error) {
        thrown = error
      }
      assert.equal(thrown?.status, 400)
      assert.match(thrown?.message || '', /工单时段不正确/)
    }
  }

  // 不带 segmentKey：一把提交，路上 + 工作两段各生成一条申请
  {
    const executeCalls = []
    const orderRow = {
      id: 88, order_no: 'SO-BOTH', status: 'completed', customer_name: 'C',
      service_at: '2026-07-18 06:00:00', departure_at: '2026-07-18 05:00:00',
      actual_start_at: '2026-07-18 06:00:00', actual_end_at: '2026-07-18 13:00:00', return_at: '2026-07-18 14:00:00',
    }
    let insertId = 1000
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        if (/SELECT id\s+FROM attendance_requests/.test(sql)) return [[], []]
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) return [[{ approver_role: 'engineering_supervisor' }], []]
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) return [[{ role: 'engineering_supervisor', user_count: 1 }], []]
        if (/FROM attendance_supervisor_role_rules/.test(sql)) return [[{ supervisor_role: 'engineering_supervisor' }], []]
        if (/INSERT INTO attendance_requests/.test(sql)) return [{ insertId: insertId++ }, []]
        return [{ affectedRows: 1 }, []]
      },
    })
    // 该工单为休息日（2026-07-18 是周六），两段全程算加班：路上 05:00-06:00 + 13:00-14:00 = 2h，工作 06:00-13:00 = 7h
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { overtimeResult: 'pay' },
    }
    const res = createResponse()
    await controller.createServiceOrderOvertimeRequest(req, res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.created.length, 2)
    const details = res.body.created.map((item) => item.segmentKey).sort()
    assert.deepEqual(details, ['travel', 'work'])
    const inserts = executeCalls.filter((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.equal(inserts.length, 2)
    const travelInsert = inserts.find((call) => call.params.sourceDetail === 'travel')
    const workInsert = inserts.find((call) => call.params.sourceDetail === 'work')
    // 路上固定转调休，即便 body 传了 pay
    assert.equal(travelInsert.params.overtimeResult, 'comp_time')
    // 工作段按 body 的 pay，休息日 1 倍
    assert.equal(workInsert.params.overtimeResult, 'pay')
  }

  // 一段已申请过：只补另一段（历史遗留半报状态的兼容）
  {
    const executeCalls = []
    const orderRow = {
      id: 88, order_no: 'SO-HALF', status: 'completed', customer_name: 'C',
      service_at: '2026-07-18 06:00:00', departure_at: '2026-07-18 05:00:00',
      actual_start_at: '2026-07-18 06:00:00', actual_end_at: '2026-07-18 13:00:00', return_at: '2026-07-18 14:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        // work 段已占用，travel 段未占用
        if (/SELECT id\s+FROM attendance_requests/.test(sql)) {
          return params.segmentKey === 'work' ? [[{ id: 700 }], []] : [[], []]
        }
        if (/FROM attendance_approval_role_rule_steps/.test(sql)) return [[{ approver_role: 'engineering_supervisor' }], []]
        if (/SELECT role, COUNT\(\*\) AS user_count/.test(sql)) return [[{ role: 'engineering_supervisor', user_count: 1 }], []]
        if (/FROM attendance_supervisor_role_rules/.test(sql)) return [[{ supervisor_role: 'engineering_supervisor' }], []]
        if (/INSERT INTO attendance_requests/.test(sql)) return [{ insertId: 1010 }, []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, params: { id: '88' }, body: { overtimeResult: 'comp_time' } }
    const res = createResponse()
    await controller.createServiceOrderOvertimeRequest(req, res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.created.length, 1)
    assert.equal(res.body.created[0].segmentKey, 'travel')
    const inserts = executeCalls.filter((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.equal(inserts.length, 1)
    assert.equal(inserts[0].params.sourceDetail, 'travel')
  }

  // 两段都无有效加班时长（平日全程在 18:00 前）：报错，不生成任何申请
  {
    const executeCalls = []
    const orderRow = {
      id: 88, order_no: 'SO-NONE', status: 'completed', customer_name: 'C',
      service_at: '2026-07-14 09:00:00', departure_at: '2026-07-14 08:00:00',
      actual_start_at: '2026-07-14 09:00:00', actual_end_at: '2026-07-14 16:00:00', return_at: '2026-07-14 17:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        executeCalls.push({ sql })
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        if (/SELECT id\s+FROM attendance_requests/.test(sql)) return [[], []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, params: { id: '88' }, body: { overtimeResult: 'comp_time' } }
    const res = createResponse()
    let thrown = null
    try {
      await controller.createServiceOrderOvertimeRequest(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /没有可申请的加班时段/)
    assert.equal(executeCalls.some((call) => /INSERT INTO attendance_requests/.test(call.sql)), false)
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
    const { controller, calls } = await loadController({
      queryHandler: async (sql) => {
        if (isRequestListQuery(sql)) return []
        return undefined
      },
    })
    const res = createResponse()
    await controller.listRequests({ user: { id: 88, role: 'administrative_supervisor' }, query: { scope: 'supervisor' } }, res)
    const listQuery = calls.find((call) => isRequestListQuery(call.sql))
    assert.ok(listQuery)
    assert.match(listQuery.sql, /workflow_version, 1\) >= 3/)
    assert.match(listQuery.sql, /a\.step_type = 'role'/)
    assert.match(listQuery.sql, /r\.submitted_by <> :currentUserId/)
  }

  // 待审批数量：supervisor 待办 + 行政 pending_admin，按申请 ID 去重
  {
    const { controller } = await loadController({
      hasPermission: async (_role, key) => key === 'attendance.admin.approve',
      queryHandler: async (sql) => {
        // supervisor scope count 查询
        if (/FROM attendance_requests r/.test(sql) && /r\.status IN \(/.test(sql) && !/FOR UPDATE/.test(sql)) {
          return [{ id: 501 }, { id: 502 }]
        }
        // 行政 pending_admin count 查询（502 与 supervisor 重叠，应去重）
        if (/WHERE status = 'pending_admin'/.test(sql)) {
          return [{ id: 502 }, { id: 503 }]
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.pendingApprovalCount({ user: { id: 88, role: 'administrative_supervisor' } }, res)
    // 501、502、503 去重后为 3
    assert.equal(res.body.count, 3)
  }

  // 待审批数量：无行政权限时不计 pending_admin
  {
    const { controller } = await loadController({
      hasPermission: async () => false,
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /r\.status IN \(/.test(sql) && !/FOR UPDATE/.test(sql)) {
          return [{ id: 601 }]
        }
        if (/WHERE status = 'pending_admin'/.test(sql)) {
          throw new Error('无行政权限不应查询 pending_admin')
        }
        return undefined
      },
    })
    const res = createResponse()
    await controller.pendingApprovalCount({ user: { id: 42, role: 'engineer' } }, res)
    assert.equal(res.body.count, 1)
  }

  {
    const executeCalls = []
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 390,
            workflow_version: 3,
            employee_id: 5,
            employee_name: '申请人',
            applicant_email: 'applicant@example.test',
            request_type: 'leave',
            leave_type: 'personal',
            hours: 4,
            status: 'pending_approval',
            submitted_by: 42,
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{
            id: 31,
            request_id: 390,
            step_type: 'role',
            step_order: 1,
            assignee_role: 'administrative_supervisor',
            status: 'pending',
          }], []]
        }
        if (/FROM attendance_request_approvals/.test(sql) && /status = 'waiting'/.test(sql)) {
          return [[{
            id: 32,
            request_id: 390,
            step_type: 'role',
            step_order: 2,
            assignee_role: 'operations_director',
            status: 'waiting',
          }], []]
        }
        if (/SELECT COUNT\(\*\) AS step_count/.test(sql)) return [[{ step_count: 2 }], []]
        if (/FROM users/.test(sql) && /role = :role/.test(sql)) {
          return [[{ id: 99, name: '运营负责人', email: 'operations@example.test' }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 88, role: 'administrative_supervisor' }, params: { id: '390' }, body: {} }
    const res = createResponse()
    await controller.approveRole(req, res)
    assert.equal(res.body.status, 'pending_approval')
    assert.ok(executeCalls.some((call) => /SET status = 'approved'/.test(call.sql) && call.params.id === 31))
    assert.ok(executeCalls.some((call) => /SET status = 'pending'/.test(call.sql) && call.params.id === 32))
    const notification = executeCalls.find((call) => /INSERT IGNORE INTO attendance_email_notifications/.test(call.sql))
    assert.equal(notification?.params.eventKey, 'request:390:approval:2')
    assert.deepEqual(JSON.parse(notification.params.recipientEmails), ['operations@example.test'])
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 391,
            workflow_version: 3,
            status: 'pending_approval',
            submitted_by: 88,
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{ id: 33, step_type: 'role', assignee_role: 'administrative_supervisor', status: 'pending' }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 88, role: 'administrative_supervisor' }, params: { id: '391' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.approveRole(req, res)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 403)
    assert.match(thrown?.message || '', /不能审批自己的申请/)
  }

  {
    const { controller } = await loadController({
      connectionExecute: async (sql) => {
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 392,
            workflow_version: 3,
            status: 'pending_approval',
            submitted_by: 42,
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{ id: 34, step_type: 'role', assignee_role: 'administrative_supervisor', status: 'pending' }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 1, role: 'admin' }, params: { id: '392' }, body: {} }
    const res = createResponse()
    let thrown = null
    try {
      await controller.approveRole(req, res)
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
            id: 393,
            workflow_version: 3,
            employee_name: '申请人',
            applicant_email: 'applicant@example.test',
            request_type: 'leave',
            leave_type: 'personal',
            start_at: '2026-07-14 09:00:00',
            end_at: '2026-07-14 18:00:00',
            status: 'pending_approval',
            submitted_by: 42,
          }], []]
        }
        if (/FROM attendance_request_approvals a/.test(sql) && /a\.status = 'pending'/.test(sql)) {
          return [[{ id: 35, step_type: 'role', assignee_role: 'administrative_supervisor', status: 'pending' }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = {
      user: { id: 88, role: 'administrative_supervisor' },
      params: { id: '393' },
      body: { reason: '资料不完整' },
    }
    const res = createResponse()
    await controller.rejectRequest(req, res)
    assert.equal(res.body.ok, true)
    assert.ok(executeCalls.some((call) => /UPDATE attendance_request_approvals/.test(call.sql) && call.params.reason === '资料不完整'))
    assert.ok(executeCalls.some((call) => /UPDATE attendance_requests/.test(call.sql) && call.params.reason === '资料不完整'))
    const notification = executeCalls.find((call) => /INSERT IGNORE INTO attendance_email_notifications/.test(call.sql))
    assert.equal(notification?.params.eventType, 'rejected')
    assert.deepEqual(JSON.parse(notification.params.recipientEmails), ['applicant@example.test'])
    assert.equal(JSON.parse(notification.params.payload).rejectedReason, '资料不完整')
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
    let balanceQueryCount = 0
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/FROM attendance_requests r/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: 401,
            workflow_version: 2,
            employee_id: 5,
            employee_name: '申请人',
            applicant_email: 'applicant@example.test',
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
        if (/COALESCE\(SUM\(delta_hours\)/.test(sql)) {
          balanceQueryCount += 1
          const balance = balanceQueryCount === 1 ? 10 : 9.5
          return [[{ balance_hours: balance, balance_days: balance }], []]
        }
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = { user: { id: 88, role: 'engineering_supervisor' }, params: { id: '401' }, body: {} }
    const res = createResponse()
    await controller.approveSupervisor(req, res)
    assert.equal(res.body.status, 'approved')
    assert.ok(executeCalls.some((call) => /FROM attendance_employee_profiles/.test(call.sql) && /FOR UPDATE/.test(call.sql)))
    const notification = executeCalls.find((call) => /INSERT IGNORE INTO attendance_email_notifications/.test(call.sql))
    assert.equal(notification?.params.eventType, 'completed')
    const payload = JSON.parse(notification.params.payload)
    assert.equal(payload.annualLeaveUsedDays, 0.5)
    assert.equal(payload.annualLeaveBalanceDays, 9.5)
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
