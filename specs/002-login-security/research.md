# Phase 0 Research: 登录安全增强

## R1. 生物识别登录的技术载体

**Decision**: 采用 WebAuthn（FIDO2）平台认证器，即「通行密钥 / Passkey」。

**Rationale**: 用户点名的四种能力——iPhone Face ID、Mac Touch ID、安卓指纹、安卓人脸——**全部由操作系统在 WebAuthn 平台认证器层统一提供**：iOS Safari `navigator.credentials` 走 Face ID/Touch ID，安卓 Chrome 走指纹/人脸，Windows 走 Hello。一套前端 API + 一套后端校验全覆盖，无需为任何平台单独开发。纯 Web 标准，管理端本身就是浏览器应用，零 App 开发量。

**Alternatives considered**:
- 原生 App + 系统生物识别 API：要开发/分发 iOS+安卓双端 App，投入量级不匹配（否决）
- 短信/邮件验证码登录：体验差于生物识别且依赖外部通道费用，可作将来兜底（本期不做）

## R2. WebAuthn 服务端/前端库

**Decision**: `@simplewebauthn/server`（后端校验）+ `@simplewebauthn/browser`（前端封装）。

**Rationale**: WebAuthn 校验涉及 COSE 公钥解析、authenticatorData 解析、签名验证、challenge 防重放、签名计数器防克隆——属于密码学协议实现，手写是高危行为。SimpleWebAuthn 是该领域事实标准（FIDO 联盟成员维护），Node ≥20 兼容（生产 node:22-alpine ✓）。前端 `@simplewebauthn/browser` 同时提供 `browserSupportsWebAuthn()` / `platformAuthenticatorIsAvailable()` 能力探测，正好支撑「不支持就隐藏入口」的需求。

**Alternatives considered**:
- 手写校验：安全协议自实现 = 事故温床（否决）
- Passport.js + passport-webauthn：引入整套框架仅为一个登录口，过重（否决）

## R3. 通行密钥登录的交互形态

**Decision**: 双形态——① 登录页「通行密钥登录」按钮（标识符优先：输入邮箱/别名 → 拉取该账号的 challenge → 唤起生物识别）；② 通行证自动填充（conditional UI，在账号输入框上挂 `autocomplete="username webauthn"`，浏览器原生下拉直接列出本机通行密钥）。

**Rationale**: 按钮形态是所有浏览器都支持的基线路径；conditional UI 是渐进增强（支持的浏览器上体验最接近「无感登录」）。两者共用同一对 options/verify 端点。

**Alternatives considered**:
- 仅 conditional UI：老浏览器无入口，需要按钮兜底，砍掉意义不大
- 仅按钮：损失最好体验的那部分用户

## R4. 账号枚举防护

**Decision**: 登录 options 端点对「不存在的账号」也返回结构完整但不可满足的 challenge（`allowCredentials: []` + 随机 challenge），响应结构与耗时对齐真实账号；verify 失败统一报「通行密钥验证失败」，不区分「没登记过」「设备不对」「账号不存在」。端点挂与密码登录同款的 IP 限流。

**Rationale**: 与现有密码登录「等时哈希比对 + 统一错误文案」的防护口径一致（auth/controller.js 已有该模式）。

## R5. Challenge 存储

**Decision**: 新建 `auth_challenges` 表（challenge 串、用途、关联用户、过期时间、消费标记），5 分钟过期、一次性消费、用完即标记。

**Rationale**: 项目宪法约定 DB 结构变更走 `ensure*` 惰性迁移函数，新表完全贴合；一次性消费 + 服务端过期是最直接的防重放。企业微信扫码的 `state` 防 CSRF 票据也复用这张表（purpose 区分）。

**Alternatives considered**:
- 短期 JWT 无态携带 challenge：无法服务端一次性消费，重放窗口靠短 TTL 硬扛，且与项目 ensure* 惯例不如建表贴合（否决）

## R6. 微信扫码登录的通道选型（2026-08-24 佬裁决：公司无企业微信，绑个人微信）

**Decision**: 个人微信扫码登录 PC 端的三条官方路径中，推荐 **A. 微信开放平台「网站应用」扫码**（`open.weixin.qq.com/connect/qrconnect` 内嵌二维码 → 个人微信扫码 → 手机确认 → 回调 `code` → `oauth2/access_token` 换 `openid`/`unionid` → 绑定表映射内部账号 → 签发会话）。

**Rationale**: 这是全中国互联网 PC 站「微信扫码登录」的标准形态，用户体验与用户心智完全一致；身份标识用 unionid（公司主体下多应用可复用）。

**成本与前置（不阻塞设计，阻塞 US2 排期）**：
- 微信开放平台企业认证：**300 元/年**，公司主体 + 对公验证
- 创建「网站应用」需审核：要求域名已 ICP 备案、提供官网信息

**Alternatives considered**:
- B. 认证服务号「带参二维码 + 事件回调」：同为 300 元/年，用户未关注公众号时需先关注多一步，且后端要额外维护微信服务器推送回调（消息加解密），运维面更大；若公司已有认证服务号可改走此路
- C. 小程序码 + 小程序内确认：注册免费但需开发并审核一个极简小程序，用户多一步打开小程序的操作，总成本并不低
- 三条路径在「拿到微信身份后的绑定/登录签发」完全一致，contracts 层把微信身份获取隔离为单一环节，换通道不伤架构

**与既有决策的关系**：R5 的 challenge 表复用为扫码 state 防 CSRF 票据；R7 会话签发不变。

## R7. 会话签发复用

**Decision**: 把现有 `login()` 里的 JWT 签发 + `setSessionCookie` + `sessionPayload` 抽成 `issueSession(req, res, user)` 公共函数，密码/通行密钥/微信扫码三条路径共用。

**Rationale**: 宪法 I 复用优先；保证三种登录方式的会话形态（12h JWT HttpOnly Cookie、`SESSION_COOKIE_DOMAIN` 跨子域共享）完全一致，前端登录后逻辑零改动。

## R8. 前端管理界面落点

**Decision**: 通行密钥管理（列表/删除）与微信绑定/解绑都放进现有 `MySettingsDialog`（可复用资产货架在册组件）新增区块，不新建页面。

**Rationale**: 宪法 I；该对话框本就是「我的设置」聚合入口（改密码等），登录方式管理是它的自然延伸。

## R9. 环境配置与降级

**Decision**: `env.js` 新增 `WEBAUTHN_RP_ID`、`WEBAUTHN_ORIGINS`（逗号分隔，覆盖生产域名/测试域名/localhost）、`WECHAT_OPEN_APP_ID`、`WECHAT_OPEN_APP_SECRET`、回调地址。未配置时对应功能整体关闭（前端入口不渲染），保证各环境可按需灰度。

**Rationale**: 与现有 `env.js` 启动门禁约定一致（缺失即功能关闭而非启动失败，因为属于可选增强而非核心依赖——与 JWT_SECRET 的硬门禁区分开）。

**Alternatives considered**: 缺失时启动即崩——可选功能不应阻塞主系统启动（否决）。

## R10. 真机验证策略

**Decision**: 不做本地 headless 模拟（项目工作流规则明令禁止伪验证），RN 测试服部署后由佬用真机验收：iPhone（Face ID）、Mac（Touch ID）、安卓（指纹）各至少一台，微信扫码用佬的企业微信实测。

**Rationale**: WebAuthn 的兼容性问题只在真实设备/真实浏览器上暴露（安全上下文、平台认证器可用性、conditional UI 行为），模拟器无法覆盖；微信扫码依赖真实微信客户端确认，同样只能实测。
