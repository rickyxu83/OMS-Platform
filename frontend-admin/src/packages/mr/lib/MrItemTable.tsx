import { Fragment, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
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
    setEditMode(true)
    setSelectedIndex(focusIndex)
    onFocusHandled?.()
  }, [focusIndex, onFocusHandled])

  const enterEditMode = () => {
    setEditMode(true)
    setSelectedIndex((current) => current ?? (items.length ? 0 : null))
  }
  const leaveEditMode = () => {
    setEditMode(false)
    setSelectedIndex(null)
    setSelectedRows(new Set())
  }

  const setItem = (index: number, patch: Partial<MrItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, ...(mode === 3 && patch.unitPrice !== undefined ? { quotedUnitPrice: null } : {}) } : item))
  const remove = (index: number) => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index))
    setSelectedIndex((current) => current === index ? null : current !== null && current > index ? current - 1 : current)
    setSelectedRows((current) => new Set([...current].filter((itemIndex) => itemIndex !== index).map((itemIndex) => itemIndex > index ? itemIndex - 1 : itemIndex)))
  }
  const applyBatch = () => {
    const source = items[batchSourceIndex]
    if (!source || !selectedRows.size) return
    const fieldCount = Object.values(batchFields).filter(Boolean).length
    const affectedCount = [...selectedRows].filter((index) => index !== batchSourceIndex).length
    if (!fieldCount) return toast.info('请至少选择一个复制字段')
    if (!affectedCount) return toast.info('请选择复制来源以外的品项')
    const patch: Partial<MrItem> = {}
    if (batchFields.vendor) patch.vendor = source.vendor
    if (batchFields.purchaseOrderNo) patch.purchaseOrderNo = source.purchaseOrderNo
    if (batchFields.warrantyService) patch.warrantyService = source.warrantyService
    if (batchFields.installBy) patch.installBy = source.installBy
    onChange(items.map((item, index) => selectedRows.has(index) && index !== batchSourceIndex ? { ...item, ...patch } : item))
    toast.success(`已将 ${fieldCount} 个字段应用到 ${affectedCount} 项品项`)
  }
  if (!items.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          尚未填写品项{editable ? '，可从报价文件导入或手动添加。' : '。'}
        </div>
        {editable && mode !== 2 ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant={editMode ? 'secondary' : 'outline'} size="sm" onClick={editMode ? leaveEditMode : enterEditMode}>
              {editMode ? <Check className="mr-2 size-4" /> : <Pencil className="mr-2 size-4" />}
              {editMode ? '完成编辑' : '编辑模式'}
            </Button>
            {editMode ? <AddItemButton order={order} items={items} onChange={onChange} setSelectedIndex={setSelectedIndex} /> : null}
          </div>
        ) : null}
      </div>
    )
  }

  const rowSelectionEnabled = !editable || editMode

  return (
    <div className="space-y-3">
      <datalist id="mr-vendor-options">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{editMode ? '点击品项编辑完整资料；勾选框只用于批量复制。' : '当前为浏览模式，进入编辑模式后可修改品项。'}</p>
          <div className="flex items-center gap-2">
            {editMode ? <span className="text-xs text-muted-foreground">已勾选 {selectedRows.size} 项</span> : null}
            <Button type="button" variant={editMode ? 'secondary' : 'outline'} size="sm" onClick={editMode ? leaveEditMode : enterEditMode}>
              {editMode ? <Check className="mr-2 size-4" /> : <Pencil className="mr-2 size-4" />}
              {editMode ? '完成编辑' : '编辑模式'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={editable && editMode ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]' : ''}>
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-16 px-3 py-2 text-left font-medium">{editable && editMode ? '选择 / #' : '#'}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">品名/品名描述</th>
                  <th scope="col" className="w-20 px-3 py-2 text-right font-medium">数量</th>
                  <th scope="col" className="w-32 px-3 py-2 text-right font-medium">销售单价</th>
                  <th scope="col" className="w-36 px-3 py-2 text-right font-medium">售价小计</th>
                  <th scope="col" className="w-24 px-3 py-2 text-right font-medium">毛利率</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, index) => {
                  const low = isLowMargin(item)
                  const selected = selectedIndex === index
                  return (
                    <Fragment key={item.id || `row-${index}`}>
                      <tr
                      onClick={rowSelectionEnabled ? () => setSelectedIndex(index) : undefined}
                      className={`align-top transition-colors ${selected ? 'bg-primary/5' : 'hover:bg-muted/20'} ${low ? 'border-l-2 border-l-red-500' : ''} ${rowSelectionEnabled ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">
                        {editable && editMode ? (
                          <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              aria-label={`选择第 ${index + 1} 项用于批量操作`}
                              checked={selectedRows.has(index)}
                              onCheckedChange={(checked) => setSelectedRows((current) => {
                                const next = new Set(current)
                                if (checked) next.add(index)
                                else next.delete(index)
                                return next
                              })}
                            />
                            {index + 1}
                          </div>
                        ) : index + 1}
                      </td>
                      <td className="min-w-0 px-3 py-3">
                        <button
                          type="button"
                          disabled={!rowSelectionEnabled}
                          onClick={(event) => { event.stopPropagation(); setSelectedIndex(index) }}
                          className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                          aria-label={`${editable ? '编辑' : '查看'}第 ${index + 1} 项`}
                          aria-pressed={rowSelectionEnabled ? selected : undefined}
                        >
                          <span className="block break-words font-medium">{item.description || item.name || '未填写品名/品名描述'}</span>
                          <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.oemSpec || '原厂规格未填'}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.qty ?? '-'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.unitPrice == null ? '-' : money(item.unitPrice)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">¥ {money(item.subtotal)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${low ? 'font-medium text-red-600' : ''}`}>{percent(item.marginRate)}</td>
                      </tr>
                      {selected && rowSelectionEnabled ? (
                        <tr className="bg-background">
                          <td colSpan={6} className="p-3 sm:p-4">
                            <ItemEditorPanel
                              item={item}
                              index={index}
                              editable={editable}
                              mode={mode}
                              vendors={vendors}
                              workOptions={workOptions}
                              allowedTaxRates={allowedTaxRates}
                              onClose={() => setSelectedIndex(null)}
                              onRemove={editable && mode !== 2 ? () => remove(index) : undefined}
                              onChange={(patch) => setItem(index, patch)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {editable && editMode ? (
          <aside className="h-fit rounded-lg border bg-card p-4 xl:sticky xl:top-36">
            <div className="mb-4 flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /><h3 className="font-semibold">批量操作台</h3></div>
            <p className="mb-3 text-sm text-muted-foreground">已选 {selectedRows.size} 项。选择一项作为模板，再选择要复制的字段。</p>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="mr-batch-source">复制来源</label>
            <Select value={String(batchSourceIndex)} onValueChange={(value) => setBatchSourceIndex(Number(value))}>
              <SelectTrigger id="mr-batch-source"><SelectValue /></SelectTrigger>
              <SelectContent>{items.map((item, index) => <SelectItem key={item.id || index} value={String(index)}>第 {index + 1} 项：{item.name || item.oemSpec || '未命名'}</SelectItem>)}</SelectContent>
            </Select>
            <div className="my-4 space-y-3 border-y py-4">
              <p className="text-xs text-muted-foreground">只复制重复资料，不覆盖数量、售价和采购成本。</p>
              {([['vendor', '厂商'], ['purchaseOrderNo', '采购单号'], ['warrantyService', '保固/服务'], ['installBy', '明细装机']] as const).map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 text-sm"><Checkbox checked={batchFields[field]} onCheckedChange={(checked) => setBatchFields((current) => ({ ...current, [field]: Boolean(checked) }))} />{label}</label>
              ))}
            </div>
            <Button type="button" className="w-full" disabled={!selectedRows.size} onClick={applyBatch}><Check className="mr-2 size-4" />应用到已选品项</Button>
          </aside>
        ) : null}
      </div>

      {editable && editMode && mode !== 2 ? <AddItemButton order={order} items={items} onChange={onChange} setSelectedIndex={setSelectedIndex} /> : null}
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
  onRemove,
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
  onRemove?: () => void
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
        <div className="flex items-center gap-1">
          {onRemove ? (
            <Button type="button" variant="ghost" size="icon" title="删除品项" onClick={onRemove}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" title="关闭编辑面板" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
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
            {editable && mode === 1 ? <p className="text-xs text-muted-foreground">多项系统集成优先保留销售报价逐项价；没有逐项价时才按成本分摊。</p> : null}
            {editable && mode === 2 ? <p className="text-xs text-muted-foreground">单项系统集成按主项 99%、技术服务 1% 自动拆分。</p> : null}
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
