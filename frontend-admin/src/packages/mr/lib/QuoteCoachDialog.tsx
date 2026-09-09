import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquareText, Send, Sparkles, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { quoteCoachChat, quoteCoachDistill } from '../client'
import type { QuoteCoachMessage, QuoteRuleCard } from '../types'

const SCOPE_LABELS: Record<string, string> = { category: '品类', vendor: '供应商', global: '全局' }
const FIELD_LABELS: Record<string, string> = { name: '品名', description: '描述', part_no: '料号', partNo: '料号', oemSpec: '料号', vendor: '供应商' }

/**
 * 规则教练（spec 009 P1）：销售用自然语言描述期望的识别效果，AI 多轮对话调优，
 * 满意后蒸馏为全局规则卡（用户确认后入库，立即生效；设置页可停用）。
 *
 * 会话不落库；AI 只输出变换指令，由后端代码执行后返回新预览。
 */
export function QuoteCoachDialog({
  orderId,
  open,
  items,
  onOpenChange,
  onItemsTransformed,
  onUndo,
  canUndo = false,
  canRestore = false,
  onRestoreAll,
}: {
  orderId: string | number
  open: boolean
  /** 当前预览品项（教练快照发 AI；变换结果回写预览） */
  items: object[]
  onOpenChange: (open: boolean) => void
  onItemsTransformed: (items: object[]) => void
  /** 撤销上一步变换（父组件持有历史栈） */
  onUndo?: () => void
  canUndo?: boolean
  /** 全部恢复原样：回到对话打开时的品项快照 */
  canRestore?: boolean
  onRestoreAll?: () => void
}) {
  const [messages, setMessages] = useState<QuoteCoachMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState<QuoteRuleCard | null>(null)
  const [distilling, setDistilling] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [ruleScope, setRuleScope] = useState('')
  const [ruleText, setRuleText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMessages([])
      setDraft(null)
      setInput('')
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const result = await quoteCoachChat(orderId, { items, messages: next })
      setMessages([...next, { role: 'assistant', content: result.reply, changes: result.changes?.length ? result.changes : undefined }])
      if (result.transformApplied && result.items) {
        onItemsTransformed(result.items)
        toast.success(`已调整 ${result.changes.length} 处，关闭本窗口可在下方预览中查看完整效果；不满意可继续描述或点「撤销上一步」`)
      }
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: `出错了：${(err as Error).message || '请再试一次'}` }])
    } finally {
      setSending(false)
    }
  }

  const distill = async () => {
    if (distilling || messages.length < 2) return
    setDistilling(true)
    try {
      const result = await quoteCoachDistill(orderId, { items, messages })
      setDraft(result.draft)
      setRuleScope(result.draft.scopeValue || '')
      setRuleText(result.draft.ruleText || '')
    } catch (err) {
      toast.error((err as Error).message || '规则提炼失败')
    } finally {
      setDistilling(false)
    }
  }

  const saveRule = async () => {
    if (!draft || savingRule) return
    setSavingRule(true)
    try {
      await quoteCoachDistill(orderId, {
        items,
        messages,
        confirmedCard: { ...draft, scopeValue: ruleScope.trim(), ruleText: ruleText.trim() },
      })
      toast.success('已加入待确认规则：保存/导入的修改也会自动总结规则，统一在 MR 列表「识别规则 → 教练规则」中确认启用')
      setDraft(null)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message || '规则保存失败')
    } finally {
      setSavingRule(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquareText className="size-5" />识别效果教练</DialogTitle>
          <DialogDescription>
            说人话描述想要的效果，AI 立即调整预览；满意后沉淀为规则，以后的单子自动照此识别。
          </DialogDescription>
        </DialogHeader>

        {!messages.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {['明细只要 CPU/内存/硬盘', '品名不要带料号', '供应商改成简称'].map((hint) => (
              <button key={hint} type="button" onClick={() => setInput(hint)}
                className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                {hint}
              </button>
            ))}
          </div>
        ) : null}

        <div ref={scrollRef} className="min-h-[240px] flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3">
          {!messages.length ? (
            <div className="flex h-full items-center justify-center py-16 text-center text-sm text-muted-foreground">
              <div>
                <Sparkles className="mx-auto mb-2 size-6" />
                描述你碰到的问题或想要的效果
              </div>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background'}`}>
                {message.content}
                {message.changes?.length ? (
                  <div className="mt-2 space-y-1 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                    <div className="font-medium">本次实际改了 {message.changes.length} 处：</div>
                    {message.changes.slice(0, 8).map((change, changeIndex) => (
                      <div key={changeIndex} className="leading-snug">
                        <span className="font-medium">第 {change.index + 1} 项 · {FIELD_LABELS[change.field] || change.field}</span>
                        <div className="mt-0.5 line-through opacity-60">{change.from || '（空）'}</div>
                        <div>{change.to || '（空）'}</div>
                      </div>
                    ))}
                    {message.changes.length > 8 ? <div>… 共 {message.changes.length} 处</div> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start"><div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-3.5 animate-spin" />思考中…</div></div>
          ) : null}
        </div>

        {draft ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
              规则卡确认
              <Badge variant="outline">{SCOPE_LABELS[draft.scopeType] || draft.scopeType}</Badge>
              <Badge variant="outline">{draft.actionType === 'summarize_components' ? '组件摘要' : '提示词规则'}</Badge>
            </div>
            {draft.scopeType !== 'global' ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-muted-foreground">作用范围关键词（/ 分隔多个）：</span>
                <Input value={ruleScope} onChange={(event) => setRuleScope(event.target.value)} className="h-8" />
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">规则描述：</span>
              <Input value={ruleText} onChange={(event) => setRuleText(event.target.value)} className="h-8" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>再改改</Button>
              <Button size="sm" disabled={savingRule || !ruleText.trim()} onClick={() => void saveRule()}>
                {savingRule ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}加入待确认规则
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {canRestore ? (
            <Button variant="ghost" size="sm" title="放弃本轮对话的全部调整，回到对话打开时的品项" onClick={() => onRestoreAll?.()}>
              全部恢复原样
            </Button>
          ) : null}
          {canUndo ? (
            <Button variant="ghost" size="sm" title="撤销上一步 AI 对预览的调整" onClick={() => onUndo?.()}>
              <Undo2 className="mr-1 size-4" />撤销上一步
            </Button>
          ) : null}
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void send() }}
            placeholder="描述你想要的效果…"
            disabled={sending}
          />
          <Button onClick={() => void send()} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}发送
          </Button>
          <Button
            variant="outline"
            disabled={distilling || messages.length < 2}
            title="把本次对话蒸馏为长期规则（沉淀前会给你确认规则卡）"
            onClick={() => void distill()}
          >
            {distilling ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}沉淀为规则
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
