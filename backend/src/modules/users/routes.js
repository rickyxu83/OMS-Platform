const express = require('express')
const controller = require('./controller')
const { requirePermission, requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')
const userSignatureController = require('../user-signature/controller')
const env = require('../../config/env')

const router = express.Router()

router.get('/', requirePermission('user.view'), controller.list)
router.get('/me', requireRoles(...ROLE_GROUPS.userSelf), controller.me)
router.put('/me', requireRoles(...ROLE_GROUPS.userSelf), controller.updateMe)
router.post('/me/avatar', requireRoles(...ROLE_GROUPS.userSelf), controller.avatarUploadMiddleware, controller.uploadAvatar)
router.delete('/me/avatar', requireRoles(...ROLE_GROUPS.userSelf), controller.removeAvatar)
// 手机签名链路属 MR 签核配套：暗启动禁用 user-signature 时同步隐藏（与 app.js 公开签署路由一致）
if (!env.featureModulesDisabled.has('user-signature')) {
  router.post('/me/signature-links', requireRoles(...ROLE_GROUPS.userSelf), userSignatureController.createSignatureLink)
}
router.get('/engineers', requireRoles(...ROLE_GROUPS.engineerDirectory), controller.listEngineers)
router.get('/salespeople', requireRoles(...ROLE_GROUPS.salesDirectory), controller.listSalespeople)
router.get('/assistants', requireRoles(...ROLE_GROUPS.userSelf), controller.listAssistants)
router.post('/', requirePermission('user.create'), controller.create)
router.put('/:id', requirePermission('user.edit'), controller.update)
router.delete('/:id', requirePermission('user.delete'), controller.remove)
router.post('/:id/restore', requirePermission('user.edit'), controller.restore)

module.exports = router
