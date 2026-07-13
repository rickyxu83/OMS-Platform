# 审批全程展示加班工单：技术设计

## Scope

本改动只补全工单加班申请的来源快照与审批列表展示。审批层级、状态流转、权限判断和完整工单页面保持不变。

## Architecture

### Storage

在 `attendance_requests` 增加可空字段：

```sql
source_snapshot JSON NULL
```

字段由考勤模块现有 `ensureSchema()` 惰性迁移创建。仅 `source_type = 'service_order'` 的新加班申请写入该字段；旧记录保持 `NULL`，不做批量回填。

快照使用稳定的 API 字段名，不暴露数据库列名：

```json
{
  "id": 123,
  "orderNo": "SO-20260713-001",
  "customerName": "客户名称",
  "contactName": "联系人",
  "contactPhone": "联系电话",
  "deviceName": "设备型号 / 序列号",
  "serviceMode": "onsite",
  "serviceType": "repair",
  "issueDescription": "问题描述",
  "serviceAt": "2026-07-13T18:00",
  "departureAt": "2026-07-13T17:00",
  "actualStartAt": "2026-07-13T18:00",
  "actualEndAt": "2026-07-13T21:00",
  "returnAt": "2026-07-13T22:00"
}
```

快照不包含附件、内部备注、审批信息或完整服务报告正文。

### Write path

`createServiceOrderOvertimeRequest` 已在事务内读取并校验工单及服务报告。新增一个纯函数把该查询行规范化为工单摘要；同一个摘要经 `JSON.stringify` 写入 `source_snapshot`，不新增第二次工单查询。

工单快照与考勤申请在同一事务中落库。后续修改原工单不会覆盖快照。

### Read path

`listRequests` 返回每条考勤申请时增加：

```ts
serviceOrder: ServiceOrderSnapshot | null
```

数据选择顺序：

1. `source_snapshot` 可正确解析时，使用快照。
2. 工单来源记录没有有效快照时，收集全部 `source_id`，单次批量查询当前工单摘要。
3. 当前工单也不存在时，返回只包含 `id` 和 `unavailable: true` 的降级对象。
4. 非工单来源记录返回 `null`。

历史回退查询以已经通过考勤范围过滤的申请行为边界，不调用面向工程师本人的 `/overtime/service-orders` 查询，因此不会错误要求审批人具备工单填写权限，也不会扩大其可见的考勤申请范围。

快照解析必须容错：数据库驱动返回对象或 JSON 字符串时都能规范化；无效类型和损坏 JSON 视为无快照并进入回退路径。

## Executable Snapshot Contract

### 1. Scope / Trigger

当 `attendance_requests.source_type = 'service_order'` 时，`source_snapshot` 是审批展示的不可变来源；只有通过来源绑定和字段类型校验的快照才可优先于当前工单。

### 2. Signatures

- DB：`attendance_requests(source_type VARCHAR(32), source_id BIGINT UNSIGNED, source_snapshot JSON NULL)`。
- 解析：`parseServiceOrderSnapshot(value, expectedSourceId)`。
- API：`AttendanceRequest.serviceOrder = ServiceOrderSnapshot | { id, unavailable: true } | null`。

### 3. Contracts

- `source_snapshot.id` 必须是正数，并且等于同一申请行的 `source_id`。
- `orderNo`、客户/联系人/设备/服务类型/问题字段及五个时间字段只允许字符串、`null` 或缺省。
- API 不返回原始 `source_snapshot`；只返回规范化后的 `serviceOrder`。

### 4. Validation & Error Matrix

- JSON 损坏、数组、无有效 ID、ID 与 `source_id` 不一致、任一摘要字段为对象/数组/数字/布尔值：快照无效，进入当前工单批量回退。
- 当前工单可读：返回当前工单摘要。
- 当前工单不存在：返回 `{ id: source_id, unavailable: true }`，列表和审批操作继续可用。
- 非服务工单来源：返回 `serviceOrder: null`。

### 5. Good / Base / Bad Cases

