# Phase 0 Research: 考勤管理模块审计结论

**Date**: 2026-08-24 | **Auditor**: pi 主会话（全量读码，非抽样）

**审计范围**：

- 前端：`frontend-admin/src/pages/Attendance.tsx`（2649 行）、`AttendanceApplyDrawer.tsx`（786）、`AttendanceDuty.tsx`（168）、`attendance-shared.ts`（249）；旁及 `Timesheets.tsx`（月报导出，服务工单域，仅备注）
- 后端：`backend/src/modules/attendance/`（controller 2780 / report 676 / duty 328 / workflow 150 / holiday-sync 195 / routes 54）
- 资产与术语：`docs/reusable-assets.md`、`CONTEXT.md`、`.specify/memory/constitution.md`

所有 NEEDS CLARIFICATION 已通过读码消解（本特性为既有模块优化，技术栈、资产、术语全部既有，无选型空白）。

---

## A. 功能缺口（确认属实，含代码证据）

### A1. ~~请假/调休无法填写申请说明（reason）~~ 【已砍·用户裁决 2026-08-24】

佬裁决：**不需要申请理由录入功能**，保持现状。后端 `reason` 字段维持既有用途（加班单由后端自动生成「工单申请：…」），请假/调休留空。本条留档防后续 session 重复提案。

**证据**：后端 `normalizeRequestInput`（controller.js:1257）接收 `reason: nullableText(body?.reason)` 并入库；列表 `RequestList` 渲染「申请说明」（Attendance.tsx:2540+）；但 `AttendanceApplyDrawer` 三步向导无任何事由输入，`createBlankForm()` 也无 reason 字段。加班单 reason 由后端自动生成（`工单申请：{单号} / {时段}`，controller.js:1733），请假/调休则永远为空。

**Decision（作废）**: ~~抽屉第 2 步加「申请说明」Textarea~~ → 不实施。

### A2. 附件上传失败 → 草稿卡死无出口

**证据**：`submitRequest()`（AttendanceApplyDrawer.tsx:280+）顺序为 `POST /requests`（draft）→ 逐个 `POST /files` → `POST /:id/submit`。任一中断（网络、文件超限）草稿已入库；「我的申请」草稿行唯一操作是「撤回」（Attendance.tsx:1316+），用户只能撤回后全部重填。

**Decision**: 前端调整顺序——先创建草稿→传附件→提交 不变（后端要求 ownerId），但在 catch 中区分阶段：附件阶段失败时 toast 明确提示「草稿已保留，可在我的申请中继续」；并在「我的申请」草稿行加「继续提交」按钮（重开抽屉预填表单+已传附件数量）与保留撤回。

**Rationale**: 继续提交复用既有抽屉状态预填即可，无新接口；删除草稿可由撤回承担（状态机已支持 draft→withdrawn）。

**Alternatives considered**: 附件先传为 orphan 再关联 — 驳回，files 表强 owner 校验，改动面大；草稿定时清理 — 驳回，行政留痕要求不自动删业务数据。

### A3. 高危/原因类操作交互不统一且过于轻量

**证据**：

- 审批驳回 `reject()` 用 `window.prompt`（Attendance.tsx:773）；值班退回 `rejectDutyBatch()` 同（:855）；而 AttendanceDuty 页面内退回却用正规 Textarea+按钮（AttendanceDuty.tsx 月度审批底栏）——同一动作两种交互。
- 停用节假日 `disableLegalHoliday` 用 `window.confirm`（Attendance.tsx:1135）。
- 作废已通过申请：一键完成、无确认、无原因（Attendance.tsx:1524）；后端 `voidRequest` 接受 `reason` 且落 `void_reason`（controller.js:2600-2621）但永远收到 NULL；作废触发 `reverseApprovalLedger` 回滚余额台账。
- 撤回：一键无确认。

**Decision**: 新增统一组件 `ReasonConfirmDialog`（标题/描述/原因 Textarea/必填开关/确认按钮 loading），登记到 `docs/reusable-assets.md`；替换全部 prompt/confirm：驳回=必填原因、值班退回=必填原因、作废=必填原因+警示文案（说明余额回滚影响）、停用节假日=确认即可、撤回=确认即可。

**Rationale**: 原生 prompt 在移动端样式不可控、无法校验、无 loading；作废留原因是行政审计底线（后端字段已备）。

**Alternatives considered**: 每处各自写内联 Dialog — 驳回，违反宪法 I 复用优先，且正是当前「同一动作两种交互」的成因。

### A4. 申请明细静默截断 300 条

**证据**：`listRequests` SQL `LIMIT 300`（controller.js:1883），无分页参数；前端「记录与报表-申请明细」无分页/范围筛选/截断提示。全员数据增长后老记录凭空消失。

