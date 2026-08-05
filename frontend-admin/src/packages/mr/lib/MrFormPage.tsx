import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Printer, Save, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ErrorToast } from '@/components/ErrorToast'
import { useAuth } from '@/contexts/AuthContext'
import {
  approveMr,
  downloadQuotation,
  getMr,
  getMrConstants,
  loadCustomer,
  loadMrReferences,
  rejectMr,
  submitMr,
  updateMr,
  voidMr,
} from '../client'
import type { CustomerOption, MrConstants, MrItem, MrOrder, ParsedQuotationSheet, UserOption } from '../types'
import { ApprovalPanel } from './ApprovalPanel'
import { calculateForm } from './form-logic'
import { MrItemTable } from './MrItemTable'
import { QuotationImportDialog } from './QuotationImportDialog'

const STATUS_LABELS: Record<string, string> = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }
const STATUS_CLASSES: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', in_review: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-800', voided: 'bg-zinc-200 text-zinc-600' }

type ValidationError = { field?: string; message?: string }
type Decision = 'reject' | 'void' | null

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t pt-4"><h2 className="mb-4 text-base font-semibold">{title}</h2>{children}</section>
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div role="group" aria-label={label} className={`min-w-0 space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>
}

function BinaryChoice({ value, disabled, onChange, yes = '是', no = '否' }: { value?: number | boolean | null; disabled?: boolean; onChange: (value: number) => void; yes?: string; no?: string }) {
  const normalized = value === true || value === 1 ? 1 : value === false || value === 0 ? 0 : null
  return <div className="inline-flex h-9 border p-1"><Button type="button" size="sm" variant={normalized === 0 ? 'default' : 'ghost'} disabled={disabled} onClick={() => onChange(0)} className="h-7">{no}</Button><Button type="button" size="sm" variant={normalized === 1 ? 'default' : 'ghost'} disabled={disabled} onClick={() => onChange(1)} className="h-7">{yes}</Button></div>
}

function WorkOptions({ label, value, disabled, choices, onChange }: { label: string; value: string[]; disabled?: boolean; choices: string[]; onChange: (value: string[]) => void }) {
  const toggle = (choice: string, checked: boolean) => {
    if (!checked) return onChange(value.filter((item) => item !== choice))
    if (choice === 'NO') return onChange(['NO'])
    onChange([...new Set(value.filter((item) => item !== 'NO').concat(choice))])
  }
  return <Field label={label}><div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2 border px-3 py-2">{choices.map((choice) => <label key={choice} className="flex items-center gap-2 text-sm"><Checkbox checked={value.includes(choice)} disabled={disabled} onCheckedChange={(checked) => toggle(choice, Boolean(checked))} />{choice}</label>)}</div></Field>
}

function money(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  const [contacts, setContacts] = useState<CustomerOption['contacts']>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [decision, setDecision] = useState<Decision>(null)
  const [reason, setReason] = useState('')
  const loadSequence = useRef(0)
  const ignoreNextPop = useRef(false)

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

  const patch = (value: Partial<MrOrder>) => {
    setForm((current) => current ? { ...current, ...value } : current)
    setDirty(true)
    setErrors([])
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

  if (loading || !calculated || !constants) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>

  const status = calculated.status || 'draft'
  const contactValue = calculated.customerContactId ? String(calculated.customerContactId) : 'none'
  const salesOwnerValue = calculated.salesOwnerId ? String(calculated.salesOwnerId) : 'none'

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <ErrorToast message={error} />
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-y bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigateAway('/mr')}><ArrowLeft className="size-4" /></Button>
          <div className="min-w-0"><div className="truncate text-lg font-semibold">{calculated.customerName || `MR 草稿 #${calculated.id}`}</div><div className="truncate text-xs text-muted-foreground">{calculated.customerCode || '-'} / {calculated.ctrlNo || '未填 Ctrl.NO'}{dirty ? ' · 未保存' : ''}</div></div>
          <Badge className={STATUS_CLASSES[status]}>{STATUS_LABELS[status] || status}</Badge>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editable ? <Button variant="outline" onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-2 size-4" />导入报价单</Button> : null}
          {calculated.quotationFileId ? <Button variant="outline" onClick={() => id && void downloadQuotation(id).catch((err) => setError((err as Error).message))}><Download className="mr-2 size-4" />原报价单</Button> : null}
          <Button variant="outline" onClick={() => dirty ? toast.error('请先保存草稿再打印') : navigateAway(`/mr/${id}/print`)}><Printer className="mr-2 size-4" />打印预览</Button>
          {calculated.permissions?.canVoid ? <Button variant="outline" onClick={() => { setDecision('void'); setReason('') }}>作废</Button> : null}
          {editable ? <Button variant="outline" disabled={busy || !dirty} onClick={() => void save()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}保存草稿</Button> : null}
          {editable ? <Button disabled={busy} onClick={() => void submit()}><Send className="mr-2 size-4" />提交签核</Button> : null}
        </div>
      </div>

      {status === 'rejected' ? <div className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800"><div className="font-medium">签核已驳回</div><div className="mt-1">{calculated.rejectReason || '请修改后重新提交，签核会从助理开始。'}</div></div> : null}
      {errors.length ? <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div className="font-medium">规范检查未通过</div><ul className="mt-2 grid gap-1 sm:grid-cols-2">{errors.map((item, index) => <li key={`${item.field}-${index}`}>· {item.message || '字段不完整'}</li>)}</ul></div> : null}

      <Section title="基本资料">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="填单日期"><Input type="date" value={calculated.fillDate || ''} disabled={!editable} onChange={(e) => patch({ fillDate: e.target.value })} /></Field>
          <Field label="客户名称"><Select value={calculated.customerId ? String(calculated.customerId) : ''} disabled={!editable} onValueChange={chooseCustomer}><SelectTrigger><SelectValue placeholder="从客户档案选择" /></SelectTrigger><SelectContent>{customers.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.code ? `${item.code} · ` : ''}{item.name || item.id}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="客户联系人"><Select value={contactValue} disabled={!editable || !calculated.customerId} onValueChange={chooseContact}><SelectTrigger><SelectValue placeholder="选择联系人" /></SelectTrigger><SelectContent><SelectItem value="none">不关联联系人</SelectItem>{(contacts || []).filter((item) => item.id).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name || item.id}{item.phone ? ` · ${item.phone}` : ''}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="负责业务"><Select value={salesOwnerValue} disabled={!editable || user?.role === 'sales'} onValueChange={(value) => patch({ salesOwnerId: value === 'none' ? null : value })}><SelectTrigger><SelectValue placeholder="选择业务" /></SelectTrigger><SelectContent><SelectItem value="none">未指定</SelectItem>{salespeople.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.realName || item.username || item.id}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="客户 P/O"><Input value={calculated.customerPo || ''} disabled={!editable} onChange={(e) => patch({ customerPo: e.target.value })} /></Field>
          <Field label="Ctrl.NO"><Input value={calculated.ctrlNo || ''} disabled={!editable} onChange={(e) => patch({ ctrlNo: e.target.value })} /></Field>
          <Field label="最晚交货日"><Input type="date" value={calculated.latestDeliveryDate || ''} disabled={!editable} onChange={(e) => patch({ latestDeliveryDate: e.target.value })} /></Field>
          <Field label="合同号"><Input value={calculated.contractNo || ''} disabled={!editable} onChange={(e) => patch({ contractNo: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="计价与合约">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <Field label="计价模式" className="xl:col-span-2"><div className="flex min-h-9 flex-wrap border p-1">{constants.pricingModes.map((mode) => <Button key={mode.value} type="button" size="sm" variant={Number(calculated.pricingMode) === mode.value ? 'default' : 'ghost'} disabled={!editable} onClick={() => patch({ pricingMode: mode.value })}>{mode.label}</Button>)}</div></Field>
          <Field label="发票别"><Select value={calculated.invoiceType || ''} disabled={!editable} onValueChange={(value) => patch({ invoiceType: value, items: (calculated.items || []).map((item) => ({ ...item, taxRate: value.startsWith('6%') ? 6 : item.taxRate })) })}><SelectTrigger><SelectValue placeholder="选择发票别" /></SelectTrigger><SelectContent>{constants.INVOICE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="未税总计"><Input type="number" min={0} step="0.01" value={calculated.totalExcludingTax ?? ''} disabled={!editable || Number(calculated.pricingMode) === 3} onChange={(e) => patch({ totalExcludingTax: asNumber(e.target.value) })} /></Field>
          <Field label="是否签合约"><BinaryChoice value={calculated.hasContract} disabled={!editable} onChange={(value) => patch({ hasContract: value })} /></Field>
          {Number(calculated.hasContract) === 1 ? <Field label="合约类型"><Select value={calculated.contractType || ''} disabled={!editable} onValueChange={(value) => patch({ contractType: value })}><SelectTrigger><SelectValue placeholder="选择合约类型" /></SelectTrigger><SelectContent>{constants.CONTRACT_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field> : null}
          {Number(calculated.hasContract) === 1 ? <Field label="是否有罚则"><BinaryChoice value={calculated.hasPenalty} disabled={!editable} onChange={(value) => patch({ hasPenalty: value })} /></Field> : null}
          {Number(calculated.hasContract) === 1 && Number(calculated.hasPenalty) === 1 ? <Field label="罚则内容" className="xl:col-span-2"><Input value={calculated.penaltyContent || ''} disabled={!editable} onChange={(e) => patch({ penaltyContent: e.target.value })} /></Field> : null}
        </div>
      </Section>

      <Section title="开票、付款与联系人">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="发票处理"><Select value={calculated.invoiceProcess || ''} disabled={!editable} onValueChange={(value) => patch({ invoiceProcess: value })}><SelectTrigger><SelectValue placeholder="选择处理方式" /></SelectTrigger><SelectContent>{constants.INVOICE_PROCESSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="开票内容"><Input value={calculated.billingContent || ''} disabled={!editable} onChange={(e) => patch({ billingContent: e.target.value })} /></Field>
          <Field label="发票收件人"><Input value={calculated.invoiceRecipient || ''} disabled={!editable} onChange={(e) => patch({ invoiceRecipient: e.target.value })} /></Field>
          <Field label="开票/收款"><Input value={calculated.billingTiming || ''} disabled={!editable} onChange={(e) => patch({ billingTiming: e.target.value })} /></Field>
          <Field label="采购"><Input value={calculated.purchaser || ''} disabled={!editable} onChange={(e) => patch({ purchaser: e.target.value })} /></Field>
          <Field label="采购 TEL"><Input value={calculated.purchaserTel || ''} disabled={!editable} onChange={(e) => patch({ purchaserTel: e.target.value })} /></Field>
          <Field label="收件人"><Input value={calculated.recipient || ''} disabled={!editable} onChange={(e) => patch({ recipient: e.target.value })} /></Field>
          <Field label="收件人 TEL"><Input value={calculated.recipientTel || ''} disabled={!editable} onChange={(e) => patch({ recipientTel: e.target.value })} /></Field>
          <Field label="收件人 mail" className="xl:col-span-2"><Input type="email" value={calculated.recipientMail || ''} disabled={!editable} onChange={(e) => patch({ recipientMail: e.target.value })} /></Field>
          <Field label="付款条件"><Select value={calculated.paymentTerms || ''} disabled={!editable} onValueChange={(value) => patch({ paymentTerms: value })}><SelectTrigger><SelectValue placeholder="选择付款条件" /></SelectTrigger><SelectContent>{constants.PAYMENT_TERMS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
          {calculated.paymentTerms === '其他' ? <Field label="付款条件说明"><Input value={calculated.paymentOther || ''} disabled={!editable} onChange={(e) => patch({ paymentOther: e.target.value })} /></Field> : null}
        </div>
      </Section>

      <Section title="交付、验收与服务">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="分批送机"><BinaryChoice value={calculated.splitDelivery} disabled={!editable} yes="可" no="否" onChange={(value) => patch({ splitDelivery: value })} /></Field>
          <Field label="案分类"><Select value={calculated.caseCategory || ''} disabled={!editable} onValueChange={(value) => patch({ caseCategory: value })}><SelectTrigger><SelectValue placeholder="选择案分类" /></SelectTrigger><SelectContent>{constants.CASE_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="验收"><Select value={calculated.acceptance || ''} disabled={!editable} onValueChange={(value) => patch({ acceptance: value })}><SelectTrigger><SelectValue placeholder="选择验收条件" /></SelectTrigger><SelectContent>{constants.ACCEPTANCE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
          {calculated.acceptance === '其他' ? <Field label="验收说明"><Input value={calculated.acceptanceOther || ''} disabled={!editable} onChange={(e) => patch({ acceptanceOther: e.target.value })} /></Field> : null}
          <WorkOptions label="装机" value={calculated.installOptions || []} choices={constants.WORK_OPTIONS} disabled={!editable} onChange={(value) => patch({ installOptions: value })} />
          <WorkOptions label="维护" value={calculated.maintenanceOptions || []} choices={constants.WORK_OPTIONS} disabled={!editable} onChange={(value) => patch({ maintenanceOptions: value })} />
          <Field label="出货单号（不打印）"><Input value={calculated.shipmentNo || ''} disabled={!editable} onChange={(e) => patch({ shipmentNo: e.target.value })} /></Field>
          <Field label="交货期（不打印）"><Input value={calculated.deliveryTerms || ''} disabled={!editable} onChange={(e) => patch({ deliveryTerms: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title={`品项明细（${calculated.items?.length || 0}/20）`}>
        <MrItemTable order={calculated} editable={editable} onChange={(items: MrItem[]) => patch({ items })} />
      </Section>

      <Section title="金额汇总">
        <div className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-5">{[
          ['未税总计', calculated.totals?.salesExcludingTax],
          ['增值税', calculated.totals?.vat],
          ['含税合计', calculated.totals?.salesIncludingTax],
          ['COST 总计', calculated.totals?.costExcludingTax],
          ['毛利率', calculated.totals?.marginRate, true],
        ].map(([label, value, percent]) => <div key={String(label)} className="bg-background p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${percent && Number(value) < 15 ? 'text-red-600' : ''}`}>{percent ? `${Number(value || 0).toFixed(2)}%` : `¥ ${money(value as number)}`}</div></div>)}</div>
      </Section>

      <Section title="备注"><Textarea rows={4} value={calculated.remark || ''} disabled={!editable} onChange={(e) => patch({ remark: e.target.value })} /></Section>

      <Section title="电子签流转">
        <ApprovalPanel order={calculated} busy={busy} onApprove={() => void approve()} onReject={() => { setDecision('reject'); setReason('') }} />
        {status === 'approved' ? <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="size-4" />全部签核完成，可打印存档。</div> : null}
      </Section>

      {id ? <QuotationImportDialog orderId={id} open={importOpen} onOpenChange={setImportOpen} onApply={(items: MrItem[], sheet: ParsedQuotationSheet, file) => {
        patch({ items, quotationFileId: file.id, contactName: calculated.contactName || sheet.attn || '', paymentTerms: calculated.paymentTerms || paymentFromQuotation(sheet.payment) })
        toast.success(`已导入 ${items.length} 个品项，请核对后保存`)
      }} /> : null}

      <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open) setDecision(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decision === 'reject' ? '驳回 MR' : '作废 MR'}</DialogTitle><DialogDescription>{decision === 'reject' ? '驳回后业务或助理可修改，重新提交会从助理开始签核。' : '已通过的 MR 不会删除，作废原因会永久留存。'}</DialogDescription></DialogHeader>
          <Field label={decision === 'reject' ? '驳回原因' : '作废原因'}><Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>取消</Button><Button variant={decision === 'reject' ? 'default' : 'destructive'} disabled={busy || !reason.trim()} onClick={() => void confirmDecision()}>{decision === 'reject' ? '确认驳回' : '确认作废'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
