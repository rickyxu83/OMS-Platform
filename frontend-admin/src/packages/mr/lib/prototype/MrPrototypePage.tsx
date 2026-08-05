// PROTOTYPE: Three MR form layouts, switchable with ?variant=A|B|C on /mr/prototype.
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight,
  CircleDollarSign, FileSpreadsheet, GripVertical, LayoutDashboard, ListChecks,
  Package, PanelLeft, Plus, Printer, ReceiptText, Save, Send, ShieldCheck,
  Trash2, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MrItem, MrOrder } from '../../types'

const VARIANTS = [
  { key: 'A', name: '流程向导', icon: ListChecks },
  { key: 'B', name: '交易工作台', icon: LayoutDashboard },
  { key: 'C', name: '单页目录', icon: PanelLeft },
] as const

const APPROVALS = [
  { label: '助理', detail: '李佳蓉', state: 'done' },
  { label: '业务', detail: '王志明', state: 'current' },
  { label: '工程会签', detail: '装机含敦阳', state: 'waiting' },
  { label: '处级单位', detail: '业务主管', state: 'waiting' },
  { label: '副总经理', detail: '毛利低于 15%', state: 'waiting' },
] as const

const MOCK_ORDER: MrOrder = {
  status: 'draft', customerName: '东阳实业股份有限公司', customerCode: 'TYC',
  contactName: '陈冠宇', salesOwnerName: '王志明', ctrlNo: 'MR-2026-0805-01',
  customerPo: 'PO-202608-038', fillDate: '2026-08-05', latestDeliveryDate: '2026-09-15',
  pricingMode: 3, invoiceType: '13%增值税专用发票', hasContract: 1,
  contractNo: 'TYC-IT-2026-118', contractType: '购销合同', hasPenalty: 1,
  penaltyContent: '逾期交付按未交付金额每日万分之三计收。', paymentTerms: '月结60天',
  invoiceProcess: '验收后开票', billingContent: '服务器、交换机及系统集成服务',
  billingTiming: '验收完成后 5 个工作日内', purchaser: '林小姐',
  purchaserTel: '02-2788-1688 #321', recipient: '陈冠宇', recipientTel: '0912-345-678',
  recipientMail: 'kuanyu.chen@example.com', caseCategory: '系统集成', acceptance: '装机验收',
  installOptions: ['敦阳'], maintenanceOptions: ['敦阳', '原厂'],
  remark: '机房上架窗口为周六 09:00-18:00，进场前需提供工程师名单。',
  totals: {
    salesExcludingTax: 774000, vat: 100620, salesIncludingTax: 874620,
    costExcludingTax: 678584.07, costIncludingTax: 766800, marginRate: 12.33,
  },
  items: [
    {
      rowNo: 1, companyPartNo: 'NW-SW-9300-48P', name: '企业级接入交换机',
      description: '48 埠 PoE+、模块化上行、含 Network Advantage 三年授权及双电源套件',
      oemSpec: 'Cisco Catalyst C9300-48P-E / C9300-NW-A-48 / PWR-C1-1100WAC-P',
      qty: 2, unitPrice: 188000, subtotal: 376000, vendor: 'Cisco', costInclTax: 338000,
      taxRate: 13, costSource: '供应商A_交换机报价_0805.xlsx', installBy: '敦阳',
      warrantyService: '原厂 3 年 8x5 NBD', marginRate: 10.18,
    },
    {
      rowNo: 2, companyPartNo: 'SV-R760-4210', name: '双路机架式服务器',
      description: '2U 双路平台，2×Xeon Gold 5416S、512GB DDR5、8×3.84TB SSD、双 25GbE',
      oemSpec: 'Dell PowerEdge R760 / 2x5416S / 512G / 8x3.84TB / H755 / 2x1100W',
      qty: 1, unitPrice: 348000, subtotal: 348000, vendor: 'Dell Technologies',
      costInclTax: 372000, taxRate: 13, costSource: '供应商B_服务器报价.xlsx', installBy: '敦阳',
      warrantyService: '原厂 5 年 ProSupport Plus', marginRate: 5.32,
    },
    {
      rowNo: 3, companyPartNo: 'SVC-IMPLEMENT-01', name: '系统实施与迁移服务',
      description: '设备上架、基础配置、旧环境迁移、联调验证及交付文档',
      oemSpec: '敦阳工程服务包（含 2 人 × 5 工作日）', qty: 1, unitPrice: 50000,
      subtotal: 50000, vendor: '敦阳科技', costInclTax: 56800, taxRate: 6,
      costSource: '内部服务成本', installBy: '敦阳', warrantyService: '验收后 30 日问题修复',
      marginRate: -7.17,
    },
  ],
}

