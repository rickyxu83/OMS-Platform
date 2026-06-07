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

部署流程：`git commit + push` → 上传后端源码 → Docker rebuild → 构建前端 → 上传 dist。

## 目录结构差异

不同环境的目录结构通过 `DEPLOY_BACKEND_RELATIVE` 和 `DEPLOY_SITE_RELATIVE` 变量适配，不在公开文档中记录真实路径。

## 权限说明

| 角色 | 工程师端 | 管理端 |
|---|---|---|
| `engineer`（工程师） | 只看自己工单 | 不能登录 |
| `engineering_supervisor`（工程主管） | 传 `mine=1` → 只看自己工单 | 可见全部工单（派单管理） |
| `supervisor`（主管） | 不能登录 | 可见全部工单 |
| `admin`（管理员） | 不能登录 | 全部权限 |

工程师端 `TasksView` 请求时带 `?mine=1`，后端据此过滤 `effectiveEngineerId`。
