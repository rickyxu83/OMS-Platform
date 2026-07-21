# OMS Platform

<p align="right">
  <strong>🌐 English</strong> ·
  <a href="./README.zh-CN.md">🇨🇳 简体中文</a> ·
  <a href="./README.zh-TW.md">🌏 繁體中文</a>
</p>

OMS Platform, also known as 运维智管 in Chinese, is a work-order collaboration platform for field operations, after-sales service, and customer asset management. The current version provides a unified admin workspace with a dedicated service report entry for engineers.

![Unified login](docs/screenshots/unified-login.png)

> Public screenshots should use demo or anonymized data. Do not expose real customers, work orders, phone numbers, addresses, signatures, tokens, or other private data. Use solid masks or pixelation before publishing screenshots that contain sensitive information.

## Interface Preview

### Admin Workspace

![Admin dashboard](docs/screenshots/admin_dashboard.png)

### New Service Sheet

![New service sheet](docs/screenshots/new%20sheet.png)

### Customer Maintenance Information

![Customer maintenance information](docs/screenshots/client%20maintenance.png)

## User Guide

- [English user guide](docs/wiki/user-guide.en.md)
- [简体中文使用说明](docs/wiki/user-guide.zh-CN.md)
- [繁體中文使用說明](docs/wiki/user-guide.zh-TW.md)

## Key Features

- **Unified entry**: `frontend-admin` provides the unified login page and admin workspace.
- **Admin workspace**: Work-order handling, service report filling, customer assets, device assets, maintenance parties, inspection plans, monthly reports, user management, and audit logs.
- **Engineer service report entry**: Engineer-facing report filling now lives in the admin workspace under `Service Report`.
- **Closed-loop service records**: Supports on-site, remote, and internal service records, including submission, supplementation, sharing/export, and monthly statistics.
- **Device model autocomplete**: The device model catalog supports multi-keyword search, alias normalization, and fixture synchronization.
- **Workspace-aware permissions**: Engineers, engineering supervisors, supervisors, and admins are isolated by workspace and API permissions.
- **Production deployment scripts**: `scripts/deploy.sh` handles Git sync, backend Docker rebuild, frontend builds, and dist upload.

## Project Structure

```text
.
├── backend                         # Node.js + Express + MySQL API
├── frontend-admin                  # React + Vite, unified login and admin workspace
├── scripts                         # Deployment and maintenance scripts
│   ├── deploy.sh                   # Full or module-level deployment
│   └── deploy-seed.sh              # Device model catalog fixture deployment
├── AGENTS.md                       # Public deployment and permission conventions
└── README.md
```

## Unified Login and Workspace Routing

- Unified login page: `frontend-admin/src/pages/Login.tsx`
- Application name configuration: `frontend-admin/src/config/app.ts`

Common entries:

- Admin: `https://<admin-domain>/login`
- Engineer service reports: sign in through the admin entry and open `Service Report`.

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
```

## Build and Checks

```bash
cd backend && npm run check
cd frontend-admin && npm run build
cd frontend-admin && npx tsc --noEmit
```

## Deployment

Real SSH targets, remote paths, domains, cookie domains, and CORS allowlists are private deployment information and are not committed to the public repository. Keep them in local-only files such as `AGENTS.local.md`, `docs/deploy.local.md`, `scripts/deploy.local.env`, and each frontend/backend `.env.local` or production env file.

Deployment scripts read real settings from the current shell environment or local `scripts/deploy.local.env`.

| Variable | Description |
|---|---|
| `DEPLOY_SSH_TARGET` | SSH host alias or target |
| `DEPLOY_REMOTE_ROOT` | Remote project root |
| `DEPLOY_BACKEND_RELATIVE` | Backend path relative to the remote root, default `app/backend` |
| `DEPLOY_SITE_RELATIVE` | Frontend site path relative to the remote root, default `app/site` |
| `DEPLOY_BACKEND_CONTAINER` | Backend container name, required only by `deploy-seed.sh` |
| `DEPLOY_PROJECT_SLUG` | Temporary archive prefix, default `oms-platform` |
| `DEPLOY_BRANCH` | Git target branch, default is the current branch |
| `CORS_ALLOWED_ORIGINS` | Backend allowed frontend origins, comma-separated |
| `SESSION_COOKIE_DOMAIN` | Cookie domain when login state must be shared across subdomains |

For multiple environments, define `DEPLOY_<PROFILE>_*` variables in `scripts/deploy.local.env`, then use `bash scripts/deploy.sh <profile> <target>`.

```bash
# Default environment, reading DEPLOY_* or scripts/deploy.local.env
bash scripts/deploy.sh all
bash scripts/deploy.sh backend
bash scripts/deploy.sh frontend
bash scripts/deploy.sh admin

# Named private profile, defined in scripts/deploy.local.env
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
```

Deployment flow: push the current branch to GitHub, upload backend source, rebuild the backend Docker container, build the admin frontend, then upload `dist`. The legacy `engineer` / `eng` deployment target is retired. Engineer-facing service report filling is served from the unified admin frontend.

`deploy.sh` does not auto-commit. If the working tree has uncommitted changes, it lists them and exits. Commit reviewed changes before deployment so sensitive or unrelated files are not published accidentally.

Example environment variables:

```bash
export DEPLOY_SSH_TARGET=<ssh-alias-or-host>
export DEPLOY_REMOTE_ROOT=<remote-project-root>
export DEPLOY_BACKEND_RELATIVE=app/backend
export DEPLOY_SITE_RELATIVE=app/site
export DEPLOY_PROJECT_SLUG=oms-platform
```

### Release Checklist

- Keep `git status` clean before running deployment.
- For backend changes, run `cd backend && npm run check`.
- For frontend changes, run `cd frontend-admin && npm run build` and `cd frontend-admin && npx tsc --noEmit`.
- For visible admin UI, interaction, page, or release-content changes, bump the admin version in `frontend-admin/package.json`, `frontend-admin/package-lock.json`, and the `APP_VERSION` fallback in `frontend-admin/src/config/app.ts`.
- For backend package release semantics, update `backend/package.json` and `backend/package-lock.json` together.
- Commit messages should use Chinese, with one concise subject line and optional `-` bullet points in the body.

After deployment, verify the backend on the server because `deploy.sh` does not run health checks:

```bash
docker ps --filter name=backend --format '{{.Status}}'
docker logs --tail 20 <backend-container-name>
docker exec <backend-container-name> wget -qO- http://127.0.0.1:3000/api/v1/health
```

The health endpoint should return `{"ok":true}`. For production 500 errors, inspect `docker logs <backend-container-name>`; the backend error handler logs the request path and stack.

Deploy device model catalog fixtures:

```bash
bash scripts/deploy-seed.sh
```

## Roles and Permissions

| Role | Admin workspace |
|---|---|
| `engineer` | Uses the service report entry; APIs are filtered to the current engineer. May delete own draft/assigned/rejected orders and void own submitted orders (intentional design) |
| `engineering_supervisor` | Can use the service report entry; dispatch management can view all work orders |
| `operations_director` | Can view all work orders |
| `administrative_supervisor` | Read-only access to admin business data; cannot dispatch, approve, edit, delete, or change settings |
| `admin` | Full access |

The service report entry sends `?mine=1` when requesting current-user data. The backend uses it to filter by `effectiveEngineerId`.

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
