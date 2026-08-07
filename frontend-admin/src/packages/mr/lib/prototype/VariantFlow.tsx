import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, FileSpreadsheet, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApprovalPanel } from '../ApprovalPanel'
import { Field, money, textValue } from '../mr-ui'
import { DetailSections } from './DetailSections'
import { PrototypeImportDialog } from './PrototypeImportDialog'
import type { MrPrototype } from './useMrPrototype'
import type { MrItem } from '../../types'

const STEPS = [
  ['quote', '客户与报价'],
  ['trade', '交易与交付'],
  ['review', '检查与提交'],
] as const

function asNum(value: string) { return value === '' ? null : Number(value) }

/** Variant C — guided 3-step flow: import-first, optional fields collapsed, final text review. */
export function VariantFlow({ vm }: { vm: MrPrototype }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const order = vm.calculated!
  const mode = Number(order.pricingMode || 0)
  const items = order.items || []
  const totals = order.totals || {}
  const ready = Boolean(order.pricingMode && order.invoiceType)

  const setItem = (index: number, patch: Partial<MrItem>) => vm.setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const removeItem = (index: number) => vm.setItems(items.filter((_, i) => i !== index))

  const itemRow = (item: MrItem, index: number) => (
    <div key={item.id || `row-${index}`} className="grid items-center gap-2 border-b px-3 py-2 last:border-0 lg:grid-cols-[28px_minmax(160px,1fr)_64px_90px_90px_90px_40px]">
      <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="space-y-1">
        <Input value={item.name || ''} placeholder="品名" onChange={(e) => setItem(index, { name: e.target.value })} />
        <Input value={item.oemSpec || ''} placeholder="原厂规格" className="h-7 text-xs" onChange={(e) => setItem(index, { oemSpec: e.target.value })} />
      </div>
      <Input type="number" min={0} value={item.qty == null ? '' : String(item.qty)} onChange={(e) => setItem(index, { qty: asNum(e.target.value) })} />
      <Input type="number" min={0} step="0.01" value={item.unitPrice == null ? '' : String(item.unitPrice)} disabled={mode !== 3} placeholder="售价" onChange={(e) => setItem(index, { unitPrice: asNum(e.target.value) })} />
      <Input type="number" min={0} step="0.01" value={item.costInclTax == null ? '' : String(item.costInclTax)} placeholder="成本含税" onChange={(e) => setItem(index, { costInclTax: asNum(e.target.value) })} />
      <div className="text-right text-sm tabular-nums">¥ {money(item.subtotal)}</div>
      <Button variant="ghost" size="icon" title="删除" onClick={() => removeItem(index)}><Trash2 className="size-4 text-destructive" /></Button>
    </div>
  )

  return (
    <div className="min-h-full bg-muted/30">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigate('/mr')}><ArrowLeft className="size-4" /></Button>
            <div>
              <div className="truncate text-lg font-semibold">新建 MR</div>
              <div className="truncate text-xs text-muted-foreground">{order.customerName || `草稿 #${order.id}`}</div>
            </div>
          </div>
          <Button onClick={() => toast.info('原型中不实际提交，仅展示布局')}><Send className="mr-2 size-4" />提交签核</Button>
        </div>
        {/* 步骤指示 */}
        <div className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 pb-3 sm:px-6">
          {STEPS.map(([key, label], index) => {
            const done = index < step
            const active = index === step
            return (
              <div key={key} className="flex items-center gap-2">
                <button type="button" onClick={() => setStep(index)} className="flex items-center gap-2 rounded-full px-2 py-1 text-sm hover:bg-accent">
                  <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className={active ? 'font-medium text-primary' : done ? 'text-emerald-700' : 'text-muted-foreground'}>{label}</span>
                </button>
                {index < STEPS.length - 1 ? <span className="h-px w-6 bg-border sm:w-12" /> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6">
        {step === 0 ? (
          <div className="space-y-4">
            {/* 客户 */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-medium">1. 客户</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="客户名称">
                  <Select value={order.customerId ? String(order.customerId) : ''} onValueChange={(v) => void vm.chooseCustomer(v)}>
                    <SelectTrigger><SelectValue placeholder="从客户档案选择" /></SelectTrigger>
                    <SelectContent>{vm.customers.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.code ? `${item.code} · ` : ''}{item.name || item.id}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="客户联系人（选客户后自动带出）">
                  <Select value={order.customerContactId ? String(order.customerContactId) : ''} disabled={!order.customerId} onValueChange={(v) => vm.chooseContact(v)}>
                    <SelectTrigger><SelectValue placeholder="选择客户联系人" /></SelectTrigger>
                    <SelectContent>{vm.contacts.filter((c) => c.id && c.name).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </div>

            {/* 报价导入 */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium">2. 品项</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!ready}><FileSpreadsheet className="mr-2 size-4" />报价导入{order.quotationFiles?.length ? `（${order.quotationFiles.length}）` : ''}</Button>
                  <Button variant="outline" size="sm" onClick={() => vm.addItems(1)}><Plus className="mr-2 size-4" />手动添加</Button>
                </div>
              </div>
              {!ready ? (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">先在下一步选择计价模式和发票别，才能导入报价。</div>
              ) : null}
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">还没有品项 — 导入客户报价文件，或手动添加。</div>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid-cols-[28px_minmax(160px,1fr)_64px_90px_90px_90px_40px]">
                    <span>#</span><span>品名 / 原厂规格</span><span>数量</span><span>售价</span><span>成本含税</span><span>小计</span><span />
                  </div>
                  {items.map(itemRow)}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">未税总计</span><span className="font-semibold tabular-nums">¥ {money(totals.salesExcludingTax)}</span>
                <span className="text-muted-foreground">含税合计</span><span className="font-semibold tabular-nums">¥ {money(totals.salesIncludingTax)}</span>
                <span className="text-muted-foreground">COST</span><span className="font-semibold tabular-nums">¥ {money(totals.costExcludingTax)}</span>
              </div>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-medium">交易设置</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="计价模式" className="xl:col-span-2">
                  <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-background p-1">
                    {vm.constants!.pricingModes.map((m) => (
                      <Button key={m.value} type="button" size="sm" variant={mode === m.value ? 'default' : 'ghost'} onClick={() => vm.changePricingMode(m.value)}>{m.label}</Button>
                    ))}
                  </div>
                </Field>
                <Field label="发票别">
                  <Select value={order.invoiceType || ''} onValueChange={(v) => vm.changeInvoiceType(v)}>
                    <SelectTrigger><SelectValue placeholder="选择发票别" /></SelectTrigger>
                    <SelectContent>{vm.constants!.INVOICE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="未税总计">
                  <Input type="number" min={0} step="0.01" value={order.totalExcludingTax ?? ''} disabled={mode === 3} onChange={(e) => vm.patch({ totalExcludingTax: asNum(e.target.value) })} />
                </Field>
              </div>
            </div>
            <DetailSections vm={vm} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-medium">全部字段核对</h3>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ['客户', textValue(order.customerName)],
                  ['联系人', textValue(order.contactName)],
                  ['Ctrl.NO', textValue(order.ctrlNo)],
                  ['客户 P/O', textValue(order.customerPo)],
                  ['计价模式', mode ? ['多项系统集成', '单项系统集成', '开明细'][mode - 1] : '-'],
                  ['发票别', textValue(order.invoiceType)],
                  ['未税总计', `¥ ${money(order.totalExcludingTax)}`],
                  ['案分类', textValue(order.caseCategory)],
                  ['开票', textValue(order.billingContent)],
                  ['付款', textValue(order.paymentTerms)],
                  ['交货日', textValue(order.latestDeliveryDate)],
                  ['送机地点', textValue(order.deliveryLocation)],
                  ['装机对象', order.installOptions?.join('、') || '-'],
                  ['维护对象', order.maintenanceOptions?.join('、') || '-'],
                  ['备注', textValue(order.remark)],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 overflow-hidden rounded-lg border">
                <div className="grid bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[28px_minmax(140px,1fr)_50px_90px_90px]">
                  <span>#</span><span>品名 / 原厂规格</span><span>数量</span><span>售价</span><span>成本含税</span>
                </div>
                {items.map((item, index) => (
                  <div key={item.id || `row-${index}`} className="grid border-t px-3 py-2 text-sm sm:grid-cols-[28px_minmax(140px,1fr)_50px_90px_90px]">
                    <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="min-w-0 truncate">{item.name || item.oemSpec || '未命名品项'}</span>
                    <span className="tabular-nums">{item.qty ?? '-'}</span>
                    <span className="tabular-nums">¥ {money(item.unitPrice)}</span>
                    <span className="tabular-nums">¥ {item.costInclTax == null ? '-' : money(item.costInclTax)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-medium">电子签流转</h3>
              <ApprovalPanel order={order} layout="horizontal" />
            </div>
          </div>
        )}

        {/* 底部导航 */}
        <div className="sticky bottom-0 z-10 mt-5 flex items-center justify-between rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>上一步</Button>
          <span className="text-xs text-muted-foreground">未税 ¥ {money(totals.salesExcludingTax)} · 含税 ¥ {money(totals.salesIncludingTax)}</span>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => Math.min(2, s + 1))}>下一步</Button>
          ) : (
            <Button onClick={() => toast.info('原型中不实际提交，仅展示布局')}><Send className="mr-2 size-4" />提交签核</Button>
          )}
        </div>
      </div>

      <PrototypeImportDialog orderId={String(order.id!)} open={importOpen} onOpenChange={setImportOpen} onApply={vm.applyImport} />
    </div>
  )
}