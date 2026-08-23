# Implementation Plan: 考勤管理模块体验审计与前端美化优化

**Branch**: `001-attendance-ux-polish`（speckit 逻辑编号；实际开发按项目约定落在 `integration/attendance-mr`） | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-attendance-ux-polish/spec.md`

## Summary

对考勤管理模块（申请/审批/余额/节假日/值班津贴/汇总导出）做了一次全量读码审计（[research.md](./research.md)），确认 4 个待改缺口（草稿卡死、高危操作零留痕、明细静默截断 300 条；申请说明缺一项已经用户裁决砍掉）、3 个加载性能点、移动端未走既有 ResponsiveList 资产，以及若干一致性打磨项。技术方针：**零 schema 变更、零新依赖、复用优先**——`reason`/`void_reason` 后端早已支持，前端补录入口；新增唯一共享组件 `ReasonConfirmDialog` 并登记货架；`Attendance.tsx`（2649 行）拆分到 `components/attendance/` 作为最后一批独立提交。

交付批次（每批独立可验收、独立提交）：

1. **批 1（P1 留痕与查档）**：`ReasonConfirmDialog` 统一替换 prompt/confirm + 作废必填原因（A3，含后端一行防御）、申请明细日期范围筛选 + 截断提示（A4，后端加 startDate/endDate 可选参数）
   - ~~A1 申请说明录入~~：已砍（用户裁决 2026-08-24，不需要理由录入）
2. **批 2（P1 草稿出口）**：附件失败提示草稿保留 + 「我的申请」草稿行「继续提交」预填重开（A2）
3. **批 3（P2 加载与移动端）**：load() 拆分独立 effect（B1/B2）、行内操作按钮 loading（FR-007）、三处列表 + 员工余额表接 ResponsiveList（C1）
4. **批 4（P3 打磨与重构）**：值班跳转月份、附件预览下载按钮、余额预警色（D2）；`Attendance.tsx` 文件拆分（D1，纯移动代码不改行为）

## Technical Context

**Language/Version**: TypeScript 5.8（前端）/ Node.js（后端，CommonJS 无分号风格沿用现状）

**Primary Dependencies**: React 18 + Vite 6 + Tailwind 4 + Radix UI（`src/components/ui`）+ lucide-react + sonner；后端 Express + mysql2 风格 `query()`。禁止新增依赖类别（宪法 II）

**Storage**: MySQL（无结构变更；惰性迁移 `ensure*` 体系不触及）

**Testing**: 后端 `npm run check`（node --check 全量）；admin 端 `npx tsc --noEmit`（0 错误）+ `npm run build`；根 `npm run test:mr` 回归。不做本地 mock/headless 伪验证（AGENTS.md 工作流规则 2）

**Target Platform**: Web 管理端（桌面 + 手机浏览器），后端 Linux Docker 容器

**Project Type**: Web application（frontend-admin + backend）

**Performance Goals**: 考勤设置页年份输入触发的考勤接口请求 ≤2 次（现状 ≥8 次/击键）；页面无新增阻塞性渲染

**Constraints**: 复用 `lib/format.ts` / `services/api.ts` / `ResponsiveList` / Radix Dialog；领域术语对齐 `CONTEXT.md`；可见变更同步升三处版本号；本 worktree 只部署 rn 测试服

**Scale/Scope**: 前端 4 个考勤文件约 4300 行 + 后端 1 个模块约 4500 行；后端改动 ≤30 行（void 防御 + requests 日期参数）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 判定 | 说明 |
|---|---|---|
| I. 复用优先 | ✅ | 移动端直接复用 `ResponsiveList`（货架既有）；确认对话框统一为一个新组件 `ReasonConfirmDialog`——已 grep 确认无现成等价物（现状为原生 prompt + 一次性内联 Textarea 两种散装实现），新建后将登记 `docs/reusable-assets.md` |
| II. 技术栈钉死 | ✅ | 零新依赖；日期输入沿用原生 `<input type="date">`；格式化走 `lib/format.ts`；请求走 `services/api.ts`；后端无新迁移函数 |
| III. 版本号同步 | ✅ | 全部批次均为可见变更，每批提交同步升三处版本号（quickstart 收尾检查已列） |
| IV. 隐私与部署边界 | ✅ | 文档不含真实服务器/域名；部署只走 rn 测试服 profile（本地私有 env） |
| V. 领域语言一致 | ✅ | 术语对齐 CONTEXT.md：考勤申请/审批链/代理人/路上时间/自报往返时间；未引入新领域概念 |
| VI. 质量门 | ✅ | 每批提交前跑 check + tsc + build + test:mr（quickstart 已固化为命令） |

**Gate 结果：PASS（无违规项，无需 Complexity Tracking）**

Phase 1 设计后复检：data-model.md 确认零 schema 变更，contracts/ 三处变化均向后兼容或为单调用方收紧——结论不变，PASS。

## Project Structure

### Documentation (this feature)

```text
specs/001-attendance-ux-polish/
├── plan.md              # 本文件
├── spec.md              # 需求规格（5 个用户故事 / 10 条 FR）
├── research.md          # Phase 0：全量审计结论（含代码证据）
├── data-model.md        # Phase 1：既有实体与字段启用说明（零变更）
├── contracts/
│   └── api-notes.md     # Phase 1：三处契约级变化（向后兼容）
└── quickstart.md        # Phase 1：5 组验收场景 + 收尾检查
```

### Source Code (repository root)

```text
backend/
└── src/modules/attendance/
    └── controller.js        # 仅两处小改：voidRequest 原因必填防御；listRequests 加 startDate/endDate 过滤

frontend-admin/
└── src/
    ├── components/
    │   ├── ReasonConfirmDialog.tsx        # 新增：统一原因/确认对话框（登记货架）
    │   └── attendance/                    # 新增目录（批 4 拆分）
    │       ├── RequestList.tsx            # 含 ResponsiveList 卡片渲染
    │       ├── ApprovalChain.tsx
    │       ├── HolidayPanel.tsx
    │       ├── SettingsHolidays.tsx
    │       ├── ReportExportDialog.tsx
    │       └── EmployeeDialogs.tsx
    └── pages/
        ├── Attendance.tsx                 # 逐批瘦身：弹窗/提示替换 → effect 拆分 → 最终仅留编排
        ├── AttendanceApplyDrawer.tsx      # 加申请说明；提交失败分阶段提示；支持草稿预填重开
        ├── attendance-shared.ts           # ApplyForm 增 reason 等共享类型调整
        └── AttendanceDuty.tsx             # year 输入防抖/按钮触发；保存后落月合理化
```

**Structure Decision**: 沿用现有 Web 应用结构；唯一新增目录 `frontend-admin/src/components/attendance/` 遵循货架「业务共享组件」层级（与 `components/ServiceOrderDetailDialog` 等同级），不触碰 `src/packages/`（深模块体系，MR 域专用）。

## Complexity Tracking

无违规项，本表留空。
