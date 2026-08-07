import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getMr } from '../client'
import type { MrApproval, MrItem, MrOrder } from '../types'

const PRICING: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }
const STATUS: Record<string, string> = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }
const SIGNATURE_ROLES = [
  ['assistant', '助理'],
  ['sales', '业务'],
  ['engineering', '工程会签'],
  ['supervisor', '处级单位'],
  ['vp', '副总经理'],
] as const

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
}

function percent(value: unknown) {
  const amount = Number(value)
  return value === null || value === undefined || !Number.isFinite(amount) ? '-' : `${amount.toFixed(2)}%`
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

function Fact({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`mr-fact ${wide ? 'mr-fact-wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function SectionTitle({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <div className="mr-section-title">
      <div className="mr-section-title-main">
        <span className="mr-section-index">{index}</span>
        <h2>{title}</h2>
      </div>
      {note ? <span className="mr-section-note">{note}</span> : null}
    </div>
  )
}

function SignatureBlock({ label, approval }: { label: string; approval?: MrApproval }) {
  const approved = approval?.action === 'approve'
  const rejected = approval?.action === 'reject'
  const skipped = approval?.action === 'skipped'
  const status = approved ? '已签核' : rejected ? '已驳回' : skipped ? '已跳过' : approval ? '待签核' : '不适用'
  return (
    <div className={`mr-signature-card ${approved ? 'is-approved' : ''} ${rejected ? 'is-rejected' : ''}`}>
      <div className="mr-signature-role">{label}</div>
      <div className="mr-signature-status">{status}</div>
      <div className="mr-signature-person">{approved ? approval?.approverName || '已签核' : rejected ? approval?.approverName || '已驳回' : '—'}</div>
      <div className="mr-signature-time">{approved || rejected ? decidedAt(approval?.decidedAt) : ''}</div>
    </div>
  )
}

function ItemDescription({ item }: { item: MrItem }) {
  return (
    <div className="mr-item-description">
      <strong>{text(item.name)}</strong>
      {item.description ? <span className="mr-item-subline mr-item-longtext">{item.description}</span> : null}
    </div>
  )
}

function ItemRow({ item, index }: { item: MrItem; index: number }) {
  return (
    <tr>
      <td className="mr-num">{index + 1}</td>
      <td>{text(item.companyPartNo)}</td>
      <td>{text(item.oemSpec)}</td>
      <td><ItemDescription item={item} /></td>
      <td>{text(item.warrantyService)}</td>
      <td>{text(item.installBy)}</td>
      <td className="mr-num">{text(item.qty)}</td>
      <td className="mr-num">{money(item.unitPrice)}</td>
      <td className="mr-num mr-emphasis">{money(item.subtotal)}</td>
      <td>{text(item.vendor)}</td>
      <td className="mr-num">{money(item.costExcludingTax)}</td>
      <td className="mr-num">{money(item.costInclTax)}</td>
      <td>{text(item.purchaseOrderNo)}</td>
    </tr>
  )
}

export function MrPrintPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const previewOrder = (location.state as { previewOrder?: MrOrder } | null)?.previewOrder || null
  const [order, setOrder] = useState<MrOrder | null>(previewOrder)
  const [error, setError] = useState('')
  const logo = `${import.meta.env.BASE_URL}dunyang-mark.png`

  useEffect(() => {
    if (!id || previewOrder) return
    let active = true
    getMr(id).then((value) => { if (active) setOrder(value) }).catch((err) => { if (active) setError((err as Error).message || '加载失败') })
    return () => { active = false }
  }, [id, previewOrder])

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

  const status = order.status || 'draft'
  const statusLabel = STATUS[status] || status
  const marginRate = order.totals?.marginRate
  const salesExcludingTax = Number(order.totals?.salesExcludingTax)
  const costExcludingTax = Number(order.totals?.costExcludingTax)
  const grossProfit = Number.isFinite(salesExcludingTax) && Number.isFinite(costExcludingTax) ? salesExcludingTax - costExcludingTax : null
  const contractDetail = [order.contractType, order.contractNo].filter(Boolean).join(' / ')
  const risk = Number(order.totals?.salesExcludingTax) > 750000 || (marginRate !== null && marginRate !== undefined && Number(marginRate) < 15)
  return (
    <div className="mr-print-page">
      <style>{`
        .mr-print-page {
          min-height: 100vh;
          padding: 24px;
          color: #18212b;
          background: #eef1f4;
          font-family: Arial, "Microsoft YaHei", sans-serif;
        }
        .mr-print-page * { box-sizing: border-box; }
        .mr-print-toolbar {
          display: flex;
          max-width: 1440px;
          margin: 0 auto 16px;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .mr-print-toolbar-title { color: #66717d; font-size: 12px; letter-spacing: .04em; }
        .mr-print-actions { display: flex; gap: 8px; }
        .mr-document {
          max-width: 1440px;
          margin: 0 auto;
          padding: 34px 38px 30px;
          background: #fff;
          border: 1px solid #d8dee5;
          border-radius: 4px;
          box-shadow: 0 12px 30px rgba(28, 38, 48, .08);
        }
        .mr-document-header {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) auto minmax(220px, 1fr);
          align-items: center;
          gap: 24px;
          padding-bottom: 22px;
          border-bottom: 2px solid #18212b;
        }
        .mr-brand { display: flex; align-items: center; gap: 12px; }
        .mr-brand img { width: 44px; height: 44px; object-fit: contain; }
        .mr-brand-en { color: #66717d; font-size: 10px; letter-spacing: .08em; }
        .mr-brand-cn { margin-top: 3px; font-size: 17px; font-weight: 800; letter-spacing: .05em; }
        .mr-document-title { text-align: center; }
        .mr-document-title h1 { margin: 0; font-size: 25px; letter-spacing: .12em; }
        .mr-document-title p { margin: 7px 0 0; color: #66717d; font-size: 11px; }
        .mr-document-ref { text-align: right; color: #66717d; font-size: 11px; line-height: 1.7; }
        .mr-document-ref strong { display: block; color: #18212b; font-size: 15px; }
        .mr-status {
          display: inline-flex;
          margin-top: 5px;
          padding: 3px 9px;
          border: 1px solid #66717d;
          border-radius: 999px;
          color: #18212b;
          font-size: 11px;
          font-weight: 700;
        }
        .mr-status-approved { border-color: #1f6b45; color: #1f6b45; }
        .mr-status-rejected, .mr-status-voided { border-color: #9b2c2c; color: #9b2c2c; }
        .mr-review-notice {
          margin-top: 16px;
          padding: 10px 14px;
          border-left: 4px solid #66717d;
          background: #f4f6f8;
          font-size: 12px;
          font-weight: 700;
        }
        .mr-summary {
          display: grid;
          grid-template-columns: 1.6fr 1.2fr 1fr 1fr 1fr;
          margin-top: 18px;
          border: 1px solid #cbd3db;
          background: #f8fafb;
        }
        .mr-summary-cell { min-width: 0; padding: 13px 15px; border-right: 1px solid #d8dee5; }
        .mr-summary-cell:last-child { border-right: 0; }
        .mr-summary-label { color: #66717d; font-size: 10px; }
        .mr-summary-value { margin-top: 5px; overflow-wrap: anywhere; font-size: 16px; font-weight: 800; }
        .mr-summary-value.small { font-size: 13px; }
        .mr-section { margin-top: 24px; }
        .mr-section-title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #18212b;
        }
        .mr-section-title-main { display: flex; align-items: baseline; gap: 10px; }
        .mr-section-index { color: #66717d; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
        .mr-section-title h2 { margin: 0; font-size: 15px; letter-spacing: .04em; }
        .mr-section-note { color: #66717d; font-size: 10px; }
        .mr-facts {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
          border-left: 1px solid #d8dee5;
          border-bottom: 1px solid #d8dee5;
        }
        .mr-fact { min-width: 0; min-height: 54px; padding: 10px 12px; border-right: 1px solid #d8dee5; border-top: 1px solid #d8dee5; }
        .mr-fact-wide { grid-column: span 2; }
        .mr-fact dt { color: #66717d; font-size: 10px; }
        .mr-fact dd { margin: 4px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
        .mr-fact dd strong { font-size: 13px; }
        .mr-items-wrap { overflow-x: auto; border: 1px solid #bcc6cf; }
        .mr-items-table { width: 100%; min-width: 1080px; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
        .mr-items-table th, .mr-items-table td { padding: 8px 7px; border-right: 1px solid #d8dee5; border-bottom: 1px solid #d8dee5; vertical-align: top; overflow-wrap: anywhere; }
        .mr-items-table th { color: #fff; background: #27343f; font-size: 10px; font-weight: 700; text-align: left; }
        .mr-items-table th:last-child, .mr-items-table td:last-child { border-right: 0; }
        .mr-items-table tbody tr:nth-child(even) { background: #fafbfc; }
        .mr-items-table th:nth-child(1) { width: 3%; text-align: center; }
        .mr-items-table th:nth-child(2) { width: 8%; }
        .mr-items-table th:nth-child(3) { width: 9%; }
        .mr-items-table th:nth-child(4) { width: 15%; }
        .mr-items-table th:nth-child(5) { width: 9%; }
        .mr-items-table th:nth-child(6) { width: 6%; }
        .mr-items-table th:nth-child(7) { width: 4%; text-align: right; }
        .mr-items-table th:nth-child(8), .mr-items-table th:nth-child(9), .mr-items-table th:nth-child(11), .mr-items-table th:nth-child(12) { width: 8%; text-align: right; }
        .mr-items-table th:nth-child(10) { width: 7%; }
        .mr-items-table th:nth-child(13) { width: 6%; }
        .mr-num { text-align: right; font-variant-numeric: tabular-nums; }
        .mr-item-description { line-height: 1.45; }
        .mr-item-description strong { display: block; font-size: 11px; }
        .mr-item-subline { display: block; color: #4d5a66; }
        .mr-item-longtext { margin-top: 3px; }
        .mr-item-meta { display: block; margin-top: 6px; color: #66717d; font-size: 9px; }
        .mr-item-meta:not(:empty) { word-spacing: 10px; }
        .mr-emphasis { font-weight: 800; }
        .mr-warning { color: #9b2c2c; font-weight: 800; }
        .mr-totals { display: grid; grid-template-columns: repeat(7, 1fr); margin-top: 10px; border: 1px solid #bcc6cf; }
        .mr-total { padding: 11px 13px; border-right: 1px solid #d8dee5; }
        .mr-total:last-child { border-right: 0; }
        .mr-total-label { color: #66717d; font-size: 10px; }
        .mr-total-value { margin-top: 4px; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .mr-total-risk .mr-total-value { color: #9b2c2c; }
        .mr-approval-section { break-inside: avoid; page-break-inside: avoid; }
        .mr-approval-note { margin: 12px 0 0; color: #66717d; font-size: 10px; }
        .mr-signature-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 12px; }
        .mr-signature-card { min-height: 96px; padding: 11px 12px; border: 1px solid #bcc6cf; background: #fafbfc; }
        .mr-signature-role { font-size: 11px; font-weight: 800; }
        .mr-signature-status { margin-top: 8px; color: #66717d; font-size: 10px; }
        .mr-signature-card.is-approved .mr-signature-status { color: #1f6b45; font-weight: 700; }
        .mr-signature-card.is-rejected .mr-signature-status { color: #9b2c2c; font-weight: 700; }
        .mr-signature-person { min-height: 22px; margin-top: 7px; font-size: 12px; font-weight: 700; }
        .mr-signature-time { color: #66717d; font-size: 9px; }
        .mr-document-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; padding-top: 9px; border-top: 1px solid #d8dee5; color: #66717d; font-size: 9px; }
        @media (max-width: 900px) {
          .mr-print-page { padding: 10px; }
          .mr-document { padding: 22px 18px; }
          .mr-document-header { grid-template-columns: 1fr; gap: 14px; }
          .mr-document-title, .mr-document-ref { text-align: left; }
          .mr-summary { grid-template-columns: repeat(2, 1fr); }
          .mr-summary-cell:nth-child(2n) { border-right: 0; }
          .mr-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .mr-fact-wide { grid-column: span 2; }
          .mr-totals { grid-template-columns: repeat(2, 1fr); }
          .mr-total:nth-child(2n) { border-right: 0; }
          .mr-signature-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media print {
          @page { size: A4 landscape; margin: 9mm; }
          body * { visibility: hidden !important; }
          .mr-print-page, .mr-print-page * { visibility: visible !important; }
          .mr-print-page { position: absolute; inset: 0; min-height: auto; padding: 0 !important; background: #fff !important; }
          .mr-print-toolbar { display: none !important; }
          .mr-document { max-width: none; padding: 0; border: 0; box-shadow: none; }
          .mr-document-header { padding-bottom: 14px; }
          .mr-summary, .mr-fact, .mr-total, .mr-signature-card { background: #fff !important; }
          .mr-status, .mr-status-approved, .mr-status-rejected, .mr-status-voided, .mr-signature-status, .mr-total-risk .mr-total-value, .mr-warning { color: #111 !important; border-color: #111 !important; }
          .mr-items-wrap { overflow: visible; }
          .mr-items-table { min-width: 0; font-size: 8.5px; }
          .mr-items-table th, .mr-items-table td { padding: 5px 4px; }
          .mr-items-table th { color: #111 !important; background: #eee !important; }
          .mr-items-table thead { display: table-header-group; }
          .mr-items-table tr { break-inside: avoid; page-break-inside: avoid; }
          .mr-section { break-inside: auto; }
          .mr-approval-section { break-inside: avoid; page-break-inside: avoid; }
          .mr-document-footer { margin-top: 12px; }
        }
      `}</style>

      <div className="mr-print-toolbar">
        <span className="mr-print-toolbar-title">MR 审批文件 / 打印预览</span>
        <div className="mr-print-actions">
          <Button variant="outline" onClick={() => navigate(`/mr/${id}`)}><ArrowLeft className="mr-2 size-4" />返回 MR</Button>
          <Button onClick={() => window.print()}><Printer className="mr-2 size-4" />打印 / 存为 PDF</Button>
        </div>
      </div>

      <article className="mr-document">
        <header className="mr-document-header">
          <div className="mr-brand">
            <img src={logo} alt="" />
            <div><div className="mr-brand-en">STARK / NINGBO TECHNOLOGY INC.</div><div className="mr-brand-cn">敦阳（宁波）科技有限公司</div></div>
          </div>
          <div className="mr-document-title">
            <h1>客户订购申请单</h1>
            <p>Material Requisition · MR</p>
          </div>
          <div className="mr-document-ref">
            <strong>{order.fileName || `MR-${order.id}`}</strong>
            <span>文档状态</span><br />
            <span className={`mr-status mr-status-${status}`}>{statusLabel}</span>
          </div>
        </header>

        {status !== 'approved' ? <div className="mr-review-notice">{statusLabel}版本，仅供审批预览；以最终签核结果为准。</div> : null}

        <section className="mr-summary" aria-label="审批摘要">
          <div className="mr-summary-cell"><div className="mr-summary-label">客户</div><div className="mr-summary-value small">{text(order.customerName)}</div></div>
          <div className="mr-summary-cell"><div className="mr-summary-label">创建人</div><div className="mr-summary-value small">{text(order.createdByName)}</div></div>
          <div className="mr-summary-cell"><div className="mr-summary-label">未税售价</div><div className="mr-summary-value">¥ {money(order.totals?.salesExcludingTax)}</div></div>
          <div className={`mr-summary-cell ${risk ? 'mr-total-risk' : ''}`}><div className="mr-summary-label">整单毛利率</div><div className="mr-summary-value">{percent(marginRate)}</div></div>
          <div className="mr-summary-cell"><div className="mr-summary-label">计价模式</div><div className="mr-summary-value small">{PRICING[Number(order.pricingMode)] || '-'}</div></div>
        </section>

        <section className="mr-section">
          <SectionTitle index="01" title="基本资料" note="客户与订单识别信息" />
          <dl className="mr-facts">
            <Fact label="客户名称" value={<strong>{text(order.customerName)}</strong>} wide />
            <Fact label="客户联系人" value={text(order.contactName)} />
            <Fact label="Ctrl.NO" value={text(order.ctrlNo)} />
            <Fact label="客户 P/O" value={text(order.customerPo)} />
            <Fact label="填单日期" value={text(order.fillDate)} />
            <Fact label="最晚交货日" value={text(order.latestDeliveryDate)} />
            <Fact label="案分类" value={text(order.caseCategory)} />
          </dl>
        </section>

        <section className="mr-section">
          <SectionTitle index="02" title="交易与履约条件" note="计价、开票、合同与交付" />
          <dl className="mr-facts">
            <Fact label="发票别" value={text(order.invoiceType)} />
            <Fact label="计价模式" value={PRICING[Number(order.pricingMode)] || '-'} />
            <Fact label="未税总计" value={`¥ ${money(order.totalExcludingTax)}`} />
            {contractDetail ? <Fact label="合同" value={contractDetail} /> : null}
            <Fact label="发票处理" value={text(order.invoiceProcess)} />
            <Fact label="开票内容" value={text(order.billingContent)} />
            <Fact label="开票 / 收款" value={text(order.billingTiming)} />
            <Fact label="付款条件" value={text(order.paymentTerms === '其他' ? order.paymentOther : order.paymentTerms)} />
            <Fact label="分批送机" value={choice(order.splitDelivery, '可', '否')} />
            <Fact label="验收方式" value={text(order.acceptance === '其他' ? order.acceptanceOther : order.acceptance)} />
            {order.penaltyContent ? <Fact label="罚则" value={text(order.penaltyContent)} wide /> : null}
            <Fact label="送机地点" value={text(order.deliveryLocation)} wide />
            <Fact label="装机对象" value={install} wide />
            <Fact label="维护对象" value={maintenance} wide />
          </dl>
        </section>

        <section className="mr-section">
          <SectionTitle index="03" title="联系人资料" note="采购、发票与收件" />
          <dl className="mr-facts">
            <Fact label="采购人" value={text(order.purchaser)} />
            <Fact label="采购电话" value={text(order.purchaserTel)} />
            <Fact label="发票收件人" value={text(order.invoiceRecipient)} />
            <Fact label="收件人" value={text(order.recipient)} />
            <Fact label="收件电话" value={text(order.recipientTel)} />
            <Fact label="收件人邮箱" value={text(order.recipientMail)} wide />
          </dl>
        </section>

        <section className="mr-section">
          <SectionTitle index="04" title="品项与金额" note={`${order.items?.length || 0} 项 · 长描述按原文换行`} />
          <div className="mr-items-wrap">
            <table className="mr-items-table">
              <thead><tr><th>项目</th><th>公司料号</th><th>原厂规格</th><th>品名 / 描述</th><th>保固服务</th><th>装机</th><th>数量</th><th>单价</th><th>销售小计</th><th>厂商</th><th>Cost</th><th>成本含税</th><th>采购单号</th></tr></thead>
              <tbody>{(order.items || []).map((item, index) => <ItemRow key={item.id || index} item={item} index={index} />)}</tbody>
            </table>
          </div>
          <div className="mr-totals">
            <div className="mr-total"><div className="mr-total-label">未税售价</div><div className="mr-total-value">¥ {money(order.totals?.salesExcludingTax)}</div></div>
            <div className="mr-total"><div className="mr-total-label">销售税额</div><div className="mr-total-value">¥ {money(order.totals?.vat)}</div></div>
            <div className="mr-total"><div className="mr-total-label">含税合计</div><div className="mr-total-value">¥ {money(order.totals?.salesIncludingTax)}</div></div>
            <div className="mr-total"><div className="mr-total-label">采购成本（未税）</div><div className="mr-total-value">¥ {money(order.totals?.costExcludingTax)}</div></div>
            <div className="mr-total"><div className="mr-total-label">采购成本（含税）</div><div className="mr-total-value">¥ {money(order.totals?.costIncludingTax)}</div></div>
            <div className="mr-total"><div className="mr-total-label">毛利</div><div className="mr-total-value">{grossProfit === null ? '-' : `¥ ${money(grossProfit)}`}</div></div>
            <div className={`mr-total ${risk ? 'mr-total-risk' : ''}`}><div className="mr-total-label">整单毛利率</div><div className="mr-total-value">{percent(marginRate)}</div></div>
          </div>
        </section>

        {order.remark ? (
          <section className="mr-section">
            <SectionTitle index="05" title="补充说明" />
            <dl className="mr-facts"><Fact label="备注" value={text(order.remark)} wide /></dl>
          </section>
        ) : null}

        <section className="mr-section mr-approval-section">
          <SectionTitle index={order.remark ? '06' : '05'} title="会签流转" note="审批结果与时间记录" />
          {status === 'rejected' && order.rejectReason ? <div className="mr-review-notice">驳回原因：{order.rejectReason}</div> : null}
          <div className="mr-signature-grid">
            {SIGNATURE_ROLES.map(([key, label]) => <SignatureBlock key={key} label={label} approval={signature(approvals, key)} />)}
          </div>
          <p className="mr-approval-note">签核条件：未税售价超过人民币 75 万元，或整单毛利率低于 15% 时，追加副总经理签核；装机对象包含“敦阳”时，追加工程会签。</p>
        </section>

        <footer className="mr-document-footer"><span>MR / 审批文件</span><span>打印内容来自当前 MR 数据 · 黑白打印适配</span></footer>
      </article>
    </div>
  )
}
