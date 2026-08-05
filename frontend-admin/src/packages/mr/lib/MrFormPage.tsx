import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileSpreadsheet, Loader2, Printer, Save, Send, ShieldCheck } from 'lucide-react'
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
  getMr,
  getMrConstants,
  loadCustomer,
  loadMrReferences,
  rejectMr,
  submitMr,
  updateMr,
  voidMr,
} from '../client'
import type { CustomerOption, MrConstants, MrItem, MrOrder, QuotationImportResult, UserOption, VendorOption } from '../types'
import { ApprovalPanel } from './ApprovalPanel'
import { calculateForm, normalizeCostTaxRates, singleIntegrationItems } from './form-logic'
import { MR_SECTIONS, itemIndexOf, scrollToSection, sectionOfField } from './form-sections'
import { SectionNav, SummaryPanel } from './MrFormRail'
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

type ValidationError = { field?: string; message?: string }
type Decision = 'reject' | 'void' | null

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

function validationDetails(error: unknown): ValidationError[] {
  const details = (error as Error & { details?: unknown })?.details
  return Array.isArray(details) ? details.filter((item): item is ValidationError => Boolean(item && typeof item === 'object')) : []
}

export function MrFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState<MrOrder | null>(null)
  const [constants, setConstants] = useState<MrConstants | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [salespeople, setSalespeople] = useState<UserOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [contacts, setContacts] = useState<CustomerOption['contacts']>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [decision, setDecision] = useState<Decision>(null)
  const [reason, setReason] = useState('')
  const [activeSection, setActiveSection] = useState(MR_SECTIONS[0].id)
  const [flashSection, setFlashSection] = useState('')
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null)
  const loadSequence = useRef(0)
  const ignoreNextPop = useRef(false)
  const errorListRef = useRef<HTMLDivElement | null>(null)

  const calculated = useMemo(() => form ? calculateForm(form) : null, [form])
  const editable = Boolean(form?.permissions?.canEdit)

  const load = useCallback(async () => {
    if (!id) return
    const sequence = ++loadSequence.current
    setLoading(true)
    setError('')
    try {
      const [order, optionData, references] = await Promise.all([getMr(id), getMrConstants(), loadMrReferences()])
      const customer = order.customerId ? await loadCustomer(order.customerId) : null
      if (sequence !== loadSequence.current) return
      setForm(order)
      setConstants(optionData)
      setCustomers(references.customers)
      setSalespeople(references.salespeople)
      setVendors(references.vendors)
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
    const nodes = MR_SECTIONS
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
      warnings.push('开明细中的手填销售单价会改为系统自动计算。')
    }
    const secondIsService = Boolean(currentItems[1] && `${currentItems[1].name || ''}${currentItems[1].description || ''}`.includes('服务'))
    if (nextMode === 2 && (currentItems.length > 2 || (currentItems.length === 2 && !secondIsService))) {
      warnings.push('单项系统集成只保留第一项作为主项，并重建第二项“技术服务”；其余品项会删除。')
    }
    if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\n确定切换计价模式吗？`)) return

    if (nextMode === 3) {
      patch({ pricingMode: 3, items: currentItems.map((item) => ({ ...item, unitPrice: item.unitPrice ?? null })) })
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
    patch({ customerId: value, customerContactId: null, customerName: customer?.name || '', customerCode: customer?.code || '', contactName: '' })
    try {
      const detail = await loadCustomer(value)
      setContacts(detail.contacts || [])
    } catch (err) {
      setError((err as Error).message || '联系人加载失败')
    }
  }

  const chooseContact = (value: string) => {
    if (value === 'none') return patch({ customerContactId: null, contactName: '' })
    const contact = contacts?.find((item) => String(item.id) === value)
    patch({ customerContactId: value, contactName: contact?.name || '' })
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
      toast.success('草稿已保存')
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

  const approve = async () => {
    if (!id) return
    setBusy(true)
    try {
      const next = await approveMr(id)
      setForm(next)
      toast.success(next.status === 'approved' ? 'MR 已全部签核通过' : '签核完成，已流转到下一步')
    } catch (err) {
      setError((err as Error).message || '签核失败')
    } finally {
      setBusy(false)
    }
  }

  const confirmDecision = async () => {
    if (!id || !decision || !reason.trim()) return
    setBusy(true)
    try {
      const next = decision === 'reject' ? await rejectMr(id, reason.trim()) : await voidMr(id, reason.trim())
      setForm(next)
      setDecision(null)
      setReason('')
      toast.success(decision === 'reject' ? '已驳回并退回修改' : 'MR 已作废')
    } catch (err) {
      setError((err as Error).message || '操作失败')
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

  if (loading || !calculated || !constants) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  const status = calculated.status || 'draft'
  const contactValue = calculated.customerContactId ? String(calculated.customerContactId) : 'none'
  const salesOwnerValue = calculated.salesOwnerId ? String(calculated.salesOwnerId) : 'none'
  const hasContract = Number(calculated.hasContract) === 1
  const itemSetupReady = Boolean(calculated.pricingMode && calculated.invoiceType)
  const sectionCounts = { items: calculated.items?.length || 0 }

  const summary = (layout: 'rail' | 'bar') => (
    <SummaryPanel
      order={calculated}
      errorCount={errors.length}
      busy={busy}
      layout={layout}
      onApprove={() => void approve()}
      onReject={() => { setDecision('reject'); setReason('') }}
      onShowErrors={() => errorListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
    />
  )

  return (
    <div className="min-h-full bg-muted/30">
      <ErrorToast message={error} />

      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigateAway('/mr')}><ArrowLeft className="size-4" /></Button>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{calculated.customerName || `MR 草稿 #${calculated.id}`}</div>
              <div className="truncate text-xs text-muted-foreground">
                {calculated.customerCode || '-'} / {calculated.ctrlNo || '未填 Ctrl.NO'}
                {dirty ? ' · 未保存' : ''}
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {editable || calculated.quotationFiles?.length ? (
              <Button variant="outline" disabled={editable && !itemSetupReady} title={!itemSetupReady ? '请先选择计价模式和发票别' : undefined} onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="mr-2 size-4" />报价文件{calculated.quotationFiles?.length ? ` (${calculated.quotationFiles.length})` : ''}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => dirty ? toast.error('请先保存草稿再打印') : navigateAway(`/mr/${id}/print`)}>
              <Printer className="mr-2 size-4" />打印预览
            </Button>
            {calculated.permissions?.canVoid ? <Button variant="outline" onClick={() => { setDecision('void'); setReason('') }}>作废</Button> : null}
            {editable ? (
              <Button variant="outline" disabled={busy || !dirty} onClick={() => void save()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}保存草稿
              </Button>
            ) : null}
            {editable ? <Button disabled={busy} onClick={() => void submit()}><Send className="mr-2 size-4" />提交签核</Button> : null}
          </div>
        </div>
        <div className="border-t lg:hidden">
          <SectionNav
            sections={MR_SECTIONS}
            activeId={activeSection}
            errorCounts={errorCounts}
            counts={sectionCounts}
            orientation="horizontal"
            onNavigate={goToSection}
          />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1700px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 overflow-hidden rounded-xl border bg-card shadow-sm">
            <SectionNav
              sections={MR_SECTIONS}
              activeId={activeSection}
              errorCounts={errorCounts}
              counts={sectionCounts}
              orientation="vertical"
              onNavigate={goToSection}
            />
            {summary('rail')}
          </div>
        </aside>

        <div className="min-w-0 space-y-5 pb-24 lg:pb-6">
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

          <SectionCard id="identity" title="客户与单号" icon={MR_SECTIONS[0].icon} flash={flashSection === 'identity'}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="客户名称" editable={editable} readonlyText={textValue(calculated.customerName)} className="xl:col-span-2">
                <Select value={calculated.customerId ? String(calculated.customerId) : ''} onValueChange={chooseCustomer}>
                  <SelectTrigger><SelectValue placeholder="从客户档案选择" /></SelectTrigger>
                  <SelectContent>{customers.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.code ? `${item.code} · ` : ''}{item.name || item.id}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="客户联系人" editable={editable} readonlyText={textValue(calculated.contactName)}>
                <Select value={contactValue} disabled={!calculated.customerId} onValueChange={chooseContact}>
                  <SelectTrigger><SelectValue placeholder="选择联系人" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不关联联系人</SelectItem>
                    {(contacts || []).filter((item) => item.id).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name || item.id}{item.phone ? ` · ${item.phone}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="负责业务" editable={editable} readonlyText={textValue(calculated.salesOwnerName)}>
                <Select value={salesOwnerValue} disabled={user?.role === 'sales'} onValueChange={(value) => patch({ salesOwnerId: value === 'none' ? null : value })}>
                  <SelectTrigger><SelectValue placeholder="选择业务" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未指定</SelectItem>
                    {salespeople.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.realName || item.username || item.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ctrl.NO" editable={editable} readonlyText={textValue(calculated.ctrlNo)}>
                <Input value={calculated.ctrlNo || ''} onChange={(e) => patch({ ctrlNo: e.target.value })} />
              </Field>
              <Field label="客户 P/O" editable={editable} readonlyText={textValue(calculated.customerPo)}>
                <Input value={calculated.customerPo || ''} onChange={(e) => patch({ customerPo: e.target.value })} />
              </Field>
              <Field label="填单日期" editable={editable} readonlyText={textValue(calculated.fillDate)}>
                <Input type="date" value={calculated.fillDate || ''} onChange={(e) => patch({ fillDate: e.target.value })} />
              </Field>
              <Field label="最晚交货日" editable={editable} readonlyText={textValue(calculated.latestDeliveryDate)}>
                <Input type="date" value={calculated.latestDeliveryDate || ''} onChange={(e) => patch({ latestDeliveryDate: e.target.value })} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard id="trade" title="交易设置" icon={MR_SECTIONS[1].icon} description="先确定计价模式与发票别，随后才可导入或添加品项。" flash={flashSection === 'trade'}>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="发票别" editable={editable} readonlyText={textValue(calculated.invoiceType)}>
                    <Select
                      value={calculated.invoiceType || ''}
                      onValueChange={changeInvoiceType}
                    >
                      <SelectTrigger><SelectValue placeholder="选择发票别" /></SelectTrigger>
                      <SelectContent>{constants.INVOICE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="未税总计" editable={editable} readonlyText={`¥ ${money(calculated.totalExcludingTax)}`}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={calculated.totalExcludingTax ?? ''}
                      disabled={!calculated.pricingMode || Number(calculated.pricingMode) === 3}
                      onChange={(e) => patch({ totalExcludingTax: asNumber(e.target.value) })}
                    />
                  </Field>
                </div>
                {editable ? (
                  <p className="text-xs text-muted-foreground">
                    {!calculated.pricingMode
                      ? '第一步：先选择计价模式；系统会据此决定未税总计和销售单价的填写方式。'
                      : Number(calculated.pricingMode) === 1
                        ? '先填未税总计，再录入各项成本；销售单价按未税 COST 占比自动分摊。'
                        : Number(calculated.pricingMode) === 2
                          ? '先填未税总计；品项固定为主项与技术服务，销售额按 99% / 1% 自动分配。'
                          : '逐项填写未税销售单价，未税总计由品项售价自动汇总。'}
                  </p>
                ) : null}
              </SubPanel>

              <SubPanel
                title="合约"
                actions={editable ? <BinaryChoice value={calculated.hasContract} onChange={(value) => patch({ hasContract: value })} /> : <span className="text-sm">{choiceValue(calculated.hasContract, '签合约', '不签合约')}</span>}
              >
                {hasContract ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="合同号" editable={editable} readonlyText={textValue(calculated.contractNo)}>
                      <Input value={calculated.contractNo || ''} onChange={(e) => patch({ contractNo: e.target.value })} />
                    </Field>
                    <Field label="合约类型" editable={editable} readonlyText={textValue(calculated.contractType)}>
                      <Select value={calculated.contractType || ''} onValueChange={(value) => patch({ contractType: value })}>
                        <SelectTrigger><SelectValue placeholder="选择合约类型" /></SelectTrigger>
                        <SelectContent>{constants.CONTRACT_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label="是否有罚则" editable={editable} readonlyText={choiceValue(calculated.hasPenalty)}>
                      <BinaryChoice value={calculated.hasPenalty} onChange={(value) => patch({ hasPenalty: value })} />
                    </Field>
                    {Number(calculated.hasPenalty) === 1 ? (
                      <Field label="罚则内容" editable={editable} readonlyText={textValue(calculated.penaltyContent)} className="sm:col-span-2">
                        <Textarea rows={3} value={calculated.penaltyContent || ''} onChange={(e) => patch({ penaltyContent: e.target.value })} />
                      </Field>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">本单不签合约</div>
                )}
              </SubPanel>
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
                    <Field label="付款条件说明" editable={editable} readonlyText={textValue(calculated.paymentOther)}>
                      <Input value={calculated.paymentOther || ''} onChange={(e) => patch({ paymentOther: e.target.value })} />
                    </Field>
                  ) : null}
                  <Field label="分批送机" editable={editable} readonlyText={choiceValue(calculated.splitDelivery, '可', '否')}>
                    <BinaryChoice value={calculated.splitDelivery} yes="可" no="否" onChange={(value) => patch({ splitDelivery: value })} />
                  </Field>
                </div>
              </SubPanel>
            </div>
          </SectionCard>

          <SectionCard id="contacts" title="采购与收件联系人" icon={MR_SECTIONS[3].icon} flash={flashSection === 'contacts'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <SubPanel title="客户采购">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="采购人" editable={editable} readonlyText={textValue(calculated.purchaser)}>
                    <Input value={calculated.purchaser || ''} onChange={(e) => patch({ purchaser: e.target.value })} />
                  </Field>
                  <Field label="采购电话" editable={editable} readonlyText={textValue(calculated.purchaserTel)}>
                    <Input value={calculated.purchaserTel || ''} onChange={(e) => patch({ purchaserTel: e.target.value })} />
                  </Field>
                </div>
              </SubPanel>
              <SubPanel title="发票与收件">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="发票收件人" editable={editable} readonlyText={textValue(calculated.invoiceRecipient)}>
                    <Input value={calculated.invoiceRecipient || ''} onChange={(e) => patch({ invoiceRecipient: e.target.value })} />
                  </Field>
                  <Field label="收件人" editable={editable} readonlyText={textValue(calculated.recipient)}>
                    <Input value={calculated.recipient || ''} onChange={(e) => patch({ recipient: e.target.value })} />
                  </Field>
                  <Field label="收件电话" editable={editable} readonlyText={textValue(calculated.recipientTel)}>
                    <Input value={calculated.recipientTel || ''} onChange={(e) => patch({ recipientTel: e.target.value })} />
                  </Field>
                  <Field label="收件邮箱" editable={editable} readonlyText={textValue(calculated.recipientMail)}>
                    <Input type="email" value={calculated.recipientMail || ''} onChange={(e) => patch({ recipientMail: e.target.value })} />
                  </Field>
                </div>
              </SubPanel>
            </div>
          </SectionCard>

          <SectionCard id="delivery" title="交付、验收与服务" icon={MR_SECTIONS[4].icon} flash={flashSection === 'delivery'}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="案分类" editable={editable} readonlyText={textValue(calculated.caseCategory)}>
                <Select value={calculated.caseCategory || ''} onValueChange={(value) => patch({ caseCategory: value })}>
                  <SelectTrigger><SelectValue placeholder="选择案分类" /></SelectTrigger>
                  <SelectContent>{constants.CASE_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="验收" editable={editable} readonlyText={textValue(calculated.acceptance)}>
                <Select value={calculated.acceptance || ''} onValueChange={(value) => patch({ acceptance: value })}>
                  <SelectTrigger><SelectValue placeholder="选择验收条件" /></SelectTrigger>
                  <SelectContent>{constants.ACCEPTANCE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {calculated.acceptance === '其他' ? (
                <Field label="验收说明" editable={editable} readonlyText={textValue(calculated.acceptanceOther)}>
                  <Input value={calculated.acceptanceOther || ''} onChange={(e) => patch({ acceptanceOther: e.target.value })} />
                </Field>
              ) : null}
              <Field label="送机地点" editable={editable} readonlyText={textValue(calculated.deliveryLocation)} className="md:col-span-2 xl:col-span-2">
                <Textarea rows={2} value={calculated.deliveryLocation || ''} onChange={(e) => patch({ deliveryLocation: e.target.value })} />
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

          <SectionCard
            id="items"
            title="品项明细"
            icon={MR_SECTIONS[5].icon}
            description={`共 ${calculated.items?.length || 0} 项`}
            flash={flashSection === 'items'}
            actions={editable || calculated.quotationFiles?.length ? (
              <Button variant="outline" size="sm" disabled={editable && !itemSetupReady} title={!itemSetupReady ? '请先选择计价模式和发票别' : undefined} onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="mr-2 size-4" />报价导入
              </Button>
            ) : null}
          >
            {editable && !itemSetupReady ? (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                请先在“交易设置”中选择计价模式和发票别，再导入报价或添加品项。
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

          <SectionCard id="remark" title="备注" icon={MR_SECTIONS[6].icon} flash={flashSection === 'remark'}>
            {editable
              ? <Textarea rows={4} value={calculated.remark || ''} onChange={(e) => patch({ remark: e.target.value })} />
              : <div className="min-h-6 text-sm break-words whitespace-pre-wrap">{textValue(calculated.remark)}</div>}
          </SectionCard>

          <SectionCard id="approval" title="电子签流转" icon={MR_SECTIONS[7].icon} flash={flashSection === 'approval'}>
            <ApprovalPanel order={calculated} />
            {status === 'approved' ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="size-4" />全部签核完成，可打印存档。</div>
            ) : null}
          </SectionCard>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur lg:hidden">
        {summary('bar')}
      </div>

      {id ? (
        <QuotationImportDialog
          orderId={id}
          open={importOpen}
          editable={editable && itemSetupReady}
          invoiceType={calculated.invoiceType}
          pricingMode={calculated.pricingMode}
          existingFiles={calculated.quotationFiles || []}
          onOpenChange={setImportOpen}
          onApply={(result: QuotationImportResult) => {
            const salesFile = result.files[result.salesSourceIndex]
            const salesTotal = result.sources.find((source) => source.role === 'sales')?.total
            const imported = normalizeCostTaxRates(result.items, calculated.invoiceType)
            const items = Number(calculated.pricingMode) === 2
              ? singleIntegrationItems(imported, calculated.invoiceType, calculated.installOptions || [])
              : imported
            patch({
              items: syncInstallOptions(items, [], calculated.installOptions || []),
              totalExcludingTax: Number(calculated.pricingMode) === 3 ? calculated.totalExcludingTax : calculated.totalExcludingTax || salesTotal || null,
              quotationFileId: salesFile?.id || null,
              quotationFiles: result.files,
              contactName: calculated.contactName || result.metadata?.attn || '',
              paymentTerms: calculated.paymentTerms || paymentFromQuotation(result.metadata?.payment),
            })
            toast.success(`已导入 ${items.length} 个品项和 ${result.files.length} 份原文件`)
          }}
        />
      ) : null}

      <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open) setDecision(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === 'reject' ? '驳回 MR' : '作废 MR'}</DialogTitle>
            <DialogDescription>
              {decision === 'reject' ? '驳回后业务或助理可修改，重新提交会从助理开始签核。' : '已通过的 MR 不会删除，作废原因会永久留存。'}
            </DialogDescription>
          </DialogHeader>
          <Field label={decision === 'reject' ? '驳回原因' : '作废原因'}>
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>取消</Button>
            <Button variant={decision === 'reject' ? 'default' : 'destructive'} disabled={busy || !reason.trim()} onClick={() => void confirmDecision()}>
              {decision === 'reject' ? '确认驳回' : '确认作废'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
