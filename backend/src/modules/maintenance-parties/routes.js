const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

const maintenancePartyWriteRoles = ROLE_GROUPS.maintenancePartyWrite
const maintenancePartyDeleteRoles = ROLE_GROUPS.maintenancePartyDelete

router.get('/', controller.list)
router.post('/', requireRoles(...maintenancePartyWriteRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...maintenancePartyWriteRoles), controller.update)
router.delete('/:id', requireRoles(...maintenancePartyDeleteRoles), controller.remove)

module.exports = router
