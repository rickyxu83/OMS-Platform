import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Loader2, RotateCcw, Send, TriangleAlert, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  LEAVE_TYPE_LABELS,
  OVERTIME_DAY_TYPE_LABELS,
  SERVICE_MODE_LABELS,
  SERVICE_TYPE_LABELS,
  addHoursValue,
  annualBalanceDays,
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
  type OvertimeServiceOrder,
  type RequestType,
  type ResumableDraft,
} from "@/pages/attendance-shared";

type ApplyForm = ReturnType<typeof createBlankForm>;

interface AttendanceApplyDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 提交成功后回调（主页面刷新列表） */
  onSubmitted: () => Promise<void> | void;
  myProfile: EmployeeProfile | null;
  /** 法定节假日日期集合（用于工作日核算） */
  holidayDates: Set<string>;
}

const REQUEST_TYPE_CARDS: Array<{ value: RequestType; label: string; description: string; icon: typeof CalendarClock; roles: string[] | null }> = [
  { value: "leave", label: "请假", description: "特休与常规假别", icon: CalendarClock, roles: null },
  // 类型门禁（产品裁决 2026-08-28）：加班仅工程师与司机；调休仅工程师
  { value: "overtime", label: "加班", description: "从工单带入时段", icon: Send, roles: ["engineer", "driver"] },
  { value: "comp_time", label: "调休", description: "使用已有调休余额", icon: RotateCcw, roles: ["engineer"] },
];

/** 时段腿展示的紧凑时间：'2026-10-01 11:10' → '10-01 11:10' */
function shortDateTime(value?: string) {
  return String(value || "").replace("T", " ").slice(5, 16);
}

