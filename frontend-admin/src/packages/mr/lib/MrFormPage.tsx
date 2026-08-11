import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CopyPlus, Download, Eye, File, FileDown, FileSpreadsheet, FileText, ImageIcon, Loader2, Paperclip, Pencil, Plus, Save, Send, ShieldCheck, Trash2, Undo2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ErrorToast } from '@/components/ErrorToast'
import { useAuth } from '@/contexts/AuthContext'
import {
  approveMr,
  createMr,
  deleteQuotationFile,
  downloadMrDocument,
  downloadQuotation,
  fetchQuotationBlob,
  getMr,
  getMrConstants,
  loadCustomer,
  loadMrReferences,
  rejectMr,
  reassignMrSales,
  submitMr,
  updateMr,
  uploadMrAttachments,
  voidMr,
  withdrawMr,
} from '../client'
import type { CustomerOption, MrConstants, MrItem, MrOrder, QuotationFile, QuotationImportResult, ScheduleEntry, UserOption, VendorOption } from '../types'
import { PdfPreview } from '@/components/PdfPreview'
import { ApprovalPanel } from './ApprovalPanel'
import { MrDocumentView } from './MrPrintPage'
import { calculateForm, blankItem, defaultCostTaxRate, normalizeCostTaxRates, quotationDetailItems, singleIntegrationItems } from './form-logic'
import { MR_SECTIONS, itemIndexOf, scrollToSection, sectionOfField } from './form-sections'
import { SectionNav, SummaryPanel, WorkbenchMetrics } from './MrFormRail'
import { MrItemTable } from './MrItemTable'
import {
  AnimatedMoney,
  AnimatedPercent,
  BinaryChoice,
  Field,
  SectionCard,
  SmartCombobox,
  StatusBadge,
  SubPanel,
  WorkOptions,
  choiceValue,
  money,
  percent,
  textValue,
} from './mr-ui'
import { QuotationImportDialog } from './QuotationImportDialog'

const PRICING_LABELS: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }
const WORKBENCH_SECTIONS = [MR_SECTIONS[1], MR_SECTIONS[5], MR_SECTIONS[0], ...MR_SECTIONS.slice(2, 5), ...MR_SECTIONS.slice(6)]
function suggestPricingMode(result: QuotationImportResult) {
  const itemText = (result.items || []).map((item) => `${item.name || ''} ${item.description || ''}`).join(' ')
  const sourceText = (result.sources || []).map((source) => source.name).join(' ')
  const deliveryText = result.metadata?.delivery || ''
  const serviceSignal = /安装|装机|实施|部署|送达安装|维保|续保|保固|服务|support|warranty/i.test(`${itemText} ${sourceText} ${deliveryText}`)
  const purchaseCount = (result.sources || []).filter((source) => source.role === 'purchase').length
  if ((result.items || []).length === 1 && serviceSignal) return { mode: 2, reason: '仅识别到一个主要品项，且包含安装或服务内容' }
  if ((result.items || []).length > 1 || purchaseCount > 1) return { mode: 1, reason: `识别到 ${result.items.length} 个品项或多份供应商成本文件` }
  return { mode: 3, reason: (result.items || []).length === 1 ? '仅识别到一个品项，且未发现整包集成、安装或服务内容' : '未识别到可供系统集成归类的多个品项或安装服务内容' }
}
function suggestInvoiceType(result: QuotationImportResult) {
  const rate = Number(result.metadata?.taxRate)
  if (rate === 6) {
    const text = `${result.metadata?.delivery || ''} ${(result.items || []).map((item) => `${item.name || ''} ${item.description || ''}`).join(' ')}`
    return /服务|维保|續保|续保|保固|support|warranty/i.test(text) ? '6%服务发票' : '6%普通发票'
  }
  return rate === 13 ? '13%普通发票' : ''
}
type ValidationError = { field?: string; message?: string }
type Decision = 'approve' | 'reject' | 'withdraw' | 'void' | null

function syncInstallOptions(items: MrItem[], previous: string[], next: string[]) {
  const oldDefaults = new Set(previous.filter((value) => value !== 'NO'))
  const newDefaults = next.filter((value) => value !== 'NO')
  return items.map((item) => {
    const existing = String(item.installBy || '').split(/[,，、]/).map((value) => value.trim()).filter(Boolean)
    const manual = existing.filter((value) => !oldDefaults.has(value))
    return { ...item, installBy: [...new Set([...newDefaults, ...manual])].join('、') }
  })
}


function asNumber(value: string) {
  return value === '' ? null : Number(value)
}

function paymentFromQuotation(text?: string) {
  const source = String(text || '')
  for (const days of [30, 60, 90, 120]) if (source.includes(String(days))) return `月结${days}天`
  return undefined
}

function normalizeLookup(value?: string | null) {
  return String(value || '').toLowerCase().replace(/[\s（）()\-—_,，。]/g, '')
}

function contactByName(contacts: CustomerOption['contacts'], value?: string | null) {
  const target = normalizeLookup(value)
  return (contacts || []).find((contact) => target && normalizeLookup(contact.name) === target)
}
function validationDetails(error: unknown): ValidationError[] {
  const details = (error as Error & { details?: unknown })?.details
  return Array.isArray(details) ? details.filter((item): item is ValidationError => Boolean(item && typeof item === 'object')) : []
}

const CHANGE_LABELS: Record<string, string> = {
  customerId: '客户', customerContactId: '客户联系人', salesOwnerId: '业务负责人', customerName: '客户名称', contactName: '联系人',
  caseCategory: '项目分类', customerPo: '客户 P/O', ctrlNo: 'Ctrl.NO', invoiceType: '发票类型', pricingMode: '计价模式', totalExcludingTax: '未税总计',
  invoiceProcess: '开票方式', billingContent: '开票内容', invoiceRecipient: '发票收件人', invoiceRecipientTel: '发票收件电话', invoiceRecipientMail: '发票收件邮箱', billingTiming: '开票/收款时间', purchaser: '采购联系人', purchaserTel: '采购联系电话', purchaserMail: '采购联系邮箱',
  recipient: '收货人', recipientTel: '收货联系电话', recipientMail: '收货邮箱', paymentTerms: '付款条件', paymentOther: '付款条件说明', splitDelivery: '是否允许分批交付',
  acceptance: '验收条件', acceptanceOther: '验收说明', installOptions: '装机承担方', maintenanceOptions: '维护承担方', contractNo: '合同编号', penaltyContent: '罚则说明',
  fillDate: '填表日期', latestDeliveryDate: '最晚交付日期', deliveryLocation: '交付地点', shipmentNo: '出货单编号', deliveryTerms: '交付条款', remark: '备注', approvalSteps: '签核流程', totals: '金额汇总',
  grossProfitRecognitionStartMonth: '毛利认列起始日期', grossProfitRecognitionAmount: '首期认列毛利', remainingRecognizableGrossProfit: '剩余可认列毛利总额（按季）', taiwanBusinessTransferStartMonth: '台湾业务转拨起始日期', taiwanBusinessTransferAmount: '首期台湾业务转拨金额', remainingTaiwanBusinessTransfer: '剩余台湾业务待转拨总额（按季）', grossProfitRecognitions: '毛利认列', taiwanBusinessTransfers: '台湾业务转拨',
  salesExcludingTax: '未税总计', vat: '销售税额', salesIncludingTax: '含税总计', costExcludingTax: '采购成本（不含税）', costIncludingTax: '采购成本（含税）', marginRate: '整单毛利率',
}
const ITEM_CHANGE_LABELS: Record<string, string> = { companyPartNo: '公司料号', oemSpec: '原厂规格', name: '品名', description: '品名描述', warrantyService: '保固与服务', installBy: '品项装机方', qty: '数量', unitPrice: '未税单价', subtotal: '未税小计', vendor: '供应商', costInclTax: '采购成本（含税）', taxRate: '采购税率', purchaseOrderNo: '采购订单号', costSource: '采购成本来源' }
function changeLabel(path: string) {
  const item = path.match(/^items\.(\d+)(?:\.(.+))?$/)
  if (item) return `第 ${Number(item[1]) + 1} 项${item[2] ? ` · ${ITEM_CHANGE_LABELS[item[2]] || item[2]}` : ''}`
  const [root, nested] = path.split('.')
  const suffix = nested === undefined ? '' : /^\d+$/.test(nested) ? ` · ${Number(nested) + 1}` : ` · ${CHANGE_LABELS[nested] || nested}`
  return `${CHANGE_LABELS[root] || root}${suffix}`
}
function changeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) return value.join('、') || '-'
  if (typeof value === 'object') return JSON.stringify(value)
  if (value === true) return '是'
  if (value === false) return '否'
  return String(value)
}

const ATTACHMENT_ACCEPT = '.pdf,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.zip,.csv,.txt'

function attachmentIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return FileText
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return ImageIcon
  return File
}

