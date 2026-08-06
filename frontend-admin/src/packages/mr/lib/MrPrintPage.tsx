import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getMr } from '../client'
import type { MrApproval, MrOrder } from '../types'

const PRICING: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }
const STATUS: Record<string, string> = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
}

function choice(value: number | boolean | null | undefined, yes = '是', no = '否') {
  if (value === true || value === 1) return yes
  if (value === false || value === 0) return no
  return '-'
}

function decidedAt(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : ''
}

function signature(approvals: MrApproval[], key: string) {
  return approvals.find((approval) => approval.stepKey === key)
}

function SignatureBlock({ label, approval }: { label: string; approval?: MrApproval }) {
  const approved = approval?.action === 'approve'
  return <div className="mr-signature"><div className="mr-signature-label">{label}</div><div className="mr-signature-value">{approved ? approval.approverName || '已签核' : approval ? '待签核' : '不适用'}</div><div className="mr-signature-time">{approved ? decidedAt(approval.decidedAt) : ''}</div></div>
}

export function MrPrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<MrOrder | null>(null)
  const [error, setError] = useState('')
  const logo = `${import.meta.env.BASE_URL}dunyang-mark.png`

  useEffect(() => {
    if (!id) return
    let active = true
    getMr(id).then((value) => { if (active) setOrder(value) }).catch((err) => { if (active) setError((err as Error).message || '加载失败') })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!order) return
    const previous = document.title
    document.title = order.fileName || 'MR'
    return () => { document.title = previous }
  }, [order])

  const approvals = order?.approvals || []
  const install = useMemo(() => (order?.installOptions || []).join('、') || '-', [order?.installOptions])
  const maintenance = useMemo(() => (order?.maintenanceOptions || []).join('、') || '-', [order?.maintenanceOptions])

  if (!order && !error) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>
  if (!order) return <div className="p-8 text-destructive">{error}</div>

  return (
    <div className="p-4 sm:p-6">
      <style>{`
        .mr-print-root { color: #111827; background: white; font-family: Arial, "Microsoft YaHei", sans-serif; }
        .mr-print-root table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .mr-print-root th, .mr-print-root td { border: 1px solid #cbd5e1; padding: 4px 5px; vertical-align: middle; overflow-wrap: anywhere; }
        .mr-print-root th { background: #ede9fe; font-weight: 700; }
        .mr-meta th { width: 9%; text-align: left; background: #f5f3ff; }
        .mr-meta td { width: 16%; }
        .mr-items { margin-top: 8px; font-size: 8px; }
        .mr-items th { text-align: center; }
        .mr-items td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .mr-signatures { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 16px; }
        .mr-signature { min-height: 54px; border-bottom: 1px solid #111827; position: relative; padding: 3px 4px; }
        .mr-signature-label { font-size: 9px; font-weight: 700; }
        .mr-signature-value { margin-top: 8px; text-align: center; font-size: 11px; font-weight: 700; }
        .mr-signature-time { text-align: center; font-size: 7px; color: #475569; }
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          .mr-print-root, .mr-print-root * { visibility: visible !important; }
          .mr-print-root { position: absolute; inset: 0; width: 100%; padding: 0 !important; box-shadow: none !important; }
          .mr-print-toolbar { display: none !important; }
          .mr-items thead { display: table-header-group; }
          .mr-items tr { break-inside: avoid; }
        }
      `}</style>

      <div className="mr-print-toolbar mx-auto mb-4 flex max-w-[1400px] items-center justify-between gap-3">
        <Button variant="outline" onClick={() => navigate(`/mr/${id}`)}><ArrowLeft className="mr-2 size-4" />返回 MR</Button>
        <Button onClick={() => window.print()}><Printer className="mr-2 size-4" />打印 / 存为 PDF</Button>
      </div>

      <article className="mr-print-root mx-auto max-w-[1400px] bg-white p-5 shadow-sm">
        <header className="mb-3 flex items-start justify-between border-b-2 border-violet-700 pb-3">
          <div className="flex items-center gap-3"><img src={logo} alt="" className="size-11 object-contain" /><div><div className="text-xs font-semibold">Stark / NingBo Technology Inc.</div><div className="text-lg font-bold">敦阳（宁波）科技有限公司</div></div></div>
          <div className="text-right"><h1 className="text-2xl font-bold">客户订购申请单（MR）</h1><div className="mt-1 text-xs">{order.fileName} · {STATUS[order.status || 'draft'] || order.status}</div></div>
        </header>

        {order.status !== 'approved' ? <div className="mb-2 border border-amber-400 bg-amber-50 py-1 text-center text-xs font-bold text-amber-800">{STATUS[order.status || 'draft']}版本，仅供预览</div> : null}

        <table className="mr-meta text-[9px]">
          <tbody>
            <tr><th>填单日期</th><td>{text(order.fillDate)}</td><th>客户 P/O</th><td>{text(order.customerPo)}</td><th>Ctrl.NO</th><td>{text(order.ctrlNo)}</td><th>最晚交货日</th><td>{text(order.latestDeliveryDate)}</td></tr>
            <tr><th>客户名称</th><td colSpan={3}>{text(order.customerName)}</td><th>联系人</th><td>{text(order.contactName)}</td><th>负责业务</th><td>{text(order.salesOwnerName)}</td></tr>
            <tr><th>发票别</th><td>{text(order.invoiceType)}</td><th>计价模式</th><td>{PRICING[Number(order.pricingMode)] || '-'}</td><th>未税总计</th><td>{money(order.totalExcludingTax)}</td><th>合同号</th><td>{text(order.contractNo)}</td></tr>
            {order.penaltyContent ? <tr><th>罚则说明</th><td colSpan={7}>{text(order.penaltyContent)}</td></tr> : null}
            <tr><th>发票处理</th><td>{text(order.invoiceProcess)}</td><th>开票内容</th><td>{text(order.billingContent)}</td><th>发票收件人</th><td>{text(order.invoiceRecipient)}</td><th>开票/收款</th><td>{text(order.billingTiming)}</td></tr>
            <tr><th>采购 / TEL</th><td>{text(order.purchaser)} / {text(order.purchaserTel)}</td><th>收件人 / TEL</th><td>{text(order.recipient)} / {text(order.recipientTel)}</td><th>mail</th><td>{text(order.recipientMail)}</td><th>付款条件</th><td>{text(order.paymentTerms === '其他' ? order.paymentOther : order.paymentTerms)}</td></tr>
            <tr><th>分批送机</th><td>{choice(order.splitDelivery, '可', '否')}</td><th>案分类</th><td>{text(order.caseCategory)}</td><th>验收</th><td>{text(order.acceptance === '其他' ? order.acceptanceOther : order.acceptance)}</td><th>装机 / 维护</th><td>{install} / {maintenance}</td></tr>
            <tr><th>送机地点</th><td colSpan={7}>{text(order.deliveryLocation)}</td></tr>
          </tbody>
        </table>

        <table className="mr-items">
          <thead><tr><th className="w-[3%]">#</th><th className="w-[5%]">毛利</th><th className="w-[7%]">公司料号</th><th className="w-[8%]">原厂规格</th><th className="w-[14%]">品名 / 描述</th><th className="w-[6%]">保固/服务</th><th className="w-[5%]">装机</th><th className="w-[4%]">Qty</th><th className="w-[7%]">单价</th><th className="w-[7%]">售价小计</th><th className="w-[6%]">厂商</th><th className="w-[7%]">COST</th><th className="w-[7%]">成本含税</th><th className="w-[4%]">税率</th><th className="w-[10%]">采购单号</th></tr></thead>
          <tbody>{(order.items || []).map((item, index) => <tr key={item.id || index}><td className="num">{index + 1}</td><td className="num">{item.marginRate == null ? '-' : `${Number(item.marginRate).toFixed(2)}%`}</td><td>{text(item.companyPartNo)}</td><td>{text(item.oemSpec)}</td><td><strong>{text(item.name)}</strong>{item.description ? <div>{item.description}</div> : null}</td><td>{text(item.warrantyService)}</td><td>{text(item.installBy)}</td><td className="num">{text(item.qty)}</td><td className="num">{money(item.unitPrice)}</td><td className="num">{money(item.subtotal)}</td><td>{text(item.vendor)}</td><td className="num">{money(item.costExcludingTax)}</td><td className="num">{money(item.costInclTax)}</td><td className="num">{item.taxRate ? `${item.taxRate}%` : '-'}</td><td>{text(item.purchaseOrderNo)}</td></tr>)}</tbody>
        </table>

        <table className="mt-2 text-[9px]"><tbody><tr><th>未税总计</th><td className="text-right">{money(order.totals?.salesExcludingTax)}</td><th>增值税</th><td className="text-right">{money(order.totals?.vat)}</td><th>含税合计</th><td className="text-right">{money(order.totals?.salesIncludingTax)}</td><th>COST 总计</th><td className="text-right">{money(order.totals?.costExcludingTax)}</td><th>毛利率</th><td className="text-right">{Number(order.totals?.marginRate || 0).toFixed(2)}%</td></tr>{order.remark ? <tr><th>备注</th><td colSpan={9}>{order.remark}</td></tr> : null}</tbody></table>

        <div className="mr-signatures">
          <SignatureBlock label="副总经理" approval={signature(approvals, 'vp')} />
          <SignatureBlock label="工程会签单位" approval={signature(approvals, 'engineering')} />
          <SignatureBlock label="处级单位" approval={signature(approvals, 'supervisor')} />
          <SignatureBlock label="助理" approval={signature(approvals, 'assistant')} />
          <SignatureBlock label="业务" approval={signature(approvals, 'sales')} />
        </div>
        <footer className="mt-3 flex justify-between border-t pt-2 text-[8px] text-slate-500"><span>注：售价大于人民币 75 万，或利润低于 15%，签核至副总。</span><span>YW-009-070402</span></footer>
      </article>
    </div>
  )
}
