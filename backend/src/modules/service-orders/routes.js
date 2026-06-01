const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')

const router = express.Router()

const opsRoles = ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor']
const viewRoles = [...opsRoles, 'sales', 'sales_supervisor']
router.get('/stats/overview', requireRoles(...viewRoles), controller.statsOverview)
router.get('/timesheet/monthly', requireRoles('engineer', ...viewRoles), controller.timesheetMonthly)
router.post('/timesheet/manual-entries', requireRoles('engineer'), controller.createTimesheetManualEntry)
router.delete('/timesheet/manual-entries/:id', requireRoles('engineer'), controller.deleteTimesheetManualEntry)
router.get('/customer-signature/latest', requireRoles('engineer'), controller.latestCustomerSignature)
router.get('/draft/self-report', requireRoles('engineer'), controller.getSelfReportDraft)
router.put('/draft/self-report', requireRoles('engineer'), controller.saveSelfReportDraft)
router.delete('/draft/self-report', requireRoles('engineer'), controller.deleteSelfReportDraft)
router.post('/bulk-delete', requireRoles('admin'), controller.bulkDelete)
router.get('/', requireRoles('engineer', ...viewRoles), controller.list)
router.post('/', requireRoles(...opsRoles), controller.create)
router.post('/self-report', requireRoles('engineer'), controller.createSelfReport)
router.get('/:id', controller.detail)
router.post('/:id/cancel', requireRoles('engineer'), controller.cancelByEngineer)
router.put('/:id/self-report', requireRoles('engineer'), controller.updateSelfReport)
router.put('/:id', requireRoles(...opsRoles), controller.update)

module.exports = router
