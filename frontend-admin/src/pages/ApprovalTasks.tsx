import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, ListTodo, Loader2, RefreshCw, Send } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listApprovalTasks } from '@/packages/mr/client'
import { EmptyState } from '@/components/EmptyState'
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

function status(task: ApprovalTask) {
  if (task.status === 'pending') return ['待处理', 'warning'] as const
  if (task.status === 'approved') return ['已同意', 'success'] as const
  if (task.status === 'rejected') return ['已驳回', 'destructive'] as const
  if (task.status === 'withdrawn') return ['已撤回', 'outline'] as const
  if (task.status === 'reassigned') return ['已转交', 'outline'] as const
  if (task.status === 'paused') return ['配置暂停', 'destructive'] as const
  if (task.status === 'done') return ['采购完成', 'success'] as const
  if (task.status === 'skipped') return ['无需采购', 'outline'] as const
  if (task.status === 'cancelled') return ['已取消', 'outline'] as const
  if (task.status === 'draft') return ['草稿', 'outline'] as const
  return [task.status || '-', 'outline'] as const
}

function businessBadge(task: ApprovalTask) {
  // 业务列按类型分色：MR 系用冷色（采购 cyan / 合同 purple），考勤用暖色 orange，与状态列的 amber/emerald 语义色错开
  if (task.businessType === 'mr_purchase') return ['MR·采购', 'cyan'] as const
  if (task.businessType === 'mr_contract_no') return ['MR·合同', 'purple'] as const
  if (task.businessType === 'attendance') return ['考勤', 'orange'] as const
  return [task.businessType.toUpperCase(), 'outline'] as const
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listApprovalTasks(view)
      setItems(data.items || [])
      setPendingCount(data.pendingCount || 0)
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

  useEffect(() => {
    const onApprovalChanged = () => { if (view === 'pending') void load() }
    window.addEventListener('mr:approval-changed', onApprovalChanged)
    return () => window.removeEventListener('mr:approval-changed', onApprovalChanged)
  }, [view, load])

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
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
          return (
            <Button key={item.key} variant={view === item.key ? 'default' : 'ghost'} onClick={() => setView(item.key)}>
              <Icon className="mr-2 size-4" />{item.label}{item.key === 'pending' && pendingCount ? ` (${pendingCount})` : ''}
            </Button>
          )
        })}
      </div>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>业务</TableHead><TableHead>标题</TableHead><TableHead>当前步骤</TableHead><TableHead>发起人</TableHead><TableHead>状态</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="h-40 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-40"><EmptyState title="当前没有记录" description={view === 'pending' ? '待办都处理完了' : undefined} /></TableCell></TableRow>
            ) : items.map((task) => {
              const [label, variant] = status(task)
              const [bizLabel, bizVariant] = businessBadge(task)
              const canOpen = !['reassigned', 'paused'].includes(task.status)
              return (
                <TableRow
                  key={task.id}
                  className={canOpen ? 'cursor-pointer' : 'opacity-70'}
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
                  <TableCell><Badge variant={bizVariant}>{bizLabel}</Badge></TableCell>
                  <TableCell><div className="font-medium">{task.title}</div><div className="text-xs text-muted-foreground">{task.businessType === 'attendance' ? (task.timeLabel || '-') : `${task.customerName || '-'} · ${task.ctrlNo || '未填 Ctrl.NO'}`}</div></TableCell>
                  <TableCell>{task.currentStepLabel || '-'}</TableCell>
                  <TableCell>{task.initiatorName || '-'}</TableCell>
                  <TableCell><Badge variant={variant}>{label}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{dateTime(task.completedAt || task.createdAt)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
