import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, FileSpreadsheet, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DetailSections } from './DetailSections'
import { PrototypeImportDialog } from './PrototypeImportDialog'
import type { MrPrototype } from './useMrPrototype'
import type { MrItem } from '../../types'
import { money } from '../mr-ui'

const BATCH_FIELDS = [
  ['vendor', '厂商'],
  ['purchaseOrderNo', '采购单号'],
  ['warrantyService', '保固'],
  ['installBy', '装机对象'],
] as const


/** Variant B — dense spreadsheet: basic info strip + inline-editable grid + batch tools. */
export function VariantGrid({ vm }: { vm: MrPrototype }) {
  const navigate = useNavigate()
  const [importOpen, setImportOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sourceIndex, setSourceIndex] = useState(0)
  const [batchFields, setBatchFields] = useState({ vendor: true, purchaseOrderNo: true, warrantyService: true, installBy: true })
  const order = vm.calculated!
  const mode = Number(order.pricingMode || 0)
  const items = order.items || []
  const allowedTaxRates = String(order.invoiceType || '').startsWith('6%') ? [6] : [6, 13]
  const totals = order.totals || {}

  const setItem = (index: number, patch: Partial<MrItem>) => vm.setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const toggle = (index: number) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index); else next.add(index)
    return next
  })
  const selectAll = () => setSelected(new Set(items.length ? Array.from({ length: items.length }, (_, i) => i) : []))
  const clearAll = () => setSelected(new Set())

  const copyFromSource = () => {
    const source = items[sourceIndex]
    if (!source || !selected.size) return
    const patch: Partial<MrItem> = {}
    if (batchFields.vendor) patch.vendor = source.vendor
    if (batchFields.purchaseOrderNo) patch.purchaseOrderNo = source.purchaseOrderNo
    if (batchFields.warrantyService) patch.warrantyService = source.warrantyService
    if (batchFields.installBy) patch.installBy = source.installBy
    vm.setItems(items.map((item, index) => (selected.has(index) && index !== sourceIndex ? { ...item, ...patch } : item)))
    toast.success(`已应用到 ${selected.size} 项`)
  }

  const removeSelected = () => {
    if (!selected.size) return
    vm.setItems(items.filter((_, index) => !selected.has(index)))
    setSelected(new Set())
  }

  return (
    <div className="min-h-full bg-muted/30">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigate('/mr')}><ArrowLeft className="size-4" /></Button>
            <div>
              <div className="truncate text-lg font-semibold">品项表格</div>
              <div className="truncate text-xs text-muted-foreground">{order.customerName || `草稿 #${order.id}`}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-2 size-4" />报价导入</Button>
            <Button onClick={() => toast.info('原型中不实际提交，仅展示布局')}><Send className="mr-2 size-4" />提交签核</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
        {/* 基本信息条 */}
        <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <div className="mb-1 text-xs text-muted-foreground">客户</div>
            <Select value={order.customerId ? String(order.customerId) : ''} onValueChange={(v) => void vm.chooseCustomer(v)}>
              <SelectTrigger><SelectValue placeholder="从客户档案选择" /></SelectTrigger>
              <SelectContent>{vm.customers.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.code ? `${item.code} · ` : ''}{item.name || item.id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <FieldIn value={order.ctrlNo || ''} label="Ctrl.NO" onChange={(v) => vm.patch({ ctrlNo: v })} />
          <FieldIn value={order.customerPo || ''} label="客户 P/O" onChange={(v) => vm.patch({ customerPo: v })} />
          <div>
            <div className="mb-1 text-xs text-muted-foreground">计价模式</div>
            <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-background p-1">
              {vm.constants!.pricingModes.map((m) => (
                <Button key={m.value} type="button" size="sm" variant={Number(order.pricingMode) === m.value ? 'default' : 'ghost'} onClick={() => vm.changePricingMode(m.value)}>{m.label}</Button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">发票别</div>
            <Select value={order.invoiceType || ''} onValueChange={(v) => vm.changeInvoiceType(v)}>
              <SelectTrigger><SelectValue placeholder="发票别" /></SelectTrigger>
              <SelectContent>{vm.constants!.INVOICE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">未税总计</div>
            <Input type="number" min={0} step="0.01" value={order.totalExcludingTax ?? ''} disabled={mode === 3} onChange={(e) => vm.patch({ totalExcludingTax: asNum(e.target.value) })} />
          </div>
        </div>

        {/* 批处理工具条 */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
          <Button variant="ghost" size="sm" onClick={selected.size === items.length ? clearAll : selectAll}>{selected.size === items.length && items.length > 0 ? '取消全选' : '全选'}</Button>
          <span className="text-xs text-muted-foreground">已选 {selected.size} 项</span>
          <div className="h-4 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={() => vm.addItems(1)}><Plus className="mr-1 size-3.5" />添加 1 行</Button>
          <Button variant="outline" size="sm" onClick={() => vm.addItems(5)}><Plus className="mr-1 size-3.5" />添加 5 行</Button>
          {selected.size ? <Button variant="outline" size="sm" className="text-destructive" onClick={removeSelected}><Trash2 className="mr-1 size-3.5" />删除选中</Button> : null}
          <div className="h-4 w-px bg-border" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>来源行</span>
            <Select value={String(sourceIndex)} onValueChange={(v) => setSourceIndex(Number(v))}>
              <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>{items.map((_, i) => <SelectItem key={i} value={String(i)}>{i + 1}</SelectItem>)}</SelectContent>
            </Select>
            {BATCH_FIELDS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-1">
                <Checkbox checked={batchFields[key as keyof typeof batchFields]} onCheckedChange={(c) => setBatchFields((f) => ({ ...f, [key]: Boolean(c) }))} />
                {label}
              </label>
            ))}
            <Button variant="outline" size="sm" onClick={copyFromSource}><Copy className="mr-1 size-3.5" />应用到选中</Button>
          </div>
        </div>

        {/* 表格 */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-12 px-2 py-2 text-left font-medium">#</th>
                  <th className="w-[180px] px-2 py-2 text-left font-medium">品名 / 原厂规格</th>
                  <th className="w-16 px-2 py-2 text-right font-medium">数量</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">售价</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">成本含税</th>
                  <th className="w-20 px-2 py-2 text-center font-medium">税率</th>
                  <th className="w-40 px-2 py-2 text-left font-medium">厂商</th>
                  <th className="w-40 px-2 py-2 text-left font-medium">采购单号</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">小计</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">毛利</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.length === 0 ? (
                  <tr><td colSpan={11} className="px-3 py-12 text-center text-sm text-muted-foreground">暂无品项，可「报价导入」或「添加行」</td></tr>
                ) : items.map((item, index) => {
                  const low = item.marginRate != null && Number(item.marginRate) < 15
                  const isSelected = selected.has(index)
                  return (
                    <tr key={item.id || `row-${index}`} className={`align-top ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'} ${low ? 'border-l-2 border-l-red-500' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 text-muted-foreground tabular-nums"><Checkbox checked={isSelected} onCheckedChange={() => toggle(index)} />{index + 1}</div>
                      </td>
                      <td className="px-2 py-2 space-y-1.5">
                        <Input value={item.name || ''} placeholder="品名" onChange={(e) => setItem(index, { name: e.target.value })} />
                        <Input value={item.oemSpec || ''} placeholder="原厂规格" className="h-7 text-xs" onChange={(e) => setItem(index, { oemSpec: e.target.value })} />
                      </td>
                      <td className="px-2 py-2"><Input type="number" min={0} step={1} value={num(item.qty)} onChange={(e) => setItem(index, { qty: asNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><Input type="number" min={0} step="0.01" value={num(item.unitPrice)} disabled={mode !== 3} onChange={(e) => setItem(index, { unitPrice: asNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><Input type="number" min={0} step="0.01" value={num(item.costInclTax)} onChange={(e) => setItem(index, { costInclTax: asNum(e.target.value) })} /></td>
                      <td className="px-2 py-2">
                        <Select value={String(item.taxRate || '')} onValueChange={(v) => setItem(index, { taxRate: Number(v) })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{allowedTaxRates.map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2"><Input list="grid-vendors" value={item.vendor || ''} placeholder="厂商" onChange={(e) => setItem(index, { vendor: e.target.value })} /></td>
                      <td className="px-2 py-2"><Input value={item.purchaseOrderNo || ''} placeholder="采购单号" onChange={(e) => setItem(index, { purchaseOrderNo: e.target.value })} /></td>
                      <td className="px-2 py-2 text-right tabular-nums">¥ {money(item.subtotal)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${low ? 'font-medium text-red-600' : ''}`}>{item.marginRate == null ? '-' : `${Number(item.marginRate).toFixed(1)}%`}</td>
                      <td className="px-2 py-2"><Button variant="ghost" size="icon" title="删除" onClick={() => { setItem(index, {}); vm.setItems(items.filter((_, i) => i !== index)); setSelected(new Set([...selected].filter((s) => s !== index).map((s) => (s > index ? s - 1 : s)))) }}><Trash2 className="size-4 text-destructive" /></Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* 合计 */}
          <div className="grid gap-x-6 gap-y-1 border-t bg-muted/20 px-4 py-3 sm:grid-cols-5">
            {[
              ['未税总计', `¥ ${money(totals.salesExcludingTax)}`, false],
              ['增值税', `¥ ${money(totals.vat)}`, false],
              ['含税合计', `¥ ${money(totals.salesIncludingTax)}`, false],
              ['COST 总计', `¥ ${money(totals.costExcludingTax)}`, false],
              ['毛利率', `${Number(totals.marginRate ?? 0).toFixed(2)}%`, Number(totals.marginRate) < 15],
            ].map(([label, value, warn]) => (
              <div key={String(label)} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-semibold tabular-nums ${warn ? 'text-red-600' : ''}`}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
        <datalist id="grid-vendors">{vm.vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>

        {/* 其他信息折叠 */}
        <DetailSections vm={vm} />

        {/* 签核链 */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-medium">电子签流转</h3>
          <ApprovalPanelShort order={order} />
        </div>
      </div>

      <PrototypeImportDialog orderId={String(order.id!)} open={importOpen} onOpenChange={setImportOpen} onApply={vm.applyImport} />
    </div>
  )
}

function FieldIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function num(value?: number | null) { return value == null ? '' : String(value) }
function asNum(value: string) { return value === '' ? null : Number(value) }

function ApprovalPanelShort({ order }: { order: import('../../types').MrOrder }) {
  // 轻量签核链展示：仅示意，不展开历史
  const steps = (order.approvals || []).map((a) => a.stepLabel)
  return steps.length ? (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((label, i) => (
        <span key={`${label}-${i}`} className="flex items-center gap-2">
          <span className="rounded-md border bg-muted/50 px-2 py-1">{label}</span>
          {i < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
        </span>
      ))}
    </div>
  ) : (
    <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">提交后按装机对象与金额自动生成签核链</div>
  )
}