# 审批全程展示加班工单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为工单加班申请保存提交时的工单摘要快照，并在整个审批链路中提供默认摘要和可展开详情。

**Architecture:** 在 `attendance_requests` 增加可空 JSON 快照列；创建申请时与申请记录同事务写入，列表读取时快照优先、历史记录批量回退当前工单、工单缺失则降级。管理端在共用 `RequestList` 中渲染一个无额外请求的工单摘要组件，因此所有审批阶段和记录列表保持一致。

**Tech Stack:** Node.js 22/CommonJS、Express 5、MySQL 8、`node:assert/strict`、React 18、TypeScript 5、Vite 6、Tailwind CSS。

---

## File Map

- Modify: `backend/tests/attendance-workflow-controller.test.js` — 为快照写入、快照优先、历史回退和缺失降级提供控制器回归测试。
- Modify: `backend/src/modules/attendance/controller.js` — 增加惰性迁移、快照规范化、创建时写入和列表读取回退。
- Modify: `frontend-admin/src/pages/Attendance.tsx` — 扩展响应类型并在共用申请列表中展示摘要与详情。
- Modify: `frontend-admin/package.json` — 管理端版本从 `26.713.109` 提升到 `26.713.110`。
- Modify: `frontend-admin/package-lock.json` — 同步根版本和根包版本到 `26.713.110`。
- Modify: `frontend-admin/src/config/app.ts` — 同步 `APP_VERSION` fallback 到 `26.713.110`。

## Task 1: 保存新申请的工单快照

**Files:**

- Test: `backend/tests/attendance-workflow-controller.test.js:34-89`
- Modify: `backend/src/modules/attendance/controller.js:212-256`
- Modify: `backend/src/modules/attendance/controller.js:420-469`
- Modify: `backend/src/modules/attendance/controller.js:1096-1126`
- Modify: `backend/src/modules/attendance/controller.js:1183-1261`

- [ ] **Step 1: 扩展测试数据库列清单**

在 `requestColumnRows()` 中加入 `source_snapshot`，让现有测试默认模拟“生产库已经完成惰性迁移”：

```js
function requestColumnRows() {
  return [
    'workflow_version',
    'delegate_employee_id',
    'working_days',
    'supervisor_role',
    'source_type',
    'source_id',
    'source_detail',
    'source_snapshot',
    'overtime_day_type',
    'overtime_pay_multiplier',
  ].map((columnName) => ({ columnName }))
}
```

同时给 `loadController` 增加可选列清单，以便单独测试旧库补列：

```js
async function loadController({
  delegateEmployeeId = 9,
  requestColumns = requestColumnRows(),
  connectionExecute = async () => [[], []],
  hasPermission = async () => false,
  hasAnyPermission = async () => false,
} = {}) {
```

把 information schema mock 改为：

```js
    if (/information_schema\.COLUMNS/.test(sql) && /attendance_requests/.test(sql)) return requestColumns
```

- [ ] **Step 2: 写入失败测试，证明新工单加班必须携带快照**

在控制器测试的无效 scope 用例之前先增加旧库迁移用例：

```js
  {
    const requestColumns = requestColumnRows().filter((row) => row.columnName !== 'source_snapshot')
    const { controller, calls } = await loadController({ requestColumns })
    const req = { user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }
    const res = createResponse()
    await controller.listRequests(req, res)
    assert.ok(calls.some((call) => /ADD COLUMN source_snapshot JSON NULL/.test(call.sql)))
  }
```

随后新增快照写入用例。事务 mock 必须覆盖员工、工单、重复申请检查、主管规则、申请插入和审批步骤插入：

