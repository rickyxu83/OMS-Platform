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
        return [
          { role_key: 'admin', permission_key: 'attendance.apply', enabled: 1 },
          { role_key: 'dispatcher', permission_key: 'attendance.apply', enabled: 1 },
          { role_key: 'operations_director', permission_key: 'attendance.apply', enabled: 1 },
        ]
      }
      return []
    },
    transaction: async (callback) => callback({ execute: async () => [{ affectedRows: 1 }, []] }),
  },
}

const {
  ATTENDANCE_APPLICANT_ROLES,
  getDefaultPermissionMatrix,
} = require('../src/permissions/catalog')
const { hasPermission } = require('../src/permissions/store')

;(async () => {
  assert.deepEqual(ATTENDANCE_APPLICANT_ROLES, [
    'assistant',
    'engineering_supervisor',
    'administrative_supervisor',
    'sales_supervisor',
    'sales',
    'engineer',
  ])

  const defaults = getDefaultPermissionMatrix()
  for (const role of ['admin', 'dispatcher', 'operations_director']) {
    assert.equal(defaults[role]['attendance.apply'], false)
    assert.equal(await hasPermission(role, 'attendance.apply'), false)
    assert.equal(await hasPermission(role, 'attendance.approve'), true)
  }
  assert.equal(await hasPermission('assistant', 'attendance.apply'), true)

  console.log('attendance applicant permission tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
