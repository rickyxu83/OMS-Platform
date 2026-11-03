const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

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

function loadAuditMiddleware() {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()
  const calls = []
  installMock(require.resolve('../src/config/db'), {
    query: async (sql, params = {}) => {
      calls.push({ sql, params })
      return []
    },
  })
  return { auditLogger: require('../src/middleware/audit').auditLogger, calls }
}

function simulate(auditLogger, { method, baseUrl, path, originalUrl, user = { id: 7 } }) {
  const req = {
    method,
    baseUrl,
    path,
    originalUrl: originalUrl || `${baseUrl}${path}`,
    user,
    query: {},
    body: undefined,
    ip: '203.0.113.9',
  }
  const res = new EventEmitter()
  res.statusCode = 200
  let nextCalled = false
  auditLogger(req, res, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true)
  res.emit('finish')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  // 1. 窗口期内：假勤 GET 读操作留审计（action=read）
  {
    const { auditLogger, calls } = loadAuditMiddleware()
    simulate(auditLogger, { method: 'GET', baseUrl: '/api/v1/attendance', path: '/leave-requests' })
    await sleep(10)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].params.action, 'read')
    assert.equal(calls[0].params.targetType, 'attendance')
    assert.equal(calls[0].params.actorId, 7)
  }

  // 2. 非假勤模块的 GET 仍不留痕（降噪策略不变）
  {
    const { auditLogger, calls } = loadAuditMiddleware()
    simulate(auditLogger, { method: 'GET', baseUrl: '/api/v1/customers', path: '/' })
    await sleep(10)
    assert.equal(calls.length, 0)
  }

  // 3. 写操作审计不受临时逻辑影响
  {
    const { auditLogger, calls } = loadAuditMiddleware()
    simulate(auditLogger, { method: 'POST', baseUrl: '/api/v1/attendance', path: '/leave-requests' })
    await sleep(10)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].params.action, 'create')
  }

  // 4. 未登录请求不留痕
  {
    const { auditLogger, calls } = loadAuditMiddleware()
    simulate(auditLogger, { method: 'GET', baseUrl: '/api/v1/attendance', path: '/', user: null })
    await sleep(10)
    assert.equal(calls.length, 0)
  }

  // 5. 过了 2026-12-31（北京时间）：假勤 GET 自动恢复不留痕
  {
    const realNow = Date.now
    Date.now = () => new Date('2027-01-01T00:00:01+08:00').getTime()
    try {
      const { auditLogger, calls } = loadAuditMiddleware()
      simulate(auditLogger, { method: 'GET', baseUrl: '/api/v1/attendance', path: '/leave-requests' })
      await sleep(10)
      assert.equal(calls.length, 0)
    } finally {
      Date.now = realNow
    }
  }

  console.log('audit-read-attendance.test.js OK')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
