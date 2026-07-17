import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Search, Plus, RefreshCw, Server, Loader2, Trash2, Check, Pencil, RotateCcw, Edit3, Download, Upload, MoreHorizontal, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorToast } from "@/components/ErrorToast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { matchesSearchText, normalizeSearchText } from "@/lib/text-i18n";
import { toast } from "sonner";

interface Device {
  id: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  mrNo?: string;
  customerId?: string | number;
  customerName?: string;
  maintenanceType?: string;
  maintenancePartyId?: string | number;
  maintenancePartyName?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  status?: string;
  location?: string;
  remark?: string;
  warrantyUntil?: string;
  createdAt?: string;
  updatedAt?: string;
  relatedServiceOrders?: DeviceRelatedServiceOrder[];
  partHistory?: DevicePartHistory[];
}

interface DeviceRelatedServiceOrder {
  id: string | number;
  orderNo?: string;
  status?: string;
  serviceMode?: string;
  serviceType?: string;
  relationType?: string;
  issueDescription?: string;
  engineerName?: string;
  serviceAt?: string;
  createdAt?: string;
}

interface DevicePartHistory {
  id: string | number;
  serviceOrderId?: string | number;
  orderNo?: string;
  serviceMode?: string;
  serviceType?: string;
  actionType?: string;
  partName?: string;
  partNo?: string;
  quantity?: string | number;
  unit?: string;
  remark?: string;
  issueDescription?: string;
  workContent?: string;
  engineerName?: string;
  serviceAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Customer {
  id: string | number;
  name?: string;
  code?: string;
  address?: string;
  mapAddress?: string;
  contactName?: string;
  contactPhone?: string;
  sortInitial?: string;
  sortKey?: string;
}

interface MaintenanceParty {
  id: string | number;
  name?: string;
  partyType?: string;
}

interface ModelSuggestion {
  canonicalModel?: string;
  partNumber?: string;
  brand?: string;
  category?: string;
}

type ModelSuggestionTarget =
  | { type: "form" }
  | { type: "batch"; index: number };

const IMPORT_TEMPLATE_MAX_ROWS = 1000;
const IMPORT_TEMPLATE_OPTIONS_SHEET = "_import_options";
const IMPORT_TEMPLATE_MAINTENANCE_TYPES = ["待确认", "无维保", "原厂维保", "我方维保"];

type ExcelWorkbook = import("exceljs").Workbook;
type ExcelWorksheet = import("exceljs").Worksheet;

interface DeviceForm {
  customerId: string;
  name: string;
  model: string;
  pn: string;
  serialNo: string;
  mrNo: string;
  maintenanceType: string;
  maintenancePartyId: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  location: string;
  status: string;
  remark: string;
}

interface BatchDeviceRow {
  name: string;
  model: string;
  serialNo: string;
  mrNo: string;
}

interface ImportErrorRow {
  rowNumber: number;
  sn?: string;
  message?: string;
}

interface ImportModelCorrection {
  rowNumber: number;
  sn?: string;
  inputModel?: string;
  canonicalModel?: string;
  matchType?: string;
  brand?: string;
  category?: string;
  partNumber?: string;
}

interface ImportCustomerCorrection {
  rowNumber: number;
  sn?: string;
  inputCustomerName?: string;
  customerId?: string | number;
  customerName?: string;
  matchType?: string;
}

interface ImportResult {
  created: number;
  failed: number;
  errors: ImportErrorRow[];
  requiresImportConfirmation?: boolean;
  requiresModelConfirmation?: boolean;
  customerCorrections?: ImportCustomerCorrection[];
  modelCorrections?: ImportModelCorrection[];
}

interface MaintenanceImportColumn {
  index: number;
  letter: string;
  header?: string;
  label: string;
}

interface MaintenanceImportItem {
  rowNumber: number;
  deviceId?: string | number;
  serialNo?: string;
  customerName?: string;
  model?: string;
  currentMaintenanceStart?: string;
  currentMaintenanceEnd?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  status: "updatable" | "unchanged" | "not_found" | "conflict" | "invalid" | "duplicate";
  message?: string;
}

interface MaintenanceImportPreview {
  sheetName: string;
  columns: {
    serialNo: number;
    maintenanceStart: number;
    maintenanceEnd: number;
  };
  detected: {
    serialNoMatches: number;
    serialNoRatio: number;
    dateCompleteRows: number;
    dateCoverage: number;
    dateOrderRatio: number;
  };
  columnOptions: MaintenanceImportColumn[];
  requiresColumnConfirmation: boolean;
  summary: {
    total: number;
    updatable: number;
    unchanged: number;
    notFound: number;
    conflicts: number;
    invalid: number;
  };
  items: MaintenanceImportItem[];
}

const MAINTENANCE_IMPORT_STATUS_LABELS: Record<MaintenanceImportItem["status"], string> = {
  updatable: "可更新",
  unchanged: "无变化",
  not_found: "未找到",
  conflict: "类型冲突",
  invalid: "数据异常",
  duplicate: "SN 重复",
};

interface ModelNormalizationResult {
  action?: string;
  canonicalModel?: string;
  message?: string;
}

interface ModelNormalizationNotice {
  action: string;
  message: string;
}

interface ModelNormalizationJob {
  id?: string;
  status?: string;
  deviceId?: string | number;
  inputModel?: string;
  canonicalModel?: string;
  updated?: boolean;
  modelNormalization?: ModelNormalizationResult | null;
  message?: string;
  error?: string;
}

interface ExistingModelNormalizationItem {
  id: string | number;
  customerName?: string;
  name?: string;
  serialNo?: string;
  inputModel?: string;
  canonicalModel?: string;
  action?: string;
  source?: string;
  matchType?: string;
  message?: string;
  canApply?: boolean;
}

interface ExistingModelNormalizationResult {
  scanned: number;
  matched: number;
  issueCount: number;
  correctableCount: number;
  unresolvedCount: number;
  catalogCreatedCount: number;
  items: ExistingModelNormalizationItem[];
}

interface DeviceDeleteRelationOrder {
  id: string | number;
  orderNo?: string;
  status?: string;
  customerName?: string;
}

interface DeviceDeleteRelationSchedule {
  id: string | number;
  name?: string;
  customerName?: string;
}

interface DeviceDeleteRelationPart {
  id: string | number;
  orderId?: string | number;
  orderNo?: string;
  partName?: string;
  partNo?: string;
}

interface DeviceDeleteBlockedDetails {
  code?: string;
  canForceDelete?: boolean;
  message?: string;
  device?: {
    id?: string | number;
    name?: string;
    model?: string;
    serialNo?: string;
    customerName?: string;
  };
  relations?: {
    mainServiceOrders?: DeviceDeleteRelationOrder[];
    targetServiceOrders?: DeviceDeleteRelationOrder[];
    inspectionSchedules?: DeviceDeleteRelationSchedule[];
    serviceParts?: DeviceDeleteRelationPart[];
  };
}

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  pending_confirmation: "待确认",
  none: "无维保",
  vendor: "原厂维保",
  our: "我方维保",
  original_manufacturer: "原厂维保",
  our_maintenance: "我方维保",
};

const MAINTENANCE_TYPE_BADGE: Record<string, "default" | "secondary" | "info" | "purple"> = {
  pending_confirmation: "default",
  none: "secondary",
  vendor: "info",
  our: "purple",
  original_manufacturer: "info",
  our_maintenance: "purple",
};

const MAINTENANCE_TYPE_HELP = "待确认表示销售仍需确认是否纳入维保，会触发维保资料提醒；无维保表示明确不纳入维保，不会触发维保资料提醒；我方维保和原厂维保需填写维保截止日期。";

const MAINTENANCE_TYPE_ALIASES: Record<string, string> = {
  vendor: "original_manufacturer",
  our: "our_maintenance",
};

const DEVICE_STATUS_LABELS: Record<string, string> = {
  active: "在用",
  inactive: "停用",
  maintenance: "维保中",
  scrapped: "已报废",
};

const DEVICE_STATUS_BADGE: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  maintenance: "warning",
  scrapped: "destructive",
};

const DEVICE_TABLE_GRID = "md:grid-cols-[32px_28px_minmax(220px,1.2fr)_minmax(190px,1fr)_92px_118px_minmax(180px,0.95fr)_86px_156px]";
const DEVICE_TABLE_READONLY_GRID = "md:grid-cols-[28px_minmax(240px,1.2fr)_minmax(200px,1fr)_92px_118px_minmax(200px,1fr)_86px]";
const DEVICE_BADGE_CLASS = "inline-flex h-6 min-w-[74px] justify-center px-2";
const DEVICE_STATUS_BADGE_CLASS = "inline-flex h-6 min-w-[56px] justify-center px-2";

function createEmptyDeviceForm(overrides: Partial<DeviceForm> = {}): DeviceForm {
  return {
    customerId: "",
    name: "",
    model: "",
    pn: "",
    serialNo: "",
    mrNo: "",
    maintenanceType: "pending_confirmation",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    location: "",
    status: "active",
    remark: "",
    ...overrides,
  };
}

function createEmptyBatchRow(): BatchDeviceRow {
  return {
    name: "",
    model: "",
    serialNo: "",
    mrNo: "",
  };
}

interface BatchEditForm {
  maintenanceType: string;
  maintenancePartyId: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  warrantyUntil: string;
  mrNo: string;
  location: string;
  remark: string;
}

interface BatchEditToggles {
  maintenanceType: boolean;
  maintenancePartyId: boolean;
  maintenanceStart: boolean;
  maintenanceEnd: boolean;
  warrantyUntil: boolean;
  mrNo: boolean;
  location: boolean;
  remark: boolean;
}

function createEmptyBatchEditForm(): BatchEditForm {
  return {
    maintenanceType: "pending_confirmation",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    warrantyUntil: "",
    mrNo: "",
    location: "",
    remark: "",
  };
}

function createEmptyBatchEditToggles(): BatchEditToggles {
  return {
    maintenanceType: false,
    maintenancePartyId: false,
    maintenanceStart: false,
    maintenanceEnd: false,
    warrantyUntil: false,
    mrNo: false,
    location: false,
    remark: false,
  };
}

function createInitialBatchRows(count = 3) {
  return Array.from({ length: count }, () => createEmptyBatchRow());
}

function batchRowHasInput(row: BatchDeviceRow) {
  return Boolean(row.name.trim() || row.model.trim() || row.serialNo.trim() || row.mrNo.trim());
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function inputDate(value?: string) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function canonicalMaintenanceType(value?: string) {
  const type = String(value || "pending_confirmation").trim() || "pending_confirmation";
  return MAINTENANCE_TYPE_ALIASES[type] || type;
}

function maintenanceTypeHasParty(type?: string) {
  return ["original_manufacturer", "our_maintenance"].includes(canonicalMaintenanceType(type));
}

function maintenancePartyMatchesType(party: MaintenanceParty, type?: string) {
  const maintenanceType = canonicalMaintenanceType(type);
  if (!maintenanceTypeHasParty(maintenanceType)) return false;
  return canonicalMaintenanceType(party.partyType) === maintenanceType;
}

function resolveMaintenancePartyId(parties: MaintenanceParty[], type: string, currentId?: string | number | null) {
  const maintenanceType = canonicalMaintenanceType(type);
  if (!maintenanceTypeHasParty(maintenanceType) || !currentId) return "";
  return parties.some((party) => (
    String(party.id) === String(currentId)
    && maintenancePartyMatchesType(party, maintenanceType)
  )) ? String(currentId) : "";
}

function customerLabel(customer?: Customer | null) {
  if (!customer) return "";
  return customer.name || `客户 #${customer.id}`;
}

function customerMeta(customer: Customer) {
  return [customer.address || customer.mapAddress, customer.contactName, customer.contactPhone]
    .filter(Boolean)
    .join(" · ") || customer.code || `客户 #${customer.id}`;
}

function normalizeCustomerSearchText(value?: string | number) {
  return normalizeSearchText(value);
}

function customerMatches(customer: Customer, keyword: string) {
  const normalized = normalizeCustomerSearchText(keyword);
  if (!normalized) return true;
  return [
    customer.name,
    customer.code,
    customer.address,
    customer.mapAddress,
    customer.contactName,
    customer.contactPhone,
    customer.id,
  ].filter(Boolean).some((value) => normalizeCustomerSearchText(value).includes(normalized));
}

const CUSTOMER_INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

function customerInitial(customer: Customer) {
  const initial = String(customer.sortInitial || "").toUpperCase();
  if (/^[A-Z]$/.test(initial)) return initial;
  const first = customerLabel(customer).trim()[0]?.toUpperCase() || "";
  return /^[A-Z]$/.test(first) ? first : "#";
}

function customerSortKey(customer: Customer) {
  return customer.sortKey || `${customerInitial(customer)}|${customerLabel(customer).trim().toLowerCase()}`;
}

function groupCustomersByInitial(items: Customer[]) {
  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
  const groups = new Map<string, Customer[]>();
  const sortedItems = [...items].sort((a, b) => {
    const groupA = CUSTOMER_INDEX_LETTERS.indexOf(customerInitial(a));
    const groupB = CUSTOMER_INDEX_LETTERS.indexOf(customerInitial(b));
    const rankA = groupA >= 0 ? groupA : CUSTOMER_INDEX_LETTERS.length;
    const rankB = groupB >= 0 ? groupB : CUSTOMER_INDEX_LETTERS.length;
    if (rankA !== rankB) return rankA - rankB;
    return collator.compare(customerSortKey(a), customerSortKey(b));
  });
  sortedItems.forEach((customer) => {
    const letter = customerInitial(customer);
    groups.set(letter, [...(groups.get(letter) || []), customer]);
  });
  return CUSTOMER_INDEX_LETTERS
    .filter((letter) => groups.has(letter))
    .map((letter) => ({ letter, items: groups.get(letter) || [] }));
}

function deviceDisplayName(device?: Device | null) {
  if (!device) return "";
  return device.model || device.name || device.serialNo || `设备 #${device.id}`;
}

function partActionLabel(value?: string) {
  if (value === "replacement") return "备件更换";
  if (value === "installation") return "硬件部件安装";
  return "部件记录";
}

function serviceTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    install: "现场安装",
    repair: "故障处理",
    maintain: "保养维护",
    inspect: "例行巡检",
    training: "现场培训",
    other: "其他事项",
  };
  return labels[value || ""] || value || "服务记录";
}

