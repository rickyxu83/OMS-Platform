const { listApprovalTasks } = require('../mr/workflow')

async function list(req, res) {
  await require('../mr/controller').ensureTables()
  const view = ['pending', 'initiated', 'completed'].includes(req.query.view) ? req.query.view : 'pending'
  res.json(await listApprovalTasks(req.user.id, view))
}

module.exports = { list }
