const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const settingsRoles = ['admin', 'supervisor', 'engineering_supervisor']

router.get('/', requireRoles(...settingsRoles), controller.list)
router.put('/', requireRoles(...settingsRoles), controller.update)
router.post('/test-ai', requireRoles(...settingsRoles), controller.testAi)
router.post('/test-mail', requireRoles(...settingsRoles), controller.testMail)

module.exports = router
