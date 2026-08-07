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
  marginRate?: number | null
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
  decidedAt?: string | null
}

export interface MrOrder {
  id?: string | number
  status?: MrStatus
  customerId?: string | number | null
  customerContactId?: string | number | null
  salesOwnerId?: string | number | null
  salesOwnerName?: string | null
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
  billingTiming?: string | null
  purchaser?: string | null
  purchaserTel?: string | null
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
  remark?: string | null
  rejectReason?: string | null
  voidReason?: string | null
  currentStepKey?: string | null
  currentStepLabel?: string | null
  createdByName?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  approvedAt?: string | null
  itemCount?: number
  items?: MrItem[]
  approvals?: MrApproval[]
  approvalHistory?: MrApproval[]
  totals?: {
    salesExcludingTax?: number
    vat?: number
    salesIncludingTax?: number
    costExcludingTax?: number
    costIncludingTax?: number
    marginRate?: number | null
  }
  fileName?: string
  permissions?: {
    canEdit?: boolean
    canDelete?: boolean
    canVoid?: boolean
    canApprove?: boolean
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
  mapAddress?: string
  mapPoiName?: string
  contacts?: Array<{ id?: string | number; name?: string; phone?: string; email?: string }>
}

export interface UserOption {
  id: string | number
  realName?: string
  username?: string
  role?: string
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
}

export interface QuotationSource {
  index: number
  name: string
  role: 'sales' | 'purchase'
  total: number
  itemCount: number
  vendor?: string
  documentType?: string
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
