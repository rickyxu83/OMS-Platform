const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

router.get('/unread', requireRoles(...ROLE_GROUPS.allSignedIn), controller.unread)
router.post('/:id/read', requireRoles(...ROLE_GROUPS.allSignedIn), controller.markRead)
router.get('/', requireRoles(...ROLE_GROUPS.settings), controller.list)
router.post('/', requireRoles(...ROLE_GROUPS.settings), controller.create)
router.put('/:id', requireRoles(...ROLE_GROUPS.settings), controller.update)
router.delete('/:id', requireRoles(...ROLE_GROUPS.settings), controller.remove)

module.exports = router
