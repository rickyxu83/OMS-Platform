# Contracts: 微信扫码登录端点（开放平台「网站应用」通道）

**Base**: `/api/v1/auth` | **Date**: 2026-08-24 | **Data**: [../data-model.md](../data-model.md)

约定：
- 采用微信开放平台扫码：二维码页由微信侧承载（`open.weixin.qq.com/connect/qrconnect`），PC 浏览器**整页跳转**过去，扫码确认后微信把浏览器重定向回本系统回调——无需前端轮询
- `WECHAT_OPEN_APP_ID` 未配置时全部端点 `404`，登录页不渲染微信入口
- 公开端点挂 IP 限流；state 一次性消费（防 CSRF/重放）

## 1. 登录：发起扫码（未登录）

```
GET /api/v1/auth/wechat/qrcode-url            （公开，IP 限流）
→ 200 { "qrUrl": "https://open.weixin.qq.com/connect/qrconnect?appid=...&redirect_uri=...&response_type=code&scope=snsapi_login&state=<ticket>#wechat_redirect" }
```
- 服务端建 `auth_challenges` 行（purpose=`wechat_login`，challenge 即 state，TTL 5 分钟）
- 前端拿到 qrUrl 后整页跳转

## 2. 微信回调（未登录，由微信重定向而来）

```
GET /api/v1/auth/wechat/callback?code=...&state=...   （公开，IP 限流）
```

处理：
1. state 校验（存在、未过期、未消费）→ 否则 302 回登录页 `?loginError=wechat_state`
2. `code` 换身份：`GET api.weixin.qq.com/sns/oauth2/access_token?appid&secret&code&grant_type=authorization_code` → `openid`/`unionid`；失败 → 302 `?loginError=wechat_exchange`
3. 按 state 的 purpose 分流：
   - `wechat_login`：查 `wechat_identities`
     - 已绑定且用户 active → 消费票据 → `issueSession()` → **302 到管理端首页**
     - 未绑定 → 302 回登录页 `?loginError=wechat_unbound`（引导先密码登录后绑定）
     - 已绑定但用户停用 → 302 `?loginError=account_disabled`（口径与密码登录一致）
   - `wechat_bind`（见 §3）：绑定成功 → 302 到管理端「我的设置」`?wechat=bound`
4. 全环节写审计日志（detail.method=`wechat_login` / `wechat_bind`）

## 3. 绑定/解绑（已登录）

```
POST /api/v1/auth/wechat/bind/start           （需登录）
Body: {}
→ 200 { "qrUrl": "...&state=<ticket>#wechat_redirect" }
```
- 建 `auth_challenges`（purpose=`wechat_bind`，user_id=当前用户）；回调时把该微信身份绑给此用户
- 当前用户已绑定 → `400 已绑定微信，请先解绑`；目标微信身份已被他人绑定 → 回调时 302 `?wechatBind=conflict`

```
GET    /api/v1/auth/wechat/binding            （需登录）
→ 200 { "binding": null | { "nickname": "...", "boundAt": "...", "lastLoginAt": "..." } }

DELETE /api/v1/auth/wechat/binding            （需登录）
→ 200 { "ok": true }        （物理删除 + 审计留痕）
```

## 4. 管理员清除绑定（用户管理入口扩展）

```
DELETE /api/v1/users/:id/wechat-binding       （需 user.edit 权限）
→ 200 { "ok": true }
→ 404 该用户没有微信绑定
```
- 用于员工微信丢失/离职场景；写审计日志（actor=管理员，detail.method=`wechat_unbind_admin`）

## 前端行为契约

| 场景 | 登录页表现 |
|---|---|
| `login-methods.wechat=false` | 不渲染微信入口 |
| 回调 `?loginError=wechat_unbound` | toast「该微信未绑定内部账号，请先用密码登录后在『我的设置』绑定」 |
| 回调 `?loginError=wechat_state/exchange` | toast「扫码已过期，请重试」 |
| 回调 `?wechat=bound`（设置页） | toast「微信绑定成功」并刷新 binding 状态 |
