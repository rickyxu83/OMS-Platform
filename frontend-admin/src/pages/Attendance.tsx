import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, ExternalLink, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Settings2, ShieldCheck, Trash2, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorToast } from "@/components/ErrorToast";
import { ServiceOrderDetailDialog } from "@/components/ServiceOrderDetailDialog";
import { AttendanceDuty } from "@/pages/AttendanceDuty";
import { AttendanceApplyDrawer } from "@/pages/AttendanceApplyDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { mergeServiceOrderApprovalDetail, type ServiceOrderDetailFile, type ServiceOrderDetailItem } from "@/lib/service-order-detail";
import { api } from "@/services/api";

export type RequestType = "leave" | "overtime" | "comp_time";
export type AnnualLeavePeriod = "morning" | "afternoon" | "day";
type AttendanceTab = "approve" | "records" | "employees" | "settings" | "duty";

export interface ServiceOrderSummary extends ServiceOrderDetailItem {
  serviceAt?: string | null;
  unavailable?: boolean;
}

interface AttendanceRequest {
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
  overtimeKind?: string | null;
  overtimeResult?: string | null;
  overtimeDayType?: string | null;
  overtimePayMultiplier?: number | null;
  sourceType?: string | null;
  sourceId?: number | string | null;
  sourceDetail?: string | null;
  serviceOrder?: ServiceOrderSummary | null;
  startAt?: string;
  endAt?: string;
  hours?: number;
  workingDays?: number | null;
  proofFileCount?: number;
  proofFiles?: Array<{ id: number | string; originalName: string; mimeType?: string; size?: number }>;
  approvals?: ApprovalStep[];
  status?: string;
}

