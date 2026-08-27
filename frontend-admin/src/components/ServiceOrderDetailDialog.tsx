import { Archive, Building2, CircleCheck, CircleCheckBig, CircleSlash, CircleX, Clock3, Download, Flag, Hourglass, Loader2, PenLine, Pencil, Radio, Send, Upload, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarkdownContent } from "@/lib/markdown";
import { formatDateTime, formatDateRange, formatFileSize } from "@/lib/format";
import { serviceItemsLabel } from "@/lib/service-items";
import { displayServiceOrderParts, displayServiceOrderWorkContent } from "@/lib/service-order-detail-view";
import type { ServiceOrderDetailFile, ServiceOrderDetailItem } from "@/lib/service-order-detail";


interface ServiceOrderDetailDialogProps {
  order: ServiceOrderDetailItem | null;
  loading?: boolean;
  error?: string;
  downloadingFileId?: string | number | null;
  onDownloadFile?: (file: ServiceOrderDetailFile) => void;
  onClose: () => void;
  statusLabels?: Record<string, string>;
  modeLabels?: Record<string, string>;
  summaryTypeLabel?: string;
  detailLabels?: {
    customerName?: string;
    contactName?: string;
    unnamedContact?: string;
    engineer?: string;
    unnamedEngineer?: string;
  };
}

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  assigned: "已派发",
  in_progress: "进行中",
  pending_confirmation: "待确认",
  awaiting_customer_signature: "待客户签署",
  submitted: "已结案",
  approved: "已审核",
  archived: "已归档",
  cancelled: "已作废",
  completed: "已完成",
  rejected: "已退回",
};

const DEFAULT_MODE_LABELS: Record<string, string> = {
  onsite: "现场服务",
  remote: "远程服务",
  office: "内勤工作",
};

const DEFAULT_DETAIL_LABELS = {
  customerName: "客户名称",
  contactName: "联系人",
  unnamedContact: "未维护联系人",
  engineer: "工程师",
  unnamedEngineer: "未指定",
};

// —— 图标+文字指示器（去 Badge 大色块，与列表页一致）——
function indicatorSpan(icon: LucideIcon, color: string, label: string) {
  const Icon = icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      {label}
    </span>
  );
}

const STATUS_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  draft: { icon: Pencil, color: "text-slate-400" },
  assigned: { icon: Send, color: "text-sky-600" },
  in_progress: { icon: Clock3, color: "text-indigo-600" },
  pending_confirmation: { icon: Hourglass, color: "text-amber-600" },
  awaiting_customer_signature: { icon: PenLine, color: "text-amber-600" },
  submitted: { icon: Upload, color: "text-emerald-600" },
  approved: { icon: CircleCheck, color: "text-emerald-600" },
  archived: { icon: Archive, color: "text-slate-400" },
  cancelled: { icon: CircleSlash, color: "text-rose-500" },
  completed: { icon: CircleCheckBig, color: "text-emerald-600" },
  rejected: { icon: CircleX, color: "text-rose-500" },
};

const TYPE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  install: { icon: Wrench, color: "text-sky-600" },
  repair: { icon: Wrench, color: "text-amber-600" },
  maintain: { icon: Clock3, color: "text-teal-600" },
  inspect: { icon: CircleCheck, color: "text-indigo-600" },
  training: { icon: Pencil, color: "text-purple-600" },
  remote: { icon: Radio, color: "text-purple-600" },
  other: { icon: Clock3, color: "text-slate-400" },
};

const MODE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  onsite: { icon: Wrench, color: "text-sky-600" },
  remote: { icon: Radio, color: "text-purple-600" },
  office: { icon: Building2, color: "text-indigo-600" },
};

const PRIORITY_INDICATOR: Record<string, { color: string }> = {
  low: { color: "text-slate-400" },
  normal: { color: "text-slate-400" },
  high: { color: "text-amber-600" },
  urgent: { color: "text-rose-600" },
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};


