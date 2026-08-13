import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createMrLayoutRule, deleteMrLayoutRule, listMrLayoutRules, updateMrLayoutRule } from '../client'
import type { MrLayoutRule } from '../types'

/**
 * 识别版式规则管理（学习闭环 · 阶段B）：
 * 展示自动沉淀的候选规则（来源=学习）与手动规则，管理员可确认启用/停用、手动新增、删除。
 */
export function LayoutRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [items, setItems] = useState<MrLayoutRule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filePattern, setFilePattern] = useState('')
  const [vendor, setVendor] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMrLayoutRules()
      setItems(data.items || [])
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>识别版式规则</DialogTitle>
          <DialogDescription>
            系统会从人工修正记录中自动学习「文件名模式 → 供应商」规则；候选规则（来源：学习）需确认启用后才会作用于后续识别。也可手动新增规则（新增即启用）。
          </DialogDescription>
        </DialogHeader>

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
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无规则；人工修正识别结果达到 3 次后会自动生成候选规则</TableCell></TableRow>
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
                    <Badge variant={rule.enabled ? 'default' : 'secondary'}>{rule.enabled ? '已启用' : '待确认'}</Badge>
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
      </DialogContent>
    </Dialog>
  )
}
