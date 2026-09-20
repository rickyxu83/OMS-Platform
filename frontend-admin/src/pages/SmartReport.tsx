import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3, Bookmark, FileSpreadsheet, FileText, LineChart, Loader2,
  Mail, PieChart, Send, Sparkles, Table2, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { saveAs } from 'file-saver'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart as ReLineChart, Pie, PieChart as RePieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

/**
 * 智能报表（spec 014）：主管用大白话描述报表需求，AI 翻译成白名单报表定义，
 * 后端校验执行，页面展示表格 + 图表 + AI 摘要，支持导出 Excel/PDF、收藏模板与订阅推送。
 * AI 不写 SQL，只能用语义层预置的数据集/维度/指标。
 */

interface ReportColumn { key: string; label: string; kind: 'dimension' | 'metric' }
interface ReportSpec {
  dataset: string
  timeField: string
  timeRange: { type: string; value?: string; from?: string; to?: string }
  filters: Record<string, unknown>
  groupBy: string[]
  metrics: string[]
  chartType?: string | null
  compare?: { type: 'previous' | 'year_ago' } | null
}
interface CompareInfo { type: string; label: string; from: string; to: string }
interface PreviewState {
  spec: ReportSpec
  specText: string
  columns: ReportColumn[]
  rows: Array<Record<string, string | number>>
  total: number
  truncated: boolean
  summary: string
  compare?: CompareInfo | null
}
interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface ReportTemplate {
  id: number
  name: string
  spec: ReportSpec
  chartType: string | null
  subscription: { id: number; frequency: 'weekly' | 'monthly'; recipients: string; enabled: boolean; lastSentAt: string | null } | null
}

type ChartKind = 'table' | 'bar' | 'line' | 'pie'

const EXAMPLE_PROMPTS = [
  '上个月各工程师结了多少单？',
  '本月每位工程师的工时统计',
  '今年各客户的设备维保类型分布',
  '本季度各业务的 MR 单数和金额',
]

const CHART_LABELS: Record<ChartKind, string> = { table: '表格', bar: '柱状图', line: '折线图', pie: '饼图' }
const CHART_COLORS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#ec4899']

/** 指标数值千分位分组（大金额可读性）；非数值原样返回 */
function formatThousands(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value ?? '-')
  const [intPart, decPart] = String(num).split('.')
  const negative = intPart.startsWith('-')
  const grouped = (negative ? intPart.slice(1) : intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (negative ? '-' : '') + grouped + (decPart !== undefined ? `.${decPart}` : '')
}

/** 图表数据：维度值拼接为 name，第一个指标为 value */
function toChartData(preview: PreviewState) {
  const dimKeys = preview.columns.filter((c) => c.kind === 'dimension').map((c) => c.key)
  const metricKey = preview.columns.find((c) => c.kind === 'metric')?.key
  if (!metricKey) return { data: [], metricLabel: '' }
  const metricLabel = preview.columns.find((c) => c.key === metricKey)?.label || metricKey
  const data = preview.rows.slice(0, 30).map((row) => ({
    name: dimKeys.map((k) => String(row[k] ?? '')).join(' / ') || '合计',
    value: Number(row[metricKey]) || 0,
  }))
  return { data, metricLabel }
}

function defaultChartKind(spec: ReportSpec | null): ChartKind {
  if (!spec) return 'table'
  if (spec.chartType && ['bar', 'line', 'pie', 'table'].includes(spec.chartType)) return spec.chartType as ChartKind
  if (spec.groupBy.some((k) => ['month', 'week', 'day'].includes(k))) return 'line'
  return spec.groupBy.length ? 'bar' : 'table'
}