/** 新建申请三步向导：选类型 → 填表单 → 确认提交。表单状态与提交逻辑自原考勤页内嵌表单迁入。 */
export function AttendanceApplyDrawer({ open, onOpenChange, onSubmitted, myProfile, holidayDates }: AttendanceApplyDrawerProps) {
  const { user } = useAuth();
  const userRole = String(user?.role || "");
  const visibleTypeCards = REQUEST_TYPE_CARDS.filter((item) => !item.roles || item.roles.includes(userRole));
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ApplyForm>(createBlankForm);
  const [submitting, setSubmitting] = useState(false);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofDragging, setProofDragging] = useState(false);
  const [delegates, setDelegates] = useState<EmployeeProfile[]>([]);
  const [delegatesLoading, setDelegatesLoading] = useState(false);
  const [overtimeOrders, setOvertimeOrders] = useState<OvertimeServiceOrder[]>([]);
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [selectedOvertimeOrderId, setSelectedOvertimeOrderId] = useState("");
  const [travelDepartureAt, setTravelDepartureAt] = useState("");
  const [travelReturnAt, setTravelReturnAt] = useState("");

  // 打开时重置为初始草稿与第一步；继续提交场景用草稿预填并直达表单步
  useEffect(() => {
    if (open) {
      setStep(1);
      setForm(createBlankForm());
      setProofFiles([]);
      setSelectedOvertimeOrderId("");
      setTravelDepartureAt("");
      setTravelReturnAt("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 代理人加载：请假/调休时按所选日期过滤冲突人员（逻辑同原页面）
  useEffect(() => {
    if (!open || !["leave", "comp_time"].includes(form.requestType)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.requestType, form.startAt, form.endAt]);

  async function loadOvertimeOrders() {
    setOvertimeLoading(true);
    try {
      const data = await api.get("/attendance/overtime/service-orders");
      const items = (data?.items || []) as OvertimeServiceOrder[];
      const keepId = items.some((item) => String(item.id) === selectedOvertimeOrderId)
        ? selectedOvertimeOrderId
        : (items[0] ? String(items[0].id) : "");
      setOvertimeOrders(items);
      setSelectedOvertimeOrderId(keepId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载可申请工单失败");
    } finally {
      setOvertimeLoading(false);
    }
  }

  useEffect(() => {
    if (open && form.requestType === "overtime") loadOvertimeOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.requestType]);

  const selectedOvertimeOrder = useMemo(
    () => overtimeOrders.find((item) => String(item.id) === selectedOvertimeOrderId) || null,
    [overtimeOrders, selectedOvertimeOrderId],
  );
  const selectedOvertimeRows = useMemo(() => overtimeRows(selectedOvertimeOrder), [selectedOvertimeOrder]);
  // 涉及的三倍工资日（法定节假日）：仅可付费时段（工作时间）与 300% 相关；路上固定转调休不参与
  const triplePayDates = useMemo(() => {
    const dates = new Set<string>();
    selectedOvertimeRows
      .filter((segment) => (segment.allowedResults || []).includes("pay"))
      .forEach((segment) => (segment.triplePayDates || []).forEach((date) => dates.add(date)));
    return [...dates].sort();
  }, [selectedOvertimeRows]);
  const travelSegment = useMemo(() => selectedOvertimeRows.find((item) => item.key === "travel") || null, [selectedOvertimeRows]);
  // 路上时间可编辑性：仅多工程师工单开放（各地往返差异，ADR-0002）；单人工单按工单时间锁死
  const travelEditable = (selectedOvertimeOrder?.engineerCount || 0) > 1;
  const workSegment = useMemo(() => selectedOvertimeRows.find((item) => item.key === "work") || null, [selectedOvertimeRows]);

  useEffect(() => {
    setTravelDepartureAt(toDateTimeLocal(selectedOvertimeOrder?.departureAt));
    setTravelReturnAt(toDateTimeLocal(selectedOvertimeOrder?.returnAt));
  }, [selectedOvertimeOrderId, selectedOvertimeOrder?.departureAt, selectedOvertimeOrder?.returnAt]);

  // 路上两段（去程=出发→到达、回程=完工→返回）的即时预览，与后端 travelOvertimeSegment 同口径
  const travelLegsPreview = useMemo(() => {
    if (!selectedOvertimeOrder || !travelSegment) return [];
    const arrival = toDateTimeLocal(selectedOvertimeOrder.actualStartAt);
    const finish = toDateTimeLocal(selectedOvertimeOrder.actualEndAt);
    const dayType = travelSegment.dayType;
    const legs: Array<{ label: string; startAt: string; endAt: string; hours: number }> = [];
    const outHours = travelDepartureAt && arrival ? previewOvertimeHours(travelDepartureAt, arrival, dayType) : 0;
    if (outHours > 0) legs.push({ label: "去程", startAt: travelDepartureAt, endAt: arrival, hours: outHours });
    const backHours = finish && travelReturnAt ? previewOvertimeHours(finish, travelReturnAt, dayType) : 0;
    if (backHours > 0) legs.push({ label: "回程", startAt: finish, endAt: travelReturnAt, hours: backHours });
    return legs;
  }, [selectedOvertimeOrder, travelSegment, travelDepartureAt, travelReturnAt]);

  const travelPreview = useMemo(() => {
    if (!selectedOvertimeOrder || !travelSegment) return null;
    const total = travelLegsPreview.reduce((sum, leg) => sum + leg.hours, 0);
    return { hours: Math.round(total * 100) / 100, dayType: travelSegment.dayType };
  }, [selectedOvertimeOrder, travelSegment, travelLegsPreview]);

  const travelInvalid = useMemo(() => {
    if (!travelSegment || !selectedOvertimeOrder) return "";
    const arrival = parseLocalDateTime(selectedOvertimeOrder.actualStartAt);
    const finish = parseLocalDateTime(selectedOvertimeOrder.actualEndAt);
    const departure = parseLocalDateTime(travelDepartureAt);
    const back = parseLocalDateTime(travelReturnAt);
    if (departure && arrival && departure > arrival) return "去程出发时间不能晚于工单到达时间";
    if (back && finish && back < finish) return "回程返回时间不能早于工单完工时间";
    return "";
  }, [travelSegment, selectedOvertimeOrder, travelDepartureAt, travelReturnAt]);

  const naturalDayLeave = form.requestType === "comp_time" || (form.requestType === "leave" && ["marriage", "bereavement"].includes(form.leaveType));
  const annualPreview = ["leave", "comp_time"].includes(form.requestType)
    ? workingLeaveSummary(form, holidayDates, naturalDayLeave)
    : null;
  const annualSingleDay = form.annualStartDate === form.annualEndDate;
  const selectedDelegateName = delegates.find((item) => String(item.id) === form.delegateEmployeeId)?.employeeName || "";
  const proofRequired = form.requestType === "leave" && ["sick", "marriage"].includes(form.leaveType);
  // 草稿中已上传的证明数量（继续提交时可补充，重复计算校验分母）
  const compBalance = Number(myProfile?.compTimeBalanceHours || 0);
  const annualBalance = annualBalanceDays(myProfile);
  const balanceInsufficient = form.requestType === "comp_time"
    ? Number(annualPreview?.hours || 0) > compBalance
    : form.requestType === "leave" && form.leaveType === "annual"
      ? Number(annualPreview?.workingDays || 0) > annualBalance
      : false;

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

  /** 第 2 步基础校验，通过才能进确认页 */
  function validateBeforeConfirm(): string {
    if (form.requestType === "overtime") {
      if (!selectedOvertimeOrder) return "请选择工单";
      if (selectedOvertimeRows.length === 0) return "暂无可申请时段";
      if (travelInvalid) return travelInvalid;
      return "";
    }
    if (!form.delegateEmployeeId) return "请选择代理人";
    if (form.requestType === "leave" && form.leaveType === "personal" && !String(form.reason || "").trim()) return "请填写事假事由";
    if (proofRequired && proofFiles.length === 0) {
      return form.leaveType === "sick" ? "病假必须上传证明" : "婚假必须上传证明";
    }
    if (annualPreview && !annualPreview.workingDays) {
      return naturalDayLeave ? "申请范围内没有有效日期" : "申请范围内没有工作日";
    }
    if (balanceInsufficient) {
      return form.requestType === "comp_time" ? `调休余额不足（可用 ${hours(compBalance)} 小时）` : `特休余额不足（可用 ${days(annualBalance)} 天）`;
    }
    return "";
  }

  async function submitRequest() {
    const requestType = form.requestType;
    setSubmitting(true);
    try {
      if (requestType === "overtime") {
        if (!selectedOvertimeOrder) throw new Error("请选择工单");
        if (travelInvalid) throw new Error(travelInvalid);
        await api.post(`/attendance/overtime/service-orders/${selectedOvertimeOrder.id}/apply`, {
          overtimeResult: form.overtimeResult,
          departureAt: travelDepartureAt ? travelDepartureAt.replace("T", " ") : undefined,
          returnAt: travelReturnAt ? travelReturnAt.replace("T", " ") : undefined,
        });
      } else {
        if (!form.delegateEmployeeId) throw new Error("请选择代理人");
        if (requestType === "leave" && ["sick", "marriage"].includes(form.leaveType) && proofFiles.length === 0) {
          throw new Error(form.leaveType === "sick" ? "病假必须上传证明" : "婚假必须上传证明");
        }
        const includeNonWorkingDays = requestType === "comp_time" || (requestType === "leave" && ["marriage", "bereavement"].includes(form.leaveType));
        const leaveRange = workingLeaveSummary(form, holidayDates, includeNonWorkingDays);
        if (!leaveRange.workingDays) throw new Error(includeNonWorkingDays ? "申请范围内没有有效日期" : "申请范围内没有工作日");
        // 草稿功能已下线：一律新建申请（create + 传附件 + submit 连续完成）
        const draft = await api.post("/attendance/requests", {
            requestType,
            leaveType: requestType === "leave" ? form.leaveType : undefined,
            delegateEmployeeId: form.delegateEmployeeId,
            startAt: leaveRange.startAt,
            endAt: leaveRange.endAt,
            hours: leaveRange.hours,
            reason: requestType === "leave" && ["personal", "annual"].includes(form.leaveType) ? String(form.reason || "").trim() || undefined : undefined,
          });
        const draftId: number | string = draft.id;
        // 附件阶段独立捕获：失败自动撤回刚建的申请，提示重填重提（不留草稿续传）
        try {
          for (const file of proofFiles) {
            const body = new FormData();
            body.append("file", file);
            body.append("ownerType", "attendance_request");
            body.append("ownerId", String(draftId));
            body.append("purpose", "leave_proof");
            await api.postForm("/files", body);
          }
        } catch (uploadError) {
          try { await api.post(`/attendance/requests/${draftId}/withdraw`); } catch { /* 撤回失败不阻断错误提示 */ }
          toast.error(`证明附件上传失败：${uploadError instanceof Error ? uploadError.message : "未知错误"}，申请已自动撤回，请重新提交。`);
          return;
        }
        // 事由随提交落库：新建申请与建单值一致
        await api.post(`/attendance/requests/${draftId}/submit`, requestType === "leave" && form.leaveType === "personal" ? { reason: String(form.reason || "").trim() } : undefined);
      }
      toast.success("申请已提交");
      onOpenChange(false);
      await onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  function nextStep() {
    if (step === 1) setStep(2);
    else if (step === 2) {
      const invalid = validateBeforeConfirm();
      if (invalid) {
        toast.error(invalid);
        return;
      }
      setStep(3);
    }
  }

  const typeLabel = form.requestType === "leave"
    ? LEAVE_TYPE_LABELS[form.leaveType || ""] || "请假"
    : form.requestType === "overtime" ? "工单加班" : "调休";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-[720px]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle>新建申请</DialogTitle>
          <DialogDescription>
            {step === 1 ? "选择申请类型" : step === 2 ? `填写${typeLabel}信息` : "确认并提交"}
          </DialogDescription>
          <div className="flex items-center gap-2 pt-2 text-xs">
            {[1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 1 ? <div className="h-px w-6 bg-border" /> : null}
                <span className={`flex size-5 items-center justify-center rounded-full font-semibold ${index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index}</span>
                <span className={index <= step ? "font-medium" : "text-muted-foreground"}>{index === 1 ? "类型" : index === 2 ? "填写" : "确认"}</span>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-5">
          {step === 1 ? (
            <div className="grid gap-3">
              {visibleTypeCards.map((item) => {
                const Icon = item.icon;
                const active = form.requestType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setForm((current) => {
                      const next = { ...current, requestType: item.value, hours: item.value === "overtime" ? "1" : "4" };
                      if (item.value !== "overtime") return applyAnnualLeaveRange(next);
                      return { ...next, endAt: addHoursValue(next.startAt, 1) };
                    })}
                    className={active
                      ? "flex min-h-16 items-center gap-3 rounded-lg border border-primary bg-background p-4 text-left ring-2 ring-primary/15 transition"
                      : "flex min-h-16 items-center gap-3 rounded-lg border bg-background p-4 text-left transition hover:bg-muted/30"}
                  >
                    <span className={active ? "rounded-md bg-primary p-2 text-primary-foreground" : "rounded-md bg-muted p-2 text-muted-foreground"}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
              <div className="flex gap-2 pt-1 text-xs text-muted-foreground">
                <Badge variant="secondary">特休 {days(annualBalanceDays(myProfile))} 天</Badge>
                <Badge variant="secondary">调休 {hours(myProfile?.compTimeBalanceHours)} 小时</Badge>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            form.requestType === "overtime" ? (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label>工单</Label>
                    <Select
                      value={selectedOvertimeOrderId}
                      onValueChange={(value) => setSelectedOvertimeOrderId(value)}
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
                    <Label>工作时间加班结果</Label>
                    <Select
                      value={form.overtimeResult}
                      onValueChange={(value) => setForm((current) => ({ ...current, overtimeResult: value }))}
                      disabled={!workSegment}
                    >
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comp_time">转调休</SelectItem>
                        {workSegment ? (
                          <SelectItem value="pay">{overtimePayLabel(workSegment)}</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">来回路上时间固定转调休，此处仅作用于实际工作时间</p>
                  </div>
                </div>

                {selectedOvertimeOrder && triplePayDates.length ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      本申请涉及法定节假日（3 倍工资日）：<b>{triplePayDates.join("、")}</b>。按法规法定节假日安排加班应按 300% 计付工资，系统不做折算，实际加班费由行政核计。
                    </span>
                  </div>
                ) : null}
                {selectedOvertimeOrder ? (
                  <>
                    <div className="space-y-2">
                      <Label>加班时段</Label>
                      <p className="text-xs text-muted-foreground">路上与工作时间将一并提交，同组审批一次通过或驳回（无有效加班时长的时段自动跳过）</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {selectedOvertimeRows.map((segment) => {
                          const isTravel = segment.kind === "travel";
                          const segHours = isTravel ? (travelPreview?.hours ?? segment.hours) : segment.hours;
                          return (
                            <div key={segment.key} className="rounded-md border bg-background p-3 text-left text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{segment.label}{segment.allowedResults?.includes("pay") && segment.triplePayDates?.length ? <Badge variant="rose" className="ml-1.5 align-middle font-semibold">3倍</Badge> : null}</span>
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {isTravel
                                  ? (travelLegsPreview.length
                                      ? travelLegsPreview.map((leg) => `${leg.label} ${shortDateTime(leg.startAt)}–${shortDateTime(leg.endAt)}（${hours(leg.hours)}h）`).join(" ＋ ")
                                      : `${formatDateTime(travelDepartureAt) || "-"} 出发 / ${formatDateTime(travelReturnAt) || "-"} 返回`)
                                  : `${formatDateTime(segment.startAt)} - ${formatDateTime(segment.endAt)}`}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {hours(segHours)} 小时
                                {segment.dayType ? ` · ${OVERTIME_DAY_TYPE_LABELS[segment.dayType] || segment.dayType}` : ""}
                                {isTravel ? " · 固定转调休" : ` · ${form.overtimeResult === "pay" ? overtimePayLabel(segment) : "转调休"}`}
                              </div>
                            </div>
                          );
                        })}
                        {selectedOvertimeRows.length === 0 ? (
                          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground md:col-span-2">暂无可申请时段</div>
                        ) : null}
                        {(selectedOvertimeOrder.usedSegments || []).map((key) => (
                          <div key={`used-${key}`} className="rounded-md border border-dashed bg-muted/30 p-3 text-left text-sm text-muted-foreground">
                            <div className="font-medium">{key === "work" ? "实际工作时间" : "来回路上实际时间"}</div>
                            <div className="mt-1 text-xs">该时段已有一条进行中的加班申请；在「我的申请」撤回后才可重新申请</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {travelSegment && travelEditable ? (
                      <div className="space-y-3 rounded-md border bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-sm">去程/回程时间</Label>
                          <span className="text-xs text-muted-foreground">默认带入工单时间，可按本人实际往返修改</span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">去程出发</Label>
                            <Input
                              className="h-11"
                              type="datetime-local"
                              value={travelDepartureAt}
                              max={toDateTimeLocal(selectedOvertimeOrder.actualStartAt)}
                              onChange={(event) => setTravelDepartureAt(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">到达（工单）：{formatDateTime(selectedOvertimeOrder.actualStartAt || undefined)}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">回程返回</Label>
                            <Input
                              className="h-11"
                              type="datetime-local"
                              value={travelReturnAt}
                              min={toDateTimeLocal(selectedOvertimeOrder.actualEndAt)}
                              onChange={(event) => setTravelReturnAt(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">完工（工单）：{formatDateTime(selectedOvertimeOrder.actualEndAt || undefined)}</p>
                          </div>
                        </div>
                        {travelInvalid ? (
                          <p className="text-xs text-destructive">{travelInvalid}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            预计核算路上加班 {hours(travelPreview?.hours || 0)} 小时（工作日计 9 点前/18 点后、按 0.5 小时核算，最终以审批核算为准）
                          </p>
                        )}
                      </div>
                    ) : null}
                    {travelSegment && !travelEditable ? (
                      <p className="text-xs text-muted-foreground">本工单为单人工单，路上时间按工单时间核算，不可修改；多名工程师协作时才可按各自实际往返调整。</p>
                    ) : null}
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
                            className={`${active
                              ? "h-9 rounded-md border border-primary bg-primary/10 px-3 text-sm font-medium text-primary transition"
                              : "h-9 rounded-md border bg-background px-3 text-sm transition hover:bg-muted/50"} disabled:cursor-not-allowed disabled:opacity-60`}
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

                <div className="space-y-2">
                  <Label>开始日期 ~ 结束日期</Label>
                  <DateRangePicker
                    start={form.annualStartDate}
                    end={form.annualEndDate}
                    onChange={(s3, e3) => setAnnualDraft({ annualStartDate: s3, annualEndDate: e3 })}
                    placeholder="开始日期 ~ 结束日期"
                    ariaLabel="特休起止日期"
                  />
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
                            className={`${active
                              ? "rounded-lg border border-primary bg-primary/5 p-3 text-left ring-1 ring-primary/25 transition"
                              : "rounded-lg border p-3 text-left transition hover:bg-muted/40"} disabled:cursor-not-allowed disabled:opacity-60`}
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

                {form.requestType === "leave" && form.leaveType === "personal" ? (
                  <div className="space-y-2">
                    <Label>事由<span className="text-destructive"> *</span></Label>
                    <Textarea
                      rows={2}
                      className="resize-none"
                      value={form.reason || ""}
                      placeholder="请填写事假事由，审批人可见"
                      onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                    />
                  </div>
                ) : null}

                {form.requestType === "leave" && form.leaveType === "annual" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>理由（选填）</Label>
                      <button
                        type="button"
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${(form.reason || "").includes("返台") ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"}`}
                        onClick={() => setForm((current) => ({ ...current, reason: "返台" }))}
                      >
                        返台
                      </button>
                    </div>
                    <Textarea
                      rows={2}
                      className="resize-none"
                      value={form.reason || ""}
                      placeholder="选填；返台请点右上角“返台”或自行注明"
                      onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                    />
                  </div>
                ) : null}

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
                    所选时段请假冲突的人员不可选择；代理人无需确认，提交后直接进入配置的审批链。
                  </p>
                </div>

                {proofRequired ? (
                  <div className="space-y-2">
                    <Label>{form.leaveType === "sick" ? "病假证明" : form.leaveType === "marriage" ? "婚假证明" : "证明附件"}</Label>
                    <label
                      htmlFor="attendance-proof-upload"
                      onDragOver={(event) => { event.preventDefault(); setProofDragging(true) }}
                      onDragLeave={() => setProofDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setProofDragging(false);
                        const incoming = Array.from(event.dataTransfer.files || []);
                        if (incoming.length) setProofFiles((current) => [...current, ...incoming]);
                      }}
                      className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border p-4 text-center transition-colors ${proofDragging ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "border-dashed hover:bg-muted/50"}`}
                    >
                      <Upload className="size-5 text-primary" />
                      <span className="text-sm font-medium">点击选择或拖动文件到此处</span>
                      <span className="text-xs text-muted-foreground">{proofRequired ? "必填，" : ""}支持图片、PDF、Word，可多选或多次拖入</span>
                      <input
                        id="attendance-proof-upload"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                        className="sr-only"
                        onChange={(event) => {
                          const incoming = Array.from(event.target.files || []);
                          if (incoming.length) setProofFiles((current) => [...current, ...incoming]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {proofFiles.length ? (
                      <div className="space-y-1">
                        {proofFiles.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                            <span className="min-w-0 truncate">{file.name}</span>
                            <button type="button" aria-label={`移除 ${file.name}`} className="shrink-0 p-1 text-muted-foreground hover:text-foreground" onClick={() => setProofFiles((current) => current.filter((_, i) => i !== index))}>
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {annualPreview ? (
                  <div className={balanceInsufficient
                    ? "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                    : "rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground"}>
                    <div className="flex items-center justify-between gap-3">
                      <span>本次申请：<b>{form.requestType === "comp_time" ? `${hours(annualPreview.hours)} 小时` : `${days(annualPreview.workingDays)} 天`}</b></span>
                      <span className="text-xs">可用：<b>{form.requestType === "comp_time" ? `${hours(compBalance)} 小时` : `${days(annualBalance)} 天`}</b></span>
                    </div>
                    {balanceInsufficient ? (
                      <p className="mt-1 text-xs font-medium">{form.requestType === "comp_time" ? "调休余额不足，请减少时长或先加班积累" : "特休余额不足，请缩短请假天数"}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                {form.requestType === "overtime" ? (
                  <>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">申请类型</span>
                      <span className="font-medium">工单加班</span>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">工单</span>
                      <span className="font-medium">{selectedOvertimeOrder?.orderNo || (selectedOvertimeOrder ? "工单 #" + selectedOvertimeOrder.id : "未选择")}（{selectedOvertimeOrder?.customerName || "-"}）</span>
                    </div>
                    {triplePayDates.length ? (
                      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                        <span className="text-muted-foreground">三倍工资日</span>
                        <span className="font-medium text-amber-700">{triplePayDates.join("、")}（法定节假日加班按 300% 计付，以行政核计为准）</span>
                      </div>
                    ) : null}
                    {travelSegment ? (
                      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                        <span className="text-muted-foreground">来回路上</span>
                        <span className="font-medium">
                          {hours(travelPreview?.hours || 0)} 小时 · 固定转调休
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(travelDepartureAt) || "-"} 出发 / {formatDateTime(travelReturnAt) || "-"} 返回
                          </span>
                        </span>
                      </div>
                    ) : null}
                    {workSegment ? (
                      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                        <span className="text-muted-foreground">实际工作</span>
                        <span className="font-medium">
                          {hours(workSegment.hours)} 小时 · {form.overtimeResult === "pay" ? overtimePayLabel(workSegment) : "转调休"}
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(workSegment.startAt)} - {formatDateTime(workSegment.endAt)}
                          </span>
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">申请类型</span>
                      <span className="font-medium">{typeLabel}</span>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">日期范围</span>
                      <span className="font-medium">{form.annualStartDate} - {form.annualEndDate}</span>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">申请时段</span>
                      <span className="font-medium">
                        {annualSingleDay
                          ? form.annualPeriod === "day" ? "全天" : form.annualPeriod === "morning" ? "上午" : "下午"
                          : (form.annualStartPeriod === "morning" ? "上午起" : "下午起") + " / " + (form.annualEndPeriod === "morning" ? "上午止" : "下午止")}
                      </span>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">核算时长</span>
                      <span className="font-medium">{days(annualPreview?.workingDays)} {naturalDayLeave ? "自然日" : "工作日"} · {hours(annualPreview?.hours)} 小时</span>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">工作代理</span>
                      <span className="font-medium">{selectedDelegateName || "未选择"}</span>
                    </div>
                    {form.requestType === "leave" && form.leaveType === "personal" ? (
                      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                        <span className="text-muted-foreground">事由</span>
                        <span className="font-medium">{String(form.reason || "").trim() || "未填写"}</span>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                      <span className="text-muted-foreground">证明附件</span>
                      <span className={proofRequired && proofFiles.length === 0 ? "font-medium text-destructive" : "font-medium"}>
                        {proofFiles.length > 0 ? proofFiles.length + " 个文件" : proofRequired ? "未上传（必填）" : "无需附件"}
                      </span>
                    </div>
                    <div className="pt-1 text-xs leading-5 text-muted-foreground">
                      {naturalDayLeave ? "婚假、丧假按自然日计算，包含周末和国定假日" : "已排除周末和国定假日"}
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                {form.requestType === "overtime"
                  ? "提交后进入配置的审批链"
                  : "提交后直接进入配置的审批链，代理人无需确认"}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between gap-3">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={submitting}>
                <ArrowLeft className="mr-1 h-4 w-4" />上一步
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">选择类型后继续</span>
            )}
            {step < 3 ? (
              <Button onClick={nextStep} disabled={step === 1 && !form.requestType}>
                下一步<ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={submitRequest}
                disabled={submitting || (form.requestType === "overtime" && (!selectedOvertimeOrder || selectedOvertimeRows.length === 0 || Boolean(travelInvalid)))}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                提交申请
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
