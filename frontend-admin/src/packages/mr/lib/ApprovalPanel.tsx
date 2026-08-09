import { Check, Clock3, Minus, X } from 'lucide-react'
import type { MrApproval, MrOrder } from '../types'

function time(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : ''
}
function displayStepLabel(approval: MrApproval) { return approval.stepKey === 'sales' ? '业务负责人' : approval.stepKey === 'engineering' ? '工程会签' : approval.stepLabel }

type StepState = 'approve' | 'reject' | 'skipped' | 'current' | 'waiting'

function stepState(approval: MrApproval, order: MrOrder): StepState {
  if (approval.action === 'approve' || approval.action === 'reject' || approval.action === 'skipped') return approval.action
  return order.currentStepKey === approval.stepKey ? 'current' : 'waiting'
}

const MARKERS: Record<StepState, { icon: typeof Check; dot: string; text: string; label: string }> = {
  approve: { icon: Check, dot: 'bg-emerald-600 text-white', text: 'text-emerald-700', label: '已同意' },
  reject: { icon: X, dot: 'bg-red-600 text-white', text: 'text-red-700', label: '已驳回' },
  skipped: { icon: Minus, dot: 'bg-slate-300 text-slate-600', text: 'text-muted-foreground', label: '不适用' },
  current: { icon: Clock3, dot: 'bg-amber-500 text-white', text: 'text-amber-700', label: '待签核' },
  waiting: { icon: Clock3, dot: 'bg-slate-200 text-slate-500', text: 'text-muted-foreground', label: '待流转' },
}

function projectedApprovals(order: MrOrder): MrApproval[] {
  const steps: Array<[string, string]> = [['assistant', '助理'], ['sales', '业务负责人']]
  if ((order.installOptions || []).includes('敦阳')) steps.push(['engineering', '工程会签'])
  steps.push(['supervisor', '处级单位'])
  const margin = order.totals?.marginRate
  const lowMargin = margin !== null && margin !== undefined && Number(margin) < 15
  if (Number(order.totals?.salesExcludingTax) > 750000 || lowMargin) steps.push(['vp', '副总经理'])
  return steps.map(([stepKey, stepLabel], index) => ({ seq: index + 1, stepKey, stepLabel }))
}

/** Approval timeline: vertical in the wide rail, card grid in the main workbench. */
export function ApprovalPanel({ order, layout = 'vertical' }: { order: MrOrder; layout?: 'vertical' | 'horizontal' }) {
  const savedApprovals = order.approvals || []
  const approvals = savedApprovals.length || !['draft', 'rejected'].includes(String(order.status || 'draft'))
    ? savedApprovals
    : projectedApprovals(order)
  const currentCycle = approvals.reduce((max, approval) => Math.max(max, Number(approval.cycle) || 0), 0)
  const previous = (order.approvalHistory || []).filter((approval) => Number(approval.cycle) < currentCycle && approval.action !== 'skipped')
  const horizontalColumns = approvals.length >= 5 ? 'xl:grid-cols-5' : approvals.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'

  if (!approvals.length) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        {order.status === 'draft' ? '提交后，系统将根据装机承担方与金额自动生成签核流程' : '暂无签核记录'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ol className={layout === 'horizontal' ? `grid gap-3 md:grid-cols-2 ${horizontalColumns}` : 'relative space-y-1'}>
        {approvals.map((approval, index) => {
          const state = stepState(approval, order)
          const marker = MARKERS[state]
          const Icon = marker.icon
          const last = index === approvals.length - 1
          return (
            <li key={approval.stepKey} className={layout === 'horizontal' ? `min-w-0 rounded-lg border p-3 ${state === 'current' ? 'border-amber-300 bg-amber-50' : 'bg-card'}` : 'flex gap-3'}>
              <div className={layout === 'horizontal' ? 'mb-2 flex items-center gap-2' : 'flex flex-col items-center'}>
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${marker.dot}`}>
                  <Icon className="size-3.5" />
                </span>
                {layout === 'vertical' && !last ? <span className="w-px flex-1 bg-border" aria-hidden="true" /> : null}
              </div>
              <div className={layout === 'horizontal' ? 'min-w-0' : `min-w-0 flex-1 ${last ? 'pb-0' : 'pb-4'} ${state === 'current' ? 'rounded-md bg-amber-50 px-2.5 py-1.5 -mt-1' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{displayStepLabel(approval)}</span>
                  <span className={`text-xs ${marker.text}`}>{marker.label}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  {approval.approverName || approval.assigneeName ? <span>{approval.approverName || `签核人：${approval.assigneeName}`}</span> : null}
                  {approval.decidedAt ? <span className="tabular-nums">{time(approval.decidedAt)}</span> : null}
                </div>
                {approval.reason ? <div className="mt-1 text-xs text-red-700">{approval.reason}</div> : null}
                {approval.assignmentError ? <div className="mt-1 text-xs text-red-700">{approval.assignmentError}</div> : null}
              </div>
            </li>
          )
        })}
      </ol>

      {previous.length ? (
        <details className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">历史签核记录（{previous.length}）</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {previous.map((approval) => (
              <div key={`${approval.cycle}-${approval.id}`} className="rounded-md bg-card p-2.5 text-xs">
                <div className="font-medium">第 {approval.cycle} 轮 · {displayStepLabel(approval)}</div>
                <div className={`mt-0.5 ${approval.action === 'reject' ? 'text-red-700' : 'text-emerald-700'}`}>
                  {approval.action === 'reject' ? '驳回' : '同意'} · {approval.approverName || '-'}
                </div>
                <div className="mt-0.5 text-muted-foreground tabular-nums">{time(approval.decidedAt)}</div>
                {approval.reason ? <div className="mt-1 text-muted-foreground">{approval.reason}</div> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}
