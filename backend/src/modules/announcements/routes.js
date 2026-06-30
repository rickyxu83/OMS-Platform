const express = require('express')
const controller = require('./controller')
const { requirePermission, requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

router.get('/unread', requireRoles(...ROLE_GROUPS.allSignedIn), controller.unread)
router.post('/:id/read', requireRoles(...ROLE_GROUPS.allSignedIn), controller.markRead)
router.get('/', requirePermission('announcement.manage'), controller.list)
router.post('/', requirePermission('announcement.manage'), controller.create)
router.put('/:id', requirePermission('announcement.manage'), controller.update)
router.delete('/:id', requirePermission('announcement.manage'), controller.remove)

module.exports = router
