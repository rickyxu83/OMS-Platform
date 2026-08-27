import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, CheckCircle2, CircleCheck, CircleCheckBig, CircleMinus, CircleSlash, CircleX,
  Clock3, FileSignature, FileText, Forward, Hourglass, ListTodo, Loader2, Package,
  PauseCircle, Pencil, RefreshCw, RotateCcw, Search, Send, type LucideIcon,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { ResponsiveCard, ResponsiveList } from '@/components/ResponsiveList'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { approveMr, listApprovalTasks, rejectMr } from '@/packages/mr/client'
import { matchesSearchText } from '@/lib/text-i18n'
import type { ApprovalTask } from '@/packages/mr/types'

const VIEWS = [
  { key: 'pending', label: '待我处理', icon: Clock3 },
  { key: 'initiated', label: '我发起的', icon: Send },
  { key: 'completed', label: '我已处理', icon: CheckCircle2 },
] as const

type View = typeof VIEWS[number]['key']

function dateTime(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

// —— 考勤风格扩散：状态/业务 徽章 → 图标+文字（去 Badge 大色块）——
function indicatorSpan(icon: LucideIcon, color: string, label: string) {
  const Icon = icon
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      {label}
    </span>
  )
}

const TASK_STATUS_INDICATOR: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  pending: { icon: Hourglass, color: 'text-amber-600', label: '待处理' },
  approved: { icon: CircleCheck, color: 'text-emerald-600', label: '已同意' },
  rejected: { icon: CircleX, color: 'text-rose-500', label: '已驳回' },
  withdrawn: { icon: RotateCcw, color: 'text-slate-400', label: '已撤回' },
  reassigned: { icon: Forward, color: 'text-slate-400', label: '已转交' },
  paused: { icon: PauseCircle, color: 'text-rose-500', label: '配置暂停' },
  done: { icon: CircleCheckBig, color: 'text-emerald-600', label: '采购完成' },
  skipped: { icon: CircleMinus, color: 'text-slate-400', label: '无需采购' },
  cancelled: { icon: CircleSlash, color: 'text-slate-400', label: '已取消' },
  draft: { icon: Pencil, color: 'text-slate-400', label: '草稿' },
}

function statusIndicator(task: ApprovalTask) {
  const conf = TASK_STATUS_INDICATOR[task.status] || { icon: Clock3, color: 'text-slate-400', label: task.status || '-' }
  return indicatorSpan(conf.icon, conf.color, conf.label)
}

// 业务列：MR 系冷色（签核 indigo / 采购 cyan / 合同 purple），考勤暖色 orange
const BIZ_INDICATOR: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  mr: { icon: FileSignature, color: 'text-indigo-600', label: 'MR·签核' },
  mr_purchase: { icon: Package, color: 'text-cyan-600', label: 'MR·采购' },
  mr_contract_no: { icon: FileText, color: 'text-purple-600', label: 'MR·合同' },
  attendance: { icon: CalendarClock, color: 'text-orange-600', label: '考勤' },
}

function businessIndicator(task: ApprovalTask) {
  const conf = BIZ_INDICATOR[task.businessType] || { icon: FileText, color: 'text-slate-400', label: task.businessType.toUpperCase() }
  return indicatorSpan(conf.icon, conf.color, conf.label)
}

/** 待办等待时长：≥48h 视为超期标红 */
function agingInfo(createdAt?: string | null) {
  if (!createdAt) return null
  const start = new Date(String(createdAt).replace(' ', 'T')).getTime()
  if (Number.isNaN(start)) return null
  const hours = Math.max(0, Math.floor((Date.now() - start) / 3600000))
  const days = Math.floor(hours / 24)
  const text = days > 0 ? `已等待 ${days} 天 ${hours % 24} 小时` : `已等待 ${hours} 小时`
  return { text, overdue: hours >= 48 }
}

function taskFilterDate(task: ApprovalTask) {
  return String(task.completedAt || task.createdAt || '').replace('T', ' ').slice(0, 10)
}

