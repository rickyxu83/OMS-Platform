import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, ExternalLink, Filter, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Send, Settings2, ShieldCheck, Trash2, Users, Wallet, X } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";

type RequestType = "leave" | "overtime" | "comp_time";
type AnnualLeavePeriod = "morning" | "afternoon" | "day";
type AttendanceTab = "apply" | "records" | "report" | "employees" | "settings";

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

interface EmployeeProfile {
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

interface LegalHolidayItem {
  date: string;
  name: string;
  source: string;
  active?: boolean;
}

interface OvertimeSegment {
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

interface OvertimeServiceOrder extends ServiceOrderSummary {
  status?: string;
  segments: OvertimeSegment[];
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: "请假",
  overtime: "加班",
  comp_time: "调休",
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
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

const OVERTIME_DAY_TYPE_LABELS: Record<string, string> = {
  workday: "工作日",
  rest_day: "休息日",
  legal_holiday: "法定节假日",
};

const HOLIDAY_SOURCE_LABELS: Record<string, string> = {
  builtin: "内置",
  manual: "手动",
  auto: "自动",
};

const SERVICE_MODE_LABELS: Record<string, string> = {
  onsite: "现场",
  remote: "远程",
  office: "内勤",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
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

function todayYear() {
  return new Date().getFullYear().toString();
}

function nowLocalValue(offsetHours = 0) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return `${local.toISOString().slice(0, 13)}:00`;
}

function addHoursValue(value: string, amount: number) {
  const base = new Date(String(value || nowLocalValue()).replace("T", " "));
  if (!Number.isFinite(base.getTime())) return nowLocalValue(amount);
  const next = new Date(base.getTime() + amount * 60 * 60 * 1000);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60 * 1000);
  return `${local.toISOString().slice(0, 13)}:00`;
}

function dateValue(value?: string) {
  return String(value || nowLocalValue()).slice(0, 10);
}

function dateIndex(value: string) {
  const [year, month, day] = String(value).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function annualLeaveRange(form: {
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

function workingLeaveSummary(form: Parameters<typeof annualLeaveRange>[0], holidays: Set<string>) {
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
    if (day === 0 || day === 6 || holidays.has(key)) continue;
    const firstHalf = key === startDate ? startHalf : 0;
    const lastHalf = key === endDate ? endHalf : 1;
    if (lastHalf >= firstHalf) halfDays += lastHalf - firstHalf + 1;
  }
  return { ...range, hours: halfDays * 4, workingDays: halfDays / 2 };
}

function applyAnnualLeaveRange<T extends {
  annualStartDate?: string;
  annualEndDate?: string;
  annualPeriod?: string;
  annualStartPeriod?: string;
  annualEndPeriod?: string;
}>(form: T) {
  const range = annualLeaveRange(form);
  return { ...form, startAt: range.startAt, endAt: range.endAt, hours: String(range.hours) };
}

function formatDateTime(value?: string) {
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

function hours(value?: number) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
}

function days(value?: number) {
  return hours(value);
}

function annualBalanceDays(item?: { annualLeaveBalanceDays?: number; annualLeaveBalanceHours?: number } | null) {
  if (!item) return 0;
  if (typeof item.annualLeaveBalanceDays === "number") return item.annualLeaveBalanceDays;
  return Number(item.annualLeaveBalanceHours || 0) / 8;
}

function annualUsageDays(item?: { annualLeaveDays?: number; annualLeaveHours?: number } | null) {
  if (!item) return 0;
  if (typeof item.annualLeaveDays === "number") return item.annualLeaveDays;
  return Number(item.annualLeaveHours || 0) / 8;
}

function combineTravelSegments(segments: OvertimeSegment[]) {
  const items = segments.filter((item) => item.kind === "travel");
  if (!items.length) return null;
  return {
    key: "travel",
    kind: "travel" as const,
    label: "来回路上实际时间",
    startAt: items[0].startAt,
    endAt: items[items.length - 1].endAt,
    hours: items.reduce((sum, item) => sum + Number(item.hours || 0), 0),
    allowedResults: ["comp_time"],
  };
}

function overtimeRows(order: OvertimeServiceOrder | null) {
  if (!order) return [];
  const rows: OvertimeSegment[] = [];
  const travel = combineTravelSegments(order.segments || []);
  const work = (order.segments || []).find((item) => item.key === "work");
  if (travel) rows.push(travel);
  if (work) rows.push(work);
  return rows;
}

function overtimeSelection(items: OvertimeServiceOrder[], currentOrderId: string, currentSegmentKey: string) {
  const order = items.find((item) => String(item.id) === currentOrderId) || items[0] || null;
  const rows = overtimeRows(order);
  const segment = rows.find((item) => item.key === currentSegmentKey) || rows[0] || null;
  return {
    orderId: order ? String(order.id) : "",
    segmentKey: segment?.key || "",
  };
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

function overtimePayLabel(segment?: Pick<OvertimeSegment, "payMultiplier" | "dayType"> | null) {
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

function createBlankForm() {
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
  const canViewAll = hasPermission("attendance.view", "attendance.admin.approve", "attendance.hr.approve", "attendance.vp.approve", "attendance.manage");
  const canManage = hasPermission("attendance.manage");
  const canAdminApprove = hasPermission("attendance.admin.approve");
  const [activeTab, setActiveTab] = useState<AttendanceTab>("apply");
  const [form, setForm] = useState(createBlankForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [supervisorTodo, setSupervisorTodo] = useState<AttendanceRequest[]>([]);
  const [allRequests, setAllRequests] = useState<AttendanceRequest[]>([]);
  const [myProfile, setMyProfile] = useState<EmployeeProfile | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [delegates, setDelegates] = useState<EmployeeProfile[]>([]);
  const [delegatesLoading, setDelegatesLoading] = useState(false);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
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
  const [recordStatus, setRecordStatus] = useState("all");
  const [recordType, setRecordType] = useState("all");
  const [recordKeyword, setRecordKeyword] = useState("");
  const [overtimeOrders, setOvertimeOrders] = useState<OvertimeServiceOrder[]>([]);
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [selectedOvertimeOrderId, setSelectedOvertimeOrderId] = useState("");
  const [selectedSegmentKey, setSelectedSegmentKey] = useState("");
  const [reportMonth, setReportMonth] = useState(todayMonth());
  const [reportItems, setReportItems] = useState<MonthlyReportItem[]>([]);
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

  useEffect(() => {
    if (!["leave", "comp_time"].includes(form.requestType)) {
      setDelegatesLoading(false);
      return;
    }

    let cancelled = false;
    async function loadDelegates() {
      setDelegatesLoading(true);
      try {
        const dateQuery = form.requestType === "leave"
          ? "?startAt=" + encodeURIComponent(form.startAt) + "&endAt=" + encodeURIComponent(form.endAt)
          : "";
        const data = await api.get("/attendance/delegates" + dateQuery);
        if (cancelled) return;
        const items = (data?.items || []) as EmployeeProfile[];
        setDelegates(items);
        setForm((current) => {
          const selected = items.find((item) => String(item.id) === current.delegateEmployeeId);
          return selected?.unavailable ? { ...current, delegateEmployeeId: "" } : current;
        });
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "加载代理人失败");
      } finally {
        if (!cancelled) setDelegatesLoading(false);
      }
    }
    loadDelegates();
    return () => {
      cancelled = true;
    };
  }, [form.requestType, form.startAt, form.endAt]);

  async function loadOvertimeOrders() {
    setOvertimeLoading(true);
    try {
      const data = await api.get("/attendance/overtime/service-orders");
      const items = (data?.items || []) as OvertimeServiceOrder[];
      const selection = overtimeSelection(items, selectedOvertimeOrderId, selectedSegmentKey);
      setOvertimeOrders(items);
      setSelectedOvertimeOrderId(selection.orderId);
      setSelectedSegmentKey(selection.segmentKey);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载可申请工单失败");
    } finally {
      setOvertimeLoading(false);
    }
  }

  useEffect(() => {
    if (form.requestType === "overtime") loadOvertimeOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.requestType]);

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
  const isApprover = canAdminApprove || supervisorPending.length > 0;

  const tabs = useMemo(() => {
    const items: Array<{ key: AttendanceTab; label: string; count?: number }> = [
      { key: "apply", label: "申请与审批", count: approvalTodos.length },
    ];
    if (canViewAll) {
      items.push({ key: "records", label: "全员记录" });
      items.push({ key: "report", label: "月度报表" });
    }
    if (canManage) items.push({ key: "employees", label: "员工与余额" });
    if (canViewAll) items.push({ key: "settings", label: "考勤设置" });
    return items;
  }, [canViewAll, canManage, approvalTodos.length]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab("apply");
  }, [tabs, activeTab]);

  const selectedOvertimeOrder = useMemo(
    () => overtimeOrders.find((item) => String(item.id) === selectedOvertimeOrderId) || null,
    [overtimeOrders, selectedOvertimeOrderId],
  );
  const selectedOvertimeRows = useMemo(
    () => overtimeRows(selectedOvertimeOrder),
    [selectedOvertimeOrder],
  );
  const selectedSegment = useMemo(
    () => selectedOvertimeRows.find((item) => item.key === selectedSegmentKey) || null,
    [selectedOvertimeRows, selectedSegmentKey],
  );

  useEffect(() => {
    if (!selectedOvertimeOrder) {
      setSelectedSegmentKey("");
      return;
    }
    const exists = selectedOvertimeRows.some((item) => item.key === selectedSegmentKey);
    if (!exists) setSelectedSegmentKey(selectedOvertimeRows[0]?.key || "");
  }, [selectedOvertimeOrder, selectedOvertimeRows, selectedSegmentKey]);

  useEffect(() => {
    if (selectedSegment?.kind === "travel" && form.overtimeResult !== "comp_time") {
      setForm((current) => ({ ...current, overtimeResult: "comp_time" }));
    }
  }, [selectedSegment, form.overtimeResult]);

  function setAnnualDraft(patch: Partial<{
    annualStartDate: string;
    annualEndDate: string;
    annualPeriod: AnnualLeavePeriod;
    annualStartPeriod: AnnualLeavePeriod;
    annualEndPeriod: AnnualLeavePeriod;
  }>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.annualStartDate && dateIndex(next.annualEndDate) < dateIndex(patch.annualStartDate)) {
        next.annualEndDate = patch.annualStartDate;
      }
      if (patch.annualEndDate && dateIndex(patch.annualEndDate) < dateIndex(next.annualStartDate)) {
        next.annualStartDate = patch.annualEndDate;
      }
      return applyAnnualLeaveRange(next);
    });
  }

  function applyQuickDatePreset(offsetDays: number, period: AnnualLeavePeriod) {
    const date = dateValue(nowLocalValue(offsetDays * 24));
    setAnnualDraft({
      annualStartDate: date,
      annualEndDate: date,
      annualPeriod: period,
      annualStartPeriod: "morning",
      annualEndPeriod: period === "morning" ? "morning" : "afternoon",
    });
  }

  async function submitRequest() {
    const requestType = form.requestType;
    setSubmitting(true);
    try {
      if (requestType === "overtime") {
        if (!selectedOvertimeOrder || !selectedSegment) throw new Error("请选择工单和加班时段");
        await api.post(`/attendance/overtime/service-orders/${selectedOvertimeOrder.id}/apply`, {
          segmentKey: selectedSegment.key,
          overtimeResult: selectedSegment.kind === "travel" ? "comp_time" : form.overtimeResult,
        });
      } else {
        if (!form.delegateEmployeeId) throw new Error("请选择代理人");
        if (requestType === "leave" && ["sick", "marriage"].includes(form.leaveType) && proofFiles.length === 0) {
          throw new Error(form.leaveType === "sick" ? "病假必须上传证明" : "婚假必须上传证明");
        }
        const leaveRange = workingLeaveSummary(form, applicationHolidayDates);
        if (!leaveRange.workingDays) throw new Error("申请范围内没有工作日");
        const draft = await api.post("/attendance/requests", {
          requestType,
          leaveType: requestType === "leave" ? form.leaveType : undefined,
          delegateEmployeeId: form.delegateEmployeeId,
          startAt: leaveRange.startAt,
          endAt: leaveRange.endAt,
          hours: leaveRange.hours,
        });
        for (const file of proofFiles) {
          const body = new FormData();
          body.append("file", file);
          body.append("ownerType", "attendance_request");
          body.append("ownerId", String(draft.id));
          body.append("purpose", "leave_proof");
          await api.postForm("/files", body);
        }
        await api.post(`/attendance/requests/${draft.id}/submit`);
      }
      toast.success("申请已提交");
      setForm(createBlankForm());
      setProofFiles([]);
      setSelectedOvertimeOrderId("");
      setSelectedSegmentKey("");
      await load();
      if (requestType === "overtime") await loadOvertimeOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function action(path: string, success: string, body?: any) {
    try {
      await api.post(path, body);
      toast.success(success);
      await load();
      if (form.requestType === "overtime") await loadOvertimeOrders();
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
      if (recordStatus !== "all" && item.status !== recordStatus) return false;
      if (recordType !== "all" && item.requestType !== recordType) return false;
      if (keyword && !String(item.employeeName || "").toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [allRequests, recordStatus, recordType, recordKeyword]);
  const recordPendingCount = filteredAllRequests.filter((item) => String(item.status || "").startsWith("pending_")).length;
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
  const annualPreview = ["leave", "comp_time"].includes(form.requestType)
    ? workingLeaveSummary(form, applicationHolidayDates)
    : null;
  const annualSingleDay = form.annualStartDate === form.annualEndDate;

  const overtimeOrderMeta: Array<[string, string]> = selectedOvertimeOrder ? [
    ["工单", selectedOvertimeOrder.orderNo || `#${selectedOvertimeOrder.id}`],
    ["客户", selectedOvertimeOrder.customerName || "-"],
    ["设备", selectedOvertimeOrder.deviceName || "-"],
    ["类型", `${SERVICE_MODE_LABELS[selectedOvertimeOrder.serviceMode || ""] || selectedOvertimeOrder.serviceMode || "-"} / ${SERVICE_TYPE_LABELS[selectedOvertimeOrder.serviceType || ""] || selectedOvertimeOrder.serviceType || "-"}`],
    ["联系人", `${selectedOvertimeOrder.contactName || "-"}${selectedOvertimeOrder.contactPhone ? ` ${selectedOvertimeOrder.contactPhone}` : ""}`],
    ["服务日", formatDateTime(selectedOvertimeOrder.serviceAt || undefined)],
    ["出发", formatDateTime(selectedOvertimeOrder.departureAt || undefined)],
    ["到达", formatDateTime(selectedOvertimeOrder.actualStartAt || undefined)],
    ["完成", formatDateTime(selectedOvertimeOrder.actualEndAt || undefined)],
    ["返回", formatDateTime(selectedOvertimeOrder.returnAt || undefined)],
  ] : [];

  const statTiles = [
    { label: "可用特休", value: `${days(annualBalanceDays(myProfile))} 天` },
    { label: "可用调休", value: `${hours(myProfile?.compTimeBalanceHours)} 小时` },
    { label: "我的进行中", value: String(pendingMine) },
    ...(isApprover ? [{ label: "待我审批", value: String(approvalTodos.length) }] : []),
  ];
  const selectedDelegateName = delegates.find((item) => String(item.id) === form.delegateEmployeeId)?.employeeName || "";
  const proofRequired = form.requestType === "leave" && ["sick", "marriage"].includes(form.leaveType);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">考勤管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">请假、加班、调休申请与月度汇总</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
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

      {activeTab === "apply" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statTiles.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-5">
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                  <div className="mt-1 text-2xl font-semibold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="border-b bg-card px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    提交申请
                  </CardTitle>
                  <CardDescription>选择申请类型后，在同一屏完成日期、时段和交接信息</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">特休 {days(annualBalanceDays(myProfile))} 天</Badge>
                  <Badge variant="secondary">调休 {hours(myProfile?.compTimeBalanceHours)} 小时</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b bg-muted/15 p-4">
                <div className="grid gap-2 md:grid-cols-3">
                    {[
                      { value: "leave", label: "请假", description: "特休与常规假别", icon: CalendarClock },
                      { value: "overtime", label: "加班", description: "从工单带入时段", icon: Send },
                      { value: "comp_time", label: "调休", description: "使用已有调休余额", icon: RotateCcw },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = form.requestType === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setForm((current) => {
                            const value = item.value;
                            const next = { ...current, requestType: value as RequestType, hours: value === "overtime" ? "1" : "4" };
                            if (value !== "overtime") return applyAnnualLeaveRange(next);
                            return { ...next, endAt: addHoursValue(next.startAt, 1) };
                          })}
                          className={active
                            ? "flex min-h-16 items-center gap-3 rounded-lg border border-primary bg-background p-3 text-left ring-2 ring-primary/15 transition"
                            : "flex min-h-16 items-center gap-3 rounded-lg border bg-background p-3 text-left transition hover:bg-muted/30"}
                        >
                          <span className={active ? "rounded-md bg-primary p-2 text-primary-foreground" : "rounded-md bg-muted p-2 text-muted-foreground"}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{item.label}</span>
                            <span className="block text-xs text-muted-foreground">{item.description}</span>
                          </span>
                          {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="p-4 md:p-5">
                  {form.requestType === "overtime" ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>工单</Label>
                          <Select
                            value={selectedOvertimeOrderId}
                            onValueChange={(value) => {
                              setSelectedOvertimeOrderId(value);
                              const order = overtimeOrders.find((item) => String(item.id) === value);
                              setSelectedSegmentKey(overtimeRows(order || null)[0]?.key || "");
                            }}
                            disabled={overtimeLoading || overtimeOrders.length === 0}
                          >
                            <SelectTrigger className="h-11"><SelectValue placeholder={overtimeLoading ? "载入中" : "选择工单"} /></SelectTrigger>
                            <SelectContent>
                              {overtimeOrders.map((order) => (
                                <SelectItem key={order.id} value={String(order.id)}>
                                  {order.orderNo || `#${order.id}`} {order.customerName ? ` / ${order.customerName}` : ""} {order.deviceName ? ` / ${order.deviceName}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>加班结果</Label>
                          <Select
                            value={selectedSegment?.kind === "travel" ? "comp_time" : form.overtimeResult}
                            onValueChange={(value) => setForm((current) => ({ ...current, overtimeResult: value }))}
                            disabled={!selectedSegment || selectedSegment.kind === "travel"}
                          >
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="comp_time">转调休</SelectItem>
                              {selectedSegment && selectedSegment.kind !== "travel" ? (
                                <SelectItem value="pay">{overtimePayLabel(selectedSegment)}</SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                          {selectedSegment?.kind === "travel" ? (
                            <p className="text-xs text-muted-foreground">来回路上时间固定转调休</p>
                          ) : null}
                        </div>
                      </div>

                      {selectedOvertimeOrder ? (
                        <>
                          <div className="space-y-2">
                            <Label>加班时段</Label>
                            <div className="grid gap-2 md:grid-cols-2">
                              {selectedOvertimeRows.map((segment) => {
                                const active = selectedSegmentKey === segment.key;
                                return (
                                  <button
                                    key={segment.key}
                                    type="button"
                                    onClick={() => setSelectedSegmentKey(segment.key)}
                                    className={`rounded-md border p-3 text-left text-sm transition ${
                                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "bg-background hover:bg-muted/40"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium">{segment.label}</span>
                                      {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {formatDateTime(segment.startAt)} - {formatDateTime(segment.endAt)}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      {hours(segment.hours)} 小时
                                      {segment.dayType ? ` · ${OVERTIME_DAY_TYPE_LABELS[segment.dayType] || segment.dayType}` : ""}
                                      {segment.kind === "travel" ? " · 固定转调休" : ""}
                                    </div>
                                  </button>
                                );
                              })}
                              {selectedOvertimeRows.length === 0 ? (
                                <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground md:col-span-2">暂无可申请时段</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="rounded-md border bg-muted/10 p-3">
                            <div className="text-xs font-medium text-muted-foreground">工单信息</div>
                            <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                              {overtimeOrderMeta.map(([label, value]) => (
                                <div key={label}>{label}：{value}</div>
                              ))}
                              <div className="sm:col-span-2 xl:col-span-3">问题：{selectedOvertimeOrder.issueDescription || "-"}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                          {overtimeLoading ? "正在加载…" : "暂无可申请加班的工单"}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {form.requestType === "leave" ? (
                        <div className="space-y-2">
                          <Label>假别</Label>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => {
                              const active = form.leaveType === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setForm((current) => {
                                    const date = dateValue(current.startAt);
                                    return applyAnnualLeaveRange({
                                      ...current,
                                      leaveType: value,
                                      annualStartDate: current.annualStartDate || date,
                                      annualEndDate: current.annualEndDate || date,
                                    });
                                  })}
                                  className={active
                                    ? "h-9 rounded-md border border-primary bg-primary/10 px-3 text-sm font-medium text-primary transition"
                                    : "h-9 rounded-md border bg-background px-3 text-sm transition hover:bg-muted/50"}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => applyQuickDatePreset(0, "morning")}>今天上午</Button>
                        <Button variant="outline" size="sm" onClick={() => applyQuickDatePreset(0, "day")}>今天全天</Button>
                        <Button variant="outline" size="sm" onClick={() => applyQuickDatePreset(1, "day")}>明天全天</Button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>开始日期</Label>
                          <Input
                            className="h-11"
                            data-compact-date="true"
                            type="date"
                            value={form.annualStartDate}
                            onChange={(event) => setAnnualDraft({ annualStartDate: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>结束日期</Label>
                          <Input
                            className="h-11"
                            data-compact-date="true"
                            type="date"
                            min={form.annualStartDate}
                            value={form.annualEndDate}
                            onChange={(event) => setAnnualDraft({ annualEndDate: event.target.value })}
                          />
                        </div>
                      </div>

                      {annualSingleDay ? (
                        <div className="space-y-2">
                          <Label>时段</Label>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {[
                              { value: "morning" as AnnualLeavePeriod, label: "上午", time: "09:00-14:00" },
                              { value: "afternoon" as AnnualLeavePeriod, label: "下午", time: "14:00-18:00" },
                              { value: "day" as AnnualLeavePeriod, label: "全天", time: "09:00-18:00" },
                            ].map((item) => {
                              const active = form.annualPeriod === item.value;
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => setAnnualDraft({ annualPeriod: item.value })}
                                  className={active
                                    ? "rounded-lg border border-primary bg-primary/5 p-3 text-left ring-1 ring-primary/25 transition"
                                    : "rounded-lg border p-3 text-left transition hover:bg-muted/40"}
                                >
                                  <div className="flex items-center justify-between gap-2 text-sm font-medium">
                                    {item.label}
                                    {active ? <Check className="h-4 w-4 text-primary" /> : null}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">{item.time}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>开始时段</Label>
                            <Select value={form.annualStartPeriod} onValueChange={(value) => setAnnualDraft({ annualStartPeriod: value as AnnualLeavePeriod })}>
                              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="morning">上午 09:00 起</SelectItem>
                                <SelectItem value="afternoon">下午 14:00 起</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>结束时段</Label>
                            <Select value={form.annualEndPeriod} onValueChange={(value) => setAnnualDraft({ annualEndPeriod: value as AnnualLeavePeriod })}>
                              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="morning">上午 14:00 止</SelectItem>
                                <SelectItem value="afternoon">下午 18:00 止</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>工作代理人</Label>
                        <Select
                          value={form.delegateEmployeeId}
                          onValueChange={(value) => setForm((current) => ({ ...current, delegateEmployeeId: value }))}
                          disabled={delegatesLoading}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue
                              placeholder={delegatesLoading
                                ? "正在检查代理人状态"
                                : form.requestType === "leave" ? "选择请假期间的代理人" : "选择调休期间的代理人"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {delegates.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)} disabled={item.unavailable}>
                                {item.employeeName || "员工 #" + item.id}
                                {item.unavailable ? "（所选时段请假中）" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {form.requestType === "leave"
                            ? "请假冲突人员不可选择；代理人无需确认，提交后直接进入配置的审批链。"
                            : "调休仍需代理人确认后，再进入配置的审批链。"}
                        </p>
                      </div>

                      {proofRequired ? (
                        <div className="space-y-2">
                          <Label>{form.leaveType === "sick" ? "病假证明" : "婚假证明"}</Label>
                          <Input
                            className="h-11"
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                            onChange={(event) => setProofFiles(Array.from(event.target.files || []))}
                          />
                          <p className="text-xs text-muted-foreground">必填，可上传图片、PDF 或 Word 文件</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="border-t bg-muted/20 p-4 lg:border-l lg:border-t-0">
                  <div className="sticky top-4 space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">当前草稿</div>
                      <Badge variant="secondary">
                        {form.requestType === "leave"
                          ? LEAVE_TYPE_LABELS[form.leaveType || ""] || "请假"
                          : form.requestType === "overtime" ? "工单加班" : "调休"}
                      </Badge>
                    </div>

                    <div className="space-y-3 rounded-lg border bg-background p-4">
                      {form.requestType === "overtime" ? (
                        <>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">工单</span>
                            <span className="font-medium">{selectedOvertimeOrder?.orderNo || (selectedOvertimeOrder ? "工单 #" + selectedOvertimeOrder.id : "未选择")}</span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">客户</span>
                            <span className="font-medium">{selectedOvertimeOrder?.customerName || "-"}</span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">申请时段</span>
                            <span className="font-medium">{selectedSegment?.label || "未选择"}</span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">时间</span>
                            <span className="font-medium">
                              {selectedSegment ? formatDateTime(selectedSegment.startAt) + " - " + formatDateTime(selectedSegment.endAt) : "-"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">核算结果</span>
                            <span className="font-medium">
                              {selectedSegment
                                ? hours(selectedSegment.hours) + " 小时 · " + (
                                  selectedSegment.kind === "travel"
                                    ? "固定转调休"
                                    : form.overtimeResult === "pay" ? overtimePayLabel(selectedSegment) : "转调休"
                                )
                                : "未选择"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">申请类型</span>
                            <span className="font-medium">
                              {form.requestType === "leave" ? LEAVE_TYPE_LABELS[form.leaveType || ""] || "请假" : "调休"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">日期范围</span>
                            <span className="font-medium">{form.annualStartDate} - {form.annualEndDate}</span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">申请时段</span>
                            <span className="font-medium">
                              {annualSingleDay
                                ? form.annualPeriod === "day" ? "全天" : form.annualPeriod === "morning" ? "上午" : "下午"
                                : (form.annualStartPeriod === "morning" ? "上午起" : "下午起") + " / " + (form.annualEndPeriod === "morning" ? "上午止" : "下午止")}
                            </span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">核算时长</span>
                            <span className="font-medium">{days(annualPreview?.workingDays)} 工作日 · {hours(annualPreview?.hours)} 小时</span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">工作代理</span>
                            <span className="font-medium">{selectedDelegateName || "未选择"}</span>
                          </div>
                          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-muted-foreground">证明附件</span>
                            <span className={proofRequired && proofFiles.length === 0 ? "font-medium text-destructive" : "font-medium"}>
                              {proofFiles.length > 0 ? proofFiles.length + " 个文件" : proofRequired ? "未上传（必填）" : "无需附件"}
                            </span>
                          </div>
                          <div className="pt-1 text-xs leading-5 text-muted-foreground">已排除周末和法定节假日</div>
                        </>
                      )}
                    </div>

                    <Button
                      className="h-11 w-full"
                      onClick={submitRequest}
                      disabled={submitting || (form.requestType === "overtime" && !selectedSegment)}
                    >
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      提交申请
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {form.requestType === "leave"
                        ? "提交后直接进入配置的审批链，代理人无需确认"
                        : form.requestType === "comp_time"
                          ? "提交后先由代理人确认，再进入配置的审批链"
                          : "提交后进入配置的审批链"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isApprover ? (
            <RequestList
              title="待我审批"
              description="代理确认与当前角色审批待办集中在这里处理"
              items={approvalTodos}
              loading={loading}
              onDownloadProof={previewProof}
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

          <RequestList
            title="我的申请"
            description="最终审批前可撤回"
            items={mine}
            loading={loading}
            onDownloadProof={previewProof}
            showEmployee={false}
            actions={(item) => ["draft", "pending_delegate", "pending_approval", "pending_supervisor", "pending_hr", "pending_vp", "pending_admin"].includes(item.status || "") ? (
              <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/withdraw`, "已撤回")}>
                <RotateCcw className="mr-1 h-4 w-4" /> 撤回
              </Button>
            ) : null}
          />
        </div>
      ) : null}

      {activeTab === "records" && canViewAll ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">全员记录</h2>
              <p className="mt-1 text-sm text-muted-foreground">先看审批状态与异常，再进入完整申请流水</p>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="搜索员工姓名" value={recordKeyword} onChange={(event) => setRecordKeyword(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <AttendanceMetric label="当前记录" value={String(filteredAllRequests.length)} note="当前筛选范围" icon={<Users className="h-4 w-4" />} />
            <AttendanceMetric label="审批中" value={String(recordPendingCount)} note="仍在流程中的申请" icon={<Clock3 className="h-4 w-4" />} />
            <AttendanceMetric label="已通过" value={String(recordApprovedCount)} note="已进入报表统计" icon={<CheckCircle2 className="h-4 w-4" />} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <RequestList
              title="申请流水"
              description="审批通过后可作废"
              items={filteredAllRequests}
              loading={loading}
              onDownloadProof={previewProof}
              emptyText={hasRecordFilter ? "没有符合筛选条件的记录" : "暂无记录"}
              toolbar={(
                <>
                  <Select value={recordStatus} onValueChange={setRecordStatus}>
                    <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={recordType} onValueChange={setRecordType}>
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {hasRecordFilter ? <Button variant="ghost" size="sm" onClick={() => { setRecordStatus("all"); setRecordType("all"); setRecordKeyword(""); }}>重置</Button> : null}
                </>
              )}
              actions={canAdminApprove ? (item) => item.status === "approved" ? (
                <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/void`, "已作废")}><X className="mr-1 h-4 w-4" /> 作废</Button>
              ) : null : undefined}
            />
            <Card className="h-fit">
              <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" />快速聚焦</CardTitle><CardDescription>常用范围一键筛选</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                <QuickRecordFilter label="待审批" count={allRequests.filter((item) => item.status === "pending_approval").length} active={recordStatus === "pending_approval" && recordType === "all"} onClick={() => { setRecordStatus("pending_approval"); setRecordType("all"); setRecordKeyword(""); }} />
                <QuickRecordFilter label="全部加班" count={allRequests.filter((item) => item.requestType === "overtime").length} active={recordType === "overtime" && recordStatus === "all"} onClick={() => { setRecordStatus("all"); setRecordType("overtime"); setRecordKeyword(""); }} />
                <QuickRecordFilter label="全部请假" count={allRequests.filter((item) => item.requestType === "leave").length} active={recordType === "leave" && recordStatus === "all"} onClick={() => { setRecordStatus("all"); setRecordType("leave"); setRecordKeyword(""); }} />
                <QuickRecordFilter label="已作废记录" count={allRequests.filter((item) => item.status === "voided").length} active={recordStatus === "voided" && recordType === "all"} onClick={() => { setRecordStatus("voided"); setRecordType("all"); setRecordKeyword(""); }} />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "report" && canViewAll ? (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>月度数据矩阵</CardTitle>
                <CardDescription>横向比较员工各类假勤、加班折算与当前余额</CardDescription>
              </div>
              <div className="w-40 space-y-2">
                <Label>月份</Label>
                <Input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[1160px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>员工</TableHead>
                    <TableHead>特休</TableHead>
                    <TableHead>病假</TableHead>
                    <TableHead>事假</TableHead>
                    <TableHead>婚假</TableHead>
                    <TableHead>丧假</TableHead>
                    <TableHead>加班</TableHead>
                    <TableHead>转调休</TableHead>
                    <TableHead>加班费</TableHead>
                    <TableHead>法定节假日加班费</TableHead>
                    <TableHead>加班费折算</TableHead>
                    <TableHead>调休</TableHead>
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
                      <TableCell>{hours(item.marriageLeaveHours)}</TableCell>
                      <TableCell>{hours(item.bereavementLeaveHours)}</TableCell>
                      <TableCell>{hours(item.overtimeHours)}</TableCell>
                      <TableCell>{hours(item.overtimeToCompHours)}</TableCell>
                      <TableCell>{hours(item.overtimeToPayHours)}</TableCell>
                      <TableCell>{hours(item.legalHolidayOvertimePayHours)}</TableCell>
                      <TableCell>{hours(item.overtimePayWeightedHours)}</TableCell>
                      <TableCell>{hours(item.compTimeUsedHours)}</TableCell>
                      <TableCell>{days(annualBalanceDays(item))} 天</TableCell>
                      <TableCell>{hours(item.compTimeBalanceHours)}</TableCell>
                    </TableRow>
                  ))}
                  {reportItems.length === 0 ? (
                    <TableRow><TableCell colSpan={14} className="py-8 text-center text-muted-foreground">暂无数据</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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
                    <CardDescription>每个申请人角色可配置一条按顺序执行的多级审批链</CardDescription>
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
    </div>
  );
}

function serviceOrderTypeLabel(order: ServiceOrderSummary) {
  const mode = SERVICE_MODE_LABELS[order.serviceMode || ""] || order.serviceMode || "-";
  const type = SERVICE_TYPE_LABELS[order.serviceType || ""] || order.serviceType || "-";
  return `${mode} / ${type}`;
}

function ServiceOrderApprovalSummary({ order }: { order: ServiceOrderSummary }) {
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
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">工单：</span>{orderLabel}</div>
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">客户：</span>{order.customerName || "-"}</div>
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">设备：</span>{order.deviceName || "-"}</div>
        <div className="min-w-0 break-words"><span className="font-medium text-foreground">类型：</span>{serviceOrderTypeLabel(order)}</div>
        <div className="min-w-0 break-words sm:col-span-2"><span className="font-medium text-foreground">问题：</span>{order.issueDescription || "-"}</div>
      </div>
      <details className="mt-2 border-t pt-2">
        <summary className="cursor-pointer select-none rounded-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          展开工单详情
        </summary>
        <div className="mt-2 grid min-w-0 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">联系人：</span>{order.contactName || "-"}</div>
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">电话：</span>{order.contactPhone || "-"}</div>
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">服务日：</span>{formatDateTime(order.serviceAt || undefined)}</div>
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">出发：</span>{formatDateTime(order.departureAt || undefined)}</div>
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">到达：</span>{formatDateTime(order.actualStartAt || undefined)}</div>
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">完成：</span>{formatDateTime(order.actualEndAt || undefined)}</div>
          <div className="min-w-0 break-words"><span className="font-medium text-foreground">返回：</span>{formatDateTime(order.returnAt || undefined)}</div>
        </div>
      </details>
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

function QuickRecordFilter({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "flex w-full items-center justify-between rounded-lg border border-primary bg-primary/5 p-3 text-left text-sm text-primary ring-1 ring-primary/15"
        : "flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition hover:bg-muted/50"}
    >
      <span className="font-medium">{label}</span>
      <Badge variant={active ? "default" : "secondary"}>{count}</Badge>
    </button>
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
