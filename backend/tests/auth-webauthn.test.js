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
    cookies: [],
    body: null,
    status(value) {
      this.statusCode = value
      return this
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options })
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function makePasskeyRow(overrides = {}) {
  return {
    id: 7,
    user_id: 42,
    credential_id: 'cred-1',
    public_key: Buffer.from('public-key-bytes').toString('base64url'),
    counter: 1,
    transports: 'internal',
    device_name: 'iPhone',
    created_at: '2026-08-24 10:00:00',
    last_used_at: null,
    ...overrides,
  }
}

function makeUserRow(overrides = {}) {
  return {
    id: 42,
    username: 'user@example.test',
    email: 'user@example.test',
    login_alias: 'user',
    real_name: '测试用户',
    phone: '',
    role: 'engineer',
    status: 'active',
    engineer_signature: null,
    avatar_path: null,
    must_change_password: 0,
    failed_login_count: 0,
    locked_until: null,
    ...overrides,
  }
}

// 统一装配：db/simplewebauthn/schema/audit 全 mock，behavior 参数驱动
async function loadWebauthn({
  rpId = 'example.test',
  origins = 'https://admin.example.test',
  passkeys = [makePasskeyRow()],
  user = makeUserRow(),
  consumeAffectedRows = 1,
  challengeRow = null,
  verifyRegistrationResult = null,
  verifyAuthenticationResult = null,
  updateAffectedRows = 1,
  deleteAffectedRows = 1,
} = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  process.env.WEBAUTHN_RP_ID = rpId
  process.env.WEBAUTHN_ORIGINS = origins
  clearBackendModuleCache()

  const calls = { query: [], execute: [], audit: [] }

  async function query(sql, params = {}) {
    calls.query.push({ sql, params })
    if (/FROM user_passkeys/.test(sql) && /WHERE user_id = :userId/.test(sql) && /ORDER BY created_at/.test(sql)) return passkeys
    if (/FROM auth_challenges/.test(sql) && /WHERE challenge = :challenge/.test(sql)) {
      return challengeRow ? [challengeRow] : []
    }
    if (/FROM users/.test(sql) && /LOWER\(email\)/.test(sql)) return user ? [user] : []
    if (/^DELETE FROM user_passkeys/.test(sql)) return { affectedRows: deleteAffectedRows }
    if (/^UPDATE user_passkeys SET device_name/.test(sql)) return { affectedRows: updateAffectedRows }
    if (/^INSERT INTO auth_challenges/.test(sql)) return { insertId: 1 }
    return []
  }

  const connection = {
    async execute(sql, params = {}) {
      calls.execute.push({ sql, params })
      if (/UPDATE auth_challenges/.test(sql) && /consumed_at = NOW/.test(sql)) return [{ affectedRows: consumeAffectedRows }]
      if (/FROM auth_challenges/.test(sql)) return [challengeRow ? [challengeRow] : []]
      if (/FROM user_passkeys/.test(sql) && /credential_id = :credentialId/.test(sql) && /SELECT id FROM/.test(sql)) return [[]]
      if (/FROM user_passkeys/.test(sql) && /credential_id = :credentialId/.test(sql)) return [[makePasskeyRow()]]
      if (/FROM users WHERE id = :id/.test(sql)) return [user ? [user] : []]
      if (/INSERT INTO user_passkeys/.test(sql)) return [{ insertId: 12 }]
      return [{ affectedRows: 1 }]
    },
  }

  installMock(require.resolve('../src/config/db'), {
    query,
    transaction: async (callback) => callback(connection),
  })
  installMock(require.resolve('../src/modules/auth/schema'), {
    ensureAuthSecurityTables: async () => undefined,
  })
  installMock(require.resolve('../src/modules/users/schema'), {
    ensureUserLoginColumns: async () => undefined,
  })
  installMock(require.resolve('../src/modules/auth/audit'), {
    writeAuthAudit: async (req, entry) => { calls.audit.push(entry) },
  })
  installMock(require.resolve('@simplewebauthn/server'), {
    generateRegistrationOptions: async () => ({
      challenge: 'reg-challenge-1',
      rp: { name: 'OMS', id: 'example.test' },
      user: { id: '42', name: 'user@example.test', displayName: '测试用户' },
      pubKeyCredParams: [],
      excludeCredentials: passkeys.map((row) => ({ id: row.credential_id })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    }),
    verifyRegistrationResponse: async () => (
      verifyRegistrationResult || {
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-new',
            publicKey: new TextEncoder().encode('new-public-key'),
            counter: 0,
            transports: ['internal'],
          },
        },
      }
    ),
    generateAuthenticationOptions: async (args) => ({
      challenge: 'login-challenge-1',
      rpId: args.rpID,
      allowCredentials: args.allowCredentials,
      userVerification: args.userVerification,
    }),
    verifyAuthenticationResponse: async () => (
      verifyAuthenticationResult || { verified: true, authenticationInfo: { newCounter: 5 } }
    ),
  })

  const webauthn = require('../src/modules/auth/webauthn')
  return { webauthn, calls }
}

