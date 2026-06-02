const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()
router.get('/suggest', requireRoles('engineer', 'admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'sales'), controller.suggest)
module.exports = router
