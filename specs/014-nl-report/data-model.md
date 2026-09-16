# 014 数据模型：report_templates

对话过程不落库（对齐 quote-coach 设计）；仅用户主动收藏的报表定义入库。

## report_templates

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT AUTO_INCREMENT PRIMARY KEY | |
| name | VARCHAR(100) NOT NULL | 模板名（用户命名，如"月度工程师结案统计"） |
| spec | JSON NOT NULL | 报表定义 `{ dataset, timeRange, filters, groupBy, metrics }` |
| created_by | INT NOT NULL | 创建人 user id（外键 users.id） |
| created_at / updated_at | DATETIME | |

- 模板归属个人（`created_by` 过滤），P1 不做共享；如需共享后续加 `visibility` 字段。
- 建表走项目惯例的 ensure* 惰性迁移（`CREATE TABLE IF NOT EXISTS`）。

## spec JSON 结构（语义层白名单校验对象）

```json
{
  "dataset": "service_orders",
  "timeRange": { "type": "relative", "value": "last_month" },
  "filters": { "status": ["closed"] },
  "groupBy": ["engineer"],
  "metrics": ["count", "avg_close_hours"]
}
```

- `dataset`：枚举，P1 仅 `service_orders` / `timesheets`。
- `timeRange`：相对（last_week / last_month / this_year…）或绝对起止日期；由后端解析为 SQL 条件，AI 输出的原始表述也保留供展示。
- `filters` / `groupBy` / `metrics`：取值必须在该数据集的白名单内，否则 422 拒绝并提示可用项。
