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

function makeUser(overrides = {}) {
  return {
    id: 42,
    username: 'user@example.test',
    email: 'user@example.test',
    login_alias: 'user',
    password_hash: 'hash',
    real_name: 'Test User',
    phone: '',
    role: 'engineer',
    status: 'active',
    engineer_signature: 'signature',
    avatar_path: '',
    must_change_password: 0,
    failed_login_count: 0,
    locked_until: null,
    ...overrides,
  }
}

function createResponse() {
  return {
    cookies: [],
    body: null,
    cookie(name, value, options) {
      this.cookies.push({ name, value, options })
    },
    json(body) {
      this.body = body
    },
  }
}

async function loadAndRunLogin({ disableAccountLockout = false, user, passwordOk }) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  if (disableAccountLockout) {
    process.env.DISABLE_LOGIN_ACCOUNT_LOCKOUT = 'true'
  } else {
    delete process.env.DISABLE_LOGIN_ACCOUNT_LOCKOUT
  }

  clearBackendModuleCache()

  const executeCalls = []
  const connection = {
    async execute(sql, params) {
      executeCalls.push({ sql, params })
      if (/SELECT id, username/.test(sql)) return [[user]]
      return [{ affectedRows: 1 }]
    },
  }
  const compareCalls = []

  installMock(require.resolve('../src/config/db'), {
    // query 供登录审计写日志（writeAuthAudit 自带容错，这里给空实现保持测试安静）
    query: async () => [],
    transaction: async (callback) => callback(connection),
  })
  installMock(require.resolve('../src/modules/users/schema'), {
    ensureUserLoginColumns: async () => undefined,
  })
  installMock(require.resolve('bcrypt'), {
    hashSync: () => 'timing-guard-hash',
    compare: async (...args) => {
      compareCalls.push(args)
      return passwordOk
    },
  })
  installMock(require.resolve('jsonwebtoken'), {
    sign: () => 'signed-token',
  })
  installMock(require.resolve('../src/permissions/store'), {
    getAvailableWorkspacesForRole: async () => ['engineer'],
    getDefaultWorkspaceForRole: async () => 'engineer',
    listPermissionsForRole: async () => [],
  })

  const controller = require('../src/modules/auth/controller')
  const req = {
    body: { username: 'USER@example.test', password: 'password' },
    get: () => '',
  }
  const res = createResponse()
  let thrown = null
  try {
    await controller.login(req, res)
  } catch (error) {
    thrown = error
  }

  return { executeCalls, compareCalls, response: res, thrown }
}

;(async () => {
  {
    const result = await loadAndRunLogin({
      user: makeUser({ failed_login_count: 4 }),
      passwordOk: false,
    })
    assert.equal(result.thrown?.status, 401)
    const update = result.executeCalls.find((call) => /^\s*UPDATE users/.test(call.sql) && /failed_login_count/.test(call.sql) && /locked_until/.test(call.sql))
    assert.ok(update, 'default login failure should update failed-login lockout fields')
    assert.match(update.sql, /DATE_ADD\(NOW\(\), INTERVAL 15 MINUTE\)/)
    assert.equal(update.params.failedLoginCount, 0)
  }

  {
    const result = await loadAndRunLogin({
      disableAccountLockout: true,
      user: makeUser({ failed_login_count: 4 }),
      passwordOk: false,
    })
    assert.equal(result.thrown?.status, 401)
    const lockoutUpdates = result.executeCalls.filter((call) => /^\s*UPDATE users/.test(call.sql) && /failed_login_count/.test(call.sql) && /locked_until/.test(call.sql))
    assert.equal(lockoutUpdates.length, 0, 'disabled account lockout should not increment or lock the user')
  }

  {
    const result = await loadAndRunLogin({
      disableAccountLockout: true,
      user: makeUser({ locked_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
      passwordOk: true,
    })
    assert.equal(result.thrown, null)
    assert.equal(result.compareCalls.length, 1, 'disabled account lockout should still check the password for locked users')
    assert.equal(result.response.body.user.id, 42)
    // 陌生设备登录提醒（002）：未携带设备标记 Cookie 时应落两年期设备 Cookie
    assert.ok(
      result.response.cookies.some((cookie) => cookie.name === 'oms_device_id'),
      'new device login should set the long-lived device marker cookie',
    )
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
