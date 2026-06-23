# OMS Platform User Guide

<p align="right">
  <strong>🌐 English</strong> ·
  <a href="./user-guide.md">中文</a> ·
  <a href="./user-guide.zh-CN.md">🇨🇳 简体中文</a> ·
  <a href="./user-guide.zh-TW.md">🌏 繁體中文</a>
</p>

This guide describes the full daily workflow for OMS Platform. It is intended for administrators, operations directors, dispatchers, engineering supervisors, and field engineers. It covers sign-in, workspace access, work orders, customer and asset management, service sheets, offline drafts, reports, privacy, and troubleshooting.

## 1. Product overview

OMS Platform is a service operations platform for field maintenance, after-sales service, customer assets, and service record collaboration.

The platform has two main workspaces:

- **Admin workspace**: Used by back-office and management roles for work-order dispatching, customer and asset management, reports, user management, audit logs, and settings.
- **Engineer workspace**: Used by engineers for assigned tasks, customer asset lookup, service sheet creation, offline drafts, monthly statistics, profile information, and signature management.

## 2. Sign in and workspace selection

1. Open the unified login page: `https://<admin-domain>/login`.
2. Enter your account and password.
3. If the account has only one available workspace, the system enters it automatically.
4. If the account has multiple available workspaces, choose the workspace you want to use.
5. Engineer accounts may be asked to complete onboarding, including password update, profile completion, avatar upload, or signature setup.
6. If sign-in fails several times, the account may be temporarily locked for security reasons.

## 3. Roles and permissions

| Role | Engineer workspace | Admin workspace |
|---|---|---|
| `engineer` | View and process only assigned or own work orders | Not allowed |
| `engineering_supervisor` | Use own-task filtering when entering as engineer | View, dispatch, and manage all work orders |
| `operations_director` | Not allowed | View and manage all work orders according to granted modules |
| `admin` | Not allowed | Full platform access |

Permission rules are enforced by both frontend routing and backend APIs. If a page is not visible or an API returns a forbidden error, confirm the account role and workspace access first.

## 4. Admin workspace modules

### 4.1 Dashboard

The dashboard provides a quick overview of operational status.

- Review total work orders, pending items, completed items, and abnormal status.
- Check recent service activity and workload distribution.
- Use dashboard information to decide what needs dispatching or follow-up.

### 4.2 Work orders

Use work orders to manage the service lifecycle.

Common actions:

1. Create a work order from a customer request or internal service need.
2. Fill in customer, contact, site, device, issue, priority, and expected service information.
3. Assign an engineer or engineering supervisor.
4. Track status changes during processing.
5. Review submitted service sheets and follow-up notes.
6. Close or archive the work order after completion.

Recommended practice:

- Keep customer and device information accurate before assigning the task.
- Use clear issue descriptions so the engineer can prepare tools and spare parts.
- Review service sheets before exporting or sharing externally.

### 4.3 Customers and assets

The customer and asset modules are the foundation for service records.

- Maintain customer names, sites, addresses, contacts, and phone numbers.
- Maintain device models, serial numbers, software versions, warranty information, and maintenance parties.
- Use map/location search only when map API keys are configured in private environment files.
- Avoid duplicate customer records by searching before creating a new entry.

### 4.4 Device model catalog

The device model catalog helps users enter device models consistently.

- Search supports multiple keywords and common aliases.
- Administrators can sync catalog fixture data when new model data is prepared.
- Keep model names consistent to improve reports and statistics.

### 4.5 Inspection plans

Inspection plans are used for scheduled maintenance tasks.

- Create inspection schedules for recurring customer or device checks.
- Assign responsible engineers.
- Track upcoming, overdue, and completed inspections.
- Convert inspection results into service records when needed.

### 4.6 Monthly reports and timesheets

Monthly reports summarize service activity and working time.

- Export service statistics by month, engineer, customer, or work type.
- Review missing or abnormal records before generating formal reports.
- Use reports for internal settlement, performance review, and service analysis.

### 4.7 Users, roles, and audit logs

- Create and maintain user accounts.
- Assign roles based on actual job responsibilities.
- Disable inactive accounts promptly.
- Review audit logs for sensitive actions such as login, data changes, exports, and settings updates.

### 4.8 System settings

Depending on deployment configuration, administrators may configure:

