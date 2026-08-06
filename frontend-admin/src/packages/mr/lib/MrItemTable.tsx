import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MrItem, MrOrder, VendorOption } from '../types'
import { blankItem, defaultCostTaxRate } from './form-logic'
import { Field, SubPanel, money, percent, textValue } from './mr-ui'

const LOW_MARGIN = 15

function numberValue(value?: number | null) {
  return value === null || value === undefined ? '' : String(value)
}

function tokens(value?: string | null) {
  return String(value || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
}

function isLowMargin(item: MrItem) {
  return item.marginRate !== null && item.marginRate !== undefined && Number(item.marginRate) < LOW_MARGIN
}

export function MrItemTable({
  order,
  editable,
  vendors,
  workOptions,
  focusIndex,
  onFocusHandled,
  onChange,
}: {
  order: MrOrder
  editable: boolean
  vendors: VendorOption[]
  workOptions: string[]
  focusIndex?: number | null
  onFocusHandled?: () => void
  onChange: (items: MrItem[]) => void
}) {
  const items = order.items || []
  const mode = Number(order.pricingMode || 0)
  const allowedTaxRates = String(order.invoiceType || '').startsWith('6%') ? [6] : [6, 13]
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [batchSourceIndex, setBatchSourceIndex] = useState(0)
  const [batchFields, setBatchFields] = useState({ vendor: true, purchaseOrderNo: true, warrantyService: true, installBy: true })
  useEffect(() => {
    setSelectedIndex((current) => current !== null && current < items.length ? current : null)
  }, [items.length])
  useEffect(() => {
    setSelectedRows((current) => new Set([...current].filter((index) => index < items.length)))
    setBatchSourceIndex((current) => Math.min(current, Math.max(items.length - 1, 0)))
  }, [items.length])


  useEffect(() => {
    if (focusIndex === null || focusIndex === undefined) return
    setSelectedIndex(focusIndex)
    onFocusHandled?.()
  }, [focusIndex, onFocusHandled])

  const setItem = (index: number, patch: Partial<MrItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const remove = (index: number) => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index))
    setSelectedIndex((current) => current === index ? null : current !== null && current > index ? current - 1 : current)
    setSelectedRows((current) => new Set([...current].filter((itemIndex) => itemIndex !== index).map((itemIndex) => itemIndex > index ? itemIndex - 1 : itemIndex)))
  }
  const applyBatch = () => {
    const source = items[batchSourceIndex]
    if (!source || !selectedRows.size) return
    const patch: Partial<MrItem> = {}
    if (batchFields.vendor) patch.vendor = source.vendor
    if (batchFields.purchaseOrderNo) patch.purchaseOrderNo = source.purchaseOrderNo
    if (batchFields.warrantyService) patch.warrantyService = source.warrantyService
    if (batchFields.installBy) patch.installBy = source.installBy
    onChange(items.map((item, index) => selectedRows.has(index) && index !== batchSourceIndex ? { ...item, ...patch } : item))
  }
  if (!items.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          尚未填写品项{editable ? '，可从报价文件导入或手动添加。' : '。'}
        </div>
        {editable && mode !== 2 ? <AddItemButton order={order} items={items} onChange={onChange} setSelectedIndex={setSelectedIndex} /> : null}
      </div>
    )
  }

  const selectedItem = selectedIndex === null ? null : items[selectedIndex]

  return (
    <div className="space-y-3">
      <datalist id="mr-vendor-options">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>

      {editable ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{editMode ? '编辑模式：可直接修改每个品项的常用字段；勾选多行可批量复制。' : '选择一行后在下方编辑；或打开编辑模式同时修改多项。'}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">已选 {selectedRows.size} 项</span>
              <Button type="button" variant={editMode ? 'secondary' : 'outline'} size="sm" onClick={() => { setEditMode((value) => !value); setSelectedIndex(null) }}><Pencil className="mr-2 size-4" />{editMode ? '完成编辑' : '编辑模式'}</Button>
            </div>
          </div>
          {editMode && selectedRows.size ? (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[180px_1fr] md:items-center">
              <label className="text-sm font-medium" htmlFor="mr-batch-source">复制来源</label>
              <Select value={String(batchSourceIndex)} onValueChange={(value) => setBatchSourceIndex(Number(value))}>
                <SelectTrigger id="mr-batch-source"><SelectValue /></SelectTrigger>
                <SelectContent>{items.map((item, index) => <SelectItem key={item.id || index} value={String(index)}>第 {index + 1} 项：{item.name || item.oemSpec || '未命名'}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex flex-wrap gap-x-4 gap-y-2 md:col-span-2">
                {([['vendor', '厂商'], ['purchaseOrderNo', '采购单号'], ['warrantyService', '保固/服务'], ['installBy', '明细装机']] as const).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 text-sm"><Checkbox checked={batchFields[field]} onCheckedChange={(checked) => setBatchFields((current) => ({ ...current, [field]: Boolean(checked) }))} />{label}</label>
                ))}
              </div>
              <Button type="button" size="sm" className="md:col-span-2 md:justify-self-end" onClick={applyBatch}>应用到已选品项</Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-16 px-3 py-2 text-left font-medium">选择 / #</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">品名/品名描述</th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium">数量</th>
                <th scope="col" className="w-32 px-3 py-2 text-right font-medium">销售单价</th>
                <th scope="col" className="w-36 px-3 py-2 text-right font-medium">售价小计</th>
                <th scope="col" className="w-24 px-3 py-2 text-right font-medium">毛利率</th>
                <th scope="col" className="w-24 px-3 py-2 text-right font-medium">编辑</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, index) => {
                const low = isLowMargin(item)
                const selected = selectedIndex === index
                return (
                  <>
                    <tr key={item.id || `row-${index}`} className={`align-top transition-colors ${selected ? 'bg-primary/5' : 'hover:bg-muted/20'} ${low ? 'border-l-2 border-l-red-500' : ''}`}>
                    <td className="px-3 py-3 text-muted-foreground tabular-nums">
                      <div className="flex items-center gap-2"><Checkbox checked={selectedRows.has(index)} onCheckedChange={(checked) => setSelectedRows((current) => { const next = new Set(current); if (checked) next.add(index); else next.delete(index); return next })} />{index + 1}</div>
                    </td>
                    <td className="min-w-0 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`编辑第 ${index + 1} 项`}
                        aria-pressed={selected}
                      >
                        <span className="block break-words font-medium">{item.description || item.name || '未填写品名/品名描述'}</span>
                        <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.oemSpec || '原厂规格未填'}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.qty ?? '-'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.unitPrice == null ? '-' : money(item.unitPrice)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">¥ {money(item.subtotal)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${low ? 'font-medium text-red-600' : ''}`}>{percent(item.marginRate)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {editable && mode !== 2 ? (
                          <Button type="button" variant="ghost" size="icon" title="删除品项" onClick={() => remove(index)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        ) : null}
                        <Button type="button" variant={selected ? 'secondary' : 'ghost'} size="icon" title="编辑品项" onClick={() => setSelectedIndex(index)}>
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editMode ? (
                    <tr className="bg-muted/10">
                      <td colSpan={7} className="px-3 pb-4">
                        <div className="grid gap-3 pt-1 md:grid-cols-2 xl:grid-cols-6">
                          <label className="xl:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">品名/品名描述</span><Textarea rows={2} value={item.description || item.name || ''} onChange={(event) => { const value = event.target.value; setItem(index, { name: value.split(/\r?\n/)[0] || value, description: value }) }} /></label>
                          <label className="xl:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">原厂规格</span><Input value={item.oemSpec || ''} onChange={(event) => setItem(index, { oemSpec: event.target.value })} /></label>
                          <label><span className="mb-1 block text-xs font-medium text-muted-foreground">数量</span><Input type="number" min={1} step={1} value={numberValue(item.qty)} onChange={(event) => setItem(index, { qty: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                          <label><span className="mb-1 block text-xs font-medium text-muted-foreground">厂商</span><Input list="mr-vendor-options" value={item.vendor || ''} onChange={(event) => setItem(index, { vendor: event.target.value })} /></label>
                          <label><span className="mb-1 block text-xs font-medium text-muted-foreground">采购单号</span><Input value={item.purchaseOrderNo || ''} onChange={(event) => setItem(index, { purchaseOrderNo: event.target.value })} /></label>
                          <label><span className="mb-1 block text-xs font-medium text-muted-foreground">保固/服务</span><Input value={item.warrantyService || ''} onChange={(event) => setItem(index, { warrantyService: event.target.value })} /></label>
                          <label className="xl:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">明细装机</span><Input value={item.installBy || ''} onChange={(event) => setItem(index, { installBy: event.target.value })} /></label>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedItem && selectedIndex !== null && !editMode ? (
        <ItemEditorPanel
          item={selectedItem}
          index={selectedIndex}
          editable={editable}
          mode={mode}
          vendors={vendors}
          workOptions={workOptions}
          allowedTaxRates={allowedTaxRates}
          onClose={() => setSelectedIndex(null)}
          onChange={(patch) => setItem(selectedIndex, patch)}
        />
      ) : editMode ? null : (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          选择品项后，完整编辑面板会显示在这里。
        </div>
      )}

      {editable && mode !== 2 ? <AddItemButton order={order} items={items} onChange={onChange} setSelectedIndex={setSelectedIndex} /> : null}
    </div>
  )
}

function ItemEditorPanel({
  item,
  index,
  editable,
  mode,
  vendors,
  workOptions,
  allowedTaxRates,
  onClose,
  onChange,
}: {
  item: MrItem
  index: number
  editable: boolean
  mode: number
  vendors: VendorOption[]
  workOptions: string[]
  allowedTaxRates: number[]
  onClose: () => void
  onChange: (patch: Partial<MrItem>) => void
}) {
  const serviceRow = mode === 2 && index === 1
  const installValues = tokens(item.installBy)
  const installExtra = installValues.filter((value) => !workOptions.includes(value)).join('、')
  const low = isLowMargin(item)
  const setInstallChoice = (choice: string, checked: boolean) => {
    const next = checked ? [...new Set([...installValues, choice])] : installValues.filter((value) => value !== choice)
    onChange({ installBy: next.join('、') })
  }
  const setInstallExtra = (value: string) => {
    const selected = installValues.filter((value) => workOptions.includes(value))
    const extra = tokens(value).filter((value) => !workOptions.includes(value))
    onChange({ installBy: [...selected, ...extra].join('、') })
  }

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/[0.025] p-4 shadow-sm sm:p-5" aria-label={`编辑第 ${index + 1} 项`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-primary">编辑品项 {index + 1}</div>
          <div className="mt-1 text-sm text-muted-foreground">完整内容在此编辑，关闭后品项表只保留摘要。</div>
        </div>
        <Button type="button" variant="ghost" size="icon" title="关闭编辑面板" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <SubPanel title="品项资料">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="品名/品名描述" editable={editable} readonlyText={textValue(item.description || item.name)} className="md:col-span-2 xl:col-span-4">
              <Textarea rows={5} value={item.description || item.name || ''} disabled={serviceRow} onChange={(event) => { const value = event.target.value; onChange({ name: value.split(/\r?\n/)[0] || value, description: value }) }} />
            </Field>
            <Field label="原厂规格" editable={editable} readonlyText={textValue(item.oemSpec)} className="md:col-span-2">
              <Textarea rows={2} value={item.oemSpec || ''} onChange={(event) => onChange({ oemSpec: event.target.value })} />
            </Field>
            <Field label="公司料号" editable={editable} readonlyText={textValue(item.companyPartNo)}>
              <Input value={item.companyPartNo || ''} onChange={(event) => onChange({ companyPartNo: event.target.value })} />
            </Field>
            <Field label="保固 / 服务" editable={editable} readonlyText={textValue(item.warrantyService)}>
              <Input value={item.warrantyService || ''} onChange={(event) => onChange({ warrantyService: event.target.value })} />
            </Field>
          </div>
        </SubPanel>

        <div className="grid gap-4 lg:grid-cols-2">
          <SubPanel title="销售">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="数量" editable={editable} readonlyText={textValue(item.qty)}>
                <Input type="number" min={1} step={1} value={numberValue(item.qty)} onChange={(event) => onChange({ qty: event.target.value === '' ? null : Number(event.target.value) })} />
              </Field>
              <Field label="销售单价" editable={editable} readonlyText={item.unitPrice == null ? '-' : money(item.unitPrice)}>
                <Input type="number" min={0} step="0.01" value={numberValue(item.unitPrice)} disabled={mode !== 3} onChange={(event) => onChange({ unitPrice: event.target.value === '' ? null : Number(event.target.value) })} />
              </Field>
              <Field label="售价小计" editable={false} readonlyText={`¥ ${money(item.subtotal)}`} />
              <Field label="毛利率" editable={false} readonlyText={<span className={low ? 'text-red-600' : ''}>{percent(item.marginRate)}</span>} />
            </div>
            {editable && mode !== 3 ? <p className="text-xs text-muted-foreground">系统集成模式的单价由未税总计按成本分摊自动计算。</p> : null}
          </SubPanel>

          <SubPanel title="采购">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field required={!serviceRow} label="厂商" editable={editable} readonlyText={textValue(item.vendor)}>
                <Input list="mr-vendor-options" value={item.vendor || ''} placeholder="从维保方目录选择或输入完整名称" disabled={serviceRow} onChange={(event) => onChange({ vendor: event.target.value })} />
                {item.vendor && vendors.some((vendor) => vendor.name === item.vendor) ? <span className="mt-1 block text-xs text-emerald-700">已关联 OMS 维保方目录</span> : null}
              </Field>
              <Field label="采购单号" editable={editable} readonlyText={textValue(item.purchaseOrderNo)}>
                <Input value={item.purchaseOrderNo || ''} onChange={(event) => onChange({ purchaseOrderNo: event.target.value })} />
              </Field>
              <Field required={!serviceRow} label="成本含税（整行）" editable={editable} readonlyText={item.costInclTax == null ? '-' : `¥ ${money(item.costInclTax)}`}>
                <Input type="number" min={0} step="0.01" value={numberValue(item.costInclTax)} disabled={serviceRow} onChange={(event) => onChange({ costInclTax: event.target.value === '' ? null : Number(event.target.value) })} />
              </Field>
              <Field required={!serviceRow} label="成本税率" editable={editable} readonlyText={item.taxRate ? `${item.taxRate}%` : '-'}>
                <Select value={String(item.taxRate || '')} disabled={serviceRow} onValueChange={(value) => onChange({ taxRate: Number(value) })}>
                  <SelectTrigger><SelectValue placeholder="税率" /></SelectTrigger>
                  <SelectContent>{allowedTaxRates.map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="未税成本" editable={false} readonlyText={item.costExcludingTax == null ? '-' : `¥ ${money(item.costExcludingTax)}`} />
              {item.costSource ? <Field label="成本来源" editable={false} readonlyText={item.costSource} /> : null}
            </div>
          </SubPanel>
        </div>

        <SubPanel title="明细装机">
          {editable ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {workOptions.filter((choice) => choice !== 'NO').map((choice) => (
                  <label key={choice} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={installValues.includes(choice)} onCheckedChange={(checked) => setInstallChoice(choice, Boolean(checked))} />
                    {choice}
                  </label>
                ))}
              </div>
              <Input value={installExtra} placeholder="额外装机对象，可用顿号分隔" onChange={(event) => setInstallExtra(event.target.value)} />
            </div>
          ) : <div className="text-sm">{installValues.join('、') || '-'}</div>}
        </SubPanel>
      </div>
    </section>
  )
}

function AddItemButton({
  order,
  items,
  onChange,
  setSelectedIndex,
}: {
  order: MrOrder
  items: MrItem[]
  onChange: (items: MrItem[]) => void
  setSelectedIndex: Dispatch<SetStateAction<number | null>>
}) {
  if (items.length >= 200) return null
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => {
      onChange([...items, { ...blankItem(defaultCostTaxRate(order.invoiceType)), installBy: (order.installOptions || []).filter((value) => value !== 'NO').join('、') }])
      setSelectedIndex(items.length)
    }}>
      <Plus className="mr-2 size-4" />添加品项
    </Button>
  )
}
