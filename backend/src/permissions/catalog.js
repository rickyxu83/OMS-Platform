const ROLE_LABELS = Object.freeze({
  admin: '管理员',
  assistant: '助理',
  dispatcher: '调度',
  operations_director: '运营负责人',
  engineering_supervisor: '工程主管',
  administrative_supervisor: '行政主管',
  sales_supervisor: '业务主管',
  sales: '业务',
  engineer: '工程师',
})

const ALL_ROLES = Object.keys(ROLE_LABELS)
const ATTENDANCE_NON_APPLICANT_ROLES = Object.freeze([
  'admin',
  'dispatcher',
  'operations_director',
])
const attendanceNonApplicantRoleSet = new Set(ATTENDANCE_NON_APPLICANT_ROLES)
const ATTENDANCE_APPLICANT_ROLES = Object.freeze(
  ALL_ROLES.filter((role) => !attendanceNonApplicantRoleSet.has(role)),
)

const PERMISSION_ENTRIES = Object.freeze([
  ['workspace.admin', '管理工作台', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales_supervisor', 'sales', 'engineer']],
  ['workspace.engineer', '工程师工作台', []],
  ['permission.manage', '配置角色权限', ['admin']],
  ['order.view', '查看工单', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales', 'sales_supervisor']],
  ['order.create', '创建工单', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['order.edit', '编辑工单', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['order.delete', '删除工单', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['order.bulk-delete', '批量删除工单', ['admin']],
  ['order.assign', '派发工单', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['order.approve', '审批工单', ['admin', 'operations_director', 'engineering_supervisor']],
  ['order.engineer.own', '查看/处理本人工单', ['engineer', 'engineering_supervisor']],
  ['inspection.view', '查看巡检计划', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales', 'sales_supervisor']],
  ['inspection.create', '创建巡检计划', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['inspection.edit', '编辑巡检计划', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['inspection.delete', '删除巡检计划', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['inspection.generate', '生成到期巡检工单', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['customer.view', '查看客户', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['customer.create', '创建客户', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['customer.edit', '编辑客户', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['customer.delete', '删除客户', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['customer.merge', '合并客户', ['admin', 'assistant', 'dispatcher', 'operations_director', 'sales_supervisor', 'sales']],
  ['device.view', '查看设备', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['device.create', '创建设备', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['device.edit', '编辑设备', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['device.delete', '删除设备', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['device.model.catalog', '管理设备型号目录', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor']],
  ['maintenance-party.view', '查看维保厂商', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['maintenance-party.create', '创建维保厂商', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['maintenance-party.edit', '编辑维保厂商', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor', 'engineer']],
  ['maintenance-party.delete', '删除维保厂商', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales', 'sales_supervisor']],
  ['timesheet.view', '查看工时报表', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales', 'sales_supervisor']],
  ['attendance.apply', '提交考勤申请', ATTENDANCE_APPLICANT_ROLES],
  ['attendance.approve', '处理考勤审批', ALL_ROLES],
  ['attendance.view', '查看考勤数据', ['admin', 'operations_director', 'administrative_supervisor']],
  ['attendance.report.export', '导出考勤报表', ['admin', 'operations_director', 'administrative_supervisor']],
  ['attendance.manage', '维护考勤档案与余额', ['admin', 'administrative_supervisor']],
  ['attendance.admin.approve', '考勤行政终审', ['admin', 'administrative_supervisor']],
  ['attendance.hr.approve', '考勤人事审批', ['admin', 'administrative_supervisor']],
  ['attendance.vp.approve', '考勤副总审批', ['admin', 'operations_director']],
  ['attendance.duty.manage', '管理工程师值班津贴', ['admin', 'engineering_supervisor']],
  ['attendance.duty.admin.approve', '终审工程师值班津贴', ['admin', 'administrative_supervisor']],
  ['user.view', '查看用户', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales_supervisor']],
  ['user.create', '创建用户', ['admin']],
  ['user.edit', '编辑用户', ['admin']],
  ['user.delete', '删除用户', ['admin']],
  ['feedback.manage', '处理反馈', ['admin', 'assistant', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales_supervisor', 'sales']],
  ['announcement.manage', '管理公告', ['admin', 'operations_director', 'engineering_supervisor']],
  ['audit-log.view', '查看审计日志', ['admin', 'operations_director', 'engineering_supervisor']],
  ['settings.view', '查看系统设置', ['admin', 'operations_director', 'engineering_supervisor']],
  ['settings.edit', '编辑系统设置', ['admin', 'operations_director', 'engineering_supervisor']],
])

const PERMISSION_KEYS = Object.freeze(PERMISSION_ENTRIES.map(([key]) => key))

function getDefaultPermissionMatrix() {
  const matrix = {}
  for (const role of ALL_ROLES) {
    matrix[role] = {}
    for (const [key, , roles] of PERMISSION_ENTRIES) {
      matrix[role][key] = roles.includes(role)
    }
  }
  return matrix
}

function getRolePermissions() {
  const rolePermissions = {}
  for (const role of ALL_ROLES) {
    rolePermissions[role] = {
      label: ROLE_LABELS[role],
      permissions: PERMISSION_ENTRIES
        .filter(([, , roles]) => roles.includes(role))
        .map(([key, label]) => ({ key, label })),
    }
  }
  return rolePermissions
}

module.exports = {
  ALL_ROLES,
  ROLE_LABELS,
  ATTENDANCE_APPLICANT_ROLES,
  ATTENDANCE_NON_APPLICANT_ROLES,
  PERMISSION_ENTRIES,
  PERMISSION_KEYS,
  getDefaultPermissionMatrix,
  getRolePermissions,
}
