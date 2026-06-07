const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

router.get('/suggestions', controller.suggest)
router.post('/entries', requireRoles(...ROLE_GROUPS.deviceModelCatalogWrite), controller.upsertEntry)

module.exports = router
