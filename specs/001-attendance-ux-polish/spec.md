# Feature Specification: 考勤管理模块体验审计与前端美化优化

**Feature Branch**: `001-attendance-ux-polish`（speckit 逻辑编号；实际开发按项目约定落在 `integration/attendance-mr`）

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "看看当前考勤管理模块有没有啥问题或要修改的地方，包括前端美化，优化使用操作习惯"

## 背景

考勤管理模块（请假/加班/调休申请与审批、员工余额、法定节假日、值班津贴、月度汇总与导出）经过多轮迭代后功能完整，但全量代码审计（`research.md`）发现若干功能缺口、体验断点与一致性问题。本特性把审计结论转化为分批可独立交付的优化需求。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 高危操作有确认、驳回作废必留痕 (Priority: P1)

驳回、退回、作废、停用节假日等操作不再弹原生 `window.prompt/confirm`，统一走应用内对话框；作废已通过申请必须填写原因（后端 `void_reason` 字段已存在但目前永远为 NULL）。

**Why this priority**: 作废会回滚余额台账（`reverseApprovalLedger`），属财务敏感操作，一键无确认无原因不可接受；驳回原因录入从原生 prompt 迁移为应用内对话框，移动端可用。

**Independent Test**: 行政主管作废一张已通过申请 → 弹窗要求填原因 → 数据库 `void_reason` 有值；审批驳回走应用内对话框且原因必填。

**Acceptance Scenarios**:

1. **Given** 审批人在「待我审批」点击驳回，**When** 弹出对话框，**Then** 为带 Textarea 的应用内弹窗，原因为空时驳回按钮不可用。
2. **Given** 行政主管在「申请明细」对已通过申请点作废，**When** 弹出确认框，**Then** 必须填写作废原因才能确认，且按钮有 loading 防重复点击。

---

### User Story 2 - 申请草稿不再卡死，列表数据不再静默消失 (Priority: P1)

请假/调休提交采用「草稿 → 传附件 → 提交」三步，附件上传失败会在库里留下无法继续的草稿（UI 只有「撤回」）；记录与报表「申请明细」后端固定 `LIMIT 300`，超出后老记录静默消失。

**Why this priority**: 数据完整性与用户卡死问题，直接影响行政查档与员工重填成本。

**Independent Test**: ①模拟附件上传失败后，草稿可从「我的申请」重新打开继续提交或一键删除；②申请明细超过 300 条时有明确截断提示或可用日期范围/分页继续查到老数据。

**Acceptance Scenarios**:

1. **Given** 员工提交病假（需上传证明）时附件上传失败，**When** 回到「我的申请」，**Then** 草稿行提供「继续提交」或「删除草稿」出口，不会只剩撤回重填。
2. **Given** 全员申请记录超过 300 条，**When** 行政打开「申请明细」，**Then** 能看到范围/截断提示，并能通过日期范围筛选查到 300 条以外的记录。

---

### User Story 3 - 页面加载提速，设置页输入不再卡顿 (Priority: P2)

考勤设置页「年份」每敲一位数字触发一次 8 请求的全量 `load()`；报表月份切换同样全量重载。把节假日、月度报表的加载从主 `load()` 拆分为独立 effect，并做输入防抖或显式查询。

**Why this priority**: 每次击键 8 个请求，慢网络下设置页明显卡顿；属体验阻塞但不影响数据正确性。

**Independent Test**: 在考勤设置页年份输入框连续输入 4 位年份，网络面板中 `/attendance/*` 请求次数 ≤ 2 次（节假日单接口 + 防抖后一次）。

**Acceptance Scenarios**:

1. **Given** 管理员在考勤设置-工作日历切换年份，**When** 输入完整年份，**Then** 仅节假日接口重新请求，其余列表不刷新。
2. **Given** 行政在记录与报表切换月度汇总月份，**When** 选择新月份，**Then** 仅月度汇总接口重新请求。

---

### User Story 4 - 手机上审批不横滚 (Priority: P2)

「待我审批 / 我的申请 / 申请明细」三处列表接入既有资产 `ResponsiveList`（Devices/ServiceOrders/Customers 已在用），移动端卡片化展示：类型徽章、明细、时间、状态与操作按钮竖排可点。

**Why this priority**: 主管在外用手机审批是高频场景，目前 min-w-[760px] 表格需横向滚动。

