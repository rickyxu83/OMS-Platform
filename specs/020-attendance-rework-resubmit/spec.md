# 假勤撤回/驳回重提改造（spec 020）

2026-11-12 佬拍板：对齐 MR 的"撤回回草稿→原条修改→重新提交"模式；驳回同样退回修改；逐条重提、驳回只退申请人、不限次数；撤回原因选填。

## 决策

1. **撤回**（pending_*）：状态回 `draft`，记录撤回人/时间/原因（选填），当前审批步骤标 skipped，通知当前环节处理人（代理人或审批角色组）
2. **驳回**（各审批环节）：状态回 `draft`（不再终态 rejected），保留驳回人/时间/原因供申请人查看，其余待审步骤标 skipped，通知申请人（沿用现有驳回通知）
3. **编辑重提**：新增 `PUT /attendance/requests/:id`，`draft`/`withdrawn`/`rejected` 三种状态可编辑（历史已撤回/驳回条目同样支持"修改重提"），仅申请人本人、仅请假/调休（加班从工单带入不开放编辑）；保存后统一为 `draft`，走现有 submit 重提，审批步骤重新生成、代理人重新确认
4. **批次**：撤回保持组联动（同批一起回草稿），重提逐条进行
5. **次数**：不限；每轮审批轨迹保留在 attendance_request_approvals（旧步骤 skipped，新步骤追加）
6. **不做**：作废维持现状（行政直接作废+回滚台账+必填原因），不引入 MR 的作废两阶段审批；撤回原因选填不强制

## 数据变更

- `attendance_requests` 新增 `withdraw_reason VARCHAR(500) NULL`（ensure 惰性迁移）
- 审批步骤表复用现有 `status`/`rejected_reason` 列，skipped 仅作标记，无结构变更

## 兼容

- 历史 `withdrawn`/`rejected` 条目可通过 update 端点重新进入草稿
- `finalStatuses` 中 `rejected`/`withdrawn` 语义调整：仍为列表终态分组展示，但允许重提路径回到 draft（重提后置 draft 不再是终态）
- 加班申请不开放编辑（结构由工单快照决定）