```js
  {
    const executeCalls = []
    const orderRow = {
      id: 88,
      order_no: 'SO-20260713-088',
      status: 'completed',
      customer_name: '测试客户',
      contact_name: '王小姐',
      contact_phone: '13800000000',
      device_name: 'PowerVault ME5 / SN-88',
      service_mode: 'onsite',
      service_type: 'repair',
      issue_description: '存储控制器告警',
      service_at: '2026-07-14 18:00:00',
      departure_at: '2026-07-14 17:00:00',
      actual_start_at: '2026-07-14 18:00:00',
      actual_end_at: '2026-07-14 21:00:00',
      return_at: '2026-07-14 22:00:00',
    }
    const { controller } = await loadController({
      connectionExecute: async (sql, params = {}) => {
        executeCalls.push({ sql, params })
        if (/SELECT p\.\*, u\.role/.test(sql)) {
          return [[{ id: 5, user_id: 42, employee_name: '申请人', role: 'engineer', attendance_enabled: 1 }], []]
        }
        if (/FROM service_orders so/.test(sql)) return [[orderRow], []]
        if (/SELECT id\s+FROM attendance_requests/.test(sql)) return [[], []]
        if (/FROM attendance_supervisor_role_rules/.test(sql)) {
          return [[{ supervisor_role: 'engineering_supervisor' }], []]
        }
        if (/INSERT INTO attendance_requests/.test(sql)) return [{ insertId: 901 }, []]
        return [{ affectedRows: 1 }, []]
      },
    })
    const req = {
      user: { id: 42, role: 'engineer' },
      params: { id: '88' },
      body: { segmentKey: 'work', overtimeResult: 'comp_time' },
    }
    const res = createResponse()
    await controller.createServiceOrderOvertimeRequest(req, res)

    assert.equal(res.statusCode, 201)
    const insert = executeCalls.find((call) => /INSERT INTO attendance_requests/.test(call.sql))
    assert.ok(insert)
    assert.match(insert.sql, /source_snapshot/)
    assert.deepEqual(JSON.parse(insert.params.sourceSnapshot), {
      id: 88,
      orderNo: 'SO-20260713-088',
      customerName: '测试客户',
      contactName: '王小姐',
      contactPhone: '13800000000',
      deviceName: 'PowerVault ME5 / SN-88',
      serviceMode: 'onsite',
      serviceType: 'repair',
      issueDescription: '存储控制器告警',
      serviceAt: '2026-07-14 18:00',
      departureAt: '2026-07-14 17:00',
      actualStartAt: '2026-07-14 18:00',
      actualEndAt: '2026-07-14 21:00',
      returnAt: '2026-07-14 22:00',
    })
  }
```

- [ ] **Step 3: 运行测试并确认失败原因是尚未写入快照**

Run:

```bash
cd backend
node tests/attendance-workflow-controller.test.js
```

Expected: FAIL，断言指出插入 SQL 或 `insert.params.sourceSnapshot` 不存在。

- [ ] **Step 4: 增加快照列的建表与惰性迁移**

在 `CREATE TABLE IF NOT EXISTS attendance_requests` 的 `source_detail` 后增加：

```sql
source_snapshot JSON NULL,
```

把 `ensureAttendanceRequestColumns()` 的列清单改为：

```js
AND COLUMN_NAME IN ('workflow_version', 'delegate_employee_id', 'working_days', 'supervisor_role', 'source_type', 'source_id', 'source_detail', 'source_snapshot', 'overtime_day_type', 'overtime_pay_multiplier')
```

在 `source_detail` 迁移之后增加：

```js
  if (!existing.has('source_snapshot')) {
    await query('ALTER TABLE attendance_requests ADD COLUMN source_snapshot JSON NULL AFTER source_detail')
  }
```

- [ ] **Step 5: 增加唯一的工单摘要规范化函数**

在 `combineTravelSegments()` 后、工单查询函数前新增：

```js
function serviceOrderSnapshot(row) {
  if (!row) return null
  const id = Number(row.id || 0)
  if (!id) return null
  return {
    id,
    orderNo: nullableText(row.order_no),
    customerName: nullableText(row.customer_name),
    contactName: nullableText(row.contact_name),
    contactPhone: nullableText(row.contact_phone),
    deviceName: nullableText(row.device_name),
    serviceMode: nullableText(row.service_mode),
    serviceType: nullableText(row.service_type),
    issueDescription: nullableText(row.issue_description),
    serviceAt: toIsoMinute(row.service_at),
    departureAt: toIsoMinute(row.departure_at),
    actualStartAt: toIsoMinute(row.actual_start_at),
    actualEndAt: toIsoMinute(row.actual_end_at),
    returnAt: toIsoMinute(row.return_at),
  }
}
```

