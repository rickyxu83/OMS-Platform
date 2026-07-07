import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Check, Loader2, RefreshCw, RotateCcw, Save, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorToast } from "@/components/ErrorToast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";

type RequestType = "leave" | "overtime" | "comp_time";

interface AttendanceRequest {
  id: number | string;
  employeeId: number | string;
  employeeName?: string;
  applicantRole?: string | null;
  supervisorRole?: string | null;
  requestType: RequestType;
  leaveType?: string | null;
  overtimeKind?: string | null;
  overtimeResult?: string | null;
  sourceType?: string | null;
  sourceId?: number | string | null;
  sourceDetail?: string | null;
  startAt?: string;
  endAt?: string;
  hours?: number;
  status?: string;
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
  compTimeUsedHours?: number;
  annualLeaveBalanceDays?: number;
  annualLeaveBalanceHours?: number;
  compTimeBalanceHours?: number;
}

interface RoleOption {
  role: string;
  label: string;
}

interface SupervisorRoleRule {
  applicantRole: string;
  applicantRoleLabel?: string;
  supervisorRole: string;
  supervisorRoleLabel?: string;
}

interface SupervisorRoleRulePayload {
  roles?: RoleOption[];
  items?: SupervisorRoleRule[];
}

interface OvertimeSegment {
  key: string;
  kind: "travel" | "work";
  label: string;
  startAt: string;
  endAt: string;
  hours: number;
  allowedResults?: string[];
}

