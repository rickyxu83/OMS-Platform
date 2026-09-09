import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createMrLayoutRule, deleteMrLayoutRule, deleteRecognitionRule, listMrLayoutRules, listRecognitionRules, updateMrLayoutRule, updateRecognitionRule } from '../client'
import type { MrLayoutRule, MrRecognitionRule } from '../types'

/**
 * 识别版式规则管理（学习闭环 · 阶段B）：
 * 展示自动沉淀的候选规则（来源=学习）与手动规则，管理员可确认启用/停用、手动新增、删除。
 */
export function LayoutRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [items, setItems] = useState<MrLayoutRule[]>([])
  const [coachRules, setCoachRules] = useState<MrRecognitionRule[]>([])
  const [tab, setTab] = useState<'layout' | 'coach'>('layout')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filePattern, setFilePattern] = useState('')
  const [vendor, setVendor] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMrLayoutRules()
      setItems(data.items || [])
      const coach = await listRecognitionRules()
      setCoachRules(coach.items || [])
    } catch (err) {
      toast.error((err as Error).message || '规则加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) void load() }, [open, load])

  const create = async () => {
    if (!filePattern.trim() || !vendor.trim()) return
    setSaving(true)
    try {
      await createMrLayoutRule({ filePattern: filePattern.trim(), vendor: vendor.trim() })
      setFilePattern('')
      setVendor('')
      toast.success('已新增规则并启用')
      await load()
    } catch (err) {
      toast.error((err as Error).message || '新增失败')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (rule: MrLayoutRule) => {
    setSaving(true)
    try {
      await updateMrLayoutRule(rule.id, { enabled: !rule.enabled })
      toast.success(rule.enabled ? '已停用' : '已启用')
      await load()
    } catch (err) {
      toast.error((err as Error).message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rule: MrLayoutRule) => {
    if (!window.confirm(`确定删除规则「${rule.filePattern} → ${rule.vendor}」吗？`)) return
    setSaving(true)
    try {
      await deleteMrLayoutRule(rule.id)
      toast.success('已删除')
      await load()
    } catch (err) {
      toast.error((err as Error).message || '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const toggleCoach = async (rule: MrRecognitionRule) => {
    setSaving(true)
    try {
      await updateRecognitionRule(rule.id, { enabled: !rule.enabled })
      toast.success(rule.enabled ? '已停用' : '已启用')
      await load()
    } catch (err) {
      toast.error((err as Error).message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const removeCoach = async (rule: MrRecognitionRule) => {
    if (!window.confirm(`确定删除规则「${rule.ruleText}」吗？`)) return
    setSaving(true)
    try {
      await deleteRecognitionRule(rule.id)
      toast.success('已删除')
      await load()
    } catch (err) {
      toast.error((err as Error).message || '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const scopeLabel = (rule: MrRecognitionRule) => {
    const base = rule.scopeType === 'category' ? '品类' : rule.scopeType === 'vendor' ? '供应商' : '全局'
    return rule.scopeValue ? `${base}：${rule.scopeValue}` : base
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>识别规则</DialogTitle>
          <DialogDescription>
            版式规则：系统从人工修正记录中自动学习「文件名模式 → 供应商」。教练规则：销售在报价校对页通过「效果不对？告诉 AI」沉淀的识别效果规则，创建即生效，发现误配时可随时停用或删除。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b">
          <button type="button" onClick={() => setTab('layout')} className={`px-3 py-1.5 text-sm ${tab === 'layout' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>版式规则</button>
          <button type="button" onClick={() => setTab('coach')} className={`px-3 py-1.5 text-sm ${tab === 'coach' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>教练规则{coachRules.length ? `（${coachRules.length}）` : ''}</button>
        </div>

        {tab === 'coach' ? (
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>规则</TableHead>
                  <TableHead>作用范围</TableHead>
                  <TableHead className="w-[100px] text-center">执行方式</TableHead>
                  <TableHead className="w-[90px] text-center">命中次数</TableHead>
                  <TableHead className="w-[80px] text-center">状态</TableHead>
                  <TableHead className="w-[110px] text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !coachRules.length ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />加载中…</TableCell></TableRow>
                ) : null}
                {!loading && !coachRules.length ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无规则；在报价导入校对页点「效果不对？告诉 AI」，满意后沉淀即出现在这里</TableCell></TableRow>
                ) : null}
                {coachRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.ruleText}</TableCell>
                    <TableCell>{scopeLabel(rule)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{rule.actionType === 'summarize_components' ? '组件摘要' : '提示词'}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{rule.matchCount}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={rule.enabled ? 'default' : 'secondary'}>{rule.enabled ? '已启用' : '已停用'}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="outline" size="sm" disabled={saving} onClick={() => void toggleCoach(rule)}>
                        {rule.enabled ? '停用' : '启用'}
                      </Button>
                      <Button variant="ghost" size="icon" title="删除" disabled={saving} onClick={() => void removeCoach(rule)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
        <>

        <div className="flex items-center gap-2">
          <Input value={filePattern} onChange={(event) => setFilePattern(event.target.value)} placeholder="文件名模式（如：宽泰 / 石洛）" className="max-w-[220px]" />
          <Input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="供应商全称" className="flex-1" />
          <Button onClick={() => void create()} disabled={saving || !filePattern.trim() || !vendor.trim()}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            新增
          </Button>
          <Button variant="outline" size="icon" title="刷新" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件名模式</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead className="w-[90px] text-center">命中次数</TableHead>
                <TableHead className="w-[80px] text-center">来源</TableHead>
                <TableHead className="w-[80px] text-center">状态</TableHead>
                <TableHead className="w-[110px] text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !items.length ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />加载中…</TableCell></TableRow>
              ) : null}
              {!loading && !items.length ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无规则；人工修正识别结果达到 3 次后会自动生成并启用规则</TableCell></TableRow>
              ) : null}
              {items.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.filePattern}</TableCell>
                  <TableCell>{rule.vendor}</TableCell>
                  <TableCell className="text-center">{rule.matchCount}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={rule.source === 'auto' ? 'secondary' : 'default'}>{rule.source === 'auto' ? '学习' : '手动'}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={rule.enabled ? 'default' : 'secondary'}>{rule.enabled ? '已启用' : '已停用'}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => void toggle(rule)}>
                      {rule.enabled ? '停用' : '启用'}
                    </Button>
                    <Button variant="ghost" size="icon" title="删除" disabled={saving} onClick={() => void remove(rule)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
