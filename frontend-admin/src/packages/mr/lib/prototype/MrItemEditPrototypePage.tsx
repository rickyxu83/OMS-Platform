import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Layers3, ListChecks, Pencil, SlidersHorizontal, Table2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Item = {
  id: number
  group: string
  name: string
  spec: string
  vendor: string
  po: string
  warranty: string
  install: string
  qty: number
}

const INITIAL_ITEMS: Item[] = [
  { id: 1, group: '高速磁带机', name: 'IBM TS4300 3U Tape Library', spec: 'TS4300', vendor: '上海石洛信息科技有限公司', po: 'PO-TS-01', warranty: '3年7×24硬件保固', install: '敦阳', qty: 1 },
  { id: 2, group: '高速磁带机', name: 'LTO 8 HH Fibre Channel Drive', spec: 'LTO8-FC', vendor: '上海石洛信息科技有限公司', po: 'PO-TS-01', warranty: '3年7×24硬件保固', install: '敦阳', qty: 2 },
  { id: 3, group: '高速磁带机', name: 'Rack Mount Kit TS4300', spec: 'C9E24A', vendor: '上海石洛信息科技有限公司', po: 'PO-TS-01', warranty: '3年7×24硬件保固', install: '敦阳', qty: 1 },
  { id: 4, group: '高速磁带机', name: 'LTO Ultrium 8 Data Cartridges', spec: 'Q2078A', vendor: '上海石洛信息科技有限公司', po: 'PO-TS-01', warranty: '3年7×24硬件保固', install: '敦阳', qty: 60 },
  { id: 5, group: 'FortiADC续保', name: '24x7 FortiCare Contract', spec: 'FC-10-A100F-247-02-12', vendor: '上海明途计算机科技有限公司', po: 'PO-FAD-01', warranty: '1年原厂维保', install: 'NO', qty: 1 },
  { id: 6, group: 'FortiADC续保', name: 'FortiADC-100F Support', spec: 'FC-10-A100F-247-02-DD', vendor: '上海明途计算机科技有限公司', po: 'PO-FAD-01', warranty: '1年原厂维保', install: 'NO', qty: 1 },
  { id: 7, group: '网络设备', name: '交换机', spec: 'WS-C4506-E', vendor: '迈瑞', po: 'PO-NET-02', warranty: '', install: '甲方责任', qty: 2 },
  { id: 8, group: '网络设备', name: '无线控制器', spec: 'AIR-CT5508-50-K9', vendor: '迈瑞', po: 'PO-NET-02', warranty: '', install: '甲方责任', qty: 1 },
  { id: 9, group: '网络设备', name: 'FortiCare续保服务', spec: 'FC-10-100F', vendor: '上海明途计算机科技有限公司', po: 'PO-NET-03', warranty: '', install: 'NO', qty: 1 },
]

const VARIANTS = [
  { key: 'A', label: 'A · 直接批改表格', icon: Table2 },
  { key: 'B', label: 'B · 右侧批量操作台', icon: SlidersHorizontal },
  { key: 'C', label: 'C · 分组编辑', icon: Layers3 },
]

function Switcher({ current, onChange }: { current: string; onChange: (key: string) => void }) {
  const index = Math.max(0, VARIANTS.findIndex((item) => item.key === current))
  const move = (delta: number) => onChange(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key)
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-zinc-950 px-2 py-2 text-white shadow-xl">
      <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/15 hover:text-white" title="上一个方案" onClick={() => move(-1)}><ArrowLeft className="size-4" /></Button>
      <button type="button" className="min-w-48 px-3 text-center text-xs font-medium" onClick={() => move(1)}>{VARIANTS[index].label}</button>
      <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/15 hover:text-white" title="下一个方案" onClick={() => move(1)}><ArrowRight className="size-4" /></Button>
    </div>
  )
}

function Shell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="icon" title="返回 MR" onClick={() => navigate('/mr')}><ArrowLeft className="size-4" /></Button>
          <div><h1 className="font-semibold">{title}</h1><p className="text-xs text-muted-foreground">{subtitle}</p></div>
          <span className="ml-auto rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">PROTOTYPE · 不保存</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{children}</main>
    </div>
  )
}

function ItemSummary({ item }: { item: Item }) {
  return <div className="min-w-0"><div className="font-medium">{item.name}</div><div className="mt-1 break-all text-xs text-muted-foreground">{item.spec} · 数量 {item.qty}</div></div>
}

