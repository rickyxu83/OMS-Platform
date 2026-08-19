# 考勤审批流程适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将请假、调休和加班申请适配为按工作日数分支、带代理人及证明附件的新版审批流程，同时兼容已有申请。

**Architecture:** 保留 `attendance_requests.status` 作为申请当前状态，新增纯函数模块负责工作日计算和审批步骤规划，并新增 `attendance_request_approvals` 保存逐步签核记录。新版申请使用 `workflow_version = 2`；旧记录继续走现有主管、行政审批路径。证明文件复用通用文件模块，并为考勤申请增加独立归属权限检查。

**Tech Stack:** Node.js 22、Express 5、MySQL 8、React 18、TypeScript 5、Vite 6、现有 CommonJS 自执行测试。

---

## 文件结构

- Create: `backend/src/modules/attendance/workflow.js` — 工作日计算、证明要求、审批步骤规划和状态映射纯函数。
- Create: `backend/tests/attendance-workflow.test.js` — 工作日边界与审批步骤单元测试。
- Create: `backend/tests/attendance-workflow-controller.test.js` — 新版提交及审批权限的控制器测试。
- Modify: `backend/src/modules/attendance/controller.js` — 数据库惰性迁移、草稿提交、审批流转、列表数据和余额处理。
- Modify: `backend/src/modules/attendance/routes.js` — 新增提交草稿、代理、人事、副总和审批轨迹接口。
- Modify: `backend/src/modules/files/controller.js` — 支持考勤证明文件归属、用途和访问控制。
- Modify: `backend/src/permissions/catalog.js` — 增加人事与副总审批权限。
- Modify: `backend/package.json` — 让 `npm test` 执行语法检查和后端测试。
- Modify: `frontend-admin/src/pages/Attendance.tsx` — 代理人、证明上传、工作日预览、新状态及审批轨迹界面。
- Modify: `frontend-admin/package.json` — 提升管理端版本号。
- Modify: `frontend-admin/package-lock.json` — 同步顶层版本号。
- Modify: `frontend-admin/src/config/app.ts` — 同步版本 fallback。

### Task 1: 工作日计算与审批步骤规划

**Files:**
- Create: `backend/tests/attendance-workflow.test.js`
- Create: `backend/src/modules/attendance/workflow.js`

- [ ] **Step 1: 写入失败的工作日计算测试**

```js
const assert = require('node:assert/strict')
const {
  calculateWorkingLeaveRange,
  buildApprovalSteps,
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

assert.deepEqual(
  buildApprovalSteps({ requestType: 'leave', workingDays: 2.5, delegateEmployeeId: 9, supervisorRole: 'engineering_supervisor' }),
  [
    { stepType: 'delegate', assigneeEmployeeId: 9, assigneeRole: null },
    { stepType: 'supervisor', assigneeEmployeeId: null, assigneeRole: 'engineering_supervisor' },
  ],
)

assert.deepEqual(
  buildApprovalSteps({ requestType: 'comp_time', workingDays: 3, delegateEmployeeId: 9, supervisorRole: 'engineering_supervisor' }).map((item) => item.stepType),
  ['delegate', 'supervisor', 'hr', 'vp'],
)

assert.deepEqual(
  buildApprovalSteps({ requestType: 'overtime', workingDays: 0, delegateEmployeeId: null, supervisorRole: 'engineering_supervisor' }).map((item) => item.stepType),
  ['supervisor', 'hr'],
)

assert.equal(requiresLeaveProof('sick'), true)
assert.equal(requiresLeaveProof('marriage'), true)
assert.equal(requiresLeaveProof('bereavement'), false)
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `cd backend && node tests/attendance-workflow.test.js`

Expected: FAIL，错误包含 `Cannot find module '../src/modules/attendance/workflow'`。

- [ ] **Step 3: 实现最小工作流纯函数模块**

```js
const WORK_HOURS_PER_DAY = 8

function dateKey(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function halfDaySlot(value, boundary) {
  const normalized = String(value || '').replace('T', ' ')
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(09|14|18):00(?::00)?$/)
  if (!match) throw new Error('请假时段格式不正确')
  const [, date, hour] = match
  if (boundary === 'start' && !['09', '14'].includes(hour)) throw new Error('请假开始时段不正确')
  if (boundary === 'end' && !['14', '18'].includes(hour)) throw new Error('请假结束时段不正确')
  return { date, half: hour === '09' || (boundary === 'end' && hour === '14') ? 0 : 1 }
}

