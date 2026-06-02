# 技服表电子化项目 RC版

这是从现有主仓库中拆出的独立 RC 项目，包含以下模块：

- `backend`：Node.js + MySQL 后端
- `frontend-admin`：管理端 Vue 前端
- `frontend-engineer`：工程师端 Vue 前端
- `scripts`：部署与维护脚本


## 目录结构

```text
.
├── backend
│   └── src/modules/device-models/    ← 设备型号库（autocomplete + 自动发现）
├── frontend-admin
├── frontend-engineer
├── scripts
│   ├── deploy.sh                     ← 全量部署
│   └── deploy-seed.sh                ← 设备型号 seed 一键部署
└── README.md
```

## ✨ 新增功能

### 设备型号自动补全（Autocomplete）
工程师创建安装单时，在「设备型号」输入框打字即可自动弹出建议：
- 支持多词搜索：`hp dl380` → 匹配所有 HP ProLiant DL380 型号
- 内置 267 条常见设备型号（服务器/网络/存储/防火墙）
- 品牌搜索：`dell r740`、`huawei 5280`、`brocade` 等
- 型号归一化：`g10` → `Gen10`、`v5` → `V5`

### 设备型号自动发现（Beta）
```bash
LLM_API_KEY=sk-xxx node backend/src/modules/device-models/auto-discover.js
```
通过 LLM API 每日自动查询各品牌最新型号，与数据库对比后自动追加。支持 HPE、Dell、Cisco、Lenovo、Huawei、NetApp 等 20+ 品牌。

### 一键部署 seed
```bash
bash scripts/deploy-seed.sh
```
在本地 `seed.js` 追加新设备后，一行命令推送到服务器并重新入库（INSERT IGNORE，不会重复）。


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

### 设备型号 seed 快速部署
```bash
bash scripts/deploy-seed.sh
```
在 `backend/src/modules/device-models/seed.js` 追加新设备型号后，一键部署到服务器。

### 全量部署
```bash
bash scripts/deploy.sh all
```

服务器连接配置（通过环境变量）：
```bash
export DEPLOY_SSH_TARGET=aliyun                 # SSH 主机
export DEPLOY_REMOTE_ROOT=/root/service-sheet-aliyun  # 远程目录
```

> 当前服务器为阿里云单节点部署，Caddy 反向代理 + Docker Compose 运行。
> 访问地址：
> - 工程师端：`https://eng-aliyun.tinypanel.de`
> - 管理端：`https://admin-aliyun.tinypanel.de`

### 每日自动发现（可选）
如需每日自动检查各品牌新设备型号，设置 cron：
```bash
# 每天早上 8 点运行
0 8 * * * cd /path/to/project && LLM_API_KEY=sk-xxx node backend/src/modules/device-models/auto-discover.js >> /var/log/device-discover.log 2>&1
```

## 当前约定

- 这份 RC 副本不再区分 `preview1/preview2`
- 当前保留了部分内部代码命名（例如 `usePreviewI18n`、`PreviewControls`），但对外目录、页面文案、登录入口和部署结构已经按独立正式项目收口
- 后续如果确认长期沿用这份项目，可以继续做第二轮内部命名清理
