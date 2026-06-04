const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

router.get('/suggestions', controller.suggest)
router.post('/entries', requireRoles('admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor'), controller.upsertEntry)

module.exports = router
