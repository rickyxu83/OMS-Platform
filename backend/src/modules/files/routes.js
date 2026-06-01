const express = require('express')
const controller = require('./controller')

const router = express.Router()

router.post('/', controller.uploadMiddleware, controller.upload)
router.get('/:id', controller.download)
router.delete('/:id', controller.remove)

module.exports = router

