const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/constants', requirePermission('mr.view'), controller.getConstants)
router.get('/', requirePermission('mr.view'), controller.list)
router.post('/', requirePermission('mr.create'), controller.create)
router.get('/:id', requirePermission('mr.view'), controller.detail)
router.put('/:id', requirePermission('mr.edit'), controller.update)
router.post('/:id/submit', requirePermission('mr.edit'), controller.submit)
router.post('/:id/approve', requirePermission('mr.approve'), controller.approve)
router.post('/:id/reject', requirePermission('mr.approve'), controller.reject)
router.post('/:id/void', requirePermission('mr.void'), controller.voidOrder)
router.post('/:id/import', requirePermission('mr.edit'), controller.quotationUpload, controller.importQuotation)
router.get('/:id/quotation', requirePermission('mr.view'), controller.downloadQuotation)
router.delete('/:id', requirePermission('mr.delete'), controller.remove)

module.exports = router
