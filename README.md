# 技服表电子化项目 RC版

这是从现有主仓库中拆出的独立 RC 项目，只保留最终版本所需的三部分：

- `backend`：Node.js + MySQL 后端
- `frontend-admin`：管理端 Vue 前端
- `frontend-engineer`：工程师端 Vue 前端


## 目录结构

```text
.
├── backend
├── frontend-admin
├── frontend-engineer
├── scripts
└── README.md
```

## 本地启动

### 1. 后端

```bash
cd backend
npm install
cp .env.example .env
npm start
```

默认监听：

- `http://127.0.0.1:3000`

数据库初始化可参考：

- [backend/schema.sql](backend/schema.sql)

创建管理员账号时需要显式传入初始密码：

```bash
ADMIN_PASSWORD='replace-with-a-strong-password' npm run create-admin
```

如需写入轻量演示数据：

```bash
SEED_DEMO_PASSWORD='replace-with-a-strong-password' node scripts/seed-demo.js
```

### 2. 管理端

```bash
cd frontend-admin
npm install
npm run dev
```

如需指定后端地址，可在本地自行创建 `.env.local`：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
```

### 3. 工程师端

```bash
cd frontend-engineer
npm install
npm run dev
```

同样可通过 `.env.local` 指向后端：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
```

## 构建

```bash
cd frontend-admin && npm run build
cd frontend-engineer && npm run build
cd backend && npm test
```

## 部署

根目录提供了独立部署脚本：

- [scripts/deploy.sh](scripts/deploy.sh)

默认远端根目录：

- `/root/service-sheet-rc`

可通过环境变量覆盖：

```bash
export DEPLOY_SSH_TARGET=root@your-server
export DEPLOY_REMOTE_ROOT=/root/service-sheet-rc
```

示例：

```bash
bash scripts/deploy.sh all
```

## 当前约定

- 这份 RC 副本不再区分 `preview1/preview2`
- 当前保留了部分内部代码命名（例如 `usePreviewI18n`、`PreviewControls`），但对外目录、页面文案、登录入口和部署结构已经按独立正式项目收口
- 后续如果确认长期沿用这份项目，可以继续做第二轮内部命名清理
