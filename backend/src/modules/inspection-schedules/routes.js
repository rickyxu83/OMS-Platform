const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const opsRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor']
const viewRoles = [...opsRoles, 'sales', 'sales_supervisor']

router.get('/', requireRoles(...viewRoles), controller.list)
router.post('/', requireRoles(...opsRoles), controller.create)
router.post('/generate-due', requireRoles(...opsRoles), controller.generateDue)
router.get('/:id', requireRoles(...viewRoles), controller.detail)
router.put('/:id', requireRoles(...opsRoles), controller.update)
router.delete('/:id', requireRoles(...opsRoles), controller.remove)

module.exports = router
