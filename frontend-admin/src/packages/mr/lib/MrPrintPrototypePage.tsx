import { type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { MrApproval, MrItem, MrOrder } from '../types'
import { calculateForm } from './form-logic'
import { SAMPLE_ORDER } from './prototype/demoData'

/** PROTOTYPE — three throwaway MR print/PDF layout samples. */

const PRICING: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }
const STATUS: Record<string, string> = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }
const SIGNATURE_ROLES = [
  ['assistant', '助理'],
  ['sales', '业务'],
  ['engineering', '工程会签'],
  ['supervisor', '处级单位'],
  ['vp', '副总经理'],
] as const
const VARIANTS = [
  ['A', '品项主导', '明细优先，适合采购与交付核对'],
  ['B', '经营摘要', '金额先行，适合快速审批'],
  ['C', '签核档案', '流程先行，适合留痕'],
 ] as const

function text(value: unknown) { return value === null || value === undefined || value === '' ? '-' : String(value) }
function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
}
function percent(value: unknown) {
  const amount = Number(value)
  return value === null || value === undefined || !Number.isFinite(amount) ? '-' : `${amount.toFixed(2)}%`
}
function decidedAt(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 16) : '' }
function approval(approvals: MrApproval[], key: string) { return approvals.find((item) => item.stepKey === key) }
function statusOf(item?: MrApproval) {
  if (!item) return ['未开始', 'pending']
  if (item.action === 'approve') return ['已签核', 'approved']
  if (item.action === 'reject') return ['已驳回', 'rejected']
  if (item.action === 'skipped') return ['已跳过', 'skipped']
  return ['待签核', 'pending']
}

function Header({ order, compact = false }: { order: MrOrder; compact?: boolean }) {
  const status = order.status || 'draft'
  return <header className={`proto-header ${compact ? 'proto-header-compact' : ''}`}>
    <div className="proto-brand"><img src={`${import.meta.env.BASE_URL}dunyang-mark.png`} alt="" /><div><span>STARK / NINGBO TECHNOLOGY INC.</span><strong>敦阳（宁波）科技有限公司</strong></div></div>
    <div className="proto-title"><h1>客户订购申请单</h1><p>Material Requisition · MR</p></div>
    <div className="proto-ref"><b>{text(order.ctrlNo || order.fileName)}</b><span>{text(order.customerPo)} · {STATUS[status] || status}</span></div>
  </header>
}

function Fact({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return <div className={`proto-fact ${wide ? 'proto-wide' : ''}`}><small>{label}</small><div>{value}</div></div>
}
function Section({ title, index, children, className = '' }: { title: string; index: string; children: ReactNode; className?: string }) {
  return <section className={`proto-section ${className}`}><div className="proto-section-heading"><span>{index}</span><h2>{title}</h2></div>{children}</section>
}
function ItemTable({ items }: { items: MrItem[] }) {
  return <table className="proto-items"><thead><tr><th>项目</th><th>公司料号</th><th>原厂规格</th><th>品名 / 描述</th><th>保固服务</th><th>装机</th><th>数量</th><th>单价</th><th>销售小计</th><th>厂商</th><th>Cost</th><th>成本含税</th><th>采购单号</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id || index}><td>{index + 1}</td><td>{text(item.companyPartNo)}</td><td>{text(item.oemSpec)}</td><td><strong>{text(item.name)}</strong>{item.description ? <small>{item.description}</small> : null}</td><td>{text(item.warrantyService)}</td><td>{text(item.installBy)}</td><td>{text(item.qty)}</td><td>¥ {money(item.unitPrice)}</td><td className="proto-strong">¥ {money(item.subtotal)}</td><td>{text(item.vendor)}</td><td>¥ {money(item.costExcludingTax)}</td><td>¥ {money(item.costInclTax)}</td><td>{text(item.purchaseOrderNo)}</td></tr>)}</tbody></table>
}
function Totals({ order, hero = false }: { order: MrOrder; hero?: boolean }) {
  const totals = order.totals || {}
  return <div className={`proto-totals ${hero ? 'proto-totals-hero' : ''}`}><div><small>未税售价</small><b>¥ {money(totals.salesExcludingTax)}</b></div><div><small>销售税额</small><b>¥ {money(totals.vat)}</b></div><div><small>含税合计</small><b>¥ {money(totals.salesIncludingTax)}</b></div><div><small>采购成本（未税）</small><b>¥ {money(totals.costExcludingTax)}</b></div><div className={Number(totals.marginRate) < 15 ? 'proto-risk' : ''}><small>整单毛利率</small><b>{percent(totals.marginRate)}</b></div></div>
}
function Signatures({ order, compact = false }: { order: MrOrder; compact?: boolean }) {
  const approvals = order.approvals || []
  return <div className={`proto-signatures ${compact ? 'proto-signatures-compact' : ''}`}>{SIGNATURE_ROLES.map(([key, label]) => { const item = approval(approvals, key); const [state, stateClass] = statusOf(item); return <div className={`proto-signature ${stateClass}`} key={key}><b>{label}</b><span>{state}</span><strong>{item?.approverName || '—'}</strong><small>{decidedAt(item?.decidedAt)}</small></div> })}</div>
}
function Footer() { return <footer className="proto-footer"><span>MR / 审批存档文件</span><span>打印日期：2026-07-22 · 数据来自当前 MR</span></footer> }

