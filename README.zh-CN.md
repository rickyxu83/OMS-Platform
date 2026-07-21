# OMS Platform 运维智管

<p align="right">
  <a href="./README.md">🌐 English</a> ·
  <strong>🇨🇳 简体中文</strong> ·
  <a href="./README.zh-TW.md">繁體中文</a>
</p>

OMS Platform（中文名：运维智管）是一套面向现场运维、售后服务和客户资产管理的工单协同平台。当前版本采用统一管理工作台，并在管理端提供工程师工单填写入口。

![统一登录入口](docs/screenshots/unified-login.png)

> 公开截图请使用演示数据或脱敏数据，不包含真实客户、工单、手机号、地址、签名、Token 或其他隐私数据。涉及真实数据时请使用实心遮罩或马赛克处理。

## 界面预览

### 管理工作台

![管理工作台总览](docs/screenshots/admin_dashboard.png)

### 新建服务表

![新建服务表](docs/screenshots/new%20sheet.png)

### 客户维护信息

![客户维护信息](docs/screenshots/client%20maintenance.png)

## 使用说明

- [English user guide](docs/wiki/user-guide.en.md)
- [中文使用说明](docs/wiki/user-guide.md)
- [简体中文使用说明](docs/wiki/user-guide.zh-CN.md)
- [繁體中文使用說明](docs/wiki/user-guide.zh-TW.md)

## 核心能力

- **统一入口**：`frontend-admin` 提供统一登录页和管理工作台。
- **管理工作台**：工单处理、工单填写、客户资产、设备资产、维护单位、巡检计划、月报、用户与审计管理。
- **工程师工单填写入口**：工程师侧填单已整合到管理端 `工单填写` 页面。
- **服务记录闭环**：支持现场、远程、内勤记录，覆盖提交、补填、分享导出与月报统计。
- **设备型号自动补全**：设备型号 catalog 支持多词搜索、别名归一化和 fixture 同步。
- **多工作台权限**：工程师、工程主管、主管、管理员等角色按工作台和接口权限隔离。
- **生产部署脚本**：通过 `scripts/deploy.sh` 完成 Git 同步、后端 Docker rebuild、前端构建和 dist 上传。

## 项目结构

```text
.
├── backend                         # Node.js + Express + MySQL API
├── frontend-admin                  # React + Vite，统一登录入口与管理工作台
├── scripts                         # 部署与维护脚本
│   ├── deploy.sh                   # 全量/分模块部署
│   └── deploy-seed.sh              # 设备型号 catalog fixture 部署
├── AGENTS.md                       # 部署与权限约定
└── README.md
```

## 统一登录与工作台跳转

- 统一登录页：`frontend-admin/src/pages/Login.tsx`
- 应用名称配置：`frontend-admin/src/config/app.ts`

常见入口：

- 管理端：`https://<admin-domain>/login`
- 工程师工单填写：通过管理端入口登录后打开 `工单填写`。

## 本地启动

### 后端

```bash
cd backend
npm install
cp .env.example .env
npm start
```

默认 API 地址：

- `http://127.0.0.1:3000/api/v1`

数据库初始化参考：

- [backend/schema.sql](backend/schema.sql)

创建管理员账号：

```bash
cd backend
ADMIN_PASSWORD='replace-with-a-strong-password' npm run create-admin
```

写入轻量演示数据：

```bash
cd backend
SEED_DEMO_PASSWORD='replace-with-a-strong-password' node scripts/seed-demo.js
```

### 管理工作台 / 统一入口

```bash
cd frontend-admin
npm install
npm run dev
```

本地环境变量示例：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
```

## 构建与检查

```bash
cd backend && npm run check
cd frontend-admin && npm run build
cd frontend-admin && npx tsc --noEmit
```

## 部署

真实 SSH 目标、远程目录、域名、Cookie 域名和 CORS 白名单属于私有部署信息，不写入公开仓库。请放在 `AGENTS.local.md`、`docs/deploy.local.md`、`scripts/deploy.local.env`，以及各端 `.env.local` 或生产环境变量文件中。

部署脚本从当前 shell 环境或本地 `scripts/deploy.local.env` 读取真实配置。

| 变量 | 说明 |
|---|---|
| `DEPLOY_SSH_TARGET` | SSH 主机别名或目标 |
| `DEPLOY_REMOTE_ROOT` | 远程项目根目录 |
| `DEPLOY_BACKEND_RELATIVE` | 后端目录相对远程根目录的位置，默认 `app/backend` |
| `DEPLOY_SITE_RELATIVE` | 前端站点目录相对远程根目录的位置，默认 `app/site` |
| `DEPLOY_BACKEND_CONTAINER` | 后端容器名，仅 `deploy-seed.sh` 需要 |
| `DEPLOY_PROJECT_SLUG` | 临时归档名前缀，默认 `oms-platform` |
| `DEPLOY_BRANCH` | Git 目标分支，默认当前分支 |
| `CORS_ALLOWED_ORIGINS` | 后端允许的前端 Origin，逗号分隔 |
| `SESSION_COOKIE_DOMAIN` | 需要跨子域共享登录态时配置 |

如需多套环境，可在 `scripts/deploy.local.env` 中定义 `DEPLOY_<PROFILE>_*` 变量，然后使用 `bash scripts/deploy.sh <profile> <target>`。

```bash
# 默认环境（读取 DEPLOY_* 或 scripts/deploy.local.env）
bash scripts/deploy.sh all
bash scripts/deploy.sh backend
bash scripts/deploy.sh frontend
bash scripts/deploy.sh admin