const authedReq = (overrides = {}) => ({
  user: { id: 42, role: 'engineer', email: 'user@example.test', username: 'user@example.test', real_name: '测试用户' },
  body: {},
  params: {},
  ip: '127.0.0.1',
  get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  ...overrides,
})

;(async () => {
  // 登录方式探测：配置决定 passkey 开关，wechat 固定关闭（留待 US2）
  {
    const { webauthn } = await loadWebauthn()
    const res = createResponse()
    await webauthn.loginMethods({}, res)
    assert.deepEqual(res.body, { password: true, passkey: true, wechat: false })
  }
  {
    const { webauthn } = await loadWebauthn({ rpId: '' })
    const res = createResponse()
    await webauthn.loginMethods({}, res)
    assert.equal(res.body.passkey, false)
  }

  // 登记 options：challenge 落库且绑定本人，excludeCredentials 带已有凭据
  {
    const { webauthn, calls } = await loadWebauthn()
    const res = createResponse()
    await webauthn.registerOptions(authedReq(), res)
    assert.equal(res.body.challengeToken, 'reg-challenge-1')
    assert.deepEqual(res.body.publicKey.excludeCredentials, [{ id: 'cred-1' }])
    const insert = calls.query.find((call) => /^INSERT INTO auth_challenges/.test(call.sql))
    assert.equal(insert.params.purpose, 'webauthn_register')
    assert.equal(insert.params.userId, 42)
    assert.match(insert.sql, /INTERVAL 5 MINUTE/)
  }

  // 登记 options：数量上限
  {
    const many = Array.from({ length: 10 }, (_, index) => makePasskeyRow({ id: index + 1, credential_id: `cred-${index}` }))
    const { webauthn } = await loadWebauthn({ passkeys: many })
    let thrown = null
    try {
      await webauthn.registerOptions(authedReq(), createResponse())
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
    assert.match(thrown?.message || '', /已达上限/)
  }

  // 登记 verify：成功写入凭据（公钥 base64url 化）+ 审计
  {
    const { webauthn, calls } = await loadWebauthn({
      challengeRow: { id: 1, challenge: 'reg-challenge-1', purpose: 'webauthn_register', user_id: 42 },
    })
    const res = createResponse()
    await webauthn.registerVerify(authedReq({
      body: { challengeToken: 'reg-challenge-1', response: { id: 'cred-new' }, deviceName: '我的工作机' },
    }), res)
    assert.equal(res.body.ok, true)
    assert.equal(res.body.credential.id, 12)
    assert.equal(res.body.credential.deviceName, '我的工作机')
    const insert = calls.execute.find((call) => /INSERT INTO user_passkeys/.test(call.sql))
    assert.equal(insert.params.credentialId, 'cred-new')
    assert.equal(Buffer.from(insert.params.publicKey, 'base64url').toString(), 'new-public-key')
    assert.ok(calls.audit.some((entry) => entry.action === 'passkey_register'))
  }

  // 登记 verify：challenge 重放（消费不到）→ 400
  {
    const { webauthn } = await loadWebauthn({ consumeAffectedRows: 0 })
    let thrown = null
    try {
      await webauthn.registerVerify(authedReq({
        body: { challengeToken: 'reg-challenge-1', response: { id: 'cred-new' } },
      }), createResponse())
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
  }

  // 登记 verify：challenge 属于别人 → 400
  {
    const { webauthn } = await loadWebauthn({
      challengeRow: { id: 1, challenge: 'reg-challenge-1', purpose: 'webauthn_register', user_id: 99 },
    })
    let thrown = null
    try {
      await webauthn.registerVerify(authedReq({
        body: { challengeToken: 'reg-challenge-1', response: { id: 'cred-new' } },
      }), createResponse())
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 400)
  }

  // 登录 options：未知账号返回结构一致的不可满足 options（防枚举）
  {
    const { webauthn, calls } = await loadWebauthn({ user: null })
    const res = createResponse()
    await webauthn.loginOptions({ body: { identifier: 'nobody@example.test' } }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.challengeToken, 'login-challenge-1')
    assert.deepEqual(res.body.publicKey.allowCredentials, [])
    const insert = calls.query.find((call) => /^INSERT INTO auth_challenges/.test(call.sql))
    assert.equal(insert.params.purpose, 'webauthn_login')
    assert.equal(insert.params.userId, null)
  }

  // 登录 options：命中账号带凭据列表（不声明 transports，台式机可走手机扫码 hybrid 通道）
  {
    const { webauthn } = await loadWebauthn()
    const res = createResponse()
    await webauthn.loginOptions({ body: { identifier: 'USER@example.test' } }, res)
    assert.deepEqual(res.body.publicKey.allowCredentials, [{ id: 'cred-1' }])
  }

  // 登录 verify：成功 → 计数器更新 + 会话签发 + 审计
  {
    const { webauthn, calls } = await loadWebauthn({
      challengeRow: { id: 2, challenge: 'login-challenge-1', purpose: 'webauthn_login', user_id: 42 },
    })
    const res = createResponse()
    const issued = []
    await webauthn.loginVerify(
      { body: { challengeToken: 'login-challenge-1', response: { id: 'cred-1' } }, ip: '127.0.0.1', get: () => '' },
      res,
      { issueSession: async (req, resInner, user) => { issued.push(user.id); resInner.json({ ok: true }) } },
    )
    assert.deepEqual(issued, [42])
    const counterUpdate = calls.execute.find((call) => /UPDATE user_passkeys/.test(call.sql) && /last_used_at/.test(call.sql))
    assert.equal(counterUpdate.params.counter, 5)
    assert.ok(calls.audit.some((entry) => entry.action === 'login' && entry.detail.method === 'passkey_login' && entry.actorId === 42))
  }

  // 登录 verify：challenge 重放 → 401 + 失败审计，不签发会话
  {
    const { webauthn, calls } = await loadWebauthn({ consumeAffectedRows: 0 })
    let thrown = null
    try {
      await webauthn.loginVerify(
        { body: { challengeToken: 'login-challenge-1', response: { id: 'cred-1' } }, ip: '127.0.0.1', get: () => '' },
        createResponse(),
        { issueSession: async () => { throw new Error('不应签发会话') } },
      )
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 401)
    assert.match(thrown?.message || '', /通行密钥验证失败/)
    assert.ok(calls.audit.some((entry) => entry.action === 'login_failed' && entry.detail.method === 'passkey_login'))
  }

  // 登录 verify：challenge 绑定账号与凭据归属不一致 → 401
  {
    const { webauthn } = await loadWebauthn({
      challengeRow: { id: 2, challenge: 'login-challenge-1', purpose: 'webauthn_login', user_id: 99 },
    })
    let thrown = null
    try {
      await webauthn.loginVerify(
        { body: { challengeToken: 'login-challenge-1', response: { id: 'cred-1' } }, ip: '127.0.0.1', get: () => '' },
        createResponse(),
        { issueSession: async () => { throw new Error('不应签发会话') } },
      )
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 401)
  }

  // 登录 verify：账号被锁定 → 与密码登录同口径拒绝
  {
    const { webauthn } = await loadWebauthn({
      challengeRow: { id: 2, challenge: 'login-challenge-1', purpose: 'webauthn_login', user_id: 42 },
      user: makeUserRow({ locked_until: new Date(Date.now() + 10 * 60 * 1000) }),
    })
    let thrown = null
    try {
      await webauthn.loginVerify(
        { body: { challengeToken: 'login-challenge-1', response: { id: 'cred-1' } }, ip: '127.0.0.1', get: () => '' },
        createResponse(),
        { issueSession: async () => { throw new Error('不应签发会话') } },
      )
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 401)
  }

  // 删除：仅本人可删，越权/不存在 → 404
  {
    const { webauthn, calls } = await loadWebauthn()
    const res = createResponse()
    await webauthn.deleteCredential(authedReq({ params: { id: '7' } }), res)
    assert.equal(res.body.ok, true)
    const del = calls.query.find((call) => /^DELETE FROM user_passkeys/.test(call.sql))
    assert.equal(del.params.userId, 42)
    assert.ok(calls.audit.some((entry) => entry.action === 'passkey_delete'))
  }
  {
    const { webauthn } = await loadWebauthn({ deleteAffectedRows: 0 })
    let thrown = null
    try {
      await webauthn.deleteCredential(authedReq({ params: { id: '7' } }), createResponse())
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown?.status, 404)
  }

  console.log('auth webauthn tests passed')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
