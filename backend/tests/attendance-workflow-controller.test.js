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
    'overtime_day_type',
    'overtime_pay_multiplier',
  ].map((columnName) => ({ columnName }))
}

async function loadController({ delegateEmployeeId = 9, connectionExecute = async () => [[], []] } = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()

  const calls = []
  async function query(sql, params = {}) {
    calls.push({ sql, params })
    if (/information_schema\.COLUMNS/.test(sql) && /attendance_requests/.test(sql)) return requestColumnRows()
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
    if (/INSERT INTO attendance_requests/.test(sql)) return { insertId: 321 }
    return []
  }

  installMock(require.resolve('../src/config/db'), {
    query,
    transaction: async (callback) => callback({ execute: connectionExecute }),
  })
  installMock(require.resolve('../src/permissions/store'), {
    hasAnyPermission: async () => false,
    hasPermission: async () => false,
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
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
