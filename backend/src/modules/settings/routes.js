const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requirePermission('settings.view'), controller.list)
router.get('/public-map', requirePermission('workspace.admin'), controller.publicMapSettings)
router.put('/', requirePermission('settings.edit'), controller.update)
router.post('/test-ai', requirePermission('settings.edit'), controller.testAi)
router.post('/test-mail', requirePermission('settings.edit'), controller.testMail)

module.exports = router
