const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

router.get('/', requireRoles(...ROLE_GROUPS.userManage), controller.list)
router.get('/me', requireRoles(...ROLE_GROUPS.userSelf), controller.me)
router.put('/me', requireRoles(...ROLE_GROUPS.userSelf), controller.updateMe)
router.post('/me/avatar', requireRoles(...ROLE_GROUPS.userSelf), controller.avatarUploadMiddleware, controller.uploadAvatar)
router.delete('/me/avatar', requireRoles(...ROLE_GROUPS.userSelf), controller.removeAvatar)
router.get('/engineers', requireRoles(...ROLE_GROUPS.engineerDirectory), controller.listEngineers)
router.get('/salespeople', requireRoles(...ROLE_GROUPS.salesDirectory), controller.listSalespeople)
router.post('/', requireRoles('admin'), controller.create)
router.put('/:id', requireRoles('admin'), controller.update)
router.delete('/:id', requireRoles('admin'), controller.remove)
router.post('/:id/restore', requireRoles('admin'), controller.restore)

module.exports = router
