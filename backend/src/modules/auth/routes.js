const express = require('express')
const controller = require('./controller')
const webauthn = require('./webauthn')
const env = require('../../config/env')
const { authenticate } = require('../../middleware/auth')
const { loginLimiter, passkeyLimiter } = require('../../middleware/rate-limit')

const router = express.Router()

const loginMiddlewares = env.disableLoginIpRateLimit ? [] : [loginLimiter]
const passkeyMiddlewares = env.disableLoginIpRateLimit ? [] : [passkeyLimiter]

router.post('/login', ...loginMiddlewares, controller.login)
router.get('/me', authenticate, controller.me)
router.post('/logout', authenticate, controller.logout)

// 登录安全增强（002-login-security）：通行密钥
router.get('/login-methods', webauthn.loginMethods)
router.post('/webauthn/register/options', authenticate, webauthn.registerOptions)
router.post('/webauthn/register/verify', authenticate, webauthn.registerVerify)
router.get('/webauthn/credentials', authenticate, webauthn.listCredentials)
router.patch('/webauthn/credentials/:id', authenticate, webauthn.renameCredential)
router.delete('/webauthn/credentials/:id', authenticate, webauthn.deleteCredential)
router.post('/webauthn/login/options', ...passkeyMiddlewares, webauthn.loginOptions)
router.post('/webauthn/login/verify', ...passkeyMiddlewares, (req, res) =>
  webauthn.loginVerify(req, res, { issueSession: controller.issueSession }))

module.exports = router
