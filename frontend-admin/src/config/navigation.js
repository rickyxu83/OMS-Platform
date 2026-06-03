export const ADMIN_ACCESS_ROLES = [
  'admin',
  'assistant',
  'dispatcher',
  'supervisor',
  'engineering_supervisor',
  'sales_supervisor',
  'sales',
]

export const ROUTE_ACCESS_ROLES = {
  users: ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor'],
  'audit-logs': ['admin', 'supervisor', 'engineering_supervisor'],
}

export const NAVIGATION_GROUPS = [
  {
    name: 'workspace',
    label: '工作台',
    icon: 'dashboard',
    children: [
      { to: '/', label: '运营总览', name: 'dashboard', aliases: ['工作台', '首页', '总览'] },
    ],
  },
  {
    name: 'service',
    label: '工单与巡检',
    icon: 'service',
    children: [
      { to: '/service-orders', label: '工单处理', name: 'service-orders', aliases: ['业务管理', '服务记录'] },
      { to: '/inspection-schedules', label: '巡检计划', name: 'inspection-schedules', aliases: ['巡检', '计划'] },
    ],
  },
  {
    name: 'assets',
    label: '客户与资产',
    icon: 'customer',
    children: [
      { to: '/customers', label: '客户档案', name: 'customers', aliases: ['客户资产', '客户'] },
      { to: '/devices', label: '设备资产', name: 'devices', aliases: ['设备管理', '设备'] },
      { to: '/maintenance-parties', label: '维保方目录', name: 'maintenance-parties', aliases: ['维保方管理', '维保方'] },
    ],
  },
  {
    name: 'reports',
    label: '报表中心',
    icon: 'report',
    children: [
      { to: '/timesheets', label: '月报导出', name: 'timesheets', aliases: ['月报', '报表', '导出'] },
    ],
  },
  {
    name: 'system',
    label: '系统与权限',
    icon: 'member',
    children: [
      { to: '/users', label: '成员与角色', name: 'users', aliases: ['工程师管理', '成员管理', '用户管理'] },
      { to: '/audit-logs', label: '操作审计', name: 'audit-logs', aliases: ['审计', '日志'] },
    ],
  },
]

export function canAccessRoute(routeName, role) {
  const allowedRoles = ROUTE_ACCESS_ROLES[routeName]
  return !allowedRoles || allowedRoles.includes(role)
}

export function getVisibleNavigation(role) {
  return NAVIGATION_GROUPS
    .map(group => ({
      ...group,
      children: group.children.filter(item => canAccessRoute(item.name, role)),
    }))
    .filter(group => group.children.length > 0)
}

export function getAllNavigationItems(groups = NAVIGATION_GROUPS) {
  return groups.flatMap(group => group.children.map(item => ({ ...item, group })))
}

export function findNavigationItem(routeName, groups = NAVIGATION_GROUPS) {
  return getAllNavigationItems(groups).find(item => item.name === routeName) || null
}

export function findNavigationGroup(routeName, groups = NAVIGATION_GROUPS) {
  return groups.find(group => group.children.some(item => item.name === routeName)) || null
}
