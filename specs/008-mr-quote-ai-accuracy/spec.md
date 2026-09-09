# Spec: MR 报价识别准确率提升（回归台架 + HPE 配置组收敛 + 税拆分自动化）

**Date**: 2026-09-09 ｜ **Status**: 待佬确认 ｜ **关联**: GitHub Issue #86

## Type

Change

## 背景：语料基线（2026-09-09 从 RN 测试服拉取）

测试服积累的 MR 单是最好的规则来源——每条人工纠错都是「识别结果 vs 佬实际要的」对照样：

| 语料 | 数量 |
|---|---|
| 报价原始文件 | 154 份（Excel 为主，PDF 20+） |
| 带人工修正 ground truth 的文件 | 63 份（37 个不同内容，去重后） |
| 纠错 diff 记录 | 87 条 |

**失败模式基线**（cached 模式，识别原文 vs 人工修正）：

1. **HPE 整机 CTO 配置组**（最严重）：`dunyang 26-8-7 380 4516y.xlsx` 识别 0 品项→人工录 2 项；`副本ANNIE 26-8-20 360 5515_.xlsx` 识别 36 行 BOM→人工收敛 2 项。两份都有完整人工标准答案，即 Issue #86 的目标场景
2. **vendor 漏填/全称未收敛别名**：35 处（如 `""→"紫光"`、`"苏州聚盛网络技术有限公司"→"聚盛"`）
3. **含税价人工拆未税单价**：14 处（4100→3628.32 ÷1.13 类），有规律可自动化
4. 价格清零（338 处）大概率是工作流动作而非识别错误，不计入识别准确率口径

**注意**：语料含真实供应商价格，`backend/tests/fixtures/quotations/` 已 gitignore，**永不提交**。

## Goal

1. 识别准确率可量化、可回归：每次改 prompt/解析器前跑台架，红灯防劣化
2. HPE CTO 捆绑报价单按配置组收敛为整机品项（Issue #86），BOM 入 `components[]`
3. 含税价自动拆未税、vendor 自动落品项，减少人工补填

## Scope

### A. 回归台架（先行，已完成主体）

- 语料落位 `backend/tests/fixtures/quotations/`（154 文件 + manifest.local.json + ground-truth.local.json）
- 快照回归复用现有 `quotation-fixtures.test.js`（153 份已学金样，纳入 `npm test`）
- 新增 `backend/scripts/mr-quote-accuracy.js`：ground truth 比对报告
  - `cached` 模式：测试服缓存识别原文 vs 人工修正（AI 文件也能评估，不重跑）
  - `replay` 模式：当前代码重跑确定性路径 vs 人工修正（评估代码改动效果）
- **验收**：基线报告已产出（本 spec 背景节数字）；后续每次 P0/P1 改动附前后对比

### B. P0：HPE 整机 CTO 配置组收敛（Issue #86 四层方案，原文已论证）

1. 规则解析器新增「配置组收敛」路径，门控触发：整组明细行无单价 + 存在组级小计/总计 → 按组收敛品项，BOM 入 `components[]`；现有格式（明细行都有单价）不触发新路径
2. `mr_items` 惰性迁移新增 `components JSON NULL`（纯增量）；description 照旧拍平拼装一字不变，打印/PDF 不受影响
3. AI prompt 加条件式整机指引（「仅当明细行无单价且存在组级小计时按组收敛；有单价的明细行保持逐项」+ 正反例）——全格式共享 prompt，**必须跑 154 份语料回归 diff**
4. 前端四场景渲染（`item.components?.length` 门控，历史品项走老渲染）：品项明细表 BOM 折叠小表 / 导入校对预览复用同组件 / 打印归档 PDF 主表+续页三栏清单 / 采购卡片组件折叠表
5. **feature flag**：DB settings 开关默认关，RN 手动开，生产不设置=永远关（Issue #86 已定策略）
- **验收**：2 份 ground truth 文件（`dunyang 26-8-7`、`副本ANNIE 26-8-20`）识别结果与人工修正一致（2 个整机品项、价格对得上、BOM 数量对得上）

### C. P1：税拆分与 vendor 自动化

- 识别结果品项含税 + sheet 级税率明确时，校对预览自动带出未税单价（= 含税÷(1+税率)），消除 14 处人工拆分
- vendor 别名收敛：复用 `mr_layout_rules` 自学习机制（文件名模式→供应商已有），补「公司全称→常用简称」映射沉淀；sheet 级 vendor 自动落到品项 vendor 字段
- **验收**：63 份 ground truth 重跑 replay 模式，vendor 类差异从 35 处压到 <10，税拆分差异归零

## 不做（Non-goals）

- 不动 AI 连接配置机制（沿用 settings/env 现有逻辑）
- 不做 HPE 以外厂商的配置组模板泛化（等语料里出现第二家再抽象）
- 价格清零类差异不追查（判定为工作流动作）

## 发布策略

- feature flag 默认关 → RN 测试服手动开 → 佬验收（验收基准 = 2 份 HPE ground truth + 无回归）
- 验收通过合 main → 生产部署时 flag 保持关（灰度观察后再开）

## 风险

- AI prompt 改动全格式回归 → 用台架 replay + 快照 diff 双重卡控
- `components[]` 入库为惰性迁移加列，回滚 = flag 关闭（列留着无害）
