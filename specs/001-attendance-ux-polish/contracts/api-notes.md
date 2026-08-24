# Contracts: 考勤管理体验优化

**Date**: 2026-08-24

本特性**不新增端点、不改变既有响应结构**。仅有两处契约级变化，一处向后兼容、一处单调用方收紧：

## 1. `POST /api/v1/attendance/requests`（无变化）

~~请求体启用 `reason`~~ 已经用户裁决砍掉（2026-08-24），该端点契约完全不变。

## 2. `POST /api/v1/attendance/requests/:id/void`（行为收紧）

- 请求体 `reason?: string` → **改为必填**：空值返回 400 `请填写作废原因`。
- 影响面：作废入口仅管理端「申请明细」一处（前端同步改为必填对话框），无其他调用方。
- 响应不变：`{ ok: true }`。

## 3. `GET /api/v1/attendance/requests`（新增可选查询参数）

| 参数 | 类型 | 说明 |
|---|---|---|
| `startDate` | `YYYY-MM-DD` 可选 | 过滤 `r.start_at >= startDate 00:00:00` |
| `endDate` | `YYYY-MM-DD` 可选 | 过滤 `r.start_at <= endDate 23:59:59` |

- 与既有 `scope/status/requestType` 叠加；缺省行为与当前完全一致（LIMIT 300 保留作兜底）。
- 响应结构不变；前端以 `items.length === 300` 判定截断并提示。

## 明确不变的契约

- 审批链相关全部端点（approve-*/reject/withdraw/submit）请求/响应结构不变。
- 值班津贴（duty/*）、法定节假日（legal-holidays/*）、报表（reports/*）端点不变。
- 权限矩阵不变（各端点 `requirePermission` 维持现状）。
