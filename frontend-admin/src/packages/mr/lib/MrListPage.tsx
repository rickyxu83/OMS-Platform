import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Plus, RefreshCw, RotateCcw, Search, SlidersHorizontal, X, Pencil, Hourglass, CircleCheck, CircleX, CircleSlash, Package, PackageCheck, Minus, FileText, CircleDot, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorToast } from '@/components/ErrorToast'
import { useAuth } from '@/contexts/AuthContext'
import { createMr, listMr, listSalespeople } from '../client'
import { LayoutRulesDialog } from './LayoutRulesDialog'
import { HelpTooltip } from '@/components/HelpTooltip'
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

// —— 工单处理风格扩散：状态/采购 徽章 → 图标+文字 ——
const STATUS_INDICATOR: Record<MrStatus, { icon: LucideIcon; color: string }> = {
  draft: { icon: Pencil, color: 'text-slate-400' },
  in_review: { icon: Hourglass, color: 'text-amber-600' },
  approved: { icon: CircleCheck, color: 'text-emerald-600' },
  rejected: { icon: CircleX, color: 'text-rose-500' },
  voided: { icon: CircleSlash, color: 'text-zinc-400' },
}
const PURCHASE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  pending: { icon: Package, color: 'text-amber-600' },
  done: { icon: PackageCheck, color: 'text-emerald-600' },
  skipped: { icon: Minus, color: 'text-slate-400' },
  waiting_contract: { icon: FileText, color: 'text-sky-600' },
}

/** 状态按钮 + hover 悬浮时间线卡（fixed 定位，脱离表格层叠上下文，不被下行遮挡） */
function StatusHoverButton({ orderStatus, order, stepLabel, assigneeName, onFilter }: { orderStatus: MrStatus; order: { createdAt?: string | null; submittedAt?: string | null; approvedAt?: string | null; rejectedAt?: string | null; voidedAt?: string | null; approvalSteps?: Array<{ seq: number; stepKey: string; stepLabel: string; approverName: string | null; action: string | null; decidedAt: string | null }> }; stepLabel?: string; assigneeName?: string | null; onFilter: () => void }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const conf = STATUS_INDICATOR[orderStatus]
  const Icon = conf ? conf.icon : null
  const segs = ([
    { label: '创建', at: order.createdAt },
    { label: '提交签核', at: order.submittedAt },
  ]).filter((seg) => seg.at)
  const steps = (order.approvalSteps || [])
  return (
    <span className="inline-block">
      <button
        ref={btnRef}
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-opacity hover:opacity-80"
        onClick={(event) => { event.stopPropagation(); onFilter() }}
        onMouseEnter={() => {
          if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setPos({ top: rect.bottom + 4, left: rect.left })
          }
          setHover(true)
        }}
        onMouseLeave={() => setHover(false)}
      >
        {Icon ? <Icon className={`h-3.5 w-3.5 ${conf.color}`} /> : null}
        {STATUS_LABELS[orderStatus]}
      </button>
      {hover && pos && segs.length ? (
        <div className="pointer-events-none fixed z-[100] min-w-[190px] rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900" style={{ top: pos.top, left: pos.left }}>
          {segs.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#582b8b]/10 text-[#582b8b]"><CircleDot className="h-2.5 w-2.5" /></span>
              {seg.label} <span className="font-medium text-foreground">{shortDate(seg.at)}</span>
            </div>
          ))}
          {steps.length ? (
            <div className="mt-1.5 border-t border-slate-100 pt-1.5">
              {(() => {
                const currentIdx = steps.findIndex((step) => !step.action)
                return steps.map((step, idx) => {
                  const isCurrent = idx === currentIdx
                  const isWaiting = idx > currentIdx && currentIdx >= 0
                  return (
                    <div key={`${step.seq}-${step.stepKey}`} className={`flex items-center gap-1.5 py-0.5 ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${step.action === 'approve' ? 'bg-emerald-100 text-emerald-700' : step.action === 'reject' ? 'bg-rose-100 text-rose-600' : isCurrent ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'}`}>
                        {step.action === 'approve' ? <CircleCheck className="h-2.5 w-2.5" /> : step.action === 'reject' ? <CircleX className="h-2.5 w-2.5" /> : <Hourglass className="h-2.5 w-2.5" />}
                      </span>
                      <span className={`flex-1 truncate ${isCurrent ? 'font-medium' : ''}`}>{step.stepLabel}{step.approverName ? ` · ${step.approverName}` : ''}{isCurrent ? '（签核中）' : isWaiting ? '' : ''}</span>
                      {step.decidedAt ? <span className="shrink-0 text-[11px]">{shortDate(step.decidedAt)}</span> : null}
                    </div>
                  )
                })
              })()}
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  )
}

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

const PAGE_SIZE = 50

function money(value?: number | null) {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

/** 已选筛选标签：点击行内对象（客户/销售/状态徽章）快速筛选后在此显示，点击标签取消 */
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/70">
      {label}<X className="size-3 text-muted-foreground" />
    </button>
  )
}

