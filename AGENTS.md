# 部署

## 隐私约定

本文件会随仓库提交，只保留公开的部署流程和权限约定。真实服务器、SSH 别名、远程目录、域名、Cookie 域名、CORS 白名单等信息放在本地私有文件中，不提交到 GitHub：

- `AGENTS.local.md`
- `docs/deploy.local.md`
- `scripts/deploy.local.env`
- 各端 `.env.local` / `.env.production` / `.env.production.local`

## 部署配置

部署脚本从环境变量或 `scripts/deploy.local.env` 读取真实配置。

| 变量 | 说明 |
|---|---|
| `DEPLOY_SSH_TARGET` | SSH 主机别名或目标 |
| `DEPLOY_REMOTE_ROOT` | 远程项目根目录 |
| `DEPLOY_BACKEND_RELATIVE` | 后端目录相对远程根目录的位置，默认 `app/backend` |
| `DEPLOY_SITE_RELATIVE` | 前端站点目录相对远程根目录的位置，默认 `app/site` |
| `DEPLOY_BACKEND_CONTAINER` | 后端容器名，仅 `deploy-seed.sh` 需要 |
| `CORS_ALLOWED_ORIGINS` | 后端允许的前端 Origin，逗号分隔 |
| `SESSION_COOKIE_DOMAIN` | 需要跨子域共享登录态时配置 |

如需多套环境，可在 `scripts/deploy.local.env` 中定义 `DEPLOY_<PROFILE>_*` 变量，然后使用 `bash scripts/deploy.sh <profile> <target>`。

## 一键部署

```bash
# 默认环境（读取 DEPLOY_* 或 scripts/deploy.local.env）
bash scripts/deploy.sh all              # 全量：Git → 后端 → 前端
bash scripts/deploy.sh backend          # 仅后端
bash scripts/deploy.sh frontend         # 仅前端
bash scripts/deploy.sh admin            # 仅管理端
bash scripts/deploy.sh engineer         # 仅工程师端

# 指定本地私有 profile
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
bash scripts/deploy.sh <profile> eng
```

部署流程：上传后端源码 → Docker rebuild → 构建前端 → 上传 dist。

> **注意**：`deploy.sh` 会先把当前分支推送到 GitHub，但**不会自动提交**——工作区有未提交变更时脚本会列出文件并报错退出。部署前必须自行 `git commit`（这是有意为之，防止误提交敏感/无关文件）。

## 提交规范

- 提交信息用**中文**，一行主题概括动作与对象（如 `修复巡检计划列表 500：…`、`安全加固：…`），需要时正文用 `-` 列出要点
- 按逻辑单元拆分提交（安全修复 / 性能优化 / 死代码清理分开），不要混在一个大提交里
- 部署即发布：推送到 `origin/main` 的内容会被部署脚本带上生产，不要推半成品

## 部署前后检查（AI 执行部署时必做）

**部署前：**

1. `git status` 干净、改动已按逻辑提交
2. 后端改动跑 `npm run check`（语法检查）；前端改动跑对应端 `npm run build`，admin 端另跑 `npx tsc --noEmit`（当前保持 0 错误）
3. 涉及 `backend/src/config/env.js` 启动门禁的改动：先确认服务器 compose 已设 `NODE_ENV=production` 和 `JWT_SECRET`，否则容器会启动失败（这是有意的安全门禁）

**部署后（deploy.sh 自身没有健康检查）：**

```bash
# 在服务器上验证（SSH 别名见 scripts/deploy.local.env）
docker ps --filter name=backend --format '{{.Status}}'                      # 应为 Up
docker logs --tail 20 <backend容器名>                                        # 无报错、监听日志正常
docker exec <backend容器名> wget -qO- http://127.0.0.1:3000/api/v1/health    # {"ok":true}
```

**排查生产 500：** `errorHandler` 会对 500 打 `console.error`（含请求路径与堆栈），直接 `docker logs <backend容器名>` 查看。

## 基础设施约定

- 生产前置反向代理为**单层 Caddy**，后端 `app.set('trust proxy', 1)` 与之匹配；若以后在前面加 SLB/CDN 层，需同步调整该值，否则限流按错误 IP 计数
- 数据库结构变更走代码内的 `ensure*` 惰性迁移函数（请求时执行 `CREATE TABLE IF NOT EXISTS` / 条件 `ALTER`），无独立迁移工具。写这类函数注意：`query()` 直接返回 rows，`connection.execute()` 返回 `[rows, fields]`，两种形态不要混用（曾导致巡检计划 500）
- 删除被外键依赖的索引前，先补一个能支撑外键的替代索引，并遵循"先建新、后删旧"顺序

## 目录结构差异

不同环境的目录结构通过 `DEPLOY_BACKEND_RELATIVE` 和 `DEPLOY_SITE_RELATIVE` 变量适配，不在公开文档中记录真实路径。

## 权限说明

| 角色 | 工程师端 | 管理端 |
|---|---|---|
| `engineer`（工程师） | 只看自己工单 | 不能登录 |
| `engineering_supervisor`（工程主管） | 传 `mine=1` → 只看自己工单 | 可见全部工单（派单管理） |
| `operations_director`（运营负责人） | 不能登录 | 可见全部工单 |
| `admin`（管理员） | 不能登录 | 全部权限 |

工程师端 `TasksView` 请求时带 `?mine=1`，后端据此过滤 `effectiveEngineerId`。
