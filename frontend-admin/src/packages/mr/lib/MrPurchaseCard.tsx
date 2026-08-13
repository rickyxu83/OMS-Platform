import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, ClipboardPen, Loader2, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { skipMrPurchase, submitMrPurchase } from '../client'
import type { MrOrder } from '../types'
import { SectionCard } from './mr-ui'

const PURCHASE_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: '待采购填写', className: 'border-amber-200 bg-amber-100 text-amber-800' },
  done: { label: '采购完成', className: 'border-emerald-200 bg-emerald-100 text-emerald-800' },
  skipped: { label: '无需采购', className: 'border-zinc-200 bg-zinc-100 text-zinc-600' },
}

function dateTime(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

export function MrPurchaseCard({ order, onChanged }: { order: MrOrder; onChanged: (next: MrOrder) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [batchNo, setBatchNo] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipNote, setSkipNote] = useState('')

  const items = order.items || []
  const status = String(order.purchaseStatus || '')
  const editable = Boolean(order.permissions?.canPurchase) && ['pending', 'done'].includes(status)

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const item of items) next[String(item.id)] = item.purchaseOrderNo || ''
    setDraft(next)
    setNote(order.purchaseNote || '')
  }, [order.id, order.purchaseStatus, order.purchasedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!status || order.status !== 'approved') return null
  const statusMeta = PURCHASE_STATUS[status] || { label: status, className: 'border-zinc-200 bg-zinc-100 text-zinc-600' }

  const applyBatch = () => {
    const value = batchNo.trim()
    if (!value) return
    setDraft((current) => Object.fromEntries(items.map((item) => [String(item.id), value])))
  }

  const submit = async () => {
    if (!order.id) return
    setBusy(true)
    try {
      const next = await submitMrPurchase(order.id, {
        items: items.map((item) => ({ id: item.id as string | number, purchaseOrderNo: (draft[String(item.id)] || '').trim() })),
        note: note.trim() || undefined,
      })
      toast.success('采购订单号已提交')
      window.dispatchEvent(new Event('mr:approval-changed'))
      onChanged(next)
    } catch (error) {
      toast.error((error as Error).message || '采购订单号提交失败')
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    if (!order.id) return
    setBusy(true)
    try {
      const next = await skipMrPurchase(order.id, skipNote.trim() || undefined)
      toast.success('已标记为无需采购')
      setSkipOpen(false)
      window.dispatchEvent(new Event('mr:approval-changed'))
      onChanged(next)
    } catch (error) {
      toast.error((error as Error).message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      id="purchase"
      title="采购订单号"
      icon={ShoppingCart}
      description="MR 签核通过后，由采购为每个品项填写向供应商下单的采购订单号。"
      actions={<span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>{statusMeta.label}</span>}
    >
      <div className="space-y-3 text-sm">
        {status === 'pending' && order.purchaseAssigneeName ? (
          <p className="text-muted-foreground">当前采购负责人：{order.purchaseAssigneeName}</p>
        ) : null}
        {status === 'pending' && order.purchaseAssignmentError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{order.purchaseAssignmentError}</p>
        ) : null}
        {['done', 'skipped'].includes(status) ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            {status === 'done' ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Ban className="size-4 text-zinc-500" />}
            {order.purchasedByName || '-'} · {dateTime(order.purchasedAt)}
            {order.purchaseNote ? <span className="text-foreground">（{order.purchaseNote}）</span> : null}
          </p>
        ) : null}

        {status !== 'skipped' ? (
          <div className="overflow-hidden rounded-lg border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">项目</TableHead>
                  <TableHead>品名 / 描述</TableHead>
                  <TableHead className="w-28">供应商</TableHead>
                  <TableHead className="w-72">采购订单号</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell className="text-center">{index + 1}</TableCell>
                    <TableCell>
                      <div className="break-words font-medium">{item.name || '-'}</div>
                      {item.description ? <div className="line-clamp-2 break-words text-xs text-muted-foreground" title={item.description}>{item.description}</div> : null}
                    </TableCell>
                    <TableCell className="break-words">{item.vendor || '-'}</TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          value={draft[String(item.id)] ?? ''}
                          placeholder="采购订单号"
                          aria-label={`第 ${index + 1} 项采购订单号`}
                          onChange={(event) => setDraft((current) => ({ ...current, [String(item.id)]: event.target.value }))}
                        />
                      ) : (
                        <span>{item.purchaseOrderNo || '-'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {editable ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} placeholder="整单同一采购订单号" className="w-64" />
              <Button type="button" variant="outline" onClick={applyBatch} disabled={busy || !batchNo.trim()}>批量填入</Button>
            </div>
            <Textarea rows={2} value={note} placeholder="采购备注（选填）" onChange={(event) => setNote(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void submit()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ClipboardPen className="mr-2 size-4" />}提交采购订单号
              </Button>
              {status === 'pending' ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setSkipOpen(true)}>标记无需采购</Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标记无需采购</DialogTitle>
            <DialogDescription>确认该 MR 整单无需向供应商下单？标记后采购任务关闭，业务负责人会收到知会。</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={skipNote} placeholder="说明（选填）" onChange={(event) => setSkipNote(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipOpen(false)}>取消</Button>
            <Button disabled={busy} onClick={() => void skip()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}确认无需采购</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
