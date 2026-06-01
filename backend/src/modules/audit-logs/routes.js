const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requireRoles('admin', 'supervisor', 'engineering_supervisor'), controller.list)

module.exports = router
