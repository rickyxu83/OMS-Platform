import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MrOrder } from '../types'

function time(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : ''
}

export function ApprovalPanel({ order, busy, onApprove, onReject }: { order: MrOrder; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const approvals = order.approvals || []
  const currentCycle = approvals.reduce((max, approval) => Math.max(max, Number(approval.cycle) || 0), 0)
  const previous = (order.approvalHistory || []).filter((approval) => Number(approval.cycle) < currentCycle && approval.action !== 'skipped')
  if (!approvals.length && order.status === 'draft') return <div className="py-8 text-center text-sm text-muted-foreground">提交后生成签核链</div>

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-5">
        {approvals.map((approval) => {
          const pending = !approval.action && order.currentStepKey === approval.stepKey
          return (
            <div key={approval.stepKey} className={`min-h-24 border-l-4 p-3 ${approval.action === 'approve' ? 'border-emerald-500 bg-emerald-50' : approval.action === 'reject' ? 'border-red-500 bg-red-50' : pending ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{approval.stepLabel}</div>
                {approval.action === 'approve' ? <CheckCircle2 className="size-4 text-emerald-600" /> : approval.action === 'reject' ? <XCircle className="size-4 text-red-600" /> : <Clock3 className="size-4 text-muted-foreground" />}
              </div>
              <div className="mt-3 text-sm">{approval.approverName || (pending ? '待签核' : '待流转')}</div>
              <div className="mt-1 text-xs text-muted-foreground">{time(approval.decidedAt)}</div>
              {approval.reason ? <div className="mt-2 text-xs text-red-700">{approval.reason}</div> : null}
            </div>
          )
        })}
      </div>
      {previous.length ? <details className="border-y py-2 text-sm"><summary className="cursor-pointer font-medium">历史签核记录（{previous.length}）</summary><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{previous.map((approval) => <div key={`${approval.cycle}-${approval.id}`} className="bg-slate-50 p-2"><div>第 {approval.cycle} 轮 · {approval.stepLabel}</div><div className={approval.action === 'reject' ? 'text-red-700' : 'text-emerald-700'}>{approval.action === 'reject' ? '驳回' : '同意'} · {approval.approverName || '-'}</div><div className="text-xs text-muted-foreground">{time(approval.decidedAt)} {approval.reason || ''}</div></div>)}</div></details> : null}
      {order.currentStepLabel ? <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3"><div className="text-sm">当前步骤：<Badge variant="outline">{order.currentStepLabel}</Badge></div>{order.permissions?.canApprove ? <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onReject}>驳回</Button><Button disabled={busy} onClick={onApprove}>同意签核</Button></div> : null}</div> : null}
    </div>
  )
}
