const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const deviceEditRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor']

router.get('/', controller.list)
router.post('/', requireRoles(...deviceEditRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...deviceEditRoles), controller.update)
router.delete('/:id', requireRoles(...deviceEditRoles), controller.remove)

module.exports = router