把 `listOvertimeServiceOrders` 的对象映射改为复用这个函数，只额外保留 `status` 和 `segments`：

```js
  const items = rows
    .map((row) => ({
      ...serviceOrderSnapshot(row),
      status: row.status,
      segments: overtimeSegments(row, usedMap.get(Number(row.id)) || new Set()),
    }))
    .filter((item) => item.segments.length)
```

- [ ] **Step 6: 在创建申请的事务中写入快照**

取得 `order` 后生成一次摘要：

```js
    const orderSnapshot = serviceOrderSnapshot(order)
    if (!orderSnapshot) throw notFound('没有可申请的工单')
```

把插入列和值扩展为：

```sql
(workflow_version, employee_id, request_type, leave_type, overtime_kind, overtime_result, overtime_day_type, overtime_pay_multiplier, supervisor_role, source_type, source_id, source_detail, source_snapshot, start_at, end_at, hours, working_days, reason, status, submitted_by)
```

```sql
(2, :employeeId, 'overtime', NULL, :overtimeKind, :overtimeResult, :overtimeDayType, :overtimePayMultiplier, :supervisorRole, 'service_order', :serviceOrderId, :sourceDetail, :sourceSnapshot, :startAt, :endAt, :hours, NULL, :reason, 'pending_supervisor', :submittedBy)
```

插入参数增加：

```js
        sourceSnapshot: JSON.stringify(orderSnapshot),
```

- [ ] **Step 7: 运行相关测试并确认通过**

Run:

```bash
cd backend
node tests/attendance-workflow-controller.test.js
```

Expected: PASS，进程退出码为 0。

- [ ] **Step 8: 提交后端快照写入逻辑**

```bash
git add backend/src/modules/attendance/controller.js backend/tests/attendance-workflow-controller.test.js
git commit -m "保存加班申请工单快照"
```

## Task 2: 列表优先读取快照并兼容历史记录

**Files:**

- Test: `backend/tests/attendance-workflow-controller.test.js:48-89`
- Test: `backend/tests/attendance-workflow-controller.test.js:337-352`
- Modify: `backend/src/modules/attendance/controller.js:541-570`
- Modify: `backend/src/modules/attendance/controller.js:1304-1403`

- [ ] **Step 1: 让控制器测试支持按 SQL 注入查询结果**

扩展 `loadController` 参数：

```js
async function loadController({
  delegateEmployeeId = 9,
  requestColumns = requestColumnRows(),
  connectionExecute = async () => [[], []],
  queryHandler = null,
  hasPermission = async () => false,
  hasAnyPermission = async () => false,
} = {}) {
```

在默认 `query()` 的固定 schema/profile 分支之后、`INSERT INTO attendance_requests` 分支之前增加：

```js
    if (queryHandler) {
      const handled = await queryHandler(sql, params)
      if (handled !== undefined) return handled
    }
```

- [ ] **Step 2: 写入快照优先测试**

新增列表用例，快照内容与模拟的当前工单内容故意不同，并断言不会执行历史回退查询：

```js
  {
    let fallbackQueries = 0
    const snapshot = {
      id: 88,
      orderNo: 'SO-SNAPSHOT',
      customerName: '申请时客户',
      contactName: '申请时联系人',
      contactPhone: '13800000000',
      deviceName: '申请时设备',
      serviceMode: 'onsite',
      serviceType: 'repair',
      issueDescription: '申请时问题',
      serviceAt: '2026-07-14 18:00',
      departureAt: '2026-07-14 17:00',
      actualStartAt: '2026-07-14 18:00',
      actualEndAt: '2026-07-14 21:00',
      returnAt: '2026-07-14 22:00',
    }
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql)) {
          return [{
            id: 902,
            workflow_version: 2,
            employee_id: 5,
            employee_name: '申请人',
            request_type: 'overtime',
            overtime_kind: 'work',
            overtime_result: 'comp_time',
            source_type: 'service_order',
            source_id: 88,
            source_detail: 'work',
            source_snapshot: JSON.stringify(snapshot),
            start_at: '2026-07-14 18:00:00',
            end_at: '2026-07-14 21:00:00',
            hours: 3,
            status: 'pending_supervisor',
          }]
        }
        if (/FROM service_orders so/.test(sql)) {
          fallbackQueries += 1
          return []
        }
        return undefined
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }
    const res = createResponse()
    await controller.listRequests(req, res)
    assert.deepEqual(res.body.items[0].serviceOrder, snapshot)
    assert.equal(fallbackQueries, 0)
  }
```

