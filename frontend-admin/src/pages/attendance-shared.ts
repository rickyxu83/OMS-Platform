import type { ServiceOrderDetailItem } from "@/lib/service-order-detail";
import { useEffect, useState } from "react";
import { api } from "@/services/api";

/**
 * 考勤域共享模块：Attendance 与 AttendanceApplyDrawer 共用的类型、标签映射与日期/时长工具函数。
 * 抽离目的：消除 Attendance ↔ AttendanceApplyDrawer 循环依赖（depcruise no-circular）。
 */

export type RequestType = "leave" | "overtime" | "comp_time";
export type AnnualLeavePeriod = "morning" | "afternoon" | "day";

export interface ServiceOrderSummary extends ServiceOrderDetailItem {
  serviceAt?: string | null;
  unavailable?: boolean;
}

export interface EmployeeProfile {
  id: number | string;
  userId?: number | string;
  employeeName?: string;
  username?: string;
  role?: string;
  nationality?: string;
  hireDate?: string;
  leaveDate?: string;
  attendanceEnabled?: boolean;
  annualLeaveRule?: string;
  annualLeaveBalanceDays?: number;
  annualLeaveBalanceHours?: number;
  compTimeBalanceHours?: number;
  unavailable?: boolean;
  /** 年度带薪假别额度（spec 004）：key 为假别 code，当前为病假 */
  leaveQuotas?: Record<string, LeaveQuotaInfo>;
  unavailableReason?: string | null;
}

export interface LegalHolidayItem {
  date: string;
  name: string;
  source: string;
  dayType?: string;
  active?: boolean;
}

export interface OvertimeLeg {
  key: string;
  label: string;
  startAt: string;
  endAt: string;
  hours: number;
}

export interface OvertimeSegment {
  key: string;
  kind: "travel" | "work";
  label: string;
  startAt: string;
  endAt: string;
  hours: number;
  dayType?: string;
  triplePayDates?: string[];
  payMultiplier?: number | null;
  allowedResults?: string[];
  legs?: OvertimeLeg[];
}

export interface OvertimeServiceOrder extends ServiceOrderSummary {
  status?: string;
  segments: OvertimeSegment[];
  usedSegments?: string[];
  engineerCount?: number;
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "特休",
  sick: "病假",
  personal: "事假",
  marriage: "婚假",
  bereavement: "丧假",
};

// ===== 假别元数据（spec 004）：表驱动，LEAVE_TYPE_LABELS 仅作历史数据究底 =====

export interface LeaveTypeItem {
  id: number;
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  requiresProof: boolean;
  includeNonWorkingDays: boolean;
  countsBalance: boolean;
  referenceDays: string;
  policyNote: string;
  paidQuotaDays: number | null;
  exceedDeductionPercent: number | null;
  systemReserved: boolean;
  referenced?: number;
}

export interface LeaveQuotaInfo {
  quotaDays: number;
  usedDays: number;
  exceedDays: number;
  deductionPercent: number | null;
}

let leaveTypesCache: { at: number; items: LeaveTypeItem[] } | null = null;

export function invalidateLeaveTypesCache() {
  leaveTypesCache = null;
}

