const assert = require('assert')

process.env.NODE_ENV = process.env.NODE_ENV || 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const { canView } = require('../lib/controller')

// spec 010 作废审批查看权限回归：行政主管（winnie 事件）同意作废第一级后，
// 待审批人变为业务主管，此前 canView 对她立即失效 → decideVoid 返回详情的 loadDetail 抛
// 「无权查看该 MR 申请」，审批实际成功但前端收到 403，用户重复点击再报「待办不属于你」。
// 修复：作废审批参与者（任一伦审批人）保留查看权限。

const administrativeSupervisor = { id: 16, role: 'administrative_supervisor' }
const salesSupervisor = { id: 30, role: 'sales_supervisor' }
const purchaser = { id: 18, role: 'purchaser' }

// 作废待审批人可看（原有行为）
assert.strictEqual(canView({ voidPendingApproverId: 16 }, administrativeSupervisor), true)

// 审批完不再是待审批人、但作为作废审批参与者仍可看（本次修复）
assert.strictEqual(canView({ voidPendingApproverId: 30, voidParticipant: 1 }, administrativeSupervisor), true)
assert.strictEqual(canView({ voidPendingApproverId: null, voidParticipant: 1, status: 'voided' }, administrativeSupervisor), true)

// 无参与者身份不放大权限：行政主管看不到无关单
assert.strictEqual(canView({ voidPendingApproverId: null, voidParticipant: 0, status: 'approved' }, administrativeSupervisor), false)

// 业务主管非单主/非签核参与/非作废相关，仍不可看（权限未放大）
assert.strictEqual(canView({ salesOwnerId: 99, voidParticipant: 0, status: 'approved' }, salesSupervisor), false)

// 既有角色分支回归：被指派采购可看、单主业务主管可看
assert.strictEqual(canView({ purchaseAssigneeUserId: 18, status: 'approved' }, purchaser), true)
assert.strictEqual(canView({ salesOwnerId: 30, status: 'approved' }, salesSupervisor), true)

console.log('mr void-view permission tests passed')
