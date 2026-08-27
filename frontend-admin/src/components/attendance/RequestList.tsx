import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, CalendarClock, CalendarDays, CalendarOff, CircleCheck, CircleSlash, CircleX, Clock3, Coins, Coffee, Flag, Hourglass, Loader2, Paperclip, PencilLine, Undo2, Users, Wrench, Zap, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";
import {
  LEAVE_TYPE_LABELS,
  OVERTIME_DAY_TYPE_LABELS,
  STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  days,
  hours,
  serviceOrderTypeLabel,
  approvalStepLabel,
  approvalStepStatus,
  formatDateTime,
  roleLabel,
  type AttendanceRequest,
  type ApprovalStep,
  type ServiceOrderSummary,
} from "@/pages/attendance-shared";

const OVERTIME_KIND_LABELS: Record<string, string> = {
  travel: "来回路上实际",
  work: "实际工作时间",
};
// 工单路上时间 2026-08-27 起拆成去程/回程两条独立申请（sourceDetail=travel_out/travel_back），
// 旧的合并 travel 记录仍显示「来回路上实际」
function overtimeKindLabel(item: AttendanceRequest) {
  if (item.overtimeKind === "travel" && item.sourceDetail === "travel_out") return "去程路上";
  if (item.overtimeKind === "travel" && item.sourceDetail === "travel_back") return "回程路上";
  return OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-";
}

const OVERTIME_RESULT_LABELS: Record<string, string> = {
  comp_time: "转调休",
  pay: "加班费",
};
// 图标化指示器：badge 清零，结果/日类型/状态全部「单色小图标 + 文字」，颜色只留在图标语义着色与 3 倍警示
const OVERTIME_RESULT_ICONS: Record<string, LucideIcon> = { comp_time: ArrowLeftRight, pay: Coins };
const OVERTIME_DAY_TYPE_ICONS: Record<string, LucideIcon> = { workday: CalendarDays, rest_day: Coffee, legal_holiday: Flag };
// 明细列主内容：标题 + 图标化属性（结果 / 3倍警示 / 日类型），请假与调休仅加粗主文案
function requestDetailContent(item: AttendanceRequest) {
  if (item.requestType === "leave") {
    return <span className="text-sm font-medium">{LEAVE_TYPE_LABELS[item.leaveType || ""] || "-"}</span>;
  }
  if (item.requestType === "overtime") {
    const ResultIcon = OVERTIME_RESULT_ICONS[item.overtimeResult || ""];
    const DayTypeIcon = OVERTIME_DAY_TYPE_ICONS[item.overtimeDayType || ""];
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium">{overtimeKindLabel(item)}</span>
        {ResultIcon ? (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <ResultIcon className="h-3 w-3" />
            {OVERTIME_RESULT_LABELS[item.overtimeResult || ""] || "-"}
          </span>
        ) : null}
        {item.isTriplePay ? (
          <span className="inline-flex animate-pulse items-center gap-0.5 text-[11px] font-semibold text-rose-600"><Zap className="h-3 w-3" />3倍</span>
        ) : null}
        {item.overtimeDayType && DayTypeIcon ? (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <DayTypeIcon className="h-3 w-3" />
            {OVERTIME_DAY_TYPE_LABELS[item.overtimeDayType]}
          </span>
        ) : null}
      </span>
    );
  }
  return <span className="text-sm font-medium">调休</span>;
}

export function requestTypeLabel(type?: string) {
  return REQUEST_TYPE_LABELS[type || ""] || type || "-";
}