/** 读取启用假别列表（申请下拉/label 用），30s 进程内缓存；管理端编辑后调 invalidateLeaveTypesCache */
export function useLeaveTypes() {
  const [items, setItems] = useState<LeaveTypeItem[]>(leaveTypesCache?.items || []);
  useEffect(() => {
    if (leaveTypesCache && Date.now() - leaveTypesCache.at < 30_000) {
      setItems(leaveTypesCache.items);
      return;
    }
    let alive = true;
    api.get("/attendance/leave-types")
      .then((data) => {
        const list = Array.isArray(data?.items) ? data.items : [];
        leaveTypesCache = { at: Date.now(), items: list };
        if (alive) setItems(list);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return items;
}

/** label 取值链：单据快照 → 表数据 → 写死究底（历史） → code 原文 */
export function leaveTypeLabelOf(code?: string | null, items?: LeaveTypeItem[], snapshotLabel?: string | null) {
  if (snapshotLabel) return snapshotLabel;
  const key = String(code || "");
  return items?.find((item) => item.code === key)?.label || LEAVE_TYPE_LABELS[key] || key || "请假";
}

export const OVERTIME_DAY_TYPE_LABELS: Record<string, string> = {
  workday: "工作日",
  rest_day: "休息日",
  legal_holiday: "法定节假日",
};

export const SERVICE_MODE_LABELS: Record<string, string> = {
  onsite: "现场",
  remote: "远程",
  office: "内勤",
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  install: "安装",
  repair: "维修",
  maintain: "保养",
  inspect: "巡检",
  training: "培训",
  other: "其他",
};

export function nowLocalValue(offsetHours = 0) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return `${local.toISOString().slice(0, 13)}:00`;
}

export function addHoursValue(value: string, amount: number) {
  const base = new Date(String(value || nowLocalValue()).replace("T", " "));
  if (!Number.isFinite(base.getTime())) return nowLocalValue(amount);
  const next = new Date(base.getTime() + amount * 60 * 60 * 1000);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60 * 1000);
  return `${local.toISOString().slice(0, 13)}:00`;
}

// 调休午休窗口（产品裁决 2026-08-28）：12:00-13:00 不计入调休时长，8 小时 = 一天
function lunchWindowsCrossed(start: Date, end: Date) {
  let count = 0;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  for (let day = startDay; day <= lastDay; day += 86400000) {
    const d = new Date(day);
    const lunchStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
    const lunchEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 13, 0, 0);
    if (end > lunchStart && start < lunchEnd) count += 1;
  }
  return count;
}

/** 调休结束时间推算（扣除 12:00-13:00 午休，镜像后端 compTimeEndAt）；开始时间落在午休内返回空串 */
export function compTimeEndAtValue(startAt: string, hours: number) {
  const start = new Date(String(startAt).replace("T", " "));
  if (!Number.isFinite(start.getTime())) return "";
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  if (startMinutes >= 12 * 60 && startMinutes < 13 * 60) return "";
  let end = new Date(start.getTime() + hours * 3600000);
  for (let i = 0; i < 3; i += 1) {
    const extra = lunchWindowsCrossed(start, end);
    const next = new Date(start.getTime() + (hours + extra) * 3600000);
    if (next.getTime() === end.getTime()) break;
    end = next;
  }
  const local = new Date(end.getTime() - end.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16).replace("T", " ");
}

export function dateValue(value?: string) {
  return String(value || nowLocalValue()).slice(0, 10);
}

export function dateIndex(value: string) {
  const [year, month, day] = String(value).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function annualLeaveRange(form: {
  annualStartDate?: string;
  annualEndDate?: string;
  annualPeriod?: string;
  annualStartPeriod?: string;
  annualEndPeriod?: string;
}) {
  const startDate = dateValue(form.annualStartDate);
  const endDate = dateValue(form.annualEndDate || startDate);
  if (startDate === endDate) {
    const period = (["morning", "afternoon", "day"].includes(String(form.annualPeriod)) ? form.annualPeriod : "morning") as AnnualLeavePeriod;
    if (period === "afternoon") return { startAt: `${startDate}T14:00`, endAt: `${startDate}T18:00`, hours: 4 };
    if (period === "day") return { startAt: `${startDate}T09:00`, endAt: `${startDate}T18:00`, hours: 8 };
    return { startAt: `${startDate}T09:00`, endAt: `${startDate}T14:00`, hours: 4 };
  }
  const startPeriod = form.annualStartPeriod === "afternoon" ? "afternoon" : "morning";
  const endPeriod = form.annualEndPeriod === "morning" ? "morning" : "afternoon";
  const startHalf = dateIndex(startDate) * 2 + (startPeriod === "afternoon" ? 1 : 0);
  const endHalf = dateIndex(endDate) * 2 + (endPeriod === "afternoon" ? 1 : 0);
  const halfDays = Math.max(1, endHalf - startHalf + 1);
  return {
    startAt: `${startDate}T${startPeriod === "afternoon" ? "14" : "09"}:00`,
    endAt: `${endDate}T${endPeriod === "afternoon" ? "18" : "14"}:00`,
    hours: halfDays * 4,
  };
}

export function workingLeaveSummary(form: Parameters<typeof annualLeaveRange>[0], holidays: Set<string>, includeNonWorkingDays = false) {
  const range = annualLeaveRange(form);
  const startDate = range.startAt.slice(0, 10);
  const endDate = range.endAt.slice(0, 10);
  const startHalf = range.startAt.slice(11, 13) === "14" ? 1 : 0;
  const endHalf = range.endAt.slice(11, 13) === "18" ? 1 : 0;
  let halfDays = 0;
  for (let timestamp = dateIndex(startDate); timestamp <= dateIndex(endDate); timestamp += 1) {
    const cursor = new Date(timestamp * 86400000);
    const key = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    if (!includeNonWorkingDays && (day === 0 || day === 6 || holidays.has(key))) continue;
    const firstHalf = key === startDate ? startHalf : 0;
    const lastHalf = key === endDate ? endHalf : 1;
    if (lastHalf >= firstHalf) halfDays += lastHalf - firstHalf + 1;
  }
  return { ...range, hours: halfDays * 4, workingDays: halfDays / 2 };
}

export function applyAnnualLeaveRange<T extends {
  annualStartDate?: string;
  annualEndDate?: string;
  annualPeriod?: string;
  annualStartPeriod?: string;
  annualEndPeriod?: string;
}>(form: T) {
  const range = annualLeaveRange(form);
  return { ...form, startAt: range.startAt, endAt: range.endAt, hours: String(range.hours) };
}

export { formatDateTime } from "@/lib/format";

export function hours(value?: number) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
}

export function days(value?: number) {
  return hours(value);
}

export function annualBalanceDays(item?: { annualLeaveBalanceDays?: number; annualLeaveBalanceHours?: number } | null) {
  if (!item) return 0;
  if (typeof item.annualLeaveBalanceDays === "number") return item.annualLeaveBalanceDays;
  return Number(item.annualLeaveBalanceHours || 0) / 8;
}

// 后端已把去程/回程合并成一条 travel 段返回（含 dayType），前端不再自行合并。
// 时段顺序固定为 travel 在前、work 在后。参见 docs/adr/0002。
export function overtimeRows(order: OvertimeServiceOrder | null) {
  if (!order) return [];
  return order.segments || [];
}

// datetime-local 输入用 "YYYY-MM-DDTHH:mm"，工单/后端时间用空格分隔，做一次转换。
export function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

export function parseLocalDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isFinite(date.getTime()) ? date : null;
}

