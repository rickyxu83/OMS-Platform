const express = require('express')
const controller = require('./controller')
const { requirePermission } = require('../../middleware/auth')

const router = express.Router()

router.get('/employees', requirePermission('attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.listEmployees)
router.get('/delegates', requirePermission('attendance.apply'), controller.listDelegates)
router.get('/me', requirePermission('attendance.apply', 'attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.me)
router.get('/supervisor-role-rules', requirePermission('attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.listSupervisorRoleRules)
router.put('/supervisor-role-rules', requirePermission('attendance.manage'), controller.updateSupervisorRoleRules)
router.get('/legal-holidays', requirePermission('attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.listLegalHolidays)
router.put('/legal-holidays/:date', requirePermission('attendance.manage'), controller.upsertLegalHoliday)
router.delete('/legal-holidays/:date', requirePermission('attendance.manage'), controller.deleteLegalHoliday)
router.put('/employees/:id', requirePermission('attendance.manage'), controller.updateEmployee)
router.post('/employees/:id/adjust-balance', requirePermission('attendance.manage'), controller.adjustBalance)

router.get('/requests', requirePermission('attendance.apply', 'attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.listRequests)
router.post('/requests', requirePermission('attendance.apply'), controller.createRequest)
router.post('/requests/:id/submit', requirePermission('attendance.apply'), controller.submitRequest)
router.get('/overtime/service-orders', requirePermission('attendance.apply'), controller.listOvertimeServiceOrders)
router.post('/overtime/service-orders/:id/apply', requirePermission('attendance.apply'), controller.createServiceOrderOvertimeRequest)
router.post('/requests/:id/approve-delegate', requirePermission('attendance.apply'), controller.approveDelegate)
router.post('/requests/:id/approve-supervisor', requirePermission('attendance.apply', 'attendance.view'), controller.approveSupervisor)
router.post('/requests/:id/approve-hr', requirePermission('attendance.hr.approve'), controller.approveHr)
router.post('/requests/:id/approve-vp', requirePermission('attendance.vp.approve'), controller.approveVp)
router.post('/requests/:id/approve-admin', requirePermission('attendance.admin.approve'), controller.approveAdmin)
router.post('/requests/:id/reject', requirePermission('attendance.apply', 'attendance.view', 'attendance.manage', 'attendance.admin.approve'), controller.rejectRequest)
router.post('/requests/:id/withdraw', requirePermission('attendance.apply'), controller.withdrawRequest)
router.post('/requests/:id/void', requirePermission('attendance.admin.approve'), controller.voidRequest)

router.get('/reports/monthly', requirePermission('attendance.view', 'attendance.admin.approve', 'attendance.manage'), controller.monthlyReport)

module.exports = router
