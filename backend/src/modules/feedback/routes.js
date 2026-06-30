const express = require('express')
const controller = require('./controller')
const { requirePermission, requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

router.post('/', requireRoles(...ROLE_GROUPS.allSignedIn), controller.create)
router.get('/', requirePermission('feedback.manage'), controller.list)
router.put('/:id/status', requirePermission('feedback.manage'), controller.updateStatus)

module.exports = router
