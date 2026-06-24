const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

router.post('/', requireRoles(...ROLE_GROUPS.allSignedIn), controller.create)
router.get('/', requireRoles(...ROLE_GROUPS.adminWorkspace), controller.list)
router.put('/:id/status', requireRoles(...ROLE_GROUPS.feedbackManage), controller.updateStatus)

module.exports = router
