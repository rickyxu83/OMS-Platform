# OMS Platform

<p align="right">
  <strong>🌐 English</strong> ·
  <a href="./README.zh-CN.md">🇨🇳 简体中文</a> ·
  <a href="./README.zh-TW.md">🌏 繁體中文</a>
</p>

OMS Platform, also known as 运维智管 in Chinese, is a work-order collaboration platform for field operations, after-sales service, and customer asset management. The current version provides a unified login entry and routes users to the admin workspace or engineer workspace according to account permissions.

![Unified login](docs/screenshots/unified-login.png)

> Public screenshots should use demo or anonymized data. Do not expose real customers, work orders, phone numbers, addresses, signatures, tokens, or other private data. Use solid masks or pixelation before publishing screenshots that contain sensitive information.

## Interface Preview

### Admin Workspace

![Admin dashboard](docs/screenshots/admin_dashboard.png)

### Engineer Workspace

![Engineer workspace home](docs/screenshots/engineer_main.png)

### New Service Sheet

![New service sheet](docs/screenshots/new%20sheet.png)

### Customer Maintenance Information

![Customer maintenance information](docs/screenshots/client%20maintenance.png)

## User Guide

- [English user guide](docs/wiki/user-guide.en.md)
- [中文使用说明](docs/wiki/user-guide.md)
- [简体中文使用说明](docs/wiki/user-guide.zh-CN.md)
- [繁體中文使用說明](docs/wiki/user-guide.zh-TW.md)

## Key Features

- **Unified entry**: `frontend-admin` provides the unified login page and routes users to available workspaces after login.
- **Admin workspace**: Work-order handling, customer assets, device assets, maintenance parties, inspection plans, monthly reports, user management, and audit logs.
- **Engineer workspace**: Personal service records, customer asset lookup, new service sheets, offline drafts, monthly reports, profile, and signature management.
- **Closed-loop service records**: Supports on-site, remote, and internal service records, including submission, supplementation, sharing/export, and monthly statistics.
- **Device model autocomplete**: The device model catalog supports multi-keyword search, alias normalization, and fixture synchronization.
- **Workspace-aware permissions**: Engineers, engineering supervisors, supervisors, and admins are isolated by workspace and API permissions.
- **Production deployment scripts**: `scripts/deploy.sh` handles Git sync, backend Docker rebuild, frontend builds, and dist upload.

## Project Structure

```text
.
├── backend                         # Node.js + Express + MySQL API
├── frontend-admin                  # React + Vite, unified login and admin workspace
├── frontend-engineer               # Vue + Vite, engineer workspace
├── scripts                         # Deployment and maintenance scripts
│   ├── deploy.sh                   # Full or module-level deployment
│   └── deploy-seed.sh              # Device model catalog fixture deployment
├── AGENTS.md                       # Public deployment and permission conventions
└── README.md
```

## Unified Login and Workspace Routing

- Unified login page: `frontend-admin/src/pages/Login.tsx`
- Application name configuration: `frontend-admin/src/config/app.ts`
- Engineer `/login` only redirects to the unified entry: `frontend-engineer/src/views/LoginView.vue`
- Engineer unified login URL inference: `frontend-engineer/src/config/app.js`

Common entries:

- Admin: `https://<admin-domain>/login`
- Engineer: `https://<engineer-domain>/`, redirects to unified login when unauthenticated

## Local Development

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Default API URL:

- `http://127.0.0.1:3000/api/v1`

Database initialization:

- [backend/schema.sql](backend/schema.sql)

Create an admin account:

```bash
cd backend
ADMIN_PASSWORD='replace-with-a-strong-password' npm run create-admin
```

Seed lightweight demo data:

```bash
cd backend
SEED_DEMO_PASSWORD='replace-with-a-strong-password' node scripts/seed-demo.js
```

### Admin Workspace / Unified Entry

```bash
cd frontend-admin
npm install
npm run dev
```

Example local environment variables:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
VITE_ENGINEER_WORKSPACE_URL=http://127.0.0.1:5174
```

### Engineer Workspace

```bash
cd frontend-engineer
npm install
npm run dev
```

Example local environment variables:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
VITE_UNIFIED_LOGIN_URL=http://127.0.0.1:5173
```

## Build and Checks

```bash
cd backend && npm test
cd frontend-admin && npm run build
cd frontend-engineer && npm run build
```

Engineer service form regression test, which requires the backend and preview services to be running:

```bash
cd frontend-engineer
npm run test:service-form-regression
```

## Deployment

Real SSH targets, remote paths, and domains are private deployment information and are not committed to the public repository. Before deployment, configure `DEPLOY_*` variables in local `scripts/deploy.local.env` or in the current shell environment.

```bash
# Default environment, reading DEPLOY_* or scripts/deploy.local.env
bash scripts/deploy.sh all
bash scripts/deploy.sh backend
bash scripts/deploy.sh frontend
bash scripts/deploy.sh admin
bash scripts/deploy.sh engineer

# Named private profile, defined in scripts/deploy.local.env
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
bash scripts/deploy.sh <profile> eng
```

Example environment variables:

```bash
export DEPLOY_SSH_TARGET=<ssh-alias-or-host>
export DEPLOY_REMOTE_ROOT=<remote-project-root>
export DEPLOY_BACKEND_RELATIVE=app/backend
export DEPLOY_SITE_RELATIVE=app/site
export DEPLOY_PROJECT_SLUG=oms-platform
```

Deploy device model catalog fixtures:

```bash
bash scripts/deploy-seed.sh
```

## Privacy and Screenshot Policy

Avoid exposing real operational data in public README files and demo materials. Mask or replace the following before publishing:

- Customer names, contacts, phone numbers, emails, addresses, and location data
- Work-order numbers, service content, fault descriptions, internal notes, and review comments
- Device serial numbers, asset IDs, IP addresses, hostnames, and warranty information
- Engineer names, avatars, phone numbers, and handwritten signatures
- Audit logs, uploaded file names, tokens, cookies, passwords, API keys, and `.env` contents

Recommended public screenshots include the unified login page, blank or demo-data dashboards, and blank new-service-sheet screens. Prefer solid masks for sensitive data; use blur or pixelation only as a secondary option.

## License and Maintenance

OMS Platform is released under the **GNU General Public License v3.0 (GPL-3.0)**. You may use, study, modify, and redistribute this software under the terms of GPL-3.0. Any modified or redistributed version must keep the same GPL-3.0 license terms and provide the corresponding source code as required by the license.

This repository is the official OMS Platform project repository. Public deployment and permission conventions are documented in [AGENTS.md](AGENTS.md).
