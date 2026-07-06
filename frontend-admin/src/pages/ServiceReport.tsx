import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bold,
  Braces,
  Camera,
  ChevronDown,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Code2,
  Copy,
  ClipboardPenLine,
  Download,
  FileText,
  HardDrive,
  Heading2,
  History,
  Link,
  Loader2,
  List,
  ListOrdered,
  MapPin,
  MonitorCog,
  MoreHorizontal,
  Package,
  PenLine,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  Trash2,
  Upload,
  User,
  Users,
  Wrench,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ErrorToast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type AppLang } from "@/contexts/LanguageContext";
import { MarkdownContent } from "@/lib/markdown";
import { remoteCategoryLabel, serviceItemLabels, serviceItemsLabel } from "@/lib/service-items";
import { api } from "@/services/api";

type ServiceMode = "onsite" | "remote" | "office";
type AttachmentPurpose = "support_config" | "site_photo" | "screenshot_log" | "inspection_document";
type CustomerSignatureMode = "onsite" | "electronic";
type InstallDeviceInputMode = "manual" | "existing";
type OperationOption = { value: string; label: string; description: string; descriptionItems?: string[]; icon: typeof Wrench };
type ServiceModuleId = "install" | "repair" | "inspect" | "replacement";
type ServiceModuleOption = OperationOption & { value: ServiceModuleId };
type BadgeVariant = "draft" | "secondary" | "purple" | "success" | "warning" | "destructive" | "info" | "outline";

interface ServiceOrder {
  id: string | number;
  orderNo?: string;
  customerId?: string | number;
  customerName?: string;
  customerAddress?: string;
  customerLatitude?: string | number | null;
  customerLongitude?: string | number | null;
  customerMapProvider?: string;
  customerMapPoiId?: string;
  customerMapPoiName?: string;
  customerMapAddress?: string;
  contactName?: string;
  contactPhone?: string;
  deviceId?: string | number;
  deviceName?: string;
  deviceModel?: string;
  devicePn?: string;
  deviceSerialNo?: string;
  deviceRemark?: string;
  serviceMode?: ServiceMode | string;
  serviceType?: string;
  serviceModules?: ServiceModuleId[];
  timesheetCategory?: string;
  timesheetSalesperson?: string;
  priority?: string;
  issueDescription?: string;
  internalNote?: string;
  workflowStatus?: string;
  status?: string;
  displayStatus?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  submittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  inspectionScheduleId?: string | number;
  report?: ServiceReport | null;
  targetDevices?: DeviceOption[];
  parts?: ServicePart[];
  installedDevices?: InstalledDevice[];
  files?: OrderFile[];
  engineers?: EngineerOption[];
  contacts?: CustomerContact[];
  customerSignatureRequest?: CustomerSignatureRequest | null;
  deletePreview?: ServiceOrderDeletePreview;
}

interface ServiceReport {
  departureAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  returnAt?: string;
  workContent?: string;
  workEntries?: Array<{ engineerId?: string | number; workContent?: string; work_content?: string }>;
  result?: string;
  resultDescription?: string;
  customerConfirmName?: string;
  customerName?: string;
  customerSignatureFileId?: string | number;
  customerSignature?: string;
}

interface ServicePart {
  deviceId?: string | number;
  device_id?: string | number;
  deviceName?: string;
  actionType?: string;
  action_type?: string;
  partName?: string;
  part_name?: string;
  partNo?: string;
  part_no?: string;
  quantity?: string | number;
  unit?: string;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface InstalledDevice {
  id?: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
  willDelete?: boolean;
  blockedReasons?: string[];
}

interface ServiceOrderDeletePreview {
  editDraftCount?: number;
  customerSignatureRequestCount?: number;
}

interface OrderFile {
  id: string | number;
  purpose?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  createdAt?: string;
}

interface CustomerSignatureRequest {
  id?: string | number;
  recipientEmail?: string;
  status?: string;
  expiresAt?: string;
  sentAt?: string;
  signedAt?: string;
  lastError?: string;
}

interface CustomerOption {
  id: string | number;
  name?: string;
  nameKey?: string;
  code?: string;
  address?: string;
  mapAddress?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  mapProvider?: string;
  mapPoiId?: string;
  mapPoiName?: string;
  contactName?: string;
  contactPhone?: string;
  contacts?: CustomerContact[];
  serviceOrderCount?: number;
  sortInitial?: string;
  sortKey?: string;
  sortLocale?: AppLang | string;
  source?: string;
  updatedAt?: string;
  createdAt?: string;
}

interface CustomerContact {
  id?: string | number;
  name?: string;
  phone?: string;
  contactName?: string;
  contactPhone?: string;
  useCount?: number;
  engineerUseCount?: number;
  engineerLastUsedAt?: string;
  lastUsedAt?: string;
}

interface GeoCandidate {
  id?: string | number;
  customerId?: string | number;
  name?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contacts?: CustomerContact[];
  latitude?: string | number | null;
  longitude?: string | number | null;
  location?: string;
  mapProvider?: string;
  mapPoiId?: string;
  mapPoiName?: string;
  mapAddress?: string;
  source?: string;
}

interface DeviceOption {
  id: string | number;
  customerId?: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  location?: string;
  remark?: string;
}

interface ModelSuggestion {
  canonicalModel?: string;
  partNumber?: string;
  brand?: string;
  category?: string;
}
type ModelSuggestionValueMode = "model" | "partNo";

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

interface CustomerSignatureRequestInfo {
  serviceOrderId?: string | number;
  signUrl?: string;
  expiresAt?: string;
  mail?: {
    sent?: boolean;
    skipped?: boolean;
    reason?: string;
  };
}

interface ServicePartDraft {
  deviceId: string;
  installDeviceDraftId: string;
  actionType: string;
  partName: string;
  partNo: string;
  quantity: string;
  unit: string;
  remark: string;
}

interface InstallDeviceDraft {
  id: string;
  inputMode: InstallDeviceInputMode;
  deviceId: string;
  model: string;
  pn: string;
  serialNo: string;
  remark: string;
}

type TargetDeviceDraft = InstallDeviceDraft;

interface ReportForm {
  serviceMode: ServiceMode;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerLatitude: string;
  customerLongitude: string;
  customerMapProvider: string;
  customerMapPoiId: string;
  customerMapPoiName: string;
  customerMapAddress: string;
  contactName: string;
  contactPhone: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  devicePn: string;
  deviceSerialNo: string;
  deviceRemark: string;
  targetDeviceIds: string[];
  targetDevices: TargetDeviceDraft[];
  installDeviceInputMode: InstallDeviceInputMode;
  serviceModules: ServiceModuleId[];
  serviceType: string;
  timesheetCategory: string;
  timesheetSalesperson: string;
  priority: string;
  issueDescription: string;
  departureAt: string;
  actualStartAt: string;
  actualEndAt: string;
  returnAt: string;
  workContent: string;
  result: string;
  resultDescription: string;
  customerConfirmName: string;
  customerSignatureMode: CustomerSignatureMode;
  customerSignature: string;
  customerSignatureFileId: string;
  engineerIds: string[];
  installDevices: InstallDeviceDraft[];
  parts: ServicePartDraft[];
}

interface CreateDraftItem {
  id?: string | number;
  draftKey: string;
  payload: ReportForm;
  clientUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const MODE_OPTIONS: Array<{ value: ServiceMode; label: string; description: string; icon: typeof Wrench }> = [
  { value: "onsite", label: "现场", description: "客户现场服务、设备安装、技术处理与巡检", icon: Wrench },
  { value: "remote", label: "远程", description: "远程连接、故障排查与协同支持", icon: MonitorCog },
  { value: "office", label: "内勤", description: "方案准备、文档整理与内部协作", icon: ClipboardPenLine },
];

const SERVICE_TYPE_OPTIONS = [
  { value: "repair", label: "技术处理" },
  { value: "install", label: "安装" },
  { value: "maintain", label: "调优" },
  { value: "inspect", label: "巡检" },
  { value: "training", label: "培训" },
  { value: "other", label: "其他" },
];

const RESULT_OPTIONS = [
  { value: "resolved", label: "已完成" },
  { value: "unresolved", label: "未完成" },
  { value: "follow_up_required", label: "需后续跟进" },
];
const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
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
  rejected: "destructive",
};
const TYPE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  install: "success",
  repair: "warning",
  maintain: "info",
  inspect: "purple",
  training: "info",
  remote: "info",
  other: "secondary",
};
const MODE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  onsite: "success",
  remote: "info",
  office: "purple",
};
const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];
const ONSITE_SERVICE_MODULE_OPTIONS: ServiceModuleOption[] = [
  { value: "repair", label: "技术处理", description: "故障排查、配置修改、调整优化等。", descriptionItems: ["目标设备", "配置/日志文件"], icon: Wrench },
  { value: "install", label: "安装", description: "记录新设备或硬件部件的安装交付信息", descriptionItems: ["新设备安装", "硬件部件安装"], icon: HardDrive },
  { value: "inspect", label: "巡检", description: "记录巡检结果，并上传巡检文档与现场照片", descriptionItems: ["巡检文档", "现场照片"], icon: ClipboardCheck },
  { value: "replacement", label: "备件更换", description: "记录故障备件拆下、换上及相关明细", descriptionItems: ["换下备件", "换上备件"], icon: Package },
];
const REMOTE_SERVICE_MODULE_OPTIONS: ServiceModuleOption[] = [
  { value: "repair", label: "远程技术支持", description: "记录远程连接、故障定位、配置调整与支持过程", descriptionItems: ["目标系统", "截图/日志"], icon: MonitorCog },
  { value: "replacement", label: "备件更换远程协助", description: "记录远程确认的备件更换过程", descriptionItems: ["备件明细", "截图/日志"], icon: Package },
];
const PART_ACTION_OPTIONS = [
  { value: "replacement", label: "备件更换" },
  { value: "installation", label: "硬件部件安装" },
  { value: "general", label: "部件记录" },
];
const ATTACHMENT_PURPOSES: Record<AttachmentPurpose, { label: string; icon: typeof Upload }> = {
  support_config: { label: "配置与支持文件", icon: FileText },
  site_photo: { label: "现场照片", icon: Camera },
  screenshot_log: { label: "截图/日志文件", icon: Upload },
  inspection_document: { label: "巡检文档", icon: ClipboardCheck },
};
const REPORT_ORDER_LIST_WIDTH = "lg:min-w-[1180px]";
const REPORT_ORDER_LIST_GRID = "lg:grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(220px,1.2fr)_minmax(120px,0.7fr)_160px_90px_176px]";
const REPORT_ORDER_HEADER_CLASS = "hidden w-full rounded-md border border-border/70 bg-muted/70 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur lg:grid lg:items-center lg:gap-3";
const REPORT_ORDER_STICKY_HEADER_CLASS = `${REPORT_ORDER_HEADER_CLASS} sticky top-0 z-10`;
const FORM_SKIN = [
  "[&_[data-slot=input]]:h-[42px]",
  "[&_[data-slot=input]]:rounded-lg",
  "[&_[data-slot=input]]:border-border",
  "[&_[data-slot=input]]:bg-input-background",
  "[&_[data-slot=input]]:text-[16px]",
  "sm:[&_[data-slot=input]]:text-[13px]",
  "[&_[data-slot=input]]:shadow-none",
  "[&_[data-slot=input]]:hover:border-primary/40",
  "[&_[data-slot=input]]:hover:bg-input-background",
  "[&_[data-slot=input]]:focus-visible:border-primary",
  "[&_[data-slot=input]]:focus-visible:bg-background",
  "[&_[data-slot=input]]:focus-visible:ring-primary/20",
  "[&_[data-slot=select-trigger]]:h-[42px]",
  "[&_[data-slot=select-trigger]]:rounded-lg",
  "[&_[data-slot=select-trigger]]:border-border",
  "[&_[data-slot=select-trigger]]:bg-input-background",
  "[&_[data-slot=select-trigger]]:text-[16px]",
  "sm:[&_[data-slot=select-trigger]]:text-[13px]",
  "[&_[data-slot=select-trigger]]:shadow-none",
  "[&_[data-slot=select-trigger]]:hover:border-primary/40",
  "[&_[data-slot=select-trigger]]:hover:bg-input-background",
  "[&_[data-slot=select-trigger]]:focus-visible:border-primary",
  "[&_[data-slot=select-trigger]]:focus-visible:bg-background",
  "[&_[data-slot=select-trigger]]:focus-visible:ring-primary/20",
  "[&_[data-slot=button]]:min-h-[42px]",
  "[&_[data-slot=button]]:rounded-lg",
  "[&_[data-slot=button][aria-label]]:min-w-[42px]",
  "[&_[data-slot=textarea]]:rounded-lg",
  "[&_[data-slot=textarea]]:border-border",
  "[&_[data-slot=textarea]]:bg-input-background",
  "[&_[data-slot=textarea]]:text-[16px]",
  "sm:[&_[data-slot=textarea]]:text-[13px]",
  "[&_[data-slot=textarea]]:shadow-none",
  "[&_[data-slot=textarea]]:hover:border-primary/40",
  "[&_[data-slot=textarea]]:hover:bg-input-background",
  "[&_[data-slot=textarea]]:focus-visible:border-primary",
  "[&_[data-slot=textarea]]:focus-visible:bg-background",
  "[&_[data-slot=textarea]]:focus-visible:ring-primary/20",
].join(" ");
const INSPECTION_DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.log,.cfg,.conf,.ini,.json,.xml,.yaml,.yml,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip";
const INSPECTION_DOCUMENT_EXTENSIONS = new Set(INSPECTION_DOCUMENT_ACCEPT.split(","));
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const COMPRESSIBLE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const COMPRESSIBLE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_COMPRESSION_MAX_EDGE = 1920;
const IMAGE_COMPRESSION_QUALITY = 0.8;

function installDeviceDraftId() {
  return `install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function targetDeviceDraftId() {
  return `target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyInstallDevice(patch: Partial<InstallDeviceDraft> = {}): InstallDeviceDraft {
  return {
    id: patch.id || installDeviceDraftId(),
    inputMode: patch.inputMode || (patch.deviceId ? "existing" : "manual"),
    deviceId: patch.deviceId || "",
    model: patch.model || "",
    pn: patch.pn || "",
    serialNo: patch.serialNo || "",
    remark: patch.remark || "",
  };
}

function emptyTargetDevice(patch: Partial<TargetDeviceDraft> = {}): TargetDeviceDraft {
  return {
    id: patch.id || targetDeviceDraftId(),
    inputMode: patch.inputMode || (patch.deviceId ? "existing" : "manual"),
    deviceId: patch.deviceId || "",
    model: patch.model || "",
    pn: patch.pn || "",
    serialNo: patch.serialNo || "",
    remark: patch.remark || "",
  };
}

function emptyPart(actionType = "replacement", deviceId = "", installDeviceDraftIdValue = ""): ServicePartDraft {
  return {
    deviceId,
    installDeviceDraftId: installDeviceDraftIdValue,
    actionType,
    partName: "",
    partNo: "",
    quantity: "1",
    unit: "个",
    remark: "",
  };
}

function defaultForm(mode: ServiceMode = "onsite"): ReportForm {
  return {
    serviceMode: mode,
    customerId: "",
    customerName: "",
    customerAddress: "",
    customerLatitude: "",
    customerLongitude: "",
    customerMapProvider: "",
    customerMapPoiId: "",
    customerMapPoiName: "",
    customerMapAddress: "",
    contactName: "",
    contactPhone: "",
    deviceId: "",
    deviceName: "",
    deviceModel: "",
    devicePn: "",
    deviceSerialNo: "",
    deviceRemark: "",
    targetDeviceIds: [],
    targetDevices: [emptyTargetDevice()],
    installDeviceInputMode: "manual",
    serviceModules: [],
    serviceType: mode === "onsite" ? "repair" : "other",
    timesheetCategory: mode === "remote" ? "排障" : mode === "office" ? "内部支持" : "",
    timesheetSalesperson: "",
    priority: "normal",
    issueDescription: "",
    departureAt: "",
    actualStartAt: "",
    actualEndAt: "",
    returnAt: "",
    workContent: "",
    result: mode === "office" ? "" : "resolved",
    resultDescription: "",
    customerConfirmName: "",
    customerSignatureMode: "onsite",
    customerSignature: "",
    customerSignatureFileId: "",
    engineerIds: [],
    installDevices: [emptyInstallDevice()],
    parts: [],
  };
}

function normalizeMode(value?: string | null): ServiceMode {
  return value === "remote" || value === "office" ? value : "onsite";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return "-";
  if (start && end) return `${formatDateTime(start)} 至 ${formatDateTime(end)}`;
  return formatDateTime(start || end);
}

function displayText(value?: string | number | null, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toInputDateTime(value?: string) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function submitDateTime(value: string) {
  return value ? value.replace("T", " ") : null;
}

function splitInputDateTime(value: string) {
  return {
    date: value ? value.slice(0, 10) : "",
    time: value ? value.slice(11, 16) : "",
  };
}

function openNativePicker(input: HTMLInputElement) {
  input.focus({ preventScroll: true });
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    // Some browsers throw when a native picker is already open or unsupported.
  }
  input.focus();
}

function openPickerOnMouse(event: React.PointerEvent<HTMLInputElement>) {
  if (event.pointerType !== "mouse") return;
  event.preventDefault();
  openNativePicker(event.currentTarget);
}

function useDesktopTimePicker() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px)");
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return enabled;
}

interface TimeInputProps {
  label: string;
  time: string;
  onTimeChange: (time: string) => void;
}

function NativeTimeInput({ label, time, onTimeChange }: TimeInputProps) {
  return (
    <input
      aria-label={`${label}时间`}
      type="time"
      value={time}
      onChange={(event) => onTimeChange(event.target.value)}
      onPointerDown={openPickerOnMouse}
      className="h-9 min-w-0 cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 shadow-sm [color-scheme:light] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    />
  );
}

const DesktopTimePicker = lazy(async () => {
  const [{ TimePicker }, dayjsModule] = await Promise.all([
    import("antd"),
    import("dayjs"),
  ]);
  const dayjs = dayjsModule.default;

  function LoadedDesktopTimePicker({ label, time, onTimeChange }: TimeInputProps) {
    const timeValue = time ? dayjs(time, "HH:mm") : null;
    return (
      <TimePicker
        aria-label={`${label}时间`}
        value={timeValue}
        format="HH:mm"
        minuteStep={5}
        allowClear={false}
        needConfirm={false}
        showNow={false}
        popupClassName="service-report-time-picker"
        className="service-report-time-input h-9 w-full min-w-0 rounded-md border-slate-300 bg-white text-sm shadow-sm hover:border-slate-400 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
        placeholder="选择时间"
        onChange={(nextTime) => onTimeChange(nextTime ? nextTime.format("HH:mm") : "")}
      />
    );
  }

  return { default: LoadedDesktopTimePicker };
});

function inputNow() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function inputToday() {
  return inputNow().slice(0, 10);
}

function optionLabel(option?: EngineerOption) {
  return option?.realName || option?.username || (option?.id ? `工程师 #${option.id}` : "");
}

function deviceLabel(device?: DeviceOption) {
  if (!device) return "";
  return device.name || device.model || device.serialNo || `设备 #${device.id}`;
}

function deviceSelectLabel(device?: DeviceOption) {
  if (!device) return "";
  const primary = deviceLabel(device);
  return [
    primary,
    device.model && device.model !== primary ? device.model : "",
    device.serialNo ? `SN ${device.serialNo}` : "",
    device.pn ? `PN ${device.pn}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function deviceMeta(device?: DeviceOption) {
  if (!device) return "";
  return [
    device.name,
    device.model ? `型号 ${device.model}` : "",
    device.pn ? `PN ${device.pn}` : "",
    device.serialNo ? `SN ${device.serialNo}` : "",
    device.location,
  ]
    .filter(Boolean)
    .join(" · ");
}

function normalizeDeviceSearchText(value?: string | number | null) {
  return String(value ?? "").trim().toLowerCase();
}

function deviceSearchText(device?: DeviceOption) {
  if (!device) return "";
  return [
    device.id,
    device.name,
    device.model,
    device.pn,
    device.serialNo,
    device.remark,
    device.location,
    deviceSelectLabel(device),
    deviceMeta(device),
  ]
    .map(normalizeDeviceSearchText)
    .filter(Boolean)
    .join(" ");
}

function deviceMatchesKeyword(device: DeviceOption, keyword: string) {
  const terms = normalizeDeviceSearchText(keyword).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = deviceSearchText(device);
  return terms.every((term) => haystack.includes(term));
}

function deletePreviewDeviceLabel(device: InstalledDevice | DeviceOption) {
  return [
    device.model || device.name || (device.id ? `设备 #${device.id}` : "未命名设备"),
    device.serialNo ? `SN ${device.serialNo}` : "",
    "pn" in device && device.pn ? `PN ${device.pn}` : "",
  ].filter(Boolean).join(" / ");
}

function deletePreviewInstalledDeviceLabel(device: InstalledDevice) {
  const label = deletePreviewDeviceLabel(device);
  if (device.willDelete === false) {
    const reasons = Array.isArray(device.blockedReasons) && device.blockedReasons.length
      ? `仍关联：${device.blockedReasons.join("、")}`
      : "仍有关联数据";
    return `${label}（保留，${reasons}）`;
  }
  if (device.willDelete === true) return `${label}（将删除）`;
  return `${label}（删除时再次检查是否有关联）`;
}

function deletePreviewFileLabel(file: OrderFile) {
  return `${file.originalName || `附件 #${file.id}`}${file.size ? `（${formatFileSize(file.size)}）` : ""}`;
}

function deletePreviewPartActionLabel(value?: string) {
  if (value === "replacement") return "备件更换";
  if (value === "installation") return "硬件部件安装";
  return "部件记录";
}

function buildDeleteConfirmationMessage(order: ServiceOrder) {
  const details: string[] = [];
  const installedDevices = order.installedDevices || [];
  const targetDevices = order.targetDevices || [];
  const parts = order.parts || [];
  const files = order.files || [];
  if (order.report) details.push("服务记录 1 份");
  if (parts.length) {
    details.push(`部件记录 ${parts.length} 条：${parts.slice(0, 3).map((part) => `${deletePreviewPartActionLabel(part.actionType || part.action_type)} ${part.partName || part.part_name || "未命名部件"}`).join("、")}${parts.length > 3 ? "…" : ""}`);
  }
  if (files.length) details.push(`附件 ${files.length} 个：${files.slice(0, 3).map(deletePreviewFileLabel).join("、")}${files.length > 3 ? "…" : ""}`);
  if (targetDevices.length) {
    details.push(`目标设备关联 ${targetDevices.length} 台：${targetDevices.slice(0, 3).map(deletePreviewDeviceLabel).join("、")}${targetDevices.length > 3 ? "…" : ""}（仅解除关联，不删除设备）`);
  }
  if (installedDevices.length) {
    details.push(`安装来源设备 ${installedDevices.length} 台：${installedDevices.slice(0, 3).map(deletePreviewInstalledDeviceLabel).join("、")}${installedDevices.length > 3 ? "…" : ""}`);
  }
  const signatureRequestCount = Number(order.deletePreview?.customerSignatureRequestCount || 0);
  if (signatureRequestCount > 0) details.push(`客户签署请求 ${signatureRequestCount} 条`);
  const editDraftCount = Number(order.deletePreview?.editDraftCount || 0);
  if (editDraftCount > 0) details.push(`编辑草稿 ${editDraftCount} 份`);
  return [
    `确认删除 ${reportOrderDisplayId(order)}？以下内容会被删除或解除关联：`,
    "",
    ...details.map((item) => `- ${item}`),
    "",
    "安装来源设备如果仍被其他工单、部件记录或巡检计划引用，会保留在设备列表中。",
  ].join("\n");
}

function formatFileSize(value?: number) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function partActionFor(serviceMode: ServiceMode, serviceType: string, timesheetCategory = "") {
  if (serviceMode === "remote" && ["协调", "远程协调", "沟通协调"].includes(timesheetCategory)) return "replacement";
  if (serviceMode !== "onsite") return "general";
  if (serviceType === "install") return "installation";
  if (serviceType === "repair" || serviceType === "inspect") return "replacement";
  return "general";
}

function normalizeResult(value?: string, fallback = "resolved") {
  return RESULT_OPTIONS.some((option) => option.value === value) ? String(value) : fallback;
}

function servicePartHasContent(part: ServicePartDraft) {
  return [part.partName, part.partNo, part.remark]
    .some((value) => String(value ?? "").trim());
}

function installDeviceHasContent(device: InstallDeviceDraft) {
  return Boolean(device.deviceId) || [device.model, device.pn, device.serialNo, device.remark].some((value) => value.trim());
}

function targetDeviceHasContent(device: TargetDeviceDraft) {
  return Boolean(device.deviceId) || [device.model, device.pn, device.serialNo, device.remark].some((value) => value.trim());
}

function normalizeInstallDeviceDraft(
  device: Partial<InstallDeviceDraft> | undefined,
  fallback: Partial<InstallDeviceDraft> = {},
) {
  const merged = { ...fallback, ...(device || {}) };
  const deviceId = merged.deviceId ? String(merged.deviceId) : "";
  const inputMode = merged.inputMode === "existing" || deviceId ? "existing" : "manual";
  return emptyInstallDevice({
    ...merged,
    deviceId,
    inputMode,
  });
}

