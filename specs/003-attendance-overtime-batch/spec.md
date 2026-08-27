# Spec: 工单加班申请 batch 组联动审批

**Date**: 2026-08-25 ｜ **Status**: 已获佬批准（"可以"）

## Type

Change

## Goal

同工单加班的「路上（固定转调休）＋ 工作（转调休/加班费）」两条申请视为一组：审批、驳回、撤回、作废全部组联动；我的申请 / 审批视图 / 记录与报表三处归组显示为一条。消除审批人看到两条的困惑与二次操作（佬 2026-08-25 原话：同意就是一起通过，不同意就是全部退回，不想让审批人看到两条）。

## Scope

- `attendance_requests` 新增 `batch_id VARCHAR(36) NULL` + 索引（惰性迁移，跟随 ensureSchema 的 day_type 模式）
- 申请入口 `POST /attendance/overtime/service-orders/:id/apply`：双段提交时生成 batch_id 写入两条；显式 segmentKey 单段提交不打标
- 四个动作组联动：approveWorkflowStep（role/delegate/hr/vp 全入口覆盖）、rejectRequest、withdrawRequest、voidRequest；终态条目跳过，全终态报错
- `requestPayload` 与前端 `AttendanceRequest` 增加 `batchId`；`RequestList` 按 batchId 归组渲染（≥2 合并一条）
- 抽屉文案同步（"各生成一条申请"→"同组审批"）

## Non-goals

- 不合并为单条记录（结算通道保持每行独立：调休台账 / 付费统计按行不动）
- 不合并通知邮件（组审批后按行各发一封，已知噪音，后续再合）
- 不回填历史成对数据 batch_id（无标记者天然单例，另议）
- 草稿场景无涉（加班申请直入 pending，无草稿态）

## Behavior

- **申请**：一次提交两段 → 两条共享 batch_id；一段有效一段无效 → 只生成一条也带 batch_id（无兄弟 = 单例行为）
- **审批**：对组内任一条 approve → 同事务内对组内所有非终态条目各推进一步审批链；`applyApprovalLedger` 按行结算（路上进调休、工作按结果）；组内全终态 → 报「当前状态不能执行此审批」
- **驳回**：同一驳回原因应用到组内所有非终态条目，各自发驳回通知
- **撤回**：申请人撤回 → 组内所有可撤回状态条目一并撤回
- **作废**：行政作废（强制原因）→ 组内所有已批准条目逐一 `reverseApprovalLedger` 并作废
- **展示**：同组三处列表合并一行；明细区按段逐行（种类 + 结果徽标 + 3倍 + 日类型 + 时间 + 时长），时间列取并集，时长列合计，状态列取代表条（组联动保证一致），操作按钮按代表条渲染、服务端自动扩组

## Contracts

- DB：`attendance_requests.batch_id VARCHAR(36) NULL`，`idx_attendance_requests_batch`
- API：四个动作端点语义升级为「组联动」（无 batch_id 者行为不变）；listRequests 响应项增加 `batchId`
- UI：RequestList 归组；`usedOvertimeSegments` 占用去重不变

## Edge cases

- 组内部分条目已被单独处理（终态）→ 动作跳过终态、处理其余
- 点击条目本身终态但组内仍有可处理条目 → 正常处理其余
- v1–v3 老工作流条目无 batch_id → 单例路径不变
- 历史成对数据无 batch_id → 各自单例（不回填）
- 连签（相邻步骤同审批人）→ 组内每行各自推进一步，链相同保持同步

## Side effects

- 组审批完成时按行各发一封邮件（2 封/组，v1 接受，后续合并）
- 台账按行入账（正确语义）

## Related files

- `backend/src/modules/attendance/controller.js`（迁移 / 申请入口 / 四动作 / requestPayload）
- `frontend-admin/src/components/attendance/RequestList.tsx`（归组渲染）
- `frontend-admin/src/pages/attendance-shared.ts`（batchId 类型）
- `frontend-admin/src/pages/AttendanceApplyDrawer.tsx`（文案）
- `backend/tests/attendance-workflow-controller.test.js`（组联动用例）

## Verification

- 单测：同组两条 mock → approve 一条 → 断言两条均被推进且台账按行；reject / withdraw 同理
- `npx tsc --noEmit`
- RN：撤回 #31 后重交 TS202608210001 → 我的申请显示一条；审批人同意一次 → 两条同时通过

## Risks / unknowns

- 邮件双发（已知，后续合并）
- 操作以代表条发起时代表条恰终态而兄弟未终态：服务端按组处理正常，前端刷新后一致

## Evidence

- Confirmed by code: 四动作单行路径（approveWorkflowStep/reject/withdraw/void）、requestPayload、insertServiceOrderOvertimeSegment 双段循环、RequestList 单条渲染、ADR-0002 去程/回程合并为一条 travel
- Confirmed by tests: attendance-workflow-controller.test.js 的 mock 模式可复用
- Confirmed by docs: ADR-0002（travel 段合并口径）
- Inferred: 同组审批链必定一致（同申请人同类型同提交时刻）
- Unknown: 无
