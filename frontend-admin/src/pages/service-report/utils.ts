/**
 * ServiceReport 页纯函数层：表单工厂/归一化、设备与客户辅助、删除预览、附件与图片压缩、
 * 服务模块推导、工单展示文案、文件下载等（自 6200 行单文件拆出，无副作用）。
 */
import type * as React from "react";
import { matchesSearchText } from "@/lib/text-i18n";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { orderStatusLabel } from "@/lib/service-items";
import { remoteCategoryLabel, serviceItemLabels, serviceItemsLabel } from "@/lib/service-items";
import type {
  BadgeVariant, CustomerContact, CustomerOption, DeviceOption, EngineerOption, GeoCandidate,
  InstallDeviceDraft, InstalledDevice, OrderFile, ReportForm, ServiceMode, ServiceModuleId,
  ServiceOrder, ServicePartDraft, TargetDeviceDraft,
} from "./types";
import {
  COMPRESSIBLE_IMAGE_EXTENSIONS, COMPRESSIBLE_IMAGE_MIME_TYPES,
  IMAGE_COMPRESSION_MAX_EDGE, IMAGE_COMPRESSION_QUALITY, INSPECTION_DOCUMENT_EXTENSIONS,
  MAX_FILE_SIZE, MODE_OPTIONS, OFFICE_SERVICE_MODULE_OPTIONS, ONSITE_SERVICE_MODULE_OPTIONS,
  PART_ACTION_OPTIONS, REMOTE_SERVICE_MODULE_OPTIONS, RESULT_OPTIONS, SERVICE_TYPE_OPTIONS,
  TYPE_BADGE_VARIANT,
} from "./constants";