const REQUEST_TYPE_INDICATORS: Record<string, { icon: LucideIcon; color: string }> = {
  leave: { icon: CalendarOff, color: "text-sky-600" },
  overtime: { icon: Clock3, color: "text-amber-600" },
  comp_time: { icon: ArrowLeftRight, color: "text-teal-600" },
};
function requestTypeIndicator(type?: string) {
  const conf = REQUEST_TYPE_INDICATORS[type || ""];
  if (!conf) return <span className="text-xs text-muted-foreground">{requestTypeLabel(type)}</span>;
  const Icon = conf.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${conf.color}`} />
      {requestTypeLabel(type)}
    </span>
  );
}
// 中文日期：'2026-08-21' → '8月21日'（考勤申请不跨年，省略年份）
function chineseMonthDay(value?: string) {
  const date = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return ''
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}

// 工单分组：同一工单（service_order + sourceId）≥2 条「有效」申请合并成组，供审批人按组一次审批。
// 有效 = 草稿/审批中/已通过；已撤回/已驳回/已作废的段不属于当前这组，降级为单条历史行。
// 组的插入位置取组内首条出现的位置，保持列表原有排序。
type RequestGroupEntry = { type: "group"; key: string; items: AttendanceRequest[] } | { type: "single"; item: AttendanceRequest };
function isActiveRequest(status?: string) {
  const value = status || "";
  return value === "draft" || value === "approved" || value.startsWith("pending_");
}
function groupRequestsByServiceOrder(items: AttendanceRequest[]): RequestGroupEntry[] {
  const byKey = new Map<string, AttendanceRequest[]>();
  for (const item of items) {
    const key = item.sourceType === "service_order" && item.sourceId && isActiveRequest(item.status) ? `so-${item.sourceId}` : null;
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  // 组内段按开始时间排序：去程（最早出发）→ 工作 → 回程（最晚结束），天然时间序
  for (const group of byKey.values()) {
    group.sort((a, b) => String(a.startAt || "").localeCompare(String(b.startAt || "")));
  }
  const seen = new Set<string>();
  const result: RequestGroupEntry[] = [];
  for (const item of items) {
    const key = item.sourceType === "service_order" && item.sourceId && isActiveRequest(item.status) ? `so-${item.sourceId}` : null;
    if (!key) {
      result.push({ type: "single", item });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const group = byKey.get(key)!;
    result.push(group.length >= 2 ? { type: "group", key, items: group } : { type: "single", item: group[0] });
  }
  return result;
}

// 申请时间列：假类用中文日期 + 半天标注（整天不显示时段，半天标「下午/中午」）；
// 加班/调休保留精确时段。时长（共 X 天/小时）由徽章在下一行展示。
function requestTimeRange(item: AttendanceRequest) {
  if (!item.startAt) return <span className="text-muted-foreground">-</span>;
  const startDate = String(item.startAt).slice(0, 10);
  const endDate = String(item.endAt || item.startAt).slice(0, 10);
  const startTime = String(item.startAt).slice(11, 16);
  const endTime = String(item.endAt || item.startAt).slice(11, 16);
  const sameDay = startDate === endDate;

  if (item.requestType === "leave") {
    const startHalf = startTime === "14:00" ? "下午" : "";
    const endHalf = endTime === "14:00" ? "中午" : "";
    if (sameDay) {
      // 单日：09:00–18:00 整天无标注；14:00–18:00 下午；09:00–14:00 上午（到中午）
      const tag = startHalf ? "下午" : endHalf ? "上午" : "";
      return (
        <div className="tabular-nums">
          <span className="font-medium">{chineseMonthDay(startDate)}{tag}</span>
        </div>
      );
    }
    return (
      <div className="tabular-nums">
        <div className="font-medium">{chineseMonthDay(startDate)}{startHalf} – {chineseMonthDay(endDate)}{endHalf}</div>
      </div>
    );
  }

  // 加班/调休：保留精确时段
  if (sameDay) {
    return (
      <div className="tabular-nums">
        <span className="font-medium">{chineseMonthDay(startDate)}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{startTime} – {endTime}</span>
      </div>
    );
  }
  return (
    <div className="tabular-nums">
      <div className="font-medium">{chineseMonthDay(startDate)} → {chineseMonthDay(endDate)}</div>
      <div className="text-xs text-muted-foreground">{startTime} – {endTime}</div>
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
// 表格时长列拆为「数字 + 单位」（纯数字加粗，不再用徽章）；卡片视图仍用 requestDuration 文本
function requestDurationParts(item: AttendanceRequest): { value: string; unit: "天" | "小时" } | null {
  if (item.hours == null) return null;
  if (item.requestType === "leave") {
    return { value: days(item.workingDays ?? Number(item.hours) / 8), unit: "天" };
  }
  return { value: hours(item.hours), unit: "小时" };
}
// 状态指示：沿用原 STATUS_VARIANT 语义色（warning→amber / info→sky / success→emerald / destructive→rose），呈现改图标+文字
const STATUS_INDICATORS: Record<string, { icon: LucideIcon; color: string }> = {
  draft: { icon: PencilLine, color: "text-slate-500" },
  pending_delegate: { icon: Hourglass, color: "text-amber-600" },
  pending_supervisor: { icon: Hourglass, color: "text-amber-600" },
  pending_approval: { icon: Hourglass, color: "text-sky-600" },
  pending_hr: { icon: Hourglass, color: "text-sky-600" },
  pending_vp: { icon: Hourglass, color: "text-sky-600" },
  pending_admin: { icon: Hourglass, color: "text-sky-600" },
  approved: { icon: CircleCheck, color: "text-emerald-600" },
  rejected: { icon: CircleX, color: "text-rose-500" },
  withdrawn: { icon: Undo2, color: "text-slate-400" },
  voided: { icon: CircleSlash, color: "text-slate-400" },
};
function statusIndicator(status?: string) {
  const label = STATUS_LABELS[status || ""] || status || "-";
  const conf = STATUS_INDICATORS[status || ""];
  if (!conf) return <span className="text-xs text-muted-foreground">{label}</span>;
  const Icon = conf.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${conf.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
// 明细列 meta 行：说明 / 工单 / 代理人 / 工作日 / 附件收进单行灰字（图标+文字）；
// 工单等结构化段 shrink-0 保完整，说明段弹性截断，title 兜底全文。审批进度不在此行（挪状态列悬浮）。
function requestMetaRow(
  item: AttendanceRequest,
  onPreviewOrder?: (order: ServiceOrderSummary) => void,
  onDownloadProof?: (file: { id: number | string; originalName: string; mimeType?: string }) => void,
) {
  const segs: ReactNode[] = [];
  const titleParts: string[] = [];

  // reason 为系统生成（含工单号）且工单段已展示单号时跳过，避免同一单号重复出现
  const linkedOrderNo = item.requestType === "overtime" && item.sourceType === "service_order" ? item.serviceOrder?.orderNo : undefined;
  const reasonRedundant = Boolean(item.reason && linkedOrderNo && (item.reason as string).includes(linkedOrderNo));
  if (item.reason && !reasonRedundant) {
    segs.push(<span key="reason" className="min-w-0 truncate">{item.reason}</span>);
    titleParts.push(item.reason);
  }

  if (item.requestType === "overtime" && item.sourceType === "service_order") {
    const order = item.serviceOrder || ({ id: item.sourceId || "-", unavailable: true } as ServiceOrderSummary);
    const orderLabel = order.orderNo || `#${order.id}`;
    if (order.unavailable) {
      segs.push(<span key="order" className="inline-flex shrink-0 items-center gap-1"><Wrench className="h-3 w-3" />关联工单 {orderLabel} 暂不可用</span>);
      titleParts.push(`关联工单 ${orderLabel} 暂不可用`);
    } else {
      const typeLabel = serviceOrderTypeLabel(order);
      const facts = [order.customerName, order.deviceName, typeLabel === "- / -" ? "" : typeLabel].filter((value) => value && value !== "-");
      segs.push(
        <span key="order" className="inline-flex shrink-0 items-center gap-1">
          <Wrench className="h-3 w-3" />
          {onPreviewOrder ? (
            <button
              type="button"
              onClick={() => onPreviewOrder(order)}
              className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              工单 {orderLabel}
            </button>
          ) : (
            <span className="font-medium text-foreground/70">工单 {orderLabel}</span>
          )}
          {facts.length ? <span className="max-w-52 truncate text-muted-foreground/70">{facts.join(" · ")}</span> : null}
        </span>,
      );
      titleParts.push([`工单 ${orderLabel}`, ...facts, order.issueDescription ? `问题：${order.issueDescription}` : ""].filter(Boolean).join(" · "));
    }
  }

  if (item.delegateEmployeeName) {
    segs.push(<span key="delegate" className="inline-flex shrink-0 items-center gap-1"><Users className="h-3 w-3" />代理人 {item.delegateEmployeeName}</span>);
    titleParts.push(`代理人 ${item.delegateEmployeeName}`);
  }
  if (typeof item.workingDays === "number") {
    segs.push(<span key="days" className="inline-flex shrink-0 items-center gap-1"><CalendarDays className="h-3 w-3" />{days(item.workingDays)} 个工作日</span>);
    titleParts.push(`${days(item.workingDays)} 个工作日`);
  }
  if (item.proofFiles?.length) {
    segs.push(
      <span key="proof" className="inline-flex shrink-0 items-center gap-1">
        <Paperclip className="h-3 w-3" />
        {item.proofFiles.map((file, index) => (
          <span key={file.id}>
            {index ? "、" : ""}
            <button type="button" className="inline-block max-w-40 truncate align-middle text-primary underline-offset-2 hover:underline" onClick={() => onDownloadProof?.(file)}>
              {file.originalName || `附件 #${file.id}`}
            </button>
          </span>
        ))}
      </span>,
    );
    titleParts.push(`附件 ${item.proofFiles.map((file) => file.originalName || `#${file.id}`).join("、")}`);
  } else if (item.proofFileCount) {
    segs.push(<span key="proof" className="inline-flex shrink-0 items-center gap-1"><Paperclip className="h-3 w-3" />证明附件 {item.proofFileCount} 份</span>);
    titleParts.push(`证明附件 ${item.proofFileCount} 份`);
  }

  if (!segs.length) return null;
  return (
    <div className="mt-0.5 flex items-center text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden whitespace-nowrap" title={titleParts.join(" · ")}>
        {segs.flatMap((seg, index) =>
          index === 0 ? [seg] : [<span key={`sep-${index}`} className="shrink-0 text-muted-foreground/40">·</span>, seg],
        )}
      </div>
    </div>
  );
}

