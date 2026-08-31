import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MrOrder } from '../types'
import type { MrSection } from './form-sections'
import { AnimatedMoney, AnimatedPercent, statusLabel } from './mr-ui'

/**
 * Section list. `vertical` is the desktop rail; `horizontal` is the mobile chip
 * strip. Both show per-section counts of outstanding validation errors.
 */
export function SectionNav({
  sections,
  activeId,
  errorCounts,
  counts,
  orientation,
  onNavigate,
}: {
  sections: MrSection[]
  activeId: string
  errorCounts: Record<string, number>
  counts: Record<string, number>
  orientation: 'vertical' | 'horizontal'
  onNavigate: (id: string) => void
}) {
  const vertical = orientation === 'vertical'
  return (
    <nav
      aria-label="MR 分区导航"
      className={vertical ? 'flex flex-col gap-0.5 p-2' : 'flex gap-1.5 overflow-x-auto px-4 py-2 sm:px-6'}
    >
      {sections.map(({ id, title, icon: Icon }) => {
        const active = activeId === id
        const errors = errorCounts[id] || 0
        const count = counts[id]
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => onNavigate(id)}
            className={`flex shrink-0 items-center gap-2 rounded-md text-sm transition-colors ${
              vertical ? 'w-full px-3 py-2 text-left' : 'whitespace-nowrap px-3 py-1.5'
            } ${active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
          >
            <Icon className="size-4 shrink-0" />
            <span title={title} className={vertical ? 'min-w-0 flex-1 truncate' : ''}>{title}</span>
            {count === undefined ? null : <span className="shrink-0 text-xs tabular-nums opacity-70">{count}</span>}
            {errors ? (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white tabular-nums">
                {errors}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

export function WorkbenchMetrics({ order, animationKey = 0 }: { order: MrOrder; animationKey?: number }) {
  const totals = order.totals || {}
  const margin = totals.marginRate
  const lowMargin = margin !== null && margin !== undefined && Number(margin) < 15
  const grossProfit = totals.salesExcludingTax !== null && totals.salesExcludingTax !== undefined && totals.costExcludingTax !== null && totals.costExcludingTax !== undefined
    ? Number(totals.salesExcludingTax) - Number(totals.costExcludingTax)
    : null
  const metrics = [
    { label: '未税总计', value: <AnimatedMoney value={totals.salesExcludingTax} animationKey={animationKey} />, warning: false },
    { label: '含税合计', value: <AnimatedMoney value={totals.salesIncludingTax} animationKey={animationKey} />, warning: false },
    { label: '毛利', value: <AnimatedMoney value={grossProfit} animationKey={animationKey} />, warning: grossProfit !== null && grossProfit < 0 },
    { label: '整单毛利率', value: <AnimatedPercent value={margin} animationKey={animationKey} />, warning: lowMargin },
    { label: '采购成本（不含税）', value: <AnimatedMoney value={totals.costExcludingTax} animationKey={animationKey} />, warning: false },
    { label: '签核进度', value: order.currentStepLabel ? `${order.currentStepKey === 'sales' ? '业务负责人' : order.currentStepKey === 'engineering' ? '工程会签' : order.currentStepLabel} · ${statusLabel(order.status)}` : statusLabel(order.status), warning: false },
  ]
  return (
    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
      {metrics.map(({ label, value, warning }) => (
        <div key={`${label}-${animationKey}`} className={`min-w-0 bg-card px-4 py-3 sm:px-5 ${animationKey ? 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-700' : ''}`}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div title={typeof value === "string" ? value : undefined} className={`mt-1 truncate text-lg font-semibold tabular-nums ${warning ? 'text-red-600' : ''}`}>{value}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * Live totals plus the approval action for whoever currently owns the step, so
 * an approver never has to scroll to the bottom of the form.
 */
export function SummaryPanel({
  order,
  errorCount,
  busy,
  layout,
  animationKey = 0,
  onApprove,
  onReject,
  onShowErrors,
}: {
  order: MrOrder
  errorCount: number
  busy: boolean
  layout: 'rail' | 'bar'
  animationKey?: number
  onApprove: () => void
  onReject: () => void
  onShowErrors: () => void
}) {
  const totals = order.totals || {}
  const margin = totals.marginRate
  const lowMargin = margin !== null && margin !== undefined && Number(margin) < 15
  const canApprove = Boolean(order.permissions?.canApprove)
  const rail = layout === 'rail'
  const rows = [
    { label: '未税总计', value: <AnimatedMoney value={totals.salesExcludingTax} animationKey={animationKey} />, warn: false },
    { label: '销售税额', value: <AnimatedMoney value={totals.vat} animationKey={animationKey} />, warn: false },
    { label: '含税总计', value: <AnimatedMoney value={totals.salesIncludingTax} animationKey={animationKey} />, warn: false },
    { label: '采购成本（不含税）', value: <AnimatedMoney value={totals.costExcludingTax} animationKey={animationKey} />, warn: false },
    { label: '整单毛利率', value: <AnimatedPercent value={margin} animationKey={animationKey} />, warn: lowMargin },
  ]

  return (
    <div className={rail ? 'space-y-3 border-t p-3' : 'flex items-center gap-3 overflow-x-auto px-4 py-2'}>
      <dl className={rail ? 'space-y-1.5' : 'flex shrink-0 items-center gap-4'}>
        {rows.map(({ label, value, warn }) => (
          <div key={`${label}-${animationKey}`} className={`${rail ? 'flex items-baseline justify-between gap-2' : 'shrink-0'} ${animationKey ? 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-700' : ''}`}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${warn ? 'text-red-600' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {lowMargin ? (
        <p className={`flex items-start gap-1.5 text-xs text-amber-700 ${rail ? '' : 'hidden shrink-0 sm:flex'}`}>
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          毛利率低于 15%，签核流程须包含副总经理步骤。
        </p>
      ) : null}

      {errorCount ? (
        <button
          type="button"
          onClick={onShowErrors}
          className={`flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline ${rail ? 'w-full' : 'shrink-0'}`}
        >
          <AlertTriangle className="size-3.5" />
          {errorCount} 个字段待完善，点击查看
        </button>
      ) : null}

      {order.currentStepLabel ? (
        <div className={`text-xs text-muted-foreground ${rail ? 'border-t pt-3' : 'shrink-0 whitespace-nowrap'}`}>
          当前签核步骤：<span className="font-medium text-foreground">{order.currentStepKey === 'sales' ? '业务负责人' : order.currentStepLabel}</span>
        </div>
      ) : null}

      {canApprove ? (
        <div className={rail ? 'flex flex-col gap-2' : 'ml-auto flex shrink-0 gap-2'}>
          <Button size="sm" disabled={busy} onClick={onApprove}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}同意签核
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>驳回</Button>
        </div>
      ) : null}
    </div>
  )
}
