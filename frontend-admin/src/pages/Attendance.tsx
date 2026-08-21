import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Briefcase, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Download, ExternalLink, Eye, Loader2, Paperclip, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Settings2, ShieldCheck, Trash2, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatCount } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { HelpTooltip } from "@/components/HelpTooltip";

// 法定节假日模块说明文案
const HOLIDAY_TABLE_HELP = "法定节假日数据来源：① 内置——系统预置国务院已公布年份，启动时自动校正；② 自动——每年 11~12 月每天 09:15 自动检查来年数据，从两个国务院公告镜像源（holiday-cn、jiejiariapi）拉取并比对，一致后自动写入并邮件通知管理员；同步失败时每周一提醒一次，12 月 15 日起仍未成功则每天提醒；③ 手动——管理员手工新增。标记为「放假」的日期加班按 3 倍计算加班费，「调休补班」按正常工作日处理。";
const HOLIDAY_SYNC_HELP = "数据来自 holiday-cn 与 jiejiariapi 两个独立维护的国务院公告镜像源，双源比对一致且通过结构校验（放假日数量合理、补班日必须在周末、七大节日齐全）后才展示预览；点击「确认写入」时后端会重新拉取校验，不信任前端回传。支持任意年份（可用于回填历史或测试）。来年数据无需手动操作：每年 11 月起系统每天自动同步，成功或持续失败都会邮件通知管理员。";
const HOLIDAY_SOURCE_HELP = "内置：系统预置的官方数据，每次启动自动校正；自动：每年 11~12 月定时任务双源同步写入；手动：管理员手工维护，作为前两者的兜底。";
const APPROVAL_RULE_HELP = "审批链按固定模型自动推导，无需逐级配置：普通员工 = 直属主管 → 行政主管；工程/销售主管 = 行政主管 → 运营负责人；行政主管本人 = 运营负责人；请假满 3 天自动追加运营负责人终审。直属主管映射为「行政主管」时等同无直属主管步骤（自动去重）。管理员与行政主管拥有全部考勤权限，可审批任意环节。";
import {
  LEAVE_TYPE_LABELS,
  OVERTIME_DAY_TYPE_LABELS,
  SERVICE_MODE_LABELS,
  SERVICE_TYPE_LABELS,
  addHoursValue,
  annualBalanceDays,
  annualLeaveRange,
  applyAnnualLeaveRange,
  createBlankForm,
  dateIndex,
  dateValue,
  days,
  formatDateTime,
  hours,
  nowLocalValue,
  overtimePayLabel,
  overtimeRows,
  parseLocalDateTime,
  previewOvertimeHours,
  toDateTimeLocal,
  workingLeaveSummary,
  type AnnualLeavePeriod,
  type EmployeeProfile,
  type LegalHolidayItem,
  type OvertimeSegment,
  type OvertimeServiceOrder,
  type RequestType,
  type ServiceOrderSummary,
} from "@/pages/attendance-shared";

type AttendanceTab = "approve" | "records" | "employees" | "settings" | "duty";

