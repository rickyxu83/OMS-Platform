const { listApprovalTasks } = require('../mr/workflow')

async function list(req, res) {
  await require('../mr/controller').ensureTables()
  const view = ['pending', 'initiated', 'completed'].includes(req.query.view) ? req.query.view : 'pending'
  // 助理主管：待办/已办聚合其管辖助理的任务
  const extraAssigneeIds = req.user.role === 'assistant_supervisor'
    ? await require('../mr/controller').assistantIdsFor(req.user)
    : []
  res.json(await listApprovalTasks(req.user.id, view, extraAssigneeIds))
}

module.exports = { list }
