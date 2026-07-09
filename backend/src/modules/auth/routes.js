const express = require('express')
const controller = require('./controller')
const { authenticate } = require('../../middleware/auth')

const router = express.Router()

router.post('/login', controller.login)
router.get('/me', authenticate, controller.me)
router.post('/logout', authenticate, controller.logout)

module.exports = router
