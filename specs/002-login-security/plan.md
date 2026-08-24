# Implementation Plan: 登录安全增强（生物识别通行密钥 + 微信扫码登录）

**Branch**: `002-login-security` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-login-security/spec.md`

## Summary

为管理端登录增加两类免密登录：① WebAuthn 通行密钥（一套标准同时覆盖 iOS Face ID、macOS Touch ID、安卓指纹/人脸），用户登记后刷脸/按指纹即登录；② 企业微信扫码登录（绑定内部账号后扫码确认即登录）。密码登录保留为兜底，三种方式共用现有 JWT HttpOnly Cookie 会话。后端复用现有限流/审计/惰性迁移约定，前端复用 MySettingsDialog 做密钥与绑定管理。

## Technical Context

**Language/Version**: 后端 Node.js 22（Docker `node:22-alpine`）+ 原生 ESM/CJS 混合（现有 CommonJS）；前端 React 18 + TypeScript 5.8 + Vite 6

**Primary Dependencies**:
- 新增 `@simplewebauthn/server`（FIDO2 断言/注册校验，Node ≥20 ✓）与 `@simplewebauthn/browser`（前端 API 封装）——理由见 Complexity Tracking
- 现有可复用：`express-rate-limit`（登录限流同款）、`jsonwebtoken`、`bcrypt`、`audit_logs` 直写模式

**Storage**: 现有 MariaDB；新表走 `ensure*` 惰性迁移函数（`query()` 返回 rows / `connection.execute()` 返回 `[rows, fields]` 不可混用）

**Testing**: 后端 `node --test` 原生测试（`tests/*.test.js` mock 模式，参照 attendance-workflow-controller.test.js）；前端 `npx tsc --noEmit` + `npm run build`；真机验收走 RN 测试服（佬手动）

**Target Platform**: 管理端 Web（iOS Safari 16+、macOS Safari/Chrome、安卓 Chrome/厂商浏览器；全部要求 HTTPS 有效域名，localhost 豁免）

**Project Type**: web-service（backend + frontend-admin 两端联动）

**Performance Goals**: 通行密钥登录端到端 ≤ 10s（手机扫码级体验）；challenge 校验 < 200ms

**Constraints**:
- WebAuthn 强制安全上下文：非 HTTPS 环境自动隐藏入口（feature-detect `PublicKeyCredential` + `isSecureContext`）
- 不采集/不依赖设备 attestation（内部系统，`attestation: 'none'`）
- 失败响应口径与密码登录一致（模糊化，防账号枚举）
- 微信开放平台凭证（appid/secret）只入 `.env.local` / `deploy.local.env`，禁止入库

**Scale/Scope**: 内部系统全员（数十账号量级）；3 张新表；后端 ~8 个新端点；前端登录页 + 设置对话框两块改动

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 条目 | 结论 | 说明 |
|---|---|---|
| I. 复用优先 | ✅（附条件） | 会话签发复用 `login()` 内 JWT+cookie 逻辑（抽公共函数）；限流复用 `middleware/rate-limit.js` 扩展；审计复用 `audit_logs` 直写模式；管理 UI 复用 `MySettingsDialog`。已 grep 确认无 WebAuthn/微信相关现存实现 |
| II. 技术栈钉死 | ⚠️ 需论证 | 新增 `@simplewebauthn/server` + `@simplewebauthn/browser` 两个依赖，现有依赖无任何 FIDO2 协议实现能力 → 记入 Complexity Tracking。不引日期库、不引新 UI 库 |
| III. 版本号同步 | ✅ | 实现期三处同步（package.json / package-lock / app.ts） |
| IV. 隐私与部署边界 | ✅ | 企业微信 corpid/secret、WebAuthn RP 配置只入本地私有 env；部署先 RN 后 tencent（需佬指示） |
| V. 领域语言一致 | ✅ | 新术语「通行密钥」「微信身份绑定」实现前先补 `CONTEXT.md` 统一语言 |
| VI. 质量门 | ✅ | 后端 `npm run check` + `npm test`；前端 tsc 0 错误 + build 通过；不做本地 mock 截图伪验证，RN 实测 |

**Gate 结论**：通过（II 的依赖新增已在 Complexity Tracking 论证）

**Phase 1 设计后复检**：
- I. 复用优先 ✅——设计落地后仍全部复用：`issueSession` 从现有 `login()` 抽取共用、限流扩展 `rate-limit.js` 同文件、审计用 `audit_logs` 直写模式、管理界面并入 `MySettingsDialog`、请求走 `api.ts`
- II. 依赖新增 ⚠️→✅——仍为 @simplewebauthn 两个包，论证不变；除此以外零新依赖（微信通道用原生 https 调微信 API，不引 SDK）
- III~VI ✅——quickstart.md 已把三处版本号同步、双端质量门、RN 实测（禁伪验证）写进提交前必过项

## Project Structure

### Documentation (this feature)

```text
specs/002-login-security/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出（REST 端点契约）
└── tasks.md             # Phase 2（/speckit.tasks，本命令不生成）
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── modules/
│   │   └── auth/
│   │       ├── controller.js        # 扩展：抽 issueSession 公共函数；新增 webauthn/wechat 处理器
│   │       ├── routes.js            # 扩展：挂载新端点
│   │       ├── webauthn.js          # 新增：通行密钥注册/登录校验逻辑
│   │       └── wechat.js            # 新增：微信开放平台扫码 code 换身份（openid/unionid）
│   ├── middleware/
│   │   └── rate-limit.js            # 扩展：webauthn/wechat 限流器
│   └── config/
│       └── env.js                   # 扩展：WEBAUTHN_*/WECOM_* 配置读取（缺失时功能降级关闭）
└── tests/
    └── auth-webauthn.test.js        # 新增：challenge 生命周期 + 校验逻辑单测

frontend-admin/
└── src/
    ├── pages/
    │   └── Login.tsx                # 扩展：登录方式切换（密码/通行密钥/微信扫码）
    ├── components/
    │   └── MySettingsDialog.tsx     # 扩展：通行密钥管理 + 微信绑定管理区块
    └── services/
        └── api.ts                   # 扩展：新端点封装（禁止组件内裸 fetch）
```

**Structure Decision**: 沿用现有「后端模块制 + 前端页面/组件分离」结构，全部改动收敛在 auth 模块与登录/设置两处前端文件，不新开顶层目录。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| 新增依赖 `@simplewebauthn/server` + `@simplewebauthn/browser`（宪法 II） | WebAuthn/FIDO2 涉及 COSE 公钥解析、断言签名校验、challenge 防重放等密码学协议，手写等于自实现安全协议（高危）；现有 package.json 无任何相关能力 | 手写 WebAuthn 校验——安全协议自实现是事故温床；用 Passport 等全家桶——引入更重框架且仍需 webauthn 策略层 |

## 产品决策点（待佬裁决，不阻塞设计，阻塞实现排期）

1. **微信扫码 = 个人微信 + 开放平台「网站应用」扫码（佬已裁决绑个人微信）**：前置为公司主体完成微信开放平台企业认证（300 元/年）+ 网站应用审核（域名需 ICP 备案）。审核周期内可先交付 US1（通行密钥），微信入口配置就绪前整体隐藏
2. **通行密钥定位为密码替代（passwordless）而非 2FA**：登记后登录不再要密码。若佬要「密码+刷脸」双因子，方案需改（本期不建议，内部系统过度设计）
3. **全员可选 vs 按角色强制**：本期默认全员自愿登记，密码兜底保留
