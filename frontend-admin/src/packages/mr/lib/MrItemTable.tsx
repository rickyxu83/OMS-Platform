import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MrItem, MrOrder } from '../types'
import { blankItem } from './form-logic'

function numberValue(value?: number | null) {
  return value === null || value === undefined ? '' : String(value)
}

function money(value?: number | null) {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function MrItemTable({ order, editable, onChange }: { order: MrOrder; editable: boolean; onChange: (items: MrItem[]) => void }) {
  const items = order.items || []
  const mode = Number(order.pricingMode || 0)
  const setItem = (index: number, patch: Partial<MrItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const remove = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index))

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border">
        <Table className="min-w-[2100px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-24">毛利率</TableHead>
              <TableHead className="w-36">公司料号</TableHead>
              <TableHead className="w-40">原厂规格</TableHead>
              <TableHead className="w-40">品名</TableHead>
              <TableHead className="w-64">描述</TableHead>
              <TableHead className="w-36">保固/服务</TableHead>
              <TableHead className="w-28">装机</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">单价</TableHead>
              <TableHead className="w-32">售价小计</TableHead>
              <TableHead className="w-32">厂商</TableHead>
              <TableHead className="w-32">COST</TableHead>
              <TableHead className="w-32">成本含税（行）</TableHead>
              <TableHead className="w-24">税率</TableHead>
              <TableHead className="w-40">采购单号</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? <TableRow><TableCell colSpan={17} className="h-24 text-center text-muted-foreground">尚未填写品项</TableCell></TableRow> : items.map((item, index) => {
              const serviceRow = mode === 2 && index === 1
              return (
                <TableRow key={item.id || index}>
                  <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className={`text-right tabular-nums ${Number(item.marginRate) < 0 ? 'text-destructive' : ''}`}>{item.marginRate == null ? '-' : `${Number(item.marginRate).toFixed(2)}%`}</TableCell>
                  <TableCell><Input value={item.companyPartNo || ''} onChange={(e) => setItem(index, { companyPartNo: e.target.value })} disabled={!editable} /></TableCell>
                  <TableCell><Input value={item.oemSpec || ''} onChange={(e) => setItem(index, { oemSpec: e.target.value })} disabled={!editable} /></TableCell>
                  <TableCell><Input value={item.name || ''} onChange={(e) => setItem(index, { name: e.target.value })} disabled={!editable || serviceRow} /></TableCell>
                  <TableCell><Input value={item.description || ''} onChange={(e) => setItem(index, { description: e.target.value })} disabled={!editable} /></TableCell>
                  <TableCell><Input value={item.warrantyService || ''} onChange={(e) => setItem(index, { warrantyService: e.target.value })} disabled={!editable} /></TableCell>
                  <TableCell><Input value={item.installBy || ''} onChange={(e) => setItem(index, { installBy: e.target.value })} disabled={!editable} /></TableCell>
                  <TableCell><Input type="number" min={1} step={1} value={numberValue(item.qty)} onChange={(e) => setItem(index, { qty: e.target.value === '' ? null : Number(e.target.value) })} disabled={!editable} /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={numberValue(item.unitPrice)} onChange={(e) => setItem(index, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })} disabled={!editable || mode !== 3} className={mode !== 3 ? 'bg-violet-50' : ''} /></TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.subtotal)}</TableCell>
                  <TableCell><Input value={item.vendor || ''} onChange={(e) => setItem(index, { vendor: e.target.value })} disabled={!editable || serviceRow} /></TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.costExcludingTax)}</TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={numberValue(item.costInclTax)} onChange={(e) => setItem(index, { costInclTax: e.target.value === '' ? null : Number(e.target.value) })} disabled={!editable || serviceRow} /></TableCell>
                  <TableCell><Select value={String(item.taxRate || '')} onValueChange={(value) => setItem(index, { taxRate: Number(value) })} disabled={!editable || serviceRow}><SelectTrigger><SelectValue placeholder="税率" /></SelectTrigger><SelectContent><SelectItem value="6">6%</SelectItem>{String(order.invoiceType || '').startsWith('13%') ? <SelectItem value="13">13%</SelectItem> : null}</SelectContent></Select></TableCell>
                  <TableCell><Input value={item.purchaseOrderNo || ''} onChange={(e) => setItem(index, { purchaseOrderNo: e.target.value })} disabled={!editable} /></TableCell>
                  <TableCell>{editable && mode !== 2 ? <Button variant="ghost" size="icon" title="删除品项" onClick={() => remove(index)}><Trash2 className="size-4 text-destructive" /></Button> : null}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {editable && mode !== 2 && items.length < 20 ? <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, blankItem()])}><Plus className="mr-2 size-4" />添加品项</Button> : null}
    </div>
  )
}
