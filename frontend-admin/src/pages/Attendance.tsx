import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Briefcase, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Download, ExternalLink, Eye, Loader2, Paperclip, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Send, Settings2, ShieldCheck, Trash2, Users, Wallet, X } from "lucide-react";
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
import { formatCount, formatDate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { HelpTooltip } from "@/components/HelpTooltip";
import { ReasonConfirmDialog } from "@/components/ReasonConfirmDialog";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";
import { RequestList, requestTypeLabel } from "@/components/attendance/RequestList";
import { HolidayPanel } from "@/components/attendance/HolidayPanel";
import { SettingsHolidays, type HolidayDraft, type HolidaySyncPreview } from "@/components/attendance/SettingsHolidays";
import { ReportExportDialog } from "@/components/attendance/ReportExportDialog";
import { AdjustBalanceDialog, BatchBalanceDialog, EmployeeEditDialog } from "@/components/attendance/EmployeeDialogs";
import { BalanceLedgerPanel, type BalanceLedgerItem } from "@/components/attendance/BalanceLedgerPanel";

// 法定节假日说明文案已迁 SettingsHolidays；审批链规则说明保留在本页（设置-审批流程视图使用）
const APPROVAL_RULE_HELP = "审批链按固定模型自动推导，无需逐级配置：普通员工 = 直属主管 → 行政主管；工程/销售主管 = 行政主管 → 运营负责人；行政主管本人 = 运营负责人；请假满 3 天自动追加运营负责人终审。直属主管映射为「行政主管」时等同无直属主管步骤（自动去重）。管理员与行政主管拥有全部考勤权限，可审批任意环节。";

const ANNUAL_LEAVE_HELP = "特休（特别休假，即年假）按天计，1 天＝8 小时；余额由行政在员工页签的「余额控制台」中初始化或调整，请假通过后自动扣减。";
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
  type AttendanceRequest,
  type EmployeeProfile,
  type LegalHolidayItem,
  type OvertimeSegment,
  type OvertimeServiceOrder,
  type RequestType,
  type ServiceOrderSummary,
  NATIONALITY_LABELS,
  REQUEST_TYPE_LABELS,
  annualUsageDays,
  monthDateRange,
  roleLabel,
  serviceOrderTypeLabel,
} from "@/pages/attendance-shared";

type AttendanceTab = "approve" | "balance" | "records" | "employees" | "settings" | "duty";

// 待办中心等外部入口通过 ?tab=approve 深链定位考勤页签
const ATTENDANCE_TABS: AttendanceTab[] = ["approve", "balance", "records", "employees", "settings", "duty"];
function parseTabParam(value: string | null): AttendanceTab {
  return ATTENDANCE_TABS.includes(value as AttendanceTab) ? (value as AttendanceTab) : "approve";
}