function fileSizeText(size?: number) {
  if (!size || size <= 0) return ''
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

/** MR 附件列表（文件名+图标展示）；PDF 点击在浏览器内预览，其余类型点击下载。 */
function MrAttachments({
  files,
  editable,
  busy,
  onUpload,
  onDelete,
  onOpen,
}: {
  files: QuotationFile[]
  editable: boolean
  busy: boolean
  onUpload: (fileList: FileList | null) => void
  onDelete: (file: QuotationFile) => void
  onOpen: (file: QuotationFile) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="space-y-3">
      {files.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((file) => {
            const Icon = attachmentIcon(file.name)
            return (
              <li key={file.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(file)} title="点击预览或下载">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm hover:underline">{file.name}</span>
                  {fileSizeText(file.size) ? <span className="shrink-0 text-xs text-muted-foreground">{fileSizeText(file.size)}</span> : null}
                </button>
                {editable ? (
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-destructive hover:text-destructive" aria-label={`删除附件 ${file.name}`} onClick={() => onDelete(file)}><X className="size-4" /></Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">暂无附件{editable ? '，可点击下方按钮上传' : ''}</div>
      )}
      {editable ? (
        <div>
          <input ref={inputRef} type="file" multiple className="hidden" accept={ATTACHMENT_ACCEPT} onChange={(event) => { onUpload(event.target.files); event.target.value = '' }} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Upload className="mr-2 size-4" />上传附件</Button>
        </div>
      ) : null}
    </div>
  )
}

/** 认列/转拨排程的文字化展示（新版模型 + 旧版遗留格式）。 */
function scheduleEntryText(entry: ScheduleEntry | undefined, actionLabel: string, withBusinessName = false) {
  if (!entry) return ''
  const prefix = withBusinessName && entry.businessName ? `${entry.businessName}：` : ''
  const type = entry.type || (entry.frequency || entry.amount !== null && entry.amount !== undefined ? 'installments' : '')
  if (type === 'once') {
    return entry.totalAmount !== null && entry.totalAmount !== undefined
      ? `${prefix}一次性${actionLabel}，总金额 ¥ ${money(entry.totalAmount)}`
      : `${prefix}一次性${actionLabel}`
  }
  if ((entry.totalAmount !== null && entry.totalAmount !== undefined) || entry.periods) {
    const periods = Number(entry.periods) > 0 ? Number(entry.periods) : null
    const total = entry.totalAmount !== null && entry.totalAmount !== undefined ? Number(entry.totalAmount) : null
    const per = periods && total !== null ? total / periods : null
    const head = entry.startMonth ? `自 ${entry.startMonth} 起` : ''
    const count = periods ? `分 ${periods} 期${actionLabel}` : `分期${actionLabel}`
    return `${prefix}${head}${count}${per !== null ? `，每期 ¥ ${money(per)}` : ''}${total !== null ? `，总金额 ¥ ${money(total)}` : ''}`
  }
  // 旧版遗留：频率 + 每期金额
  const period = entry.frequency === 'quarterly' ? '每季度' : '每月'
  return [
    prefix + (entry.startMonth ? `${entry.startMonth} 起` : ''),
    entry.amount !== null && entry.amount !== undefined ? `${period}${actionLabel} ¥ ${money(entry.amount)}` : '',
  ].filter(Boolean).join('')
}

const QUARTER_MONTH_OPTIONS = ['03', '06', '09', '12']

function ScheduleEntriesEditor({
  entries,
  editable,
  actionLabel,
  withBusinessName = false,
  onChange,
}: {
  entries: ScheduleEntry[]
  editable: boolean
  actionLabel: string
  withBusinessName?: boolean
  onChange: (entries: ScheduleEntry[]) => void
}) {
  const entry: ScheduleEntry = entries[0] || { businessName: withBusinessName ? '' : null, type: 'once', startMonth: null, periods: null, totalAmount: null }
  const type = entry.type || 'once'
  const startMonth = String(entry.startMonth || '').slice(5, 7)
  const periods = Number(entry.periods) > 0 ? Number(entry.periods) : null
  const total = entry.totalAmount !== null && entry.totalAmount !== undefined ? Number(entry.totalAmount) : null
  const perPeriod = periods && total !== null ? total / periods : null
  const patchEntry = (value: Partial<ScheduleEntry>) => onChange([{ ...entry, ...value }])
  const currentYear = new Date().getFullYear()
  const patchStart = (month: string) => patchEntry({ startMonth: `${currentYear}-${month}` })
  if (!editable) {
    const text = scheduleEntryText(entries[0], actionLabel, withBusinessName)
    return text ? <p className="text-sm text-foreground">{text}</p> : <span className="text-sm text-muted-foreground">-</span>
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Select value={type} onValueChange={(value) => patchEntry({ type: value as ScheduleEntry['type'] })}>
          <SelectTrigger aria-label={`${actionLabel}方式`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="once">{actionLabel === '转拨' ? '单次转拨' : `一次性${actionLabel}`}</SelectItem>
            <SelectItem value="installments">{`分期${actionLabel}`}</SelectItem>
          </SelectContent>
        </Select>
        {withBusinessName ? (
          <Input value={entry.businessName || ''} placeholder="转拨给（台湾业务，手动输入）" aria-label="台湾业务名称" onChange={(event) => patchEntry({ businessName: event.target.value })} />
        ) : null}
        {type === 'installments' ? (
          <>
            <Select value={QUARTER_MONTH_OPTIONS.includes(startMonth) ? startMonth : '03'} onValueChange={patchStart}>
              <SelectTrigger aria-label="开始月份（当年）"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUARTER_MONTH_OPTIONS.map((month) => <SelectItem key={month} value={month}>{Number(month)} 月</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" min={1} step={1} value={entry.periods ?? ''} placeholder="期数（如 4 期）" aria-label={`${actionLabel}期数`} onChange={(event) => patchEntry({ periods: event.target.value === '' ? null : Number(event.target.value) })} />
          </>
        ) : null}
        <Input type="number" min={0} step="0.01" value={entry.totalAmount ?? ''} placeholder={`${actionLabel}总金额`} aria-label={`${actionLabel}总金额`} onChange={(event) => patchEntry({ totalAmount: event.target.value === '' ? null : Number(event.target.value) })} />
      </div>
      {type === 'installments' && perPeriod !== null ? <p className="text-xs text-muted-foreground">每期 ¥ {money(perPeriod)}（总金额 ¥ {money(total)} ÷ {periods} 期）</p> : null}
      {scheduleEntryText(entry, actionLabel, withBusinessName) ? <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-foreground">{scheduleEntryText(entry, actionLabel, withBusinessName)}</p> : null}
    </div>
  )
}

export function MrFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState<MrOrder | null>(null)
  const [constants, setConstants] = useState<MrConstants | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [salespeople, setSalespeople] = useState<UserOption[]>([])
  const [contacts, setContacts] = useState<CustomerOption['contacts']>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [importAnimationKey, setImportAnimationKey] = useState(0)
  const [decision, setDecision] = useState<Decision>(null)
  const [reason, setReason] = useState('')
  const [rejectTarget, setRejectTarget] = useState<'sales' | 'assistant'>('sales')
  const [editing, setEditing] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignSalesId, setReassignSalesId] = useState('')
  const [attachmentPreview, setAttachmentPreview] = useState<{ file: QuotationFile; data: Uint8Array } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [activeSection, setActiveSection] = useState(WORKBENCH_SECTIONS[0].id)
  const [flashSection, setFlashSection] = useState('')
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null)
  const loadSequence = useRef(0)
  const customerLoadSequence = useRef(0)
  const ignoreNextPop = useRef(false)
  const errorListRef = useRef<HTMLDivElement | null>(null)

  const calculated = useMemo(() => form ? calculateForm(form) : null, [form])
  const linkedContacts = (contacts || []).filter((contact) => form?.customerId && String(contact.customerId) === String(form.customerId))
  const canEdit = Boolean(form?.permissions?.canEdit)
  const assistantReview = Boolean(canEdit && form?.status === 'in_review' && form?.currentStepKey === 'assistant')
  const editable = Boolean(canEdit && (!assistantReview || editing))
  const documentMode = Boolean(form?.status === 'in_review' && !editing)
  const approvedDocumentReady = Boolean(form?.archivedDocumentTypes?.includes('approved'))
  const voidedDocumentReady = Boolean(form?.archivedDocumentTypes?.includes('voided'))

  const load = useCallback(async () => {
    if (!id) return
    const sequence = ++loadSequence.current
    setLoading(true)
    setError('')
    try {
      const [order, optionData, references] = await Promise.all([getMr(id), getMrConstants(), loadMrReferences()])
      const customer = order.customerId ? await loadCustomer(order.customerId) : null
      const customerContacts = customer?.contacts || []
      const defaultContact = (order.customerContactId ? customerContacts.find((item) => String(item.id) === String(order.customerContactId)) : undefined)
        || contactByName(customerContacts, order.contactName || order.purchaser || order.recipient || customer?.contactName)
        || contactByName(customerContacts, customer?.contactName)
        || customerContacts[0]
      const hydratedOrder = order.permissions?.canEdit && ['draft', 'rejected'].includes(order.status || '') && !order.customerContactId && defaultContact ? {
        ...order,
        customerContactId: defaultContact.id || null,
        contactName: defaultContact.name || order.contactName || '',
        purchaser: order.purchaser || defaultContact.name || '',
        purchaserTel: order.purchaserTel || defaultContact.phone || '',
        purchaserMail: order.purchaserMail || defaultContact.email || '',
        recipient: order.recipient || defaultContact.name || '',
        recipientTel: order.recipientTel || defaultContact.phone || '',
        recipientMail: order.recipientMail || defaultContact.email || '',
        invoiceRecipient: order.invoiceRecipient || defaultContact.name || '',
        invoiceRecipientTel: order.invoiceRecipientTel || defaultContact.phone || '',
        invoiceRecipientMail: order.invoiceRecipientMail || defaultContact.email || '',
      } : order
      if (sequence !== loadSequence.current) return
      setForm(hydratedOrder)
      setEditing(false)
      setConstants(optionData)
      setCustomers(references.customers)
      setVendors(references.vendors)
      setSalespeople(references.salespeople)
      setContacts(customer?.contacts || [])
      setDirty(false)
    } catch (err) {
      if (sequence === loadSequence.current) setError((err as Error).message || 'MR 申请加载失败')
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
    return () => { loadSequence.current += 1 }
  }, [load])

  useEffect(() => {
    if (!dirty) return
    const message = '当前 MR 申请存在未保存的修改，确定离开吗？'
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    const guard = (event: Event) => {
      if (window.confirm(message)) setDirty(false)
      else event.preventDefault()
    }
    const pop = () => {
      if (ignoreNextPop.current) { ignoreNextPop.current = false; return }
      if (window.confirm(message)) setDirty(false)
      else { ignoreNextPop.current = true; window.history.forward() }
    }
    window.addEventListener('beforeunload', warn)
    window.addEventListener('oms:before-navigate', guard)
    window.addEventListener('popstate', pop)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('oms:before-navigate', guard)
      window.removeEventListener('popstate', pop)
    }
  }, [dirty])

  // Highlight the section nearest the top of the viewport.
  useEffect(() => {
    if (loading) return
    const nodes = WORKBENCH_SECTIONS
      .map(({ id: sectionId }) => document.getElementById(`mr-section-${sectionId}`))
      .filter((node): node is HTMLElement => Boolean(node))
    if (!nodes.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiveSection(visible.target.id.replace('mr-section-', ''))
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    )
    for (const node of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [loading])

  useEffect(() => {
    if (!flashSection) return
    const timer = window.setTimeout(() => setFlashSection(''), 1600)
    return () => window.clearTimeout(timer)
  }, [flashSection])

  const patch = (value: Partial<MrOrder>) => {
    setForm((current) => current ? { ...current, ...value } : current)
    setDirty(true)
    setErrors([])
  }

  const changePricingMode = (nextMode: number) => {
    if (!form || !calculated) return
    const currentMode = Number(form.pricingMode || 0)
    if (currentMode === nextMode) return
    const currentItems = calculated.items || []
    const nextItems = currentMode === 2 ? currentItems.slice(0, 1) : currentItems
    const currentSalesTotal = calculated.totals?.salesExcludingTax ?? calculated.totalExcludingTax
    const warnings: string[] = []
    if (currentMode === 3 && nextMode !== 3 && currentItems.some((item) => item.unitPrice !== null && item.unitPrice !== undefined)) {
      warnings.push('从“开明细”切换至系统集成模式后，各品项的未税单价将按目标计价模式重新计算。')
    }
    const secondIsService = Boolean(currentItems[1] && `${currentItems[1].name || ''}${currentItems[1].description || ''}`.includes('服务'))
    if (nextMode === 2 && (currentItems.length > 2 || (currentItems.length === 2 && !secondIsService))) {
      warnings.push('切换至“单项系统集成”后，系统仅保留第一项作为主项，并重新生成第二项“技术服务”；其余品项将被删除。')
    }
    if (currentMode === 1 && nextMode === 3) {
      const quotedCount = currentItems.filter((item) => item.quotedUnitPrice != null).length
      warnings.push(quotedCount ? `将恢复销售报价中识别出的 ${quotedCount} 个品项原始未税单价；其余品项将保留当前分摊单价，并标记为待人工确认。` : '销售报价中未识别到逐项未税单价；系统将保留当前分摊单价，并标记为待人工确认。')
    }
    if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\n确认切换计价模式吗？`)) return
    if (nextMode === 3) {
      patch({ pricingMode: 3, totalExcludingTax: currentSalesTotal, items: quotationDetailItems(nextItems) })
      return
    }
    if (nextMode === 2) {
      patch({ pricingMode: 2, totalExcludingTax: currentSalesTotal, items: singleIntegrationItems(currentItems, form.invoiceType, form.installOptions || []) })
      return
    }
    patch({ pricingMode: nextMode, totalExcludingTax: currentSalesTotal, items: nextItems })
  }

  const changeInvoiceType = (invoiceType: string) => {
    patch({ invoiceType, items: normalizeCostTaxRates(form?.items || [], invoiceType) })
  }

  const navigateAway = (path: string) => {
    if (dirty && !window.confirm('当前 MR 申请存在未保存的修改，确定离开吗？')) return
    setDirty(false)
    navigate(path)
  }

  const chooseCustomer = async (value: string) => {
    const sequence = ++customerLoadSequence.current
    const customer = customers.find((item) => String(item.id) === value)
    const deliveryLocation = customer?.salesDeliveryAddress || customer?.mapAddress || customer?.address || customer?.mapPoiName || ''
    setContacts([])
    patch({
      customerId: value,
      customerContactId: null,
      customerName: customer?.name || '',
      customerCode: customer?.code || '',
      contactName: '',
      purchaser: '',
      purchaserTel: '',
      purchaserMail: '',
      recipient: '',
      recipientTel: '',
      recipientMail: '',
      invoiceRecipient: '',
      invoiceRecipientTel: '',
      invoiceRecipientMail: '',
      deliveryLocation,
    })
    try {
      const detail = await loadCustomer(value)
      if (sequence !== customerLoadSequence.current) return
      const defaultContact = contactByName(detail.contacts, detail.contactName) || detail.contacts?.[0]
      setContacts(detail.contacts || [])
      if (defaultContact) {
        patch({
          customerContactId: defaultContact.id || null,
          contactName: defaultContact.name || '',
          purchaser: defaultContact.name || '',
          purchaserTel: defaultContact.phone || '',
          purchaserMail: defaultContact.email || '',
          recipient: defaultContact.name || '',
          recipientTel: defaultContact.phone || '',
          recipientMail: defaultContact.email || '',
          invoiceRecipient: defaultContact.name || '',
          invoiceRecipientTel: defaultContact.phone || '',
          invoiceRecipientMail: defaultContact.email || '',
        })
      }
    } catch (err) {
      if (sequence === customerLoadSequence.current) setError((err as Error).message || '联系人加载失败')
    }
  }
  const handleCustomerInput = (value: string) => {
    const customer = customers.find((item) => normalizeLookup(item.name) === normalizeLookup(value) || normalizeLookup(item.code) === normalizeLookup(value))
    if (customer?.id) {
      void chooseCustomer(String(customer.id))
      return
    }
    customerLoadSequence.current += 1
    patch({ customerId: null, customerCode: '', customerName: value, customerContactId: null, contactName: '' })
    setContacts([])
  }


  const patchContactField = (field: 'purchaser' | 'recipient' | 'invoiceRecipient', value: string) => {
    const contact = contactByName(linkedContacts, value)
    const next: Partial<MrOrder> = { [field]: value }
    if (field === 'purchaser') {
      next.purchaserTel = contact?.phone || ''
      next.purchaserMail = contact?.email || ''
    }
    if (field === 'recipient') {
      next.recipientTel = contact?.phone || ''
      next.recipientMail = contact?.email || ''
    }
    if (field === 'invoiceRecipient') {
      next.invoiceRecipientTel = contact?.phone || ''
      next.invoiceRecipientMail = contact?.email || ''
    }
    patch(next)
  }
  const patchContactPhoneField = (field: 'purchaserTel' | 'recipientTel' | 'invoiceRecipientTel', value: string) => {
    const contact = linkedContacts.find((item) => item.phone && item.phone === value)
    const next: Partial<MrOrder> = { [field]: value }
    if (contact?.name) {
      if (field === 'purchaserTel') { next.purchaser = contact.name; next.purchaserMail = contact.email || '' }
      if (field === 'recipientTel') { next.recipient = contact.name; next.recipientMail = contact.email || '' }
      if (field === 'invoiceRecipientTel') { next.invoiceRecipient = contact.name; next.invoiceRecipientMail = contact.email || '' }
    }
    patch(next)
  }
  const patchContactMailField = (field: 'purchaserMail' | 'recipientMail' | 'invoiceRecipientMail', value: string) => {
    const contact = linkedContacts.find((item) => item.email && item.email.toLowerCase() === value.trim().toLowerCase())
    const next: Partial<MrOrder> = { [field]: value }
    if (contact?.name) {
      if (field === 'purchaserMail') { next.purchaser = contact.name; next.purchaserTel = contact.phone || '' }
      if (field === 'recipientMail') { next.recipient = contact.name; next.recipientTel = contact.phone || '' }
      if (field === 'invoiceRecipientMail') { next.invoiceRecipient = contact.name; next.invoiceRecipientTel = contact.phone || '' }
    }
    patch(next)
  }


  const applyQuotationImport = async (result: QuotationImportResult, selectedMode?: number) => {
    const salesTotal = result.salesTotalExcludingTax ?? result.sources.find((source) => source.role === 'sales')?.total
    const suggested = suggestPricingMode(result)
    const importedMode = Number(selectedMode) || Number(calculated?.pricingMode) || suggested.mode
    const importedInvoiceType = calculated?.invoiceType || suggestInvoiceType(result)
    const imported = normalizeCostTaxRates(result.items, importedInvoiceType)
    const items = importedMode === 2
      ? singleIntegrationItems(imported, importedInvoiceType, calculated?.installOptions || [])
      : imported
    const metadataCustomer = result.metadata?.customer?.trim() || ''
    const matchedCustomer = !calculated?.customerId
      ? result.metadata?.matchedCustomer || customers.find((customer) => [customer.name, customer.code].some((value) => normalizeLookup(value) === normalizeLookup(metadataCustomer)))
      : undefined
    let importedContacts = linkedContacts
    if (matchedCustomer) {
      if (matchedCustomer.contacts?.length) {
        importedContacts = matchedCustomer.contacts
      } else {
        try {
          const detail = await loadCustomer(matchedCustomer.id)
          importedContacts = detail.contacts || []
        } catch (err) {
          setError((err as Error).message || '客户联系人加载失败')
        }
      }
    }
    const nextCustomerId = calculated?.customerId || matchedCustomer?.id || null
    importedContacts = importedContacts.filter((contact) => nextCustomerId && String(contact.customerId) === String(nextCustomerId))
    if (matchedCustomer) setContacts(importedContacts)
    const importedContact = contactByName(importedContacts, result.metadata?.attn)
      || contactByName(importedContacts, matchedCustomer?.contactName)
      || importedContacts[0]
    const nextCustomerName = calculated?.customerId
      ? calculated.customerName
      : matchedCustomer?.name || metadataCustomer || calculated?.customerName || ''
    const deliveryCustomer = matchedCustomer || customers.find((customer) => String(customer.id) === String(nextCustomerId))
    const defaultDeliveryLocation = deliveryCustomer?.salesDeliveryAddress || deliveryCustomer?.mapAddress || deliveryCustomer?.address || deliveryCustomer?.mapPoiName || ''
    const selectedContact = importedContacts.find((contact) => String(contact.id) === String(calculated?.customerContactId))
    const nextContactId = selectedContact?.id || importedContact?.id || null
    const nextContactName = selectedContact
      ? calculated?.contactName
      : importedContact?.name || result.metadata?.attn || calculated?.contactName || ''
    const importedContactName = importedContact?.name || result.metadata?.attn || ''
    const importedContactPhone = importedContact?.phone || ''
    const importedContactMail = importedContact?.email || ''
    const importPatch = {
      pricingMode: importedMode,
      invoiceType: importedInvoiceType || calculated?.invoiceType || '',
      items: syncInstallOptions(items, [], calculated?.installOptions || []),
      totalExcludingTax: importedMode === 3 ? calculated?.totalExcludingTax : calculated?.totalExcludingTax || salesTotal || null,
      quotationFiles: result.files,
      customerId: nextCustomerId,
      customerName: nextCustomerName,
      customerPo: calculated?.customerPo || result.metadata?.customerPo || '',
      latestDeliveryDate: calculated?.latestDeliveryDate || result.metadata?.latestDeliveryDate || '',
      deliveryLocation: calculated?.deliveryLocation || result.metadata?.deliveryLocation || defaultDeliveryLocation,
      customerContactId: nextContactId,
      contactName: nextContactName,
      purchaser: calculated?.purchaser || importedContactName,
      purchaserTel: calculated?.purchaserTel || importedContactPhone,
      purchaserMail: calculated?.purchaserMail || importedContactMail,
      recipient: calculated?.recipient || importedContactName,
      recipientTel: calculated?.recipientTel || importedContactPhone,
      recipientMail: calculated?.recipientMail || importedContactMail,
      invoiceRecipient: calculated?.invoiceRecipient || importedContactName,
      invoiceRecipientTel: calculated?.invoiceRecipientTel || importedContactPhone,
      invoiceRecipientMail: calculated?.invoiceRecipientMail || importedContactMail,
      paymentTerms: calculated?.paymentTerms || paymentFromQuotation(result.metadata?.payment),
    }
    patch(importPatch)
    // 导入结果立即自动保存，避免预览/回退页面时未保存的导入内容丢失
    if (id && form) {
      try {
        const saved = await updateMr(id, calculateForm({ ...form, ...importPatch }))
        setForm(saved)
        setDirty(false)
        setImportAnimationKey((current) => current + 1)
        toast.success(`已导入 ${items.length} 个品项并自动保存，留存 ${result.sources.length} 份报价原始附件；建议计价模式为“${PRICING_LABELS[importedMode]}”${matchedCustomer ? `；已匹配客户档案：${matchedCustomer.name}` : ''}`)
      } catch {
        setImportAnimationKey((current) => current + 1)
        toast.warning(`已导入 ${items.length} 个品项，但自动保存失败；请在页面手动保存，避免预览或离开后丢失`)
      }
    } else {
      setImportAnimationKey((current) => current + 1)
      toast.success(`已导入 ${items.length} 个品项，并留存 ${result.sources.length} 份报价原始附件；原有附件均已保留。建议计价模式为“${PRICING_LABELS[importedMode]}”${matchedCustomer ? `；已匹配客户档案：${matchedCustomer.name}` : ''}`)
    }
    if (metadataCustomer && !matchedCustomer && !calculated?.customerId) toast.warning(`报价中的客户“${metadataCustomer}”未匹配到客户档案，系统已暂存客户名称；请确认或手动关联。`)
  }
  const save = async () => {
    if (!id || !calculated) return null
    setBusy(true)
    setError('')
    setErrors([])
    try {
      const saved = await updateMr(id, calculated)
      setForm(saved)
      setDirty(false)
      if (saved.status === 'in_review') setEditing(false)
      toast.success(saved.status === 'in_review' ? '修改已保存；请确认申请内容后继续签核。' : '草稿已保存')
      return saved
    } catch (err) {
      setError((err as Error).message || '保存失败')
      setErrors(validationDetails(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!id || !calculated) return
    setBusy(true)
    setError('')
    setErrors([])
    try {
      if (dirty) await updateMr(id, calculated)
      const submitted = await submitMr(id)
      setForm(submitted)
      setDirty(false)
      toast.success('已提交签核流程')
    } catch (err) {
      setError((err as Error).message || '提交失败')
      setErrors(validationDetails(err))
    } finally {
      setBusy(false)
    }
  }


  const confirmDecision = async () => {
    if (!id || !decision || (decision !== 'approve' && !reason.trim())) return
    setBusy(true)
    try {
      const next = decision === 'approve'
        ? await approveMr(id)
        : decision === 'reject'
          ? await rejectMr(id, reason.trim(), rejectTarget)
          : decision === 'withdraw'
            ? await withdrawMr(id, reason.trim())
            : await voidMr(id, reason.trim())
      setForm(next)
      setEditing(false)
      setDecision(null)
      setReason('')
      window.dispatchEvent(new CustomEvent('mr:approval-changed'))
      if (decision === 'approve' && next.autoApprovedStep) {
        toast.success(`当前签核已完成，因您同时负责下一环节，已一并完成「${next.autoApprovedStep}」签核`)
      } else {
        const messages = { approve: next.status === 'approved' ? 'MR 已完成全部签核' : '当前签核步骤已完成，流程已转至下一步', reject: '已驳回并退回修改', withdraw: 'MR 已撤回并恢复为草稿', void: 'MR 已作废' }
        toast.success(messages[decision])
      }
    } catch (err) {
      const details = validationDetails(err)
      setError((err as Error).message || '操作失败')
      setErrors(details)
      if (assistantReview && details.length) {
        setDecision(null)
        setEditing(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const confirmReassign = async () => {
    if (!id || !reassignSalesId) return
    setBusy(true)
    try {
      const next = await reassignMrSales(id, reassignSalesId)
      setForm(next)
      setReassignOpen(false)
      toast.success('业务负责人已变更；未完成的签核流程将由新业务负责人的对应助理重新提交。')
    } catch (err) {
      setError((err as Error).message || '业务负责人变更失败')
    } finally {
      setBusy(false)
    }
  }

  /** 从已作废 MR 复制全部业务内容，生成一张新的草稿申请（Ctrl.NO 与报价附件不复制） */
  const duplicateAsNew = async () => {
    if (!form) return
    setBusy(true)
    setError('')
    try {
      const {
        id: _id, status: _status, createdAt: _createdAt, updatedAt: _updatedAt,
        submittedAt: _submittedAt, approvedAt: _approvedAt, rejectedAt: _rejectedAt, voidedAt: _voidedAt,
        voidReason: _voidReason, rejectReason: _rejectReason, withdrawReason: _withdrawReason, returnTarget: _returnTarget,
        versionNo: _versionNo, archiveStatus: _archiveStatus, archiveError: _archiveError, archivedDocumentTypes: _archivedDocumentTypes,
        autoApprovedStep: _autoApprovedStep, approvals: _approvals, approvalHistory: _approvalHistory,
        currentVersion: _currentVersion, quotationFiles: _quotationFiles, permissions: _permissions,
        fileName: _fileName, salesOwnerName: _salesOwnerName, salesOwnerRole: _salesOwnerRole,
        assistantUserId: _assistantUserId, assistantName: _assistantName,
        customerCode: _customerCode, customerAddress: _customerAddress, customerMapAddress: _customerMapAddress,
        currentStepKey: _currentStepKey, currentStepLabel: _currentStepLabel,
        currentAssigneeUserId: _currentAssigneeUserId, currentAssigneeName: _currentAssigneeName, assignmentError: _assignmentError,
        quotationFileId: _quotationFileId,
        ...payload
      } = form
      const next = await createMr({ ...payload, ctrlNo: null, quotationFileId: null })
      toast.success('已复制原单内容，生成新的草稿申请；修改后可直接提交签核')
      navigate(`/mr/${next.id}`)
    } catch (err) {
      setError((err as Error).message || '复制为新申请失败')
    } finally {
      setBusy(false)
    }
  }

  const refreshAttachments = (files: QuotationFile[]) => {
    setForm((current) => current ? { ...current, quotationFiles: files } : current)
  }

  const uploadAttachments = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (!files.length || !id) return
    setBusy(true)
    setError('')
    try {
      const result = await uploadMrAttachments(id, files)
      refreshAttachments(result.files)
      toast.success(`已上传 ${files.length} 个附件`)
    } catch (err) {
      setError((err as Error).message || '附件上传失败')
    } finally {
      setBusy(false)
    }
  }

  const deleteAttachment = async (file: QuotationFile) => {
    if (!id) return
    if (!window.confirm(`确定删除附件「${file.name}」吗？`)) return
    setBusy(true)
    try {
      const result = await deleteQuotationFile(id, file.id)
      refreshAttachments(result.files)
      toast.success('附件已删除')
    } catch (err) {
      setError((err as Error).message || '附件删除失败')
    } finally {
      setBusy(false)
    }
  }

  /** 附件点击交互：PDF 在浏览器内预览，其余类型直接下载。 */
  const openAttachment = async (file: QuotationFile) => {
    if (!id) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
      setPreviewBusy(true)
      try {
        const blob = await fetchQuotationBlob(id, file.id)
        setAttachmentPreview({ file, data: new Uint8Array(await blob.arrayBuffer()) })
      } catch (err) {
        setError((err as Error).message || '附件预览失败')
      } finally {
        setPreviewBusy(false)
      }
    } else {
      downloadQuotation(id, file.id, file.name).catch((err) => setError((err as Error).message || '附件下载失败'))
    }
  }

  /** 品项明细顶部“添加品项”：追加空行并自动聚焦进入编辑。 */
  const addItem = () => {
    if (!calculated) return
    const current = calculated.items || []
    if (current.length >= 200) return
    const next = [...current, { ...blankItem(defaultCostTaxRate(calculated.invoiceType)), installBy: (calculated.installOptions || []).filter((value) => value !== 'NO').join('、') }]
    patch({ items: next })
    setFocusItemIndex(next.length - 1)
  }

  const errorCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of errors) {
      const section = sectionOfField(item.field)
      if (section) counts[section] = (counts[section] || 0) + 1
    }
    return counts
  }, [errors])

  const goToSection = (sectionId: string) => {
    setActiveSection(sectionId)
    scrollToSection(sectionId)
  }

  /** Jump from a validation message to the field's section, flashing the card. */
  const goToError = (item: ValidationError) => {
    const section = sectionOfField(item.field)
    if (!section) return
    const itemIndex = itemIndexOf(item.field)
    if (itemIndex !== null) setFocusItemIndex(itemIndex)
    goToSection(section)
    setFlashSection(section)
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }
  if (error && (!calculated || !constants)) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-sm text-destructive">{error}</div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => navigateAway('/mr')}>返回 MR 列表</Button><Button onClick={() => void load()}>重试</Button></div>
      </div>
    )
  }
  if (!calculated || !constants) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  const status = calculated.status || 'draft'
  const contactCandidates = linkedContacts.filter((item) => item.id && item.name)
  const contactChoices = Array.from(new Map([...contactCandidates.filter((item) => String(item.id) === String(calculated.customerContactId)), ...contactCandidates].map((item) => [String(item.id), item])).values())
  const selectedCustomer = customers.find((item) => String(item.id) === String(calculated.customerId))
  const deliveryLocations = [
    { value: selectedCustomer?.salesDeliveryAddress, label: '销售交付地址' },
    { value: selectedCustomer?.mapAddress, label: '工程服务地址' },
    { value: selectedCustomer?.address, label: '工程服务地址' },
    { value: selectedCustomer?.mapPoiName, label: '工程服务地点' },
  ]
    .filter((item): item is { value: string; label: string } => Boolean(item.value))
    .filter((item, index, options) => options.findIndex((option) => option.value === item.value) === index)
  const itemSetupReady = Boolean(calculated.pricingMode && calculated.invoiceType)
  const marginRate = calculated.totals?.marginRate
  const lowMargin = marginRate !== null && marginRate !== undefined && Number(marginRate) < 15
  const highValue = Number(calculated.totals?.salesExcludingTax) > 750000
  const sectionCounts = { items: calculated.items?.length || 0 }
  const summary = (layout: 'rail' | 'bar') => (
    <SummaryPanel
      order={calculated}
      errorCount={errors.length}
      busy={busy}
      layout={layout}
      animationKey={importAnimationKey}
      onApprove={() => { if (dirty) toast.error('请先保存修改，再进行签核'); else { setDecision('approve'); setReason('') } }}
      onReject={() => { setDecision('reject'); setReason('') }}
      onShowErrors={() => errorListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
    />
  )

  const approvalDocumentToolbar = (
    <div className="mr-print-toolbar">
      <div><strong className="block text-sm text-foreground">签核文件预览</strong><span>未填写的选填字段会标记为“未填写”；正式归档文件将隐藏空白字段。</span></div>
      <Button onClick={() => navigate(`/mr/${id}/print`, { state: { previewOrder: form || calculated } })}>
        <Eye className="mr-2 size-4" />全屏预览
      </Button>
    </div>
  )

  return (
    <div className="min-h-full bg-muted/30">
      <ErrorToast message={error} />
      <datalist id="mr-contact-phone-options">{contactChoices.filter((contact) => contact.phone).map((contact) => <option key={`phone-${contact.id || contact.phone}`} value={contact.phone || ''}>{contact.name || ''}</option>)}</datalist>
      <datalist id="mr-contact-mail-options">{contactChoices.filter((contact) => contact.email).map((contact) => <option key={`mail-${contact.id || contact.email}`} value={contact.email || ''}>{contact.name || ''}</option>)}</datalist>
      <datalist id="mr-delivery-location-options">{deliveryLocations.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}</datalist>

      <div data-mr-sticky-header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigateAway('/mr')}><ArrowLeft className="size-4" /></Button>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">MR 申请工作台</div>
              <div className="truncate text-xs text-muted-foreground">
                {calculated.customerName || `草稿 #${calculated.id}`} · {calculated.ctrlNo || 'Ctrl.NO 未填写'}
                {dirty ? ' · 未保存' : ''}
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status !== 'in_review' ? (
              <Button variant="outline" onClick={() => navigate(`/mr/${id}/print`, { state: { previewOrder: calculated } })}>
                <Eye className="mr-2 size-4" />预览
              </Button>
            ) : null}
            {status === 'approved' ? (
              <Button variant="outline" disabled={!approvedDocumentReady} title={calculated.archiveError || undefined} onClick={() => { if (id) void downloadMrDocument(id, 'approved').catch((err) => setError((err as Error).message || 'PDF 下载失败')) }}>
                <FileDown className="mr-2 size-4" />{approvedDocumentReady ? '下载正式 PDF' : calculated.archiveStatus === 'failed' ? '归档重试中' : '归档处理中'}
              </Button>
            ) : null}
            {status === 'voided' ? (
              <Button variant="outline" disabled={busy} onClick={() => void duplicateAsNew()} title="复制本单全部业务内容，生成新的草稿申请；Ctrl.NO 与报价附件需重新填写">
                <CopyPlus className="mr-2 size-4" />复制为新申请
              </Button>
            ) : null}
            {status === 'voided' ? (
              <Button variant="outline" disabled={!voidedDocumentReady} title={calculated.archiveError || undefined} onClick={() => { if (id) void downloadMrDocument(id, 'voided').catch((err) => setError((err as Error).message || 'PDF 下载失败')) }}>
                <FileDown className="mr-2 size-4" />{voidedDocumentReady ? '作废归档 PDF' : calculated.archiveStatus === 'failed' ? '作废归档重试中' : '作废归档处理中'}
              </Button>
            ) : null}
            {assistantReview && !editing ? <Button onClick={() => setEditing(true)}><Pencil className="mr-2 size-4" />编辑申请单</Button> : null}
            {assistantReview && editing ? <Button variant="outline" onClick={() => { if (!dirty || window.confirm('确认放弃未保存的修改吗？')) { setDirty(false); setEditing(false); void load() } }}><Undo2 className="mr-2 size-4" />退出编辑</Button> : null}
            {calculated.permissions?.canWithdraw ? <Button variant="outline" onClick={() => { setDecision('withdraw'); setReason('') }}><Undo2 className="mr-2 size-4" />撤回</Button> : null}
            {user?.role === 'admin' && !['approved', 'voided'].includes(status) ? <Button variant="outline" onClick={() => { setReassignSalesId(String(calculated.salesOwnerId || salespeople[0]?.id || '')); setReassignOpen(true) }}>变更业务负责人</Button> : null}
            {calculated.permissions?.canVoid ? <Button variant="outline" onClick={() => { setDecision('void'); setReason('') }}>作废</Button> : null}
            {editable ? (
              <Button variant="outline" disabled={busy || !dirty} onClick={() => void save()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}{status === 'in_review' ? '保存修改' : '保存草稿'}
              </Button>
            ) : null}
            {editable && ['draft', 'rejected'].includes(status) ? <Button disabled={busy} onClick={() => void submit()}><Send className="mr-2 size-4" />提交签核</Button> : null}
          </div>
        </div>
        {!documentMode ? (
          <div className="border-t lg:hidden">
          <SectionNav
            sections={WORKBENCH_SECTIONS}
            activeId={activeSection}
            errorCounts={errorCounts}
            counts={sectionCounts}
            orientation="horizontal"
            onNavigate={goToSection}
          />
          </div>
        ) : null}
        {!documentMode ? <div className="border-t"><WorkbenchMetrics order={calculated} animationKey={importAnimationKey} /></div> : null}
      </div>

      {documentMode ? (
        <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 min-[1600px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm"><MrDocumentView order={form || calculated} toolbar={approvalDocumentToolbar} embedded /></div>
          <aside className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">当前签核信息</h2><StatusBadge status={status} /></div>
              <div className="mt-3 text-sm"><span className="text-muted-foreground">签核步骤：</span>{calculated.currentStepKey === 'sales' ? '业务负责人' : calculated.currentStepKey === 'engineering' ? '工程会签' : calculated.currentStepLabel || '-'}</div>
              <div className="mt-1 text-sm"><span className="text-muted-foreground">当前签核人：</span>{calculated.currentAssigneeName || '待配置签核人'}</div>
              {calculated.assignmentError ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{calculated.assignmentError}</div> : null}
              {assistantReview ? <p className="mt-3 text-xs text-muted-foreground">如需补充字段，请选择顶部“编辑申请单”；保存后将返回本页，再继续签核。</p> : null}
            </div>
            {calculated.currentVersion && calculated.currentStepKey !== 'assistant' ? (
              <details className="rounded-xl border bg-card p-4 shadow-sm" open>
                <summary className="cursor-pointer font-semibold">助理修改摘要 · V{calculated.currentVersion.versionNo}（{calculated.currentVersion.changes.length} 项变更）</summary>
                <div className="mt-3 max-h-64 space-y-2 overflow-auto">
                  {calculated.currentVersion.changes.length ? calculated.currentVersion.changes.map((change, index) => (
                    <div key={`${change.field}-${index}`} className="rounded-md bg-muted/40 p-2 text-xs">
                      <div className="font-medium">{changeLabel(change.field)}</div>
                      <div className="mt-1 grid gap-1 text-muted-foreground"><span>变更前：{changeValue(change.before)}</span><span>变更后：{changeValue(change.after)}</span></div>
                    </div>
                  )) : <div className="text-sm text-muted-foreground">助理未修改提交内容。</div>}
                </div>
              </details>
            ) : null}
            <div className="rounded-xl border bg-card p-4 shadow-sm"><ApprovalPanel order={calculated} /></div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="font-semibold">附件（{calculated.quotationFiles?.length || 0}）</h2>
              <div className="mt-3"><MrAttachments files={calculated.quotationFiles || []} editable={false} busy={busy} onUpload={() => {}} onDelete={() => {}} onOpen={(file) => void openAttachment(file)} /></div>
            </div>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">{summary('rail')}</div>
          </aside>
        </div>
      ) : (
        <>
      <div className="mx-auto max-w-[1700px] space-y-6 px-4 py-5 sm:px-6">
        {highValue || lowMargin ? (
          <div className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
            {highValue ? '未税总计超过 75 万元；' : ''}
            {lowMargin ? `整单毛利率 ${percent(marginRate)} 低于 15%；` : ''}
            签核流程将增加副总经理签核步骤。
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-5 pb-24 lg:pb-6">
          {status === 'rejected' ? (
            <div className="rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-medium">签核已驳回</div>
              <div className="mt-1">{calculated.rejectReason || '请修改申请内容后重新提交；签核流程将从助理步骤重新开始。'}</div>
            </div>
          ) : null}
          {status === 'voided' && calculated.voidReason ? (
            <div className="rounded-xl border-l-4 border-zinc-400 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
              <div className="font-medium">该申请单已作废</div>
              <div className="mt-1">{calculated.voidReason}</div>
            </div>
          ) : null}

          {errors.length ? (
            <div ref={errorListRef} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="size-4" />规范检查未通过（{errors.length}）
              </div>
              <p className="mt-1 text-xs text-amber-800">点击任一条可跳到对应分区。</p>
              <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
                {errors.map((item, index) => (
                  <li key={`${item.field}-${index}`}>
                    <button
                      type="button"
                      onClick={() => goToError(item)}
                      className="w-full rounded px-1.5 py-1 text-left text-sm text-amber-900 hover:bg-amber-100 hover:underline"
                    >
                      · {item.message || '字段不完整'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <SectionCard id="trade" title="交易信息" icon={MR_SECTIONS[1].icon} description="当前计价模式和发票类型同时适用于报价导入及手动录入。" flash={flashSection === 'trade'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <SubPanel title="计价与发票">
                <Field label="计价模式" editable={editable} readonlyText={PRICING_LABELS[Number(calculated.pricingMode)] || '-'}>
                  <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-background p-1">
                    {constants.pricingModes.map((mode) => (
                      <Button key={mode.value} type="button" size="sm" variant={Number(calculated.pricingMode) === mode.value ? 'default' : 'ghost'} onClick={() => changePricingMode(mode.value)}>
                        {mode.label}
                      </Button>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="发票类型" editable={editable} readonlyText={textValue(calculated.invoiceType)}>
                    <Select
                      value={calculated.invoiceType || ''}
                      onValueChange={changeInvoiceType}
                    >
                      <SelectTrigger><SelectValue placeholder="选择发票类型" /></SelectTrigger>
                      <SelectContent>{constants.INVOICE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field required={Number(calculated.pricingMode) === 1 || Number(calculated.pricingMode) === 2} label="未税总计" editable={editable} readonlyText={`¥ ${money(calculated.totalExcludingTax)}`}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={calculated.totalExcludingTax ?? ''}
                      disabled={!calculated.pricingMode || Number(calculated.pricingMode) === 3}
                      placeholder="订单总金额（不含税）"
                      onChange={(e) => patch({ totalExcludingTax: asNumber(e.target.value) })}
                    />
                  </Field>
                  <Field label="项目分类" editable={editable} readonlyText={textValue(calculated.caseCategory)}>
                    <Select value={calculated.caseCategory || ''} onValueChange={(value) => patch({ caseCategory: value })}>
                      <SelectTrigger><SelectValue placeholder="选择项目分类" /></SelectTrigger>
                      <SelectContent>{constants.CASE_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                {editable ? (
                  <p className="text-xs text-muted-foreground">
                    {!calculated.pricingMode
                      ? '请先选择计价模式；报价导入与手动录入均按当前模式处理。'
                      : Number(calculated.pricingMode) === 1
                        ? '请先填写未税总计，再录入各品项采购成本。若销售报价未提供逐项未税单价，系统将按采购成本（不含税）占比分摊未税总计。'
                        : Number(calculated.pricingMode) === 2
                          ? '请先填写未税总计；系统将未税总计按主项 99%、技术服务 1% 自动分配。'
                          : '请逐项填写未税单价；未税总计由各品项未税小计自动汇总。'}
                  </p>
                ) : null}
              </SubPanel>

              <SubPanel title="合同与罚则">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="合同编号（选填）" editable={editable} readonlyText={textValue(calculated.contractNo)} className="sm:col-span-2">
                    <Input value={calculated.contractNo || ''} placeholder="无合同时可留空" onChange={(e) => patch({ contractNo: e.target.value })} />
                  </Field>
                  <Field label="罚则说明（选填）" editable={editable} readonlyText={textValue(calculated.penaltyContent)} className="sm:col-span-2">
                    <Textarea rows={2} value={calculated.penaltyContent || ''} placeholder="无罚则时可留空" onChange={(e) => patch({ penaltyContent: e.target.value })} />
                  </Field>
                </div>
              </SubPanel>
            </div>
          </SectionCard>

          <SectionCard
            id="items"
            title="品项明细"
            icon={MR_SECTIONS[5].icon}
            description={`共 ${calculated.items?.length || 0} 个品项`}
          actions={editable || calculated.quotationFiles?.length ? (
              <div className="flex items-center gap-2">
                {editable && itemSetupReady ? (
                  <Button variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-2 size-4" />添加品项
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet className="mr-2 size-4" />报价导入
                </Button>
              </div>
            ) : null}
          >
            {editable && !itemSetupReady ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>{!calculated.pricingMode ? '请先选择计价模式；报价导入与手动录入均按当前模式处理。' : '请先选择发票类型，再编辑品项。'}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => goToSection('trade')}>完善交易信息</Button>
              </div>
            ) : null}
            <MrItemTable
              order={calculated}
              editable={editable && itemSetupReady}
              vendors={vendors}
              workOptions={constants.WORK_OPTIONS}
              focusIndex={focusItemIndex}
              onFocusHandled={() => setFocusItemIndex(null)}
              onChange={(items: MrItem[]) => patch({ items })}
            />
            <div className="mt-5 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: '未税总计', value: <AnimatedMoney value={calculated.totals?.salesExcludingTax} animationKey={importAnimationKey} />, warn: false },
                { label: '销售税额', value: <AnimatedMoney value={calculated.totals?.vat} animationKey={importAnimationKey} />, warn: false },
                { label: '含税总计', value: <AnimatedMoney value={calculated.totals?.salesIncludingTax} animationKey={importAnimationKey} />, warn: false },
                { label: '采购成本（不含税）', value: <AnimatedMoney value={calculated.totals?.costExcludingTax} animationKey={importAnimationKey} />, warn: false },
                { label: '整单毛利率', value: <AnimatedPercent value={calculated.totals?.marginRate} animationKey={importAnimationKey} />, warn: Number(calculated.totals?.marginRate) < 15 },
              ].map(({ label, value, warn }) => (
                <div key={`${label}-${importAnimationKey}`} className={`bg-card p-4 ${importAnimationKey ? 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-700' : ''}`}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? 'text-red-600' : ''}`}>{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard id="identity" title="客户与单号" icon={MR_SECTIONS[0].icon} flash={flashSection === 'identity'}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="客户名称" editable={editable} readonlyText={textValue(calculated.customerName)} className="xl:col-span-2">
                <SmartCombobox
                  value={calculated.customerName || ''}
                  readOnly={!editable}
                  placeholder="搜索现有客户；如无匹配，提交时将自动建立客户档案"
                  options={customers.map((customer) => ({ value: String(customer.id), label: customer.name || '', hint: customer.code || '' }))}
                  onChange={handleCustomerInput}
                  onSelect={(option) => void chooseCustomer(option.value)}
                />
              </Field>
              <Field label="Ctrl.NO" editable={editable} readonlyText={textValue(calculated.ctrlNo)}>
                <Input value={calculated.ctrlNo || ''} onChange={(e) => patch({ ctrlNo: e.target.value })} />
              </Field>
              <Field label="客户 P/O" editable={editable} readonlyText={textValue(calculated.customerPo)}>
                <Input value={calculated.customerPo || ''} placeholder="客户采购订单(PO)编号，选填" onChange={(e) => patch({ customerPo: e.target.value })} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard id="billing" title="开票与付款" icon={MR_SECTIONS[2].icon} flash={flashSection === 'billing'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <SubPanel title="开票信息">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="开票方式" editable={editable} readonlyText={textValue(calculated.invoiceProcess)}>
                    <Select value={calculated.invoiceProcess || ''} onValueChange={(value) => patch({ invoiceProcess: value })}>
                      <SelectTrigger><SelectValue placeholder="选择开票方式" /></SelectTrigger>
                      <SelectContent>{constants.INVOICE_PROCESSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="开票/收款时间" editable={editable} readonlyText={textValue(calculated.billingTiming)}>
                    <Input value={calculated.billingTiming || ''} placeholder="如：预计1月开票、4月收款" onChange={(e) => patch({ billingTiming: e.target.value })} />
                  </Field>
                  <Field label="开票内容" editable={editable} readonlyText={textValue(calculated.billingContent)} className="sm:col-span-2">
                    <Input value={calculated.billingContent || ''} placeholder="如：系统集成服务费 / 设备销售" onChange={(e) => patch({ billingContent: e.target.value })} />
                  </Field>
                </div>
              </SubPanel>
              <SubPanel title="付款信息">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="付款条件" editable={editable} readonlyText={textValue(calculated.paymentTerms)}>
                    <Select value={calculated.paymentTerms || ''} onValueChange={(value) => patch({ paymentTerms: value })}>
                      <SelectTrigger><SelectValue placeholder="选择付款条件" /></SelectTrigger>
                      <SelectContent>{constants.PAYMENT_TERMS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {calculated.paymentTerms === '其他' ? (
                    <Field required={calculated.paymentTerms === '其他'} label="付款条件说明" editable={editable} readonlyText={textValue(calculated.paymentOther)}>
                      <Input value={calculated.paymentOther || ''} placeholder="如：验收后 60 天" onChange={(e) => patch({ paymentOther: e.target.value })} />
                    </Field>
                  ) : null}
                </div>
              </SubPanel>
            </div>
          </SectionCard>

          <SectionCard id="contacts" title="联系人信息" icon={MR_SECTIONS[3].icon} description="可手动填写姓名、联系电话和邮箱；如内容存在于当前客户档案中，系统将自动补全对应信息。" flash={flashSection === 'contacts'}>
            <div className="overflow-x-auto border">
              <div className="min-w-[880px]">
                <div className="grid grid-cols-[150px_minmax(200px,1fr)_170px_minmax(220px,1fr)] gap-3 border-b bg-muted/30 px-4 py-3 text-sm font-medium">
                  <div>联系人角色</div><div>姓名</div><div>联系电话（选填）</div><div>邮箱（选填）</div>
                </div>
                <div className="grid grid-cols-[150px_minmax(200px,1fr)_170px_minmax(220px,1fr)] items-center gap-3 border-b px-4 py-4">
                  <div className="font-medium">采购联系人<span className="ml-0.5 text-red-600" aria-hidden="true">*</span></div>
<SmartCombobox
                  value={calculated.purchaser || ''}
                  readOnly={!editable}
                  placeholder="采购联系人姓名"
                  options={contactChoices.map((contact) => ({ value: String(contact.id), label: contact.name || '', hint: [contact.phone, contact.email].filter(Boolean).join(' · ') }))}
                  onChange={(value) => patchContactField('purchaser', value)}
                />
                  <Input list="mr-contact-phone-options" value={calculated.purchaserTel || ''} readOnly={!editable} placeholder="联系电话" onChange={(e) => patchContactPhoneField('purchaserTel', e.target.value)} />
                  <Input type="email" autoComplete="email" list="mr-contact-mail-options" value={calculated.purchaserMail || ''} readOnly={!editable} placeholder="邮箱" onChange={(e) => patchContactMailField('purchaserMail', e.target.value)} />
                </div>
                <div className="grid grid-cols-[150px_minmax(200px,1fr)_170px_minmax(220px,1fr)] items-center gap-3 border-b px-4 py-4">
                  <div className="font-medium">收货人<span className="ml-0.5 text-red-600" aria-hidden="true">*</span></div>
<SmartCombobox
                  value={calculated.recipient || ''}
                  readOnly={!editable}
                  placeholder="收货人姓名"
                  options={contactChoices.map((contact) => ({ value: String(contact.id), label: contact.name || '', hint: [contact.phone, contact.email].filter(Boolean).join(' · ') }))}
                  onChange={(value) => patchContactField('recipient', value)}
                />
                  <Input list="mr-contact-phone-options" value={calculated.recipientTel || ''} readOnly={!editable} placeholder="联系电话" onChange={(e) => patchContactPhoneField('recipientTel', e.target.value)} />
                  <Input type="email" autoComplete="email" list="mr-contact-mail-options" value={calculated.recipientMail || ''} readOnly={!editable} placeholder="邮箱" onChange={(e) => patchContactMailField('recipientMail', e.target.value)} />
                </div>
                <div className="grid grid-cols-[150px_minmax(200px,1fr)_170px_minmax(220px,1fr)] items-center gap-3 px-4 py-4">
                  <div className="font-medium">发票收件人</div>
<SmartCombobox
                  value={calculated.invoiceRecipient || ''}
                  readOnly={!editable}
                  placeholder="发票收件人姓名"
                  options={contactChoices.map((contact) => ({ value: String(contact.id), label: contact.name || '', hint: [contact.phone, contact.email].filter(Boolean).join(' · ') }))}
                  onChange={(value) => patchContactField('invoiceRecipient', value)}
                />
                  <Input list="mr-contact-phone-options" value={calculated.invoiceRecipientTel || ''} readOnly={!editable} placeholder="联系电话" onChange={(e) => patchContactPhoneField('invoiceRecipientTel', e.target.value)} />
                  <Input type="email" autoComplete="email" list="mr-contact-mail-options" value={calculated.invoiceRecipientMail || ''} readOnly={!editable} placeholder="邮箱" onChange={(e) => patchContactMailField('invoiceRecipientMail', e.target.value)} />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="delivery" title="交付、验收与服务" icon={MR_SECTIONS[4].icon} flash={flashSection === 'delivery'}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="最晚交付日期" editable={editable} readonlyText={textValue(calculated.latestDeliveryDate)}>
                <Input type="date" value={calculated.latestDeliveryDate || ''} onChange={(e) => patch({ latestDeliveryDate: e.target.value })} />
              </Field>
              <Field label="是否允许分批交付" editable={editable} readonlyText={choiceValue(calculated.splitDelivery, '允许', '不允许')}>
                <BinaryChoice value={calculated.splitDelivery} yes="允许" no="不允许" onChange={(value) => patch({ splitDelivery: value })} />
              </Field>
              <Field label="验收条件" editable={editable} readonlyText={textValue(calculated.acceptance)}>
                <Select value={calculated.acceptance || ''} onValueChange={(value) => patch({ acceptance: value })}>
                  <SelectTrigger><SelectValue placeholder="选择验收条件" /></SelectTrigger>
                  <SelectContent>{constants.ACCEPTANCE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {calculated.acceptance === '其他' ? (
                <Field required={calculated.acceptance === '其他'} label="验收说明" editable={editable} readonlyText={textValue(calculated.acceptanceOther)}>
                  <Input value={calculated.acceptanceOther || ''} placeholder="请说明验收方式/标准" onChange={(e) => patch({ acceptanceOther: e.target.value })} />
                </Field>
              ) : null}
              <Field label="交付地点" editable={editable} readonlyText={textValue(calculated.deliveryLocation)} className="md:col-span-2 xl:col-span-2">
                <Input list="mr-delivery-location-options" value={calculated.deliveryLocation || ''} placeholder="选择销售或工程服务地址，也可直接输入" onChange={(e) => patch({ deliveryLocation: e.target.value })} />
              </Field>
              <WorkOptions
                label="装机承担方"
                value={calculated.installOptions || []}
                choices={constants.WORK_OPTIONS}
                editable={editable}
                onChange={(value) => patch({ installOptions: value, items: syncInstallOptions(calculated.items || [], calculated.installOptions || [], value) })}
              />
              <WorkOptions
                label="维护承担方"
                value={calculated.maintenanceOptions || []}
                choices={constants.WORK_OPTIONS}
                editable={editable}
                onChange={(value) => patch({ maintenanceOptions: value })}
              />
            </div>
            {editable && (calculated.installOptions || []).includes('敦阳') ? (
              <p className="mt-3 text-xs text-muted-foreground">装机承担方包含“敦阳”时，签核流程将增加工程会签步骤。</p>
            ) : null}
          </SectionCard>

          <SectionCard id="remark" title="备注与其他" icon={MR_SECTIONS[6].icon} flash={flashSection === 'remark'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <SubPanel title="毛利认列">
                {editable ? <p className="-mt-2 text-xs text-muted-foreground">按财务要求一次性或分期确认本单毛利；分期需选开始月份、填写期数与总金额。</p> : null}
                <ScheduleEntriesEditor
                  entries={calculated.grossProfitRecognitions || []}
                  editable={editable}
                  actionLabel="认列"
                  onChange={(next) => patch({ grossProfitRecognitions: next })}
                />
              </SubPanel>
              <SubPanel title="台湾业务转拨">
                {editable ? <p className="-mt-2 text-xs text-muted-foreground">将部分毛利转拨给台湾业务方，需填写接收方名称与转拨金额。</p> : null}
                <ScheduleEntriesEditor
                  entries={calculated.taiwanBusinessTransfers || []}
                  editable={editable}
                  actionLabel="转拨"
                  withBusinessName
                  onChange={(next) => patch({ taiwanBusinessTransfers: next })}
                />
                {(() => {
                  const transferTotal = (calculated.taiwanBusinessTransfers || []).reduce((sum, entry) => sum + (Number(entry.totalAmount) || 0), 0)
                  const sales = calculated.totals?.salesExcludingTax
                  const cost = calculated.totals?.costExcludingTax
                  if (!sales || cost === null || cost === undefined) return null
                  const margin = sales - cost
                  const retention = margin - transferTotal
                  const rate = sales > 0 ? retention / sales * 100 : null
                  return (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      扣除转拨后留存毛利 ¥ {money(retention)}{rate !== null ? ` · 留存毛利率 ${rate.toFixed(2)}%` : ''}
                      <span className="ml-2 text-xs text-emerald-700">（毛利 ¥ {money(margin)} − 转拨 ¥ {money(transferTotal)}）</span>
                    </div>
                  )
                })()}
              </SubPanel>
            </div>
            <Field label="备注" editable={editable} readonlyText={textValue(calculated.remark)} className="mt-4">
              <Textarea rows={4} value={calculated.remark || ''} placeholder="补充说明（选填）" onChange={(e) => patch({ remark: e.target.value })} />
            </Field>
          </SectionCard>

          <SectionCard id="approval" title="电子签核流程" icon={MR_SECTIONS[7].icon} flash={flashSection === 'approval'}>
            <ApprovalPanel order={calculated} layout="horizontal" />
            {status === 'approved' ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="size-4" />全部签核已完成，可另存为 PDF 并归档。</div>
            ) : null}
          </SectionCard>

          <SectionCard id="attachments" title="附件" icon={Paperclip} description="报价、合同等附件随 MR 单一并留存；签核流转时签核人可在右侧查看。PDF 点击在浏览器内预览，其他类型点击下载。" flash={flashSection === 'attachments'}>
            <MrAttachments files={calculated.quotationFiles || []} editable={editable} busy={busy} onUpload={(list) => void uploadAttachments(list)} onDelete={(file) => void deleteAttachment(file)} onOpen={(file) => void openAttachment(file)} />
          </SectionCard>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur lg:hidden">
        {summary('bar')}
      </div>
        </>
      )}

      {id ? (
        <QuotationImportDialog
          orderId={id}
          open={importOpen}
          editable={editable}
          invoiceType={calculated.invoiceType}
          pricingMode={calculated.pricingMode}
          existingFiles={calculated.quotationFiles || []}
          vendors={vendors}
          onOpenChange={setImportOpen}
          onApply={(result, selectedMode) => void applyQuotationImport(result, selectedMode)}
          onStoredFilesChange={(files) => patch({ quotationFiles: files })}
        />
      ) : null}

      <Dialog open={Boolean(attachmentPreview)} onOpenChange={(open) => { if (!open) setAttachmentPreview(null) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[92vh] max-w-5xl overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="size-4" />{attachmentPreview?.file.name || '附件预览'}</DialogTitle>
            <DialogDescription>浏览器内直接预览 PDF；如需保存或打开其他格式，请使用下方下载。</DialogDescription>
          </DialogHeader>
          {attachmentPreview ? <PdfPreview data={attachmentPreview.data} title={attachmentPreview.file.name} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachmentPreview(null)}>关闭</Button>
            <Button variant="outline" onClick={() => { if (attachmentPreview && id) void downloadQuotation(id, attachmentPreview.file.id, attachmentPreview.file.name).catch((err) => setError((err as Error).message || '附件下载失败')) }}><Download className="mr-2 size-4" />下载</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>变更业务负责人</DialogTitle><DialogDescription>变更后，所有未完成的签核任务将关闭，申请单将转交新的业务负责人。新业务负责人须在“我的设置”中确认对应助理，再由助理重新核对并提交签核；历史签核记录不受影响。</DialogDescription></DialogHeader>
          <Select value={reassignSalesId} onValueChange={setReassignSalesId}>
            <SelectTrigger><SelectValue placeholder="选择新的业务负责人" /></SelectTrigger>
            <SelectContent>{salespeople.map((sales) => <SelectItem key={sales.id} value={String(sales.id)}>{sales.realName || sales.username}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter><Button variant="outline" onClick={() => setReassignOpen(false)}>取消</Button><Button disabled={busy || !reassignSalesId || Number(reassignSalesId) === Number(calculated.salesOwnerId)} onClick={() => void confirmReassign()}>确认变更</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open) setDecision(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === 'approve' ? '确认电子签核' : decision === 'reject' ? '驳回 MR 申请' : decision === 'withdraw' ? '撤回 MR 申请' : '作废 MR 申请'}</DialogTitle>
            <DialogDescription>
              {decision === 'approve'
                ? `本次操作将以当前登录账号完成电子签核。签核版本为 V${assistantReview ? Number(calculated.versionNo || 0) + 1 : calculated.versionNo || calculated.currentVersion?.versionNo || 1}，未税总计为 ¥ ${money(calculated.totals?.salesExcludingTax)}；签核完成后，该版本不可修改。`
                : decision === 'reject'
                  ? '请选择退回对象并填写原因；完成修改后，签核流程将从助理步骤重新开始。'
                  : decision === 'withdraw'
                    ? '撤回后，当前待办将关闭，MR 申请将恢复为草稿；重新提交时，签核流程将从助理步骤开始。'
                    : '作废后，将生成作废归档 PDF。'}
            </DialogDescription>
          </DialogHeader>
          {decision === 'reject' ? (
            <Field label="退回对象">
              <Select value={rejectTarget} onValueChange={(value) => setRejectTarget(value as 'sales' | 'assistant')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="sales">业务负责人</SelectItem><SelectItem value="assistant">对应助理</SelectItem></SelectContent>
              </Select>
            </Field>
          ) : null}
          {decision !== 'approve' ? (
            <Field label={decision === 'reject' ? '驳回原因' : decision === 'withdraw' ? '撤回原因' : '作废原因'}>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>取消</Button>
            <Button variant={decision === 'void' ? 'destructive' : 'default'} disabled={busy || (decision !== 'approve' && !reason.trim())} onClick={() => void confirmDecision()}>
              {decision === 'approve' ? '确认签核' : decision === 'reject' ? '确认驳回' : decision === 'withdraw' ? '确认撤回' : '确认作废'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
