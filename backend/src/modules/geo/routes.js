const express = require('express')
const controller = require('./controller')

const router = express.Router()

router.get('/companies', controller.searchCompanies)

module.exports = router