function VariantA({ order }: { order: MrOrder }) {
  return (
    <article className="proto-paper proto-a">
      <style>{`
        .proto-a { border-top: 5px solid #73529b; }
        .proto-a .proto-header, .proto-a .proto-section-heading { border-color: #4e386e; }
        .proto-a .proto-title h1, .proto-a .proto-section-heading h2 { color: #4e386e; }
        .proto-a-orderbar { display: grid; grid-template-columns: 1.2fr 1fr 1fr .7fr; margin-top: 18px; border-top: 1px solid #c9bae0; border-bottom: 1px solid #c9bae0; background: #faf8fd; }
        .proto-a-orderbar > div { min-height: 62px; padding: 11px 14px; border-right: 1px solid #ded5ea; }
        .proto-a-orderbar > div:last-child { border: 0; }
        .proto-a-orderbar small, .proto-a-delivery small, .proto-a-remark small { display: block; color: #766a87; font-size: 10px; }
        .proto-a-orderbar b, .proto-a-orderbar span, .proto-a-delivery b, .proto-a-delivery span { display: block; margin-top: 4px; overflow-wrap: anywhere; }
        .proto-a-orderbar b { color: #3e2d59; font-size: 13px; }
        .proto-a-orderbar span, .proto-a-delivery span { color: #746985; font-size: 10px; line-height: 1.35; }
        .proto-a-items { margin-top: 20px; }
        .proto-a .proto-items th { background: #57406f; }
        .proto-a .proto-totals { border-color: #c9bae0; }
        .proto-a .proto-totals > div { border-color: #ded5ea; }
        .proto-a .proto-totals > div:last-child { background: #f1ecf7; }
        .proto-a-bottom { display: grid; grid-template-columns: 1fr 1.2fr; gap: 26px; }
        .proto-a-bottom .proto-section { margin-top: 20px; }
        .proto-a-delivery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid #d8cfe5; border-left: 1px solid #d8cfe5; }
        .proto-a-delivery > div { min-height: 59px; padding: 9px 11px; border-right: 1px solid #d8cfe5; border-bottom: 1px solid #d8cfe5; }
        .proto-a-delivery b { color: #3e2d59; font-size: 12px; }
        .proto-a-remark { margin: 10px 0 0; padding: 9px 11px; background: #f4f0f8; color: #594b68; font-size: 10px; line-height: 1.55; }
        .proto-a-remark small { margin-bottom: 3px; }
        @media (max-width: 900px) { .proto-a-orderbar { grid-template-columns: repeat(2, 1fr); } .proto-a-bottom { gap: 16px; } }
        @media print {
          .proto-a { border-top: 3px solid #111; }
          .proto-a .proto-header, .proto-a .proto-section-heading { border-color: #111; }
          .proto-a .proto-title h1, .proto-a .proto-section-heading h2, .proto-a-orderbar b, .proto-a-delivery b { color: #111 !important; }
          .proto-a-orderbar, .proto-a .proto-totals > div:last-child, .proto-a-remark { background: #fff !important; border-color: #111; }
          .proto-a-orderbar > div, .proto-a .proto-totals > div, .proto-a-delivery, .proto-a-delivery > div { border-color: #bbb; }
          .proto-a .proto-items th { background: #eee !important; color: #111 !important; }
        }
      `}</style>
      <Header order={order} compact />
      <div className="proto-a-orderbar">
        <div><small>客户 / CUSTOMER</small><b>{text(order.customerName)}</b><span>{text(order.customerPo)}</span></div>
        <div><small>交付 / DELIVERY</small><b>{text(order.latestDeliveryDate)}</b><span>{text(order.deliveryLocation)}</span></div>
        <div><small>交易 / TERMS</small><b>{text(order.paymentTerms)}</b><span>{text(order.invoiceType)} · {PRICING[Number(order.pricingMode)] || '-'}</span></div>
        <div><small>状态 / STATUS</small><b>{STATUS[order.status || 'draft']}</b><span>{text(order.ctrlNo)}</span></div>
      </div>
      <Section index="01" title={`采购与销售明细 · ${order.items?.length || 0} 项`} className="proto-a-items"><ItemTable items={order.items || []} /><Totals order={order} /></Section>
      <div className="proto-a-bottom">
        <Section index="02" title="交付资料">
          <div className="proto-a-delivery">
            <div><small>客户联系人</small><b>{text(order.contactName)}</b><span>{text(order.purchaserTel)}</span></div>
            <div><small>采购 / 收件</small><b>{text(order.purchaser)} / {text(order.recipient)}</b><span>{text(order.recipientTel)}</span></div>
            <div><small>履约要求</small><b>{text(order.acceptance)}</b><span>装机：{text(order.installOptions?.join('、'))}</span></div>
            <div><small>开票与合同</small><b>{text(order.contractNo)}</b><span>{text(order.billingContent)}</span></div>
          </div>
          {order.remark ? <p className="proto-a-remark"><small>备注</small>{text(order.remark)}</p> : null}
        </Section>
        <Section index="03" title="会签流转" className="proto-approval"><Signatures order={order} /></Section>
      </div>
      <Footer />
    </article>
  )
}

