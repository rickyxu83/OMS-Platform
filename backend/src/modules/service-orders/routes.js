const express = require('express')
const controller = require('./controller')
const { requireRoles } = require('../../middleware/auth')
const { ROLE_GROUPS } = require('../../permissions/roles')

const router = express.Router()

const opsRoles = ROLE_GROUPS.serviceOrderOps
const viewRoles = ROLE_GROUPS.serviceOrderView
const engineerRoles = ROLE_GROUPS.serviceOrderEngineer
router.get('/stats/overview', requireRoles(...viewRoles), controller.statsOverview)
router.get('/timesheet/monthly', requireRoles(...engineerRoles, ...viewRoles), controller.timesheetMonthly)
router.post('/timesheet/manual-entries', requireRoles(...engineerRoles), controller.createTimesheetManualEntry)
router.delete('/timesheet/manual-entries/:id', requireRoles(...engineerRoles), controller.deleteTimesheetManualEntry)
router.get('/customer-signature/latest', requireRoles(...engineerRoles), controller.latestCustomerSignature)
router.get('/draft/self-report', requireRoles(...engineerRoles), controller.getSelfReportDraft)
router.put('/draft/self-report', requireRoles(...engineerRoles), controller.saveSelfReportDraft)
router.delete('/draft/self-report', requireRoles(...engineerRoles), controller.deleteSelfReportDraft)
router.post('/bulk-delete', requireRoles('admin'), controller.bulkDelete)
router.get('/', requireRoles(...engineerRoles, ...viewRoles), controller.list)
router.post('/', requireRoles(...opsRoles), controller.create)
router.post('/:id/confirm-inspection', requireRoles(...opsRoles), controller.confirmInspectionOrder)
router.post('/:id/assign', requireRoles(...opsRoles), controller.assign)
router.post('/:id/transition', requireRoles(...opsRoles), controller.transition)
router.post('/self-report', requireRoles(...engineerRoles), controller.createSelfReport)
router.get('/:id', controller.detail)
router.post('/:id/cancel', requireRoles(...engineerRoles), controller.cancelByEngineer)
router.put('/:id/self-report', requireRoles(...engineerRoles), controller.updateSelfReport)
router.put('/:id', requireRoles(...opsRoles), controller.update)

module.exports = router
