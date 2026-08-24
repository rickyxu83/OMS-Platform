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

function createReq({ cookie = '', userAgent = '', ip = '127.0.0.1' } = {}) {
  return {
    ip,
    get: (name) => {
      if (String(name).toLowerCase() === 'cookie') return cookie
      if (String(name).toLowerCase() === 'user-agent') return userAgent
      return ''
    },
  }
}

function createRes() {
  return {
    cookies: [],
    cookie(name, value, options) {
      this.cookies.push({ name, value, options })
      return this
    },
  }
}

async function loadModule({ mailResult = { sent: true } } = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  clearBackendModuleCache()
  const mailCalls = []
  installMock(require.resolve('../src/services/mail'), {
    sendNewDeviceLoginMail: async (payload) => {
      mailCalls.push(payload)
      return mailResult
    },
  })
  installMock(require.resolve('../src/utils/ip-location'), {
    resolveIpLocation: () => '浙江宁波',
  })
  const deviceAlert = require('../src/modules/auth/device-alert')
  return { deviceAlert, mailCalls }
}

const sessionCookieOptions = { httpOnly: true, sameSite: 'lax', secure: true, path: '/' }

;(async () => {
  // 已有设备标记 Cookie：不重复发邮件、不重写 Cookie
  {
    const { deviceAlert, mailCalls } = await loadModule()
    const res = createRes()
    deviceAlert.markDeviceAndAlert(
      createReq({ cookie: 'oms_device_id=existing-id; oms_platform_token=abc' }),
      res,
      { id: 1, email: 'user@example.test', real_name: '测试' },
      { method: 'password_login', sessionCookieOptions },
    )
    assert.equal(res.cookies.length, 0)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(mailCalls.length, 0)
  }

  // 陌生设备 + 有邮箱：落两年期设备 Cookie + 发提醒邮件（内容字段齐全）
  {
    const { deviceAlert, mailCalls } = await loadModule()
    const res = createRes()
    deviceAlert.markDeviceAndAlert(
      createReq({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' }),
      res,
      { id: 1, email: 'user@example.test', real_name: '王俊斌' },
      { method: 'passkey_login', sessionCookieOptions },
    )
    const deviceCookie = res.cookies.find((cookie) => cookie.name === 'oms_device_id')
    assert.ok(deviceCookie, 'should set device cookie')
    assert.ok(deviceCookie.value.length >= 32)
    assert.equal(deviceCookie.options.httpOnly, true)
    assert.ok(deviceCookie.options.maxAge > 600 * 24 * 60 * 60 * 1000, 'device cookie should be long-lived')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(mailCalls.length, 1)
    assert.equal(mailCalls[0].to, 'user@example.test')
    assert.equal(mailCalls[0].methodLabel, '通行密钥（生物识别）')
    assert.equal(mailCalls[0].deviceLabel, 'iPhone · Safari')
    assert.equal(mailCalls[0].location, '浙江宁波')
  }

  // 陌生设备但无邮箱：Cookie 照落，邮件跳过
  {
    const { deviceAlert, mailCalls } = await loadModule()
    const res = createRes()
    deviceAlert.markDeviceAndAlert(
      createReq(),
      res,
      { id: 1, email: '', real_name: '无邮箱' },
      { method: 'password_login', sessionCookieOptions },
    )
    assert.equal(res.cookies.length, 1)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(mailCalls.length, 0)
  }

  // 邮件发送失败不影响登录主流程（消防式）
  {
    const { deviceAlert } = await loadModule({ mailResult: { sent: false } })
    installMock(require.resolve('../src/services/mail'), {
      sendNewDeviceLoginMail: async () => { throw new Error('smtp down') },
    })
    const res = createRes()
    deviceAlert.markDeviceAndAlert(createReq(), res, { id: 1, email: 'u@t.test' }, { method: 'password_login', sessionCookieOptions })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(res.cookies.length, 1)
  }

  // UA 设备描述解析
  {
    const { deviceAlert } = await loadModule()
    assert.equal(deviceAlert.inferDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'), 'Windows 电脑 · Chrome')
    assert.equal(deviceAlert.inferDeviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'), 'Mac · Safari')
    assert.equal(deviceAlert.inferDeviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/126.0'), '安卓设备 · Chrome')
    assert.equal(deviceAlert.inferDeviceLabel(''), '未知设备')
  }

  console.log('auth device-alert tests passed')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
