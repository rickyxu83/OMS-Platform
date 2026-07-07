const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/employees', requirePermission('attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.listEmployees)
router.put('/employees/:id', requirePermission('attendance.manage'), controller.updateEmployee)
router.post('/employees/:id/adjust-balance', requirePermission('attendance.manage'), controller.adjustBalance)

router.get('/requests', requirePermission('attendance.apply', 'attendance.view', 'attendance.admin.approve'), controller.listRequests)
router.post('/requests', requirePermission('attendance.apply'), controller.createRequest)
router.post('/requests/:id/approve-supervisor', requirePermission('attendance.apply', 'attendance.view'), controller.approveSupervisor)
router.post('/requests/:id/approve-admin', requirePermission('attendance.admin.approve'), controller.approveAdmin)
router.post('/requests/:id/reject', requirePermission('attendance.apply', 'attendance.view', 'attendance.admin.approve'), controller.rejectRequest)
router.post('/requests/:id/withdraw', requirePermission('attendance.apply'), controller.withdrawRequest)
router.post('/requests/:id/void', requirePermission('attendance.admin.approve'), controller.voidRequest)

router.get('/reports/monthly', requirePermission('attendance.view', 'attendance.admin.approve', 'attendance.manage'), controller.monthlyReport)

module.exports = router
