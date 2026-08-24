# Phase 1 Data Model: 登录安全增强

**Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

全部新表走 `ensure*` 惰性迁移函数（请求时 `CREATE TABLE IF NOT EXISTS`），与考勤模块同一约定。注意 `query()` 返回 rows、`connection.execute()` 返回 `[rows, fields]`，不可混用。

## 1. `user_passkeys`（通行密钥）

归属于某用户的某台设备的 WebAuthn 凭据。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| user_id | BIGINT UNSIGNED NOT NULL | 所属用户 → users.id |
| credential_id | VARCHAR(255) NOT NULL UNIQUE | WebAuthn 凭据 ID（Base64URL），全局唯一 |
| public_key | TEXT NOT NULL | COSE 公钥（Base64URL） |
| counter | BIGINT UNSIGNED NOT NULL DEFAULT 0 | 签名计数器，防凭据克隆（校验后更新） |
| transports | VARCHAR(255) NULL | 传输方式提示（usb/nfc/ble/internal/hybrid），逗号分隔 |
| device_name | VARCHAR(64) NOT NULL | 用户可读的设备名（「我的 iPhone」），登记时自动生成可改 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 登记时间 |
| last_used_at | DATETIME NULL | 最近登录使用时间 |

索引：`KEY idx_user_passkeys_user (user_id)`；`credential_id` 已 UNIQUE。

**验证规则**：
- 每用户通行密钥数量上限 10 个（防滥用，正常人多端 3~5 个足够）
- `device_name` 默认由 userAgent 推断（iPhone/Mac/Android/Windows），允许用户改名
- 删除即物理删除（凭据无业务追溯价值；删行同时写审计日志留痕）

## 2. `wechat_identities`（微信身份绑定）

内部用户与个人微信身份的绑定关系。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| user_id | BIGINT UNSIGNED NOT NULL UNIQUE | 内部用户 → users.id（一人绑一个微信） |
| provider | VARCHAR(16) NOT NULL DEFAULT 'wechat_open' | 通道标识（本期固定 `wechat_open` 开放平台；为将来服务号/小程序通道预留） |
| openid | VARCHAR(64) NOT NULL | 微信开放平台该网站应用下的用户标识 |
| unionid | VARCHAR(64) NULL | 公司主体跨应用统一标识（开放平台返回才有） |
| nickname | VARCHAR(64) NULL | 绑定时微信昵称（便于用户辨认「我绑的是哪个微信」） |
| bound_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 绑定时间 |
| last_login_at | DATETIME NULL | 最近扫码登录时间 |

索引：`UNIQUE KEY uniq_wechat_openid (provider, openid)`（同一微信身份全系统只能绑一个内部账号，FR-006）。

**验证规则**：
- 换绑 = 先解绑再绑定（不允许直接覆盖，防误操作顶号）
- 解绑物理删除 + 审计留痕
- 用户被停用（users.status ≠ active）时绑定关系保留但登录拒绝（与密码登录同口径）

## 3. `auth_challenges`（登录挑战/票据）

WebAuthn 注册/登录 challenge 与微信扫码 state 的统一存放，防重放。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| challenge | VARCHAR(128) NOT NULL UNIQUE | 挑战串（Base64URL 随机 ≥32 字节；微信流程作 state 用） |
| purpose | VARCHAR(32) NOT NULL | `webauthn_register` / `webauthn_login` / `wechat_login` / `wechat_bind` |
| user_id | BIGINT UNSIGNED NULL | 关联用户（注册/绑定流程必填；登录流程在 verify 前可为空） |
| payload | TEXT NULL | 附加上下文（JSON：如 WebAuthn 登录的 userHandle、微信回调的 redirect 目标） |
| expires_at | DATETIME NOT NULL | 过期时间（创建 +5 分钟） |
| consumed_at | DATETIME NULL | 消费时间（一次性；非空即作废） |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

索引：`KEY idx_auth_challenges_expiry (expires_at)`（惰性清理过期行：每次写入新 challenge 时顺手 `DELETE ... WHERE expires_at < NOW() - INTERVAL 1 DAY`，不建调度任务）。

**状态机**：`有效（consumed_at NULL 且未过期）→ 已消费 / 已过期`，两个终态都不可用，无复活的中间态。

## 与现有表的关系

- 三张表均弱关联 `users.id`（不加外键约束，与项目现有风格一致；用户删除时应用层清理）
- 登录审计沿用现有 `audit_logs` 表（`target_type='auth'`），不新建
- 会话沿用 JWT + HttpOnly Cookie（`oms_platform_token`），不新建会话表
