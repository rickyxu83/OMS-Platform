import type { ServiceOrderDetailItem } from "@/lib/service-order-detail";

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
  unavailableReason?: string | null;
}

export interface LegalHolidayItem {
  date: string;
  name: string;
  source: string;
  active?: boolean;
}

export interface OvertimeSegment {
  key: string;
  kind: "travel" | "work";
  label: string;
  startAt: string;
  endAt: string;
  hours: number;
  dayType?: string;
  payMultiplier?: number | null;
  allowedResults?: string[];
}

export interface OvertimeServiceOrder extends ServiceOrderSummary {
  status?: string;
  segments: OvertimeSegment[];
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "特休",
  sick: "病假",
  personal: "事假",
  marriage: "婚假",
  bereavement: "丧假",
};

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

export function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

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

// 客户端预览用的加班时长核算，忠实镜像后端 overtimeWindow（掐平日 18:00、整点取整）。
// dayType 取所选 travel 段（同城往返为同一天，边界情况以提交后端核算为准）。
export function previewOvertimeHours(startAt: string, endAt: string, dayType?: string) {
  const start = parseLocalDateTime(startAt);
  const end = parseLocalDateTime(endAt);
  if (!start || !end || end <= start) return 0;
  const fullDay = dayType === "legal_holiday" || dayType === "rest_day";
  const endHour = end.getHours() + end.getMinutes() / 60;
  if (!fullDay && endHour <= 18) return 0;
  const overtimeStart = fullDay
    ? start
    : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 18, 0, 0);
  const rawStart = start > overtimeStart ? start : overtimeStart;
  const effStart = new Date(rawStart);
  if (effStart.getMinutes() || effStart.getSeconds() || effStart.getMilliseconds()) {
    effStart.setHours(effStart.getHours() + 1, 0, 0, 0);
  } else {
    effStart.setMinutes(0, 0, 0);
  }
  const effEnd = new Date(end);
  effEnd.setMinutes(0, 0, 0);
  if (effEnd <= effStart) return 0;
  const hours = Math.round((effEnd.getTime() - effStart.getTime()) / 3600000);
  return hours > 0 ? hours : 0;
}

export function overtimePayLabel(segment?: Pick<OvertimeSegment, "payMultiplier" | "dayType"> | null) {
  const multiplier = Number(segment?.payMultiplier || 1);
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
  });
}
