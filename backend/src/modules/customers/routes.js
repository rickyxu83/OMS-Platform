const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const customerWriteRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'sales_supervisor', 'sales', 'engineer', 'engineering_supervisor']
const customerMergeRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'sales_supervisor', 'sales']

router.get('/', controller.list)
router.post('/', requireRoles(...customerWriteRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...customerWriteRoles), controller.update)
router.post('/:id/merge', requireRoles(...customerMergeRoles), controller.merge)
router.get('/:id/devices', controller.devices)

module.exports = router
