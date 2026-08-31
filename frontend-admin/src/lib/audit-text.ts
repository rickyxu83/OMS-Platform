import { orderStatusLabel } from "./service-items";

/**
 * 操作审计日志的人类可读文案。
 * 后端 audit_logs 存的是动作码（action）+ 资源类型（target_type）+ detail_json，
 * 这里统一把它们翻译成中文标签与一句话摘要，供审计页面与 CSV 导出共用。
 */

export interface AuditLogLike {
  action?: string;
  targetType?: string;
  resourceType?: string;
  targetId?: string | number;
  resourceId?: string | number;
  detail?: Record<string, unknown> | null;
}

/** 动作码 → 中文标签（覆盖中间件 CRUD 与各业务模块的定制动作）。badge 统一两字，精确含义由旁边的一句话摘要兜底 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  read: "查询",
  create: "新建",
  update: "修改",
  delete: "删除",
  login: "登录",
  login_failed: "失败",
  logout: "登出",
  export: "导出",
  assign: "派单",
  transition: "流转",
  cancel: "作废",
  self_report_submit: "填报",
  self_report_update: "改报",
  timesheet_manual_entry_create: "补录",
  timesheet_manual_entry_delete: "删录",
  customer_signature_request_create: "请签",
  customer_signature_signed: "签署",
  engineer_signature_signed: "签署",
  inspection_order_confirm: "确认",
  contract_no_fill: "填写",
  purchase_submit: "采购",
  purchase_update: "改采",
  passkey_register: "注册",
  passkey_rename: "改名",
  passkey_delete: "删钥",
};

/** 资源类型 → 中文标签（中间件取路由首段，业务审计用定制值） */
export const AUDIT_TARGET_LABELS: Record<string, string> = {
  service_order: "工单",
  "service-orders": "工单",
  mr: "MR 申请",
  auth: "登录认证",
  user: "用户",
  users: "用户",
  announcements: "公告",
  attendance: "考勤",
  customers: "客户",
  devices: "设备",
  "device-model-catalog": "设备型号库",
  "maintenance-parties": "维保方",
  geo: "地理数据",
  "inspection-schedules": "巡检计划",
  "approval-tasks": "审批任务",
  files: "文件",
  settings: "系统设置",
  "audit-logs": "审计日志",
  roles: "角色",
  "customer-signature-requests": "客户签署请求",
  "user-signature": "工程师签署",
  api: "接口",
};

/** detail_json 字段 → 中文标签（用于折叠详情的人类可读展示） */
const DETAIL_KEY_LABELS: Record<string, string> = {
  method: "请求方式",
  path: "请求路径",
  query: "查询参数",
  body: "提交内容",
  statusCode: "状态码",
  ip: "来源 IP",
  location: "IP 归属地",
  durationMs: "耗时(ms)",
  message: "说明",
  from: "变更前状态",
  to: "变更后状态",
  previousStatus: "原状态",
  status: "状态",
  reason: "原因",
  note: "备注",
  orderNo: "工单号",
  source: "操作来源",
  primaryEngineerId: "主责工程师 ID",
  engineerId: "工程师 ID",
  engineerIds: "工程师 ID 列表",
  plannedStartAt: "计划开始时间",
  plannedEndAt: "计划结束时间",
  requestId: "签署请求 ID",
  recipientEmail: "接收邮箱",
  sendEmail: "是否发送邮件",
  expiresAt: "过期时间",
  signerName: "签署人",
  contractNo: "合同编号",
  ctrlNo: "控制编号",
  customerName: "客户名称",
  changes: "变更明细",
  deviceName: "设备名称",
  passkeyId: "通行密钥 ID",
  inspectionScheduleId: "巡检计划 ID",
  inspectionOccurrenceDate: "巡检日期",
  deletedInstalledDeviceCount: "清理装机设备数",
  skippedInstalledDeviceCount: "跳过装机设备数",
  purchaseOrderNo: "采购订单号",
  companyPartNo: "公司料号",
  shipmentNo: "出货单号",
};

const LOGIN_METHOD_LABELS: Record<string, string> = {
  password_login: "账号密码",
  passkey_login: "Passkey 通行密钥",
};

const SOURCE_LABELS: Record<string, string> = {
  public_link: "公开链接",
  engineer: "工程师端",
  engineer_rc: "工程师端",
  ops: "运营端",
};

export function auditActionLabel(action?: string) {
  const key = String(action || "").trim();
  return AUDIT_ACTION_LABELS[key] || key || "-";
}

function targetTypeOf(log: AuditLogLike) {
  return String(log.targetType || log.resourceType || "").trim();
}

function targetIdOf(log: AuditLogLike) {
  return log.targetId ?? log.resourceId;
}

