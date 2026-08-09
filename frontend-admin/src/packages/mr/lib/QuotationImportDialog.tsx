import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { AlertTriangle, Check, Download, FileSpreadsheet, ListChecks, Loader2, Pencil, SlidersHorizontal, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { downloadQuotation, importQuotations } from '../client'
import type { MrItem, MrOrder, QuotationFile, QuotationImportResult, QuotationSource } from '../types'
import { calculateForm, quotationDetailItems, salesSubtotal } from './form-logic'
import { AnimatedInteger, AnimatedMoney } from './mr-ui'

const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx', '.pdf']
type UploadRole = 'sales' | 'purchase'

function money(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function amount(value?: number | null) {
  return value === null || value === undefined ? '-' : `¥ ${money(value)}`
}

function includingTax(value: number | null | undefined, taxRate: number) {
  return value === null || value === undefined ? null : Number(value) * (1 + taxRate / 100)
}

function excludingTax(item: MrItem) {
  if (item.costExcludingTax !== null && item.costExcludingTax !== undefined) return item.costExcludingTax
  if (item.costInclTax === null || item.costInclTax === undefined || item.taxRate === null || item.taxRate === undefined) return null
  return Number(item.costInclTax) / (1 + Number(item.taxRate) / 100)
}

function sourceLabel(role: QuotationSource['role']) {
  return role === 'sales' ? '销售报价' : '供应商报价'
}

function recognitionMethodLabel(method?: string) {
  return method === 'excel_cells' ? 'Excel 单元格' : method === 'ocr_layout' ? 'OCR 坐标' : method === 'pdf_layout' ? 'PDF 坐标' : method === 'pdf_text' ? 'PDF 文字层' : '自动识别'
}

function confidenceLabel(confidence?: number | null, reviewCount = 0) {
  if (reviewCount > 0 || confidence == null || confidence < 70) return '需要核对'
  if (confidence < 90) return '中等置信度'
  return '高置信度'
}

function confidenceClass(confidence?: number | null, reviewCount = 0) {
  if (reviewCount > 0 || confidence == null || confidence < 70) return 'border-amber-300 bg-amber-50 text-amber-800'
  if (confidence < 90) return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function confidenceText(confidence?: number | null, reviewCount = 0) {
  const label = confidenceLabel(confidence, reviewCount)
  return reviewCount > 0 || confidence == null ? label : `${label} ${Math.round(confidence)}%`
}

function reviewFieldLabel(field: string) {
  return ({ description: '品名及描述', oemSpec: '原厂规格（根据供应商报价推断）', qty: '数量', unitPrice: '未税单价', extended: '未税小计' } as Record<string, string>)[field] || field
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
      <span className="text-xs text-muted-foreground">支持 .xls、.xlsx 和 .pdf；可一次选择多份文件。</span>
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

function ImportActivity({ saving }: { saving: boolean }) {
  const stages = saving ? ['留存附件', '写入品项', '计算金额'] : ['读取文件', '识别字段', '匹配品项']
  return (
    <div role="status" aria-live="polite" className="relative overflow-hidden rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1 gap-1 bg-primary/10">
        {stages.map((stage, index) => <span key={stage} className="h-full flex-1 animate-pulse bg-primary/70 motion-reduce:animate-none" style={{ animationDelay: `${index * 180}ms` }} />)}
      </div>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-sm">
          <FileSpreadsheet className="size-5 animate-pulse motion-reduce:animate-none" />
          <Loader2 className="absolute -inset-1 size-12 animate-spin opacity-40 motion-reduce:animate-none" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{saving ? '正在应用导入结果…' : '正在识别报价文件…'}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{saving ? '正在留存附件、写入品项并计算金额，请稍候。' : '正在解析文件、识别来源并匹配品项，请稍候。'}</div>
          <div aria-hidden="true" className="mt-3 flex flex-wrap gap-2">
            {stages.map((stage, index) => (
              <span key={stage} className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none" style={{ animationDelay: `${index * 140}ms` }} />
                {stage}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
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
  const [preview, setPreview] = useState<QuotationImportResult | null>(null)
  const [previewAnimationKey, setPreviewAnimationKey] = useState(0)
  const [draftItems, setDraftItems] = useState<MrItem[]>([])
  const [sourceVendors, setSourceVendors] = useState<Record<number, string>>({})
  const [editMode, setEditMode] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [batchSourceIndex, setBatchSourceIndex] = useState(0)
  const [batchFields, setBatchFields] = useState({ vendor: true, purchaseOrderNo: true, warrantyService: true, installBy: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const files = [...salesFiles, ...purchaseFiles]
  const roles: UploadRole[] = [...salesFiles.map(() => 'sales' as const), ...purchaseFiles.map(() => 'purchase' as const)]
  const effectivePricingMode = Number(pricingMode) || 0
  const invoiceTaxRate = String(invoiceType || '').startsWith('13%') ? 13 : 6
  useEffect(() => {
    setDraftItems(preview?.items || [])
    setSourceVendors(Object.fromEntries((preview?.sources || []).map((source) => [source.index, source.vendor || ''])))
    setSelectedRows(new Set())
    setBatchSourceIndex(0)
    setEditMode(false)
  }, [preview])
  const previewItems = useMemo(() => {
    if (!preview || !effectivePricingMode) return draftItems
    const salesTotal = preview.salesTotalExcludingTax ?? preview.sources.find((source) => source.role === 'sales')?.total ?? null
    return calculateForm({
      ...preview,
      pricingMode: effectivePricingMode,
      invoiceType: invoiceType || '',
      totalExcludingTax: salesTotal,
      items: effectivePricingMode === 3 ? quotationDetailItems(draftItems) : draftItems,
      installOptions: [],
    }).items || []
  }, [preview, draftItems, effectivePricingMode, invoiceType])
  const patchItem = (index: number, patch: Partial<MrItem>) => setDraftItems((current) => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    const reviewed = new Set(item.reviewFields || [])
    if (patch.name !== undefined || patch.description !== undefined) reviewed.delete('description')
    if (patch.qty !== undefined) reviewed.delete('qty')
    if (patch.unitPrice !== undefined || patch.quotedUnitPrice !== undefined) reviewed.delete('unitPrice')
    if (patch.costInclTax !== undefined) reviewed.delete('extended')
    const changedRecognitionField = ['name', 'description', 'qty', 'unitPrice', 'quotedUnitPrice', 'costInclTax'].some((field) => field in patch)
    return {
      ...item,
      ...patch,
      ...(patch.unitPrice !== undefined ? { quotedUnitPrice: patch.unitPrice } : {}),
      reviewFields: [...reviewed],
      validationMessages: changedRecognitionField ? [] : item.validationMessages,
      confidence: changedRecognitionField ? { ...(item.confidence || {}), overall: reviewed.size ? Number(item.confidence?.overall || 70) : 100 } : item.confidence,
      costReviewFields: patch.costInclTax !== undefined ? [] : item.costReviewFields,
    }
  }))
  const patchSourceVendor = (sourceIndex: number, vendor: string) => {
    setSourceVendors((current) => ({ ...current, [sourceIndex]: vendor }))
    const sourceName = preview?.sources.find((source) => source.index === sourceIndex)?.name
    if (sourceName) setDraftItems((current) => current.map((item) => ({
      ...item,
      ...(item.costSource === sourceName ? { vendor } : {}),
      matchCandidates: item.matchCandidates?.map((candidate) => candidate.costSource === sourceName ? { ...candidate, vendor } : candidate),
    })))
  }
  const applyBatch = () => {
    const source = previewItems[batchSourceIndex]
    if (!source || !selectedRows.size) return
    const fieldCount = Object.values(batchFields).filter(Boolean).length
    const affectedCount = [...selectedRows].filter((index) => index !== batchSourceIndex).length
    if (!fieldCount) return toast.info('请至少选择一个需要复制的字段')
    if (!affectedCount) return toast.info('请至少选择一个除复制来源外的目标品项')
    const patch: Partial<MrItem> = {}
    if (batchFields.vendor) patch.vendor = source.vendor
    if (batchFields.purchaseOrderNo) patch.purchaseOrderNo = source.purchaseOrderNo
    if (batchFields.warrantyService) patch.warrantyService = source.warrantyService
    if (batchFields.installBy) patch.installBy = source.installBy
    setDraftItems((current) => current.map((item, index) => selectedRows.has(index) && index !== batchSourceIndex ? { ...item, ...patch } : item))
    toast.success(`已将 ${fieldCount} 个字段应用至 ${affectedCount} 个品项`)
  }
  const taxConflictCount = String(invoiceType || '').startsWith('6%')
    ? previewItems.filter((item) => Number(item.taxRate) === 13).length
    : 0
  const ignoredSingleIntegrationItems = effectivePricingMode === 2 ? Math.max(0, previewItems.length - 2) : 0
  const appliedItemCount = previewItems.length
  const parse = async (nextSales: File[], nextPurchase: File[]) => {
    const nextFiles = [...nextSales, ...nextPurchase]
    const nextRoles: UploadRole[] = [...nextSales.map(() => 'sales' as const), ...nextPurchase.map(() => 'purchase' as const)]
    setPreview(null)
    setError('')
    if (!nextFiles.length) return
    setLoading(true)
    try {
      const parsed = await importQuotations(orderId, nextFiles, false, nextRoles)
      setPreview(parsed)
      setPreviewAnimationKey((current) => current + 1)
    } catch (err) {
      setError((err as Error).message || '报价文件解析失败')
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
      const saved = await importQuotations(orderId, files, true, roles, false)
      const editedSources = saved.sources.map((source) => ({ ...source, vendor: sourceVendors[source.index] ?? source.vendor }))
      onApply({ ...saved, items: previewItems, sources: editedSources }, effectivePricingMode)
      onOpenChange(false)
      setSalesFiles([])
      setPurchaseFiles([])
      setPreview(null)
    } catch (err) {
      setError((err as Error).message || '报价导入失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-h-[92vh] max-w-6xl overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>报价文件与品项导入</DialogTitle>
          <DialogDescription>请在左侧添加销售报价，在右侧添加供应商报价或采购订单。销售报价用于识别客户、销售金额、客户 P/O、交付与付款信息；供应商报价或采购订单用于匹配采购成本。</DialogDescription>
        </DialogHeader>

        {existingFiles.length ? (
          <section className="border-y py-3">
            <div className="mb-2 text-sm font-medium">已留存的报价文件</div>
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
          <div className="grid gap-3 md:grid-cols-2">
            <FileDropZone title="销售报价" hint="用于识别客户、销售金额、客户 P/O、交付与付款信息" files={salesFiles} onFiles={(next) => updateFiles('sales', next)} />
            <FileDropZone title="供应商报价或采购订单" hint="用于匹配各品项的采购成本；可添加多家供应商文件" files={purchaseFiles} onFiles={(next) => updateFiles('purchase', next)} />
          </div>
        ) : null}

        {loading ? <ImportActivity saving={Boolean(preview)} /> : null}
        {files.length ? <div className="text-sm text-muted-foreground">已选择 {files.length} 份来源文件，其中销售报价 {salesFiles.length} 份、采购来源文件 {purchaseFiles.length} 份。</div> : null}
        {error ? <div className="border-l-4 border-destructive bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

        {preview ? (
          <div key={previewAnimationKey} className="space-y-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">自动识别结果</h3><span className="text-xs text-muted-foreground">系统优先根据文件分组判定来源；异常字段将标记为待核对。</span></div>
              {preview.metadata?.matchedCustomer ? (
                <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">已匹配客户档案：{preview.metadata.matchedCustomer.code ? `${preview.metadata.matchedCustomer.code} · ` : ''}{preview.metadata.matchedCustomer.name}{preview.metadata.matchedCustomer.contacts?.length ? `（${preview.metadata.matchedCustomer.contacts.length} 位联系人）` : ''}</div>
              ) : preview.metadata?.customer ? (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">报价中的客户“{preview.metadata.customer}”未匹配到客户档案；导入后请手动选择。</div>
              ) : null}
              <div className="hidden border-x border-t bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[120px_minmax(240px,1fr)_minmax(220px,280px)_150px_80px] lg:gap-3"><span>来源类型</span><span>文件</span><span>识别供应商</span><span>识别金额</span><span>品项数</span></div>
              <div className="divide-y border">
                {preview.sources.map((source) => (
                  <div key={`${source.index}-${source.name}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[120px_minmax(240px,1fr)_minmax(220px,280px)_150px_80px] sm:items-center sm:gap-3">
                    <span className={source.role === 'sales' ? 'font-medium text-emerald-700' : 'font-medium text-blue-700'}>{sourceLabel(source.role)}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" title={source.name}>{source.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{recognitionMethodLabel(source.method)}</span>
                        <span className={`border px-1.5 py-0.5 ${confidenceClass(source.confidence, source.reviewCount)}`}>字段提取：{confidenceText(source.confidence, source.reviewCount)}</span>
                        {source.reviewCount ? <span>{source.reviewCount} 个字段待核对</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">确认导入后，原始文件将随 MR 申请一并留存。</div>
                    </div>
                    <div className="min-w-0">
                      {source.role === 'purchase' ? <Input value={sourceVendors[source.index] ?? source.vendor ?? ''} placeholder="未识别；请手动填写供应商" onChange={(event) => patchSourceVendor(source.index, event.target.value)} /> : <span className="text-sm text-muted-foreground">{source.vendor || '不适用'}</span>}
                    </div>
                    <div className="text-sm tabular-nums">
                      <div><AnimatedMoney value={source.total} animationKey={previewAnimationKey} /></div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{source.taxIncluded === null || source.taxIncluded === undefined ? '计税口径未识别' : source.taxIncluded ? '含税金额' : '不含税金额'}</div>
                    </div>
                    <div className="text-sm text-muted-foreground"><AnimatedInteger value={source.itemCount} animationKey={previewAnimationKey} /> 个品项</div>
                  </div>
                ))}
              </div>
              </section>
            {preview.warnings.length || taxConflictCount || ignoredSingleIntegrationItems ? (
              <div className="border-l-4 border-amber-500 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />需要人工核对</div>
                {preview.warnings.map((warning) => <div key={warning}>· {warning}</div>)}
                {taxConflictCount ? <div>· 当前所选发票类型的适用税率为 6%，但有 {taxConflictCount} 个品项识别出的采购税率为 13%；确认导入后，系统将按既定规则调整为 6%。</div> : null}
                {ignoredSingleIntegrationItems ? <div>· 当前采用单项系统集成模式，仅导入首个品项作为主项；其余 {ignoredSingleIntegrationItems} 个品项将不予导入，系统将自动生成“技术服务”项。</div> : null}
              </div>
            ) : null}

            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium">识别出的报价品项（<AnimatedInteger value={previewItems.length} animationKey={previewAnimationKey} /> 个）</h3><span className="text-xs text-muted-foreground">销售金额及采购成本均以不含税金额为核算口径，并列示含税金额供核对。</span></div><Button type="button" variant={editMode ? 'secondary' : 'outline'} size="sm" onClick={() => { setEditMode((value) => !value); setSelectedRows(new Set()) }}><Pencil className="mr-2 size-4" />{editMode ? '完成校对' : '校对品项'}</Button></div>
              {editMode && selectedRows.size ? (
                <div className="mb-3 grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[180px_1fr] md:items-center">
                  <label className="text-sm font-medium" htmlFor="quotation-batch-source">复制来源</label>
                  <div className="flex flex-wrap gap-2"><select id="quotation-batch-source" className="h-9 min-w-56 border bg-background px-3 text-sm" value={batchSourceIndex} onChange={(event) => setBatchSourceIndex(Number(event.target.value))}>{previewItems.map((item, index) => <option key={`${item.oemSpec}-${index}`} value={index}>{index + 1} · {item.name || item.oemSpec || '未命名品项'}</option>)}</select><Button type="button" size="sm" onClick={applyBatch}><Check className="mr-2 size-4" />应用至 {selectedRows.size} 个品项</Button></div>
                  <span className="text-xs text-muted-foreground">复制字段</span>
                  <div className="flex flex-wrap gap-4">{(['vendor', 'purchaseOrderNo', 'warrantyService', 'installBy'] as const).map((field) => <label key={field} className="flex items-center gap-2 text-sm"><Checkbox checked={batchFields[field]} onCheckedChange={(checked) => setBatchFields((current) => ({ ...current, [field]: Boolean(checked) }))} />{{ vendor: '供应商', purchaseOrderNo: '采购订单号', warrantyService: '保固与服务', installBy: '品项装机方' }[field]}</label>)}</div>
                </div>
              ) : null}
              <div className="max-h-[480px] divide-y overflow-y-auto border">
                {previewItems.map((item, index) => (
                  <div key={`${item.oemSpec}-${index}`} className={`px-3 py-3 ${editMode && selectedRows.has(index) ? 'bg-primary/5' : ''}`}>
                    {editMode ? (
                      <div className="flex gap-3">
                        <div className="flex shrink-0 items-start gap-2 pt-2"><Checkbox checked={selectedRows.has(index)} onCheckedChange={(checked) => setSelectedRows((current) => { const next = new Set(current); checked ? next.add(index) : next.delete(index); return next })} /><span className="text-sm text-muted-foreground">{index + 1}</span></div>
                        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                          <Textarea className={`md:col-span-2 xl:col-span-2 ${item.reviewFields?.includes('description') ? 'border-amber-500' : ''}`} rows={2} value={item.description || item.name || ''} aria-label={`第 ${index + 1} 项品名及描述`} onChange={(event) => { const value = event.target.value; patchItem(index, { name: value.split(/\r?\n/)[0] || value, description: value }) }} />
                          <Input className={item.reviewFields?.includes('qty') ? 'border-amber-500' : ''} type="number" min={1} step={1} value={item.qty ?? ''} placeholder="数量" aria-label={`第 ${index + 1} 项数量`} onChange={(event) => patchItem(index, { qty: event.target.value === '' ? null : Number(event.target.value) })} />
                          <Input className={item.reviewFields?.includes('unitPrice') ? 'border-amber-500' : ''} type="number" min={0} step="0.01" value={item.quotedUnitPrice ?? item.unitPrice ?? ''} placeholder="未税单价" aria-label={`第 ${index + 1} 项未税单价`} onChange={(event) => patchItem(index, { unitPrice: event.target.value === '' ? null : Number(event.target.value) })} />
                          <Input className={item.costReviewFields?.length ? 'border-amber-500' : ''} type="number" min={0} step="0.01" value={item.costInclTax ?? ''} placeholder="采购成本（含税）" aria-label={`第 ${index + 1} 项采购成本（含税）`} onChange={(event) => patchItem(index, { costInclTax: event.target.value === '' ? null : Number(event.target.value) })} />
                          <Input value={item.oemSpec || ''} placeholder="原厂规格" aria-label={`第 ${index + 1} 项原厂规格`} onChange={(event) => patchItem(index, { oemSpec: event.target.value })} />
                          <Input value={item.vendor || ''} placeholder="供应商" aria-label={`第 ${index + 1} 项供应商`} onChange={(event) => patchItem(index, { vendor: event.target.value })} />
                          <Input value={item.purchaseOrderNo || ''} placeholder="采购订单号" aria-label={`第 ${index + 1} 项采购订单号`} onChange={(event) => patchItem(index, { purchaseOrderNo: event.target.value })} />
                          <Input value={item.warrantyService || ''} placeholder="保固与服务" aria-label={`第 ${index + 1} 项保固与服务`} onChange={(event) => patchItem(index, { warrantyService: event.target.value })} />
                          <Input className="md:col-span-2" value={item.installBy || ''} placeholder="品项装机方" aria-label={`第 ${index + 1} 项品项装机方`} onChange={(event) => patchItem(index, { installBy: event.target.value })} />
                          {(item.reviewFields?.length || item.validationMessages?.length) ? <div className="md:col-span-2 xl:col-span-4 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">需要核对：{item.validationMessages?.join('；') || item.reviewFields?.map(reviewFieldLabel).join('、')}</div> : null}
                          {item.matchCandidates?.length ? (
                            <div className="space-y-2 md:col-span-2 xl:col-span-4 rounded border border-blue-200 bg-blue-50 p-3">
                              <div className="text-xs font-medium text-blue-900">采购成本候选（未自动采用）</div>
                              {item.matchCandidates.map((candidate, candidateIndex) => (
                                <div key={`${candidate.costSource}-${candidateIndex}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 pt-2 text-xs text-blue-900">
                                  <span>{candidate.vendor || '供应商未识别'} · {candidate.description} · ¥ {money(candidate.costInclTax)} · 相似度 {candidate.score}%</span>
                                  <div className="flex items-center gap-2">
                                    <Select value={candidate.taxRate ? String(candidate.taxRate) : ''} onValueChange={(value) => patchItem(index, { matchCandidates: item.matchCandidates?.map((entry, entryIndex) => entryIndex === candidateIndex ? { ...entry, taxRate: Number(value) } : entry) })}>
                                      <SelectTrigger className="h-8 w-28 bg-background"><SelectValue placeholder="采购税率" /></SelectTrigger>
                                      <SelectContent><SelectItem value="6">采购税率 6%</SelectItem><SelectItem value="13">采购税率 13%</SelectItem></SelectContent>
                                    </Select>
                                    <Button type="button" size="sm" variant="outline" disabled={!candidate.taxRate} onClick={() => { if (!candidate.taxRate) return; patchItem(index, { vendor: candidate.vendor, costInclTax: candidate.costInclTax, taxRate: candidate.taxRate, costSource: candidate.costSource, matchCandidates: [] }) }}>采用候选成本</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2 lg:grid-cols-[44px_minmax(320px,1fr)_90px_190px_190px] lg:items-start">
                        <span className="text-sm text-muted-foreground">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-words text-sm font-medium">{item.name || item.oemSpec || '未命名品项'}</span>
                            {item.confidence ? <span className={`border px-1.5 py-0.5 text-xs ${confidenceClass(item.confidence.overall, item.reviewFields?.length || 0)}`}>{confidenceText(item.confidence.overall, item.reviewFields?.length || 0)}</span> : null}
                          </div>
                          <div className="mt-1 break-words text-xs text-muted-foreground">{item.oemSpec || '-'} · {item.description || '-'}</div>
                          <div className="mt-1 text-xs text-muted-foreground">供应商：{item.vendor || '-'} · 保固与服务：{item.warrantyService || '-'}</div>
                          {item.reviewFields?.length ? <div className="mt-1 text-xs text-amber-700">待核对：{item.reviewFields.map(reviewFieldLabel).join('、')}</div> : null}
                          {item.matchCandidates?.length ? <div className="mt-1 text-xs text-blue-700">存在 {item.matchCandidates.length} 个采购成本候选；请进入品项校对后确认。</div> : null}
                        </div>
                        <div className={item.reviewFields?.includes('qty') ? 'text-sm font-medium text-amber-700' : 'text-sm'}>数量 {item.qty || 1}</div>
                        <div className={item.reviewFields?.includes('unitPrice') ? 'text-sm font-medium text-amber-700 tabular-nums' : 'text-sm tabular-nums'}>
                          <div>未税小计 {amount(salesSubtotal(item))}</div>
                          <div className="mt-1 text-xs text-muted-foreground">含税小计 {amount(includingTax(salesSubtotal(item), invoiceTaxRate))}</div>
                        </div>
                        <div className={item.costReviewFields?.length ? 'text-sm font-medium text-amber-700 tabular-nums' : 'text-sm tabular-nums'}>
                          <div>采购成本（不含税） {amount(excludingTax(item))}</div>
                          <div className="mt-1 text-xs text-muted-foreground">采购成本（含税） {amount(item.costInclTax)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          {editable ? <Button disabled={!preview || loading} onClick={() => void apply()}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}确认导入 {appliedItemCount} 个品项</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
