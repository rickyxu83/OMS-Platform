/** 智能报表引擎单测（spec 014）：白名单校验 / 时间范围解析 / SQL 拼接。不依赖数据库。 */
const assert = require('node:assert/strict')
const { validateSpec, resolveRelativeRange, resolveCompareRange, compareCell, buildQuery, describeSpec, runSpec } = require('../engine')
const { HttpError } = require('../../../utils/http-error')

// ---- validateSpec：白名单拦截 ----

{
  const { errors, spec } = validateSpec({
    dataset: 'service_orders',
    timeRange: { type: 'relative', value: 'last_month' },
    groupBy: ['engineer'],
    metrics: ['count'],
  })
  assert.deepEqual(errors, [])
  assert.equal(spec.dataset, 'service_orders')
  assert.equal(spec.timeField, 'created_at')
  assert.deepEqual(spec.groupBy, ['engineer'])
  assert.deepEqual(spec.metrics, ['count'])
}

{
  // 未知数据集
  const { errors, spec } = validateSpec({ dataset: 'users; DROP TABLE users', metrics: ['count'] })
  assert.equal(spec, null)
  assert.ok(errors[0].includes('未知数据集'))
}

{
  // 未知维度/指标/筛选被拦截
  const { errors, spec } = validateSpec({
    dataset: 'service_orders',
    groupBy: ['password_hash'],
    metrics: ['salary'],
    filters: { role: ['admin'] },
  })
  assert.equal(spec, null)
  assert.equal(errors.length, 3)
  assert.ok(errors.some((e) => e.includes('password_hash')))
  assert.ok(errors.some((e) => e.includes('salary')))
}

{
  // 枚举筛选只放行白名单值；文本筛选参数化
  const { errors, spec } = validateSpec({
    dataset: 'service_orders',
    filters: { status: ['approved', "'; DROP--"], customer: '联想' },
    metrics: ['count'],
  })
  assert.deepEqual(errors, [])
  assert.deepEqual(spec.filters.status, ['approved'])
  assert.equal(spec.filters.customer, '联想')
}

{
  // 指标缺省时取数据集第一个指标
  const { spec } = validateSpec({ dataset: 'devices' })
  assert.deepEqual(spec.metrics, ['count'])
}

{
  // 绝对时间范围校验
  assert.ok(validateSpec({ dataset: 'devices', timeRange: { type: 'absolute', from: '2026-08-01', to: '2026-08-31' } }).spec)
  assert.ok(validateSpec({ dataset: 'devices', timeRange: { type: 'absolute', from: '2026-08-31', to: '2026-08-01' } }).spec === null)
  assert.ok(validateSpec({ dataset: 'devices', timeRange: { type: 'absolute', from: 'bad', to: '2026-08-01' } }).spec === null)
}

// ---- resolveRelativeRange：以上海时区为准 ----

{
  // 2026-09-17 是周四（UTC 2026-09-16 16:00Z = 上海 2026-09-17 00:00）
  const now = Date.UTC(2026, 8, 16, 16, 0, 0)
  const lastMonth = resolveRelativeRange('last_month', now)
  assert.deepEqual(lastMonth, { from: '2026-08-01', to: '2026-08-31' })
  const thisWeek = resolveRelativeRange('this_week', now)
  assert.deepEqual(thisWeek, { from: '2026-09-14', to: '2026-09-20' })
  const lastWeek = resolveRelativeRange('last_week', now)
  assert.deepEqual(lastWeek, { from: '2026-09-07', to: '2026-09-13' })
  const thisYear = resolveRelativeRange('this_year', now)
  assert.deepEqual(thisYear, { from: '2026-01-01', to: '2026-12-31' })
  const all = resolveRelativeRange('all', now)
  assert.deepEqual(all, { from: null, to: null })
}

{
  // 月初边界：上海 2026-09-01 → 上月是 8 月
  const now = Date.UTC(2026, 7, 31, 16, 30, 0)
  assert.deepEqual(resolveRelativeRange('last_month', now), { from: '2026-08-01', to: '2026-08-31' })
  assert.deepEqual(resolveRelativeRange('this_month', now), { from: '2026-09-01', to: '2026-09-30' })
  // 季度边界
  assert.deepEqual(resolveRelativeRange('last_quarter', now), { from: '2026-04-01', to: '2026-06-30' })
}

// ---- buildQuery：参数化、无拼接注入 ----