type PrototypeProps = { order: MrOrder; patch: (value: Partial<MrOrder>) => void }

function money(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`min-w-0 space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>
}

function PrototypeMark({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white"><ReceiptText className="size-5" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h1 className="truncate text-lg font-semibold">{title}</h1><Badge variant="outline">UI 原型</Badge></div>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" title="打印预览" onClick={() => toast.info('原型阶段不执行打印')}><Printer className="size-4" /></Button>
        <Button variant="outline" onClick={() => toast.info('原型不会写入数据库')}><Save className="mr-2 size-4" />保存</Button>
      </div>
    </header>
  )
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="min-w-0 border-l-2 border-neutral-200 pl-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 truncate text-lg font-semibold tabular-nums ${warning ? 'text-red-600' : ''}`}>{value}</div></div>
}

function ApprovalPath({ compact = false }: { compact?: boolean }) {
  return <ol className={compact ? 'space-y-3' : 'grid gap-2 sm:grid-cols-5'}>{APPROVALS.map((step, index) => (
    <li key={step.label} className={compact ? 'flex gap-3' : 'relative border p-3'}>
      <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.state === 'done' ? 'bg-emerald-600 text-white' : step.state === 'current' ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{step.state === 'done' ? <Check className="size-3.5" /> : index + 1}</div>
      <div className="min-w-0"><div className="text-sm font-medium">{step.label}</div><div className="truncate text-xs text-muted-foreground">{step.detail}</div></div>
    </li>
  ))}</ol>
}

function ItemRows({ items = [], dense = false }: { items?: MrItem[]; dense?: boolean }) {
  return <div className="divide-y border">{items.map((item, index) => (
    <article key={`${item.companyPartNo}-${index}`} className={dense ? 'grid gap-3 px-4 py-3 lg:grid-cols-[28px_minmax(0,1fr)_80px_130px_40px] lg:items-center' : 'p-4'}>
      {dense ? <GripVertical className="hidden size-4 text-muted-foreground lg:block" /> : null}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.name}</span><Badge variant="outline">{item.companyPartNo}</Badge></div>
        <p className="mt-1 text-sm leading-6 text-neutral-600">{item.description}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{item.oemSpec}</p>
        {!dense ? <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>厂商：{item.vendor}</span><span>装机：{item.installBy}</span><span>成本来源：{item.costSource}</span></div> : null}
      </div>
      {dense ? <div className="text-sm"><div className="text-xs text-muted-foreground">数量</div><div className="mt-1 font-medium">{item.qty}</div></div> : null}
      <div className={dense ? 'text-right' : 'mt-4 grid grid-cols-3 gap-3 border-t pt-3'}>
        {!dense ? <div><div className="text-xs text-muted-foreground">数量</div><div className="mt-1 font-medium">{item.qty}</div></div> : null}
        <div><div className="text-xs text-muted-foreground">销售小计</div><div className="mt-1 font-medium tabular-nums">¥ {money(item.subtotal)}</div></div>
        {!dense ? <div><div className="text-xs text-muted-foreground">毛利率</div><div className={`mt-1 font-medium ${Number(item.marginRate) < 15 ? 'text-red-600' : ''}`}>{Number(item.marginRate || 0).toFixed(2)}%</div></div> : null}
      </div>
      {dense ? <Button variant="ghost" size="icon" title="删除品项" onClick={() => toast.info('原型不会删除数据')}><Trash2 className="size-4" /></Button> : null}
    </article>
  ))}</div>
}

