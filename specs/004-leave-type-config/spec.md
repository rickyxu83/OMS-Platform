# Spec: 假别元数据可配置 + 政策文案快照（产假等政策性强假别再配置化）

**Date**: 2026-09-02 ｜ **Status**: 待佬确认

## Type

Change

## 背景与痛点

当前假别（特休/病假/事假/婚假/丧假）为前后端写死枚举：

- 后端 `controller.js`：`leaveTypes` Set 校验、每假别一个统计 SQL SUM 列、`requiresLeaveProof` / `includeNonWorkingDays` 等行为开关散在代码里、邮件 label 硬编码
- 前端 `attendance-shared.ts`：`LEAVE_TYPE_LABELS` 硬编码 Record

产假这类假别法定天数随政策（年份、地区）变化，写死意味着每次政策调整都要改代码发版。

## Goal

佬拍板方案 1+3 组合：

1. **假别元数据可配置**：假别再由 `attendance_leave_types` 表管理，管理员在考勤设置页自行新增/改名/停用/排序/配置行为开关，不改代码
2. **政策文案提示**：每假别可配「参考天数 + 政策说明」自由文案（如“按当地政策 98 天 + 奖励假，以参保地最新规定为准”），申请页展示，**天数不做系统强校验，以审批人把关为准**
3. **病假年度带薪额度**（佬 2026-09-02 裁决）：病假每年 3 天带薪，超出部分按政策扣 30%。假别表增加可配字段 `paid_quota_days`（年度带薪额度）与 `exceed_deduction_percent`（超额减薪比例），仅病假配置；系统按自然年跟踪该员工已批准病假天数，申请与审批时显示“本年度带薪病假已用 X/3 天”，本次申请将超出额度时醒目提示“超出部分按政策扣 30% 计”，**允许提交，审批把关**
4. **单据快照**：申请提交时把当时假别名称、参考天数、政策说明快照进单据行，政策文案日后调整不影响历史单据口径

## Scope

- DB（惰性迁移，跟随 ensureSchema 模式）：
  - 新表 `attendance_leave_types`（详见 data-model.md），首次 ensure 时 seed 现有 5 假别
  - `attendance_requests` 增加 3 个快照列：`leave_type_label`、`leave_reference_days`、`leave_policy_note`
- 后端 API（attendance 模块）：
  - `GET /attendance/leave-types`：所有考勤相关权限可读（申请下拉、列表 label 兜底用）；`?all=1` 含停用项，限 `attendance.manage`
  - `POST /attendance/leave-types`、`PUT /attendance/leave-types/:id`、`DELETE /attendance/leave-types/:id`：限 `attendance.manage`
  - 删除保护：被任何 `attendance_requests` 行引用过的假别禁止删除，只能停用
- 后端逻辑改造：
  - 提交校验 `leaveTypes.has()` → 查表且 `enabled=1`
  - `requiresLeaveProof` / `includeNonWorkingDays` 硬编码数组 → 读表字段
  - 记录与报表统计 SQL 5 个写死 SUM CASE 列 → `GROUP BY leave_type` 动态聚合成 map
  - 邮件/任务 label：优先用单据快照 label，无快照（历史数据）回退查表，再回退 code 原文
- 年假特判保留：`annual` 为系统保留假别（`system_reserved=1`），余额台账逻辑不动；保留假别不可停用/删除/改 code（名称与文案可改）
- 前端：
  - 删除 `LEAVE_TYPE_LABELS` 硬编码，申请抽屉假别下拉从接口读（仅 enabled 项）
  - 选中假别后在抽屉内展示其参考天数与政策说明文案（如有）
  - 历史单据展示优先用快照 label；统计/报表的按假别列改为动态渲染
  - 考勤设置 tab 新增「假别管理」卡片：列表（名称/开关状态/参考天数/引用数）+ 新增/编辑对话框

## Non-goals

- 不做「假别 × 年度 × 地区」政策规则表与自动天数匹配（方案 2）；表结构预留 `reference_days` / `policy_note` 与单据快照，后续升级方案 2 不返工
- 员工档案不加地区/参保地字段
- 年假余额、调休台账算法不动
- 不回填历史单据快照列（老单据按 code 查表现行 label 兜底，行为可接受）
- 审批链、通知邮件模板结构不动（仅 label 取值来源变化）

## Behavior

- **新增假别**：管理员填 code（字母数字下划线，创建后不可改）、名称、排序、开关（启用/需要上传证明/请假时段含非工作日）、参考天数、政策说明 → 立即可在申请下拉出现
- **停用假别**：下拉不再出现；在途/历史单据正常展示与审批，统计仍归入该假别
- **删除假别**：仅未被任何单据引用时允许；否则报错引导停用
- **改名/改文案**：即时生效于新申请；历史单据显示提交时快照，不追溯变更
- **申请提交**：事务内读取假别行，写入 3 个快照列；政策说明文案随单据详情、审批页、邮件展示
- **病假额度提示**：申请页实时显示当年已用/额度；本次申请将超额时黄色警示但不拦截；审批页同步显示该申请人当年病假额度使用情况；超额部分在详情与审批邮件中标注“按政策扣 X% 计”
- **统计**：按假别动态聚合，前端按返回 key 动态出列；未知名 code（已删历史）归入“其他”；病假行附“额度内 X 天 / 超额 Y 天”拆分

## Contracts

- DB：`attendance_leave_types` 表（含 `paid_quota_days` / `exceed_deduction_percent` 额度字段）+ `attendance_requests` 三快照列（DDL 见 data-model.md）
- API：
  - `GET /attendance/leave-types` → `{ items: [{ id, code, label, enabled, sortOrder, requiresProof, includeNonWorkingDays, referenceDays, policyNote, systemReserved, referenced }] }`
  - `POST/PUT/DELETE` 管理端点，DELETE 对已被引用假别返回 400「已被 N 条单据引用，请改用停用」
  - 提交申请端点行为不变，仅校验来源与快照写入变化
- 权限：读取 = 现有考勤读权限；管理 = `attendance.manage`

## 风险与回滚

- 风险点集中在统计 SQL 动态化与 label 兜底链；seed 数据保证现有 5 假别行为与写死版本完全一致（回归点：特休余额校验、婚丧假跨周末、病事假证明要求）
- 回滚：代码回滚即可，新表与快照列留存无害（写死代码不读它们）