- [ ] **Step 3: 写入历史回退和工单缺失测试**

新增两个列表用例：

```js
  {
    let fallbackQueries = 0
    const { controller } = await loadController({
      queryHandler: async (sql, params) => {
        if (/FROM attendance_requests r/.test(sql)) {
          return [{
            id: 903,
            workflow_version: 2,
            employee_id: 5,
            employee_name: '申请人',
            request_type: 'overtime',
            overtime_kind: 'work',
            overtime_result: 'pay',
            source_type: 'service_order',
            source_id: 89,
            source_detail: 'work',
            source_snapshot: null,
            start_at: '2026-07-15 18:00:00',
            end_at: '2026-07-15 20:00:00',
            hours: 2,
            status: 'pending_hr',
          }]
        }
        if (/FROM service_orders so/.test(sql)) {
          fallbackQueries += 1
          assert.equal(params.orderId0, 89)
          return [{
            id: 89,
            order_no: 'SO-CURRENT',
            customer_name: '当前客户',
            contact_name: '当前联系人',
            contact_phone: '13900000000',
            device_name: '当前设备',
            service_mode: 'remote',
            service_type: 'support',
            issue_description: '当前问题',
            service_at: '2026-07-15 18:00:00',
            departure_at: null,
            actual_start_at: '2026-07-15 18:00:00',
            actual_end_at: '2026-07-15 20:00:00',
            return_at: null,
          }]
        }
        return undefined
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }
    const res = createResponse()
    await controller.listRequests(req, res)
    assert.equal(res.body.items[0].serviceOrder.orderNo, 'SO-CURRENT')
    assert.equal(res.body.items[0].serviceOrder.customerName, '当前客户')
    assert.equal(fallbackQueries, 1)
  }

  {
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql)) {
          return [{
            id: 904,
            workflow_version: 2,
            employee_id: 5,
            employee_name: '申请人',
            request_type: 'overtime',
            overtime_kind: 'travel',
            overtime_result: 'comp_time',
            source_type: 'service_order',
            source_id: 90,
            source_detail: 'travel',
            source_snapshot: '{invalid-json',
            start_at: '2026-07-16 18:00:00',
            end_at: '2026-07-16 20:00:00',
            hours: 2,
            status: 'pending_admin',
          }]
        }
        if (/FROM service_orders so/.test(sql)) return []
        return undefined
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }
    const res = createResponse()
    await controller.listRequests(req, res)
    assert.deepEqual(res.body.items[0].serviceOrder, { id: 90, unavailable: true })
  }

  {
    const { controller } = await loadController({
      queryHandler: async (sql) => {
        if (/FROM attendance_requests r/.test(sql)) {
          return [{
            id: 905,
            workflow_version: 2,
            employee_id: 5,
            employee_name: '申请人',
            request_type: 'leave',
            leave_type: 'annual',
            source_type: null,
            source_id: null,
            source_snapshot: null,
            start_at: '2026-07-17 09:00:00',
            end_at: '2026-07-17 18:00:00',
            hours: 8,
            status: 'pending_supervisor',
          }]
        }
        return undefined
      },
    })
    const req = { user: { id: 42, role: 'engineer' }, query: { scope: 'mine' } }
    const res = createResponse()
    await controller.listRequests(req, res)
    assert.equal(res.body.items[0].serviceOrder, null)
  }
```

- [ ] **Step 4: 运行测试并确认四个新读取用例失败**

Run:

```bash
cd backend
node tests/attendance-workflow-controller.test.js
```

Expected: FAIL，响应尚无 `serviceOrder`，或缺少批量回退查询。

- [ ] **Step 5: 增加安全快照解析函数**

在 `serviceOrderSnapshot()` 后新增：