function normalizeTargetDeviceDraft(
  device: Partial<TargetDeviceDraft> | undefined,
  fallback: Partial<TargetDeviceDraft> = {},
) {
  const merged = { ...fallback, ...(device || {}) };
  const deviceId = merged.deviceId ? String(merged.deviceId) : "";
  const inputMode = merged.inputMode === "existing" || deviceId ? "existing" : "manual";
  return emptyTargetDevice({
    ...merged,
    deviceId,
    inputMode,
  });
}

function installDeviceTitle(device: InstallDeviceDraft, index: number) {
  if (device.inputMode === "existing") return `安装设备 ${index + 1}`;
  return device.model.trim() || `安装设备 ${index + 1}`;
}

function targetDeviceTitle(device: TargetDeviceDraft, index: number) {
  if (device.inputMode === "existing") return `目标设备 ${index + 1}`;
  return device.model.trim() || `目标设备 ${index + 1}`;
}

function optionText(options: Array<{ value: string; label: string }>, value?: string, fallback = "-") {
  return options.find((option) => option.value === value)?.label || value || fallback;
}

function serviceCategoryText(form: Pick<ReportForm, "serviceMode" | "serviceType" | "timesheetCategory">) {
  if (form.serviceMode === "office") return form.timesheetCategory || "内勤";
  if (form.serviceMode === "remote") return remoteCategoryLabel(form.timesheetCategory) || "远程";
  return optionText(SERVICE_TYPE_OPTIONS, form.serviceType, "现场");
}

function serviceModuleLabel(value: ServiceModuleId) {
  return [...ONSITE_SERVICE_MODULE_OPTIONS, ...REMOTE_SERVICE_MODULE_OPTIONS].find((option) => option.value === value)?.label || value;
}

function serviceItemBadgeVariant(label: string, serviceType?: string): BadgeVariant {
  if (label.includes("安装")) return "success";
  if (label.includes("巡检")) return "purple";
  if (label.includes("备件") || label.includes("故障") || label.includes("排查")) return "warning";
  if (label.includes("远程")) return "info";
  if (label.includes("内勤")) return "purple";
  return TYPE_BADGE_VARIANT[serviceType || ""] || "outline";
}

function isServiceModuleId(value: unknown): value is ServiceModuleId {
  return ["install", "repair", "inspect", "replacement"].includes(String(value));
}

function allowedServiceModules(mode: ServiceMode) {
  if (mode === "onsite") return ONSITE_SERVICE_MODULE_OPTIONS.map((option) => option.value);
  if (mode === "remote") return REMOTE_SERVICE_MODULE_OPTIONS.map((option) => option.value);
  return [];
}

function uniqueServiceModules(values: ServiceModuleId[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function defaultServiceModules(mode: ServiceMode): ServiceModuleId[] {
  return [];
}

function deriveModulesFromLegacyForm(value: Partial<ReportForm>, mode: ServiceMode) {
  const modules: ServiceModuleId[] = [];
  if (mode === "onsite") {
    if (value.serviceType === "install") modules.push("install");
    if (value.serviceType === "inspect") modules.push("inspect");
    if (value.serviceType === "repair") modules.push("repair");
  } else if (mode === "remote") {
    const category = String(value.timesheetCategory || value.serviceType || "").replace(/^远程/, "").trim();
    if (["协调", "沟通协调"].includes(category)) modules.push("replacement");
    else if (category) modules.push("repair");
  }
  (value.parts || []).forEach((part) => {
    if (part.actionType === "replacement") modules.push("replacement");
    if (mode === "onsite" && part.actionType === "installation") modules.push("install");
  });
  return uniqueServiceModules(modules);
}

function normalizeServiceModules(value: Partial<ReportForm>, fallbackMode: ServiceMode) {
  const mode = normalizeMode(value.serviceMode || fallbackMode);
  const allowed = new Set(allowedServiceModules(mode));
  const hasExplicitModules = Array.isArray(value.serviceModules);
  const explicit = hasExplicitModules ? value.serviceModules?.filter(isServiceModuleId) || [] : [];
  const modules = (hasExplicitModules ? explicit : deriveModulesFromLegacyForm(value, mode)).filter((item) => allowed.has(item));
  const unique = uniqueServiceModules(modules);
  return unique.length ? unique : defaultServiceModules(mode);
}

function derivePrimaryServiceType(mode: ServiceMode, modules: ServiceModuleId[]) {
  if (mode !== "onsite") return "other";
  if (modules.includes("inspect")) return "inspect";
  if (modules.includes("install")) return "install";
  return "repair";
}

function deriveRemoteTimesheetCategory(modules: ServiceModuleId[]) {
  return modules.includes("replacement") ? "协调" : "排障";
}

function contactKey(contact: CustomerContact) {
  const name = contact.name || contact.contactName || "";
  const phone = contact.phone || contact.contactPhone || "";
  return `${name}:${phone}`;
}

function contactsForCustomer(customer?: CustomerOption | null) {
  if (!customer) return [];
  const contacts = new Map<string, CustomerContact>();
  const push = (contact?: CustomerContact | null, weight = 0) => {
    const name = String(contact?.name || contact?.contactName || "").trim();
    if (!name) return;
    const phone = String(contact?.phone || contact?.contactPhone || "").trim();
    const key = contactKey({ name, phone });
    const existing = contacts.get(key);
    contacts.set(key, {
      id: contact?.id || key,
      name,
      phone,
      useCount: Number(contact?.useCount || 0) + Number(existing?.useCount || 0) + weight,
      engineerUseCount: Number(contact?.engineerUseCount || 0) + Number(existing?.engineerUseCount || 0),
      engineerLastUsedAt: contact?.engineerLastUsedAt || existing?.engineerLastUsedAt || "",
      lastUsedAt: contact?.lastUsedAt || existing?.lastUsedAt || "",
    });
  };
  push({ name: customer.contactName, phone: customer.contactPhone }, 1);
  (customer.contacts || []).forEach((contact) => push(contact));
  return [...contacts.values()].sort((a, b) => {
    const engineerTimeSort = String(b.engineerLastUsedAt || "").localeCompare(String(a.engineerLastUsedAt || ""));
    if (engineerTimeSort) return engineerTimeSort;
    if (Number(b.engineerUseCount || 0) !== Number(a.engineerUseCount || 0)) {
      return Number(b.engineerUseCount || 0) - Number(a.engineerUseCount || 0);
    }
    if (Number(b.useCount || 0) !== Number(a.useCount || 0)) return Number(b.useCount || 0) - Number(a.useCount || 0);
    return String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || ""));
  });
}

function customerMatches(customer: CustomerOption, keyword: string) {
  const text = keyword.trim().toLowerCase();
  if (!text) return true;
  return [
    customer.name,
    customer.code,
    customer.address,
    customer.mapAddress,
    customer.contactName,
    customer.contactPhone,
    ...(customer.contacts || []).flatMap((contact) => [contact.name, contact.phone, contact.contactName, contact.contactPhone]),
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(text));
}

const CUSTOMER_INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

function customerName(customer: CustomerOption) {
  return customer.name || `客户 #${customer.id}`;
}

function customerMeta(customer: CustomerOption) {
  return [customer.address || customer.mapAddress, customer.contactName, customer.contactPhone]
    .filter(Boolean)
    .join(" · ") || customer.code || "系统客户";
}

function customerInitial(customer: CustomerOption) {
  const initial = String(customer.sortInitial || "").toUpperCase();
  if (/^[A-Z]$/.test(initial)) return initial;
  const first = customerName(customer).trim()[0]?.toUpperCase() || "";
  return /^[A-Z]$/.test(first) ? first : "#";
}

function customerSortKey(customer: CustomerOption) {
  return customer.sortKey || `${customerInitial(customer)}|${customerName(customer).trim().toLowerCase()}`;
}

function groupCustomersByInitial(items: CustomerOption[], lang: AppLang) {
  const collator = new Intl.Collator(lang === "zh-TW" ? "zh-TW" : "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  const groups = new Map<string, CustomerOption[]>();
  const sortedItems = [...items].sort((a, b) => {
    const groupA = CUSTOMER_INDEX_LETTERS.indexOf(customerInitial(a));
    const groupB = CUSTOMER_INDEX_LETTERS.indexOf(customerInitial(b));
    const rankA = groupA >= 0 ? groupA : CUSTOMER_INDEX_LETTERS.length;
    const rankB = groupB >= 0 ? groupB : CUSTOMER_INDEX_LETTERS.length;
    if (rankA !== rankB) return rankA - rankB;
    return collator.compare(customerSortKey(a), customerSortKey(b));
  });
  for (const customer of sortedItems) {
    const letter = customerInitial(customer);
    groups.set(letter, [...(groups.get(letter) || []), customer]);
  }
  return CUSTOMER_INDEX_LETTERS
    .filter((letter) => groups.has(letter))
    .map((letter) => ({ letter, items: groups.get(letter) || [] }));
}

function mergeCustomers(current: CustomerOption[], next: CustomerOption[]) {
  const map = new Map<string, CustomerOption>();
  for (const item of current) map.set(String(item.id || item.name || ""), item);
  for (const item of next) {
    const key = String(item.id || item.name || "");
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...item });
  }
  return [...map.values()];
}

function numberOrNull(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function candidateCoordinates(candidate: GeoCandidate) {
  const directLatitude = numberOrNull(candidate.latitude);
  const directLongitude = numberOrNull(candidate.longitude);
  if (directLatitude !== null && directLongitude !== null) {
    return { latitude: directLatitude, longitude: directLongitude };
  }

  const [longitude, latitude] = String(candidate.location || "").split(",").map(Number);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude };
  }
  return null;
}

function coordinateLabel(latitude: string, longitude: string) {
  const lat = numberOrNull(latitude);
  const lng = numberOrNull(longitude);
  if (lat === null || lng === null) return "";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function geoCandidateMeta(candidate: GeoCandidate) {
  return candidate.address || candidate.mapAddress || "暂无详细地址";
}

function orderStatusLabel(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  const labels: Record<string, string> = {
    draft: "草稿",
    assigned: "已派发",
    in_progress: "进行中",
    pending_confirmation: "待确认",
    awaiting_customer_signature: "待客户签署",
    submitted: "已提交",
    approved: "已审核",
    archived: "已归档",
    rejected: "已退回",
    cancelled: "已作废",
    completed: "已完成",
  };
  return order.displayStatus || labels[status] || status || "-";
}

function reportOrderDisplayId(order: ServiceOrder) {
  return order.orderNo || `SR-${order.id}`;
}

function reportOrderMainContent(order: ServiceOrder) {
  return String(order.issueDescription || order.report?.workContent || serviceItemsLabel(order) || "未填写服务内容").replace(/\s+/g, " ").trim();
}

function reportOrderPreviewSummary(order: ServiceOrder) {
  const text = reportOrderMainContent(order);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function reportIssuePreviewLabel(order: ServiceOrder) {
  const mode = normalizeMode(order.serviceMode);
  if (mode === "office") return "内勤工作事项";
  return "服务需求说明";
}

function reportWorkContentPreviewLabel(order: ServiceOrder) {
  const mode = normalizeMode(order.serviceMode);
  if (mode === "office") return "工作内容";
  const modules = Array.isArray(order.serviceModules) ? order.serviceModules : [];
  if (mode === "onsite") {
    if (modules.includes("repair")) return "技术处理记录";
    if (modules.includes("inspect") || order.serviceType === "inspect") return "巡检处理记录";
    return "现场处理记录";
  }
  if (mode === "remote" && modules.includes("repair")) return "远程支持记录";
  return "处理记录";
}

function samePreviewText(a?: string, b?: string) {
  const normalize = (value?: string) => String(value || "").replace(/\s+/g, " ").trim();
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left === right);
}

function reportOrderEngineerText(order: ServiceOrder, fallback = "未指定工程师") {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.username || "")
    .filter(Boolean);
  return names.length ? names.join("、") : fallback;
}

function reportOrderServiceTime(order: ServiceOrder) {
  const start = order.report?.actualStartAt || order.report?.departureAt || "";
  const end = order.report?.actualEndAt || order.report?.returnAt || "";
  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

function orderMatchesKeyword(order: ServiceOrder, keyword: string) {
  if (!keyword) return true;
  return [
    order.orderNo,
    order.customerName,
    order.issueDescription,
    serviceItemsLabel(order),
    orderStatusLabel(order),
  ].some((value) => String(value || "").toLowerCase().includes(keyword));
}

function isDispatchOrder(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return ["draft", "pending_confirmation", "assigned", "in_progress", "rejected"].includes(status);
}

function canExportServiceRecord(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return ["awaiting_customer_signature", "submitted", "approved", "archived", "completed"].includes(status) || Boolean(order.report);
}

function isFilledServiceOrder(order: ServiceOrder) {
  return canExportServiceRecord(order);
}

function canDeleteServiceOrder(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return ["draft", "assigned", "rejected"].includes(status);
}

function canCancelServiceOrder(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return status !== "cancelled" && !canDeleteServiceOrder(order) && isFilledServiceOrder(order);
}

function safeFilenamePart(value?: string | number | null) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "服务记录";
}