{
  const { spec } = validateSpec({
    dataset: 'service_orders',
    timeField: 'reviewed_at',
    timeRange: { type: 'relative', value: 'last_month' },
    filters: { status: ['approved'], customer: '联想' },
    groupBy: ['engineer', 'month'],
    metrics: ['count', 'avg_close_hours'],
  })
  const { sql, params, columns } = buildQuery(spec, { limit: 100 })
  assert.ok(sql.includes('FROM service_orders so'))
  assert.ok(sql.includes('GROUP BY'))
  assert.ok(sql.includes('LIMIT 100')) // runSpec 会以 limit+1 调 buildQuery 做截断检测
  assert.ok(sql.includes('so.reviewed_at')) // timeField 生效
  assert.ok(sql.includes(':f_status_0'))
  assert.ok(sql.includes(':f_customer'))
  assert.equal(params.f_status_0, 'approved')
  assert.equal(params.f_customer, '%联想%')
  assert.ok(!sql.includes('联想')) // 值不直接拼进 SQL
  assert.equal(columns.length, 4)
  assert.deepEqual(columns.map((c) => c.kind), ['dimension', 'dimension', 'metric', 'metric'])
}

{
  // 全部时间：无时间条件，但 params 恒含 timeFrom/timeTo（NULL，供折算类指标引用）
  const { spec } = validateSpec({ dataset: 'mr_orders', timeRange: { type: 'relative', value: 'all' }, groupBy: ['sales'], metrics: ['amount'] })
  const { sql, params } = buildQuery(spec)
  assert.equal(params.timeFrom, null)
  assert.equal(params.timeTo, null)
  assert.ok(!sql.includes(':timeFrom'))
}

{
  // 工时不含已取消工单
  const { spec } = validateSpec({ dataset: 'timesheets', groupBy: ['engineer'], metrics: ['hours'] })
  const { sql } = buildQuery(spec)
  assert.ok(sql.includes("so.status <> 'cancelled'"))
}

// ---- describeSpec ----

{
  const { spec } = validateSpec({
    dataset: 'service_orders',
    timeRange: { type: 'relative', value: 'last_month' },
    groupBy: ['engineer'],
    metrics: ['count'],
    filters: { status: ['approved'] },
  })
  const { range } = buildQuery(spec)
  const text = describeSpec(spec, range)
  assert.ok(text.includes('工单'))
  assert.ok(text.includes('工程师'))
  assert.ok(text.includes('单数'))
  assert.ok(text.includes('状态=已结案'))
}

// ---- 新增数据集（批次 1：备件/值班/假期余额/采购任务） ----

{
  // 备件使用：默认指标为数量合计，枚举筛选白名单生效
  const { errors, spec } = validateSpec({
    dataset: 'service_parts',
    timeRange: { type: 'relative', value: 'this_year' },
    groupBy: ['part_name'],
    filters: { action_type: ['replacement', 'bogus'] },
  })
  assert.deepEqual(errors, [])
  assert.deepEqual(spec.metrics, ['quantity'])
  assert.deepEqual(spec.filters.action_type, ['replacement'])
  const { sql, params } = buildQuery(spec)
  assert.ok(sql.includes('FROM service_parts sp'))
  assert.ok(sql.includes('SUM(sp.quantity)'))
  assert.equal(params.f_action_type_0, 'replacement')
}

{
  // 值班：按员工分组统计值班次数，批次状态枚举
  const { errors, spec } = validateSpec({
    dataset: 'duty_records',
    groupBy: ['employee', 'duty_type'],
    metrics: ['units'],
    filters: { batch_status: ['approved'] },
  })
  assert.deepEqual(errors, [])
  const { sql } = buildQuery(spec)
  assert.ok(sql.includes('FROM attendance_duty_records r'))
  assert.ok(sql.includes('SUM(r.units)'))
  assert.ok(sql.includes('r.batch_status IN (:f_batch_status_0)'))
}

{
  // 假期余额：全部时间按员工合计即当前余额
  const { spec } = validateSpec({
    dataset: 'leave_balance',
    timeRange: { type: 'relative', value: 'all' },
    groupBy: ['employee', 'balance_type'],
    metrics: ['sum_hours'],
  })
  const { sql, params } = buildQuery(spec)
  assert.ok(sql.includes('FROM attendance_balance_ledger bl'))
  assert.ok(sql.includes('SUM(bl.delta_hours)'))
  assert.equal(params.timeFrom, null)
}

{
  // 采购任务：待处理数指标 + 完成时间口径
  const { errors, spec } = validateSpec({
    dataset: 'mr_purchase_tasks',
    timeField: 'completed_at',
    groupBy: ['assignee'],
    metrics: ['count', 'pending_count'],
    filters: { task_type: ['purchase'] },
  })
  assert.deepEqual(errors, [])
  const { sql } = buildQuery(spec)
  assert.ok(sql.includes('FROM mr_purchase_tasks pt'))
  assert.ok(sql.includes('DATE(pt.completed_at)'))
  assert.ok(sql.includes("SUM(CASE WHEN pt.status = 'pending' THEN 1 ELSE 0 END)"))
}

// ---- 同比/环比（spec 015） ----

{
  // compare 字段合法通过并归一化
  const { errors, spec } = validateSpec({
    dataset: 'service_orders',
    timeRange: { type: 'relative', value: 'this_month' },
    metrics: ['count'],
    compare: { type: 'previous' },
  })
  assert.deepEqual(errors, [])
  assert.deepEqual(spec.compare, { type: 'previous' })
}