```js
function parseServiceOrderSnapshot(value) {
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const id = Number(parsed.id || 0)
    if (!id) return null
    return {
      id,
      orderNo: nullableText(parsed.orderNo),
      customerName: nullableText(parsed.customerName),
      contactName: nullableText(parsed.contactName),
      contactPhone: nullableText(parsed.contactPhone),
      deviceName: nullableText(parsed.deviceName),
      serviceMode: nullableText(parsed.serviceMode),
      serviceType: nullableText(parsed.serviceType),
      issueDescription: nullableText(parsed.issueDescription),
      serviceAt: toIsoMinute(parsed.serviceAt),
      departureAt: toIsoMinute(parsed.departureAt),
      actualStartAt: toIsoMinute(parsed.actualStartAt),
      actualEndAt: toIsoMinute(parsed.actualEndAt),
      returnAt: toIsoMinute(parsed.returnAt),
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 6: 增加历史工单批量回退查询**

在 `serviceOrderOvertimeRows()` 后新增只按已授权申请来源 ID 查询的函数：

```js
async function serviceOrderSnapshotsById(orderIds) {
  const ids = [...new Set(orderIds.map((id) => Number(id)).filter(Boolean))]
  if (!ids.length) return new Map()
  const params = Object.fromEntries(ids.map((id, index) => [`orderId${index}`, id]))
  const rows = await query(
    `SELECT so.id, so.order_no, c.name AS customer_name,
            COALESCE(NULLIF(so.contact_name, ''), c.contact_name) AS contact_name,
            COALESCE(NULLIF(so.contact_phone, ''), c.contact_phone) AS contact_phone,
            so.service_mode, so.service_type, so.issue_description,
            COALESCE(NULLIF(CONCAT_WS(' / ', NULLIF(d.model, ''), NULLIF(d.serial_no, '')), ''), NULLIF(d.name, ''), '-') AS device_name,
            sr.departure_at, sr.actual_start_at, sr.actual_end_at, sr.return_at,
            COALESCE(sr.actual_start_at, so.submitted_at, so.created_at) AS service_at
     FROM service_orders so
     LEFT JOIN customers c ON c.id = so.customer_id
     LEFT JOIN devices d ON d.id = so.device_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     WHERE so.id IN (${ids.map((_, index) => `:orderId${index}`).join(', ')})`,
    params,
  )
  return new Map(rows.map((row) => [Number(row.id), serviceOrderSnapshot(row)]))
}
```

- [ ] **Step 7: 在列表响应中按“快照 → 当前工单 → 降级”组装数据**

在 `listRequests` 读取 `rows` 后、附件与审批查询前增加：

```js
  const requestServiceOrderMap = new Map()
  const fallbackOrderIds = []
  for (const row of rows) {
    if (row.source_type !== 'service_order' || !Number(row.source_id)) continue
    const snapshot = parseServiceOrderSnapshot(row.source_snapshot)
    if (snapshot) requestServiceOrderMap.set(Number(row.id), snapshot)
    else fallbackOrderIds.push(Number(row.source_id))
  }
  const currentServiceOrderMap = await serviceOrderSnapshotsById(fallbackOrderIds)
```

把最终响应映射改为：

```js
  res.json({ items: rows.map((row) => {
    const sourceId = Number(row.source_id || 0)
    const serviceOrder = row.source_type === 'service_order' && sourceId
      ? requestServiceOrderMap.get(Number(row.id))
        || currentServiceOrderMap.get(sourceId)
        || { id: sourceId, unavailable: true }
      : null
    return {
      ...requestPayload(row),
      serviceOrder,
      proofFileCount: Number(row.proof_file_count || 0),
      proofFiles: proofFileMap.get(Number(row.id)) || [],
      approvals: approvalMap.get(Number(row.id)) || [],
    }
  }) })
