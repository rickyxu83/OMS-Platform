# OMS Platform Constitution

> 本宪法是本项目所有 AI session 的最高行为准则。任何 session 开工前必须读本文件 + `AGENTS.md` + `CONTEXT.md`；本宪法与临时偏好冲突时，以本宪法为准。

## Core Principles

### I. 复用优先（NON-NEGOTIABLE）

写任何新 UI 组件、工具函数、API 封装、状态管理之前，**必须先搜索代码库确认没有现成实现**：

1. 先查 `docs/reusable-assets.md` 可复用资产清单（货架）；
2. 再用 grep/ffgrep 搜代码库确认；
3. 有现成实现 → 直接复用或扩展；禁止新造轮子；
4. 确需新建 → 必须在 `docs/reusable-assets.md` 登记新资产，并在提交信息中说明"为何现有资产不满足"。

**背景**：本项目由多个 AI session 接力开发，session 之间无记忆。审计（2026-08-24）发现 format 家族函数被重复定义 21 处（formatDateTime×9、formatDate×7、formatDateRange×4、formatFileSize×3），而 `lib/format.ts` 已有共享实现——这是本宪法存在的直接原因。

### II. 技术栈钉死

**禁止引入新的依赖类别**，新增任何 npm 依赖前必须确认现有依赖无法满足：

- 前端：React 18 + Vite 6 + TypeScript 5.8 + Tailwind 4 + Radix UI（`src/components/ui`）+ lucide-react + sonner
- 日期/时间：**统一使用原生 `<input type="date|datetime-local|time">`**，禁止引入日期库（dayjs/date-fns/react-datepicker 等）
- 日期格式化：**统一使用 `src/lib/format.ts`** 的 `formatDateTime` 等导出，禁止在页面内私建同名函数
- API 请求：**统一走 `src/services/api.ts`**，禁止在组件内直接 `fetch()`
- 后端：Node.js + 原生 `node --test`；数据库结构变更走 `ensure*` 惰性迁移函数（注意 `query()` 返回 rows、`connection.execute()` 返回 `[rows, fields]`，不可混用）

### III. 版本号同步（NON-NEGOTIABLE）

任何可见变更（功能、页面、交互）必须同步提升三处版本号，缺一不可：

1. `frontend-admin/package.json`
2. `frontend-admin/package-lock.json`（顶层 + `packages[""]`）
3. `frontend-admin/src/config/app.ts` 的 `APP_VERSION` fallback

仅文档、注释、后端不可见修复可不升。版本格式沿用现有 `YY.MMDD.NNNN`。

### IV. 隐私与部署边界

- 真实服务器、SSH 别名、域名、CORS 白名单、密钥**只允许**放在本地私有文件（`AGENTS.local.md`、`docs/deploy.local.md`、`scripts/deploy.local.env`、各端 `.env.local` 等），**禁止提交入库**；
- 生产部署固定走 tencent profile，且必须在 main worktree（`/Users/xu/projects/oms`）执行、需佬明确指示；本 worktree 只配 rn 测试服；
- 禁止用 main/正式版本覆盖测试服。

### V. 领域语言一致

业务术语必须与 `CONTEXT.md` 的统一语言对齐（服务工单/服务记录/结案/巡检计划/考勤申请/审批链/MR 单/计价模式……），并使用其中的"避免使用"词表排除错误叫法。代码命名、UI 文案、提交信息均受约束。新增领域概念先更新 `CONTEXT.md` 再写码。

### VI. 质量门（提交前必过）

- 后端：`npm run check`（node --check 全量）
- 管理端：`npx tsc --noEmit` 保持 0 错误 + `npm run build` 通过
- 功能测试：`npm run test:mr`（MR 模块）
- 不做本地 mock/headless 截图等伪验证（见 AGENTS.md 工作流规则）

## 可复用资产货架

权威清单维护在 **`docs/reusable-assets.md`**，每次新增/发现资产必须更新。当前核心资产摘要：

- **UI 基础组件**（`frontend-admin/src/components/ui/`）：badge、button、card、checkbox、dialog、dropdown-menu、input、label、select、separator、sonner、switch、table、textarea
- **业务共享组件**（`frontend-admin/src/components/`）：AdminLayout、ServiceOrderDetailDialog、ResponsiveList、EmptyState、Skeleton、ErrorToast、PdfPreview、OfficePreviewContent、SignatureCapture、HelpTooltip、CountUp、Sparkline、ProgressPanel、Amap、CustomerIndexSuggestions、MySettingsDialog
- **工具库**（`frontend-admin/src/lib/`）：format（日期/计数格式化）、utils（cn）、text-i18n、markdown、signature-crop、customer-index、service-items、feature-flags、use-url-param 等
- **API 层**：`frontend-admin/src/services/api.ts`（唯一入口）
- **状态/上下文**：`contexts/AuthContext.tsx`、`contexts/LanguageContext.tsx`
- **深模块**：`src/packages/mr/`（MR 订购域，含独立 lib/components），新模块参照 `src/packages/example/`，先读 `src/packages/README.md`

## 开发工作流

1. **集成分支单向流**：主工作分支 `integration/attendance-mr`；main→集成分支只 rebase，集成分支→main 只走发布 PR；main 有分支保护，禁止直接 push；
2. **提交规范**：中文提交信息、按逻辑单元拆分、推送即备份；
3. **发布闸门**：①佬在测试服验收通过 ②全量验证绿——缺一不可，AI 不得自行合 main；
4. **多 session 接力**：长任务用 pi-tasks 建契约（验收标准 + 证据门控）；收工前更新本宪法/资产清单/`CONTEXT.md` 中变化的部分，新 session 开工先读三件套（宪法 + AGENTS.md + CONTEXT.md）。

## Governance

- 本宪法优先于一切临时偏好与单个 session 的"惯例"；
- 修订宪法需：在提交信息中说明理由 + 佬确认 + 更新版本号与 Last Amended 日期；
- 发现违反宪法的既有代码（如重复 format 函数）：登记到 `docs/reusable-assets.md` 的"待收敛清单"，按正常迭代逐步收敛，不搞一次性大扫除；
- 每次 PR/提交前，AI 自查：是否新造了已有资产？是否漏升版本号？是否引入了新依赖类别？

**Version**: 1.0.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-24