function VariantA({ items, setItems }: { items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>> }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const update = (id: number, field: keyof Item, value: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
  const batch = (field: keyof Item, value: string) => setItems((current) => current.map((item) => selected.has(item.id) ? { ...item, [field]: value } : item))
  return <Shell title="品项编辑 · 表格批改" subtitle="适合少量字段、逐行快速修改">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">所有品项</h2><p className="text-sm text-muted-foreground">字段直接铺在表格内，Tab 可以连续移动。</p></div><span className="text-sm text-muted-foreground">已选 {selected.size} 项</span></div>
    <div className="overflow-x-auto border bg-background"><table className="w-full min-w-[1180px] text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="w-12 p-3">选</th><th className="min-w-64 p-3">品项</th><th className="min-w-48 p-3">厂商</th><th className="min-w-36 p-3">采购单号</th><th className="min-w-44 p-3">保固/服务</th><th className="min-w-32 p-3">明细装机</th></tr></thead><tbody className="divide-y">
      {items.map((item) => <tr key={item.id} className={selected.has(item.id) ? 'bg-primary/5' : ''}><td className="p-3 align-top"><Checkbox checked={selected.has(item.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); checked ? next.add(item.id) : next.delete(item.id); return next })} /></td><td className="p-3 align-top"><ItemSummary item={item} /></td><td className="p-2"><Input value={item.vendor} onChange={(event) => update(item.id, 'vendor', event.target.value)} /></td><td className="p-2"><Input value={item.po} onChange={(event) => update(item.id, 'po', event.target.value)} /></td><td className="p-2"><Input value={item.warranty} onChange={(event) => update(item.id, 'warranty', event.target.value)} /></td><td className="p-2"><Input value={item.install} onChange={(event) => update(item.id, 'install', event.target.value)} /></td></tr>)}
    </tbody></table></div>
    {selected.size ? <div className="mt-4 flex flex-wrap items-center gap-2 border bg-background p-3"><span className="text-sm font-medium">批量填入：</span>{(['vendor', 'po', 'warranty', 'install'] as const).map((field) => <Input key={field} className="w-40" placeholder={{ vendor: '厂商', po: '采购单号', warranty: '保固/服务', install: '明细装机' }[field]} onBlur={(event) => { if (event.target.value) batch(field, event.target.value) }} />)}<span className="text-xs text-muted-foreground">输入后离开字段即应用到已选项</span></div> : null}
  </Shell>
}

function VariantB({ items, setItems }: { items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>> }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sourceId, setSourceId] = useState(items[0]?.id || 0)
  const [fields, setFields] = useState({ vendor: true, po: true, warranty: true, install: true })
  const source = items.find((item) => item.id === sourceId)
  const apply = () => { if (!source || !selected.size) return; setItems((current) => current.map((item) => { if (!selected.has(item.id) || item.id === source.id) return item; return { ...item, ...(fields.vendor ? { vendor: source.vendor } : {}), ...(fields.po ? { po: source.po } : {}), ...(fields.warranty ? { warranty: source.warranty } : {}), ...(fields.install ? { install: source.install } : {}) } })) }
  return <Shell title="品项编辑 · 批量操作台" subtitle="适合 30 个品项重复填充，目标和来源分开管理">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="border bg-background"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">选择目标品项</h2><p className="text-sm text-muted-foreground">左侧只负责选择，所有批量动作集中在右侧。</p></div><Button variant="outline" size="sm" onClick={() => setSelected(new Set(items.map((item) => item.id)))}><ListChecks className="mr-2 size-4" />全选</Button></div><div className="divide-y">{items.map((item) => <label key={item.id} className={`flex cursor-pointer gap-3 p-4 ${selected.has(item.id) ? 'bg-primary/5' : 'hover:bg-muted/30'}`}><Checkbox checked={selected.has(item.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); checked ? next.add(item.id) : next.delete(item.id); return next })} /><ItemSummary item={item} /></label>)}</div></section><aside className="h-fit border bg-background p-4 xl:sticky xl:top-20"><div className="mb-4 flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /><h2 className="font-semibold">批量操作台</h2></div><label className="mb-2 block text-sm font-medium">复制来源</label><select className="mb-5 h-9 w-full border bg-background px-3 text-sm" value={sourceId} onChange={(event) => setSourceId(Number(event.target.value))}>{items.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select><div className="space-y-3 border-y py-4"><p className="text-xs text-muted-foreground">复制哪些字段？金额字段始终不会被覆盖。</p>{(['vendor', 'po', 'warranty', 'install'] as const).map((field) => <label key={field} className="flex items-center gap-2 text-sm"><Checkbox checked={fields[field]} onCheckedChange={(checked) => setFields((current) => ({ ...current, [field]: Boolean(checked) }))} />{{ vendor: '厂商', po: '采购单号', warranty: '保固/服务', install: '明细装机' }[field]}</label>)}</div><Button className="mt-4 w-full" disabled={!selected.size || !source} onClick={apply}><Check className="mr-2 size-4" />应用到 {selected.size} 项</Button><p className="mt-3 text-xs text-muted-foreground">建议：先选一项作为正确模板，再勾选需要同步的目标。</p></aside></div>
  </Shell>
}