function orderStatusLabel(value?: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    pending_confirmation: "待确认",
    awaiting_customer_signature: "待客户签署",
    assigned: "已派发",
    in_progress: "处理中",
    submitted: "已提交",
    rejected: "已退回",
    approved: "已审核",
    archived: "已归档",
    cancelled: "已作废",
  };
  return labels[value || ""] || value || "-";
}

function orderRelationLabel(value?: string) {
  const labels = String(value || "")
    .split(",")
    .map((item) => {
      if (item === "service_order_device") return "主设备";
      if (item === "installation_source") return "安装来源";
      if (item === "service_part:replacement") return "备件更换";
      if (item === "service_part:installation") return "硬件部件安装";
      if (item.startsWith("service_part:")) return "部件记录";
      return "";
    })
    .filter(Boolean);
  return [...new Set(labels)].join(" / ") || "关联";
}

function partQuantityText(item: DevicePartHistory) {
  const quantity = Number(item.quantity || 0);
  const text = Number.isFinite(quantity) && quantity > 0 ? String(quantity).replace(/\.00$/, "") : "";
  return [text, item.unit].filter(Boolean).join("") || "1";
}

function compactText(value?: string, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function modelNormalizationNotice(payload: unknown): ModelNormalizationNotice | null {
  const data = (payload || {}) as { modelNormalization?: ModelNormalizationResult; message?: string };
  const normalization = data.modelNormalization || {};
  const action = String(normalization.action || "");
  if (!["corrected", "created", "created_corrected", "suggested_correction", "not_found"].includes(action)) return null;
  const message = String(data.message || normalization.message || "").trim()
    || (action === "corrected"
      ? `已按型号库标准纠正为 ${normalization.canonicalModel || "标准型号"}`
      : action === "created_corrected"
        ? `型号库未命中，已规范为 ${normalization.canonicalModel || "标准型号"} 并加入型号库`
        : action === "suggested_correction"
          ? `AI 建议可能是 ${normalization.canonicalModel || "标准型号"}，需人工确认后应用`
        : action === "created"
          ? "型号库未命中，已加入型号库"
          : "型号库未命中，未能在线确认，已按原型号保存");
  return { action, message };
}

const MODEL_NORMALIZATION_TOAST_POSITION = "bottom-right" as const;
const MODEL_NORMALIZATION_JOB_POLL_MS = 2000;
const MODEL_NORMALIZATION_JOB_TIMEOUT_MS = 90000;

function extractModelNormalizationJob(payload: unknown): ModelNormalizationJob | null {
  const job = (payload || {}) as { modelNormalizationJob?: ModelNormalizationJob };
  if (!job.modelNormalizationJob?.id) return null;
  return job.modelNormalizationJob;
}

function modelNormalizationResultMessage(job: ModelNormalizationJob) {
  const normalization = job.modelNormalization || {};
  const action = String(normalization.action || "");
  return String(job.message || normalization.message || "").trim()
    || (action === "corrected"
      ? `已按型号库标准纠正为 ${normalization.canonicalModel || job.canonicalModel || "标准型号"}`
      : action === "created_corrected"
        ? `型号库未命中，已规范为 ${normalization.canonicalModel || job.canonicalModel || "标准型号"} 并加入型号库`
        : action === "suggested_correction"
          ? `AI 建议可能是 ${normalization.canonicalModel || job.canonicalModel || "标准型号"}，需人工确认后应用`
        : action === "created"
          ? "型号库未命中，已加入型号库"
          : action === "not_found"
            ? "型号库未命中，未能在线确认，已按原型号保存"
            : "型号后台搜索完成");
}

function summarizeModelNormalizationJobs(jobs: ModelNormalizationJob[]) {
  const completed = jobs.filter((job) => job.status === "completed");
  const failed = jobs.filter((job) => job.status === "failed");
  const updated = completed.filter((job) => job.updated).length;
  const catalogAdded = completed.filter((job) => ["created", "created_corrected"].includes(String(job.modelNormalization?.action || ""))).length;
  const unresolved = completed.filter((job) => job.modelNormalization?.action === "not_found").length;
  const suggested = completed.filter((job) => job.modelNormalization?.action === "suggested_correction").length;
  const parts = [`完成 ${completed.length} 个`];
  if (updated) parts.push(`纠正 ${updated} 台`);
  if (catalogAdded) parts.push(`入库 ${catalogAdded} 个`);
  if (suggested) parts.push(`待确认 ${suggested} 个`);
  if (unresolved) parts.push(`未确认 ${unresolved} 个`);
  if (failed.length) parts.push(`失败 ${failed.length} 个`);
  return `型号后台搜索完成：${parts.join("，")}`;
}

function showModelNormalizationNotices(notices: ModelNormalizationNotice[]) {
  const seen = new Set<string>();
  const unique = notices.filter((notice) => {
    if (!notice.message || seen.has(notice.message)) return false;
    seen.add(notice.message);
    return true;
  });
  unique.slice(0, 3).forEach((notice) => {
    if (notice.action === "not_found") toast.warning(notice.message);
    else toast.info(notice.message);
  });
  if (unique.length > 3) toast.info(`另有 ${unique.length - 3} 条型号校对结果已应用`);
}

function existingModelIssueLabel(action?: string) {
  if (action === "corrected") return "型号库纠正";
  if (action === "created_corrected") return "在线规范";
  if (action === "suggested_correction") return "AI 待确认";
  if (action === "created") return "已补入型号库";
  if (action === "not_found") return "未确认";
  return "需核对";
}

function existingModelIssueBadgeClass(action?: string) {
  if (action === "not_found") return "border-amber-200 bg-amber-50 text-amber-800";
  if (action === "suggested_correction") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800";
  if (action === "created") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-violet-200 bg-violet-50 text-violet-800";
}

function apiErrorDetails(error: unknown): DeviceDeleteBlockedDetails | null {
  const details = (error as { details?: unknown } | null)?.details;
  if (!details || typeof details !== "object") return null;
  return details as DeviceDeleteBlockedDetails;
}

function deviceDeleteName(device?: DeviceDeleteBlockedDetails["device"] | Device | null) {
  if (!device) return "设备";
  return [device.model, "serialNo" in device ? device.serialNo : undefined].filter(Boolean).join(" / ")
    || device.name
    || (device.id ? `设备 #${device.id}` : "设备");
}

function compactList(values: string[], limit = 5) {
  const filtered = values.filter(Boolean);
  if (!filtered.length) return "";
  const visible = filtered.slice(0, limit).join("、");
  return filtered.length > limit ? `${visible} 等 ${filtered.length} 项` : visible;
}

function formatDeviceDeleteBlockedDetails(details: DeviceDeleteBlockedDetails) {
  const relations = details.relations || {};
  const lines = [
    `设备：${deviceDeleteName(details.device)}${details.device?.customerName ? `（${details.device.customerName}）` : ""}`,
  ];
  const mainOrders = compactList((relations.mainServiceOrders || []).map((item) => item.orderNo || `#${item.id}`));
  if (mainOrders) lines.push(`主设备工单：${mainOrders}`);
  const targetOrders = compactList((relations.targetServiceOrders || []).map((item) => item.orderNo || `#${item.id}`));
  if (targetOrders) lines.push(`目标设备工单：${targetOrders}`);
  const parts = compactList((relations.serviceParts || []).map((item) => (
    `${item.orderNo || `工单 #${item.orderId || "-"}`} ${item.partName || item.partNo || `部件 #${item.id}`}`
  )));
  if (parts) lines.push(`部件记录：${parts}`);
  const schedules = compactList((relations.inspectionSchedules || []).map((item) => item.name || `计划 #${item.id}`));
  if (schedules) lines.push(`巡检计划：${schedules}`);
  return lines.join("\n");
}

function mergeCustomers(current: Customer[], incoming: Customer[]) {
  const merged = new Map<string, Customer>();
  [...current, ...incoming].forEach((customer) => {
    if (!customer?.id) return;
    const key = String(customer.id);
    const existing = merged.get(key);
    merged.set(key, { ...existing, ...customer });
  });
  return [...merged.values()];
}

function DeviceCustomerSuggestions({
  open,
  searching,
  recentCustomers,
  groups,
  selectedCustomerId,
  onSelect,
}: {
  open: boolean;
  searching: boolean;
  recentCustomers: Customer[];
  groups: Array<{ letter: string; items: Customer[] }>;
  selectedCustomerId: string;
  onSelect: (customer: Customer) => void;
}) {
  const availableLetters = new Set(groups.map((group) => group.letter));
  const hasResults = recentCustomers.length || groups.some((group) => group.items.length);
  if (!open) return null;

  function scrollToLetter(letter: string) {
    document.getElementById(`device-customer-letter-${letter}`)?.scrollIntoView({ block: "start" });
  }

  function renderCustomer(customer: Customer, badge?: string) {
    const selected = selectedCustomerId && String(customer.id) === selectedCustomerId;
    return (
      <button
        key={`${badge || "customer"}-${customer.id}`}
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
          <span className="block truncate text-sm font-semibold text-foreground">{customerLabel(customer)}</span>
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{customerMeta(customer)}</span>
        </span>
        {badge ? <Badge className="shrink-0" variant="secondary">{badge}</Badge> : selected ? <Badge className="shrink-0" variant="outline">已选择</Badge> : null}
      </button>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
      <div className="relative">
        <div className="max-h-80 overflow-y-auto p-2 pr-8">
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
            <div key={group.letter} id={`device-customer-letter-${group.letter}`} className="scroll-mt-2 space-y-2 pb-3">
              <div className="sticky top-0 z-10 bg-popover/95 px-1 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                {group.letter}
              </div>
              {group.items.map((customer) => renderCustomer(customer))}
            </div>
          ))}
          {!hasResults ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              未找到匹配客户，请调整关键词
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
                className="flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-medium leading-none text-muted-foreground/80 transition-colors disabled:pointer-events-none disabled:text-muted-foreground/25 enabled:hover:bg-primary/10 enabled:hover:text-primary"
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

function extractMaintenancePartyNames(items: unknown) {
  const names = Array.isArray(items)
    ? items
      .map((item) => String((item as MaintenanceParty | null)?.name || "").trim())
      .filter(Boolean)
    : [];
  return [...new Set(names)].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

async function loadMaintenancePartyNamesForTemplate() {
  const data = await api.get("/maintenance-parties?limit=1000");
  return extractMaintenancePartyNames(data?.items);
}

function worksheetRangeFormula(sheetName: string, column: string, startRow: number, endRow: number) {
  const escapedSheetName = sheetName.replace(/'/g, "''");
  return `'${escapedSheetName}'!$${column}$${startRow}:$${column}$${endRow}`;
}

function applyImportTemplateDropdowns(
  workbook: ExcelWorkbook,
  worksheet: ExcelWorksheet,
  headerRowNumber: number,
  maintenancePartyNames: string[],
) {
  const options = workbook.addWorksheet(IMPORT_TEMPLATE_OPTIONS_SHEET);
  options.state = "veryHidden";
  options.columns = [
    { key: "maintenanceType", width: 18 },
    { key: "maintenancePartyName", width: 32 },
  ];
  options.getCell("A1").value = "维保类型";
  options.getCell("B1").value = "维保方名称";
  IMPORT_TEMPLATE_MAINTENANCE_TYPES.forEach((value, index) => {
    options.getCell(index + 2, 1).value = value;
  });
  maintenancePartyNames.forEach((value, index) => {
    options.getCell(index + 2, 2).value = value;
  });

  const firstDataRow = headerRowNumber + 1;
  const lastDataRow = headerRowNumber + IMPORT_TEMPLATE_MAX_ROWS;
  const maintenanceTypeFormula = worksheetRangeFormula(
    IMPORT_TEMPLATE_OPTIONS_SHEET,
    "A",
    2,
    IMPORT_TEMPLATE_MAINTENANCE_TYPES.length + 1,
  );
  const maintenancePartyFormula = maintenancePartyNames.length
    ? worksheetRangeFormula(IMPORT_TEMPLATE_OPTIONS_SHEET, "B", 2, maintenancePartyNames.length + 1)
    : "";

  for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
    worksheet.getCell(rowNumber, 6).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [maintenanceTypeFormula],
      showErrorMessage: true,
      errorTitle: "请选择维保类型",
      error: "请从下拉列表选择维保类型，或留空按待确认处理。",
    };
    if (maintenancePartyFormula) {
      worksheet.getCell(rowNumber, 7).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [maintenancePartyFormula],
        showErrorMessage: true,
        errorTitle: "请选择维保方名称",
        error: "请从下拉列表选择维保方名称，或先在系统维保方目录中维护后重新下载模板。",
      };
    }
  }
}

async function downloadDeviceImportTemplate() {
  const maintenancePartyNames = await loadMaintenancePartyNamesForTemplate();
  const [{ Workbook }, { saveAs }] = await Promise.all([
    import("exceljs"),
    import("file-saver"),
  ]);
  const workbook = new Workbook();
  workbook.creator = "OMS Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const headerRowNumber = 4;
  const worksheet = workbook.addWorksheet("设备导入模板", {
    views: [{ state: "frozen", ySplit: headerRowNumber }],
  });
  const requiredHeaders = new Set(["客户名称", "设备型号*", "SN*"]);
  worksheet.columns = [
    { key: "customerName", width: 24 },
    { key: "name", width: 20 },
    { key: "model", width: 24 },
    { key: "serialNo", width: 22 },
    { key: "mrNo", width: 18 },
    { key: "maintenanceType", width: 16 },
    { key: "maintenancePartyName", width: 24 },
    { key: "maintenanceStart", width: 14 },
    { key: "maintenanceEnd", width: 14 },
    { key: "warrantyUntil", width: 14 },
    { key: "location", width: 24 },
    { key: "remark", width: 28 },
  ];
  worksheet.mergeCells("A1:L1");
  worksheet.mergeCells("A2:L2");
  worksheet.mergeCells("A3:L3");
  worksheet.getCell("A1").value = "设备资产导入提示";
  worksheet.getCell("A2").value = "只需先填写客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后可在系统中批量补齐或修改。";
  worksheet.getCell("A3").value = "客户名称建议填写系统内标准名称；如检测到可唯一匹配的名称，导入前会提示确认纠正；重复 SN 会自动跳过。";
  [1, 2, 3].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    row.height = rowNumber === 1 ? 26 : 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFC4B5FD" } },
        left: { style: "thin", color: { argb: "FFC4B5FD" } },
        bottom: { style: "thin", color: { argb: "FFC4B5FD" } },
        right: { style: "thin", color: { argb: "FFC4B5FD" } },
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber === 1 ? "FFDDD6FE" : "FFF5F3FF" } };
      cell.font = { bold: rowNumber === 1, color: { argb: rowNumber === 3 ? "FF7F1D1D" : "FF4C1D95" } };
    });
  });
  worksheet.getRow(headerRowNumber).values = [
    "客户名称",
    "主机名",
    "设备型号*",
    "SN*",
    "MR单",
    "维保类型",
    "维保方名称",
    "维保开始",
    "维保截止",
    "质保截止",
    "位置",
    "备注",
  ];
  worksheet.addRow({
    customerName: "示例客户有限公司",
    name: "host-01",
    model: "PowerEdge R740",
    serialNo: "SN-EXAMPLE-001",
    mrNo: "MR-001",
    maintenanceType: "我方维保",
    maintenancePartyName: "示例维保方",
    maintenanceStart: "2026-01-01",
    maintenanceEnd: "2026-12-31",
    warrantyUntil: "2026-12-31",
    location: "机房 A01",
    remark: "删除示例行后再导入",
  });
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: worksheet.columns.length },
  };
  worksheet.getRow(headerRowNumber).height = 24;
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    const required = requiredHeaders.has(String(cell.value || ""));
    cell.font = { bold: true, color: { argb: required ? "FF7F1D1D" : "FF4C1D95" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    if (required) {
      cell.note = String(cell.value) === "客户名称"
        ? "必填项，建议填写系统内标准名称；可唯一匹配时会提示确认纠正。"
        : "必填项，不能为空。";
    }
  });
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E2EC" } },
        left: { style: "thin", color: { argb: "FFD9E2EC" } },
        bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
        right: { style: "thin", color: { argb: "FFD9E2EC" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber > headerRowNumber) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  });

  const help = workbook.addWorksheet("字段说明");
  help.columns = [
    { header: "字段", key: "field", width: 18 },
    { header: "是否必填", key: "required", width: 14 },
    { header: "说明", key: "description", width: 72 },
  ];
  [
    ["客户名称", "必填", "建议填写系统内标准名称；如检测到可唯一匹配的名称，导入前会提示确认纠正。"],
    ["设备型号*", "必填", "不能为空。"],
    ["SN*", "必填", "不能为空；导入文件内重复或系统内已存在时，该行失败并跳过。"],
    ["维保类型", "选填", "可填：待确认、无维保、原厂维保、我方维保；空值按待确认处理。"],
    ["维保方名称", "有维保时选填", "下拉名单来自系统维保方目录；按名称和维保类型匹配已有维保方。"],
    ["维保截止", "选填", "当前维保合同或服务责任的结束日期；到期提醒优先使用此字段。"],
    ["质保截止", "选填", "设备原厂/供应商质保自然到期日；没有维保截止时作为展示兜底。"],
    ["日期字段", "选填", "使用 YYYY-MM-DD 格式，例如 2026-12-31。"],
    ["填写建议", "说明", "只需先填客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后再在系统中批量补齐或修改。"],
  ].forEach(([field, required, description]) => help.addRow({ field, required, description }));
  help.getRow(1).font = { bold: true, color: { argb: "FF4C1D95" } };
  help.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  applyImportTemplateDropdowns(workbook, worksheet, headerRowNumber, maintenancePartyNames);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "设备资产导入模板.xlsx");
}

