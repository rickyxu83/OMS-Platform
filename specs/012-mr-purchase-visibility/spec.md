# spec 012：采购视角 MR 可见性与状态列对齐销售侧

日期：2026-09-11 ｜ 状态：待佬确认

## 背景

1. **Bug**：采购账号下侧边栏「订购申请」角标显示 12（待办计数来自 `mr_purchase_tasks`，口径正确），但点进 `/mr` 列表为空。根源：`backend/src/modules/mr/lib/controller.js` 的 `list()` 可见性过滤只认签核链（`mr_approvals`）与作废审批链（`mr_void_approvals`）参与者，未包含 `purchase_assignee_user_id` / `mr_purchase_tasks` 被指派关系；而详情接口的 `canView()` 是包含的，所以从待办中心点进详情正常。
2. **需求**：采购希望 MR 模块的状态列与销售 MR 填写侧一致，能体现多个状态，而不是待办中心里清一色的「待处理」。

## 决策记录（2026-09-11 佬确认）

- 范围取**方案一：只看采购阶段**——采购可见流转到自己手上的单（待采购/待合同编号/采购完成/无需采购/已作废），不放开在途签核单（`in_review`/`rejected`）的可见性。
- 若未来采购需要「预告在途单」，在本 spec 的可见性规则上 OR 一条 `o.status IN ('in_review','rejected')` 即可，属纯增量。
- 改造同时覆盖**待办中心**与 **MR 列表页**两处状态列。

## 改动方案

### 后端（`backend/src/modules/mr/`）

1. **`lib/controller.js` `list()`**：在角色分支链中新增 `purchaser` 分支（放在 `role !== 'admin'` 兜底之前）：

   ```sql
   o.purchase_assignee_user_id = :userId
   OR EXISTS (SELECT 1 FROM mr_purchase_tasks pv
              WHERE pv.mr_id = o.id AND pv.assignee_user_id = :userId)
   OR <原有 participantClause（签核链/作废链参与者，保留兜底）>
   ```

   - 作废后采购任务行仍保留（status=cancelled），EXISTS 依旧命中，采购可看到已作废单，符合预期。
   - `mr_purchase_tasks.assignee_user_id` 需确认有索引（`ensureWorkflowTables` 建表时检查，缺则补）。

2. **`lib/workflow.js` `MERGED_TASKS_SUBQUERY`**：三个 UNION 分支统一补一列 `o.purchase_status AS business_purchase_status`（非 MR 单/无关联时为 NULL），`listApprovalTasks` 返回体透传 `businessPurchaseStatus`。

3. 不动 `canView` / `canEdit` / `canPurchase` / `canVoidRequest` 等操作权限函数——本次只放宽**列表可见性**，不放开任何操作入口。

### 前端（`frontend-admin/src/`）

1. **`packages/mr/types.ts`**：`ApprovalTask` 增加 `businessPurchaseStatus?: string | null`。
2. **`pages/ApprovalTasks.tsx`**：`statusIndicator` 对 MR 系业务（`mr` / `mr_purchase` / `mr_contract_no` / `mr_void`）改为按 `businessStatus`（+ `businessPurchaseStatus`）渲染，映射与 MR 列表对齐：
   - `approved + pending → 已通过 → 待采购`、`approved + waiting_contract → 已通过 → 待合同编号`、`approved + done → 已通过 → 采购完成`、`approved + skipped → 已通过 → 无需采购`、`voided → 已作废`；
   - 图标/配色直接复用 MR 列表的 `STATUS_INDICATOR` / `PURCHASE_INDICATOR` 同款 lucide 图标与色值（抽到 `packages/mr/lib/mr-ui.tsx` 或就地定义，避免跨包循环依赖时再定）；
   - 任务状态（待处理/已同意等）在「待我处理/我已处理」视图由视图本身表达，状态列不再重复；hover 悬浮时间线卡保持现有行为。
   - 考勤（attendance）任务渲染逻辑不变。
3. **`packages/mr/lib/MrListPage.tsx`**：组件本身已支持全部状态渲染，无需改动；验证采购登录后列表正常出单、状态列显示「已通过 → 待采购」等组合即可。
4. **版本号**：本次为可见变更，按提交规范同步升 `frontend-admin/package.json`、`package-lock.json`、`src/config/app.ts` 的 `APP_VERSION` fallback。

## 验收标准

1. 采购账号登录测试服：侧边栏角标数字与 `/mr` 列表条数口径一致，列表不再是空的。
2. 采购在 `/mr` 列表与待办中心两处，状态列均显示业务状态组合（如「已通过 → 待采购」），hover 出时间线；点击状态徽章可按状态筛选（列表页现有行为不受影响）。
3. 采购对列表中单据的可用操作不发生变化（仍只能填采购单号/发起作废等原有权限）。
4. 销售/助理/主管/admin 各角色列表数据与状态列显示无回归。
5. 后端 `npm test` + `npm run check` 通过；admin 端 `npm run build` + `npx tsc --noEmit` 0 错误。

## 回滚

单分支单 PR，改动集中在两个后端函数 + 两个前端文件，`gh pr` revert 即可；无表结构变更、无数据迁移。
