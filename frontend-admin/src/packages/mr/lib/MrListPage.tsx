import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePenLine, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorToast } from '@/components/ErrorToast'
import { useAuth } from '@/contexts/AuthContext'
import { createMr, deleteMr, listMr } from '../client'
import type { MrOrder, MrStatus } from '../types'

const STATUS_LABELS: Record<MrStatus, string> = {
  draft: '草稿',
  in_review: '签核中',
  approved: '已通过',
  rejected: '已驳回',
  voided: '已作废',
}

const STATUS_CLASSES: Record<MrStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  voided: 'bg-zinc-200 text-zinc-600',
}

const PRICING_LABELS: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }

function money(value?: number | null) {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

export function MrListPage() {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const [items, setItems] = useState<MrOrder[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listMr({ q: q.trim(), status: status === 'all' ? '' : status })
      setItems(data.items || [])
    } catch (err) {
      setError((err as Error).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q, status])

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(queryInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [queryInput])
  useEffect(() => { void load() }, [load])

  const createDraft = async () => {
    setCreating(true)
    try {
      const draft = await createMr({
        fillDate: new Date().toISOString().slice(0, 10),
        salesOwnerId: user?.role === 'sales' ? user.id : undefined,
      })
      navigate(`/mr/${draft.id}`)
    } catch (err) {
      setError((err as Error).message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (order: MrOrder) => {
    if (!order.id || !window.confirm(`删除 ${order.customerName || `草稿 #${order.id}`}？此操作不可恢复。`)) return
    try {
      await deleteMr(order.id)
      toast.success('MR 草稿已删除')
      await load()
    } catch (err) {
      setError((err as Error).message || '删除失败')
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <ErrorToast message={error} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">客户订购申请（MR）</h1>
          <p className="mt-1 text-sm text-muted-foreground">填写、报价单导入、签核和打印存档</p>
        </div>
        {hasPermission('mr.create') ? (
          <Button onClick={createDraft} disabled={creating}>
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            新建 MR
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2 border-y bg-background py-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="客户、客户缩写或 Ctrl.NO" aria-label="搜索 MR" className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" title="刷新" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="overflow-hidden border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户 / Ctrl.NO</TableHead>
              <TableHead>负责业务</TableHead>
              <TableHead>计价模式</TableHead>
              <TableHead className="text-right">未税总计</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>当前步骤</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-[104px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="h-40 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-40 text-center text-muted-foreground">没有符合条件的 MR 单</TableCell></TableRow>
            ) : items.map((order) => {
              const orderStatus = (order.status || 'draft') as MrStatus
              return (
                <TableRow key={order.id}>
                  <TableCell>
                    <button type="button" className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => navigate(`/mr/${order.id}`)}>
                      <span className="block font-medium">{order.customerName || '未选客户'}</span>
                      <span className="block text-xs text-muted-foreground">{order.customerCode || '-'} / {order.ctrlNo || '未填 Ctrl.NO'}</span>
                    </button>
                  </TableCell>
                  <TableCell>{order.salesOwnerName || '-'}</TableCell>
                  <TableCell>{order.pricingMode ? PRICING_LABELS[order.pricingMode] : '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">¥ {money(order.totalExcludingTax)}</TableCell>
                  <TableCell><Badge className={STATUS_CLASSES[orderStatus]}>{STATUS_LABELS[orderStatus]}</Badge></TableCell>
                  <TableCell>{order.currentStepLabel || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{shortDate(order.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon" title="打开" onClick={() => navigate(`/mr/${order.id}`)}><FilePenLine className="size-4" /></Button>
                      {order.permissions?.canDelete ? <Button variant="ghost" size="icon" title="删除" onClick={() => void remove(order)}><Trash2 className="size-4 text-destructive" /></Button> : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
