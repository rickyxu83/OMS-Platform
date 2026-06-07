# OMS Platform User Guide

<p align="right">
  <strong>🌐 English</strong> ·
  <a href="./user-guide.md">中文</a> ·
  <a href="./user-guide.zh-CN.md">🇨🇳 简体中文</a> ·
  <a href="./user-guide.zh-TW.md">🌏 繁體中文</a>
</p>

This guide explains the common daily workflow for OMS Platform users. It focuses on login, workspace selection, work-order handling, service sheet creation, and data privacy.

## 1. Sign in

1. Open the unified login page: `https://<admin-domain>/login`.
2. Enter your account and password.
3. If your account has more than one workspace, select the workspace you want to enter.
4. If you are an engineer user, the system may ask you to complete onboarding, such as password update, profile information, or signature setup.

## 2. Workspace permissions

| Role | Engineer workspace | Admin workspace |
|---|---|---|
| `engineer` | View and process only assigned or own work orders | Not allowed |
| `engineering_supervisor` | Use `mine=1` for own work orders | View and dispatch all work orders |
| `supervisor` | Not allowed | View all work orders |
| `admin` | Not allowed | Full access |

## 3. Admin workspace

Use the admin workspace for operation management and back-office work.

- **Dashboard**: Review key operational metrics and work-order status.
- **Work orders**: Create, dispatch, update, and review service orders.
- **Customers and assets**: Maintain customer records, sites, contacts, device assets, and maintenance information.
- **Inspection plans**: Manage scheduled inspection tasks.
- **Monthly reports**: Export timesheets and service statistics.
- **Users and roles**: Manage accounts, roles, and workspace access.
- **Audit logs**: Review operation history for traceability.
- **System settings**: Configure mail, AI connectivity, and platform-level settings where available.

## 4. Engineer workspace

Use the engineer workspace for field service and daily execution.

- **My tasks**: View assigned or own service tasks.
- **Customer assets**: Search customer and device information before service.
- **New service sheet**: Create on-site, remote, or internal service records.
- **Offline drafts**: Continue work when network conditions are unstable, then submit when online.
- **Monthly reports**: Check personal service statistics.
- **Profile and signature**: Maintain engineer information and signature used in service documents.

## 5. Service sheet workflow

1. Open the target task or start a new service sheet.
2. Select service type, customer, contact, site, and related device assets.
3. Fill in service content, issue description, resolution, parts, and working hours.
4. Add photos or attachments only when they are necessary and safe to store.
5. Confirm the engineer signature and customer confirmation if required.
6. Submit the sheet, or save it as a draft if information is incomplete.
7. Share or export the service sheet after submission when needed.

## 6. Privacy and data safety

- Do not publish screenshots containing real customers, phone numbers, addresses, signatures, tokens, or API keys.
- Use solid masks or pixelation before sharing screenshots externally.
- Keep `.env`, production domains, SSH targets, remote directories, and deployment secrets in local private files.
- Rotate any frontend map or third-party key that was ever exposed publicly, and configure domain or Referer restrictions in the vendor console.

## 7. Common troubleshooting

- **Cannot sign in**: Check account status, password, and whether the account is locked after repeated failures.
- **Cannot enter a workspace**: Confirm your role has access to that workspace.
- **Engineer task list is empty**: Check whether the task is assigned to you and whether the engineer workspace is filtering only own tasks.
- **Map or location search fails**: Confirm the backend map key and frontend map JS key are configured in private environment files.
- **Upload fails**: Check file size, network status, and backend upload configuration.

## 8. Related documents

- Project README: [../../README.md](../../README.md)
- Simplified Chinese README: [../../README.zh-CN.md](../../README.zh-CN.md)
- Traditional Chinese README: [../../README.zh-TW.md](../../README.zh-TW.md)
- Public deployment conventions: [../../AGENTS.md](../../AGENTS.md)