export function installDeviceDraftId() {
  return `install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function targetDeviceDraftId() {
  return `target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyInstallDevice(patch: Partial<InstallDeviceDraft> = {}): InstallDeviceDraft {
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

export function emptyTargetDevice(patch: Partial<TargetDeviceDraft> = {}): TargetDeviceDraft {
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

export function emptyPart(actionType = "replacement", deviceId = "", installDeviceDraftIdValue = ""): ServicePartDraft {
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

export function defaultForm(mode: ServiceMode = "onsite"): ReportForm {
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

export function normalizeMode(value?: string | null): ServiceMode {
  return value === "remote" || value === "office" ? value : "onsite";
}

export { formatDateTime, formatDateRange, formatFileSize } from "@/lib/format";

export function displayText(value?: string | number | null, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function toInputDateTime(value?: string) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

export function submitDateTime(value: string) {
  return value ? value.replace("T", " ") : null;
}

export function splitInputDateTime(value: string) {
  return {
    date: value ? value.slice(0, 10) : "",
    time: value ? value.slice(11, 16) : "",
  };
}

export function openNativePicker(input: HTMLInputElement) {
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

export function openPickerOnMouse(event: React.PointerEvent<HTMLInputElement>) {
  if (event.pointerType !== "mouse") return;
  event.preventDefault();
  openNativePicker(event.currentTarget);
}



export function inputNow() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function inputToday() {
  return inputNow().slice(0, 10);
}

export function optionLabel(option?: EngineerOption) {
  return option?.realName || option?.username || (option?.id ? `工程师 #${option.id}` : "");
}

export function deviceLabel(device?: DeviceOption) {
  if (!device) return "";
  return device.name || device.model || device.serialNo || `设备 #${device.id}`;
}

export function deviceSelectLabel(device?: DeviceOption) {
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

export function deviceMeta(device?: DeviceOption) {
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

export function normalizeDeviceSearchText(value?: string | number | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function deviceSearchText(device?: DeviceOption) {
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

export function deviceMatchesKeyword(device: DeviceOption, keyword: string) {
  const terms = normalizeDeviceSearchText(keyword).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = deviceSearchText(device);
  return terms.every((term) => haystack.includes(term));
}

export function deletePreviewDeviceLabel(device: InstalledDevice | DeviceOption) {
  return [
    device.model || device.name || (device.id ? `设备 #${device.id}` : "未命名设备"),
    device.serialNo ? `SN ${device.serialNo}` : "",
    "pn" in device && device.pn ? `PN ${device.pn}` : "",
  ].filter(Boolean).join(" / ");
}

export function deletePreviewInstalledDeviceLabel(device: InstalledDevice) {
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

export function deletePreviewFileLabel(file: OrderFile) {
  return `${file.originalName || `附件 #${file.id}`}${file.size ? `（${formatFileSize(file.size)}）` : ""}`;
}

export function deletePreviewPartActionLabel(value?: string) {
  if (value === "replacement") return "备件更换";
  if (value === "installation") return "硬件部件安装";
  return "部件记录";
}

export function buildDeleteConfirmationMessage(order: ServiceOrder) {
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

export function attachmentFileExtension(file: OrderFile) {
  return String(file.originalName || "").split(".").pop()?.toLowerCase() || "";
}

export type AttachmentPreviewKind = "image" | "pdf" | "text" | "docx" | "xlsx" | "unsupported";

export function attachmentPreviewKind(file: OrderFile, blob?: Blob): AttachmentPreviewKind {
  const mimeType = String(file.mimeType || blob?.type || "").toLowerCase();
  const extension = attachmentFileExtension(file);
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) return "image";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (mimeType === "text/plain" || ["txt", "log", "csv"].includes(extension)) return "text";
  // docx 与 Excel（xls/xlsx，SheetJS 兼容 BIFF 旧版二进制）走客户端渲染预览；旧版 .doc 与 .ppt/.pptx 客户端无法解析，仍走下载
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") return "docx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mimeType === "application/vnd.ms-excel" || extension === "xlsx" || extension === "xls") return "xlsx";
  return "unsupported";
}
export function previewBlob(blob: Blob, kind: AttachmentPreviewKind) {
  if (kind === "pdf" && blob.type.toLowerCase() !== "application/pdf") {
    return new Blob([blob], { type: "application/pdf" });
  }
  return blob;
}


export function partActionFor(serviceMode: ServiceMode, serviceType: string, timesheetCategory = "") {
  if (serviceMode === "remote" && ["协调", "远程协调", "沟通协调"].includes(timesheetCategory)) return "replacement";
  if (serviceMode !== "onsite") return "general";
  if (serviceType === "install") return "installation";
  if (serviceType === "repair" || serviceType === "inspect") return "replacement";
  return "general";
}

export function normalizeResult(value?: string, fallback = "resolved") {
  return RESULT_OPTIONS.some((option) => option.value === value) ? String(value) : fallback;
}

export function servicePartHasContent(part: ServicePartDraft) {
  return [part.partName, part.partNo, part.remark]
    .some((value) => String(value ?? "").trim());
}

export function installDeviceHasContent(device: InstallDeviceDraft) {
  return Boolean(device.deviceId) || [device.model, device.pn, device.serialNo, device.remark].some((value) => value.trim());
}

export function targetDeviceHasContent(device: TargetDeviceDraft) {
  return Boolean(device.deviceId) || [device.model, device.pn, device.serialNo, device.remark].some((value) => value.trim());
}

export function normalizeInstallDeviceDraft(
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

export function normalizeTargetDeviceDraft(
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

export function installDeviceTitle(device: InstallDeviceDraft, index: number) {
  if (device.inputMode === "existing") return `安装设备 ${index + 1}`;
  return device.model.trim() || `安装设备 ${index + 1}`;
}

export function targetDeviceTitle(device: TargetDeviceDraft, index: number) {
  if (device.inputMode === "existing") return `目标设备 ${index + 1}`;
  return device.model.trim() || `目标设备 ${index + 1}`;
}

export function optionText(options: Array<{ value: string; label: string }>, value?: string, fallback = "-") {
  return options.find((option) => option.value === value)?.label || value || fallback;
}

export function serviceCategoryText(form: Pick<ReportForm, "serviceMode" | "serviceType" | "timesheetCategory">) {
  if (form.serviceMode === "office") return form.timesheetCategory || "内勤";
  if (form.serviceMode === "remote") return remoteCategoryLabel(form.timesheetCategory) || "远程";
  return optionText(SERVICE_TYPE_OPTIONS, form.serviceType, "现场");
}

export function serviceModuleLabel(value: ServiceModuleId) {
  return [...ONSITE_SERVICE_MODULE_OPTIONS, ...REMOTE_SERVICE_MODULE_OPTIONS].find((option) => option.value === value)?.label || value;
}

export function serviceItemBadgeVariant(label: string, serviceType?: string): BadgeVariant {
  if (label.includes("安装")) return "success";
  if (label.includes("巡检")) return "purple";
  if (label.includes("备件") || label.includes("故障") || label.includes("排查")) return "warning";
  if (label.includes("远程")) return "info";
  if (label.includes("内勤")) return "purple";
  return TYPE_BADGE_VARIANT[serviceType || ""] || "outline";
}

export function isServiceModuleId(value: unknown): value is ServiceModuleId {
  return ["install", "repair", "inspect", "replacement", "office_materials"].includes(String(value));
}

export function allowedServiceModules(mode: ServiceMode) {
  if (mode === "onsite") return ONSITE_SERVICE_MODULE_OPTIONS.map((option) => option.value);
  if (mode === "remote") return REMOTE_SERVICE_MODULE_OPTIONS.map((option) => option.value);
  if (mode === "office") return OFFICE_SERVICE_MODULE_OPTIONS.map((option) => option.value);
  return [];
}

export function uniqueServiceModules(values: ServiceModuleId[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function defaultServiceModules(mode: ServiceMode): ServiceModuleId[] {
  return [];
}

export function deriveModulesFromLegacyForm(value: Partial<ReportForm>, mode: ServiceMode) {
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

export function normalizeServiceModules(value: Partial<ReportForm>, fallbackMode: ServiceMode) {
  const mode = normalizeMode(value.serviceMode || fallbackMode);
  const allowed = new Set(allowedServiceModules(mode));
  const hasExplicitModules = Array.isArray(value.serviceModules);
  const explicit = hasExplicitModules ? value.serviceModules?.filter(isServiceModuleId) || [] : [];
  const modules = (hasExplicitModules ? explicit : deriveModulesFromLegacyForm(value, mode)).filter((item) => allowed.has(item));
  const unique = uniqueServiceModules(modules);
  return unique.length ? unique : defaultServiceModules(mode);
}

export function derivePrimaryServiceType(mode: ServiceMode, modules: ServiceModuleId[]) {
  if (mode !== "onsite") return "other";
  if (modules.includes("inspect")) return "inspect";
  if (modules.includes("install")) return "install";
  return "repair";
}

export function deriveRemoteTimesheetCategory(modules: ServiceModuleId[]) {
  return modules.includes("replacement") ? "协调" : "排障";
}

export function contactKey(contact: CustomerContact) {
  const name = contact.name || contact.contactName || "";
  const phone = contact.phone || contact.contactPhone || "";
  return `${name}:${phone}`;
}

export function contactsForCustomer(customer?: CustomerOption | null) {
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

export function numberOrNull(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function candidateCoordinates(candidate: GeoCandidate) {
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

export function coordinateLabel(latitude: string, longitude: string) {
  const lat = numberOrNull(latitude);
  const lng = numberOrNull(longitude);
  if (lat === null || lng === null) return "";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function geoCandidateMeta(candidate: GeoCandidate) {
  return candidate.address || candidate.mapAddress || "暂无详细地址";
}

export { orderStatusLabel };

export function reportOrderDisplayId(order: ServiceOrder) {
  return order.orderNo || `SR-${order.id}`;
}

export function reportOrderMainContent(order: ServiceOrder) {
  return String(order.issueDescription || order.report?.workContent || serviceItemsLabel(order) || "未填写服务内容").replace(/\s+/g, " ").trim();
}

export function reportOrderPreviewSummary(order: ServiceOrder) {
  const text = reportOrderMainContent(order);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

export function reportIssuePreviewLabel(order: ServiceOrder) {
  const mode = normalizeMode(order.serviceMode);
  if (mode === "office") return "内勤工作事项";
  return "服务需求说明";
}

export function reportWorkContentPreviewLabel(order: ServiceOrder) {
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

export function samePreviewText(a?: string, b?: string) {
  const normalize = (value?: string) => String(value || "").replace(/\s+/g, " ").trim();
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left === right);
}

export function reportOrderEngineerText(order: ServiceOrder, fallback = "未指定工程师") {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.username || "")
    .filter(Boolean);
  return names.length ? names.join("、") : fallback;
}

export function reportOrderServiceTime(order: ServiceOrder) {
  const start = order.report?.actualStartAt || order.report?.departureAt || "";
  const end = order.report?.actualEndAt || order.report?.returnAt || "";
  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

export function orderMatchesKeyword(order: ServiceOrder, keyword: string) {
  if (!keyword) return true;
  return [
    order.orderNo,
    order.customerName,
    order.issueDescription,
    serviceItemsLabel(order),
    orderStatusLabel(order.workflowStatus || order.status, order.displayStatus),
  ].some((value) => matchesSearchText(value, keyword));
}

export function isDispatchOrder(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return ["draft", "pending_confirmation", "assigned", "in_progress", "rejected"].includes(status);
}

export function canExportServiceRecord(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return ["awaiting_customer_signature", "submitted", "approved", "archived", "completed"].includes(status) || Boolean(order.report);
}

export function isFilledServiceOrder(order: ServiceOrder) {
  return canExportServiceRecord(order);
}

export function canDeleteServiceOrder(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return ["draft", "assigned", "rejected"].includes(status);
}

export function canCancelServiceOrder(order: ServiceOrder) {
  const status = order.workflowStatus || order.status || "";
  return status !== "cancelled" && !canDeleteServiceOrder(order) && isFilledServiceOrder(order);
}

export function safeFilenamePart(value?: string | number | null) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "服务记录";
}

export function serviceRecordFileName(order: ServiceOrder) {
  const idPart = safeFilenamePart(order.orderNo || `工单-${order.id}`);
  const customerPart = safeFilenamePart(order.customerName || "未填写客户");
  return `${idPart}-${customerPart}-服务记录.pdf`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function validateFiles(files: File[]) {
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

export function fileExtension(file: File) {
  const dot = file.name.lastIndexOf(".");
  return dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
}

export function compressedImageName(file: File) {
  const dot = file.name.lastIndexOf(".");
  const base = dot >= 0 ? file.name.slice(0, dot) : file.name || "image";
  return `${base}-compressed.jpg`;
}

export function isCompressibleImage(file: File) {
  const mimeType = String(file.type || "").toLowerCase();
  return COMPRESSIBLE_IMAGE_MIME_TYPES.has(mimeType) || COMPRESSIBLE_IMAGE_EXTENSIONS.has(fileExtension(file));
}

export function loadImageFile(file: File) {
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

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function compressImageFile(file: File) {
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

export async function compressAttachmentImages(files: File[]) {
  return Promise.all(files.map((file) => compressImageFile(file).catch(() => file)));
}

export function mergeAttachmentFiles(current: File[], incoming: File[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((file) => {
    const key = `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function payloadFromOrder(order: ServiceOrder): ReportForm {
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
  // 后端详情已返回本工单创建的安装设备,直接带出,避免编辑时丢数据/重复新建
  const installedDeviceDrafts: InstallDeviceDraft[] = [];
  if (isInstallOrder) {
    (order.installedDevices || []).forEach((device) => {
      const deviceId = String(device.id || "");
      if (!deviceId || installDeviceDraftIdByDeviceId.has(deviceId)) return;
      const draft = emptyInstallDevice({
        inputMode: "existing",
        deviceId,
        model: device.model || "",
        pn: device.pn || "",
        serialNo: device.serialNo || "",
        remark: device.remark || "",
      });
      installDeviceDraftIdByDeviceId.set(deviceId, draft.id);
      installedDeviceDrafts.push(draft);
    });
  }
  const installDevices = installedDeviceDrafts.length
    ? [
        ...installedDeviceDrafts,
        ...installDevicesFromParts.filter((draft) => !installedDeviceDrafts.some((item) => item.deviceId === draft.deviceId)),
      ]
    : installDevicesFromParts.length
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

export function compactDraftLabel(form: Partial<ReportForm>) {
  const installedDevices = form.installDevices
    ?.filter(installDeviceHasContent)
    .map((device) => [device.model, device.serialNo].filter(Boolean).join(" / "))
    .filter(Boolean)
    .join("、");
  return [form.customerName, installedDevices && `安装设备：${installedDevices}`, form.issueDescription, form.workContent]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 120) || "未填写内容的草稿";
}

export function normalizeLoadedForm(value: Partial<ReportForm>, fallbackMode: ServiceMode): ReportForm {
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

