# Quickstart 验证指南: 登录安全增强

**Date**: 2026-08-24

## 前置

- 分支：按项目约定在 `integration/attendance-mr` 上开发（speckit 编号 002 仅为文档逻辑标识）
- 环境变量（写入本地私有 env，禁止入库）：
  - 后端：`WEBAUTHN_RP_ID`（域名主体，如 `example.com`）、`WEBAUTHN_ORIGINS`（逗号分隔，含 https:// 生产域名、https:// 测试域名、`http://localhost:5173`）
  - 微信：`WECHAT_OPEN_APP_ID`、`WECHAT_OPEN_APP_SECRET`（开放平台网站应用审核通过后获得）
- 质量门（提交前必过，宪法 VI）：

```bash
cd backend && npm run check && npm test
cd frontend-admin && npx tsc --noEmit && npm run build
```

- 部署验证环境：本 worktree 只部署 rn 测试服；生产部署在 main worktree（`/Users/xu/projects/oms`）且需佬明确指示
- **真机要求**（R10）：iPhone、Mac、安卓各至少一台；WebAuthn 不可用模拟器/mock 验证

## 验证场景（对应 spec.md 用户故事）

### S1：通行密钥登记（US1 / FR-002~003）

1. 密码登录管理端 → 我的设置 → 通行密钥区块 → 点「登记本设备」→ 系统唤起生物识别（iPhone Face ID / Mac Touch ID / 安卓指纹）→ 完成后列表出现设备名（自动推断）、登记时间。
2. 同一账号在第二台设备重复登记 → 列表两条；对其中一条改名 → 刷新后保留。
3. 同一设备再次登记 → 浏览器提示已存在（excludeCredentials 生效），列表不新增重复行。

### S2：通行密钥登录（US1 / FR-004~005、SC-001/002）

1. 退出登录 → 登录页只有一个账号输入框 +「继续」→ 输入已登记密钥的邮箱 → 点继续**直接唤起生物识别**（不见密码框）→ 通过后直达工作台（计时 ≤10 秒）。
2. 支持 conditional UI 的浏览器（iOS Safari / Chrome）：点账号输入框 → 系统键盘上方出现通行密钥建议 → 选中即登录。
3. 输入未登记密钥的账号点「继续」→ 展开密码框（无任何「该账号未登记」提示）；密码登录正常。
4. 已登记密钥的账号在密码步点「改用通行密钥验证」→ 唤起生物识别 → 登录成功。
5. 生物识别弹窗中点取消 → 静默落到密码步，密码登录可用。
6. 登录成功后 Cookie 与密码登录一致（`oms_platform_token`，HttpOnly），`/auth/me` 返回相同结构；会话时效 12h。
7. 登录后我的设置中该密钥「最近使用时间」已更新。

### S3：通行密钥失效路径（US1 / 边界）

1. 设置中删除某设备密钥 → 该设备再尝试通行密钥登录 → 失败。
2. 管理员停用某账号 → 该账号通行密钥登录 → 失败口径与密码登录一致。
3. 连续多次失败 → 触发与密码登录同款 IP 限流（429）。

### S4：微信绑定与扫码登录（US2 / FR-006~007、SC-003）

> 前置：佬的微信开放平台企业认证 + 网站应用审核通过，env 已配置。

1. 密码登录 → 我的设置 → 微信区块 → 「绑定微信」→ 页面跳转微信二维码 → 个人微信扫码并确认 → 跳回设置页提示绑定成功，区块显示昵称与绑定时间。
2. 退出 → 登录页「微信扫码登录」→ 跳转微信二维码 → 扫码确认 → 直接进入工作台（≤20 秒）。
3. 未绑定的微信扫码 → 回登录页提示「该微信未绑定内部账号」。
4. 换绑：先解绑再绑新微信 → 旧微信扫码登录失败、新微信成功。
5. 管理员在用户管理中对某用户「清除微信绑定」→ 该用户扫码登录提示未绑定。

### S5：审计留痕（US3 / FR-009、SC-004）

1. 分别以密码 / 通行密钥 / 微信扫码登录成功 → 审计日志三条记录，`detail.method` 分别为 `password_login` / `passkey_login` / `wechat_login`，含 IP 与结果。
2. 通行密钥故意失败（取消生物识别）、微信扫未绑定身份 → 失败记录同样留痕。
3. 登记/删除通行密钥、绑定/解绑微信 → 各有审计记录。

### S6：降级与回归（FR-001/010、SC-005）

1. 本地开发（`http://localhost:5173`）：通行密钥可用（localhost 豁免安全上下文）；纯 IP 访问（`http://192.168.x.x`）→ 通行密钥入口不出现，无控制台报错。
2. env 不配 `WECHAT_OPEN_APP_ID` → 登录页无微信入口，端点 404。
3. 未登记任何新方式的账号走密码登录：UI 与流程与线上现状逐像素一致（零回归）。
4. 账号锁定（连续密码错误）后，通行密钥登录同被锁定口径拒绝。

## 数据核对（可选）

```bash
# RN 测试服
ssh rn 'PW=$(docker exec oms-asset-backend sh -c "echo \$DB_PASSWORD"); \
  docker exec oms-asset-mysql mariadb -u oms_app -p"$PW" oms_platform -e "\
    SELECT user_id, device_name, last_used_at FROM user_passkeys; \
    SELECT user_id, nickname, bound_at FROM wechat_identities; \
    SELECT purpose, consumed_at IS NOT NULL AS consumed FROM auth_challenges ORDER BY id DESC LIMIT 5;"'
```

## 完成判定

- S1~S3（通行密钥）在 iPhone + Mac + 安卓三类真机全过 → US1 可发布
- S4 依赖微信侧审核，可独立排期；S5/S6 随 US1 一并验证
