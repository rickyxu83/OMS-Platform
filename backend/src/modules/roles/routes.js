const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/permissions', requirePermission('user.view', 'permission.manage'), controller.listPermissions)
router.put('/permissions', requirePermission('permission.manage'), controller.updatePermissions)

module.exports = router
