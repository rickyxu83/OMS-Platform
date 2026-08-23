# Phase 1 Data Model: 考勤管理体验优化

**Date**: 2026-08-24

**结论先行**：本特性**无数据库结构变更**。所需字段（`void_reason`、`rejected_reason`）在既有 schema 中均已存在，本次只是前端开始正式使用 `void_reason`。不新增 `ensure*` 惰性迁移函数。

## 既有实体（仅列本特性触及的字段）

### attendance_requests（考勤申请）

| 字段 | 类型 | 本特性关系 |
|---|---|---|
| request_type | VARCHAR | leave / overtime / comp_time（不变） |
| leave_type | VARCHAR | annual/sick/personal/marriage/bereavement（不变） |
| **reason** | TEXT NULL | 维持现状：仅加班单由后端自动生成「工单申请：…」（请假/调休理由录入已经用户裁决砍掉，不启用） |
| status | VARCHAR(32) | draft → pending_* → approved / rejected / withdrawn / voided（不变） |
| **void_reason** | TEXT NULL | **A3 启用**：作废对话框强制填写后落库；此前永远 NULL |
| rejected_reason | TEXT NULL | 既有；A3 把录入入口从 window.prompt 换成 Dialog（行为不变） |
| working_days / hours | DECIMAL | 不变；余额校验逻辑不动 |
| workflow_version | — | 恒 4（新单），审批链推导模型不变 |

**校验规则（沿用既有，不改）**：请假/调休时段按半天槽位（09/14/18）；病假、婚假必传证明；婚丧假按自然日；提交即余额前置校验，终审复核。

### attendance_approval_steps（审批步骤）

v4 角色推导链，本特性不变更步骤生成、状态机与通知逻辑。驳回原因入库路径不变（step 级 + request 级双写）。

### attendance_employee_profiles / 余额台账

- 作废触发 `reverseApprovalLedger` 回滚余额——本特性只补「操作留痕」（void_reason），回滚规则不动。
- 员工档案字段（籍别/入离职/特休规则/启用开关）不变。

### attendance_legal_holidays / 值班相关表

无结构变更；停用/启用、同步预览/确认、值班批次审批的接口与字段全部沿用。

## 状态转移补充说明

作废（voided）本特性后新增约束：**必须携带 void_reason**。该约束在前端 Dialog 强制（必填），后端 `voidRequest` 建议同步加 `if (!reason) throw badRequest('请填写作废原因')`（一行防御，属行为收紧而非结构变更）。
