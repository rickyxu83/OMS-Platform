# Quickstart 验证指南: 考勤管理体验优化

**Date**: 2026-08-24

## 前置

- 分支：按项目约定在 `integration/attendance-mr` 上开发（speckit 编号 001 仅为文档逻辑标识）
- 质量门（提交前必过，宪法 VI）：

```bash
cd backend && npm run check
cd frontend-admin && npx tsc --noEmit && npm run build
npm run test:mr   # 仓库根（MR 模块回归，防旁路破坏）
```

- 部署验证环境：本 worktree 只允许部署 rn 测试服（profile 见本地 `scripts/deploy.local.env`）；生产部署在 main worktree 且需佬明确指示。

## 验证场景（对应 spec.md 用户故事）

### S1：高危操作留痕（US1 / FR-002~003）

1. 主管账号「待我审批」→ 点「驳回」→ 应用内 Dialog（非浏览器原生弹窗）→ 原因留空时确认按钮禁用 → 填写后驳回成功。
2. 行政主管「记录与报表-申请明细」→ 对一张已通过申请点「作废」→ Dialog 警示余额回滚影响并要求必填原因 → 确认后：
   - `docker exec <db> mysql … -e "SELECT void_reason FROM attendance_requests WHERE id=<id>"` 非 NULL。

### S2：草稿出口与查档（US2 / FR-004~005）

1. 病假申请（必传证明），上传阶段断网/换超大文件使附件上传失败 → toast 提示草稿已保留。
2. 「我的申请」草稿行出现「继续提交」→ 点击重开抽屉且表单内容/已传附件保留 → 补齐后提交成功。
3. 「申请明细」工具栏出现日期范围筛选；人为把范围缩到一天验证过滤生效；当返回满 300 条时出现截断提示条。

### S3：加载拆分（US3 / FR-006）

1. 打开 DevTools Network → 考勤设置-工作日历，年份输入框连续敲 4 位数字 → 考勤接口请求 ≤2 次且仅 legal-holidays。
2. 记录与报表-月度汇总切换月份 → 仅 `/attendance/reports/monthly` 重新请求，申请列表不闪动。
3. 值班津贴-年度设置修改年份 → 不逐击键请求（按钮或失焦触发）。

### S4：移动端（US4 / FR-007~008）

1. DevTools 设备模拟 iPhone（390px）→ 考勤管理三处列表均为卡片流，无横向滚动条。
2. 手机视口下完成一次「通过」：按钮点击后立即转 loading 禁用，toast 反馈，无重复提交。
3. 员工余额表在手机视口卡片化，编辑/调余额按钮可点（多选框选退化为复选框，不要求拖动）。

### S5：打磨项（US5）

1. 8 月保存当年值班设置 → 月度审批落在 08 月而非 01 月；保存次年设置落次年 01 月。
2. 证明附件预览弹窗（图片与 PDF 各一）出现「下载原文件」按钮。
3. statTiles 中可用特休 ≤1 天的账号登录 → 数值呈 warning 色。

## 收尾检查（收工前）

- [ ] 新增 `ReasonConfirmDialog` 已登记 `docs/reusable-assets.md` 货架
- [ ] 三处版本号一致：`frontend-admin/package.json`、`package-lock.json`（顶层 + packages[""]）、`src/config/app.ts` 的 `APP_VERSION` fallback
- [ ] 提交按逻辑单元拆分：申请说明 / 确认对话框统一 / 截断治理 / 加载拆分 / 移动端卡片 / 文件重构 各自独立提交，中文主题
- [ ] `CONTEXT.md` 无新领域概念（若引入新术语先补 CONTEXT）
