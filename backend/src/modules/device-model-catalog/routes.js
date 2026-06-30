const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/suggestions', controller.suggest)
router.post('/entries', requirePermission('device.model.catalog'), controller.upsertEntry)

module.exports = router
