const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { ipKeyGenerator } = require('express-rate-limit')
const { loginLimiter, resetLoginRateLimitForIps } = require('../src/middleware/rate-limit')

// 通过模拟请求打满 loginLimiter，验证 resetLoginRateLimitForIps（改密码后解除限流用）：
// ① IPv4 原样 key 可重置 ② IPv6 原始地址能命中默认 keyGenerator 归一后的 /56 子网 key

function mockReq(ip) {
  return {
    ip,
    headers: {},
    method: 'POST',
    path: '/login',
    originalUrl: '/login',
    protocol: 'http',
    secure: false,
    app: { get: () => 1 }, // trust proxy=1，与生产一致且避开 v8 校验
  }
}

function mockRes() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.writableEnded = false
  res.locals = {}
  res.setHeader = () => res
  res.getHeader = () => undefined
  res.append = () => res
  res.status = (code) => { res.statusCode = code; return res }
  res.json = () => res
  res.send = () => res
  return res
}

async function hitUntilLimited(ip, maxHits) {
  let limitedAt = null
  for (let i = 1; i <= maxHits + 1; i += 1) {
    let passed = false
    const res = mockRes()
    await loginLimiter(mockReq(ip), res, () => { passed = true })
    if (!passed) {
      assert.equal(res.statusCode, 429, `${ip} 被限流时应返回 429`)
      limitedAt = i
      break
    }
  }
  assert.equal(limitedAt, maxHits + 1, `${ip} 应在第 ${maxHits + 1} 次请求被限流`)
}

async function hitOnceExpectPass(ip) {
  let passed = false
  await loginLimiter(mockReq(ip), mockRes(), () => { passed = true })
  assert.equal(passed, true, `${ip} 解除限流后应能正常通过`)
}

async function main() {
  const ipv4 = '203.0.113.9'
  const ipv6 = '240e:478:4a88:116b:25b2:c20:93d0:76ce'

  await hitUntilLimited(ipv4, 5)
  const ipv4Hits = await loginLimiter.getKey(ipKeyGenerator(ipv4))
  assert.ok(ipv4Hits && ipv4Hits.totalHits >= 5, 'IPv4 限流后应有命中计数')
  await resetLoginRateLimitForIps([ipv4])
  assert.equal(await loginLimiter.getKey(ipKeyGenerator(ipv4)), undefined, 'IPv4 重置后计数应清空')
  await hitOnceExpectPass(ipv4)

  await hitUntilLimited(ipv6, 5)
  // 默认 keyGenerator 把 IPv6 归一到 /56 子网；重置方传入的是审计日志里的原始地址，必须能命中同一 key
  const subnetKey = ipKeyGenerator(ipv6)
  assert.notEqual(subnetKey, ipv6, 'IPv6 默认应归一为 /56 子网 key')
  assert.ok(await loginLimiter.getKey(subnetKey), 'IPv6 限流后子网 key 应有计数')
  await resetLoginRateLimitForIps([ipv6])
  assert.equal(await loginLimiter.getKey(subnetKey), undefined, 'IPv6 重置后子网 key 计数应清空')
  await hitOnceExpectPass(ipv6)

  await resetLoginRateLimitForIps([])
  await resetLoginRateLimitForIps([null, '', '  '])
  console.log('auth login rate-limit reset tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
