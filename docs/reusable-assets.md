# 可复用资产货架（Reusable Assets）

> 本文件是宪法的配套货架：**写新代码前先查这里**。新增/发现资产时必须更新本文件。
> 最近全量盘点：2026-08-24（frontend-admin；backend 深模块见其 README）。

## UI 基础组件（`frontend-admin/src/components/ui/`）

Radix UI + Tailwind 封装（shadcn 风格），新 UI 一律基于这些拼：

`badge` `button` `card` `checkbox` `dialog` `dropdown-menu` `input` `label` `select` `separator` `sonner`（toast） `switch` `table` `textarea`

## 业务共享组件（`frontend-admin/src/components/`）

| 组件 | 用途 |
|---|---|
| `AdminLayout` | 管理端布局骨架 |
| `ServiceOrderDetailDialog` | 工单详情弹窗（多页面共用） |
| `ResponsiveList` | 响应式列表 |
| `EmptyState` / `Skeleton` / `ErrorToast` | 空态 / 骨架屏 / 错误提示 |
| `PdfPreview` / `OfficePreviewContent` | PDF / Office 文档预览 |
| `SignatureCapture` | 手写签名采集 |
| `HelpTooltip` / `CountUp` / `Sparkline` / `ProgressPanel` | 小部件 |
| `Amap` | 高德地图 |
| `CustomerIndexSuggestions` | 客户索引建议 |
| `MySettingsDialog` | 个人设置弹窗 |

## 工具库（`frontend-admin/src/lib/`）

| 模块 | 提供 |
|---|---|
| `format.ts` | **`formatDateTime`、`formatCount`——日期/数字格式化唯一权威来源** |
| `utils.ts` | `cn()` 类名合并 |
| `text-i18n.ts` / `use-admin-dom-text-i18n.ts` | 简繁文案 |
| `markdown.tsx` | Markdown 渲染 |
| `signature-crop.ts` | 签名裁剪 |
| `customer-index.ts` | 客户索引 |
| `service-items.ts` | 服务事项 |
| `service-order-detail.ts` / `service-order-detail-view.ts` | 工单详情数据/视图 |
| `feature-flags.ts` | 功能开关 |
| `use-url-param.ts` | URL 参数 hook |

## API 与状态

- **API 唯一入口**：`src/services/api.ts`（全项目只有它内部用 `fetch`，禁止绕过）
- **上下文**：`contexts/AuthContext.tsx`、`contexts/LanguageContext.tsx`

## 深模块

- `src/packages/mr/`：MR 订购域（独立 lib/components/form-logic，测试 `npm run test:mr`）
- 新模块参照 `src/packages/example/`，先读 `src/packages/README.md` 与 `backend/src/modules/README.md`

## 日期/时间控件约定

**无第三方日期库**。全项目统一原生 `<input type="date|datetime-local|time">`（14 个页面已一致），格式化一律用 `lib/format.ts`。

---

## ✅ 已收敛：format 家族（2026-08-24 完成）

审计发现的 22 处私有 format 函数已全部收敛到 `lib/format.ts`（formatDateTime×9、formatDate×7、formatDateRange×4、formatFileSize×3），基线已清零；`npm run check:reuse` 硬检查持续把关，新私建函数提交即报错。

**规则**：新代码一律使用 `lib/format.ts` 的导出；再犯视为违反宪法并会被机器拦下。
