import { Fragment, useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react'
import { Check, Copy, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MrItem, MrOrder, VendorOption } from '../types'
import { blankItem, defaultCostTaxRate } from './form-logic'
import { Field, money, percent, textValue } from './mr-ui'

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
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchSourceIndex, setBatchSourceIndex] = useState(0)
  const [batchFields, setBatchFields] = useState({ vendor: true, purchaseOrderNo: true, warrantyService: true, installBy: true })
  // 拖选多选：点击行打开编辑弹窗；按住左键拖过多行才算多选（started 区分点击与拖拽）
  const dragRef = useRef({ active: false, started: false, startIndex: 0, mode: 'add' as 'add' | 'remove' })
  const anchorRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const stop = () => {
      if (dragRef.current.started) suppressClickRef.current = true
      dragRef.current.active = false
      dragRef.current.started = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])
  // 点击表格外的页面空白处清除多选（弹窗内点击除外）
  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!selectedRows.size) return
      const target = event.target as HTMLElement
      if (target.closest('[role="dialog"]')) return
      if (containerRef.current && !containerRef.current.contains(target)) setSelectedRows(new Set())
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => document.removeEventListener('mousedown', onDocumentMouseDown)
  }, [selectedRows.size])

  const applyRowSelection = (index: number, mode: 'add' | 'remove') => {
    setSelectedRows((current) => {
      const next = new Set(current)
      if (mode === 'add') next.add(index)
      else next.delete(index)
      return next
    })
  }
  const onRowMouseDown = (index: number, event: ReactMouseEvent<HTMLTableRowElement>) => {
    if (!editable || event.button !== 0) return
    if ((event.target as HTMLElement).closest('input, textarea, button, a, select')) return
    suppressClickRef.current = false
    if (event.shiftKey && anchorRef.current !== null) {
      const [start, end] = [Math.min(anchorRef.current, index), Math.max(anchorRef.current, index)]
      setSelectedRows((current) => {
        const next = new Set(current)
        for (let i = start; i <= end; i += 1) next.add(i)
        return next
      })
      suppressClickRef.current = true
      event.preventDefault()
      return
    }
    dragRef.current = { active: true, started: false, startIndex: index, mode: selectedRows.has(index) ? 'remove' : 'add' }
    anchorRef.current = index
    event.preventDefault()
  }
  const onRowMouseEnter = (index: number) => {
    if (!editable || !dragRef.current.active) return
    if (!dragRef.current.started) {
      dragRef.current.started = true
      applyRowSelection(dragRef.current.startIndex, dragRef.current.mode)
    }
    applyRowSelection(index, dragRef.current.mode)
  }
  const onRowClick = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setSelectedIndex(index)
  }
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

  const setItem = (index: number, patch: Partial<MrItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, ...(mode === 3 && patch.unitPrice !== undefined ? { quotedUnitPrice: null } : {}) } : item))
  const duplicateItem = (index: number) => {
    const source = items[index]
    if (!source) return
    const copy: MrItem = {
      ...source,
      id: undefined,
      rowNo: undefined,
      subtotal: undefined,
      costExcludingTax: undefined,
      marginRate: undefined,
      matchCandidates: source.matchCandidates ? [...source.matchCandidates] : undefined,
    }
    onChange([...items.slice(0, index + 1), copy, ...items.slice(index + 1)])
    setSelectedIndex(index + 1)
  }
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
    toast.success(`已将 ${fieldCount} 个字段应用至 ${affectedCount} 个品项`)
  }
  if (!items.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          尚未添加品项{editable ? '。可通过报价导入或手动添加。' : '。'}
        </div>
        {editable && mode !== 2 ? (
          <div className="flex flex-wrap justify-end gap-2">
            <AddItemButton order={order} items={items} onChange={onChange} setSelectedIndex={setSelectedIndex} />
          </div>
        ) : null}
      </div>
    )
  }

  const rowSelectionEnabled = true

  return (
    <div className="space-y-3">
      <datalist id="mr-vendor-options">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">点击品项行即可编辑；按住左键拖过品项行可多选，Shift+点击选连续区间，用于批量复制、批量删除。</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRows(new Set(items.map((_, index) => index)))}>全选</Button>
            {editable && selectedRows.size ? (
              <>
                <span className="text-xs text-muted-foreground">已选择 {selectedRows.size} 个品项</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRows(new Set())}>清除</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setBatchOpen(true)}><SlidersHorizontal className="mr-1.5 size-4" />批量复制</Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => {
                  if (window.confirm(`确定删除选中的 ${selectedRows.size} 个品项吗？删除后不可恢复。`)) {
                    onChange(items.filter((_, index) => !selectedRows.has(index)))
                    setSelectedRows(new Set())
                    toast.success(`已删除 ${selectedRows.size} 个品项`)
                  }
                }}><Trash2 className="mr-1.5 size-4" />批量删除</Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-16 px-3 py-2 text-left font-medium">序号</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">品名及描述</th>
                  <th scope="col" className="w-20 px-3 py-2 text-right font-medium">数量</th>
                  <th scope="col" className="w-32 px-3 py-2 text-right font-medium">未税单价</th>
                  <th scope="col" className="w-36 px-3 py-2 text-right font-medium">未税小计</th>
                  <th scope="col" className="w-24 px-3 py-2 text-right font-medium">毛利率</th>
                  <th scope="col" className="w-12 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, index) => {
                  const low = isLowMargin(item)
                  const selected = selectedIndex === index
                  return (
                    <Fragment key={item.id || `row-${index}`}>
                      <tr
                      onClick={rowSelectionEnabled ? () => onRowClick(index) : undefined}
                      onMouseDown={rowSelectionEnabled && editable ? (event) => onRowMouseDown(index, event) : undefined}
                      onMouseEnter={rowSelectionEnabled && editable ? () => onRowMouseEnter(index) : undefined}
                      className={`align-top transition-colors ${selected ? 'bg-primary/5' : 'hover:bg-muted/20'} ${selectedRows.has(index) ? 'bg-primary/10' : ''} ${low ? 'border-l-2 border-l-red-500' : ''} ${rowSelectionEnabled ? 'cursor-pointer' : ''} ${editable ? 'select-none' : ''}`}
                    >
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">
                        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                          <span className="tabular-nums">{index + 1}</span>
                          {editable ? (
                            <Button type="button" variant="ghost" size="icon" className="size-6" title="复制此行为新行" aria-label={`复制第 ${index + 1} 项`} onClick={() => duplicateItem(index)}><Copy className="size-3.5" /></Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="min-w-0 px-3 py-3">
                        <div
                          className="block w-full min-w-0 text-left"
                          aria-label={`${editable ? '编辑' : '查看'}第 ${index + 1} 项`}
                        >
                          <span className="block break-words font-medium">{item.description || item.name || '未填写品名及描述'}</span>
                          <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.oemSpec || '未填写原厂规格'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.qty ?? '-'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.unitPrice == null ? '-' : money(item.unitPrice)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">¥ {money(item.subtotal)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${low ? 'font-medium text-red-600' : ''}`}>{percent(item.marginRate)}</td>
                      <td className="w-12 px-2 py-3 text-right">
                        {editable ? (
                          <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" title="删除此品项" aria-label={`删除第 ${index + 1} 项`} onClick={(event) => { event.stopPropagation(); if (window.confirm(`确定删除“${item.description || item.name || `第 ${index + 1} 项`}”吗？删除后不可恢复。`)) { remove(index) } }}><Trash2 className="size-4" /></Button>
                        ) : null}
                      </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 编辑品项弹窗：点击品项行弹出，不再在表格内下拉展开 */}
      <Dialog open={Boolean(selectedIndex !== null && items[selectedIndex])} onOpenChange={(open) => { if (!open) setSelectedIndex(null) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[92vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
          {selectedIndex !== null && items[selectedIndex] ? (
            <ItemEditorPanel
              item={items[selectedIndex]}
              index={selectedIndex}
              editable={editable}
              mode={mode}
              vendors={vendors}
              workOptions={workOptions}
              allowedTaxRates={allowedTaxRates}
              onClose={() => setSelectedIndex(null)}
              onRemove={editable && mode !== 2 ? () => { remove(selectedIndex); setSelectedIndex(null) } : undefined}
              onChange={(patch) => setItem(selectedIndex, patch)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 批量复制弹窗：选中品项后从顶部按钮弹出，不再占用右侧栏 */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" />批量复制</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">已选择 {selectedRows.size} 个品项。请选择复制来源及需要复制的字段。</p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="mr-batch-source">复制来源</label>
            <Select value={String(batchSourceIndex)} onValueChange={(value) => setBatchSourceIndex(Number(value))}>
              <SelectTrigger id="mr-batch-source"><SelectValue /></SelectTrigger>
              <SelectContent>{items.map((item, index) => <SelectItem key={item.id || index} value={String(index)}>第 {index + 1} 项：{item.name || item.oemSpec || '未命名'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-3 border-y py-4">
            <p className="text-xs text-muted-foreground">仅复制所选字段，不会覆盖数量、销售价格或采购成本。</p>
            {([['vendor', '供应商'], ['purchaseOrderNo', '采购订单号'], ['warrantyService', '保固与服务'], ['installBy', '品项装机方']] as const).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm"><Checkbox checked={batchFields[field]} onCheckedChange={(checked) => setBatchFields((current) => ({ ...current, [field]: Boolean(checked) }))} />{label}</label>
            ))}
          </div>
          <Button type="button" className="w-full" disabled={!selectedRows.size} onClick={() => { applyBatch(); setBatchOpen(false) }}><Check className="mr-2 size-4" />应用至已选品项</Button>
        </DialogContent>
      </Dialog>
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
    <section aria-label={`编辑第 ${index + 1} 项`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-primary">{editable ? '编辑品项' : '查看品项'} {index + 1}</div>
          <div className="mt-1 text-sm text-muted-foreground">{editable ? '请在此编辑完整资料；关闭后，品项表仅显示摘要。' : '只读查看品项完整资料。'}</div>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="品名及描述" editable={editable} readonlyText={textValue(item.description || item.name)}>
          <Textarea rows={2} value={item.description || item.name || ''} placeholder="品名 + 规格型号 / 服务描述" disabled={serviceRow} onChange={(event) => { const value = event.target.value; onChange({ name: value.split(/\r?\n/)[0] || value, description: value }) }} />
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="原厂规格" editable={editable} readonlyText={textValue(item.oemSpec)}>
            <Input value={item.oemSpec || ''} placeholder="原厂/OEM 规格型号，选填" onChange={(event) => onChange({ oemSpec: event.target.value })} />
          </Field>
          <Field label="公司料号" editable={editable} readonlyText={textValue(item.companyPartNo)}>
            <Input value={item.companyPartNo || ''} placeholder="公司内部产品料号，选填" onChange={(event) => onChange({ companyPartNo: event.target.value })} />
          </Field>
          <Field label="保固与服务" editable={editable} readonlyText={textValue(item.warrantyService)}>
            <Input value={item.warrantyService || ''} placeholder="如：一年保固 / 三年上门" onChange={(event) => onChange({ warrantyService: event.target.value })} />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="数量" editable={editable} readonlyText={textValue(item.qty)}>
            <Input type="number" min={0} step={0.01} value={numberValue(item.qty)} onChange={(event) => onChange({ qty: event.target.value === '' ? null : Number(event.target.value) })} />
          </Field>
          <Field label="未税单价" editable={editable} readonlyText={item.unitPrice == null ? '-' : money(item.unitPrice)}>
            <Input type="number" min={0} step="0.01" value={numberValue(item.unitPrice)} disabled={mode !== 3} onChange={(event) => onChange({ unitPrice: event.target.value === '' ? null : Number(event.target.value) })} />
          </Field>
          <Field required={!serviceRow} label="供应商" editable={editable} readonlyText={textValue(item.vendor)}>
            <Input list="mr-vendor-options" value={item.vendor || ''} placeholder="从供应商目录选择或输入完整名称" disabled={serviceRow} onChange={(event) => onChange({ vendor: event.target.value })} />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field required={!serviceRow} label="采购成本（含税）" editable={editable} readonlyText={item.costInclTax == null ? '-' : `¥ ${money(item.costInclTax)}`}>
            <Input type="number" min={0} step="0.01" value={numberValue(item.costInclTax)} disabled={serviceRow} onChange={(event) => onChange({ costInclTax: event.target.value === '' ? null : Number(event.target.value) })} />
          </Field>
          <Field required={!serviceRow} label="采购税率" editable={editable} readonlyText={item.taxRate ? `${item.taxRate}%` : '-'}>
            <Select value={String(item.taxRate || '')} disabled={serviceRow} onValueChange={(value) => onChange({ taxRate: Number(value) })}>
              <SelectTrigger><SelectValue placeholder="选择采购税率" /></SelectTrigger>
              <SelectContent>{allowedTaxRates.map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="采购订单号" editable={editable} readonlyText={textValue(item.purchaseOrderNo)}>
            <Input value={item.purchaseOrderNo || ''} placeholder="向供应商下单的 PO 编号，选填" onChange={(event) => onChange({ purchaseOrderNo: event.target.value })} />
          </Field>
        </div>

        {/* 只读汇总小字（不占格子） */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>未税小计 <b className="text-foreground">¥ {money(item.subtotal)}</b></span>
          <span>毛利率 <b className={low ? 'text-red-600' : 'text-foreground'}>{percent(item.marginRate)}</b></span>
          {item.costExcludingTax != null ? <span>成本（不含税） <b className="text-foreground">¥ {money(item.costExcludingTax)}</b></span> : null}
          {item.vendor && vendors.some((vendor) => vendor.name === item.vendor) ? <span className="text-emerald-700">已关联 OMS 供应商目录</span> : null}
          {item.costSource ? <span>成本来源 {item.costSource}</span> : null}
        </div>
        {editable && mode === 1 ? <p className="text-xs text-muted-foreground">多项系统集成优先保留销售报价的逐项未税单价；缺失时按采购成本（不含税）占比分摊未税总计。</p> : null}
        {editable && mode === 2 ? <p className="text-xs text-muted-foreground">单项系统集成将未税总计按主项 99%、技术服务 1% 自动分配。</p> : null}

        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">品项装机承担方</div>
          {editable ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {workOptions.filter((choice) => choice !== 'NO').map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={installValues.includes(choice)} onCheckedChange={(checked) => setInstallChoice(choice, Boolean(checked))} />
                  {choice}
                </label>
              ))}
              <Input className="h-8 w-56" value={installExtra} placeholder="其他承担方，顿号分隔" onChange={(event) => setInstallExtra(event.target.value)} />
            </div>
          ) : <div className="text-sm">{installValues.join('、') || '-'}</div>}
        </div>
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
