/**
 * Devices 页共享类型（自 4800 行单文件拆出）。
 */

export interface Device {
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
  createdAt?: string;
  updatedAt?: string;
  createdBy?: number | string | null;
  createdByName?: string;
  relatedServiceOrders?: DeviceRelatedServiceOrder[];
  partHistory?: DevicePartHistory[];
}

export interface DeviceRelatedAttachment {
  id: string | number;
  purpose?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  createdAt?: string;
}

export interface DeviceRelatedServiceOrder {
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
  attachments?: DeviceRelatedAttachment[];
}

export interface DevicePartHistory {
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

export interface Customer {
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

export interface MaintenanceParty {
  id: string | number;
  name?: string;
  partyType?: string;
}

export interface ModelSuggestion {
  canonicalModel?: string;
  partNumber?: string;
  brand?: string;
  category?: string;
}

export type ModelSuggestionTarget =
  | { type: "form" }
  | { type: "batch"; index: number };

export type ExcelWorkbook = import("exceljs").Workbook;

export type ExcelWorksheet = import("exceljs").Worksheet;

export interface DeviceForm {
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

export interface BatchDeviceRow {
  name: string;
  model: string;
  serialNo: string;
  mrNo: string;
}

export interface ImportErrorRow {
  rowNumber: number;
  sn?: string;
  message?: string;
}

export interface ImportModelCorrection {
  rowNumber: number;
  sn?: string;
  inputModel?: string;
  canonicalModel?: string;
  matchType?: string;
  brand?: string;
  category?: string;
  partNumber?: string;
}

export interface ImportCustomerCorrection {
  rowNumber: number;
  sn?: string;
  inputCustomerName?: string;
  customerId?: string | number;
  customerName?: string;
  matchType?: string;
}

export interface ImportUnmatchedCustomer {
  inputCustomerName: string;
  rowNumbers: number[];
  sns: string[];
}

export interface ImportSimilarCustomer extends ImportUnmatchedCustomer {
  candidates: Array<{ id: string | number; name?: string }>;
}

export interface ImportCustomerConfirmation {
  inputCustomerName: string;
  rowNumbers: number[];
  suggestedCustomerId: string;
  suggestedCustomerName: string;
  matchType?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  errors: ImportErrorRow[];
  remainingFileName?: string;
  requiresImportConfirmation?: boolean;
  requiresModelConfirmation?: boolean;
  customerCorrections?: ImportCustomerCorrection[];
  similarCustomers?: ImportSimilarCustomer[];
  unmatchedCustomers?: ImportUnmatchedCustomer[];
  modelCorrections?: ImportModelCorrection[];
}

export interface MaintenanceImportColumn {
  index: number;
  letter: string;
  header?: string;
  label: string;
}

export interface MaintenanceImportItem {
  rowNumber: number;
  deviceId?: string | number;
  serialNo?: string;
  customerName?: string;
  model?: string;
  currentMaintenanceStart?: string;
  currentMaintenanceEnd?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  status: "updatable" | "unchanged" | "not_found" | "conflict" | "invalid" | "duplicate" | "superseded";
  message?: string;
}

export interface MaintenanceImportPreview {
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
    ignored: number;
    invalid: number;
  };
  items: MaintenanceImportItem[];
}

export interface ModelNormalizationResult {
  action?: string;
  canonicalModel?: string;
  message?: string;
}

export interface ModelNormalizationNotice {
  action: string;
  message: string;
}

export interface ModelNormalizationJob {
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

export interface ExistingModelNormalizationItem {
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

export interface ExistingModelNormalizationResult {
  scanned: number;
  matched: number;
  issueCount: number;
  correctableCount: number;
  unresolvedCount: number;
  catalogCreatedCount: number;
  items: ExistingModelNormalizationItem[];
}

export interface DeviceDeleteRelationOrder {
  id: string | number;
  orderNo?: string;
  status?: string;
  customerName?: string;
}

export interface DeviceDeleteRelationSchedule {
  id: string | number;
  name?: string;
  customerName?: string;
}

export interface DeviceDeleteRelationPart {
  id: string | number;
  orderId?: string | number;
  orderNo?: string;
  partName?: string;
  partNo?: string;
}

export interface DeviceDeleteBlockedDetails {
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

export interface BatchEditForm {
  maintenanceType: string;
  maintenancePartyId: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  mrNo: string;
  location: string;
  remark: string;
}

export interface BatchEditToggles {
  maintenanceType: boolean;
  maintenancePartyId: boolean;
  maintenanceStart: boolean;
  maintenanceEnd: boolean;
  mrNo: boolean;
  location: boolean;
  remark: boolean;
}
