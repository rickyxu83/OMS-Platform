const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requirePermission('customer.view'), controller.list)
router.post('/', requirePermission('customer.create'), controller.create)
router.get('/:id/delete-preview', requirePermission('customer.delete'), controller.deletePreview)
router.get('/:id', requirePermission('customer.view'), controller.detail)
router.put('/:id', requirePermission('customer.edit'), controller.update)
router.delete('/:id', requirePermission('customer.delete'), controller.remove)
router.post('/:id/merge', requirePermission('customer.merge'), controller.merge)
router.get('/:id/devices', requirePermission('customer.view', 'device.view'), controller.devices)

module.exports = router
