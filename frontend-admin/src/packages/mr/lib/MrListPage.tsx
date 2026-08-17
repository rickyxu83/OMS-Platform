import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePenLine, Loader2, Plus, RefreshCw, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorToast } from '@/components/ErrorToast'
import { useAuth } from '@/contexts/AuthContext'
import { createMr, deleteMr, listMr, listSalespeople } from '../client'
import { LayoutRulesDialog } from './LayoutRulesDialog'
import type { MrOrder, MrStatus, UserOption } from '../types'

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

const PURCHASE_LABELS: Record<string, string> = {
  pending: '待采购',
  done: '采购完成',
  skipped: '无需采购',
  waiting_contract: '待合同编号',
}

const PURCHASE_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-zinc-100 text-zinc-500',
  waiting_contract: 'bg-orange-100 text-orange-800',
}

function money(value?: number | null) {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

export function MrListPage() {
  const navigate = useNavigate()
  const { hasPermission, user } = useAuth()
  const [items, setItems] = useState<MrOrder[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [error, setError] = useState('')
  const [salesOptions, setSalesOptions] = useState<UserOption[]>([])
  const [selectedSalesId, setSelectedSalesId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

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

  const createForSales = async (salesOwnerId?: string | number) => {
    setCreating(true)
    try {
      const draft = await createMr(salesOwnerId ? { salesOwnerId } : {})
      setCreateOpen(false)
      navigate(`/mr/${draft.id}`)
    } catch (err) {
      setError((err as Error).message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const createDraft = async () => {
    if (user?.role !== 'assistant' && user?.role !== 'assistant_supervisor') {
      await createForSales()
      return
    }
    setCreating(true)
    try {
      const data = await listSalespeople()
      const assigned = (data.items || []).filter((sales) => {
        if (!['sales', 'sales_supervisor'].includes(sales.role || '')) return false
        // 助理：仅限与自己建立助理关系的业务负责人；助理主管：可为已配置在职助理的业务负责人代建
        if (user?.role === 'assistant') return String(sales.assistantUserId || '') === String(user.id || '')
        return Boolean(sales.assistantUserId)
      })
      if (!assigned.length) {
        setError('当前未关联任何业务负责人；请由业务负责人先在“我的设置”中指定对应助理。')
        return
      }
      if (assigned.length === 1) {
        await createForSales(assigned[0].id)
        return
      }
      setSalesOptions(assigned)
      setSelectedSalesId(String(assigned[0].id))
      setCreateOpen(true)
    } catch (err) {
      setError((err as Error).message || '业务负责人加载失败')
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
          <p className="mt-1 text-sm text-muted-foreground">申请填写、报价导入、电子签核及归档输出</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' ? (
            <Button variant="outline" onClick={() => setRulesOpen(true)}>
              <SlidersHorizontal className="mr-2 size-4" />
              识别规则
            </Button>
          ) : null}
          {hasPermission('mr.create') ? (
            <Button onClick={createDraft} disabled={creating}>
              {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              新建 MR 申请
            </Button>
          ) : null}
        </div>
      </header>
      <LayoutRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />

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
              <TableHead>负责的销售</TableHead>
              <TableHead>计价模式</TableHead>
              <TableHead className="text-right">未税总计</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>当前签核步骤</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-[104px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="h-40 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-40 text-center text-muted-foreground">暂无符合条件的 MR 申请单</TableCell></TableRow>
            ) : items.map((order) => {
              const orderStatus = (order.status || 'draft') as MrStatus
              return (
                <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/mr/${order.id}`)}>
                  <TableCell>
                    <button type="button" className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); navigate(`/mr/${order.id}`) }}>
                      <span className="block font-medium">{order.customerName || '未选择客户'}</span>
                      <span className="block text-xs text-muted-foreground">{order.customerCode || '-'} / {order.ctrlNo || '未填写 Ctrl.NO'}</span>
                    </button>
                  </TableCell>
                  <TableCell>{order.salesOwnerName || '-'}</TableCell>
                  <TableCell>{order.pricingMode ? PRICING_LABELS[order.pricingMode] : '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">¥ {money(order.totalExcludingTax)}</TableCell>
                  <TableCell><Badge className={STATUS_CLASSES[orderStatus]}>{STATUS_LABELS[orderStatus]}</Badge>{orderStatus === 'approved' && order.purchaseStatus ? <Badge className={`ml-1 ${PURCHASE_CLASSES[order.purchaseStatus] || ''}`}>{PURCHASE_LABELS[order.purchaseStatus] || order.purchaseStatus}</Badge> : null}</TableCell>
                  <TableCell><div>{order.currentStepKey === 'sales' ? '业务负责人' : order.currentStepLabel || '-'}</div>{order.assignmentError ? <div className="mt-1 text-xs text-destructive">流程暂停：{order.assignmentError}</div> : order.currentAssigneeName ? <div className="mt-1 text-xs text-muted-foreground">{order.currentAssigneeName}</div> : null}</TableCell>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择业务负责人</DialogTitle>
            <DialogDescription>助理仅可为已将其指定为对应助理的业务负责人代为创建 MR 申请。</DialogDescription>
          </DialogHeader>
          <Select value={selectedSalesId} onValueChange={setSelectedSalesId}>
            <SelectTrigger><SelectValue placeholder="选择业务负责人" /></SelectTrigger>
            <SelectContent>
              {salesOptions.map((sales) => <SelectItem key={sales.id} value={String(sales.id)}>{sales.realName || sales.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button disabled={!selectedSalesId || creating} onClick={() => void createForSales(selectedSalesId)}>创建 MR 申请</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
