import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Plus, RefreshCw, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorToast } from '@/components/ErrorToast'
import { CustomerIndexSuggestions } from '@/components/CustomerIndexSuggestions'
import { customerMatches, groupCustomersByInitial } from '@/lib/customer-index'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { api } from '@/services/api'
import { createMr, listMr, listSalespeople } from '../client'
import { LayoutRulesDialog } from './LayoutRulesDialog'
import { HelpTooltip } from '@/components/HelpTooltip'
import type { CustomerOption, MrOrder, MrStatus, UserOption } from '../types'

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

export function MrListPage() {
  const navigate = useNavigate()
  const { hasPermission, user } = useAuth()
  const [items, setItems] = useState<MrOrder[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [purchaseStatus, setPurchaseStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [salesFilterId, setSalesFilterId] = useState('all')
  const [salesFilterOptions, setSalesFilterOptions] = useState<UserOption[]>([])
  const [customerFilterId, setCustomerFilterId] = useState('')
  const [customerFilterInput, setCustomerFilterInput] = useState('')
  const [customerFilterOpen, setCustomerFilterOpen] = useState(false)
  const [filterCustomers, setFilterCustomers] = useState<CustomerOption[]>([])
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
      })
      setItems(data.items || [])
    } catch (err) {
      setError((err as Error).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q, status, purchaseStatus, customerFilterId, salesFilterId, dateFrom, dateTo])

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(queryInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [queryInput])
  useEffect(() => { void load() }, [load])

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pagedItems = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page])
  // 筛选/搜索变化时回到第一页；数据变少时收敛页码
  useEffect(() => { setPage(1) }, [q, status, purchaseStatus, customerFilterId, salesFilterId, dateFrom, dateTo])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  // 翻页后表体滚动区回顶部，避免停留在上一页的滚动位置
  useEffect(() => { tableScrollRef.current?.scrollTo({ top: 0 }) }, [page])

  const { lang } = useLanguage()
  // 销售筛选名录（mount 加载一次）；与新建弹窗按需加载的 salesOptions 相互独立
  useEffect(() => {
    listSalespeople().then((data) => setSalesFilterOptions(data.items || [])).catch(() => {})
  }, [])
  // 客户筛选名录（无 customer.view 权限的角色 403 时静默为空，关键词搜索兑底）
  useEffect(() => {
    const sortLocale = encodeURIComponent(lang === 'zh-TW' ? 'zh-TW' : 'zh-Hans-CN')
    api.get(`/customers?pageSize=200&sortLocale=${sortLocale}`).then((data) => setFilterCustomers((data?.items || []) as CustomerOption[])).catch(() => {})
  }, [lang])
  const filterCustomerGroups = useMemo(() => (
    groupCustomersByInitial(
      filterCustomers.filter((customer) => customerMatches(customer, customerFilterInput)).slice(0, 160),
      lang,
    )
  ), [filterCustomers, customerFilterInput, lang])

  const resetFilters = () => {
    setQueryInput('')
    setQ('')
    setStatus('all')
    setPurchaseStatus('all')
    setDateFrom('')
    setDateTo('')
    setSalesFilterId('all')
    setCustomerFilterId('')
    setCustomerFilterInput('')
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

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
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

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.15fr)_minmax(200px,0.85fr)_minmax(280px,1fr)]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="客户 / 单号 / 设备型号 / 品名 / 料号 / 供应商…" aria-label="搜索 MR" className="pl-9" />
            </div>
            <div className="relative min-w-0">
              <Input
                value={customerFilterInput}
                placeholder="按客户筛选"
                aria-label="按客户筛选"
                onFocus={() => setCustomerFilterOpen(true)}
                onBlur={() => window.setTimeout(() => setCustomerFilterOpen(false), 140)}
                onChange={(event) => {
                  const value = event.target.value
                  setCustomerFilterInput(value)
                  setCustomerFilterOpen(true)
                  if (!value.trim()) setCustomerFilterId('')
                }}
              />
              <CustomerIndexSuggestions
                idPrefix="mr-filter-customer-letter"
                open={customerFilterOpen}
                searching={false}
                recentCustomers={[]}
                groups={filterCustomerGroups}
                selectedCustomerId={customerFilterId}
                emptyText="未找到匹配客户"
                onSelect={(customer) => {
                  setCustomerFilterOpen(false)
                  setCustomerFilterId(String(customer.id))
                  setCustomerFilterInput(customer.name || `客户 #${customer.id}`)
                }}
              />
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="填表日期起" className="min-w-0 flex-1" />
              <span className="text-sm text-muted-foreground">至</span>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="填表日期止" className="min-w-0 flex-1" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(140px,180px)_minmax(140px,180px)_minmax(140px,180px)_auto]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={purchaseStatus} onValueChange={setPurchaseStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部采购状态</SelectItem>
                {Object.entries(PURCHASE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={salesFilterId} onValueChange={setSalesFilterId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="全部销售" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部销售</SelectItem>
                {salesFilterOptions.map((sales) => <SelectItem key={sales.id} value={String(sales.id)}>{sales.realName || sales.username}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
              <Button variant="outline" onClick={resetFilters}><RotateCcw className="mr-1.5 size-4" />重置</Button>
              <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            MR 申请单（{items.length}）
            <HelpTooltip label="MR 流转：草稿 → 签核中（按签核步骤逐级审批）→ 已通过 / 已驳回；已通过的 MR 可作废。签核通过后系统自动生成 PDF 归档（每 2 分钟重试失败的归档任务），签核过程中的通知邮件每分钟处理一次。" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-fit max-w-full">
          <div ref={tableScrollRef} className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto rounded-md border">
            <table className="w-[890px] table-fixed caption-bottom text-sm">
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
                <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/mr/${order.id}`)}>
                  <TableCell>
                    <button type="button" className="block max-w-full text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); navigate(`/mr/${order.id}`) }}>
                      <span className="block truncate font-medium">{order.customerName || '未选择客户'}</span>
                      <span className="block truncate text-xs text-muted-foreground">{order.ctrlNo || '未填写 Ctrl.NO'}</span>
                    </button>
                  </TableCell>
                  <TableCell>{order.salesOwnerName || '-'}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">¥ {money(order.totalExcludingTax)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_CLASSES[orderStatus]}>{STATUS_LABELS[orderStatus]}</Badge>{orderStatus === 'approved' && order.purchaseStatus ? <Badge className={`ml-1 ${PURCHASE_CLASSES[order.purchaseStatus] || ''}`}>{PURCHASE_LABELS[order.purchaseStatus] || order.purchaseStatus}</Badge> : null}
                    {stepLabel || order.currentAssigneeName ? <div className="mt-1 text-xs text-muted-foreground">{[stepLabel, order.currentAssigneeName].filter(Boolean).join(' · ')}</div> : null}
                    {order.assignmentError ? <div className="mt-1 text-xs text-destructive">流程暂停：{order.assignmentError}</div> : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{shortDate(order.updatedAt)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
            </table>
          </div>
          {!loading && items.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>共 {items.length} 条 · 第 {page} / {pageCount} 页（每页 {PAGE_SIZE} 条）</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>下一页</Button>
              </div>
            </div>
          ) : null}
          </div>
        </CardContent>
      </Card>
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
