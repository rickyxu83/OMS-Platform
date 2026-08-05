import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MrItem, MrOrder, VendorOption } from '../types'
import { blankItem } from './form-logic'

function numberValue(value?: number | null) {
  return value === null || value === undefined ? '' : String(value)
}

function money(value?: number | null) {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function tokens(value?: string | null) {
  return String(value || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>
}

export function MrItemTable({
  order,
  editable,
  vendors,
  workOptions,
  onChange,
}: {
  order: MrOrder
  editable: boolean
  vendors: VendorOption[]
  workOptions: string[]
  onChange: (items: MrItem[]) => void
}) {
  const items = order.items || []
  const mode = Number(order.pricingMode || 0)
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]))

  useEffect(() => {
    setExpanded((current) => new Set([...current].filter((index) => index < items.length)))
  }, [items.length])

  const setItem = (index: number, patch: Partial<MrItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const remove = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index))
  const toggleExpanded = (index: number) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return next
  })
  const setInstallChoice = (index: number, choice: string, checked: boolean) => {
    const current = tokens(items[index].installBy)
    const next = checked ? [...new Set([...current, choice])] : current.filter((item) => item !== choice)
    setItem(index, { installBy: next.join('、') })
  }
  const setInstallExtra = (index: number, value: string) => {
    const selected = tokens(items[index].installBy).filter((item) => workOptions.includes(item))
    const extra = tokens(value).filter((item) => !workOptions.includes(item))
    setItem(index, { installBy: [...selected, ...extra].join('、') })
  }

  return (
    <div className="space-y-3">
      <datalist id="mr-vendor-options">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">品名、规格和描述始终完整显示；点击右侧箭头编辑其他字段。</div>
        {items.length ? <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(expanded.size === items.length ? new Set() : new Set(items.map((_, index) => index)))}>{expanded.size === items.length ? '全部收起' : '全部展开'}</Button> : null}
      </div>

      {!items.length ? <div className="border border-dashed py-12 text-center text-sm text-muted-foreground">尚未填写品项</div> : null}
      {items.map((item, index) => {
        const serviceRow = mode === 2 && index === 1
        const isExpanded = expanded.has(index)
        const installValues = tokens(item.installBy)
        const installExtra = installValues.filter((value) => !workOptions.includes(value)).join('、')
        return (
          <article key={item.id || index} className="border">
            <div className="grid gap-3 px-4 py-3 lg:grid-cols-[40px_minmax(0,1fr)_100px_130px_110px_84px] lg:items-start">
              <div className="text-sm font-medium text-muted-foreground">#{index + 1}</div>
              <div className="min-w-0">
                <div className="break-words font-medium">{item.name || '未填写品名'}</div>
                <div className="mt-1 break-words text-sm text-muted-foreground">原厂规格：{item.oemSpec || '-'}</div>
                {item.description ? <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.description}</div> : null}
              </div>
              <div><div className="text-xs text-muted-foreground">数量</div><div className="mt-1 tabular-nums">{item.qty ?? '-'}</div></div>
              <div><div className="text-xs text-muted-foreground">售价小计</div><div className="mt-1 tabular-nums">¥ {money(item.subtotal)}</div></div>
              <div><div className="text-xs text-muted-foreground">毛利率</div><div className={`mt-1 tabular-nums ${Number(item.marginRate) < 15 ? 'text-red-600' : ''}`}>{item.marginRate == null ? '-' : `${Number(item.marginRate).toFixed(2)}%`}</div></div>
              <div className="flex justify-end gap-1">
                {editable && mode !== 2 ? <Button type="button" variant="ghost" size="icon" title="删除品项" onClick={() => remove(index)}><Trash2 className="size-4 text-destructive" /></Button> : null}
                <Button type="button" variant="ghost" size="icon" title={isExpanded ? '收起编辑' : '展开编辑'} onClick={() => toggleExpanded(index)}>{isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</Button>
              </div>
            </div>

            {isExpanded ? (
              <div className="space-y-5 border-t bg-muted/20 px-4 py-4">
                <div>
                  <h3 className="mb-3 text-sm font-medium">品项标识</h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="品名" className="md:col-span-2"><Textarea rows={2} value={item.name || ''} onChange={(event) => setItem(index, { name: event.target.value })} disabled={!editable || serviceRow} /></Field>
                    <Field label="原厂规格" className="md:col-span-2"><Textarea rows={2} value={item.oemSpec || ''} onChange={(event) => setItem(index, { oemSpec: event.target.value })} disabled={!editable} /></Field>
                    <Field label="品名描述" className="md:col-span-2 xl:col-span-4"><Textarea rows={4} value={item.description || ''} onChange={(event) => setItem(index, { description: event.target.value })} disabled={!editable} /></Field>
                    <Field label="公司料号"><Input value={item.companyPartNo || ''} onChange={(event) => setItem(index, { companyPartNo: event.target.value })} disabled={!editable} /></Field>
                    <Field label="保固 / 服务"><Input value={item.warrantyService || ''} onChange={(event) => setItem(index, { warrantyService: event.target.value })} disabled={!editable} /></Field>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <section>
                    <h3 className="mb-3 text-sm font-medium">销售</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="数量"><Input type="number" min={1} step={1} value={numberValue(item.qty)} onChange={(event) => setItem(index, { qty: event.target.value === '' ? null : Number(event.target.value) })} disabled={!editable} /></Field>
                      <Field label="销售单价"><Input type="number" min={0} step="0.01" value={numberValue(item.unitPrice)} onChange={(event) => setItem(index, { unitPrice: event.target.value === '' ? null : Number(event.target.value) })} disabled={!editable || mode !== 3} /></Field>
                      <Field label="售价小计"><Input value={money(item.subtotal)} disabled /></Field>
                      <Field label="毛利率"><Input value={item.marginRate == null ? '-' : `${Number(item.marginRate).toFixed(2)}%`} disabled /></Field>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-medium">采购</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="厂商"><Input list="mr-vendor-options" value={item.vendor || ''} placeholder="从厂商库选择或输入" onChange={(event) => setItem(index, { vendor: event.target.value })} disabled={!editable || serviceRow} /></Field>
                      <Field label="采购单号"><Input value={item.purchaseOrderNo || ''} onChange={(event) => setItem(index, { purchaseOrderNo: event.target.value })} disabled={!editable} /></Field>
                      <Field label="成本含税（整行）"><Input type="number" min={0} step="0.01" value={numberValue(item.costInclTax)} onChange={(event) => setItem(index, { costInclTax: event.target.value === '' ? null : Number(event.target.value) })} disabled={!editable || serviceRow} /></Field>
                      <Field label="成本税率"><Select value={String(item.taxRate || '')} onValueChange={(value) => setItem(index, { taxRate: Number(value) })} disabled={!editable || serviceRow}><SelectTrigger><SelectValue placeholder="税率" /></SelectTrigger><SelectContent><SelectItem value="6">6%</SelectItem><SelectItem value="13">13%</SelectItem></SelectContent></Select></Field>
                      <Field label="未税成本"><Input value={money(item.costExcludingTax)} disabled /></Field>
                      {item.costSource ? <Field label="成本来源"><Input value={item.costSource} disabled /></Field> : null}
                    </div>
                  </section>
                </div>

                <section>
                  <h3 className="mb-3 text-sm font-medium">明细装机</h3>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {workOptions.filter((choice) => choice !== 'NO').map((choice) => <label key={choice} className="flex items-center gap-2 text-sm"><Checkbox checked={installValues.includes(choice)} disabled={!editable} onCheckedChange={(checked) => setInstallChoice(index, choice, Boolean(checked))} />{choice}</label>)}
                  </div>
                  <div className="mt-3 max-w-xl"><Input value={installExtra} placeholder="额外装机对象，可用顿号分隔" disabled={!editable} onChange={(event) => setInstallExtra(index, event.target.value)} /></div>
                </section>
              </div>
            ) : null}
          </article>
        )
      })}

      {editable && mode !== 2 && items.length < 200 ? <Button type="button" variant="outline" size="sm" onClick={() => { onChange([...items, { ...blankItem(), installBy: (order.installOptions || []).filter((value) => value !== 'NO').join('、') }]); setExpanded((current) => new Set([...current, items.length])) }}><Plus className="mr-2 size-4" />添加品项</Button> : null}
    </div>
  )
}
