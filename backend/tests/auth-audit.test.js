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

async function loadAudit({ insertError = null } = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()
  const calls = []
  installMock(require.resolve('../src/config/db'), {
    query: async (sql, params = {}) => {
      calls.push({ sql, params })
      if (insertError && /^INSERT INTO audit_logs/.test(sql)) throw new Error(insertError)
      return []
    },
  })
  installMock(require.resolve('../src/modules/auth/schema'), {
    ensureAuthSecurityTables: async () => undefined,
  })
  return { writeAuthAudit: require('../src/modules/auth/audit').writeAuthAudit, calls }
}

const req = { ip: '203.0.113.9', get: () => 'TestAgent/1.0' }

;(async () => {
  // 匿名失败审计：actorId 默认 NULL（不是 0——0 会触发 audit_logs 的 FK 报错，2026-08-24 事故）
  {
    const { writeAuthAudit, calls } = await loadAudit()
    await writeAuthAudit(req, { action: 'login_failed', detail: { method: 'password_login' } })
    const insert = calls.find((call) => /^INSERT INTO audit_logs/.test(call.sql))
    assert.ok(insert)
    assert.equal(insert.params.actorId, null)
    assert.equal(insert.params.targetId, 0)
    assert.equal(insert.params.action, 'login_failed')
    assert.equal(JSON.parse(insert.params.detailJson).ip, '203.0.113.9')
    assert.equal(JSON.parse(insert.params.detailJson).method, 'password_login')
  }

  // 已知账号的失败审计：归属到被攻击账号
  {
    const { writeAuthAudit, calls } = await loadAudit()
    await writeAuthAudit(req, { actorId: 42, action: 'login_failed', detail: { method: 'password_login' } })
    const insert = calls.find((call) => /^INSERT INTO audit_logs/.test(call.sql))
    assert.equal(insert.params.actorId, 42)
    assert.equal(insert.params.targetId, 42)
  }

  // 写入失败不抛错（消防式，不阻塞登录主流程）
  {
    const { writeAuthAudit } = await loadAudit({ insertError: 'fk boom' })
    await writeAuthAudit(req, { action: 'login', detail: { method: 'password_login' } })
  }

  console.log('auth audit tests passed')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
