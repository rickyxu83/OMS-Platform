const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

router.get('/', requireRoles('admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor'), controller.list)
router.get('/me', requireRoles('engineer', 'admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'sales'), controller.me)
router.put('/me', requireRoles('engineer', 'admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'sales'), controller.updateMe)
router.get('/engineers', requireRoles('admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'sales', 'engineer'), controller.listEngineers)
router.post('/', requireRoles('admin'), controller.create)
router.put('/:id', requireRoles('admin'), controller.update)
router.delete('/:id', requireRoles('admin'), controller.remove)
router.post('/:id/restore', requireRoles('admin'), controller.restore)

module.exports = router
