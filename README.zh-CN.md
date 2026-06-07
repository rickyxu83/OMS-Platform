# OMS Platform 运维智管

<p align="right">
  <a href="./README.md">🌐 English</a> ·
  <strong>🇨🇳 简体中文</strong> ·
  <a href="./README.zh-TW.md">繁體中文</a>
</p>

OMS Platform（中文名：运维智管）是一套面向现场运维、售后服务和客户资产管理的工单协同平台。当前版本采用统一登录入口，根据账号权限进入管理工作台或工程师工作台。

![统一登录入口](docs/screenshots/unified-login.png)

> 公开截图请使用演示数据或脱敏数据，不包含真实客户、工单、手机号、地址、签名、Token 或其他隐私数据。涉及真实数据时请使用实心遮罩或马赛克处理。

## 界面预览

### 管理工作台

![管理工作台总览](docs/screenshots/admin_dashboard.png)

### 工程师工作台

![工程师工作台首页](docs/screenshots/engineer_main.png)

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

- **统一入口**：`frontend-admin` 提供统一登录页，登录后根据 `availableWorkspaces` 进入管理或工程师工作台。
- **管理工作台**：工单处理、客户资产、设备资产、维护单位、巡检计划、月报、用户与审计管理。
- **工程师工作台**：我的服务记录、客户资产查询、新建服务表、离线草稿、月报、个人资料与签名。
- **服务记录闭环**：支持现场、远程、内勤记录，覆盖提交、补填、分享导出与月报统计。
- **设备型号自动补全**：设备型号 catalog 支持多词搜索、别名归一化和 fixture 同步。
- **多工作台权限**：工程师、工程主管、主管、管理员等角色按工作台和接口权限隔离。
- **生产部署脚本**：通过 `scripts/deploy.sh` 完成 Git 同步、后端 Docker rebuild、前端构建和 dist 上传。

## 项目结构

```text
.
├── backend                         # Node.js + Express + MySQL API
├── frontend-admin                  # React + Vite，统一登录入口与管理工作台
├── frontend-engineer               # Vue + Vite，工程师工作台
├── scripts                         # 部署与维护脚本
│   ├── deploy.sh                   # 全量/分模块部署
│   └── deploy-seed.sh              # 设备型号 catalog fixture 部署
├── AGENTS.md                       # 部署与权限约定
└── README.md
```

## 统一登录与工作台跳转

- 统一登录页：`frontend-admin/src/pages/Login.tsx`
- 应用名称配置：`frontend-admin/src/config/app.ts`
- 工程师端 `/login` 只负责跳转到统一入口：`frontend-engineer/src/views/LoginView.vue`
- 工程师端统一登录 URL 推导：`frontend-engineer/src/config/app.js`

常见入口：

- 管理端：`https://<admin-domain>/login`
- 工程师端：`https://<engineer-domain>/`，未登录时跳转统一登录

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
VITE_ENGINEER_WORKSPACE_URL=http://127.0.0.1:5174
```

### 工程师工作台

```bash
cd frontend-engineer
npm install
npm run dev
```

本地环境变量示例：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
VITE_UNIFIED_LOGIN_URL=http://127.0.0.1:5173
```

## 构建与检查

```bash
cd backend && npm test
cd frontend-admin && npm run build
cd frontend-engineer && npm run build
```

工程师端服务表回归测试（需要先启动后端和预览服务）：

```bash
cd frontend-engineer
npm run test:service-form-regression
```

## 部署

真实 SSH 目标、远程目录和域名属于私有部署信息，不写入公开仓库。部署前请在本地 `scripts/deploy.local.env` 或当前 shell 环境中配置 `DEPLOY_*` 变量。

```bash
# 默认环境（读取 DEPLOY_* 或 scripts/deploy.local.env）
bash scripts/deploy.sh all
bash scripts/deploy.sh backend
bash scripts/deploy.sh frontend
bash scripts/deploy.sh admin
bash scripts/deploy.sh engineer

# 指定本地私有 profile（profile 变量在 scripts/deploy.local.env 中定义）
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
bash scripts/deploy.sh <profile> eng
```

环境变量示例：

```bash
export DEPLOY_SSH_TARGET=<ssh-alias-or-host>
export DEPLOY_REMOTE_ROOT=<remote-project-root>
export DEPLOY_BACKEND_RELATIVE=app/backend
export DEPLOY_SITE_RELATIVE=app/site
export DEPLOY_PROJECT_SLUG=oms-platform
```

设备型号 catalog fixture 部署：

```bash
bash scripts/deploy-seed.sh
```

## 隐私与截图规范

公开 README 和演示材料中请避免展示真实运营数据。必须打码或替换：

- 客户名称、联系人、手机号、邮箱、地址、定位信息
- 工单号、服务内容、故障描述、内部备注、审核意见
- 设备序列号、资产编号、IP/主机名、保修信息
- 工程师姓名、头像、手机号、手写签名
- 审计日志、上传文件名、Token、Cookie、密码、API Key、`.env` 内容

推荐公开截图优先使用：统一登录页、空白/演示数据工作台、空白新建服务表。涉及真实数据时优先使用实心遮罩，其次再使用模糊或马赛克。

## 许可与维护

本仓库为 OMS Platform 运维智管的正式项目仓库。生产部署和权限约定可参考 [AGENTS.md](AGENTS.md)。