# 指定本地私有 profile（profile 变量在 scripts/deploy.local.env 中定义）
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
```

部署流程：推送当前分支到 GitHub，上传后端源码，重建后端 Docker 容器，构建管理端前端，然后上传 `dist`。旧 `engineer` / `eng` 部署目标已废弃。工程师侧工单填写由统一管理端前端提供。

`deploy.sh` 不会自动提交。工作区存在未提交变更时，脚本会列出文件并退出。部署前请先检查并提交变更，避免误发布敏感或无关文件。

环境变量示例：

```bash
export DEPLOY_SSH_TARGET=<ssh-alias-or-host>
export DEPLOY_REMOTE_ROOT=<remote-project-root>
export DEPLOY_BACKEND_RELATIVE=app/backend
export DEPLOY_SITE_RELATIVE=app/site
export DEPLOY_PROJECT_SLUG=oms-platform
```

### 发布检查清单

- 运行部署前保持 `git status` 干净。
- 后端改动运行 `cd backend && npm run check`。
- 前端改动运行 `cd frontend-admin && npm run build` 和 `cd frontend-admin && npx tsc --noEmit`。
- 涉及管理端可见功能、页面展示、交互或发布内容变更时，同步提升 `frontend-admin/package.json`、`frontend-admin/package-lock.json` 和 `frontend-admin/src/config/app.ts` 中 `APP_VERSION` fallback 的版本号。
- 涉及后端包发布语义变化时，同步更新 `backend/package.json` 与 `backend/package-lock.json`。
- 提交信息使用中文，一行主题概括动作与对象；需要正文时用 `-` 列出要点。

部署后请在服务器验证后端状态，因为 `deploy.sh` 本身不做健康检查：

```bash
docker ps --filter name=backend --format '{{.Status}}'
docker logs --tail 20 <backend容器名>
docker exec <backend容器名> wget -qO- http://127.0.0.1:3000/api/v1/health
```

健康检查应返回 `{"ok":true}`。排查生产 500 时查看 `docker logs <backend容器名>`；后端错误处理器会记录请求路径和堆栈。

设备型号 catalog fixture 部署：

```bash
bash scripts/deploy-seed.sh
```

## 角色与权限

| 角色 | 管理端 |
|---|---|
| `engineer`（工程师） | 使用工单填写入口，接口按本人过滤；可删除派给自己的 draft/assigned/rejected 工单、可作废本人已结案工单（有意设计） |
| `engineering_supervisor`（工程主管） | 可使用工单填写入口；派单管理可见全部工单 |
| `operations_director`（运营负责人） | 可见全部工单 |
| `administrative_supervisor`（行政主管） | 管理端业务数据只读，不可派单、审批、编辑、删除或改设置 |
| `admin`（管理员） | 全部权限 |

工单填写入口请求本人相关数据时带 `?mine=1`，后端据此过滤 `effectiveEngineerId`。

## 隐私与截图规范

公开 README 和演示材料中请避免展示真实运营数据。必须打码或替换：

- 客户名称、联系人、手机号、邮箱、地址、定位信息
- 工单号、服务内容、故障描述、内部备注、审核意见
- 设备序列号、资产编号、IP/主机名、保修信息
- 工程师姓名、头像、手机号、手写签名
- 审计日志、上传文件名、Token、Cookie、密码、API Key、`.env` 内容

推荐公开截图优先使用：统一登录页、空白/演示数据工作台、空白新建服务表。涉及真实数据时优先使用实心遮罩，其次再使用模糊或马赛克。

## 许可与维护

OMS Platform 是依据 **GNU General Public License v3.0（GPL-3.0）** 发布的自由软件。你可以在 GPL-3.0 条款下使用、学习、修改和再发布本软件。任何修改版或再发布版本都必须继续保留 GPL-3.0 许可条款，并按许可证要求提供相应源代码。

本仓库为 OMS Platform 运维智管的正式项目仓库。生产部署和权限约定可参考 [AGENTS.md](AGENTS.md)。
