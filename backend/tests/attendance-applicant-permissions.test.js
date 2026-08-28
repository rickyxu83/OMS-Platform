const assert = require('node:assert/strict')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'

const backendRoot = `${process.cwd()}/src/`
for (const id of Object.keys(require.cache)) {
  if (id.startsWith(backendRoot)) delete require.cache[id]
}

const dbPath = require.resolve('../src/config/db')
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql) => {
      if (/SELECT role_key, permission_key, enabled/.test(sql)) {
        return []
      }
      return []
    },
    transaction: async (callback) => callback({ execute: async () => [{ affectedRows: 1 }, []] }),
  },
}

const {
  ALL_ROLES,
  ATTENDANCE_APPLICANT_ROLES,
  getDefaultPermissionMatrix,
} = require('../src/permissions/catalog')
const { hasPermission } = require('../src/permissions/store')

;(async () => {
  // 权限收窄模型（2026-08-20）：
  // - 管理员/行政主管：全部考勤权限（含提交申请）
  // - 工程主管：值班津贴管理 + 提交申请
  // - 其他角色：仅提交申请
  assert.deepEqual(ATTENDANCE_APPLICANT_ROLES, ALL_ROLES)

  const defaults = getDefaultPermissionMatrix()

  // 所有角色默认可提交申请（含此前被排除的 admin/dispatcher/operations_director）
  for (const role of ALL_ROLES) {
    assert.equal(defaults[role]['attendance.apply'], true, `${role} should be able to apply`)
    assert.equal(await hasPermission(role, 'attendance.apply'), true, `${role} apply via store`)
  }

  // 查看/导出/维护类权限仅管理员、行政主管与助理主管（2026-08-28 助理主管对齐行政主管，开放考勤设置；attendance.approve 例外：给审批链主管角色）
  const fullAccessRoles = ['admin', 'administrative_supervisor', 'assistant_supervisor']
  const restrictedKeys = ['attendance.view', 'attendance.report.export', 'attendance.manage', 'attendance.admin.approve', 'attendance.hr.approve', 'attendance.vp.approve']
  for (const role of ALL_ROLES) {
    for (const key of restrictedKeys) {
      const expected = fullAccessRoles.includes(role)
      assert.equal(defaults[role][key], expected, `${role} ${key} should be ${expected}`)
    }
  }

  // 考勤审批：审批链 v4 会把直属主管/运营负责人推为审批环节，需授予处理考勤审批权限
  // （助理主管对齐行政主管开放全量考勤权限；工程主管/业务主管/运营负责人仅处理指派给自己的审批环节，不开放考勤数据查看 attendance.view）
  const approveRoles = ['admin', 'administrative_supervisor', 'assistant_supervisor', 'engineering_supervisor', 'sales_supervisor', 'operations_director']
  for (const role of ALL_ROLES) {
    assert.equal(defaults[role]['attendance.approve'], approveRoles.includes(role), `${role} attendance.approve`)
    assert.equal(await hasPermission(role, 'attendance.approve'), approveRoles.includes(role), `${role} approve via store`)
  }

  // 值班津贴：管理权限 = 管理员/工程主管（行政主管不开放值班津贴入口）；终审 = 仅管理员
  for (const role of ALL_ROLES) {
    const canManageDuty = ['admin', 'engineering_supervisor'].includes(role)
    assert.equal(defaults[role]['attendance.duty.manage'], canManageDuty, `${role} duty.manage`)
    assert.equal(defaults[role]['attendance.duty.admin.approve'], role === 'admin', `${role} duty.admin.approve`)
  }

  console.log('attendance applicant permission tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
