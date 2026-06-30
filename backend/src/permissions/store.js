const { query, transaction } = require('../config/db')
const {
  ALL_ROLES,
  ROLE_LABELS,
  PERMISSION_ENTRIES,
  PERMISSION_KEYS,
  getDefaultPermissionMatrix,
} = require('./catalog')

const roleSet = new Set(ALL_ROLES)
const permissionSet = new Set(PERMISSION_KEYS)
const CACHE_TTL_MS = 30 * 1000
const BUSINESS_ASSET_PERMISSIONS = Object.freeze([
  'device.view',
  'device.create',
  'device.edit',
  'maintenance-party.view',
  'maintenance-party.create',
  'maintenance-party.edit',
  'maintenance-party.delete',
])
const ROLE_PERMISSION_BASELINES = Object.freeze({
  sales: BUSINESS_ASSET_PERMISSIONS,
  sales_supervisor: BUSINESS_ASSET_PERMISSIONS,
})
const ADMIN_SUPERUSER_EXCLUDED_PERMISSIONS = Object.freeze([
  'workspace.engineer',
])

let tableReady = false
let cache = null

async function ensureRolePermissionsTable() {
  if (tableReady) return
  await query(
    `CREATE TABLE IF NOT EXISTS role_permissions (
      role_key VARCHAR(64) NOT NULL,
      permission_key VARCHAR(128) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role_key, permission_key),
      KEY idx_role_permissions_permission_key (permission_key),
      KEY idx_role_permissions_updated_by (updated_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  tableReady = true
}

function cloneDefaultMatrix() {
  const defaults = getDefaultPermissionMatrix()
  return Object.fromEntries(
    Object.entries(defaults).map(([role, permissions]) => [role, { ...permissions }]),
  )
}

function forceAdminSuperuser(matrix) {
  if (!matrix.admin) matrix.admin = {}
  for (const key of PERMISSION_KEYS) {
    if (ADMIN_SUPERUSER_EXCLUDED_PERMISSIONS.includes(key)) continue
    matrix.admin[key] = true
  }
  for (const key of ADMIN_SUPERUSER_EXCLUDED_PERMISSIONS) {
    if (permissionSet.has(key)) matrix.admin[key] = false
  }
  return matrix
}

function applyRolePermissionBaselines(matrix) {
  for (const [role, permissions] of Object.entries(ROLE_PERMISSION_BASELINES)) {
    if (!roleSet.has(role)) continue
    if (!matrix[role]) matrix[role] = {}
    for (const permission of permissions) {
      if (permissionSet.has(permission)) {
        matrix[role][permission] = true
      }
    }
  }
  return forceAdminSuperuser(matrix)
}

function applyOverrides(matrix, rows = []) {
  for (const row of rows) {
    const role = row.role_key
    const permission = row.permission_key
    if (!roleSet.has(role) || !permissionSet.has(permission)) continue
    if (!matrix[role]) matrix[role] = {}
    matrix[role][permission] = Boolean(row.enabled)
  }
  return applyRolePermissionBaselines(matrix)
}

function cacheIsFresh() {
  return cache && Date.now() - cache.loadedAt < CACHE_TTL_MS
}

function invalidatePermissionCache() {
  cache = null
}

async function getEffectivePermissionMatrix() {
  if (cacheIsFresh()) return cache.matrix
  await ensureRolePermissionsTable()
  const rows = await query(
    `SELECT role_key, permission_key, enabled
     FROM role_permissions`,
  )
  const matrix = applyOverrides(cloneDefaultMatrix(), rows)
  cache = { loadedAt: Date.now(), matrix }
  return matrix
}

function permissionsForRole(matrix, role) {
  const roleMatrix = matrix[role] || {}
  return PERMISSION_ENTRIES
    .filter(([key]) => Boolean(roleMatrix[key]))
    .map(([key, label]) => ({ key, label }))
}

function matrixPayload(matrix) {
  const roles = ALL_ROLES.map((key) => ({ key, label: ROLE_LABELS[key] }))
  const permissions = PERMISSION_ENTRIES.map(([key, label]) => ({ key, label }))
  const rolePermissions = {}

  for (const role of ALL_ROLES) {
    rolePermissions[role] = {
      label: ROLE_LABELS[role],
      permissions: permissionsForRole(matrix, role),
    }
  }

  return {
    roles,
    permissions,
    matrix,
    rolePermissions,
  }
}

async function getRolePermissionsPayload() {
  return matrixPayload(await getEffectivePermissionMatrix())
}

async function hasPermission(role, permissionKey) {
  if (!roleSet.has(role) || !permissionSet.has(permissionKey)) return false
  const matrix = await getEffectivePermissionMatrix()
  return Boolean(matrix[role]?.[permissionKey])
}

async function hasAnyPermission(role, permissionKeys = []) {
  const keys = permissionKeys.filter((key) => permissionSet.has(key))
  if (!roleSet.has(role) || !keys.length) return false
  const matrix = await getEffectivePermissionMatrix()
  return keys.some((key) => Boolean(matrix[role]?.[key]))
}

async function listPermissionsForRole(role) {
  if (!roleSet.has(role)) return []
  const matrix = await getEffectivePermissionMatrix()
  return permissionsForRole(matrix, role)
}

function normalizeIncomingMatrix(input = {}) {
  const source = input.matrix || input.permissionsByRole || input.rolePermissions || input
  const next = cloneDefaultMatrix()

  for (const role of ALL_ROLES) {
    const rawRolePermissions = source[role]
    if (!rawRolePermissions) continue

    if (Array.isArray(rawRolePermissions)) {
      const enabled = new Set(rawRolePermissions)
      for (const key of PERMISSION_KEYS) {
        next[role][key] = enabled.has(key)
      }
      continue
    }

    if (Array.isArray(rawRolePermissions.permissions)) {
      const enabled = new Set(rawRolePermissions.permissions.map((permission) => (
        typeof permission === 'string' ? permission : permission?.key
      )))
      for (const key of PERMISSION_KEYS) {
        next[role][key] = enabled.has(key)
      }
      continue
    }

    if (typeof rawRolePermissions === 'object') {
      for (const key of PERMISSION_KEYS) {
        if (Object.prototype.hasOwnProperty.call(rawRolePermissions, key)) {
          next[role][key] = Boolean(rawRolePermissions[key])
        }
      }
    }
  }

  return applyRolePermissionBaselines(next)
}

async function saveRolePermissions(input = {}, updatedBy = null) {
  const next = normalizeIncomingMatrix(input)

  await ensureRolePermissionsTable()
  await transaction(async (connection) => {
    await connection.execute(
      `DELETE FROM role_permissions
       WHERE role_key IN (${ALL_ROLES.map((_, index) => `:role${index}`).join(',')})
         AND permission_key IN (${PERMISSION_KEYS.map((_, index) => `:permission${index}`).join(',')})`,
      Object.fromEntries([
        ...ALL_ROLES.map((role, index) => [`role${index}`, role]),
        ...PERMISSION_KEYS.map((permission, index) => [`permission${index}`, permission]),
      ]),
    )

    for (const role of ALL_ROLES) {
      for (const permission of PERMISSION_KEYS) {
        await connection.execute(
          `INSERT INTO role_permissions (role_key, permission_key, enabled, updated_by)
           VALUES (:role, :permission, :enabled, :updatedBy)`,
          {
            role,
            permission,
            enabled: next[role]?.[permission] ? 1 : 0,
            updatedBy: updatedBy || null,
          },
        )
      }
    }
  })

  invalidatePermissionCache()
  return matrixPayload(next)
}

async function getAvailableWorkspacesForRole(role) {
  const matrix = await getEffectivePermissionMatrix()
  const roleMatrix = matrix[role] || {}
  const workspaces = []
  if (roleMatrix['workspace.admin']) {
    workspaces.push({ key: 'admin', label: '管理工作台', home: '/dashboard' })
  }
  if (roleMatrix['workspace.engineer']) {
    workspaces.push({ key: 'engineer', label: '工程师工作台', home: '/' })
  }
  return workspaces
}

async function getDefaultWorkspaceForRole(role) {
  const workspaces = await getAvailableWorkspacesForRole(role)
  if (role === 'engineering_supervisor' && workspaces.some((workspace) => workspace.key === 'admin')) {
    return 'admin'
  }
  return workspaces[0]?.key || ''
}

module.exports = {
  ensureRolePermissionsTable,
  getRolePermissionsPayload,
  hasPermission,
  hasAnyPermission,
  listPermissionsForRole,
  saveRolePermissions,
  invalidatePermissionCache,
  getAvailableWorkspacesForRole,
  getDefaultWorkspaceForRole,
}
