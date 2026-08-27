import { type ReactNode } from "react";
import { CalendarClock, CalendarDays, ExternalLink, Loader2, Paperclip, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";
import {
  LEAVE_TYPE_LABELS,
  OVERTIME_DAY_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANT,
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
// 明细列主内容：加班拆为结构化徽章（事由 / 结果·倍数 / 日类型），请假与调休加粗主文案
function requestDetailContent(item: AttendanceRequest) {
  if (item.requestType === "leave") {
    return <span className="font-medium">{LEAVE_TYPE_LABELS[item.leaveType || ""] || "-"}</span>;
  }
  if (item.requestType === "overtime") {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{OVERTIME_KIND_LABELS[item.overtimeKind || ""] || "-"}</span>
        <Badge variant={item.overtimeResult === "pay" ? "purple" : "teal"}>
          {OVERTIME_RESULT_LABELS[item.overtimeResult || ""] || "-"}
        </Badge>
        {item.isTriplePay ? (
          <Badge variant="rose" className="animate-pulse font-semibold">3倍</Badge>
        ) : null}
        {item.overtimeDayType ? <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{OVERTIME_DAY_TYPE_LABELS[item.overtimeDayType]}</span> : null}
      </span>
    );
  }
  return <span className="font-medium">调休</span>;
}

export function requestTypeLabel(type?: string) {
  return REQUEST_TYPE_LABELS[type || ""] || type || "-";
}

const REQUEST_TYPE_VARIANT: Record<string, "info" | "warning" | "teal" | "secondary"> = {
  leave: "info",
  overtime: "warning",
  comp_time: "teal",
};
function requestTypeBadge(type?: string) {
  return <Badge variant={REQUEST_TYPE_VARIANT[type || ""] || "secondary"}>{requestTypeLabel(type)}</Badge>;
}
// 中文日期：'2026-08-21' → '8月21日'（考勤申请不跨年，省略年份）
function chineseMonthDay(value?: string) {
  const date = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return ''
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}

// 申请时间列：假类用中文日期 + 半天标注（整天不显示时段，半天标「下午/中午」）；
// 加班/调休保留精确时段。时长（共 X 天/小时）由徽章在下一行展示。
// 路上时段（travelLegs）按去程/回程两段展示，不用整段表述（会把中间工作框进去，佬 2026-08-25）。
function travelLegsText(item: AttendanceRequest) {
  return (item.travelLegs || [])
    .map((leg) => {
      const startDate = String(leg.startAt || "").slice(0, 10);
      const startTime = String(leg.startAt || "").slice(11, 16);
      const endTime = String(leg.endAt || "").slice(11, 16);
      return `${leg.label} ${chineseMonthDay(startDate)} ${startTime}–${endTime}`;
    })
    .join(" ＋ ");
}
function requestTimeRange(item: AttendanceRequest) {
  if (!item.startAt) return <span className="text-muted-foreground">-</span>;
  if (item.requestType === "overtime" && item.travelLegs?.length) {
    return (
      <div className="tabular-nums">
        <div className="font-medium">{travelLegsText(item)}</div>
      </div>
    );
  }
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
function statusBadge(status?: string) {
  const key = status || "";
  return <Badge variant={STATUS_VARIANT[key] || "secondary"}>{STATUS_LABELS[key] || key || "-"}</Badge>;
}

// —— batch 归组（specs/003：工单加班路+工作同批审批，列表合并显示为一条）——
type RequestGroup = AttendanceRequest[];
function groupBatchItems(items: AttendanceRequest[]): RequestGroup[] {
  const groups: RequestGroup[] = [];
  const byBatch = new Map<string, RequestGroup>();
  for (const item of items) {
    const key = item.batchId || "";
    if (key && byBatch.has(key)) {
      byBatch.get(key)!.push(item);
      continue;
    }
    const group: RequestGroup = [item];
    groups.push(group);
    if (key) byBatch.set(key, group);
  }
  return groups;
}
function segmentTimeText(item: AttendanceRequest) {
  if (item.requestType === "overtime" && item.travelLegs?.length) {
    const duration = requestDuration(item);
    return `${travelLegsText(item)}${duration ? ` ＝ ${duration}` : ""}`;
  }
  const startDate = String(item.startAt || "").slice(0, 10);
  const startTime = String(item.startAt || "").slice(11, 16);
  const endTime = String(item.endAt || item.startAt || "").slice(11, 16);
  const duration = requestDuration(item);
  return `${chineseMonthDay(startDate)} ${startTime} – ${endTime}${duration ? ` · ${duration}` : ""}`;
}
function batchUnionRange(group: RequestGroup) {
  const startAt = group.map((item) => String(item.startAt || "")).filter(Boolean).sort()[0] || "";
  const endAt = group.map((item) => String(item.endAt || item.startAt || "")).filter(Boolean).sort().slice(-1)[0] || "";
  return requestTimeRange({ ...group[0], startAt, endAt });
}
function batchTotalHours(group: RequestGroup) {
  return group.reduce((sum, item) => sum + Number(item.hours || 0), 0);
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
  // 归组：同 batchId 合并显示为一条；操作以首条为代表发起，服务端按 batch_id 自动扩组（specs/003）
  const groups = groupBatchItems(items);
  const detailCellExtra = (item: AttendanceRequest) => (
    <>
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
                  {index ? "" : ""}
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
    </>
  );
  const renderItemCard = (item: AttendanceRequest) => (
    <ResponsiveCard
      title={(
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {requestTypeBadge(item.requestType)}
          {showEmployee ? <span className="truncate">{item.employeeName || "-"}</span> : requestDetailContent(item)}
        </span>
      )}
      status={statusBadge(item.status)}
      fields={[
        ...(showEmployee ? [{ label: "明细", value: requestDetailContent(item) }] : []),
        { label: "时间", value: requestTimeRange(item) },
        { label: "时长", value: requestDuration(item) || "-" },
        ...(item.delegateEmployeeName ? [{ label: "代理人", value: item.delegateEmployeeName }] : []),
      ]}
      actions={hasActions ? <>{actions?.(item)}</> : undefined}
    />
  );
  const renderBatchCard = (group: RequestGroup) => {
    const rep = group[0];
    return (
      <ResponsiveCard
        title={(
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {requestTypeBadge("overtime")}
            {showEmployee ? <span className="truncate">{rep.employeeName || "-"}</span> : <span className="font-medium">工单加班（{group.length} 段同组）</span>}
          </span>
        )}
        status={statusBadge(rep.status)}
        fields={[
          { label: "明细", value: <div className="space-y-1">{group.map((seg) => <div key={seg.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{requestDetailContent(seg)}<span className="text-xs text-muted-foreground">{segmentTimeText(seg)}</span></div>)}</div> },
          { label: "时间", value: batchUnionRange(group) },
          { label: "时长", value: `共 ${hours(batchTotalHours(group))} 小时` },
          ...(rep.delegateEmployeeName ? [{ label: "代理人", value: rep.delegateEmployeeName }] : []),
        ]}
        actions={hasActions ? <>{actions?.(rep)}</> : undefined}
      />
    );
  };
  const renderTableRow = (item: AttendanceRequest) => (
    <TableRow key={item.id}>
      {showEmployee ? <TableCell className="font-medium">{item.employeeName || "-"}</TableCell> : null}
      <TableCell>{requestTypeBadge(item.requestType)}</TableCell>
      <TableCell>
        <div>{requestDetailContent(item)}</div>
        {detailCellExtra(item)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          {requestTimeRange(item)}
          {requestDuration(item) ? (
            <Badge variant={REQUEST_TYPE_VARIANT[item.requestType || ""] || "secondary"}>{requestDuration(item)}</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>{statusBadge(item.status)}</TableCell>
      {hasActions ? (
        <TableCell>
          <div className="flex flex-wrap gap-2">{actions?.(item)}</div>
        </TableCell>
      ) : null}
    </TableRow>
  );
  const renderBatchTableRow = (group: RequestGroup) => {
    const rep = group[0];
    return (
      <TableRow key={rep.id}>
        {showEmployee ? <TableCell className="font-medium">{rep.employeeName || "-"}</TableCell> : null}
        <TableCell>{requestTypeBadge("overtime")}</TableCell>
        <TableCell>
          <div className="space-y-1.5">
            {group.map((seg) => (
              <div key={seg.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {requestDetailContent(seg)}
                <span className="text-xs text-muted-foreground">{segmentTimeText(seg)}</span>
              </div>
            ))}
          </div>
          {detailCellExtra(rep)}
        </TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-1">
            {batchUnionRange(group)}
            <Badge variant="warning">{`共 ${hours(batchTotalHours(group))} 小时`}</Badge>
          </div>
        </TableCell>
        <TableCell>{statusBadge(rep.status)}</TableCell>
        {hasActions ? (
          <TableCell>
            <div className="flex flex-wrap gap-2">{actions?.(rep)}</div>
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
        <Badge variant="secondary">{groups.length} 条</Badge>
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
            items={groups}
            keyExtractor={(group) => group[0].id}
            breakpoint="md"
            renderCard={(group) => (group.length > 1 ? renderBatchCard(group) : renderItemCard(group[0]))}
          >
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
                {groups.map((group) => (group.length > 1 ? renderBatchTableRow(group) : renderTableRow(group[0])))}
              </TableBody>
            </Table>
          </div>
          </ResponsiveList>
        )}
      </CardContent>
    </Card>
  );
}