interface ProofPreview {
  url: string;
  originalName: string;
  mimeType: string;
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

// 统一原因/确认对话框（ReasonConfirmDialog）的待执行动作描述
interface PendingConfirmAction {
  title: string;
  description?: ReactNode;
  warning?: ReactNode;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  run: (reason: string) => Promise<boolean>;
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




// 与后端 listRequests 的 LIMIT 保持一致：达到即视为截断，提示用日期范围查档
const RECORDS_LIMIT = 300;




function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}


function todayYear() {
  return new Date().getFullYear().toString();
}



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







export function Attendance() {
  const { hasPermission } = useAuth();
  const canApply = hasPermission("attendance.apply");
  const canApprove = hasPermission("attendance.approve");
  const canViewAll = hasPermission("attendance.view", "attendance.admin.approve", "attendance.hr.approve", "attendance.vp.approve", "attendance.manage");
  // 申请明细可见性（2026-08-24 裁决）：全员查档限 view-all 角色；有审批权限者可见审批链与自己相关的申请（scope=related）
  // 布局（2026-08-25 再裁决）：审批人的经手历史不再单列页签，收进「申请与审批」的审批卡片（待办/已办切换）；
  // 记录与报表页签只保留给全员查档角色（含月度汇总/导出/作废）；员工本人记录由「我的申请」覆盖
  const canViewRecords = canViewAll || canApprove;
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
  // 我的申请-草稿行「继续提交」：预填抽屉并锁定表单（草稿内容不可改，仅补材料提交）
  const [resumeDraft, setResumeDraft] = useState<AttendanceRequest | null>(null);
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
  // 员工余额表多选：点击行切换、Shift 连选、按住拖动框选（交互与 MR 采购卡一致）
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  // 员工相关弹窗：draft 与保存态内化在 components/attendance/EmployeeDialogs
  const [editEmployee, setEditEmployee] = useState<EmployeeProfile | null>(null);
  const [adjustEmployee, setAdjustEmployee] = useState<EmployeeProfile | null>(null);
  const [batchBalanceOpen, setBatchBalanceOpen] = useState(false);
  const selectedEmployeesList = useMemo(() => employees.filter((employee) => selectedEmployeeIds.has(String(employee.id))), [employees, selectedEmployeeIds]);
  // 值班津贴待终审批次（审批 tab 与值班 tab 双入口，状态实时同步）
  const [dutyPendingBatches, setDutyPendingBatches] = useState<DutyPendingBatch[]>([]);
  const [dutyBatchSaving, setDutyBatchSaving] = useState(false);
  const [dutyDetail, setDutyDetail] = useState<{ month: string; records: DutyDetailRecord[] } | null>(null);
  const [dutyDetailLoading, setDutyDetailLoading] = useState(false);
  // 员工本人额度流水（「额度变动」页签，进入页签时按需拉取）
  const [balanceLedger, setBalanceLedger] = useState<BalanceLedgerItem[]>([]);
  const [balanceLedgerLoading, setBalanceLedgerLoading] = useState(false);
  const employeeDragRef = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" });
  const employeeAnchorRef = useRef<number | null>(null);
  const employeeCardRef = useRef<HTMLDivElement | null>(null);
  // 点击工单号先显示申请快照，再加载完整工单详情；申请时的核心事实仍以快照为准。
  const [previewOrder, setPreviewOrder] = useState<ServiceOrderSummary | null>(null);
  const [previewOrderLoading, setPreviewOrderLoading] = useState(false);
  const [previewOrderError, setPreviewOrderError] = useState("");
  const [previewOrderFileId, setPreviewOrderFileId] = useState<string | number | null>(null);
  const previewOrderRequestRef = useRef(0);
  const [recordStatus, setRecordStatus] = useState("all");
  // 审批卡片视图：todo=待办队列，done=已办历史（仅无全员查档权限的审批人可见此切换）
  const [approvalView, setApprovalView] = useState<"todo" | "done">("todo");
  const [recordType, setRecordType] = useState("all");
  const [recordKeyword, setRecordKeyword] = useState("");
  const [recordStartDate, setRecordStartDate] = useState("");
  const [recordEndDate, setRecordEndDate] = useState("");
  // 高危操作统一确认对话框（驳回/退回/作废/撤回/停用节假日）
  const [pendingAction, setPendingAction] = useState<PendingConfirmAction | null>(null);
  const [pendingActionSaving, setPendingActionSaving] = useState(false);
  const [reportMonth, setReportMonth] = useState(todayMonth());
  const [reportItems, setReportItems] = useState<MonthlyReportItem[]>([]);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [holidayYear, setHolidayYear] = useState(todayYear());
  const [applicationHolidays, setApplicationHolidays] = useState<LegalHolidayItem[]>([]);
  const [legalHolidays, setLegalHolidays] = useState<LegalHolidayItem[]>([]);
  const [holidayDraft, setHolidayDraft] = useState({ date: dateValue(), name: "", dayType: "legal_holiday" });
  // 审批页节假日展示按所选年份前端过滤（与申请抽屉共用 load 的全量数据，不再重复请求）
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
        calls.push(api.get("/attendance/employees"));
        calls.push(api.get("/attendance/supervisor-role-rules"));
      }
      const [meData, mineData, supervisorData, applicationHolidayData, employeeData, roleRuleData] = await Promise.all(calls);
      setMyProfile((meData?.item || null) as EmployeeProfile | null);
      setMine((mineData?.items || []) as AttendanceRequest[]);
      setSupervisorTodo((supervisorData?.items || []) as AttendanceRequest[]);
      setApplicationHolidays((applicationHolidayData?.items || []) as LegalHolidayItem[]);
      if (canViewAll) {
        const supervisorRulesData = (roleRuleData || {}) as { roles?: RoleOption[]; items?: Array<{ applicantRole: string; applicantRoleLabel?: string; supervisorRole: string }> };
        const ruleItems = supervisorRulesData.items || [];
        setEmployees((employeeData?.items || []) as EmployeeProfile[]);
        setRoleOptions(supervisorRulesData.roles || []);
        setSupervisorRules(ruleItems);
        setSupervisorRuleDrafts(Object.fromEntries(ruleItems.map((item) => [item.applicantRole, item.supervisorRole])));
      }
      // 子表各自带权限/参数守卫，幂等可重复调用
      await Promise.all([loadAllRequests(), loadReportItems(), loadLegalHolidays()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAll]);

