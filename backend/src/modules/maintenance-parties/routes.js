const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requirePermission('maintenance-party.view', 'device.create', 'device.edit'), controller.list)
router.post('/', requirePermission('maintenance-party.create'), controller.create)
router.get('/:id', requirePermission('maintenance-party.view'), controller.detail)
router.put('/:id', requirePermission('maintenance-party.edit'), controller.update)
router.delete('/:id', requirePermission('maintenance-party.delete'), controller.remove)

module.exports = router
