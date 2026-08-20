const WORK_HOURS_PER_DAY = 8
const HALF_DAY_HOURS = WORK_HOURS_PER_DAY / 2
const LONG_LEAVE_MIN_DAYS = 3
const LONG_LEAVE_FINAL_APPROVER_ROLE = 'operations_director'
// v4 推导模型常量：统一终审角色与升级终审角色（业务上的稳定角色，不做配置项）
const FINAL_APPROVER_ROLE = 'administrative_supervisor'
// 主管级申请人：无直属主管步骤，行政主管审批后固定由运营负责人终审
const ESCALATION_APPLICANT_ROLES = new Set(['engineering_supervisor', 'sales_supervisor'])

function dateKey(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function dateFromKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error('请假日期格式不正确')
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function halfDaySlot(value, boundary) {
  const normalized = String(value || '').trim().replace('T', ' ')
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(09|14|18):00(?::00)?$/)
  if (!match) throw new Error(boundary === 'start' ? '请假开始时段格式不正确' : '请假结束时段格式不正确')
  const [, date, hour] = match
  if (boundary === 'start') {
    if (hour === '09') return { date, half: 0, value: `${date} 09:00:00` }
    if (hour === '14') return { date, half: 1, value: `${date} 14:00:00` }
    throw new Error('请假开始时段必须是上午或下午')
  }
  if (hour === '14') return { date, half: 0, value: `${date} 14:00:00` }
  if (hour === '18') return { date, half: 1, value: `${date} 18:00:00` }
  throw new Error('请假结束时段必须是上午或下午')
}

function calculateWorkingLeaveRange({ startAt, endAt, holidays = new Set(), makeupWorkdays = new Set(), includeNonWorkingDays = false }) {
  const start = halfDaySlot(startAt, 'start')
  const end = halfDaySlot(endAt, 'end')
  const startDate = dateFromKey(start.date)
  const endDate = dateFromKey(end.date)
  if (endDate < startDate || (endDate.getTime() === startDate.getTime() && end.half < start.half)) {
    throw new Error('请假结束时段不能早于开始时段')
  }

  let halfDays = 0
  for (let timestamp = startDate.getTime(); timestamp <= endDate.getTime(); timestamp += 86400000) {
    const cursor = new Date(timestamp)
    const key = dateKey(cursor)
    const day = cursor.getUTCDay()
    if (!includeNonWorkingDays && (day === 0 || day === 6 || holidays.has(key)) && !makeupWorkdays.has(key)) continue
    const firstHalf = key === start.date ? start.half : 0
    const lastHalf = key === end.date ? end.half : 1
    if (lastHalf >= firstHalf) halfDays += lastHalf - firstHalf + 1
  }

  if (!halfDays) throw new Error(includeNonWorkingDays ? '申请范围内没有有效日期' : '申请范围内没有工作日')
  return {
    startAt: start.value,
    endAt: end.value,
    hours: halfDays * HALF_DAY_HOURS,
    workingDays: halfDays / 2,
  }
}

function requiresLeaveProof(leaveType) {
  return leaveType === 'sick' || leaveType === 'marriage'
}

function approvalRolesForRequest({ requestType, workingDays, approvalRoles }) {
  const roles = [...(approvalRoles || [])]
  const days = Number(workingDays)
  if (requestType !== 'leave' || !Number.isFinite(days) || days < LONG_LEAVE_MIN_DAYS) return roles
  return [
    ...roles.filter((role) => role !== LONG_LEAVE_FINAL_APPROVER_ROLE),
    LONG_LEAVE_FINAL_APPROVER_ROLE,
  ]
}

// v4 审批链自动推导（替代手工逐级配置，完整覆盖现有全部规则形态）：
// - 普通员工：直属主管 → 行政主管
// - 工程主管/销售主管（主管级）：行政主管 → 运营负责人
// - 行政主管本人：运营负责人
// - 请假满 3 天：末尾追加运营负责人终审
// - 管理员/运营负责人：返回空链（沿用提交时报「审批流程不能为空」的既有行为）
function deriveApprovalRoles({ applicantRole, requestType, workingDays, supervisorRole }) {
  if (applicantRole === 'admin' || applicantRole === LONG_LEAVE_FINAL_APPROVER_ROLE) return []
  if (applicantRole === FINAL_APPROVER_ROLE) return [LONG_LEAVE_FINAL_APPROVER_ROLE]
  const roles = []
  const escalatedApplicant = ESCALATION_APPLICANT_ROLES.has(applicantRole)
  // 直属主管步骤跳过：映射为申请人自己/终审角色/升级角色/兜底 admin 时均无意义
  const skipSupervisor = new Set([applicantRole, FINAL_APPROVER_ROLE, LONG_LEAVE_FINAL_APPROVER_ROLE, 'admin'])
  if (!escalatedApplicant && supervisorRole && !skipSupervisor.has(supervisorRole)) roles.push(supervisorRole)
  roles.push(FINAL_APPROVER_ROLE)
  const days = Number(workingDays)
  const longLeave = requestType === 'leave' && Number.isFinite(days) && days >= LONG_LEAVE_MIN_DAYS
  if (escalatedApplicant || longLeave) roles.push(LONG_LEAVE_FINAL_APPROVER_ROLE)
  return roles
}

// 代理人仅作为登记字段（冲突校验/通知知会），不再设确认环节：默认代理人同意，
// 提交后直接进入角色审批链。历史 pending_delegate 申请仍可由代理人通过旧入口确认。
function buildApprovalSteps({ applicantRole, requestType, workingDays, supervisorRole, approvalRoles, workflowVersion = 2 }) {
  if (Number(workflowVersion) >= 4) {
    return deriveApprovalRoles({ applicantRole, requestType, workingDays, supervisorRole })
      .map((role) => ({ stepType: 'role', assigneeEmployeeId: null, assigneeRole: role }))
  }

  if (Number(workflowVersion) >= 3) {
    const steps = []
    for (const role of approvalRolesForRequest({ requestType, workingDays, approvalRoles })) {
      steps.push({ stepType: 'role', assigneeEmployeeId: null, assigneeRole: role })
    }
    return steps
  }

  if (requestType === 'overtime') {
    return [
      { stepType: 'supervisor', assigneeEmployeeId: null, assigneeRole: supervisorRole },
      { stepType: 'hr', assigneeEmployeeId: null, assigneeRole: 'administrative_supervisor' },
    ]
  }

  const steps = []
  steps.push({ stepType: 'supervisor', assigneeEmployeeId: null, assigneeRole: supervisorRole })
  if (Number(workingDays) >= 3) {
    steps.push({ stepType: 'hr', assigneeEmployeeId: null, assigneeRole: 'administrative_supervisor' })
    steps.push({ stepType: 'vp', assigneeEmployeeId: null, assigneeRole: 'operations_director' })
  }
  return steps
}

function requestStatusForStep(stepType) {
  const statuses = {
    delegate: 'pending_delegate',
    supervisor: 'pending_supervisor',
    hr: 'pending_hr',
    vp: 'pending_vp',
    role: 'pending_approval',
  }
  return statuses[stepType] || ''
}

module.exports = {
  WORK_HOURS_PER_DAY,
  buildApprovalSteps,
  calculateWorkingLeaveRange,
  deriveApprovalRoles,
  requestStatusForStep,
  requiresLeaveProof,
}
