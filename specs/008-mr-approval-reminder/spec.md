# 008 MR 签核提醒（手动催办 + 超时自动提醒）

## 背景

请假模块（spec 007）已有「提醒」机制：环节停留超 24h 系统自动提醒 + 申请人手动催办，各自 24h 节流。MR 单签核环节没有催办手段，单子卡在某一环时填单人只能线下找人。本规格把同款机制移植到 MR。

## 目标

- MR 处于 `in_review` 时，填单人/业务负责人可手动催办当前签核人（24h 节流）
- 当前签核环节停留超 24h 时，系统自动提醒当前签核人（每 24h 最多一次）
- 提醒走现有 MR 邮件通道（`mr_notification_outbox` + `sendMrApprovalMail`），含 MR 链接与当前环节信息

## 非目标

- 不改签核流程本身（步骤生成、连签、驳回回退逻辑不动）
- 不对已结案（approved/rejected/voided/draft）的 MR 提供催办
- 不做站内信/短信等新通道

## 设计

### 数据（惰性迁移，沿用 ensure* 模式）

`mr_orders` 新增两列：

| 列                      | 类型          | 说明                             |
| ----------------------- | ------------- | -------------------------------- |
| `last_reminded_at`      | DATETIME NULL | 最近一次手动催办时间（节流依据） |
| `last_auto_reminded_at` | DATETIME NULL | 最近一次自动提醒时间（节流依据） |

### 手动催办

- 接口：`POST /api/v1/mr/:id/remind`
- 权限：MR 创建人（`created_by`）、业务负责人（`sales_owner_id`）或本单助理（当前签核周期助理环节的指派人，含助理主管管辖范围）；否则 403
- 前置校验：`status = 'in_review'` 且存在待签核环节，否则 400「当前状态不在签核中，无需催办」
- 节流：`last_reminded_at` 距今 < 24h → 400「24 小时内已催过，请稍后再试」
- 动作：向当前待签核环节的签核人（`mr_approvals.assignee_user_id`，缺席时按 `resolveStepAssignee` 解析）投递 outbox 事件 `remind_manual`，更新 `last_reminded_at`
- 响应：`{ ok: true, remindedAt }`

### 超时自动提醒

- 调度器每小时扫描一次（挂在现有 MR 调度注册处）
- 条件：`status = 'in_review'`，当前待签核环节停留 > 24h（起算时间 = 上一环节 `decided_at`，首环节回退 `submitted_at`），且 `last_auto_reminded_at` 为空或距今 ≥ 24h
- 动作：向当前签核人投递 outbox 事件 `remind_auto`，更新 `last_auto_reminded_at`
- 批量上限 50/轮，与请假模块一致

### 邮件

`sendMrApprovalMail` 事件标签新增：

| 事件            | 标签                                    |
| --------------- | --------------------------------------- |
| `remind_manual` | `MR 签核待办催办提醒（申请人手动催办）` |
| `remind_auto`   | `MR 签核停留超 24 小时，请尽快处理`     |

邮件正文沿用现有 MR 详情模板，含「查看完整 MR 并签核」按钮。

### 前端

- MR 详情页签核区（ApprovalPanel 或操作栏）加「催办」按钮：
  - 仅当前用户是创建人/业务负责人/本单助理且 `status = 'in_review'` 时可见
  - 详情接口返回 `lastRemindedAt`；24h 内按钮置灰并提示「x 月 x 日 xx:xx 已催过」
  - 点击后二次确认 → 调用接口 → toast 结果

## 验收标准

1. in_review 的 MR，创建人点催办，当前签核人收到催办邮件；24h 内重复点击被拒并提示
2. 非创建人/业务负责人/本单助理点催办返回 403
3. 某环节停留超 24h 且无 24h 内自动提醒记录，调度器下一轮自动发提醒邮件；同一环节 24h 内不重复发
4. draft/approved/rejected/voided 状态催办返回 400
5. 后端 `npm test`、admin 端 `tsc --noEmit`、`npm run build` 全绿