function textValue(value?: string | null, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function compactText(value?: string | null, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function displayId(order: ServiceOrderDetailItem) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

function workflowStatus(order: ServiceOrderDetailItem) {
  return order.workflowStatus || order.status || "";
}

function orderMainContent(order: ServiceOrderDetailItem, fallback = "-") {
  if (order.serviceMode === "office") {
    return compactText(order.issueDescription || order.displayTitle || order.deviceName || order.report?.workContent, fallback);
  }
  return compactText(order.issueDescription || order.displayTitle || order.deviceName, fallback);
}

function previewSummary(order: ServiceOrderDetailItem) {
  const text = orderMainContent(order, "");
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}


function serviceResultLabel(value?: string | null) {
  if (value === "resolved") return "已完成";
  if (value === "unresolved") return "未完成";
  if (value === "follow_up_required") return "需后续跟进";
  return value || "";
}


function filePurposeLabel(value?: string) {
  if (value === "inspection_document") return "巡检文档";
  if (value === "support_config") return "配置与支持文件";
  if (value === "site_photo") return "现场照片";
  if (value === "screenshot_log") return "截图/日志文件";
  return "附件";
}

function issuePreviewLabel(order: ServiceOrderDetailItem) {
  return order.serviceMode === "office" ? "内勤工作事项" : "服务需求说明";
}

function workContentPreviewLabel(order: ServiceOrderDetailItem) {
  if (order.serviceMode === "office") return "工作内容";
  const modules = Array.isArray(order.serviceModules) ? order.serviceModules : [];
  if (order.serviceMode === "onsite") {
    if (modules.includes("repair")) return "技术处理记录";
    if (modules.includes("inspect") || order.serviceType === "inspect") return "巡检处理记录";
    return "现场处理记录";
  }
  if (order.serviceMode === "remote" && modules.includes("repair")) return "远程支持记录";
  return "处理记录";
}

function samePreviewText(a?: string | null, b?: string | null) {
  const normalize = (value?: string | null) => String(value || "").replace(/\s+/g, " ").trim();
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left === right);
}

function engineerText(order: ServiceOrderDetailItem, fallback: string) {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.name || engineer.username || "")
    .filter(Boolean);
  return names.length ? names.join("、") : order.engineerName || fallback;
}

function serviceTimeRange(order: ServiceOrderDetailItem) {
  const start = order.report?.actualStartAt || order.report?.departureAt || order.actualStartAt || order.departureAt || "";
  const end = order.report?.actualEndAt || order.report?.returnAt || order.actualEndAt || order.returnAt || "";
  return formatDateRange(start, end);
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm leading-6">{textValue(value)}</div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value?: string | null }) {
  const displayValue = compactText(value);
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm leading-6">
        {displayValue !== "-" ? <MarkdownContent content={displayValue} /> : displayValue}
      </div>
    </div>
  );
}