```

- [ ] **Step 8: 运行控制器测试与完整后端测试**

Run:

```bash
cd backend
node tests/attendance-workflow-controller.test.js
npm test
```

Expected: 两条命令均退出码 0；`npm test` 完成语法检查和四个 unit assertion scripts。

- [ ] **Step 9: 提交历史兼容读取逻辑**

```bash
git add backend/src/modules/attendance/controller.js backend/tests/attendance-workflow-controller.test.js
git commit -m "补全审批列表工单摘要"
```

## Task 3: 管理端展示摘要和展开详情

**Files:**

- Modify: `frontend-admin/src/pages/Attendance.tsx:21-47`
- Modify: `frontend-admin/src/pages/Attendance.tsx:151-168`
- Modify: `frontend-admin/src/pages/Attendance.tsx:1846-1955`
- Modify: `frontend-admin/package.json:4`
- Modify: `frontend-admin/package-lock.json:3-9`
- Modify: `frontend-admin/src/config/app.ts:1-7`

- [ ] **Step 1: 定义共享工单摘要类型**

在 `AttendanceRequest` 前定义：

```ts
interface ServiceOrderSummary {
  id: number | string;
  orderNo?: string | null;
  customerName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  deviceName?: string | null;
  serviceMode?: string | null;
  serviceType?: string | null;
  issueDescription?: string | null;
  serviceAt?: string | null;
  departureAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  returnAt?: string | null;
  unavailable?: boolean;
}
```

在 `AttendanceRequest` 增加：

```ts
  serviceOrder?: ServiceOrderSummary | null;
```

把工单选择类型改为复用摘要契约：

```ts
interface OvertimeServiceOrder extends ServiceOrderSummary {
  status?: string;
  segments: OvertimeSegment[];
}
```

- [ ] **Step 2: 增加工单摘要组件**

在 `RequestList` 前新增：

```tsx
function serviceOrderTypeLabel(order: ServiceOrderSummary) {
  const mode = SERVICE_MODE_LABELS[order.serviceMode || ""] || order.serviceMode || "-";
  const type = SERVICE_TYPE_LABELS[order.serviceType || ""] || order.serviceType || "-";
  return `${mode} / ${type}`;
}

