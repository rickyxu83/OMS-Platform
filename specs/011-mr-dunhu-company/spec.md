# MR 模块接入第二签单主体：上海敦沪信息科技有限公司

> 日期：2026-09-10　状态：已确认，待实施
> 决策来源：佬在会话中逐项拍板（方案 A / 计价模式仅开明细 / 签核流程一致 / Ctrl.No 手填不动 / logo 暂共用敦阳）

## 背景

MR 模块当前只服务敦阳（宁波）科技有限公司，公司名、logo、内部供应商判定等以硬编码方式散落在前后端。
现需接入第二家签单主体 **上海敦沪信息科技有限公司**（简称"敦沪"，英文暂无，logo 暂共用敦阳）。

**敦沪单的核心业务规则：计价模式仅允许"开明细（pricingMode=3）"**，其余流程（签核步骤、权限、通知）与敦阳完全一致。

## 范围

### 做

1. **数据层**：`mr_orders` 增加 `company` 列（`dunyang` / `dunhu`，默认 `dunyang`），走 `ensure*` 惰性迁移；存量数据无感归敦阳。
2. **公司配置常量化**：后端 MR constants 下发 `companies` 数组（value / 公司全称 / 简称 / 英文名 / logo / 允许的计价模式白名单），前端从 constants 取，不各自硬编码。
3. **表单行为**：
   - 新建/编辑 MR 增加"签单主体"选择；**draft 状态可改，提交签核后锁定**。
   - 选敦沪 → 计价模式锁定为"开明细"，切换按钮隐藏；后端 domain 层强制校验（敦沪单提交非模式 3 直接拒绝）。
   - 装机/维护承担方选项按公司切换（敦沪单显示"敦沪"）；承担方含本公司内部承担方时同样触发"工程会签"。
4. **内部供应商 / 报价识别口径**：内部供应商正则与 quotation-parser 自己公司判定统一加入 `敦沪|dunhu`：
   - 敦沪作为供应商 = 内部承担，无需采购、不强制采购单号；
   - 敦沪抬头的报价文件不被误判为外部报价。
5. **PDF / 打印页眉**：按 `company` 输出公司名（上海敦沪信息科技有限公司）；logo 暂共用敦阳；敦沪暂无英文名则不渲染英文行；后续提供后只改常量。
6. **列表**：MR 列表加"签单主体"筛选下拉 + 列展示。

### 不做

- 权限模型不动（同一批人可填两家公司的单）。
- 签核流程不动（步骤、角色与敦阳一致）。
- Ctrl.No 编号不动（手填字段，无序列逻辑）。
- 系统级邮件落款不动（仍归敦阳）。
- 不做公司配置后台维护页（方案 B），第三家公司出现时再升级。

## 关键改动点（现状硬编码清单）

| 位置 | 改动 |
|---|---|
| `backend/src/modules/mr/lib/domain.js` | company 白名单校验；WORK_OPTIONS 按公司；内部供应商正则加敦沪；工程会签判定按公司 |
| `backend/src/modules/mr/lib/controller.js` | ensure 迁移加列；ORDER_COLUMNS 映射；getConstants 下发 companies；列表查询加 company 筛选 |
| `backend/src/modules/mr/lib/mr-pdf.js` | 页眉公司名/英文名按 company 取常量 |
| `backend/src/modules/mr/lib/quotation-parser.js`、`quotation-merge.js`、`quotation-layout-rules.js` | own-company 正则加敦沪 |
| `frontend-admin/src/packages/mr/lib/form-logic.ts` | 内部供应商正则同步；计价模式锁定逻辑 |
| `frontend-admin/src/packages/mr/lib/MrFormPage.tsx` | 签单主体选择器；模式切换按公司白名单 |
| `frontend-admin/src/packages/mr/lib/MrPrintPage.tsx` | 页眉按 company |
| `frontend-admin/src/packages/mr/lib/MrListPage.tsx` | 公司筛选 + 列 |

## 验收标准

1. 新建 MR 可选签单主体，默认敦阳；选敦沪后计价模式只有"开明细"且不可切换；保存后刷新仍在。
2. 敦沪单提交签核，流程步骤与敦阳一致；装机/维护承担方含"敦沪"时出现工程会签步骤。
3. 敦沪单品项供应商填"敦沪"时视为内部承担：不强制采购单号、不派采购待办。
4. 敦沪单导出 PDF / 打印页，页眉为"上海敦沪信息科技有限公司"，无英文名行，logo 为敦阳标。
5. 存量敦阳单打开、编辑、导出 PDF 全部无变化（页眉仍为敦阳全称+英文名）。
6. MR 列表可按签单主体筛选，列表展示公司列。
7. draft 状态可换公司并触发计价模式重置；已提交单的公司字段只读。
8. 后端 `npm run check` + MR 相关测试全绿；前端 `npm run build` + `npx tsc --noEmit` 0 错误。
