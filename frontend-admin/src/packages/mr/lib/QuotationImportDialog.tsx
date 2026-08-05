import { useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { downloadQuotation, importQuotations } from '../client'
import type { QuotationFile, QuotationImportResult } from '../types'

function money(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function QuotationImportDialog({
  orderId,
  open,
  editable,
  invoiceType,
  pricingMode,
  existingFiles,
  onOpenChange,
  onApply,
}: {
  orderId: string | number
  open: boolean
  editable: boolean
  invoiceType?: string | null
  pricingMode?: number | null
  existingFiles: QuotationFile[]
  onOpenChange: (open: boolean) => void
  onApply: (result: QuotationImportResult) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<QuotationImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const taxConflictCount = String(invoiceType || '').startsWith('6%')
    ? (preview?.items || []).filter((item) => Number(item.taxRate) === 13).length
    : 0
  const ignoredSingleIntegrationItems = Number(pricingMode) === 2 ? Math.max(0, (preview?.items.length || 0) - 1) : 0
  const appliedItemCount = preview ? (Number(pricingMode) === 2 ? 2 : preview.items.length) : 0

  const parse = async (selected: File[]) => {
    setFiles(selected)
    setPreview(null)
    setError('')
    if (!selected.length) return
    setLoading(true)
    try {
      setPreview(await importQuotations(orderId, selected))
    } catch (err) {
      setError((err as Error).message || '报价单解析失败')
    } finally {
      setLoading(false)
    }
  }

  const apply = async () => {
    if (!files.length || !preview) return
    setLoading(true)
    setError('')
    try {
      const saved = await importQuotations(orderId, files, true)
      onApply(saved)
      onOpenChange(false)
      setFiles([])
      setPreview(null)
    } catch (err) {
      setError((err as Error).message || '报价单保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>报价文件与品项导入</DialogTitle>
          <DialogDescription>同时选择客户报价和一份或多份厂商报价。系统按总额识别销售报价，以料号、原厂规格和描述匹配品项，并采用匹配到的最低进货价。</DialogDescription>
        </DialogHeader>

        {existingFiles.length ? (
          <section className="border-y py-3">
            <div className="mb-2 text-sm font-medium">已留存原文件</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {existingFiles.map((file) => (
                <button key={file.id} type="button" onClick={() => void downloadQuotation(orderId, file.id, file.name)} className="flex min-w-0 items-center justify-between gap-3 border px-3 py-2 text-left hover:bg-muted">
                  <span className="min-w-0 truncate text-sm">{file.name}</span>
                  <Download className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {editable ? (
          <label htmlFor="mr-quotation-files" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-5 text-center hover:bg-muted/50">
            {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <Upload className="size-6 text-muted-foreground" />}
            <span className="text-sm font-medium">选择全部报价文件</span>
            <span className="text-xs text-muted-foreground">支持 .xls / .xlsx，可一次多选，重新导入会替换上一批文件</span>
            <input id="mr-quotation-files" type="file" accept=".xls,.xlsx" multiple className="sr-only" disabled={loading} onChange={(event) => void parse(Array.from(event.target.files || []))} />
          </label>
        ) : null}

        {files.length ? <div className="text-sm text-muted-foreground">已选择 {files.length} 份：{files.map((file) => file.name).join('、')}</div> : null}
        {error ? <div className="border-l-4 border-destructive bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

        {preview ? (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">自动识别结果</h3><span className="text-xs text-muted-foreground">可返回重选文件；导入后仍可修改品项</span></div>
              <div className="divide-y border">
                {preview.sources.map((source) => (
                  <div key={`${source.index}-${source.name}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[110px_minmax(0,1fr)_130px_90px] sm:items-center">
                    <span className={source.role === 'sales' ? 'font-medium text-emerald-700' : 'font-medium text-blue-700'}>{source.role === 'sales' ? '销售报价' : '进货报价'}</span>
                    <div className="min-w-0"><div className="truncate text-sm font-medium" title={source.name}>{source.name}</div>{source.vendor ? <div className="text-xs text-muted-foreground">识别厂商：{source.vendor}</div> : null}</div>
                    <div className="text-sm tabular-nums">¥ {money(source.total)}</div>
                    <div className="text-sm text-muted-foreground">{source.itemCount} 项</div>
                  </div>
                ))}
              </div>
            </section>

            {preview.warnings.length || taxConflictCount || ignoredSingleIntegrationItems ? (
              <div className="border-l-4 border-amber-500 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />需要人工核对</div>
                {preview.warnings.map((warning) => <div key={warning}>· {warning}</div>)}
                {taxConflictCount ? <div>· 当前为 6% 销售发票，{taxConflictCount} 个品项导入时识别为 13% 成本税率；确认导入后将按规则改为 6%。</div> : null}
                {ignoredSingleIntegrationItems ? <div>· 当前为单项系统集成，只导入第一项作为主项，另外 {ignoredSingleIntegrationItems} 项不会写入；系统会自动建立“技术服务”项。</div> : null}
              </div>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-medium">报价识别品项（{preview.items.length}）</h3>
              <div className="max-h-[360px] divide-y overflow-y-auto border">
                {preview.items.map((item, index) => (
                  <div key={`${item.oemSpec}-${index}`} className="grid gap-2 px-3 py-3 lg:grid-cols-[36px_minmax(180px,1fr)_110px_120px_120px] lg:items-start">
                    <span className="text-sm text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0"><div className="break-words text-sm font-medium">{item.name || item.oemSpec || '未命名品项'}</div><div className="mt-1 break-words text-xs text-muted-foreground">{item.oemSpec || '-'} · {item.description || '-'}</div></div>
                    <div className="text-sm">数量 {item.qty || 1}</div>
                    <div className="text-sm tabular-nums">售价 ¥ {money(item.unitPrice)}</div>
                    <div className="text-sm tabular-nums">成本 ¥ {item.costInclTax == null ? '-' : money(item.costInclTax)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          {editable ? <Button disabled={!preview || loading} onClick={() => void apply()}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}确认导入 {appliedItemCount} 项</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