function ChartView({ preview, kind }: { preview: PreviewState; kind: ChartKind }) {
  const { data, metricLabel } = useMemo(() => toChartData(preview), [preview])
  if (!data.length) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">本期没有数据</div>
  }
  if (kind === 'pie') {
    const top = data.slice(0, 9)
    const rest = data.slice(9).reduce((sum, d) => sum + d.value, 0)
    const pieData = rest > 0 ? [...top, { name: '其他', value: rest }] : top
    return (
      <ResponsiveContainer width="100%" height={280}>
        <RePieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
            {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value) => [`${value}`, metricLabel]} />
        </RePieChart>
      </ResponsiveContainer>
    )
  }
  if (kind === 'line') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ReLineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" fontSize={11} tickLine={false} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(value) => [`${value}`, metricLabel]} />
          <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
        </ReLineChart>
      </ResponsiveContainer>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" fontSize={11} tickLine={false} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} />
        <Tooltip formatter={(value) => [`${value}`, metricLabel]} />
        <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SmartReport() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [chartKind, setChartKind] = useState<ChartKind>('table')
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [subTarget, setSubTarget] = useState<ReportTemplate | null>(null)
  const [subFrequency, setSubFrequency] = useState<'weekly' | 'monthly'>('weekly')
  const [subRecipients, setSubRecipients] = useState('')
  const [subEnabled, setSubEnabled] = useState(true)
  const [savingSub, setSavingSub] = useState(false)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const [runningTemplateId, setRunningTemplateId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const chartBoxRef = useRef<HTMLDivElement>(null)

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.get('/report/templates') as { items: ReportTemplate[] }
      setTemplates(data.items || [])
    } catch { /* 列表失败不阻塞主流程 */ }
  }, [])

  useEffect(() => { void loadTemplates() }, [loadTemplates])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [messages, sending])

  const applyResult = (result: any, assistantReply?: string) => {
    if (assistantReply !== undefined) {
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantReply }])
    }
    if (result?.spec) {
      setPreview({
        spec: result.spec,
        specText: result.specText || '',
        columns: result.columns || [],
        rows: result.rows || [],
        total: Number(result.total || 0),
        truncated: Boolean(result.truncated),
        summary: result.summary || '',
      })
      setChartKind(defaultChartKind(result.spec))
    }
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    try {
      const result = await api.post('/report/chat', { messages: nextMessages.slice(-12) })
      applyResult(result, String(result?.reply || ''))
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `出错了：${error?.message || '请求失败'}，请换个说法再试。` }])
    } finally {
      setSending(false)
    }
  }

  const runTemplate = async (template: ReportTemplate) => {
    if (runningTemplateId) return
    setRunningTemplateId(template.id)
    try {
      const result = await api.post('/report/preview', { spec: template.spec })
      applyResult(result)
      if (template.chartType) setChartKind(template.chartType as ChartKind)
      setMessages((prev) => [...prev, { role: 'assistant', content: `已运行报表「${template.name}」，结果为最新数据。` }])
    } catch (error: any) {
      toast.error(error?.message || '模板运行失败')
    } finally {
      setRunningTemplateId(null)
    }
  }

  const saveTemplate = async () => {
    const name = templateName.trim()
    if (!name || !preview) return
    setSavingTemplate(true)
    try {
      await api.post('/report/templates', { name, spec: preview.spec, chartType: chartKind })
      toast.success(`已收藏报表「${name}」`)
      setSaveOpen(false)
      setTemplateName('')
      await loadTemplates()
    } catch (error: any) {
      toast.error(error?.message || '保存失败')
    } finally {
      setSavingTemplate(false)
    }
  }

  const removeTemplate = async (template: ReportTemplate) => {
    try {
      await api.delete(`/report/templates/${template.id}`)
      toast.success(`已删除「${template.name}」`)
      await loadTemplates()
    } catch (error: any) {
      toast.error(error?.message || '删除失败')
    }
  }

  const openSubscribe = (template: ReportTemplate) => {
    setSubTarget(template)
    setSubFrequency(template.subscription?.frequency || 'weekly')
    setSubRecipients(template.subscription?.recipients || '')
    setSubEnabled(template.subscription ? template.subscription.enabled : true)
  }

  const saveSubscription = async () => {
    if (!subTarget) return
    setSavingSub(true)
    try {
      await api.put(`/report/templates/${subTarget.id}/subscription`, {
        frequency: subFrequency,
        recipients: subRecipients.trim(),
        enabled: subEnabled,
      })
      toast.success(subEnabled ? '订阅已保存，到点自动邮件推送' : '订阅已停用')
      setSubTarget(null)
      await loadTemplates()
    } catch (error: any) {
      toast.error(error?.message || '订阅保存失败')
    } finally {
      setSavingSub(false)
    }
  }

  const removeSubscription = async () => {
    if (!subTarget) return
    setSavingSub(true)
    try {
      await api.delete(`/report/templates/${subTarget.id}/subscription`)
      toast.success('订阅已取消')
      setSubTarget(null)
      await loadTemplates()
    } catch (error: any) {
      toast.error(error?.message || '操作失败')
    } finally {
      setSavingSub(false)
    }
  }

  /** 把当前图表（recharts SVG）截为 PNG dataURL，随导出嵌入 Excel/PDF */
  const captureChartPng = async (): Promise<string | null> => {
    const box = chartBoxRef.current
    const svg = box?.querySelector('svg')
    if (!box || !svg) return null
    try {
      const rect = box.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) return null
      const scale = 2 // 2 倍采样，导出文件里更清晰
      const xml = new XMLSerializer().serializeToString(svg)
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('chart image load failed'))
          image.src = url
        })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(rect.width * scale)
        canvas.height = Math.round(rect.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/png')
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      return null // 截图失败不阻塞导出
    }
  }

  const doExport = async (format: 'xlsx' | 'pdf') => {
    if (!preview || exporting) return
    setExporting(format)
    try {
      const chartImage = chartKind !== 'table' ? await captureChartPng() : null
      const blob = await api.downloadPost('/report/export', {
        spec: preview.spec,
        format,
        summary: preview.summary,
        chartImage,
      })
      const ext = format === 'pdf' ? 'pdf' : 'xlsx'
      saveAs(blob, `智能报表-${new Date().toISOString().slice(0, 10)}.${ext}`)
    } catch (error: any) {
      toast.error(error?.message || '导出失败')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:flex-row">
      {/* 左栏：我的报表 + 对话 */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[380px]">
        {templates.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Bookmark className="h-4 w-4 text-primary" /> 我的报表
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {templates.map((t) => (
                <div key={t.id} className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-accent">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                    onClick={() => void runTemplate(t)}
                    disabled={runningTemplateId === t.id}
                  >
                    {runningTemplateId === t.id
                      ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                      : <BarChart3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{t.name}</span>
                    {t.subscription?.enabled && <Mail className="h-3 w-3 shrink-0 text-primary" aria-label="已订阅" />}
                  </button>
                  <button type="button" className="rounded p-1 text-muted-foreground opacity-0 transition hover:text-primary group-hover:opacity-100" title="订阅推送" onClick={() => openSubscribe(t)}>
                    <Mail className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100" title="删除" onClick={() => void removeTemplate(t)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-[320px] flex-1 flex-col rounded-xl border border-border bg-card">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> 描述你想要的报表
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            <div className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">
              用大白话告诉我想看什么，比如：
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition hover:border-primary hover:text-primary"
                    onClick={() => void send(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
            {messages.map((message, i) => (
              <div key={i} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/60'
                }`}>
                  {message.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在生成报表…
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如：换成按客户分组 / 只看已结案的"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send(input) }}
              disabled={sending}
            />
            <Button size="icon" onClick={() => void send(input)} disabled={sending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 右栏：预览 */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
        {!preview ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 text-primary/40" />
            <p>在左侧描述想看的报表，这里会实时出结果</p>
            <p className="text-xs">支持工单、工时、考勤、巡检计划、设备、订购申请（MR）六类数据</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{preview.specText}</div>
                <div className="text-xs text-muted-foreground">
                  共 {preview.total} 行{preview.truncated ? '（已达预览上限，存在截断）' : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {(['table', 'bar', 'line', 'pie'] as ChartKind[]).map((kind) => {
                  const Icon = kind === 'table' ? Table2 : kind === 'bar' ? BarChart3 : kind === 'line' ? LineChart : PieChart
                  return (
                    <button
                      key={kind}
                      type="button"
                      title={CHART_LABELS[kind]}
                      className={`rounded-md p-1.5 transition ${chartKind === kind ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
                      onClick={() => setChartKind(kind)}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
              <Button variant="outline" size="sm" onClick={() => void doExport('xlsx')} disabled={exporting !== null}>
                {exporting === 'xlsx' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => void doExport('pdf')} disabled={exporting !== null}>
                {exporting === 'pdf' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
                PDF
              </Button>
              <Button size="sm" onClick={() => { setTemplateName(''); setSaveOpen(true) }}>
                <Bookmark className="mr-1 h-4 w-4" /> 收藏
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {preview.summary && (
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed">
                  <span className="mr-1 inline-flex items-center gap-1 font-medium text-primary"><Sparkles className="h-3.5 w-3.5" />AI 摘要</span>
                  <p className="mt-1">{preview.summary}</p>
                </div>
              )}

              {chartKind !== 'table' && (
                <div ref={chartBoxRef} className="mb-4 rounded-lg border border-border p-2">
                  <ChartView preview={preview} kind={chartKind} />
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {preview.columns.map((col) => (
                        <th key={col.key} className={`whitespace-nowrap px-3 py-2 font-medium ${col.kind === 'metric' ? 'text-right' : 'text-left'}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.length === 0 ? (
                      <tr><td colSpan={preview.columns.length} className="px-3 py-8 text-center text-muted-foreground">本期没有数据</td></tr>
                    ) : preview.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                        {preview.columns.map((col) => {
                          const raw = row[col.key]
                          const isPct = col.key.endsWith('__pct')
                          const isDelta = col.key.endsWith('__delta')
                          let content: React.ReactNode = col.kind === 'metric' ? formatThousands(raw) : (raw ?? '-')
                          let trendClass = ''
                          if (isPct || isDelta) {
                            const num = Number(raw)
                            if (Number.isFinite(num)) {
                              content = isPct ? `${num > 0 ? '+' : ''}${num}%` : (num > 0 ? `+${formatThousands(num)}` : formatThousands(num))
                              trendClass = num > 0 ? 'text-green-700 dark:text-green-400' : num < 0 ? 'text-red-700 dark:text-red-400' : ''
                            } else {
                              content = '-'
                            }
                          }
                          return (
                            <td key={col.key} className={`whitespace-nowrap px-3 py-2 ${col.kind === 'metric' ? 'text-right tabular-nums' : ''} ${trendClass}`}>
                              {content}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 收藏模板 */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>收藏为我的报表</DialogTitle>
            <DialogDescription>保存当前的统计口径，以后一键重跑，还可以订阅定时邮件推送。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-name">报表名称</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例如：月度工程师结案统计"
              maxLength={100}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveTemplate() }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>取消</Button>
            <Button onClick={() => void saveTemplate()} disabled={savingTemplate || !templateName.trim()}>
              {savingTemplate && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 订阅推送 */}
      <Dialog open={subTarget !== null} onOpenChange={(open) => { if (!open) setSubTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>订阅推送{subTarget ? `：${subTarget.name}` : ''}</DialogTitle>
            <DialogDescription>到点自动跑最新数据，邮件发送 Excel 报表（周刊每周一、月刊每月 1 日上午推送）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>推送频率</Label>
              <Select value={subFrequency} onValueChange={(v) => setSubFrequency(v as 'weekly' | 'monthly')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">每周（周一上午）</SelectItem>
                  <SelectItem value="monthly">每月（1 日上午）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-recipients">收件邮箱（多个用逗号分隔，留空发给我自己）</Label>
              <Input
                id="sub-recipients"
                value={subRecipients}
                onChange={(e) => setSubRecipients(e.target.value)}
                placeholder="boss@example.com, manager@example.com"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sub-enabled">启用订阅</Label>
              <Switch id="sub-enabled" checked={subEnabled} onCheckedChange={setSubEnabled} />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <div>
              {subTarget?.subscription && (
                <Button variant="outline" onClick={() => void removeSubscription()} disabled={savingSub} className="text-destructive">
                  取消订阅
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSubTarget(null)}>关闭</Button>
              <Button onClick={() => void saveSubscription()} disabled={savingSub}>
                {savingSub && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 保存订阅
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
