const assert = require('node:assert/strict')

const {
  buildApprovalSteps,
  calculateWorkingLeaveRange,
  requiresLeaveProof,
} = require('../src/modules/attendance/workflow')

{
  const result = calculateWorkingLeaveRange({
    startAt: '2026-07-10 09:00:00',
    endAt: '2026-07-14 18:00:00',
    holidays: new Set(),
  })
  assert.equal(result.hours, 24)
  assert.equal(result.workingDays, 3)
}

{
  const result = calculateWorkingLeaveRange({
    startAt: '2026-07-10 09:00:00',
    endAt: '2026-07-15 14:00:00',
    holidays: new Set(['2026-07-13']),
  })
  assert.equal(result.hours, 20)
  assert.equal(result.workingDays, 2.5)
}

{
  assert.throws(
    () => calculateWorkingLeaveRange({
      startAt: '2026-07-11 09:00:00',
      endAt: '2026-07-12 18:00:00',
      holidays: new Set(),
    }),
    /没有工作日/,
  )
}

assert.deepEqual(
  buildApprovalSteps({
    requestType: 'leave',
    workingDays: 2.5,
    delegateEmployeeId: 9,
    supervisorRole: 'engineering_supervisor',
  }),
  [
    { stepType: 'delegate', assigneeEmployeeId: 9, assigneeRole: null },
    { stepType: 'supervisor', assigneeEmployeeId: null, assigneeRole: 'engineering_supervisor' },
  ],
)

assert.deepEqual(
  buildApprovalSteps({
    requestType: 'comp_time',
    workingDays: 3,
    delegateEmployeeId: 9,
    supervisorRole: 'engineering_supervisor',
  }).map((item) => item.stepType),
  ['delegate', 'supervisor', 'hr', 'vp'],
)

assert.deepEqual(
  buildApprovalSteps({
    requestType: 'overtime',
    workingDays: 0,
    delegateEmployeeId: null,
    supervisorRole: 'engineering_supervisor',
  }).map((item) => item.stepType),
  ['supervisor', 'hr'],
)

assert.equal(requiresLeaveProof('sick'), true)
assert.equal(requiresLeaveProof('marriage'), true)
assert.equal(requiresLeaveProof('annual'), false)
assert.equal(requiresLeaveProof('personal'), false)
assert.equal(requiresLeaveProof('bereavement'), false)
