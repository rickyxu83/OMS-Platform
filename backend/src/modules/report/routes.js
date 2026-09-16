const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/datasets', requirePermission('report.use'), controller.datasets)
router.post('/chat', requirePermission('report.use'), controller.chat)
router.post('/preview', requirePermission('report.use'), controller.preview)
router.post('/export', requirePermission('report.use'), controller.exportReport)
router.get('/templates', requirePermission('report.use'), controller.listTemplates)
router.post('/templates', requirePermission('report.use'), controller.createTemplate)
router.delete('/templates/:id', requirePermission('report.use'), controller.deleteTemplate)
router.put('/templates/:id/subscription', requirePermission('report.use'), controller.upsertSubscription)
router.delete('/templates/:id/subscription', requirePermission('report.use'), controller.deleteSubscription)

module.exports = router
