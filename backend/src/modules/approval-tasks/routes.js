const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()
router.get('/', requireRoles(...ROLE_GROUPS.userSelf), controller.list)

module.exports = router
