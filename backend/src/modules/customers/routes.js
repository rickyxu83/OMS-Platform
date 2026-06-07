const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

const customerWriteRoles = ROLE_GROUPS.customerWrite
const customerDeleteRoles = ROLE_GROUPS.customerDelete
const customerMergeRoles = ROLE_GROUPS.customerMerge

router.get('/', controller.list)
router.post('/', requireRoles(...customerWriteRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...customerWriteRoles), controller.update)
router.delete('/:id', requireRoles(...customerDeleteRoles), controller.remove)
router.post('/:id/merge', requireRoles(...customerMergeRoles), controller.merge)
router.get('/:id/devices', controller.devices)

module.exports = router
