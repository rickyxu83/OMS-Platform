/**
 * ServiceReport 页共享类型（自 6200 行单文件拆出）。
 */
import type { Wrench } from "lucide-react";
import type { AppLang } from "@/contexts/LanguageContext";

export type ServiceMode = "onsite" | "remote" | "office";
export type AttachmentPurpose = "support_config" | "site_photo" | "screenshot_log" | "inspection_document" | "office_document";
export type CustomerSignatureMode = "onsite" | "electronic";
export type InstallDeviceInputMode = "manual" | "existing";
export type OperationOption = { value: string; label: string; description: string; descriptionItems?: string[]; icon: typeof Wrench };
export type ServiceModuleId = "install" | "repair" | "inspect" | "replacement" | "office_materials";
export type ServiceModuleOption = OperationOption & { value: ServiceModuleId };
export type BadgeVariant = "draft" | "secondary" | "purple" | "success" | "warning" | "destructive" | "info" | "outline";

export interface ServiceOrder {
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

export interface ServiceReport {
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

export interface ServicePart {
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

export interface InstalledDevice {
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

export interface ServiceOrderDeletePreview {
  editDraftCount?: number;
  customerSignatureRequestCount?: number;
}

export interface OrderFile {
  id: string | number;
  purpose?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  createdAt?: string;
}

export interface CustomerSignatureRequest {
  id?: string | number;
  recipientEmail?: string;
  status?: string;
  expiresAt?: string;
  sentAt?: string;
  signedAt?: string;
  lastError?: string;
}

export interface CustomerOption {
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

export interface CustomerContact {
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

export interface GeoCandidate {
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

export interface DeviceOption {
  id: string | number;
  customerId?: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  location?: string;
  remark?: string;
}

export interface ModelSuggestion {
  canonicalModel?: string;
  partNumber?: string;
  brand?: string;
  category?: string;
}
export type ModelSuggestionValueMode = "model" | "partNo";

export interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

export interface CustomerSignatureRequestInfo {
  serviceOrderId?: string | number;
  signUrl?: string;
  expiresAt?: string;
  mail?: {
    sent?: boolean;
    skipped?: boolean;
    reason?: string;
  };
}

export interface ServicePartDraft {
  deviceId: string;
  installDeviceDraftId: string;
  actionType: string;
  partName: string;
  partNo: string;
  quantity: string;
  unit: string;
  remark: string;
}

export interface InstallDeviceDraft {
  id: string;
  inputMode: InstallDeviceInputMode;
  deviceId: string;
  model: string;
  pn: string;
  serialNo: string;
  remark: string;
}

export type TargetDeviceDraft = InstallDeviceDraft;

export interface ReportForm {
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

export interface CreateDraftItem {
  id?: string | number;
  draftKey: string;
  payload: ReportForm;
  clientUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MarkdownAction = "heading" | "bold" | "bullet" | "numbered" | "inlineCode" | "codeBlock" | "link";