{
  // 非法对比类型被拦截
  const { errors, spec } = validateSpec({ dataset: 'service_orders', metrics: ['count'], compare: { type: 'decade' } })
  assert.equal(spec, null)
  assert.ok(errors.some((e) => e.includes('对比类型')))
}

{
  // 全部时间不支持对比
  const { errors, spec } = validateSpec({
    dataset: 'service_orders',
    timeRange: { type: 'relative', value: 'all' },
    metrics: ['count'],
    compare: { type: 'year_ago' },
  })
  assert.equal(spec, null)
  assert.ok(errors.some((e) => e.includes('全部时间')))
}

{
  // 环比：前一个等长周期（8月31天 → 7月整月；本周 → 上周）
  assert.deepEqual(resolveCompareRange({ from: '2026-08-01', to: '2026-08-31' }, 'previous'), { from: '2026-07-01', to: '2026-07-31' })
  assert.deepEqual(resolveCompareRange({ from: '2026-09-14', to: '2026-09-20' }, 'previous'), { from: '2026-09-07', to: '2026-09-13' })
  // 同比：平移一年，闰日收敛
  assert.deepEqual(resolveCompareRange({ from: '2026-08-01', to: '2026-08-31' }, 'year_ago'), { from: '2025-08-01', to: '2025-08-31' })
  assert.deepEqual(resolveCompareRange({ from: '2024-02-01', to: '2024-02-29' }, 'year_ago'), { from: '2023-02-01', to: '2023-02-28' })
  // 无边界不支持
  assert.equal(resolveCompareRange({ from: null, to: null }, 'previous'), null)
}

{
  // 涨跌计算：正常 / 对比期为 0（pct null 防除零）/ 跌到 0
  assert.deepEqual(compareCell(10, 8), { delta: 2, pct: 25 })
  assert.deepEqual(compareCell(5, 0), { delta: 5, pct: null })
  assert.deepEqual(compareCell(0, 4), { delta: -4, pct: -100 })
}

// ---- 巡检完成率（spec 018：无时间字段数据集） ----

{
  // 无时间字段：timeField 归一化为 null，timeRange 仍保留（决定折算区间）
  const { errors, spec } = validateSpec({
    dataset: 'inspection_completion',
    timeRange: { type: 'relative', value: 'last_month' },
    groupBy: ['customer'],
    metrics: ['plans', 'expected', 'generated', 'closed'],
    filters: { active: ['1'] },
  })
  assert.deepEqual(errors, [])
  assert.equal(spec.timeField, null)
  const { sql, params } = buildQuery(spec)
  assert.ok(sql.includes('FROM inspection_schedules isp'))
  assert.ok(sql.includes('TIMESTAMPDIFF'))
  // 计划侧无时间 WHERE（统计区间只作用于折算与工单匹配）
  assert.ok(!/DATE\(isp\.\w+\) >= :timeFrom/.test(sql))
  assert.ok(params.timeFrom && params.timeTo) // 相对范围已解析进 params
  assert.equal(params.f_active_0, '1')
}

{
  // 全部时间：params 恒含 NULL，折算指标 SQL 走 NULL 安全分支
  const { spec } = validateSpec({ dataset: 'inspection_completion', timeRange: { type: 'relative', value: 'all' } })
  const { sql, params } = buildQuery(spec)
  assert.equal(params.timeFrom, null)
  assert.equal(params.timeTo, null)
  assert.ok(sql.includes(':timeFrom IS NULL'))
}

// ---- 货币单位透传（feat/report-currency：amount 带 cny，计数/时长不带） ----

{
  // mr_orders：amount 指标 unit==='cny'，count 指标 unit 为 null
  const { errors, spec } = validateSpec({
    dataset: 'mr_orders',
    timeRange: { type: 'relative', value: 'last_month' },
    groupBy: ['sales'],
    metrics: ['count', 'amount'],
  })
  assert.deepEqual(errors, [])
  const { columns } = buildQuery(spec)
  assert.equal(columns.find((c) => c.key === 'amount').unit, 'cny')
  assert.equal(columns.find((c) => c.key === 'count').unit, null)
  assert.equal(columns.find((c) => c.key === 'sales').unit, undefined) // 维度列不带 unit
}

// ---- runSpec：校验失败抛 HttpError 422（details 保留，error-handler 透传真实原因） ----

async function testRunSpecValidationError() {
  await assert.rejects(
    () => runSpec({ dataset: 'users; DROP TABLE users', metrics: ['count'] }),
    (err) => {
      assert.ok(err instanceof HttpError)
      assert.equal(err.status, 422)
      assert.ok(err.message.includes('报表定义无效'))
      assert.ok(Array.isArray(err.details))
      assert.ok(err.details.some((e) => e.includes('未知数据集')))
      return true
    },
  )
  console.log('report engine runSpec 422 tests passed')
}

testRunSpecValidationError().then(() => console.log('report engine tests passed')).catch((err) => {
  console.error(err)
  process.exit(1)
})
