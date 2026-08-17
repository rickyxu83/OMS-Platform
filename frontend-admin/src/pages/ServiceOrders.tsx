import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, RefreshCw, Search, Loader2, Plus, Trash2, CheckCircle, Download, FileDown, ChevronDown, FileSpreadsheet, Send, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorToast } from "@/components/ErrorToast";
import { ServiceOrderDetailDialog } from "@/components/ServiceOrderDetailDialog";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { serviceItemsLabel, serviceItemsSearchText, servicePartActionLabel } from "@/lib/service-items";
import { displayServiceOrderParts, displayServiceOrderWorkContent } from "@/lib/service-order-detail-view";
import { api } from "@/services/api";
import { Skeleton } from "@/components/Skeleton";

interface ServiceOrder {
  id: string | number;
  orderNo?: string;
  displayId?: string;
  displayTitle?: string;
  displayStatus?: string;
  workflowStatus?: string;
  status: string;
  customerName?: string;
  customerAddress?: string;
  contactName?: string;
  contactPhone?: string;
  deviceName?: string;
  deviceModel?: string;
  devicePn?: string;
  deviceSerialNo?: string;
  deviceRemark?: string;
  serviceType?: string;
  serviceModules?: string[];
  serviceMode?: string;
  timesheetCategory?: string;
  timesheetSalesperson?: string;
  priority?: string;
  engineerName?: string;
  engineers?: Array<{ id?: string | number; realName?: string; name?: string; username?: string }>;
  serviceAt?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  issueDescription?: string;
  internalNote?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewComment?: string;
  report?: ServiceReport | null;
  parts?: ServicePart[];
  installedDevices?: InstalledDevice[];
  targetDevices?: DeviceOption[];
  files?: OrderFile[];
  deletePreview?: ServiceOrderDeletePreview;
  customerSignatureRequest?: CustomerSignatureRequest | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ServiceReport {
  departureAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  returnAt?: string;
  workContent?: string;
  workEntries?: ServiceReportWorkEntry[];
  result?: string;
  resultDescription?: string;
  customerConfirmName?: string;
  customerName?: string;
  customerSignatureFileId?: string | number;
  customerSignature?: string;
}

interface ServiceReportWorkEntry {
  engineerId?: string | number;
  engineerName?: string;
  engineer_name?: string;
  engineerUsername?: string;
  engineer_username?: string;
  workContent?: string;
  work_content?: string;
}

interface ServicePart {
  id?: string | number;
  deviceName?: string;
  device_name?: string;
  actionType?: string;
  action_type?: string;
  partName?: string;
  part_name?: string;
  partNo?: string;
  part_no?: string;
  quantity?: string | number;
  unit?: string;
  remark?: string;
}

interface InstalledDevice {
  id?: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  remark?: string;
  willDelete?: boolean;
  blockedReasons?: string[];
}

interface OrderFile {
  id: string | number;
  ownerType?: string;
  ownerId?: string | number;
  purpose?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  uploadedBy?: string | number;
  createdAt?: string;
}

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

interface CustomerOption {
  id: string | number;
  name?: string;
}

interface DeviceOption {
  id: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  customerId?: string | number;
}

interface CustomerSignatureRequest {
  id?: string | number;
  recipientEmail?: string;
  status?: string;
  createdAt?: string;
}

interface ServiceOrderDeletePreview {
  editDraftCount?: number;
  customerSignatureRequestCount?: number;
}

const ORDER_ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip";
const ORDER_ATTACHMENT_HINT = "支持 PDF、Word、Excel、CSV、TXT、JPG/PNG/WebP/HEIC 图片、ZIP，单个文件不超过 20MB。";
const ORDER_ATTACHMENT_EXTENSIONS = new Set(ORDER_ATTACHMENT_ACCEPT.split(","));
const ORDER_ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;

function deviceOptionLabel(device: DeviceOption) {
  return device.model || device.name || device.serialNo || `设备 #${device.id}`;
}

function validateOrderFiles(files: File[]) {
  const invalidType = files.find((file) => {
    const name = file.name || "";
    const dotIndex = name.lastIndexOf(".");
    const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
    return !ORDER_ATTACHMENT_EXTENSIONS.has(extension);
  });
  if (invalidType) return `附件类型不支持：${invalidType.name}。${ORDER_ATTACHMENT_HINT}`;
  const oversized = files.find((file) => file.size > ORDER_ATTACHMENT_MAX_SIZE);
  if (oversized) return `附件超过 20MB：${oversized.name}`;
  return "";
}

const I18N = {
  "zh-CN": {
    title: "工单处理",
    subtitle: "管理和查看服务工单",
    actions: {
      refresh: "刷新",
      retry: "重试",
      reset: "重置",
      export: "导出",
      exportExcel: "导出 Excel",
      exportPdf: "导出 PDF",
      exporting: "导出中…",
      saving: "保存中…",
      cancel: "取消",
    },
    filters: {
      searchPlaceholder: "搜索工单编号、客户、工程师、描述，可用空格组合…",
      statusPlaceholder: "全部状态",
      all: "全部状态",
      allCustomers: "全部客户",
      customerPlaceholder: "全部客户",
      startDate: "开始日期",
      endDate: "结束日期",
    },
    stats: {
      all: "全部工单",
      pending: "待确认",
      processing: "进行中",
      completed: "已结案",
    },
    list: {
      title: "工单列表",
      loading: "正在加载…",
      empty: "暂无工单",
    },
    detail: {
      orderNo: "工单编号",
      customerName: "客户名称",
      contactName: "联系人",
      serviceType: "服务事项",
      serviceMode: "服务方式",
      currentStatus: "当前状态",
      engineer: "工程师",
      serviceTime: "服务时间",
      issueDescription: "详细描述",
      internalNote: "内部备注",
      descriptionPlaceholder: "服务描述",
      notePlaceholder: "添加内部备注…",
      unnamedEngineer: "未指定",
      unnamedContact: "未维护联系人",
    },
    errors: {
      loadFailed: "加载失败",
      saveFailed: "保存失败",
      exportFailed: "导出失败",
      exportEmpty: "当前筛选条件下暂无可导出的工单",
    },
    status: {
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
    },
    type: {
      install: "安装",
      repair: "排障",
      maintain: "调优",
      inspect: "巡检",
      training: "培训",
      remote: "远程支持",
      other: "其他",
    },
    mode: {
      onsite: "现场服务",
      remote: "远程服务",
      office: "内勤工作",
    },
  },
  "zh-TW": {
    title: "工單處理",
    subtitle: "管理和查看服務工單",
    actions: {
      refresh: "刷新",
      retry: "重試",
      reset: "重置",
      export: "匯出",
      exportExcel: "匯出 Excel",
      exportPdf: "匯出 PDF",
      exporting: "匯出中…",
      saving: "儲存中…",
      cancel: "取消",
    },
    filters: {
      searchPlaceholder: "搜尋工單編號、客戶、工程師、描述，可用空格組合…",
      statusPlaceholder: "全部狀態",
      all: "全部狀態",
      allCustomers: "全部客戶",
      customerPlaceholder: "全部客戶",
      startDate: "開始日期",
      endDate: "結束日期",
    },
    stats: {
      all: "全部工單",
      pending: "待確認",
      processing: "進行中",
      completed: "已結案",
    },
    list: {
      title: "工單列表",
      loading: "正在載入…",
      empty: "暫無工單",
    },
    detail: {
      orderNo: "工單編號",
      customerName: "客戶名稱",
      contactName: "聯絡人",
      serviceType: "服務事項",
      serviceMode: "服務方式",
      currentStatus: "當前狀態",
      engineer: "工程師",
      serviceTime: "服務時間",
      issueDescription: "詳細描述",
      internalNote: "內部備註",
      descriptionPlaceholder: "服務描述",
      notePlaceholder: "新增內部備註…",
      unnamedEngineer: "未指定",
      unnamedContact: "未維護聯絡人",
    },
    errors: {
      loadFailed: "載入失敗",
      saveFailed: "儲存失敗",
      exportFailed: "匯出失敗",
      exportEmpty: "當前篩選條件下暫無可匯出的工單",
    },
    status: {
      draft: "草稿",
      assigned: "已派發",
      in_progress: "進行中",
      pending_confirmation: "待確認",
      awaiting_customer_signature: "待客戶簽署",
      submitted: "已結案",
      approved: "已審核",
      archived: "已歸檔",
      cancelled: "已作廢",
      completed: "已完成",
    },
    type: {
      install: "安裝",
      repair: "排障",
      maintain: "調優",
      inspect: "巡檢",
      training: "培訓",
      remote: "遠端支援",
      other: "其他",
    },
    mode: {
      onsite: "現場服務",
      remote: "遠端服務",
      office: "內勤工作",
    },
  },
} as const;

const STATUS_BADGE_VARIANT: Record<string, "draft" | "secondary" | "purple" | "success" | "warning" | "destructive"> = {
  draft: "draft",
  assigned: "warning",
  in_progress: "purple",
  pending_confirmation: "warning",
  awaiting_customer_signature: "warning",
  submitted: "success",
  approved: "success",
  archived: "secondary",
  cancelled: "destructive",
  completed: "success",
};

const TYPE_BADGE_VARIANT: Record<string, "success" | "warning" | "info" | "purple" | "secondary"> = {
  install: "success",
  repair: "warning",
  maintain: "info",
  inspect: "purple",
  training: "info",
  remote: "info",
  other: "secondary",
};

const PRIORITY_BADGE_VARIANT: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  normal: "secondary",
  high: "warning",
  urgent: "destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

const PRIORITY_HELP = "优先级用于提示工程师和调度处理顺序：普通按常规安排，高和紧急需要优先关注；它不会改变工单状态，也不代表审批结果。";

const MODE_BADGE_VARIANT: Record<string, "success" | "info" | "purple" | "secondary"> = {
  onsite: "success",
  remote: "info",
  office: "purple",
};

const SERVICE_TYPE_SEARCH_ALIASES: Record<string, string> = {
  install: "安装 install",
  repair: "技术处理 故障排查 配置修改 调整优化 排障 维修 repair",
  maintain: "调优 保养 维护 maintain",
  inspect: "巡检 巡检类 inspect",
  training: "培训 training",
  remote: "远程 远程支持 remote",
  other: "其他 other",
};

const SERVICE_MODE_SEARCH_ALIASES: Record<string, string> = {
  onsite: "现场 现场服务 onsite",
  remote: "远程 远程服务 remote",
  office: "内勤 内勤工作 office",
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatDateOnly(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function CompactDateFilterInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden">
      <input
        id={id}
        aria-label={label}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-base text-slate-900 shadow-sm transition-[background-color,border-color,color,box-shadow] peer-focus-visible:border-primary peer-focus-visible:ring-primary/20 peer-focus-visible:ring-[3px] md:text-sm"
      >
        <span className={value ? "min-w-0 truncate tabular-nums" : "min-w-0 truncate text-slate-400"}>
          {value || "YYYY-MM-DD"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

function formatFileSize(value?: number) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function cleanDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizedDateRange(startDate: string, endDate: string) {
  const start = cleanDate(startDate);
  const end = cleanDate(endDate);
  if (start && end && start > end) return { startDate: end, endDate: start };
  return { startDate: start, endDate: end };
}

function safeSheetName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, " ").trim() || fallback;
  return cleaned.slice(0, 31);
}

function safeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "").slice(0, 40);
}

