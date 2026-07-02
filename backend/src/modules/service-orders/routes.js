const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')
const { aiSummaryLimiter } = require('../../middleware/rate-limit')

const router = express.Router()

function limitWhenWorkSummaryRequested(req, res, next) {
  if (String(req.query.includeWorkSummary || '') === '1') {
    aiSummaryLimiter(req, res, next)
    return
  }
  next()
}

router.get('/stats/overview', requirePermission('order.engineer.own', 'order.view'), controller.statsOverview)
router.get('/timesheet/monthly', requirePermission('order.engineer.own', 'timesheet.view'), limitWhenWorkSummaryRequested, controller.timesheetMonthly)
router.post('/timesheet/manual-entries', requirePermission('order.engineer.own'), controller.createTimesheetManualEntry)
router.delete('/timesheet/manual-entries/:id', requirePermission('order.engineer.own'), controller.deleteTimesheetManualEntry)
router.get('/customer-signature/latest', requirePermission('order.engineer.own'), controller.latestCustomerSignature)
router.get('/self-report/ai-draft/status', requirePermission('order.engineer.own'), controller.aiSelfReportDraftStatus)
router.get('/draft/self-report', requirePermission('order.engineer.own'), controller.getSelfReportDraft)
router.put('/draft/self-report', requirePermission('order.engineer.own'), controller.saveSelfReportDraft)
router.delete('/draft/self-report', requirePermission('order.engineer.own'), controller.deleteSelfReportDraft)
router.post('/bulk-delete', requirePermission('order.bulk-delete'), controller.bulkDelete)
router.get('/', requirePermission('order.engineer.own', 'order.view'), controller.list)
router.post('/', requirePermission('order.create'), controller.create)
router.post('/:id/confirm-inspection', requirePermission('order.assign'), controller.confirmInspectionOrder)
router.post('/:id/assign', requirePermission('order.assign'), controller.assign)
router.post('/:id/transition', requirePermission('order.edit', 'order.approve'), controller.transition)
router.post('/self-report/ai-draft', requirePermission('order.engineer.own'), aiSummaryLimiter, controller.aiSelfReportDraft)
router.post('/self-report', requirePermission('order.engineer.own'), controller.createSelfReport)
router.get('/:id/export-pdf', requirePermission('order.engineer.own', 'order.view'), controller.exportPdf)
router.get('/export-pdf-batch', requirePermission('order.view'), controller.exportPdfBatch)
router.get('/:id', requirePermission('order.engineer.own', 'order.view'), controller.detail)
router.post('/:id/cancel', requirePermission('order.engineer.own'), controller.cancelByEngineer)
router.post('/:id/customer-signature-requests', requirePermission('order.engineer.own', 'order.view'), controller.createCustomerSignatureRequest)
router.put('/:id/self-report', requirePermission('order.engineer.own'), controller.updateSelfReport)
router.put('/:id', requirePermission('order.edit'), controller.update)
router.delete('/:id', requirePermission('order.engineer.own', 'order.delete'), controller.remove)

module.exports = router
