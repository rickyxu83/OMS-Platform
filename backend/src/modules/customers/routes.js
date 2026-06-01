const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const customerEditRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'sales_supervisor', 'sales']

router.get('/', controller.list)
router.post('/', requireRoles(...customerEditRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...customerEditRoles), controller.update)
router.post('/:id/merge', requireRoles(...customerEditRoles), controller.merge)
router.get('/:id/devices', controller.devices)

module.exports = router