  // 申请明细独立加载：日期范围变化只重拉本列表，不动整页；
  // 无全员查档权限的审批人退化为 scope=related（仅审批链相关），操作成功后由 load() 顺带调用保持新鲜
  async function loadAllRequests() {
    if (!canViewRecords) return;
    try {
      const params = new URLSearchParams({ scope: canViewAll ? "all" : "related" });
      if (recordStartDate) params.set("startDate", recordStartDate);
      if (recordEndDate) params.set("endDate", recordEndDate);
      const data = await api.get(`/attendance/requests?${params.toString()}`);
      setAllRequests((data?.items || []) as AttendanceRequest[]);
    } catch { /* 静默：主 load 已统一报错，避免双 toast */ }
  }

  useEffect(() => {
    loadAllRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewRecords, canViewAll, recordStartDate, recordEndDate]);

  // 月度汇总独立加载：切换月份只重拉本报表，不动整页
  async function loadReportItems() {
    if (!canViewAll) return;
    try {
      const data = await api.get(`/attendance/reports/monthly?month=${reportMonth}`);
      setReportItems((data?.items || []) as MonthlyReportItem[]);
    } catch { /* 静默：主 load 已统一报错，避免双 toast */ }
  }

  useEffect(() => {
    loadReportItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAll, reportMonth]);