- Mail delivery and SMTP test settings.
- AI connectivity checks for work-summary features.
- Platform-level service options.

Production secrets must be stored in private environment files and never committed to GitHub.

## 5. Engineer workspace modules

### 5.1 My tasks

Engineers use the task list to view work assigned to them.

- Open a task to review customer, site, contact, and issue information.
- Start a service sheet from the task to keep the record linked to the work order.
- If no tasks are visible, confirm that the task is assigned to the current engineer and that own-task filtering is enabled as expected.

### 5.2 Customer asset lookup

Before service, engineers can search customer and device information.

- Confirm site address and contact information.
- Check device model, serial number, maintenance party, and historical service records.
- Use recent records to understand recurring issues.

### 5.3 Profile and signature

Engineer profile data is used in service documents.

- Keep name, phone, avatar, and signature up to date.
- Complete signature onboarding before submitting service sheets that require signatures.
- Replace signatures only when authorized and necessary.

## 6. Service sheet workflow

Use service sheets to record real service work.

1. Open an assigned task or choose **New service sheet**.
2. Select the service type: on-site, remote, or internal work.
3. Select customer, site, contact, and related device assets.
4. Fill in service category, work nature, support object, start time, and end time.
5. Describe the issue, service content, processing steps, result, and follow-up suggestions.
6. Add spare parts, attachments, photos, and working hours only when they are needed.
7. Confirm engineer signature and customer confirmation if required.
8. Save as draft when information is incomplete, or submit after verification.
9. After submission, share or export the service sheet if required by the business process.

Data-quality checklist before submission:

- Customer and contact are correct.
- Device model and serial number are correct.
- Time range and working hours are reasonable.
- Issue and resolution are clear enough for later review.
- Attachments do not contain irrelevant private data.

## 7. Offline drafts and synchronization

The engineer workspace supports local drafts for unstable network conditions.

- Drafts are saved locally while filling in service sheets.
- When offline, keep working with cached data where available.
- After the network recovers, review the draft and submit again.
- Do not clear browser storage before confirming that drafts have been submitted.

## 8. Sharing, export, and reporting

- Submitted service sheets can be previewed before sharing.
- Exported images or documents should be checked for sensitive content.
- Monthly reports should be generated after all service sheets for the month are submitted.
- If report numbers look wrong, check for missing service type, working hours, or engineer assignment.

## 9. Privacy and data safety

Never publish or commit the following data:

- Real customer names, contacts, phone numbers, emails, addresses, and location data.
- Work-order numbers, service details, fault descriptions, internal notes, and review comments.
- Device serial numbers, asset IDs, hostnames, IP addresses, and warranty details.
- Engineer names, avatars, phone numbers, and handwritten signatures unless explicitly approved.
- Tokens, cookies, passwords, API keys, `.env` files, SSH targets, remote directories, production domains, and deployment secrets.

Before sharing screenshots externally, use solid masks or pixelation. If a frontend map key or third-party key has ever been exposed publicly, rotate it and configure domain or Referer restrictions in the vendor console.

## 10. Common troubleshooting

| Problem | Suggested checks |
|---|---|
| Cannot sign in | Check account status, password, lockout status, and backend availability. |
| Cannot enter a workspace | Confirm the role has access to the selected workspace. |
| Engineer task list is empty | Confirm task assignment and own-task filtering. |
| Service sheet cannot submit | Check required fields, signature, network status, and attachment size. |
| Draft is missing | Confirm the browser storage was not cleared and the same device/browser is used. |
| Map search fails | Check backend map key and frontend map JS key in private environment files. |
| Export or share fails | Check browser permissions, file size, and whether the record has been submitted. |

## 11. GPL-3.0 license notice

OMS Platform is free software licensed under the **GNU General Public License v3.0 (GPL-3.0)**. You may use, study, modify, and redistribute the software under the terms of GPL-3.0. Modified or redistributed versions must preserve the same GPL-3.0 license terms and provide the corresponding source code as required by the license.

## 12. Related documents

- Project README: [../../README.md](../../README.md)
- Simplified Chinese README: [../../README.zh-CN.md](../../README.zh-CN.md)
- Traditional Chinese README: [../../README.zh-TW.md](../../README.zh-TW.md)
- Public deployment conventions: [../../AGENTS.md](../../AGENTS.md)
