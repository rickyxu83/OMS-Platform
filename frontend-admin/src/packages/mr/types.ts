export type MrStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'voided'

export interface MrItem {
  id?: string | number
  rowNo?: number
  companyPartNo?: string | null
  oemSpec?: string | null
  name?: string | null
  description?: string | null
  warrantyService?: string | null
  installBy?: string | null
  qty?: number | null
  unitPrice?: number | null
  quotedUnitPrice?: number | null
  subtotal?: number | null
  vendor?: string | null
  costInclTax?: number | null
  costExcludingTax?: number | null
  taxRate?: number | null
  purchaseOrderNo?: string | null
  costSource?: string | null
  salesSource?: string | null
  purchaseOnly?: boolean
  marginRate?: number | null
  recognitionMethod?: string
  confidence?: Record<string, number> | null
  reviewFields?: string[]
  validationMessages?: string[]
  costConfidence?: Record<string, number> | null
  costReviewFields?: string[]
  matchCandidates?: Array<{ description: string; vendor: string; costInclTax: number; taxRate: number | null; costSource: string; score: number }>
}

export interface MrApproval {
  id?: string | number
  seq: number
  cycle?: number
  stepKey: string
  stepLabel: string
  action?: 'approve' | 'reject' | 'skipped' | null
  reason?: string | null
  approverName?: string | null
  approverRole?: string | null
  approverSignatureSnapshot?: string | null
  assigneeUserId?: string | number | null
  assigneeName?: string | null
  assignmentError?: string | null
  versionNo?: number | null
  decidedAt?: string | null
}

export interface MrOrder {
  id?: string | number
  status?: MrStatus
  customerId?: string | number | null
  customerContactId?: string | number | null
  salesOwnerId?: string | number | null
  salesOwnerName?: string | null
  salesOwnerRole?: string | null
  assistantUserId?: string | number | null
  assistantName?: string | null
  customerName?: string | null
  customerCode?: string | null
  customerAddress?: string | null
  customerMapAddress?: string | null
  contactName?: string | null
  caseCategory?: string | null
  customerPo?: string | null
  ctrlNo?: string | null
  invoiceType?: string | null
  pricingMode?: number | null
  totalExcludingTax?: number | null
  hasContract?: number | boolean | null
  contractType?: string | null
  hasPenalty?: number | boolean | null
  penaltyContent?: string | null
  invoiceProcess?: string | null
  billingContent?: string | null
  invoiceRecipient?: string | null
  invoiceRecipientTel?: string | null
  invoiceRecipientMail?: string | null
  billingTiming?: string | null
  purchaser?: string | null
  purchaserTel?: string | null
  purchaserMail?: string | null
  recipient?: string | null
  recipientTel?: string | null
  recipientMail?: string | null
  paymentTerms?: string | null
  paymentOther?: string | null
  splitDelivery?: number | boolean | null
  acceptance?: string | null
  acceptanceOther?: string | null
  installOptions?: string[]
  maintenanceOptions?: string[]
  contractNo?: string | null
  fillDate?: string | null
  latestDeliveryDate?: string | null
  deliveryLocation?: string | null
  shipmentNo?: string | null
  deliveryTerms?: string | null
  quotationFileId?: string | number | null
  quotationFiles?: QuotationFile[]
  grossProfitRecognitionStartMonth?: string | null
  grossProfitRecognitionAmount?: number | null
  grossProfitRecognitions?: ScheduleEntry[]
  remainingRecognizableGrossProfit?: number | null
  taiwanBusinessTransferStartMonth?: string | null
  taiwanBusinessTransferAmount?: number | null
  taiwanBusinessTransfers?: ScheduleEntry[]
  remainingTaiwanBusinessTransfer?: number | null
  remark?: string | null
  rejectReason?: string | null
  voidReason?: string | null
  withdrawReason?: string | null
  returnTarget?: 'sales' | 'assistant' | null
  versionNo?: number
  archiveStatus?: 'pending' | 'generating' | 'ready' | 'failed' | null
  archiveError?: string | null
  archivedDocumentTypes?: Array<'approved' | 'voided'>
  autoApprovedStep?: string | null
  assignmentError?: string | null
  currentAssigneeUserId?: string | number | null
  currentAssigneeName?: string | null
  currentVersion?: { versionNo: number; changes: Array<{ field: string; before: unknown; after: unknown }>; createdAt?: string | null } | null
  currentStepKey?: string | null
  currentStepLabel?: string | null
  createdByName?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  submittedAt?: string | null
  approvedAt?: string | null
  rejectedAt?: string | null
  voidedAt?: string | null
  itemCount?: number
  items?: MrItem[]
  approvals?: MrApproval[]
  approvalHistory?: MrApproval[]
  totals?: {
    salesExcludingTax?: number
    vat?: number
    salesIncludingTax?: number
    costExcludingTax?: number | null
    costIncludingTax?: number | null
    marginRate?: number | null
  }
  fileName?: string
  permissions?: {
    canEdit?: boolean
    canDelete?: boolean
    canVoid?: boolean
    canApprove?: boolean
    canWithdraw?: boolean
  }
}

