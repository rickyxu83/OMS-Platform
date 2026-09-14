# 值班津贴改造：极简设置 + 每月 1 号自动生成待办

## 背景与目标

现状（旧版）：值班津贴按**年度**设置——全年周末 7×24 值班（轮值/固定组两种模式）+ 全年法定节假日逐段选人，保存时一次生成全年记录；月度批次人工提交或每月 1 号自动提交行政终审。问题：

- 设置界面重：年度概念、周末日期计算、轮值模式、周末×节假日重叠消解（`overlap_state` 人工处理环节）
- 与"按月确认"的实际使用方式脱节：主管每月真正要做的只是"核对当月安排 → 提交"

新方案（UI 已经 demo 页 `/duty-demo-ui` 确认）：

- **「值班津贴」页 = 纯设置项**：每月值班固定名单 + 法定节假日逐段名单，长期有效，不按月/按年重复填
- **系统每月 1 号自动生成当月值班批次**，并进入**统一待办中心**（ApprovalTasks）
- 主管在待办中心点开核对 → 一键提交 → 行政主管在待办中心终审

## 需求规格

### 一、值班设置（工程主管，`attendance.duty.manage`）

1. **每月值班工程师**：勾选一份固定名单（≥1 人）。名单内每人每月记 1 次月度值班津贴。
   - 不再有轮值/固定模式切换，不再有周末日期计算。
2. **法定节假日值班**：假期数据来自假勤设置（`attendance_legal_holidays`，`day_type='legal_holiday'`），按假期**名称**配置一批值班工程师；不选即该假期不安排。
   - 按名称配置（而非按年份+日期段），跨年复用：明年同名假期自动沿用名单。
   - 津贴按该假期段**落在当月的天数**计入（跨月假期按天拆到各月）。
3. 保存即生效：**已生成但未送审（draft/rejected）的当月批次按新设置重算**；已送审/已终审的月份不受影响；未来月份在每月 1 号生成时按当时设置取数。

### 二、每月自动生成（调度器）

1. 每月 1 号 08:21（东八区，沿用现有 cron 槽位）执行：
   - 若当月批次已存在（无论状态）→ 跳过（幂等）
   - 按当前设置生成当月记录：月度值班每人 1 条（`units=1`）；法定节假日按段每人 1 条（`units=该段落在当月的天数`，`duty_date`/`duty_end_date` 裁剪到当月范围）
   - 创建当月批次，状态 `draft`
2. **不再自动提交行政**（旧版 `autoSubmitMonthlyBatches` 的自动提交行为废止）——生成后等主管在待办中心确认提交。
3. 生成失败/设置为空（月度名单为空且无节假日安排）→ 不创建批次，记日志。

### 三、待办中心接入

1. `approval-tasks` 聚合新增第三数据源 `duty`（与 MR / 考勤同构），来源 `attendance_duty_monthly_batches`：
   - **待我处理**：
     - 批次 `draft` / `rejected` → 对 `attendance.duty.manage` 权限用户可见（主管待确认/待重新提交）
     - 批次 `pending_admin` → 对 `attendance.duty.admin.approve` 权限用户可见（行政待终审）
   - **我发起的**：系统生成，无人工发起人，此视图为空
   - **我已处理**：我提交过 / 我终审过 / 我退回过的批次
2. 任务载荷：`businessType: 'duty'`，`id: 'duty-<month>'`，标题 `2026-09 值班津贴确认`，发起人显示"系统（每月 1 号自动生成）"，`detailPath` 跳值班津贴页月度确认视图，`completedAt` 取本人动作时间。
3. `pendingCount` 与三视图计数合并 duty 侧（导航徽标同步）。
4. 前端 `ApprovalTasks` 的 `BIZ_INDICATOR` 增加 `duty` 项（图标+「值班津贴」标签，暖色系与假勤区分）。

### 四、值班津贴页重构（`AttendanceDuty.tsx`）

1. 页签改为：**值班设置** / **月度确认**（替代现在的 年度设置/月度审批）。
2. **值班设置**：demo 确认的两块——每月值班名单勾选 + 法定节假日逐名称选人 + 保存按钮。
3. **月度确认**：月份选择 + 批次状态徽章 + 明细表（日期/工程师/类型/事由/次数）+ 操作按钮（提交 / 终审通过 / 退回填原因）。
   - 去掉重叠消解 UI（新逻辑无 overlap 概念）。
   - 行政退回展示退回原因；主管改设置后当月批次重算，可重新提交。
4. 入口与权限不变（`attendance.duty.manage` / `attendance.duty.admin.approve`）。

### 五、审批流（沿用现有批次状态机）

- `draft → pending_admin → approved / rejected → pending_admin`，状态机 `nextBatchStatus` 不变。
- 提交时校验：当月有记录才允许提交（不再有 overlap 校验）。
- 提交 / 终审 / 退回沿用现有接口与审计字段；提交后邮件通知行政主管终审（沿用 `queueDutyPendingAdminNotification`）。

## 旧数据处理（迁移）

1. 历史月份已终审（`approved`）/已送审记录**保留不动**（含旧 `weekend_on_call` 类型）。
2. 当年及未来**未送审**（draft/rejected）月份的旧记录与批次：上线时一次性清理，由新逻辑在次月 1 号重新生成；若上线当月批次仍是 draft，则部署后立即按新设置重算当月（一次性脚本或惰性迁移时执行）。
3. 旧年度设置数据（`attendance_duty_templates` + members）保留不再读写；旧接口 `GET/PUT /duty/setup` 废弃改为新设置接口。
4. `overlap_state` 字段保留（历史数据），新记录恒为 `none`；`resolveOverlap` 接口与前端 UI 删除。

## 接口变更

| 接口 | 变更 |
|---|---|
| `GET /attendance/duty/settings` | 新增：读长期设置（月度名单 + 按假期名称的名单） |
| `PUT /attendance/duty/settings` | 新增：保存设置，重算未送审当月批次 |
| `GET /attendance/duty/monthly?month=` | 保留（明细 + 批次状态） |
| `POST /attendance/duty/monthly/:month/submit|approve|reject` | 保留 |
| `GET /attendance/duty/batches` | 保留（历史列表） |
| `GET/PUT /attendance/duty/setup(/:year)` | **删除** |
| `PUT /attendance/duty/records/:id/overlap` | **删除** |
| `GET /approval-tasks` | 聚合增加 duty 源 |

## 口径确认（开工前定）

1. **月度值班津贴计量**：每人每月 1 次（demo 口径）。
2. **旧数据**：历史已审月份保留；未送审月份的旧记录清掉重算。
3. **生成时点**：每月 1 号 08:21 生成**当月**批次并出待办，主管当月内确认提交（不提前生成下月）。

## 测试

- `duty-domain` 单测重写：月度生成、跨月假期按天拆分、假期名称→名单解析、幂等（批次已存在跳过）
- 待办中心聚合：duty 任务在三视图的可见性（manage/approve 权限过滤）
- 调度器生成函数：可用 reference 日期注入单测（沿用 `autoSubmitMonthlyBatches(reference)` 模式）
- 前端：`npx tsc --noEmit` + `npm run build`

## 不做（Non-goals）

- 不改动考勤申请/审批、MR 待办的任何逻辑
- 不做值班津贴金额计算（津贴只计次数，金额线下定）
- 不做工程师本人视图（本功能主管/行政向）
