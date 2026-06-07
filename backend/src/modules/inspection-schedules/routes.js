const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

const opsRoles = ROLE_GROUPS.inspectionScheduleOps
const viewRoles = ROLE_GROUPS.inspectionScheduleView

router.get('/', requireRoles(...viewRoles), controller.list)
router.post('/bulk', requireRoles(...opsRoles), controller.createBulk)
router.post('/', requireRoles(...opsRoles), controller.create)
router.post('/generate-due', requireRoles(...opsRoles), controller.generateDue)
router.get('/:id', requireRoles(...viewRoles), controller.detail)
router.put('/:id', requireRoles(...opsRoles), controller.update)
router.delete('/:id', requireRoles(...opsRoles), controller.remove)

module.exports = router