// 审批链摘要与步骤明细（供状态列悬浮层使用）
function chainSummary(steps: ApprovalStep[]) {
  const current = steps.find((step) => step.status === "pending");
  const rejectedStep = steps.find((step) => step.status === "rejected");
  return current
    ? `${steps.length} 级审批 · 当前：${approvalStepLabel(current)}`
    : rejectedStep
      ? `${steps.length} 级审批 · ${approvalStepLabel(rejectedStep)}已驳回`
      : `${steps.length} 级审批 · 已全部通过`;
}
function ChainSteps({ steps }: { steps: ApprovalStep[] }) {
  // 步骤条：节点图标 + 连接线；当前待签核节点旋转动效，已通过段连线染绿
  return (
    <div>
      {steps.map((step, index) => {
        const state = step.status === "approved" ? "done" : step.status === "rejected" ? "rejected" : step.status === "pending" ? "current" : step.status === "skipped" ? "skipped" : "waiting";
        const Icon = state === "done" ? CircleCheck : state === "rejected" ? CircleX : CircleSlash;
        const iconCls = state === "done" ? "text-emerald-500" : state === "rejected" ? "text-rose-500" : "text-slate-300";
        return (
          <div key={step.id} className="relative flex gap-2.5 pb-3 last:pb-0">
            {index < steps.length - 1 ? (
              <span className={`absolute left-[7px] top-4 h-full w-px ${state === "done" ? "bg-emerald-300" : "border-l border-dashed border-slate-200"}`} />
            ) : null}
            {state === "current" ? (
              // 当前待签核：脉冲扩散蓝点（进行中指示，避免转圈带来的“一直在载入”观感）
              <span className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center bg-background">
                <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-600" />
              </span>
            ) : state === "waiting" ? (
              // 等待：空心环慢呼吸（弱动效，有生命感但不抢当前步骤的戏）
              <span className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center bg-background">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full border-2 border-slate-300" />
              </span>
            ) : (
              <Icon className={`relative z-10 h-4 w-4 shrink-0 bg-background ${iconCls}`} />
            )}
            <div className={`text-xs leading-5 ${state === "current" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {approvalStepLabel(step)}：{approvalStepStatus(step)}
              {step.assigneeEmployeeName ? `（${step.assigneeEmployeeName}）` : step.stepType !== "role" && step.assigneeRole ? `（${roleLabel(step.assigneeRole)}）` : ""}
              {step.approvedByName ? ` · ${step.approvedByName}` : ""}
              {step.approvedAt ? ` · ${formatDateTime(step.approvedAt)}` : ""}
              {step.rejectedByName ? ` · ${step.rejectedByName}` : ""}
              {step.rejectedAt ? ` · ${formatDateTime(step.rejectedAt)}` : ""}
              {step.rejectedReason ? ` · ${step.rejectedReason}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 状态列：状态指示 + 审批链 hover 悬浮层（portal + fixed 定位，避开表格 overflow 裁切；无审批链时纯指示）
function StatusWithChain({ status, steps }: { status?: string; steps?: ApprovalStep[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: true });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }, []);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top > 240;
      setPos({ left: rect.left + rect.width / 2, top: above ? rect.top - 8 : rect.bottom + 8, above });
      setOpen(true);
    }, 120);
  };
  // 悬浮层打开期间：滚动 / 点击任意处即关闭
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", hide);
    };
  }, [open, hide]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!steps?.length) return statusIndicator(status);
  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-4"
      >
        {statusIndicator(status)}
      </span>
      {open
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-64 rounded-lg border bg-background p-3 text-xs shadow-xl"
              style={{ left: pos.left, top: pos.top, transform: pos.above ? "translate(-50%, -100%)" : "translate(-50%, 0)" }}
            >
              <div className="mb-1.5 font-medium text-foreground">{chainSummary(steps)}</div>
              <ChainSteps steps={steps} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// 组行「N 段」pill：hover 浮出段明细卡（与审批链悬浮同一交互语言），移开/滚动/点击即关
function SegmentsHoverCard({ group }: { group: AttendanceRequest[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: true });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }, []);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top > 320;
      setPos({ left: rect.left + rect.width / 2, top: above ? rect.top - 8 : rect.bottom + 8, above });
      setOpen(true);
    }, 120);
  };
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", hide);
    };
  }, [open, hide]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 ring-1 ring-cyan-200"
      >
        {group.length} 段
      </button>
      {open
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-[560px] rounded-lg border bg-background p-3 text-xs shadow-xl"
              style={{ left: pos.left, top: pos.top, transform: pos.above ? "translate(-50%, -100%)" : "translate(-50%, 0)" }}
            >
              <div className="space-y-1.5">
                {group.map((item) => {
                  const duration = requestDurationParts(item);
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">{requestDetailContent(item)}</div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {chineseMonthDay(String(item.startAt || "").slice(0, 10))} {String(item.startAt || "").slice(11, 16)} – {String(item.endAt || item.startAt || "").slice(11, 16)}
                      </span>
                      {duration ? (
                        <span className="shrink-0 tabular-nums font-semibold text-foreground">
                          {duration.value}<span className="ml-0.5 font-normal text-muted-foreground">{duration.unit}</span>
                        </span>
                      ) : null}
                      <span className="shrink-0">{statusIndicator(item.status)}</span>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function RequestList({
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
  groupByServiceOrder = false,
  groupActions,
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
  /** 开启后同一工单（service_order + sourceId）≥2 条的申请合并成组展示，组头渲染 groupActions（审批人一次审批全组） */
  groupByServiceOrder?: boolean;
  groupActions?: (group: AttendanceRequest[]) => ReactNode;
}) {
  const hasActions = typeof actions === "function";

  const renderRow = (item: AttendanceRequest) => {
    const duration = requestDurationParts(item);
    return (
      <TableRow key={item.id}>
        {showEmployee ? <TableCell className="font-medium">{item.employeeName || "-"}</TableCell> : null}
        <TableCell>{requestTypeIndicator(item.requestType)}</TableCell>
        <TableCell>
          <div>{requestDetailContent(item)}</div>
          {requestMetaRow(item, onPreviewOrder, onDownloadProof)}
        </TableCell>
        <TableCell>{requestTimeRange(item)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {duration ? (
            <>
              <span className="text-sm font-semibold">{duration.value}</span>
              <span className="ml-0.5 text-xs text-muted-foreground">{duration.unit}</span>
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell><StatusWithChain status={item.status} steps={item.approvals} /></TableCell>
        {hasActions ? (
          <TableCell>
            <div className="flex flex-wrap gap-2">{actions?.(item)}</div>
          </TableCell>
        ) : null}
      </TableRow>
    );
  };

  // 组行：整组只占一行（与单条行高一致）——明细区为工单号+客户+「N 段」pill+段类型串联，
  // 时长列显示合计；段明细由 pill 的 hover 浮层承载（SegmentsHoverCard）
  const renderGroupRow = (group: AttendanceRequest[], groupKey: string) => {
    const first = group[0];
    const orderLabel = first.serviceOrder?.orderNo || (first.sourceId ? `#${first.sourceId}` : "-");
    const customerName = first.serviceOrder?.customerName || "";
    const totalHours = group.reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const kindsText = group.map((item) => overtimeKindLabel(item)).join(" + ");
    // 组内任一段为 3 倍薪资（法定节假日+加班费）时，警示提到组行直接可见，不只藏在段明细浮层里
    const anyTriple = group.some((item) => item.isTriplePay);
    const pendingItem = group.find((item) => (item.status || "").startsWith("pending"));
    const groupStatus = pendingItem?.status || first.status || "";
    const startDate = String(first.startAt || "").slice(0, 10);
    const endDate = String(group[group.length - 1].endAt || first.startAt || "").slice(0, 10);
    const dateText = chineseMonthDay(startDate) + (endDate && endDate !== startDate ? ` → ${chineseMonthDay(endDate)}` : "");
    return (
      <TableRow key={groupKey}>
        {showEmployee ? <TableCell className="font-medium">{first.employeeName || "-"}</TableCell> : null}
        <TableCell>{requestTypeIndicator(first.requestType)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {onPreviewOrder && first.serviceOrder ? (
              <button type="button" onClick={() => onPreviewOrder(first.serviceOrder as ServiceOrderSummary)} className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline">工单 {orderLabel}</button>
            ) : (
              <span className="shrink-0 text-sm font-medium">工单 {orderLabel}</span>
            )}
            {customerName ? <span className="min-w-0 truncate text-xs text-muted-foreground">{customerName}</span> : null}
            <SegmentsHoverCard group={group} />
            {anyTriple ? (
              <span className="inline-flex shrink-0 animate-pulse items-center gap-0.5 text-[11px] font-semibold text-rose-600"><Zap className="h-3 w-3" />3倍</span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground" title={kindsText}>{kindsText}</div>
        </TableCell>
        <TableCell>
          <span className="text-sm font-medium tabular-nums">{dateText}</span>
          <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
            {String(first.startAt || "").slice(11, 16)} – {String(group[group.length - 1].endAt || group[group.length - 1].startAt || "").slice(11, 16)}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          <span className="text-sm font-semibold">{hours(totalHours)}</span>
          <span className="ml-0.5 text-xs text-muted-foreground">小时</span>
        </TableCell>
        <TableCell>{statusIndicator(groupStatus)}</TableCell>
        {hasActions ? (
          <TableCell>
            {groupActions ? <div className="flex flex-wrap gap-2">{groupActions(group)}</div> : null}
          </TableCell>
        ) : null}
      </TableRow>
    );
  };
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
          <ResponsiveList
            items={items}
            keyExtractor={(item) => item.id}
            breakpoint="md"
            renderCard={(item) => (
              <ResponsiveCard
                title={(
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {requestTypeIndicator(item.requestType)}
                    {showEmployee ? <span className="truncate">{item.employeeName || "-"}</span> : requestDetailContent(item)}
                  </span>
                )}
                status={<StatusWithChain status={item.status} steps={item.approvals} />}
                fields={[
                  ...(showEmployee ? [{ label: "明细", value: requestDetailContent(item) }] : []),
                  { label: "时间", value: requestTimeRange(item) },
                  { label: "时长", value: requestDuration(item) || "-" },
                  ...(item.delegateEmployeeName ? [{ label: "代理人", value: item.delegateEmployeeName }] : []),
                ]}
                actions={hasActions ? <>{actions?.(item)}</> : undefined}
              />
            )}
          >
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[840px]">
              <TableHeader>
                <TableRow>
                  {showEmployee ? <TableHead>员工</TableHead> : null}
                  <TableHead>类型</TableHead>
                  <TableHead>明细</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">时长</TableHead>
                  <TableHead>状态</TableHead>
                  {hasActions ? <TableHead>操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groupByServiceOrder ? groupRequestsByServiceOrder(items) : items.map((item) => ({ type: "single" as const, item }))).map((entry) =>
                  entry.type === "group" ? renderGroupRow(entry.items, entry.key) : renderRow(entry.item),
                )}
              </TableBody>
            </Table>
          </div>
          </ResponsiveList>
        )}
      </CardContent>
    </Card>
  );
}