function VariantA({ order, patch }: PrototypeProps) {
  const steps = ['客户资料', '品项与报价', '交易条件', '检查提交']
  const [step, setStep] = useState(0)
  return (
    <div className="min-h-screen bg-[#f4f6f7] pb-28">
      <PrototypeMark title="分步建立 MR" subtitle={`${order.customerName} · ${order.ctrlNo}`} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav aria-label="填单步骤" className="mb-6 grid grid-cols-2 overflow-hidden border bg-white sm:grid-cols-4">
          {steps.map((label, index) => <button key={label} type="button" onClick={() => setStep(index)} className={`flex min-h-14 items-center gap-3 border-b px-4 text-left sm:border-b-0 sm:border-r ${step === index ? 'bg-neutral-900 text-white' : index < step ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-neutral-50'}`}><span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${index < step ? 'bg-emerald-600 text-white' : step === index ? 'bg-white text-neutral-900' : 'bg-neutral-100 text-neutral-600'}`}>{index < step ? <Check className="size-3.5" /> : index + 1}</span><span className="text-sm font-medium">{label}</span></button>)}
        </nav>
        <section className="min-h-[560px] border bg-white p-4 sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4"><div><p className="text-xs font-medium text-muted-foreground">步骤 {step + 1} / {steps.length}</p><h2 className="mt-1 text-xl font-semibold">{steps[step]}</h2></div><Badge className="bg-amber-100 text-amber-800">草稿</Badge></div>
          {step === 0 ? <div className="grid gap-5 md:grid-cols-2">
            <Field label="客户名称" className="md:col-span-2"><Input value={order.customerName || ''} onChange={(event) => patch({ customerName: event.target.value })} /></Field>
            <Field label="客户联系人"><Input value={order.contactName || ''} onChange={(event) => patch({ contactName: event.target.value })} /></Field>
            <Field label="负责业务"><Input value={order.salesOwnerName || ''} onChange={(event) => patch({ salesOwnerName: event.target.value })} /></Field>
            <Field label="Ctrl.NO"><Input value={order.ctrlNo || ''} onChange={(event) => patch({ ctrlNo: event.target.value })} /></Field>
            <Field label="客户 P/O"><Input value={order.customerPo || ''} onChange={(event) => patch({ customerPo: event.target.value })} /></Field>
            <Field label="填单日期"><Input type="date" value={order.fillDate || ''} onChange={(event) => patch({ fillDate: event.target.value })} /></Field>
            <Field label="最晚交货日"><Input type="date" value={order.latestDeliveryDate || ''} onChange={(event) => patch({ latestDeliveryDate: event.target.value })} /></Field>
          </div> : null}
          {step === 1 ? <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">已合并 3 个品项</h3><p className="text-sm text-muted-foreground">1 份销售报价 · 2 份进货报价</p></div><div className="flex gap-2"><Button variant="outline"><FileSpreadsheet className="mr-2 size-4" />报价文件</Button><Button variant="outline"><Plus className="mr-2 size-4" />新增品项</Button></div></div><ItemRows items={order.items} /></div> : null}
          {step === 2 ? <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5"><h3 className="border-b pb-3 font-medium">计价与合约</h3><Field label="计价模式"><div className="grid grid-cols-3 gap-2">{['多项系统集成', '单项系统集成', '开明细'].map((label, index) => <Button key={label} variant={order.pricingMode === index + 1 ? 'default' : 'outline'} onClick={() => patch({ pricingMode: index + 1 })}>{label}</Button>)}</div></Field><Field label="合同号"><Input value={order.contractNo || ''} onChange={(event) => patch({ contractNo: event.target.value })} /></Field><Field label="罚则内容"><Textarea rows={3} value={order.penaltyContent || ''} onChange={(event) => patch({ penaltyContent: event.target.value })} /></Field></div>
            <div className="space-y-5"><h3 className="border-b pb-3 font-medium">开票与付款</h3><Field label="发票别"><Input value={order.invoiceType || ''} onChange={(event) => patch({ invoiceType: event.target.value })} /></Field><Field label="付款条件"><Input value={order.paymentTerms || ''} onChange={(event) => patch({ paymentTerms: event.target.value })} /></Field><Field label="开票内容"><Textarea rows={3} value={order.billingContent || ''} onChange={(event) => patch({ billingContent: event.target.value })} /></Field></div>
          </div> : null}
          {step === 3 ? <div className="space-y-6"><div className="grid gap-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-4"><Metric label="未税总计" value={`¥ ${money(order.totals?.salesExcludingTax)}`} /><Metric label="含税合计" value={`¥ ${money(order.totals?.salesIncludingTax)}`} /><Metric label="成本总计" value={`¥ ${money(order.totals?.costExcludingTax)}`} /><Metric label="整单毛利率" value={`${Number(order.totals?.marginRate).toFixed(2)}%`} warning /></div><div><h3 className="mb-3 font-medium">签核路径</h3><ApprovalPath /></div><div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />需要副总签核</div><p className="mt-1">整单毛利率低于 15%，提交后将自动加入副总经理节点。</p></div></div> : null}
        </section>
        <footer className="flex items-center justify-between border-x border-b bg-white px-4 py-4 sm:px-6"><Button variant="outline" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft className="mr-2 size-4" />上一步</Button>{step < steps.length - 1 ? <Button onClick={() => setStep((value) => value + 1)}>下一步<ArrowRight className="ml-2 size-4" /></Button> : <Button onClick={() => toast.info('原型不会提交签核')}><Send className="mr-2 size-4" />提交签核</Button>}</footer>
      </main>
    </div>
  )
}

function VariantB({ order, patch }: PrototypeProps) {
  return (
    <div className="min-h-screen bg-white pb-28">
      <PrototypeMark title="MR 交易工作台" subtitle={`${order.customerName} · ${order.ctrlNo}`} />
      <div className="border-b bg-[#f7f8f8] px-4 py-4 sm:px-6"><div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-4 lg:grid-cols-4"><Metric label="销售未税" value={`¥ ${money(order.totals?.salesExcludingTax)}`} /><Metric label="采购未税" value={`¥ ${money(order.totals?.costExcludingTax)}`} /><Metric label="整单毛利" value={`${Number(order.totals?.marginRate).toFixed(2)}%`} warning /><Metric label="签核状态" value="业务待签" /></div></div>
      <main className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-7">
          <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">品项与报价</h2><p className="text-sm text-muted-foreground">销售报价 1 份 · 进货报价 2 份 · 最低成本已套用</p></div><div className="flex gap-2"><Button variant="outline"><FileSpreadsheet className="mr-2 size-4" />管理报价</Button><Button><Plus className="mr-2 size-4" />品项</Button></div></div><ItemRows items={order.items} dense /></section>
          <section className="grid gap-px border bg-border lg:grid-cols-3">
            <div className="space-y-4 bg-white p-4"><div className="flex items-center gap-2 font-medium"><UserRound className="size-4" />客户与单号</div><Field label="客户名称"><Input value={order.customerName || ''} onChange={(event) => patch({ customerName: event.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Ctrl.NO"><Input value={order.ctrlNo || ''} onChange={(event) => patch({ ctrlNo: event.target.value })} /></Field><Field label="客户 P/O"><Input value={order.customerPo || ''} onChange={(event) => patch({ customerPo: event.target.value })} /></Field></div></div>
            <div className="space-y-4 bg-white p-4"><div className="flex items-center gap-2 font-medium"><CircleDollarSign className="size-4" />交易条件</div><Field label="计价模式"><Input value="开明细" readOnly /></Field><Field label="付款条件"><Input value={order.paymentTerms || ''} onChange={(event) => patch({ paymentTerms: event.target.value })} /></Field><Field label="发票别"><Input value={order.invoiceType || ''} onChange={(event) => patch({ invoiceType: event.target.value })} /></Field></div>
            <div className="space-y-4 bg-white p-4"><div className="flex items-center gap-2 font-medium"><Package className="size-4" />交付与服务</div><Field label="最晚交货日"><Input type="date" value={order.latestDeliveryDate || ''} onChange={(event) => patch({ latestDeliveryDate: event.target.value })} /></Field><Field label="装机对象"><Input value={(order.installOptions || []).join('、')} onChange={(event) => patch({ installOptions: event.target.value.split('、') })} /></Field><Field label="验收"><Input value={order.acceptance || ''} onChange={(event) => patch({ acceptance: event.target.value })} /></Field></div>
          </section>
          <section><h2 className="mb-3 text-lg font-semibold">备注</h2><Textarea rows={4} value={order.remark || ''} onChange={(event) => patch({ remark: event.target.value })} /></section>
        </div>
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start"><div className="border bg-[#fbfbfa]"><div className="border-b p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">签核与风险</h2><Badge className="bg-amber-100 text-amber-800">业务待签</Badge></div><div className="mt-4 border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800"><div className="font-medium">毛利率 12.33%</div><p className="mt-1">低于 15%，需要副总签核。</p></div></div><div className="border-b p-4"><ApprovalPath compact /></div><div className="space-y-3 p-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">含税总额</span><strong>¥ {money(order.totals?.salesIncludingTax)}</strong></div><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">品项数</span><strong>{order.items?.length} 项</strong></div><Button className="w-full" onClick={() => toast.info('原型不会提交签核')}><Send className="mr-2 size-4" />提交签核</Button><Button variant="outline" className="w-full" onClick={() => toast.info('原型不会写入数据库')}><Save className="mr-2 size-4" />保存草稿</Button></div></div></aside>
      </main>
    </div>
  )
}

const DIRECTORY = [
  { id: 'identity', label: '客户与单号', icon: UserRound },
  { id: 'items', label: '品项明细', icon: Package },
  { id: 'trade', label: '交易条件', icon: CircleDollarSign },
  { id: 'delivery', label: '交付与服务', icon: CheckCircle2 },
  { id: 'approval', label: '签核流转', icon: ShieldCheck },
] as const

function VariantC({ order, patch }: PrototypeProps) {
  const scrollTo = (id: string) => document.getElementById(`prototype-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="min-h-screen bg-[#f5f6f6] pb-28">
      <PrototypeMark title="MR 单页编辑" subtitle={`${order.customerName} · ${order.ctrlNo}`} />
      <main className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden lg:block"><div className="sticky top-6 space-y-4"><nav className="border bg-white p-2" aria-label="MR 章节目录">{DIRECTORY.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => scrollTo(id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-neutral-100"><Icon className="size-4 text-muted-foreground" />{label}<ChevronRight className="ml-auto size-4 text-muted-foreground" /></button>)}</nav><div className="border bg-neutral-900 p-4 text-white"><div className="text-xs text-neutral-400">未税总计</div><div className="mt-1 text-xl font-semibold tabular-nums">¥ {money(order.totals?.salesExcludingTax)}</div><div className="mt-4 flex items-center justify-between text-sm"><span className="text-neutral-400">毛利率</span><strong className="text-red-300">{Number(order.totals?.marginRate).toFixed(2)}%</strong></div></div></div></aside>
        <div className="min-w-0 border bg-white">
          <section id="prototype-identity" className="scroll-mt-6 border-b p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground">01</p><h2 className="mt-1 text-lg font-semibold">客户与单号</h2></div><Badge className="bg-amber-100 text-amber-800">草稿</Badge></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="客户名称" className="md:col-span-2"><Input value={order.customerName || ''} onChange={(event) => patch({ customerName: event.target.value })} /></Field><Field label="联系人"><Input value={order.contactName || ''} onChange={(event) => patch({ contactName: event.target.value })} /></Field><Field label="负责业务"><Input value={order.salesOwnerName || ''} onChange={(event) => patch({ salesOwnerName: event.target.value })} /></Field><Field label="Ctrl.NO"><Input value={order.ctrlNo || ''} onChange={(event) => patch({ ctrlNo: event.target.value })} /></Field><Field label="客户 P/O"><Input value={order.customerPo || ''} onChange={(event) => patch({ customerPo: event.target.value })} /></Field><Field label="填单日期"><Input type="date" value={order.fillDate || ''} onChange={(event) => patch({ fillDate: event.target.value })} /></Field><Field label="最晚交货日"><Input type="date" value={order.latestDeliveryDate || ''} onChange={(event) => patch({ latestDeliveryDate: event.target.value })} /></Field></div></section>
          <section id="prototype-items" className="scroll-mt-6 border-b p-4 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">02</p><h2 className="mt-1 text-lg font-semibold">品项明细</h2></div><div className="flex gap-2"><Button variant="outline"><FileSpreadsheet className="mr-2 size-4" />报价文件</Button><Button variant="outline"><Plus className="mr-2 size-4" />新增</Button></div></div><ItemRows items={order.items} /></section>
          <section id="prototype-trade" className="scroll-mt-6 border-b p-4 sm:p-6"><p className="text-xs font-medium text-muted-foreground">03</p><h2 className="mt-1 text-lg font-semibold">交易条件</h2><div className="mt-5 grid gap-6 lg:grid-cols-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="计价模式" className="sm:col-span-2"><Input value="开明细" readOnly /></Field><Field label="发票别"><Input value={order.invoiceType || ''} onChange={(event) => patch({ invoiceType: event.target.value })} /></Field><Field label="付款条件"><Input value={order.paymentTerms || ''} onChange={(event) => patch({ paymentTerms: event.target.value })} /></Field><Field label="合同号" className="sm:col-span-2"><Input value={order.contractNo || ''} onChange={(event) => patch({ contractNo: event.target.value })} /></Field></div><div><Field label="罚则内容"><Textarea rows={6} value={order.penaltyContent || ''} onChange={(event) => patch({ penaltyContent: event.target.value })} /></Field></div></div></section>
          <section id="prototype-delivery" className="scroll-mt-6 border-b p-4 sm:p-6"><p className="text-xs font-medium text-muted-foreground">04</p><h2 className="mt-1 text-lg font-semibold">交付与服务</h2><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="案分类"><Input value={order.caseCategory || ''} onChange={(event) => patch({ caseCategory: event.target.value })} /></Field><Field label="验收"><Input value={order.acceptance || ''} onChange={(event) => patch({ acceptance: event.target.value })} /></Field><Field label="装机对象"><Input value={(order.installOptions || []).join('、')} onChange={(event) => patch({ installOptions: event.target.value.split('、') })} /></Field><Field label="维护对象"><Input value={(order.maintenanceOptions || []).join('、')} onChange={(event) => patch({ maintenanceOptions: event.target.value.split('、') })} /></Field><Field label="备注" className="md:col-span-2 xl:col-span-4"><Textarea rows={3} value={order.remark || ''} onChange={(event) => patch({ remark: event.target.value })} /></Field></div></section>
          <section id="prototype-approval" className="scroll-mt-6 p-4 sm:p-6"><p className="text-xs font-medium text-muted-foreground">05</p><h2 className="mt-1 text-lg font-semibold">签核流转</h2><div className="mt-5"><ApprovalPath /></div><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => toast.info('原型不会写入数据库')}><Save className="mr-2 size-4" />保存草稿</Button><Button onClick={() => toast.info('原型不会提交签核')}><Send className="mr-2 size-4" />提交签核</Button></div></section>
        </div>
      </main>
    </div>
  )
}

