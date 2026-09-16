# 014 智能报表：大白话生成查询报表（NL Report）

## 背景

传统报表是固定页面 + 固定筛选条件，每加一种统计口径都要开发一轮。MR 模块的"规则教练"（spec 009，`quote-coach.js`）已验证一个可复用的模式：**AI 只输出白名单内的结构化 JSON 指令，代码负责执行，AI 不直接碰数据**。

本功能把该模式平移到报表场景：主管用大白话描述想要的报表（"上个月各工程师结了多少单"），AI 翻译成**报表定义 JSON**，后端校验后执行查询，返回表格 + 文字摘要，支持多轮对话调整与 Excel 导出。

## 核心安全设计

- **AI 不写 SQL**。后端定义语义层：预置若干数据集（dataset），每个数据集声明可用筛选字段、分组维度、统计指标（全部白名单）。
- LLM 唯一任务是输出报表定义：`{ dataset, timeRange, filters, groupBy, metrics, chartType? }`。
- 后端校验白名单 → 参数化查询 → 按当前用户身份做数据过滤。AI 拿不到越权数据，因为它只能选数据集，查询由后端执行。
- AI 连接复用 `resolveAiConnection / callAi`（与报价识别、工时摘要同一配置源，系统设置页可配），不新增配置项。

## 使用对象（佬裁决）

开放给**主管及以上**角色，新增权限 `report.use`：

| 角色 | 可用 |
|---|---|
| admin（管理员） | ✅ |
| operations_director（运营负责人） | ✅ |
| engineering_supervisor（工程主管） | ✅ |
| administrative_supervisor（行政主管） | ✅（只读，天然契合报表） |
| sales_supervisor（业务主管） | ✅ |
| assistant_supervisor（助理主管） | ✅ |
| 其余（assistant / dispatcher / sales / engineer / purchaser / driver） | ❌ |

> ⚠️ "主管及以上"的口径待佬确认：是否包含 assistant_supervisor（助理主管）与 sales_supervisor（业务主管）。默认按上表全部包含。

## 产出内容（三层）

1. **数据表**：分组统计后的结果行，页面表格展示（主要交付物）。
2. **文字摘要**：AI 基于查询结果写 2-3 句结论/洞察（"上月共结案 87 单，平均结案时长环比上升…"）。
3. **图表**（P2）：柱状/饼图/趋势折线；前端目前无图表库，P2 引入 recharts（轻、与 React 契合）或 echarts（功能全），届时再定。

## 交互形态

新页面"智能报表"（`frontend-admin/src/pages/SmartReport.tsx`），左右分栏，复用 QuoteCoachDialog 的多轮对话模式：

- 左侧对话面板：大白话描述 → AI 回复说明将如何统计 → 用户继续追问调整（"换成按客户分组"、"去掉已作废的"）。会话不落库。
- 右侧实时预览：每轮刷新表格 + 摘要。
- 满意后操作：导出 Excel；收藏为模板（命名保存报表定义，下次一键重跑）。

## 数据集规划

P1（MVP）先覆盖两个数据量最大、报表需求最频繁的数据集：

| 数据集 | 主要维度 | 主要指标 |
|---|---|---|
| `service_orders`（工单） | 工程师、客户、状态、类型、月/周 | 单数、平均结案时长、未结单数 |
| `timesheets`（工时） | 工程师、客户、月/周 | 工时合计、人均工时 |

P2 扩展：`attendance`（考勤）、`inspection_schedules`（巡检）、`devices`（设备）、`mr_orders`（M单）。

## 导出格式

- **Excel (.xlsx)**：P1 主格式，后端 `exceljs`（已有依赖），数据 sheet + 摘要 sheet。
- **PDF**：P2 再做，`pdfkit` 已有（mr-pdf 有先例），适合打印/签呈场景。
- **报表模板**：报表定义存 `report_templates` 表（见 data-model.md），一键重跑。

## 接口草案

挂载新模块 `backend/src/modules/report/`：

```
POST /api/v1/report/chat      多轮对话：{ messages[], currentSpec? } → { reply, spec, preview }（requirePermission('report.use')）
POST /api/v1/report/preview   按 spec 直接出预览（模板重跑用）
POST /api/v1/report/export    按 spec 导出 xlsx
GET  /api/v1/report/templates 模板列表；POST 保存；DELETE 删除
GET  /api/v1/report/datasets  数据集/字段元数据（前端展示可选维度用）
```

`chat` 的预览数据直接随回复返回（对齐 quote-coach 体验，免去二次请求）；`preview`/`export` 共用同一套 spec 校验与查询执行器。

## 影响面

| 位置 | 改动 |
|---|---|
| `backend/src/modules/report/` | 新模块：语义层定义（datasets.js）、spec 校验+查询执行器（engine.js）、AI 对话（assistant.js，复用 resolveAiConnection/callAi）、路由与控制器 |
| `backend/src/permissions/catalog.js` | 新增 `report.use` 权限及角色表 |
| `frontend-admin/src/pages/SmartReport.tsx` | 新页面（对话 + 预览 + 导出 + 模板） |
| `frontend-admin` 路由/侧边栏 | 注册入口，按 `report.use` 权限显隐 |
| `backend` ensure* 惰性迁移 | `report_templates` 建表（见 data-model.md） |

## 分期

- **P1（MVP）**：多轮对话 → 表格预览 + 文字摘要 + Excel 导出 + 模板收藏；数据集仅工单 + 工时；无图表。
- **P2**：图表（选库待定）、PDF 导出、扩展考勤/巡检/设备/M单数据集。
- **P3**：定时生成 + 邮件推送（复用 `services/scheduler.js`）。

## 验收标准（P1）

1. 工程主管登录后可见"智能报表"入口；工程师/业务登录不可见（前端隐藏 + 后端 403）。
2. 输入"上个月各工程师结了多少单"，页面返回按工程师分组的单数表格 + 一段文字摘要；继续输入"换成按客户分组"后表格正确刷新。
3. AI 输出越权/不存在字段时被白名单拦截，返回友好提示而非 500。
4. 导出 xlsx 内容与页面预览一致（数据 sheet + 摘要 sheet）。
5. 收藏的模板下次打开可一键重跑，数据为最新。
6. 行政主管使用时可正常查询（只读权限不受影响）。

## 待佬确认事项

1. "主管及以上"口径：是否含助理主管、业务主管（默认含）。
2. P1 数据集：默认工单 + 工时，是否有更急的场景。
3. 图表放 P2 是否接受（P1 只有表格 + 摘要）。