  // 额度变动页签：进入时拉取本人流水（变动多由审批人/行政触发，页内自带刷新按钮兜底）
  async function loadBalanceLedger() {
    if (!canApply) return;
    setBalanceLedgerLoading(true);
    try {
      const data = await api.get("/attendance/me/balance-ledger");
      setBalanceLedger((data?.items || []) as BalanceLedgerItem[]);
    } catch { /* 静默：页签内刷新按钮可重试 */ } finally {
      setBalanceLedgerLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "balance") loadBalanceLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canApply]);

  // 考勤设置-工作日历独立加载：年份输满 4 位才发请求（避免逐击键触发整页重载）
  async function loadLegalHolidays() {
    if (!canViewAll || !/^\d{4}$/.test(holidayYear)) return;
    try {
      const data = await api.get(`/attendance/legal-holidays?year=${holidayYear}`);
      setLegalHolidays((data?.items || []) as LegalHolidayItem[]);
    } catch { /* 静默：同上 */ }
  }

  useEffect(() => {
    loadLegalHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAll, holidayYear]);

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
    if (canApply) items.push({ key: "balance", label: "额度变动" });
    if (canViewAll) items.push({ key: "records", label: "记录与报表" });
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




  async function action(path: string, success: string, body?: any): Promise<boolean> {
    try {
      await api.post(path, body);
      toast.success(success);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
      return false;
    }
  }

  async function confirmPendingAction(reason: string) {
    if (!pendingAction) return;
    setPendingActionSaving(true);
    try {
      const ok = await pendingAction.run(reason);
      if (ok) setPendingAction(null);
    } finally {
      setPendingActionSaving(false);
    }
  }

  function reject(item: AttendanceRequest) {
    setPendingAction({
      title: "驳回申请",
      description: <>{item.employeeName || "-"} · {requestTypeLabel(item.requestType)}</>,
      confirmLabel: "确认驳回",
      destructive: true,
      reasonRequired: true,
      reasonLabel: "驳回原因",
      reasonPlaceholder: "请填写驳回原因（将通知申请人）",
      run: (reason) => action(`/attendance/requests/${item.id}/reject`, "已驳回", { reason }),
    });
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

  async function dutyAction(month: string, name: "approve" | "reject", reason = ""): Promise<boolean> {
    setDutyBatchSaving(true);
    try {
      await api.post(`/attendance/duty/monthly/${month}/${name}`, reason ? { reason } : undefined);
      toast.success(name === "approve" ? `${month} 值班津贴已终审` : `${month} 已退回工程主管`);
      await loadDutyPendingBatches();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setDutyBatchSaving(false);
    }
  }

  // 行内一键操作（通过/终审）防重复点击：请求进行中禁用该行按钮并转圈
  const [rowActionId, setRowActionId] = useState("");
  async function approveRow(item: AttendanceRequest, path: string, success: string) {
    setRowActionId(String(item.id));
    try {
      await action(`/attendance/requests/${item.id}/${path}`, success);
    } finally {
      setRowActionId("");
    }
  }

  function rejectDutyBatch(month: string) {
    setPendingAction({
      title: "退回值班津贴批次",
      description: `${month} 批次将退回工程主管重新确认`,
      confirmLabel: "确认退回",
      destructive: true,
      reasonRequired: true,
      reasonLabel: "退回原因",
      reasonPlaceholder: "请填写退回原因",
      run: async (reason) => {
        const ok = await dutyAction(month, "reject", reason);
        if (ok) setDutyDetail(null);
        return ok;
      },
    });
  }

  function withdrawRequest(item: AttendanceRequest) {
    setPendingAction({
      title: "撤回申请",
      description: <>{requestTypeLabel(item.requestType)} · 撤回后不再进入审批，可重新新建申请。</>,
      confirmLabel: "确认撤回",
      run: () => action(`/attendance/requests/${item.id}/withdraw`, "已撤回"),
    });
  }

  function voidRequest(item: AttendanceRequest) {
    setPendingAction({
      title: "作废申请",
      description: <>{item.employeeName || "-"} · {requestTypeLabel(item.requestType)}</>,
      warning: "作废将回滚该申请已结算的余额（特休/调休自动返还），操作不可撤销，原因将留档备查。",
      confirmLabel: "确认作废",
      destructive: true,
      reasonRequired: true,
      reasonLabel: "作废原因",
      reasonPlaceholder: "请填写作废原因（留档备查）",
      run: (reason) => action(`/attendance/requests/${item.id}/void`, "已作废", { reason }),
    });
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

  function disableLegalHoliday(item: LegalHolidayItem) {
    setPendingAction({
      title: "停用法定节假日",
      description: `${item.date} ${item.name} 停用后将不再参与请假/加班类型核算。`,
      confirmLabel: "确认停用",
      destructive: true,
      run: async () => {
        try {
          await api.delete(`/attendance/legal-holidays/${encodeURIComponent(item.date)}`);
          toast.success("法定节假日已停用");
          await load();
          return true;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "停用失败");
          return false;
        }
      },
    });
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

  const hasRecordFilter = recordStatus !== "all" || recordType !== "all" || recordKeyword.trim() !== "" || recordStartDate !== "" || recordEndDate !== "";
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
  // 审批人「已办历史」：仅无全员查档权限的审批人（admin 等走「记录与报表」页签，避免功能重复）；
  // 只要持审批权限就常驻（不看当前待办数），否则没待办时历史入口会消失
  const showApprovalHistory = canApprove && !canViewAll;
  // 申请记录筛选条：审批人「已办历史」与「记录与报表-申请明细」共用（状态/类型/姓名/日期/重置）
  const recordFilterControls = (
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
      <div className="flex items-center gap-1.5">
        <Input className="h-8 w-36" type="date" aria-label="开始日期" value={recordStartDate} onChange={(event) => setRecordStartDate(event.target.value)} />
        <span className="text-xs text-muted-foreground">至</span>
        <Input className="h-8 w-36" type="date" aria-label="结束日期" min={recordStartDate || undefined} value={recordEndDate} onChange={(event) => setRecordEndDate(event.target.value)} />
      </div>
      {hasRecordFilter ? <Button variant="ghost" size="sm" onClick={() => { setRecordStatus("all"); setRecordType("all"); setRecordKeyword(""); setRecordStartDate(""); setRecordEndDate(""); }}>重置</Button> : null}
    </div>
  );
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

  // 审批页节假日展示：从 load 的全量数据按所选年份前端过滤
  const publicHolidays = useMemo(
    () => applicationHolidays.filter((item) => item.date.startsWith(publicHolidayYear)),
    [applicationHolidays, publicHolidayYear],
  );


  const statTiles = [
    ...(canApply ? [
      { label: "可用特休", value: `${days(annualBalanceDays(myProfile))} 天`, warn: annualBalanceDays(myProfile) <= 1 },
      { label: "可用调休", value: `${hours(myProfile?.compTimeBalanceHours)} 小时`, warn: false },
      { label: "我的进行中", value: String(pendingMine), warn: false },
    ] : []),
    ...(isApprover ? [{ label: "待我审批", value: String(approvalTodos.length), warn: false }] : []),
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
            <Button onClick={() => { setResumeDraft(null); setApplyOpen(true); }}>
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
                <b className={`font-semibold ${stat.warn ? "text-amber-600" : "text-foreground"}`}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : formatCount(stat.value)}</b>
                {stat.warn && !loading ? <span className="text-xs text-amber-600">不足</span> : null}
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

          {canApprove ? (
            <RequestList
              title={showApprovalHistory && approvalView === "done" ? "审批记录" : "待我审批"}
              description={showApprovalHistory && approvalView === "done"
                ? "审批链与我相关的全部申请（含已办结历史），只读"
                : "代理确认与当前角色审批待办集中在这里处理"}
              items={showApprovalHistory && approvalView === "done" ? allRequests : approvalTodos}
              loading={loading}
              onDownloadProof={previewProof}
              onPreviewOrder={openOrderPreview}
              emptyText={showApprovalHistory && approvalView === "done" ? "暂无相关申请记录" : "暂无待审批的申请"}
              toolbar={showApprovalHistory ? (
                <>
                  {[
                    { key: "todo", label: "待我审批", count: approvalTodos.length },
                    { key: "done", label: "已办历史", count: allRequests.length },
                  ].map((view) => {
                    const active = approvalView === view.key;
                    return (
                      <button
                        key={view.key}
                        type="button"
                        onClick={() => setApprovalView(view.key as "todo" | "done")}
                        className={active
                          ? "flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                          : "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted/50"}
                      >
                        {view.label}
                        <span className={active ? "font-semibold" : ""}>{view.count}</span>
                      </button>
                    );
                  })}
                </>
              ) : undefined}
              actions={showApprovalHistory && approvalView === "done" ? undefined : (item) => {
                const config: Record<string, { path: string; success: string }> = {
                  pending_delegate: { path: "approve-delegate", success: "代理人已通过" },
                  pending_approval: { path: "approve", success: "当前审批步骤已通过" },
                  pending_supervisor: { path: "approve-supervisor", success: "主管已通过" },
                  pending_hr: { path: "approve-hr", success: "人事已通过" },
                  pending_vp: { path: "approve-vp", success: "副总已通过" },
                };
                const current = config[item.status || ""];
                const busy = rowActionId === String(item.id);
                if (current) return (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => approveRow(item, current.path, current.success)}>
                      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} 通过
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => reject(item)}>
                      <X className="mr-1 h-4 w-4" /> 驳回
                    </Button>
                  </>
                );
                if (item.status === "pending_admin" && canAdminApprove) return (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => approveRow(item, "approve-admin", "行政终审已通过")}>
                      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />} 终审通过
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => reject(item)}>
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
              <>
                {item.status === "draft" ? (
                  <Button size="sm" onClick={() => { setResumeDraft(item); setApplyOpen(true); }}>
                    <Send className="mr-1 h-4 w-4" /> 继续提交
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => withdrawRequest(item)}>
                  <RotateCcw className="mr-1 h-4 w-4" /> 撤回
                </Button>
              </>
            ) : null}
          /> : null}

          <HolidayPanel publicHolidays={publicHolidays} publicHolidayYear={publicHolidayYear} setPublicHolidayYear={setPublicHolidayYear} />
        </div>
      ) : null}

      {activeTab === "balance" && canApply ? (
        <BalanceLedgerPanel items={balanceLedger} loading={balanceLedgerLoading} profile={myProfile} onRefresh={loadBalanceLedger} />
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
            {allRequests.length >= RECORDS_LIMIT ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                已到达单次 {RECORDS_LIMIT} 条上限，仅显示最近记录；查更早记录请用下方起止日期缩小范围。
              </div>
            ) : null}
            <RequestList
              title="申请明细"
              description="全员全部类型申请记录，审批通过后可作废"
              items={filteredAllRequests}
              loading={loading}
              onDownloadProof={previewProof}
              onPreviewOrder={openOrderPreview}
              emptyText={hasRecordFilter ? "没有符合筛选条件的记录" : "暂无记录"}
              toolbar={recordFilterControls}
              actions={canAdminApprove ? (item) => item.status === "approved" ? (
                <Button size="sm" variant="outline" onClick={() => voidRequest(item)}><X className="mr-1 h-4 w-4" /> 作废</Button>
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
                  <Button onClick={() => setReportExportOpen(true)}>
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
                    <TableHead><span className="inline-flex items-center gap-1">特休 <HelpTooltip label={ANNUAL_LEAVE_HELP} /></span></TableHead>
                    <TableHead>病假</TableHead>
                    <TableHead>事假</TableHead>
                    <TableHead>其他假</TableHead>
                    <TableHead>加班·转调休</TableHead>
                    <TableHead><span className="inline-flex items-center gap-1">加班·付费 <HelpTooltip label="按加班审批结果记录的付费时长；三倍工资日的加班会标记「3倍」角标，具体加班费由行政线下核计。" /></span></TableHead>
                    <TableHead>调休使用</TableHead>
                    <TableHead><span className="inline-flex items-center gap-1">特休余额 <HelpTooltip label={ANNUAL_LEAVE_HELP} /></span></TableHead>
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
                  <Button size="sm" onClick={() => setBatchBalanceOpen(true)}>
                    <Wallet className="mr-1 h-4 w-4" /> 批量初始化余额
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedEmployeeIds(new Set())}>清除选择</Button>
                </div>
              </div>
            ) : null}
            <ResponsiveList
              items={employees}
              keyExtractor={(employee) => employee.id}
              breakpoint="lg"
              renderCard={(employee, index) => (
                <ResponsiveCard
                  title={(
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        aria-label={`选择 ${employee.employeeName || employee.username || employee.id}`}
                        checked={selectedEmployeeIds.has(String(employee.id))}
                        onCheckedChange={(checked) => setEmployeeSelected(index, checked ? "add" : "remove")}
                      />
                      <span className="truncate">{employee.employeeName || "-"}</span>
                    </span>
                  )}
                  status={<Badge variant={employee.attendanceEnabled === false ? "outline" : "success"}>{employee.attendanceEnabled === false ? "停用" : "启用"}</Badge>}
                  subtitle={`${employee.username || "-"} · ${roleLabel(employee.role)}`}
                  fields={[
                    { label: "籍别 / 入职", value: `${NATIONALITY_LABELS[employee.nationality || "mainland"] || "-"} · ${formatDate(employee.hireDate)}` },
                    { label: "特休余额", value: `${days(annualBalanceDays(employee))} 天` },
                    { label: "调休余额", value: `${hours(employee.compTimeBalanceHours)} 小时` },
                  ]}
                  actions={(
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditEmployee(employee)}>
                        <Pencil className="mr-1 h-4 w-4" /> 编辑
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAdjustEmployee(employee)}>
                        <Wallet className="mr-1 h-4 w-4" /> 调余额
                      </Button>
                    </>
                  )}
                />
              )}
            >
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
                    <TableHead><span className="inline-flex items-center gap-1">特休余额 <HelpTooltip label={ANNUAL_LEAVE_HELP} /></span></TableHead>
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
                          <Button size="sm" variant="outline" onClick={() => setEditEmployee(employee)}>
                            <Pencil className="mr-1 h-4 w-4" /> 编辑
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAdjustEmployee(employee)}>
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
            </ResponsiveList>
            {employees.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground lg:hidden">
                {loading ? "正在加载…" : "暂无员工档案"}
              </div>
            ) : null}
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

          {settingsView === "holidays" ? (
            <SettingsHolidays
              canManage={canManage}
              holidayYear={holidayYear}
              setHolidayYear={setHolidayYear}
              syncYear={syncYear}
              setSyncYear={setSyncYear}
              syncPreview={syncPreview}
              setSyncPreview={setSyncPreview}
              syncLoading={syncLoading}
              syncSaving={syncSaving}
              runSyncPreview={runSyncPreview}
              confirmSyncWrite={confirmSyncWrite}
              holidayDraft={holidayDraft}
              setHolidayDraft={setHolidayDraft}
              saveLegalHoliday={saveLegalHoliday}
              legalHolidays={legalHolidays}
              disableLegalHoliday={disableLegalHoliday}
              enableLegalHoliday={enableLegalHoliday}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "duty" && canViewDuty ? (
        <AttendanceDuty embedded />
      ) : null}

      <AttendanceApplyDrawer
        open={applyOpen}
        onOpenChange={(open) => { setApplyOpen(open); if (!open) setResumeDraft(null); }}
        onSubmitted={load}
        myProfile={myProfile}
        holidayDates={applicationHolidayDates}
        resumeDraft={resumeDraft}
      />

      <ReasonConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.title || ""}
        description={pendingAction?.description}
        warning={pendingAction?.warning}
        reasonRequired={pendingAction?.reasonRequired}
        reasonLabel={pendingAction?.reasonLabel}
        reasonPlaceholder={pendingAction?.reasonPlaceholder}
        confirmLabel={pendingAction?.confirmLabel || "确认"}
        destructive={pendingAction?.destructive}
        loading={pendingActionSaving}
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
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
            {proofPreview ? (
              <Button asChild variant="outline">
                <a href={proofPreview.url} download={proofPreview.originalName}>
                  <Download className="mr-1 h-4 w-4" />下载原文件
                </a>
              </Button>
            ) : null}
            <Button variant="outline" onClick={closeProofPreview}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BatchBalanceDialog open={batchBalanceOpen} selectedEmployees={selectedEmployeesList} onClose={() => setBatchBalanceOpen(false)} onSaved={async () => { setSelectedEmployeeIds(new Set()); await load(); }} />

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

      <EmployeeEditDialog employee={editEmployee} onClose={() => setEditEmployee(null)} onSaved={load} />

      <AdjustBalanceDialog employee={adjustEmployee} onClose={() => setAdjustEmployee(null)} onSaved={load} />

      <ReportExportDialog open={reportExportOpen} onOpenChange={setReportExportOpen} initialMonth={reportMonth} employees={employees} />
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


