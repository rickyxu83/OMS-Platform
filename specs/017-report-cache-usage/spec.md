# 017 智能报表：摘要缓存 + 使用日志

## 背景

批次 1~3 后遗留两个小项：①同一模板反复重跑时 AI 摘要每次都重新调用（几秒延迟 + token 成本）；②谁问了什么、哪些数据集被用得最多没有记录，无法指导后续数据集建设。

## 需求

### 1. AI 摘要缓存

- 缓存键：报表口径（specText）+ 列名 + 数据行内容 的哈希
- 进程内 Map + TTL（60 分钟）+ 容量上限（500 条，LRU 简单淘汰）
- 命中时跳过 AI 调用直接返回；数据变化 → 键变化 → 自然重新生成
- 对话/预览/模板重跑/订阅推送共享同一缓存（同进程）
- 不做持久化：进程重启缓存清空即可，无正确性影响

### 2. 使用日志

- 新表 `report_usage_log`（ensure 惰性建表）：user_id、action（chat/preview/export）、dataset、spec JSON、行数、是否带对比、图表类型、created_at
- 写入时机：chat 产出 spec、preview（模板重跑）、export；fire-and-forget 不阻塞主流程
- 不做查询界面：先用 SQL 直接分析（哪些数据集最热、什么问题问得多），后续需要再加

## 影响面

- `report/assistant.js`（缓存）、`report/store.js`（建表 + 写入）、`report/controller.js`（打点）
- 测试：缓存键纯函数单测

## 非目标

- 缓存持久化 / 跨进程共享
- 使用日志查询界面