function calculateWorkingLeaveRange({ startAt, endAt, holidays = new Set() }) {
  const start = halfDaySlot(startAt, 'start')
  const end = halfDaySlot(endAt, 'end')
  const startDate = new Date(`${start.date}T00:00:00`)
  const endDate = new Date(`${end.date}T00:00:00`)
  if (endDate < startDate) throw new Error('请假结束时段不能早于开始时段')
  let halfDays = 0
  for (const cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor)
    if (cursor.getDay() === 0 || cursor.getDay() === 6 || holidays.has(key)) continue
    const firstHalf = key === start.date ? start.half : 0
    const lastHalf = key === end.date ? end.half : 1
    if (lastHalf >= firstHalf) halfDays += lastHalf - firstHalf + 1
  }
  if (!halfDays) throw new Error('申请范围内没有工作日')
  return { hours: halfDays * 4, workingDays: halfDays / 2 }
}

function requiresLeaveProof(leaveType) {
  return leaveType === 'sick' || leaveType === 'marriage'
}

function buildApprovalSteps({ requestType, workingDays, delegateEmployeeId, supervisorRole }) {
  if (requestType === 'overtime') {
    return [
      { stepType: 'supervisor', assigneeEmployeeId: null, assigneeRole: supervisorRole },
      { stepType: 'hr', assigneeEmployeeId: null, assigneeRole: 'administrative_supervisor' },
    ]
  }
  const steps = [
    { stepType: 'delegate', assigneeEmployeeId: delegateEmployeeId, assigneeRole: null },
    { stepType: 'supervisor', assigneeEmployeeId: null, assigneeRole: supervisorRole },
  ]
  if (Number(workingDays) >= 3) {
    steps.push({ stepType: 'hr', assigneeEmployeeId: null, assigneeRole: 'administrative_supervisor' })
    steps.push({ stepType: 'vp', assigneeEmployeeId: null, assigneeRole: 'operations_director' })
  }
  return steps
}

