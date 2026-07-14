# Design: 考勤多级审批规则

## Boundary

本功能只扩展考勤模块的角色审批规则、审批步骤生成和管理端设置界面。代理人确认、余额入账、撤回、作废、附件和报表规则保持现状。邮件通知与邮件内审批不在范围内。

## Data Model

新增 `attendance_approval_role_rule_steps` 表，不直接改造现有单步表的主键：

- `applicant_role`：提交申请的角色。
- `step_order`：从 1 开始的审批顺序。
- `approver_role`：该步骤可处理申请的角色。
- 主键：`(applicant_role, step_order)`。
- 唯一约束：`(applicant_role, approver_role)`，从数据层阻止重复角色。

现有 `attendance_supervisor_role_rules` 保留为迁移来源和旧版本兼容数据。惰性迁移在某个申请人角色尚无新表记录时，把现有 `supervisor_role` 迁成唯一的第 1 步；没有旧记录时使用当前 `defaultSupervisorRoleRules` 生成默认单步链。迁移必须幂等，不删除旧表。

## Settings API Contract

新增语义明确的接口，旧接口暂时保留以降低兼容风险：

- `GET /attendance/approval-role-rules`
- `PUT /attendance/approval-role-rules`

返回结构：

```json
{
  "roles": [{ "role": "assistant", "label": "助理" }],
  "items": [
    {
      "applicantRole": "assistant",
      "applicantRoleLabel": "助理",
      "steps": [
        { "stepOrder": 1, "approverRole": "administrative_supervisor", "approverRoleLabel": "行政主管" },
        { "stepOrder": 2, "approverRole": "operations_director", "approverRoleLabel": "运营负责人" }
      ]
    }
  ]
}
```

保存接口按申请人角色替换整条链。后端在事务中校验：角色有效、至少一步、顺序连续、角色不重复；随后先删除该申请人角色的旧步骤，再按顺序插入新步骤。

## Workflow Versioning

新增申请使用 `workflow_version = 3`：

- `workflow_version = 1`：保留旧主管/行政字段路径。
- `workflow_version = 2`：保留现有 `supervisor/hr/vp` 步骤、状态和接口。
- `workflow_version = 3`：使用配置生成的通用角色审批步骤。

v3 角色步骤使用 `step_type = 'role'`，请求聚合状态使用 `pending_approval`。调休仍可在角色链之前保留 `delegate` 步骤；请假和加班直接进入角色链。原先按申请类型或请假天数自动追加行政主管、副总的逻辑不适用于 v3。

## Submission Flow

1. 草稿只保存申请内容，不锁定审批链。
2. 正式提交时根据申请人的当前角色读取最新审批链。
3. 对每个审批角色查询可用账号：账号必须启用；如果角色等于申请人角色，必须存在申请人之外的其他启用账号。
4. 任一步没有可用审批人时拒绝提交，并在错误中指出缺失角色。
5. 把代理人步骤（如适用）和角色步骤一次性写入 `attendance_request_approvals`；第一步为 `pending`，其余为 `waiting`。
6. 已写入的步骤就是申请审批链快照，设置变更不回写进行中申请。

工单加班申请当前会创建后立即进入审批；该入口也必须在同一事务内读取最新审批链、校验审批人并写入 v3 步骤。

## Approval Authorization and Progression

新增通用审批接口：

- `POST /attendance/requests/:id/approve`
- 现有 `POST /attendance/requests/:id/reject` 继续使用。

v3 当前角色步骤的授权条件：

- 当前 `pending` 步骤的 `assignee_role` 等于登录用户角色。
- 登录用户不是该申请的提交人。
- 管理员不具备额外绕过能力；只有步骤角色为 `admin` 时才能处理。

同角色任意一人完成步骤后，该步骤立即结束。通过时激活下一个 `waiting` 步骤；没有下一步时完成余额处理并把申请置为 `approved`。驳回时申请立即置为 `rejected`，后续步骤保持未执行。

## Query and UI State

待办查询为 v3 增加条件：存在 `pending` 的角色步骤、步骤角色等于当前用户角色、申请提交人不是当前用户。v2 的管理员兼容授权保持原状，不扩展到 v3。

管理端新增 `pending_approval` 的“待审批”状态显示。待办操作对 v3 调用通用审批接口；v1/v2 继续调用旧接口。

设置页按申请人角色展示有序步骤列表：

- 编号显示第 1、2、3……级。
- 每一步选择审批角色。
- “添加步骤”追加到末尾。
- 上移/下移按钮调整顺序。
- 删除按钮可删除任一步，但仅剩一步时禁用。
- 客户端先提示空链和重复角色，服务端仍做最终校验。

## Compatibility

- 已提交申请的审批行不迁移、不重算。
- v1/v2 状态、审批接口和测试继续保留。
- `attendance_requests.supervisor_role` 保留给历史申请读取；v3 不依赖它。
- 新规则表从现有单步表自动生成默认值，因此上线后不要求管理员立即重配。

## Rollout and Rollback

上线顺序为后端兼容代码与惰性建表、管理端设置 UI、v3 新申请启用。旧表和新增规则表均不删除。已经创建的 v3 申请依赖 v3 代码，因此部署前必须通过完整审批回归；一旦产生 v3 申请，不得直接回滚到不识别 v3 的旧后端，应暂停新提交并以前向修复恢复服务。