// 客户端预览用的加班时长核算，忠实镜像后端 overtimeWindow（整点取整 + 0.5h 保底）。
// dayType 取所选 travel 段（同城往返为同一天，边界情况以提交后端核算为准）。
// 镜像后端 overtimeWindow 的定稿口径（2026-08-28）：法定节假日/休息日全天计；
// 工作日计 09:00 前 + 18:00 后两段；每段不足整点但确有发生 → 0.5h 保底（不足 15 分钟也计）。
export function previewOvertimeHours(startAt: string, endAt: string, dayType?: string) {
  const start = parseLocalDateTime(startAt);
  const end = parseLocalDateTime(endAt);
  if (!start || !end || end <= start) return 0;
  const fullDay = dayType === "legal_holiday" || dayType === "rest_day";
  // 拆有效时段：节假日/休息日为整段；工作日为 09:00 前 + 18:00 后两段
  const parts: Array<[Date, Date]> = [];
  if (fullDay) {
    parts.push([start, end]);
  } else {
    const nine = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9, 0, 0);
    const eighteen = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 18, 0, 0);
    if (start < nine) parts.push([start, end < nine ? end : nine]);
    if (end > eighteen) parts.push([start > eighteen ? start : eighteen, end]);
  }
  if (!parts.length) return 0;
  let total = 0;
  for (const [pStart, pEnd] of parts) {
    if (pEnd <= pStart) continue;
    const effStart = new Date(pStart);
    if (effStart.getMinutes() || effStart.getSeconds() || effStart.getMilliseconds()) {
      effStart.setHours(effStart.getHours() + 1, 0, 0, 0);
    } else {
      effStart.setMinutes(0, 0, 0);
    }
    const effEnd = new Date(pEnd);
    effEnd.setMinutes(0, 0, 0);
    const hourDelta = Math.round((effEnd.getTime() - effStart.getTime()) / 3600000);
    total += hourDelta > 0 ? hourDelta : 0.5;
  }
  return total > 0 ? total : 0;
}

// 法定加班倍率（仅角标展示，不改变统计与核算口径；产品裁决 2026-09-02：工作日 1.5 / 周末 2 / 法定节假日 3）
export function overtimeDayMultiplier(dayType?: string | null): number | null {
  if (dayType === "workday") return 1.5;
  if (dayType === "rest_day") return 2;
  if (dayType === "legal_holiday") return 3;
  return null;
}

export function overtimePayLabel(segment?: Pick<OvertimeSegment, "payMultiplier" | "dayType"> | null) {
  const stored = Number(segment?.payMultiplier || 1);
  const multiplier = stored > 1 ? stored : overtimeDayMultiplier(segment?.dayType) || 1;
  return multiplier > 1 ? `加班费（${hours(multiplier)}倍）` : "加班费";
}