function VariantC({ items, setItems }: { items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>> }) {
  const groups = useMemo(() => [...new Set(items.map((item) => item.group))], [items])
  const [activeGroup, setActiveGroup] = useState(groups[0] || '')
  const [editing, setEditing] = useState<Record<string, Partial<Item>>>({})
  const groupItems = items.filter((item) => item.group === activeGroup)
  const draft = editing[activeGroup] || groupItems[0] || {}
  const apply = () => setItems((current) => current.map((item) => item.group === activeGroup ? { ...item, ...draft } : item))
  return <Shell title="品项编辑 · 分组编辑" subtitle="先处理设备/服务组的公共资料，再修改少数例外项">
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"><nav className="h-fit border bg-background p-2 lg:sticky lg:top-20"><div className="px-3 py-2 text-xs font-medium text-muted-foreground">品项分组</div>{groups.map((group) => <button key={group} type="button" className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm ${group === activeGroup ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted/40'}`} onClick={() => setActiveGroup(group)}><span>{group}</span><span className="text-xs text-muted-foreground">{items.filter((item) => item.group === group).length}</span></button>)}</nav><section className="space-y-4"><div className="border bg-background p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{activeGroup} · 公共字段</h2><p className="text-sm text-muted-foreground">修改后应用到本组 {groupItems.length} 项。</p></div><Button onClick={apply}><Check className="mr-2 size-4" />应用到本组</Button></div><div className="grid gap-3 md:grid-cols-2"><label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">厂商</span><Input value={String(draft.vendor || '')} onChange={(event) => setEditing((current) => ({ ...current, [activeGroup]: { ...draft, vendor: event.target.value } }))} /></label><label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">采购单号</span><Input value={String(draft.po || '')} onChange={(event) => setEditing((current) => ({ ...current, [activeGroup]: { ...draft, po: event.target.value } }))} /></label><label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">保固/服务</span><Input value={String(draft.warranty || '')} onChange={(event) => setEditing((current) => ({ ...current, [activeGroup]: { ...draft, warranty: event.target.value } }))} /></label><label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">明细装机</span><Input value={String(draft.install || '')} onChange={(event) => setEditing((current) => ({ ...current, [activeGroup]: { ...draft, install: event.target.value } }))} /></label></div></div><div className="border bg-background"><div className="border-b p-4"><h2 className="font-semibold">本组明细</h2><p className="text-sm text-muted-foreground">公共字段应用后，只有例外项需要单独修改。</p></div><div className="divide-y">{groupItems.map((item) => <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_160px_160px]"><ItemSummary item={item} /><Input value={item.warranty} aria-label={`${item.name} 保固`} onChange={(event) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, warranty: event.target.value } : candidate))} /><Input value={item.install} aria-label={`${item.name} 装机`} onChange={(event) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, install: event.target.value } : candidate))} /></div>)}</div></div></section></div>
  </Shell>
}

export function MrItemEditPrototypePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [items, setItems] = useState<Item[]>(INITIAL_ITEMS)
  const variant = params.get('variant') || 'A'
  const setVariant = (key: string) => navigate(`/mr/item-edit-prototype?variant=${key}`, { replace: true })
  const content = variant === 'B' ? <VariantB items={items} setItems={setItems} /> : variant === 'C' ? <VariantC items={items} setItems={setItems} /> : <VariantA items={items} setItems={setItems} />
  return <><div className="fixed right-4 top-20 z-40 rounded-md bg-zinc-900/85 px-3 py-1.5 text-xs font-medium text-white">编辑方式原型 · 修改不保存</div>{content}<Switcher current={variant} onChange={setVariant} /></>
}