function serviceRecordFileName(order: ServiceOrder) {
  const idPart = safeFilenamePart(order.orderNo || `工单-${order.id}`);
  const customerPart = safeFilenamePart(order.customerName || "未填写客户");
  return `${idPart}-${customerPart}-服务记录.pdf`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function validateFiles(files: File[]) {
  const invalid = files.find((file) => {
    const dot = file.name.lastIndexOf(".");
    const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    return !INSPECTION_DOCUMENT_EXTENSIONS.has(extension);
  });
  if (invalid) return `不支持的文件类型：${invalid.name}`;
  const oversized = files.find((file) => file.size > MAX_FILE_SIZE);
  if (oversized) return `文件大小超过 20MB：${oversized.name}`;
  return "";
}

function fileExtension(file: File) {
  const dot = file.name.lastIndexOf(".");
  return dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
}

function compressedImageName(file: File) {
  const dot = file.name.lastIndexOf(".");
  const base = dot >= 0 ? file.name.slice(0, dot) : file.name || "image";
  return `${base}-compressed.jpg`;
}

function isCompressibleImage(file: File) {
  const mimeType = String(file.type || "").toLowerCase();
  return COMPRESSIBLE_IMAGE_MIME_TYPES.has(mimeType) || COMPRESSIBLE_IMAGE_EXTENSIONS.has(fileExtension(file));
}

function loadImageFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`图片无法读取：${file.name}`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageFile(file: File) {
  if (!isCompressibleImage(file)) return file;
  const image = await loadImageFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return file;
  const scale = Math.min(1, IMAGE_COMPRESSION_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_COMPRESSION_QUALITY);
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], compressedImageName(file), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

async function compressAttachmentImages(files: File[]) {
  return Promise.all(files.map((file) => compressImageFile(file).catch(() => file)));
}

function mergeAttachmentFiles(current: File[], incoming: File[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((file) => {
    const key = `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function payloadFromOrder(order: ServiceOrder): ReportForm {
  const mode = normalizeMode(order.serviceMode);
  const report = order.report || {};
  const targetDeviceIds = (order.targetDevices || []).map((device) => device.id ? String(device.id) : "").filter(Boolean);
  const effectiveTargetDeviceIds = targetDeviceIds.length ? targetDeviceIds : order.deviceId ? [String(order.deviceId)] : [];
  const targetDevices = (order.targetDevices || []).length
    ? (order.targetDevices || []).map((device) => emptyTargetDevice({
        inputMode: "existing",
        deviceId: device.id ? String(device.id) : "",
        model: device.model || "",
        pn: device.pn || "",
        serialNo: device.serialNo || "",
        remark: device.remark || "",
      }))
    : order.deviceId || order.deviceModel || order.devicePn || order.deviceSerialNo || order.deviceRemark
      ? [emptyTargetDevice({
          inputMode: order.deviceId ? "existing" : "manual",
          deviceId: order.deviceId ? String(order.deviceId) : "",
          model: order.deviceModel || "",
          pn: order.devicePn || "",
          serialNo: order.deviceSerialNo || "",
          remark: order.deviceRemark || "",
        })]
      : [emptyTargetDevice()];
  const workContent = report.workContent
    || (Array.isArray(report.workEntries) ? report.workEntries.map((entry) => entry.workContent || entry.work_content || "").filter(Boolean).join("\n\n") : "");
  const normalizedParts = (order.parts || []).map((part) => ({
    ...emptyPart(),
    deviceId: part.deviceId || part.device_id ? String(part.deviceId || part.device_id) : "",
    actionType: part.actionType || part.action_type || "replacement",
    partName: part.partName || part.part_name || "",
    partNo: part.partNo || part.part_no || "",
    quantity: part.quantity ? String(part.quantity) : "1",
    unit: part.unit || "个",
    remark: part.remark || "",
  }));
  const isInstallOrder = mode === "onsite" && (order.serviceType || "repair") === "install";
  const installDeviceDraftIdByDeviceId = new Map<string, string>();
  const installDevicesFromParts: InstallDeviceDraft[] = [];
  if (isInstallOrder) {
    const installDeviceIds = [
      order.deviceId ? String(order.deviceId) : "",
      ...normalizedParts
        .filter((part) => (part.actionType || "general") === "installation")
        .map((part) => part.deviceId),
    ].filter(Boolean);
    Array.from(new Set(installDeviceIds)).forEach((deviceId) => {
      const draft = emptyInstallDevice({
        inputMode: "existing",
        deviceId,
        model: deviceId === String(order.deviceId || "") ? order.deviceModel || "" : "",
        pn: deviceId === String(order.deviceId || "") ? order.devicePn || "" : "",
        serialNo: deviceId === String(order.deviceId || "") ? order.deviceSerialNo || "" : "",
        remark: deviceId === String(order.deviceId || "") ? order.deviceRemark || "" : "",
      });
      installDeviceDraftIdByDeviceId.set(deviceId, draft.id);
      installDevicesFromParts.push(draft);
    });
  }
  const installDevices = installDevicesFromParts.length
    ? installDevicesFromParts
    : order.deviceModel || order.devicePn || order.deviceSerialNo || order.deviceRemark
      ? [emptyInstallDevice({
          inputMode: order.deviceId ? "existing" : "manual",
          deviceId: order.deviceId ? String(order.deviceId) : "",
          model: order.deviceModel || "",
          pn: order.devicePn || "",
          serialNo: order.deviceSerialNo || "",
          remark: order.deviceRemark || "",
        })]
      : [emptyInstallDevice()];
  return {
    ...defaultForm(mode),
    customerId: order.customerId ? String(order.customerId) : "",
    customerName: order.customerName || "",
    customerAddress: order.customerAddress || "",
    customerLatitude: order.customerLatitude ? String(order.customerLatitude) : "",
    customerLongitude: order.customerLongitude ? String(order.customerLongitude) : "",
    customerMapProvider: order.customerMapProvider || "",
    customerMapPoiId: order.customerMapPoiId || "",
    customerMapPoiName: order.customerMapPoiName || "",
    customerMapAddress: order.customerMapAddress || "",
    contactName: order.contactName || report.customerConfirmName || report.customerName || "",
    contactPhone: order.contactPhone || "",
    deviceId: order.deviceId ? String(order.deviceId) : "",
    deviceName: order.deviceName || "",
    deviceModel: order.deviceModel || "",
    devicePn: order.devicePn || "",
    deviceSerialNo: order.deviceSerialNo || "",
    deviceRemark: order.deviceRemark || "",
    targetDeviceIds: effectiveTargetDeviceIds,
    targetDevices,
    serviceModules: normalizeServiceModules({
      serviceMode: mode,
      serviceModules: Array.isArray(order.serviceModules) ? order.serviceModules : [],
      serviceType: order.serviceType || "repair",
      timesheetCategory: order.timesheetCategory || "",
      parts: (order.parts || []).map((part) => ({
        ...emptyPart(),
        actionType: part.actionType || part.action_type || "replacement",
        partName: part.partName || part.part_name || "",
      })),
    }, mode),
    serviceType: mode === "onsite" ? order.serviceType || "repair" : "other",
    timesheetCategory: mode === "onsite" ? "" : order.timesheetCategory || defaultForm(mode).timesheetCategory,
    timesheetSalesperson: order.timesheetSalesperson || "",
    priority: order.priority || "normal",
    issueDescription: order.issueDescription || "",
    departureAt: toInputDateTime(report.departureAt),
    actualStartAt: toInputDateTime(report.actualStartAt || order.plannedStartAt),
    actualEndAt: toInputDateTime(report.actualEndAt || order.plannedEndAt),
    returnAt: toInputDateTime(report.returnAt),
    workContent,
    result: mode === "office" ? "" : normalizeResult(report.result),
    resultDescription: report.resultDescription || "",
    customerConfirmName: report.customerConfirmName || report.customerName || order.contactName || "",
    customerSignatureMode: !report.customerSignature && !report.customerSignatureFileId && (order.workflowStatus === "awaiting_customer_signature" || order.status === "awaiting_customer_signature")
      ? "electronic"
      : "onsite",
    customerSignature: report.customerSignature || "",
    customerSignatureFileId: report.customerSignatureFileId ? String(report.customerSignatureFileId) : "",
    engineerIds: (order.engineers || []).map((engineer) => String(engineer.id)).filter(Boolean),
    installDeviceInputMode: order.deviceId ? "existing" : "manual",
    installDevices,
    parts: normalizedParts.map((part) => ({
      ...part,
      installDeviceDraftId: part.deviceId ? installDeviceDraftIdByDeviceId.get(part.deviceId) || "" : "",
    })),
  };
}

function compactDraftLabel(form: Partial<ReportForm>) {
  return [form.customerName, form.issueDescription, form.workContent].filter(Boolean).join(" · ").slice(0, 80) || "未填写内容的草稿";
}

function normalizeLoadedForm(value: Partial<ReportForm>, fallbackMode: ServiceMode): ReportForm {
  const mode = normalizeMode(value.serviceMode || fallbackMode);
  const base = defaultForm(mode);
  const merged = { ...base, ...value };
  const mergedInstallInputMode = merged.installDeviceInputMode === "existing" ? "existing" : "manual";
  const normalizedInstallDevices = Array.isArray(merged.installDevices) && merged.installDevices.length
    ? merged.installDevices.map((device, index) => normalizeInstallDeviceDraft(device, index === 0
        ? {
            inputMode: mergedInstallInputMode,
            deviceId: mergedInstallInputMode === "existing" && merged.deviceId ? String(merged.deviceId) : "",
          }
        : {}))
    : [emptyInstallDevice()];
  const normalizedTargetDevices = Array.isArray(merged.targetDevices) && merged.targetDevices.length
    ? merged.targetDevices.map((device, index) => normalizeTargetDeviceDraft(device, index === 0
        ? {
            inputMode: merged.deviceId ? "existing" : "manual",
            deviceId: merged.deviceId ? String(merged.deviceId) : "",
          }
        : {}))
    : (Array.isArray(merged.targetDeviceIds) && merged.targetDeviceIds.length
        ? [...new Set(merged.targetDeviceIds.map((id) => String(id)).filter(Boolean))].map((deviceId) => emptyTargetDevice({ inputMode: "existing", deviceId }))
        : merged.deviceId
          ? [emptyTargetDevice({ inputMode: "existing", deviceId: String(merged.deviceId), model: merged.deviceModel, pn: merged.devicePn, serialNo: merged.deviceSerialNo, remark: merged.deviceRemark })]
          : [emptyTargetDevice()]);
  const installDeviceDraftIdByDeviceId = new Map(
    normalizedInstallDevices
      .filter((device) => device.deviceId)
      .map((device) => [device.deviceId, device.id] as [string, string]),
  );
  return {
    ...merged,
    serviceMode: mode,
    serviceModules: normalizeServiceModules(merged, mode),
    result: mode === "office" ? "" : normalizeResult(merged.result),
    customerSignatureMode: merged.customerSignatureMode === "electronic" ? "electronic" : "onsite",
    targetDeviceIds: Array.isArray(merged.targetDeviceIds)
      ? [...new Set(merged.targetDeviceIds.map((id) => String(id)).filter(Boolean))]
      : merged.deviceId ? [String(merged.deviceId)] : [],
    targetDevices: normalizedTargetDevices,
    installDeviceInputMode: mergedInstallInputMode,
    installDevices: normalizedInstallDevices,
    parts: Array.isArray(merged.parts)
      ? merged.parts.map((part) => ({
          ...emptyPart(partActionFor(mode, merged.serviceType, merged.timesheetCategory)),
          ...part,
          deviceId: part.deviceId ? String(part.deviceId) : "",
          installDeviceDraftId: part.installDeviceDraftId
            || (part.deviceId ? installDeviceDraftIdByDeviceId.get(String(part.deviceId)) || "" : ""),
          quantity: part.quantity ? String(part.quantity) : "1",
        }))
      : [],
  };
}

function SignaturePad({
  value,
  onChange,
  className = "",
  canvasClassName = "h-36",
  actionsClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  canvasClassName?: string;
  actionsClassName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  function canvasCssSize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.max(1, canvas.clientWidth || rect.width),
      height: Math.max(1, canvas.clientHeight || rect.height),
    };
  }

  function clampPoint(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function transformedCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const { width, height } = canvasCssSize(canvas);
    const rectWidth = Math.max(1, rect.width);
    const rectHeight = Math.max(1, rect.height);
    const getBoxQuads = (canvas as HTMLCanvasElement & {
      getBoxQuads?: () => Array<{
        p1: { x: number; y: number };
        p2: { x: number; y: number };
        p4: { x: number; y: number };
      }>;
    }).getBoxQuads;
    const quad = getBoxQuads?.call(canvas)?.[0];
    if (quad) {
      const xAxis = { x: quad.p2.x - quad.p1.x, y: quad.p2.y - quad.p1.y };
      const yAxis = { x: quad.p4.x - quad.p1.x, y: quad.p4.y - quad.p1.y };
      const pointer = { x: clientX - quad.p1.x, y: clientY - quad.p1.y };
      const determinant = xAxis.x * yAxis.y - xAxis.y * yAxis.x;
      if (Math.abs(determinant) > 0.001) {
        const xRatio = (pointer.x * yAxis.y - pointer.y * yAxis.x) / determinant;
        const yRatio = (xAxis.x * pointer.y - xAxis.y * pointer.x) / determinant;
        return {
          x: clampPoint(xRatio * width, 0, width),
          y: clampPoint(yRatio * height, 0, height),
        };
      }
    }

    const hasTransformedBounds = Math.abs(rectWidth - width) > 2 || Math.abs(rectHeight - height) > 2;
    const quarterRotated = hasTransformedBounds && Math.abs(rectWidth - height) < 2 && Math.abs(rectHeight - width) < 2;
    if (quarterRotated) {
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top;
      return {
        x: clampPoint((relativeY / rectHeight) * width, 0, width),
        y: clampPoint(height - (relativeX / rectWidth) * height, 0, height),
      };
    }

    return {
      x: clampPoint(((clientX - rect.left) / rectWidth) * width, 0, width),
      y: clampPoint(((clientY - rect.top) / rectHeight) * height, 0, height),
    };
  }

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvasCssSize(canvas);
    const ratio = window.devicePixelRatio || 1;
    const snapshot = value;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    const styles = window.getComputedStyle(document.documentElement);
    const backgroundColor = styles.getPropertyValue("--card").trim() || styles.getPropertyValue("--background").trim() || "#ffffff";
    const foregroundColor = styles.getPropertyValue("--foreground").trim() || "#111827";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = foregroundColor;
    if (snapshot) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, width, height);
      image.src = snapshot;
    }
  }, [value]);

  useEffect(() => {
    let frame = 0;
    const scheduleSetup = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(setupCanvas);
    };
    setupCanvas();
    window.addEventListener("resize", scheduleSetup);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleSetup) : null;
    if (canvasRef.current) observer?.observe(canvasRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleSetup);
      observer?.disconnect();
    };
  }, [setupCanvas]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return transformedCanvasPoint(canvas, event.clientX, event.clientY);
  }

  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const last = lastPointRef.current;
    const next = point(event);
    if (!context || !last) return;
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const dataUrl = canvasRef.current?.toDataURL("image/png") || "";
    onChange(dataUrl);
  }

  function clear() {
    onChange("");
    window.requestAnimationFrame(setupCanvas);
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border bg-card">
        <canvas
          ref={canvasRef}
          className={`block w-full touch-none ${canvasClassName}`}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      <Button type="button" variant="outline" size="sm" className={actionsClassName} onClick={clear}>
        <RotateCcw className="h-4 w-4" />
        清除签名
      </Button>
    </div>
  );
}

function FullscreenSignatureDialog({
  open,
  value,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [signatureViewport, setSignatureViewport] = useState(() => ({
    touch: typeof window !== "undefined" ? window.matchMedia("(hover: none), (pointer: coarse)").matches : false,
    landscape: typeof window !== "undefined" ? window.matchMedia("(orientation: landscape)").matches : false,
  }));

  useEffect(() => {
    if (open) setDraftValue(value);
  }, [open, value]);

  useEffect(() => {
    const touchMedia = window.matchMedia("(hover: none), (pointer: coarse)");
    const landscapeMedia = window.matchMedia("(orientation: landscape)");
    const updateLayout = () => setSignatureViewport({
      touch: touchMedia.matches,
      landscape: landscapeMedia.matches,
    });
    updateLayout();
    touchMedia.addEventListener("change", updateLayout);
    landscapeMedia.addEventListener("change", updateLayout);
    window.addEventListener("resize", updateLayout);
    return () => {
      touchMedia.removeEventListener("change", updateLayout);
      landscapeMedia.removeEventListener("change", updateLayout);
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  const dialogClassName = signatureViewport.touch
    ? signatureViewport.landscape
      ? "!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !max-h-none !w-[100dvw] !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 p-3 shadow-none sm:!max-w-none"
      : "h-[100dvw] max-h-none w-[100dvh] max-w-none rotate-90 overflow-hidden rounded-none border-0 p-3"
    : "h-[90dvh] max-h-none w-[90vw] max-w-none overflow-hidden rounded-lg border p-4";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={dialogClassName}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <DialogHeader className="shrink-0 text-left">
            <DialogTitle className="text-base">横屏全屏签名</DialogTitle>
            <DialogDescription>请客户在横向区域内完成签名。</DialogDescription>
          </DialogHeader>
          <SignaturePad
            value={draftValue}
            onChange={setDraftValue}
            className="flex min-h-0 flex-1 flex-col"
            canvasClassName="h-full flex-1"
            actionsClassName="hidden"
          />
          <DialogFooter className="shrink-0 flex-row justify-end">
            <Button type="button" variant="outline" onClick={() => setDraftValue("")}>
              <RotateCcw className="h-4 w-4" />
              清除
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange(draftValue);
                onOpenChange(false);
              }}
            >
              保存签名
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

function hasPreviewValue(value?: string | number | null) {
  return String(value ?? "").trim() !== "";
}

function ReportPreviewField({ label, value, className = "" }: { label: string; value?: string | number | null; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm leading-6 text-foreground">{displayText(value)}</div>
    </div>
  );
}

function ReportPreviewBlock({ label, value, markdown = false }: { label: string; value?: string | number | null; markdown?: boolean }) {
  const displayValue = displayText(value);
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 rounded-lg border bg-muted/25 px-3 py-2 text-sm leading-6 text-foreground ${markdown ? "" : "whitespace-pre-wrap"}`}>
        {markdown && displayValue !== "-" ? <MarkdownContent content={displayValue} /> : displayValue}
      </div>
    </div>
  );
}

type MarkdownAction = "heading" | "bold" | "bullet" | "numbered" | "inlineCode" | "codeBlock" | "link";

const MARKDOWN_TOOLS = [
  { action: "heading", label: "标题", icon: Heading2 },
  { action: "bold", label: "加粗", icon: Bold },
  { action: "bullet", label: "项目列表", icon: List },
  { action: "numbered", label: "编号列表", icon: ListOrdered },
  { action: "inlineCode", label: "行内代码", icon: Code2 },
  { action: "codeBlock", label: "代码块", icon: Braces },
  { action: "link", label: "链接", icon: Link },
] as const;

function markdownReplacement(action: MarkdownAction, selected: string) {
  const value = selected || "";
  if (action === "heading") return { text: `## ${value || "小标题"}`, placeholder: value ? "" : "小标题" };
  if (action === "bold") return { text: `**${value || "重点内容"}**`, placeholder: value ? "" : "重点内容" };
  if (action === "inlineCode") return { text: `\`${value || "命令或错误代码"}\``, placeholder: value ? "" : "命令或错误代码" };
  if (action === "codeBlock") {
    return { text: `\`\`\`\n${value || "粘贴命令、日志或错误代码"}\n\`\`\``, placeholder: value ? "" : "粘贴命令、日志或错误代码" };
  }
  if (action === "link") return { text: `[${value || "链接文字"}](https://example.com)`, placeholder: value ? "https://example.com" : "链接文字" };
  if (action === "numbered") {
    const lines = (value || "列表项").split("\n");
    return { text: lines.map((line, index) => `${index + 1}. ${line || "列表项"}`).join("\n"), placeholder: value ? "" : "列表项" };
  }
  const lines = (value || "列表项").split("\n");
  return { text: lines.map((line) => `- ${line || "列表项"}`).join("\n"), placeholder: value ? "" : "列表项" };
}

function MarkdownTextarea({
  value,
  onChange,
  rows = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function applyMarkdown(action: MarkdownAction) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const replacement = markdownReplacement(action, selected);
    const next = `${value.slice(0, start)}${replacement.text}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      current.focus();
      if (replacement.placeholder) {
        const placeholderStart = replacement.text.indexOf(replacement.placeholder);
        if (placeholderStart >= 0) {
          current.setSelectionRange(start + placeholderStart, start + placeholderStart + replacement.placeholder.length);
          return;
        }
      }
      const nextCursor = start + replacement.text.length;
      current.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-1.5">
        {MARKDOWN_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.action}
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
              title={tool.label}
              aria-label={tool.label}
              onClick={() => applyMarkdown(tool.action)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
      <Textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[180px] resize-y rounded-none border-0 shadow-none hover:bg-white focus-visible:border-transparent focus-visible:ring-0"
      />
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label className="block text-sm font-medium text-foreground">
        {required ? <span className="mr-0.5 text-destructive">*</span> : null}{label}
      </Label>
      {children}
    </div>
  );
}

function DateTimeFieldControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { date, time } = splitInputDateTime(value);
  const [draftDate, setDraftDate] = useState(date || inputToday());
  const useDesktopPicker = useDesktopTimePicker();

  useEffect(() => {
    setDraftDate(date || inputToday());
  }, [date]);

  function setDate(nextDate: string) {
    const effectiveDate = nextDate || inputToday();
    setDraftDate(effectiveDate);
    if (time) onChange(`${effectiveDate}T${time}`);
  }

  function setTime(nextTime: string) {
    if (!nextTime) {
      onChange("");
      return;
    }
    onChange(`${draftDate || inputToday()}T${nextTime}`);
  }

  return (
    <div className={`grid min-w-0 gap-2 ${value ? "grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_auto]" : "grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"}`}>
      <input
        aria-label={`${label}日期`}
        type="date"
        value={draftDate}
        onChange={(event) => setDate(event.target.value)}
        onPointerDown={openPickerOnMouse}
        className="h-9 min-w-0 cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 shadow-sm [color-scheme:light] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      />
      {useDesktopPicker ? (
        <Suspense fallback={<NativeTimeInput label={label} time={time} onTimeChange={setTime} />}>
          <DesktopTimePicker label={label} time={time} onTimeChange={setTime} />
        </Suspense>
      ) : (
        <NativeTimeInput label={label} time={time} onTimeChange={setTime} />
      )}
      {value ? (
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange("")} aria-label={`清空${label}`}>
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

function DenseField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:hidden">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ReportSection({
  title,
  icon: Icon,
  step: _step,
  tag,
  action,
  children,
}: {
  title: string;
  icon?: typeof FileText;
  step?: number;
  tag?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-3 py-3 sm:min-h-[64px] sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            {tag ? <div className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{tag}</div> : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className="border-t border-border/70">{children}</div>
    </section>
  );
}

function CustomerInlineSuggestions({
  open,
  searching,
  recentCustomers,
  groups,
  selectedCustomerId,
  onSelect,
}: {
  open: boolean;
  searching: boolean;
  recentCustomers: CustomerOption[];
  groups: Array<{ letter: string; items: CustomerOption[] }>;
  selectedCustomerId: string;
  onSelect: (customer: CustomerOption) => void;
}) {
  const availableLetters = new Set(groups.map((group) => group.letter));
  const hasResults = recentCustomers.length || groups.some((group) => group.items.length);
  if (!open) return null;

  function scrollToLetter(letter: string) {
    document.getElementById(`customer-inline-letter-${letter}`)?.scrollIntoView({ block: "start" });
  }

  function renderCustomer(customer: CustomerOption, badge?: string) {
    const selected = selectedCustomerId && String(customer.id) === selectedCustomerId;
    return (
      <button
        key={`${badge || "customer"}-${customer.id || customer.name}`}
        type="button"
        className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
          selected ? "border-primary/60 bg-primary/5" : "border-border bg-background hover:border-primary/40 hover:bg-accent/40"
        }`}
        onMouseDown={(event) => {
          event.preventDefault();
          onSelect(customer);
        }}
      >
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-foreground sm:text-sm">{customerName(customer)}</span>
          <span className="mt-0.5 hidden line-clamp-2 text-xs text-muted-foreground sm:block">{customerMeta(customer)}</span>
        </span>
        {badge ? <Badge className="hidden sm:inline-flex" variant="secondary">{badge}</Badge> : selected ? <Badge className="hidden sm:inline-flex" variant="outline">已选择</Badge> : null}
      </button>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
      <div className="relative">
        <div className="max-h-[68dvh] overflow-y-auto p-2 pr-7 sm:max-h-96 sm:pr-8">
          {searching ? (
            <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在检索客户…
            </div>
          ) : null}

          {recentCustomers.length ? (
            <div className="mb-3 space-y-2">
              <div className="px-1 text-xs font-semibold text-muted-foreground">近期使用</div>
              {recentCustomers.map((customer) => renderCustomer(customer, "近期"))}
            </div>
          ) : null}

          {groups.map((group) => (
            <div key={group.letter} id={`customer-inline-letter-${group.letter}`} className="scroll-mt-2 space-y-2 pb-3">
              <div className="sticky top-0 z-10 bg-popover/95 px-1 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                {group.letter}
              </div>
              {group.items.map((customer) => renderCustomer(customer))}
            </div>
          ))}

          {!hasResults ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              未找到匹配客户，可按新客户继续填写。
            </div>
          ) : null}
        </div>
        {groups.length ? (
          <div className="absolute bottom-2 right-1 top-2 flex flex-col items-center gap-px rounded-md bg-popover/70 px-0.5 py-1 backdrop-blur-sm">
            {CUSTOMER_INDEX_LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                disabled={!availableLetters.has(letter)}
                aria-label={`跳转到 ${letter} 分组`}
                className="flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-medium leading-none text-muted-foreground/80 transition-colors disabled:pointer-events-none disabled:text-muted-foreground/25 enabled:hover:bg-primary/10 enabled:hover:text-primary enabled:focus-visible:bg-primary/10 enabled:focus-visible:text-primary enabled:focus-visible:outline-none enabled:focus-visible:ring-1 enabled:focus-visible:ring-primary/30"
                onMouseDown={(event) => {
                  event.preventDefault();
                  scrollToLetter(letter);
                }}
              >
                {letter}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ServiceReport() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isNewRoute = location.pathname.endsWith("/new");
  const isFormRoute = isNewRoute || Boolean(id);
  const routeMode = normalizeMode(searchParams.get("mode"));
  const routeShouldLoadDraft = searchParams.get("draft") === "1";
  const routeDraftKey = String(searchParams.get("draftKey") || searchParams.get("draftId") || "").trim();
  const routeKeyword = String(searchParams.get("keyword") || "").trim().toLowerCase();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<CustomerOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [currentOrder, setCurrentOrder] = useState<ServiceOrder | null>(null);
  const [previewOrder, setPreviewOrder] = useState<ServiceOrder | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [form, setForm] = useState<ReportForm>(() => defaultForm(routeMode));
  const [createDrafts, setCreateDrafts] = useState<CreateDraftItem[]>([]);
  const [currentCreateDraftKey, setCurrentCreateDraftKey] = useState("");
  const [editDraftLoaded, setEditDraftLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [filledOrdersOpen, setFilledOrdersOpen] = useState(false);
  const [formHeaderVisible, setFormHeaderVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [inspectionFiles, setInspectionFiles] = useState<File[]>([]);
  const [supportConfigFiles, setSupportConfigFiles] = useState<File[]>([]);
  const [sitePhotoFiles, setSitePhotoFiles] = useState<File[]>([]);
  const [screenshotLogFiles, setScreenshotLogFiles] = useState<File[]>([]);
  const [draggingAttachmentPurpose, setDraggingAttachmentPurpose] = useState<AttachmentPurpose | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | number | null>(null);
  const [exportingOrderId, setExportingOrderId] = useState<string | number | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | number | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [customerDevices, setCustomerDevices] = useState<DeviceOption[]>([]);
  const [loadingCustomerDevices, setLoadingCustomerDevices] = useState(false);
  const [customerOptionsOpen, setCustomerOptionsOpen] = useState(false);
  const [targetDeviceOpenId, setTargetDeviceOpenId] = useState<string | null>(null);
  const [installTargetOpenId, setInstallTargetOpenId] = useState<string | null>(null);
  const [installModelSuggestionDeviceId, setInstallModelSuggestionDeviceId] = useState<string | null>(null);
  const [installModelSuggestions, setInstallModelSuggestions] = useState<ModelSuggestion[]>([]);
  const [installModelLoading, setInstallModelLoading] = useState(false);
  const [modelSuggestionInputId, setModelSuggestionInputId] = useState<string | null>(null);
  const [modelCatalogSuggestions, setModelCatalogSuggestions] = useState<ModelSuggestion[]>([]);
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [geoCandidates, setGeoCandidates] = useState<GeoCandidate[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoHint, setGeoHint] = useState("");
  const [contactOptionsOpen, setContactOptionsOpen] = useState(false);
  const [engineerPanelOpen, setEngineerPanelOpen] = useState(false);
  const [loadingLatestSignature, setLoadingLatestSignature] = useState(false);
  const [signatureShareOpen, setSignatureShareOpen] = useState(false);
  const [signatureFullscreenOpen, setSignatureFullscreenOpen] = useState(false);
  const [signatureRequest, setSignatureRequest] = useState<CustomerSignatureRequestInfo | null>(null);
  const [signatureRequestOrderId, setSignatureRequestOrderId] = useState<string | number | null>(null);
  const [signatureRecipientEmail, setSignatureRecipientEmail] = useState("");
  const [signatureRequestLoading, setSignatureRequestLoading] = useState(false);
  const [signatureShareError, setSignatureShareError] = useState("");
  const [signatureShareNotice, setSignatureShareNotice] = useState("");
  const [signatureQrCodeUrl, setSignatureQrCodeUrl] = useState("");
  const customerSearchTimerRef = useRef<number | null>(null);
  const customerSearchRequestRef = useRef(0);
  const installModelSearchTimerRef = useRef<number | null>(null);
  const installModelSearchRequestRef = useRef(0);
  const modelCatalogSearchTimerRef = useRef<number | null>(null);
  const modelCatalogSearchRequestRef = useRef(0);
  const formScrollTopRef = useRef(0);

  useEffect(() => {
    if (!isFormRoute || typeof window === "undefined") {
      setFormHeaderVisible(true);
      return;
    }

    const scrollContainer = document.querySelector<HTMLElement>(".mobile-admin-content");
    if (!scrollContainer) return;
    const media = window.matchMedia("(max-width: 639px)");

    const handleScroll = () => {
      if (!media.matches) {
        setFormHeaderVisible(true);
        return;
      }

      const currentTop = scrollContainer.scrollTop;
      const delta = currentTop - formScrollTopRef.current;
      formScrollTopRef.current = currentTop;

      if (currentTop < 24 || delta < -8) {
        setFormHeaderVisible(true);
        return;
      }
      if (delta > 8 && currentTop > 72) {
        setFormHeaderVisible(false);
      }
    };

    setFormHeaderVisible(true);
    formScrollTopRef.current = scrollContainer.scrollTop;
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [isFormRoute, location.pathname]);

  const isOnsite = form.serviceMode === "onsite";
  const isRemote = form.serviceMode === "remote";
  const isOffice = form.serviceMode === "office";
  const signatureRequestUrl = signatureRequest?.signUrl || "";
  const electronicSignatureSelected = isOnsite && form.customerSignatureMode === "electronic";
  const selectedServiceModules = useMemo(() => normalizeServiceModules(form, form.serviceMode), [form]);
  const hasServiceModule = (module: ServiceModuleId) => selectedServiceModules.includes(module);
  const isInstall = isOnsite && hasServiceModule("install");
  const isInspection = isOnsite && (hasServiceModule("inspect") || currentOrder?.serviceType === "inspect");
  const moduleOptions = isOnsite ? ONSITE_SERVICE_MODULE_OPTIONS : isRemote ? REMOTE_SERVICE_MODULE_OPTIONS : [];
  const selectedCustomer = useMemo(() => (
    customers.find((customer) => String(customer.id) === form.customerId)
      || customers.find((customer) => customer.name && customer.name === form.customerName)
      || null
  ), [customers, form.customerId, form.customerName]);
  const recentCustomerIds = useMemo(() => new Set(recentCustomers.map((customer) => String(customer.id))), [recentCustomers]);
  const matchingRecentCustomers = useMemo(() => (
    recentCustomers.filter((customer) => customerMatches(customer, form.customerName)).slice(0, 4)
  ), [form.customerName, recentCustomers]);
  const customerGroups = useMemo(() => (
    groupCustomersByInitial(
      customers
        .filter((customer) => !recentCustomerIds.has(String(customer.id)))
        .filter((customer) => customerMatches(customer, form.customerName))
        .slice(0, 160),
      lang,
    )
  ), [customers, form.customerName, lang, recentCustomerIds]);
  const contactOptions = useMemo(() => contactsForCustomer(selectedCustomer), [selectedCustomer]);
  const selectedCustomerDevices = useMemo(() => (
    form.customerId ? customerDevices : []
  ), [customerDevices, form.customerId]);
  const matchingReportOrders = useMemo(() => (
    orders
      .filter((order) => (order.workflowStatus || order.status || "") !== "cancelled")
      .filter((order) => orderMatchesKeyword(order, routeKeyword))
  ), [orders, routeKeyword]);
  const dispatchOrders = useMemo(() => (
    matchingReportOrders.filter(isDispatchOrder)
  ), [matchingReportOrders]);
  const filledOrders = useMemo(() => (
    matchingReportOrders.filter(isFilledServiceOrder)
  ), [matchingReportOrders]);
  const currentUserId = user?.id ? String(user.id) : "";
  const activePartRows = useMemo(() => form.parts.filter(servicePartHasContent), [form.parts]);
  const replacementParts = useMemo(() => activePartRows.filter((part) => part.actionType === "replacement"), [activePartRows]);
  const installationParts = useMemo(() => activePartRows.filter((part) => part.actionType === "installation"), [activePartRows]);
  const generalParts = useMemo(() => activePartRows.filter((part) => !["replacement", "installation"].includes(part.actionType)), [activePartRows]);
  const isRepairModule = isOnsite && hasServiceModule("repair");
  const isRemoteSupportModule = isRemote && hasServiceModule("repair");
  const hasReplacementModule = hasServiceModule("replacement") || replacementParts.length > 0;
  const hasHardwareInstallDetails = isInstall || installationParts.length > 0;
  const showAssetSection = isInstall || isRepairModule || isRemoteSupportModule || hasReplacementModule || generalParts.length > 0;
  const showTargetDeviceFields = isRepairModule || isRemoteSupportModule || hasReplacementModule;
  const showInlineInstallParts = isInstall;
  const showPartsModule = hasReplacementModule || generalParts.length > 0 || (!showInlineInstallParts && hasHardwareInstallDetails);
  const installDeviceRows = useMemo(() => (
    form.installDevices.length ? form.installDevices : [emptyInstallDevice()]
  ), [form.installDevices]);
  const activeInstallDevices = useMemo(() => form.installDevices.filter(installDeviceHasContent), [form.installDevices]);
  const activeInstallDeviceCount = activeInstallDevices.length;
  const targetDeviceRows = useMemo(() => (
    form.targetDevices.length ? form.targetDevices : [emptyTargetDevice()]
  ), [form.targetDevices]);
  const activeTargetDevices = useMemo(() => form.targetDevices.filter(targetDeviceHasContent), [form.targetDevices]);
  const activeTargetDeviceCount = activeTargetDevices.length;
  const installationPartEntries = useMemo(
    () => form.parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => (part.actionType || "general") === "installation"),
    [form.parts],
  );
  const visiblePartEntries = useMemo(
    () => form.parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => !(showInlineInstallParts && (part.actionType || "general") === "installation")),
    [form.parts, showInlineInstallParts],
  );
  const detailCounters = [
    replacementParts.length ? `备件更换 ${replacementParts.length}` : "",
    installationParts.length ? `硬件部件安装 ${installationParts.length}` : "",
    generalParts.length ? `部件记录 ${generalParts.length}` : "",
    isInspection ? "巡检文档" : "",
    showTargetDeviceFields && activeTargetDeviceCount ? `目标设备 ${activeTargetDeviceCount}` : "",
    isInstall && activeInstallDeviceCount ? `安装设备 ${activeInstallDeviceCount}` : "",
  ].filter(Boolean);
  const partsModuleTitle = hasReplacementModule && !showInlineInstallParts && hasHardwareInstallDetails ? "备件更换与硬件部件明细" : hasHardwareInstallDetails && !showInlineInstallParts ? "硬件部件安装明细" : "备件更换明细";
  const partsModuleDescription = hasReplacementModule && !showInlineInstallParts && hasHardwareInstallDetails
    ? "记录备件更换、硬件部件安装及相关明细。"
    : hasHardwareInstallDetails && !showInlineInstallParts
      ? "记录 CPU、内存、硬盘、扩展柜、交换机模块等硬件部件安装明细。"
      : "记录故障备件拆下、换上及相关明细。";
  const issueFieldLabel = isOffice ? "内勤工作事项" : "服务需求说明";
  const workContentLabel = isOffice
    ? "工作内容"
    : isOnsite
      ? isRepairModule ? "技术处理记录" : isInspection ? "巡检处理记录" : "现场处理记录"
      : isRemoteSupportModule ? "远程支持记录" : "处理记录";
  const shouldShowAttachments = isInstall || isRepairModule || isRemoteSupportModule || isInspection || hasReplacementModule;
  const workSectionStep = 3;
  const attachmentSectionStep = 4;
  const assetSectionStep = 5;
  const signoffSectionStep = 6;
  const visibleAttachmentPurposes: AttachmentPurpose[] = [
    ...((isInstall || isRepairModule || isRemoteSupportModule) ? (["support_config"] as AttachmentPurpose[]) : []),
    ...(isInspection ? (["inspection_document"] as AttachmentPurpose[]) : []),
    ...((isInstall || isInspection || (isOnsite && hasReplacementModule)) ? (["site_photo"] as AttachmentPurpose[]) : []),
    ...((isRepairModule || isRemoteSupportModule || hasReplacementModule) ? (["screenshot_log"] as AttachmentPurpose[]) : []),
  ];
  const engineerSummary = useMemo(() => {
    const names = engineers
      .filter((engineer) => form.engineerIds.includes(String(engineer.id)) || String(engineer.id) === currentUserId)
      .map(optionLabel);
    if (!names.length && user) names.push(user.realName || user.username || user.name || "当前工程师");
    return [...new Set(names.filter(Boolean))].join("、") || "-";
  }, [currentUserId, engineers, form.engineerIds, user]);

  const loadReferenceData = useCallback(async () => {
    const sortLocale = encodeURIComponent(lang);
    const [customerData, recentCustomerData, engineerData] = await Promise.all([
      api.get(`/customers?pageSize=200&sortLocale=${sortLocale}`).catch(() => ({ items: [] })),
      api.get(`/customers?mine=1&pageSize=4&sortLocale=${sortLocale}`).catch(() => ({ items: [] })),
      api.get("/users/engineers").catch(() => ({ items: [] })),
    ]);
    const regularItems = (customerData?.items || []) as CustomerOption[];
    const recentItems = ((recentCustomerData?.items || []) as CustomerOption[]).slice(0, 4);
    setRecentCustomers(recentItems);
    setCustomers(mergeCustomers(regularItems, recentItems));
    setEngineers((engineerData?.items || []) as EngineerOption[]);
  }, [lang]);

  const loadCustomerDevices = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCustomerDevices([]);
      return;
    }
    setLoadingCustomerDevices(true);
    try {
      const data = await api.get(`/customers/${customerId}/devices`);
      const items = (data?.items || []) as DeviceOption[];
      setCustomerDevices(items);
      const validDeviceIds = new Set(items.map((device) => String(device.id)));
      setForm((current) => ({
        ...current,
        deviceId: current.deviceId && validDeviceIds.has(current.deviceId) ? current.deviceId : "",
        targetDeviceIds: current.targetDeviceIds.filter((deviceId) => validDeviceIds.has(deviceId)),
        targetDevices: current.targetDevices.map((device) => (
          device.deviceId && !validDeviceIds.has(device.deviceId)
            ? { ...device, inputMode: "manual", deviceId: "" }
            : device
        )),
        installDevices: current.installDevices.map((device) => (
          device.deviceId && !validDeviceIds.has(device.deviceId)
            ? { ...device, inputMode: "manual", deviceId: "" }
            : device
        )),
        parts: current.parts.map((part) => (
          part.deviceId && !validDeviceIds.has(part.deviceId) ? { ...part, deviceId: "" } : part
        )),
      }));
    } catch {
      setCustomerDevices([]);
    } finally {
      setLoadingCustomerDevices(false);
    }
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadReferenceData();
      const [orderData, draftData] = await Promise.all([
        api.get("/service-orders?mine=1&pageSize=100&sortBy=createdAt&sortDir=desc"),
        api.get("/service-orders/draft/self-report?all=1").catch(() => ({ items: [], item: null })),
      ]);
      setOrders((orderData?.items || []) as ServiceOrder[]);
      const draftItems = Array.isArray(draftData?.items)
        ? draftData.items
        : draftData?.item
          ? [draftData.item]
          : [];
      setCreateDrafts(draftItems
        .map((item: any) => {
          const draftPayload = item?.payload;
          if (!draftPayload || typeof draftPayload !== "object") return null;
          const draftKey = String(item?.draftKey || item?.draftId || item?.id || "").trim();
          if (!draftKey) return null;
          return {
            id: item?.id,
            draftKey,
            payload: normalizeLoadedForm(draftPayload, normalizeMode(draftPayload.serviceMode)),
            clientUpdatedAt: item?.clientUpdatedAt,
            createdAt: item?.createdAt,
            updatedAt: item?.updatedAt,
          } as CreateDraftItem;
        })
        .filter(Boolean) as CreateDraftItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [loadReferenceData]);

  const loadForm = useCallback(async () => {
    if (!isFormRoute) return;
    setFormLoading(true);
    setError("");
    setEditDraftLoaded(false);
    setSignatureShareOpen(false);
    setSignatureRequest(null);
    setSignatureRequestOrderId(null);
    setSignatureShareError("");
    setSignatureShareNotice("");
    setSignatureQrCodeUrl("");
    try {
      await loadReferenceData();
      if (id) {
        const [detailData, draftData] = await Promise.all([
          api.get(`/service-orders/${id}?mine=1`),
          api.get(`/service-orders/draft/self-report?serviceOrderId=${id}`).catch(() => ({ item: null })),
        ]);
        const order = detailData?.item as ServiceOrder;
        setCurrentOrder(order);
        const base = payloadFromOrder(order);
        const draftPayload = draftData?.item?.payload;
        if (draftPayload && typeof draftPayload === "object") {
          setForm(normalizeLoadedForm({ ...base, ...draftPayload }, base.serviceMode));
          setEditDraftLoaded(true);
        } else {
          setForm(normalizeLoadedForm(base, base.serviceMode));
        }
      } else {
        setCurrentOrder(null);
        const base = defaultForm(routeMode);
        const draftData = routeShouldLoadDraft
          ? await api.get(`/service-orders/draft/self-report${routeDraftKey ? `?draftKey=${encodeURIComponent(routeDraftKey)}` : ""}`).catch(() => ({ item: null }))
          : { item: null };
        const draftPayload = draftData?.item?.payload;
        if (routeShouldLoadDraft && draftPayload && typeof draftPayload === "object" && normalizeMode(draftPayload.serviceMode) === routeMode) {
          setForm(normalizeLoadedForm({
            ...base,
            ...draftPayload,
            ...(routeMode === "office" ? { timesheetCategory: base.timesheetCategory } : {}),
          }, routeMode));
          setEditDraftLoaded(true);
          setCurrentCreateDraftKey(String(draftData?.item?.draftKey || routeDraftKey || "").trim());
        } else {
          setForm(normalizeLoadedForm(base, routeMode));
          setCurrentCreateDraftKey("");
        }
      }
      setInspectionFiles([]);
      setSupportConfigFiles([]);
      setSitePhotoFiles([]);
      setScreenshotLogFiles([]);
      setDraftSavedAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setFormLoading(false);
    }
  }, [id, isFormRoute, loadReferenceData, routeDraftKey, routeMode, routeShouldLoadDraft]);

  useEffect(() => {
    if (isFormRoute) {
      loadForm();
    } else {
      loadHome();
    }
  }, [isFormRoute, loadForm, loadHome]);

  useEffect(() => {
    if (isFormRoute) setPreviewOrder(null);
  }, [isFormRoute]);

  useEffect(() => {
    if (!isFormRoute) return;
    loadCustomerDevices(form.customerId);
  }, [form.customerId, isFormRoute, loadCustomerDevices]);

  useEffect(() => () => {
    if (customerSearchTimerRef.current) window.clearTimeout(customerSearchTimerRef.current);
    if (installModelSearchTimerRef.current) window.clearTimeout(installModelSearchTimerRef.current);
    if (modelCatalogSearchTimerRef.current) window.clearTimeout(modelCatalogSearchTimerRef.current);
  }, []);

  function patchForm(patch: Partial<ReportForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function scheduleCustomerSearch(value: string) {
    if (customerSearchTimerRef.current) window.clearTimeout(customerSearchTimerRef.current);
    const keyword = value.trim();
    const requestId = ++customerSearchRequestRef.current;
    if (!keyword || (!/[\u3400-\u9fff]/u.test(keyword) && keyword.length < 2)) {
      setCustomerSearching(false);
      return;
    }
    customerSearchTimerRef.current = window.setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const sortLocale = encodeURIComponent(lang);
        const data = await api.get(`/customers?pageSize=50&keyword=${encodeURIComponent(keyword)}&sortLocale=${sortLocale}`);
        if (requestId === customerSearchRequestRef.current) {
          setCustomers((current) => mergeCustomers(current, (data?.items || []) as CustomerOption[]));
        }
      } catch {
        // Local customer candidates stay available when remote search fails.
      } finally {
        if (requestId === customerSearchRequestRef.current) setCustomerSearching(false);
      }
    }, 250);
  }

  function scheduleInstallModelSearch(installDeviceDraftIdValue: string, value: string) {
    if (installModelSearchTimerRef.current) window.clearTimeout(installModelSearchTimerRef.current);
    const keyword = value.trim();
    const requestId = ++installModelSearchRequestRef.current;
    setInstallModelSuggestionDeviceId(installDeviceDraftIdValue);
    if (keyword.length < 2) {
      setInstallModelSuggestions([]);
      setInstallModelLoading(false);
      return;
    }
    installModelSearchTimerRef.current = window.setTimeout(async () => {
      setInstallModelLoading(true);
      try {
        const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`);
        if (requestId === installModelSearchRequestRef.current) {
          setInstallModelSuggestions((data?.items || []) as ModelSuggestion[]);
        }
      } catch {
        if (requestId === installModelSearchRequestRef.current) {
          setInstallModelSuggestions([]);
        }
      } finally {
        if (requestId === installModelSearchRequestRef.current) {
          setInstallModelLoading(false);
        }
      }
    }, 250);
  }

  function applyInstallModelSuggestion(installDeviceDraftIdValue: string, suggestion: ModelSuggestion) {
    const model = suggestion.canonicalModel || "";
    if (!model) return;
    updateInstallDevice(installDeviceDraftIdValue, { model });
    setInstallModelSuggestions([]);
    setInstallModelSuggestionDeviceId(null);
    setInstallTargetOpenId(null);
  }

  function modelSuggestionValue(suggestion: ModelSuggestion, mode: ModelSuggestionValueMode) {
    if (mode === "partNo") return suggestion.partNumber || suggestion.canonicalModel || "";
    return suggestion.canonicalModel || suggestion.partNumber || "";
  }

  function scheduleModelCatalogSearch(inputId: string, value: string) {
    if (modelCatalogSearchTimerRef.current) window.clearTimeout(modelCatalogSearchTimerRef.current);
    const keyword = value.trim();
    const requestId = ++modelCatalogSearchRequestRef.current;
    setModelSuggestionInputId(inputId);
    if (keyword.length < 2) {
      setModelCatalogSuggestions([]);
      setModelCatalogLoading(false);
      return;
    }
    modelCatalogSearchTimerRef.current = window.setTimeout(async () => {
      setModelCatalogLoading(true);
      try {
        const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`);
        if (requestId === modelCatalogSearchRequestRef.current) {
          setModelCatalogSuggestions((data?.items || []) as ModelSuggestion[]);
        }
      } catch {
        if (requestId === modelCatalogSearchRequestRef.current) {
          setModelCatalogSuggestions([]);
        }
      } finally {
        if (requestId === modelCatalogSearchRequestRef.current) {
          setModelCatalogLoading(false);
        }
      }
    }, 250);
  }

  function closeModelCatalogSuggestions(inputId: string) {
    window.setTimeout(() => {
      setModelSuggestionInputId((current) => (current === inputId ? null : current));
    }, 160);
  }

  function renderModelCatalogSuggestionInput({
    inputId,
    value,
    onChange,
    placeholder,
    valueMode = "model",
  }: {
    inputId: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    valueMode?: ModelSuggestionValueMode;
  }) {
    const active = modelSuggestionInputId === inputId;
    const suggestions = active ? modelCatalogSuggestions : [];
    const loadingSuggestions = active ? modelCatalogLoading : false;
    const showDropdown = active && (loadingSuggestions || suggestions.length > 0);

    return (
      <div className="relative">
        <Input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            setModelSuggestionInputId(inputId);
            if (value.trim().length >= 2) scheduleModelCatalogSearch(inputId, value);
          }}
          onBlur={() => closeModelCatalogSuggestions(inputId)}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue);
            scheduleModelCatalogSearch(inputId, nextValue);
          }}
        />
        {showDropdown ? (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">型号库建议</div>
            {loadingSuggestions ? (
              <div className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                搜索型号中…
              </div>
            ) : null}
            {suggestions.map((suggestion, suggestionIndex) => (
              <button
                key={`${inputId}-${suggestion.canonicalModel}-${suggestion.partNumber}-${suggestionIndex}`}
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                onMouseDown={(event) => {
                  event.preventDefault();
                  const nextValue = modelSuggestionValue(suggestion, valueMode);
                  if (!nextValue) return;
                  onChange(nextValue);
                  setModelCatalogSuggestions([]);
                  setModelSuggestionInputId(null);
                }}
              >
                <span className="font-medium">{modelSuggestionValue(suggestion, valueMode)}</span>
                <span className="text-xs text-muted-foreground">
                  {[suggestion.brand, suggestion.canonicalModel, suggestion.partNumber, suggestion.category].filter(Boolean).join(" · ") || "标准型号"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function applyCustomer(customer?: CustomerOption | null) {
    if (!customer) return;
    const contacts = contactsForCustomer(customer);
    const preferredContact = contacts.find((contact) => contact.engineerLastUsedAt || Number(contact.engineerUseCount || 0) > 0) || contacts[0];
    patchForm({
      customerId: customer.id ? String(customer.id) : "",
      customerName: customer.name || form.customerName,
      customerAddress: customer.address || customer.mapAddress || form.customerAddress,
      customerLatitude: customer.latitude ? String(customer.latitude) : "",
      customerLongitude: customer.longitude ? String(customer.longitude) : "",
      customerMapProvider: customer.mapProvider || "",
      customerMapPoiId: customer.mapPoiId || "",
      customerMapPoiName: customer.mapPoiName || "",
      customerMapAddress: customer.mapAddress || "",
      contactName: preferredContact?.name || customer.contactName || form.contactName,
      contactPhone: preferredContact?.phone || customer.contactPhone || form.contactPhone,
      customerConfirmName: preferredContact?.name || customer.contactName || form.customerConfirmName,
      deviceId: "",
      targetDeviceIds: [],
      targetDevices: [emptyTargetDevice()],
      parts: form.parts.map((part) => ({ ...part, deviceId: "", installDeviceDraftId: "" })),
      installDevices: isInstall ? [emptyInstallDevice()] : form.installDevices,
    });
    setCustomerOptionsOpen(false);
    setGeoCandidates([]);
    setGeoHint(customer.latitude && customer.longitude ? `已载入客户定位：${coordinateLabel(String(customer.latitude), String(customer.longitude))}` : "");
    setContactOptionsOpen(false);
  }

  async function searchCustomerGeo() {
    const keyword = form.customerName.trim() || form.customerAddress.trim();
    if (!keyword) {
      setGeoHint("请先输入客户公司名或详细地址");
      return;
    }

    const params = new URLSearchParams({ keyword });
    if (form.customerLatitude && form.customerLongitude) {
      params.set("latitude", form.customerLatitude);
      params.set("longitude", form.customerLongitude);
    }
    setGeoLoading(true);
    setGeoHint("正在搜索地图候选…");
    try {
      const data = await api.get(`/geo/companies?${params.toString()}`);
      const items = ((data?.items || []) as GeoCandidate[]).slice(0, 8);
      setGeoCandidates(items);
      setGeoHint(items.length ? `找到 ${items.length} 条候选，请选择一条补全客户信息` : "未找到匹配位置，可继续手动填写客户信息");
    } catch (err) {
      setGeoCandidates([]);
      setGeoHint(err instanceof Error ? err.message : "地图候选搜索失败");
    } finally {
      setGeoLoading(false);
    }
  }

  function applyGeoCandidate(candidate: GeoCandidate) {
    if (candidate.source === "customer" && candidate.customerId) {
      applyCustomer({
        id: candidate.customerId,
        name: candidate.name,
        address: candidate.address,
        contactName: candidate.contactName,
        contactPhone: candidate.contactPhone,
        contacts: candidate.contacts,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        mapProvider: candidate.mapProvider,
        mapPoiId: candidate.mapPoiId,
        mapPoiName: candidate.mapPoiName,
        mapAddress: candidate.mapAddress,
      });
      setGeoHint(`已关联系统客户：${candidate.name || candidate.customerId}`);
      return;
    }

    const coordinates = candidateCoordinates(candidate);
    const address = candidate.address || candidate.mapAddress || form.customerAddress;
    patchForm({
      customerId: "",
      customerName: candidate.name || form.customerName,
      customerAddress: address,
      customerLatitude: coordinates ? String(coordinates.latitude) : form.customerLatitude,
      customerLongitude: coordinates ? String(coordinates.longitude) : form.customerLongitude,
      customerMapProvider: candidate.mapProvider || "amap",
      customerMapPoiId: String(candidate.mapPoiId || candidate.id || ""),
      customerMapPoiName: candidate.mapPoiName || candidate.name || "",
      customerMapAddress: candidate.mapAddress || address,
      contactName: candidate.contactName || form.contactName,
      contactPhone: candidate.contactPhone || form.contactPhone,
      customerConfirmName: candidate.contactName || form.customerConfirmName,
    });
    setGeoCandidates([]);
    setGeoHint(coordinates ? `已补全地图信息：${coordinateLabel(String(coordinates.latitude), String(coordinates.longitude))}` : "已补全地图信息");
  }

  function changeCustomerAddress(value: string) {
    patchForm({
      customerAddress: value,
      customerLatitude: "",
      customerLongitude: "",
      customerMapProvider: "",
      customerMapPoiId: "",
      customerMapPoiName: "",
      customerMapAddress: value,
    });
    setGeoCandidates([]);
    setGeoHint(value.trim() ? "地址已修改，提交前建议重新定位" : "");
  }

  function changeCustomerName(value: string) {
    patchForm({
      customerId: "",
      customerName: value,
    });
    setGeoCandidates([]);
    setGeoHint(value.trim()
      ? coordinateLabel(form.customerLatitude, form.customerLongitude)
        ? "客户名称已修改，地址与定位已保留"
        : "未关联系统客户，可按新客户继续填写"
      : "");
    setCustomerOptionsOpen(true);
    scheduleCustomerSearch(value);
  }

  function selectContact(contact: CustomerContact) {
    patchForm({
      contactName: contact.name || contact.contactName || "",
      contactPhone: contact.phone || contact.contactPhone || "",
      customerConfirmName: contact.name || contact.contactName || "",
      customerSignature: "",
      customerSignatureFileId: "",
    });
    setContactOptionsOpen(false);
  }

  function changeServiceType(serviceType: string) {
    const nextModules = normalizeServiceModules({ ...form, serviceType }, form.serviceMode);
    const actionType = partActionFor(form.serviceMode, serviceType, form.timesheetCategory);
    patchForm({
      serviceModules: nextModules,
      serviceType,
      parts: form.parts.map((part) => ({ ...part, actionType })),
      installDevices: serviceType === "install" && !form.installDevices.length ? [emptyInstallDevice()] : form.installDevices,
    });
  }

  function toggleServiceModule(module: ServiceModuleId) {
    const nextModules = selectedServiceModules.includes(module)
      ? selectedServiceModules.filter((item) => item !== module)
      : [...selectedServiceModules, module];
    const serviceType = derivePrimaryServiceType(form.serviceMode, nextModules);
    const timesheetCategory = isRemote ? deriveRemoteTimesheetCategory(nextModules) : form.timesheetCategory;
    const nextParts = module === "replacement" && !selectedServiceModules.includes("replacement") && !form.parts.some((part) => part.actionType === "replacement")
      ? [...form.parts, emptyPart("replacement", form.deviceId)]
      : form.parts;

    patchForm({
      serviceModules: nextModules,
      serviceType,
      timesheetCategory,
      parts: nextParts,
      installDevices: module === "install" && !form.installDevices.length ? [emptyInstallDevice()] : form.installDevices,
    });
  }

  function addPartAction(actionType: string) {
    const modulePatch: Partial<ReportForm> = {};
    let nextInstallDevices = form.installDevices;
    if (actionType === "replacement" && !selectedServiceModules.includes("replacement")) {
      const nextModules = [...selectedServiceModules, "replacement" as ServiceModuleId];
      modulePatch.serviceModules = nextModules;
      modulePatch.serviceType = derivePrimaryServiceType(form.serviceMode, nextModules);
      if (isRemote) modulePatch.timesheetCategory = deriveRemoteTimesheetCategory(nextModules);
    }
    if (actionType === "installation" && isOnsite && !selectedServiceModules.includes("install")) {
      const nextModules = [...selectedServiceModules, "install" as ServiceModuleId];
      modulePatch.serviceModules = nextModules;
      modulePatch.serviceType = derivePrimaryServiceType(form.serviceMode, nextModules);
      if (!nextInstallDevices.length) {
        nextInstallDevices = [emptyInstallDevice()];
        modulePatch.installDevices = nextInstallDevices;
      }
    }
    const firstInstallDevice = nextInstallDevices[0];
    const installDeviceDraftIdValue = actionType === "installation" && firstInstallDevice ? firstInstallDevice.id : "";
    const partDeviceId = actionType === "installation" && firstInstallDevice
      ? firstInstallDevice.deviceId
      : form.deviceId;
    patchForm({ ...modulePatch, parts: [...form.parts, emptyPart(actionType, partDeviceId, installDeviceDraftIdValue)] });
  }

  function addInstallationPart(installDeviceDraftIdValue: string) {
    const installDevice = form.installDevices.find((device) => device.id === installDeviceDraftIdValue) || form.installDevices[0];
    patchForm({
      parts: [
        ...form.parts,
        emptyPart("installation", installDevice?.deviceId || "", installDevice?.id || installDeviceDraftIdValue),
      ],
    });
  }

  function targetDevicePatch(device: DeviceOption): Partial<ReportForm> {
    return {
      deviceId: String(device.id),
      deviceName: deviceLabel(device) || form.deviceName,
      deviceModel: device.model || form.deviceModel,
      devicePn: device.pn || form.devicePn,
      deviceSerialNo: device.serialNo || form.deviceSerialNo,
    };
  }

  function primaryTargetDevicePatch(devices: TargetDeviceDraft[]): Partial<ReportForm> {
    const primary = devices.find(targetDeviceHasContent) || devices[0];
    if (!primary) {
      return {
        deviceId: "",
        deviceName: "",
        deviceModel: "",
        devicePn: "",
        deviceSerialNo: "",
        deviceRemark: "",
        targetDeviceIds: [],
      };
    }
    if (primary.inputMode === "existing" && primary.deviceId) {
      const device = selectedCustomerDevices.find((item) => String(item.id) === primary.deviceId);
      return targetDevicePatch(device || {
        id: primary.deviceId,
        model: primary.model,
        pn: primary.pn,
        serialNo: primary.serialNo,
        remark: primary.remark,
      });
    }
    return {
      deviceId: "",
      deviceName: "",
      deviceModel: primary.model,
      devicePn: primary.pn,
      deviceSerialNo: primary.serialNo,
      deviceRemark: primary.remark,
    };
  }

  function primaryInstallDevicePatch(devices: InstallDeviceDraft[]): Partial<ReportForm> {
    const primary = devices.find(installDeviceHasContent) || devices[0];
    if (!primary) {
      return {
        installDeviceInputMode: "manual",
        deviceId: "",
        deviceName: "",
        deviceModel: "",
        devicePn: "",
        deviceSerialNo: "",
        deviceRemark: "",
      };
    }
    if (primary.inputMode === "existing" && primary.deviceId) {
      const device = selectedCustomerDevices.find((item) => String(item.id) === primary.deviceId);
      return {
        ...targetDevicePatch(device || { id: primary.deviceId, model: primary.model, pn: primary.pn, serialNo: primary.serialNo }),
        installDeviceInputMode: "existing",
      };
    }
    return {
      installDeviceInputMode: "manual",
      deviceId: "",
      deviceName: "",
      deviceModel: primary.model,
      devicePn: primary.pn,
      deviceSerialNo: primary.serialNo,
      deviceRemark: primary.remark,
    };
  }

  function installTargetValue(device: InstallDeviceDraft) {
    if (device.inputMode === "existing" && device.deviceId) {
      const selectedDevice = selectedCustomerDevices.find((item) => String(item.id) === device.deviceId);
      return selectedDevice ? deviceSelectLabel(selectedDevice) : device.model;
    }
    return device.model;
  }

  function installTargetOptions(device: InstallDeviceDraft) {
    const keyword = device.inputMode === "existing" ? "" : device.model;
    return selectedCustomerDevices
      .filter((item) => deviceMatchesKeyword(item, keyword))
      .slice(0, 8);
  }

  function targetDeviceValue(device: TargetDeviceDraft) {
    if (device.inputMode === "existing" && device.deviceId) {
      const selectedDevice = selectedCustomerDevices.find((item) => String(item.id) === device.deviceId);
      return selectedDevice ? deviceSelectLabel(selectedDevice) : device.model;
    }
    return device.model;
  }

  function targetDeviceOptions(device: TargetDeviceDraft) {
    const keyword = device.inputMode === "existing" ? "" : device.model;
    return selectedCustomerDevices
      .filter((item) => !form.targetDevices.some((targetDevice) => (
        targetDevice.id !== device.id && targetDevice.deviceId === String(item.id)
      )))
      .filter((item) => deviceMatchesKeyword(item, keyword))
      .slice(0, 8);
  }

  function patchTargetDevices(devices: TargetDeviceDraft[], patch: Partial<ReportForm> = {}) {
    const targetDeviceIds = devices
      .filter((device) => device.inputMode === "existing" && device.deviceId)
      .map((device) => String(device.deviceId));
    patchForm({
      ...patch,
      ...primaryTargetDevicePatch(devices),
      targetDeviceIds: [...new Set(targetDeviceIds)],
      targetDevices: devices,
    });
  }

  function patchInstallDevices(devices: InstallDeviceDraft[], patch: Partial<ReportForm> = {}) {
    patchForm({
      ...patch,
      ...primaryInstallDevicePatch(devices),
      installDevices: devices,
    });
  }

  function partsWithTargetDevice(deviceId: string, ensureReplacement = false) {
    let nextParts = form.parts.map((part) => (part.deviceId ? part : { ...part, deviceId }));
    if (ensureReplacement && !nextParts.some((part) => part.actionType === "replacement" && part.deviceId === deviceId)) {
      nextParts = [...nextParts, emptyPart("replacement", deviceId)];
    }
    return nextParts;
  }

  function changeTargetDevice(targetDeviceDraftIdValue: string, value: string) {
    const nextDevices = form.targetDevices.map((device) => (
      device.id === targetDeviceDraftIdValue
        ? { ...device, inputMode: "manual" as InstallDeviceInputMode, deviceId: "", model: value }
        : device
    ));
    patchTargetDevices(nextDevices, {
      parts: form.parts.map((part) => (
        part.deviceId && !nextDevices.some((device) => device.deviceId === part.deviceId) ? { ...part, deviceId: "" } : part
      )),
    });
    setTargetDeviceOpenId(targetDeviceDraftIdValue);
    scheduleInstallModelSearch(targetDeviceDraftIdValue, value);
  }

  function chooseTargetDevice(targetDeviceDraftIdValue: string, deviceId: string) {
    const device = selectedCustomerDevices.find((item) => String(item.id) === deviceId);
    if (!device) {
      const nextDevices = form.targetDevices.map((item) => (
        item.id === targetDeviceDraftIdValue ? { ...item, inputMode: "manual" as InstallDeviceInputMode, deviceId: "" } : item
      ));
      patchTargetDevices(nextDevices);
      return;
    }
    const nextDevices = form.targetDevices.map((item) => (
      item.id === targetDeviceDraftIdValue
        ? emptyTargetDevice({
            id: item.id,
            inputMode: "existing",
            deviceId: String(device.id),
            model: device.model || deviceLabel(device),
            pn: device.pn || "",
            serialNo: device.serialNo || "",
            remark: device.remark || "",
          })
        : item
    ));
    patchTargetDevices(nextDevices, {
      parts: partsWithTargetDevice(String(device.id), hasReplacementModule),
    });
    setInstallModelSuggestions([]);
    setInstallModelSuggestionDeviceId(null);
    setTargetDeviceOpenId(null);
  }

  function applyTargetModelSuggestion(targetDeviceDraftIdValue: string, suggestion: ModelSuggestion) {
    const model = suggestion.canonicalModel || "";
    if (!model) return;
    updateTargetDevice(targetDeviceDraftIdValue, { model });
    setInstallModelSuggestions([]);
    setInstallModelSuggestionDeviceId(null);
    setTargetDeviceOpenId(null);
  }

  function updateTargetDevice(targetDeviceDraftIdValue: string, patch: Partial<TargetDeviceDraft>) {
    const nextDevices = form.targetDevices.map((device) => (
      device.id === targetDeviceDraftIdValue ? normalizeTargetDeviceDraft({ ...device, ...patch }) : device
    ));
    patchTargetDevices(nextDevices);
  }

  function addTargetDeviceRow() {
    patchTargetDevices([...form.targetDevices, emptyTargetDevice()]);
  }

  function removeTargetDeviceRow(targetDeviceDraftIdValue: string) {
    const nextDevices = form.targetDevices.filter((device) => device.id !== targetDeviceDraftIdValue);
    patchTargetDevices(nextDevices.length ? nextDevices : [emptyTargetDevice()], {
      parts: form.parts.map((part) => (
        part.deviceId && form.targetDevices.some((device) => device.id === targetDeviceDraftIdValue && device.deviceId === part.deviceId)
          ? { ...part, deviceId: "" }
          : part
      )),
    });
  }

  async function resolveTargetDevicesForSubmit() {
    if (isInstall || !showTargetDeviceFields) return form.targetDeviceIds.map(Number).filter(Boolean);
    if (!form.customerId) return [];
    const activeDevices = form.targetDevices.filter(targetDeviceHasContent);
    const resolvedIds: string[] = [];
    const createdDevices: DeviceOption[] = [];
    const nextDrafts: TargetDeviceDraft[] = [];

    for (const device of activeDevices) {
      if (device.inputMode === "existing" && device.deviceId) {
        resolvedIds.push(String(device.deviceId));
        nextDrafts.push(device);
        continue;
      }
      const model = device.model.trim();
      const serialNo = device.serialNo.trim();
      if (!model || !serialNo) {
        throw new Error("请补齐目标设备的型号和序列号");
      }
      const data = await api.post("/devices", {
        customerId: Number(form.customerId),
        name: null,
        model,
        pn: device.pn.trim() || undefined,
        serialNo,
        remark: device.remark.trim() || undefined,
      });
      const newDevice: DeviceOption = {
        id: data?.id,
        customerId: form.customerId,
        model,
        pn: device.pn.trim(),
        serialNo,
        remark: device.remark.trim(),
      };
      if (!newDevice.id) throw new Error("目标设备已创建，但未返回设备 ID");
      const newDeviceId = String(newDevice.id);
      resolvedIds.push(newDeviceId);
      createdDevices.push(newDevice);
      nextDrafts.push(emptyTargetDevice({
        id: device.id,
        inputMode: "existing",
        deviceId: newDeviceId,
        model,
        pn: device.pn.trim(),
        serialNo,
        remark: device.remark.trim(),
      }));
    }

    const uniqueIds = [...new Set(resolvedIds)];
    if (createdDevices.length) {
      setCustomerDevices((current) => [
        ...createdDevices,
        ...current.filter((device) => !createdDevices.some((created) => String(created.id) === String(device.id))),
      ]);
    }
    if (activeDevices.length) {
      patchTargetDevices(nextDrafts);
    }
    return uniqueIds.map(Number).filter(Boolean);
  }

  function updatePart(index: number, patch: Partial<ServicePartDraft>) {
    patchForm({ parts: form.parts.map((part, partIndex) => partIndex === index ? { ...part, ...patch } : part) });
  }

  function removePart(index: number) {
    patchForm({ parts: form.parts.filter((_, partIndex) => partIndex !== index) });
  }

  function choosePartDevice(index: number, deviceId: string) {
    const nextDeviceId = deviceId === "none" ? "" : deviceId;
    const device = selectedCustomerDevices.find((item) => String(item.id) === nextDeviceId);
    const nextParts = form.parts.map((part, partIndex) => (
      partIndex === index ? { ...part, deviceId: nextDeviceId } : part
    ));
    patchForm({
      ...(device && !form.deviceId ? targetDevicePatch(device) : {}),
      parts: nextParts,
    });
  }

  function changeInstallTarget(installDeviceDraftIdValue: string, value: string) {
    const nextDevices = form.installDevices.map((device) => (
      device.id === installDeviceDraftIdValue
        ? { ...device, inputMode: "manual" as InstallDeviceInputMode, deviceId: "", model: value }
        : device
    ));
    patchInstallDevices(nextDevices, {
      parts: form.parts.map((part) => (
        part.installDeviceDraftId === installDeviceDraftIdValue ? { ...part, deviceId: "" } : part
      )),
    });
    setInstallTargetOpenId(installDeviceDraftIdValue);
    scheduleInstallModelSearch(installDeviceDraftIdValue, value);
  }

  function chooseInstallDevice(installDeviceDraftIdValue: string, deviceId: string) {
    if (deviceId === "none") {
      const nextDevices = form.installDevices.map((device) => (
        device.id === installDeviceDraftIdValue
          ? { ...device, inputMode: "manual" as InstallDeviceInputMode, deviceId: "" }
          : device
      ));
      patchInstallDevices(nextDevices);
      return;
    }
    const device = selectedCustomerDevices.find((item) => String(item.id) === deviceId);
    if (!device) {
      const nextDevices = form.installDevices.map((item) => (
        item.id === installDeviceDraftIdValue ? { ...item, inputMode: "manual" as InstallDeviceInputMode, deviceId: "" } : item
      ));
      patchInstallDevices(nextDevices);
      return;
    }
    const nextDevices = form.installDevices.map((item) => (
      item.id === installDeviceDraftIdValue
        ? emptyInstallDevice({
            id: item.id,
            inputMode: "existing",
            deviceId: String(device.id),
            model: device.model || deviceLabel(device),
            pn: device.pn || "",
            serialNo: device.serialNo || "",
            remark: device.remark || "",
          })
        : item
    ));
    patchInstallDevices(nextDevices, {
      parts: form.parts.map((part) => (
        part.installDeviceDraftId === installDeviceDraftIdValue ? { ...part, deviceId: String(device.id) } : part
      )),
    });
    setInstallModelSuggestions([]);
    setInstallModelSuggestionDeviceId(null);
    setInstallTargetOpenId(null);
  }

  function updateInstallDevice(installDeviceDraftIdValue: string, patch: Partial<InstallDeviceDraft>) {
    const nextDevices = form.installDevices.map((device) => (
      device.id === installDeviceDraftIdValue ? normalizeInstallDeviceDraft({ ...device, ...patch }) : device
    ));
    patchInstallDevices(nextDevices);
  }

  function addInstallDevice() {
    const nextDevices = [...form.installDevices, emptyInstallDevice()];
    patchInstallDevices(nextDevices);
  }

  function removeInstallDevice(installDeviceDraftIdValue: string) {
    const removedIndex = form.installDevices.findIndex((device) => device.id === installDeviceDraftIdValue);
    const nextDevices = form.installDevices.filter((device) => device.id !== installDeviceDraftIdValue);
    const fallbackDevices = nextDevices.length ? nextDevices : [emptyInstallDevice()];
    patchInstallDevices(fallbackDevices, {
      parts: form.parts.filter((part) => (
        part.installDeviceDraftId
          ? part.installDeviceDraftId !== installDeviceDraftIdValue
          : removedIndex !== 0
      )),
    });
  }

  function activeParts() {
    return activePartRows;
  }

  async function useLatestCustomerSignature() {
    if (!form.customerId && !form.customerName.trim()) {
      setError("请先选择或填写客户");
      return;
    }
    setLoadingLatestSignature(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (form.customerId) params.set("customerId", form.customerId);
      if (form.customerName.trim()) params.set("customerName", form.customerName.trim());
      if (form.contactName.trim()) params.set("contactName", form.contactName.trim());
      const data = await api.get(`/service-orders/customer-signature/latest?${params.toString()}`);
      if (!data?.customerSignature) {
        setError("未找到该客户的历史签名");
        return;
      }
      patchForm({
        customerSignatureMode: "onsite",
        customerSignature: data.customerSignature,
        customerSignatureFileId: data.customerSignatureFileId ? String(data.customerSignatureFileId) : "",
      });
      toast.success("已套用该客户最近一次签名");
    } catch (err) {
      setError(err instanceof Error ? err.message : "历史签名读取失败");
    } finally {
      setLoadingLatestSignature(false);
    }
  }

  function resolveCustomerSignaturePublicBaseUrl() {
    const viteBase = String((import.meta as any).env.BASE_URL || "/").trim();
    const pathname = window.location.pathname || "/";
    const basePath = viteBase && viteBase !== "/"
      ? viteBase
      : pathname.startsWith("/engineer/") || pathname === "/engineer" ? "/engineer/" : "/";
    return new URL(basePath, window.location.origin).toString().replace(/\/+$/, "");
  }

  async function updateSignatureQrCode(url: string) {
    if (!url) {
      setSignatureQrCodeUrl("");
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: 220,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
      setSignatureQrCodeUrl(dataUrl);
    } catch {
      setSignatureQrCodeUrl("");
    }
  }

  async function createCustomerSignatureRequest(orderId: string | number, sendEmail = false) {
    const targetOrderId = orderId || signatureRequestOrderId;
    if (!targetOrderId) throw new Error("缺少服务记录编号，无法生成签署链接");
    const recipientEmail = signatureRecipientEmail.trim();
    if (sendEmail && !recipientEmail) throw new Error("请先填写客户邮箱");
    setSignatureRequestLoading(true);
    setSignatureShareError("");
    setSignatureShareNotice("");
    try {
      const data = await api.post(`/service-orders/${targetOrderId}/customer-signature-requests`, {
        sendEmail,
        recipientEmail: recipientEmail || undefined,
        publicBaseUrl: resolveCustomerSignaturePublicBaseUrl(),
      });
      const request = (data?.item || null) as CustomerSignatureRequestInfo | null;
      setSignatureRequest(request);
      setSignatureRequestOrderId(targetOrderId);
      setSignatureShareOpen(true);
      await updateSignatureQrCode(request?.signUrl || "");
      if (sendEmail) {
        setSignatureShareNotice(request?.mail?.sent
          ? "确认函邮件已发送"
          : `签署链接已生成，但邮件未发送：${request?.mail?.reason || "邮件服务未配置"}`);
      } else {
        setSignatureShareNotice("签署链接已生成，可复制链接、扫码或使用系统分享发送给客户");
      }
      return request;
    } catch (err) {
      setSignatureShareError(err instanceof Error ? err.message : "签署链接生成失败");
      throw err;
    } finally {
      setSignatureRequestLoading(false);
    }
  }

  function fallbackCopyText(value: string) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  async function copySignatureRequestLink() {
    if (!signatureRequestUrl) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(signatureRequestUrl);
      else fallbackCopyText(signatureRequestUrl);
      setSignatureShareNotice("签署链接已复制");
      setSignatureShareError("");
    } catch {
      fallbackCopyText(signatureRequestUrl);
      setSignatureShareNotice("签署链接已复制");
      setSignatureShareError("");
    }
  }

  async function nativeShareSignatureRequest() {
    if (!signatureRequestUrl) return;
    const title = `客户服务确认函 ${currentOrder?.orderNo || signatureRequest?.serviceOrderId || signatureRequestOrderId || ""}`.trim();
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: "请打开链接查看服务内容并完成签署确认。",
          url: signatureRequestUrl,
        });
        setSignatureShareNotice("已打开系统分享");
        setSignatureShareError("");
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copySignatureRequestLink();
  }

  async function sendSignatureRequestMail() {
    try {
      await createCustomerSignatureRequest(signatureRequestOrderId || "", true);
    } catch (err) {
      setSignatureShareError(err instanceof Error ? err.message : "邮件发送失败");
    }
  }

  async function downloadInspectionDocument(file: OrderFile) {
    if (!file.id || downloadingFileId) return;
    setDownloadingFileId(file.id);
    setError("");
    try {
      const blob = await api.download(`/files/${file.id}?mine=1`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.originalName || `inspection-document-${file.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "巡检文档下载失败");
    } finally {
      setDownloadingFileId(null);
    }
  }

  async function fetchServiceRecordPdf(order: ServiceOrder) {
    if (!order?.id) throw new Error("工单不存在");
    return api.download(`/service-orders/${order.id}/export-pdf?mine=1`);
  }

  async function downloadServiceRecordPdf(order: ServiceOrder) {
    if (!canExportServiceRecord(order) || exportingOrderId) return;
    setExportingOrderId(order.id);
    setError("");
    try {
      const blob = await fetchServiceRecordPdf(order);
      downloadBlob(blob, serviceRecordFileName(order));
      toast.success("服务记录 PDF 已导出");
    } catch (err) {
      setError(err instanceof Error ? err.message : "服务记录导出失败");
    } finally {
      setExportingOrderId(null);
    }
  }

  async function shareServiceRecordPdf(order: ServiceOrder) {
    if (!canExportServiceRecord(order) || exportingOrderId) return;
    setExportingOrderId(order.id);
    setError("");
    try {
      const blob = await fetchServiceRecordPdf(order);
      const filename = serviceRecordFileName(order);
      const file = new File([blob], filename, { type: blob.type || "application/pdf" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          title: order.orderNo || "服务记录",
          text: `${order.customerName || "客户"}服务记录`,
          files: [file],
        });
        toast.success("已打开系统分享");
      } else {
        downloadBlob(blob, filename);
        toast.info("当前浏览器不支持直接分享 PDF，已改为下载文件。");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "服务记录分享失败");
    } finally {
      setExportingOrderId(null);
    }
  }

  async function deleteServiceOrder(order: ServiceOrder) {
    if (!canDeleteServiceOrder(order) || deletingOrderId) return;
    setDeletingOrderId(order.id);
    setError("");
    try {
      const data = await api.get(`/service-orders/${order.id}?mine=1`);
      const detailOrder = (data?.item || data || order) as ServiceOrder;
      if (!window.confirm(buildDeleteConfirmationMessage(detailOrder))) return;
      await api.delete(`/service-orders/${order.id}?mine=1`);
      setOrders((current) => current.filter((item) => String(item.id) !== String(order.id)));
      setPreviewOrder((current) => (current && String(current.id) === String(order.id) ? null : current));
      toast.success("工单已删除");
      await loadHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "工单删除失败");
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function cancelServiceOrder(order: ServiceOrder) {
    if (!canCancelServiceOrder(order) || deletingOrderId) return;
    const displayId = reportOrderDisplayId(order);
    if (!window.confirm(`确认作废 ${displayId}？作废后记录会保留审计，但不再显示在当前工单列表。`)) return;
    setDeletingOrderId(order.id);
    setError("");
    try {
      await api.post(`/service-orders/${order.id}/cancel?mine=1`, {});
      setOrders((current) => current.map((item) => (
        String(item.id) === String(order.id)
          ? { ...item, status: "cancelled", workflowStatus: "cancelled", displayStatus: "已作废" }
          : item
      )));
      setPreviewOrder((current) => (current && String(current.id) === String(order.id) ? null : current));
      toast.success("工单已作废");
      await loadHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "工单作废失败");
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function deleteCreateDraft(draftKey: string) {
    const key = String(draftKey || "").trim();
    if (!key || deletingDraft) return;
    if (!window.confirm("确认删除当前草稿？")) return;
    setDeletingDraft(true);
    setError("");
    try {
      await api.delete(`/service-orders/draft/self-report?draftKey=${encodeURIComponent(key)}`);
      setCreateDrafts((current) => current.filter((draft) => draft.draftKey !== key));
      if (currentCreateDraftKey === key) setCurrentCreateDraftKey("");
      toast.success("草稿已删除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "草稿删除失败");
    } finally {
      setDeletingDraft(false);
    }
  }

  function localFilesForPurpose(purpose: AttachmentPurpose) {
    if (purpose === "inspection_document") return inspectionFiles;
    if (purpose === "support_config") return supportConfigFiles;
    if (purpose === "site_photo") return sitePhotoFiles;
    return screenshotLogFiles;
  }

  function setLocalFilesForPurpose(purpose: AttachmentPurpose, files: File[]) {
    if (purpose === "inspection_document") {
      setInspectionFiles(files);
      return;
    }
    if (purpose === "support_config") {
      setSupportConfigFiles(files);
      return;
    }
    if (purpose === "site_photo") {
      setSitePhotoFiles(files);
      return;
    }
    setScreenshotLogFiles(files);
  }

  async function selectAttachmentFiles(purpose: AttachmentPurpose, files: File[], append = false) {
    const processedFiles = await compressAttachmentImages(files);
    const nextFiles = append ? mergeAttachmentFiles(localFilesForPurpose(purpose), processedFiles) : processedFiles;
    const fileError = validateFiles(nextFiles);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError("");
    setLocalFilesForPurpose(purpose, nextFiles);
  }

  function dragAttachmentFiles(event: DragEvent<HTMLDivElement>, purpose: AttachmentPurpose) {
    event.preventDefault();
    event.stopPropagation();
    if (Array.from(event.dataTransfer.types || []).includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
      setDraggingAttachmentPurpose(purpose);
    }
  }

  function leaveAttachmentDropZone(event: DragEvent<HTMLDivElement>, purpose: AttachmentPurpose) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDraggingAttachmentPurpose((current) => current === purpose ? null : current);
    }
  }

  function dropAttachmentFiles(event: DragEvent<HTMLDivElement>, purpose: AttachmentPurpose) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingAttachmentPurpose(null);
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    void selectAttachmentFiles(purpose, files, true);
  }

  function existingFilesForPurpose(purpose: AttachmentPurpose) {
    return (currentOrder?.files || []).filter((file) => file.purpose === purpose || (purpose === "support_config" && file.purpose === "general"));
  }

  function attachmentPurposeLabel(purpose: AttachmentPurpose) {
    return ATTACHMENT_PURPOSES[purpose].label;
  }

  function buildPayload(resolvedTargetDeviceIds?: number[]) {
    const payloadModules = normalizeServiceModules(form, form.serviceMode);
    const payloadServiceType = derivePrimaryServiceType(form.serviceMode, payloadModules);
    const payloadTimesheetCategory = isRemote ? deriveRemoteTimesheetCategory(payloadModules) : form.timesheetCategory;
    const installDevices = isInstall ? form.installDevices.filter(installDeviceHasContent) : [];
    const firstInstallDevice = installDevices[0] || emptyInstallDevice();
    const firstInstallDeviceId = firstInstallDevice.inputMode === "existing" && firstInstallDevice.deviceId
      ? Number(firstInstallDevice.deviceId)
      : null;
    const payloadTargetDeviceIds = isInstall
      ? []
      : resolvedTargetDeviceIds
        ? [...new Set(resolvedTargetDeviceIds.map(Number).filter(Boolean))]
        : [...new Set((form.targetDeviceIds.length ? form.targetDeviceIds : form.deviceId ? [form.deviceId] : []).map(Number).filter(Boolean))];
    const primaryTargetDeviceId = payloadTargetDeviceIds[0] || null;
    const officeName = user?.realName || user?.username || "内勤工程师";
    const payloadCustomerName = isOffice ? (form.customerName.trim() || "敦阳科技（内勤）") : form.customerName.trim();
    const payloadContactName = form.contactName.trim() || (isOffice ? officeName : "");
    const payloadContactPhone = form.contactPhone.trim() || (isOffice ? String(user?.phone || user?.mobile || "") : "");
    return {
      draftKey: !id && currentCreateDraftKey ? currentCreateDraftKey : undefined,
      customerId: form.customerId ? Number(form.customerId) : null,
      customerName: payloadCustomerName,
      customerAddress: form.customerAddress.trim(),
      customerLatitude: form.customerLatitude || null,
      customerLongitude: form.customerLongitude || null,
      customerMapProvider: form.customerMapProvider || null,
      customerMapPoiId: form.customerMapPoiId || null,
      customerMapPoiName: form.customerMapPoiName || null,
      customerMapAddress: form.customerMapAddress || null,
      contactName: payloadContactName,
      contactPhone: payloadContactPhone,
      deviceId: isInstall ? firstInstallDeviceId : primaryTargetDeviceId,
      targetDeviceIds: payloadTargetDeviceIds,
      deviceName: isInstall ? "" : form.deviceName.trim(),
      deviceModel: isInstall ? (firstInstallDevice.inputMode === "manual" ? firstInstallDevice.model.trim() : "") : form.deviceModel.trim(),
      devicePn: isInstall ? (firstInstallDevice.inputMode === "manual" ? firstInstallDevice.pn.trim() : "") : form.devicePn.trim(),
      deviceSerialNo: isInstall ? (firstInstallDevice.inputMode === "manual" ? firstInstallDevice.serialNo.trim() : "") : form.deviceSerialNo.trim(),
      deviceRemark: isInstall ? (firstInstallDevice.inputMode === "manual" ? firstInstallDevice.remark.trim() : "") : form.deviceRemark.trim(),
      installDevices: installDevices.map((device) => ({
        id: device.id,
        inputMode: device.inputMode,
        deviceId: device.deviceId ? Number(device.deviceId) : null,
        model: device.model.trim(),
        pn: device.pn.trim(),
        serialNo: device.serialNo.trim(),
        remark: device.remark.trim(),
      })),
      serviceMode: form.serviceMode,
      serviceType: isOnsite ? payloadServiceType : "other",
      serviceModules: payloadModules,
      timesheetCategory: isOnsite ? null : payloadTimesheetCategory.trim(),
      timesheetSalesperson: form.timesheetSalesperson.trim(),
      priority: form.priority,
      issueDescription: form.issueDescription.trim(),
      internalNote: "",
      departureAt: submitDateTime(form.departureAt),
      actualStartAt: submitDateTime(form.actualStartAt),
      actualEndAt: submitDateTime(form.actualEndAt),
      returnAt: submitDateTime(form.returnAt),
      workContent: form.workContent.trim(),
      workEntries: currentUserId ? [{ engineerId: Number(currentUserId), workContent: form.workContent.trim() }] : [],
      result: isOffice ? null : form.result,
      resultDescription: "",
      customerConfirmName: payloadContactName,
      customerSignatureMode: isOnsite ? form.customerSignatureMode : "onsite",
      customerSignature: isOnsite ? form.customerSignature : "",
      customerSignatureFileId: isOnsite && form.customerSignatureFileId ? Number(form.customerSignatureFileId) : null,
      engineerIds: form.engineerIds.map(Number).filter(Boolean),
      parts: activeParts().map((part) => {
        const actionType = part.actionType || partActionFor(form.serviceMode, payloadServiceType, payloadTimesheetCategory);
        return {
          deviceId: part.deviceId ? Number(part.deviceId) : (isInstall ? null : primaryTargetDeviceId),
          installDeviceDraftId: part.installDeviceDraftId || null,
          actionType,
          partName: part.partName.trim(),
          partNo: part.partNo.trim(),
          quantity: part.quantity || "1",
          unit: part.unit.trim() || "个",
          remark: part.remark.trim(),
        };
      }),
    };
  }

  function validateBeforeSubmit() {
    const missing: string[] = [];
    if (!isOffice && !form.customerId && !form.customerName.trim()) missing.push("客户名称");
    if (isOnsite && !form.customerAddress.trim()) missing.push("客户地址");
    if (!isOffice && !form.contactName.trim() && !form.customerConfirmName.trim()) missing.push("客户联系人");
    if (!isOffice && !form.contactPhone.trim()) missing.push("客户联系电话");
    if (isOffice && !form.timesheetCategory.trim()) missing.push("内勤工作事项");
    if (isInstall) {
      const installTargets = form.installDevices.filter(installDeviceHasContent);
      if (!installTargets.length) {
        missing.push("安装设备");
      }
      installTargets.forEach((device, index) => {
        const deviceLabelText = `安装设备 ${index + 1}`;
        if (device.inputMode === "existing") {
          if (!device.deviceId) missing.push(`${deviceLabelText}关联设备`);
          if (!form.parts.some((part) => part.actionType === "installation" && part.installDeviceDraftId === device.id && servicePartHasContent(part))) {
            missing.push(`${deviceLabelText}新配件明细`);
          }
        } else if (!device.model.trim()) {
          missing.push(`${deviceLabelText}型号`);
        }
      });
    }
    if (showTargetDeviceFields) {
      const maintenanceTargets = form.targetDevices.filter(targetDeviceHasContent);
      if (!maintenanceTargets.length) {
        missing.push(isRemote ? "远程目标设备" : "目标设备");
      }
      maintenanceTargets.forEach((device, index) => {
        const deviceLabelText = `${isRemote ? "远程目标设备" : "目标设备"} ${index + 1}`;
        if (device.inputMode === "existing") {
          if (!device.deviceId) missing.push(`${deviceLabelText}关联设备`);
        } else {
          if (!device.model.trim()) missing.push(`${deviceLabelText}型号`);
          if (!device.serialNo.trim()) missing.push(`${deviceLabelText}序列号`);
        }
      });
    }
    const invalidPart = activeParts().find((part) => {
      const action = part.actionType || partActionFor(form.serviceMode, form.serviceType, form.timesheetCategory);
      const needsDevice = ["replacement", "installation"].includes(action);
      const installTarget = action === "installation" && isInstall
        ? form.installDevices.find((device) => device.id === part.installDeviceDraftId)
        : null;
      const installTargetReady = Boolean(installTarget && (
        installTarget.inputMode === "existing" ? installTarget.deviceId : installTarget.model.trim()
      ));
      return (needsDevice && !part.deviceId && !form.deviceId && !installTargetReady) || !part.partName.trim() || Number(part.quantity || 0) <= 0;
    });
    if (invalidPart) missing.push("备件或硬件部件明细（关联设备、名称、数量）");
    if (selectedServiceModules.includes("replacement")) {
      const hasReplacementPart = activeParts().some((part) => {
        const action = part.actionType || partActionFor(form.serviceMode, form.serviceType, form.timesheetCategory);
        return action === "replacement" && part.partName.trim() && Number(part.quantity || 0) > 0;
      });
      if (!hasReplacementPart) missing.push("备件更换明细");
    }
    if (!form.issueDescription.trim()) missing.push(issueFieldLabel);
    if (!form.workContent.trim()) missing.push(workContentLabel);
    if (!isOffice && !form.result) missing.push(isOnsite ? "服务结果" : "处理结果");
    if (!form.actualStartAt) missing.push(isOnsite ? "到达时间" : "开始时间");
    if (!form.actualEndAt) missing.push(isOnsite ? "完成时间" : "结束时间");
    if (isOnsite && form.customerSignatureMode !== "electronic" && !form.customerSignature && !form.customerSignatureFileId && !currentOrder?.report?.customerSignatureFileId) {
      missing.push("客户现场签名或电子签署确认函");
    }
    return missing;
  }

  function hasDraftContent() {
    const textFields = [
      form.customerId,
      form.customerName,
      form.customerAddress,
      form.contactName,
      form.contactPhone,
      form.deviceId,
      form.deviceName,
      form.deviceModel,
      form.devicePn,
      form.deviceSerialNo,
      form.deviceRemark,
      form.timesheetCategory,
      form.timesheetSalesperson,
      form.issueDescription,
      form.departureAt,
      form.actualStartAt,
      form.actualEndAt,
      form.returnAt,
      form.workContent,
      form.resultDescription,
      form.customerConfirmName,
      form.customerSignature,
      form.customerSignatureFileId,
    ];
    return textFields.some((value) => String(value || "").trim())
      || form.serviceModules.length > 0
      || form.targetDeviceIds.length > 0
      || form.engineerIds.length > 0
      || form.installDevices.some(installDeviceHasContent)
      || form.targetDevices.some(targetDeviceHasContent)
      || form.parts.some(servicePartHasContent);
  }

  async function saveDraft(silent = false) {
    if (!hasDraftContent()) {
      if (!silent) {
        const message = "请先填写内容后再保存草稿";
        setError(message);
        toast.error(message);
      }
      return;
    }
    setSaving(true);
    setError("");
    try {
      const draftData = await api.put("/service-orders/draft/self-report", {
        serviceOrderId: id ? Number(id) : null,
        draftKey: !id && currentCreateDraftKey ? currentCreateDraftKey : undefined,
        payload: form,
        clientUpdatedAt: new Date().toISOString(),
      });
      const savedDraftKey = String(draftData?.item?.draftKey || currentCreateDraftKey || "").trim();
      if (!id && savedDraftKey) setCurrentCreateDraftKey(savedDraftKey);
      const savedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      setDraftSavedAt(savedAt);
      if (!silent) {
        toast.success(`草稿已保存：${savedAt}`);
        setPreviewOrder(null);
        navigate("/service-report", { replace: true });
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "草稿保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function uploadOrderFiles(orderId: string | number) {
    const entries = ([
      ["support_config", supportConfigFiles],
      ["site_photo", sitePhotoFiles],
      ["screenshot_log", screenshotLogFiles],
      ["inspection_document", inspectionFiles],
    ] as Array<[AttachmentPurpose, File[]]>).filter(([, files]) => files.length);
    if (!entries.length) return;
    for (const [, files] of entries) {
      const fileError = validateFiles(files);
      if (fileError) throw new Error(fileError);
    }
    setUploadingFiles(true);
    try {
      for (const [purpose, files] of entries) {
        for (const file of files) {
          const data = new FormData();
          data.append("file", file);
          data.append("ownerType", "service_order");
          data.append("ownerId", String(orderId));
          data.append("purpose", purpose);
          data.append("mine", "1");
          await api.postForm("/files", data);
        }
      }
      setSupportConfigFiles([]);
      setSitePhotoFiles([]);
      setScreenshotLogFiles([]);
      setInspectionFiles([]);
    } finally {
      setUploadingFiles(false);
    }
  }

  async function openPreviewOrder(order: ServiceOrder) {
    setPreviewOrder(order);
    setPreviewError("");
    if (!order.id) return;
    setPreviewLoading(true);
    try {
      const data = await api.get(`/service-orders/${order.id}?mine=1`);
      const detail = data?.item as ServiceOrder | undefined;
      if (detail) {
        setPreviewOrder((current) => (
          current && String(current.id) === String(order.id) ? { ...order, ...detail } : current
        ));
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "加载工单详情失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submit() {
    const missing = validateBeforeSubmit();
    if (missing.length) {
      setError(`请先补充必填项：${missing.join("、")}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const resolvedTargetDeviceIds = await resolveTargetDevicesForSubmit();
      const payload = buildPayload(resolvedTargetDeviceIds);
      let submittedOrderId = id || currentOrder?.id || "";
      if (id) {
        await uploadOrderFiles(id);
        await api.put(`/service-orders/${id}/self-report`, payload);
      } else {
        const created = await api.post("/service-orders/self-report", payload);
        submittedOrderId = created?.id || "";
        if (submittedOrderId) await uploadOrderFiles(submittedOrderId);
      }
      const draftDeleteQuery = id
        ? `?serviceOrderId=${id}`
        : currentCreateDraftKey
          ? `?draftKey=${encodeURIComponent(currentCreateDraftKey)}`
          : "";
      if (draftDeleteQuery) {
        await api.delete(`/service-orders/draft/self-report${draftDeleteQuery}`).catch(() => {});
      }
      const shouldCreateSignatureRequest = isOnsite
        && form.customerSignatureMode === "electronic"
        && !form.customerSignature
        && !form.customerSignatureFileId
        && !currentOrder?.report?.customerSignatureFileId;
      if (shouldCreateSignatureRequest && submittedOrderId) {
        setSignatureRequestOrderId(submittedOrderId);
        try {
          await createCustomerSignatureRequest(submittedOrderId, false);
          toast.success("服务记录已提交，等待客户签署");
        } catch (linkError) {
          setError(linkError instanceof Error ? `服务记录已提交，但签署链接生成失败：${linkError.message}` : "服务记录已提交，但签署链接生成失败");
        }
        return;
      }
      toast.success("服务记录已提交");
      setPreviewOrder(null);
      navigate("/service-report", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSaving(false);
    }
  }

  function renderReportOrderList(orderList: ServiceOrder[], emptyText: string) {
    return (
      <div className="min-h-[220px] overflow-auto pr-0 sm:max-h-[44vh] sm:pr-1">
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载工单…
          </div>
        ) : orderList.length ? (
          <div className={`${REPORT_ORDER_LIST_WIDTH} space-y-3`}>
            <div className={`${REPORT_ORDER_STICKY_HEADER_CLASS} ${REPORT_ORDER_LIST_GRID}`}>
              <div>工单编号 / 客户</div>
              <div>服务事项</div>
              <div>服务内容</div>
              <div>工程师</div>
              <div>服务时间</div>
              <div>状态</div>
              <div className="text-right">操作</div>
            </div>
            {orderList.map((order) => {
              const mode = normalizeMode(order.serviceMode);
              const modeLabel = MODE_OPTIONS.find((item) => item.value === mode)?.label || mode;
              const itemLabels = serviceItemLabels(order);
              const workflowStatus = order.workflowStatus || order.status || "";
              const canExportRecord = canExportServiceRecord(order);
              const isExportingRecord = exportingOrderId === order.id;
              const canDeleteRecord = canDeleteServiceOrder(order);
              const canCancelRecord = canCancelServiceOrder(order);
              const canRemoveOrCancelRecord = canDeleteRecord || canCancelRecord;
              const isDeletingRecord = deletingOrderId === order.id;
              const destructiveActionLabel = canDeleteRecord ? "删除" : "作废";
              const serviceTime = reportOrderServiceTime(order);
              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`预览 ${reportOrderDisplayId(order)}`}
                  className="cursor-pointer rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary hover:bg-accent/30 sm:py-3 sm:px-4"
                  onClick={() => openPreviewOrder(order)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPreviewOrder(order);
                    }
                  }}
                >
                  <div className={`grid w-full min-w-0 gap-2.5 lg:grid lg:gap-3 ${REPORT_ORDER_LIST_GRID} lg:items-center`}>
                    <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{reportOrderDisplayId(order)}</div>
                        <div className="mt-0.5 block truncate text-sm text-muted-foreground">{order.customerName || "未填写客户"}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
                        <Badge variant={STATUS_BADGE_VARIANT[workflowStatus] || "secondary"}>
                          {orderStatusLabel(order)}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="工单操作"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {isExportingRecord || isDeletingRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => openPreviewOrder(order)}>
                              <FileText className="h-4 w-4" />
                              预览工单
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                if (!canExportRecord || exportingOrderId) return;
                                downloadServiceRecordPdf(order);
                              }}
                              disabled={!canExportRecord || Boolean(exportingOrderId)}
                            >
                              <Download className="h-4 w-4" />
                              导出 PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                if (!canExportRecord || exportingOrderId) return;
                                shareServiceRecordPdf(order);
                              }}
                              disabled={!canExportRecord || Boolean(exportingOrderId)}
                            >
                              <Share2 className="h-4 w-4" />
                              分享 PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                if (!canRemoveOrCancelRecord || deletingOrderId) return;
                                if (canDeleteRecord) {
                                  deleteServiceOrder(order);
                                  return;
                                }
                                cancelServiceOrder(order);
                              }}
                              disabled={!canRemoveOrCancelRecord || Boolean(deletingOrderId)}
                            >
                              {isDeletingRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : canDeleteRecord ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                              {destructiveActionLabel}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={MODE_BADGE_VARIANT[mode] || "secondary"}>{modeLabel}</Badge>
                        {(itemLabels.length ? itemLabels : [serviceItemsLabel(order)]).map((label) => (
                          <Badge key={label} variant={serviceItemBadgeVariant(label, order.serviceType)}>
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{reportOrderMainContent(order)}</span>
                    </div>

                    <div className="hidden min-w-0 text-sm lg:block">
                      <span className="block truncate">{reportOrderEngineerText(order)}</span>
                    </div>

                    <div className="hidden min-w-0 space-y-0.5 whitespace-nowrap text-xs lg:block">
                      <div>
                        <span className="text-muted-foreground">开始：</span>
                        <span>{serviceTime.start}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">结束：</span>
                        <span>{serviceTime.end}</span>
                      </div>
                    </div>

                    <div className="hidden lg:block">
                      <Badge variant={STATUS_BADGE_VARIANT[workflowStatus] || "secondary"}>
                        {orderStatusLabel(order)}
                      </Badge>
                    </div>

                    <div className="hidden min-w-0 flex-wrap gap-1.5 lg:flex lg:flex-nowrap lg:justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 min-w-[68px] bg-slate-50 px-2 text-slate-900 hover:bg-slate-100 hover:text-slate-900 sm:min-w-[78px]"
                            disabled={!canExportRecord || Boolean(exportingOrderId)}
                            aria-label={canExportRecord ? "服务记录 PDF 操作" : "服务记录提交后可导出或分享 PDF"}
                            title={canExportRecord ? "服务记录 PDF 操作" : "服务记录提交后可导出或分享 PDF"}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {isExportingRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            <span>PDF</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!canExportRecord || exportingOrderId) return;
                              downloadServiceRecordPdf(order);
                            }}
                            disabled={!canExportRecord || Boolean(exportingOrderId)}
                          >
                            <Download className="h-4 w-4" />
                            导出 PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!canExportRecord || exportingOrderId) return;
                              shareServiceRecordPdf(order);
                            }}
                            disabled={!canExportRecord || Boolean(exportingOrderId)}
                          >
                            <Share2 className="h-4 w-4" />
                            分享 PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 min-w-[64px] bg-destructive/10 px-2 text-destructive hover:bg-destructive/15 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[72px]"
                        disabled={!canRemoveOrCancelRecord || Boolean(deletingOrderId)}
                        aria-label={canRemoveOrCancelRecord ? `${destructiveActionLabel}工单` : "当前状态不可删除或作废"}
                        title={canRemoveOrCancelRecord ? `${destructiveActionLabel}工单` : "当前状态不可删除或作废"}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canRemoveOrCancelRecord || deletingOrderId) return;
                          if (canDeleteRecord) {
                            deleteServiceOrder(order);
                            return;
                          }
                          cancelServiceOrder(order);
                        }}
                      >
                        {isDeletingRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : canDeleteRecord ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        <span>{destructiveActionLabel}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </div>
    );
  }

  if (!isFormRoute) {
    return (
      <>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-2.5 sm:gap-5 sm:p-6">
          <div className="flex flex-row items-center justify-between gap-3 md:items-end">
            <div className="min-w-0">
              <div className="hidden text-sm text-muted-foreground sm:block">管理工作台 / 工单填写</div>
              <h1 className="truncate text-xl font-semibold tracking-normal text-foreground sm:mt-1 sm:text-2xl">工单填写</h1>
            </div>
            <Button className="h-9 shrink-0 px-3 sm:h-10" variant="outline" onClick={loadHome} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              刷新
            </Button>
          </div>

          <ErrorToast message={error} />
          <InlineError message={error} />

          <div className="grid grid-cols-3 gap-2 md:gap-2.5">
            {MODE_OPTIONS.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => navigate(`/service-report/new?mode=${mode.value}`)}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-2 text-center shadow-sm transition-colors hover:border-primary hover:bg-primary/5 sm:min-h-[112px] sm:items-start sm:justify-start sm:gap-3 sm:p-4 sm:text-left md:flex-row"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-10 sm:w-10">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground sm:hidden">{mode.label}</span>
                    <span className="hidden truncate text-base font-semibold text-foreground sm:block">新建{mode.label}服务记录</span>
                    <span className="mt-1 hidden text-sm leading-5 text-muted-foreground sm:block">{mode.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 lg:gap-4">
            <Card className="overflow-hidden">
              <CardHeader className={`${createDrafts.length ? "border-b" : ""} bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3`}>
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Save className="h-4 w-4" />
                  草稿 ({createDrafts.length})
                </CardTitle>
              </CardHeader>
              {createDrafts.length ? (
                <CardContent className="p-2.5 sm:p-4">
                  <div className="overflow-auto">
                    <div className={`${REPORT_ORDER_LIST_WIDTH} space-y-3`}>
                    <div className={`${REPORT_ORDER_HEADER_CLASS} ${REPORT_ORDER_LIST_GRID}`}>
                      <div>草稿 / 客户</div>
                      <div>服务事项</div>
                      <div>服务内容</div>
                      <div>工程师</div>
                      <div>服务时间</div>
                      <div>状态</div>
                      <div className="text-right">操作</div>
                    </div>
                    {createDrafts.map((draftItem) => {
                      const createDraft = draftItem.payload;
                      const draftMode = normalizeMode(createDraft.serviceMode);
                      const draftModeLabel = MODE_OPTIONS.find((item) => item.value === draftMode)?.label || draftMode;
                      const explicitDraftModules = Array.isArray(createDraft.serviceModules)
                        ? createDraft.serviceModules.filter(isServiceModuleId)
                        : null;
                      const draftHasSelectedModules = draftMode === "office"
                        || (explicitDraftModules ? explicitDraftModules.length > 0 : normalizeServiceModules(createDraft, draftMode).length > 0);
                      const draftItemLabels = draftHasSelectedModules ? serviceItemLabels(createDraft) : ["未选择模块"];
                      const draftRoute = `/service-report/new?mode=${draftMode}&draft=1&draftKey=${encodeURIComponent(draftItem.draftKey)}`;
                      const draftEngineerNames = createDraft.engineerIds?.length
                        ? engineers
                            .filter((engineer) => createDraft.engineerIds.includes(String(engineer.id)))
                            .map(optionLabel)
                            .filter(Boolean)
                        : [];
                      const draftEngineerText = draftEngineerNames.length
                        ? draftEngineerNames.join("、")
                        : user?.realName || user?.username || user?.name || "本人草稿";
                      return (
                        <div
                          key={draftItem.draftKey}
                          role="button"
                          tabIndex={0}
                          aria-label="继续编辑草稿"
                          className="cursor-pointer rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary hover:bg-accent/30 sm:py-3 sm:px-4"
                          onClick={() => navigate(draftRoute)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(draftRoute);
                            }
                          }}
                        >
                          <div className={`grid w-full min-w-0 gap-2.5 lg:grid lg:gap-3 ${REPORT_ORDER_LIST_GRID} lg:items-center`}>
                            <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-foreground">最近草稿</div>
                                <div className="mt-0.5 block truncate text-sm text-muted-foreground">{createDraft.customerName || "未填写客户"}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
                                <Badge variant="draft">草稿</Badge>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 rounded-full bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                                      aria-label="草稿操作"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {deletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                                    <DropdownMenuItem onSelect={() => navigate(draftRoute)}>
                                      <PenLine className="h-4 w-4" />
                                      继续编辑
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => deleteCreateDraft(draftItem.draftKey)}
                                      disabled={deletingDraft}
                                    >
                                      {deletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                      删除草稿
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant={MODE_BADGE_VARIANT[draftMode] || "secondary"}>{draftModeLabel}</Badge>
                                {draftItemLabels.map((label) => (
                                  <Badge
                                    key={label}
                                    variant={draftHasSelectedModules ? serviceItemBadgeVariant(label, createDraft.serviceType) : "outline"}
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <span className="block truncate text-sm font-medium">{compactDraftLabel(createDraft)}</span>
                            </div>

                            <div className="hidden min-w-0 text-sm lg:block">
                              <span className="block truncate">{draftEngineerText}</span>
                            </div>

                            <div className="hidden min-w-0 space-y-0.5 whitespace-nowrap text-xs lg:block">
                              <div>
                                <span className="text-muted-foreground">开始：</span>
                                <span>{formatDateTime(createDraft.actualStartAt || createDraft.departureAt)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">结束：</span>
                                <span>{formatDateTime(createDraft.actualEndAt || createDraft.returnAt)}</span>
                              </div>
                            </div>

                            <div className="hidden lg:block">
                              <Badge variant="draft">草稿</Badge>
                            </div>

                            <div className="hidden min-w-0 flex-wrap gap-1.5 lg:flex lg:flex-nowrap lg:justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 min-w-[64px] bg-slate-50 px-2 text-slate-900 hover:bg-slate-100 hover:text-slate-900 sm:min-w-[72px]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(draftRoute);
                                }}
                              >
                                <PenLine className="h-4 w-4" />
                                <span>继续</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 min-w-[64px] bg-destructive/10 px-2 text-destructive hover:bg-destructive/15 hover:text-destructive sm:min-w-[72px]"
                                disabled={deletingDraft}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteCreateDraft(draftItem.draftKey);
                                }}
                              >
                                {deletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                <span>删除</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </CardContent>
              ) : null}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className={`${loading || dispatchOrders.length ? "border-b" : ""} bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3`}>
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <ClipboardPenLine className="h-4 w-4" />
                  派单待处理 ({dispatchOrders.length})
                </CardTitle>
              </CardHeader>
              {loading || dispatchOrders.length ? (
                <CardContent className="p-2.5 sm:p-4">
                  {renderReportOrderList(dispatchOrders, "暂无派单待处理工单")}
                </CardContent>
              ) : null}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3">
                <CardTitle className="flex w-full items-center justify-between gap-3 text-sm sm:text-base">
                  <span className="flex min-w-0 items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">已填写服务记录 ({filledOrders.length})</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs sm:hidden"
                    onClick={() => setFilledOrdersOpen((open) => !open)}
                    aria-expanded={filledOrdersOpen}
                  >
                    {filledOrdersOpen ? "收起" : "展开"}
                    <ChevronDown className={`h-4 w-4 transition-transform ${filledOrdersOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className={`${filledOrdersOpen ? "block" : "hidden sm:block"} p-2.5 sm:p-4`}>
                {renderReportOrderList(filledOrders, "暂无已填写服务记录")}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={Boolean(previewOrder)} onOpenChange={(open) => {
          if (!open) {
            setPreviewOrder(null);
            setPreviewError("");
            setPreviewLoading(false);
          }
        }}>
          <DialogContent
            className="flex max-h-[92dvh] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:max-w-[900px]"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pt-6">
              <DialogTitle>{previewOrder ? reportOrderDisplayId(previewOrder) : "服务记录预览"}</DialogTitle>
              <DialogDescription>
                {previewOrder ? `${displayText(previewOrder.customerName, "未填写客户")} · ${reportOrderPreviewSummary(previewOrder)}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              {previewOrder ? (() => {
                const mode = normalizeMode(previewOrder.serviceMode);
                const modeLabel = MODE_OPTIONS.find((item) => item.value === mode)?.label || mode;
                const workflowStatus = previewOrder.workflowStatus || previewOrder.status || "";
                const serviceLabels = serviceItemLabels(previewOrder);
                const serviceTime = reportOrderServiceTime(previewOrder);
                const serviceTimeText = serviceTime.start === "-" && serviceTime.end === "-" ? "-" : `${serviceTime.start} 至 ${serviceTime.end}`;
                const installedDeviceRows = previewOrder.installedDevices || [];
                const targetDeviceRows = previewOrder.targetDevices?.length
                  ? previewOrder.targetDevices
                  : previewOrder.deviceName || previewOrder.deviceModel || previewOrder.deviceSerialNo
                    ? [{
                        id: previewOrder.deviceId,
                        name: previewOrder.deviceName,
                        model: previewOrder.deviceModel,
                        pn: previewOrder.devicePn,
                        serialNo: previewOrder.deviceSerialNo,
                        remark: previewOrder.deviceRemark,
                      }]
                    : [];
                const partRows = (previewOrder.parts || []).filter((part) => (
                  [part.deviceName, part.partName || part.part_name, part.partNo || part.part_no, part.quantity, part.unit, part.remark]
                    .some((value) => String(value || "").trim())
                ));
                const fileRows = previewOrder.files || [];
                const workContent = previewOrder.report?.workContent
                  || (previewOrder.report?.workEntries || [])
                    .map((entry) => entry.workContent || entry.work_content || "")
                    .filter(Boolean)
                    .join("\n\n");
                const displayWorkContent = mode === "office"
                  ? workContent
                  : samePreviewText(previewOrder.issueDescription, workContent) ? "" : workContent;
                const resultLabel = previewOrder.report?.result ? optionText(RESULT_OPTIONS, previewOrder.report.result) : "";
                const signatureLabel = mode === "onsite"
                  ? previewOrder.report?.customerSignatureFileId
                    ? "已使用历史签名"
                    : previewOrder.report?.customerSignature
                      ? "已完成现场签名"
                      : previewOrder.customerSignatureRequest
                        ? previewOrder.customerSignatureRequest.signedAt
                          ? "电子签署已完成"
                          : previewOrder.customerSignatureRequest.status === "sent"
                            ? "电子签署已发送"
                            : previewOrder.customerSignatureRequest.status === "created"
                              ? "电子签署待发送"
                              : previewOrder.customerSignatureRequest.status || "电子签署处理中"
                        : ""
                  : mode === "remote" ? "远程服务无需客户手写签名" : "";
                const customerFields = [
                  { label: "客户名称", value: previewOrder.customerName },
                  { label: "客户联系人", value: previewOrder.contactName },
                  { label: "联系电话", value: previewOrder.contactPhone },
                  { label: "客户地址", value: previewOrder.customerAddress, className: "md:col-span-2" },
                  { label: "工程师", value: reportOrderEngineerText(previewOrder) },
                ].filter((field) => hasPreviewValue(field.value));
                const serviceFields = [
                  { label: "服务事项", value: serviceItemsLabel(previewOrder) },
                  { label: "优先级", value: optionText(PRIORITY_OPTIONS, previewOrder.priority) },
                  { label: "状态", value: orderStatusLabel(previewOrder) },
                  { label: "服务时间", value: serviceTimeText },
                  { label: "月报类别", value: previewOrder.timesheetCategory },
                  { label: "销售", value: previewOrder.timesheetSalesperson },
                  { label: "创建时间", value: formatDateTime(previewOrder.createdAt) },
                  { label: "更新时间", value: formatDateTime(previewOrder.updatedAt) },
                  { label: "提交时间", value: formatDateTime(previewOrder.submittedAt) },
                ].filter((field) => hasPreviewValue(field.value) && field.value !== "-");
                const reportFields = [
                  { label: "出发时间", value: formatDateTime(previewOrder.report?.departureAt) },
                  { label: "到达/开始时间", value: formatDateTime(previewOrder.report?.actualStartAt) },
                  { label: "完成/结束时间", value: formatDateTime(previewOrder.report?.actualEndAt) },
                  { label: "返回时间", value: formatDateTime(previewOrder.report?.returnAt) },
                  { label: "处理结果", value: resultLabel },
                  { label: "客户确认人", value: previewOrder.report?.customerConfirmName || previewOrder.report?.customerName },
                  { label: "客户签名", value: signatureLabel },
                  { label: "签署邮箱", value: previewOrder.customerSignatureRequest?.recipientEmail },
                ].filter((field) => hasPreviewValue(field.value) && field.value !== "-");
                return (
                  <div className="space-y-5">
                    {previewLoading ? (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在加载完整工单详情…
                      </div>
                    ) : null}
                    {previewError ? <InlineError message={previewError} /> : null}

                    <div className="flex flex-wrap gap-2">
                      <Badge variant={STATUS_BADGE_VARIANT[workflowStatus] || "secondary"}>{orderStatusLabel(previewOrder)}</Badge>
                      <Badge variant={MODE_BADGE_VARIANT[mode] || "secondary"}>{modeLabel}</Badge>
                      {serviceLabels.length ? serviceLabels.map((label) => (
                        <Badge key={label} variant={TYPE_BADGE_VARIANT[previewOrder.serviceType || ""] || "outline"}>{label}</Badge>
                      )) : null}
                    </div>

                    {customerFields.length ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        {customerFields.map((field) => (
                          <ReportPreviewField key={field.label} label={field.label} value={field.value} className={field.className} />
                        ))}
                      </div>
                    ) : null}

                    {serviceFields.length ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        {serviceFields.map((field) => (
                          <ReportPreviewField key={field.label} label={field.label} value={field.value} />
                        ))}
                      </div>
                    ) : null}

                    <ReportPreviewBlock label={reportIssuePreviewLabel(previewOrder)} value={previewOrder.issueDescription || reportOrderMainContent(previewOrder)} markdown />
                    {displayWorkContent ? <ReportPreviewBlock label={reportWorkContentPreviewLabel(previewOrder)} value={displayWorkContent} markdown /> : null}
                    {previewOrder.report?.resultDescription ? <ReportPreviewBlock label="结果说明" value={previewOrder.report.resultDescription} markdown /> : null}

                    {reportFields.length ? (
                      <div className="grid gap-4 rounded-lg border bg-muted/20 p-3 md:grid-cols-3">
                        {reportFields.map((field) => (
                          <ReportPreviewField key={field.label} label={field.label} value={field.value} />
                        ))}
                      </div>
                    ) : null}

                    {targetDeviceRows.length ? (
                      <div>
                        <div className="mb-2 text-xs text-muted-foreground">目标设备</div>
                        <div className="space-y-2">
                          {targetDeviceRows.map((device, deviceIndex) => {
                            const fields = [
                              { label: "设备名称", value: device.name },
                              { label: "设备型号", value: device.model },
                              { label: "料号 / PN", value: device.pn },
                              { label: "序列号 / SN", value: device.serialNo },
                              { label: "备注", value: device.remark, className: "md:col-span-2" },
                            ].filter((field) => hasPreviewValue(field.value));
                            return (
                              <div key={`${device.id || "target"}-${deviceIndex}`} className="rounded-lg border bg-muted/20 p-3">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">{displayText(device.name || device.model || device.serialNo, `目标设备 ${deviceIndex + 1}`)}</span>
                                  {deviceIndex === 0 ? <Badge variant="outline">主设备</Badge> : null}
                                </div>
                                <div className="grid gap-4 md:grid-cols-3">
                                  {fields.map((field) => (
                                    <ReportPreviewField key={field.label} label={field.label} value={field.value} className={field.className} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {installedDeviceRows.length ? (
                      <div>
                        <div className="mb-2 text-xs text-muted-foreground">安装设备</div>
                        <div className="space-y-2">
                          {installedDeviceRows.map((device, deviceIndex) => {
                            const installedDeviceFields = [
                              { label: "设备名称", value: device.name },
                              { label: "型号 / 版本", value: device.model },
                              { label: "料号 / PN", value: device.pn },
                              { label: "序列号 / SN", value: device.serialNo },
                              { label: "备注", value: device.remark, className: "md:col-span-2" },
                            ].filter((field) => hasPreviewValue(field.value));
                            return (
                              <div key={`${device.id || "installed"}-${deviceIndex}`} className="rounded-lg border bg-muted/20 p-3">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">{displayText(device.name || device.model, `安装设备 ${deviceIndex + 1}`)}</span>
                                  <Badge variant="success">新增设备</Badge>
                                </div>
                                <div className="grid gap-4 md:grid-cols-3">
                                  {installedDeviceFields.map((field) => (
                                    <ReportPreviewField key={field.label} label={field.label} value={field.value} className={field.className} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {partRows.length ? (
                      <div>
                        <div className="mb-2 text-xs text-muted-foreground">备件与硬件部件</div>
                        <div className="space-y-2">
                          {partRows.map((part, partIndex) => {
                            const actionType = part.actionType || part.action_type || "general";
                            const quantityText = [part.quantity, part.unit].filter(Boolean).join(" ");
                            const partFields = [
                              { label: "关联设备", value: part.deviceName },
                              { label: "处理动作", value: optionText(PART_ACTION_OPTIONS, actionType) },
                              { label: "名称", value: part.partName || part.part_name },
                              { label: "编号 / 型号", value: part.partNo || part.part_no },
                              { label: "数量", value: quantityText },
                              { label: "备注", value: part.remark, className: "md:col-span-2" },
                            ].filter((field) => hasPreviewValue(field.value));
                            return (
                              <div key={`${part.deviceId || "part"}-${partIndex}`} className="rounded-lg border bg-muted/20 p-3">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">{displayText(part.partName || part.part_name, `明细 ${partIndex + 1}`)}</span>
                                  <Badge variant={actionType === "installation" ? "success" : actionType === "replacement" ? "warning" : "outline"}>
                                    {optionText(PART_ACTION_OPTIONS, actionType)}
                                  </Badge>
                                </div>
                                <div className="grid gap-4 md:grid-cols-3">
                                  {partFields.map((field) => (
                                    <ReportPreviewField key={field.label} label={field.label} value={field.value} className={field.className} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {fileRows.length ? (
                      <div>
                        <div className="mb-2 text-xs text-muted-foreground">附件</div>
                        <div className="space-y-2">
                          {fileRows.map((file) => (
                            <div key={file.id} className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_150px_100px] md:items-center">
                              <ReportPreviewField label="文件名" value={file.originalName || `文件 #${file.id}`} />
                              <ReportPreviewField
                                label="分类"
                                value={file.purpose && ATTACHMENT_PURPOSES[file.purpose as AttachmentPurpose]
                                  ? attachmentPurposeLabel(file.purpose as AttachmentPurpose)
                                  : "附件"}
                              />
                              <ReportPreviewField label="大小" value={formatFileSize(file.size)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })() : null}
            </div>
            <DialogFooter className="flex-row justify-end gap-2 border-t bg-background px-5 py-4 sm:px-6">
              <Button variant="outline" onClick={() => setPreviewOrder(null)}>关闭</Button>
              <Button
                onClick={() => {
                  if (!previewOrder?.id) return;
                  const orderId = previewOrder.id;
                  setPreviewOrder(null);
                  navigate(`/service-report/${orderId}`);
                }}
                disabled={!previewOrder?.id}
              >
                <PenLine className="h-4 w-4" />
                修改
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
    <div className={`mx-auto flex w-full max-w-[1040px] flex-col gap-3 p-3 sm:gap-4 sm:p-6 ${FORM_SKIN}`}>
      <div className={`sticky top-0 z-20 -mx-3 flex flex-col gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur transition-transform duration-200 md:flex-row md:items-center md:justify-between sm:mx-0 sm:translate-y-0 sm:gap-3 sm:rounded-lg sm:border sm:px-4 sm:py-3 ${formHeaderVisible ? "translate-y-0" : "-translate-y-full"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate("/service-report")} aria-label="返回工单填写列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="hidden text-sm text-muted-foreground sm:block">管理工作台 / 工单填写</div>
            <h1 className="truncate text-base font-semibold tracking-normal text-foreground sm:mt-1 sm:text-xl">
              {id ? `填写服务记录 · ${currentOrder?.orderNo || `工单 #${id}`}` : `新建${MODE_OPTIONS.find((mode) => mode.value === form.serviceMode)?.label || ""}服务记录`}
            </h1>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          {draftSavedAt || editDraftLoaded ? (
            <div className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-muted/30 px-3 text-xs text-muted-foreground sm:h-10 sm:w-auto sm:text-sm">
              {draftSavedAt ? <span className="whitespace-nowrap">草稿 {draftSavedAt}</span> : null}
              {draftSavedAt && editDraftLoaded ? <span className="h-4 w-px shrink-0 bg-border" /> : null}
              {editDraftLoaded ? (
                <>
                  <span className="whitespace-nowrap">已载入草稿</span>
                  <button
                    type="button"
                    className="shrink-0 font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setEditDraftLoaded(false)}
                  >
                    取消
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="hidden items-center gap-2 sm:flex">
            <Button className="h-10" variant="outline" onClick={() => saveDraft(false)} disabled={saving || formLoading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存草稿
            </Button>
            <Button className="h-10" onClick={submit} disabled={saving || formLoading || uploadingFiles}>
              {saving || uploadingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              提交记录
            </Button>
          </div>
        </div>
      </div>

      <ErrorToast message={error} />
      <InlineError message={error} />

      {formLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-card py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载工单信息…
        </div>
      ) : (
        <>
        <div className="space-y-4">
          <ReportSection title="客户信息" icon={User} step={1} tag="客户、地址与联系人">
            <div className="space-y-4 p-3 sm:p-4">
              <div className="rounded-lg border bg-background p-3">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
                  <div className={isOnsite ? "lg:col-span-5" : "md:col-span-2 lg:col-span-12"}>
                    <Field label="客户名称" required={!isOffice}>
                      <div className="relative">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            inputMode="search"
                            className="pl-9"
                            value={form.customerName}
                            placeholder={isOffice ? "内勤记录可留空；如有关联客户也可填写" : "请输入客户名称，可自动匹配系统客户"}
                            autoComplete="off"
                            onFocus={() => setCustomerOptionsOpen(true)}
                            onBlur={() => window.setTimeout(() => setCustomerOptionsOpen(false), 140)}
                            onChange={(event) => changeCustomerName(event.target.value)}
                          />
                        </div>
                        <CustomerInlineSuggestions
                          open={customerOptionsOpen}
                          searching={customerSearching}
                          recentCustomers={matchingRecentCustomers}
                          groups={customerGroups}
                          selectedCustomerId={form.customerId}
                          onSelect={applyCustomer}
                        />
                      </div>
                    </Field>
                  </div>

                  {isOnsite ? (
                    <div className="lg:col-span-7">
                      <Field label="客户地址" required>
                        <div className="flex flex-col gap-2 xl:flex-row">
                          <Input
                            value={form.customerAddress}
                            placeholder="选择客户或地图位置后自动带入，可手动修正"
                            onChange={(event) => changeCustomerAddress(event.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="xl:shrink-0"
                            onClick={searchCustomerGeo}
                            disabled={geoLoading || (!form.customerName.trim() && !form.customerAddress.trim())}
                          >
                            {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                            地图补全
                          </Button>
                        </div>
                      </Field>
                    </div>
                  ) : null}

                  {!isOffice ? (
                    <>
                      <div className="relative lg:col-span-3">
                        <Field label="客户联系人" required>
                          <Input
                            value={form.contactName}
                            placeholder={contactOptions.length ? "请输入或选择客户联系人" : "请输入客户联系人姓名"}
                            onFocus={() => setContactOptionsOpen(Boolean(contactOptions.length))}
                            onBlur={() => window.setTimeout(() => setContactOptionsOpen(false), 140)}
                            onChange={(event) => patchForm({
                              contactName: event.target.value,
                              customerConfirmName: event.target.value,
                              customerSignature: "",
                              customerSignatureFileId: "",
                            })}
                          />
                        </Field>
                        {contactOptionsOpen ? (
                          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md">
                            {contactOptions.map((contact) => (
                              <button
                                key={contact.id || contactKey(contact)}
                                type="button"
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  selectContact(contact);
                                }}
                              >
                                <span className="font-medium">{contact.name || contact.contactName}</span>
                                <span className="text-xs text-muted-foreground">{contact.phone || contact.contactPhone || "未维护电话"}</span>
                              </button>
                            ))}
                            {!contactOptions.length ? <div className="px-3 py-2 text-muted-foreground">暂无客户联系人，可手动补充</div> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="lg:col-span-3">
                        <Field label="客户联系电话" required>
                          <Input value={form.contactPhone} onChange={(event) => patchForm({ contactPhone: event.target.value })} />
                        </Field>
                      </div>
                    </>
                  ) : null}

                  <div className={`space-y-2 md:col-span-2 ${isOffice ? "lg:col-span-12" : "lg:col-span-6"}`}>
                    <Label className="block text-sm font-medium text-foreground">协作工程师</Label>
                    <div className="overflow-hidden rounded-lg border bg-muted/20">
                      <button
                        type="button"
                        className="flex h-[42px] w-full items-center justify-between gap-3 px-3 text-left"
                        onClick={() => setEngineerPanelOpen((open) => !open)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="shrink-0 text-sm text-muted-foreground">已选人员</span>
                          <Badge variant="outline" className="min-w-0 shrink truncate">{engineerSummary}</Badge>
                        </span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${engineerPanelOpen ? "rotate-180" : ""}`} />
                      </button>
                      {engineerPanelOpen ? (
                        <div className="grid max-h-56 gap-2 overflow-y-auto border-t p-3 sm:grid-cols-2 xl:grid-cols-3">
                          {engineers.map((engineer) => {
                            const engineerId = String(engineer.id);
                            const checked = form.engineerIds.includes(engineerId) || engineerId === currentUserId;
                            return (
                              <label
                                key={engineerId}
                                className={`flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                  checked ? "border-primary/60 bg-primary/5 text-primary" : "border-border bg-background hover:border-primary/40"
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={engineerId === currentUserId}
                                  onCheckedChange={(value) => {
                                    const enabled = value === true;
                                    patchForm({
                                      engineerIds: enabled
                                        ? Array.from(new Set([...form.engineerIds, engineerId]))
                                        : form.engineerIds.filter((item) => item !== engineerId),
                                    });
                                  }}
                                />
                                <span className="truncate">{optionLabel(engineer)}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Badge className="justify-center sm:justify-start" variant={form.customerId ? "outline" : "secondary"}>
                      {form.customerId ? "已关联系统" : form.customerName.trim() ? "待建档" : "未选择"}
                    </Badge>
                    {coordinateLabel(form.customerLatitude, form.customerLongitude) ? (
                      <Badge className="justify-center sm:justify-start" variant="outline">
                        <span className="sm:hidden">已定位</span>
                        <span className="hidden sm:inline">已定位 {coordinateLabel(form.customerLatitude, form.customerLongitude)}</span>
                      </Badge>
                    ) : null}
                  </div>
                  {geoHint ? <span className="min-w-0 leading-5 sm:flex-1">{geoHint}</span> : null}
                </div>

                {isOnsite && geoCandidates.length ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {geoCandidates.map((candidate) => (
                      <button
                        key={`${candidate.source || "geo"}-${candidate.id || candidate.name}-${candidate.address || candidate.mapAddress}`}
                        type="button"
                        className="flex min-h-16 items-start gap-2 rounded-lg border bg-muted/10 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                        onClick={() => applyGeoCandidate(candidate)}
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">{candidate.name || "地图位置"}</span>
                            <Badge variant={candidate.source === "customer" ? "secondary" : "outline"}>
                              {candidate.source === "customer" ? "系统客户" : "地图候选"}
                            </Badge>
                          </span>
                          <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{geoCandidateMeta(candidate)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </ReportSection>

          <ReportSection title={isOffice ? "内勤工作事项" : "服务模块"} icon={Clock} step={2} tag={isOffice ? "内勤记录按内部支持登记" : "可选；按需选择对应字段"}>
              <div className="space-y-4 p-3 sm:p-4">
                {!isOffice ? (
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
                    {moduleOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = selectedServiceModules.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`group flex min-h-0 flex-col justify-between rounded-lg border p-3 text-left transition-colors sm:min-h-[128px] ${
                            selected ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-accent/40"
                          }`}
                          onClick={() => toggleServiceModule(option.value)}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground"}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-transparent"}`}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </span>
                          </span>
                          <span className="mt-3 min-w-0">
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{option.description}</span>
                            {option.descriptionItems?.length ? (
                              <span className="mt-2 hidden flex-wrap gap-1 sm:flex">
                                {option.descriptionItems.map((item) => (
                                  <span
                                    key={item}
                                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                                      selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {item}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="grid gap-4">
                  <Field label={issueFieldLabel} required>
                    <Input
                      value={form.issueDescription}
                      placeholder={isOffice ? "简要填写本次内勤工作事项" : "简要填写本次服务需求"}
                      onChange={(event) => patchForm({ issueDescription: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
              </ReportSection>

	              <ReportSection title={isOffice ? "工作内容" : "处理记录"} icon={PenLine} step={workSectionStep} tag="服务时间与处理内容">
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {isOnsite ? (
                  <Field label="出发时间">
                    <DateTimeFieldControl
                      label="出发时间"
                      value={form.departureAt}
                      onChange={(departureAt) => patchForm({ departureAt })}
                    />
                  </Field>
                ) : null}
                <Field label={isOnsite ? "到达时间" : "开始时间"} required>
                  <DateTimeFieldControl
                    label={isOnsite ? "到达时间" : "开始时间"}
                    value={form.actualStartAt}
                    onChange={(actualStartAt) => patchForm({ actualStartAt })}
                  />
                </Field>
                <Field label={isOnsite ? "完成时间" : "结束时间"} required>
                  <DateTimeFieldControl
                    label={isOnsite ? "完成时间" : "结束时间"}
                    value={form.actualEndAt}
                    onChange={(actualEndAt) => patchForm({ actualEndAt })}
                  />
                </Field>
                {isOnsite ? (
                  <Field label="返回时间">
                    <DateTimeFieldControl
                      label="返回时间"
                      value={form.returnAt}
                      onChange={(returnAt) => patchForm({ returnAt })}
                    />
                  </Field>
                ) : null}
                <div className="md:col-span-2">
                  <Field label={workContentLabel} required>
                    <MarkdownTextarea value={form.workContent} onChange={(workContent) => patchForm({ workContent })} rows={6} />
                  </Field>
                </div>
              </div>
              </ReportSection>

            {showAssetSection ? (
              <ReportSection
                title={isInstall ? "安装设备与硬件部件" : isRemote ? "远程目标设备" : showTargetDeviceFields ? "目标设备与备件信息" : "设备与备件信息"}
                icon={Wrench}
                step={assetSectionStep}
                tag={isRemote ? "目标设备与远程信息" : "根据已选模块填写"}
                action={detailCounters.length ? detailCounters.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : null}
              >
                <div className="space-y-4 p-4">
                  <div className="hidden">
                    资产、设备与部件明细
                  </div>
                  {showTargetDeviceFields ? (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{isRemote ? "远程目标设备" : "目标设备"}</div>
                          <div className="text-xs text-muted-foreground">输入设备型号，或选择下拉中的客户已有设备；新设备提交后会加入客户设备档案。</div>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addTargetDeviceRow}>
                          <Plus className="h-4 w-4" />
                          新增设备
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {targetDeviceRows.map((targetDevice, deviceIndex) => {
                          const selectedDevice = targetDevice.deviceId
                            ? selectedCustomerDevices.find((device) => String(device.id) === targetDevice.deviceId) || null
                            : null;
                          const options = targetDeviceOptions(targetDevice);
                          const showModelSuggestions = installModelSuggestionDeviceId === targetDevice.id;
                          const modelSuggestions = showModelSuggestions ? installModelSuggestions : [];
                          const modelLoading = showModelSuggestions ? installModelLoading : false;
                          return (
                            <div key={targetDevice.id} className="space-y-3 rounded-lg border bg-muted/10 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="text-sm font-medium">{targetDeviceTitle(targetDevice, deviceIndex)}</span>
                                  {targetDevice.inputMode === "existing" ? <Badge variant="secondary">已有设备</Badge> : null}
                                </div>
                                {targetDeviceRows.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => removeTargetDeviceRow(targetDevice.id)}
                                  >
                                    <X className="h-4 w-4" />
                                    删除设备
                                  </Button>
                                ) : null}
                              </div>

                              <div className={`grid gap-3 ${targetDevice.inputMode === "existing" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                                <div className="relative space-y-2">
                                  <Label className="block text-sm font-medium text-foreground">{isRemote ? "远程目标设备 / 设备型号" : "目标设备 / 设备型号"}</Label>
                                  <Input
                                    value={targetDeviceValue(targetDevice)}
                                    placeholder="输入设备型号，或选择客户已有设备"
                                    autoComplete="off"
                                    onFocus={() => {
                                      setTargetDeviceOpenId(targetDevice.id);
                                      if (targetDevice.inputMode !== "existing" && targetDevice.model.trim().length >= 2) {
                                        scheduleInstallModelSearch(targetDevice.id, targetDevice.model);
                                      }
                                    }}
                                    onBlur={() => window.setTimeout(() => {
                                      setTargetDeviceOpenId((current) => current === targetDevice.id ? null : current);
                                    }, 160)}
                                    onChange={(event) => changeTargetDevice(targetDevice.id, event.target.value)}
                                  />
                                  {targetDeviceOpenId === targetDevice.id ? (
                                    <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md">
                                      {loadingCustomerDevices ? (
                                        <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          正在加载客户设备…
                                        </div>
                                      ) : null}
                                      {!form.customerId ? (
                                        <div className="px-3 py-2 text-muted-foreground">请先选择客户；未选择下拉项时会按新设备保存。</div>
                                      ) : null}
                                      {options.length ? (
                                        <div className="border-b p-1">
                                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">客户已有设备</div>
                                          {options.map((device) => (
                                            <button
                                              key={device.id}
                                              type="button"
                                              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                                              onMouseDown={(event) => {
                                                event.preventDefault();
                                                chooseTargetDevice(targetDevice.id, String(device.id));
                                              }}
                                            >
                                              <span className="font-medium">{deviceSelectLabel(device)}</span>
                                              <span className="text-xs text-muted-foreground">{deviceMeta(device) || "客户已有设备"}</span>
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      {modelLoading || modelSuggestions.length ? (
                                        <div className="p-1">
                                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">型号库建议</div>
                                          {modelLoading ? (
                                            <div className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                              搜索型号中…
                                            </div>
                                          ) : null}
                                          {modelSuggestions.map((suggestion, suggestionIndex) => (
                                            <button
                                              key={`${suggestion.canonicalModel}-${suggestion.partNumber}-${suggestionIndex}`}
                                              type="button"
                                              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                                              onMouseDown={(event) => {
                                                event.preventDefault();
                                                applyTargetModelSuggestion(targetDevice.id, suggestion);
                                              }}
                                            >
                                              <span className="font-medium">{suggestion.canonicalModel}</span>
                                              <span className="text-xs text-muted-foreground">
                                                {[suggestion.brand, suggestion.partNumber, suggestion.category].filter(Boolean).join(" · ") || "标准型号"}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      {form.customerId && !loadingCustomerDevices && !options.length && !modelLoading && !modelSuggestions.length ? (
                                        <div className="px-3 py-2 text-muted-foreground">没有匹配的客户设备，继续输入会按新设备保存。</div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>

                                {targetDevice.inputMode === "existing" ? (
                                  <>
                                    <Field label="设备型号">
                                      <Input readOnly value={selectedDevice?.model || targetDevice.model || ""} />
                                    </Field>
                                    <Field label="序列号 / SN">
                                      <Input readOnly value={selectedDevice?.serialNo || targetDevice.serialNo || ""} />
                                    </Field>
                                  </>
                                ) : (
                                  <>
                                    <Field label="序列号 / SN" required>
                                      <Input value={targetDevice.serialNo} onChange={(event) => updateTargetDevice(targetDevice.id, { serialNo: event.target.value })} />
                                    </Field>
                                    <div className="md:col-span-2">
                                      <Field label="备注">
                                        <Textarea
                                          rows={3}
                                          value={targetDevice.remark}
                                          placeholder="可填写设备具体配置、维护对象说明、IP、版本或位置"
                                          onChange={(event) => updateTargetDevice(targetDevice.id, { remark: event.target.value })}
                                        />
                                      </Field>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

	                  {isInstall ? (
	                    <div className="space-y-4 rounded-lg border p-3">
	                      <div className="flex flex-wrap items-start justify-between gap-3">
	                        <div>
	                          <div className="text-sm font-medium">安装设备</div>
	                          <div className="text-xs text-muted-foreground">输入新型号会按新设备或非维保设备保存；选择下拉中的客户设备会把新配件挂到该设备详情。</div>
	                        </div>
	                        <Button type="button" variant="outline" size="sm" onClick={addInstallDevice}>
	                          <Plus className="h-4 w-4" />
	                          增加安装设备
	                        </Button>
	                      </div>

	                      <div className="space-y-3">
		                        {installDeviceRows.map((installDevice, deviceIndex) => {
		                          const selectedDevice = installDevice.deviceId
		                            ? selectedCustomerDevices.find((device) => String(device.id) === installDevice.deviceId) || null
		                            : null;
		                          const targetOptions = installTargetOptions(installDevice);
	                          const showModelSuggestions = installModelSuggestionDeviceId === installDevice.id;
	                          const modelSuggestions = showModelSuggestions ? installModelSuggestions : [];
	                          const modelLoading = showModelSuggestions ? installModelLoading : false;
		                          const devicePartEntries = installationPartEntries.filter(({ part }) => (
		                            part.installDeviceDraftId ? part.installDeviceDraftId === installDevice.id : deviceIndex === 0
		                          ));
		                          return (
	                            <div key={installDevice.id} className="space-y-3 rounded-lg border bg-muted/10 p-3">
		                              <div className="flex flex-wrap items-center justify-between gap-2">
		                                <div className="flex min-w-0 items-center gap-2">
		                                  <span className="text-sm font-medium">{installDeviceTitle(installDevice, deviceIndex)}</span>
		                                  {installDevice.inputMode === "existing" ? <Badge variant="secondary">已有设备</Badge> : null}
		                                </div>
	                                {installDeviceRows.length > 1 ? (
	                                  <Button
	                                    type="button"
	                                    variant="ghost"
	                                    size="sm"
	                                    className="h-8"
	                                    onClick={() => removeInstallDevice(installDevice.id)}
	                                  >
	                                    <X className="h-4 w-4" />
	                                    删除设备
	                                  </Button>
	                                ) : null}
	                              </div>

		                              <div className={`grid gap-3 ${installDevice.inputMode === "existing" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
	                                <div className="relative space-y-2">
	                                  <Label className="block text-sm font-medium text-foreground">安装目标设备 / 设备型号</Label>
		                                  <Input
		                                    value={installTargetValue(installDevice)}
		                                    placeholder="输入设备型号，或选择客户已有设备"
		                                    autoComplete="off"
		                                    onFocus={() => {
		                                      setInstallTargetOpenId(installDevice.id);
		                                      if (installDevice.inputMode !== "existing" && installDevice.model.trim().length >= 2) {
		                                        scheduleInstallModelSearch(installDevice.id, installDevice.model);
		                                      }
		                                    }}
		                                    onBlur={() => window.setTimeout(() => {
		                                      setInstallTargetOpenId((current) => current === installDevice.id ? null : current);
		                                    }, 160)}
	                                    onChange={(event) => changeInstallTarget(installDevice.id, event.target.value)}
	                                  />
	                                  {installTargetOpenId === installDevice.id ? (
	                                    <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md">
	                                      {loadingCustomerDevices ? (
	                                        <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
	                                          <Loader2 className="h-4 w-4 animate-spin" />
	                                          正在加载客户设备…
	                                        </div>
	                                      ) : null}
		                                      {!form.customerId ? (
		                                        <div className="px-3 py-2 text-muted-foreground">请先选择客户；未选择下拉项时会按新设备或非维保设备保存。</div>
		                                      ) : null}
		                                      {targetOptions.length ? (
		                                        <div className="border-b p-1">
		                                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">客户已有设备</div>
		                                          {targetOptions.map((device) => (
		                                            <button
		                                              key={device.id}
		                                              type="button"
		                                              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
		                                              onMouseDown={(event) => {
		                                                event.preventDefault();
		                                                chooseInstallDevice(installDevice.id, String(device.id));
		                                              }}
		                                            >
		                                              <span className="font-medium">{deviceSelectLabel(device)}</span>
		                                              <span className="text-xs text-muted-foreground">{deviceMeta(device) || "客户已有设备"}</span>
		                                            </button>
		                                          ))}
		                                        </div>
		                                      ) : null}
		                                      {modelLoading || modelSuggestions.length ? (
		                                        <div className="p-1">
		                                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">型号库建议</div>
		                                          {modelLoading ? (
		                                            <div className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
		                                              <Loader2 className="h-4 w-4 animate-spin" />
		                                              搜索型号中…
		                                            </div>
		                                          ) : null}
		                                          {modelSuggestions.map((suggestion, suggestionIndex) => (
		                                            <button
		                                              key={`${suggestion.canonicalModel}-${suggestion.partNumber}-${suggestionIndex}`}
		                                              type="button"
		                                              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
		                                              onMouseDown={(event) => {
		                                                event.preventDefault();
		                                                applyInstallModelSuggestion(installDevice.id, suggestion);
		                                              }}
		                                            >
		                                              <span className="font-medium">{suggestion.canonicalModel}</span>
		                                              <span className="text-xs text-muted-foreground">
		                                                {[suggestion.brand, suggestion.partNumber, suggestion.category].filter(Boolean).join(" · ") || "标准型号"}
		                                              </span>
		                                            </button>
		                                          ))}
		                                        </div>
		                                      ) : null}
		                                      {form.customerId && !loadingCustomerDevices && !targetOptions.length && !modelLoading && !modelSuggestions.length ? (
		                                        <div className="px-3 py-2 text-muted-foreground">没有匹配的客户设备，继续输入会按新设备或非维保设备保存。</div>
		                                      ) : null}
		                                    </div>
		                                  ) : null}
		                                </div>

		                                {installDevice.inputMode === "existing" ? (
		                                  <>
		                                    <Field label="设备型号">
		                                      <Input readOnly value={selectedDevice?.model || installDevice.model || ""} />
		                                    </Field>
		                                    <Field label="序列号 / SN">
		                                      <Input readOnly value={selectedDevice?.serialNo || installDevice.serialNo || ""} />
		                                    </Field>
		                                  </>
		                                ) : (
	                                  <Field label="序列号 / SN">
	                                    <Input value={installDevice.serialNo} onChange={(event) => updateInstallDevice(installDevice.id, { serialNo: event.target.value })} />
	                                  </Field>
	                                )}

	                                {installDevice.inputMode === "manual" ? (
	                                  <div className="md:col-span-2">
	                                    <Field label="备注">
	                                      <Textarea
	                                        rows={3}
	                                        value={installDevice.remark}
	                                        placeholder="可填写设备具体配置，或说明非维保设备情况"
	                                        onChange={(event) => updateInstallDevice(installDevice.id, { remark: event.target.value })}
	                                      />
	                                    </Field>
	                                  </div>
	                                ) : null}
	                              </div>

	                              <div className="space-y-3 rounded-md border bg-background p-3">
	                                <div className="flex flex-wrap items-center justify-between gap-2">
	                                  <div>
	                                    <div className="text-sm font-medium">新配件</div>
	                                    <div className="text-xs text-muted-foreground">如果本次是给这台设备加装配件，在这里记录配件明细。</div>
	                                  </div>
	                                  <Button type="button" variant="outline" size="sm" onClick={() => addInstallationPart(installDevice.id)}>
	                                    <Plus className="h-4 w-4" />
	                                    新增配件
	                                  </Button>
	                                </div>
	                                {devicePartEntries.length ? (
	                                  <div className="space-y-3">
	                                    {devicePartEntries.map(({ part, index }, entryIndex) => (
	                                      <div key={`install-part-${index}`} className="rounded-md border bg-muted/10 p-3">
	                                        <div className="mb-3 flex items-center justify-between gap-2">
	                                          <span className="text-sm font-medium">新配件 {entryIndex + 1}</span>
	                                          <Button type="button" variant="ghost" size="icon" onClick={() => removePart(index)} aria-label="删除新配件">
	                                            <X className="h-4 w-4" />
	                                          </Button>
	                                        </div>
	                                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px]">
	                                          <Field label="名称" required>
	                                            <Input value={part.partName} onChange={(event) => updatePart(index, { partName: event.target.value })} />
	                                          </Field>
	                                          <Field label="编号（或型号）">
	                                            {renderModelCatalogSuggestionInput({
	                                              inputId: `install-part-${index}-part-no`,
	                                              value: part.partNo,
	                                              valueMode: "partNo",
	                                              placeholder: "输入编号、PN 或型号",
	                                              onChange: (partNo) => updatePart(index, { partNo }),
	                                            })}
	                                          </Field>
	                                          <Field label="数量" required>
	                                            <Input value={part.quantity} onChange={(event) => updatePart(index, { quantity: event.target.value })} />
	                                          </Field>
	                                          <div className="md:col-span-3">
	                                            <Field label="备注">
	                                              <Textarea
	                                                rows={3}
	                                                value={part.remark}
	                                                placeholder="可填写安装位置、插槽"
	                                                onChange={(event) => updatePart(index, { remark: event.target.value })}
	                                              />
	                                            </Field>
	                                          </div>
	                                        </div>
	                                      </div>
	                                    ))}
	                                  </div>
	                                ) : (
	                                  <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">暂无新配件记录</div>
	                                )}
	                              </div>
	                            </div>
	                          );
	                        })}
	                      </div>
	                    </div>
	                  ) : null}

                  {showPartsModule ? (
                    <div className="space-y-3 rounded-lg border p-3">
	                      <div className="flex flex-wrap items-center justify-between gap-2">
	                        <div>
		                          <div className="text-sm font-medium">{partsModuleTitle}</div>
		                          <div className="text-xs text-muted-foreground">{partsModuleDescription}</div>
	                        </div>
	                        <div className="flex flex-wrap gap-2">
	                          {hasReplacementModule ? (
	                            <Button type="button" variant="outline" size="sm" onClick={() => addPartAction("replacement")}>
	                              <Plus className="h-4 w-4" />
	                              新增备件
	                            </Button>
	                          ) : null}
	                          {hasHardwareInstallDetails && !showInlineInstallParts ? (
	                            <Button type="button" variant="outline" size="sm" onClick={() => addPartAction("installation")}>
	                              <Plus className="h-4 w-4" />
	                              新增硬件部件
	                            </Button>
	                          ) : null}
	                        </div>
	                      </div>
                      {visiblePartEntries.length ? (
                        <div className="overflow-visible rounded-md border">
                          <div className="hidden border-b bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid md:grid-cols-[minmax(150px,1fr)_120px_minmax(0,1fr)_minmax(0,1fr)_90px_80px_40px] md:gap-3">
                            <div>关联设备</div>
	                            <div>处理动作</div>
                            <div>备件或硬件部件名称</div>
                            <div>料号 / PN</div>
                            <div>数量</div>
                            <div>单位</div>
                            <div />
                          </div>
                          {visiblePartEntries.map(({ part, index }) => (
                            <div key={index} className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[minmax(150px,1fr)_120px_minmax(0,1fr)_minmax(0,1fr)_90px_80px_40px] md:items-center">
                              <DenseField label="关联设备">
                                <Select value={part.deviceId || "none"} onValueChange={(value) => choosePartDevice(index, value)} disabled={loadingCustomerDevices}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">
                                      {loadingCustomerDevices
                                        ? "正在加载设备…"
                                        : !form.customerId
                                          ? "请先选择客户"
                                          : selectedCustomerDevices.length
                                            ? "请选择设备"
                                            : "该客户暂无设备"}
                                    </SelectItem>
                                    {selectedCustomerDevices.map((device) => (
                                      <SelectItem key={device.id} value={String(device.id)}>{deviceSelectLabel(device)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </DenseField>
	                              <DenseField label="处理动作">
                                <Select value={part.actionType} onValueChange={(value) => updatePart(index, { actionType: value })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {PART_ACTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </DenseField>
                              <DenseField label="备件或硬件部件名称">
                                <Input value={part.partName} onChange={(event) => updatePart(index, { partName: event.target.value })} />
                              </DenseField>
	                              <DenseField label="料号 / PN">
	                                {renderModelCatalogSuggestionInput({
	                                  inputId: `service-part-${index}-part-no`,
	                                  value: part.partNo,
	                                  valueMode: "partNo",
	                                  placeholder: "输入料号、PN 或型号",
	                                  onChange: (partNo) => updatePart(index, { partNo }),
	                                })}
	                              </DenseField>
                              <DenseField label="数量">
                                <Input value={part.quantity} onChange={(event) => updatePart(index, { quantity: event.target.value })} />
                              </DenseField>
                              <DenseField label="单位">
                                <Input value={part.unit} onChange={(event) => updatePart(index, { unit: event.target.value })} />
                              </DenseField>
                              <Button type="button" variant="ghost" size="icon" className="self-end md:self-center" onClick={() => removePart(index)} aria-label="删除部件明细">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
	                        <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">暂无备件或硬件部件记录</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </ReportSection>
            ) : null}

            {shouldShowAttachments ? (
            <ReportSection title="附件与支持信息" icon={Upload} step={attachmentSectionStep} tag="配置文件、现场照片、截图与日志">
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                {visibleAttachmentPurposes.map((purpose) => {
                  const meta = ATTACHMENT_PURPOSES[purpose];
                  const Icon = meta.icon;
                  const existingFiles = existingFilesForPurpose(purpose);
                  const localFiles = localFilesForPurpose(purpose);
                  const required = false;
                  const dragging = draggingAttachmentPurpose === purpose;
                  return (
                    <div
                      key={purpose}
                      className={`rounded-lg border bg-background p-3 transition-colors ${
                        dragging ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "border-border"
                      }`}
                      onDragEnter={(event) => dragAttachmentFiles(event, purpose)}
                      onDragOver={(event) => dragAttachmentFiles(event, purpose)}
                      onDragLeave={(event) => leaveAttachmentDropZone(event, purpose)}
                      onDrop={(event) => dropAttachmentFiles(event, purpose)}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {meta.label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {existingFiles.length + localFiles.length ? `${existingFiles.length + localFiles.length} 个文件` : "未上传"}
                            </div>
                          </div>
                        </div>
                        <Label className="shrink-0">
                          <span className="inline-flex h-[42px] cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent">
                            <Upload className="h-4 w-4" />
                            上传文件
                          </span>
                          <Input
                            type="file"
                            multiple
                            accept={INSPECTION_DOCUMENT_ACCEPT}
                            className="hidden"
                            onChange={(event) => {
                              void selectAttachmentFiles(purpose, Array.from(event.target.files || []), true);
                              event.currentTarget.value = "";
                            }}
                          />
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <div
                          className={`hidden min-h-20 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-4 text-center text-xs transition-colors md:flex ${
                            dragging ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          <Upload className="mb-2 h-5 w-5" />
                          <span className="font-medium">{dragging ? "松开鼠标上传到此分类" : "拖拽文件到这里上传"}</span>
                          <span className="mt-1">支持 PDF、Office、图片、日志文本与 ZIP，图片会自动压缩，单个文件不超过 20MB</span>
                        </div>
                        {existingFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left hover:text-primary"
                              disabled={downloadingFileId === file.id}
                              onClick={() => downloadInspectionDocument(file)}
                            >
                              <span className="block truncate font-medium">{file.originalName || `文件 #${file.id}`}</span>
                              <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                            </button>
                            <Button type="button" variant="outline" size="sm" disabled={downloadingFileId === file.id} onClick={() => downloadInspectionDocument(file)}>
                              {downloadingFileId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              下载
                            </Button>
                          </div>
                        ))}
                        {localFiles.map((file) => (
                          <div key={`${purpose}-${file.name}-${file.size}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{file.name}</span>
                              <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                            </span>
                            <Badge variant="warning">待提交</Badge>
                          </div>
                        ))}
                        {!existingFiles.length && !localFiles.length ? (
                          <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
                            暂无{attachmentPurposeLabel(purpose)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
            ) : null}

            {!isOffice ? (
              <ReportSection title="完工确认" icon={CheckCircle} step={signoffSectionStep} tag={isOnsite ? "客户确认与签名" : "处理结果"}>
                <div className="grid gap-4 p-4 md:grid-cols-2">
	                  <Field label={isOnsite ? "服务结果" : "处理结果"} required>
                    <Select value={form.result || "resolved"} onValueChange={(value) => patchForm({ result: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESULT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {isOnsite ? (
                    <>
                      <div className="space-y-3 md:col-span-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            className={`flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${form.customerSignatureMode === "onsite" ? "border-primary bg-primary/10 text-primary" : "bg-background hover:border-primary/40"}`}
                            onClick={() => patchForm({ customerSignatureMode: "onsite" })}
                          >
                            <PenLine className="h-4 w-4 shrink-0" />
                            <span>
	                              <span className="block text-sm font-semibold">现场手写签名</span>
	                              <span className="block text-xs text-muted-foreground">客户在工程师设备上完成手写确认</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${form.customerSignatureMode === "electronic" ? "border-primary bg-primary/10 text-primary" : "bg-background hover:border-primary/40"}`}
                            onClick={() => patchForm({ customerSignatureMode: "electronic", customerSignature: "", customerSignatureFileId: "" })}
                          >
                            <Share2 className="h-4 w-4 shrink-0" />
                            <span>
	                              <span className="block text-sm font-semibold">电子签署确认函</span>
	                              <span className="block text-xs text-muted-foreground">提交后生成签署链接及二维码，可通过系统分享或邮件发送</span>
                            </span>
                          </button>
                        </div>
                        {electronicSignatureSelected ? (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
	                            适用于客户不在现场或无法现场签名的情况。提交后服务记录将进入待客户签署状态，并显示签署链接分享面板。
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-end gap-2">
                            <Button type="button" variant="outline" onClick={useLatestCustomerSignature} disabled={loadingLatestSignature}>
                              {loadingLatestSignature ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
	                              使用最近签名
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => patchForm({ customerSignature: "", customerSignatureFileId: "" })}
                              disabled={!form.customerSignature && !form.customerSignatureFileId}
                            >
                              <Trash2 className="h-4 w-4" />
	                              清除签名
                            </Button>
                            {form.customerSignatureFileId ? (
                              <Badge variant="success">
                                <CheckCircle className="h-3 w-3" />
	                                已使用历史签名
                              </Badge>
                            ) : null}
                          </div>
                        )}
                      </div>
                      {!electronicSignatureSelected ? (
                        <div className="md:col-span-2">
	                        <Field label="客户现场签名" required>
                          <div className="space-y-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full sm:hidden"
                              onClick={() => setSignatureFullscreenOpen(true)}
                            >
                              横屏全屏签名
                            </Button>
                            <SignaturePad value={form.customerSignature} onChange={(value) => patchForm({ customerSignature: value, customerSignatureFileId: "" })} />
                          </div>
                        </Field>
                      </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex items-end">
	                      <Badge variant="outline">远程服务无需客户手写签名</Badge>
                    </div>
                  )}
                </div>
              </ReportSection>
            ) : null}
            <div className="sticky bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 -mx-3 flex gap-2 border-t bg-background/95 px-3 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.10)] backdrop-blur sm:mx-0 sm:rounded-lg sm:border lg:bottom-0 lg:justify-end">
              <Button className="h-10 flex-1 lg:flex-none" variant="outline" onClick={() => saveDraft(false)} disabled={saving || formLoading}>
                <Save className="h-4 w-4" />
                <span className="sm:hidden">保存</span>
                <span className="hidden sm:inline">保存草稿</span>
              </Button>
              <Button
                className="h-10 flex-1 lg:flex-none"
                onClick={submit}
                disabled={saving || formLoading || uploadingFiles}
                aria-label={electronicSignatureSelected && !form.customerSignature && !form.customerSignatureFileId ? "提交并生成签署链接" : "提交服务记录"}
              >
                {saving || uploadingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                <span className="sm:hidden">提交</span>
	                <span className="hidden sm:inline">{electronicSignatureSelected && !form.customerSignature && !form.customerSignatureFileId ? "提交并生成签署链接" : "提交服务记录"}</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
    <FullscreenSignatureDialog
      open={signatureFullscreenOpen}
      value={form.customerSignature}
      onOpenChange={setSignatureFullscreenOpen}
      onChange={(value) => patchForm({ customerSignature: value, customerSignatureFileId: "" })}
    />
    <Dialog open={signatureShareOpen} onOpenChange={setSignatureShareOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
	          <DialogTitle>发送电子签署确认函</DialogTitle>
          <DialogDescription>
	            客户可通过链接或二维码打开确认函，查看服务内容后完成手写签署。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">签署链接</div>
	            <div className="break-all text-sm font-medium text-foreground">{signatureRequestUrl || "正在生成链接…"}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="grid h-[220px] w-[220px] place-items-center justify-self-center rounded-lg border bg-background">
              {signatureQrCodeUrl ? (
	                <img className="h-[204px] w-[204px]" src={signatureQrCodeUrl} alt="电子签署二维码" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <QrCode className="h-6 w-6" />
	                  正在生成二维码…
                </div>
              )}
            </div>
            <div className="grid content-start gap-3">
              <Field label="客户邮箱（可选）">
                <Input
                  type="email"
                  value={signatureRecipientEmail}
                  placeholder="customer@example.com"
                  onChange={(event) => setSignatureRecipientEmail(event.target.value)}
                />
              </Field>
              <Button type="button" onClick={sendSignatureRequestMail} disabled={signatureRequestLoading}>
                {signatureRequestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送邮件
              </Button>
              <Button type="button" variant="outline" onClick={nativeShareSignatureRequest} disabled={!signatureRequestUrl}>
                <Share2 className="h-4 w-4" />
                系统分享
              </Button>
              <Button type="button" variant="outline" onClick={copySignatureRequestLink} disabled={!signatureRequestUrl}>
                <Copy className="h-4 w-4" />
                复制链接
              </Button>
            </div>
          </div>
          {signatureShareNotice ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              {signatureShareNotice}
            </div>
          ) : null}
          {signatureShareError ? <InlineError message={signatureShareError} /> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/service-report", { replace: true })}>
	            返回工单列表
          </Button>
          <Button type="button" onClick={() => setSignatureShareOpen(false)}>
	            留在当前页面
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