export function createBlankForm() {
  const today = dateValue();
  return applyAnnualLeaveRange({
    requestType: "leave" as RequestType,
    leaveType: "annual",
    overtimeKind: "work",
    overtimeResult: "comp_time",
    delegateEmployeeId: "",
    annualStartDate: today,
    annualEndDate: today,
    annualPeriod: "morning" as AnnualLeavePeriod,
    annualStartPeriod: "morning" as AnnualLeavePeriod,
    annualEndPeriod: "morning" as AnnualLeavePeriod,
    reason: "",
  });
}

/** 可继续提交的草稿申请（结构子集，Attendance.tsx 的 AttendanceRequest 天然满足） */
export interface ResumableDraft {
  id: number | string;
  requestType: RequestType;
  leaveType?: string | null;
  delegateEmployeeId?: number | string | null;
  startAt?: string;
  endAt?: string;
  proofFiles?: Array<{ id: number | string; originalName: string }>;
  proofFileCount?: number;
  reason?: string | null;
}

/** 从草稿重建抽屉表单（继续提交入口用）。仅请假/调休有草稿；加班单一步提交无草稿态。 */
export function formFromDraft(draft: ResumableDraft) {
  const startDate = dateValue(draft.startAt);
  const endDate = dateValue(draft.endAt || draft.startAt);
  const startTime = String(draft.startAt || "").slice(11, 16);
  const endTime = String(draft.endAt || "").slice(11, 16);
  const singleDay = startDate === endDate;
  return applyAnnualLeaveRange({
    ...createBlankForm(),
    requestType: draft.requestType === "comp_time" ? "comp_time" as RequestType : "leave" as RequestType,
    leaveType: draft.leaveType || "annual",
    delegateEmployeeId: draft.delegateEmployeeId ? String(draft.delegateEmployeeId) : "",
    reason: draft.reason || "",
    annualStartDate: startDate,
    annualEndDate: endDate,
    // 单日：09-14 上午 / 14-18 下午 / 09-18 全天；多日：按起止半天槽位还原
    annualPeriod: singleDay ? (startTime === "14:00" ? "afternoon" : endTime === "14:00" ? "morning" : "day") as AnnualLeavePeriod : "morning" as AnnualLeavePeriod,
    annualStartPeriod: (startTime === "14:00" ? "afternoon" : "morning") as AnnualLeavePeriod,
    annualEndPeriod: (endTime === "14:00" ? "morning" : "afternoon") as AnnualLeavePeriod,
  });
}

/* ============================================================================
 * 以下为 Attendance.tsx 拆分（D1 重构 2026-08-24）迁出的共享常量/类型/纯函数。
 * 供 pages/Attendance 与 components/attendance/* 共同使用。
 * ==========================================================================*/

export interface ApprovalStep {
  id: number | string;
  stepType: "delegate" | "supervisor" | "hr" | "vp" | "role";
  stepOrder: number;
  assigneeEmployeeId?: number | string | null;
  assigneeEmployeeName?: string | null;
  assigneeRole?: string | null;
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
}

export interface AttendanceRequest {
  id: number | string;
  workflowVersion?: number;
  employeeId: number | string;
  employeeName?: string;
  applicantRole?: string | null;
  supervisorRole?: string | null;
  delegateEmployeeId?: number | string | null;
  delegateEmployeeName?: string | null;
  requestType: RequestType;
  leaveType?: string | null;
  /** 假别快照（spec 004）：提交时名称/参考天数/政策说明；年度带薪额度使用情况 */
  leaveTypeLabel?: string | null;
  leaveReferenceDays?: string | null;
  leavePolicyNote?: string | null;
  leaveQuota?: LeaveQuotaInfo | null;
  overtimeKind?: string | null;
  overtimeResult?: string | null;
  overtimeDayType?: string | null;
  overtimePayMultiplier?: number | null;
  isTriplePay?: boolean;
  travelLegs?: OvertimeLeg[] | null;
  sourceType?: string | null;
  sourceId?: number | string | null;
  sourceDetail?: string | null;
  batchId?: string | null;
  serviceOrder?: ServiceOrderSummary | null;
  reason?: string | null;
  startAt?: string;
  endAt?: string;
  hours?: number;
  workingDays?: number | null;
  proofFileCount?: number;
  proofFiles?: Array<{ id: number | string; originalName: string; mimeType?: string; size?: number }>;
  approvals?: ApprovalStep[];
  status?: string;
  /** 催办节流（spec 007）：后端返回最近一次手动催办时间，用于按钮置灰 */
  lastRemindedAt?: string | null;
}

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: "请假",
  overtime: "加班",
  comp_time: "调休",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_delegate: "待代理人",
  pending_approval: "待审批",
  pending_supervisor: "待主管",
  pending_hr: "待人事",
  pending_vp: "待副总",
  pending_admin: "待行政（旧流程）",
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
  voided: "已作废",
};

