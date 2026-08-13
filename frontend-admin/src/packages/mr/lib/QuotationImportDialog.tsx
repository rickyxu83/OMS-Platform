import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { AlertTriangle, Check, Download, FileSpreadsheet, ListChecks, Loader2, Pencil, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { deleteQuotationFile, downloadQuotation, getImportProgress, importQuotations, persistQuotations } from '../client'
import { RecognitionProgressPanel, type RecognitionProgress } from './RecognitionProgressPanel'
import type { MrItem, MrOrder, QuotationFile, QuotationImportResult, QuotationSource, VendorOption } from '../types'
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
  return method === 'excel_cells' ? 'Excel 单元格' : method === 'ocr_layout' ? 'OCR 坐标' : method === 'pdf_layout' ? 'PDF 坐标' : method === 'pdf_text' ? 'PDF 文字层' : method === 'ai_vision' ? 'AI 视觉识别' : method === 'ai_text' ? 'AI 文本识别' : '自动识别'
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

const IMPORT_STAGE_LABELS: Record<string, string> = {
  parsing: '系统解析文件结构',
  cache: '复用历史识别结果',
  rendering: '渲染报价页为图片',
  ai: 'AI 识别中（通常 10-30 秒）',
  ocr: 'OCR 文字识别中',
  normalizing: '跨文件匹配品项实体',
  merging: '汇总识别结果',
}

function importStageIndex(stage?: string) {
  if (!stage) return 0
  if (stage === 'rendering' || stage === 'parsing' || stage === 'cache') return 0
  if (stage === 'normalizing' || stage === 'merging') return 2
  return 1
}

function ImportActivity({ saving, fileCount = 1, progress }: { saving: boolean; fileCount?: number; progress?: RecognitionProgress | null }) {
  const stages = saving ? ['留存附件', '写入品项', '计算金额'] : ['读取文件', '识别字段', '匹配品项']
  const activeIndex = saving ? 1 : importStageIndex(progress?.stage)
  const stageLabel = progress?.stage ? IMPORT_STAGE_LABELS[progress.stage] || progress.stage : ''
  const waitingHint = saving
    ? '正在留存附件、写入品项并计算金额，请稍候。'
    : progress && progress.total > 0
      ? `正在识别报价文件（第 ${progress.done}/${progress.total} 份${progress.current ? `，当前：${progress.current}` : ''}）${stageLabel ? ` · ${stageLabel}` : ''}，识别完成前请勿刷新或关闭页面。`
      : fileCount > 1
        ? `共 ${fileCount} 份文件并行识别中，AI 识别通常约需 15-40 秒，识别完成前请勿刷新或关闭页面。`
        : 'AI 识别通常约需 10-30 秒，识别完成前请勿刷新或关闭页面。'
  return (
    <div role="status" aria-live="polite" className="relative overflow-hidden rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1 gap-1 bg-primary/10">
        {stages.map((stage, index) => <span key={stage} className={`h-full flex-1 ${index <= activeIndex ? 'animate-pulse bg-primary/70 motion-reduce:animate-none' : 'bg-primary/20'}`} style={{ animationDelay: `${index * 180}ms` }} />)}
      </div>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-sm">
          <FileSpreadsheet className="size-5 animate-pulse motion-reduce:animate-none" />
          <Loader2 className="absolute -inset-1 size-12 animate-spin opacity-40 motion-reduce:animate-none" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{saving ? '正在应用导入结果…' : '正在识别报价文件…'}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{waitingHint}</div>
          <div aria-hidden="true" className="mt-3 flex flex-wrap gap-2">
            {stages.map((stage, index) => (
              <span key={stage} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${index === activeIndex ? 'border-primary/40 bg-primary/10 text-primary' : index < activeIndex ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'bg-background/80 text-muted-foreground'}`}>
                {index < activeIndex
                  ? <Check className="size-3" />
                  : <span className={`size-1.5 rounded-full bg-primary ${index === activeIndex ? 'animate-bounce motion-reduce:animate-none' : 'opacity-40'}`} style={{ animationDelay: `${index * 140}ms` }} />}
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
  vendors = [],
  onOpenChange,
  onApply,
  onStoredFilesChange,
  onLinkedItemsRemoved,
}: {
  orderId: string | number
  open: boolean
  editable: boolean
  invoiceType?: string | null
  pricingMode?: number | null
  existingFiles: QuotationFile[]
  vendors?: VendorOption[]
  onOpenChange: (open: boolean) => void
  onApply: (result: QuotationImportResult, pricingMode: number) => void
  onStoredFilesChange?: (files: QuotationFile[]) => void
  /** 删除留存文件后通知外层同步移除该文件导入的品项（后端已联动删除，避免外层保存时写回） */
  onLinkedItemsRemoved?: (fileName: string, removedItems: number) => void
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
  const [progress, setProgress] = useState<RecognitionProgress | null>(null)
  const saving = Boolean(preview)
  const [deletingFileId, setDeletingFileId] = useState<string | number | null>(null)
  const [removedStoredIds, setRemovedStoredIds] = useState<Set<string | number>>(new Set())
  const parseSeqRef = useRef(0)
  const storedFiles = existingFiles.filter((file) => !removedStoredIds.has(file.id))
  const storedSalesFiles = storedFiles.filter((file) => file.quoteRole === 'quote_sales')
  const storedPurchaseFiles = storedFiles.filter((file) => file.quoteRole !== 'quote_sales')
  const renderStoredFile = (file: QuotationFile) => (
    <div key={file.id} className="flex min-w-0 items-center justify-between gap-2 border bg-muted/40 px-2 py-1 text-xs">
      <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="text-muted-foreground">已留存</span>
        <button type="button" aria-label={`下载 ${file.name}`} onClick={() => void downloadQuotation(orderId, file.id, file.name)} className="p-1 text-muted-foreground hover:text-foreground">
          <Download className="size-3.5" />
        </button>
        {editable ? (
          <button type="button" aria-label={`删除 ${file.name}`} disabled={deletingFileId === file.id} onClick={() => void removeStoredFile(file)} className="p-1 text-muted-foreground hover:text-destructive">
            {deletingFileId === file.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        ) : null}
      </span>
    </div>
  )
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
  const purchaseOnlyCandidates = previewItems.filter((item) => item.purchaseOnly)
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
      costReviewFields: (patch.costInclTax !== undefined || patch.taxRate !== undefined) ? [] : item.costReviewFields,
    }
  }))
  const removeItem = (index: number) => {
    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setSelectedRows(new Set())
  }
  const adoptCost = (index: number, candidateIndex: number) => {
    const candidate = previewItems[candidateIndex]
    if (!candidate) return
    const target = previewItems[index]
    patchItem(index, {
      vendor: candidate.vendor || target?.vendor || '',
      costInclTax: candidate.costInclTax,
      taxRate: candidate.taxRate || target?.taxRate || 13,
      costSource: candidate.costSource || '',
      matchCandidates: [],
    })
    toast.success(`已关联供应商品项成本 ¥ ${money(candidate.costInclTax)}${candidate.vendor ? `（${candidate.vendor}）` : ''}；如不再需要该供应商品项，可手动删除`)
  }
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
    // 保留已有预览直到新结果回来，避免追加文件时下方内容被清空
    if (!nextFiles.length && !storedFiles.length) setPreview(null)
    setError('')
    if (!nextFiles.length && !storedFiles.length) { setLoading(false); return }
    const seq = ++parseSeqRef.current
    setLoading(true)
    const taskId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    const poll = setInterval(() => {
      if (seq !== parseSeqRef.current) return
      void getImportProgress(taskId).then((next) => {
        if (seq === parseSeqRef.current && next.total > 0) setProgress(next)
      }).catch(() => { /* 进度接口暂不可用则保持通用提示 */ })
    }, 1200)
    try {
      const parsed = await importQuotations(orderId, nextFiles, false, nextRoles, false, taskId, storedFiles.length > 0)
      if (seq !== parseSeqRef.current) return
      setPreview(parsed)
      setPreviewAnimationKey((current) => current + 1)
    } catch (err) {
      if (seq === parseSeqRef.current) setError((err as Error).message || '报价文件解析失败')
    } finally {
      clearInterval(poll)
      if (seq === parseSeqRef.current) {
        setLoading(false)
        setProgress(null)
      }
    }
  }

  // 再次打开弹窗时自动载入留存文件的识别结果（缓存命中秒回），避免空列表只剩一行留存附件
  useEffect(() => {
    if (!open || !editable) return
    if (!storedFiles.length || salesFiles.length || purchaseFiles.length || preview || loading) return
    void parse([], [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const applyLocalRemoval = (removedNames: string[]) => {
    setPreview((current) => {
      if (!current) return current
      const removed = new Set(removedNames)
      const sources = (current.sources || []).filter((source) => !removed.has(source.name))
      const items = (current.items || [])
        .filter((item) => !(item.salesSource && removed.has(item.salesSource)))
        .filter((item) => !(item.purchaseOnly && item.costSource && removed.has(item.costSource)))
        .map((item) => {
          if (!item.costSource || !removed.has(item.costSource)) return item
          return { ...item, vendor: '', costInclTax: null, costSource: '' }
        })
      const warnings = (current.warnings || []).filter((warning) => !removedNames.some((name) => warning.includes(name)))
      return { ...current, sources, items, warnings }
    })
    toast.success('已取消该文件的识别结果，其余文件的识别结果已保留，无需重新识别')
  }

  const updateFiles = (role: UploadRole, next: File[]) => {
    const prevAll = [...salesFiles, ...purchaseFiles]
    const nextSales = role === 'sales' ? next : salesFiles
    const nextPurchase = role === 'purchase' ? next : purchaseFiles
    const nextAll = [...nextSales, ...nextPurchase]
    const nextNames = new Set(nextAll.map((file) => file.name))
    const removedNames = prevAll.filter((file) => !nextNames.has(file.name)).map((file) => file.name)
    if (role === 'sales') setSalesFiles(next)
    else setPurchaseFiles(next)
    if (removedNames.length && nextAll.length && preview) {
      applyLocalRemoval(removedNames)
      return
    }
    void parse(nextSales, nextPurchase)
  }

  const removeStoredFile = async (file: QuotationFile) => {
    if (!window.confirm(`确定删除留存的报价文件「${file.name}」吗？该文件的识别结果将一并从当前预览中移除，已导入的关联品项也会同步移除。`)) return
    setDeletingFileId(file.id)
    try {
      const result = await deleteQuotationFile(orderId, file.id)
      setRemovedStoredIds((current) => new Set([...current, file.id]))
      onStoredFilesChange?.(result.files)
      onLinkedItemsRemoved?.(file.name, result.removedItems || 0)
      applyLocalRemoval([file.name])
    } catch (err) {
      toast.error((err as Error).message || '删除报价文件失败')
    } finally {
      setDeletingFileId(null)
    }
  }

  const apply = async () => {
    if (!files.length || !preview) return
    setLoading(true)
    setError('')
    try {
      const sourceHashes = Object.fromEntries(
        (preview.sources || []).filter((source) => source.hash).map((source) => [source.name, String(source.hash)]),
      )
      const saved = await persistQuotations(orderId, files, roles, { correctedItems: previewItems, sourceHashes })
      const editedSources = (preview.sources || []).map((source) => ({ ...source, vendor: sourceVendors[source.index] ?? source.vendor }))
      onApply({ ...preview, items: previewItems, sources: editedSources, files: saved.files }, effectivePricingMode)
      if (saved.corrections && (saved.corrections.applied > 0 || saved.corrections.feedback > 0)) {
        toast.success(`已回写识别学习：${saved.corrections.applied} 个文件应用修正，${saved.corrections.feedback} 份纠错样本已入库`)
      }
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
          <DialogDescription>请在左侧添加销售报价或客户订单，在右侧添加供应商报价。销售报价/客户订单用于识别客户、销售金额、客户 P/O、交付与付款信息；供应商报价用于匹配采购成本。未匹配到销售报价的供应商报价品项（如补充给客户的项目）会作为待填售价品项一并导入，导入后请在“校对品项”中填写售价。</DialogDescription>
        </DialogHeader>

        {!editable && storedFiles.length ? (
          <section className="border-y py-3">
            <div className="mb-2 text-sm font-medium">已留存的报价文件</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {storedFiles.map((file) => (
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
            <div>
              <FileDropZone title="销售报价/客户订单" hint="用于识别客户、销售金额、客户 P/O、交付与付款信息" files={salesFiles} onFiles={(next) => updateFiles('sales', next)} />
              {storedSalesFiles.length ? <div className="mt-1 space-y-1">{storedSalesFiles.map(renderStoredFile)}</div> : null}
            </div>
            <div>
              <FileDropZone title="供应商报价" hint="用于匹配各品项的采购成本；可添加多家供应商文件" files={purchaseFiles} onFiles={(next) => updateFiles('purchase', next)} />
              {storedPurchaseFiles.length ? <div className="mt-1 space-y-1">{storedPurchaseFiles.map(renderStoredFile)}</div> : null}
            </div>
          </div>
        ) : null}

                {loading ? (saving ? <ImportActivity saving fileCount={files.length} progress={progress} /> : <RecognitionProgressPanel progress={progress} fileCount={files.length} />) : null}
        {files.length ? <div className="text-sm text-muted-foreground">已选择 {files.length} 份来源文件，其中销售报价 {salesFiles.length} 份、采购来源文件 {purchaseFiles.length} 份。</div> : null}
        {error ? <div className="border-l-4 border-destructive bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

        {preview ? (
          <div key={previewAnimationKey} className={`space-y-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
        <datalist id="mr-import-vendor-options">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>
            <section>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">自动识别结果</h3><span className="text-xs text-muted-foreground">系统优先根据文件分组判定来源；未匹配到销售报价的供应商报价品项将导入为待填售价品项，售价需在导入后填写。</span></div>
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
                      {source.role === 'purchase' ? <Input list="mr-import-vendor-options" value={sourceVendors[source.index] ?? source.vendor ?? ''} placeholder="未识别；请从下拉选择或手动填写供应商" onChange={(event) => patchSourceVendor(source.index, event.target.value)} /> : <span className="text-sm text-muted-foreground">{source.vendor || '不适用'}</span>}
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
                        <div className="flex shrink-0 flex-col items-center gap-2 pt-2">
                          <Checkbox checked={selectedRows.has(index)} onCheckedChange={(checked) => setSelectedRows((current) => { const next = new Set(current); checked ? next.add(index) : next.delete(index); return next })} />
                          <span className="text-sm text-muted-foreground">{index + 1}</span>
                        </div>
                        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3">
                          <Textarea className={`md:col-span-3 ${item.reviewFields?.includes('description') ? 'border-amber-500' : ''}`} rows={2} value={item.description || item.name || ''} placeholder="品名 + 规格型号 / 服务描述" aria-label={`第 ${index + 1} 项品名及描述`} onChange={(event) => { const value = event.target.value; patchItem(index, { name: value.split(/\r?\n/)[0] || value, description: value }) }} />
                          <Input className={item.reviewFields?.includes('qty') ? 'border-amber-500' : ''} type="number" min={0} step={0.01} value={item.qty ?? ''} placeholder="数量" aria-label={`第 ${index + 1} 项数量`} onChange={(event) => patchItem(index, { qty: event.target.value === '' ? null : Number(event.target.value) })} />
                          <Input className={item.reviewFields?.includes('unitPrice') ? 'border-amber-500' : ''} type="number" min={0} step="0.01" value={item.quotedUnitPrice ?? item.unitPrice ?? ''} placeholder="未税单价" aria-label={`第 ${index + 1} 项未税单价`} onChange={(event) => patchItem(index, { unitPrice: event.target.value === '' ? null : Number(event.target.value) })} />
                          <Input className={item.costReviewFields?.length ? 'border-amber-500' : ''} type="number" min={0} step="0.01" value={item.costInclTax ?? ''} placeholder="采购成本（含税）" aria-label={`第 ${index + 1} 项采购成本（含税）`} onChange={(event) => patchItem(index, { costInclTax: event.target.value === '' ? null : Number(event.target.value) })} />
                          <Select value={String(invoiceTaxRate === 6 ? 6 : (item.taxRate ?? 13))} disabled={invoiceTaxRate === 6} onValueChange={(value) => patchItem(index, { taxRate: Number(value) })}>
                            <SelectTrigger aria-label={`第 ${index + 1} 项采购税率`} title={invoiceTaxRate === 6 ? '当前发票类型的适用税率为 6%，采购税率固定为 6%' : undefined}><SelectValue placeholder="采购税率" /></SelectTrigger>
                            <SelectContent><SelectItem value="13">采购税率 13%</SelectItem><SelectItem value="6">采购税率 6%</SelectItem></SelectContent>
                          </Select>
                          <Input value={item.oemSpec || ''} placeholder="原厂/OEM 规格型号，选填" aria-label={`第 ${index + 1} 项原厂规格`} onChange={(event) => patchItem(index, { oemSpec: event.target.value })} />
                          <Input list="mr-import-vendor-options" value={item.vendor || ''} placeholder="供应商完整名称，选填" aria-label={`第 ${index + 1} 项供应商`} onChange={(event) => patchItem(index, { vendor: event.target.value })} />
                          <Input value={item.purchaseOrderNo || ''} placeholder="向供应商下单的 PO 编号，选填" aria-label={`第 ${index + 1} 项采购订单号`} onChange={(event) => patchItem(index, { purchaseOrderNo: event.target.value })} />
                          <Input value={item.warrantyService || ''} placeholder="如：一年保固 / 三年上门" aria-label={`第 ${index + 1} 项保固与服务`} onChange={(event) => patchItem(index, { warrantyService: event.target.value })} />
                          <Input value={item.installBy || ''} placeholder="如：敦阳 / 供应商 / 第三方" aria-label={`第 ${index + 1} 项品项装机方`} onChange={(event) => patchItem(index, { installBy: event.target.value })} />
                          {!item.purchaseOnly && item.costInclTax == null && purchaseOnlyCandidates.length ? (
                            <div className="md:col-span-3">
                              <Select onValueChange={(value) => adoptCost(index, Number(value))}>
                                <SelectTrigger className="w-full bg-background"><SelectValue placeholder="未匹配到采购成本：从供应商品项选择关联" /></SelectTrigger>
                                <SelectContent>{purchaseOnlyCandidates.map((candidate, candidateIndex) => (
                                  <SelectItem key={`${candidate.costSource}-${candidateIndex}`} value={String(candidateIndex)}>{candidate.name || candidate.oemSpec || candidate.description || '供应商品项'} · ¥ {money(candidate.costInclTax)}{candidate.vendor ? ` · ${candidate.vendor}` : ''}</SelectItem>
                                ))}</SelectContent>
                              </Select>
                            </div>
                          ) : null}
                          {(item.reviewFields?.length || item.validationMessages?.length) ? <div className="md:col-span-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">需要核对：{item.validationMessages?.join('；') || item.reviewFields?.map(reviewFieldLabel).join('、')}</div> : null}
                          {item.matchCandidates?.length ? (
                            <div className="space-y-2 md:col-span-3 rounded border border-blue-200 bg-blue-50 p-3">
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
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground md:col-span-3">
                            <span>采购成本（不含税） <b className="text-foreground">{amount(excludingTax(item))}</b></span>
                            {item.costSource ? <span>成本来源 {item.costSource}</span> : null}
                            {item.vendor && vendors.some((vendor) => vendor.name === item.vendor) ? <span className="text-emerald-700">已关联 OMS 供应商目录</span> : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2 lg:grid-cols-[56px_minmax(320px,1fr)_90px_190px_190px] lg:items-start">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Button type="button" variant="ghost" size="icon" disabled={!editable} className="size-6 text-destructive hover:text-destructive" aria-label={`删除第 ${index + 1} 项`} onClick={() => { if (window.confirm(`确定删除第 ${index + 1} 项「${item.name || item.oemSpec || '未命名品项'}」吗？`)) removeItem(index) }}><Trash2 className="size-3.5" /></Button>
                          {index + 1}
                        </span>
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
          {editable ? <Button disabled={!preview || loading || !files.length} title={!files.length && preview ? '当前为留存文件的识别结果，添加新文件后可再次导入；删除留存文件后其关联品项已联动移除，无需重新导入' : undefined} onClick={() => void apply()}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}确认导入 {appliedItemCount} 个品项</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