interface ApprovalStep {
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

interface EmployeeDraft {
  employeeName: string;
  nationality: string;
  hireDate: string;
  leaveDate: string;
  attendanceEnabled: boolean;
  annualLeaveRule: string;
}

interface ProofPreview {
  url: string;
  originalName: string;
  mimeType: string;
}

interface AdjustDraft {
  balanceType: "comp_time" | "annual_leave";
  amount: string;
  note: string;
}

interface MonthlyReportItem {
  employeeId: number | string;
  employeeName?: string;
  annualLeaveDays?: number;
  annualLeaveHours?: number;
  sickLeaveHours?: number;
  personalLeaveHours?: number;
  marriageLeaveHours?: number;
  bereavementLeaveHours?: number;
  overtimeHours?: number;
  overtimeToCompHours?: number;
  overtimeToPayHours?: number;
  legalHolidayOvertimePayHours?: number;
  overtimePayWeightedHours?: number;
  compTimeUsedHours?: number;
  annualLeaveBalanceDays?: number;
  annualLeaveBalanceHours?: number;
  compTimeBalanceHours?: number;
}

interface RoleOption {
  role: string;
  label: string;
}

interface ApprovalRoleRuleStep {
  stepOrder: number;
  approverRole: string;
  approverRoleLabel?: string;
}

interface ApprovalRoleRule {
  applicantRole: string;
  applicantRoleLabel?: string;
  steps: ApprovalRoleRuleStep[];
}

interface ApprovalRoleRulePayload {
  roles?: RoleOption[];
  items?: ApprovalRoleRule[];
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

const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: "请假",
  overtime: "加班",
  comp_time: "调休",
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "特休",
  sick: "病假",
  personal: "事假",
  marriage: "婚假",
  bereavement: "丧假",
};

const OVERTIME_KIND_LABELS: Record<string, string> = {
  travel: "来回路上实际",
  work: "实际工作时间",
};

const OVERTIME_RESULT_LABELS: Record<string, string> = {
  comp_time: "转调休",
  pay: "加班费",
};

export const OVERTIME_DAY_TYPE_LABELS: Record<string, string> = {
  workday: "工作日",
  rest_day: "休息日",
  legal_holiday: "法定节假日",
};

const HOLIDAY_SOURCE_LABELS: Record<string, string> = {
  builtin: "内置",
  manual: "手动",
  auto: "自动",
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

const STATUS_LABELS: Record<string, string> = {
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline"> = {
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

const ROLE_LABELS: Record<string, string> = {
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

const NATIONALITY_LABELS: Record<string, string> = {
  mainland: "陆籍",
  taiwan: "台籍",
};

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthDateRange(month: string) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return { startDate: "", endDate: "" };
  const endDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return { startDate: `${match[1]}-${match[2]}-01`, endDate: `${match[1]}-${match[2]}-${String(endDay).padStart(2, "0")}` };
}

function todayYear() {
  return new Date().getFullYear().toString();
}

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

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function dateInputValue(value?: string) {
  return String(value || "").slice(0, 10);
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

function annualUsageDays(item?: { annualLeaveDays?: number; annualLeaveHours?: number } | null) {
  if (!item) return 0;
  if (typeof item.annualLeaveDays === "number") return item.annualLeaveDays;
  return Number(item.annualLeaveHours || 0) / 8;
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

function requestDetail(item: AttendanceRequest) {
  if (item.requestType === "leave") return LEAVE_TYPE_LABELS[item.leaveType || ""] || "-";
  if (item.requestType === "overtime") {
    const result = OVERTIME_RESULT_LABELS[item.overtimeResult || ""] || "-";
    const multiplier = item.overtimeResult === "pay" && Number(item.overtimePayMultiplier || 0) > 1
      ? `（${hours(Number(item.overtimePayMultiplier))}倍）`
      : "";
    const dayType = OVERTIME_DAY_TYPE_LABELS[item.overtimeDayType || ""] || "";
    return `${OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-"} / ${result}${multiplier}${dayType ? ` / ${dayType}` : ""}`;
  }
  return "调休";
}

export function overtimePayLabel(segment?: Pick<OvertimeSegment, "payMultiplier" | "dayType"> | null) {
  const multiplier = Number(segment?.payMultiplier || 1);
  return multiplier > 1 ? `加班费（${hours(multiplier)}倍）` : "加班费";
}

function requestTypeLabel(type?: string) {
  return REQUEST_TYPE_LABELS[type || ""] || type || "-";
}

function approvalStepLabel(step?: ApprovalStep) {
  if (!step) return "";
  if (step.stepType === "role") return roleLabel(step.assigneeRole);
  const labels = { delegate: "代理人", supervisor: "主管", hr: "人事", vp: "副总" };
  return labels[step.stepType] || step.stepType;
}

function approvalStepStatus(step?: ApprovalStep) {
  if (!step) return "";
  const labels = { waiting: "等待", pending: "待签核", approved: "已通过", rejected: "已驳回", skipped: "已跳过" };
  return labels[step.status] || step.status;
}

function statusBadge(status?: string) {
  const key = status || "";
  return <Badge variant={STATUS_VARIANT[key] || "secondary"}>{STATUS_LABELS[key] || key || "-"}</Badge>;
}

function roleLabel(role?: string | null) {
  return ROLE_LABELS[role || ""] || role || "-";
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

function createEmployeeDraft(employee: EmployeeProfile): EmployeeDraft {
  return {
    employeeName: String(employee.employeeName || ""),
    nationality: String(employee.nationality || "mainland"),
    hireDate: dateInputValue(employee.hireDate),
    leaveDate: dateInputValue(employee.leaveDate),
    attendanceEnabled: employee.attendanceEnabled !== false,
    annualLeaveRule: String(employee.annualLeaveRule || employee.nationality || "mainland"),
  };
}

function createAdjustDraft(): AdjustDraft {
  return { balanceType: "comp_time", amount: "", note: "" };
}

export function Attendance() {
  const { hasPermission } = useAuth();
  const canApply = hasPermission("attendance.apply");
  const canApprove = hasPermission("attendance.approve");
  const canViewAll = hasPermission("attendance.view", "attendance.admin.approve", "attendance.hr.approve", "attendance.vp.approve", "attendance.manage");
  const canExportReport = hasPermission("attendance.report.export");
  const canManage = hasPermission("attendance.manage");
  const canAdminApprove = hasPermission("attendance.admin.approve");
  const canViewDuty = hasPermission("attendance.duty.manage", "attendance.duty.admin.approve");
  const [activeTab, setActiveTab] = useState<AttendanceTab>("approve");
  const [recordView, setRecordView] = useState<"detail" | "summary">("detail");
  const [applyOpen, setApplyOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [supervisorTodo, setSupervisorTodo] = useState<AttendanceRequest[]>([]);
  const [allRequests, setAllRequests] = useState<AttendanceRequest[]>([]);
  const [myProfile, setMyProfile] = useState<EmployeeProfile | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [proofPreview, setProofPreview] = useState<ProofPreview | null>(null);
  const [proofImageSize, setProofImageSize] = useState<{ width: number; height: number } | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [approvalRoleRules, setApprovalRoleRules] = useState<ApprovalRoleRule[]>([]);
  const [approvalRoleDrafts, setApprovalRoleDrafts] = useState<Record<string, string[]>>({});
  const [approvalRoleRulesSaving, setApprovalRoleRulesSaving] = useState(false);
  const [employeeDialog, setEmployeeDialog] = useState<{ employee: EmployeeProfile; draft: EmployeeDraft } | null>(null);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [adjustDialog, setAdjustDialog] = useState<{ employee: EmployeeProfile; draft: AdjustDraft } | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  // 点击工单号先显示申请快照，再加载完整工单详情；申请时的核心事实仍以快照为准。
  const [previewOrder, setPreviewOrder] = useState<ServiceOrderSummary | null>(null);
  const [previewOrderLoading, setPreviewOrderLoading] = useState(false);
  const [previewOrderError, setPreviewOrderError] = useState("");
  const [previewOrderFileId, setPreviewOrderFileId] = useState<string | number | null>(null);
  const previewOrderRequestRef = useRef(0);
  const [recordStatus, setRecordStatus] = useState("all");
  const [recordType, setRecordType] = useState("all");
  const [recordKeyword, setRecordKeyword] = useState("");
  const [reportMonth, setReportMonth] = useState(todayMonth());
  const [reportItems, setReportItems] = useState<MonthlyReportItem[]>([]);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [reportExportMode, setReportExportMode] = useState<"month" | "range">("month");
  const [reportExportMonth, setReportExportMonth] = useState(todayMonth());
  const [reportExportStartDate, setReportExportStartDate] = useState(monthDateRange(todayMonth()).startDate);
  const [reportExportEndDate, setReportExportEndDate] = useState(monthDateRange(todayMonth()).endDate);
  const [reportExportEmployeeIds, setReportExportEmployeeIds] = useState<string[]>([]);
  const [reportExporting, setReportExporting] = useState(false);
  const [holidayYear, setHolidayYear] = useState(todayYear());
  const [applicationHolidays, setApplicationHolidays] = useState<LegalHolidayItem[]>([]);
  const [legalHolidays, setLegalHolidays] = useState<LegalHolidayItem[]>([]);
  const [holidayDraft, setHolidayDraft] = useState({ date: dateValue(), name: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const calls: Array<Promise<any>> = [
        api.get("/attendance/me").catch(() => ({ item: null })),
        api.get("/attendance/requests?scope=mine"),
        api.get("/attendance/requests?scope=supervisor"),
        api.get("/attendance/legal-holidays"),
      ];
      if (canViewAll) {
        calls.push(api.get("/attendance/requests?scope=all"));
        calls.push(api.get("/attendance/employees"));
        calls.push(api.get(`/attendance/reports/monthly?month=${reportMonth}`));
        calls.push(api.get("/attendance/approval-role-rules"));
        const holidayQuery = /^\d{4}$/.test(holidayYear) ? `?year=${holidayYear}` : "";
        calls.push(api.get(`/attendance/legal-holidays${holidayQuery}`));
      }
      const [meData, mineData, supervisorData, applicationHolidayData, allData, employeeData, reportData, roleRuleData, holidayData] = await Promise.all(calls);
      setMyProfile((meData?.item || null) as EmployeeProfile | null);
      setMine((mineData?.items || []) as AttendanceRequest[]);
      setSupervisorTodo((supervisorData?.items || []) as AttendanceRequest[]);
      setApplicationHolidays((applicationHolidayData?.items || []) as LegalHolidayItem[]);
      if (canViewAll) {
        const roleRules = (roleRuleData || {}) as ApprovalRoleRulePayload;
        const ruleItems = roleRules.items || [];
        setAllRequests((allData?.items || []) as AttendanceRequest[]);
        setEmployees((employeeData?.items || []) as EmployeeProfile[]);
        setReportItems((reportData?.items || []) as MonthlyReportItem[]);
        setRoleOptions(roleRules.roles || []);
        setApprovalRoleRules(ruleItems);
        setApprovalRoleDrafts(Object.fromEntries(ruleItems.map((item) => [
          item.applicantRole,
          item.steps.map((step) => step.approverRole),
        ])));
        setLegalHolidays((holidayData?.items || []) as LegalHolidayItem[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAll, reportMonth, holidayYear]);


  async function exportAttendanceReport() {
    if (reportExporting) return;
    const range = reportExportMode === "month"
      ? monthDateRange(reportExportMonth)
      : { startDate: reportExportStartDate, endDate: reportExportEndDate };
    if (!range.startDate || !range.endDate) {
      toast.error("请选择完整的统计日期");
      return;
    }
    if (dateIndex(range.endDate) < dateIndex(range.startDate)) {
      toast.error("结束日期不能早于开始日期");
      return;
    }
    if (dateIndex(range.endDate) - dateIndex(range.startDate) + 1 > 366) {
      toast.error("单次统计范围不能超过 366 天");
      return;
    }
    setReportExporting(true);
    try {
      const query = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
      if (reportExportEmployeeIds.length) query.set("employeeIds", reportExportEmployeeIds.join(","));
      const blob = await api.download(`/attendance/reports/export?${query.toString()}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `考勤报表-${range.startDate.replace(/-/g, "")}-${range.endDate.replace(/-/g, "")}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setReportExportOpen(false);
      toast.success("考勤报表已导出");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "考勤报表导出失败");
    } finally {
      setReportExporting(false);
    }
  }

  const pendingMine = useMemo(
    () => mine.filter((item) => ["draft", "pending_delegate", "pending_approval", "pending_supervisor", "pending_hr", "pending_vp", "pending_admin"].includes(item.status || "")).length,
    [mine],
  );
  const supervisorPending = useMemo(
    () => supervisorTodo.filter((item) => ["pending_delegate", "pending_approval", "pending_supervisor", "pending_hr", "pending_vp"].includes(item.status || "")),
    [supervisorTodo],
  );
  const adminPending = useMemo(
    () => (canAdminApprove ? allRequests.filter((item) => item.status === "pending_admin") : []),
    [allRequests, canAdminApprove],
  );
  const approvalTodos = useMemo(() => {
    const seen = new Set(supervisorPending.map((item) => String(item.id)));
    return [...supervisorPending, ...adminPending.filter((item) => !seen.has(String(item.id)))];
  }, [supervisorPending, adminPending]);
  const isApprover = canApprove && (!canApply || canAdminApprove || supervisorPending.length > 0);

  const tabs = useMemo(() => {
    const items: Array<{ key: AttendanceTab; label: string; count?: number }> = [
      { key: "approve", label: canApply ? "申请与审批" : "审批待办", count: approvalTodos.length },
    ];
    if (canViewAll) {
      items.push({ key: "records", label: "记录与报表" });
    }
    if (canManage) items.push({ key: "employees", label: "员工与余额" });
    if (canViewAll) items.push({ key: "settings", label: "考勤设置" });
    if (canViewDuty) items.push({ key: "duty", label: "值班津贴" });
    return items;
  }, [canApply, canViewAll, canManage, canViewDuty, approvalTodos.length]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab("approve");
  }, [tabs, activeTab]);




  async function action(path: string, success: string, body?: any) {
    try {
      await api.post(path, body);
      toast.success(success);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  async function reject(item: AttendanceRequest) {
    const value = window.prompt("请输入驳回原因");
    if (value === null) return;
    const reason = value.trim();
    if (!reason) {
      toast.error("请填写驳回原因");
      return;
    }
    await action(`/attendance/requests/${item.id}/reject`, "已驳回", { reason });
  }

  function closeProofPreview() {
    setProofImageSize(null);
    setProofPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function previewProof(file: { id: number | string; originalName: string; mimeType?: string }) {
    try {
      const blob = await api.download(`/files/${file.id}`);
      const url = URL.createObjectURL(blob);
      setProofImageSize(null);
      setProofPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          url,
          originalName: file.originalName || `proof-${file.id}`,
          mimeType: blob.type || file.mimeType || "application/octet-stream",
        };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "证明预览失败");
    }
  }

  async function openOrderPreview(snapshot: ServiceOrderSummary) {
    const requestId = ++previewOrderRequestRef.current;
    setPreviewOrder(snapshot);
    setPreviewOrderLoading(true);
    setPreviewOrderError("");
    try {
      const data = await api.get(`/service-orders/${snapshot.id}`);
      if (previewOrderRequestRef.current !== requestId) return;
      const detail = (data?.item || data) as ServiceOrderDetailItem;
      setPreviewOrder(mergeServiceOrderApprovalDetail(snapshot, detail) as ServiceOrderSummary);
    } catch (e) {
      if (previewOrderRequestRef.current !== requestId) return;
      const status = (e as Error & { status?: number }).status;
      if (status !== 403) {
        setPreviewOrderError(`${e instanceof Error ? e.message : "完整工单详情加载失败"}；当前显示申请提交时的工单快照。`);
      }
    } finally {
      if (previewOrderRequestRef.current === requestId) setPreviewOrderLoading(false);
    }
  }

  function closeOrderPreview() {
    previewOrderRequestRef.current += 1;
    setPreviewOrder(null);
    setPreviewOrderLoading(false);
    setPreviewOrderError("");
    setPreviewOrderFileId(null);
  }

  async function downloadPreviewOrderFile(file: ServiceOrderDetailFile) {
    if (!file.id || previewOrderFileId) return;
    setPreviewOrderFileId(file.id);
    try {
      const blob = await api.download(`/files/${file.id}`);
      const { saveAs } = await import("file-saver");
      saveAs(blob, file.originalName || `attachment-${file.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "附件下载失败");
    } finally {
      setPreviewOrderFileId(null);
    }
  }

  function setEmployeeDialogDraft(patch: Partial<EmployeeDraft>) {
    setEmployeeDialog((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));
  }

  function setAdjustDialogDraft(patch: Partial<AdjustDraft>) {
    setAdjustDialog((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));
  }

  async function saveEmployee() {
    if (!employeeDialog) return;
    const { employee, draft } = employeeDialog;
    setEmployeeSaving(true);
    try {
      await api.put(`/attendance/employees/${employee.id}`, {
        employeeName: draft.employeeName.trim() || employee.employeeName,
        nationality: draft.nationality || "mainland",
        hireDate: draft.hireDate || null,
        leaveDate: draft.leaveDate || null,
        attendanceEnabled: draft.attendanceEnabled,
        annualLeaveRule: draft.annualLeaveRule || draft.nationality || "mainland",
      });
      toast.success("员工档案已保存");
      setEmployeeDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setEmployeeSaving(false);
    }
  }

  async function submitAdjustBalance() {
    if (!adjustDialog) return;
    const { employee, draft } = adjustDialog;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error(draft.balanceType === "annual_leave" ? "请填写调整天数（正数增加，负数扣减）" : "请填写调整小时数（正数增加，负数扣减）");
      return;
    }
    const annualAdjust = draft.balanceType === "annual_leave";
    setAdjustSaving(true);
    try {
      await api.post(`/attendance/employees/${employee.id}/adjust-balance`, {
        balanceType: draft.balanceType,
        deltaDays: annualAdjust ? amount : undefined,
        deltaHours: annualAdjust ? undefined : amount,
        note: draft.note,
      });
      toast.success("余额已调整");
      setAdjustDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调整失败");
    } finally {
      setAdjustSaving(false);
    }
  }

  function setApprovalRoleStep(applicantRole: string, index: number, approverRole: string) {
    setApprovalRoleDrafts((current) => ({
      ...current,
      [applicantRole]: (current[applicantRole] || []).map((role, stepIndex) => (stepIndex === index ? approverRole : role)),
    }));
  }

  function addApprovalRoleStep(applicantRole: string) {
    setApprovalRoleDrafts((current) => {
      const steps = current[applicantRole] || [];
      const nextRole = roleOptions.find((item) => !steps.includes(item.role))?.role;
      if (!nextRole) return current;
      return { ...current, [applicantRole]: [...steps, nextRole] };
    });
  }

  function moveApprovalRoleStep(applicantRole: string, index: number, direction: -1 | 1) {
    setApprovalRoleDrafts((current) => {
      const steps = [...(current[applicantRole] || [])];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= steps.length) return current;
      [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
      return { ...current, [applicantRole]: steps };
    });
  }

  function removeApprovalRoleStep(applicantRole: string, index: number) {
    setApprovalRoleDrafts((current) => {
      const steps = current[applicantRole] || [];
      if (steps.length <= 1) return current;
      return { ...current, [applicantRole]: steps.filter((_, stepIndex) => stepIndex !== index) };
    });
  }

  async function saveApprovalRoleRules() {
    setApprovalRoleRulesSaving(true);
    try {
      const items = approvalRoleRules.map((item) => {
        const roles = approvalRoleDrafts[item.applicantRole] || [];
        if (!roles.length) throw new Error(`${item.applicantRoleLabel || roleLabel(item.applicantRole)}的审批链不能为空`);
        if (new Set(roles).size !== roles.length) throw new Error(`${item.applicantRoleLabel || roleLabel(item.applicantRole)}的审批角色不能重复`);
        return {
          applicantRole: item.applicantRole,
          steps: roles.map((approverRole, index) => ({ stepOrder: index + 1, approverRole })),
        };
      });
      await api.put("/attendance/approval-role-rules", { items });
      toast.success("审批角色规则已保存");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setApprovalRoleRulesSaving(false);
    }
  }

  async function saveLegalHoliday() {
    const date = holidayDraft.date;
    const name = holidayDraft.name.trim();
    if (!date || !name) {
      toast.error("请填写节假日日期和名称");
      return;
    }
    try {
      await api.put(`/attendance/legal-holidays/${encodeURIComponent(date)}`, { name, source: "manual" });
      toast.success("法定节假日已保存");
      setHolidayDraft({ date, name: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function disableLegalHoliday(item: LegalHolidayItem) {
    if (!window.confirm(`停用 ${item.date} ${item.name}？`)) return;
    try {
      await api.delete(`/attendance/legal-holidays/${encodeURIComponent(item.date)}`);
      toast.success("法定节假日已停用");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "停用失败");
    }
  }

  async function enableLegalHoliday(item: LegalHolidayItem) {
    try {
      await api.put(`/attendance/legal-holidays/${encodeURIComponent(item.date)}`, { name: item.name, source: item.source || "manual" });
      toast.success("法定节假日已启用");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "启用失败");
    }
  }

  const hasRecordFilter = recordStatus !== "all" || recordType !== "all" || recordKeyword.trim() !== "";
  const filteredAllRequests = useMemo(() => {
    const keyword = recordKeyword.trim().toLowerCase();
    return allRequests.filter((item) => {
      if (recordStatus === "pending") {
        if (!String(item.status || "").startsWith("pending_")) return false;
      } else if (recordStatus !== "all" && item.status !== recordStatus) return false;
      if (recordType !== "all" && item.requestType !== recordType) return false;
      if (keyword && !String(item.employeeName || "").toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [allRequests, recordStatus, recordType, recordKeyword]);
  const recordApprovedCount = filteredAllRequests.filter((item) => item.status === "approved").length;
  const activeEmployeeCount = employees.filter((item) => item.attendanceEnabled !== false).length;
  const totalCompBalanceHours = employees.reduce((sum, item) => sum + Number(item.compTimeBalanceHours || 0), 0);
  const approvalRoleStepCount = approvalRoleRules.reduce(
    (sum, item) => sum + (approvalRoleDrafts[item.applicantRole]?.length || item.steps.length),
    0,
  );

  const applicationHolidayDates = useMemo(
    () => new Set(applicationHolidays.filter((item) => item.active !== false).map((item) => item.date)),
    [applicationHolidays],
  );


  const statTiles = [
    ...(canApply ? [
      { label: "可用特休", value: `${days(annualBalanceDays(myProfile))} 天` },
      { label: "可用调休", value: `${hours(myProfile?.compTimeBalanceHours)} 小时` },
      { label: "我的进行中", value: String(pendingMine) },
    ] : []),
    ...(isApprover ? [{ label: "待我审批", value: String(approvalTodos.length) }] : []),
  ];
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">考勤管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">请假、加班、调休申请与月度汇总</p>
        </div>
        <div className="flex items-center gap-2">
          {canApply ? (
            <Button onClick={() => setApplyOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新建申请
            </Button>
          ) : null}
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      <ErrorToast message={error} />

      {tabs.length > 1 ? (
        <div className="flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" && tab.count > 0 ? (
                  <Badge variant={active ? "default" : "secondary"} className="h-5 min-w-5 px-1.5">{tab.count}</Badge>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeTab === "approve" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border bg-card px-5 py-3 text-sm">
            {statTiles.map((stat) => (
              <span key={stat.label} className="flex items-center gap-1.5 text-muted-foreground">
                {stat.label}
                <b className="font-semibold text-foreground">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : stat.value}</b>
              </span>
            ))}
          </div>

          {isApprover ? (
            <RequestList
              title="待我审批"
              description="代理确认与当前角色审批待办集中在这里处理"
              items={approvalTodos}
              loading={loading}
              onDownloadProof={previewProof}
              onPreviewOrder={openOrderPreview}
              emptyText="暂无待审批的申请"
              actions={(item) => {
                const config: Record<string, { path: string; success: string }> = {
                  pending_delegate: { path: "approve-delegate", success: "代理人已通过" },
                  pending_approval: { path: "approve", success: "当前审批步骤已通过" },
                  pending_supervisor: { path: "approve-supervisor", success: "主管已通过" },
                  pending_hr: { path: "approve-hr", success: "人事已通过" },
                  pending_vp: { path: "approve-vp", success: "副总已通过" },
                };
                const current = config[item.status || ""];
                if (current) return (
                  <>
                    <Button size="sm" onClick={() => action(`/attendance/requests/${item.id}/${current.path}`, current.success)}>
                      <Check className="mr-1 h-4 w-4" /> 通过
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(item)}>
                      <X className="mr-1 h-4 w-4" /> 驳回
                    </Button>
                  </>
                );
                if (item.status === "pending_admin" && canAdminApprove) return (
                  <>
                    <Button size="sm" onClick={() => action(`/attendance/requests/${item.id}/approve-admin`, "行政终审已通过")}>
                      <ShieldCheck className="mr-1 h-4 w-4" /> 终审通过
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(item)}>
                      <X className="mr-1 h-4 w-4" /> 驳回
                    </Button>
                  </>
                );
                return null;
              }}
            />
          ) : null}

          {canApply ? <RequestList
            title="我的申请"
            description="最终审批前可撤回"
            items={mine}
            loading={loading}
            onDownloadProof={previewProof}
            onPreviewOrder={openOrderPreview}
            showEmployee={false}
            actions={(item) => ["draft", "pending_delegate", "pending_approval", "pending_supervisor", "pending_hr", "pending_vp", "pending_admin"].includes(item.status || "") ? (
              <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/withdraw`, "已撤回")}>
                <RotateCcw className="mr-1 h-4 w-4" /> 撤回
              </Button>
            ) : null}
          /> : null}
        </div>
      ) : null}

      {activeTab === "records" && canViewAll ? (
        <div className="space-y-5">
          <div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
            <button
              type="button"
              onClick={() => setRecordView("detail")}
              className={`h-8 rounded-md px-4 font-medium transition ${recordView === "detail" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >申请明细</button>
            <button
              type="button"
              onClick={() => setRecordView("summary")}
              className={`h-8 rounded-md px-4 font-medium transition ${recordView === "summary" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >月度汇总</button>
          </div>
          {recordView === "detail" ? (<>
            <RequestList
              title="申请明细"
              description="全员全部类型申请记录，审批通过后可作废"
              items={filteredAllRequests}
              loading={loading}
              onDownloadProof={previewProof}
              onPreviewOrder={openOrderPreview}
              emptyText={hasRecordFilter ? "没有符合筛选条件的记录" : "暂无记录"}
              toolbar={(<>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { key: "all", label: "全部", count: allRequests.length },
                    { key: "pending", label: "审批中", count: allRequests.filter((item) => String(item.status || "").startsWith("pending_")).length },
                    { key: "approved", label: "已通过", count: allRequests.filter((item) => item.status === "approved").length },
                    { key: "rejected", label: "已驳回", count: allRequests.filter((item) => item.status === "rejected").length },
                    { key: "voided", label: "已作废", count: allRequests.filter((item) => item.status === "voided").length },
                  ].map((chip) => {
                    const active = recordStatus === chip.key;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setRecordStatus(chip.key)}
                        className={active
                          ? "flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                          : "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted/50"}
                      >
                        {chip.label}
                        <span className={active ? "font-semibold" : ""}>{chip.count}</span>
                      </button>
                    );
                  })}
                  <Select value={recordType} onValueChange={setRecordType}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                    <Input className="h-8 w-44 pl-9" placeholder="搜索员工姓名" value={recordKeyword} onChange={(event) => setRecordKeyword(event.target.value)} />
                  </div>
                  {hasRecordFilter ? <Button variant="ghost" size="sm" onClick={() => { setRecordStatus("all"); setRecordType("all"); setRecordKeyword(""); }}>重置</Button> : null}
                </div>
              </>)}
              actions={canAdminApprove ? (item) => item.status === "approved" ? (
                <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/void`, "已作废")}><X className="mr-1 h-4 w-4" /> 作废</Button>
              ) : null : undefined}
            />
          </>) : (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>月度汇总</CardTitle>
                <CardDescription>横向比较员工各类假勤与当前余额，加班费折算等财务明细请用导出</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input type="month" className="w-40" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
                {canExportReport ? (
                  <Button onClick={() => {
                    setReportExportMonth(reportMonth);
                    const range = monthDateRange(reportMonth);
                    setReportExportStartDate(range.startDate);
                    setReportExportEndDate(range.endDate);
                    setReportExportOpen(true);
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    导出报表
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>员工</TableHead>
                    <TableHead>特休</TableHead>
                    <TableHead>病假</TableHead>
                    <TableHead>事假</TableHead>
                    <TableHead>其他假</TableHead>
                    <TableHead>加班·转调休</TableHead>
                    <TableHead>加班·付费</TableHead>
                    <TableHead>调休使用</TableHead>
                    <TableHead>特休余额</TableHead>
                    <TableHead>调休余额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportItems.map((item) => (
                    <TableRow key={item.employeeId}>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>{days(annualUsageDays(item))} 天</TableCell>
                      <TableCell>{hours(item.sickLeaveHours)}</TableCell>
                      <TableCell>{hours(item.personalLeaveHours)}</TableCell>
                      <TableCell>{hours(Number(item.marriageLeaveHours || 0) + Number(item.bereavementLeaveHours || 0))}</TableCell>
                      <TableCell>{hours(item.overtimeToCompHours)}</TableCell>
                      <TableCell>{hours(item.overtimeToPayHours)}</TableCell>
                      <TableCell>{hours(item.compTimeUsedHours)}</TableCell>
                      <TableCell>{days(annualBalanceDays(item))} 天</TableCell>
                      <TableCell>{hours(item.compTimeBalanceHours)}</TableCell>
                    </TableRow>
                  ))}
                  {reportItems.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">暂无数据</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          )}
        </div>
      ) : null}

      {activeTab === "employees" && canManage ? (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>余额控制台</CardTitle>
                <CardDescription>集中查看员工档案状态、特休余额与调休余额</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">考勤员工 {activeEmployeeCount} 人</Badge>
                <Badge variant="secondary">调休余额池 {hours(totalCompBalanceHours)} 小时</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>员工</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>籍别 / 入职</TableHead>
                    <TableHead>特休余额</TableHead>
                    <TableHead>调休余额</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="font-medium">{employee.employeeName || "-"}</div>
                        <div className="text-xs text-muted-foreground">{employee.username || "-"} · {roleLabel(employee.role)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.attendanceEnabled === false ? "outline" : "success"}>
                          {employee.attendanceEnabled === false ? "停用" : "启用"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>{NATIONALITY_LABELS[employee.nationality || "mainland"] || employee.nationality || "-"}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(employee.hireDate)} 入职</div>
                      </TableCell>
                      <TableCell><span className="text-base font-semibold">{days(annualBalanceDays(employee))}</span><span className="ml-1 text-xs text-muted-foreground">天</span></TableCell>
                      <TableCell><span className="text-base font-semibold">{hours(employee.compTimeBalanceHours)}</span><span className="ml-1 text-xs text-muted-foreground">小时</span></TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEmployeeDialog({ employee, draft: createEmployeeDraft(employee) })}>
                            <Pencil className="mr-1 h-4 w-4" /> 编辑
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAdjustDialog({ employee, draft: createAdjustDraft() })}>
                            <Wallet className="mr-1 h-4 w-4" /> 调余额
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {loading ? "正在加载…" : "暂无员工档案"}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "settings" && canViewAll ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">考勤设置</h2>
              <p className="mt-1 text-sm text-muted-foreground">按影响范围管理审批流程与工作日历</p>
            </div>
            <Badge variant="outline"><Settings2 className="mr-1 h-3.5 w-3.5" />配置总览</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <AttendanceMetric label="审批流程" value={`${approvalRoleRules.length} 条`} note={`${approvalRoleStepCount} 个审批步骤`} icon={<ShieldCheck className="h-4 w-4" />} />
            <AttendanceMetric label="启用节日" value={`${legalHolidays.filter((item) => item.active !== false).length} 个`} note={`${holidayYear} 年工作日历`} icon={<CalendarDays className="h-4 w-4" />} />
            <AttendanceMetric label="余额换算" value="8 小时" note="标准工作日换算基准" icon={<Wallet className="h-4 w-4" />} />
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
          {canManage ? (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>审批角色规则</CardTitle>
                    <CardDescription>每个申请人角色可配置一条按顺序执行的多级审批链；请假满 3 天时，运营负责人自动作为最后一级审批</CardDescription>
                  </div>
                  <Button size="sm" onClick={saveApprovalRoleRules} disabled={approvalRoleRulesSaving}>
                    {approvalRoleRulesSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} 保存规则
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                      {approvalRoleRules.map((rule) => {
                        const steps = approvalRoleDrafts[rule.applicantRole] || rule.steps.map((step) => step.approverRole);
                        return (
                          <div key={rule.applicantRole} className="space-y-3 rounded-lg border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{rule.applicantRoleLabel || roleLabel(rule.applicantRole)}</Badge>
                                <span className="text-xs text-muted-foreground">提交后依次审批</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{steps.length} 级</span>
                            </div>
                            <div className="space-y-2">
                              {steps.map((approverRole, index) => (
                                <div key={`${rule.applicantRole}-${index}`} className="flex flex-col gap-2 rounded-md bg-muted/30 p-2.5 sm:flex-row sm:items-center">
                                  <Badge variant="outline" className="w-fit shrink-0">第 {index + 1} 级</Badge>
                                  <Select value={approverRole} onValueChange={(value) => setApprovalRoleStep(rule.applicantRole, index, value)}>
                                    <SelectTrigger className="w-full sm:min-w-48 sm:flex-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {roleOptions.map((item) => (
                                        <SelectItem
                                          key={item.role}
                                          value={item.role}
                                          disabled={steps.some((role, stepIndex) => stepIndex !== index && role === item.role)}
                                        >
                                          {item.label || roleLabel(item.role)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <div className="flex items-center gap-1 self-end sm:self-auto">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      title="上移"
                                      disabled={index === 0}
                                      onClick={() => moveApprovalRoleStep(rule.applicantRole, index, -1)}
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      title="下移"
                                      disabled={index === steps.length - 1}
                                      onClick={() => moveApprovalRoleStep(rule.applicantRole, index, 1)}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      title="删除步骤"
                                      disabled={steps.length <= 1}
                                      onClick={() => removeApprovalRoleStep(rule.applicantRole, index)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addApprovalRoleStep(rule.applicantRole)}
                              disabled={steps.length >= roleOptions.length}
                            >
                              <Plus className="mr-1 h-4 w-4" /> 添加步骤
                            </Button>
                          </div>
                        );
                      })}
                      {approvalRoleRules.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">暂无审批角色规则</div>
                      ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>法定节假日</CardTitle>
                  <CardDescription>启用状态会影响加班类型和 3 倍加班费折算</CardDescription>
                </div>
                <div className="w-36 space-y-2">
                  <Label>年份</Label>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={holidayYear}
                    onChange={(event) => setHolidayYear(event.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage ? (
                <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
                  <div className="space-y-2">
                    <Label>日期</Label>
                    <Input
                      type="date"
                      value={holidayDraft.date}
                      onChange={(event) => setHolidayDraft((current) => ({ ...current, date: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>名称</Label>
                    <Input
                      value={holidayDraft.name}
                      onChange={(event) => setHolidayDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="如：国庆节"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={saveLegalHoliday}>
                      <Plus className="mr-1 h-4 w-4" /> 保存
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legalHolidays.map((item) => (
                      <TableRow key={item.date}>
                        <TableCell className="font-medium">{item.date}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{HOLIDAY_SOURCE_LABELS[item.source] || item.source || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.active === false ? "outline" : "success"}>{item.active === false ? "停用" : "启用"}</Badge>
                        </TableCell>
                        <TableCell>
                          {canManage ? (
                            item.active === false ? (
                              <Button size="sm" variant="outline" onClick={() => enableLegalHoliday(item)}>
                                <Check className="mr-1 h-4 w-4" /> 启用
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => disableLegalHoliday(item)}>
                                <Trash2 className="mr-1 h-4 w-4" /> 停用
                              </Button>
                            )
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {legalHolidays.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无法定节假日</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "duty" && canViewDuty ? (
        <AttendanceDuty embedded />
      ) : null}

      <AttendanceApplyDrawer
        open={applyOpen}
        onOpenChange={setApplyOpen}
        onSubmitted={load}
        myProfile={myProfile}
        holidayDates={applicationHolidayDates}
      />

      <ServiceOrderDetailDialog
        order={previewOrder}
        loading={previewOrderLoading}
        error={previewOrderError}
        downloadingFileId={previewOrderFileId}
        onDownloadFile={downloadPreviewOrderFile}
        onClose={closeOrderPreview}
        summaryTypeLabel={previewOrder ? serviceOrderTypeLabel(previewOrder) : undefined}
      />

      <Dialog open={Boolean(proofPreview)} onOpenChange={(open) => { if (!open) closeProofPreview(); }}>
        <DialogContent className="flex h-[88vh] max-w-[min(96vw,1100px)] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>证明附件预览</DialogTitle>
            <DialogDescription className="truncate">{proofPreview?.originalName || "-"}</DialogDescription>
          </DialogHeader>
          {proofPreview ? (
            <div className="min-h-0 flex-1 bg-muted/30 p-4">
              {proofPreview.mimeType.startsWith("image/") ? (
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
                    <div className="text-xs text-muted-foreground">
                      适应窗口
                      {proofImageSize ? ` · ${proofImageSize.width} × ${proofImageSize.height}` : ""}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={proofPreview.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />在新窗口查看原图
                      </a>
                    </Button>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
                    <a
                      href={proofPreview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full w-full items-center justify-center"
                      title="在新窗口查看原图"
                    >
                      <img
                        src={proofPreview.url}
                        alt={proofPreview.originalName}
                        onLoad={(event) => setProofImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                        className="max-h-full max-w-full cursor-zoom-in object-contain"
                      />
                    </a>
                  </div>
                </div>
              ) : proofPreview.mimeType === "application/pdf" || proofPreview.mimeType.startsWith("text/") ? (
                <iframe title={proofPreview.originalName} src={proofPreview.url} className="h-full w-full rounded-lg border bg-background" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border bg-background px-6 text-center">
                  <div>
                    <div className="font-medium">浏览器无法直接预览此文件格式</div>
                    <div className="mt-1 text-sm text-muted-foreground">{proofPreview.mimeType || "未知格式"}</div>
                  </div>
                  <Button asChild>
                    <a href={proofPreview.url} download={proofPreview.originalName}>下载原文件</a>
                  </Button>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter className="border-t px-5 py-3">
            <Button variant="outline" onClick={closeProofPreview}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(employeeDialog)} onOpenChange={(open) => { if (!open) setEmployeeDialog(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>编辑员工档案</DialogTitle>
            <DialogDescription>
              {employeeDialog ? `${employeeDialog.employee.employeeName || "-"}（${employeeDialog.employee.username || "-"} · ${roleLabel(employeeDialog.employee.role)}）` : ""}
            </DialogDescription>
          </DialogHeader>
          {employeeDialog ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>姓名</Label>
                <Input
                  value={employeeDialog.draft.employeeName}
                  onChange={(event) => setEmployeeDialogDraft({ employeeName: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>籍别</Label>
                <Select
                  value={employeeDialog.draft.nationality}
                  onValueChange={(value) => setEmployeeDialogDraft({ nationality: value, annualLeaveRule: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mainland">陆籍</SelectItem>
                    <SelectItem value="taiwan">台籍</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>入职日期</Label>
                  <Input
                    type="date"
                    value={employeeDialog.draft.hireDate}
                    onChange={(event) => setEmployeeDialogDraft({ hireDate: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>离职日期</Label>
                  <Input
                    type="date"
                    value={employeeDialog.draft.leaveDate}
                    onChange={(event) => setEmployeeDialogDraft({ leaveDate: event.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">参与考勤</div>
                  <div className="text-xs text-muted-foreground">停用后该员工暂不纳入考勤管理</div>
                </div>
                <Switch
                  checked={employeeDialog.draft.attendanceEnabled}
                  onCheckedChange={(checked) => setEmployeeDialogDraft({ attendanceEnabled: checked })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployeeDialog(null)} disabled={employeeSaving}>取消</Button>
            <Button onClick={saveEmployee} disabled={employeeSaving}>
              {employeeSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustDialog)} onOpenChange={(open) => { if (!open) setAdjustDialog(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>调整余额</DialogTitle>
            <DialogDescription>
              {adjustDialog ? `${adjustDialog.employee.employeeName || "-"} · 特休 ${days(annualBalanceDays(adjustDialog.employee))} 天 / 调休 ${hours(adjustDialog.employee.compTimeBalanceHours)} 小时` : ""}
            </DialogDescription>
          </DialogHeader>
          {adjustDialog ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>余额类型</Label>
                <Select
                  value={adjustDialog.draft.balanceType}
                  onValueChange={(value) => setAdjustDialogDraft({ balanceType: value as AdjustDraft["balanceType"], amount: "" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comp_time">调休（按小时）</SelectItem>
                    <SelectItem value="annual_leave">特休（按天）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{adjustDialog.draft.balanceType === "annual_leave" ? "调整天数" : "调整小时数"}</Label>
                <div className="flex flex-wrap gap-2">
                  {["0.5", "1", "-0.5", "-1"].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={adjustDialog.draft.amount === preset ? "default" : "outline"}
                      onClick={() => setAdjustDialogDraft({ amount: preset })}
                    >
                      {Number(preset) > 0 ? `+${preset}` : preset}{adjustDialog.draft.balanceType === "annual_leave" ? "天" : "小时"}
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="正数增加，负数扣减"
                  value={adjustDialog.draft.amount}
                  onChange={(event) => setAdjustDialogDraft({ amount: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Input
                  placeholder="备注（可选）"
                  value={adjustDialog.draft.note}
                  onChange={(event) => setAdjustDialogDraft({ note: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(null)} disabled={adjustSaving}>取消</Button>
            <Button onClick={submitAdjustBalance} disabled={adjustSaving}>
              {adjustSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              确认调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportExportOpen} onOpenChange={(open) => { if (!reportExporting) setReportExportOpen(open); }}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>导出考勤报表</DialogTitle>
            <DialogDescription>生成包含请假统计、加班统计和假期余额的 Excel 文件，仅统计已通过申请。</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>统计方式</Label>
              <Select value={reportExportMode} onValueChange={(value) => setReportExportMode(value as "month" | "range")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">按月统计</SelectItem>
                  <SelectItem value="range">自定义日期范围</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reportExportMode === "month" ? (
              <div className="space-y-2">
                <Label>月份</Label>
                <Input type="month" value={reportExportMonth} onChange={(event) => setReportExportMonth(event.target.value)} />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>开始日期</Label>
                  <Input type="date" value={reportExportStartDate} onChange={(event) => setReportExportStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>结束日期</Label>
                  <Input type="date" value={reportExportEndDate} onChange={(event) => setReportExportEndDate(event.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>员工范围</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setReportExportEmployeeIds([])} disabled={!reportExportEmployeeIds.length}>全部员工</Button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {employees.map((employee) => {
                  const id = String(employee.id);
                  const checked = reportExportEmployeeIds.includes(id);
                  const status = employee.leaveDate ? "离职" : employee.attendanceEnabled === false ? "停用" : "在职";
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={checked}
                        onChange={(event) => setReportExportEmployeeIds((current) => event.target.checked
                          ? [...current, id]
                          : current.filter((item) => item !== id))}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{employee.employeeName || `员工 #${id}`}</span>
                      <Badge variant={status === "在职" ? "success" : "outline"}>{status}</Badge>
                    </label>
                  );
                })}
                {employees.length === 0 ? <div className="py-5 text-center text-sm text-muted-foreground">暂无员工档案</div> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {reportExportEmployeeIds.length ? `已选择 ${reportExportEmployeeIds.length} 人` : "未选择时导出全部符合统计范围的员工"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportExportOpen(false)} disabled={reportExporting}>取消</Button>
            <Button onClick={exportAttendanceReport} disabled={reportExporting}>
              {reportExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {reportExporting ? "生成中…" : "导出 Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function serviceOrderTypeLabel(order: ServiceOrderSummary) {
  const mode = SERVICE_MODE_LABELS[order.serviceMode || ""] || order.serviceMode || "-";
  const type = SERVICE_TYPE_LABELS[order.serviceType || ""] || order.serviceType || "-";
  return `${mode} / ${type}`;
}

function ServiceOrderApprovalSummary({ order, onPreview }: { order: ServiceOrderSummary; onPreview?: (order: ServiceOrderSummary) => void }) {
  const orderLabel = order.orderNo || `#${order.id}`;
  if (order.unavailable) {
    return (
      <div className="mt-2 rounded-md border border-dashed bg-muted/10 px-3 py-2 text-xs text-muted-foreground break-words">
        关联工单 {orderLabel} 暂不可用
      </div>
    );
  }
  return (
    <div className="mt-2 min-w-0 rounded-md border bg-muted/10 p-3 text-xs">
      <div className="grid min-w-0 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
        <div className="min-w-0 break-words">
          <span className="font-medium text-foreground">工单：</span>
          {onPreview ? (
            <button
              type="button"
              onClick={() => onPreview(order)}
              className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {orderLabel}
            </button>
          ) : orderLabel}
        </div>
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">客户：</span>{order.customerName || "-"}</div>
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">设备：</span>{order.deviceName || "-"}</div>
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">类型：</span>{serviceOrderTypeLabel(order)}</div>
        <div className="min-w-0 break-words sm:col-span-2"><span className="font-medium text-foreground">问题：</span>{order.issueDescription || "-"}</div>
      </div>
    </div>
  );
}


function AttendanceMetric({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return (
    <Card className="gap-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span>{icon}</div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{note}</div>
      </CardContent>
    </Card>
  );
}

function RequestList({
  title,
  description,
  items,
  loading,
  actions,
  showEmployee = true,
  emptyText = "暂无记录",
  toolbar,
  onDownloadProof,
  onPreviewOrder,
}: {
  title: string;
  description: string;
  items: AttendanceRequest[];
  loading: boolean;
  actions?: (item: AttendanceRequest) => ReactNode;
  showEmployee?: boolean;
  emptyText?: string;
  toolbar?: ReactNode;
  onDownloadProof?: (file: { id: number | string; originalName: string; mimeType?: string }) => void;
  onPreviewOrder?: (order: ServiceOrderSummary) => void;
}) {
  const hasActions = typeof actions === "function";
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge variant="secondary">{items.length} 条</Badge>
      </CardHeader>
      <CardContent>
        {toolbar ? <div className="mb-4 flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在加载…
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  {showEmployee ? <TableHead>员工</TableHead> : null}
                  <TableHead>类型</TableHead>
                  <TableHead>明细</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>小时</TableHead>
                  <TableHead>状态</TableHead>
                  {hasActions ? <TableHead>操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    {showEmployee ? <TableCell className="font-medium">{item.employeeName || "-"}</TableCell> : null}
                    <TableCell>{requestTypeLabel(item.requestType)}</TableCell>
                    <TableCell>
                      <div>{requestDetail(item)}</div>
                      {item.requestType === "overtime" && item.sourceType === "service_order" ? (
                        <ServiceOrderApprovalSummary
                          order={item.serviceOrder || { id: item.sourceId || "-", unavailable: true }}
                          onPreview={onPreviewOrder}
                        />
                      ) : null}
                      {item.delegateEmployeeName ? <div className="text-xs text-muted-foreground">代理人：{item.delegateEmployeeName}</div> : null}
                      {typeof item.workingDays === "number" ? <div className="text-xs text-muted-foreground">{days(item.workingDays)} 个工作日</div> : null}
                      {item.proofFiles?.length ? (
                        <div className="text-xs text-muted-foreground">
                          证明：{item.proofFiles.map((file, index) => (
                            <span key={file.id}>
                              {index ? "、" : ""}
                              <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => onDownloadProof?.(file)}>
                                {file.originalName || `附件 #${file.id}`}
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : item.proofFileCount ? <div className="text-xs text-muted-foreground">证明附件：{item.proofFileCount} 份</div> : null}
                      {item.approvals?.length ? (
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.approvals.map((step) => (
                            <div key={step.id}>
                              {approvalStepLabel(step)}：{approvalStepStatus(step)}
                              {step.assigneeEmployeeName ? `（${step.assigneeEmployeeName}）` : step.stepType !== "role" && step.assigneeRole ? `（${roleLabel(step.assigneeRole)}）` : ""}
                              {step.approvedByName ? ` · ${step.approvedByName}` : ""}
                              {step.approvedAt ? ` · ${formatDateTime(step.approvedAt)}` : ""}
                              {step.rejectedByName ? ` · ${step.rejectedByName}` : ""}
                              {step.rejectedAt ? ` · ${formatDateTime(step.rejectedAt)}` : ""}
                              {step.rejectedReason ? ` · ${step.rejectedReason}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>{formatDateTime(item.startAt)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(item.endAt)}</div>
                    </TableCell>
                    <TableCell>{hours(item.hours)}</TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    {hasActions ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">{actions?.(item)}</div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