export const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_delegate: "warning",
  pending_approval: "info",
  pending_supervisor: "warning",
  pending_hr: "info",
  pending_vp: "info",
  pending_admin: "info",
  approved: "success",
  rejected: "destructive",
  withdrawn: "secondary",
  voided: "outline",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  assistant: "助理",
  dispatcher: "调度",
  operations_director: "运营负责人",
  engineering_supervisor: "工程主管",
  administrative_supervisor: "行政主管",
  sales_supervisor: "业务主管",
  sales: "业务",
  engineer: "工程师",
};

export const NATIONALITY_LABELS: Record<string, string> = {
  mainland: "陆籍",
  taiwan: "台籍",
};

export function roleLabel(role?: string | null) {
  return ROLE_LABELS[role || ""] || role || "-";
}

export function approvalStepLabel(step?: ApprovalStep) {
  if (!step) return "";
  if (step.stepType === "role") return roleLabel(step.assigneeRole);
  const labels = { delegate: "代理人", supervisor: "主管", hr: "人事", vp: "副总" };
  return labels[step.stepType] || step.stepType;
}

export function approvalStepStatus(step?: ApprovalStep) {
  if (!step) return "";
  const labels = { waiting: "等待", pending: "待签核", approved: "已通过", rejected: "已驳回", skipped: "已跳过" };
  return labels[step.status] || step.status;
}

export function monthDateRange(month: string) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return { startDate: "", endDate: "" };
  const endDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return { startDate: `${match[1]}-${match[2]}-01`, endDate: `${match[1]}-${match[2]}-${String(endDay).padStart(2, "0")}` };
}

export function dateInputValue(value?: string) {
  return String(value || "").slice(0, 10);
}

export function annualUsageDays(item?: { annualLeaveDays?: number; annualLeaveHours?: number } | null) {
  if (!item) return 0;
  if (typeof item.annualLeaveDays === "number") return item.annualLeaveDays;
  return Number(item.annualLeaveHours || 0) / 8;
}

// 法定节假日只读展示：星期、日期格式化与连续假期段合并辅助
const HOLIDAY_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function holidayWeekday(date: string) {
  return `周${HOLIDAY_WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]}`;
}

export function fmtHolidayDate(date: string) {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

export function addHolidayDays(date: string, amount: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + amount);
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${month}-${day}`;
}

export interface HolidayRange {
  name: string;
  start: string;
  end: string;
  days: number;
  makeup: string[];
}

// 连续同名的放假日合并为一个假期段，并按名称关联调休补班日；未匹配到假期的补班日单列
export function buildHolidayRanges(items: LegalHolidayItem[]) {
  const sorted = items.slice().sort((a, b) => a.date.localeCompare(b.date));
  const holidayRows = sorted.filter((item) => item.dayType !== "makeup_workday");
  const makeupRows = sorted.filter((item) => item.dayType === "makeup_workday");
  const ranges: HolidayRange[] = [];
  for (const item of holidayRows) {
    const last = ranges[ranges.length - 1];
    if (last && last.name === item.name && addHolidayDays(last.end, 1) === item.date) {
      last.end = item.date;
      last.days += 1;
    } else {
      ranges.push({ name: item.name, start: item.date, end: item.date, days: 1, makeup: [] });
    }
  }
  const orphanMakeup: LegalHolidayItem[] = [];
  for (const item of makeupRows) {
    const target = ranges.find((range) => range.name === item.name);
    if (target) target.makeup.push(item.date);
    else orphanMakeup.push(item);
  }
  return { ranges, orphanMakeup };
}

export function serviceOrderTypeLabel(order: ServiceOrderSummary) {
  const mode = SERVICE_MODE_LABELS[order.serviceMode || ""] || order.serviceMode || "-";
  const type = SERVICE_TYPE_LABELS[order.serviceType || ""] || order.serviceType || "-";
  return `${mode} / ${type}`;
}
