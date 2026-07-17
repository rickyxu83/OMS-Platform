const assert = require('node:assert/strict')
const { ROLE_GROUPS } = require('../src/permissions/roles')

for (const role of ['engineer', 'engineering_supervisor']) {
  assert.equal(
    ROLE_GROUPS.salesDirectory.includes(role),
    true,
    `${role} can create or edit customers and must be able to select the assigned salesperson`,
  )
}

console.log('sales directory permission tests passed')
