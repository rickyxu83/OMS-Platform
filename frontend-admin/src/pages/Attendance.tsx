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
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ErrorToast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";

type RequestType = "leave" | "overtime" | "comp_time";

interface AttendanceRequest {
  id: number | string;
  employeeId: number | string;
  employeeName?: string;
  supervisorEmployeeId?: number | string;
  requestType: RequestType;
  leaveType?: string | null;
  overtimeKind?: string | null;
  overtimeResult?: string | null;
  startAt?: string;
  endAt?: string;
  hours?: number;
  reason?: string;
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
  supervisorEmployeeId?: number | string | null;
  supervisorName?: string;
  attendanceEnabled?: boolean;
  annualLeaveRule?: string;
  annualLeaveBalanceHours?: number;
  compTimeBalanceHours?: number;
}

interface MonthlyReportItem {
  employeeId: number | string;
  employeeName?: string;
  annualLeaveHours?: number;
  sickLeaveHours?: number;
  personalLeaveHours?: number;
  marriageLeaveHours?: number;
  bereavementLeaveHours?: number;
  overtimeHours?: number;
  overtimeToCompHours?: number;
  overtimeToPayHours?: number;
  compTimeUsedHours?: number;
  annualLeaveBalanceHours?: number;
  compTimeBalanceHours?: number;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  leave: "请假",
  overtime: "加班",
  comp_time: "换休",
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
  comp_time: "转换休",
  pay: "加班费",
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

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function nowLocalValue(offsetHours = 0) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function hours(value?: number) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
}

function requestDetail(item: AttendanceRequest) {
  if (item.requestType === "leave") return LEAVE_TYPE_LABELS[item.leaveType || ""] || "-";
  if (item.requestType === "overtime") {
    return `${OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-"} / ${OVERTIME_RESULT_LABELS[item.overtimeResult || ""] || "-"}`;
  }
  return "消耗换休余额";
}

function requestTypeLabel(type?: string) {
  return REQUEST_TYPE_LABELS[type || ""] || type || "-";
}

function statusBadge(status?: string) {
  const key = status || "";
  return <Badge variant={STATUS_VARIANT[key] || "secondary"}>{STATUS_LABELS[key] || key || "-"}</Badge>;
}

function employeeName(employee: EmployeeProfile) {
  return employee.employeeName || employee.username || `员工 #${employee.id}`;
}

const blankForm = {
  requestType: "leave" as RequestType,
  leaveType: "annual",
  overtimeKind: "work",
  overtimeResult: "comp_time",
  startAt: nowLocalValue(),
  endAt: nowLocalValue(1),
  hours: "8",
  reason: "",
};

