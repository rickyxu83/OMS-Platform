# OMS Platform 運維智管

<p align="right">
  <a href="./README.md">🌐 English</a> ·
  <a href="./README.zh-CN.md">🇨🇳 简体中文</a> ·
  <strong>繁體中文</strong>
</p>

OMS Platform（中文名：運維智管）是一套面向現場運維、售後服務和客戶資產管理的工單協同平台。當前版本採用統一登入入口，根據帳號權限進入管理工作臺或工程師工作臺。

![統一登入入口](docs/screenshots/unified-login.png)

> 公開截圖請使用演示資料或脫敏資料，不包含真實客戶、工單、手機號、地址、簽名、Token 或其他隱私資料。涉及真實資料時請使用實心遮罩或馬賽克處理。

## 介面預覽

### 管理工作臺

![管理工作臺總覽](docs/screenshots/admin_dashboard.png)

### 工程師工作臺

![工程師工作臺首頁](docs/screenshots/engineer_main.png)

### 新建服務表

![新建服務表](docs/screenshots/new%20sheet.png)

### 客戶維護資訊

![客戶維護資訊](docs/screenshots/client%20maintenance.png)

## 使用說明

- [English user guide](docs/wiki/user-guide.en.md)
- [中文使用說明](docs/wiki/user-guide.md)
- [簡體中文使用說明](docs/wiki/user-guide.zh-CN.md)
- [繁體中文使用說明](docs/wiki/user-guide.zh-TW.md)

## 核心能力

- **統一入口**：`frontend-admin` 提供統一登入頁，登入後根據 `availableWorkspaces` 進入管理或工程師工作臺。
- **管理工作臺**：工單處理、客戶資產、設備資產、維護單位、巡檢計畫、月報、使用者與審計管理。
- **工程師工作臺**：我的服務記錄、客戶資產查詢、新建服務表、離線草稿、月報、個人資料與簽名。
- **服務記錄閉環**：支援現場、遠端、內勤記錄，覆蓋提交、補填、分享匯出與月報統計。
- **設備型號自動補全**：設備型號 catalog 支援多詞搜尋、別名歸一化和 fixture 同步。
- **多工作臺權限**：工程師、工程主管、主管、管理員等角色按工作臺和介面權限隔離。
- **生產部署腳本**：透過 `scripts/deploy.sh` 完成 Git 同步、後端 Docker rebuild、前端構建和 dist 上傳。

## 專案結構

```text
.
├── backend                         # Node.js + Express + MySQL API
├── frontend-admin                  # React + Vite，統一登入入口與管理工作臺
├── frontend-engineer               # Vue + Vite，工程師工作臺
├── scripts                         # 部署與維護腳本
│   ├── deploy.sh                   # 全量/分模組部署
│   └── deploy-seed.sh              # 設備型號 catalog fixture 部署
├── AGENTS.md                       # 部署與權限約定
└── README.md
```

## 統一登入與工作臺跳轉

- 統一登入頁：`frontend-admin/src/pages/Login.tsx`
- 應用名稱配置：`frontend-admin/src/config/app.ts`
- 工程師端 `/login` 只負責跳轉到統一入口：`frontend-engineer/src/views/LoginView.vue`
- 工程師端統一登入 URL 推導：`frontend-engineer/src/config/app.js`

常見入口：

- 管理端：`https://<admin-domain>/login`
- 工程師端：`https://<engineer-domain>/`，未登入時跳轉統一登入

## 本地啟動

### 後端

```bash
cd backend
npm install
cp .env.example .env
npm start
```

預設 API 地址：

- `http://127.0.0.1:3000/api/v1`

資料庫初始化參考：

- [backend/schema.sql](backend/schema.sql)

建立管理員帳號：

```bash
cd backend
ADMIN_PASSWORD='replace-with-a-strong-password' npm run create-admin
```

寫入輕量演示資料：

```bash
cd backend
SEED_DEMO_PASSWORD='replace-with-a-strong-password' node scripts/seed-demo.js
```

### 管理工作臺 / 統一入口

```bash
cd frontend-admin
npm install
npm run dev
```

本地環境變數範例：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
VITE_ENGINEER_WORKSPACE_URL=http://127.0.0.1:5174
```

### 工程師工作臺

```bash
cd frontend-engineer
npm install
npm run dev
```

本地環境變數範例：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
VITE_UNIFIED_LOGIN_URL=http://127.0.0.1:5173
```

## 構建與檢查

```bash
cd backend && npm test
cd frontend-admin && npm run build
cd frontend-engineer && npm run build
```

工程師端服務表回歸測試（需要先啟動後端和預覽服務）：

```bash
cd frontend-engineer
npm run test:service-form-regression
```

## 部署

真實 SSH 目標、遠端目錄和域名屬於私有部署資訊，不寫入公開倉庫。部署前請在本地 `scripts/deploy.local.env` 或目前 shell 環境中配置 `DEPLOY_*` 變數。

```bash
# 預設環境（讀取 DEPLOY_* 或 scripts/deploy.local.env）
bash scripts/deploy.sh all
bash scripts/deploy.sh backend
bash scripts/deploy.sh frontend
bash scripts/deploy.sh admin
bash scripts/deploy.sh engineer

# 指定本地私有 profile（profile 變數在 scripts/deploy.local.env 中定義）
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
bash scripts/deploy.sh <profile> eng
```

環境變數範例：

```bash
export DEPLOY_SSH_TARGET=<ssh-alias-or-host>
export DEPLOY_REMOTE_ROOT=<remote-project-root>
export DEPLOY_BACKEND_RELATIVE=app/backend
export DEPLOY_SITE_RELATIVE=app/site
export DEPLOY_PROJECT_SLUG=oms-platform
```

設備型號 catalog fixture 部署：

```bash
bash scripts/deploy-seed.sh
```

## 隱私與截圖規範

公開 README 和演示材料中請避免展示真實營運資料。必須打碼或替換：

- 客戶名稱、聯絡人、手機號、郵箱、地址、定位資訊
- 工單號、服務內容、故障描述、內部備註、審核意見
- 設備序列號、資產編號、IP/主機名、保固資訊
- 工程師姓名、頭像、手機號、手寫簽名
- 審計日誌、上傳檔名、Token、Cookie、密碼、API Key、`.env` 內容

推薦公開截圖優先使用：統一登入頁、空白/演示資料工作臺、空白新建服務表。涉及真實資料時優先使用實心遮罩，其次再使用模糊或馬賽克。

## 授權與維護

本倉庫為 OMS Platform 運維智管的正式專案倉庫。生產部署和權限約定可參考 [AGENTS.md](AGENTS.md)。