**Independent Test**: 手机视口（<768px）打开考勤管理，三处列表均渲染为卡片流，通过/驳回按钮可直接点击。

**Acceptance Scenarios**:

1. **Given** 主管用手机浏览器打开考勤管理，**When** 查看待我审批，**Then** 列表为卡片流，单卡内可完成通过/驳回。

---

### User Story 5 - 细节一致性打磨 (Priority: P3)

值班设置保存后跳转月份合理化（同年跳当前月而非 1 月）；审批按钮加 loading 防重复点击；证明附件预览弹窗补直接下载按钮；`Attendance.tsx`（2649 行）内嵌组件拆分到 `components/attendance/`（纯结构重构，与功能修复分提交）。

**Why this priority**: 打磨项，不影响主流程。

**Independent Test**: 逐项对照 `research.md` D/E 节清单验收。

**Acceptance Scenarios**:

1. **Given** 工程主管 8 月保存当年值班设置，**When** 保存成功，**Then** 月度审批落在当前月而非 1 月。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**（已砍，用户裁决 2026-08-24）：请假/调休「申请说明」录入——佬确认不需要，后端 `reason` 保持现状仅由加班单自动生成。
- **FR-002**: 驳回（申请审批、值班批次退回）、作废已通过申请、停用法定节假日，必须统一使用应用内 Dialog；驳回与作废强制填原因，停用/撤回给确认提示。
- **FR-003**: 作废原因必须落库 `attendance_requests.void_reason`，记录与报表侧可见（详情或审批链展示）。
- **FR-004**: 附件上传失败留下的草稿必须有两种出口之一：继续提交（保留已填内容重开抽屉）或删除草稿。
- **FR-005**: 「申请明细」不得静默截断：提供日期范围筛选，并在结果被 300 条上限截断时展示明确提示；后端 `GET /attendance/requests` 增加可选 `startDate/endDate` 参数（向后兼容）。
- **FR-006**: 节假日（`holidayYear`）与月度汇总（`reportMonth`）的数据加载从主 `load()` 拆分为独立 effect，输入防抖 ≥300ms 或显式触发；值班年度设置页 year 输入同理。
- **FR-007**: 审批/撤回/作废等行内操作按钮在请求进行中禁用并显示 loading。
- **FR-008**: 三处申请列表与员工余额表接入 `ResponsiveList`，移动端卡片化。
- **FR-009**: 所有可见变更必须同步提升三处版本号（宪法 III）。
- **FR-010**: 不引入新依赖类别；日期/格式化/API 请求走既有资产（`lib/format.ts`、`services/api.ts`、原生 date input）。

### Key Entities

- **考勤申请（attendance_request）**：请假/加班/调休统一单证，本次启用既有 `void_reason` 字段（`reason` 维持仅加班单自动生成，见 FR-001 裁决）；状态机 draft → pending_* → approved/rejected/withdrawn/voided。
- **审批步骤（approval_step）**：v4 角色推导链，本特性不变更。
- **员工考勤档案 / 余额台账**：余额调整流水在作废时回滚，要求操作留痕。
- **法定节假日 / 值班批次**：只读展示与审批交互优化，无结构变更。

## Success Criteria *(mandatory)*

- **SC-001**: 审批人处理一张请假单操作步骤不增加，驳回/作废均有原因留痕（抽测 5 张单，`rejected_reason`/`void_reason` 非空率 100%）。
- **SC-002**: 考勤设置页连续输入年份触发的考勤接口请求数从 ≥8 次降到 ≤2 次。
- **SC-003**: 手机视口下三处申请列表零横向滚动即可完成审批。
- **SC-004**: 行政可查档超过 300 条的申请记录（通过日期范围筛选）。
- **SC-005**: 全量质量门绿：后端 `npm run check`、admin 端 `npx tsc --noEmit` 0 错误、双端 build 通过、`npm run test:mr` 通过。

## Assumptions

- 本特性只做体验/美化/缺口补齐，**不改审批链推导模型（v4）、不改余额核算规则、不改值班津贴算法**。
- 代理人无确认环节（v4 既定行为），`pending_delegate` 仅为历史数据兼容，不在本次范围。
- 月报导出页（Timesheets）属服务工单域，不纳入本次考勤优化范围，仅登记备注。
