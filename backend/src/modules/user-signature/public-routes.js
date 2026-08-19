const express = require('express')
const controller = require('./controller')
const { customerSignatureLimiter } = require('../../middleware/rate-limit')

const router = express.Router()

router.get('/:token', customerSignatureLimiter, controller.publicSignatureRequest)
router.post('/:token', customerSignatureLimiter, controller.submitSignatureRequest)

module.exports = router
