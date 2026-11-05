const { rateLimit, ipKeyGenerator } = require('express-rate-limit')

// 登录限流窗口：users 模块改密码后按该窗口回查近期失败登录 IP 解除限流，两处必须同源
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      message: '登录尝试过于频繁，请稍后再试',
    },
  },
})

// 改密码后同步解除登录 IP 限流：账号锁定与 IP 限流由同一批失败登录同时触发，只解锁定会把用户继续卡在 429
// key 必须与 loginLimiter 默认 keyGenerator 一致：IPv4 原样、IPv6 归一到 /56 子网（ipKeyGenerator 默认值）
async function resetLoginRateLimitForIps(ips = []) {
  const unique = [...new Set(ips.map((value) => String(value || '').trim()).filter(Boolean))]
  for (const ip of unique) {
    try {
      await loginLimiter.resetKey(ipKeyGenerator(ip))
    } catch (error) {
      console.error('重置登录限流 key 失败（不影响主流程）:', ip, error)
    }
  }
}

// 通行密钥登录票据签发限流（002）：options 恒 200，skipSuccessfulRequests 型限流拦不住，
// 用独立计数器按总请求数限，防刷库/枚举探测
const passkeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      message: '操作过于频繁，请稍后再试',
    },
  },
})

const aiSummaryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      message: 'AI 摘要生成过于频繁，请稍后再试',
    },
  },
})

const customerSignatureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      message: '签署请求过于频繁，请稍后再试',
    },
  },
})

module.exports = {
  loginLimiter,
  passkeyLimiter,
  aiSummaryLimiter,
  customerSignatureLimiter,
  resetLoginRateLimitForIps,
  LOGIN_RATE_LIMIT_WINDOW_MS,
}