- Good：新申请快照 ID 与来源 ID 一致，字段均为字符串或空值，所有审批人看到同一内容。
- Base：历史申请没有快照，列表通过一次去重批量查询读取当前工单。
- Bad：快照 ID 指向另一工单或字段被写成嵌套对象；不得显示该快照，也不得输出 `"[object Object]"`。

### 6. Tests Required

- 创建申请断言插入的 JSON 快照字段完整且 ID 正确。
- 同一工单的两条申请携带不同快照时，按申请 ID 隔离返回。
- `89/91/89` 等输入只触发一次去重批量查询并正确映射。
- 损坏 JSON、数组、缺失 ID、ID 不匹配和嵌套对象字段均进入回退；原始 `source_snapshot` 不出现在响应中。

### 7. Wrong vs Correct

```js
// Wrong: 只信任快照自身的正数 ID，会接受另一工单或对象字段。
parseServiceOrderSnapshot(row.source_snapshot)

// Correct: 将快照绑定到申请来源，任何契约不符都回退当前工单。
parseServiceOrderSnapshot(row.source_snapshot, Number(row.source_id))
```

## Frontend

`AttendanceRequest` 增加可空的 `serviceOrder` 类型。`RequestList` 对 `requestType === 'overtime' && sourceType === 'service_order'` 的记录渲染统一工单摘要组件。

默认摘要直接显示：

- 工单号；
- 客户；
- 设备；
- 服务模式 / 服务类型；
- 问题描述。

摘要下方使用项目已有的原生 `<details>` 交互。展开后显示联系人、联系电话、服务日、出发、到达、完成和返回时间。每一行独立展开，不引入全局弹窗或额外请求。

降级对象显示“关联工单 #ID 暂不可用”，仍保留申请本身的加班类型、时段、小时数与审批轨迹。请假、调休和非工单来源记录不渲染工单区域。

由于“待我审批”“我的申请”和“全员申请记录”复用 `RequestList`，三处自动获得一致展示。

## Error Handling and Compatibility

- `source_snapshot` 可空，部署时无需历史数据回填。
- 快照写入失败属于申请事务失败，避免产生只有关联 ID、没有预期快照的新申请。
- 快照解析失败不阻断列表，记录进入当前工单回退查询。
- 回退工单缺失不阻断列表，返回降级对象。
- 接口只增加字段，不移除或改变现有字段，旧管理端可继续使用。
- 回滚应用代码时，可保留未使用的可空 JSON 列，不需要执行破坏性反向迁移。

## Testing

后端回归测试覆盖：

1. 新建工单加班申请时，插入参数包含规范化后的 `source_snapshot`。
2. 列表记录有快照时优先返回快照，并且不被当前工单内容覆盖。
3. 历史记录无快照时，通过一次批量查询补充当前工单摘要。
4. 历史工单不存在或快照损坏时，列表返回降级对象且不报错。
5. 非工单申请的 `serviceOrder` 为 `null`。

前端当前没有自动化测试框架，使用现有质量门禁和人工验收：

- `npx tsc --noEmit`；
- `npm run build`；
- 逐级审批场景确认摘要与展开详情持续可见；
- 普通请假、调休列表回归；
- 历史无快照及工单不可用的降级展示。

后端执行 `npm run check` 及相关考勤控制器测试。

## Versioning and Rollout

这是管理端可见功能变更，统一提升：

- `frontend-admin/package.json` 顶层版本；
- `frontend-admin/package-lock.json` 顶层版本；
- `frontend-admin/src/config/app.ts` 的 `APP_VERSION` fallback。

部署顺序沿用现有全量部署流程。后端先启动并自动补列，随后管理端使用新增的可选响应字段。

## Trade-offs

选择单列 JSON 快照而不是独立表，是因为当前只有工单加班来源需要固定摘要，字段不会参与筛选、排序或聚合。若未来多种考勤来源都需要版本化、可查询的结构化快照，再评估独立来源表。

选择“快照优先、实时回退”兼顾新记录的审批一致性和旧记录兼容性；不对历史数据做伪快照，避免把读取时的当前内容误认为申请提交时内容。
