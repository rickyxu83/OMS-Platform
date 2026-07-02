# OMS Platform User Guide

<p align="right">
  <strong>🌐 English</strong> ·
  <a href="./user-guide.md">中文</a> ·
  <a href="./user-guide.zh-CN.md">🇨🇳 简体中文</a> ·
  <a href="./user-guide.zh-TW.md">🌏 繁體中文</a>
</p>

This guide describes the full daily workflow for OMS Platform. It is intended for administrators, operations directors, dispatchers, engineering supervisors, and field engineers. It covers sign-in, permissions, work orders, customer and asset management, service sheets, reports, privacy, and troubleshooting.

## 1. Product overview

OMS Platform is a service operations platform for field maintenance, after-sales service, customer assets, and service record collaboration.

The platform now uses the **Admin workspace** as the unified working surface. Work-order dispatching, service report filling, customer and asset management, reports, user management, audit logs, and settings are all handled there. Engineer-facing report filling is available through the **Service Report** entry.

## 2. Sign in and workspace selection

1. Open the unified login page: `https://<admin-domain>/login`.
2. Enter your account and password.
3. If the account has only one available workspace, the system enters it automatically.
4. If the account has multiple available workspaces, choose the workspace you want to use.
5. Engineer accounts may be asked to complete onboarding, including password update, profile completion, avatar upload, or signature setup.
6. If sign-in fails several times, the account may be temporarily locked for security reasons.

## 3. Roles and permissions

| Role | Admin workspace |
|---|---|
| `engineer` | Uses only the service report entry; APIs are filtered to own work |
| `engineering_supervisor` | Can use the service report entry; dispatch management can view all work orders |
| `operations_director` | View and manage all work orders according to granted modules |
| `administrative_supervisor` | View admin workspace business data; cannot dispatch, approve, edit, delete, or change system settings |
| `admin` | Full platform access |

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

## 5. Service report entry

Engineers and engineering supervisors submit on-site, remote, and internal service records from the admin **Service Report** page.

- Engineers only work with their own related work orders and records.
- Engineering supervisors can access dispatch management according to permission and can also fill their own service records.
- Confirm customer, contact, device, service modules, and attachment requirements before submission.

## 6. Service sheet workflow

Use service sheets to record real service work.

1. Open the admin **Service Report** page.
2. Choose on-site, remote, or internal service filling.
3. Select customer, contact, address, and service modules.
4. Fill processing records, attachments, devices, and spare parts according to selected modules.
5. For on-site service, complete customer signature or electronic signature confirmation when required.
6. Save a draft manually when information is incomplete, or submit after verification.
7. After submission, share or export the service sheet if required by the business process.

Data-quality checklist before submission:

- Customer and contact are correct.
- Device model and serial number are correct.
- Time range and working hours are reasonable.
- Issue and resolution are clear enough for later review.
- Attachments do not contain irrelevant private data.

## 7. Drafts and submission

- Drafts are saved manually and are not auto-saved.
- Confirm required fields, attachments, and signature status before submission.
- If the network is unstable, wait for the connection to recover before submitting to avoid duplicates.

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
| Own records are empty | Confirm task assignment and own-data filtering. |
| Service sheet cannot submit | Check required fields, signature, network status, and attachment size. |
| Draft is missing | Confirm the draft was saved manually and continue with the same account. |
| Map search fails | Check backend map key and frontend map JS key in private environment files. |
| Export or share fails | Check browser permissions, file size, and whether the record has been submitted. |

## 11. GPL-3.0 license notice

OMS Platform is free software licensed under the **GNU General Public License v3.0 (GPL-3.0)**. You may use, study, modify, and redistribute the software under the terms of GPL-3.0. Modified or redistributed versions must preserve the same GPL-3.0 license terms and provide the corresponding source code as required by the license.

## 12. Related documents

- Project README: [../../README.md](../../README.md)
- Simplified Chinese README: [../../README.zh-CN.md](../../README.zh-CN.md)
- Traditional Chinese README: [../../README.zh-TW.md](../../README.zh-TW.md)
- Public deployment conventions: [../../AGENTS.md](../../AGENTS.md)