function displayId(order: ServiceOrder) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

function getWorkflowStatus(order: ServiceOrder) {
  return order.workflowStatus || order.status;
}

function textValue(value?: string, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function compactText(value?: string, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function orderMainContent(order: ServiceOrder, fallback = "-") {
  if (order.serviceMode === "office") {
    return compactText(
      order.issueDescription || order.displayTitle || order.deviceName || order.internalNote || order.report?.workContent,
      fallback,
    );
  }
  return compactText(order.issueDescription || order.displayTitle || order.deviceName, fallback);
}




function installedDeviceLabel(device: InstalledDevice | DeviceOption) {
  return [
    device.model || device.name || (device.id ? `设备 #${device.id}` : "未命名设备"),
    device.serialNo ? `SN ${device.serialNo}` : "",
    "pn" in device && device.pn ? `PN ${device.pn}` : "",
  ].filter(Boolean).join(" / ");
}

function fileDeleteLabel(file: OrderFile) {
  return `${file.originalName || `附件 #${file.id}`}${file.size ? `（${formatFileSize(file.size)}）` : ""}`;
}

async function loadDeleteConfirmationOrders(ids: Array<string | number>) {
  const details = await Promise.all(ids.map(async (id) => {
    const data = await api.get(`/service-orders/${id}`);
    return (data?.item || data) as ServiceOrder;
  }));
  return details.filter(Boolean);
}

function signatureRequestStatusLabel(value?: string) {
  const labels: Record<string, string> = {
    created: "已创建",
    sent: "已发送",
    signed: "已签署",
    revoked: "已撤销",
    expired: "已过期",
  };
  return labels[value || ""] || value || "未知状态";
}

function engineerDeleteLabel(engineer: NonNullable<ServiceOrder["engineers"]>[number]) {
  return engineer.realName || engineer.name || engineer.username || (engineer.id ? `工程师 #${engineer.id}` : "未命名工程师");
}

function installedDeviceDeleteLabel(device: InstalledDevice) {
  const label = installedDeviceLabel(device);
  if (device.willDelete === false) {
    const reasons = Array.isArray(device.blockedReasons) && device.blockedReasons.length
      ? `仍关联：${device.blockedReasons.join("、")}`
      : "仍有关联数据";
    return `${label}（保留，${reasons}）`;
  }
  if (device.willDelete === true) return `${label}（将删除）`;
  return `${label}（删除时再次检查是否有关联）`;
}

function orderDeleteImpactSections(order: ServiceOrder) {
  const sections: Array<{ key: string; title: string; count: number; description?: string; items: string[] }> = [];
  const reportItems = [
    order.report ? "服务记录正文、处理结果、客户确认信息" : "",
    ...(order.report?.workEntries || []).map((entry) => `${entry.engineerName || entry.engineer_name || entry.engineerUsername || entry.engineer_username || "工程师"}：${compactText(entry.workContent || entry.work_content, "工时明细")}`),
  ].filter(Boolean);
  if (reportItems.length) {
    sections.push({ key: "report", title: "服务记录", count: reportItems.length, items: reportItems });
  }
  const parts = order.parts || [];
  if (parts.length) {
    sections.push({
      key: "parts",
      title: "备件与硬件部件记录",
      count: parts.length,
      items: parts.map((part) => `${servicePartActionLabel(part.actionType || part.action_type)} ${part.partName || part.part_name || "未命名部件"}${part.deviceName || part.device_name ? `（设备：${part.deviceName || part.device_name}）` : ""}`),
    });
  }
  const files = order.files || [];
  if (files.length) {
    sections.push({ key: "files", title: "附件文件", count: files.length, items: files.map(fileDeleteLabel) });
  }
  const targetDevices = order.targetDevices || [];
  if (targetDevices.length) {
    sections.push({
      key: "target-devices",
      title: "目标设备关联",
      count: targetDevices.length,
      description: "只解除工单与设备的关联，不删除这些既有设备。",
      items: targetDevices.map(installedDeviceLabel),
    });
  }
  const installedDevices = order.installedDevices || [];
  if (installedDevices.length) {
    sections.push({
      key: "installed-devices",
      title: "安装来源设备",
      count: installedDevices.length,
      description: "没有被其他工单、部件记录或巡检计划引用的安装设备会随工单删除；仍被引用的设备会保留。",
      items: installedDevices.map(installedDeviceDeleteLabel),
    });
  }
  const engineers = order.engineers || [];
  if (engineers.length) {
    sections.push({ key: "engineers", title: "派单工程师关联", count: engineers.length, items: engineers.map(engineerDeleteLabel) });
  }
  const signatureRequestCount = Number(order.deletePreview?.customerSignatureRequestCount || 0);
  if (signatureRequestCount > 0) {
    const latest = order.customerSignatureRequest;
    sections.push({
      key: "signature-requests",
      title: "客户签署请求",
      count: signatureRequestCount,
      items: latest
        ? [`最新请求：${latest.recipientEmail || "未填写邮箱"} / ${signatureRequestStatusLabel(latest.status)}${latest.createdAt ? ` / ${formatDateTime(latest.createdAt)}` : ""}`]
        : [`客户签署请求 ${signatureRequestCount} 条`],
    });
  }
  const editDraftCount = Number(order.deletePreview?.editDraftCount || 0);
  if (editDraftCount > 0) {
    sections.push({ key: "drafts", title: "工程师编辑草稿", count: editDraftCount, items: [`编辑草稿 ${editDraftCount} 份`] });
  }
  if (!sections.length) {
    sections.push({ key: "order", title: "工单主体", count: 1, items: ["仅删除工单主体记录"] });
  }
  return sections;
}

function orderDeleteImpactSummary(orders: ServiceOrder[]) {
  const summary = {
    reports: 0,
    parts: 0,
    files: 0,
    targetDevices: 0,
    installedDevicesToDelete: 0,
    installedDevicesToKeep: 0,
    drafts: 0,
    signatureRequests: 0,
  };
  for (const order of orders) {
    if (order.report) summary.reports += 1;
    summary.parts += order.parts?.length || 0;
    summary.files += order.files?.length || 0;
    summary.targetDevices += order.targetDevices?.length || 0;
    for (const device of order.installedDevices || []) {
      if (device.willDelete === false) summary.installedDevicesToKeep += 1;
      else summary.installedDevicesToDelete += 1;
    }
    summary.drafts += Number(order.deletePreview?.editDraftCount || 0);
    summary.signatureRequests += Number(order.deletePreview?.customerSignatureRequestCount || 0);
  }
  return summary;
}

function buildDeleteConfirmationMessage(orders: ServiceOrder[]) {
  const summary = orderDeleteImpactSummary(orders);
  const lines = [
    `确认删除 ${orders.length} 张工单？`,
    "",
    "将同时处理：",
  ];
  const impactLines = [
    summary.reports ? `服务记录 ${summary.reports} 份` : "",
    summary.parts ? `备件与硬件部件记录 ${summary.parts} 条` : "",
    summary.files ? `附件文件 ${summary.files} 个` : "",
    summary.targetDevices ? `目标设备关联 ${summary.targetDevices} 条（只解除关联，不删除既有设备）` : "",
    summary.installedDevicesToDelete ? `安装来源设备 ${summary.installedDevicesToDelete} 台（无其他关联时随工单删除）` : "",
    summary.installedDevicesToKeep ? `保留安装来源设备 ${summary.installedDevicesToKeep} 台（仍有关联）` : "",
    summary.signatureRequests ? `客户签署请求 ${summary.signatureRequests} 条` : "",
    summary.drafts ? `工程师编辑草稿 ${summary.drafts} 份` : "",
  ].filter(Boolean);
  if (impactLines.length) {
    lines.push(...impactLines.map((line) => `- ${line}`));
  } else {
    lines.push("- 仅删除工单主体记录");
  }
  if (orders.length <= 3) {
    lines.push("");
    lines.push("工单：");
    for (const order of orders) {
      const sections = orderDeleteImpactSections(order);
      lines.push(`- ${order.orderNo || `工单 #${order.id}`}: ${sections.map((section) => `${section.title} ${section.count}`).join("；")}`);
    }
  }
  lines.push("");
  lines.push("此操作不可恢复。");
  return lines.join("\n");
}


function splitSearchTerms(value: string) {
  return value
    .trim()
    .split(/[\s,，、]+/)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function engineerText(order: ServiceOrder, fallback: string) {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.name || engineer.username || "")
    .filter(Boolean);
  if (names.length) return names.join("、");
  return order.engineerName || fallback;
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return "-";
  if (start && end) return `${formatDateTime(start)} 至 ${formatDateTime(end)}`;
  return formatDateTime(start || end);
}

function serviceTimeRange(order: ServiceOrder) {
  const start = order.report?.actualStartAt || order.report?.departureAt || "";
  const end = order.report?.actualEndAt || order.report?.returnAt || "";
  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
    full: formatDateRange(start, end),
  };
}


export function ServiceOrders() {
  const { lang } = useLanguage();
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = I18N[lang];
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState(searchParams.get("customerId") || "all");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || searchParams.get("q") || "");
  // 搜索词防抖:输入框即时响应,列表与服务端请求在停顿后一起更新,避免逐字改动列表高度
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  // 请求序号守卫:慢请求的过期响应不再覆盖新结果
  const loadSeqRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePreviewOrders, setDeletePreviewOrders] = useState<ServiceOrder[]>([]);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletePreviewError, setDeletePreviewError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    deviceId: "",
    serviceMode: "onsite",
    serviceType: "repair",
    timesheetCategory: "",
    engineerId: "none",
    plannedStartAt: "",
    plannedEndAt: "",
    priority: "normal",
    issueDescription: "",
    internalNote: "",
  });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOrder, setAssignOrder] = useState<ServiceOrder | null>(null);
  const [assignForm, setAssignForm] = useState({ engineerIds: [] as string[], plannedStartAt: "", plannedEndAt: "", note: "" });
  const [assignFiles, setAssignFiles] = useState<File[]>([]);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionOrder, setTransitionOrder] = useState<ServiceOrder | null>(null);
  const [transitionForm, setTransitionForm] = useState({ status: "assigned", reason: "" });
  const [detailOrder, setDetailOrder] = useState<ServiceOrder | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | number | null>(null);
  const canCreateOrders = hasPermission("order.create");
  const canEditOrders = hasPermission("order.edit");
  const canAssignOrders = hasPermission("order.assign");
  const canApproveOrders = hasPermission("order.approve");
  const canDeleteOrders = hasPermission("order.delete");
  const canBulkDeleteOrders = hasPermission("order.bulk-delete");
  const statusOptions = [
    { value: "all", label: t.filters.all },
    { value: "draft", label: t.status.draft },
    { value: "in_progress", label: t.status.in_progress },
    { value: "pending_confirmation", label: t.status.pending_confirmation },
    { value: "awaiting_customer_signature", label: t.status.awaiting_customer_signature },
    { value: "submitted", label: t.status.submitted },
    { value: "cancelled", label: t.status.cancelled },
  ];

  useEffect(() => {
    const keyword = searchParams.get("keyword") || searchParams.get("q") || "";
    setSearchQuery(keyword);
    setCustomerFilter(searchParams.get("customerId") || "all");
    setStartDate(searchParams.get("startDate") || "");
    setEndDate(searchParams.get("endDate") || "");
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      api.get("/customers?pageSize=200").then((data) => setCustomers(data?.items || [])).catch(() => setCustomers([])),
      api.get("/devices").then((data) => setDevices(data?.items || [])).catch(() => setDevices([])),
      api.get("/users/engineers").then((data) => setEngineers(data?.items || [])).catch(() => setEngineers([])),
    ]).catch(() => undefined);
  }, []);

  async function load() {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const range = normalizedDateRange(startDate, endDate);
      const params = new URLSearchParams({
        pageSize: "50",
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (range.startDate) params.set("startDate", range.startDate);
      if (range.endDate) params.set("endDate", range.endDate);
      if (debouncedSearch.trim()) params.set("keyword", debouncedSearch.trim());
      const data = await api.get(`/service-orders?${params.toString()}`);
      if (seq !== loadSeqRef.current) return; // 已有更新的请求,丢弃过期响应
      const items = (data?.items || []) as ServiceOrder[];
      setOrders(items);
      setTotal(Number(data?.total ?? items.length));
      setSelectedIds((ids) => ids.filter((id) => items.some((item) => String(item.id) === String(id))));
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, customerFilter, startDate, endDate, debouncedSearch]);

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (!orderId) return;
    const matched = orders.find((order) => String(order.id) === orderId);
    if (matched && (!detailOrder || String(detailOrder.id) !== orderId)) {
      setDetailOrder(matched);
    }

    let cancelled = false;
    async function loadOrderDetail() {
      try {
        const data = await api.get(`/service-orders/${orderId}`);
        if (!cancelled) setDetailOrder((data?.item || data) as ServiceOrder);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t.errors.loadFailed);
      }
    }

    loadOrderDetail();
    return () => {
      cancelled = true;
    };
  }, [searchParams, orders, t.errors.loadFailed]);

  const filteredOrders = useMemo(() => {
    const terms = splitSearchTerms(debouncedSearch);
    if (!terms.length) return orders;
    return orders.filter((order) => {
      const workflowStatus = getWorkflowStatus(order);
      const searchText = [
        displayId(order),
        order.customerName,
        order.customerAddress,
        order.deviceName,
        engineerText(order, ""),
        order.issueDescription,
        order.internalNote,
        order.timesheetCategory,
        order.timesheetSalesperson,
        order.serviceType,
        t.type[order.serviceType as keyof typeof t.type],
        SERVICE_TYPE_SEARCH_ALIASES[order.serviceType || ""],
        serviceItemsSearchText(order),
        order.serviceMode,
        t.mode[order.serviceMode as keyof typeof t.mode],
        SERVICE_MODE_SEARCH_ALIASES[order.serviceMode || ""],
        workflowStatus,
        t.status[workflowStatus as keyof typeof t.status],
      ].filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => searchText.includes(term));
    });
  }, [orders, debouncedSearch, t.mode, t.status, t.type]);

  const allFilteredOrdersSelected = filteredOrders.length > 0
    && filteredOrders.every((order) => selectedIds.some((id) => String(id) === String(order.id)));

  const initialLoading = loading && orders.length === 0;
  const refreshing = loading && orders.length > 0;

  const selectedCustomerName = useMemo(() => {
    if (customerFilter === "all") return "";
    return customers.find((customer) => String(customer.id) === customerFilter)?.name || "";
  }, [customerFilter, customers]);

  const stats = useMemo(() => {
    const all = orders.length;
    const pending = orders.filter((o) => getWorkflowStatus(o) === "pending_confirmation").length;
    const processing = orders.filter((o) => getWorkflowStatus(o) === "in_progress").length;
    const submitted = orders.filter((o) => ["submitted", "approved", "archived", "completed"].includes(getWorkflowStatus(o))).length;
    return [
      { label: t.stats.all, value: all },
      { label: t.stats.pending, value: pending },
      { label: t.stats.processing, value: processing },
      { label: t.stats.completed, value: submitted },
    ];
  }, [orders, t.stats]);

  function openCreateOrder() {
    setCreateForm({
      customerId: "",
      deviceId: "",
      serviceMode: "onsite",
      serviceType: "repair",
      timesheetCategory: "",
      engineerId: "none",
      plannedStartAt: "",
      plannedEndAt: "",
      priority: "normal",
      issueDescription: "",
      internalNote: "",
    });
    setCreateFiles([]);
    setCreateOpen(true);
  }

  function applyNameFilter(value?: string) {
    const keyword = textValue(value, "").trim();
    if (!keyword) return;
    setSearchQuery(keyword);
    setSearchParams(() => {
      const range = normalizedDateRange(startDate, endDate);
      const next = new URLSearchParams();
      next.set("keyword", keyword);
      if (customerFilter !== "all") next.set("customerId", customerFilter);
      if (range.startDate) next.set("startDate", range.startDate);
      if (range.endDate) next.set("endDate", range.endDate);
      return next;
    });
  }

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setCustomerFilter("all");
    setStartDate("");
    setEndDate("");
    setSearchParams({});
  }

  function closeDetailOrder() {
    setDetailOrder(null);
    if (!searchParams.has("orderId")) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("orderId");
      return next;
    });
  }

  function toggleOrderSelection(orderId: string | number, checked: boolean | "indeterminate") {
    setSelectedIds((ids) => {
      if (checked === true) {
        return ids.some((id) => String(id) === String(orderId)) ? ids : [...ids, orderId];
      }
      return ids.filter((id) => String(id) !== String(orderId));
    });
  }

  function toggleAllFilteredOrders(checked: boolean | "indeterminate") {
    const ids = filteredOrders.map((order) => order.id);
    setSelectedIds((current) => {
      if (checked === true) {
        const merged = new Map<string, string | number>();
        [...current, ...ids].forEach((id) => merged.set(String(id), id));
        return [...merged.values()];
      }
      const visible = new Set(ids.map((id) => String(id)));
      return current.filter((id) => !visible.has(String(id)));
    });
  }

  async function openDetailOrder(order: ServiceOrder) {
    setDetailOrder(order);
    setError("");
    try {
      const data = await api.get(`/service-orders/${order.id}`);
      setDetailOrder((data?.item || data) as ServiceOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.loadFailed);
    }
  }

  async function downloadOrderFile(file: OrderFile) {
    if (!file?.id || downloadingFileId) return;
    setDownloadingFileId(file.id);
    setError("");
    try {
      const blob = await api.download(`/files/${file.id}`);
      const { saveAs } = await import("file-saver");
      saveAs(blob, file.originalName || `attachment-${file.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "附件下载失败");
    } finally {
      setDownloadingFileId(null);
    }
  }

  async function exportOrdersPdf(orderIds: Array<ServiceOrder["id"]> = [], fileLabel?: string) {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const effectiveIds = orderIds.length ? orderIds : selectedIds;
      let queryString: string;
      if (effectiveIds.length) {
        // 有勾选：只导出选中的工单
        queryString = `ids=${effectiveIds.join(",")}`;
      } else {
        // 无勾选：按当前筛选导出全部匹配
        const params = buildListParams(1, 100);
        params.delete("page");
        params.delete("pageSize");
        queryString = params.toString();
      }
      const blob = await api.download(`/service-orders/export-pdf-batch?${queryString}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const datePart = `-至${normalizedDateRange(startDate, endDate).endDate || new Date().toISOString().slice(0, 10)}`;
      const namePart = orderIds.length === 1
        ? `-${safeFilenamePart(fileLabel || String(orderIds[0]))}`
        : effectiveIds.length
        ? `-已选${effectiveIds.length}张`
        : selectedCustomerName ? `-${safeFilenamePart(selectedCustomerName)}` : "";
      link.download = `服务记录${namePart}${datePart}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 导出失败");
    } finally {
      setExporting(false);
    }
  }

  function buildListParams(page: number, pageSize: number) {
    const range = normalizedDateRange(startDate, endDate);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy: "createdAt",
      sortDir: "desc",
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (customerFilter !== "all") params.set("customerId", customerFilter);
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    if (searchQuery.trim()) params.set("keyword", searchQuery.trim());
    return params;
  }

  async function fetchExportOrders(orderIds: Array<ServiceOrder["id"]> = []) {
    const fetchOrderDetails = async (ids: Array<ServiceOrder["id"]>) => {
      const chunks: Array<Array<ServiceOrder["id"]>> = [];
      for (let index = 0; index < ids.length; index += 8) chunks.push(ids.slice(index, index + 8));
      const details: ServiceOrder[] = [];
      for (const chunk of chunks) {
        const chunkDetails = await Promise.all(
          chunk.map(async (id) => {
            const data = await api.get(`/service-orders/${id}`);
            return (data?.item || data) as ServiceOrder;
          }),
        );
        details.push(...chunkDetails.filter(Boolean));
      }
      return details;
    };

    if (orderIds.length) {
      return fetchOrderDetails(orderIds);
    }
    const pageSize = 100;
    let page = 1;
    let totalCount = 0;
    const allItems: ServiceOrder[] = [];
    do {
      const data = await api.get(`/service-orders?${buildListParams(page, pageSize).toString()}`);
      const items = (data?.items || []) as ServiceOrder[];
      allItems.push(...items);
      totalCount = Number(data?.total ?? allItems.length);
      if (!items.length) break;
      page += 1;
    } while (allItems.length < totalCount);
    // 有勾选则只导出选中的工单，与 PDF 导出口径一致
    if (selectedIds.length) {
      const idSet = new Set(selectedIds.map((id) => String(id)));
      return fetchOrderDetails(allItems.filter((item) => idSet.has(String(item.id))).map((item) => item.id));
    }
    return fetchOrderDetails(allItems.map((item) => item.id));
  }

  async function exportOrders(orderIds: Array<ServiceOrder["id"]> = []) {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const items = await fetchExportOrders(orderIds);
      if (!items.length) {
        setError(t.errors.exportEmpty);
        return;
      }

      const [{ Workbook }, { saveAs }] = await Promise.all([
        import("exceljs"),
        import("file-saver"),
      ]);
      const workbook = new Workbook();
      workbook.creator = "Service Sheet RC";
      workbook.created = new Date();
      workbook.modified = new Date();
      const worksheet = workbook.addWorksheet(safeSheetName(selectedCustomerName || "工单导出", "工单导出"), {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      worksheet.columns = [
        { header: "工单编号", key: "orderNo", width: 20 },
        { header: "客户名称", key: "customerName", width: 26 },
        { header: "联系人", key: "contactName", width: 14 },
        { header: "联系电话", key: "contactPhone", width: 16 },
        { header: "客户地址", key: "customerAddress", width: 30 },
        { header: "设备", key: "deviceName", width: 18 },
        { header: "服务方式", key: "serviceMode", width: 12 },
        { header: "服务事项", key: "serviceType", width: 18 },
        { header: "优先级", key: "priority", width: 10 },
        { header: "工程师", key: "engineerName", width: 18 },
        { header: "计划开始", key: "plannedStartAt", width: 18 },
        { header: "计划结束", key: "plannedEndAt", width: 18 },
        { header: "状态", key: "status", width: 12 },
        { header: "创建时间", key: "createdAt", width: 18 },
        { header: "更新时间", key: "updatedAt", width: 18 },
        { header: "问题描述", key: "issueDescription", width: 42 },
        { header: "处理记录", key: "workContent", width: 50 },
        { header: "备件与硬件部件", key: "partRecords", width: 44 },
        { header: "内部备注", key: "internalNote", width: 28 },
      ];

      items.forEach((order) => {
        worksheet.addRow({
          orderNo: displayId(order),
          customerName: order.customerName || "",
          contactName: order.contactName || "",
          contactPhone: order.contactPhone || "",
          customerAddress: order.customerAddress || "",
          deviceName: order.deviceName || "",
          serviceMode: t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "",
          serviceType: serviceItemsLabel(order, ""),
          priority: PRIORITY_LABELS[order.priority || ""] || order.priority || "",
          engineerName: engineerText(order, ""),
          plannedStartAt: formatDateTime(order.plannedStartAt),
          plannedEndAt: formatDateTime(order.plannedEndAt),
          status: order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "",
          createdAt: formatDateTime(order.createdAt),
          updatedAt: formatDateTime(order.updatedAt),
          issueDescription: compactText(order.issueDescription, ""),
          workContent: displayServiceOrderWorkContent(order),
          partRecords: displayServiceOrderParts(order.parts),
          internalNote: compactText(order.internalNote, ""),
        });
      });

      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, worksheet.rowCount), column: worksheet.columns.length },
      };
      worksheet.getRow(1).height = 24;
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFB7C9D6" } },
          left: { style: "thin", color: { argb: "FFB7C9D6" } },
          bottom: { style: "thin", color: { argb: "FFB7C9D6" } },
          right: { style: "thin", color: { argb: "FFB7C9D6" } },
        };
      });
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD9E2EC" } },
            left: { style: "thin", color: { argb: "FFD9E2EC" } },
            bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
            right: { style: "thin", color: { argb: "FFD9E2EC" } },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: [11, 12, 14, 15].includes(colNumber) ? "center" : "left",
            wrapText: [5, 16, 17, 18, 19].includes(colNumber),
          };
          if (rowNumber % 2 === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
          }
        });
      });

      const range = normalizedDateRange(startDate, endDate);
      const datePart = range.startDate || range.endDate ? `${range.startDate || "不限"}-至-${range.endDate || "不限"}` : new Date().toISOString().slice(0, 10);
      const customerPart = orderIds.length === 1
        ? `-${safeFilenamePart(displayId(items[0]))}`
        : selectedCustomerName ? `-${safeFilenamePart(selectedCustomerName)}` : "";
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `工单导出${customerPart}-${datePart}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  async function createOrder() {
    if (!createForm.customerId || !createForm.serviceType || !createForm.issueDescription.trim()) {
      setError("请选择客户、服务类型并填写问题描述");
      return;
    }
    const fileError = validateOrderFiles(createFiles);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSaving(true);
    setError("");
    let createdOrderId: string | number | null = null;
    const shouldAssignAfterFiles = createFiles.length > 0 && createForm.engineerId && createForm.engineerId !== "none";
    try {
      const created = await api.post("/service-orders", {
        customerId: Number(createForm.customerId),
        deviceId: createForm.deviceId && createForm.deviceId !== "none" ? Number(createForm.deviceId) : null,
        serviceMode: createForm.serviceMode,
        serviceType: createForm.serviceMode === "onsite" ? createForm.serviceType : "other",
        timesheetCategory: createForm.serviceMode === "onsite" ? null : createForm.timesheetCategory || "其他",
        engineerId: shouldAssignAfterFiles ? undefined : createForm.engineerId && createForm.engineerId !== "none" ? Number(createForm.engineerId) : undefined,
        plannedStartAt: createForm.plannedStartAt || undefined,
        plannedEndAt: createForm.plannedEndAt || undefined,
        priority: createForm.priority,
        issueDescription: createForm.issueDescription.trim(),
        internalNote: createForm.internalNote.trim() || null,
      });
      createdOrderId = created?.id || null;
      if (createFiles.length && !createdOrderId) {
        throw new Error("工单创建后未返回编号，附件未上传");
      }
      if (createdOrderId && (createFiles.length || shouldAssignAfterFiles)) {
        try {
          if (createFiles.length) await uploadOrderFiles(createdOrderId, createFiles);
          if (shouldAssignAfterFiles) {
            await api.post(`/service-orders/${createdOrderId}/assign`, {
              primaryEngineerId: Number(createForm.engineerId),
              engineerIds: [Number(createForm.engineerId)],
              plannedStartAt: createForm.plannedStartAt || undefined,
              plannedEndAt: createForm.plannedEndAt || undefined,
            });
          }
        } catch (postCreateError) {
          try {
            await api.delete(`/service-orders/${createdOrderId}`);
          } catch (rollbackError) {
            const postCreateMessage = postCreateError instanceof Error ? postCreateError.message : "附件上传或派单失败";
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : "自动删除失败";
            throw new Error(`${postCreateMessage}；工单已创建但自动删除失败：${rollbackMessage}`);
          }
          const postCreateMessage = postCreateError instanceof Error ? postCreateError.message : "附件上传或派单失败";
          throw new Error(`${postCreateMessage}；工单已自动取消创建`);
        }
      }
      setCreateOpen(false);
      setCreateFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建工单失败");
    } finally {
      setSaving(false);
    }
  }

  async function confirmInspection(order: ServiceOrder) {
    if (!order.id) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${order.id}/confirm-inspection`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认巡检失败");
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteOrders() {
    if (!selectedIds.length) return;
    setError("");
    setDeletePreviewError("");
    setDeletePreviewOrders([]);
    setDeleteOpen(true);
    setDeletePreviewLoading(true);
    try {
      const confirmationOrders = await loadDeleteConfirmationOrders(selectedIds);
      setDeletePreviewOrders(confirmationOrders);
      if (!confirmationOrders.length) {
        setDeletePreviewError("未能加载所选工单的删除影响明细");
      }
    } catch (e) {
      setDeletePreviewError(e instanceof Error ? e.message : "删除影响明细加载失败");
    } finally {
      setDeletePreviewLoading(false);
    }
  }

  function closeDeleteDialog() {
    if (saving) return;
    setDeleteOpen(false);
    setDeletePreviewOrders([]);
    setDeletePreviewError("");
  }

  async function confirmDeleteOrders() {
    if (!selectedIds.length || deletePreviewLoading || deletePreviewError) return;
    setSaving(true);
    setError("");
    setDeletePreviewError("");
    try {
      const canUseBulkDeleteEndpoint = canBulkDeleteOrders;
      if (canUseBulkDeleteEndpoint) {
        await api.post("/service-orders/bulk-delete", { ids: selectedIds });
      } else {
        for (const id of selectedIds) {
          await api.delete(`/service-orders/${id}`);
        }
      }
      setSelectedIds([]);
      setDeleteOpen(false);
      setDeletePreviewOrders([]);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "批量删除失败";
      setDeletePreviewError(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function openAssign(order: ServiceOrder) {
    setAssignOrder(order);
    setAssignForm({
      engineerIds: (order.engineers || [])
        .map((engineer: any) => String(engineer.id || ""))
        .filter(Boolean),
      plannedStartAt: order.plannedStartAt ? String(order.plannedStartAt).replace(" ", "T").slice(0, 16) : "",
      plannedEndAt: order.plannedEndAt ? String(order.plannedEndAt).replace(" ", "T").slice(0, 16) : "",
      note: "",
    });
    setAssignFiles([]);
    setAssignOpen(true);
  }

  function toggleAssignEngineer(engineerId: string | number, checked: boolean) {
    const id = String(engineerId);
    setAssignForm((form) => ({
      ...form,
      engineerIds: checked
        ? [...form.engineerIds, id].filter((value, index, values) => values.indexOf(value) === index)
        : form.engineerIds.filter((value) => value !== id),
    }));
  }

  async function uploadOrderFiles(orderId: string | number, files: File[]) {
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ownerType", "service_order");
      formData.append("ownerId", String(orderId));
      await api.postForm("/files", formData);
    }
  }

  async function assignOrderToEngineer() {
    if (!assignOrder?.id || !assignForm.engineerIds.length) {
      setError("请至少选择一位派发工程师");
      return;
    }
    const fileError = validateOrderFiles(assignFiles);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${assignOrder.id}/assign`, {
        primaryEngineerId: Number(assignForm.engineerIds[0]),
        engineerIds: assignForm.engineerIds.map(Number),
        plannedStartAt: assignForm.plannedStartAt || undefined,
        plannedEndAt: assignForm.plannedEndAt || undefined,
        note: assignForm.note || undefined,
      });
      if (assignFiles.length) {
        await uploadOrderFiles(assignOrder.id, assignFiles);
      }
      setAssignOpen(false);
      setAssignOrder(null);
      setAssignFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "派单失败");
    } finally {
      setSaving(false);
    }
  }

  function openTransition(order: ServiceOrder) {
    setTransitionOrder(order);
    setTransitionForm({ status: getWorkflowStatus(order) === "in_progress" ? "submitted" : "in_progress", reason: "" });
    setTransitionOpen(true);
  }

  async function transitionSelectedOrder() {
    if (!transitionOrder?.id || !transitionForm.status) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${transitionOrder.id}/transition`, {
        status: transitionForm.status,
        reason: transitionForm.reason || undefined,
      });
      setTransitionOpen(false);
      setTransitionOrder(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "状态流转失败");
    } finally {
      setSaving(false);
    }
  }

  const deviceOptions = createForm.customerId
    ? devices.filter((device) => String(device.customerId) === createForm.customerId)
    : devices;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={saving}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={saving || exporting || loading}>
                {exporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Download className="w-4 h-4 mr-2" />}
                {exporting ? t.actions.exporting : t.actions.export}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportOrders()} disabled={exporting || loading}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t.actions.exportExcel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportOrdersPdf()} disabled={exporting || loading}>
                <FileDown className="w-4 h-4 mr-2" />
                {t.actions.exportPdf}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canDeleteOrders ? (
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={bulkDeleteOrders} disabled={saving || !selectedIds.length}>
              <Trash2 className="w-4 h-4 mr-2" />
              批量删除{selectedIds.length ? ` (${selectedIds.length})` : ""}
            </Button>
          ) : null}
          {canCreateOrders ? (
            <Button onClick={openCreateOrder} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              新增工单
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, statIndex) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                                {initialLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{stat.value}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.15fr)_minmax(170px,0.7fr)_minmax(260px,1fr)]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.filters.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // 回车跳过防抖立即搜索(值未变时由 effect 去重,不会重复请求)
                  if (e.key === "Enter") setDebouncedSearch(searchQuery);
                }}
              />
            </div>
            <div className="min-w-0">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t.filters.statusPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t.filters.customerPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.filters.allCustomers}</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name || `客户 #${customer.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:gap-3 2xl:grid-cols-[minmax(184px,220px)_minmax(184px,220px)_auto]">
            <div className="min-w-0 overflow-hidden space-y-1.5">
              <Label htmlFor="service-orders-start-date" className="text-xs text-muted-foreground">
                {t.filters.startDate}
              </Label>
              <CompactDateFilterInput
                id="service-orders-start-date"
                label={t.filters.startDate}
                value={startDate}
                onChange={setStartDate}
              />
            </div>
            <div className="min-w-0 overflow-hidden space-y-1.5">
              <Label htmlFor="service-orders-end-date" className="text-xs text-muted-foreground">
                {t.filters.endDate}
              </Label>
              <CompactDateFilterInput
                id="service-orders-end-date"
                label={t.filters.endDate}
                value={endDate}
                onChange={setEndDate}
              />
            </div>
            <Button
              className="h-9 shrink-0 whitespace-nowrap px-2.5 sm:px-3"
              variant="outline"
              onClick={resetFilters}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t.actions.reset}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={allFilteredOrdersSelected}
                onCheckedChange={toggleAllFilteredOrders}
                disabled={saving || filteredOrders.length === 0}
                aria-label="全选当前工单列表"
              />
              全选当前列表
            </label>
            <span>
              {selectedIds.length
                ? `已勾选 ${selectedIds.length} 张；导出（Excel / PDF）仅包含勾选的工单。`
                : `当前条件匹配 ${total} 张工单；未勾选时，导出会包含所有匹配记录，不只当前页。`}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t.list.title} ({filteredOrders.length}/{total || filteredOrders.length})
            {refreshing && <span className="btn-loader" aria-hidden="true" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto rounded-md border">
            <table className="w-full min-w-[1250px] table-fixed caption-bottom text-sm">
              <colgroup>
                <col className="w-11" />
                <col className="w-[230px]" />
                <col className="w-[110px]" />
                <col className="w-[260px]" />
                <col className="w-[130px]" />
                <col className="w-[160px]" />
                <col className="w-[96px]" />
                <col className="w-[220px]" />
              </colgroup>
              <TableHeader className="text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/70 [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:backdrop-blur">
                <TableRow>
                  <TableHead className="w-11 text-center" />
                  <TableHead>Case ID / 客户</TableHead>
                  <TableHead>服务事项</TableHead>
                  <TableHead>主要内容</TableHead>
                  <TableHead>工程师</TableHead>
                  <TableHead>服务时间</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="pr-5 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={8} className="py-1">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 flex-1" />
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-6 w-14 rounded-full" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      {t.list.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order, rowIndex) => {
                    const statusLabel = order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "-";
                    const modeLabel = t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "-";
                    const itemsLabel = serviceItemsLabel(order);
                    const workflowStatus = getWorkflowStatus(order);
                    const serviceTime = serviceTimeRange(order);
                    const canConfirmInspection = canAssignOrders && workflowStatus === "pending_confirmation" && order.serviceType === "inspect";
                    const canAssign = canAssignOrders && !["cancelled", "submitted", "awaiting_customer_signature"].includes(workflowStatus);
                    const canExport = ["submitted", "approved", "archived", "completed"].includes(workflowStatus);
                    return (
                      <TableRow
                        key={order.id}
                        role="button"
                        tabIndex={0}
                        className="list-row-enter cursor-pointer"
                        style={{ animationDelay: `${Math.min(rowIndex * 40, 400)}ms` }}
                        onClick={() => openDetailOrder(order)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetailOrder(order);
                          }
                        }}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.some((id) => String(id) === String(order.id))}
                            onCheckedChange={(checked) => toggleOrderSelection(order.id, checked)}
                            aria-label={`选择工单 ${displayId(order)}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-0">
                            <div className="truncate font-semibold" title={displayId(order)}>{displayId(order)}</div>
                            <button
                              type="button"
                              className="block max-w-full truncate text-left text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                              title={`按客户过滤：${textValue(order.customerName)}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                applyNameFilter(order.customerName);
                              }}
                            >
                              {textValue(order.customerName)}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant={MODE_BADGE_VARIANT[order.serviceMode || ""] || "secondary"}>{modeLabel}</Badge>
                            <Badge variant={TYPE_BADGE_VARIANT[order.serviceType || ""] || "outline"}>{itemsLabel}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <span className="block truncate font-medium" title={orderMainContent(order)}>{orderMainContent(order)}</span>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline disabled:cursor-default disabled:text-current disabled:no-underline"
                            title={`按工程师过滤：${engineerText(order, t.detail.unnamedEngineer)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              applyNameFilter(engineerText(order, ""));
                            }}
                            disabled={!engineerText(order, "")}
                          >
                            {engineerText(order, t.detail.unnamedEngineer)}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5 text-xs">
                            <div>
                              <span className="text-muted-foreground">开始：</span>
                              <span>{serviceTime.start}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">结束：</span>
                              <span>{serviceTime.end}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANT[getWorkflowStatus(order)] || "secondary"}>
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canConfirmInspection && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  confirmInspection(order);
                                }}
                                disabled={saving}
                              >
                                <CheckCircle className="mr-1 h-4 w-4" />
                                确认巡检
                              </Button>
                            )}
                            {canAssign && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAssign(order);
                                }}
                                disabled={saving}
                              >
                                <Send className="mr-1 h-4 w-4" />
                                派单 / 改派
                              </Button>
                            )}
                            {canExport && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                                    onClick={(event) => event.stopPropagation()}
                                    disabled={exporting}
                                  >
                                    {exporting ? <span className="btn-loader mr-1" aria-hidden="true" /> : <Download className="mr-1 h-4 w-4" />}
                                    {t.actions.export}
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                                  <DropdownMenuItem onSelect={() => exportOrders([order.id])} disabled={exporting}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                                    {t.actions.exportExcel}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => exportOrdersPdf([order.id], displayId(order))} disabled={exporting}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    {t.actions.exportPdf}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ServiceOrderDetailDialog
        order={detailOrder}
        downloadingFileId={downloadingFileId}
        onDownloadFile={downloadOrderFile}
        onClose={closeDetailOrder}
        statusLabels={t.status}
        modeLabels={t.mode}
        detailLabels={t.detail}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>新增工单</DialogTitle>
            <DialogDescription>可先保存为草稿；选择工程师后会立即派发到对应工程师的工作台。</DialogDescription>
          </DialogHeader>
          {error && createOpen ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <div className="space-y-2">
              <Label>客户 *</Label>
              <Select value={createForm.customerId} onValueChange={(v) => setCreateForm({ ...createForm, customerId: v, deviceId: "" })}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>{customer.name || `客户 #${customer.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>设备</Label>
              <Select value={createForm.deviceId} onValueChange={(v) => setCreateForm({ ...createForm, deviceId: v })}>
                <SelectTrigger><SelectValue placeholder="不指定设备" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定设备</SelectItem>
                  {deviceOptions.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>{deviceOptionLabel(device)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>服务方式</Label>
              <Select value={createForm.serviceMode} onValueChange={(v) => setCreateForm({ ...createForm, serviceMode: v, deviceId: createForm.deviceId === "none" ? "" : createForm.deviceId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onsite">现场服务</SelectItem>
                  <SelectItem value="remote">远程服务</SelectItem>
                  <SelectItem value="office">内勤工作</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{createForm.serviceMode === "onsite" ? "服务类型" : "工时类别"}</Label>
              {createForm.serviceMode === "onsite" ? (
                <Select value={createForm.serviceType} onValueChange={(v) => setCreateForm({ ...createForm, serviceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="install">安装</SelectItem>
                    <SelectItem value="repair">排障</SelectItem>
                    <SelectItem value="maintain">调优</SelectItem>
                    <SelectItem value="inspect">巡检</SelectItem>
                    <SelectItem value="training">培训</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={createForm.timesheetCategory} onChange={(e) => setCreateForm({ ...createForm, timesheetCategory: e.target.value })} placeholder={createForm.serviceMode === "remote" ? "排障 / 调配 / 协调 / 会议 / 其他" : "方案准备 / 文档整理 / 网络会议 / 培训学习 / 其他"} />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>优先级</Label>
                <HelpTooltip label={PRIORITY_HELP} />
              </div>
              <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="normal">普通</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="urgent">紧急</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>派发工程师</Label>
              <Select value={createForm.engineerId} onValueChange={(v) => setCreateForm({ ...createForm, engineerId: v })}>
                <SelectTrigger><SelectValue placeholder="创建后暂不派发" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">创建后暂不派发</SelectItem>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={String(engineer.id)}>
                      {engineer.realName || engineer.username || `工程师 #${engineer.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>计划开始</Label>
              <Input type="datetime-local" value={createForm.plannedStartAt} onChange={(e) => setCreateForm({ ...createForm, plannedStartAt: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>计划结束</Label>
              <Input type="datetime-local" value={createForm.plannedEndAt} onChange={(e) => setCreateForm({ ...createForm, plannedEndAt: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>问题描述 *</Label>
              <Textarea value={createForm.issueDescription} onChange={(e) => setCreateForm({ ...createForm, issueDescription: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>内部备注</Label>
              <Textarea value={createForm.internalNote} onChange={(e) => setCreateForm({ ...createForm, internalNote: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>附件</Label>
              <Input
                type="file"
                multiple
                accept={ORDER_ATTACHMENT_ACCEPT}
                onChange={(event) => setCreateFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-muted-foreground">选择工程师后可随工单派发给工程师查看；未派发时附件会先保存到工单中。{ORDER_ATTACHMENT_HINT}</p>
              {createFiles.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {createFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate">{file.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={createOrder} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Plus className="w-4 h-4 mr-2" />}
              {saving ? "创建中…" : "创建工单"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>派单 / 改派</DialogTitle>
            <DialogDescription>选择工程师后，工单会进入已派发状态并同步到工程师端。</DialogDescription>
          </DialogHeader>
          {error && assignOpen ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          <div className="min-h-0 space-y-4 overflow-y-auto py-2 pr-1">
            <div className="space-y-2">
              <Label>工程师 *</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                {engineers.map((engineer) => {
                  const checked = assignForm.engineerIds.includes(String(engineer.id));
                  return (
                    <label key={engineer.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleAssignEngineer(engineer.id, Boolean(value))}
                      />
                      <span>{engineer.realName || engineer.username || `工程师 #${engineer.id}`}</span>
                      {checked && assignForm.engineerIds[0] === String(engineer.id) && (
                        <Badge variant="secondary">主</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">可选择多位工程师；第一位选中的工程师作为主工程师。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>计划开始</Label>
                <Input type="datetime-local" value={assignForm.plannedStartAt} onChange={(e) => setAssignForm({ ...assignForm, plannedStartAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>计划结束</Label>
                <Input type="datetime-local" value={assignForm.plannedEndAt} onChange={(e) => setAssignForm({ ...assignForm, plannedEndAt: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>派单说明</Label>
              <Textarea value={assignForm.note} onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>附件</Label>
              <Input
                type="file"
                multiple
                accept={ORDER_ATTACHMENT_ACCEPT}
                onChange={(event) => setAssignFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-muted-foreground">可上传装机设备清单、报错截图、客户资料等，工程师可在工单详情中下载查看。{ORDER_ATTACHMENT_HINT}</p>
              {assignFiles.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {assignFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate">{file.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-4">
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={assignOrderToEngineer} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Send className="w-4 h-4 mr-2" />}
              {saving ? "派单中…" : "确认派单"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              删除工单
            </DialogTitle>
            <DialogDescription>
              删除后工单主体及下列关联内容不可恢复；目标设备只会解除关联，安装来源设备会按下方预览处理。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">
              请确认这些工单及关联内容都不再需要。删除操作会写入审计日志。
            </div>
            {deletePreviewLoading ? (
              <div className="rounded-lg border bg-slate-50 p-3 text-muted-foreground">
                <span className="btn-loader mr-2" aria-hidden="true" />
                正在加载删除影响明细…
              </div>
            ) : deletePreviewError ? (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-600">
                {deletePreviewError}
              </div>
            ) : deletePreviewOrders.length ? (() => {
              const summary = orderDeleteImpactSummary(deletePreviewOrders);
              const summaryItems = [
                ["服务记录", summary.reports],
                ["部件记录", summary.parts],
                ["附件", summary.files],
                ["目标设备关联", summary.targetDevices],
                ["将删除安装设备", summary.installedDevicesToDelete],
                ["保留安装设备", summary.installedDevicesToKeep],
                ["签署请求", summary.signatureRequests],
                ["编辑草稿", summary.drafts],
              ] as const;
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {summaryItems.map(([label, count]) => (
                      <div key={label} className="rounded-md border bg-white px-3 py-2">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="text-base font-semibold text-slate-900">{count}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {deletePreviewOrders.map((order) => {
                      const sections = orderDeleteImpactSections(order);
                      return (
                        <details key={`delete-preview-${order.id}`} className="rounded-lg border bg-white" open={deletePreviewOrders.length === 1}>
                          <summary className="cursor-pointer px-3 py-2 font-medium">
                            {displayId(order)} · {textValue(order.customerName)}
                          </summary>
                          <div className="space-y-3 px-3 pb-3">
                            {sections.map((section) => (
                              <div key={`${order.id}-${section.key}`} className="rounded-md bg-slate-50 px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-medium text-slate-900">{section.title}</div>
                                  <Badge variant="secondary">{section.count}</Badge>
                                </div>
                                {section.description ? (
                                  <div className="mt-1 text-xs text-muted-foreground">{section.description}</div>
                                ) : null}
                                <div className="mt-2 space-y-1.5">
                                  {section.items.map((item, index) => (
                                    <div key={`${section.key}-${index}`} className="rounded bg-white px-2 py-1.5 text-xs leading-5 text-slate-700">
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
              <div className="rounded-lg border bg-slate-50 p-3 text-muted-foreground">
                未加载到删除影响明细。
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={saving}>取消</Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteOrders}
              disabled={saving || deletePreviewLoading || Boolean(deletePreviewError) || !deletePreviewOrders.length}
            >
              {saving ? <span className="btn-loader" aria-hidden="true" /> : <Trash2 className="h-4 w-4" />}
              {saving ? "删除中…" : `确认删除 ${deletePreviewOrders.length || selectedIds.length} 张工单`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>状态流转</DialogTitle>
            <DialogDescription>后台状态变更会写入操作审计。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>目标状态</Label>
              <Select value={transitionForm.status} onValueChange={(v) => setTransitionForm({ ...transitionForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="assigned">已派发</SelectItem>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="awaiting_customer_signature">待客户签署</SelectItem>
                  <SelectItem value="submitted">已结案</SelectItem>
                  <SelectItem value="approved">已审核</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                  <SelectItem value="cancelled">已作废</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>流转原因 / 备注</Label>
              <Textarea value={transitionForm.reason} onChange={(e) => setTransitionForm({ ...transitionForm, reason: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={transitionSelectedOrder} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {saving ? "流转中…" : "确认流转"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
