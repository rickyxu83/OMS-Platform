const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const deviceWriteRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'engineer']
const deviceDeleteRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor']

router.get('/', controller.list)
router.post('/', requireRoles(...deviceWriteRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...deviceWriteRoles), controller.update)
router.delete('/:id', requireRoles(...deviceDeleteRoles), controller.remove)

module.exports = router