function VariantB({ order }: { order: MrOrder }) {
  const items = order.items || []
  return <article className="proto-paper proto-b"><Header order={order} compact /><div className="proto-b-layout"><aside className="proto-b-side"><div className="proto-side-label">MR / EXECUTIVE BRIEF</div><div className="proto-side-number">{text(order.ctrlNo)}</div><div className="proto-side-status">{STATUS[order.status || 'draft']}</div><div className="proto-side-rule" /><dl><dt>客户</dt><dd>{text(order.customerName)}</dd><dt>客户 P/O</dt><dd>{text(order.customerPo)}</dd><dt>业务负责人</dt><dd>{text(order.salesOwnerName || order.createdByName)}</dd><dt>交货日</dt><dd>{text(order.latestDeliveryDate)}</dd><dt>计价模式</dt><dd>{PRICING[Number(order.pricingMode)] || '-'}</dd><dt>装机对象</dt><dd>{text(order.installOptions?.join('、'))}</dd></dl><div className="proto-side-note">{text(order.remark)}</div></aside><main className="proto-b-main"><div className="proto-b-hero"><small>本案未税销售规模</small><strong>¥ {money(order.totals?.salesExcludingTax)}</strong><div><span>含税 ¥ {money(order.totals?.salesIncludingTax)}</span><span>成本 ¥ {money(order.totals?.costExcludingTax)}</span><span>毛利 {percent(order.totals?.marginRate)}</span></div></div><Section index="01" title="决策摘要"><div className="proto-decision-grid"><div><small>客户联系人</small><b>{text(order.contactName)}</b><span>{text(order.purchaserTel)}</span></div><div><small>交付地点</small><b>{text(order.deliveryLocation)}</b></div><div><small>付款条件</small><b>{text(order.paymentTerms)}</b></div><div><small>开票内容</small><b>{text(order.billingContent)}</b></div></div></Section><Section index="02" title="品项构成"><ItemTable items={items} /><Totals order={order} hero /></Section><Section index="03" title="审批状态"><Signatures order={order} compact /></Section></main></div><Footer /></article>
}

