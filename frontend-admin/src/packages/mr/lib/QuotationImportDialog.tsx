import { useMemo, useState, type DragEvent } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { downloadQuotation, importQuotations } from '../client'
import type { MrItem, MrOrder, QuotationFile, QuotationImportResult, QuotationSource } from '../types'
import { calculateForm } from './form-logic'

const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx', '.pdf']
type UploadRole = 'sales' | 'purchase'

function money(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sourceLabel(role: QuotationSource['role']) {
  return role === 'order' ? '最终 PO' : role === 'sales' ? '客户报价' : '供应商报价'
}

function acceptedFiles(files: File[]) {
  return files.filter((file) => ACCEPTED_EXTENSIONS.includes(`.${file.name.split('.').pop()?.toLowerCase() || ''}`))
}

function FileDropZone({
  title,
  hint,
  files,
  onFiles,
}: {
  title: string
  hint: string
  files: File[]
  onFiles: (files: File[]) => void
}) {
  const [dragging, setDragging] = useState(false)
  const receive = (incoming: File[]) => {
    const next = acceptedFiles(incoming)
    if (next.length) onFiles([...files, ...next])
  }
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    receive(Array.from(event.dataTransfer.files))
  }
  return (
    <label
      htmlFor={`mr-${title}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex min-h-36 cursor-pointer flex-col justify-center gap-2 border p-4 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-dashed hover:bg-muted/50'}`}
    >
      <div className="flex items-center gap-2">
        <Upload className="size-5 text-primary" />
        <span className="font-medium">{title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <span className="text-xs text-muted-foreground">支持 .xls / .xlsx / .pdf，可拖入多份文件</span>
      <input id={`mr-${title}`} type="file" accept={ACCEPTED_EXTENSIONS.join(',')} multiple className="sr-only" onChange={(event) => receive(Array.from(event.target.files || []))} />
      {files.length ? (
        <div className="mt-1 space-y-1">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 border bg-background px-2 py-1 text-xs">
              <span className="min-w-0 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`移除 ${file.name}`}
                className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                onClick={(event) => { event.preventDefault(); onFiles(files.filter((_, fileIndex) => fileIndex !== index)) }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </label>
  )
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
  onApply: (result: QuotationImportResult, pricingMode: number) => void
}) {
  const [salesFiles, setSalesFiles] = useState<File[]>([])
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([])
  const [selectedPricingMode, setSelectedPricingMode] = useState(String(pricingMode || ''))
  const [preview, setPreview] = useState<QuotationImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const files = [...salesFiles, ...purchaseFiles]
  const roles: UploadRole[] = [...salesFiles.map(() => 'sales' as const), ...purchaseFiles.map(() => 'purchase' as const)]
  const effectivePricingMode = Number(selectedPricingMode || pricingMode) || 0
  const previewItems = useMemo(() => {
    if (!preview || !effectivePricingMode) return preview?.items || []
    const salesTotal = preview.salesTotalExcludingTax ?? preview.sources.find((source) => source.role === 'sales' || source.role === 'order')?.total ?? null
    return calculateForm({
      ...preview,
      pricingMode: effectivePricingMode,
      invoiceType: invoiceType || '',
      totalExcludingTax: salesTotal,
      items: preview.items,
      installOptions: [],
    }).items || []
  }, [preview, effectivePricingMode, invoiceType])
  const taxConflictCount = String(invoiceType || '').startsWith('6%')
    ? previewItems.filter((item) => Number(item.taxRate) === 13).length
    : 0
  const ignoredSingleIntegrationItems = effectivePricingMode === 2 ? Math.max(0, previewItems.length - 2) : 0
  const appliedItemCount = preview ? previewItems.length : 0

  const parse = async (nextSales: File[], nextPurchase: File[]) => {
    const nextFiles = [...nextSales, ...nextPurchase]
    const nextRoles: UploadRole[] = [...nextSales.map(() => 'sales' as const), ...nextPurchase.map(() => 'purchase' as const)]
    setPreview(null)
    setError('')
    if (!nextFiles.length) return
    setLoading(true)
    try {
      setPreview(await importQuotations(orderId, nextFiles, false, nextRoles))
    } catch (err) {
      setError((err as Error).message || '报价单解析失败')
    } finally {
      setLoading(false)
    }
  }

  const updateFiles = (role: UploadRole, next: File[]) => {
    const nextSales = role === 'sales' ? next : salesFiles
    const nextPurchase = role === 'purchase' ? next : purchaseFiles
    if (role === 'sales') setSalesFiles(next)
    else setPurchaseFiles(next)
    void parse(nextSales, nextPurchase)
  }

  const apply = async () => {
    if (!files.length || !preview) return
    setLoading(true)
    setError('')
    try {
      const saved = await importQuotations(orderId, files, false, roles, true)
      onApply(saved, effectivePricingMode)
      onOpenChange(false)
      setSalesFiles([])
      setPurchaseFiles([])
      setPreview(null)
    } catch (err) {
      setError((err as Error).message || '报价单保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-h-[92vh] max-w-6xl overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>报价来源与品项导入</DialogTitle>
          <DialogDescription>把客户报价或最终 PO 放入左侧，把所有供应商报价放入右侧。每个区域可以一次拖入多份文件，系统会继续自动识别并提示冲突。</DialogDescription>
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
          <>
            <section className="border bg-muted/20 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px] md:items-center">
                <div><div className="text-sm font-medium">先选择计价模式</div><div className="mt-1 text-xs text-muted-foreground">系统会按这里选择的规则生成导入品项和销售单价。</div></div>
                <Select value={selectedPricingMode} onValueChange={setSelectedPricingMode}>
                  <SelectTrigger><SelectValue placeholder="选择计价模式" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">多项系统集成</SelectItem>
                    <SelectItem value="2">单项系统集成</SelectItem>
                    <SelectItem value="3">开明细</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
            {selectedPricingMode ? (
              <div className="grid gap-3 md:grid-cols-2">
                <FileDropZone title="客户报价 / 最终 PO" hint="售出来源：用于确定客户、销售总额、PO、交货和付款信息" files={salesFiles} onFiles={(next) => updateFiles('sales', next)} />
                <FileDropZone title="供应商报价 / 进货订单" hint="成本来源：可放入多家供应商报价，系统按品项匹配最低成本" files={purchaseFiles} onFiles={(next) => updateFiles('purchase', next)} />
              </div>
            ) : <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">请先选择计价模式，再上传报价文件。</div>}
          </>
        ) : null}

        {loading ? <div role="status" className="flex items-center gap-3 border bg-muted/30 px-4 py-3 text-sm"><Loader2 className="size-5 shrink-0 animate-spin text-primary" /><div><div className="font-medium">{preview ? '正在保存导入结果…' : '正在识别报价文件…'}</div><div className="text-xs text-muted-foreground">{preview ? '正在保存原始文件和品项，请稍候' : '正在解析表格、确认来源角色并匹配品项'}</div></div></div> : null}
        {files.length ? <div className="text-sm text-muted-foreground">已选择 {files.length} 份来源文件：客户/PO {salesFiles.length} 份，供应商 {purchaseFiles.length} 份</div> : null}
        {error ? <div className="border-l-4 border-destructive bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

        {preview ? (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">自动识别结果</h3><span className="text-xs text-muted-foreground">来源分组优先；识别结果仍会提示异常</span></div>
              {preview.metadata?.matchedCustomer ? (
                <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">已匹配客户档案：{preview.metadata.matchedCustomer.code ? `${preview.metadata.matchedCustomer.code} · ` : ''}{preview.metadata.matchedCustomer.name}{preview.metadata.matchedCustomer.contacts?.length ? `（${preview.metadata.matchedCustomer.contacts.length} 位联系人）` : ''}</div>
              ) : preview.metadata?.customer ? (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">报价客户“{preview.metadata.customer}”未匹配到客户档案，导入后请手工选择。</div>
              ) : null}
              <div className="divide-y border">
                {preview.sources.map((source) => (
                  <div key={`${source.index}-${source.name}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[120px_minmax(320px,1fr)_150px_80px] sm:items-center">
                    <span className={source.role === 'order' ? 'font-medium text-amber-700' : source.role === 'sales' ? 'font-medium text-emerald-700' : 'font-medium text-blue-700'}>{sourceLabel(source.role)}</span>
                    <div className="min-w-0"><div className="truncate text-sm font-medium" title={source.name}>{source.name}</div>{source.vendor ? <div className="text-xs text-muted-foreground">识别厂商：{source.vendor}</div> : null}</div>
                    <div className="text-sm tabular-nums">¥ {money(source.total)}</div>
                    <div className="text-sm text-muted-foreground">{source.itemCount} 项</div>
                  </div>
                ))}
              </div>
              {preview.salesTotalExcludingTax != null ? <div className="mt-3 grid gap-2 border bg-muted/30 px-3 py-3 text-sm sm:grid-cols-2"><div><span className="text-muted-foreground">最终采用未税销售额：</span><strong className="tabular-nums">¥ {money(preview.salesTotalExcludingTax)}</strong></div><div><span className="text-muted-foreground">来源：</span>{preview.orderSourceIndex != null && preview.orderSourceIndex >= 0 ? '最终 PO 优先' : '客户报价'}</div></div> : null}
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
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">报价识别品项（{previewItems.length}）</h3><span className="text-xs text-muted-foreground">已按当前计价模式预览，切换模式会实时重算</span></div>
              <div className="mb-1 hidden border-x border-t bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[44px_minmax(360px,1fr)_100px_150px_150px] lg:gap-2"><span>#</span><span>品项 / 规格 / 描述</span><span>数量</span><span>未税售价</span><span>含税成本</span></div>
              <div className="max-h-[360px] divide-y overflow-y-auto border">
                {previewItems.map((item, index) => (
                  <div key={`${item.oemSpec}-${index}`} className="grid gap-2 px-3 py-3 lg:grid-cols-[44px_minmax(360px,1fr)_100px_150px_150px] lg:items-start">
                    <span className="text-sm text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0"><div className="break-words text-sm font-medium">{item.name || item.oemSpec || '未命名品项'}</div><div className="mt-1 break-words text-xs text-muted-foreground">{item.oemSpec || '-'} · {item.description || '-'}</div></div>
                    <div className="text-sm">数量 {item.qty || 1}</div>
                    <div className="text-sm tabular-nums">售价 {item.unitPrice == null ? '-' : `¥ ${money(item.unitPrice)}`}</div>
                    <div className="text-sm tabular-nums">成本 {item.costInclTax == null ? '-' : `¥ ${money(item.costInclTax)}`}</div>
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