// 待办中心等外部入口通过 ?tab=approve 深链定位考勤页签
const ATTENDANCE_TABS: AttendanceTab[] = ["approve", "records", "employees", "settings", "duty"];
function parseTabParam(value: string | null): AttendanceTab {
  return ATTENDANCE_TABS.includes(value as AttendanceTab) ? (value as AttendanceTab) : "approve";
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
  reason?: string | null;
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

interface DutyPendingBatch {
  month: string;
  status: string;
  recordCount: number;
  unitsSum: number;
  submittedAt: string | null;
  autoSubmitted: boolean;
  rejectedReason?: string | null;
}

interface DutyDetailRecord {
  id: number;
  duty_date: string;
  duty_end_date?: string | null;
  employee_name: string;
  duty_type: string;
  reason: string;
  units: number;
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

const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: "请假",
  overtime: "加班",
  comp_time: "调休",
};

const OVERTIME_KIND_LABELS: Record<string, string> = {
  travel: "来回路上实际",
  work: "实际工作时间",
};

const OVERTIME_RESULT_LABELS: Record<string, string> = {
  comp_time: "转调休",
  pay: "加班费",
};

const HOLIDAY_SOURCE_LABELS: Record<string, string> = {
  builtin: "内置",
  manual: "手动",
  auto: "自动",
};

const DAY_TYPE_LABELS: Record<string, string> = {
  legal_holiday: "放假",
  makeup_workday: "调休补班",
};

// 法定节假日只读展示：星期、日期格式化与连续假期段合并辅助
const HOLIDAY_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function holidayWeekday(date: string) {
  return `周${HOLIDAY_WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]}`;
}

function fmtHolidayDate(date: string) {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

function addHolidayDays(date: string, amount: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + amount);
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${month}-${day}`;
}

interface HolidayRange {
  name: string;
  start: string;
  end: string;
  days: number;
  makeup: string[];
}

// 连续同名的放假日合并为一个假期段，并按名称关联调休补班日；未匹配到假期的补班日单列
function buildHolidayRanges(items: LegalHolidayItem[]) {
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

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function dateInputValue(value?: string) {
  return String(value || "").slice(0, 10);
}

function annualUsageDays(item?: { annualLeaveDays?: number; annualLeaveHours?: number } | null) {
  if (!item) return 0;
  if (typeof item.annualLeaveDays === "number") return item.annualLeaveDays;
  return Number(item.annualLeaveHours || 0) / 8;
}

// 明细列主内容：加班拆为结构化徽章（事由 / 结果·倍数 / 日类型），请假与调休加粗主文案
function requestDetailContent(item: AttendanceRequest) {
  if (item.requestType === "leave") {
    return <span className="font-medium">{LEAVE_TYPE_LABELS[item.leaveType || ""] || "-"}</span>;
  }
  if (item.requestType === "overtime") {
    const multiplier = item.overtimeResult === "pay" && Number(item.overtimePayMultiplier || 0) > 1
      ? ` ${hours(Number(item.overtimePayMultiplier))}倍`
      : "";
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-"}</span>
        <Badge variant={item.overtimeResult === "pay" ? "purple" : "teal"}>
          {(OVERTIME_RESULT_LABELS[item.overtimeResult || ""] || "-") + multiplier}
        </Badge>
        {item.overtimeDayType ? <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{OVERTIME_DAY_TYPE_LABELS[item.overtimeDayType]}</span> : null}
      </span>
    );
  }
  return <span className="font-medium">调休</span>;
}

function requestTypeLabel(type?: string) {
  return REQUEST_TYPE_LABELS[type || ""] || type || "-";
}

const REQUEST_TYPE_VARIANT: Record<string, "info" | "warning" | "teal" | "secondary"> = {
  leave: "info",
  overtime: "warning",
  comp_time: "teal",
};

// 审批链 v4 自动推导（与后端 workflow.js deriveApprovalRoles 保持一致，用于设置页实时预览）
const APPROVAL_FINAL_ROLE = "administrative_supervisor";
const APPROVAL_ESCALATION_ROLE = "operations_director";
const APPROVAL_ESCALATION_APPLICANT_ROLES = new Set(["engineering_supervisor", "sales_supervisor"]);

function deriveApprovalChainPreview(applicantRole: string, supervisorRole?: string) {
  if (applicantRole === "admin" || applicantRole === APPROVAL_ESCALATION_ROLE) return { chain: [] as string[], longLeaveEscalation: false };
  if (applicantRole === APPROVAL_FINAL_ROLE) return { chain: [APPROVAL_ESCALATION_ROLE], longLeaveEscalation: false };
  const escalated = APPROVAL_ESCALATION_APPLICANT_ROLES.has(applicantRole);
  const chain: string[] = [];
  const skip = new Set([applicantRole, APPROVAL_FINAL_ROLE, APPROVAL_ESCALATION_ROLE, "admin"]);
  if (!escalated && supervisorRole && !skip.has(supervisorRole)) chain.push(supervisorRole);
  chain.push(APPROVAL_FINAL_ROLE);
  if (escalated) chain.push(APPROVAL_ESCALATION_ROLE);
  return { chain, longLeaveEscalation: !escalated };
}

function requestTypeBadge(type?: string) {
  return <Badge variant={REQUEST_TYPE_VARIANT[type || ""] || "secondary"}>{requestTypeLabel(type)}</Badge>;
}

// 申请时间区间：同日单行「08-20 09:00 – 18:00」，跨天两行；均省略年份（考勤申请不跨年）
function requestTimeRange(item: AttendanceRequest) {
  const start = formatDateTime(item.startAt);
  if (start === "-") return <span className="text-muted-foreground">-</span>;
  const end = formatDateTime(item.endAt);
  const sameDay = String(item.startAt || "").slice(0, 10) === String(item.endAt || "").slice(0, 10);
  if (sameDay) {
    return (
      <div className="tabular-nums">
        <span className="font-medium">{start.slice(5, 10)}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{start.slice(11)} – {end.slice(11)}</span>
      </div>
    );
  }
  return (
    <div className="tabular-nums">
      <div className="font-medium">{start.slice(5)}</div>
      <div className="text-xs text-muted-foreground">至 {end.slice(5)}</div>
    </div>
  );
}

// 申请时长：假类按天（整天=8h，半天=0.5），加班/调休按小时
function requestDuration(item: AttendanceRequest) {
  if (item.hours == null) return null;
  if (item.requestType === "leave") {
    const daysValue = item.workingDays ?? Number(item.hours) / 8;
    return `共 ${days(daysValue)} 天`;
  }
  return `共 ${hours(item.hours)} 小时`;
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
  const canDutyApprove = hasPermission("attendance.duty.admin.approve");
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AttendanceTab>(() => parseTabParam(searchParams.get("tab")));
  const [recordView, setRecordView] = useState<"detail" | "summary">(() => searchParams.get("record") === "summary" ? "summary" : "detail");
  // 考勤设置子视图：审批流程 / 工作日历；角色审批链默认折叠，展开后才可编辑
  const [settingsView, setSettingsView] = useState<"rules" | "holidays">(() => searchParams.get("view") === "holidays" ? "holidays" : "rules");
  const [applyOpen, setApplyOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [mineStatus, setMineStatus] = useState("all");
  const [supervisorTodo, setSupervisorTodo] = useState<AttendanceRequest[]>([]);
  const [allRequests, setAllRequests] = useState<AttendanceRequest[]>([]);
  const [myProfile, setMyProfile] = useState<EmployeeProfile | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [proofPreview, setProofPreview] = useState<ProofPreview | null>(null);
  const [proofImageSize, setProofImageSize] = useState<{ width: number; height: number } | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [supervisorRules, setSupervisorRules] = useState<Array<{ applicantRole: string; applicantRoleLabel?: string; supervisorRole: string }>>([]);
  const [supervisorRuleDrafts, setSupervisorRuleDrafts] = useState<Record<string, string>>({});
  const [supervisorRulesSaving, setSupervisorRulesSaving] = useState(false);
  const [employeeDialog, setEmployeeDialog] = useState<{ employee: EmployeeProfile; draft: EmployeeDraft } | null>(null);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [adjustDialog, setAdjustDialog] = useState<{ employee: EmployeeProfile; draft: AdjustDraft } | null>(null);
  // 员工余额表多选：点击行切换、Shift 连选、按住拖动框选（交互与 MR 采购卡一致）
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [batchBalanceDialog, setBatchBalanceDialog] = useState<{ balanceType: "annual_leave" | "comp_time"; target: string; note: string } | null>(null);
  const [batchBalanceSaving, setBatchBalanceSaving] = useState(false);
  // 值班津贴待终审批次（审批 tab 与值班 tab 双入口，状态实时同步）
  const [dutyPendingBatches, setDutyPendingBatches] = useState<DutyPendingBatch[]>([]);
  const [dutyBatchSaving, setDutyBatchSaving] = useState(false);
  const [dutyDetail, setDutyDetail] = useState<{ month: string; records: DutyDetailRecord[] } | null>(null);
  const [dutyDetailLoading, setDutyDetailLoading] = useState(false);
  const employeeDragRef = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" });
  const employeeAnchorRef = useRef<number | null>(null);
  const employeeCardRef = useRef<HTMLDivElement | null>(null);
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
  const [holidayDraft, setHolidayDraft] = useState({ date: dateValue(), name: "", dayType: "legal_holiday" });
  // 审批页（申请与审批）只读展示的法定节假日：默认当年，可切换年份
  const [publicHolidays, setPublicHolidays] = useState<LegalHolidayItem[]>([]);
  const [publicHolidayYear, setPublicHolidayYear] = useState(todayYear());
  // 同步官方节假日：双源拉取预览（任意年份），确认后写入；来年数据由后端定时任务自动同步
  const [syncYear, setSyncYear] = useState(String(todayYear() + 1));
  const [syncPreview, setSyncPreview] = useState<{
    items: Array<{ date: string; name: string; dayType: string }>;
    warnings: string[];
    sources: Array<{ label: string; count: number; error?: string | null }>;
  } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSaving, setSyncSaving] = useState(false);

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
        calls.push(api.get("/attendance/supervisor-role-rules"));
        const holidayQuery = /^\d{4}$/.test(holidayYear) ? `?year=${holidayYear}` : "";
        calls.push(api.get(`/attendance/legal-holidays${holidayQuery}`));
      }
      const [meData, mineData, supervisorData, applicationHolidayData, allData, employeeData, reportData, roleRuleData, holidayData] = await Promise.all(calls);
      setMyProfile((meData?.item || null) as EmployeeProfile | null);
      setMine((mineData?.items || []) as AttendanceRequest[]);
      setSupervisorTodo((supervisorData?.items || []) as AttendanceRequest[]);
      setApplicationHolidays((applicationHolidayData?.items || []) as LegalHolidayItem[]);
      if (canViewAll) {
        const supervisorRulesData = (roleRuleData || {}) as { roles?: RoleOption[]; items?: Array<{ applicantRole: string; applicantRoleLabel?: string; supervisorRole: string }> };
        const ruleItems = supervisorRulesData.items || [];
        setAllRequests((allData?.items || []) as AttendanceRequest[]);
        setEmployees((employeeData?.items || []) as EmployeeProfile[]);
        setReportItems((reportData?.items || []) as MonthlyReportItem[]);
        setRoleOptions(supervisorRulesData.roles || []);
        setSupervisorRules(ruleItems);
        setSupervisorRuleDrafts(Object.fromEntries(ruleItems.map((item) => [item.applicantRole, item.supervisorRole])));
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

  // 审批页法定节假日只读展示：按所选年份拉取（GET 对全体考勤用户开放）
  useEffect(() => {
    const year = /^\d{4}$/.test(publicHolidayYear) ? publicHolidayYear : "";
    api.get(`/attendance/legal-holidays${year ? `?year=${year}` : ""}`)
      .then((data) => setPublicHolidays((data?.items || []) as LegalHolidayItem[]))
      .catch(() => setPublicHolidays([]));
  }, [publicHolidayYear]);

  // 员工余额表：松开鼠标结束框选；点击卡片外空白处时清除已选（与 MR 采购卡一致）
  useEffect(() => {
    const stop = () => { employeeDragRef.current.active = false; };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!selectedEmployeeIds.size) return;
      // 弹窗（portal 渲染在 body 下、不在员工卡片内）或下拉浮层（listbox/popper）内部的点击不清空已选员工
      if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]')) return;
      if (employeeCardRef.current && !employeeCardRef.current.contains(event.target as Node)) setSelectedEmployeeIds(new Set());
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [selectedEmployeeIds.size]);


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
  // 「我的申请」状态筛选：pending 聚合所有 pending_* 步骤，closed 聚合已撤回/已作废
  const filteredMine = useMemo(() => {
    if (mineStatus === "all") return mine;
    if (mineStatus === "pending") return mine.filter((item) => String(item.status || "").startsWith("pending_"));
    if (mineStatus === "closed") return mine.filter((item) => ["withdrawn", "voided"].includes(item.status || ""));
    return mine.filter((item) => item.status === mineStatus);
  }, [mine, mineStatus]);
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
    if (canManage) items.push({ key: "settings", label: "考勤设置" });
    if (canViewDuty) items.push({ key: "duty", label: "值班津贴" });
    return items;
  }, [canApply, canViewAll, canManage, canViewDuty, approvalTodos.length]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) setActiveTab("approve");
  }, [tabs, activeTab]);

  // 页签与子视图写入 URL，刷新后保持当前位置（?tab= 同时供待办中心等外部深链使用）
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (activeTab === "approve") next.delete("tab"); else next.set("tab", activeTab);
    if (activeTab === "settings" && settingsView !== "rules") next.set("view", settingsView); else next.delete("view");
    if (activeTab === "records" && recordView !== "detail") next.set("record", recordView); else next.delete("record");
    if (activeTab !== "duty") next.delete("duty");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, settingsView, recordView, searchParams, setSearchParams]);




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

  // 审批页值班津贴待终审：拉取待行政终审的月度批次；操作成功后刷新列表保持双入口同步
  const loadDutyPendingBatches = async () => {
    try {
      const data = await api.get("/attendance/duty/batches?status=pending_admin");
      setDutyPendingBatches((data?.items || []) as DutyPendingBatch[]);
    } catch { /* 值班未配置时静默 */ }
  };
  useEffect(() => {
    if (activeTab === "approve" && canDutyApprove) loadDutyPendingBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canDutyApprove]);

  async function dutyAction(month: string, name: "approve" | "reject", reason = "") {
    setDutyBatchSaving(true);
    try {
      await api.post(`/attendance/duty/monthly/${month}/${name}`, reason ? { reason } : undefined);
      toast.success(name === "approve" ? `${month} 值班津贴已终审` : `${month} 已退回工程主管`);
      await loadDutyPendingBatches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setDutyBatchSaving(false);
    }
  }

  async function rejectDutyBatch(month: string) {
    const value = window.prompt("请输入退回原因");
    if (value === null) return;
    const reason = value.trim();
    if (!reason) {
      toast.error("请填写退回原因");
      return;
    }
    await dutyAction(month, "reject", reason);
  }

  async function loadDutyDetail(month: string) {
    setDutyDetailLoading(true);
    try {
      const data = await api.get(`/attendance/duty/monthly?month=${month}`);
      setDutyDetail({ month, records: (data?.records || []) as DutyDetailRecord[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载值班明细失败");
    } finally {
      setDutyDetailLoading(false);
    }
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

  // 员工余额表多选处理器（点击切换 / Shift 连选 / 拖动框选）
  function setEmployeeSelected(index: number, mode: "add" | "remove") {
    const id = employees[index]?.id;
    if (id === undefined || id === null) return;
    const key = String(id);
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (mode === "add") next.add(key); else next.delete(key);
      return next;
    });
  }

  function selectEmployeeRange(from: number, to: number) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      for (let i = start; i <= end; i += 1) next.add(String(employees[i].id));
      return next;
    });
  }

  function onEmployeeRowMouseDown(index: number, event: ReactMouseEvent<HTMLTableRowElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    if (event.shiftKey && employeeAnchorRef.current !== null) {
      selectEmployeeRange(employeeAnchorRef.current, index);
      event.preventDefault();
      return;
    }
    const key = String(employees[index]?.id);
    const mode = selectedEmployeeIds.has(key) ? "remove" : "add";
    employeeDragRef.current = { active: true, mode };
    employeeAnchorRef.current = index;
    setEmployeeSelected(index, mode);
    event.preventDefault();
  }

  function onEmployeeRowMouseEnter(index: number) {
    if (!employeeDragRef.current.active) return;
    setEmployeeSelected(index, employeeDragRef.current.mode);
  }

  async function submitBatchBalanceInit() {
    if (!batchBalanceDialog) return;
    const target = Number(batchBalanceDialog.target);
    if (!Number.isFinite(target) || target < 0) {
      toast.error("请输入有效的目标余额（不能为负数）");
      return;
    }
    if (Math.abs(target * 2 - Math.round(target * 2)) > 0.0001) {
      toast.error("目标余额须以 0.5 为单位");
      return;
    }
    setBatchBalanceSaving(true);
    try {
      const data = await api.post("/attendance/employees/batch-balance-init", {
        employeeIds: [...selectedEmployeeIds],
        balanceType: batchBalanceDialog.balanceType,
        target,
        note: batchBalanceDialog.note,
      });
      toast.success(`批量初始化完成：${data?.initialized ?? 0} 人已设定${data?.skipped ? `，${data.skipped} 人已是目标值跳过` : ""}`);
      setBatchBalanceDialog(null);
      setSelectedEmployeeIds(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量初始化失败");
    } finally {
      setBatchBalanceSaving(false);
    }
  }

  function setSupervisorRuleDraft(applicantRole: string, supervisorRole: string) {
    setSupervisorRuleDrafts((current) => ({ ...current, [applicantRole]: supervisorRole }));
  }

  async function saveSupervisorRoleRules() {
    setSupervisorRulesSaving(true);
    try {
      const items = supervisorRules.map((item) => ({
        applicantRole: item.applicantRole,
        supervisorRole: supervisorRuleDrafts[item.applicantRole] || item.supervisorRole,
      }));
      await api.put("/attendance/supervisor-role-rules", { items });
      toast.success("直属主管映射已保存，审批链按推导规则即时生效");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSupervisorRulesSaving(false);
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
      await api.put(`/attendance/legal-holidays/${encodeURIComponent(date)}`, { name, source: "manual", dayType: holidayDraft.dayType });
      toast.success("法定节假日已保存");
      setHolidayDraft({ date, name: "", dayType: "legal_holiday" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function runSyncPreview() {
    if (!/^\d{4}$/.test(syncYear)) {
      toast.error("请输入四位年份");
      return;
    }
    setSyncLoading(true);
    setSyncPreview(null);
    try {
      const data = await api.post("/attendance/legal-holidays/sync-preview", { year: syncYear });
      setSyncPreview({
        items: (data?.items || []) as Array<{ date: string; name: string; dayType: string }>,
        warnings: (data?.warnings || []) as string[],
        sources: (data?.sources || []) as Array<{ label: string; count: number; error?: string | null }>,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "同步预览失败");
    } finally {
      setSyncLoading(false);
    }
  }

  async function confirmSyncWrite() {
    if (!syncPreview?.items.length) return;
    setSyncSaving(true);
    try {
      const data = await api.post("/attendance/legal-holidays/sync-confirm", { year: syncYear });
      toast.success(`${data?.year || syncYear} 年节假日已同步（${data?.count ?? syncPreview.items.length} 天）`);
      setSyncPreview(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "同步写入失败");
    } finally {
      setSyncSaving(false);
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
  const approvalRuleMappedCount = supervisorRules.filter((rule) => {
    const supervisor = supervisorRuleDrafts[rule.applicantRole] ?? rule.supervisorRole;
    return supervisor && !["admin", "administrative_supervisor", "operations_director"].includes(supervisor);
  }).length;

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
                <b className="font-semibold text-foreground">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : formatCount(stat.value)}</b>
              </span>
            ))}
          </div>

          {canDutyApprove ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <CardTitle className="text-base">值班津贴待终审</CardTitle>
                  <Badge variant="secondary">{dutyPendingBatches.length} 月</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={loadDutyPendingBatches} disabled={dutyBatchSaving}>
                  <RefreshCw className="size-4" />刷新
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {dutyPendingBatches.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>月份</TableHead>
                        <TableHead>记录</TableHead>
                        <TableHead>人次</TableHead>
                        <TableHead>提交时间</TableHead>
                        <TableHead>提交方式</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dutyPendingBatches.map((batch) => (
                        <TableRow key={batch.month}>
                          <TableCell className="font-medium tabular-nums">{batch.month}</TableCell>
                          <TableCell className="tabular-nums">{batch.recordCount} 条</TableCell>
                          <TableCell className="tabular-nums">{batch.unitsSum} 人次</TableCell>
                          <TableCell className="text-muted-foreground">{batch.submittedAt ? new Date(batch.submittedAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</TableCell>
                          <TableCell>{batch.autoSubmitted ? <Badge variant="outline">系统自动</Badge> : <Badge variant="secondary">工程主管</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="sm" variant="outline" disabled={dutyBatchSaving} onClick={() => loadDutyDetail(batch.month)}>
                                <Eye className="mr-1 size-4" />查看明细
                              </Button>
                              <Button size="sm" disabled={dutyBatchSaving} onClick={() => dutyAction(batch.month, "approve")}>
                                <Check className="mr-1 size-4" />终审通过
                              </Button>
                              <Button size="sm" variant="outline" disabled={dutyBatchSaving} onClick={() => rejectDutyBatch(batch.month)}>
                                <X className="mr-1 size-4" />退回
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">暂无待终审的值班津贴批次</div>
                )}
              </CardContent>
            </Card>
          ) : null}

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
            items={filteredMine}
            loading={loading}
            onDownloadProof={previewProof}
            onPreviewOrder={openOrderPreview}
            showEmployee={false}
            emptyText={mineStatus === "all" ? "暂无申请记录" : "没有该状态的申请"}
            toolbar={(
              <>
                {[
                  { key: "all", label: "全部", count: mine.length },
                  { key: "pending", label: "审批中", count: mine.filter((item) => String(item.status || "").startsWith("pending_")).length },
                  { key: "approved", label: "已通过", count: mine.filter((item) => item.status === "approved").length },
                  { key: "rejected", label: "已驳回", count: mine.filter((item) => item.status === "rejected").length },
                  { key: "draft", label: "草稿", count: mine.filter((item) => item.status === "draft").length },
                  { key: "closed", label: "已撤回/作废", count: mine.filter((item) => ["withdrawn", "voided"].includes(item.status || "")).length },
                ].map((chip) => {
                  const active = mineStatus === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setMineStatus(chip.key)}
                      className={active
                        ? "flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                        : "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted/50"}
                    >
                      {chip.label}
                      <span className={active ? "font-semibold" : ""}>{chip.count}</span>
                    </button>
                  );
                })}
              </>
            )}
            actions={(item) => ["draft", "pending_delegate", "pending_approval", "pending_supervisor", "pending_hr", "pending_vp", "pending_admin"].includes(item.status || "") ? (
              <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/withdraw`, "已撤回")}>
                <RotateCcw className="mr-1 h-4 w-4" /> 撤回
              </Button>
            ) : null}
          /> : null}

          {/* 法定节假日：全体考勤用户只读可见，默认当年、可切换年份 */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-rose-500" />
                  法定节假日
                  <HelpTooltip label="全年法定节假日与调休补班一览，供请假与排班参考。节假日由管理员在「考勤设置」中维护，并有每年 11~12 月自动同步来年数据的机制；「放假」日加班按 3 倍计算加班费。" />
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">全年法定节假日一览，供请假与排班参考</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={Number(publicHolidayYear) <= 2000}
                  onClick={() => setPublicHolidayYear(String(Math.max(2000, Number(publicHolidayYear) - 1)))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-16 text-center text-lg font-bold tabular-nums">{publicHolidayYear}</div>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={Number(publicHolidayYear) >= 2100}
                  onClick={() => setPublicHolidayYear(String(Math.min(2100, Number(publicHolidayYear) + 1)))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="px-5 py-4">
              {(() => {
                const items = publicHolidays.filter((item) => item.active !== false);
                if (!items.length) return <p className="py-10 text-center text-sm text-muted-foreground">暂无 {publicHolidayYear} 年法定节假日数据</p>;
                const { ranges, orphanMakeup } = buildHolidayRanges(items);
                const todayStr = dateValue();
                const holidayDays = ranges.reduce((sum, range) => sum + range.days, 0);
                const makeupCount = items.filter((item) => item.dayType === "makeup_workday").length;
                const ongoing = ranges.find((range) => range.start <= todayStr && todayStr <= range.end) || null;
                const upcoming = ranges.find((range) => range.start > todayStr) || null;
                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="rose">{ranges.length} 个假期 · 共 {holidayDays} 天</Badge>
                      <Badge variant="orange">调休补班 {makeupCount} 天</Badge>
                      {ongoing ? (
                        <span className="text-muted-foreground">正在放假：{ongoing.name}（{fmtHolidayDate(ongoing.end)} 结束）</span>
                      ) : upcoming ? (
                        <span className="text-muted-foreground">下个假期：{upcoming.name}，还有 {dateIndex(upcoming.start) - dateIndex(todayStr)} 天</span>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {ranges.map((range) => {
                        const past = range.end < todayStr;
                        const isOngoing = ongoing?.start === range.start;
                        const isNext = !isOngoing && upcoming?.start === range.start;
                        return (
                          <div
                            key={`${range.name}-${range.start}`}
                            className={`rounded-xl border p-4 transition ${past ? "opacity-55" : ""} ${isOngoing ? "border-emerald-300 bg-emerald-50/60 shadow-sm" : isNext ? "border-rose-300 bg-rose-50/50 shadow-sm" : "bg-muted/20 hover:bg-muted/40"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-base font-semibold">{range.name}</div>
                              {isOngoing ? (
                                <Badge variant="success">进行中</Badge>
                              ) : isNext ? (
                                <Badge variant="rose">还有 {dateIndex(range.start) - dateIndex(todayStr)} 天</Badge>
                              ) : past ? (
                                <Badge variant="secondary">已结束</Badge>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm font-medium tabular-nums">
                              {fmtHolidayDate(range.start)}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">{holidayWeekday(range.start)}</span>
                              {range.end !== range.start ? (
                                <>
                                  <span className="mx-1.5 text-muted-foreground">–</span>
                                  {fmtHolidayDate(range.end)}
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">{holidayWeekday(range.end)}</span>
                                </>
                              ) : null}
                              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">共 {range.days} 天</span>
                            </div>
                            {range.makeup.length ? (
                              <div className="mt-2.5 border-t border-dashed pt-2 text-xs text-muted-foreground">
                                <span className="mr-1 inline-flex items-center gap-1 font-medium text-orange-600">
                                  <Briefcase className="h-3 w-3" />调休补班
                                </span>
                                {range.makeup.map((date) => `${fmtHolidayDate(date)}（${holidayWeekday(date)}）`).join("、")}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {orphanMakeup.length ? (
                      <div className="rounded-lg border border-dashed p-3">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                          <Briefcase className="h-3.5 w-3.5" />其他调休补班
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {orphanMakeup.map((item) => (
                            <span key={item.date} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700 ring-1 ring-inset ring-orange-200">
                              {item.name} · {fmtHolidayDate(item.date)}（{holidayWeekday(item.date)}）
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </div>
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
                    <TableHead><span className="inline-flex items-center gap-1">加班·付费 <HelpTooltip label="按加班审批结果折算的付费工时：普通加班按申请时长计，法定放假日加班自动按 3 倍计入（节假日以「考勤设置 → 法定节假日」中启用的数据为准）。" /></span></TableHead>
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
        <div ref={employeeCardRef}>
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
            {selectedEmployeeIds.size ? (
              <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-5 py-3">
                <Badge>已选 {selectedEmployeeIds.size} 人</Badge>
                <span className="text-xs text-muted-foreground">点击行切换 · Shift 连选 · 按住拖动框选</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setBatchBalanceDialog({ balanceType: "annual_leave", target: "", note: "" })}>
                    <Wallet className="mr-1 h-4 w-4" /> 批量初始化余额
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedEmployeeIds(new Set())}>清除选择</Button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="全选"
                        checked={employees.length > 0 && selectedEmployeeIds.size === employees.length}
                        onCheckedChange={(checked) => setSelectedEmployeeIds(checked ? new Set(employees.map((employee) => String(employee.id))) : new Set())}
                      />
                    </TableHead>
                    <TableHead>员工</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>籍别 / 入职</TableHead>
                    <TableHead>特休余额</TableHead>
                    <TableHead>调休余额</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee, index) => (
                    <TableRow
                      key={employee.id}
                      className={`cursor-pointer select-none ${selectedEmployeeIds.has(String(employee.id)) ? "bg-primary/10 hover:bg-primary/10" : ""}`}
                      onMouseDown={(event) => onEmployeeRowMouseDown(index, event)}
                      onMouseEnter={() => onEmployeeRowMouseEnter(index)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`选择 ${employee.employeeName || employee.username || employee.id}`}
                          checked={selectedEmployeeIds.has(String(employee.id))}
                          onCheckedChange={(checked) => setEmployeeSelected(index, checked ? "add" : "remove")}
                        />
                      </TableCell>
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
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        {loading ? "正在加载…" : "暂无员工档案"}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        </div>
      ) : null}

      {activeTab === "settings" && canManage ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">考勤设置</h2>
              <p className="mt-1 text-sm text-muted-foreground">按影响范围管理审批流程与工作日历</p>
            </div>
            <Badge variant="outline"><Settings2 className="mr-1 h-3.5 w-3.5" />配置总览</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <AttendanceMetric label="审批流程" value="自动推导" note={`直属主管映射 ${approvalRuleMappedCount} 条生效中`} icon={<ShieldCheck className="h-4 w-4" />} />
            <AttendanceMetric label="启用节日" value={`${legalHolidays.filter((item) => item.active !== false).length} 个`} note={`${holidayYear} 年工作日历`} icon={<CalendarDays className="h-4 w-4" />} />
            <AttendanceMetric label="余额换算" value="8 小时" note="标准工作日换算基准" icon={<Wallet className="h-4 w-4" />} />
          </div>
          {canManage ? (
            <div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
              <button
                type="button"
                onClick={() => setSettingsView("rules")}
                className={`h-8 rounded-md px-4 font-medium transition ${settingsView === "rules" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >审批流程</button>
              <button
                type="button"
                onClick={() => setSettingsView("holidays")}
                className={`h-8 rounded-md px-4 font-medium transition ${settingsView === "holidays" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >工作日历</button>
            </div>
          ) : null}
          {canManage && settingsView === "rules" ? (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-1.5">审批流程（自动推导） <HelpTooltip label={APPROVAL_RULE_HELP} /></CardTitle>
                    <CardDescription>审批链按固定模型自动推导，只需维护下方直属主管映射；请假满 3 天时运营负责人自动追加为终审</CardDescription>
                  </div>
                  <Button size="sm" onClick={saveSupervisorRoleRules} disabled={supervisorRulesSaving}>
                    {supervisorRulesSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} 保存映射
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-4 text-xs leading-6 text-muted-foreground">
                  <div className="mb-2 text-sm font-medium text-foreground">推导规则</div>
                  <ul className="space-y-1">
                    <li>· 普通员工（工程师 / 销售 / 助理 / 采购等）：直属主管 → 行政主管</li>
                    <li>· 工程主管 / 销售主管：行政主管 → 运营负责人</li>
                    <li>· 行政主管本人：运营负责人</li>
                    <li>· 请假满 3 天：末尾自动追加运营负责人终审</li>
                    <li>· 直属主管映射为「行政主管」时等同无直属主管步骤（自动去重）</li>
                  </ul>
                </div>
                {supervisorRules.filter((rule) => !["admin", "operations_director"].includes(rule.applicantRole)).map((rule) => {
                  const supervisorRole = supervisorRuleDrafts[rule.applicantRole] ?? rule.supervisorRole;
                  const { chain, longLeaveEscalation } = deriveApprovalChainPreview(rule.applicantRole, supervisorRole);
                  return (
                    <div key={rule.applicantRole} className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center">
                      <Badge variant="secondary" className="w-fit shrink-0">{rule.applicantRoleLabel || roleLabel(rule.applicantRole)}</Badge>
                      <Select value={supervisorRole} onValueChange={(value) => setSupervisorRuleDraft(rule.applicantRole, value)}>
                        <SelectTrigger className="w-full lg:w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((item) => (
                            <SelectItem key={item.role} value={item.role} disabled={item.role === rule.applicantRole}>
                              {item.label || roleLabel(item.role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">审批链：</span>
                        {chain.map((role, index) => (
                          <span key={role} className="inline-flex items-center gap-1.5">
                            {index > 0 ? <span className="text-muted-foreground/50">→</span> : null}
                            <span className="rounded-full bg-muted px-2 py-0.5">{roleLabel(role)}</span>
                          </span>
                        ))}
                        {longLeaveEscalation ? <span className="text-muted-foreground/70">（请假 ≥3 天追加 运营负责人）</span> : null}
                      </div>
                    </div>
                  );
                })}
                {supervisorRules.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">暂无角色映射</div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {!canManage || settingsView === "holidays" ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-1.5">法定节假日 <HelpTooltip label={HOLIDAY_TABLE_HELP} /></CardTitle>
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
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">同步官方数据</span>
                  <HelpTooltip label={HOLIDAY_SYNC_HELP} />
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={syncYear}
                    onChange={(event) => setSyncYear(event.target.value)}
                    className="h-8 w-24"
                  />
                  <Button size="sm" onClick={runSyncPreview} disabled={syncLoading}>
                    {syncLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                    获取预览
                  </Button>
                  {syncPreview ? (
                    <Button size="sm" onClick={confirmSyncWrite} disabled={syncSaving}>
                      {syncSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                      确认写入
                    </Button>
                  ) : null}
                  {syncPreview ? (
                    <Button size="sm" variant="ghost" onClick={() => setSyncPreview(null)}>取消</Button>
                  ) : null}
                </div>
                {syncPreview ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {syncPreview.sources.map((source) => (
                        <Badge key={source.label} variant={source.error ? "destructive" : "secondary"}>
                          {source.label} {source.error ? "不可用" : `${source.count} 天`}
                        </Badge>
                      ))}
                    </div>
                    {syncPreview.warnings.length ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {syncPreview.warnings.map((warning) => <div key={warning}>⚠ {warning}</div>)}
                      </div>
                    ) : null}
                    <div className="text-xs font-medium text-muted-foreground">同步结果预览（{syncPreview.items.length} 天）：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {syncPreview.items.map((item) => (
                        <span
                          key={item.date}
                          className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${
                            item.dayType === "makeup_workday"
                              ? "bg-orange-50 text-orange-700 ring-orange-200"
                              : "bg-rose-50 text-rose-700 ring-rose-200"
                          }`}
                        >
                          {item.name} · {fmtHolidayDate(item.date)}（{holidayWeekday(item.date)}）{item.dayType === "makeup_workday" ? " 补班" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {canManage ? (
                <div className="grid gap-3 md:grid-cols-[160px_1fr_140px_auto]">
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
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select value={holidayDraft.dayType} onValueChange={(value) => setHolidayDraft((current) => ({ ...current, dayType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legal_holiday">放假</SelectItem>
                        <SelectItem value="makeup_workday">调休补班</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <TableHead>类型</TableHead>
                      <TableHead><span className="inline-flex items-center gap-1">来源 <HelpTooltip label={HOLIDAY_SOURCE_HELP} /></span></TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legalHolidays.map((item) => (
                      <TableRow key={item.date} className={item.active === false ? "opacity-55" : ""}>
                        <TableCell>
                          <div className="font-medium tabular-nums">{item.date}</div>
                          <div className="text-xs text-muted-foreground">{holidayWeekday(item.date)}</div>
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant={(item.dayType || "legal_holiday") === "makeup_workday" ? "orange" : "rose"}>
                            {DAY_TYPE_LABELS[item.dayType || "legal_holiday"] || "放假"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{HOLIDAY_SOURCE_LABELS[item.source] || item.source || "-"}</TableCell>
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
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无法定节假日</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          ) : null}
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

      <Dialog open={Boolean(batchBalanceDialog)} onOpenChange={(open) => { if (!open) setBatchBalanceDialog(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>批量初始化余额</DialogTitle>
            <DialogDescription>把选中的 {selectedEmployeeIds.size} 人的余额统一设定为目标值，差额自动计入调整流水</DialogDescription>
          </DialogHeader>
          {batchBalanceDialog ? (
            <div className="space-y-4">
              <div className="max-h-28 overflow-y-auto rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {employees.filter((employee) => selectedEmployeeIds.has(String(employee.id))).map((employee) => employee.employeeName || employee.username).join("、")}
              </div>
              <div className="space-y-2">
                <Label>余额类型</Label>
                <Select
                  value={batchBalanceDialog.balanceType}
                  onValueChange={(value) => setBatchBalanceDialog((current) => {
                    if (!current) return current
                    const balanceType = value as "annual_leave" | "comp_time"
                    // 切换类型保留已输入的目标值（单位变化用户自理，不清空避免再度丢失）
                    return balanceType === current.balanceType ? current : { ...current, balanceType }
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual_leave">特休（按天）</SelectItem>
                    <SelectItem value="comp_time">调休（按小时）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>设定为（{batchBalanceDialog.balanceType === "annual_leave" ? "天" : "小时"}）</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="如 10"
                  value={batchBalanceDialog.target}
                  onChange={(event) => setBatchBalanceDialog((current) => current ? { ...current, target: event.target.value } : current)}
                />
                <p className="text-xs text-muted-foreground">须以 0.5 为单位；已是目标值的员工自动跳过</p>
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Input
                  placeholder="备注（可选，默认「批量初始化」）"
                  value={batchBalanceDialog.note}
                  onChange={(event) => setBatchBalanceDialog((current) => current ? { ...current, note: event.target.value } : current)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchBalanceDialog(null)} disabled={batchBalanceSaving}>取消</Button>
            <Button onClick={submitBatchBalanceInit} disabled={batchBalanceSaving}>
              {batchBalanceSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              确认初始化
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dutyDetail)} onOpenChange={(open) => { if (!open) setDutyDetail(null); }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>值班津贴明细{dutyDetail ? `：${dutyDetail.month}` : ""}</DialogTitle>
            <DialogDescription>该月 7×24 值班与法定节假日值班记录，供终审核对值班人员与天数。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {dutyDetailLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中…</div>
            ) : dutyDetail && dutyDetail.records.length ? (
              (() => {
                // 按工程师汇总：一人一行（对应纸质加班申请单「一人一张、按週填写」的习惯），
                // 分列「7×24 值班（平日加班）」与「法定节假日（国定假日）」
                const byEmployee = new Map<string, { name: string; weekendDates: string[]; holidays: Array<{ name: string; units: number; start: string; end: string }>; total: number }>();
                for (const record of dutyDetail.records) {
                  const name = record.employee_name || "-";
                  if (!byEmployee.has(name)) byEmployee.set(name, { name, weekendDates: [], holidays: [], total: 0 });
                  const group = byEmployee.get(name)!;
                  group.total += Number(record.units);
                  if (record.duty_type === "legal_holiday_on_call") {
                    group.holidays.push({
                      name: record.reason || "法定节假日",
                      units: Number(record.units),
                      start: String(record.duty_date).slice(5, 10),
                      end: record.duty_end_date ? String(record.duty_end_date).slice(5, 10) : "",
                    });
                  } else {
                    group.weekendDates.push(String(record.duty_date).slice(5, 10));
                  }
                }
                const groups = [...byEmployee.values()];
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>工程师</TableHead>
                        <TableHead>7×24 值班（平日加班）</TableHead>
                        <TableHead>法定节假日（国定假日）</TableHead>
                        <TableHead className="text-right">合计人次</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.map((group) => (
                        <TableRow key={group.name}>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell>
                            {group.weekendDates.length ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="cyan">{group.weekendDates.length} 次</Badge>
                                <span className="text-xs text-muted-foreground tabular-nums">{group.weekendDates.join("、")}</span>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            {group.holidays.length ? (
                              <div className="space-y-1">
                                {group.holidays.map((holiday, index) => (
                                  <div key={index} className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="rose">{holiday.name}</Badge>
                                    <span className="text-xs text-muted-foreground tabular-nums">{holiday.start}{holiday.end && holiday.end !== holiday.start ? `~${holiday.end}` : ""} × {holiday.units} 天</span>
                                  </div>
                                ))}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-right"><span className="font-semibold tabular-nums">{group.total}</span><span className="ml-1 text-xs text-muted-foreground">人次</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">该月暂无值班记录</div>
            )}
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => rejectDutyBatch(dutyDetail?.month || "")} disabled={dutyBatchSaving}>
              <X className="mr-1 size-4" />退回
            </Button>
            <Button
              onClick={async () => { if (dutyDetail) { await dutyAction(dutyDetail.month, "approve"); setDutyDetail(null); } }}
              disabled={dutyBatchSaving}
            >
              <Check className="mr-1 size-4" />终审通过
            </Button>
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
                  onValueChange={(value) => setAdjustDialog((current) => {
                    if (!current) return current
                    const balanceType = value as AdjustDraft["balanceType"]
                    // 切换类型保留已输入的金额（单位变化用户自理，不清空避免再度丢失）
                    return balanceType === current.draft.balanceType ? current : { ...current, draft: { ...current.draft, balanceType } }
                  })}
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
  const typeLabel = serviceOrderTypeLabel(order);
  // 空字段不占位：只展示有值的项（工单号 / 客户 / 设备 / 类型）
  const facts = [
    order.customerName,
    order.deviceName,
    typeLabel === "- / -" ? "" : typeLabel,
  ].filter((value) => value && value !== "-");
  return (
    <div className="mt-1.5 max-w-xl rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
        {onPreview ? (
          <button
            type="button"
            onClick={() => onPreview(order)}
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-3 w-3" />
            工单 {orderLabel}
          </button>
        ) : (
          <span className="font-medium text-foreground">工单 {orderLabel}</span>
        )}
        {facts.map((fact) => (
          <span key={fact} className="inline-flex items-center gap-2">
            <span className="text-muted-foreground/40">|</span>
            {fact}
          </span>
        ))}
      </div>
      {order.issueDescription ? (
        <div className="mt-0.5 truncate text-muted-foreground" title={order.issueDescription}>问题：{order.issueDescription}</div>
      ) : null}
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

// 审批链默认折叠为一行摘要（级数 + 当前/最终状态），点击展开完整签核过程。
// 申请明细行信息密度高，全量审批历史属低频查档信息，不应默认占视觉面积。
function ApprovalChain({ steps }: { steps: ApprovalStep[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!steps.length) return null;
  const current = steps.find((step) => step.status === "pending");
  const rejected = steps.find((step) => step.status === "rejected");
  const summary = current
    ? `${steps.length} 级审批 · 当前：${approvalStepLabel(current)}`
    : rejected
      ? `${steps.length} 级审批 · ${approvalStepLabel(rejected)}已驳回`
      : `${steps.length} 级审批 · 已全部通过`;
  return (
    <div className="mt-1 text-xs leading-5 text-muted-foreground">
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-muted-foreground transition hover:text-foreground"
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "" : "-rotate-90"}`} />
        {summary}
      </button>
      {expanded ? (
        <div className="mt-0.5 border-l pl-3">
          {steps.map((step) => (
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
    </div>
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
          <EmptyState title={emptyText} className="min-h-0" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  {showEmployee ? <TableHead>员工</TableHead> : null}
                  <TableHead>类型</TableHead>
                  <TableHead>明细</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>状态</TableHead>
                  {hasActions ? <TableHead>操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    {showEmployee ? <TableCell className="font-medium">{item.employeeName || "-"}</TableCell> : null}
                    <TableCell>{requestTypeBadge(item.requestType)}</TableCell>
                    <TableCell>
                      <div>{requestDetailContent(item)}</div>
                      {item.reason ? (
                        <div className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                          <span className="shrink-0 text-xs font-medium text-muted-foreground/60">申请说明</span>
                          <span>{item.reason}</span>
                        </div>
                      ) : null}
                      {item.requestType === "overtime" && item.sourceType === "service_order" ? (
                        <ServiceOrderApprovalSummary
                          order={item.serviceOrder || { id: item.sourceId || "-", unavailable: true }}
                          onPreview={onPreviewOrder}
                        />
                      ) : null}
                      {(() => {
                        const meta: ReactNode[] = [];
                        if (item.delegateEmployeeName) {
                          meta.push(<span key="delegate" className="inline-flex items-center gap-1"><Users className="h-3 w-3" />代理人 {item.delegateEmployeeName}</span>);
                        }
                        if (typeof item.workingDays === "number") {
                          meta.push(<span key="days" className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{days(item.workingDays)} 个工作日</span>);
                        }
                        if (item.proofFiles?.length) {
                          meta.push(
                            <span key="proof" className="inline-flex flex-wrap items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              {item.proofFiles.map((file, index) => (
                                <span key={file.id}>
                                  {index ? "、" : ""}
                                  <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => onDownloadProof?.(file)}>
                                    {file.originalName || `附件 #${file.id}`}
                                  </button>
                                </span>
                              ))}
                            </span>,
                          );
                        } else if (item.proofFileCount) {
                          meta.push(<span key="proof" className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />证明附件 {item.proofFileCount} 份</span>);
                        }
                        return meta.length ? <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">{meta}</div> : null;
                      })()}
                      {item.approvals?.length ? <ApprovalChain steps={item.approvals} /> : null}
                    </TableCell>
                    <TableCell>
                      <div>{requestTimeRange(item)}</div>
                      {item.hours != null ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">{requestDuration(item)}</div>
                      ) : null}
                    </TableCell>
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