export interface MrConstants {
  INVOICE_TYPES: string[]
  CONTRACT_TYPES: string[]
  INVOICE_PROCESSES: string[]
  PAYMENT_TERMS: string[]
  CASE_CATEGORIES: string[]
  ACCEPTANCE_TYPES: string[]
  WORK_OPTIONS: string[]
  pricingModes: Array<{ value: number; label: string }>
}

export interface CustomerOption {
  id: string | number
  code?: string
  name?: string
  contactName?: string
  contactPhone?: string
  address?: string
  salesDeliveryAddress?: string
  mapAddress?: string
  mapPoiName?: string
  contacts?: Array<{ id?: string | number; customerId?: string | number; name?: string; phone?: string; email?: string }>
}

export interface UserOption {
  id: string | number
  realName?: string
  username?: string
  role?: string
  assistantUserId?: string | number | null
  email?: string | null
}
export interface ScheduleEntry {
  businessName?: string | null
  startMonth?: string | null
  frequency?: 'monthly' | 'quarterly' | null
  amount?: number | null
}

export interface VendorOption {
  id: string | number
  name: string
  officialWebsite?: string | null
}

export interface QuotationFile {
  id: string | number
  name: string
  size?: number
  createdAt?: string
  quoteRole?: string | null
}

export interface QuotationSource {
  index: number
  name: string
  role: 'sales' | 'purchase'
  total: number
  itemCount: number
  vendor?: string
  documentType?: string
  taxIncluded?: boolean | null
  taxRate?: number | null
  confidence?: number | null
  reviewCount?: number
  method?: string
}

export interface QuotationImportResult {
  files: QuotationFile[]
  sources: QuotationSource[]
  salesSourceIndex: number
  salesTotalExcludingTax?: number | null
  items: MrItem[]
  warnings: string[]
  metadata?: { customer?: string; attn?: string; payment?: string; delivery?: string; taxRate?: number | null; customerPo?: string; latestDeliveryDate?: string; deliveryLocation?: string; matchedCustomer?: CustomerOption | null }
}

export interface ParsedQuotationSheet {
  title: string
  customer?: string
  attn?: string
  payment?: string
  delivery?: string
  tax_rate?: number | null
  total?: number
  seller?: { from?: string; email?: string; tel?: string; fax?: string; mobile?: string }
  items: Array<{
    item_no?: string
    part_no?: string
    description?: string
    qty?: number
    unit_price?: number
    extended?: number
  }>
}

export interface ApprovalTask {
  id: string | number
  businessType: string
  businessId: string | number
  title: string
  assigneeName?: string | null
  initiatorName?: string | null
  status: string
  businessStatus?: string | null
  currentStepLabel?: string | null
  customerName?: string | null
  ctrlNo?: string | null
  detailPath: string
  createdAt?: string | null
  completedAt?: string | null
}

export interface AssistantSetting {
  assistantUserId?: string | number | null
  assistantName?: string | null
  assistantEmail?: string | null
}
