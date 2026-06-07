const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

const deviceWriteRoles = ROLE_GROUPS.deviceWrite
const deviceDeleteRoles = ROLE_GROUPS.deviceDelete

router.get('/', controller.list)
router.post('/', requireRoles(...deviceWriteRoles), controller.create)
router.get('/:id', controller.detail)
router.put('/:id', requireRoles(...deviceWriteRoles), controller.update)
router.delete('/:id', requireRoles(...deviceDeleteRoles), controller.remove)

module.exports = router