function PrototypeSwitcher({ current, setVariant }: { current: string; setVariant: (variant: string) => void }) {
  const index = Math.max(0, VARIANTS.findIndex((variant) => variant.key === current))
  const cycle = (direction: -1 | 1) => setVariant(VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length].key)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      cycle(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  const selected = VARIANTS[index]
  const SelectedIcon = selected.icon
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border border-white/20 bg-neutral-950 p-1.5 text-white shadow-2xl">
      <Button type="button" variant="ghost" size="icon" title="上一方案" onClick={() => cycle(-1)} className="text-white hover:bg-white/15 hover:text-white"><ArrowLeft className="size-4" /></Button>
      <div className="flex min-w-[168px] items-center justify-center gap-2 px-2"><SelectedIcon className="size-4" /><span className="text-sm font-medium">{selected.key} · {selected.name}</span></div>
      <Button type="button" variant="ghost" size="icon" title="下一方案" onClick={() => cycle(1)} className="text-white hover:bg-white/15 hover:text-white"><ArrowRight className="size-4" /></Button>
    </div>
  )
}

export function MrPrototypePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = (searchParams.get('variant') || 'A').toUpperCase()
  const variant = VARIANTS.some((item) => item.key === requested) ? requested : 'A'
  const [order, setOrder] = useState<MrOrder>(() => structuredClone(MOCK_ORDER))
  const patch = (value: Partial<MrOrder>) => setOrder((current) => ({ ...current, ...value }))
  const setVariant = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('variant', next)
    setSearchParams(params, { replace: true })
  }
  return (
    <>
      {variant === 'A' ? <VariantA order={order} patch={patch} /> : null}
      {variant === 'B' ? <VariantB order={order} patch={patch} /> : null}
      {variant === 'C' ? <VariantC order={order} patch={patch} /> : null}
      <PrototypeSwitcher current={variant} setVariant={setVariant} />
    </>
  )
}