/** 资源的中文展示，如「工单 #123」；无资源时返回 "-" */
export function auditTargetLabel(log: AuditLogLike) {
  const type = targetTypeOf(log);
  const id = targetIdOf(log);
  const typeLabel = AUDIT_TARGET_LABELS[type] || type;
  if (!typeLabel && (id === undefined || id === null)) return "-";
  if (id === undefined || id === null || Number(id) === 0) return typeLabel || "-";
  return `${typeLabel || "记录"} #${id}`;
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function orderRef(log: AuditLogLike) {
  const orderNo = text(log.detail?.orderNo);
  if (orderNo) return `工单 ${orderNo}`;
  return auditTargetLabel(log);
}

/** 一句话人类可读摘要：谁对什么做了什么（操作人由调用方拼接） */
export function describeAuditLog(log: AuditLogLike) {
  const action = String(log.action || "");
  const detail = log.detail || {};
  const target = auditTargetLabel(log);
  const orderStatus = (value: unknown) => orderStatusLabel(text(value)) || text(value) || "-";

  switch (action) {
    case "transition":
      return `将${target}状态从「${orderStatus(detail.from)}」流转为「${orderStatus(detail.to)}」${
        text(detail.reason) ? `，原因：${text(detail.reason)}` : ""
      }`;
    case "assign": {
      const count = Array.isArray(detail.engineerIds) ? detail.engineerIds.length : 0;
      const primary = text(detail.primaryEngineerId);
      return `派发${target}${primary ? `（主责工程师 #${primary}${count > 1 ? `，共 ${count} 人` : ""}）` : ""}`;
    }
    case "cancel":
      return `作废${orderRef(log)}（原状态：${orderStatus(detail.previousStatus)}）`;
    case "delete":
      if (targetTypeOf(log) === "service_order") {
        return `删除${orderRef(log)}（原状态：${orderStatus(detail.previousStatus)}）`;
      }
      return `删除${target}`;
    case "create":
      return `新建${target}`;
    case "update":
      return `修改${target}`;
    case "self_report_submit":
      return `提交${target}的服务填报`;
    case "self_report_update":
      return `修改${target}的服务填报`;
    case "timesheet_manual_entry_create":
      return `为${target}手动补录工时`;
    case "timesheet_manual_entry_delete":
      return `删除${target}的补录工时`;
    case "customer_signature_request_create": {
      const email = text(detail.recipientEmail);
      return `为${target}发起客户签署${email ? `（接收邮箱 ${email}）` : "（仅生成签署链接）"}`;
    }
    case "customer_signature_signed":
      return `客户「${text(detail.signerName) || "未知签署人"}」完成${target}的签署`;
    case "engineer_signature_signed":
      return "工程师通过公开链接完成签名";
    case "inspection_order_confirm": {
      const date = text(detail.inspectionOccurrenceDate);
      const engineer = text(detail.engineerId);
      return `确认${target}${date ? `（巡检日期 ${date}${engineer ? `，工程师 #${engineer}` : ""}）` : ""}`;
    }
    case "contract_no_fill":
      return `为${target}填写合同编号「${text(detail.contractNo) || "-"}」`;
    case "purchase_submit": {
      const ctrlNo = text(detail.ctrlNo);
      return `提交${target}${ctrlNo ? `（控制编号 ${ctrlNo}）` : ""}的采购订单号`;
    }
    case "purchase_update": {
      const count = Array.isArray(detail.changes) ? detail.changes.length : 0;
      return `修改${target}的采购信息${count ? `（${count} 处变更）` : ""}`;
    }
    case "login":
      return `通过${LOGIN_METHOD_LABELS[text(detail.method)] || text(detail.method) || "未知方式"}登录成功`;
    case "login_failed":
      return `登录失败（方式：${LOGIN_METHOD_LABELS[text(detail.method)] || text(detail.method) || "未知"}）`;
    case "passkey_register":
      return `注册通行密钥「${text(detail.deviceName) || "未命名设备"}」`;
    case "passkey_rename":
      return `将通行密钥重命名为「${text(detail.deviceName) || "-"}」`;
    case "passkey_delete":
      return "删除通行密钥";
    default:
      return `${auditActionLabel(action)}${target === "-" ? "" : ` ${target}`}`;
  }
}

/** 状态类字段的值转成中文状态文案 */
function formatStatusValue(value: unknown) {
  const raw = text(value);
  return orderStatusLabel(raw) || raw;
}

function formatDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (["from", "to", "previousStatus", "status"].includes(key)) return formatStatusValue(value);
  if (key === "method" && String(value).includes("login")) return LOGIN_METHOD_LABELS[text(value)] || text(value);
  if (key === "source") return SOURCE_LABELS[text(value)] || text(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (key === "changes" && Array.isArray(value)) {
    return value
      .map((change) => {
        const c = change as Record<string, unknown>;
        const field = DETAIL_KEY_LABELS[text(c.field)] || text(c.field) || "字段";
        const name = text(c.name);
        return `${name ? `「${name}」` : `第 ${text(c.rowNo) || "?"} 行`}${field}：${text(c.before) || "空"} → ${text(c.after) || "空"}`;
      })
      .join("；");
  }
  if (Array.isArray(value)) return value.map((item) => text(item) || JSON.stringify(item)).join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** 已经在卡片上单独展示的字段，折叠详情里不重复 */
const META_KEYS = new Set(["statusCode", "ip", "location", "durationMs", "message"]);

/** 折叠详情的人类可读行（「字段名：值」），无内容时返回空数组 */
export function formatAuditDetailLines(log: AuditLogLike) {
  const detail = log.detail;
  if (!detail || typeof detail !== "object") return [];
  return Object.entries(detail)
    .filter(([key, value]) => !META_KEYS.has(key) && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${DETAIL_KEY_LABELS[key] || key}：${formatDetailValue(key, value)}`);
}
