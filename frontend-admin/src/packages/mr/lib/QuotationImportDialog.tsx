import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { importQuotation } from '../client'
import type { MrItem, ParsedQuotationSheet } from '../types'
import { mapQuotation } from './form-logic'

export function QuotationImportDialog({
  orderId,
  open,
  onOpenChange,
  onApply,
}: {
  orderId: string | number
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (items: MrItem[], sheet: ParsedQuotationSheet, file: { id: string | number; name: string }) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<ParsedQuotationSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState('0')
  const [priceTarget, setPriceTarget] = useState<'unitPrice' | 'costInclTax'>('costInclTax')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selected = sheets[Number(sheetIndex)]

  const parse = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const data = await importQuotation(orderId, file)
      setSheets(data.sheets || [])
      setSheetIndex('0')
    } catch (err) {
      setError((err as Error).message || '报价单解析失败')
    } finally {
      setLoading(false)
    }
  }

  const apply = async () => {
    if (!file || !selected) return
    setLoading(true)
    setError('')
    try {
      const data = await importQuotation(orderId, file, true)
      const savedSheet = data.sheets.find((sheet) => sheet.title === selected.title) || data.sheets[Number(sheetIndex)]
      if (!data.file || !savedSheet) throw new Error('报价单保存失败')
      onApply(mapQuotation(savedSheet, priceTarget), savedSheet, data.file)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message || '报价单保存失败')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导入 Excel 报价单</DialogTitle>
          <DialogDescription>支持含 Item / Part_no / Description / Qty / Unit Net Price 表头的 .xls 或 .xlsx。</DialogDescription>
        </DialogHeader>

        <label htmlFor="mr-quotation-file" className="text-sm font-medium">报价单文件</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="mr-quotation-file" type="file" accept=".xls,.xlsx" onChange={(event) => { setFile(event.target.files?.[0] || null); setSheets([]); setSheetIndex('0'); setError('') }} className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2" />
          <Button onClick={parse} disabled={!file || loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}
            解析
          </Button>
        </div>
        {error ? <div className="border-l-4 border-destructive bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

        {selected ? (
          <>
            <div className="grid gap-3 border-y py-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">工作表</span><Select value={sheetIndex} onValueChange={setSheetIndex}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sheets.map((sheet, index) => <SelectItem key={`${sheet.title}-${index}`} value={String(index)}>{sheet.title}（{sheet.items.length} 项）</SelectItem>)}</SelectContent></Select></label>
              <div className="text-sm"><div className="text-muted-foreground">报价客户 / 联系人</div><div className="mt-2 font-medium">{selected.customer || '-'} / {selected.attn || '-'}</div></div>
              <div className="text-sm"><div className="text-muted-foreground">税率 / 报价合计</div><div className="mt-2 font-medium">{selected.tax_rate ? `${selected.tax_rate}%` : '-'} / ¥ {Number(selected.total || 0).toLocaleString('zh-CN')}</div></div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">报价价格导入到</div>
              <div className="inline-flex border p-1">
                <Button type="button" size="sm" variant={priceTarget === 'costInclTax' ? 'default' : 'ghost'} onClick={() => setPriceTarget('costInclTax')}>成本含税</Button>
                <Button type="button" size="sm" variant={priceTarget === 'unitPrice' ? 'default' : 'ghost'} onClick={() => setPriceTarget('unitPrice')}>销售单价</Button>
              </div>
            </div>

            <div className="max-h-[360px] overflow-auto border">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>原厂规格</TableHead><TableHead>品名 / 描述</TableHead><TableHead className="text-right">数量</TableHead><TableHead className="text-right">价格</TableHead></TableRow></TableHeader>
                <TableBody>{selected.items.map((item, index) => <TableRow key={`${item.item_no}-${index}`}><TableCell>{item.item_no || index + 1}</TableCell><TableCell>{item.part_no || '-'}</TableCell><TableCell className="max-w-md whitespace-pre-wrap">{item.description || '-'}</TableCell><TableCell className="text-right">{item.qty || 1}</TableCell><TableCell className="text-right">{Number(item.unit_price || 0).toLocaleString('zh-CN')}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={!selected || loading} onClick={() => void apply()}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}导入 {selected?.items.length || 0} 项</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
