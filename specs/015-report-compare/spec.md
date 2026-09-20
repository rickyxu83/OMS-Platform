# 015 智能报表：同比/环比对比

## 背景

智能报表（spec 014）目前一次查询只算一个时间段，答不了"比上月多/少多少"这类管理层最高频问题。

## 需求

报表定义支持可选的对比周期，查询结果附带对比值与涨跌幅：

- 用户在对话中说"和上月比 / 同比去年 / 环比"时，AI 在 spec 里输出 `compare` 字段
- 结果每一行（分组）附带：对比期数值、差值、百分比变化
- 前端表格增加"对比"列；摘要由 AI 结合对比数据生成

## 方案

### spec 扩展（engine.js）

```
spec.compare = null | { "type": "previous" | "year_ago" }
```

- `previous`（环比）：取当前时间范围的前一个等长周期。月度范围 → 上月；近7天 → 前7天；本季度 → 上季度；今年 → 去年；绝对范围 → 前推等长天数。`all` 不支持环比（无边界，校验报错提示）
- `year_ago`（同比）：当前范围平移一年。`all` 同样不支持

### 执行方式

同一 groupBy/metrics/filters，把 timeRange 替换为对比周期再跑一遍 `buildQuery`，后端在内存里按分组键 join 两期结果：

```
行 = { ...维度, 指标_本期, 指标_对比期, 指标_差值, 指标_变化率 }
```

- 变化率 = (本期 - 对比期) / 对比期 × 100，对比期为 0 时变化率为 null（前端显示"-"，避免除零）
- 对比期不存在该分组时对比值为 0
- 仅当 metrics 为数值型时输出对比（当前所有指标均为数值）

### AI prompt（assistant.js）

- 数据目录不变；规则新增：用户说"对比/环比/同比/比上月/比去年"时输出 compare 字段
- summarize 输入带上对比数据，让摘要能说出"环比增长 X%"

### 前端（SmartReport.tsx）

- spec 含 compare 时，表格每个指标列旁显示对比值与涨跌幅（↑绿/↓红）
- 图表（bar/line/pie）暂不叠加对比序列，仅在表格体现；摘要文本会提及涨跌幅
- 导出 xlsx/pdf 带对比列

### 校验

- compare.type 非法 → validateSpec 报错
- timeRange 为 all + compare → 报错"全部时间不支持对比"

## 影响面

- `backend/src/modules/report/engine.js`（核心）、`assistant.js`、`export.js`、`controller.js`（透传）
- `frontend-admin/src/pages/SmartReport.tsx`
- 测试：engine.test.js 补 compare 的 validateSpec / buildQuery / 结果合并单测

## 非目标

- 不做自定义对比周期（"和今年3月比"）
- 不做图表双序列对比
- 不改数据集定义
