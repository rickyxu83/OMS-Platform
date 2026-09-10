# 数据模型：MR 作废审批

## mr_orders 变更（ensure 惰性迁移）

| 字段                  | 类型              | 说明                                                                                                                     |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `void_request_status` | VARCHAR(20) NULL  | NULL=无申请；`pending`=审批中；`rejected`=已驳回（已解锁，可重新申请）。作废生效后订单 status=voided，本字段保留末态备查 |
| `void_request_stage`  | VARCHAR(20) NULL  | 场景二用：`admin_review`=待行政主管；`sales_review`=待业务主管。场景一固定 `sales_review`。跳过自审直接生效时不落中间态  |
| `void_requested_by`   | INT NULL          | 发起人 user id                                                                                                           |
| `void_requested_at`   | DATETIME NULL     | 发起时间                                                                                                                 |
| `void_reason`         | （已有）          | 发起时即写入，生效后沿用                                                                                                 |
| `void_reject_reason`  | VARCHAR(500) NULL | 最近一次驳回原因（驳回必填）                                                                                             |
| `void_rejected_by`    | INT NULL          | 最近驳回人                                                                                                               |
| `void_rejected_at`    | DATETIME NULL     | 最近驳回时间                                                                                                             |

锁定判定：`void_request_status = 'pending'` 时，controller 层对 edit / submit / withdraw / purchase / contract-no 等全部变更入口统一拦截（在 `loadLockedOrder` 后加断言，复用事务）。

## mr_void_approvals（新表，审批留痕）

| 字段        | 类型                  | 说明                             |
| ----------- | --------------------- | -------------------------------- |
| id          | INT AUTO_INCREMENT PK |                                  |
| mr_id       | INT NOT NULL          | 关联 mr_orders                   |
| round       | INT NOT NULL          | 第几次申请（驳回后重新申请递增） |
| stage       | VARCHAR(20) NOT NULL  | `admin_review` / `sales_review`  |
| approver_id | INT NOT NULL          | 审批人                           |
| action      | VARCHAR(10) NOT NULL  | `approved` / `rejected`          |
| reason      | VARCHAR(500) NULL     | 驳回时必填                       |
| created_at  | DATETIME              |                                  |

场景一审批链：`[sales_review]`（跳过自审时无记录或直接落一条 system 记录，实现时定）。
场景二审批链：`[admin_review, sales_review]` 顺序推进。

## 通知事件（mr_notification_outbox event 新增）

| event                      | 触发时机             | 收件人                                                  |
| -------------------------- | -------------------- | ------------------------------------------------------- |
| `void_request_supervisor`  | 场景一发起           | 业务主管                                                |
| `void_request_purchaser`   | 场景一发起           | 采购（未指派采购时通知**全体采购角色用户**，佬已拍板）  |
| `void_request_admin`       | 场景二发起           | 行政主管                                                |
| `void_request_supervisor2` | 场景二行政主管通过后 | 业务主管                                                |
| `void_rejected`            | 任一级驳回           | 发起人 + 采购（场景一）/ 采购（场景二），邮件含驳回原因 |
| `void`（已有，文案复用）   | 作废生效             | 签核链所有签核人（业务主管除外）+ 采购（场景一）        |

邮件模板在 `backend/src/services/mail.js` eventLabels 扩展，驳回类模板渲染 `void_reject_reason`。

## 待办列表

作废审批请求进业务主管 / 行政主管待办（与签核待办同一入口）：`void_request_status = 'pending'` 且当前 `void_request_stage` 对应本人角色的单，出现在其待办列表，审批后消失。

## 权限目录（permissions/catalog.js）

- `mr.void` 角色列表：移除 `admin`、`operations_director`、`sales_supervisor`（主管作为发起人走业务身份判断，作为审批人走新权限）。
- 新增 `mr.void_approve`：`['sales_supervisor', 'administrative_supervisor']`（审批入口）。
- 场景二采购发起：`mr.void` 增加 `purchaser`，controller 层 `canVoidRequest` 按 purchaseStatus 与身份细化判断（权限目录只管进门，业务条件在 controller）。
