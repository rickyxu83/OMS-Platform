import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileDown, FileSpreadsheet, Loader2, Pencil, Printer, Save, Send, ShieldCheck, Undo2 } from 'lucide-react'
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
  downloadMrDocument,
  getMr,
  getMrConstants,
  loadCustomer,
  loadMrReferences,
  rejectMr,
  reassignMrSales,
  submitMr,
  updateMr,
  voidMr,
  withdrawMr,
} from '../client'
import type { CustomerOption, MrConstants, MrItem, MrOrder, QuotationImportResult, UserOption, VendorOption } from '../types'
import { ApprovalPanel } from './ApprovalPanel'
import { MrDocumentView } from './MrPrintPage'
import { calculateForm, normalizeCostTaxRates, quotationDetailItems, singleIntegrationItems } from './form-logic'
import { MR_SECTIONS, itemIndexOf, scrollToSection, sectionOfField } from './form-sections'
import { SectionNav, SummaryPanel, WorkbenchMetrics } from './MrFormRail'
import { MrItemTable } from './MrItemTable'
import {
  BinaryChoice,
  Field,
  SectionCard,
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
  if ((result.items || []).length === 1 && serviceSignal) return { mode: 2, reason: '单一主设备/服务，并识别到安装或服务内容' }
  if ((result.items || []).length > 1 || purchaseCount > 1) return { mode: 1, reason: `识别到 ${result.items.length} 个品项或多份供应商成本来源` }
  return { mode: 3, reason: '只有单一品项，未识别到整包集成或安装服务' }
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
  customerId: '客户', customerContactId: '客户联系人', salesOwnerId: '负责业务', customerName: '客户名称', contactName: '联系人',
  caseCategory: '案分类', customerPo: '客户 P/O', ctrlNo: 'Ctrl.NO', invoiceType: '发票别', pricingMode: '计价模式', totalExcludingTax: '未税总计',
  invoiceProcess: '发票处理', billingContent: '开票内容', invoiceRecipient: '开票对象', billingTiming: '开票/收款时间', purchaser: '采购联系人', purchaserTel: '采购电话',
  recipient: '收件人', recipientTel: '收件电话', recipientMail: '收件邮箱', paymentTerms: '付款条件', paymentOther: '付款说明', splitDelivery: '分批送机',
  acceptance: '验收条件', acceptanceOther: '验收说明', installOptions: '装机承担方', maintenanceOptions: '维护承担方', contractNo: '合同编号', penaltyContent: '罚则',
  fillDate: '填表日期', latestDeliveryDate: '最晚交货日', deliveryLocation: '交货地点', shipmentNo: '出货单号', deliveryTerms: '交货条款', remark: '备注', approvalSteps: '签核链', totals: '金额汇总',
  salesExcludingTax: '未税售价', vat: '销售税额', salesIncludingTax: '含税售价', costExcludingTax: '未税成本', costIncludingTax: '含税成本', marginRate: '毛利率',
}
const ITEM_CHANGE_LABELS: Record<string, string> = { companyPartNo: '公司料号', oemSpec: '原厂规格', name: '品名', description: '描述', warrantyService: '保固服务', installBy: '装机', qty: '数量', unitPrice: '销售单价', subtotal: '销售小计', vendor: '厂商', costInclTax: '成本含税', taxRate: '成本税率', purchaseOrderNo: '采购单号', costSource: '成本来源' }
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
  const [decision, setDecision] = useState<Decision>(null)
  const [reason, setReason] = useState('')
  const [rejectTarget, setRejectTarget] = useState<'sales' | 'assistant'>('sales')
  const [editing, setEditing] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignSalesId, setReassignSalesId] = useState('')
  const [activeSection, setActiveSection] = useState(WORKBENCH_SECTIONS[0].id)
  const [flashSection, setFlashSection] = useState('')
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null)
  const loadSequence = useRef(0)
  const ignoreNextPop = useRef(false)
  const errorListRef = useRef<HTMLDivElement | null>(null)

  const calculated = useMemo(() => form ? calculateForm(form) : null, [form])
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
        recipient: order.recipient || defaultContact.name || '',
        recipientTel: order.recipientTel || defaultContact.phone || '',
        invoiceRecipient: order.invoiceRecipient || defaultContact.name || '',
      } : order
      if (sequence !== loadSequence.current) return
      setForm(hydratedOrder)
      setEditing(false)
      setConstants(optionData)
      setCustomers(references.customers)
      setVendors(references.vendors)
      setSalespeople(references.salespeople.filter((candidate) => candidate.role === 'sales'))
      setContacts(customer?.contacts || [])
      setDirty(false)
    } catch (err) {
      if (sequence === loadSequence.current) setError((err as Error).message || 'MR 单加载失败')
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
    const message = '当前 MR 有未保存修改，确定离开吗？'
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
    const warnings: string[] = []
    if (currentMode === 3 && nextMode !== 3 && currentItems.some((item) => item.unitPrice !== null && item.unitPrice !== undefined)) {
      warnings.push('开明细中的逐项销售单价会按系统集成规则重算。')
    }
    const secondIsService = Boolean(currentItems[1] && `${currentItems[1].name || ''}${currentItems[1].description || ''}`.includes('服务'))
    if (nextMode === 2 && (currentItems.length > 2 || (currentItems.length === 2 && !secondIsService))) {
      warnings.push('单项系统集成只保留第一项作为主项，并重建第二项“技术服务”；其余品项会删除。')
    }
    if (currentMode === 1 && nextMode === 3) {
      const quotedCount = currentItems.filter((item) => item.quotedUnitPrice != null).length
      warnings.push(quotedCount ? `将恢复 ${quotedCount} 项销售报价原始单价，其余项目保留当前系统分摊价并待人工确认。` : '销售报价没有逐项单价，将保留当前系统分摊价并转为逐项确认。')
    }
    if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\n确定切换计价模式吗？`)) return
    if (nextMode === 3) {
      patch({ pricingMode: 3, items: currentMode === 1 ? quotationDetailItems(currentItems) : currentItems })
      return
    }
    if (nextMode === 2) {
      patch({ pricingMode: 2, items: singleIntegrationItems(currentItems, form.invoiceType, form.installOptions || []) })
      return
    }
    patch({ pricingMode: nextMode })
  }

  const changeInvoiceType = (invoiceType: string) => {
    patch({ invoiceType, items: normalizeCostTaxRates(form?.items || [], invoiceType) })
  }

  const navigateAway = (path: string) => {
    if (dirty && !window.confirm('当前 MR 有未保存修改，确定离开吗？')) return
    setDirty(false)
    navigate(path)
  }

  const chooseCustomer = async (value: string) => {
    const customer = customers.find((item) => String(item.id) === value)
    patch({ customerId: value, customerContactId: null, customerName: customer?.name || '', customerCode: customer?.code || '', contactName: '', purchaser: '', purchaserTel: '', recipient: '', recipientTel: '', recipientMail: '', invoiceRecipient: '' })
    try {
      const detail = await loadCustomer(value)
      const defaultContact = contactByName(detail.contacts, detail.contactName) || detail.contacts?.[0]
      setContacts(detail.contacts || [])
      if (defaultContact) {
        patch({
          customerContactId: defaultContact.id || null,
          contactName: defaultContact.name || '',
          purchaser: defaultContact.name || '',
          purchaserTel: defaultContact.phone || '',
          recipient: defaultContact.name || '',
          recipientTel: defaultContact.phone || '',
          invoiceRecipient: defaultContact.name || '',
        })
      }
    } catch (err) {
      setError((err as Error).message || '联系人加载失败')
    }
  }
  const handleCustomerInput = (value: string) => {
    const customer = customers.find((item) => normalizeLookup(item.name) === normalizeLookup(value) || normalizeLookup(item.code) === normalizeLookup(value))
    if (customer?.id) {
      void chooseCustomer(String(customer.id))
      return
    }
    patch({ customerId: null, customerCode: '', customerName: value, customerContactId: null, contactName: '' })
    setContacts([])
  }


  const patchContactField = (field: 'purchaser' | 'recipient' | 'invoiceRecipient', value: string) => {
    const contact = contactByName(contacts, value)
    const next: Partial<MrOrder> = { [field]: value }
    if (field === 'purchaser') next.purchaserTel = contact?.phone || ''
    if (field === 'recipient') next.recipientTel = contact?.phone || ''
    patch(next)
  }
  const patchContactPhoneField = (field: 'purchaserTel' | 'recipientTel', value: string) => {
    const contact = (contacts || []).find((item) => item.phone && item.phone === value)
    if (field === 'purchaserTel') patch({ purchaserTel: value, ...(contact?.name ? { purchaser: contact.name } : {}) })
    if (field === 'recipientTel') patch({ recipientTel: value, ...(contact?.name ? { recipient: contact.name } : {}) })
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
    let importedContacts = contacts || []
    if (matchedCustomer) {
      if (matchedCustomer.contacts?.length) {
        importedContacts = matchedCustomer.contacts
        setContacts(importedContacts)
      } else {
        try {
          const detail = await loadCustomer(matchedCustomer.id)
          importedContacts = detail.contacts || []
          setContacts(importedContacts)
        } catch (err) {
          setError((err as Error).message || '客户联系人加载失败')
        }
      }
    }
    const importedContact = contactByName(importedContacts, result.metadata?.attn)
      || contactByName(importedContacts, matchedCustomer?.contactName)
      || importedContacts[0]
    const nextCustomerId = calculated?.customerId || matchedCustomer?.id || null
    const nextCustomerName = calculated?.customerId
      ? calculated.customerName
      : matchedCustomer?.name || metadataCustomer || calculated?.customerName || ''
    const nextContactId = calculated?.customerContactId || importedContact?.id || null
    const nextContactName = calculated?.customerContactId
      ? calculated.contactName
      : importedContact?.name || result.metadata?.attn || calculated?.contactName || ''
    const importedContactName = importedContact?.name || result.metadata?.attn || ''
    const importedContactPhone = importedContact?.phone || ''
    patch({
      pricingMode: importedMode,
      invoiceType: importedInvoiceType || calculated?.invoiceType || '',
      items: syncInstallOptions(items, [], calculated?.installOptions || []),
      totalExcludingTax: importedMode === 3 ? calculated?.totalExcludingTax : calculated?.totalExcludingTax || salesTotal || null,
      quotationFiles: result.files,
      customerId: nextCustomerId,
      customerName: nextCustomerName,
      customerPo: calculated?.customerPo || result.metadata?.customerPo || '',
      latestDeliveryDate: calculated?.latestDeliveryDate || result.metadata?.latestDeliveryDate || '',
      deliveryLocation: calculated?.deliveryLocation || result.metadata?.deliveryLocation || '',
      customerContactId: nextContactId,
      contactName: nextContactName,
      purchaser: calculated?.purchaser || importedContactName,
      purchaserTel: calculated?.purchaserTel || importedContactPhone,
      recipient: calculated?.recipient || importedContactName,
      recipientTel: calculated?.recipientTel || importedContactPhone,
      invoiceRecipient: calculated?.invoiceRecipient || importedContactName,
      paymentTerms: calculated?.paymentTerms || paymentFromQuotation(result.metadata?.payment),
    })
    toast.success(`已导入 ${items.length} 个品项和 ${result.sources.length} 份原文件，历史附件已保留；建议计价模式：${PRICING_LABELS[importedMode]}${matchedCustomer ? `，已匹配客户 ${matchedCustomer.name}` : ''}`)
    if (metadataCustomer && !matchedCustomer && !calculated?.customerId) toast.warning(`报价中的客户“${metadataCustomer}”未在客户库里找到，已先填入名称，请确认或手动关联`)
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
      toast.success(saved.status === 'in_review' ? '修改已保存，请确认单据后会签' : '草稿已保存')
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
      toast.success('已提交签核')
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
      const messages = { approve: next.status === 'approved' ? 'MR 已全部签核通过' : '签核完成，已流转到下一步', reject: '已驳回并退回修改', withdraw: 'MR 已撤回到草稿', void: 'MR 已作废' }
      toast.success(messages[decision])
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
      toast.success('负责业务已变更；未完成流程将由新对应助理重新提交')
    } catch (err) {
      setError((err as Error).message || '负责业务变更失败')
    } finally {
      setBusy(false)
    }
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
  const contactCandidates = (contacts || []).filter((item) => item.id && item.name)
  const contactChoices = Array.from(new Map([...contactCandidates.slice(0, 3), ...contactCandidates.filter((item) => String(item.id) === String(calculated.customerContactId))].map((item) => [String(item.id), item])).values())
  const selectedCustomer = customers.find((item) => String(item.id) === String(calculated.customerId))
  const deliveryLocations = Array.from(new Set([selectedCustomer?.mapAddress, selectedCustomer?.address, selectedCustomer?.mapPoiName].filter((value): value is string => Boolean(value))))
  const deliveryChoice = deliveryLocations.includes(calculated.deliveryLocation || '') ? calculated.deliveryLocation || '' : 'custom'
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
      onApprove={() => { if (dirty) toast.error('请先保存修改，再进行会签'); else { setDecision('approve'); setReason('') } }}
      onReject={() => { setDecision('reject'); setReason('') }}
      onShowErrors={() => errorListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
    />
  )

  return (
    <div className="min-h-full bg-muted/30">
      <ErrorToast message={error} />
      <datalist id="mr-customer-options">{customers.map((customer) => <option key={customer.id} value={customer.name || ''}>{customer.code || ''}</option>)}</datalist>
      <datalist id="mr-contact-options">{contactChoices.map((contact) => <option key={contact.id || contact.name} value={contact.name}>{contact.phone || ''}</option>)}</datalist>
      <datalist id="mr-contact-phone-options">{contactChoices.filter((contact) => contact.phone).map((contact) => <option key={`phone-${contact.id || contact.phone}`} value={contact.phone || ''}>{contact.name || ''}</option>)}</datalist>

      <div className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigateAway('/mr')}><ArrowLeft className="size-4" /></Button>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">MR 交易工作台</div>
              <div className="truncate text-xs text-muted-foreground">
                {calculated.customerName || `草稿 #${calculated.id}`} · {calculated.ctrlNo || '未填 Ctrl.NO'}
                {dirty ? ' · 未保存' : ''}
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {editable || calculated.quotationFiles?.length ? (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="mr-2 size-4" />报价文件{calculated.quotationFiles?.length ? ` (${calculated.quotationFiles.length})` : ''}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => navigate(`/mr/${id}/print`, { state: { previewOrder: documentMode ? form : calculated } })}>
            <Printer className="mr-2 size-4" />{status === 'in_review' ? '查看审批文档' : '打印预览'}
            </Button>
            {status === 'approved' ? (
              <Button variant="outline" disabled={!approvedDocumentReady} title={calculated.archiveError || undefined} onClick={() => { if (id) void downloadMrDocument(id, 'approved').catch((err) => setError((err as Error).message || 'PDF 下载失败')) }}>
                <FileDown className="mr-2 size-4" />{approvedDocumentReady ? '下载正式 PDF' : calculated.archiveStatus === 'failed' ? '归档重试中' : '归档处理中'}
              </Button>
            ) : null}
            {status === 'voided' ? (
              <Button variant="outline" disabled={!approvedDocumentReady} onClick={() => { if (id) void downloadMrDocument(id, 'approved').catch((err) => setError((err as Error).message || 'PDF 下载失败')) }}>
                <FileDown className="mr-2 size-4" />原审批 PDF
              </Button>
            ) : null}
            {status === 'voided' ? (
              <Button variant="outline" disabled={!voidedDocumentReady} title={calculated.archiveError || undefined} onClick={() => { if (id) void downloadMrDocument(id, 'voided').catch((err) => setError((err as Error).message || 'PDF 下载失败')) }}>
                <FileDown className="mr-2 size-4" />{voidedDocumentReady ? '作废 PDF' : calculated.archiveStatus === 'failed' ? '作废归档重试中' : '作废归档处理中'}
              </Button>
            ) : null}
            {assistantReview && !editing ? <Button onClick={() => setEditing(true)}><Pencil className="mr-2 size-4" />修改单据</Button> : null}
            {assistantReview && editing ? <Button variant="outline" onClick={() => { if (!dirty || window.confirm('放弃未保存修改？')) { setDirty(false); setEditing(false); void load() } }}><Undo2 className="mr-2 size-4" />退出修改</Button> : null}
            {calculated.permissions?.canWithdraw ? <Button variant="outline" onClick={() => { setDecision('withdraw'); setReason('') }}><Undo2 className="mr-2 size-4" />撤回</Button> : null}
            {user?.role === 'admin' && !['approved', 'voided'].includes(status) ? <Button variant="outline" onClick={() => { setReassignSalesId(String(calculated.salesOwnerId || salespeople[0]?.id || '')); setReassignOpen(true) }}>变更负责业务</Button> : null}
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
      </div>

      {documentMode ? (
        <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 min-[1280px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm"><MrDocumentView order={form || calculated} embedded /></div>
          <aside className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">当前签核</h2><StatusBadge status={status} /></div>
              <div className="mt-3 text-sm"><span className="text-muted-foreground">节点：</span>{calculated.currentStepLabel || '-'}</div>
              <div className="mt-1 text-sm"><span className="text-muted-foreground">处理人：</span>{calculated.currentAssigneeName || '等待人员配置'}</div>
              {calculated.assignmentError ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{calculated.assignmentError}</div> : null}
              {assistantReview ? <p className="mt-3 text-xs text-muted-foreground">需要补充字段时点击顶部“修改单据”；保存后会回到本页，再执行会签。</p> : null}
            </div>
            {calculated.currentVersion && calculated.currentStepKey !== 'assistant' ? (
              <details className="rounded-xl border bg-card p-4 shadow-sm" open>
                <summary className="cursor-pointer font-semibold">助理修改摘要 · V{calculated.currentVersion.versionNo}（{calculated.currentVersion.changes.length} 项）</summary>
                <div className="mt-3 max-h-64 space-y-2 overflow-auto">
                  {calculated.currentVersion.changes.length ? calculated.currentVersion.changes.map((change, index) => (
                    <div key={`${change.field}-${index}`} className="rounded-md bg-muted/40 p-2 text-xs">
                      <div className="font-medium">{changeLabel(change.field)}</div>
                      <div className="mt-1 grid gap-1 text-muted-foreground"><span>原：{changeValue(change.before)}</span><span>新：{changeValue(change.after)}</span></div>
                    </div>
                  )) : <div className="text-sm text-muted-foreground">助理未修改提交内容。</div>}
                </div>
              </details>
            ) : null}
            <div className="rounded-xl border bg-card p-4 shadow-sm"><ApprovalPanel order={calculated} /></div>
            {calculated.quotationFiles?.length ? (
              <Button className="w-full" variant="outline" onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-2 size-4" />查看源报价附件（{calculated.quotationFiles.length}）</Button>
            ) : null}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">{summary('rail')}</div>
          </aside>
        </div>
      ) : (
        <>
          <div className="border-b"><WorkbenchMetrics order={calculated} /></div>

      <div className="mx-auto grid max-w-[1700px] gap-6 px-4 py-5 sm:px-6 min-[1450px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5 pb-24 lg:pb-6">
          {status === 'rejected' ? (
            <div className="rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-medium">签核已驳回</div>
              <div className="mt-1">{calculated.rejectReason || '请修改后重新提交，签核会从助理开始。'}</div>
            </div>
          ) : null}
          {status === 'voided' && calculated.voidReason ? (
            <div className="rounded-xl border-l-4 border-zinc-400 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
              <div className="font-medium">此单已作废</div>
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

          <SectionCard id="trade" title="交易设置" icon={MR_SECTIONS[1].icon} description="可先导入报价自动建议计价模式；手工填写时再在此设置。" flash={flashSection === 'trade'}>
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
                  <Field label="发票别" editable={editable} readonlyText={textValue(calculated.invoiceType)}>
                    <Select
                      value={calculated.invoiceType || ''}
                      onValueChange={changeInvoiceType}
                    >
                      <SelectTrigger><SelectValue placeholder="选择发票别" /></SelectTrigger>
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
                      onChange={(e) => patch({ totalExcludingTax: asNumber(e.target.value) })}
                    />
                  </Field>
                  <Field label="案分类" editable={editable} readonlyText={textValue(calculated.caseCategory)}>
                    <Select value={calculated.caseCategory || ''} onValueChange={(value) => patch({ caseCategory: value })}>
                      <SelectTrigger><SelectValue placeholder="选择案分类" /></SelectTrigger>
                      <SelectContent>{constants.CASE_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                {editable ? (
                  <p className="text-xs text-muted-foreground">
                    {!calculated.pricingMode
                      ? '可先导入报价，系统会根据品项、服务内容和供应商来源建议计价模式；手工填写时再手动选择。'
                      : Number(calculated.pricingMode) === 1
                        ? '先填未税总计，再录入各项成本；销售单价按未税 COST 占比自动分摊。'
                        : Number(calculated.pricingMode) === 2
                          ? '先填未税总计；品项固定为主项与技术服务，销售额按 99% / 1% 自动分配。'
                          : '逐项填写未税销售单价，未税总计由品项售价自动汇总。'}
                  </p>
                ) : null}
              </SubPanel>

              <SubPanel title="合约">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="合同号（不填表示无合约）" editable={editable} readonlyText={textValue(calculated.contractNo)} className="sm:col-span-2">
                    <Input value={calculated.contractNo || ''} placeholder="有合同再填写" onChange={(e) => patch({ contractNo: e.target.value })} />
                  </Field>
                  <Field label="罚则说明（选填）" editable={editable} readonlyText={textValue(calculated.penaltyContent)} className="sm:col-span-2">
                    <Textarea rows={2} value={calculated.penaltyContent || ''} placeholder="有罚则时填写，没有可留空" onChange={(e) => patch({ penaltyContent: e.target.value })} />
                  </Field>
                </div>
              </SubPanel>
            </div>
          </SectionCard>

          <SectionCard
            id="items"
            title="品项明细"
            icon={MR_SECTIONS[5].icon}
            description={`共 ${calculated.items?.length || 0} 项`}
          actions={editable || calculated.quotationFiles?.length ? (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="mr-2 size-4" />报价导入
              </Button>
            ) : null}
          >
            {editable && !itemSetupReady ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>{calculated.quotationFiles?.length ? '报价已导入，请补充或确认发票别后编辑品项。' : '可先导入报价自动建议计价模式；手工添加品项前请先设置计价模式和发票别。'}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => goToSection('trade')}>设置计价与发票</Button>
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
              {([
                ['未税总计', `¥ ${money(calculated.totals?.salesExcludingTax)}`, false],
                ['增值税', `¥ ${money(calculated.totals?.vat)}`, false],
                ['含税合计', `¥ ${money(calculated.totals?.salesIncludingTax)}`, false],
                ['COST 总计', `¥ ${money(calculated.totals?.costExcludingTax)}`, false],
                ['毛利率', percent(calculated.totals?.marginRate), Number(calculated.totals?.marginRate) < 15],
              ] as Array<[string, string, boolean]>).map(([label, value, warn]) => (
                <div key={label} className="bg-card p-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? 'text-red-600' : ''}`}>{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard id="identity" title="客户与单号" icon={MR_SECTIONS[0].icon} flash={flashSection === 'identity'}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="客户名称" editable={editable} readonlyText={textValue(calculated.customerName)} className="xl:col-span-2">
                <Input list="mr-customer-options" readOnly={!editable} value={calculated.customerName || ''} placeholder="搜索已有客户；无匹配时提交自动建档" onChange={(e) => handleCustomerInput(e.target.value)} />
              </Field>
              <Field label="Ctrl.NO" editable={editable} readonlyText={textValue(calculated.ctrlNo)}>
                <Input value={calculated.ctrlNo || ''} onChange={(e) => patch({ ctrlNo: e.target.value })} />
              </Field>
              <Field label="客户 P/O" editable={editable} readonlyText={textValue(calculated.customerPo)}>
                <Input value={calculated.customerPo || ''} onChange={(e) => patch({ customerPo: e.target.value })} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard id="billing" title="开票与付款" icon={MR_SECTIONS[2].icon} flash={flashSection === 'billing'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <SubPanel title="开票">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="发票处理" editable={editable} readonlyText={textValue(calculated.invoiceProcess)}>
                    <Select value={calculated.invoiceProcess || ''} onValueChange={(value) => patch({ invoiceProcess: value })}>
                      <SelectTrigger><SelectValue placeholder="选择处理方式" /></SelectTrigger>
                      <SelectContent>{constants.INVOICE_PROCESSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="开票 / 收款" editable={editable} readonlyText={textValue(calculated.billingTiming)}>
                    <Input value={calculated.billingTiming || ''} onChange={(e) => patch({ billingTiming: e.target.value })} />
                  </Field>
                  <Field label="开票内容" editable={editable} readonlyText={textValue(calculated.billingContent)} className="sm:col-span-2">
                    <Input value={calculated.billingContent || ''} onChange={(e) => patch({ billingContent: e.target.value })} />
                  </Field>
                </div>
              </SubPanel>
              <SubPanel title="付款">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="付款条件" editable={editable} readonlyText={textValue(calculated.paymentTerms)}>
                    <Select value={calculated.paymentTerms || ''} onValueChange={(value) => patch({ paymentTerms: value })}>
                      <SelectTrigger><SelectValue placeholder="选择付款条件" /></SelectTrigger>
                      <SelectContent>{constants.PAYMENT_TERMS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {calculated.paymentTerms === '其他' ? (
                    <Field required={calculated.paymentTerms === '其他'} label="付款条件说明" editable={editable} readonlyText={textValue(calculated.paymentOther)}>
                      <Input value={calculated.paymentOther || ''} onChange={(e) => patch({ paymentOther: e.target.value })} />
                    </Field>
                  ) : null}
                </div>
              </SubPanel>
            </div>
          </SectionCard>

          <SectionCard id="contacts" title="联系人" icon={MR_SECTIONS[3].icon} description="姓名和电话可直接手工填写；输入客户档案中的姓名或电话时会自动带出另一项。" flash={flashSection === 'contacts'}>
            <div className="overflow-x-auto border">
              <div className="min-w-[620px]">
                <div className="grid grid-cols-[180px_minmax(240px,1fr)_180px] gap-3 border-b bg-muted/30 px-4 py-3 text-sm font-medium">
                  <div>联系人角色</div><div>姓名</div><div>电话</div>
                </div>
                <div className="grid grid-cols-[180px_minmax(240px,1fr)_180px] items-center gap-3 border-b px-4 py-4">
                  <div className="font-medium">采购联系人<span className="ml-0.5 text-red-600" aria-hidden="true">*</span></div>
                  <Input list="mr-contact-options" value={calculated.purchaser || ''} readOnly={!editable} placeholder="采购联系人姓名" onChange={(e) => patchContactField('purchaser', e.target.value)} />
                  <Input list="mr-contact-phone-options" value={calculated.purchaserTel || ''} readOnly={!editable} placeholder="电话" onChange={(e) => patchContactPhoneField('purchaserTel', e.target.value)} />
                </div>
                <div className="grid grid-cols-[180px_minmax(240px,1fr)_180px] items-center gap-3 border-b px-4 py-4">
                  <div className="font-medium">货物收件人<span className="ml-0.5 text-red-600" aria-hidden="true">*</span></div>
                  <Input list="mr-contact-options" value={calculated.recipient || ''} readOnly={!editable} placeholder="收件人姓名" onChange={(e) => patchContactField('recipient', e.target.value)} />
                  <Input list="mr-contact-phone-options" value={calculated.recipientTel || ''} readOnly={!editable} placeholder="电话" onChange={(e) => patchContactPhoneField('recipientTel', e.target.value)} />
                </div>
                <div className="grid grid-cols-[180px_minmax(240px,1fr)_180px] items-center gap-3 px-4 py-4">
                  <div className="font-medium">发票收件人</div>
                  <Input list="mr-contact-options" value={calculated.invoiceRecipient || ''} readOnly={!editable} placeholder="发票收件人姓名" onChange={(e) => patchContactField('invoiceRecipient', e.target.value)} />
                  <div className="text-xs text-muted-foreground">不需要电话</div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="delivery" title="交付、验收与服务" icon={MR_SECTIONS[4].icon} flash={flashSection === 'delivery'}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="最晚交货日" editable={editable} readonlyText={textValue(calculated.latestDeliveryDate)}>
                <Input type="date" value={calculated.latestDeliveryDate || ''} onChange={(e) => patch({ latestDeliveryDate: e.target.value })} />
              </Field>
              <Field label="分批送机" editable={editable} readonlyText={choiceValue(calculated.splitDelivery, '可', '否')}>
                <BinaryChoice value={calculated.splitDelivery} yes="可" no="否" onChange={(value) => patch({ splitDelivery: value })} />
              </Field>
              <Field label="验收" editable={editable} readonlyText={textValue(calculated.acceptance)}>
                <Select value={calculated.acceptance || ''} onValueChange={(value) => patch({ acceptance: value })}>
                  <SelectTrigger><SelectValue placeholder="选择验收条件" /></SelectTrigger>
                  <SelectContent>{constants.ACCEPTANCE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {calculated.acceptance === '其他' ? (
                <Field required={calculated.acceptance === '其他'} label="验收说明" editable={editable} readonlyText={textValue(calculated.acceptanceOther)}>
                  <Input value={calculated.acceptanceOther || ''} onChange={(e) => patch({ acceptanceOther: e.target.value })} />
                </Field>
              ) : null}
              <Field label="送机地点" editable={editable} readonlyText={textValue(calculated.deliveryLocation)} className="md:col-span-2 xl:col-span-2">
                <div className="space-y-2">
                  {deliveryLocations.length ? (
                    <Select value={deliveryChoice} onValueChange={(value) => { if (value !== 'custom') patch({ deliveryLocation: value }) }}>
                      <SelectTrigger><SelectValue placeholder="选择客户地址" /></SelectTrigger>
                      <SelectContent>
                        {deliveryLocations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}
                        <SelectItem value="custom">手工填写其他地点</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Textarea rows={2} value={calculated.deliveryLocation || ''} placeholder="可从客户地址选择，也可手工填写" onChange={(e) => patch({ deliveryLocation: e.target.value })} />
                </div>
              </Field>
              <WorkOptions
                label="装机对象"
                value={calculated.installOptions || []}
                choices={constants.WORK_OPTIONS}
                editable={editable}
                onChange={(value) => patch({ installOptions: value, items: syncInstallOptions(calculated.items || [], calculated.installOptions || [], value) })}
              />
              <WorkOptions
                label="维护对象"
                value={calculated.maintenanceOptions || []}
                choices={constants.WORK_OPTIONS}
                editable={editable}
                onChange={(value) => patch({ maintenanceOptions: value })}
              />
            </div>
            {editable && (calculated.installOptions || []).includes('敦阳') ? (
              <p className="mt-3 text-xs text-muted-foreground">装机含敦阳，签核链会加入工程会签单位。</p>
            ) : null}
          </SectionCard>

          <SectionCard id="remark" title="备注" icon={MR_SECTIONS[6].icon} flash={flashSection === 'remark'}>
            {editable
              ? <Textarea rows={4} value={calculated.remark || ''} onChange={(e) => patch({ remark: e.target.value })} />
              : <div className="min-h-6 text-sm break-words whitespace-pre-wrap">{textValue(calculated.remark)}</div>}
          </SectionCard>

          <SectionCard className="min-[1450px]:hidden" id="approval" title="电子签流转" icon={MR_SECTIONS[7].icon} flash={flashSection === 'approval'}>
            <ApprovalPanel order={calculated} layout="horizontal" />
            {status === 'approved' ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="size-4" />全部签核完成，可打印存档。</div>
            ) : null}
          </SectionCard>
        </div>

        <aside className="hidden min-[1450px]:block">
          <div className="sticky top-24 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="border-b px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">签核与风险</h2>
                <StatusBadge status={status} />
              </div>
              {highValue || lowMargin ? (
                <div className="mt-3 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                  {highValue ? '未税售价超过 75 万元；' : ''}
                  {lowMargin ? `毛利率 ${percent(marginRate)} 低于 15%；` : ''}
                  需要副总经理签核。
                </div>
              ) : null}
            </div>
            <div className="border-b p-4"><ApprovalPanel order={calculated} /></div>
            {summary('rail')}
          </div>
        </aside>
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
          onOpenChange={setImportOpen}
          onApply={(result, selectedMode) => void applyQuotationImport(result, selectedMode)}
        />
      ) : null}

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>变更负责业务</DialogTitle><DialogDescription>未完成的签核会关闭，并退回新业务；新业务需在“我的设置”确认对应助理，再由助理重新核对提交。历史电子签不变。</DialogDescription></DialogHeader>
          <Select value={reassignSalesId} onValueChange={setReassignSalesId}>
            <SelectTrigger><SelectValue placeholder="选择新的负责业务" /></SelectTrigger>
            <SelectContent>{salespeople.map((sales) => <SelectItem key={sales.id} value={String(sales.id)}>{sales.realName || sales.username}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter><Button variant="outline" onClick={() => setReassignOpen(false)}>取消</Button><Button disabled={busy || !reassignSalesId || Number(reassignSalesId) === Number(calculated.salesOwnerId)} onClick={() => void confirmReassign()}>确认变更</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open) setDecision(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === 'approve' ? '确认电子签核' : decision === 'reject' ? '驳回 MR' : decision === 'withdraw' ? '撤回 MR' : '作废 MR'}</DialogTitle>
            <DialogDescription>
              {decision === 'approve'
                ? `你将以本人账号确认 ${assistantReview ? `并冻结 V${Number(calculated.versionNo || 0) + 1}` : `V${calculated.versionNo || calculated.currentVersion?.versionNo || 1}`}，未税金额 ¥ ${money(calculated.totals?.salesExcludingTax)}。签核后不可修改本版本。`
                : decision === 'reject'
                  ? '请选择退回对象并填写原因；修改后会从助理重新开始签核。'
                  : decision === 'withdraw'
                    ? '撤回后当前待办关闭，MR 回到草稿；重新提交会从助理开始。'
                    : '已通过的 MR 不会删除，原审批 PDF 永久保留，并生成作废版本。'}
            </DialogDescription>
          </DialogHeader>
          {decision === 'reject' ? (
            <Field label="退回给">
              <Select value={rejectTarget} onValueChange={(value) => setRejectTarget(value as 'sales' | 'assistant')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="sales">负责业务</SelectItem><SelectItem value="assistant">对应助理</SelectItem></SelectContent>
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
              {decision === 'approve' ? '确认同意并签核' : decision === 'reject' ? '确认驳回' : decision === 'withdraw' ? '确认撤回' : '确认作废'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
