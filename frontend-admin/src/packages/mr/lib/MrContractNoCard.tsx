import { useEffect, useState } from 'react'
import { FileSignature, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { submitMrContractNo } from '../client'
import type { MrOrder } from '../types'
import { SectionCard } from './mr-ui'

/**
 * 合同编号补填卡片：有合同但签核时合同流程未走完（暂无编号）的 MR，
 * 签核通过后采购挂起（waiting_contract），由助理在此补填编号，提交后立即流转采购。
 */
export function MrContractNoCard({ order, onChanged }: { order: MrOrder; onChanged: (next: MrOrder) => void }) {
  const [contractNo, setContractNo] = useState('')
  const [busy, setBusy] = useState(false)

  const status = String(order.purchaseStatus || '')
  const editable = Boolean(order.permissions?.canFillContractNo) && status === 'waiting_contract'

  useEffect(() => {
    setContractNo(order.contractNo || '')
  }, [order.id, order.purchaseStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status !== 'waiting_contract' || order.status !== 'approved') return null

  const submit = async () => {
    if (!order.id) return
    const value = contractNo.trim()
    if (!value) {
      toast.error('请填写合同编号')
      return
    }
    setBusy(true)
    try {
      const next = await submitMrContractNo(order.id, { contractNo: value })
      toast.success('合同编号已补填，MR 已流转采购')
      window.dispatchEvent(new Event('mr:approval-changed'))
      onChanged(next)
    } catch (error) {
      toast.error((error as Error).message || '合同编号补填失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      id="contract-no"
      title="合同编号补填"
      icon={FileSignature}
      description="该 MR 有合同，但签核时合同流程尚未走完。补填合同编号后立即流转采购；补填前采购环节保持挂起。"
      actions={<span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">待合同编号</span>}
    >
      <div className="space-y-3 text-sm">
        {order.purchaseAssigneeName ? (
          <p className="text-muted-foreground">当前补填负责人（助理）：{order.purchaseAssigneeName}</p>
        ) : null}
        {order.purchaseAssignmentError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{order.purchaseAssignmentError}</p>
        ) : null}
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={contractNo}
              onChange={(event) => setContractNo(event.target.value)}
              placeholder="请输入已签核完成的合同编号"
              className="w-80"
              aria-label="合同编号"
            />
            <Button type="button" disabled={busy || !contractNo.trim()} onClick={() => void submit()}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSignature className="mr-2 size-4" />}确认补填并流转采购
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">合同流程完成后，由助理在此补填合同编号；补填前本单不会流转到采购。</p>
        )}
      </div>
    </SectionCard>
  )
}