export function Attendance() {
  const { hasPermission } = useAuth();
  const canViewAll = hasPermission("attendance.view", "attendance.admin.approve", "attendance.manage");
  const canManage = hasPermission("attendance.manage");
  const canAdminApprove = hasPermission("attendance.admin.approve");
  const [form, setForm] = useState(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [supervisorTodo, setSupervisorTodo] = useState<AttendanceRequest[]>([]);
  const [allRequests, setAllRequests] = useState<AttendanceRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [employeeDrafts, setEmployeeDrafts] = useState<Record<string, Partial<EmployeeProfile>>>({});
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, { balanceType: string; deltaHours: string; note: string }>>({});
  const [reportMonth, setReportMonth] = useState(todayMonth());
  const [reportItems, setReportItems] = useState<MonthlyReportItem[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const calls: Array<Promise<any>> = [
        api.get("/attendance/requests?scope=mine"),
        api.get("/attendance/requests?scope=supervisor"),
      ];
      if (canViewAll) {
        calls.push(api.get("/attendance/requests?scope=all"));
        calls.push(api.get("/attendance/employees"));
        calls.push(api.get(`/attendance/reports/monthly?month=${reportMonth}`));
      }
      const [mineData, supervisorData, allData, employeeData, reportData] = await Promise.all(calls);
      setMine((mineData?.items || []) as AttendanceRequest[]);
      setSupervisorTodo((supervisorData?.items || []) as AttendanceRequest[]);
      if (canViewAll) {
        const employeeList = (employeeData?.items || []) as EmployeeProfile[];
        setAllRequests((allData?.items || []) as AttendanceRequest[]);
        setEmployees(employeeList);
        setReportItems((reportData?.items || []) as MonthlyReportItem[]);
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

  async function submitRequest() {
    setSubmitting(true);
    try {
      await api.post("/attendance/requests", {
        requestType: form.requestType,
        leaveType: form.requestType === "leave" ? form.leaveType : undefined,
        overtimeKind: form.requestType === "overtime" ? form.overtimeKind : undefined,
        overtimeResult: form.requestType === "overtime" ? form.overtimeResult : undefined,
        startAt: form.startAt,
        endAt: form.endAt,
        hours: Number(form.hours),
        reason: form.reason,
      });
      toast.success("申请已提交");
      setForm({ ...blankForm, startAt: nowLocalValue(), endAt: nowLocalValue(1) });
      await load();
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
        supervisorEmployeeId: draft.supervisorEmployeeId || null,
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
    try {
      await api.post(`/attendance/employees/${employee.id}/adjust-balance`, {
        balanceType: draft.balanceType || "comp_time",
        deltaHours: Number(draft.deltaHours),
        note: draft.note,
      });
      toast.success("余额已调整");
      setAdjustDrafts((current) => ({ ...current, [String(employee.id)]: { balanceType: "comp_time", deltaHours: "", note: "" } }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调整失败");
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">后勤考勤</h1>
          <p className="mt-1 text-sm text-muted-foreground">请假、加班、换休申请与月度汇总</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            提交申请
          </CardTitle>
          <CardDescription>支持事后补单，底层按小时统计</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-2">
              <Label>申请类型</Label>
              <Select value={form.requestType} onValueChange={(value) => setForm((current) => ({ ...current, requestType: value as RequestType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">请假</SelectItem>
                  <SelectItem value="overtime">加班</SelectItem>
                  <SelectItem value="comp_time">换休</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.requestType === "leave" ? (
              <div className="space-y-2">
                <Label>假别</Label>
                <Select value={form.leaveType} onValueChange={(value) => setForm((current) => ({ ...current, leaveType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {form.requestType === "overtime" ? (
              <>
                <div className="space-y-2">
                  <Label>加班类型</Label>
                  <Select
                    value={form.overtimeKind}
                    onValueChange={(value) => setForm((current) => ({
                      ...current,
                      overtimeKind: value,
                      overtimeResult: value === "travel" ? "comp_time" : current.overtimeResult,
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="work">实际工作时间</SelectItem>
                      <SelectItem value="travel">来回路上实际</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>处理结果</Label>
                  <Select value={form.overtimeResult} onValueChange={(value) => setForm((current) => ({ ...current, overtimeResult: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comp_time">转换休</SelectItem>
                      {form.overtimeKind !== "travel" ? <SelectItem value="pay">加班费</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label>开始时间</Label>
              <Input type="datetime-local" value={form.startAt} onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>结束时间</Label>
              <Input type="datetime-local" value={form.endAt} onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>小时数</Label>
              <div className="flex gap-2">
                <Input type="number" min="0.5" step="0.5" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} />
                <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, hours: "4" }))}>半天</Button>
                <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, hours: "8" }))}>一天</Button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>原因</Label>
            <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="min-h-[84px]" />
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
                      <TableHead>特休</TableHead>
                      <TableHead>病假</TableHead>
                      <TableHead>事假</TableHead>
                      <TableHead>婚假</TableHead>
                      <TableHead>丧假</TableHead>
                      <TableHead>加班</TableHead>
                      <TableHead>转休</TableHead>
                      <TableHead>加班费</TableHead>
                      <TableHead>换休使用</TableHead>
                      <TableHead>换休余额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportItems.map((item) => (
                      <TableRow key={item.employeeId}>
                        <TableCell className="font-medium">{item.employeeName}</TableCell>
                        <TableCell>{hours(item.annualLeaveHours)}</TableCell>
                        <TableCell>{hours(item.sickLeaveHours)}</TableCell>
                        <TableCell>{hours(item.personalLeaveHours)}</TableCell>
                        <TableCell>{hours(item.marriageLeaveHours)}</TableCell>
                        <TableCell>{hours(item.bereavementLeaveHours)}</TableCell>
                        <TableCell>{hours(item.overtimeHours)}</TableCell>
                        <TableCell>{hours(item.overtimeToCompHours)}</TableCell>
                        <TableCell>{hours(item.overtimeToPayHours)}</TableCell>
                        <TableCell>{hours(item.compTimeUsedHours)}</TableCell>
                        <TableCell>{hours(item.compTimeBalanceHours)}</TableCell>
                      </TableRow>
                    ))}
                    {reportItems.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">暂无数据</TableCell></TableRow>
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
            <CardDescription>上线前需要为员工补齐直属主管；特休规则先预留，不自动计算</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>员工</TableHead>
                    <TableHead>籍别</TableHead>
                    <TableHead>入职日</TableHead>
                    <TableHead>直属主管</TableHead>
                    <TableHead>启用</TableHead>
                    <TableHead>特休余额</TableHead>
                    <TableHead>换休余额</TableHead>
                    <TableHead>余额调整</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => {
                    const draft = employeeDrafts[String(employee.id)] || employee;
                    const adjust = adjustDrafts[String(employee.id)] || { balanceType: "comp_time", deltaHours: "", note: "" };
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
                            value={draft.supervisorEmployeeId ? String(draft.supervisorEmployeeId) : "none"}
                            onValueChange={(value) => setEmployeeDraft(employee.id, { supervisorEmployeeId: value === "none" ? null : value })}
                          >
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">未设置</SelectItem>
                              {employees.filter((item) => String(item.id) !== String(employee.id)).map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>{employeeName(item)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                        <TableCell>{hours(employee.annualLeaveBalanceHours)}</TableCell>
                        <TableCell>{hours(employee.compTimeBalanceHours)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Select value={adjust.balanceType} onValueChange={(value) => setAdjustDraft(employee.id, { balanceType: value })}>
                              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="comp_time">换休</SelectItem>
                                <SelectItem value="annual_leave">特休</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="+/-小时"
                              value={adjust.deltaHours}
                              onChange={(event) => setAdjustDraft(employee.id, { deltaHours: event.target.value })}
                              className="w-24"
                            />
                            <Input
                              placeholder="原因"
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