function VariantC({ order }: { order: MrOrder }) {
  const approvals = order.approvals || []
  return <article className="proto-paper proto-c"><div className="proto-c-topline"><span>STARK · MR CONTROL RECORD</span><b>{text(order.ctrlNo)}</b></div><Header order={order} /><div className="proto-c-intro"><div><small>客户订购申请 / 审批档案</small><h2>{text(order.customerName)}</h2><p>{text(order.remark)}</p></div><div className="proto-c-status"><small>当前状态</small><strong>{STATUS[order.status || 'draft']}</strong><span>建立于 {text(order.fillDate)}</span></div></div><Section index="01" title="审批履历"><div className="proto-timeline">{SIGNATURE_ROLES.map(([key, label], index) => { const item = approval(approvals, key); const [state, stateClass] = statusOf(item); return <div className={`proto-timeline-row ${stateClass}`} key={key}><div className="proto-timeline-marker">{index + 1}</div><div><b>{label}</b><span>{state}</span><small>{item?.approverName ? `${item.approverName} · ` : ''}{decidedAt(item?.decidedAt) || '等待处理'}</small></div></div> })}</div></Section><div className="proto-c-grid"><Section index="02" title="订单识别"><div className="proto-c-facts"><Fact label="客户 P/O" value={text(order.customerPo)} /><Fact label="客户联系人" value={text(order.contactName)} /><Fact label="案分类" value={text(order.caseCategory)} /><Fact label="最晚交货日" value={text(order.latestDeliveryDate)} /><Fact label="合同号" value={text(order.contractNo)} /><Fact label="发票别" value={text(order.invoiceType)} /><Fact label="付款条件" value={text(order.paymentTerms)} /><Fact label="验收方式" value={text(order.acceptance)} /></div></Section><Section index="03" title="交付与联络"><div className="proto-c-facts"><Fact label="送货地点" value={text(order.deliveryLocation)} wide /><Fact label="采购人 / 电话" value={`${text(order.purchaser)} / ${text(order.purchaserTel)}`} /><Fact label="收件人 / 电话" value={`${text(order.recipient)} / ${text(order.recipientTel)}`} /><Fact label="装机对象" value={text(order.installOptions?.join('、'))} wide /></div></Section></div><Section index="04" title="品项明细"><ItemTable items={order.items || []} /><Totals order={order} /></Section><Footer /></article>
}

function Switcher({ current, onChange }: { current: string; onChange: (value: string) => void }) {
  const index = Math.max(0, VARIANTS.findIndex(([key]) => key === current))
  const move = (delta: number) => onChange(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length][0])
  return <div className="proto-switcher"><button type="button" onClick={() => move(-1)} aria-label="上一个模板"><ChevronLeft /></button><div><b>{VARIANTS[index][0]} · {VARIANTS[index][1]}</b><span>{VARIANTS[index][2]}</span></div><button type="button" onClick={() => move(1)} aria-label="下一个模板"><ChevronRight /></button></div>
}

export function MrPrintPrototypePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('variant') || 'A'
  const variant = VARIANTS.some(([key]) => key === requested) ? requested : 'A'
  const order = calculateForm(SAMPLE_ORDER as unknown as MrOrder)
  const setVariant = (value: string) => navigate(`/mr/print-prototype?variant=${value}`, { replace: true })
  return <div className="mr-print-prototype"><style>{styles}</style><div className="proto-toolbar"><span>MR 打印 / PDF 模板样本 · 仅供设计比较</span><div><Button variant="outline" onClick={() => navigate('/mr')}><ArrowLeft className="mr-2 size-4" />返回 MR</Button><Button onClick={() => window.print()}><Printer className="mr-2 size-4" />打印当前样本</Button></div></div>{variant === 'B' ? <VariantB order={order} /> : variant === 'C' ? <VariantC order={order} /> : <VariantA order={order} />}{import.meta.env.DEV ? <Switcher current={variant} onChange={setVariant} /> : null}</div>
}

