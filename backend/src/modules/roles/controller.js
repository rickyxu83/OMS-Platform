const {
  getRolePermissionsPayload,
  saveRolePermissions,
} = require('../../permissions/store')

async function listPermissions(_req, res) {
  res.json(await getRolePermissionsPayload())
}

async function updatePermissions(req, res) {
  const payload = await saveRolePermissions(req.body || {}, req.user?.id || null)
  res.json(payload)
}

module.exports = {
  listPermissions,
  updatePermissions,
}