module.exports = {
  WORK_HOURS_PER_DAY,
  calculateWorkingLeaveRange,
  buildApprovalSteps,
  requiresLeaveProof,
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd backend && node tests/attendance-workflow.test.js`

Expected: exit 0，无断言错误。

- [ ] **Step 5: 提交纯函数和测试**

```bash
git add backend/src/modules/attendance/workflow.js backend/tests/attendance-workflow.test.js
git commit -m "增加考勤工作日与审批步骤计算"
```

### Task 2: 数据库结构与新版申请草稿

**Files:**
- Modify: `backend/src/modules/attendance/controller.js`
- Modify: `backend/src/modules/attendance/routes.js`
- Create: `backend/tests/attendance-workflow-controller.test.js`

- [ ] **Step 1: 写入失败的新版申请测试**

测试通过模块缓存注入模拟 `query` 和 `transaction`，调用 `createRequest`，验证：

```js
assert.equal(response.statusCode, 201)
assert.equal(response.body.status, 'draft')
assert.match(insertCall.sql, /workflow_version/)
assert.equal(insertCall.params.workflowVersion, 2)
assert.equal(insertCall.params.delegateEmployeeId, 9)
assert.equal(insertCall.params.workingDays, 3)
```

并增加以下失败断言：

```js
assert.equal(missingDelegateError.status, 400)
assert.equal(selfDelegateError.status, 400)
assert.equal(inactiveDelegateError.status, 400)
```

- [ ] **Step 2: 运行测试并确认旧实现直接创建待主管申请而失败**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: FAIL，实际状态或 SQL 仍为 `pending_supervisor`。

- [ ] **Step 3: 增加惰性迁移字段和审批步骤表**

在 `ensureAttendanceRequestColumns()` 中查询并补充：

```sql
ALTER TABLE attendance_requests
  ADD COLUMN workflow_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER id,
  ADD COLUMN delegate_employee_id BIGINT UNSIGNED NULL AFTER employee_id,
  ADD COLUMN working_days DECIMAL(6,2) NULL AFTER hours
```

并在 `ensureSchema()` 创建：

```sql
CREATE TABLE IF NOT EXISTS attendance_request_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  step_type VARCHAR(32) NOT NULL,
  step_order INT UNSIGNED NOT NULL,
  assignee_employee_id BIGINT UNSIGNED NULL,
  assignee_role VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'waiting',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  rejected_by BIGINT UNSIGNED NULL,
  rejected_at DATETIME NULL,
  rejected_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_attendance_request_step (request_id, step_order),
  KEY idx_attendance_approval_pending (status, step_type),
  KEY idx_attendance_approval_assignee (assignee_employee_id, status),
  KEY idx_attendance_approval_role (assignee_role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

- [ ] **Step 4: 将普通申请创建改为草稿**

`POST /attendance/requests` 对请假和调休执行：

```js
const delegateEmployeeId = Number(req.body?.delegateEmployeeId)
if (!delegateEmployeeId) throw badRequest('请选择代理人')
if (delegateEmployeeId === Number(employee.id)) throw badRequest('代理人不能是本人')
const delegate = await enabledEmployeeById(delegateEmployeeId)
if (!delegate) throw badRequest('代理人不存在或未启用考勤')

const holidayDates = await activeHolidayDateSet()
const range = calculateWorkingLeaveRange({ startAt: input.startAt, endAt: input.endAt, holidays: holidayDates })
```

插入时明确保存：

```js
{
  workflowVersion: 2,
  delegateEmployeeId,
  workingDays: range.workingDays,
  hours: range.hours,
  status: 'draft',
}
```

- [ ] **Step 5: 增加正式提交草稿接口**

新增：

```js
router.post('/requests/:id/submit', requirePermission('attendance.apply'), controller.submitRequest)
```

`submitRequest` 在事务中锁定草稿、验证申请人、检查病假或婚假证明、生成步骤表，并将首步骤状态设为 `pending`、主表状态设为 `pending_delegate`。

- [ ] **Step 6: 运行控制器测试并确认通过**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: exit 0，新申请为草稿，提交后生成正确步骤。

- [ ] **Step 7: 提交申请数据模型改动**

```bash
git add backend/src/modules/attendance/controller.js backend/src/modules/attendance/routes.js backend/tests/attendance-workflow-controller.test.js
git commit -m "增加考勤申请草稿与新版审批数据模型"
```

### Task 3: 证明附件权限

**Files:**
- Modify: `backend/src/modules/files/controller.js`
- Modify: `backend/tests/attendance-workflow-controller.test.js`

- [ ] **Step 1: 增加失败测试**

覆盖：申请人可以给自己的草稿上传 `leave_proof`；其他用户不能上传；审批相关人员可以下载；无关用户不能下载。

```js
assert.equal(ownerAccess({ action: 'manage', submittedBy: 42, currentUserId: 42, status: 'draft' }), true)
assert.equal(ownerAccess({ action: 'manage', submittedBy: 42, currentUserId: 43, status: 'draft' }), false)
assert.equal(ownerAccess({ action: 'view', submittedBy: 42, currentUserId: 43, isCurrentApprover: true }), true)
```

- [ ] **Step 2: 运行测试并确认归属类型不支持**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: FAIL，错误包含“文件归属类型不支持”。

- [ ] **Step 3: 扩展文件用途和归属检查**

```js
const filePurposes = new Set([
  'general',
  'inspection_document',
  'support_config',
  'site_photo',
  'screenshot_log',
  'leave_proof',
])
```

当 `ownerType === 'attendance_request'` 时查询申请、申请人和当前待审批步骤：

```sql
SELECT r.id, r.status, r.submitted_by,
       EXISTS (
         SELECT 1
         FROM attendance_request_approvals a
         LEFT JOIN attendance_employee_profiles ep ON ep.id = a.assignee_employee_id
         WHERE a.request_id = r.id
           AND a.status = 'pending'
           AND (ep.user_id = :userId OR a.assignee_role = :role)
       ) AS is_current_approver
FROM attendance_requests r
WHERE r.id = :ownerId
LIMIT 1
```

管理权限仅允许申请人操作自己的 `draft`；查看权限允许申请人、当前审批人及拥有全员考勤查看权限的用户。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: exit 0。

- [ ] **Step 5: 提交附件权限改动**

```bash
git add backend/src/modules/files/controller.js backend/tests/attendance-workflow-controller.test.js
git commit -m "支持病假婚假证明附件权限"
```

### Task 4: 新版代理、主管、人事和副总审批

**Files:**
- Modify: `backend/src/modules/attendance/controller.js`
- Modify: `backend/src/modules/attendance/routes.js`
- Modify: `backend/src/permissions/catalog.js`
- Modify: `backend/tests/attendance-workflow-controller.test.js`

- [ ] **Step 1: 写入失败的节点流转和越权测试**

测试以下状态变化：

```js
assert.equal(shortLeaveAfterDelegate.status, 'pending_supervisor')
assert.equal(shortLeaveAfterSupervisor.status, 'approved')
assert.equal(longLeaveAfterSupervisor.status, 'pending_hr')
assert.equal(longLeaveAfterHr.status, 'pending_vp')
assert.equal(longLeaveAfterVp.status, 'approved')
assert.equal(overtimeAfterSupervisor.status, 'pending_hr')
assert.equal(overtimeAfterHr.status, 'approved')
```

测试非指定代理人、非行政主管、非运营负责人审批均返回 403。

- [ ] **Step 2: 运行测试并确认新接口不存在或状态不匹配**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: FAIL，代理、人事或副总审批函数不存在。

- [ ] **Step 3: 增加审批权限**

```js
['attendance.hr.approve', '后勤考勤人事审批', ['admin', 'administrative_supervisor']],
['attendance.vp.approve', '后勤考勤副总审批', ['admin', 'operations_director']],
```

- [ ] **Step 4: 增加审批接口**

```js
router.post('/requests/:id/approve-delegate', requirePermission('attendance.apply'), controller.approveDelegate)
router.post('/requests/:id/approve-hr', requirePermission('attendance.hr.approve'), controller.approveHr)
router.post('/requests/:id/approve-vp', requirePermission('attendance.vp.approve'), controller.approveVp)
router.get('/requests/:id/approvals', requirePermission('attendance.apply', 'attendance.view', 'attendance.hr.approve', 'attendance.vp.approve'), controller.listRequestApprovals)
```

- [ ] **Step 5: 实现统一新版审批函数**

```js
async function approveWorkflowStep(req, expectedStepType) {
  return transaction(async (connection) => {
    const request = await requestForUpdate(connection, Number(req.params.id))
    if (!request || Number(request.workflow_version) !== 2) throw badRequest('申请不属于新版审批流程')
    const step = await pendingApprovalStep(connection, request.id)
    if (!step || step.step_type !== expectedStepType) throw badRequest('当前状态不能执行此审批')
    await assertStepApprover(connection, step, req.user)
    await markStepApproved(connection, step.id, req.user.id)
    const next = await nextWaitingStep(connection, request.id)
    if (next) {
      await activateStep(connection, next)
      await updateRequestStatus(connection, request.id, requestStatusForStep(next.step_type))
      return
    }
    await applyApprovalLedger(connection, request, req.user.id)
    await updateRequestStatus(connection, request.id, 'approved')
  })
}
```

主管接口按 `workflow_version` 分流：版本 1 保留原逻辑；版本 2 使用统一审批函数。

- [ ] **Step 6: 扩展驳回和撤回**

驳回新版申请时仅允许当前步骤审批人操作，同时更新步骤和申请状态；撤回允许 `pending_delegate`、`pending_supervisor`、`pending_hr`、`pending_vp`，并仅允许申请人执行。

- [ ] **Step 7: 调整待办查询**

`scope=supervisor` 改为返回当前用户可审批的所有新版步骤，同时兼容旧版主管待办。新版条件为：

```sql
r.workflow_version = 2
AND a.status = 'pending'
AND (
  approver_profile.user_id = :userId
  OR a.assignee_role = :currentRole
  OR (:isAdmin = 1 AND a.step_type IN ('hr', 'vp'))
)
```

- [ ] **Step 8: 运行测试并确认全部通过**

Run: `cd backend && node tests/attendance-workflow.test.js && node tests/attendance-workflow-controller.test.js`

Expected: exit 0。

- [ ] **Step 9: 提交审批流转改动**

```bash
git add backend/src/modules/attendance/controller.js backend/src/modules/attendance/routes.js backend/src/permissions/catalog.js backend/tests/attendance-workflow-controller.test.js
git commit -m "适配代理人事与副总考勤审批"
```

### Task 5: 加班新版审批与旧记录兼容

**Files:**
- Modify: `backend/src/modules/attendance/controller.js`
- Modify: `backend/tests/attendance-workflow-controller.test.js`

- [ ] **Step 1: 增加失败测试**

验证新加班申请保存 `workflow_version = 2`，直接生成主管、人事两个步骤，并进入 `pending_supervisor`；旧版 `pending_admin` 仍可通过原行政终审接口完成。

- [ ] **Step 2: 运行测试确认旧加班没有步骤表**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: FAIL，新增加班申请仍只写入旧状态字段。

- [ ] **Step 3: 调整工单加班创建事务**

插入新版申请后调用：

```js
await insertApprovalSteps(connection, requestId, buildApprovalSteps({
  requestType: 'overtime',
  workingDays: 0,
  delegateEmployeeId: null,
  supervisorRole,
}))
```

首步骤设为 `pending`，申请状态为 `pending_supervisor`。

- [ ] **Step 4: 保持旧行政终审接口仅处理版本 1**

`approveAdmin` 对 `workflow_version = 2` 返回“请使用人事审批接口”，避免绕过新版步骤。

- [ ] **Step 5: 运行测试并确认通过**

Run: `cd backend && node tests/attendance-workflow-controller.test.js`

Expected: exit 0。

- [ ] **Step 6: 提交加班流程改动**

```bash
git add backend/src/modules/attendance/controller.js backend/tests/attendance-workflow-controller.test.js
git commit -m "调整加班申请为主管人事审批"
```

### Task 6: 管理端申请表单、证明上传和工作日预览

**Files:**
- Modify: `frontend-admin/src/pages/Attendance.tsx`

- [ ] **Step 1: 增加前端类型和状态模型**

```ts
interface ApprovalStep {
  id: number | string;
  stepType: "delegate" | "supervisor" | "hr" | "vp";
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  assigneeEmployeeName?: string | null;
  assigneeRole?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

interface AttendanceRequest {
  workflowVersion?: number;
  delegateEmployeeId?: number | string | null;
  delegateEmployeeName?: string | null;
  workingDays?: number;
  approvals?: ApprovalStep[];
  proofFiles?: Array<{ id: number | string; originalName: string }>;
}
```

表单增加 `delegateEmployeeId`，并增加 `proofFiles: File[]` 本地状态。

- [ ] **Step 2: 加载代理人和法定节假日**

所有具备 `attendance.apply` 的用户加载员工列表和启用节假日；代理人下拉排除当前员工本人，只显示启用考勤的员工。

- [ ] **Step 3: 修改请假和调休提交序列**

```ts
const draft = await api.post('/attendance/requests', {
  requestType,
  leaveType: requestType === 'leave' ? form.leaveType : undefined,
  delegateEmployeeId: form.delegateEmployeeId,
  startAt: range.startAt,
  endAt: range.endAt,
});
for (const file of proofFiles) {
  const body = new FormData();
  body.append('file', file);
  body.append('ownerType', 'attendance_request');
  body.append('ownerId', String(draft.id));
  body.append('purpose', 'leave_proof');
  await api.postForm('/files', body);
}
await api.post(`/attendance/requests/${draft.id}/submit`);
```

病假、婚假在没有证明文件时前端直接提示，不创建草稿；后端仍执行同样校验。

- [ ] **Step 4: 显示工作日预览**

前端预览排除周末和启用法定节假日，显示“有效工作日 X 天／X 小时”；最终以接口返回值为准。

- [ ] **Step 5: 检查 TypeScript**

Run: `cd frontend-admin && npx tsc --noEmit`

Expected: exit 0，0 errors。

- [ ] **Step 6: 提交申请表单改动**

```bash
git add frontend-admin/src/pages/Attendance.tsx
git commit -m "增加考勤代理人与证明提交表单"
```

### Task 7: 管理端审批待办与审批轨迹

**Files:**
- Modify: `frontend-admin/src/pages/Attendance.tsx`

- [ ] **Step 1: 增加状态和步骤标签**

```ts
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_delegate: '待代理人',
  pending_supervisor: '待主管',
  pending_hr: '待人事',
  pending_vp: '待副总',
  pending_admin: '待行政（旧流程）',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
  voided: '已作废',
};
```

- [ ] **Step 2: 按当前节点显示审批按钮**

```ts
const APPROVAL_PATHS: Record<string, string> = {
  pending_delegate: 'approve-delegate',
  pending_supervisor: 'approve-supervisor',
  pending_hr: 'approve-hr',
  pending_vp: 'approve-vp',
};
```

按钮成功提示分别显示“代理人已通过”“主管已通过”“人事已通过”“副总已通过”。旧版 `pending_admin` 保留原行政终审按钮。

- [ ] **Step 3: 显示申请摘要和轨迹**

列表增加代理人、工作日数和证明文件数量；详情展开区按 `stepOrder` 显示审批步骤、指定人员或角色、状态、实际审批人及时间。

- [ ] **Step 4: 将“年假”显示名称改为“特休”**

保持内部值 `annual` 不变，只修改管理端标签、报表表头和余额说明。

- [ ] **Step 5: 检查 TypeScript 和生产构建**

Run: `cd frontend-admin && npx tsc --noEmit && npm run build`

Expected: 两条命令均 exit 0。

- [ ] **Step 6: 提交审批界面改动**

```bash
git add frontend-admin/src/pages/Attendance.tsx
git commit -m "展示新版考勤审批待办与轨迹"
```

### Task 8: 版本号、测试脚本和完整验证

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend-admin/package.json`
- Modify: `frontend-admin/package-lock.json`
- Modify: `frontend-admin/src/config/app.ts`

- [ ] **Step 1: 让后端测试脚本执行新增测试**

```json
{
  "scripts": {
    "check": "find src scripts tests -type f \\( -name '*.js' -o -name '*.cjs' \\) -print0 | xargs -0 -n 1 node --check",
    "test:unit": "node tests/auth-account-lockout.test.js && node tests/auth-login-rate-limit.test.js && node tests/attendance-workflow.test.js && node tests/attendance-workflow-controller.test.js",
    "test": "npm run check && npm run test:unit"
  }
}
```

- [ ] **Step 2: 提升管理端版本号**

将三处版本统一改为 `26.713.109`：

- `frontend-admin/package.json`
- `frontend-admin/package-lock.json` 顶层版本及根包版本。
- `frontend-admin/src/config/app.ts` 的 fallback。

- [ ] **Step 3: 运行后端完整检查**

Run: `cd backend && npm test`

Expected: 语法检查和 4 个测试文件全部通过，exit 0。

- [ ] **Step 4: 运行管理端完整检查**

Run: `cd frontend-admin && npx tsc --noEmit && npm run build`

Expected: TypeScript 0 errors，Vite 构建成功，exit 0。

- [ ] **Step 5: 检查版本一致性**

Run: `rg -n '26\.713\.109' frontend-admin/package.json frontend-admin/package-lock.json frontend-admin/src/config/app.ts`

Expected: 三个文件均命中，`package-lock.json` 根部两处版本一致。

- [ ] **Step 6: 检查工作区差异**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出；状态中仅保留用户原有改动及本计划实施产生的预期文件。

- [ ] **Step 7: 提交验证与版本改动**

```bash
git add backend/package.json frontend-admin/package.json frontend-admin/package-lock.json frontend-admin/src/config/app.ts
git commit -m "完善考勤流程测试并更新管理端版本"
```

- [ ] **Step 8: 最终人工规则核对**

逐项确认：

- 请假和调休必须选择非本人的代理人。
- 病假、婚假没有证明不能提交。
- 周末、法定节假日不计入工作日。
- 2.5 天由主管终审，3 天进入行政主管和运营负责人节点。
- 加班只走主管、行政主管。
- 旧申请仍可审批。
- 所属单位和跨单位校验没有被提前实现。
