# 数据模型：值班津贴月度待办（spec 013）

## 新增表

### `attendance_duty_settings`（长期值班设置，不按年）

| 列 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED PK AI | |
| duty_kind | VARCHAR(40) | `monthly_on_call`（每月值班固定名单）/ `legal_holiday_on_call`（法定节假日） |
| holiday_name | VARCHAR(100) NULL | `legal_holiday_on_call` 时为假期名称（如「国庆节」），跨年复用；`monthly_on_call` 时为 NULL |
| created_by / updated_by | BIGINT UNSIGNED NULL | |
| created_at / updated_at | DATETIME | |

唯一键：`uniq_duty_setting (duty_kind, holiday_name)`（monthly 记录全表仅一行，holiday_name 为 NULL 时 MySQL 唯一键不冲突，由代码保证单行）。

### `attendance_duty_setting_members`（设置成员）

| 列 | 类型 | 说明 |
|---|---|---|
| setting_id | BIGINT UNSIGNED | FK → attendance_duty_settings.id |
| employee_id | BIGINT UNSIGNED | 工程师（`attendance_employee_profiles.id`） |
| sequence_no | INT UNSIGNED | 展示顺序 |

主键：`(setting_id, employee_id)`。

## 沿用表

### `attendance_duty_records`（结构不变，语义收窄）

- `duty_type` 新记录仅用：`monthly_on_call`（月度值班，每人每月 1 条，`units=1`）、`legal_holiday_on_call`（法定节假日，每人每段 1 条，`units=段内当月天数`）
- `duty_date` / `duty_end_date`：跨月假期段裁剪到当月范围（`duty_month` = 裁剪后所在月）
- `overlap_state`：新记录恒 `none`（字段保留供历史数据）
- `source_template_id`：新记录恒 NULL
- 旧 `weekend_on_call` 历史记录保留，仅供查询

### `attendance_duty_monthly_batches`（结构不变）

- 状态机不变：`draft → pending_admin → approved / rejected → pending_admin`
- 新增语义：`draft` 批次由调度器每月 1 号创建（系统生成，`supervisor_submitted_by` 在人工提交前为 NULL）

## 废弃（保留不读写）

- `attendance_duty_templates` / `attendance_duty_template_members`：旧年度设置数据保留，代码不再读写

## 迁移动作（部署时一次性，走 `ensureSchema` 惰性迁移）

1. 建两张新表（`CREATE TABLE IF NOT EXISTS`）
2. 清理未送审旧记录：`DELETE FROM attendance_duty_records WHERE batch_status IN ('draft','rejected')`（已送审/已终审的保留）
3. 未送审旧批次重置：`DELETE FROM attendance_duty_monthly_batches WHERE status IN ('draft','rejected')`——当月批次由新逻辑按新设置重算（保存设置时或次月 1 号生成）
4. 迁移幂等：用 `information_schema` 探测/状态守卫，重复执行无副作用

## 月度生成算法（调度器 / 保存设置重算共用）

```
输入：月份 month、设置（月度名单 M、假期名单 H{name→ids}）、假期日历 rows
1. 若当月批次已存在 → 返回 skip（调度器场景）；保存设置场景仅当批次 draft/rejected 时先删旧记录再生成
2. records = []
   - 月度：M 中每人 → { duty_date: month-01, duty_type: 'monthly_on_call', reason: '月度值班', units: 1 }
   - 假期：rows 按名称聚合为段 → 每段与 month 求交 → 交集中天数 days > 0 且 H[name] 非空
     → H[name] 每人 → { duty_date: 交集起, duty_end_date: 交集止, duty_type: 'legal_holiday_on_call', reason: name, units: days }
3. records 为空 → 不建批次，返回 empty
4. 写入 records + 批次（draft），事务提交
```
