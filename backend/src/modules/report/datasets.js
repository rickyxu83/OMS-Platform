/**
 * 智能报表语义层（spec 014）：预定义数据集的白名单定义。
 *
 * 安全边界：AI 只能从这里声明的 dataset / dimension / metric / filter / timeField 中选择，
 * SQL 由 engine.js 用这里的白名单片段拼接，值全部走参数化。AI 永远不直接写 SQL。
 *
 * 每个数据集结构：
 *   baseSql         FROM/JOIN 片段（表别名固定）
 *   timeFields      可用时间字段白名单（timeRange 作用列）
 *   defaultTimeField
 *   dimensions      分组维度：{ sql } 或 { timeFormat }（按 timeField 列做时间分组）
 *   metrics         统计指标：聚合 SQL 片段
 *   filters         筛选：enum（IN 白名单值）或 text（LIKE 参数化）
 *   labels          枚举值 → 中文标签（展示层翻译）
 */

const ORDER_STATUS_LABELS = {
  draft: '草稿',
  pending_confirmation: '待确认',
  awaiting_customer_signature: '待客户签章',
  assigned: '已派单',
  in_progress: '处理中',
  submitted: '已提交',
  rejected: '已退回',
  approved: '已结案',
  archived: '已归档',
  cancelled: '已取消',
}

const SERVICE_TYPE_LABELS = {
  install: '安装',
  repair: '维修',
  maintain: '保养',
  inspect: '巡检',
  training: '培训',
  other: '其他',
}

const PRIORITY_LABELS = { low: '低', normal: '普通', high: '高', urgent: '紧急' }
const SERVICE_MODE_LABELS = { onsite: '现场', remote: '远程', office: '内勤' }

const MR_STATUS_LABELS = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已批准',
  rejected: '已退回',
  withdrawn: '已撤回',
  voided: '已作废',
}

const ATTENDANCE_TYPE_LABELS = { leave: '请假', overtime: '加班', comp_time: '调休' }
const ATTENDANCE_STATUS_LABELS = {
  pending_supervisor: '待主管审批',
  pending_admin: '待行政审批',
  approved: '已批准',
  rejected: '已拒绝',
  withdrawn: '已撤回',
  voided: '已作废',
}

const CADENCE_LABELS = { monthly: '每月', 'bi-monthly': '每两月', quarterly: '每季度' }

const MAINTENANCE_TYPE_LABELS = {
  pending_confirmation: '待确认',
  none: '无维保',
  original_manufacturer: '原厂维保',
  our_maintenance: '我方维保',
}

const PART_ACTION_LABELS = { general: '一般记录', replacement: '更换备件', installation: '安装备件' }
const DUTY_TYPE_LABELS = { weekend_on_call: '7×24 值班', legal_holiday_on_call: '法定节假日值班' }
const DUTY_BATCH_STATUS_LABELS = { draft: '草稿', pending_admin: '待行政审批', approved: '已批准', rejected: '已退回' }
const BALANCE_TYPE_LABELS = { annual_leave: '年假', comp_time: '调休' }
const PURCHASE_TASK_STATUS_LABELS = { pending: '待处理', done: '已完成', cancelled: '已取消' }
const PURCHASE_TASK_TYPE_LABELS = { purchase: '采购填写', contract_no: '合同编号补填' }

/** 时间维度（作用于数据集的 timeField 列） */
function timeDimensions(columnRef) {
  return {
    month: { label: '月份', timeFormat: '%Y-%m', column: columnRef },
    week: { label: '周', timeFormat: '%x-W%v', column: columnRef },
    day: { label: '日期', timeFormat: '%Y-%m-%d', column: columnRef },
  }
}

