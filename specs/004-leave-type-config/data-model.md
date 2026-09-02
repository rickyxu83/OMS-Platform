# Data Model: 假别元数据可配置

## `attendance_leave_types`（新表，惰性迁移创建）

| 列                          | 类型                          | 说明                                                                          |
| --------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `id`                        | INT AUTO_INCREMENT PK         |                                                                               |
| `code`                      | VARCHAR(32) NOT NULL UNIQUE   | 假别代码（`annual`/`maternity` 等），创建后不可改；单据 `leave_type` 引用此值 |
| `label`                     | VARCHAR(64) NOT NULL          | 显示名称（产假、陪产假…），可改                                               |
| `enabled`                   | TINYINT(1) NOT NULL DEFAULT 1 | 停用后不出现在申请下拉，历史数据不受影响                                      |
| `sort_order`                | INT NOT NULL DEFAULT 0        | 下拉与列表排序，升序                                                          |
| `requires_proof`            | TINYINT(1) NOT NULL DEFAULT 0 | 提交/审批是否要求上传证明（替代写死的 requiresLeaveProof）                    |
| `include_non_working_days`  | TINYINT(1) NOT NULL DEFAULT 0 | 请假时段是否含非工作日（替代写死的 marriage/bereavement 数组）                |
| `counts_balance`            | TINYINT(1) NOT NULL DEFAULT 0 | 是否计系统余额（当前仅 annual=1，预留）                                       |
| `reference_days`            | VARCHAR(64) NULL              | 参考天数自由文案（如 "98+60"、"按当地政策"），仅展示不校验                    |
| `policy_note`               | VARCHAR(500) NULL             | 政策说明自由文案，申请页/详情/邮件展示                                        |
| `paid_quota_days`           | DECIMAL(5,1) NULL             | 年度带薪额度（自然年，按已批准天数跟踪）；仅病假等政策性强假别配置，其余 NULL |
| `exceed_deduction_percent`  | INT NULL                      | 超出带薪额度部分的减薪比例（如 30），仅用于提示文案，不参与核算               |
| `system_reserved`           | TINYINT(1) NOT NULL DEFAULT 0 | 系统保留（annual），禁止停用/删除/改 code                                     |
| `created_at` / `updated_at` | DATETIME                      |                                                                               |

索引：`uk_attendance_leave_types_code (code)`。

### Seed（首次 ensure 时写入，行为与现写死版本对齐）

| code        | label | requires_proof | include_non_working_days | counts_balance | system_reserved | paid_quota_days | exceed_deduction_percent |
| ----------- | ----- | -------------- | ------------------------ | -------------- | --------------- | --------------- | ------------------------ |
| annual      | 特休  | 0              | 0                        | 1              | 1               | NULL            | NULL                     |
| sick        | 病假  | 1              | 0                        | 0              | 0               | 3               | 30                       |
| personal    | 事假  | 0              | 0                        | 0              | 0               | NULL            | NULL                     |
| marriage    | 婚假  | 1              | 1                        | 0              | 0               | NULL            | NULL                     |
| bereavement | 丧假  | 1              | 1                        | 0              | 0               | NULL            | NULL                     |

> seed 前需核对 `requiresLeaveProof` 现状实现，以上取值以对齐现状为准，实现时校正。

## `attendance_requests`（加列）

| 列                     | 类型              | 说明               |
| ---------------------- | ----------------- | ------------------ |
| `leave_type_label`     | VARCHAR(64) NULL  | 提交时假别名称快照 |
| `leave_reference_days` | VARCHAR(64) NULL  | 提交时参考天数快照 |
| `leave_policy_note`    | VARCHAR(500) NULL | 提交时政策说明快照 |

仅请假类（`request_type='leave'`）写入；历史行保持 NULL，展示层回退查表 label。

## 展示取值链（label）

`快照 leave_type_label` → `leave_types 表现行 label` → `code 原文`（防已删历史数据裸奔）
