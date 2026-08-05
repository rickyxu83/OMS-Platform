const assert = require('node:assert/strict')
const { shiftDateByMonths } = require('../src/modules/inspection-schedules/controller')

assert.equal(shiftDateByMonths('2025-01-31', 1), '2025-02-28')
assert.equal(shiftDateByMonths('2024-01-31', 1), '2024-02-29')
assert.equal(shiftDateByMonths('2025-08-05', 3), '2025-11-05')

console.log('inspection schedule date tests passed')