async function exportDevicesToExcel(devices: Device[]) {
  const [{ Workbook }, { saveAs }] = await Promise.all([
    import("exceljs"),
    import("file-saver"),
  ]);
  const workbook = new Workbook();
  workbook.creator = "OMS Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("设备资产");
  worksheet.columns = [
    { header: "客户名称", key: "customerName", width: 24 },
    { header: "主机名", key: "name", width: 20 },
    { header: "设备型号", key: "model", width: 24 },
    { header: "PN", key: "pn", width: 18 },
    { header: "SN", key: "serialNo", width: 22 },
    { header: "MR单", key: "mrNo", width: 18 },
    { header: "维保类型", key: "maintenanceType", width: 16 },
    { header: "维保方名称", key: "maintenancePartyName", width: 24 },
    { header: "维保开始", key: "maintenanceStart", width: 14 },
    { header: "维保截止", key: "maintenanceEnd", width: 14 },
    { header: "质保截止", key: "warrantyUntil", width: 14 },
    { header: "位置", key: "location", width: 24 },
    { header: "状态", key: "status", width: 12 },
    { header: "备注", key: "remark", width: 30 },
  ];

  devices.forEach((device) => {
    const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
    const status = device.status || "active";
    worksheet.addRow({
      customerName: device.customerName || "",
      name: device.name || "",
      model: device.model || "",
      pn: device.pn || "",
      serialNo: device.serialNo || "",
      mrNo: device.mrNo || "",
      maintenanceType: MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "",
      maintenancePartyName: device.maintenancePartyName || "",
      maintenanceStart: inputDate(device.maintenanceStart),
      maintenanceEnd: inputDate(device.maintenanceEnd),
      warrantyUntil: inputDate(device.warrantyUntil),
      location: device.location || "",
      status: DEVICE_STATUS_LABELS[status] || status || "",
      remark: device.remark || "",
    });
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length },
  };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle", wrapText: rowNumber === 1 };
    });
  });

  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `设备资产-${timestamp}.xlsx`);
}

