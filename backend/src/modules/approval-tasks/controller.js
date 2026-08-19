const { listApprovalTasks } = require('../mr/workflow')
const attendanceController = require('../attendance/controller')

// 待办中心聚合入口：MR 签核/采购任务 + 考勤审批。
// 考勤审批存于 attendance_request_approvals（不走 approval_tasks 表），
// 由 attendance 模块映射为同构任务结构后在此合并；pendingCount 为两边之和，
// 考勤侧口径与 /attendance/requests/pending-count（导航徽标）一致。
async function list(req, res) {
  await require('../mr/controller').ensureTables()
  const view = ['pending', 'initiated', 'completed'].includes(req.query.view) ? req.query.view : 'pending'
  // 助理主管：待办/已办聚合其管辖助理的任务
  const extraAssigneeIds = req.user.role === 'assistant_supervisor'
    ? await require('../mr/controller').assistantIdsFor(req.user)
    : []
  const [mr, attendanceItems, attendancePendingCount] = await Promise.all([
    listApprovalTasks(req.user.id, view, extraAssigneeIds),
    attendanceController.listApprovalTaskItems(req.user, view),
    attendanceController.pendingApprovalCountValue(req.user),
  ])
  const items = [...(mr.items || []), ...attendanceItems].sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1
    const bPending = b.status === 'pending' ? 0 : 1
    if (aPending !== bPending) return aPending - bPending
    return String(b.completedAt || b.createdAt || '').localeCompare(String(a.completedAt || a.createdAt || ''))
  })
  res.json({
    items,
    pendingCount: Number(mr.pendingCount || 0) + attendancePendingCount,
  })
}

module.exports = { list }
