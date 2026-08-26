import { type ReactNode } from "react";
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
  type AttendanceRequest,
  type ServiceOrderSummary,
} from "@/pages/attendance-shared";
import { ApprovalChain } from "./ApprovalChain";

const OVERTIME_KIND_LABELS: Record<string, string> = {
  travel: "来回路上实际",
  work: "实际工作时间",
};

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
        <span className="text-sm font-medium">{OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-"}</span>
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
// 明细列次行：说明 / 关联工单 / 代理人 / 工作日 / 证明附件收进单行灰字（图标+文字），超长截断，title 兜底全文
function requestSubLine(
  item: AttendanceRequest,
  onPreviewOrder?: (order: ServiceOrderSummary) => void,
  onDownloadProof?: (file: { id: number | string; originalName: string; mimeType?: string }) => void,
) {
  const segs: ReactNode[] = [];
  const titleParts: string[] = [];

  if (item.reason) {
    segs.push(<span key="reason">{item.reason}</span>);
    titleParts.push(item.reason);
  }

  if (item.requestType === "overtime" && item.sourceType === "service_order") {
    const order = item.serviceOrder || ({ id: item.sourceId || "-", unavailable: true } as ServiceOrderSummary);
    const orderLabel = order.orderNo || `#${order.id}`;
    if (order.unavailable) {
      segs.push(<span key="order" className="inline-flex items-center gap-1 align-middle"><Wrench className="h-3 w-3" />关联工单 {orderLabel} 暂不可用</span>);
      titleParts.push(`关联工单 ${orderLabel} 暂不可用`);
    } else {
      const typeLabel = serviceOrderTypeLabel(order);
      const facts = [order.customerName, order.deviceName, typeLabel === "- / -" ? "" : typeLabel].filter((value) => value && value !== "-");
      segs.push(
        <span key="order" className="inline-flex items-center gap-1 align-middle">
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
          {facts.length ? <span className="text-muted-foreground/70">{facts.join(" · ")}</span> : null}
        </span>,
      );
      titleParts.push([`工单 ${orderLabel}`, ...facts, order.issueDescription ? `问题：${order.issueDescription}` : ""].filter(Boolean).join(" · "));
    }
  }

  if (item.delegateEmployeeName) {
    segs.push(<span key="delegate" className="inline-flex items-center gap-1 align-middle"><Users className="h-3 w-3" />代理人 {item.delegateEmployeeName}</span>);
    titleParts.push(`代理人 ${item.delegateEmployeeName}`);
  }
  if (typeof item.workingDays === "number") {
    segs.push(<span key="days" className="inline-flex items-center gap-1 align-middle"><CalendarDays className="h-3 w-3" />{days(item.workingDays)} 个工作日</span>);
    titleParts.push(`${days(item.workingDays)} 个工作日`);
  }
  if (item.proofFiles?.length) {
    segs.push(
      <span key="proof" className="inline-flex items-center gap-1 align-middle">
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
    titleParts.push(`附件 ${item.proofFiles.map((file) => file.originalName || `#${file.id}`).join("、")}`);
  } else if (item.proofFileCount) {
    segs.push(<span key="proof" className="inline-flex items-center gap-1 align-middle"><Paperclip className="h-3 w-3" />证明附件 {item.proofFileCount} 份</span>);
    titleParts.push(`证明附件 ${item.proofFileCount} 份`);
  }

  if (!segs.length) return null;
  return (
    <div className="mt-0.5 max-w-xl truncate text-xs text-muted-foreground" title={titleParts.join(" · ")}>
      {segs.flatMap((seg, index) =>
        index === 0 ? [seg] : [<span key={`sep-${index}`} className="mx-1.5 text-muted-foreground/40">·</span>, seg],
      )}
    </div>
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
                status={statusIndicator(item.status)}
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
                {items.map((item) => {
                  const duration = requestDurationParts(item);
                  return (
                  <TableRow key={item.id}>
                    {showEmployee ? <TableCell className="font-medium">{item.employeeName || "-"}</TableCell> : null}
                    <TableCell>{requestTypeIndicator(item.requestType)}</TableCell>
                    <TableCell>
                      <div>{requestDetailContent(item)}</div>
                      {requestSubLine(item, onPreviewOrder, onDownloadProof)}
                      {item.approvals?.length ? <ApprovalChain steps={item.approvals} /> : null}
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
                    <TableCell>{statusIndicator(item.status)}</TableCell>
                    {hasActions ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">{actions?.(item)}</div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </ResponsiveList>
        )}
      </CardContent>
    </Card>
  );
}
