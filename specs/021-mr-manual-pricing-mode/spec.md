# 021 MR 计价模式：新增"手动开单兜底"（模式 4）

## 背景

现有三种计价模式（1 多项系统集成 / 2 单项系统集成 / 3 开明细）都假设"品项 = 数量 × 单价"的标准形态。实际偶尔出现组合品项（如一套交换机 = 主机 ×1 + 模块 ×20，整套一个价），现有模式表达不了。出现频率低，不值得为此建品项组件结构。

内部讨论决定（2026-10）：新增第 4 种计价模式 **"手动开单兜底"**，让开单人手工填写全部金额，系统不做任何分摊/重算。数量栏保持数字（组合关系写进品名/描述，如"交换机 XX 一套（含主机 ×1 + 模块 ×20）"）。

## 规则

1. **模式值 4，标签"手动开单兜底"**。签单主体白名单：敦阳 `[1,2,3,4]`、敦沪 `[3,4]`（敦沪也开放）。
2. **计算语义**：不做任何分摊与单价重算；各品项 `unitPrice` 照用户所填，`subtotal = qty × unitPrice`；`totalExcludingTax = 各品项小计之和`（同开明细）。`calculateItems` 对模式 4 天然落默认路径，计算逻辑本身不改。
3. **提交校验（半放）**：
   - 必填：品名及描述、数量 > 0、未税单价 ≥ 0（保证总计/税额可算）
   - **放宽**：供应商、采购价（含税）、采购税率**可留空**（开明细下这三项必填）；成本缺失时毛利率为 null，走"成本不完整"既有分支
   - 毛利率非负校验**保留**（单价比成本还低仍拦截；成本留空则毛利率 null，不触发）
   - 模式 1/2 专属校验（毛利率一致、技术服务行等）不作用于模式 4
4. **数量栏保持数字**，不改为自由文本。
5. **报价导入不建议模式 4**：`suggestPricingMode` 只会在 1/2/3 中选择；模式 4 只能手动切换（兜底定位）。导入完成后用户可手动切到模式 4，切换时保留全部品项与已填金额。
6. **切换行为**：
   - 切**到**模式 4：保留现有品项原样（含已分摊/已填单价），`totalExcludingTax` 取当前小计加总；不弹警告（无数据损失）
   - 从模式 4 切**走**：复用现有"离开开明细"逻辑（切系统集成模式弹"单价将重新计算"警告；切回开明细恢复报价原价）
7. **签核流不变**：毛利 < 15% 或总额 > 75 万加签副总的规则照旧；模式 4 成本留空时 `marginRate = null`，不触发毛利加签。
8. **存量单据无影响**：新模式只影响新选它的单。

## 影响面

| 文件 | 改动 |
|---|---|
| `backend/src/modules/mr/lib/domain.js` | `COMPANIES` 白名单两主体各加 4；`validateSubmission` 合法值 `[1,2,3]`→`[1,2,3,4]`、模式 4 跳过 vendor/costInclTax/taxRate 必填；`normalizeOrder` 总计重算条件 `pricingMode === 3` 扩到 4 |
| `backend/src/modules/mr/lib/controller.js` | `getConstants` 的 `pricingModes` 加 `{ value: 4, label: '手动开单兜底' }` |
| `backend/src/modules/mr/lib/mr-pdf.js` | 计价模式标签 map 加 4 |
| `frontend-admin/src/packages/mr/lib/companies.ts` | 白名单镜像同步 |
| `frontend-admin/src/packages/mr/lib/MrFormPage.tsx` | `PRICING_LABELS` 加 4；`changePricingMode` 支持切到/切离模式 4 |
| `frontend-admin/src/packages/mr/lib/form-logic.ts` | `calculateForm`：`salesTotal = mode === 3` → `mode === 3 \|\| mode === 4` |
| `frontend-admin/src/packages/mr/lib/MrItemTable.tsx` | 未税单价输入框 3、4 可编辑（现在 `disabled={mode !== 3}`）；手改单价清 `quotedUnitPrice` 的条件扩到 4；采购税率支持“不填写”；加模式 4 提示文案 |
| `frontend-admin/src/packages/mr/lib/QuotationImportDialog.tsx` | 当前模式为 4 时，导入预览与手动开单兜底一致：保留逐项报价、不做分摊 |
| `frontend-admin/src/packages/mr/lib/MrPrintPage.tsx` | `PRICING` map 加 4 |
| `frontend-admin/src/packages/mr/lib/form-logic.check.ts` | 补模式 4 用例（不分摊、总计=小计和、成本留空毛利 null） |

## 验收标准

1. 新建 MR 选"手动开单兜底"：填品名、数量、单价，供应商/采购价/税率留空可提交签核；缺品名/数量/单价仍被拦。
2. 提交后 `total_excluding_tax` = 各品项小计之和；各品项单价与填写值一致（无重算）。
3. 成本留空的模式 4 单：整单毛利率显示 "-"；签核步骤不因毛利加签副总。
4. PDF 与打印页计价模式显示"手动开单兜底"；品项行单价/小计与填写一致。
5. 敦沪主体可选手动开单兜底；敦阳四种模式均可选。
6. 报价导入建议模式仍只会是 1/2/3；导入后手动切模式 4，品项与金额保留。
7. 后端 `npm run check` + `npm test`、前端 `npm run build` + `npx tsc --noEmit` 全绿。
