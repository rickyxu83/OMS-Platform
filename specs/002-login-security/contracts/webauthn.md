# Contracts: 通行密钥（WebAuthn）端点

**Base**: `/api/v1/auth` | **Date**: 2026-08-24 | **Data**: [../data-model.md](../data-model.md)

约定：
- 「公开」端点（未登录可调）一律挂与 `/login` 同款的 IP 限流（`middleware/rate-limit.js` 扩展）
- 错误口径模糊化：登录类失败统一 `401 通行密钥验证失败`，不区分账号不存在/未登记/设备不符
- 功能未配置（`WEBAUTHN_RP_ID` 缺失）时全部端点返回 `404`，前端入口整体不渲染
- verify 类端点请求体含密码学响应，**不进入**审计 detail（审计中间件已对敏感键脱敏，另见 quickstart 审计验证）

## 0. 登录方式探测

```
GET /api/v1/auth/login-methods   （公开，无限流，仅返回能力开关）
→ 200 { "password": true, "passkey": true, "wechat": false }
```

前端登录页据此 + `window.PublicKeyCredential`/`isSecureContext` 决定渲染哪些入口。

## 1. 登记通行密钥（已登录）

```
POST /api/v1/auth/webauthn/register/options    （需登录）
Body: {}
→ 200 {
    "challengeToken": "<auth_challenges.challenge>",
    "publicKey": { ...PublicKeyCredentialCreationOptions, "authenticatorSelection": { "residentKey": "preferred", "userVerification": "required" } }
  }
```
- 服务端建 `auth_challenges` 行（purpose=`webauthn_register`，user_id=当前用户，TTL 5 分钟）
- `excludeCredentials` 带该用户已有凭据，防同一设备重复登记
- 每用户凭据数达 10 → `400 通行密钥数量已达上限`

```
POST /api/v1/auth/webauthn/register/verify     （需登录）
Body: { "challengeToken": "...", "response": { ...RegistrationResponseJSON }, "deviceName": "我的 iPhone" }
→ 200 { "ok": true, "credential": { "id": 12, "deviceName": "我的 iPhone", "createdAt": "2026-08-24 16:00:00" } }
→ 400 通行密钥登记失败（challenge 过期/已消费/校验不过，统一口径）
```
- 校验通过 → 写 `user_passkeys` + 审计日志（action=`create`，target_type=`auth`，detail.method=`passkey_register`）

## 2. 管理通行密钥（已登录）

```
GET    /api/v1/auth/webauthn/credentials
→ 200 { "items": [ { "id": 12, "deviceName": "我的 iPhone", "createdAt": "...", "lastUsedAt": "..." } ] }

PATCH  /api/v1/auth/webauthn/credentials/:id   Body: { "deviceName": "新名字" }  → 200 { "ok": true }

DELETE /api/v1/auth/webauthn/credentials/:id   → 200 { "ok": true }
```
- 仅本人凭据可见可改（`WHERE id=:id AND user_id=:currentUserId`，跨用户操作返回 404）
- 删除写审计日志

## 3. 通行密钥登录（未登录）

```
POST /api/v1/auth/webauthn/login/options       （公开，IP 限流）
Body: { "identifier": "wang@example.com" }     // 按钮流程必填；conditional UI 流程传空
→ 200 { "challengeToken": "...", "publicKey": { ...PublicKeyCredentialRequestOptions } }
```
- identifier 命中用户且有凭据 → `allowCredentials` 带其凭据列表
- identifier 不存在/无凭据/传空 → `allowCredentials: []` + 随机 challenge（**响应结构一致，防枚举**，R4）
- conditional UI：`userVerification: "required"`，`allowCredentials` 为空即 discoverable 模式

```
POST /api/v1/auth/webauthn/login/verify        （公开，IP 限流）
Body: { "challengeToken": "...", "response": { ...AuthenticationResponseJSON } }
→ 200 { ...sessionPayload（与密码登录响应结构完全一致） }   + Set-Cookie: oms_platform_token=...
→ 401 通行密钥验证失败
```
- challenge 一次性消费（UPDATE consumed_at 条件更新，0 affected = 已消费/重放 → 401）
- 校验通过：更新 `user_passkeys.counter`（防克隆）+ `last_used_at`，调共享 `issueSession()` 签发会话（R7）
- 用户已停用/锁定 → 与密码登录同口径 401
- 成功/失败均写审计日志（detail.method=`passkey_login`，含结果与 IP）
