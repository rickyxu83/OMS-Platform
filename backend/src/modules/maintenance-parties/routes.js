const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const maintenancePartyWriteRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'engineer']
const maintenancePartyDeleteRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor']

router.get('/', controller.list)
router.post('/', requireRoles(...maintenancePartyWriteRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...maintenancePartyWriteRoles), controller.update)
router.delete('/:id', requireRoles(...maintenancePartyDeleteRoles), controller.remove)

module.exports = router
