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
    ended: false,
    status(value) {
      this.statusCode = value
      return this
    },
    json(value) {
      this.body = value
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

async function loadController({ queryHandler = null } = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()

  const calls = []
  async function query(sql, params = {}) {
    calls.push({ sql, params })
    if (queryHandler) {
      const handled = await queryHandler(sql, params)
      if (handled !== undefined) return handled
    }
    if (/FROM users WHERE id = :id/.test(sql)) {
      return [{
        id: 19,
        username: 'changrong@empty.local',
        real_name: '常勇',
        phone: null,
        email: 'changrong@empty.local',
        login_alias: 'chang.rong',
        role: 'driver',
        status: 'active',
        assistant_user_id: null,
      }]
    }
    return []
  }

  installMock(require.resolve('../src/config/db'), { query })
  installMock(require.resolve('../src/config/env'), {
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    isProduction: false,
    rootDir: process.cwd(),
    uploadDir: 'uploads',
  })

  return { controller: require('../src/modules/users/controller'), calls }
}

;(async () => {
  {
    // 改名同步考勤员工档案（2026-11-12 事故回归：司机改名后假勤与邮件仍显示旧名「常勇」）
    const { controller, calls } = await loadController()
    const req = {
      user: { id: 1, role: 'admin' },
      params: { id: '19' },
      body: { realName: '常荣' },
    }
    const res = createResponse()
    await controller.update(req, res)
    assert.equal(res.statusCode, 204)
    const profileSync = calls.find((call) => /UPDATE attendance_employee_profiles/.test(call.sql))
    assert.ok(profileSync, '改名应同步 attendance_employee_profiles')
    assert.equal(profileSync.params.employeeName, '常荣')
    assert.equal(Number(profileSync.params.userId), 19)
  }

  {
    // 不改名（realName 为空）时不触发档案同步
    const { controller, calls } = await loadController()
    const req = {
      user: { id: 1, role: 'admin' },
      params: { id: '19' },
      body: { phone: '13800000000', setPhone: true },
    }
    const res = createResponse()
    await controller.update(req, res)
    assert.equal(res.statusCode, 204)
    assert.equal(calls.some((call) => /UPDATE attendance_employee_profiles/.test(call.sql)), false)
  }

  console.log('users-controller tests passed')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