function taskMatchesKeyword(task: ApprovalTask, keyword: string) {
  if (!keyword) return true
  return [
    task.title,
    task.customerName,
    task.ctrlNo,
    task.initiatorName,
    task.assigneeName,
    task.currentStepLabel,
    task.timeLabel,
  ].some((value) => matchesSearchText(value, keyword))
}

export function ApprovalTasks() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<View>(() => {
    const param = searchParams.get('view')
    return VIEWS.some((item) => item.key === param) ? (param as View) : 'pending'
  })
  const [items, setItems] = useState<ApprovalTask[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [counts, setCounts] = useState<{ pending: number; initiated: number; completed: number }>({ pending: 0, initiated: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 筛选行（前端过滤，与工单处理/工单填写一致）
  const [searchQuery, setSearchQuery] = useState(searchParams.get('keyword') || '')
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '')
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '')
  // MR 签核行内快捷操作
  const [actingTaskId, setActingTaskId] = useState<string | number | null>(null)
  const [rejectTask, setRejectTask] = useState<ApprovalTask | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectTarget, setRejectTarget] = useState<'sales' | 'assistant'>('sales')
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listApprovalTasks(view)
      setItems(data.items || [])
      setPendingCount(data.pendingCount || 0)
      if (data.counts) setCounts(data.counts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '待办加载失败')
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => { void load() }, [load])

  // 视图写入 URL（?view=initiated|completed），刷新后保持当前位置
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (view === 'pending') next.delete('view'); else next.set('view', view)
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [view, searchParams, setSearchParams])

  // 筛选条件写回 URL（replace，可刷新保持/分享）
  useEffect(() => {
    const keyword = searchQuery.trim()
    setSearchParams((prev) => {
      if ((prev.get('keyword') || '') === keyword
        && (prev.get('startDate') || '') === startDate
        && (prev.get('endDate') || '') === endDate) return prev
      const next = new URLSearchParams(prev)
      if (keyword) next.set('keyword', keyword); else next.delete('keyword')
      if (startDate) next.set('startDate', startDate); else next.delete('startDate')
      if (endDate) next.set('endDate', endDate); else next.delete('endDate')
      return next
    }, { replace: true })
  }, [searchQuery, startDate, endDate, setSearchParams])

  // 签核/审批动作后所有视图的计数都会变化，统一刷新
  useEffect(() => {
    const onApprovalChanged = () => { void load() }
    window.addEventListener('mr:approval-changed', onApprovalChanged)
    return () => window.removeEventListener('mr:approval-changed', onApprovalChanged)
  }, [load])

  const dateRange = useMemo(() => {
    if (startDate && endDate && startDate > endDate) return { start: endDate, end: startDate }
    return { start: startDate, end: endDate }
  }, [startDate, endDate])

  const filteredItems = useMemo(() => (
    items.filter((task) => {
      const date = taskFilterDate(task)
      if (dateRange.start && (!date || date < dateRange.start)) return false
      if (dateRange.end && (!date || date > dateRange.end)) return false
      return taskMatchesKeyword(task, searchQuery.trim())
    })
  ), [items, searchQuery, dateRange])

  const filtersActive = Boolean(searchQuery.trim() || dateRange.start || dateRange.end)

  const canQuickAct = useCallback((task: ApprovalTask) => (
    view === 'pending' && task.status === 'pending' && task.businessType === 'mr'
  ), [view])

  async function quickApprove(task: ApprovalTask) {
    if (!window.confirm(`确认同意「${task.title}」的签核？`)) return
    setActingTaskId(task.id)
    try {
      const next = await approveMr(task.businessId)
      toast.success(next.status === 'approved' ? 'MR 已完成全部签核' : '当前签核步骤已完成，流程已转至下一步')
      window.dispatchEvent(new CustomEvent('mr:approval-changed'))
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '签核失败')
    } finally {
      setActingTaskId(null)
    }
  }

  async function confirmReject() {
    if (!rejectTask || !rejectReason.trim()) return
    setRejecting(true)
    try {
      await rejectMr(rejectTask.businessId, rejectReason.trim(), rejectTarget)
      toast.success('已驳回并退回修改')
      setRejectTask(null)
      setRejectReason('')
      setRejectTarget('sales')
      window.dispatchEvent(new CustomEvent('mr:approval-changed'))
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '驳回失败')
    } finally {
      setRejecting(false)
    }
  }

  function resetFilters() {
    setSearchQuery('')
    setStartDate('')
    setEndDate('')
  }

  /** 行内快捷操作（仅 MR 签核待办；采购/合同/考勤任务需进详情页处理） */
  function quickActions(task: ApprovalTask, withText: boolean) {
    if (!canQuickAct(task)) return null
    const acting = actingTaskId === task.id
    const cls = withText
      ? 'text-muted-foreground hover:bg-transparent'
      : 'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors disabled:opacity-40'
    return (
      <>
        {withText ? (
          <Button variant="ghost" size="sm" className={`${cls} hover:text-emerald-600`} disabled={acting}
            onClick={(event) => { event.stopPropagation(); void quickApprove(task) }}>
            {acting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CircleCheck className="mr-1 h-4 w-4" />}
            同意
          </Button>
        ) : (
          <button type="button" className={`${cls} hover:bg-emerald-50 hover:text-emerald-600`} title="同意签核" aria-label="同意签核"
            disabled={acting}
            onClick={(event) => { event.stopPropagation(); void quickApprove(task) }}>
            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}
          </button>
        )}
        {withText ? (
          <Button variant="ghost" size="sm" className={`${cls} hover:text-rose-600`} disabled={acting}
            onClick={(event) => { event.stopPropagation(); setRejectTask(task) }}>
            <CircleX className="mr-1 h-4 w-4" />
            驳回
          </Button>
        ) : (
          <button type="button" className={`${cls} hover:bg-rose-50 hover:text-rose-600`} title="驳回" aria-label="驳回"
            disabled={acting}
            onClick={(event) => { event.stopPropagation(); setRejectTask(task) }}>
            <CircleX className="h-3.5 w-3.5" />
          </button>
        )}
      </>
    )
  }

  /** 时间列：待我处理显示等待时长（≥48h 标红），其他视图显示完成/创建时间 */
  function timeCell(task: ApprovalTask) {
    if (view === 'pending' && task.status === 'pending') {
      const aging = agingInfo(task.createdAt)
      return (
        <div className="min-w-0 text-xs">
          {aging ? (
            <div className={aging.overdue ? 'font-medium text-rose-600' : 'text-foreground'}>{aging.text}</div>
          ) : null}
          <div className="text-muted-foreground">{dateTime(task.createdAt)}</div>
        </div>
      )
    }
    return <span className="text-sm text-muted-foreground">{dateTime(task.completedAt || task.createdAt)}</span>
  }

  function subtitleOf(task: ApprovalTask) {
    return task.businessType === 'attendance' ? (task.timeLabel || '-') : `${task.customerName || '-'} · ${task.ctrlNo || '未填 Ctrl.NO'}`
  }

  function renderTaskCard(task: ApprovalTask) {
    const canOpen = !['reassigned', 'paused'].includes(task.status)
    return (
      <ResponsiveCard
        onClick={canOpen ? () => navigate(task.detailPath) : undefined}
        title={task.title}
        status={statusIndicator(task)}
        subtitle={subtitleOf(task)}
        fields={[
          { label: '业务', value: businessIndicator(task) },
          { label: '当前步骤', value: task.currentStepLabel || '-' },
          { label: '发起人', value: task.initiatorName || '-' },
          { label: view === 'pending' ? '等待' : '时间', value: timeCell(task) },
        ]}
        actions={quickActions(task, true) ?? undefined}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ListTodo className="size-6 text-primary" />待办中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">统一查看 MR 签核及其他系统接入的审批任务。</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </header>

      <div className="flex flex-wrap gap-2 border-y bg-background py-3">
        {VIEWS.map((item) => {
          const Icon = item.icon
          const count = counts[item.key]
          return (
            <Button key={item.key} variant={view === item.key ? 'default' : 'ghost'} onClick={() => setView(item.key)}>
              <Icon className="mr-2 size-4" />{item.label}{count ? ` (${count})` : ''}
            </Button>
          )
        })}
      </div>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="relative min-w-0 flex-1 basis-[260px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索标题 / 客户 / Ctrl.NO / 发起人"
                aria-label="全文搜索待办"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="min-w-0 w-full sm:w-[240px]">
              <DateRangePicker
                start={startDate}
                end={endDate}
                onChange={(nextStart, nextEnd) => { setStartDate(nextStart); setEndDate(nextEnd) }}
                placeholder="日期范围"
                ariaLabel="日期范围"
              />
            </div>
            <Button className="h-9 shrink-0 whitespace-nowrap px-2.5 sm:px-3" variant="outline" onClick={resetFilters}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <div className="p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-2">
            <EmptyState
              title={filtersActive ? '无匹配当前筛选的结果' : '当前没有记录'}
              description={!filtersActive && view === 'pending' ? '待办都处理完了' : undefined}
            />
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <ResponsiveList items={filteredItems} keyExtractor={(task) => String(task.id)} renderCard={renderTaskCard}>
              <table className="w-full table-fixed caption-bottom text-sm">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[30%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <TableHeader className="text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/70 [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:backdrop-blur">
                  <TableRow>
                    <TableHead>业务</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead>当前步骤</TableHead>
                    <TableHead>发起人</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>{view === 'pending' ? '等待 / 发起时间' : '时间'}</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((task, rowIndex) => {
                    const canOpen = !['reassigned', 'paused'].includes(task.status)
                    return (
                      <TableRow
                        key={task.id}
                        className={`list-row-enter ${canOpen ? 'cursor-pointer' : 'opacity-70'}`}
                        style={{ animationDelay: `${Math.min(rowIndex * 40, 400)}ms` }}
                        role={canOpen ? 'button' : undefined}
                        tabIndex={canOpen ? 0 : undefined}
                        onClick={() => { if (canOpen) navigate(task.detailPath) }}
                        onKeyDown={(event) => {
                          if (!canOpen || event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(task.detailPath)
                          }
                        }}
                      >
                        <TableCell>{businessIndicator(task)}</TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-0">
                            <div className="truncate font-medium" title={task.title}>{task.title}</div>
                            <div className="truncate text-xs text-muted-foreground">{subtitleOf(task)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0"><span className="block truncate text-sm">{task.currentStepLabel || '-'}</span></TableCell>
                        <TableCell className="min-w-0"><span className="block truncate text-sm">{task.initiatorName || '-'}</span></TableCell>
                        <TableCell>{statusIndicator(task)}</TableCell>
                        <TableCell className="whitespace-normal">{timeCell(task)}</TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center gap-1">{quickActions(task, false)}</div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </table>
            </ResponsiveList>
          </div>
        )}
      </div>

      <Dialog open={Boolean(rejectTask)} onOpenChange={(open) => { if (!open) { setRejectTask(null); setRejectReason(''); setRejectTarget('sales') } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>驳回 MR 申请</DialogTitle>
            <DialogDescription>
              {rejectTask ? `「${rejectTask.title}」` : ''}请选择退回对象并填写原因；完成修改后，签核流程将从助理步骤重新开始。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>退回对象</Label>
              <Select value={rejectTarget} onValueChange={(value) => setRejectTarget(value as 'sales' | 'assistant')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">业务负责人</SelectItem>
                  <SelectItem value="assistant">对应助理</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>驳回原因</Label>
              <Textarea rows={4} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTask(null); setRejectReason(''); setRejectTarget('sales') }}>取消</Button>
            <Button disabled={rejecting || !rejectReason.trim()} onClick={() => void confirmReject()}>
              {rejecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
