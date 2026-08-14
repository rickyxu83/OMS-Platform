const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requirePermission('device.view'), controller.list)
router.post('/', requirePermission('device.create'), controller.create)
router.post('/import', requirePermission('device.create'), controller.uploadImportMiddleware, controller.importDevices)
router.post('/maintenance-import/preview', requirePermission('device.edit'), controller.uploadMaintenanceImportMiddleware, controller.previewMaintenanceImport)
router.post('/maintenance-import/apply', requirePermission('device.edit'), controller.uploadMaintenanceImportMiddleware, controller.applyMaintenanceImport)
router.post('/model-normalizations/preview', requirePermission('device.edit'), controller.previewModelNormalizations)
router.post('/model-normalizations/apply', requirePermission('device.edit'), controller.applyModelNormalizations)
router.get('/model-normalization-jobs/:id', requirePermission('device.view'), controller.modelNormalizationJob)
router.put('/batch', requirePermission('device.edit'), controller.batchUpdate)
router.get('/:id', requirePermission('device.view'), controller.detail)
router.get('/:id/similar', requirePermission('device.view'), controller.similarDevices)
router.put('/:id', requirePermission('device.edit'), controller.update)
router.delete('/:id', requirePermission('device.delete'), controller.remove)

module.exports = router