export function MrListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasPermission, user } = useAuth()
  const [items, setItems] = useState<MrOrder[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [purchaseStatus, setPurchaseStatus] = useState('all')
  // 只看待我签核：导航角标/待办中心深链 ?pendingMine=1 进入
  const [pendingMine, setPendingMine] = useState(searchParams.get('pendingMine') === '1')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [salesFilterId, setSalesFilterId] = useState('all')
  const [salesFilterName, setSalesFilterName] = useState('')
  const [customerFilterId, setCustomerFilterId] = useState('')
  const [customerFilterName, setCustomerFilterName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [error, setError] = useState('')
  const [salesOptions, setSalesOptions] = useState<UserOption[]>([])
  const [selectedSalesId, setSelectedSalesId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [page, setPage] = useState(1)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listMr({
        q: q.trim(),
        status: status === 'all' ? '' : status,
        purchaseStatus: purchaseStatus === 'all' ? '' : purchaseStatus,
        customerId: customerFilterId,
        salesOwnerId: salesFilterId === 'all' ? '' : salesFilterId,
        dateFrom,
        dateTo,
        pendingMine,
      })
      setItems(data.items || [])
    } catch (err) {
      setError((err as Error).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q, status, purchaseStatus, customerFilterId, salesFilterId, dateFrom, dateTo, pendingMine])

  // pendingMine 与 URL 同步（清除筛选 chip 时摘掉参数）
  useEffect(() => {
    setSearchParams((prev) => {
      const has = prev.get('pendingMine') === '1'
      if (has === pendingMine) return prev
      const next = new URLSearchParams(prev)
      if (pendingMine) next.set('pendingMine', '1'); else next.delete('pendingMine')
      return next
    }, { replace: true })
  }, [pendingMine, setSearchParams])

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(queryInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [queryInput])
  useEffect(() => { void load() }, [load])

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pagedItems = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page])
  // 筛选/搜索变化时回到第一页；数据变少时收敛页码
  useEffect(() => { setPage(1) }, [q, status, purchaseStatus, customerFilterId, salesFilterId, dateFrom, dateTo, pendingMine])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  // 翻页后表体滚动区回顶部，避免停留在上一页的滚动位置
  useEffect(() => { tableScrollRef.current?.scrollTo({ top: 0 }) }, [page])

  const resetFilters = () => {
    setQueryInput('')
    setQ('')
    setStatus('all')
    setPurchaseStatus('all')
    setDateFrom('')
    setDateTo('')
    setSalesFilterId('all')
    setSalesFilterName('')
    setCustomerFilterId('')
    setCustomerFilterName('')
  }

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

  const pendingMineCount = useMemo(
    () => (pendingMine ? items.length : items.filter((order) => Number(order.approvalParticipant) === 1).length),
    [items, pendingMine],
  )

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden p-6">
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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-white px-4 py-2.5 text-sm shadow-sm dark:bg-slate-900">
        {pendingMineCount > 0 || pendingMine ? (
          <button
            type="button"
            onClick={() => setPendingMine((value) => !value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm transition-colors ${
              pendingMine
                ? 'bg-primary font-medium text-white'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
            title={pendingMine ? '取消“只看待我签核”' : '只看当前等我签核的 MR'}
            aria-pressed={pendingMine}
          >
            <Hourglass className="size-3.5" />
            待我签核 <span className="font-bold">{pendingMineCount}</span>
          </button>
        ) : null}
        {/* 统计条可点击筛选：全部 + 各状态,点击切换 status 筛选 */}
        {(
          [
            { key: 'all', label: '全部', icon: null as LucideIcon | null },
            { key: 'draft', label: '草稿', icon: STATUS_INDICATOR.draft.icon },
            { key: 'in_review', label: '签核中', icon: STATUS_INDICATOR.in_review.icon },
            { key: 'approved', label: '已通过', icon: STATUS_INDICATOR.approved.icon },
            { key: 'rejected', label: '已驳回', icon: STATUS_INDICATOR.rejected.icon },
            { key: 'voided', label: '已作废', icon: STATUS_INDICATOR.voided.icon },
          ] as Array<{ key: string; label: string; icon: LucideIcon | null }>
        ).map((item) => {
          const count = item.key === 'all' ? items.length : items.filter((o) => (o.status || 'draft') === item.key).length
          const active = status === item.key
          const Icon = item.icon
          const color = item.key === 'all' ? '' : STATUS_INDICATOR[item.key as MrStatus].color
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatus(item.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm transition-colors ${
                active ? 'bg-primary font-medium text-white' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {Icon ? <Icon className={`h-3.5 w-3.5 ${active ? '' : color}`} /> : null}
              <span>{item.label}</span>
              <span className="font-bold tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="全文搜索：客户 / 单号 / 设备型号 / 品名 / 料号 / 供应商…" aria-label="搜索 MR" className="pl-9" />
            </div>
            <div className="w-[240px]">
              <DateRangePicker
                start={dateFrom}
                end={dateTo}
                onChange={(s2, e2) => { setDateFrom(s2); setDateTo(e2) }}
                placeholder="填表日期起 ~ 止"
                ariaLabel="填表日期范围"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={resetFilters}><RotateCcw className="mr-1.5 size-4" />重置</Button>
              <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
            </div>
          </div>
          {status !== 'all' || purchaseStatus !== 'all' || salesFilterId !== 'all' || customerFilterId || pendingMine ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">已选筛选（点击取消）：</span>
              {pendingMine ? <FilterChip label="只看待我签核" onClear={() => setPendingMine(false)} /> : null}
              {status !== 'all' ? <FilterChip label={`状态：${STATUS_LABELS[status as MrStatus] || status}`} onClear={() => setStatus('all')} /> : null}
              {purchaseStatus !== 'all' ? <FilterChip label={`采购状态：${PURCHASE_LABELS[purchaseStatus] || purchaseStatus}`} onClear={() => setPurchaseStatus('all')} /> : null}
              {salesFilterId !== 'all' ? <FilterChip label={`销售：${salesFilterName || salesFilterId}`} onClear={() => { setSalesFilterId('all'); setSalesFilterName('') }} /> : null}
              {customerFilterId ? <FilterChip label={`客户：${customerFilterName || customerFilterId}`} onClear={() => { setCustomerFilterId(''); setCustomerFilterName('') }} /> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div ref={tableScrollRef} className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto">
          <table className="w-full table-fixed caption-bottom text-sm">
              <colgroup>
                <col className="w-[280px]" />
                <col className="w-[110px]" />
                <col className="w-[150px]" />
                <col className="w-[190px]" />
                <col className="w-[160px]" />
              </colgroup>
              <TableHeader className="text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/70 [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:backdrop-blur">
                <TableRow>
                  <TableHead>客户 / Ctrl.NO</TableHead>
                  <TableHead>负责的销售</TableHead>
                  <TableHead className="pr-6 text-right">未税总计</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="h-[50vh] text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-[50vh] text-center text-muted-foreground">暂无符合条件的 MR 申请单</TableCell></TableRow>
            ) : pagedItems.map((order) => {
              const orderStatus = (order.status || 'draft') as MrStatus
              const stepLabel = order.currentStepKey === 'sales' ? '业务负责人' : (order.currentStepLabel || '')
              return (
                <TableRow key={order.id} className="cursor-pointer hover:relative hover:z-10" onClick={() => navigate(`/mr/${order.id}`)}>
                  <TableCell>
                    <button type="button" className="block max-w-full text-left transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={order.customerName ? `按客户筛选：${order.customerName}` : undefined} onClick={(event) => { event.stopPropagation(); if (order.customerId) { setCustomerFilterId(String(order.customerId)); setCustomerFilterName(order.customerName || '') } else { navigate(`/mr/${order.id}`) } }}>
                      <span className="block truncate font-medium">{order.customerName || '未选择客户'}</span>
                      <span className="block truncate text-xs text-muted-foreground">{order.ctrlNo || '未填写 Ctrl.NO'}</span>
                    </button>
                  </TableCell>
                  <TableCell className="truncate">
                    {order.salesOwnerId ? (
                      <button type="button" className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline" title={`按销售筛选：${order.salesOwnerName || '-'}`} onClick={(event) => { event.stopPropagation(); setSalesFilterId(String(order.salesOwnerId)); setSalesFilterName(order.salesOwnerName || '') }}>
                        {order.salesOwnerName || '-'}
                      </button>
                    ) : (order.salesOwnerName || '-')}
                  </TableCell>
                  <TableCell className="truncate pr-6 text-right tabular-nums">¥ {money(order.totalExcludingTax)}</TableCell>
                  <TableCell className="truncate">
                    <StatusHoverButton orderStatus={orderStatus} order={order} stepLabel={stepLabel} assigneeName={order.currentAssigneeName} onFilter={() => setStatus(orderStatus)} />
                    {orderStatus === 'approved' && order.purchaseStatus ? <button type="button" className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-opacity hover:opacity-80" title={`按采购状态筛选：${PURCHASE_LABELS[order.purchaseStatus] || order.purchaseStatus}`} onClick={(event) => { event.stopPropagation(); setPurchaseStatus(order.purchaseStatus || '') }}>
                      {(() => { const conf = PURCHASE_INDICATOR[order.purchaseStatus || '']; const Icon = conf ? conf.icon : null; return Icon ? <Icon className={`h-3.5 w-3.5 ${conf.color}`} /> : null })()}
                      {PURCHASE_LABELS[order.purchaseStatus] || order.purchaseStatus}
                    </button> : null}

                    {order.assignmentError ? <div className="mt-1 truncate text-xs text-destructive">流程暂停：{order.assignmentError}</div> : null}
                  </TableCell>
                  <TableCell className="truncate text-sm text-muted-foreground">{shortDate(order.updatedAt)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          </table>
        </div>
        {!loading && items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm text-muted-foreground">
            <span>共 {items.length} 条 · 第 {page} / {pageCount} 页（每页 {PAGE_SIZE} 条）</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>下一页</Button>
            </div>
          </div>
        ) : null}
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