interface OvertimeServiceOrder {
  id: number | string;
  orderNo?: string;
  customerName?: string;
  contactName?: string;
  contactPhone?: string;
  deviceName?: string;
  serviceMode?: string;
  serviceType?: string;
  issueDescription?: string;
  status?: string;
  serviceAt?: string;
  departureAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  returnAt?: string;
  segments: OvertimeSegment[];
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: "请假",
  overtime: "加班",
  comp_time: "调休",
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "年假",
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
  pending_supervisor: "待主管",
  pending_admin: "待行政",
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
  voided: "已作废",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  pending_supervisor: "warning",
  pending_admin: "info" as any,
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

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
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

function normalizeHourValue(value: string) {
  if (!value) return "";
  return `${String(value).slice(0, 13)}:00`;
}

function annualLeaveStartValue(value: string) {
  const source = value || nowLocalValue();
  return `${String(source).slice(0, 10)}T09:00`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
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

function requestDetail(item: AttendanceRequest) {
  if (item.requestType === "leave") return LEAVE_TYPE_LABELS[item.leaveType || ""] || "-";
  if (item.requestType === "overtime") {
    return `${OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-"} / ${OVERTIME_RESULT_LABELS[item.overtimeResult || ""] || "-"}`;
  }
  return "调休";
}

function requestTypeLabel(type?: string) {
  return REQUEST_TYPE_LABELS[type || ""] || type || "-";
}

function statusBadge(status?: string) {
  const key = status || "";
  return <Badge variant={STATUS_VARIANT[key] || "secondary"}>{STATUS_LABELS[key] || key || "-"}</Badge>;
}

function roleLabel(role?: string | null) {
  return ROLE_LABELS[role || ""] || role || "-";
}

function createBlankForm() {
  const startAt = annualLeaveStartValue(nowLocalValue());
  return {
    requestType: "leave" as RequestType,
    leaveType: "annual",
    overtimeKind: "work",
    overtimeResult: "comp_time",
    startAt,
    endAt: addHoursValue(startAt, 4),
    hours: "4",
  };
}

export function Attendance() {
  const { hasPermission } = useAuth();
  const canViewAll = hasPermission("attendance.view", "attendance.admin.approve", "attendance.manage");
  const canManage = hasPermission("attendance.manage");
  const canAdminApprove = hasPermission("attendance.admin.approve");
  const [form, setForm] = useState(createBlankForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [supervisorTodo, setSupervisorTodo] = useState<AttendanceRequest[]>([]);
  const [allRequests, setAllRequests] = useState<AttendanceRequest[]>([]);
  const [myProfile, setMyProfile] = useState<EmployeeProfile | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [employeeDrafts, setEmployeeDrafts] = useState<Record<string, Partial<EmployeeProfile>>>({});
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [supervisorRoleRules, setSupervisorRoleRules] = useState<SupervisorRoleRule[]>([]);
  const [supervisorRoleDrafts, setSupervisorRoleDrafts] = useState<Record<string, string>>({});
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, { balanceType: string; deltaHours: string; note: string }>>({});
  const [overtimeOrders, setOvertimeOrders] = useState<OvertimeServiceOrder[]>([]);
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [selectedOvertimeOrderId, setSelectedOvertimeOrderId] = useState("");
  const [selectedSegmentKey, setSelectedSegmentKey] = useState("");
  const [leaveStepHours, setLeaveStepHours] = useState<4 | 8>(4);
  const [reportMonth, setReportMonth] = useState(todayMonth());
  const [reportItems, setReportItems] = useState<MonthlyReportItem[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const calls: Array<Promise<any>> = [
        api.get("/attendance/me").catch(() => ({ item: null })),
        api.get("/attendance/requests?scope=mine"),
        api.get("/attendance/requests?scope=supervisor"),
      ];
      if (canViewAll) {
        calls.push(api.get("/attendance/requests?scope=all"));
        calls.push(api.get("/attendance/employees"));
        calls.push(api.get(`/attendance/reports/monthly?month=${reportMonth}`));
        calls.push(api.get("/attendance/supervisor-role-rules"));
      }
      const [meData, mineData, supervisorData, allData, employeeData, reportData, roleRuleData] = await Promise.all(calls);
      setMyProfile((meData?.item || null) as EmployeeProfile | null);
      setMine((mineData?.items || []) as AttendanceRequest[]);
      setSupervisorTodo((supervisorData?.items || []) as AttendanceRequest[]);
      if (canViewAll) {
        const employeeList = (employeeData?.items || []) as EmployeeProfile[];
        const roleRules = (roleRuleData || {}) as SupervisorRoleRulePayload;
        const ruleItems = roleRules.items || [];
        setAllRequests((allData?.items || []) as AttendanceRequest[]);
        setEmployees(employeeList);
        setReportItems((reportData?.items || []) as MonthlyReportItem[]);
        setRoleOptions(roleRules.roles || []);
        setSupervisorRoleRules(ruleItems);
        setSupervisorRoleDrafts(Object.fromEntries(ruleItems.map((item) => [item.applicantRole, item.supervisorRole])));
        setEmployeeDrafts(Object.fromEntries(employeeList.map((employee) => [String(employee.id), { ...employee }])));
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
  }, [canViewAll, reportMonth]);

  async function loadOvertimeOrders() {
    setOvertimeLoading(true);
    try {
      const data = await api.get("/attendance/overtime/service-orders");
      const items = (data?.items || []) as OvertimeServiceOrder[];
      setOvertimeOrders(items);
      setSelectedOvertimeOrderId((current) => current || String(items[0]?.id || ""));
      setSelectedSegmentKey((current) => current || String(overtimeRows(items[0] || null)[0]?.key || ""));
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

  const stats = useMemo(() => {
    const pendingMine = mine.filter((item) => item.status === "pending_supervisor" || item.status === "pending_admin").length;
    const pendingSupervisor = supervisorTodo.filter((item) => item.status === "pending_supervisor").length;
    const pendingAdmin = allRequests.filter((item) => item.status === "pending_admin").length;
    return [
      { label: "我的进行中", value: pendingMine },
      { label: "主管待审", value: pendingSupervisor },
      { label: "行政待审", value: canAdminApprove ? pendingAdmin : "-" },
    ];
  }, [mine, supervisorTodo, allRequests, canAdminApprove]);

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

  function setStartAt(value: string) {
    const startAt = form.requestType === "leave" && form.leaveType === "annual"
      ? annualLeaveStartValue(value)
      : normalizeHourValue(value);
    const numericHours = Math.max(1, Math.round(Number(form.hours) || 1));
    setForm((current) => ({ ...current, startAt, endAt: addHoursValue(startAt, numericHours) }));
  }

  function setHours(value: string) {
    const rawHours = Math.round(Number(value) || 1);
    const numericHours = form.requestType === "leave"
      ? Math.max(leaveStepHours, Math.round(rawHours / leaveStepHours) * leaveStepHours)
      : Math.max(1, rawHours);
    setForm((current) => ({ ...current, hours: String(numericHours), endAt: addHoursValue(current.startAt, numericHours) }));
  }

  function setLeaveHours(step: 4 | 8) {
    setLeaveStepHours(step);
    setForm((current) => {
      const startAt = current.leaveType === "annual" ? annualLeaveStartValue(current.startAt) : current.startAt;
      return { ...current, hours: String(step), startAt, endAt: addHoursValue(startAt, step) };
    });
  }

  async function submitRequest() {
    setSubmitting(true);
    try {
      if (form.requestType === "overtime") {
        if (!selectedOvertimeOrder || !selectedSegment) throw new Error("请选择工单和加班时段");
        await api.post(`/attendance/overtime/service-orders/${selectedOvertimeOrder.id}/apply`, {
          segmentKey: selectedSegment.key,
          overtimeResult: selectedSegment.kind === "travel" ? "comp_time" : form.overtimeResult,
        });
      } else {
        await api.post("/attendance/requests", {
          requestType: form.requestType,
          leaveType: form.requestType === "leave" ? form.leaveType : undefined,
          startAt: form.startAt,
          endAt: form.endAt,
          hours: Number(form.hours),
        });
      }
      toast.success("申请已提交");
      setForm(createBlankForm());
      setSelectedOvertimeOrderId("");
      setSelectedSegmentKey("");
      await load();
      if (form.requestType === "overtime") await loadOvertimeOrders();
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  async function saveEmployee(employee: EmployeeProfile) {
    const draft = employeeDrafts[String(employee.id)] || {};
    try {
      await api.put(`/attendance/employees/${employee.id}`, {
        employeeName: draft.employeeName || employee.employeeName,
        nationality: draft.nationality || employee.nationality || "mainland",
        hireDate: draft.hireDate || null,
        leaveDate: draft.leaveDate || null,
        attendanceEnabled: draft.attendanceEnabled !== false,
        annualLeaveRule: draft.annualLeaveRule || draft.nationality || "mainland",
      });
      toast.success("员工档案已保存");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function adjustBalance(employee: EmployeeProfile) {
    const draft = adjustDrafts[String(employee.id)] || { balanceType: "comp_time", deltaHours: "", note: "" };
    const amount = Number(draft.deltaHours);
    const annualAdjust = draft.balanceType === "annual_leave";
    try {
      await api.post(`/attendance/employees/${employee.id}/adjust-balance`, {
        balanceType: draft.balanceType || "comp_time",
        deltaDays: annualAdjust ? amount : undefined,
        deltaHours: annualAdjust ? undefined : amount,
        note: draft.note,
      });
      toast.success("余额已调整");
      setAdjustDrafts((current) => ({ ...current, [String(employee.id)]: { balanceType: "comp_time", deltaHours: "", note: "" } }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调整失败");
    }
  }

  async function saveSupervisorRoleRules() {
    try {
      await api.put("/attendance/supervisor-role-rules", {
        items: supervisorRoleRules.map((item) => ({
          applicantRole: item.applicantRole,
          supervisorRole: supervisorRoleDrafts[item.applicantRole] || item.supervisorRole,
        })),
      });
      toast.success("审批角色规则已保存");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  function setEmployeeDraft(id: number | string, patch: Partial<EmployeeProfile>) {
    setEmployeeDrafts((current) => ({ ...current, [String(id)]: { ...(current[String(id)] || {}), ...patch } }));
  }

  function setAdjustDraft(id: number | string, patch: Partial<{ balanceType: string; deltaHours: string; note: string }>) {
    setAdjustDrafts((current) => ({
      ...current,
      [String(id)]: { ...(current[String(id)] || { balanceType: "comp_time", deltaHours: "", note: "" }), ...patch },
    }));
  }

  const requestsForAdmin = allRequests.filter((item) => item.status === "pending_admin");
  const requestsForSupervisor = supervisorTodo.filter((item) => item.status === "pending_supervisor");
  const scrollToSupervisorRoleRules = () => {
    document.getElementById("attendance-supervisor-role-rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">后勤考勤</h1>
          <p className="mt-1 text-sm text-muted-foreground">请假、加班、调休申请与月度汇总</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="outline" onClick={scrollToSupervisorRoleRules}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              设置审批角色
            </Button>
          ) : null}
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="mt-1 text-2xl font-semibold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-muted-foreground">当前可用年假</div>
            <div className="mt-1 text-2xl font-semibold">{days(annualBalanceDays(myProfile))} 天</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-muted-foreground">当前可用调休</div>
            <div className="mt-1 text-2xl font-semibold">{hours(myProfile?.compTimeBalanceHours)} 小时</div>
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card id="attendance-supervisor-role-rules">
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>审批角色规则</CardTitle>
                <CardDescription>员工提交申请后，按申请人角色流转给对应审批角色</CardDescription>
              </div>
              <Button size="sm" onClick={saveSupervisorRoleRules}>
                <Save className="mr-1 h-4 w-4" /> 保存规则
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>申请人角色</TableHead>
                    <TableHead>主管审批角色</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supervisorRoleRules.map((rule) => {
                    const currentRole = supervisorRoleDrafts[rule.applicantRole] || rule.supervisorRole;
                    return (
                      <TableRow key={rule.applicantRole}>
                        <TableCell className="font-medium">
                          {rule.applicantRoleLabel || roleLabel(rule.applicantRole)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={currentRole}
                            onValueChange={(value) => setSupervisorRoleDrafts((current) => ({ ...current, [rule.applicantRole]: value }))}
                          >
                            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((item) => (
                                <SelectItem key={item.role} value={item.role}>{item.label || roleLabel(item.role)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {supervisorRoleRules.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="py-8 text-center text-muted-foreground">暂无审批角色规则</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card id="attendance-supervisor-role-rules">
          <CardHeader>
            <CardTitle>审批角色规则</CardTitle>
            <CardDescription>当前账号没有 attendance.manage 权限，无法维护审批角色规则。</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            提交申请
          </CardTitle>
          <CardDescription>年假和常规假别按半天申请，调休按小时申请</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-2">
              <Label>申请类型</Label>
              <Select
                value={form.requestType}
                onValueChange={(value) => setForm((current) => ({
                  ...current,
                  requestType: value as RequestType,
                  hours: value === "leave" ? "4" : "1",
                  startAt: value === "leave" && current.leaveType === "annual" ? annualLeaveStartValue(current.startAt) : current.startAt,
                  endAt: addHoursValue(value === "leave" && current.leaveType === "annual" ? annualLeaveStartValue(current.startAt) : current.startAt, value === "leave" ? 4 : 1),
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">请假</SelectItem>
                  <SelectItem value="overtime">加班</SelectItem>
                  <SelectItem value="comp_time">调休</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.requestType === "leave" ? (
              <div className="space-y-2">
                <Label>假别</Label>
                <Select
                  value={form.leaveType}
                  onValueChange={(value) => setForm((current) => {
                    const startAt = value === "annual" ? annualLeaveStartValue(current.startAt) : normalizeHourValue(current.startAt);
                    return { ...current, leaveType: value, startAt, endAt: addHoursValue(startAt, Number(current.hours) || 4) };
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {form.requestType === "overtime" ? (
              <>
                <div className="space-y-2 md:col-span-2">
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
                    <SelectTrigger><SelectValue placeholder={overtimeLoading ? "载入中" : "选择工单"} /></SelectTrigger>
                    <SelectContent>
                      {overtimeOrders.map((order) => (
                        <SelectItem key={order.id} value={String(order.id)}>
                          {order.orderNo || `#${order.id}`} {order.customerName ? ` / ${order.customerName}` : ""} {order.deviceName ? ` / ${order.deviceName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-4">
                  <Label>工单信息</Label>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {selectedOvertimeOrder ? (
                      <div className="space-y-2">
                        <div className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-2">
                          <div>工单：{selectedOvertimeOrder.orderNo || `#${selectedOvertimeOrder.id}`}</div>
                          <div>客户：{selectedOvertimeOrder.customerName || "-"}</div>
                          <div>设备：{selectedOvertimeOrder.deviceName || "-"}</div>
                          <div>类型：{SERVICE_MODE_LABELS[selectedOvertimeOrder.serviceMode || ""] || selectedOvertimeOrder.serviceMode || "-"} / {SERVICE_TYPE_LABELS[selectedOvertimeOrder.serviceType || ""] || selectedOvertimeOrder.serviceType || "-"}</div>
                          <div>联系人：{selectedOvertimeOrder.contactName || "-"} {selectedOvertimeOrder.contactPhone || ""}</div>
                          <div>服务日：{formatDateTime(selectedOvertimeOrder.serviceAt)}</div>
                          <div>出发：{formatDateTime(selectedOvertimeOrder.departureAt)}</div>
                          <div>到达：{formatDateTime(selectedOvertimeOrder.actualStartAt)}</div>
                          <div>完成：{formatDateTime(selectedOvertimeOrder.actualEndAt)}</div>
                          <div>返回：{formatDateTime(selectedOvertimeOrder.returnAt)}</div>
                          <div className="md:col-span-2">问题：{selectedOvertimeOrder.issueDescription || "-"}</div>
                        </div>
                        <div className="space-y-2 border-t pt-2">
                          {selectedOvertimeRows.map((segment) => {
                            const active = selectedSegmentKey === segment.key;
                            return (
                              <div
                                key={segment.key}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedSegmentKey(segment.key)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") setSelectedSegmentKey(segment.key);
                                }}
                                className={`grid w-full gap-2 rounded-md border p-2 text-left transition md:grid-cols-[1fr_220px] ${active ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                              >
                                <div>
                                  <div className="font-medium">{segment.label}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {formatDateTime(segment.startAt)} - {formatDateTime(segment.endAt)} / {hours(segment.hours)} 小时
                                  </div>
                                </div>
                                <div onClick={(event) => event.stopPropagation()}>
                                  {segment.kind === "travel" ? (
                                    <Select value="comp_time" disabled>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent><SelectItem value="comp_time">转调休</SelectItem></SelectContent>
                                    </Select>
                                  ) : (
                                    <Select value={form.overtimeResult} onValueChange={(value) => setForm((current) => ({ ...current, overtimeResult: value }))}>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="comp_time">转调休</SelectItem>
                                        <SelectItem value="pay">加班费</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {selectedOvertimeRows.length === 0 ? (
                            <div className="py-3 text-center text-xs text-muted-foreground">暂无可申请时段</div>
                          ) : null}
                        </div>
                      </div>
                    ) : overtimeLoading ? (
                      <span className="text-muted-foreground">正在加载…</span>
                    ) : (
                      <span className="text-muted-foreground">暂无可申请加班的工单</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>开始时间</Label>
                  <Input type="datetime-local" step="3600" value={form.startAt} onChange={(event) => setStartAt(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>结束时间</Label>
                  <Input type="datetime-local" step="3600" value={form.endAt} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>{form.requestType === "leave" ? "请假时长（半天为单位）" : "调休小时数"}</Label>
                  {form.requestType === "leave" ? (
                    <div className="flex gap-2">
                      <Input type="number" min={leaveStepHours} step={leaveStepHours} value={form.hours} onChange={(event) => setHours(event.target.value)} />
                      <Button type="button" variant={leaveStepHours === 4 ? "default" : "outline"} onClick={() => setLeaveHours(4)}>半天</Button>
                      <Button type="button" variant={leaveStepHours === 8 ? "default" : "outline"} onClick={() => setLeaveHours(8)}>一天</Button>
                    </div>
                  ) : (
                    <Input type="number" min="1" step="1" value={form.hours} onChange={(event) => setHours(event.target.value)} />
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              提交
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <RequestList
          title="主管待办"
          description="直属下属提交后，先由主管审批"
          items={requestsForSupervisor}
          loading={loading}
          actions={(item) => (
            <>
              <Button size="sm" onClick={() => action(`/attendance/requests/${item.id}/approve-supervisor`, "已通过主管审批")}>
                <Check className="mr-1 h-4 w-4" /> 通过
              </Button>
              <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/reject`, "已驳回")}>
                <X className="mr-1 h-4 w-4" /> 驳回
              </Button>
            </>
          )}
        />
        <RequestList
          title="行政待办"
          description="主管通过后，由行政终审"
          items={requestsForAdmin}
          loading={loading}
          actions={canAdminApprove ? (item) => (
            <>
              <Button size="sm" onClick={() => action(`/attendance/requests/${item.id}/approve-admin`, "行政终审已通过")}>
                <ShieldCheck className="mr-1 h-4 w-4" /> 终审
              </Button>
              <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/reject`, "已驳回")}>
                <X className="mr-1 h-4 w-4" /> 驳回
              </Button>
            </>
          ) : undefined}
        />
      </div>

      <RequestList
        title="我的申请"
        description="行政终审前可撤回"
        items={mine}
        loading={loading}
        actions={(item) => ["pending_supervisor", "pending_admin"].includes(item.status || "") ? (
          <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/withdraw`, "已撤回")}>
            <RotateCcw className="mr-1 h-4 w-4" /> 撤回
          </Button>
        ) : null}
      />

      {canViewAll ? (
        <>
          <RequestList
            title="全员申请记录"
            description="行政终审通过后可作废"
            items={allRequests}
            loading={loading}
            actions={canAdminApprove ? (item) => item.status === "approved" ? (
              <Button size="sm" variant="outline" onClick={() => action(`/attendance/requests/${item.id}/void`, "已作废")}>
                <X className="mr-1 h-4 w-4" /> 作废
              </Button>
            ) : null : undefined}
          />

          <Card>
            <CardHeader>
              <CardTitle>月度报表</CardTitle>
              <CardDescription>按业务发生月份统计，不做月结锁定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs space-y-2">
                <Label>月份</Label>
                <Input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>员工</TableHead>
                      <TableHead>年假</TableHead>
                      <TableHead>病假</TableHead>
                      <TableHead>事假</TableHead>
                      <TableHead>婚假</TableHead>
                      <TableHead>丧假</TableHead>
                      <TableHead>加班</TableHead>
                      <TableHead>转调休</TableHead>
                      <TableHead>加班费</TableHead>
                      <TableHead>调休</TableHead>
                      <TableHead>年假余额</TableHead>
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
                        <TableCell>{hours(item.compTimeUsedHours)}</TableCell>
                        <TableCell>{days(annualBalanceDays(item))} 天</TableCell>
                        <TableCell>{hours(item.compTimeBalanceHours)}</TableCell>
                      </TableRow>
                    ))}
                    {reportItems.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">暂无数据</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>员工档案与余额</CardTitle>
            <CardDescription>年假规则先预留，不自动计算；年假余额按天调整，调休按小时调整</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>员工</TableHead>
                    <TableHead>籍别</TableHead>
                    <TableHead>入职日</TableHead>
                    <TableHead>启用</TableHead>
                    <TableHead>年假余额</TableHead>
                    <TableHead>调休余额</TableHead>
                    <TableHead>余额调整</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => {
                    const draft = employeeDrafts[String(employee.id)] || employee;
                    const adjust = adjustDrafts[String(employee.id)] || { balanceType: "comp_time", deltaHours: "", note: "" };
                    const annualAdjust = adjust.balanceType === "annual_leave";
                    return (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <Input
                            value={String(draft.employeeName || "")}
                            onChange={(event) => setEmployeeDraft(employee.id, { employeeName: event.target.value })}
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={String(draft.nationality || "mainland")} onValueChange={(value) => setEmployeeDraft(employee.id, { nationality: value, annualLeaveRule: value })}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mainland">陆籍</SelectItem>
                              <SelectItem value="taiwan">台籍</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={String(draft.hireDate || "")}
                            onChange={(event) => setEmployeeDraft(employee.id, { hireDate: event.target.value })}
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={draft.attendanceEnabled === false ? "0" : "1"}
                            onValueChange={(value) => setEmployeeDraft(employee.id, { attendanceEnabled: value === "1" })}
                          >
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">启用</SelectItem>
                              <SelectItem value="0">停用</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{days(annualBalanceDays(employee))} 天</TableCell>
                        <TableCell>{hours(employee.compTimeBalanceHours)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Select
                              value={adjust.balanceType}
                              onValueChange={(value) => setAdjustDraft(employee.id, {
                                balanceType: value,
                                deltaHours: value === "annual_leave" ? "0.5" : "",
                              })}
                            >
                              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="comp_time">调休</SelectItem>
                                <SelectItem value="annual_leave">年假</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder={annualAdjust ? "+/-天" : "+/-小时"}
                              value={adjust.deltaHours}
                              onChange={(event) => setAdjustDraft(employee.id, { deltaHours: event.target.value })}
                              className="w-24"
                            />
                            {annualAdjust ? (
                              <>
                                <Button type="button" size="sm" variant="outline" onClick={() => setAdjustDraft(employee.id, { deltaHours: "0.5" })}>0.5天</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setAdjustDraft(employee.id, { deltaHours: "1" })}>1天</Button>
                              </>
                            ) : (
                              <>
                                <Button type="button" size="sm" variant="outline" onClick={() => setAdjustDraft(employee.id, { deltaHours: "0.5" })}>0.5小时</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setAdjustDraft(employee.id, { deltaHours: "1" })}>1小时</Button>
                              </>
                            )}
                            <Input
                              placeholder="备注"
                              value={adjust.note}
                              onChange={(event) => setAdjustDraft(employee.id, { note: event.target.value })}
                              className="w-32"
                            />
                            <Button size="sm" variant="outline" onClick={() => adjustBalance(employee)}>调整</Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => saveEmployee(employee)}>
                            <Save className="mr-1 h-4 w-4" /> 保存
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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
}: {
  title: string;
  description: string;
  items: AttendanceRequest[];
  loading: boolean;
  actions?: (item: AttendanceRequest) => ReactNode;
}) {
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
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在加载…
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无记录</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>员工</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>明细</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>小时</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.employeeName || "-"}</TableCell>
                    <TableCell>{requestTypeLabel(item.requestType)}</TableCell>
                    <TableCell>{requestDetail(item)}</TableCell>
                    <TableCell>
                      <div>{formatDateTime(item.startAt)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(item.endAt)}</div>
                    </TableCell>
                    <TableCell>{hours(item.hours)}</TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">{actions?.(item)}</div>
                    </TableCell>
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
