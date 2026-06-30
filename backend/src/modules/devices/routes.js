const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requirePermission('device.view'), controller.list)
router.post('/', requirePermission('device.create'), controller.create)
router.post('/import', requirePermission('device.create'), controller.uploadImportMiddleware, controller.importDevices)
router.get('/:id', requirePermission('device.view'), controller.detail)
router.put('/batch', requirePermission('device.edit'), controller.batchUpdate)
router.put('/:id', requirePermission('device.edit'), controller.update)
router.delete('/:id', requirePermission('device.delete'), controller.remove)

module.exports = router
