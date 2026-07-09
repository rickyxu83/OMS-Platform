const express = require('express')
const controller = require('./controller')
const env = require('../../config/env')
const { authenticate } = require('../../middleware/auth')
const { loginLimiter } = require('../../middleware/rate-limit')

const router = express.Router()

const loginMiddlewares = env.disableLoginIpRateLimit ? [] : [loginLimiter]

router.post('/login', ...loginMiddlewares, controller.login)
router.get('/me', authenticate, controller.me)
router.post('/logout', authenticate, controller.logout)

module.exports = router