const itemTableStyles = `
  .proto-items th:nth-child(1), .proto-items td:nth-child(1) { width: 3%; text-align: center; }
  .proto-items th:nth-child(2), .proto-items td:nth-child(2) { width: 8%; }
  .proto-items th:nth-child(3), .proto-items td:nth-child(3) { width: 9%; text-align: left; }
  .proto-items th:nth-child(4), .proto-items td:nth-child(4) { width: 15%; text-align: left; }
  .proto-items th:nth-child(5), .proto-items td:nth-child(5) { width: 9%; text-align: left; }
  .proto-items th:nth-child(6), .proto-items td:nth-child(6) { width: 6%; text-align: left; }
  .proto-items th:nth-child(7), .proto-items td:nth-child(7) { width: 4%; text-align: right; }
  .proto-items th:nth-child(8), .proto-items td:nth-child(8) { width: 8%; text-align: right; }
  .proto-items th:nth-child(9), .proto-items td:nth-child(9) { width: 9%; text-align: right; }
  .proto-items th:nth-child(10), .proto-items td:nth-child(10) { width: 7%; text-align: left; }
  .proto-items th:nth-child(11), .proto-items td:nth-child(11) { width: 8%; text-align: right; }
  .proto-items th:nth-child(12), .proto-items td:nth-child(12) { width: 8%; text-align: right; }
  .proto-items th:nth-child(13), .proto-items td:nth-child(13) { width: 6%; text-align: left; }
  .proto-items td:nth-child(3), .proto-items td:nth-child(4), .proto-items td:nth-child(5), .proto-items td:nth-child(6), .proto-items td:nth-child(10), .proto-items td:nth-child(13) { text-align: left; }
`
const styles = `
.mr-print-prototype{min-height:100vh;background:#e8ecef;color:#17232d;padding:24px;font-family:Arial,"Microsoft YaHei",sans-serif}.mr-print-prototype *{box-sizing:border-box}.proto-toolbar{max-width:1360px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;gap:16px;color:#53616d;font-size:12px}.proto-toolbar>div{display:flex;gap:8px}.proto-paper{max-width:1360px;min-height:940px;margin:auto;background:#fff;padding:38px 44px 26px;box-shadow:0 15px 42px #26374618;border:1px solid #d4dce2}.proto-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;padding-bottom:22px;border-bottom:3px solid #17232d}.proto-header-compact{padding-bottom:16px;border-bottom-width:2px}.proto-brand{display:flex;align-items:center;gap:11px}.proto-brand img{width:42px;height:42px;object-fit:contain}.proto-brand span{display:block;color:#61707b;font-size:9px;letter-spacing:.09em}.proto-brand strong{display:block;margin-top:4px;font-size:16px;letter-spacing:.04em}.proto-title{text-align:center}.proto-title h1{margin:0;font-size:26px;letter-spacing:.12em}.proto-title p{margin:7px 0 0;color:#6c7983;font-size:11px}.proto-ref{text-align:right}.proto-ref b{display:block;font-size:16px}.proto-ref span{display:block;margin-top:6px;color:#60707a;font-size:11px}.proto-alert{margin-top:16px;border-left:4px solid #344653;background:#f1f4f5;padding:9px 12px;font-size:11px;font-weight:700}.proto-kpis{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1.15fr;margin-top:16px;border:1px solid #c7d0d7;background:#f7f9fa}.proto-kpis>div{min-width:0;padding:13px 15px;border-right:1px solid #d9e0e4}.proto-kpis>div:last-child{border:0}.proto-kpis small,.proto-fact small,.proto-totals small,.proto-decision-grid small,.proto-c-status small{display:block;color:#667681;font-size:10px}.proto-kpis b{display:block;margin-top:5px;overflow-wrap:anywhere;font-size:14px}.proto-section{margin-top:23px}.proto-section-heading{display:flex;align-items:baseline;gap:10px;margin-bottom:9px;padding-bottom:7px;border-bottom:1px solid #17232d}.proto-section-heading span{color:#74828c;font-size:10px;font-weight:800;letter-spacing:.1em}.proto-section-heading h2{margin:0;font-size:15px;letter-spacing:.03em}.proto-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid #d6dee3;border-left:1px solid #d6dee3}.proto-fact{min-height:52px;padding:9px 11px;border-right:1px solid #d6dee3;border-bottom:1px solid #d6dee3}.proto-fact div{margin-top:4px;overflow-wrap:anywhere;white-space:pre-wrap;font-size:12px;line-height:1.45}.proto-wide{grid-column:span 2}.proto-items{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}.proto-items th,.proto-items td{padding:8px 7px;border:1px solid #cbd5db;vertical-align:top;overflow-wrap:anywhere}.proto-items th{background:#263640;color:#fff;text-align:left;font-size:10px}.proto-items th:first-child,.proto-items td:first-child{width:4%;text-align:center}.proto-items th:nth-child(2){width:28%}.proto-items th:nth-child(3){width:6%;text-align:right}.proto-items th:nth-child(4),.proto-items th:nth-child(5){width:11%;text-align:right}.proto-items th:nth-child(6){width:11%}.proto-items th:nth-child(7){width:13%}.proto-items th:nth-child(8){width:10%;text-align:right}.proto-items th:nth-child(9){width:7%;text-align:right}.proto-items td:nth-child(n+3){text-align:right;font-variant-numeric:tabular-nums}.proto-items td:nth-child(2){text-align:left}.proto-items td strong,.proto-items td small{display:block}.proto-items td small{margin-top:3px;color:#60717b;line-height:1.35}.proto-items tbody tr:nth-child(even){background:#f8fafb}.proto-strong{font-weight:800}.proto-risk{color:#9b2c2c!important;font-weight:800}.proto-totals{display:grid;grid-template-columns:repeat(5,1fr);margin-top:10px;border:1px solid #bcc8cf}.proto-totals>div{padding:10px 12px;border-right:1px solid #d6dee3}.proto-totals>div:last-child{border:0}.proto-totals b{display:block;margin-top:4px;font-size:14px;font-variant-numeric:tabular-nums}.proto-signatures{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.proto-signature{min-height:88px;padding:10px 11px;border:1px solid #bcc8cf;background:#fafbfc}.proto-signature b,.proto-signature span,.proto-signature strong,.proto-signature small{display:block}.proto-signature span{margin-top:7px;color:#667681;font-size:10px}.proto-signature strong{min-height:20px;margin-top:6px;font-size:12px}.proto-signature small{color:#667681;font-size:9px}.proto-signature.approved span{color:#216c49;font-weight:700}.proto-signature.rejected span{color:#9b2c2c;font-weight:700}.proto-footer{display:flex;justify-content:space-between;margin-top:20px;padding-top:9px;border-top:1px solid #d6dee3;color:#71808a;font-size:9px}
.proto-b{padding:30px 34px 22px}.proto-b-layout{display:grid;grid-template-columns:220px 1fr;gap:30px;margin-top:24px}.proto-b-side{padding:8px 20px 0 0;border-right:1px solid #d3dce1}.proto-side-label{color:#687983;font-size:9px;letter-spacing:.12em}.proto-side-number{margin-top:18px;font-size:23px;font-weight:800}.proto-side-status{display:inline-block;margin-top:10px;padding:4px 9px;border:1px solid #52636e;color:#52636e;font-size:11px;font-weight:700}.proto-side-rule{height:1px;margin:24px 0 12px;background:#17232d}.proto-b-side dl{margin:0}.proto-b-side dt{margin-top:13px;color:#74818a;font-size:10px}.proto-b-side dd{margin:3px 0 0;font-size:12px;font-weight:700;line-height:1.4}.proto-side-note{margin-top:30px;color:#63737e;font-size:10px;line-height:1.6}.proto-b-main{min-width:0}.proto-b-hero{padding:20px 24px;background:#172d38;color:#fff}.proto-b-hero small{display:block;color:#c8d3d7;font-size:11px}.proto-b-hero>strong{display:block;margin:5px 0 16px;font-size:32px;letter-spacing:.02em}.proto-b-hero div{display:flex;gap:28px;color:#d8e2e4;font-size:11px}.proto-b .proto-section{margin-top:20px}.proto-decision-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d2dce1}.proto-decision-grid>div{min-height:66px;padding:10px 12px;border-right:1px solid #d2dce1}.proto-decision-grid>div:last-child{border:0}.proto-decision-grid b,.proto-decision-grid span{display:block;margin-top:5px;font-size:12px;line-height:1.4}.proto-decision-grid span{color:#667681;font-size:10px}.proto-items-minimal th:nth-child(2){width:34%}.proto-items-minimal th:nth-child(4),.proto-items-minimal th:nth-child(5){width:14%}.proto-items-minimal th:nth-child(6){width:16%}.proto-items-minimal td:nth-child(4),.proto-items-minimal td:nth-child(5){text-align:right}.proto-totals-hero{border:0;gap:8px}.proto-totals-hero>div{border:0;background:#f1f5f6;padding:11px 12px}.proto-totals-hero b{font-size:13px}.proto-signatures-compact{grid-template-columns:repeat(5,1fr)}.proto-signatures-compact .proto-signature{min-height:66px;background:#fff}.proto-signatures-compact .proto-signature span{margin-top:5px}.proto-signatures-compact .proto-signature strong,.proto-signatures-compact .proto-signature small{display:none}
.proto-c{padding:22px 42px 22px}.proto-c-topline{display:flex;justify-content:space-between;padding-bottom:9px;border-bottom:1px solid #17232d;color:#6c7a83;font-size:9px;letter-spacing:.1em}.proto-c-topline b{color:#17232d;letter-spacing:.04em}.proto-c .proto-header{padding-top:22px;border-bottom:0}.proto-c-intro{display:flex;justify-content:space-between;gap:30px;margin-top:4px;padding:18px 22px;background:#eef3f4;border-top:5px solid #2b4b54}.proto-c-intro small{color:#60727b;font-size:10px}.proto-c-intro h2{margin:6px 0 4px;font-size:22px}.proto-c-intro p{max-width:680px;margin:0;color:#62727b;font-size:11px;line-height:1.5}.proto-c-status{min-width:170px;padding-left:20px;border-left:1px solid #c6d2d7}.proto-c-status strong,.proto-c-status span{display:block}.proto-c-status strong{margin-top:8px;font-size:18px}.proto-c-status span{margin-top:7px;color:#60727b;font-size:10px}.proto-timeline{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #d2dce1;border-bottom:1px solid #d2dce1}.proto-timeline-row{position:relative;min-height:82px;padding:13px 12px 10px 42px;border-right:1px solid #d2dce1}.proto-timeline-row:last-child{border-right:0}.proto-timeline-marker{position:absolute;left:12px;top:13px;display:grid;place-items:center;width:22px;height:22px;border:1px solid #82919a;border-radius:50%;font-size:10px}.proto-timeline-row b,.proto-timeline-row span,.proto-timeline-row small{display:block}.proto-timeline-row span{margin-top:7px;color:#667681;font-size:10px}.proto-timeline-row small{margin-top:5px;color:#667681;font-size:9px}.proto-timeline-row.approved .proto-timeline-marker{background:#284f46;color:#fff;border-color:#284f46}.proto-timeline-row.approved span{color:#216c49;font-weight:700}.proto-c-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.proto-c-facts{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid #d6dee3;border-left:1px solid #d6dee3}.proto-c-grid .proto-section{min-width:0}.proto-c-grid .proto-wide{grid-column:span 2}.proto-c .proto-items-section{margin-top:20px}.proto-switcher{position:fixed;bottom:18px;left:50%;z-index:20;display:flex;align-items:center;gap:3px;transform:translateX(-50%);padding:5px;border-radius:6px;background:#15232d;color:#fff;box-shadow:0 10px 30px #17232d44}.proto-switcher button{display:grid;place-items:center;width:34px;height:34px;border:0;background:transparent;color:#fff;cursor:pointer}.proto-switcher button:hover{background:#ffffff1c}.proto-switcher svg{width:18px}.proto-switcher div{min-width:180px;padding:0 8px;text-align:center}.proto-switcher b,.proto-switcher span{display:block}.proto-switcher b{font-size:12px}.proto-switcher span{margin-top:3px;color:#c5d0d4;font-size:10px}
@media(max-width:900px){.mr-print-prototype{padding:10px}.proto-toolbar{align-items:flex-start;flex-direction:column}.proto-paper{padding:24px 18px;min-width:720px}.proto-toolbar>div{width:100%}.proto-kpis{grid-template-columns:repeat(2,1fr)}.proto-kpis>div:nth-child(2n){border-right:0}.proto-facts{grid-template-columns:repeat(2,1fr)}.proto-b-layout{grid-template-columns:170px 1fr;gap:18px}.proto-c-grid{gap:14px}}
@media print{ @page{size:A4 landscape;margin:9mm}.mr-print-prototype{padding:0;background:#fff}.proto-toolbar,.proto-switcher{display:none!important}.proto-paper{max-width:none;min-height:auto;padding:0;border:0;box-shadow:none}.proto-paper,.proto-paper *{print-color-adjust:exact;-webkit-print-color-adjust:exact}.proto-items{font-size:8.5px}.proto-items th,.proto-items td{padding:5px 4px}.proto-section{break-inside:auto}.proto-approval,.proto-signatures,.proto-timeline{break-inside:avoid;page-break-inside:avoid}.proto-footer{margin-top:12px}}
${itemTableStyles}
`
