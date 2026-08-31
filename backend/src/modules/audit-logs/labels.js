// 审计日志动作码/资源类型的中文标签，与前端 frontend-admin/src/lib/audit-text.ts 保持同步。
// 用途：列表关键词搜索时把中文标签（如「派单」「工单」）反查回数据库里存的英文 code，
// 让搜索框能按页面上展示的中文文案检索。改任一份映射时请同步另一份。

const AUDIT_ACTION_LABELS = {
  read: '查询',
  create: '新建',
  update: '修改',
  delete: '删除',
  login: '登录',
  login_failed: '失败',
  logout: '登出',
  export: '导出',
  assign: '派单',
  transition: '流转',
  cancel: '作废',
  self_report_submit: '填报',
  self_report_update: '改报',
  timesheet_manual_entry_create: '补录',
  timesheet_manual_entry_delete: '删录',
  customer_signature_request_create: '请签',
  customer_signature_signed: '签署',
  engineer_signature_signed: '签署',
  inspection_order_confirm: '确认',
  contract_no_fill: '填写',
  purchase_submit: '采购',
  purchase_update: '改采',
  passkey_register: '注册',
  passkey_rename: '改名',
  passkey_delete: '删钥',
}

const AUDIT_TARGET_LABELS = {
  service_order: '工单',
  'service-orders': '工单',
  mr: 'MR 申请',
  auth: '登录认证',
  user: '用户',
  users: '用户',
  announcements: '公告',
  attendance: '考勤',
  customers: '客户',
  devices: '设备',
  'device-model-catalog': '设备型号库',
  'maintenance-parties': '维保方',
  geo: '地理数据',
  'inspection-schedules': '巡检计划',
  'approval-tasks': '审批任务',
  files: '文件',
  settings: '系统设置',
  'audit-logs': '审计日志',
  roles: '角色',
  'customer-signature-requests': '客户签署请求',
  'user-signature': '工程师签署',
  api: '接口',
}

/** 关键词变体（buildLikeSearch 的简/繁变体）命中哪些 code：标签包含任一变体即算命中 */
function codesMatchingKeyword(labels, variants) {
  if (!variants.length) return []
  return Object.entries(labels)
    .filter(([, label]) => variants.some((variant) => label.includes(variant)))
    .map(([code]) => code)
}

module.exports = {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  codesMatchingKeyword,
}
