import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type OfficePreviewType = 'docx' | 'xlsx'

/** 浏览器可在线预览的 Office 扩展名（docx 走 docx-preview；xls/xlsx 都由 SheetJS 解析，BIFF 二进制同样支持） */
export function officePreviewType(fileName: string): OfficePreviewType | null {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  return null
}

/** 客户端无法解析的格式（旧版 .doc 与 PPT 系）：只能提示后下载 */
export function isUnsupportedOfficeName(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return ['doc', 'ppt', 'pptx'].includes(ext)
}

/** docx-preview 默认样式补丁：页面包一层纸张感、表格加边框 */
const PREVIEW_STYLE = `
.office-preview .docx-wrapper { background: transparent; padding: 8px 0; }
.office-preview .docx-wrapper > section.docx { box-shadow: 0 1px 4px rgb(0 0 0 / 0.12); margin-bottom: 12px; }
.office-preview-xlsx table { border-collapse: collapse; font-size: 12px; background: #fff; }
.office-preview-xlsx td, .office-preview-xlsx th { border: 1px solid #d4d4d8; padding: 3px 8px; white-space: nowrap; }
.office-preview-xlsx td:empty { min-width: 40px; }
`

/**
 * Office 附件在线预览内容区（不带弹窗外壳，由调用方放进 Dialog）。
 * docx 走 docx-preview 高还原渲染；xlsx 用 SheetJS 转 HTML 表格，多工作表提供切换标签。
 * 两个库都按需动态加载，不进入首屏 bundle。
 */
export function OfficePreviewContent({ blob, fileName, type, className }: {
  blob: Blob
  fileName: string
  type: OfficePreviewType
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const workbookRef = useRef<import('xlsx').WorkBook | null>(null)

  // docx 渲染 / xlsx 解析（xlsx 只解析一次，切换工作表不重复读文件）
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSheetNames([])
    setActiveSheet('')
    workbookRef.current = null

    ;(async () => {
      try {
        if (type === 'docx') {
          const container = containerRef.current
          if (!container) return
          const { renderAsync } = await import('docx-preview')
          if (cancelled) return
          container.innerHTML = ''
          await renderAsync(await blob.arrayBuffer(), container, undefined, {
            className: 'docx',
            inWrapper: true,
            ignoreHeight: true,
            breakPages: true,
          })
        } else {
          const XLSX = await import('xlsx')
          if (cancelled) return
          const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
          if (!workbook.SheetNames.length) throw new Error('文件内没有可显示的工作表')
          workbookRef.current = workbook
          setSheetNames(workbook.SheetNames)
          setActiveSheet(workbook.SheetNames[0])
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '附件解析失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [blob, fileName, type])

  // xlsx 工作表切换：把当前工作表渲染成 HTML 表格
  useEffect(() => {
    if (type !== 'xlsx' || !activeSheet || !workbookRef.current) return
    const container = containerRef.current
    if (!container) return
    const sheet = workbookRef.current.Sheets[activeSheet]
    if (!sheet) return
    void import('xlsx').then((XLSX) => {
      container.innerHTML = XLSX.utils.sheet_to_html(sheet)
    }).catch(() => setError('工作表渲染失败'))
  }, [type, activeSheet])

  return (
    <div className={cn('office-preview flex min-h-[260px] flex-col', className)}>
      <style>{PREVIEW_STYLE}</style>
      {type === 'xlsx' && sheetNames.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {sheetNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveSheet(name)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                name === activeSheet
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <div className="flex min-h-[360px] flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="btn-loader" aria-hidden="true" />
          正在解析附件…
        </div>
      ) : error ? (
        <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-1 text-center text-sm text-destructive">
          <span>{type === 'docx' ? 'Word' : 'Excel'} 文件预览失败：{error}</span>
          <span className="text-muted-foreground">可点击下方按钮下载后用 Office/WPS 打开</span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={cn(
          'min-w-0 flex-1 overflow-auto rounded-lg',
          type === 'xlsx' ? 'office-preview-xlsx' : 'bg-muted/40 px-2 sm:px-4',
          loading || error ? 'hidden' : '',
        )}
      />
    </div>
  )
}
