const { rateLimit } = require('express-rate-limit')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
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
  aiSummaryLimiter,
  customerSignatureLimiter,
}