function FileList({
  title,
  files,
  downloadingFileId,
  onDownloadFile,
}: {
  title: string;
  files: ServiceOrderDetailFile[];
  downloadingFileId?: string | number | null;
  onDownloadFile?: (file: ServiceOrderDetailFile) => void;
}) {
  if (!files.length) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 grid gap-2">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-progress disabled:opacity-60"
            disabled={!onDownloadFile || downloadingFileId === file.id}
            onClick={() => onDownloadFile?.(file)}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{file.originalName || `${title} #${file.id}`}</span>
              <span className="text-xs text-muted-foreground">{filePurposeLabel(file.purpose)} · {formatFileSize(file.size)}</span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ServiceOrderDetailDialog({
  order,
  loading = false,
  error = "",
  downloadingFileId,
  onDownloadFile,
  onClose,
  statusLabels = DEFAULT_STATUS_LABELS,
  modeLabels = DEFAULT_MODE_LABELS,
  summaryTypeLabel,
  detailLabels = DEFAULT_DETAIL_LABELS,
}: ServiceOrderDetailDialogProps) {
  const status = order ? workflowStatus(order) : "";
  const statusLabel = order ? order.displayStatus || statusLabels[status] || status || "-" : "-";
  const modeLabel = order ? modeLabels[order.serviceMode || ""] || order.serviceMode || "-" : "-";
  const typeLabel = summaryTypeLabel || (order ? serviceItemsLabel({
    serviceMode: order.serviceMode || undefined,
    serviceType: order.serviceType || undefined,
    serviceModules: order.serviceModules,
    timesheetCategory: order.timesheetCategory || undefined,
    parts: order.parts,
  }) : "-");
  const priorityLabel = order ? PRIORITY_LABELS[order.priority || ""] || order.priority || "-" : "-";
  const workContent = order ? displayServiceOrderWorkContent(order) : "";
  const displayWorkContent = order?.serviceMode === "office"
    ? workContent
    : samePreviewText(order?.issueDescription, workContent) ? "" : workContent;
  const resultText = serviceResultLabel(order?.report?.result);
  const customerSignatureText = order?.serviceMode === "onsite"
    ? order.report?.customerSignatureFileId
      ? "已使用历史签名"
      : order.report?.customerSignature
        ? "已完成现场签名"
        : ""
    : order?.serviceMode === "remote" ? "远程服务无需客户手写签名" : "";
  const inspectionDocuments = (order?.files || []).filter((file) => file.purpose === "inspection_document");
  const attachments = (order?.files || []).filter((file) => file.purpose !== "inspection_document");
  const serviceParts = displayServiceOrderParts(order?.parts);
  const departureAt = order?.report?.departureAt ?? order?.departureAt;
  const actualStartAt = order?.report?.actualStartAt ?? order?.actualStartAt;
  const actualEndAt = order?.report?.actualEndAt ?? order?.actualEndAt;
  const returnAt = order?.report?.returnAt ?? order?.returnAt;
  const hasOrderTimes = Boolean(departureAt || actualStartAt || actualEndAt || returnAt);

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{order ? displayId(order) : "工单详情"}</DialogTitle>
          <DialogDescription>{order ? `${textValue(order.customerName)} · ${previewSummary(order)}` : ""}</DialogDescription>
        </DialogHeader>
        {order ? (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {loading ? (
              <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在加载完整工单详情…
              </div>
            ) : null}
            {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {indicatorSpan((STATUS_INDICATOR[status] || { icon: Clock3 }).icon, (STATUS_INDICATOR[status] || { color: "text-slate-400" }).color, statusLabel)}
              {indicatorSpan((TYPE_INDICATOR[order.serviceType || ""] || TYPE_INDICATOR.other).icon, (TYPE_INDICATOR[order.serviceType || ""] || TYPE_INDICATOR.other).color, typeLabel)}
              {indicatorSpan((MODE_INDICATOR[order.serviceMode || ""] || { icon: Wrench }).icon, (MODE_INDICATOR[order.serviceMode || ""] || { color: "text-slate-400" }).color, modeLabel)}
              {indicatorSpan(Flag, (PRIORITY_INDICATOR[order.priority || ""] || PRIORITY_INDICATOR.normal).color, priorityLabel)}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <DetailField label={detailLabels.customerName || DEFAULT_DETAIL_LABELS.customerName} value={order.customerName} />
              <DetailField label={detailLabels.contactName || DEFAULT_DETAIL_LABELS.contactName} value={order.contactName || detailLabels.unnamedContact || DEFAULT_DETAIL_LABELS.unnamedContact} />
              <DetailField label="联系电话" value={order.contactPhone} />
              <DetailField label="客户地址" value={order.customerAddress} />
              <DetailField label="设备" value={order.deviceName || "未指定设备"} />
              <DetailField label={detailLabels.engineer || DEFAULT_DETAIL_LABELS.engineer} value={engineerText(order, detailLabels.unnamedEngineer || DEFAULT_DETAIL_LABELS.unnamedEngineer)} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <DetailField label="服务时间" value={serviceTimeRange(order)} />
              <DetailField label="服务日" value={formatDateTime(order.serviceAt)} />
              <DetailField label="创建时间" value={formatDateTime(order.createdAt)} />
              <DetailField label="结案时间" value={formatDateTime(order.submittedAt)} />
              <DetailField label="更新时间" value={formatDateTime(order.updatedAt)} />
              {order.timesheetSalesperson ? <DetailField label="业务人员" value={order.timesheetSalesperson} /> : null}
              <DetailField label="工时类别" value={order.timesheetCategory} />
            </div>

            {hasOrderTimes ? (
              <div>
                <div className="text-xs text-muted-foreground">往返与作业时间（工单）</div>
                <div className="mt-2 grid gap-4 rounded-md border bg-muted/30 p-3 md:grid-cols-2">
                  <DetailField label="出发" value={formatDateTime(departureAt)} />
                  <DetailField label="到达" value={formatDateTime(actualStartAt)} />
                  <DetailField label="完成" value={formatDateTime(actualEndAt)} />
                  <DetailField label="返回" value={formatDateTime(returnAt)} />
                </div>
              </div>
            ) : null}

            <DetailBlock label={issuePreviewLabel(order)} value={order.issueDescription} />
            {displayWorkContent ? <DetailBlock label={workContentPreviewLabel(order)} value={displayWorkContent} /> : null}

            {resultText || order.report?.resultDescription || order.report?.customerConfirmName || customerSignatureText ? (
              <div className="grid gap-4 rounded-md border bg-muted/30 p-3 md:grid-cols-3">
                {resultText ? <DetailField label="处理结果" value={resultText} /> : null}
                {order.report?.resultDescription ? <DetailField label="结果说明" value={order.report.resultDescription} /> : null}
                {order.report?.customerConfirmName || order.report?.customerName ? (
                  <DetailField label="客户确认人" value={order.report.customerConfirmName || order.report.customerName} />
                ) : null}
                {customerSignatureText ? <DetailField label="客户签名" value={customerSignatureText} /> : null}
              </div>
            ) : null}

            {(order.reportedDepartureAt || order.reportedReturnAt) ? (
              <div>
                <div className="text-xs text-muted-foreground">申请人自报往返时间</div>
                <div className="mt-2 grid gap-4 rounded-md border bg-muted/30 p-3 md:grid-cols-2">
                  {order.reportedDepartureAt ? <DetailField label="自报出发" value={formatDateTime(order.reportedDepartureAt)} /> : null}
                  {order.reportedReturnAt ? <DetailField label="自报返回" value={formatDateTime(order.reportedReturnAt)} /> : null}
                </div>
              </div>
            ) : null}

            {(order.deviceModel || order.devicePn || order.deviceSerialNo || order.deviceRemark) ? (
              <div>
                <div className="text-xs text-muted-foreground">目标设备详情</div>
                <div className="mt-2 grid gap-4 rounded-md border bg-muted/30 p-3 md:grid-cols-3">
                  <DetailField label="型号 / 版本" value={order.deviceModel} />
                  <DetailField label="料号 / PN" value={order.devicePn} />
                  <DetailField label="序列号 / SN" value={order.deviceSerialNo} />
                  <DetailField label="设备备注" value={order.deviceRemark} />
                </div>
              </div>
            ) : null}

            {order.installedDevices?.length ? (
              <div>
                <div className="text-xs text-muted-foreground">安装设备</div>
                <div className="mt-2 grid gap-2">
                  {order.installedDevices.map((device, index) => (
                    <div key={`${device.id || "installed"}-${index}`} className="rounded-md border bg-muted/30 p-3">
                      <div className="mb-2 text-sm font-medium">{compactText(device.name || device.model, `安装设备 ${index + 1}`)}</div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <DetailField label="型号 / 版本" value={device.model} />
                        <DetailField label="料号 / PN" value={device.pn} />
                        <DetailField label="序列号 / SN" value={device.serialNo} />
                        <DetailField label="备注" value={device.remark} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {serviceParts ? <DetailBlock label="备件与硬件部件" value={serviceParts} /> : null}
            <FileList title="巡检文档" files={inspectionDocuments} downloadingFileId={downloadingFileId} onDownloadFile={onDownloadFile} />
            <FileList title="附件" files={attachments} downloadingFileId={downloadingFileId} onDownloadFile={onDownloadFile} />

            {(order.reviewedAt || order.reviewComment) ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">审核信息</div>
                <div className="mt-1 text-sm leading-6">
                  {formatDateTime(order.reviewedAt)}
                  {order.reviewComment ? ` · ${compactText(order.reviewComment, "")}` : ""}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