**Decision**: 后端 `GET /attendance/requests` 增加可选 `startDate/endDate`（作用于 `r.start_at`，向后兼容，默认行为不变）；前端申请明细工具栏加日期范围筛选 + 当 `items.length === 300` 时显示「仅显示最近 300 条，请用日期范围缩小」提示条。

**Rationale**: 日期范围比分页器更符合行政查档习惯（按月/季度查）；改动小、向后兼容。

**Alternatives considered**: 偏移分页 — 驳回，深分页在持续增长表上体验差且实现成本高；导出代替查档 — 驳回，导出无审批链/附件上下文。

## B. 加载/性能

### B1. 设置页年份输入触发整页重载

**证据**：`load()` effect 依赖 `[canViewAll, reportMonth, holidayYear]`（Attendance.tsx:630）；`holidayYear` 绑定 number input（:1798），每击键一次全量 load（canViewAll 时 8 个请求）。`AttendanceDuty` 年度 input 同样驱动 `loadSetup`。

**Decision**: 拆 effect：主 load 只管 me/mine/supervisor/all/employees/rules；`legalHolidays` 独立 effect 依赖 holidayYear（`/^\d{4}$/` 校验通过才发请求，天然防抖=输满 4 位才发）；`reportItems` 独立 effect 依赖 reportMonth；duty year 改「查询」按钮或 onBlur 触发。

### B2. 审批页节假日重复拉取

**证据**：approve tab 下 `load()` 拉一次 legal-holidays（申请抽屉算工作日用），`publicHolidays` effect 再拉一次同年（Attendance.tsx:640）。**Decision**: 合并为单次拉取，两态同源；切年份只影响展示态。

### B3. 操作后全量 load()

**证据**：`action()` 成功后 `await load()`。**Decision**: 本期保留（简单可靠），仅加按钮级 loading（FR-007）防重复点击；局部刷新列入后续迭代。

## C. 移动端

### C1. 申请列表未走 ResponsiveList

**证据**：货架资产 `ResponsiveList`（纯 CSS 断点，Devices/ServiceOrders/Customers 已用）；考勤三处 RequestList 与员工余额表均为 `min-w-[760px]/[900px]` 横滚表格。

**Decision**: RequestList 接 ResponsiveList（breakpoint="md"，表格 min-w 760 < 1100 无需 lg），手机卡片含：类型徽章+状态、明细、时间+时长徽章、员工名、操作按钮区；员工余额表同（md）。卡片渲染函数放 `components/attendance/` 拆分文件中（与 D1 协同）。

**Rationale**: 宪法 I 复用优先；主管手机审批为高频场景。

## D. 结构/美化

### D1. Attendance.tsx 2649 行单文件

**Decision**: 拆 `frontend-admin/src/components/attendance/`：`RequestList.tsx`（含卡片渲染）、`ApprovalChain.tsx`、`HolidayPanel.tsx`（审批页节日一览）、`SettingsHolidays.tsx`、`ReportExportDialog.tsx`、`EmployeeDialogs.tsx`；页面只留状态编排。**最后一批做、独立提交**，避免与功能修复混杂难审。

### D2. 视觉一致性

- 审批/撤回/作废按钮统一 `size="sm"` + 图标 + loading 态规范（已有先例，补齐即可）。
- 证明附件预览弹窗：图片/PDF 分支补「下载原文件」按钮（现仅"新窗口打开"，审批人存档绕路）。
- statTiles 余额不足预警：可用特休 ≤1 天或调休 ≤0 时数值标 warning 色（低成本高感知）。

## E. 已确认为「非问题」的审计排除项

- `pending_delegate` 状态与 approve-delegate 入口：v4 审批链已无代理人确认环节（workflow.js:113 注释明示），仅为历史数据兼容，保留不动。
- 员工档案弹窗「籍别」联动覆盖 `annualLeaveRule`：草稿初始化取自既有规则，仅改籍别时重置——符合产品直觉，不改。
- `formatCount("5 天")`：NaN 分支原样返回，安全。
- 月度汇总 `monthDateRange` UTC 计算：边界正确。
- 值班明细按工程师汇总、节假日值班按假期为单位：近期已按纸质单习惯优化（d8f77ab），不动。
- Timesheets 月报导出页：服务工单域，仅备注（工程师下拉无搜索、客户列表 pageSize=200 上限），不纳入本特性。

## 优先级汇总

| 档 | 项 | 理由 |
|---|---|---|
| P1 | A3 统一确认对话框（含作废留痕）、A4 截断治理 | 财务敏感操作留痕 + 查档完整性 |
| P1 | A2 草稿出口 | 用户卡死 |
| P2 | B1/B2 加载拆分、FR-007 按钮 loading、C1 移动端卡片化 | 体验阻塞 |
| P3 | D2 视觉细节、E 值班跳转月份、D1 文件拆分 | 打磨与可维护性 |
