import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    setExpanded((current) => new Set([...current].filter((index) => index < items.length)))
  }, [items.length])

  // A validation error pointing at `items.N.*` opens that row.
  useEffect(() => {
    if (focusIndex === null || focusIndex === undefined) return
    setExpanded((current) => new Set([...current, focusIndex]))
    onFocusHandled?.()
  }, [focusIndex, onFocusHandled])

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

  if (!items.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          尚未填写品项{editable ? '，可从报价文件导入或手动添加。' : '。'}
        </div>
        {editable && mode !== 2 ? <AddItemButton order={order} items={items} onChange={onChange} setExpanded={setExpanded} /> : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <datalist id="mr-vendor-options">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">点击任一行展开编辑全部字段；毛利率低于 {LOW_MARGIN}% 的行以红色标出。</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(expanded.size === items.length ? new Set() : new Set(items.map((_, index) => index)))}
          >
            {expanded.size === items.length ? '全部收起' : '全部展开'}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 text-left font-medium">#</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">品名 / 原厂规格</th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium">数量</th>
                <th scope="col" className="w-32 px-3 py-2 text-right font-medium">销售单价</th>
                <th scope="col" className="w-36 px-3 py-2 text-right font-medium">售价小计</th>
                <th scope="col" className="w-24 px-3 py-2 text-right font-medium">毛利率</th>
                <th scope="col" className="w-24 px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, index) => {
                // In 单项系统集成 the second row is the fixed 技术服务 line.
                const serviceRow = mode === 2 && index === 1
                const isExpanded = expanded.has(index)
                const installValues = tokens(item.installBy)
                const installExtra = installValues.filter((value) => !workOptions.includes(value)).join('、')
                const low = isLowMargin(item)
                return (
                  <Fragment key={item.id || `row-${index}`}>
                    <tr className={`align-top ${isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20'} ${low ? 'border-l-2 border-l-red-500' : ''}`}>
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">{index + 1}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(index)}
                          className="block w-full min-w-0 text-left"
                          aria-expanded={isExpanded}
                        >
                          <span className="block break-words font-medium">{item.name || '未填写品名'}</span>
                          <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.oemSpec || '原厂规格未填'}</span>
                        </button>
                        {item.description ? (
                          <p className="mt-1.5 break-words whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{item.description}</p>
                        ) : null}
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
                          <Button type="button" variant="ghost" size="icon" title={isExpanded ? '收起' : '展开'} onClick={() => toggleExpanded(index)}>
                            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="bg-muted/20">
                        <td colSpan={7} className="px-3 pb-5 pt-1 sm:px-4">
                          <div className="space-y-4">
                            <SubPanel title="品项标识">
                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <Field label="品名" editable={editable} readonlyText={textValue(item.name)} className="md:col-span-2">
                                  <Textarea rows={2} value={item.name || ''} onChange={(event) => setItem(index, { name: event.target.value })} disabled={serviceRow} />
                                </Field>
                                <Field label="原厂规格" editable={editable} readonlyText={textValue(item.oemSpec)} className="md:col-span-2">
                                  <Textarea rows={2} value={item.oemSpec || ''} onChange={(event) => setItem(index, { oemSpec: event.target.value })} />
                                </Field>
                                <Field label="品名描述" editable={editable} readonlyText={textValue(item.description)} className="md:col-span-2 xl:col-span-4">
                                  <Textarea rows={4} value={item.description || ''} onChange={(event) => setItem(index, { description: event.target.value })} />
                                </Field>
                                <Field label="公司料号" editable={editable} readonlyText={textValue(item.companyPartNo)}>
                                  <Input value={item.companyPartNo || ''} onChange={(event) => setItem(index, { companyPartNo: event.target.value })} />
                                </Field>
                                <Field label="保固 / 服务" editable={editable} readonlyText={textValue(item.warrantyService)}>
                                  <Input value={item.warrantyService || ''} onChange={(event) => setItem(index, { warrantyService: event.target.value })} />
                                </Field>
                              </div>
                            </SubPanel>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <SubPanel title="销售">
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label="数量" editable={editable} readonlyText={textValue(item.qty)}>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={numberValue(item.qty)}
                                      onChange={(event) => setItem(index, { qty: event.target.value === '' ? null : Number(event.target.value) })}
                                    />
                                  </Field>
                                  <Field label="销售单价" editable={editable} readonlyText={item.unitPrice == null ? '-' : money(item.unitPrice)}>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={numberValue(item.unitPrice)}
                                      disabled={mode !== 3}
                                      onChange={(event) => setItem(index, { unitPrice: event.target.value === '' ? null : Number(event.target.value) })}
                                    />
                                  </Field>
                                  <Field label="售价小计" editable={false} readonlyText={`¥ ${money(item.subtotal)}`} />
                                  <Field label="毛利率" editable={false} readonlyText={<span className={low ? 'text-red-600' : ''}>{percent(item.marginRate)}</span>} />
                                </div>
                                {editable && mode !== 3 ? (
                                  <p className="text-xs text-muted-foreground">系统集成模式的单价由未税总计按成本分摊自动计算。</p>
                                ) : null}
                              </SubPanel>

                              <SubPanel title="采购">
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label="厂商" editable={editable} readonlyText={textValue(item.vendor)}>
                                    <Input
                                      list="mr-vendor-options"
                                      value={item.vendor || ''}
                                      placeholder="从厂商库选择或输入"
                                      disabled={serviceRow}
                                      onChange={(event) => setItem(index, { vendor: event.target.value })}
                                    />
                                  </Field>
                                  <Field label="采购单号" editable={editable} readonlyText={textValue(item.purchaseOrderNo)}>
                                    <Input value={item.purchaseOrderNo || ''} onChange={(event) => setItem(index, { purchaseOrderNo: event.target.value })} />
                                  </Field>
                                  <Field label="成本含税（整行）" editable={editable} readonlyText={item.costInclTax == null ? '-' : `¥ ${money(item.costInclTax)}`}>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={numberValue(item.costInclTax)}
                                      disabled={serviceRow}
                                      onChange={(event) => setItem(index, { costInclTax: event.target.value === '' ? null : Number(event.target.value) })}
                                    />
                                  </Field>
                                  <Field label="成本税率" editable={editable} readonlyText={item.taxRate ? `${item.taxRate}%` : '-'}>
                                    <Select value={String(item.taxRate || '')} disabled={serviceRow} onValueChange={(value) => setItem(index, { taxRate: Number(value) })}>
                                      <SelectTrigger><SelectValue placeholder="税率" /></SelectTrigger>
                                      <SelectContent>
                                        {allowedTaxRates.map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </Field>
                                  <Field label="未税成本" editable={false} readonlyText={item.costExcludingTax == null ? '-' : `¥ ${money(item.costExcludingTax)}`} />
                                  {item.costSource ? <Field label="成本来源" editable={false} readonlyText={item.costSource} /> : null}
                                </div>
                              </SubPanel>
                            </div>

                            <SubPanel title="明细装机">
                              {editable ? (
                                <>
                                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                                    {workOptions.filter((choice) => choice !== 'NO').map((choice) => (
                                      <label key={choice} className="flex items-center gap-2 text-sm">
                                        <Checkbox checked={installValues.includes(choice)} onCheckedChange={(checked) => setInstallChoice(index, choice, Boolean(checked))} />
                                        {choice}
                                      </label>
                                    ))}
                                  </div>
                                  <div className="max-w-xl">
                                    <Input value={installExtra} placeholder="额外装机对象，可用顿号分隔" onChange={(event) => setInstallExtra(index, event.target.value)} />
                                  </div>
                                </>
                              ) : (
                                <div className="text-sm">{installValues.join('、') || '-'}</div>
                              )}
                            </SubPanel>
                          </div>
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

      {editable && mode !== 2 ? <AddItemButton order={order} items={items} onChange={onChange} setExpanded={setExpanded} /> : null}
    </div>
  )
}

function AddItemButton({
  order,
  items,
  onChange,
  setExpanded,
}: {
  order: MrOrder
  items: MrItem[]
  onChange: (items: MrItem[]) => void
  setExpanded: React.Dispatch<React.SetStateAction<Set<number>>>
}) {
  if (items.length >= 200) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        onChange([...items, { ...blankItem(defaultCostTaxRate(order.invoiceType)), installBy: (order.installOptions || []).filter((value) => value !== 'NO').join('、') }])
        setExpanded((current) => new Set([...current, items.length]))
      }}
    >
      <Plus className="mr-2 size-4" />添加品项
    </Button>
  )
}
