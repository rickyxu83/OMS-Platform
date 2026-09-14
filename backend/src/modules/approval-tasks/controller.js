const { listApprovalTasks, approvalTaskCounts } = require('../mr/workflow')
const attendanceController = require('../attendance/controller')
const duty = require('../attendance/duty')

// 待办中心聚合入口：MR 签核/采购任务 + 考勤审批 + 值班津贴月度确认（spec 013）。
// 考勤审批存于 attendance_request_approvals、值班津贴存于 attendance_duty_monthly_batches
// （均不走 approval_tasks 表），各自映射为同构任务结构后在此合并；
// pendingCount 为三方之和，考勤侧口径与 /attendance/requests/pending-count（导航徽标）一致。
async function list(req, res) {
  await require('../mr/controller').ensureTables()
  const view = ['pending', 'initiated', 'completed'].includes(req.query.view) ? req.query.view : 'pending'
  // 助理主管：待办/已办聚合其管辖助理的任务
  const extraAssigneeIds = req.user.role === 'assistant_supervisor'
    ? await require('../mr/controller').assistantIdsFor(req.user)
    : []
  const [mr, attendanceItems, dutyItems, attendancePendingCount, dutyPendingCount, mrCounts, attendanceCounts, dutyCounts] = await Promise.all([
    listApprovalTasks(req.user.id, view, extraAssigneeIds),
    attendanceController.listApprovalTaskItems(req.user, view),
    duty.listDutyApprovalTaskItems(req.user, view),
    attendanceController.pendingApprovalCountValue(req.user),
    duty.pendingDutyApprovalCountValue(req.user),
    approvalTaskCounts(req.user.id, extraAssigneeIds),
    attendanceController.approvalTaskCountsValue(req.user),
    duty.dutyApprovalTaskCountsValue(req.user),
  ])
  const items = [...(mr.items || []), ...attendanceItems, ...dutyItems].sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1
    const bPending = b.status === 'pending' ? 0 : 1
    if (aPending !== bPending) return aPending - bPending
    return String(b.completedAt || b.createdAt || '').localeCompare(String(a.completedAt || a.createdAt || ''))
  })
  res.json({
    items,
    pendingCount: Number(mr.pendingCount || 0) + attendancePendingCount + dutyPendingCount,
    // 三视图计数（MR + 考勤 + 值班津贴合并），供页签徽标使用
    counts: {
      pending: mrCounts.pending + attendanceCounts.pending + dutyCounts.pending,
      initiated: mrCounts.initiated + attendanceCounts.initiated + dutyCounts.initiated,
      completed: mrCounts.completed + attendanceCounts.completed + dutyCounts.completed,
    },
  })
}

module.exports = { list }