export function Devices() {
  const { hasPermission } = useAuth();
  const canCreateDevices = hasPermission("device.create");
  const canEditDevices = hasPermission("device.edit");
  const canDeleteDevices = hasPermission("device.delete");
  const canManageDevices = canEditDevices || canDeleteDevices;
  const canSelectDevices = canManageDevices;
  const deviceTableGrid = canManageDevices ? DEVICE_TABLE_GRID : DEVICE_TABLE_READONLY_GRID;
  const deviceTableMinWidth = canManageDevices ? "min-w-[1262px]" : "min-w-[1092px]";
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<MaintenanceParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Device | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modelSuggestions, setModelSuggestions] = useState<ModelSuggestion[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSuggestionTarget, setModelSuggestionTarget] = useState<ModelSuggestionTarget>({ type: "form" });
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelSearchTimerRef = useRef<number | null>(null);
  const modelSearchRequestRef = useRef(0);
  const modelNormalizationJobTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const [customerInput, setCustomerInput] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchTimer, setCustomerSearchTimer] = useState<number | null>(null);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [form, setForm] = useState<DeviceForm>(() => createEmptyDeviceForm());
  const [batchRows, setBatchRows] = useState<BatchDeviceRow[]>(() => createInitialBatchRows());
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState<BatchEditForm>(() => createEmptyBatchEditForm());
  const [batchEditToggles, setBatchEditToggles] = useState<BatchEditToggles>(() => createEmptyBatchEditToggles());
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [maintenanceImportOpen, setMaintenanceImportOpen] = useState(false);
  const [maintenanceImportFile, setMaintenanceImportFile] = useState<File | null>(null);
  const [maintenanceImporting, setMaintenanceImporting] = useState(false);
  const [maintenanceImportPreview, setMaintenanceImportPreview] = useState<MaintenanceImportPreview | null>(null);
  const [maintenanceImportColumns, setMaintenanceImportColumns] = useState({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
  const [maintenanceImportMappingDirty, setMaintenanceImportMappingDirty] = useState(false);
  const [maintenanceImportSelectedIds, setMaintenanceImportSelectedIds] = useState<string[]>([]);
  const maintenanceImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const maintenanceImportUpdatableIds = useMemo(() => maintenanceImportPreview?.items
    .filter((item) => item.status === "updatable" && item.deviceId !== undefined)
    .map((item) => String(item.deviceId)) || [], [maintenanceImportPreview]);
  const maintenanceImportSelectedIdSet = useMemo(() => new Set(maintenanceImportSelectedIds), [maintenanceImportSelectedIds]);
  const [modelCompareOpen, setModelCompareOpen] = useState(false);
  const [modelComparing, setModelComparing] = useState(false);
  const [modelCompareProgress, setModelCompareProgress] = useState(0);
  const [modelApplying, setModelApplying] = useState(false);
  const [modelCompareResult, setModelCompareResult] = useState<ExistingModelNormalizationResult | null>(null);
  const filteredMaintenanceParties = useMemo(
    () => parties.filter((party) => maintenancePartyMatchesType(party, form.maintenanceType)),
    [parties, form.maintenanceType],
  );
  const filteredBatchEditMaintenanceParties = useMemo(
    () => parties.filter((party) => maintenancePartyMatchesType(party, batchEditForm.maintenanceType)),
    [parties, batchEditForm.maintenanceType],
  );

  async function load(keyword = searchQuery) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const data = await api.get(`/devices${params.toString() ? `?${params}` : ""}`);
      setDevices((data?.items || []) as Device[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoadedOnce(true);
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const sortLocale = encodeURIComponent("zh-Hans-CN");
      const [customerData, recentCustomerData] = await Promise.all([
        api.get(`/customers?pageSize=200&sortLocale=${sortLocale}`),
        api.get(`/customers?mine=1&pageSize=4&sortLocale=${sortLocale}`).catch(() => ({ items: [] })),
      ]);
      const regularItems = (customerData?.items || []) as Customer[];
      const recentItems = ((recentCustomerData?.items || []) as Customer[]).slice(0, 4);
      setRecentCustomers(recentItems);
      setCustomers(mergeCustomers(regularItems, recentItems));
    } catch {
      setCustomers([]);
      setRecentCustomers([]);
    }
  }

  async function loadParties() {
    try {
      const data = await api.get("/maintenance-parties");
      setParties((data?.items || []) as MaintenanceParty[]);
    } catch {
      setParties([]);
    }
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      modelNormalizationJobTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      modelNormalizationJobTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    loadCustomers();
    loadParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      load(searchQuery);
    }, searchQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter, searchQuery]);

  function delayModelNormalizationJobPoll(ms: number) {
    if (!mountedRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timerId = window.setTimeout(() => {
        modelNormalizationJobTimersRef.current = modelNormalizationJobTimersRef.current.filter((id) => id !== timerId);
        resolve();
      }, ms);
      modelNormalizationJobTimersRef.current.push(timerId);
    });
  }

  async function waitForModelNormalizationJob(job: ModelNormalizationJob) {
    const jobId = String(job.id || "");
    const startedAt = Date.now();
    while (mountedRef.current && Date.now() - startedAt < MODEL_NORMALIZATION_JOB_TIMEOUT_MS) {
      try {
        const data = await api.get(`/devices/model-normalization-jobs/${encodeURIComponent(jobId)}`);
        const item = (data?.item || {}) as ModelNormalizationJob;
        if (item.status && item.status !== "pending") return item;
      } catch (e) {
        return {
          ...job,
          status: "failed",
          message: e instanceof Error ? e.message : "型号后台搜索失败",
        } as ModelNormalizationJob;
      }
      await delayModelNormalizationJobPoll(MODEL_NORMALIZATION_JOB_POLL_MS);
    }
    return {
      ...job,
      status: "failed",
      message: "型号后台搜索超时，请稍后刷新或使用型号校正",
    } as ModelNormalizationJob;
  }

  function trackModelNormalizationJobs(jobs: ModelNormalizationJob[]) {
    const uniqueJobs = [...new Map(jobs.filter((job) => job.id).map((job) => [String(job.id), job])).values()];
    if (!uniqueJobs.length) return;

    const toastId = toast.loading(
      uniqueJobs.length === 1
        ? `正在后台搜索型号：${uniqueJobs[0].inputModel || "设备型号"}`
        : `正在后台搜索 ${uniqueJobs.length} 个设备型号`,
      {
        position: MODEL_NORMALIZATION_TOAST_POSITION,
        duration: Infinity,
      },
    );

    void (async () => {
      const results = await Promise.all(uniqueJobs.map(waitForModelNormalizationJob));
      if (!mountedRef.current) return;

      const toastOptions = {
        id: toastId,
        position: MODEL_NORMALIZATION_TOAST_POSITION,
        duration: 9000,
      };

      if (results.length === 1) {
        const result = results[0];
        const action = String(result.modelNormalization?.action || "");
        const message = modelNormalizationResultMessage(result);
        if (result.status === "failed") toast.error(message, toastOptions);
        else if (["not_found", "suggested_correction"].includes(action)) toast.warning(message, toastOptions);
        else toast.success(message, toastOptions);
      } else {
        const message = summarizeModelNormalizationJobs(results);
        const failed = results.some((job) => job.status === "failed");
        const unresolved = results.some((job) => ["not_found", "suggested_correction"].includes(String(job.modelNormalization?.action || "")));
        if (failed) toast.error(message, toastOptions);
        else if (unresolved) toast.warning(message, toastOptions);
        else toast.success(message, toastOptions);
      }

      if (results.some((job) => job.updated)) {
        await load();
      }
    })();
  }

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim();
    return devices.filter((d) => {
      const maintenanceType = canonicalMaintenanceType(d.maintenanceType);
      const status = d.status || "active";
      if (maintenanceFilter !== "all" && maintenanceType !== maintenanceFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!keyword) return true;
      return [d.name, d.model, d.pn, d.serialNo, d.mrNo, d.customerName, d.maintenancePartyName]
        .filter(Boolean)
        .some((v) => matchesSearchText(v, keyword));
    });
  }, [devices, maintenanceFilter, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ours = filtered.filter((d) => canonicalMaintenanceType(d.maintenanceType) === "our_maintenance").length;
    const vendor = filtered.filter((d) => canonicalMaintenanceType(d.maintenanceType) === "original_manufacturer").length;
    return [
      { label: "设备总数", value: total },
      { label: "我方维保", value: ours },
      { label: "原厂维保", value: vendor },
    ];
  }, [filtered]);
  const initialLoading = loading && !loadedOnce;
  const refreshing = loading && loadedOnce;

  async function handleDownloadImportTemplate() {
    setError("");
    try {
      await downloadDeviceImportTemplate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "模板下载失败");
    }
  }

  async function handleExportDevices() {
    if (!filtered.length) {
      setError("当前没有可导出的设备");
      return;
    }
    setExporting(true);
    setError("");
    try {
      await exportDevicesToExcel(filtered);
      toast.success(`已导出 ${filtered.length} 台设备`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "设备导出失败");
    } finally {
      setExporting(false);
    }
  }

  const allFilteredDevicesSelected = filtered.length > 0
    && filtered.every((device) => selectedDeviceIds.includes(String(device.id)));

  useEffect(() => {
    const visibleIds = new Set(filtered.map((device) => String(device.id)));
    setSelectedDeviceIds((ids) => {
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [filtered]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && modelDropdownRef.current?.contains(target)) return;
      setModelDropdownOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [modelDropdownOpen]);

  function toggleDeviceSelection(deviceId: string | number, checked: boolean | "indeterminate") {
    const id = String(deviceId);
    setSelectedDeviceIds((ids) => {
      if (checked === true) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  }

  function toggleAllFilteredDevices(checked: boolean | "indeterminate") {
    const ids = filtered.map((device) => String(device.id));
    setSelectedDeviceIds((current) => {
      if (checked === true) return Array.from(new Set([...current, ...ids]));
      const visible = new Set(ids);
      return current.filter((id) => !visible.has(id));
    });
  }

  function filterByModel(event: MouseEvent, model?: string) {
    event.stopPropagation();
    const value = String(model || "").trim();
    if (!value) return;
    setSearchQuery(value);
  }

  function filterByCustomer(event: MouseEvent, device: Device) {
    event.stopPropagation();
    const customerId = device.customerId ? String(device.customerId) : "";
    const customerName = String(device.customerName || "").trim();
    if (customerId) {
      setCustomerFilter(customerId);
      return;
    }
    if (customerName) setSearchQuery(customerName);
  }

  function filterByMaintenanceParty(event: MouseEvent, partyName?: string) {
    event.stopPropagation();
    const value = String(partyName || "").trim();
    if (!value) return;
    setSearchQuery(value);
  }

  function filterByMaintenanceType(event: MouseEvent, maintenanceType?: string) {
    event.stopPropagation();
    const value = canonicalMaintenanceType(maintenanceType);
    if (!value) return;
    setMaintenanceFilter(value);
  }

  function filterByStatus(event: MouseEvent, status?: string) {
    event.stopPropagation();
    setStatusFilter(status || "active");
  }

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(form.customerId)) || null,
    [customers, form.customerId],
  );

  const recentCustomerIds = useMemo(() => new Set(recentCustomers.map((customer) => String(customer.id))), [recentCustomers]);
  const dialogRecentCustomers = useMemo(() => (
    recentCustomers.filter((customer) => customerMatches(customer, customerInput)).slice(0, 4)
  ), [customerInput, recentCustomers]);
  const dialogCustomerGroups = useMemo(() => {
    const grouped = groupCustomersByInitial(
      customers
        .filter((customer) => !recentCustomerIds.has(String(customer.id)))
        .filter((customer) => customerMatches(customer, customerInput)),
    );
    if (selectedCustomer && !recentCustomerIds.has(String(selectedCustomer.id)) && !grouped.some((group) => (
      group.items.some((customer) => String(customer.id) === String(selectedCustomer.id))
    ))) {
      return groupCustomersByInitial([selectedCustomer, ...grouped.flatMap((group) => group.items)]);
    }
    return grouped;
  }, [customers, customerInput, recentCustomerIds, selectedCustomer]);

  function selectedCustomerLabel(customerId: string | number | undefined, fallback?: string) {
    if (!customerId) return "";
    const customer = customers.find((item) => String(item.id) === String(customerId));
    return customerLabel(customer) || fallback || `客户 #${customerId}`;
  }

  function openCreate() {
    setError("");
    setCreateMode("single");
    setEditingId(null);
    const defaultCustomerId = customerFilter !== "all" ? customerFilter : "";
    setForm(createEmptyDeviceForm({ customerId: defaultCustomerId }));
    setCustomerInput(selectedCustomerLabel(defaultCustomerId));
    setCustomerDropdownOpen(false);
    setModelSuggestions([]);
    setModelSuggestionTarget({ type: "form" });
    setDialogOpen(true);
  }

  function openBulkCreate() {
    setError("");
    setCreateMode("bulk");
    setEditingId(null);
    const defaultCustomerId = customerFilter !== "all" ? customerFilter : "";
    setForm(createEmptyDeviceForm({ customerId: defaultCustomerId }));
    setBatchRows(createInitialBatchRows());
    setCustomerInput(selectedCustomerLabel(defaultCustomerId));
    setCustomerDropdownOpen(false);
    setModelSuggestions([]);
    setModelSuggestionTarget({ type: "form" });
    setDialogOpen(true);
  }

  function openEdit(device: Device) {
    setError("");
    setCreateMode("single");
    setEditingId(device.id);
    const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
    setForm({
      customerId: device.customerId ? String(device.customerId) : "",
      name: device.name || "",
      model: device.model || "",
      pn: device.pn || "",
      serialNo: device.serialNo || "",
      mrNo: device.mrNo || "",
      maintenanceType,
      maintenancePartyId: resolveMaintenancePartyId(parties, maintenanceType, device.maintenancePartyId),
      maintenanceStart: inputDate(device.maintenanceStart),
      maintenanceEnd: inputDate(device.maintenanceEnd),
      location: device.location || "",
      status: device.status || "active",
      remark: device.remark || "",
    });
    setCustomerInput(selectedCustomerLabel(device.customerId, device.customerName));
    setCustomerDropdownOpen(false);
    setModelSuggestions([]);
    setModelSuggestionTarget({ type: "form" });
    setDialogOpen(true);
  }

  function updateBatchRow(index: number, field: keyof BatchDeviceRow, value: string) {
    setBatchRows((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  }

  function addBatchRow() {
    setBatchRows((rows) => [...rows, createEmptyBatchRow()]);
  }

  function removeBatchRow(index: number) {
    setBatchRows((rows) => {
      const next = rows.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [createEmptyBatchRow()];
    });
    setModelSuggestionTarget((current) => (
      current.type === "batch" && current.index === index ? { type: "form" } : current
    ));
  }

  async function openDetail(device: Device) {
    setDetailTarget(device);
    if (!device.id) return;
    setDetailLoading(true);
    try {
      const data = await api.get(`/devices/${device.id}`);
      setDetailTarget((data?.item || device) as Device);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设备详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function submit() {
    let effectiveCustomerId = form.customerId;
    if (!effectiveCustomerId && customerInput.trim()) {
      const normalizedInput = normalizeCustomerSearchText(customerInput);
      const exact = customers.find((customer) => (
        normalizeCustomerSearchText(customerLabel(customer)) === normalizedInput
        || String(customer.id) === customerInput.trim()
      ));
      if (exact) effectiveCustomerId = String(exact.id);
    }

    if (!effectiveCustomerId) {
      setError("请选择客户");
      setCustomerDropdownOpen(true);
      return;
    }
    setSaving(true);
    setError("");
    let createdCount = 0;
    const normalizationNotices: ModelNormalizationNotice[] = [];
    const normalizationJobs: ModelNormalizationJob[] = [];
    try {
      const maintenanceType = canonicalMaintenanceType(form.maintenanceType);
      const commonPayload: Record<string, unknown> = {
        customerId: effectiveCustomerId,
        maintenanceType,
        maintenancePartyId: maintenanceTypeHasParty(maintenanceType) ? form.maintenancePartyId || null : null,
        maintenanceStart: form.maintenanceStart || undefined,
        maintenanceEnd: form.maintenanceEnd || undefined,
        location: form.location.trim() || undefined,
        status: form.status,
        remark: form.remark.trim() || undefined,
      };

      if (!editingId && createMode === "bulk") {
        const defaultModel = form.model.trim();
        const rows = batchRows
          .map((row, index) => ({
            index,
            name: row.name.trim(),
            model: row.model.trim() || defaultModel,
            serialNo: row.serialNo.trim(),
            mrNo: row.mrNo.trim(),
            hasInput: batchRowHasInput(row),
          }))
          .filter((row) => row.hasInput);

        if (!rows.length) {
          setError("请至少填写一台设备");
          return;
        }
        const missingModel = rows.find((row) => !row.model);
        if (missingModel) {
          setError(`第 ${missingModel.index + 1} 行缺少设备型号，请填写该行型号或上方默认型号`);
          return;
        }
        const missingSerialNo = rows.find((row) => !row.serialNo);
        if (missingSerialNo) {
          setError(`第 ${missingSerialNo.index + 1} 行缺少 S/N 序列号`);
          return;
        }

        for (const row of rows) {
          const data = await api.post("/devices", {
            ...commonPayload,
            name: row.name || null,
            model: row.model,
            serialNo: row.serialNo || undefined,
            mrNo: row.mrNo || undefined,
          });
          const notice = modelNormalizationNotice(data);
          if (notice) normalizationNotices.push(notice);
          const job = extractModelNormalizationJob(data);
          if (job) normalizationJobs.push(job);
          createdCount += 1;
        }
      } else {
        if (!form.model.trim()) {
          setError("请输入设备型号");
          return;
        }
        if (!form.serialNo.trim()) {
          setError("请输入 S/N 序列号");
          return;
        }
        const payload: Record<string, unknown> = {
          ...commonPayload,
          name: form.name.trim() || null,
          model: form.model.trim(),
          pn: form.pn.trim() || undefined,
          serialNo: form.serialNo.trim() || undefined,
          mrNo: form.mrNo.trim() || undefined,
        };
        if (editingId) {
          await api.put(`/devices/${editingId}`, payload);
        } else {
          const data = await api.post("/devices", payload);
          const notice = modelNormalizationNotice(data);
          if (notice) normalizationNotices.push(notice);
          const job = extractModelNormalizationJob(data);
          if (job) normalizationJobs.push(job);
        }
      }
      setDialogOpen(false);
      showModelNormalizationNotices(normalizationNotices);
      trackModelNormalizationJobs(normalizationJobs);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setError(createdCount ? `已新增 ${createdCount} 台设备，后续保存失败：${msg}` : msg);
      if (createdCount) await load();
    } finally {
      setSaving(false);
    }
  }

  function scheduleCustomerSearch(value: string) {
    if (customerSearchTimer) window.clearTimeout(customerSearchTimer);
    const keyword = value.trim();
    if (!keyword) {
      setCustomerSearchLoading(false);
      return;
    }
    const timerId = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const sortLocale = encodeURIComponent("zh-Hans-CN");
        const data = await api.get(`/customers?pageSize=50&keyword=${encodeURIComponent(keyword)}&sortLocale=${sortLocale}`);
        setCustomers((prev) => mergeCustomers(prev, (data?.items || []) as Customer[]));
      } catch {
        // Keep local matches usable when remote customer search is unavailable.
      } finally {
        setCustomerSearchLoading(false);
      }
    }, 220);
    setCustomerSearchTimer(timerId);
  }

  function applyCustomer(customer: Customer) {
    setForm((prev) => ({ ...prev, customerId: String(customer.id) }));
    setCustomerInput(customerLabel(customer));
    setCustomerDropdownOpen(false);
  }

  function scheduleModelSearch(value: string, target: ModelSuggestionTarget = { type: "form" }) {
    if (modelSearchTimerRef.current) window.clearTimeout(modelSearchTimerRef.current);
    const keyword = value.trim();
    const requestId = ++modelSearchRequestRef.current;
    setModelSuggestionTarget(target);
    if (keyword.length < 2) {
      setModelSuggestions([]);
      setModelLoading(false);
      setModelDropdownOpen(false);
      return;
    }
    setModelDropdownOpen(true);
    const timerId = window.setTimeout(async () => {
      setModelLoading(true);
      try {
        const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`);
        if (requestId === modelSearchRequestRef.current) {
          setModelSuggestions((data?.items || []) as ModelSuggestion[]);
        }
      } catch {
        if (requestId === modelSearchRequestRef.current) {
          setModelSuggestions([]);
        }
      } finally {
        if (requestId === modelSearchRequestRef.current) {
          setModelLoading(false);
        }
      }
    }, 250);
    modelSearchTimerRef.current = timerId;
  }

  function showModelSuggestionsFor(target: ModelSuggestionTarget, value: string) {
    setModelSuggestionTarget(target);
    if (value.trim().length >= 2) {
      if (modelSuggestions.length || modelLoading) setModelDropdownOpen(true);
      else scheduleModelSearch(value, target);
    }
  }

  function isModelSuggestionTarget(target: ModelSuggestionTarget) {
    return modelSuggestionTarget.type === target.type
      && (target.type !== "batch" || (modelSuggestionTarget.type === "batch" && modelSuggestionTarget.index === target.index));
  }

  function applyModelSuggestion(suggestion: ModelSuggestion) {
    const model = suggestion.canonicalModel || suggestion.partNumber || "";
    if (!model) return;
    if (modelSuggestionTarget.type === "batch") {
      updateBatchRow(modelSuggestionTarget.index, "model", model);
    } else {
      setForm((prev) => ({
        ...prev,
        model,
      }));
    }
    setModelSuggestions([]);
    setModelDropdownOpen(false);
  }

  function renderModelSuggestionDropdown(target: ModelSuggestionTarget) {
    if (!modelDropdownOpen || !isModelSuggestionTarget(target) || (!modelLoading && !modelSuggestions.length)) return null;
    return (
      <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-56 overflow-auto">
        {modelLoading ? (
          <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 搜索型号中…
          </div>
        ) : null}
        {modelSuggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.canonicalModel}-${suggestion.partNumber}-${index}`}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyModelSuggestion(suggestion)}
          >
            <Check className="w-4 h-4 mt-0.5 text-primary" />
            <span>
              <span className="font-medium">{suggestion.canonicalModel || suggestion.partNumber}</span>
              <span className="block text-xs text-muted-foreground">
                {[suggestion.brand, suggestion.partNumber, suggestion.category].filter(Boolean).join(" · ") || "标准型号"}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  async function deleteDevice(device: Device) {
    if (!device.id) return;
    const label = deviceDisplayName(device);
    if (!window.confirm(`确认删除设备「${label}」？有关联数据的设备会提示原因，可再选择强制删除。`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/devices/${device.id}`);
      if (detailTarget && String(detailTarget.id) === String(device.id)) setDetailTarget(null);
      await load();
      toast.success(`已删除设备「${label}」`);
    } catch (e) {
      const details = apiErrorDetails(e);
      const message = e instanceof Error ? e.message : "删除失败";
      if (details?.code === "DEVICE_DELETE_BLOCKED" && details.canForceDelete) {
        const reason = formatDeviceDeleteBlockedDetails(details);
        setError(`${message}\n${reason}`);
        const confirmed = window.confirm(`${message}\n\n${reason}\n\n是否强制删除该设备？强制删除会解除设备与上述工单、部件记录、巡检计划的关联，但不会删除工单或客户。`);
        if (confirmed) {
          try {
            await api.delete(`/devices/${device.id}?force=1`);
            if (detailTarget && String(detailTarget.id) === String(device.id)) setDetailTarget(null);
            await load();
            setError("");
            toast.success(`已强制删除设备「${label}」`);
          } catch (forceError) {
            setError(forceError instanceof Error ? forceError.message : "强制删除失败");
          }
        }
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteDevices() {
    if (!selectedDeviceIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedDeviceIds.length} 台设备？有关联数据的设备会提示原因，可再选择强制删除。`)) return;
    setSaving(true);
    setError("");
    try {
      const failed: Array<{ id: string; message: string; details?: DeviceDeleteBlockedDetails | null }> = [];
      let deletedCount = 0;
      for (const id of selectedDeviceIds) {
        try {
          await api.delete(`/devices/${id}`);
          deletedCount += 1;
        } catch (error) {
          failed.push({
            id,
            message: error instanceof Error ? error.message : "删除失败",
            details: apiErrorDetails(error),
          });
        }
      }

      if (!failed.length) {
        if (detailTarget && selectedDeviceIds.includes(String(detailTarget.id))) setDetailTarget(null);
        setSelectedDeviceIds([]);
        await load();
        toast.success(`已删除 ${deletedCount} 台设备`);
        return;
      }

      const blocked = failed.filter((item) => item.details?.code === "DEVICE_DELETE_BLOCKED" && item.details.canForceDelete);
      const nonForceFailures = failed.filter((item) => !blocked.includes(item));
      const reason = blocked
        .map((item, index) => `${index + 1}. ${formatDeviceDeleteBlockedDetails(item.details as DeviceDeleteBlockedDetails)}`)
        .join("\n\n");
      const summary = [
        deletedCount ? `已删除 ${deletedCount} 台设备。` : "",
        nonForceFailures.length ? `有 ${nonForceFailures.length} 台删除失败：${nonForceFailures.map((item) => item.message).join("；")}` : "",
        blocked.length ? `有 ${blocked.length} 台设备存在关联数据：\n${reason}` : "",
      ].filter(Boolean).join("\n\n");
      setError(summary);

      if (blocked.length) {
        const confirmed = window.confirm(`${summary}\n\n是否强制删除这些有关联数据的设备？强制删除会解除设备与上述工单、部件记录、巡检计划的关联，但不会删除工单或客户。`);
        if (confirmed) {
          let forcedCount = 0;
          const forceFailures: Array<{ id: string; message: string }> = [];
          for (const item of blocked) {
            try {
              await api.delete(`/devices/${item.id}?force=1`);
              forcedCount += 1;
            } catch (error) {
              forceFailures.push({
                id: item.id,
                message: error instanceof Error ? error.message : `设备 #${item.id} 强制删除失败`,
              });
            }
          }
          if (detailTarget && selectedDeviceIds.includes(String(detailTarget.id))) setDetailTarget(null);
          if (forceFailures.length) {
            setError(`已强制删除 ${forcedCount} 台设备，${forceFailures.length} 台失败：${forceFailures.map((item) => item.message).join("；")}`);
          } else {
            setError("");
            toast.success(`已删除 ${deletedCount} 台，强制删除 ${forcedCount} 台`);
          }
          const remainingIds = new Set([
            ...nonForceFailures.map((item) => item.id),
            ...forceFailures.map((item) => item.id),
          ]);
          setSelectedDeviceIds((ids) => ids.filter((id) => remainingIds.has(id)));
        } else {
          setSelectedDeviceIds((ids) => ids.filter((id) => failed.some((item) => item.id === id)));
        }
      } else {
        setSelectedDeviceIds((ids) => ids.filter((id) => failed.some((item) => item.id === id)));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量删除失败");
      await load();
    } finally {
      setSaving(false);
    }
  }

  function openBatchEdit() {
    setError("");
    setBatchEditForm(createEmptyBatchEditForm());
    setBatchEditToggles(createEmptyBatchEditToggles());
    setBatchEditOpen(true);
  }

  function openImportDialog() {
    setError("");
    setImportFile(null);
    setImportResult(null);
    if (importFileInputRef.current) importFileInputRef.current.value = "";
    setImportOpen(true);
  }

  async function submitImport(mode: "check" | "confirm" | "skip" = "check") {
    if (!importFile) {
      setError("请选择要导入的 Excel 文件");
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (mode === "confirm") {
        formData.append("confirmImportCorrections", "1");
        formData.append("confirmModelCorrections", "1");
      }
      if (mode === "skip") {
        formData.append("skipImportCorrections", "1");
        formData.append("skipModelCorrections", "1");
      }
      const data = await api.postForm("/devices/import", formData);
      const result = {
        created: Number(data?.created || 0),
        failed: Number(data?.failed || 0),
        errors: Array.isArray(data?.errors) ? data.errors : [],
        requiresImportConfirmation: Boolean(data?.requiresImportConfirmation),
        requiresModelConfirmation: Boolean(data?.requiresModelConfirmation),
        customerCorrections: Array.isArray(data?.customerCorrections) ? data.customerCorrections : [],
        modelCorrections: Array.isArray(data?.modelCorrections) ? data.modelCorrections : [],
      };
      setImportResult(result);
      if (!result.requiresImportConfirmation && !result.requiresModelConfirmation) await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  function openMaintenanceImportDialog() {
    setError("");
    setMaintenanceImportFile(null);
    setMaintenanceImportPreview(null);
    setMaintenanceImportColumns({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
    setMaintenanceImportMappingDirty(false);
    setMaintenanceImportSelectedIds([]);
    if (maintenanceImportFileInputRef.current) maintenanceImportFileInputRef.current.value = "";
    setMaintenanceImportOpen(true);
  }

  function maintenanceImportFormData(includeColumns: boolean, selectedDeviceIds?: string[]) {
    if (!maintenanceImportFile) return null;
    const formData = new FormData();
    formData.append("file", maintenanceImportFile);
    if (includeColumns) {
      formData.append("serialNoColumn", maintenanceImportColumns.serialNo);
      formData.append("maintenanceStartColumn", maintenanceImportColumns.maintenanceStart);
      formData.append("maintenanceEndColumn", maintenanceImportColumns.maintenanceEnd);
    }
    if (selectedDeviceIds) formData.append("selectedDeviceIds", JSON.stringify(selectedDeviceIds));
    return formData;
  }

  async function previewMaintenanceImport(includeColumns = false) {
    const formData = maintenanceImportFormData(includeColumns);
    if (!formData) {
      setError("请选择要导入的 Excel 文件");
      return;
    }
    setMaintenanceImporting(true);
    setError("");
    try {
      const data = await api.postForm("/devices/maintenance-import/preview", formData) as MaintenanceImportPreview;
      setMaintenanceImportPreview(data);
      setMaintenanceImportColumns({
        serialNo: String(data.columns.serialNo),
        maintenanceStart: String(data.columns.maintenanceStart),
        maintenanceEnd: String(data.columns.maintenanceEnd),
      });
      setMaintenanceImportMappingDirty(false);
      setMaintenanceImportSelectedIds(data.items
        .filter((item) => item.status === "updatable" && item.deviceId !== undefined)
        .map((item) => String(item.deviceId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "维保文件识别失败");
    } finally {
      setMaintenanceImporting(false);
    }
  }

  async function applyMaintenanceImport() {
    const formData = maintenanceImportFormData(true, maintenanceImportSelectedIds);
    if (!formData || !maintenanceImportPreview) return;
    setMaintenanceImporting(true);
    setError("");
    try {
      const data = await api.postForm("/devices/maintenance-import/apply", formData);
      const updated = Number(data?.updated || 0);
      toast.success(`已更新 ${updated} 台设备的原厂维保日期`);
      setMaintenanceImportOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "维保日期更新失败");
    } finally {
      setMaintenanceImporting(false);
    }
  }

  function modelCompareTargetIds() {
    const source = selectedDeviceIds.length
      ? selectedDeviceIds
      : filtered.map((device) => String(device.id)).filter(Boolean);
    return [...new Set(source)].slice(0, 200);
  }

  function normalizeModelCompareResult(data: unknown): ExistingModelNormalizationResult {
    const payload = (data || {}) as Partial<ExistingModelNormalizationResult>;
    return {
      scanned: Number(payload.scanned || 0),
      matched: Number(payload.matched || 0),
      issueCount: Number(payload.issueCount || 0),
      correctableCount: Number(payload.correctableCount || 0),
      unresolvedCount: Number(payload.unresolvedCount || 0),
      catalogCreatedCount: Number(payload.catalogCreatedCount || 0),
      items: Array.isArray(payload.items) ? payload.items : [],
    };
  }

  async function compareExistingDeviceModels() {
    const ids = modelCompareTargetIds();
    if (!ids.length) {
      setError("当前列表没有可比对的设备");
      return;
    }
    setModelComparing(true);
    setModelCompareProgress(0);
    setError("");
    try {
      const result: ExistingModelNormalizationResult = {
        scanned: 0,
        matched: 0,
        issueCount: 0,
        correctableCount: 0,
        unresolvedCount: 0,
        catalogCreatedCount: 0,
        items: [],
      };
      const chunkSize = 10;
      for (let start = 0; start < ids.length; start += chunkSize) {
        const chunk = ids.slice(start, start + chunkSize);
        const data = await api.post("/devices/model-normalizations/preview", { ids: chunk });
        const part = normalizeModelCompareResult(data);
        result.scanned += part.scanned;
        result.matched += part.matched;
        result.issueCount += part.issueCount;
        result.correctableCount += part.correctableCount;
        result.unresolvedCount += part.unresolvedCount;
        result.catalogCreatedCount += part.catalogCreatedCount;
        result.items.push(...part.items);
        setModelCompareProgress(Math.min(99, Math.round(((start + chunk.length) / ids.length) * 100)));
      }
      setModelCompareProgress(100);
      setModelCompareResult(result);
      setModelCompareOpen(true);
      if (!result.items.length) toast.success("当前设备型号均已匹配型号库");
    } catch (e) {
      setError(e instanceof Error ? e.message : "型号校正失败");
    } finally {
      setModelComparing(false);
    }
  }

  async function applyExistingModelNormalizations() {
    const ids = (modelCompareResult?.items || [])
      .filter((item) => item.canApply)
      .map((item) => String(item.id))
      .filter(Boolean);
    if (!ids.length) return;
    setModelApplying(true);
    setError("");
    try {
      const data = await api.post("/devices/model-normalizations/apply", { ids });
      const updated = Number((data as { updated?: number })?.updated || 0);
      toast.success(`已纠正 ${updated} 台设备型号`);
      setModelCompareOpen(false);
      setModelCompareResult(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "型号纠正失败");
    } finally {
      setModelApplying(false);
    }
  }

  async function submitBatchEdit() {
    const fields: Record<string, unknown> = {};
    if (batchEditToggles.maintenanceType) {
      fields.maintenanceType = canonicalMaintenanceType(batchEditForm.maintenanceType);
      if (maintenanceTypeHasParty(String(fields.maintenanceType || "")) && batchEditToggles.maintenancePartyId) {
        fields.maintenancePartyId = batchEditForm.maintenancePartyId || null;
      }
    } else if (batchEditToggles.maintenancePartyId) {
      fields.maintenancePartyId = batchEditForm.maintenancePartyId || null;
    }
    if (batchEditToggles.maintenanceStart) fields.maintenanceStart = batchEditForm.maintenanceStart || null;
    if (batchEditToggles.maintenanceEnd) fields.maintenanceEnd = batchEditForm.maintenanceEnd || null;
    if (batchEditToggles.warrantyUntil) fields.warrantyUntil = batchEditForm.warrantyUntil || null;
    if (batchEditToggles.mrNo) fields.mrNo = batchEditForm.mrNo.trim() || null;
    if (batchEditToggles.location) fields.location = batchEditForm.location.trim() || null;
    if (batchEditToggles.remark) fields.remark = batchEditForm.remark.trim() || null;

    if (Object.keys(fields).length === 0) {
      setError("请至少勾选一个要修改的字段");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.put("/devices/batch", { ids: selectedDeviceIds, fields });
      setBatchEditOpen(false);
      setSelectedDeviceIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量编辑失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">设备资产</h1>
          <p className="text-muted-foreground mt-1">管理客户设备和维保信息</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-nowrap">
          <Button className="shrink-0 whitespace-nowrap" variant="outline" onClick={() => load(searchQuery)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          {canCreateDevices || canEditDevices ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shrink-0 whitespace-nowrap" variant="outline" disabled={importing || maintenanceImporting}>
                  {importing || maintenanceImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  批量导入
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canCreateDevices ? (
                  <>
                    <DropdownMenuItem onSelect={handleDownloadImportTemplate}>
                      <Download className="w-4 h-4 mr-2" />
                      下载导入模板
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openImportDialog}>
                      <Upload className="w-4 h-4 mr-2" />
                      上传已填模板
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openBulkCreate}>
                      <Plus className="w-4 h-4 mr-2" />
                      页面批量新增
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canEditDevices ? (
                  <DropdownMenuItem onSelect={openMaintenanceImportDialog}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    导入原厂维保日期
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button
            className="shrink-0 whitespace-nowrap"
            variant="outline"
            onClick={handleExportDevices}
            disabled={exporting || loading || !filtered.length}
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            批量导出
          </Button>
          {canEditDevices ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shrink-0 whitespace-nowrap" variant="outline" disabled={loading}>
                  {modelComparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MoreHorizontal className="w-4 h-4 mr-2" />}
                  {modelComparing ? `校正 ${modelCompareProgress}%` : "其他"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={compareExistingDeviceModels} disabled={modelComparing || loading || !filtered.length}>
                  {modelComparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  {modelComparing ? `型号校正 ${modelCompareProgress}%` : "型号校正"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canCreateDevices ? (
            <Button className="shrink-0 whitespace-nowrap" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              新增设备
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                {initialLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索设备名称、型号、序列号、MR单…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(searchQuery);
                }}
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="全部客户" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部客户</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name || `客户 #${c.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={maintenanceFilter} onValueChange={setMaintenanceFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="维保类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="pending_confirmation">待确认</SelectItem>
                <SelectItem value="our_maintenance">我方维保</SelectItem>
                <SelectItem value="original_manufacturer">原厂维保</SelectItem>
                <SelectItem value="none">无维保</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[130px]">
                <SelectValue placeholder="设备状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">{DEVICE_STATUS_LABELS.active}</SelectItem>
                <SelectItem value="maintenance">{DEVICE_STATUS_LABELS.maintenance}</SelectItem>
                <SelectItem value="inactive">{DEVICE_STATUS_LABELS.inactive}</SelectItem>
                <SelectItem value="scrapped">{DEVICE_STATUS_LABELS.scrapped}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setCustomerFilter("all");
                setMaintenanceFilter("all");
                setStatusFilter("all");
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>设备列表 ({filtered.length})</CardTitle>
              {refreshing ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在更新
                </span>
              ) : null}
            </div>
            {canManageDevices ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allFilteredDevicesSelected}
                    onCheckedChange={toggleAllFilteredDevices}
                    disabled={saving || filtered.length === 0}
                    aria-label="全选当前设备列表"
                  />
                  全选当前列表
                </label>
                {selectedDeviceIds.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDeviceIds([])} disabled={saving}>
                    清空选择
                  </Button>
                ) : null}
                {canEditDevices ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openBatchEdit}
                    disabled={saving || !selectedDeviceIds.length}
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    批量编辑{selectedDeviceIds.length ? ` (${selectedDeviceIds.length})` : ""}
                  </Button>
                ) : null}
                {canDeleteDevices ? (
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={bulkDeleteDevices}
                    disabled={saving || !selectedDeviceIds.length}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    批量删除{selectedDeviceIds.length ? ` (${selectedDeviceIds.length})` : ""}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto rounded-md border">
            {initialLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在加载…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">未找到匹配设备</div>
            ) : (
              <div className={deviceTableMinWidth}>
                <div className={`sticky top-0 z-10 hidden border-b bg-muted/70 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur md:grid ${deviceTableGrid} md:items-center md:gap-4`}>
                  {canSelectDevices ? <div aria-hidden="true" /> : null}
                  <div aria-hidden="true" />
                  <div className="min-w-0 text-left">型号 / 客户</div>
                  <div className="min-w-0 text-left">SN</div>
                  <div className="text-left">MR单</div>
                  <div className="text-center">维保类型</div>
                  <div className="min-w-0 text-left">维保方 / 截止</div>
                  <div className="text-center">状态</div>
                  {canManageDevices ? <div className="text-center">操作</div> : null}
                </div>
                {filtered.map((device) => {
                  const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
                  const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
                  const statusLabel = DEVICE_STATUS_LABELS[device.status || ""] || device.status || "在用";
                  const selected = selectedDeviceIds.includes(String(device.id));
                  return (
                    <div
                      key={device.id}
                      role="button"
                      tabIndex={0}
                      className={`grid cursor-pointer grid-cols-1 gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-accent/30 md:grid ${deviceTableGrid} md:items-center md:gap-4`}
                      onClick={() => openDetail(device)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDetail(device);
                        }
                      }}
                    >
                      {canSelectDevices ? (
                        <div className="flex items-center md:justify-center" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => toggleDeviceSelection(device.id, checked)}
                            disabled={saving}
                            aria-label={`选择设备 ${deviceDisplayName(device)}`}
                          />
                        </div>
                      ) : null}
                      <Server className="hidden h-5 w-5 text-primary md:block" />
                      <div className="min-w-0">
                        {device.model ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-primary hover:underline"
                            title={device.model}
                            onClick={(event) => filterByModel(event, device.model)}
                          >
                            {device.model}
                          </button>
                        ) : (
                          <div className="truncate font-medium">-</div>
                        )}
                        {device.customerName ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm text-muted-foreground hover:text-primary hover:underline"
                            title={device.customerName}
                            onClick={(event) => filterByCustomer(event, device)}
                          >
                            {device.customerName}
                          </button>
                        ) : (
                          <div className="truncate text-sm text-muted-foreground">-</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground md:hidden">SN</div>
                        <div className="truncate text-sm" title={device.serialNo || "-"}>{device.serialNo || "-"}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground md:hidden">MR单</div>
                        <div className="truncate text-sm" title={device.mrNo || "-"}>{device.mrNo || "-"}</div>
                      </div>
                      <div className="flex md:justify-center">
                        <button type="button" className="inline-flex" onClick={(event) => filterByMaintenanceType(event, maintenanceType)}>
                          <Badge
                            variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}
                            className={`${DEVICE_BADGE_CLASS} cursor-pointer hover:ring-2 hover:ring-primary/20 ${maintenanceFilter === maintenanceType ? "ring-2 ring-primary/30" : ""}`}
                          >
                            {typeLabel}
                          </Badge>
                        </button>
                      </div>
                      <div className="min-w-0">
                        {device.maintenancePartyName ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-primary hover:underline"
                            title={device.maintenancePartyName}
                            onClick={(event) => filterByMaintenanceParty(event, device.maintenancePartyName)}
                          >
                            {device.maintenancePartyName}
                          </button>
                        ) : (
                          <div className="truncate text-sm">-</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          截止 {formatDate(device.maintenanceEnd)}
                        </div>
                      </div>
                      <div className="flex md:justify-center">
                        <button type="button" className="inline-flex" onClick={(event) => filterByStatus(event, device.status)}>
                          <Badge
                            variant={DEVICE_STATUS_BADGE[device.status || "active"] || "secondary"}
                            className={`${DEVICE_STATUS_BADGE_CLASS} cursor-pointer hover:ring-2 hover:ring-primary/20 ${statusFilter === (device.status || "active") ? "ring-2 ring-primary/30" : ""}`}
                          >
                            {statusLabel}
                          </Badge>
                        </button>
                      </div>
                      {canManageDevices ? (
                        <div className="flex gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
                          {canEditDevices ? (
                            <Button variant="ghost" size="sm" className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900" onClick={() => openEdit(device)}>
                              <Pencil className="w-4 h-4 mr-1" />
                              编辑
                            </Button>
                          ) : null}
                          {canDeleteDevices ? (
                            <Button variant="ghost" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => deleteDevice(device)} disabled={saving}>
                              <Trash2 className="w-4 h-4 mr-1" />
                              删除
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[760px]">
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>设备详情</DialogTitle>
            <DialogDescription>设备基础信息、客户归属、维保状态与部件历史</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const maintenanceType = canonicalMaintenanceType(detailTarget.maintenanceType);
            const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
            const statusLabel = DEVICE_STATUS_LABELS[detailTarget.status || ""] || detailTarget.status || "在用";
            const relatedServiceOrders = Array.isArray(detailTarget.relatedServiceOrders) ? detailTarget.relatedServiceOrders : [];
            const partHistory = Array.isArray(detailTarget.partHistory) ? detailTarget.partHistory : [];
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在加载完整设备详情…
                    </div>
                  ) : null}

                  <div className="rounded-lg border bg-slate-50/60 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-7 text-slate-900">
                          {detailTarget.model || "-"}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{detailTarget.customerName || "-"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={DEVICE_STATUS_BADGE[detailTarget.status || "active"] || "secondary"}>{statusLabel}</Badge>
                        <Badge variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}>{typeLabel}</Badge>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">型号</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.model || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">SN</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.serialNo || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">MR单</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.mrNo || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">维保方</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.maintenancePartyName || "-"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">资产信息</div>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">客户</div>
                          <div className="mt-1">{detailTarget.customerName || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">主机名</div>
                          <div className="mt-1">{detailTarget.name || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">安装位置</div>
                          <div className="mt-1">{detailTarget.location || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">创建时间</div>
                          <div className="mt-1">{formatDate(detailTarget.createdAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">最近更新</div>
                          <div className="mt-1">{formatDate(detailTarget.updatedAt)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">维保信息</div>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">维保类型</div>
                          <div className="mt-1"><Badge variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}>{typeLabel}</Badge></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维保方</div>
                          <div className="mt-1">{detailTarget.maintenancePartyName || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维保周期</div>
                          <div className="mt-1">
                            {formatDate(detailTarget.maintenanceStart)} 至 {formatDate(detailTarget.maintenanceEnd)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">质保截止</div>
                          <div className="mt-1">{formatDate(detailTarget.warrantyUntil)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">备注</div>
                    <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
                      {detailTarget.remark || "-"}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">关联工单</div>
                        <div className="mt-1 text-xs text-muted-foreground">引用这台设备的服务单、安装来源和部件记录</div>
                      </div>
                      <Badge variant="secondary">{relatedServiceOrders.length} 张</Badge>
                    </div>
                    {relatedServiceOrders.length ? (
                      <div className="mt-3 grid gap-3">
                        {relatedServiceOrders.map((order) => (
                          <div key={`${order.id}-${order.relationType || "order"}`} className="rounded-md border bg-slate-50/60 p-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={order.status === "cancelled" ? "destructive" : "secondary"}>
                                    {orderStatusLabel(order.status)}
                                  </Badge>
                                  <Badge variant="outline">{orderRelationLabel(order.relationType)}</Badge>
                                  <span className="font-medium text-slate-900">{order.orderNo || `工单 #${order.id}`}</span>
                                </div>
                                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {serviceTypeLabel(order.serviceType)}
                                  {order.serviceAt || order.createdAt ? ` · ${formatDate(order.serviceAt || order.createdAt)}` : ""}
                                  {order.engineerName ? ` · ${order.engineerName}` : ""}
                                </div>
                                {order.issueDescription ? (
                                  <div className="mt-2 rounded bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700">
                                    {compactText(order.issueDescription)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                        暂无关联工单
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">硬件部件安装与备件更换记录</div>
                        <div className="mt-1 text-xs text-muted-foreground">来自服务记录中关联到这台设备的硬件部件安装、备件更换记录</div>
                      </div>
                      <Badge variant="secondary">{partHistory.length} 条</Badge>
                    </div>
                    {partHistory.length ? (
                      <div className="mt-3 grid gap-3">
                        {partHistory.map((item) => (
                          <div key={item.id} className="rounded-md border bg-slate-50/60 p-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={item.actionType === "replacement" ? "warning" : item.actionType === "installation" ? "success" : "secondary"}>
                                    {partActionLabel(item.actionType)}
                                  </Badge>
                                  <span className="font-medium text-slate-900">{item.partName || "未命名部件"}</span>
                                </div>
                                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {formatDate(item.serviceAt || item.createdAt)}
                                  {item.orderNo ? ` · ${item.orderNo}` : ""}
                                  {item.engineerName ? ` · ${item.engineerName}` : ""}
                                </div>
                                <div className="text-sm leading-6 text-muted-foreground">
                                  {serviceTypeLabel(item.serviceType)}
                                  {item.partNo ? ` · PN ${item.partNo}` : ""}
                                  {item.quantity ? ` · 数量 ${partQuantityText(item)}` : ""}
                                </div>
                                {item.remark || item.issueDescription || item.workContent ? (
                                  <div className="mt-2 rounded bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700">
                                    {compactText(item.remark || item.issueDescription || item.workContent)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                        暂无硬件部件安装或备件更换记录
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : null}
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              关闭
            </Button>
            {detailTarget && canEditDevices ? (
              <Button onClick={() => {
                const target = detailTarget;
                setDetailTarget(null);
                openEdit(target);
              }}>
                <Pencil className="w-4 h-4 mr-2" />
                编辑
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setError("");
            setModelDropdownOpen(false);
            setModelSuggestions([]);
            setModelSuggestionTarget({ type: "form" });
          }
        }}
      >
        <DialogContent
          className={`max-h-[85vh] overflow-y-auto ${!editingId && createMode === "bulk" ? "sm:max-w-[980px]" : "sm:max-w-[640px]"}`}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑设备" : createMode === "bulk" ? "批量新增设备" : "新增设备"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "更新设备信息"
                : createMode === "bulk"
                  ? "公共信息填一次，每行保存为一台设备"
                  : "填写设备信息后提交保存"}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" ref={modelDropdownRef}>
              <div className="space-y-2 md:col-span-2">
                <Label>客户 *</Label>
                <div className="relative">
                  <Input
                    value={customerInput}
                    onFocus={() => setCustomerDropdownOpen(true)}
                    onBlur={() => window.setTimeout(() => setCustomerDropdownOpen(false), 120)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomerInput(value);
                      setCustomerDropdownOpen(true);
                      if (!selectedCustomer || normalizeCustomerSearchText(value) !== normalizeCustomerSearchText(customerLabel(selectedCustomer))) {
                        setForm((prev) => ({ ...prev, customerId: "" }));
                      }
                      scheduleCustomerSearch(value);
                    }}
                    placeholder="输入客户名称关键词搜索"
                  />
                  <DeviceCustomerSuggestions
                    open={customerDropdownOpen}
                    searching={customerSearchLoading}
                    recentCustomers={dialogRecentCustomers}
                    groups={dialogCustomerGroups}
                    selectedCustomerId={form.customerId}
                    onSelect={applyCustomer}
                  />
                </div>
              </div>
              {!editingId && createMode === "bulk" ? (
                <div className="space-y-2 relative md:col-span-2">
                  <Label>默认设备型号</Label>
                  <Input
                    value={form.model}
                    onFocus={() => showModelSuggestionsFor({ type: "form" }, form.model)}
                    onChange={(e) => {
                      setForm({ ...form, model: e.target.value });
                      scheduleModelSearch(e.target.value, { type: "form" });
                    }}
                    placeholder="同型号设备可在这里填一次，每行也可单独覆盖"
                  />
                  {renderModelSuggestionDropdown({ type: "form" })}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>主机名</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="例如 sz5eap01；多个值用 ; 隔开，可不填"
                    />
                  </div>
                  <div className="space-y-2 relative">
                    <Label>设备型号 *</Label>
                    <Input
                      value={form.model}
                      onFocus={() => showModelSuggestionsFor({ type: "form" }, form.model)}
                      onChange={(e) => {
                        setForm({ ...form, model: e.target.value });
                        scheduleModelSearch(e.target.value, { type: "form" });
                      }}
                      placeholder="例如 PowerEdge R740"
                    />
                    {renderModelSuggestionDropdown({ type: "form" })}
                  </div>
                  <div className="space-y-2">
                    <Label>序列号 SN *</Label>
                    <Input
                      value={form.serialNo}
                      onChange={(e) => setForm({ ...form, serialNo: e.target.value })}
                      placeholder="序列号；多个值用 ; 隔开"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>MR单</Label>
                    <Input
                      value={form.mrNo}
                      onChange={(e) => setForm({ ...form, mrNo: e.target.value })}
                      placeholder="MR单号，可不填"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>维保类型</Label>
                  <HelpTooltip label={MAINTENANCE_TYPE_HELP} />
                </div>
                <Select
                  value={form.maintenanceType}
                  onValueChange={(v) => setForm((prev) => ({
                    ...prev,
                    maintenanceType: v,
                    maintenancePartyId: resolveMaintenancePartyId(parties, v, prev.maintenancePartyId),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维保类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending_confirmation">待确认</SelectItem>
                    <SelectItem value="none">无维保</SelectItem>
                    <SelectItem value="our_maintenance">我方维保</SelectItem>
                    <SelectItem value="original_manufacturer">原厂维保</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>维保方</Label>
                <Select
                  value={form.maintenancePartyId}
                  onValueChange={(v) => setForm({ ...form, maintenancePartyId: v })}
                  disabled={!maintenanceTypeHasParty(form.maintenanceType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={maintenanceTypeHasParty(form.maintenanceType) ? "选择维保方" : MAINTENANCE_TYPE_LABELS[canonicalMaintenanceType(form.maintenanceType)]} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMaintenanceParties.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name || `维保方 #${p.id}`}
                      </SelectItem>
                    ))}
                    {!filteredMaintenanceParties.length ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">当前类型暂无可选维保方</div>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>维保开始</Label>
                <Input
                  type="date"
                  value={form.maintenanceStart}
                  onChange={(e) => setForm({ ...form, maintenanceStart: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>维保截止</Label>
                <Input
                  type="date"
                  value={form.maintenanceEnd}
                  onChange={(e) => setForm({ ...form, maintenanceEnd: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>位置</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="安装位置"
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">在用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                    <SelectItem value="maintenance">维保中</SelectItem>
                    <SelectItem value="scrapped">已报废</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>备注</Label>
                <Textarea
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  rows={2}
                  placeholder="补充说明"
                />
              </div>
              {!editingId && createMode === "bulk" ? (
                <div className="space-y-3 md:col-span-2">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Label>设备明细 *</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        每行一台设备；空行会自动忽略，行内型号为空时使用上方默认型号，S/N 每行必填。
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addBatchRow} disabled={saving}>
                      <Plus className="mr-2 h-4 w-4" />
                      添加一行
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <div className="hidden grid-cols-[1fr_1.2fr_1fr_1fr_44px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                      <span>主机名</span>
                      <span>型号</span>
                      <span>SN *</span>
                      <span>MR单</span>
                      <span />
                    </div>
                    <div className="divide-y">
                      {batchRows.map((row, index) => (
                        <div key={index} className="grid grid-cols-1 gap-2 p-3 md:grid-cols-[1fr_1.2fr_1fr_1fr_44px]">
                          <Input
                            value={row.name}
                            onChange={(e) => updateBatchRow(index, "name", e.target.value)}
                            placeholder={`第 ${index + 1} 台主机名；多个值用 ; 隔开`}
                          />
                          <div className="relative">
                            <Input
                              value={row.model}
                              onFocus={() => showModelSuggestionsFor({ type: "batch", index }, row.model)}
                              onChange={(e) => {
                                updateBatchRow(index, "model", e.target.value);
                                scheduleModelSearch(e.target.value, { type: "batch", index });
                              }}
                              placeholder="型号，空则用默认型号"
                            />
                            {renderModelSuggestionDropdown({ type: "batch", index })}
                          </div>
                          <Input
                            value={row.serialNo}
                            onChange={(e) => updateBatchRow(index, "serialNo", e.target.value)}
                            placeholder="SN 必填；多个值用 ; 隔开"
                          />
                          <Input
                            value={row.mrNo}
                            onChange={(e) => updateBatchRow(index, "mrNo", e.target.value)}
                            placeholder="MR单，可不填"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-self-start text-red-600 hover:text-red-700 md:justify-self-center"
                            onClick={() => removeBatchRow(index)}
                            disabled={saving}
                            aria-label={`删除第 ${index + 1} 行`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : editingId ? "保存修改" : createMode === "bulk" ? "批量保存" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modelCompareOpen}
        onOpenChange={(open) => {
          if (modelApplying) return;
          setModelCompareOpen(open);
          if (!open) setError("");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>设备型号校正</DialogTitle>
            <DialogDescription>
              {selectedDeviceIds.length ? `已选择 ${selectedDeviceIds.length} 台设备` : `当前列表 ${filtered.length} 台设备`}
            </DialogDescription>
          </DialogHeader>
          {modelCompareResult ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-slate-50 px-3 py-2">
                  <div className="text-xs text-muted-foreground">已比对</div>
                  <div className="mt-1 text-xl font-semibold">{modelCompareResult.scanned}</div>
                </div>
                <div className="rounded-md border bg-emerald-50 px-3 py-2">
                  <div className="text-xs text-emerald-700">已匹配</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-800">{modelCompareResult.matched}</div>
                </div>
                <div className="rounded-md border bg-violet-50 px-3 py-2">
                  <div className="text-xs text-violet-700">可纠正</div>
                  <div className="mt-1 text-xl font-semibold text-violet-800">{modelCompareResult.correctableCount}</div>
                </div>
                <div className="rounded-md border bg-amber-50 px-3 py-2">
                  <div className="text-xs text-amber-700">未确认</div>
                  <div className="mt-1 text-xl font-semibold text-amber-800">{modelCompareResult.unresolvedCount}</div>
                </div>
              </div>

              {modelCompareResult.items.length ? (
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    发现 {modelCompareResult.items.length} 台设备型号需要核对
                  </div>
                  <div className="max-h-[420px] overflow-auto divide-y">
                    {modelCompareResult.items.map((item) => (
                      <div key={String(item.id)} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[132px_minmax(180px,0.9fr)_minmax(220px,1fr)_minmax(220px,1fr)] md:items-center">
                        <Badge variant="outline" className={existingModelIssueBadgeClass(item.action)}>
                          {existingModelIssueLabel(item.action)}
                        </Badge>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900" title={item.name || item.customerName || ""}>
                            {item.name || item.customerName || `设备 #${item.id}`}
                          </div>
                          <div className="truncate text-xs text-muted-foreground" title={item.serialNo || ""}>
                            SN：{item.serialNo || "-"}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">当前型号</div>
                          <div className="truncate" title={item.inputModel || ""}>{item.inputModel || "-"}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">建议型号</div>
                          <div className="truncate font-medium text-violet-900" title={item.canonicalModel || ""}>
                            {item.canonicalModel || "-"}
                          </div>
                          {item.message ? <div className="truncate text-xs text-muted-foreground" title={item.message}>{item.message}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  未发现需要纠正的设备型号
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelCompareOpen(false)} disabled={modelApplying}>
              关闭
            </Button>
            <Button
              onClick={applyExistingModelNormalizations}
              disabled={modelApplying || !modelCompareResult?.correctableCount}
            >
              {modelApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {modelApplying ? "纠正中…" : `应用纠正${modelCompareResult?.correctableCount ? ` (${modelCompareResult.correctableCount})` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={maintenanceImportOpen}
        onOpenChange={(open) => {
          setMaintenanceImportOpen(open);
          if (!open) {
            setError("");
            setMaintenanceImportFile(null);
            setMaintenanceImportPreview(null);
            setMaintenanceImportColumns({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
            setMaintenanceImportMappingDirty(false);
            setMaintenanceImportSelectedIds([]);
            if (maintenanceImportFileInputRef.current) maintenanceImportFileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle>导入原厂维保日期</DialogTitle>
            <DialogDescription>
              系统根据已有设备序列号反推 SN 列，再根据日期内容和前后关系识别服务开始、截止列。上传只生成预览，确认后才更新。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>厂商 Excel 文件 *</Label>
              <Input
                ref={maintenanceImportFileInputRef}
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={maintenanceImporting}
                onChange={(event) => {
                  setMaintenanceImportFile(event.target.files?.[0] || null);
                  setMaintenanceImportPreview(null);
                  setMaintenanceImportColumns({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
                  setMaintenanceImportMappingDirty(false);
                  setMaintenanceImportSelectedIds([]);
                }}
              />
              <div className="text-xs text-muted-foreground">支持旧版 .xls 和新版 .xlsx；只更新系统中已存在的 SN，单次最多 1000 台，文件不超过 5MB。</div>
            </div>

            {maintenanceImportPreview ? (
              <>
                <div className={`rounded-md border px-3 py-2 text-sm ${maintenanceImportPreview.requiresColumnConfirmation ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                  工作表“{maintenanceImportPreview.sheetName}”：SN 命中 {maintenanceImportPreview.detected.serialNoMatches} 行；
                  日期完整 {maintenanceImportPreview.detected.dateCompleteRows} 行，其中 {Math.round(maintenanceImportPreview.detected.dateOrderRatio * 100)}% 满足开始不晚于截止。
                  {maintenanceImportPreview.requiresColumnConfirmation ? " 检测到相近候选，请核对下方列并重新分析。" : " 自动识别结果可用于更新。"}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {([
                    ["serialNo", "序列号列"],
                    ["maintenanceStart", "服务开始列"],
                    ["maintenanceEnd", "服务截止列"],
                  ] as const).map(([field, label]) => (
                    <div className="space-y-1.5" key={field}>
                      <Label>{label}</Label>
                      <Select
                        value={maintenanceImportColumns[field]}
                        onValueChange={(value) => {
                          setMaintenanceImportColumns((current) => ({ ...current, [field]: value }));
                          setMaintenanceImportMappingDirty(true);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder={`选择${label}`} /></SelectTrigger>
                        <SelectContent>
                          {maintenanceImportPreview.columnOptions.map((column) => (
                            <SelectItem key={`${field}-${column.index}`} value={String(column.index)}>{column.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  {[
                    ["总行数", maintenanceImportPreview.summary.total, "bg-slate-50 text-slate-800"],
                    ["可更新", maintenanceImportPreview.summary.updatable, "bg-emerald-50 text-emerald-800"],
                    ["无变化", maintenanceImportPreview.summary.unchanged, "bg-sky-50 text-sky-800"],
                    ["未找到", maintenanceImportPreview.summary.notFound, "bg-amber-50 text-amber-800"],
                    ["类型冲突", maintenanceImportPreview.summary.conflicts, "bg-violet-50 text-violet-800"],
                    ["数据异常", maintenanceImportPreview.summary.invalid, "bg-red-50 text-red-800"],
                  ].map(([label, value, color]) => (
                    <div key={String(label)} className={`rounded-md border px-3 py-2 ${color}`}>
                      <div className="text-xs">{label}</div>
                      <div className="mt-1 text-lg font-semibold">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={maintenanceImportUpdatableIds.length > 0 && maintenanceImportSelectedIds.length === maintenanceImportUpdatableIds.length
                          ? true
                          : maintenanceImportSelectedIds.length > 0 ? "indeterminate" : false}
                        disabled={!maintenanceImportUpdatableIds.length}
                        onCheckedChange={(checked) => setMaintenanceImportSelectedIds(checked === true ? maintenanceImportUpdatableIds : [])}
                      />
                      <span className="font-medium">识别明细</span>
                    </div>
                    <span className="text-xs text-muted-foreground">已选择 {maintenanceImportSelectedIds.length} / {maintenanceImportUpdatableIds.length} 台可更新设备</span>
                  </div>
                  <div className="max-h-72 overflow-auto divide-y">
                    {maintenanceImportPreview.items.map((item, index) => (
                      <div key={`${item.rowNumber}-${item.serialNo || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[32px_64px_120px_minmax(140px,1fr)_270px_90px] md:items-center">
                        <Checkbox
                          checked={item.deviceId !== undefined && maintenanceImportSelectedIdSet.has(String(item.deviceId))}
                          disabled={item.status !== "updatable" || item.deviceId === undefined}
                          onCheckedChange={(checked) => {
                            if (item.deviceId === undefined) return;
                            const id = String(item.deviceId);
                            setMaintenanceImportSelectedIds((current) => checked === true
                              ? [...new Set([...current, id])]
                              : current.filter((selectedId) => selectedId !== id));
                          }}
                        />
                        <span>第 {item.rowNumber} 行</span>
                        <span className="truncate font-medium" title={item.serialNo || ""}>{item.serialNo || "-"}</span>
                        <span className="truncate text-muted-foreground" title={[item.customerName, item.model].filter(Boolean).join(" / ")}>{[item.customerName, item.model].filter(Boolean).join(" / ") || "-"}</span>
                        <span className="text-xs text-muted-foreground">
                          原 {item.currentMaintenanceStart || "-"} → {item.currentMaintenanceEnd || "-"}<br />
                          新 {item.maintenanceStart || "-"} → {item.maintenanceEnd || "-"}
                        </span>
                        <span className={item.status === "updatable" ? "text-emerald-700" : item.status === "unchanged" ? "text-sky-700" : "text-amber-700"} title={item.message || ""}>
                          {MAINTENANCE_IMPORT_STATUS_LABELS[item.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                  确认后仅更新已勾选的“可更新”设备，并将其标记为原厂维保；我方维保、无维保、重复 SN、异常行及未勾选设备不会被覆盖。
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceImportOpen(false)} disabled={maintenanceImporting}>关闭</Button>
            {maintenanceImportPreview ? (
              <Button variant="outline" onClick={() => previewMaintenanceImport(true)} disabled={maintenanceImporting || !maintenanceImportFile}>
                {maintenanceImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                {maintenanceImportMappingDirty || maintenanceImportPreview.requiresColumnConfirmation ? "按所选列重新分析" : "重新分析"}
              </Button>
            ) : null}
            {maintenanceImportPreview ? (
              <Button
                onClick={applyMaintenanceImport}
                disabled={maintenanceImporting || maintenanceImportMappingDirty || maintenanceImportPreview.requiresColumnConfirmation || !maintenanceImportSelectedIds.length}
              >
                {maintenanceImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                确认更新 ({maintenanceImportSelectedIds.length})
              </Button>
            ) : (
              <Button onClick={() => previewMaintenanceImport(false)} disabled={maintenanceImporting || !maintenanceImportFile}>
                {maintenanceImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                自动识别并预览
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setError("");
            setImportFile(null);
            setImportResult(null);
            if (importFileInputRef.current) importFileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>导入设备资产</DialogTitle>
            <DialogDescription>
              上传按模板填写的 .xlsx 文件；有效行会写入，失败行会返回原因。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-slate-50/70 p-3 text-sm leading-6 text-muted-foreground">
              只需先填写客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后可在系统中批量补齐或修改。
              客户名称建议填写系统内标准名称；如检测到可唯一匹配的名称，导入前会提示确认纠正；重复 SN 会自动跳过。
            </div>
            <div className="space-y-2">
              <Label>Excel 文件 *</Label>
              <Input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={importing}
                onChange={(event) => {
                  setImportResult(null);
                  setImportFile(event.target.files?.[0] || null);
                }}
              />
              <div className="text-xs text-muted-foreground">单次最多 1000 行，文件不超过 5MB。</div>
            </div>
            {importResult ? (
              <div className="space-y-3">
                {importResult.requiresImportConfirmation || importResult.requiresModelConfirmation ? (
                  <>
                    {importResult.customerCorrections?.length ? (
                      <div className="rounded-md border border-sky-200 bg-sky-50/80">
                        <div className="border-b border-sky-200 px-3 py-2 text-sm font-medium text-sky-900">
                          发现 {importResult.customerCorrections.length} 行客户名称可自动纠正
                        </div>
                        <div className="max-h-64 overflow-auto divide-y divide-sky-100">
                          {importResult.customerCorrections.map((item, index) => (
                            <div key={`${item.rowNumber}-${item.sn || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[88px_minmax(160px,0.85fr)_minmax(240px,1.4fr)] md:items-center">
                              <span className="font-medium text-slate-900">第 {item.rowNumber} 行</span>
                              <span className="truncate text-muted-foreground" title={item.inputCustomerName || ""}>原客户：{item.inputCustomerName || "-"}</span>
                              <span className="truncate text-sky-900" title={item.customerName || ""}>系统客户：{item.customerName || "-"}</span>
                            </div>
                          ))}
                        </div>
                        <div className="px-3 py-2 text-xs text-sky-900">
                          确认后，以上行会绑定到系统客户名称；未列出的行保持 Excel 原值。
                        </div>
                      </div>
                    ) : null}
                    {importResult.modelCorrections?.length ? (
                      <div className="rounded-md border border-violet-200 bg-violet-50/80">
                        <div className="border-b border-violet-200 px-3 py-2 text-sm font-medium text-violet-900">
                          发现 {importResult.modelCorrections.length} 行设备型号可自动纠正
                        </div>
                        <div className="max-h-64 overflow-auto divide-y divide-violet-100">
                          {importResult.modelCorrections.map((item, index) => (
                            <div key={`${item.rowNumber}-${item.sn || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[88px_minmax(160px,0.85fr)_minmax(240px,1.4fr)] md:items-center">
                              <span className="font-medium text-slate-900">第 {item.rowNumber} 行</span>
                              <span className="truncate text-muted-foreground" title={item.inputModel || ""}>原型号：{item.inputModel || "-"}</span>
                              <span className="truncate text-violet-900" title={item.canonicalModel || ""}>标准型号：{item.canonicalModel || "-"}</span>
                            </div>
                          ))}
                        </div>
                        <div className="px-3 py-2 text-xs text-violet-900">
                          确认后，以上行会按标准型号写入；未列出的行保持 Excel 原值。
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      请核对以上建议。确认后会应用这些纠正并继续导入；如按原内容导入，无法匹配客户名称的行仍会失败。
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border bg-emerald-50 px-3 py-2">
                      <div className="text-xs text-emerald-700">成功导入</div>
                      <div className="mt-1 text-xl font-semibold text-emerald-800">{importResult.created}</div>
                    </div>
                    <div className="rounded-md border bg-red-50 px-3 py-2">
                      <div className="text-xs text-red-700">失败行数</div>
                      <div className="mt-1 text-xl font-semibold text-red-800">{importResult.failed}</div>
                    </div>
                  </div>
                )}
                {importResult.errors.length ? (
                  <div className="rounded-md border">
                    <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">失败明细</div>
                    <div className="max-h-64 overflow-auto divide-y">
                      {importResult.errors.map((item, index) => (
                        <div key={`${item.rowNumber}-${item.sn || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[88px_1fr_1.4fr] md:items-center">
                          <span className="font-medium text-slate-900">第 {item.rowNumber} 行</span>
                          <span className="truncate text-muted-foreground" title={item.sn || ""}>SN：{item.sn || "-"}</span>
                          <span className="text-red-600">{item.message || "导入失败"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              关闭
            </Button>
            {importResult?.requiresImportConfirmation || importResult?.requiresModelConfirmation ? (
              <Button variant="outline" onClick={() => submitImport("skip")} disabled={importing || !importFile}>
                按原内容导入
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={async () => {
                setError("");
                try {
                  await downloadDeviceImportTemplate();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "模板下载失败");
                }
              }}
              disabled={importing}
            >
              <Download className="w-4 h-4 mr-2" />
              下载模板
            </Button>
            <Button
              onClick={() => submitImport((importResult?.requiresImportConfirmation || importResult?.requiresModelConfirmation) ? "confirm" : "check")}
              disabled={importing || !importFile}
            >
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {importing ? "导入中…" : (importResult?.requiresImportConfirmation || importResult?.requiresModelConfirmation) ? "确认纠正并导入" : "开始导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batchEditOpen}
        onOpenChange={(open) => {
          setBatchEditOpen(open);
          if (!open) setError("");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>批量编辑设备 ({selectedDeviceIds.length} 台)</DialogTitle>
            <DialogDescription>
              勾选要修改的字段，只更新勾选的字段，未勾选的保持不变
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenanceType}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenanceType: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label>维保类型</Label>
                  <HelpTooltip label={MAINTENANCE_TYPE_HELP} />
                </div>
                <Select
                  value={batchEditForm.maintenanceType}
                  onValueChange={(v) => setBatchEditForm((f) => ({
                    ...f,
                    maintenanceType: v,
                    maintenancePartyId: resolveMaintenancePartyId(parties, v, f.maintenancePartyId),
                  }))}
                  disabled={!batchEditToggles.maintenanceType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维保类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending_confirmation">待确认</SelectItem>
                    <SelectItem value="none">无维保</SelectItem>
                    <SelectItem value="our_maintenance">我方维保</SelectItem>
                    <SelectItem value="original_manufacturer">原厂维保</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenancePartyId}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenancePartyId: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>维保方</Label>
                <Select
                  value={batchEditForm.maintenancePartyId}
                  onValueChange={(v) => setBatchEditForm((f) => ({ ...f, maintenancePartyId: v }))}
                  disabled={!batchEditToggles.maintenancePartyId || !maintenanceTypeHasParty(batchEditForm.maintenanceType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={maintenanceTypeHasParty(batchEditForm.maintenanceType) ? "选择维保方" : MAINTENANCE_TYPE_LABELS[canonicalMaintenanceType(batchEditForm.maintenanceType)]} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBatchEditMaintenanceParties.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name || `维保方 #${p.id}`}
                      </SelectItem>
                    ))}
                    {!filteredBatchEditMaintenanceParties.length ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">当前类型暂无可选维保方</div>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenanceStart}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenanceStart: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>维保开始日期</Label>
                <Input
                  type="date"
                  value={batchEditForm.maintenanceStart}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, maintenanceStart: e.target.value }))}
                  disabled={!batchEditToggles.maintenanceStart}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenanceEnd}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenanceEnd: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>维保截止日期</Label>
                <Input
                  type="date"
                  value={batchEditForm.maintenanceEnd}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, maintenanceEnd: e.target.value }))}
                  disabled={!batchEditToggles.maintenanceEnd}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.warrantyUntil}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, warrantyUntil: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>质保截止日期</Label>
                <Input
                  type="date"
                  value={batchEditForm.warrantyUntil}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, warrantyUntil: e.target.value }))}
                  disabled={!batchEditToggles.warrantyUntil}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.mrNo}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, mrNo: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>MR单</Label>
                <Input
                  value={batchEditForm.mrNo}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, mrNo: e.target.value }))}
                  disabled={!batchEditToggles.mrNo}
                  placeholder="MR单号，可留空清除"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.location}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, location: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>安装位置</Label>
                <Input
                  value={batchEditForm.location}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, location: e.target.value }))}
                  disabled={!batchEditToggles.location}
                  placeholder="安装位置"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.remark}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, remark: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>备注</Label>
                <Textarea
                  value={batchEditForm.remark}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, remark: e.target.value }))}
                  disabled={!batchEditToggles.remark}
                  rows={2}
                  placeholder="补充说明"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchEditOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submitBatchEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : "批量保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
