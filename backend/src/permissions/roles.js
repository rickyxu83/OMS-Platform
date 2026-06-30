const ADMIN_WORKSPACE_ROLES = Object.freeze([
  'admin',
  'assistant',
  'dispatcher',
  'operations_director',
  'engineering_supervisor',
  'administrative_supervisor',
  'sales_supervisor',
  'sales',
])
const ENGINEER_WORKSPACE_ROLES = Object.freeze(['engineer', 'engineering_supervisor'])
const OPERATION_ROLES = Object.freeze(['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor'])
const VIEW_ROLES = Object.freeze([...OPERATION_ROLES, 'administrative_supervisor', 'sales', 'sales_supervisor'])
const ALL_SIGNED_IN_ROLES = Object.freeze([...new Set([...ADMIN_WORKSPACE_ROLES, ...ENGINEER_WORKSPACE_ROLES])])

const ROLE_GROUPS = Object.freeze({
  adminWorkspace: ADMIN_WORKSPACE_ROLES,
  engineerWorkspace: ENGINEER_WORKSPACE_ROLES,
  allSignedIn: ALL_SIGNED_IN_ROLES,
  operations: OPERATION_ROLES,
  operationsView: VIEW_ROLES,
  serviceOrderOps: OPERATION_ROLES,
  serviceOrderView: VIEW_ROLES,
  serviceOrderEngineer: ENGINEER_WORKSPACE_ROLES,
  userManage: Object.freeze(['admin', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales_supervisor']),
  userSelf: ALL_SIGNED_IN_ROLES,
  engineerDirectory: ALL_SIGNED_IN_ROLES,
  salesDirectory: Object.freeze(['admin', 'assistant', 'dispatcher', 'operations_director', 'administrative_supervisor', 'sales_supervisor', 'sales']),
  auditLogs: Object.freeze(['admin', 'operations_director', 'engineering_supervisor']),
  settings: Object.freeze(['admin', 'operations_director', 'engineering_supervisor']),
  feedbackManage: Object.freeze(['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales_supervisor', 'sales']),
  customerWrite: Object.freeze([...OPERATION_ROLES, 'sales', 'sales_supervisor', 'engineer']),
  customerDelete: Object.freeze([...OPERATION_ROLES, 'sales', 'sales_supervisor', 'engineer']),
  customerMerge: Object.freeze(['admin', 'assistant', 'dispatcher', 'operations_director', 'sales_supervisor', 'sales']),
  deviceWrite: Object.freeze([...OPERATION_ROLES, 'sales', 'sales_supervisor', 'engineer']),
  deviceDelete: OPERATION_ROLES,
  deviceModelCatalogWrite: OPERATION_ROLES,
  inspectionScheduleOps: OPERATION_ROLES,
  inspectionScheduleView: VIEW_ROLES,
  maintenancePartyWrite: Object.freeze([...OPERATION_ROLES, 'sales', 'sales_supervisor', 'engineer']),
  maintenancePartyDelete: Object.freeze([...OPERATION_ROLES, 'sales', 'sales_supervisor']),
})

const WORKSPACES = Object.freeze({
  admin: Object.freeze({
    key: 'admin',
    label: '管理工作台',
    roles: ROLE_GROUPS.adminWorkspace,
    home: '/dashboard',
  }),
  engineer: Object.freeze({
    key: 'engineer',
    label: '工程师工作台',
    roles: ROLE_GROUPS.engineerWorkspace,
    home: '/',
  }),
})

function getAvailableWorkspaces(role) {
  return Object.values(WORKSPACES)
    .filter((workspace) => workspace.roles.includes(role))
    .map(({ key, label, home }) => ({ key, label, home }))
}

function getDefaultWorkspace(role) {
  if (role === 'engineering_supervisor') return 'admin'
  if (ROLE_GROUPS.engineerWorkspace.includes(role)) return 'engineer'
  if (ROLE_GROUPS.adminWorkspace.includes(role)) return 'admin'
  return ''
}

function canAccessWorkspace(role, workspaceKey) {
  const workspace = WORKSPACES[workspaceKey]
  return Boolean(workspace && workspace.roles.includes(role))
}

module.exports = {
  ROLE_GROUPS,
  WORKSPACES,
  getAvailableWorkspaces,
  getDefaultWorkspace,
  canAccessWorkspace,
}
