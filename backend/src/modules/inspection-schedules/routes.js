const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requirePermission('inspection.view'), controller.list)
router.post('/bulk', requirePermission('inspection.create'), controller.createBulk)
router.post('/', requirePermission('inspection.create'), controller.create)
router.post('/generate-due', requirePermission('inspection.generate'), controller.generateDue)
router.get('/:id', requirePermission('inspection.view'), controller.detail)
router.put('/:id', requirePermission('inspection.edit'), controller.update)
router.delete('/:id', requirePermission('inspection.delete'), controller.remove)

module.exports = router