function ServiceOrderApprovalSummary({ order }: { order: ServiceOrderSummary }) {
  const orderLabel = order.orderNo || `#${order.id}`;
  if (order.unavailable) {
    return (
      <div className="mt-2 rounded-md border border-dashed bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        关联工单 {orderLabel} 暂不可用
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-md border bg-muted/10 p-3 text-xs">
      <div className="grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
        <div><span className="font-medium text-foreground">工单：</span>{orderLabel}</div>
        <div><span className="font-medium text-foreground">客户：</span>{order.customerName || "-"}</div>
        <div><span className="font-medium text-foreground">设备：</span>{order.deviceName || "-"}</div>
        <div><span className="font-medium text-foreground">类型：</span>{serviceOrderTypeLabel(order)}</div>
        <div className="sm:col-span-2"><span className="font-medium text-foreground">问题：</span>{order.issueDescription || "-"}</div>
      </div>
      <details className="mt-2 border-t pt-2">
        <summary className="cursor-pointer select-none font-medium text-primary">展开工单详情</summary>
        <div className="mt-2 grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
          <div><span className="font-medium text-foreground">联系人：</span>{order.contactName || "-"}</div>
          <div><span className="font-medium text-foreground">电话：</span>{order.contactPhone || "-"}</div>
          <div><span className="font-medium text-foreground">服务日：</span>{formatDateTime(order.serviceAt || undefined)}</div>
          <div><span className="font-medium text-foreground">出发：</span>{formatDateTime(order.departureAt || undefined)}</div>
          <div><span className="font-medium text-foreground">到达：</span>{formatDateTime(order.actualStartAt || undefined)}</div>
          <div><span className="font-medium text-foreground">完成：</span>{formatDateTime(order.actualEndAt || undefined)}</div>
          <div><span className="font-medium text-foreground">返回：</span>{formatDateTime(order.returnAt || undefined)}</div>
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 3: 在共用申请列表中渲染工单区域**

在 `RequestList` 每行的 `requestDetail(item)` 后加入兼容旧响应的降级对象：

```tsx
                      {item.requestType === "overtime" && item.sourceType === "service_order" ? (
                        <ServiceOrderApprovalSummary
                          order={item.serviceOrder || { id: item.sourceId || "-", unavailable: true }}
                        />
                      ) : null}
```

该插入点位于代理人、工作日、证明附件和审批轨迹之前，使工单内容紧跟加班类型，并自动覆盖“待我审批”“我的申请”和“全员申请记录”。

- [ ] **Step 4: 提升管理端版本号**

把以下三处从 `26.713.109` 改为 `26.713.110`：

```json
// frontend-admin/package.json
"version": "26.713.110"
```

```json
// frontend-admin/package-lock.json 顶层和 packages[""]
"version": "26.713.110"
```

```ts
// frontend-admin/src/config/app.ts
|| "26.713.110"
```

- [ ] **Step 5: 运行管理端类型检查**

Run:

```bash
cd frontend-admin
npx tsc --noEmit
```

Expected: 无 TypeScript 错误，退出码 0。

- [ ] **Step 6: 运行管理端生产构建**

Run:

```bash
cd frontend-admin
npm run build
```

Expected: Vite 构建成功并生成 `dist/`，退出码 0。

- [ ] **Step 7: 提交管理端展示与版本更新**

```bash
git add frontend-admin/src/pages/Attendance.tsx frontend-admin/package.json frontend-admin/package-lock.json frontend-admin/src/config/app.ts
git commit -m "在审批列表展示加班工单摘要"
```

## Task 4: 全量验证与人工验收

**Files:**

- Review: `backend/src/modules/attendance/controller.js`
- Review: `backend/tests/attendance-workflow-controller.test.js`
- Review: `frontend-admin/src/pages/Attendance.tsx`
- Review: `frontend-admin/package.json`
- Review: `frontend-admin/package-lock.json`
- Review: `frontend-admin/src/config/app.ts`

- [ ] **Step 1: 运行后端完整检查**

Run:

```bash
cd backend
npm test
```

Expected: syntax check 和全部 unit assertion scripts 通过。

- [ ] **Step 2: 运行管理端完整检查**

Run:

```bash
cd frontend-admin
npx tsc --noEmit
npm run build
```

Expected: 两条命令均退出码 0。

- [ ] **Step 3: 核对版本号三处一致**

Run:

```bash
rg -n '26\.713\.110' frontend-admin/package.json frontend-admin/package-lock.json frontend-admin/src/config/app.ts
```

Expected: `package.json` 1 处、`package-lock.json` 2 处、`app.ts` 1 处，共 4 个匹配。

- [ ] **Step 4: 审查改动范围和空白错误**

Run:

```bash
git diff --check 6e2266f..HEAD
git status --short
```

Expected: `git diff --check` 无输出；状态只包含用户原有的无关改动，不包含未提交的本任务应用代码。

- [ ] **Step 5: 人工验收关键场景**

在本地或测试环境依次验证：

1. 工程师选择工单并提交加班，申请列表立即显示工单号、客户、设备、类型和问题。
2. 展开详情可看到联系人、电话、服务日和出发/到达/完成/返回时间。
3. 直属主管审批后，下一审批人的摘要内容不变。
4. 修改原工单后重新加载审批列表，已提交申请仍显示原快照。
5. 模拟历史无快照申请，列表显示当前工单内容。
6. 模拟工单已删除或不可关联，列表显示“关联工单 #ID 暂不可用”，审批按钮仍可使用。
7. 请假和调休记录不显示工单区域。

- [ ] **Step 6: 若验证修复产生额外改动，单独提交**

仅当全量验证发现并修复本任务范围内问题时执行：

```bash
git add backend/src/modules/attendance/controller.js backend/tests/attendance-workflow-controller.test.js frontend-admin/src/pages/Attendance.tsx frontend-admin/package.json frontend-admin/package-lock.json frontend-admin/src/config/app.ts
git commit -m "完善加班工单审批展示验证"
```

若没有额外改动，跳过此提交。

## Rollback Points

- Task 1 回滚：撤销“保存加班申请工单快照”提交；可空 `source_snapshot` 列可以保留，不执行 `DROP COLUMN`。
- Task 2 回滚：撤销“补全审批列表工单摘要”提交；接口恢复旧响应，不影响已有快照数据。
- Task 3 回滚：撤销“在审批列表展示加班工单摘要”提交；旧管理端会忽略后端新增字段。
- 若部署时后端启动失败，优先检查 MySQL 是否支持 JSON（仓库现有 `service_orders.service_modules JSON` 已证明当前环境使用该能力），再回滚应用提交。
