const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const maintenancePartyEditRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor']

router.get('/', controller.list)
router.post('/', requireRoles(...maintenancePartyEditRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...maintenancePartyEditRoles), controller.update)
router.delete('/:id', requireRoles(...maintenancePartyEditRoles), controller.remove)

module.exports = router