const DATASETS = {
  service_orders: {
    key: 'service_orders',
    label: '工单',
    description: '服务工单（安装/维修/保养/巡检/培训等），可统计单量、未结单数、结案时长',
    baseSql: 'FROM service_orders so JOIN customers c ON c.id = so.customer_id LEFT JOIN users eng ON eng.id = so.assigned_engineer_id',
    timeFields: {
      created_at: { label: '创建时间', column: 'so.created_at' },
      submitted_at: { label: '提交时间', column: 'so.submitted_at' },
      reviewed_at: { label: '结案时间', column: 'so.reviewed_at' },
    },
    defaultTimeField: 'created_at',
    dimensions: {
      engineer: { label: '工程师', sql: "COALESCE(eng.real_name, '未分配')" },
      customer: { label: '客户', sql: 'c.name' },
      status: { label: '状态', sql: 'so.status', labels: ORDER_STATUS_LABELS },
      service_type: { label: '服务类型', sql: 'so.service_type', labels: SERVICE_TYPE_LABELS },
      priority: { label: '优先级', sql: 'so.priority', labels: PRIORITY_LABELS },
      service_mode: { label: '服务方式', sql: 'so.service_mode', labels: SERVICE_MODE_LABELS },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      count: { label: '单数', sql: 'COUNT(*)' },
      open_count: {
        label: '未结单数',
        sql: "SUM(CASE WHEN so.status IN ('draft','pending_confirmation','awaiting_customer_signature','assigned','in_progress','submitted','rejected') THEN 1 ELSE 0 END)",
      },
      avg_close_hours: {
        label: '平均结案时长(小时)',
        sql: 'AVG(CASE WHEN so.submitted_at IS NOT NULL AND so.reviewed_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, so.submitted_at, so.reviewed_at)/60 END)',
        round: 1,
      },
    },
    filters: {
      status: { label: '状态', type: 'enum', column: 'so.status', options: ORDER_STATUS_LABELS },
      service_type: { label: '服务类型', type: 'enum', column: 'so.service_type', options: SERVICE_TYPE_LABELS },
      priority: { label: '优先级', type: 'enum', column: 'so.priority', options: PRIORITY_LABELS },
      service_mode: { label: '服务方式', type: 'enum', column: 'so.service_mode', options: SERVICE_MODE_LABELS },
      customer: { label: '客户', type: 'text', column: 'c.name' },
      engineer: { label: '工程师', type: 'text', column: 'eng.real_name' },
    },
  },

  timesheets: {
    key: 'timesheets',
    label: '工时',
    description: '工程师工单工时：按参与工程师归属工单，统计工单数与实际工时（服务报告实际开始/结束时间）',
    baseSql: `FROM service_orders so
      JOIN (
        SELECT service_order_id, engineer_id FROM service_order_engineers
        UNION
        SELECT id AS service_order_id, assigned_engineer_id AS engineer_id
        FROM service_orders
        WHERE assigned_engineer_id IS NOT NULL
      ) p ON p.service_order_id = so.id
      JOIN users u ON u.id = p.engineer_id
      JOIN customers c ON c.id = so.customer_id
      LEFT JOIN service_reports sr ON sr.service_order_id = so.id`,
    baseWhere: "so.status <> 'cancelled'",
    timeFields: {
      work_date: { label: '工作时间', column: 'COALESCE(sr.actual_start_at, so.planned_start_at, so.submitted_at, so.created_at)' },
    },
    defaultTimeField: 'work_date',
    dimensions: {
      engineer: { label: '工程师', sql: 'u.real_name' },
      customer: { label: '客户', sql: 'c.name' },
      category: { label: '工时类别', sql: "COALESCE(NULLIF(so.timesheet_category, ''), '未分类')" },
      service_type: { label: '服务类型', sql: 'so.service_type', labels: SERVICE_TYPE_LABELS },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      order_count: { label: '工单数', sql: 'COUNT(DISTINCT so.id)' },
      entries: { label: '人次', sql: 'COUNT(*)' },
      hours: {
        label: '工时(小时)',
        sql: 'SUM(CASE WHEN sr.actual_start_at IS NOT NULL AND sr.actual_end_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, sr.actual_start_at, sr.actual_end_at)/60 ELSE 0 END)',
        round: 1,
      },
    },
    filters: {
      engineer: { label: '工程师', type: 'text', column: 'u.real_name' },
      customer: { label: '客户', type: 'text', column: 'c.name' },
      category: { label: '工时类别', type: 'text', column: 'so.timesheet_category' },
      service_type: { label: '服务类型', type: 'enum', column: 'so.service_type', options: SERVICE_TYPE_LABELS },
    },
  },

  attendance: {
    key: 'attendance',
    label: '考勤',
    description: '考勤申请（请假/加班/调休），可统计申请数与小时数',
    baseSql: 'FROM attendance_requests ar JOIN users u ON u.id = ar.employee_id',
    timeFields: {
      start_at: { label: '开始时间', column: 'ar.start_at' },
      submitted_at: { label: '提交时间', column: 'ar.submitted_at' },
    },
    defaultTimeField: 'start_at',
    dimensions: {
      employee: { label: '员工', sql: 'u.real_name' },
      request_type: { label: '申请类型', sql: 'ar.request_type', labels: ATTENDANCE_TYPE_LABELS },
      leave_type: { label: '请假类型', sql: "COALESCE(NULLIF(ar.leave_type, ''), '-')" },
      status: { label: '状态', sql: 'ar.status', labels: ATTENDANCE_STATUS_LABELS },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      count: { label: '申请数', sql: 'COUNT(*)' },
      sum_hours: { label: '总小时数', sql: 'SUM(ar.hours)', round: 1 },
    },
    filters: {
      employee: { label: '员工', type: 'text', column: 'u.real_name' },
      request_type: { label: '申请类型', type: 'enum', column: 'ar.request_type', options: ATTENDANCE_TYPE_LABELS },
      status: { label: '状态', type: 'enum', column: 'ar.status', options: ATTENDANCE_STATUS_LABELS },
    },
  },

  inspection_schedules: {
    key: 'inspection_schedules',
    label: '巡检计划',
    description: '巡检计划（周期性巡检安排）本身的数量与分布；不含执行完成情况——问巡检完成/执行/漏检/应巡请用 inspection_completion',
    baseSql: 'FROM inspection_schedules isp JOIN customers c ON c.id = isp.customer_id LEFT JOIN users eng ON eng.id = isp.target_engineer_id',
    timeFields: {
      created_at: { label: '创建时间', column: 'isp.created_at' },
      next_run_anchor: { label: '下次执行日期', column: 'isp.next_run_anchor' },
    },
    defaultTimeField: 'next_run_anchor',
    dimensions: {
      customer: { label: '客户', sql: 'c.name' },
      engineer: { label: '负责工程师', sql: "COALESCE(eng.real_name, '未指定')" },
      cadence: { label: '巡检周期', sql: 'isp.cadence', labels: CADENCE_LABELS },
      active: { label: '是否启用', sql: "CASE WHEN isp.active = 1 THEN '启用' ELSE '停用' END" },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      count: { label: '计划数', sql: 'COUNT(*)' },
    },
    filters: {
      customer: { label: '客户', type: 'text', column: 'c.name' },
      cadence: { label: '巡检周期', type: 'enum', column: 'isp.cadence', options: CADENCE_LABELS },
      active: { label: '是否启用', type: 'enum', column: 'isp.active', options: { '1': '启用', '0': '停用' } },
    },
  },

  devices: {
    key: 'devices',
    label: '设备',
    description: '设备资产台账，可统计设备数量、维保到期分布',
    baseSql: 'FROM devices d JOIN customers c ON c.id = d.customer_id LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id',
    timeFields: {
      created_at: { label: '录入时间', column: 'd.created_at' },
      warranty_until: { label: '保修到期日', column: 'd.warranty_until' },
      maintenance_end: { label: '维保到期日', column: 'd.maintenance_end' },
    },
    defaultTimeField: 'created_at',
    dimensions: {
      customer: { label: '客户', sql: 'c.name' },
      maintenance_type: { label: '维保类型', sql: 'd.maintenance_type', labels: MAINTENANCE_TYPE_LABELS },
      maintenance_party: { label: '维保方', sql: "COALESCE(NULLIF(mp.name, ''), '未指定')" },
      model: { label: '型号', sql: "COALESCE(NULLIF(d.model, ''), '-')" },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      count: { label: '设备数', sql: 'COUNT(*)' },
    },
    filters: {
      customer: { label: '客户', type: 'text', column: 'c.name' },
      maintenance_type: { label: '维保类型', type: 'enum', column: 'd.maintenance_type', options: MAINTENANCE_TYPE_LABELS },
      model: { label: '型号', type: 'text', column: 'd.model' },
    },
  },

  mr_orders: {
    key: 'mr_orders',
    label: '订购申请（MR）',
    description: 'M单（客户订购申请），可统计单量与未税金额',
    baseSql: 'FROM mr_orders mo LEFT JOIN users s ON s.id = mo.sales_owner_id',
    timeFields: {
      created_at: { label: '创建时间', column: 'mo.created_at' },
      submitted_at: { label: '提交时间', column: 'mo.submitted_at' },
      approved_at: { label: '批准时间', column: 'mo.approved_at' },
    },
    defaultTimeField: 'created_at',
    dimensions: {
      sales: { label: '业务', sql: "COALESCE(s.real_name, '未指定')" },
      customer: { label: '客户', sql: "COALESCE(NULLIF(mo.customer_name, ''), '未填写')" },
      status: { label: '状态', sql: 'mo.status', labels: MR_STATUS_LABELS },
      case_category: { label: '案件类别', sql: "COALESCE(NULLIF(mo.case_category, ''), '未分类')" },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      count: { label: '单数', sql: 'COUNT(*)' },
      amount: { label: '未税金额合计', sql: 'SUM(COALESCE(mo.total_excluding_tax, 0))', round: 2 },
    },
    filters: {
      status: { label: '状态', type: 'enum', column: 'mo.status', options: MR_STATUS_LABELS },
      sales: { label: '业务', type: 'text', column: 's.real_name' },
      customer: { label: '客户', type: 'text', column: 'mo.customer_name' },
    },
  },

  service_parts: {
    key: 'service_parts',
    label: '备件使用',
    description: '工单维修/安装过程中登记的备件使用记录，可统计备件用量按客户、工程师、备件名的分布',
    baseSql: 'FROM service_parts sp LEFT JOIN service_orders so ON so.id = sp.service_order_id LEFT JOIN customers c ON c.id = so.customer_id LEFT JOIN users eng ON eng.id = so.assigned_engineer_id',
    timeFields: {
      created_at: { label: '登记时间', column: 'sp.created_at' },
      order_created_at: { label: '工单创建时间', column: 'so.created_at' },
      order_reviewed_at: { label: '工单结案时间', column: 'so.reviewed_at' },
    },
    defaultTimeField: 'created_at',
    dimensions: {
      part_name: { label: '备件名称', sql: 'sp.part_name' },
      customer: { label: '客户', sql: "COALESCE(c.name, '未关联工单')" },
      engineer: { label: '工程师', sql: "COALESCE(eng.real_name, '未关联工单')" },
      action_type: { label: '操作类型', sql: 'sp.action_type', labels: PART_ACTION_LABELS },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      quantity: { label: '数量合计', sql: 'SUM(sp.quantity)', round: 2 },
      count: { label: '记录数', sql: 'COUNT(*)' },
    },
    filters: {
      part_name: { label: '备件名称', type: 'text', column: 'sp.part_name' },
      customer: { label: '客户', type: 'text', column: 'c.name' },
      engineer: { label: '工程师', type: 'text', column: 'eng.real_name' },
      action_type: { label: '操作类型', type: 'enum', column: 'sp.action_type', options: PART_ACTION_LABELS },
    },
  },

  duty_records: {
    key: 'duty_records',
    label: '值班',
    description: '工程师值班记录（7×24 值班与法定节假日值班），可统计每人值班次数与分布',
    baseSql: 'FROM attendance_duty_records r JOIN attendance_employee_profiles p ON p.id = r.employee_id',
    timeFields: {
      duty_date: { label: '值班日期', column: 'r.duty_date' },
    },
    defaultTimeField: 'duty_date',
    dimensions: {
      employee: { label: '员工', sql: 'p.employee_name' },
      duty_type: { label: '值班类型', sql: 'r.duty_type', labels: DUTY_TYPE_LABELS },
      batch_status: { label: '批次状态', sql: 'r.batch_status', labels: DUTY_BATCH_STATUS_LABELS },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      units: { label: '值班次数合计', sql: 'SUM(r.units)', round: 1 },
      count: { label: '记录数', sql: 'COUNT(*)' },
    },
    filters: {
      employee: { label: '员工', type: 'text', column: 'p.employee_name' },
      duty_type: { label: '值班类型', type: 'enum', column: 'r.duty_type', options: DUTY_TYPE_LABELS },
      batch_status: { label: '批次状态', type: 'enum', column: 'r.batch_status', options: DUTY_BATCH_STATUS_LABELS },
    },
  },

  leave_balance: {
    key: 'leave_balance',
    label: '假期余额',
    description: '年假/调休余额台账变动记录。查当前剩余余额：时间范围选「全部时间」，按员工分组看变动小时数合计（正数为增加、负数为扣减，合计即当前余额）',
    baseSql: 'FROM attendance_balance_ledger bl JOIN attendance_employee_profiles p ON p.id = bl.employee_id',
    timeFields: {
      created_at: { label: '变动时间', column: 'bl.created_at' },
    },
    defaultTimeField: 'created_at',
    dimensions: {
      employee: { label: '员工', sql: 'p.employee_name' },
      balance_type: { label: '假期类型', sql: 'bl.balance_type', labels: BALANCE_TYPE_LABELS },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      sum_hours: { label: '变动小时数合计', sql: 'SUM(bl.delta_hours)', round: 1 },
      count: { label: '变动笔数', sql: 'COUNT(*)' },
    },
    filters: {
      employee: { label: '员工', type: 'text', column: 'p.employee_name' },
      balance_type: { label: '假期类型', type: 'enum', column: 'bl.balance_type', options: BALANCE_TYPE_LABELS },
    },
  },

  mr_purchase_tasks: {
    key: 'mr_purchase_tasks',
    label: '采购任务',
    description: 'MR 采购填写/合同编号补填任务，可统计待处理与完成情况、按采购负责人分布',
    baseSql: 'FROM mr_purchase_tasks pt JOIN mr_orders mo ON mo.id = pt.mr_id JOIN users a ON a.id = pt.assignee_user_id',
    timeFields: {
      created_at: { label: '创建时间', column: 'pt.created_at' },
      completed_at: { label: '完成时间', column: 'pt.completed_at' },
    },
    defaultTimeField: 'created_at',
    dimensions: {
      assignee: { label: '采购负责人', sql: 'a.real_name' },
      status: { label: '状态', sql: 'pt.status', labels: PURCHASE_TASK_STATUS_LABELS },
      task_type: { label: '任务类型', sql: 'pt.task_type', labels: PURCHASE_TASK_TYPE_LABELS },
      customer: { label: '客户', sql: "COALESCE(NULLIF(mo.customer_name, ''), '未填写')" },
      ...timeDimensions('__TIME__'),
    },
    metrics: {
      count: { label: '任务数', sql: 'COUNT(*)' },
      pending_count: { label: '待处理数', sql: "SUM(CASE WHEN pt.status = 'pending' THEN 1 ELSE 0 END)" },
    },
    filters: {
      assignee: { label: '采购负责人', type: 'text', column: 'a.real_name' },
      status: { label: '状态', type: 'enum', column: 'pt.status', options: PURCHASE_TASK_STATUS_LABELS },
      task_type: { label: '任务类型', type: 'enum', column: 'pt.task_type', options: PURCHASE_TASK_TYPE_LABELS },
      customer: { label: '客户', type: 'text', column: 'mo.customer_name' },
    },
  },

  inspection_completion: {
    key: 'inspection_completion',
    label: '巡检完成率',
    description: '巡检计划执行完成情况。应巡次数按周期折算（月检每月1次、双月检0.5、季检约0.33，全部时间下折算为0）；已执行=已生成工单，结案另看。timeRange 只决定折算区间与工单匹配范围，不筛选计划；查漏检建议筛选 是否启用=启用 并限定月份',
    baseSql: `FROM inspection_schedules isp
      JOIN customers c ON c.id = isp.customer_id
      LEFT JOIN users eng ON eng.id = isp.target_engineer_id
      LEFT JOIN (
        SELECT inspection_schedule_id, COUNT(*) AS order_cnt,
               SUM(CASE WHEN status IN ('submitted', 'approved', 'archived') THEN 1 ELSE 0 END) AS closed_cnt
        FROM service_orders
        WHERE inspection_schedule_id IS NOT NULL
          AND (:timeFrom IS NULL OR DATE(inspection_occurrence_date) >= :timeFrom)
          AND (:timeTo IS NULL OR DATE(inspection_occurrence_date) <= :timeTo)
        GROUP BY inspection_schedule_id
      ) oc ON oc.inspection_schedule_id = isp.id`,
    timeFields: {},
    defaultTimeField: null,
    dimensions: {
      customer: { label: '客户', sql: 'c.name' },
      engineer: { label: '负责工程师', sql: "COALESCE(eng.real_name, '未指定')" },
      cadence: { label: '巡检周期', sql: 'isp.cadence', labels: CADENCE_LABELS },
      active: { label: '是否启用', sql: "CASE WHEN isp.active = 1 THEN '启用' ELSE '停用' END" },
    },
    metrics: {
      plans: { label: '计划数', sql: 'COUNT(*)' },
      expected: {
        label: '应巡次数(折算)',
        sql: `ROUND(SUM(CASE
          WHEN :timeFrom IS NULL OR :timeTo IS NULL THEN 0
          WHEN isp.cadence = 'monthly' THEN TIMESTAMPDIFF(MONTH, :timeFrom, :timeTo) + 1
          WHEN isp.cadence = 'bi-monthly' THEN (TIMESTAMPDIFF(MONTH, :timeFrom, :timeTo) + 1) / 2
          ELSE (TIMESTAMPDIFF(MONTH, :timeFrom, :timeTo) + 1) / 3 END), 1)`,
        round: 1,
      },
      generated: { label: '已生成工单数', sql: 'COALESCE(SUM(oc.order_cnt), 0)' },
      closed: { label: '已结案数', sql: 'COALESCE(SUM(oc.closed_cnt), 0)' },
      missing: { label: '未生成工单的计划数', sql: 'SUM(CASE WHEN oc.inspection_schedule_id IS NULL THEN 1 ELSE 0 END)' },
    },
    filters: {
      customer: { label: '客户', type: 'text', column: 'c.name' },
      engineer: { label: '工程师', type: 'text', column: 'eng.real_name' },
      cadence: { label: '巡检周期', type: 'enum', column: 'isp.cadence', options: CADENCE_LABELS },
      active: { label: '是否启用', type: 'enum', column: 'isp.active', options: { '1': '启用', '0': '停用' } },
    },
  },
}

module.exports = { DATASETS }
