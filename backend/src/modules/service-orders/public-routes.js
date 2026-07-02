const express = require('express')
const controller = require('./controller')
const { customerSignatureLimiter } = require('../../middleware/rate-limit')

const router = express.Router()

router.get('/:token', customerSignatureLimiter, controller.publicCustomerSignatureRequest)
router.post('/:token', customerSignatureLimiter, controller.submitCustomerSignatureRequest)

module.exports = router
