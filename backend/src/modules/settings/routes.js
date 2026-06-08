const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

const settingsRoles = ROLE_GROUPS.settings

router.get('/', requireRoles(...settingsRoles), controller.list)
router.get('/public-map', requireRoles(...ROLE_GROUPS.adminWorkspace), controller.publicMapSettings)
router.put('/', requireRoles(...settingsRoles), controller.update)
router.post('/test-ai', requireRoles(...settingsRoles), controller.testAi)
router.post('/test-mail', requireRoles(...settingsRoles), controller.testMail)

module.exports = router
