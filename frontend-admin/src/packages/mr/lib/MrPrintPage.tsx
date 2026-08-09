import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getMr } from '../client'
import type { MrApproval, MrItem, MrOrder } from '../types'

const STATUS: Record<string, string> = { draft: '草稿', in_review: '签核中', approved: '已通过', rejected: '已驳回', voided: '已作废' }
const PRICING: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }
const SIGNATURE_ROLES = [['assistant', '助理'], ['sales', '业务'], ['engineering', '工程会签'], ['supervisor', '处级单位'], ['vp', '副总经理']] as const
// 页眉、订货条与汇总已展示的字段，不再重复进订购与交付资料区
const HEADER_DUPLICATES = new Set(['客户名称', 'Ctrl.NO', '客户 P/O', '发票别', '开票内容', '付款条件', '未税总计', '最晚交货日', '送机地点'])
const FACT_GROUPS = [
  ['客户与合同', ['客户联系人', '案分类', '合同号', '罚则说明', '填表日期', '报价附件']],
  ['交易与开票', ['计价模式', '发票处理', '开票 / 收款', '付款条件说明']],
  ['交付与验收', ['分批送机', '验收', '验收说明', '交货条款', '出货单号']],
  ['联系与收件', ['采购联系人', '采购联系电话', '采购联系邮箱', '货物收件人', '收件电话', '收件邮箱', '发票收件人', '发票收件电话', '发票收件邮箱']],
  ['备注与其他', ['备注', '驳回原因', '作废原因']],
] as const

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && String(value).trim() !== ''
}
function text(value: unknown, fallback = '-') { return hasValue(value) ? String(value) : fallback }
function money(value: unknown, fallback = '-') { if (!hasValue(value)) return fallback; const amount = Number(value); return Number.isFinite(amount) ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fallback }
function moneyText(value: unknown, fallback: string) { return hasValue(value) ? `¥ ${money(value, fallback)}` : fallback }
function percent(value: unknown, fallback = '-') { const amount = Number(value); return hasValue(value) && Number.isFinite(amount) ? `${amount.toFixed(2)}%` : fallback }
function decidedAt(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 16) : '' }
function approval(approvals: MrApproval[], key: string) { return approvals.find((item) => item.stepKey === key) }
function approvalState(item?: MrApproval) { return item?.action === 'approve' ? '已签核' : item?.action === 'reject' ? '已驳回' : item?.action === 'skipped' ? '已跳过' : item ? '待签核' : '未开始' }
function vendorAbbreviation(value: unknown, fallback = '-') {
  return text(value, fallback).replace(/(?:信息|计算机|网络|电子)?(?:科技|技术|贸易|商贸)?(?:股份)?有限公司$/, '') || fallback
}

function Header({ order, emptyText, formal }: { order: MrOrder; emptyText: string; formal: boolean }) {
  const status = order.status || 'draft'
  const reference = [formal && !hasValue(order.customerPo) ? null : hasValue(order.customerPo) ? String(order.customerPo) : `客户 P/O · ${emptyText}`, STATUS[status] || status].filter(hasValue).join(' · ')
  return <header className="a-header"><div className="a-brand"><img src={`${import.meta.env.BASE_URL}dunyang-mark.png`} alt="" /><div><span>STARK / NINGBO TECHNOLOGY INC.</span><strong>敦阳（宁波）科技有限公司</strong></div></div><div className="a-title"><h1>客户订购申请单（境内单）</h1></div><div className="a-ref"><b>{text(order.ctrlNo || order.fileName, emptyText)}</b><span>{reference}</span></div></header>
}
function Fact({ label, value }: { label: string; value: ReactNode }) { return <div className="a-fact"><small>{label}</small><div>{value}</div></div> }
function Section({ index, title, children }: { index: string; title: string; children: ReactNode }) { return <section className="a-section"><div className="a-section-title"><span>{index}</span><h2>{title}</h2></div>{children}</section> }
function ItemTable({ items, emptyText, formal }: { items: MrItem[]; emptyText: string; formal: boolean }) {
  const definitions = [
    { key: 'index', label: '项目', weight: 3, align: 'center', optional: false, present: () => true, render: (_item: MrItem, index: number) => index + 1 },
    { key: 'companyPartNo', label: '公司料号', weight: 7, align: 'left', optional: true, present: (item: MrItem) => hasValue(item.companyPartNo), render: (item: MrItem) => text(item.companyPartNo, emptyText) },
    { key: 'oemSpec', label: '原厂规格', weight: 9, align: 'left', optional: true, present: (item: MrItem) => hasValue(item.oemSpec), render: (item: MrItem) => text(item.oemSpec, emptyText) },
    { key: 'description', label: '品名 / 描述', weight: 18, align: 'left', optional: false, present: (item: MrItem) => hasValue(item.name) || hasValue(item.description), render: (item: MrItem) => <span><strong>{text(item.name || item.description, emptyText)}</strong>{item.name && item.description && item.name !== item.description ? <small>{item.description}</small> : null}</span> },
    { key: 'warrantyService', label: '保固服务', weight: 8, align: 'left', optional: true, present: (item: MrItem) => hasValue(item.warrantyService), render: (item: MrItem) => text(item.warrantyService, emptyText) },
    { key: 'installBy', label: '装机方', weight: 6, align: 'left', optional: true, present: (item: MrItem) => hasValue(item.installBy), render: (item: MrItem) => text(item.installBy, emptyText) },
    { key: 'qty', label: '数量', weight: 4, align: 'right', optional: false, present: (item: MrItem) => hasValue(item.qty), render: (item: MrItem) => text(item.qty, emptyText) },
    { key: 'unitPrice', label: '销售单价', weight: 8, align: 'right', optional: false, present: (item: MrItem) => hasValue(item.unitPrice), render: (item: MrItem) => moneyText(item.unitPrice, emptyText) },
    { key: 'subtotal', label: '销售小计 / 毛利率', weight: 9, align: 'right', optional: false, present: (item: MrItem) => hasValue(item.subtotal), render: (item: MrItem) => <span><strong>{moneyText(item.subtotal, emptyText)}</strong><small>{percent(item.marginRate, emptyText)}</small></span> },
    { key: 'vendor', label: '厂商', weight: 8, align: 'left', optional: true, present: (item: MrItem) => hasValue(item.vendor), render: (item: MrItem) => vendorAbbreviation(item.vendor, emptyText) },
    { key: 'costExcludingTax', label: '成本未税', weight: 8, align: 'right', optional: false, present: (item: MrItem) => hasValue(item.costExcludingTax), render: (item: MrItem) => moneyText(item.costExcludingTax, emptyText) },
    { key: 'costInclTax', label: '成本含税 / 税率', weight: 9, align: 'right', optional: false, present: (item: MrItem) => hasValue(item.costInclTax) || hasValue(item.taxRate), render: (item: MrItem) => <span><strong>{moneyText(item.costInclTax, emptyText)}</strong><small>{hasValue(item.taxRate) ? `${item.taxRate}%` : emptyText}</small></span> },
    { key: 'purchase', label: '采购单号 / 来源', weight: 9, align: 'left', optional: true, present: (item: MrItem) => hasValue(item.purchaseOrderNo) || hasValue(item.costSource), render: (item: MrItem) => <span><strong>{text(item.purchaseOrderNo, emptyText)}</strong><small>{text(item.costSource, emptyText)}</small></span> },
  ]
  const columns = definitions.filter((column) => !formal || !column.optional || items.some(column.present))
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0)
  return <table className="a-items"><thead><tr>{columns.map((column) => <th key={column.key} style={{ width: `${column.weight / totalWeight * 100}%`, textAlign: column.align as 'left' | 'right' | 'center' }}>{column.label}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id || index}>{columns.map((column) => <td key={column.key} data-label={column.label} className={`a-align-${column.align} ${column.key === 'subtotal' ? 'a-strong' : ''}`} title={column.key === 'vendor' ? text(item.vendor, emptyText) : undefined}>{column.render(item, index)}</td>)}</tr>)}</tbody></table>
}
function Signatures({ order, formal }: { order: MrOrder; formal: boolean }) {
  const approvals = order.approvals || []
  const roles = formal ? SIGNATURE_ROLES.filter(([key]) => approval(approvals, key)) : SIGNATURE_ROLES
  return <div className="a-signatures" style={{ gridTemplateColumns: `repeat(${Math.max(1, roles.length)}, 1fr)` }}>{roles.map(([key, label]) => {
    const item = approval(approvals, key)
    const name = item?.approverName || item?.assigneeName || (formal ? '' : '—')
    return <div className={`a-signature ${item?.action === 'approve' ? 'approved' : item?.action === 'reject' ? 'rejected' : ''}`} key={key}>
      <b>{label}</b><span>{approvalState(item)}</span>
      {item?.action === 'approve' && item.approverSignatureSnapshot ? <img src={item.approverSignatureSnapshot} alt={`${name}的手写签名`} /> : null}
      <strong>{name}</strong>
      {!formal && item?.action === 'approve' && !item.approverSignatureSnapshot ? <small>未设置手写签名</small> : null}
      <small>{decidedAt(item?.decidedAt)}</small>
      {item?.reason ? <small className="a-signature-reason">{item.reason}</small> : null}
    </div>
  })}</div>
}

const styles = `
.mr-print-page{min-height:100vh;padding:24px;background:#e8ecef;color:#17232d;font-family:Arial,"Microsoft YaHei",sans-serif}.mr-print-page *{box-sizing:border-box}.mr-print-toolbar{max-width:1360px;margin:0 auto 16px;display:flex;align-items:center;justify-content:space-between;gap:16px;color:#53616d;font-size:12px}.mr-print-actions{display:flex;gap:8px}.mr-document{max-width:1360px;margin:auto;padding:32px 38px 24px;background:#fff;border:1px solid #d4dce2;border-top:5px solid #73529b;box-shadow:0 15px 42px #26374618}.a-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;padding-bottom:17px;border-bottom:2px solid #4e386e}.a-brand{display:flex;align-items:center;gap:11px}.a-brand img{width:42px;height:42px;object-fit:contain}.a-brand span{display:block;color:#766a87;font-size:9px;letter-spacing:.09em}.a-brand strong{display:block;margin-top:4px;color:#3e2d59;font-size:16px}.a-title{text-align:center}.a-title h1{margin:0;color:#4e386e;font-size:25px;letter-spacing:.12em}.a-title p{margin:6px 0 0;color:#766a87;font-size:11px}.a-ref{text-align:right}.a-ref b{display:block;color:#3e2d59;font-size:16px}.a-ref span{display:block;margin-top:5px;color:#766a87;font-size:11px}.a-orderbar{display:grid;grid-template-columns:1.2fr 1fr 1fr .7fr;margin-top:17px;border-top:1px solid #c9bae0;border-bottom:1px solid #c9bae0;background:#faf8fd}.a-orderbar>div{min-height:62px;padding:11px 14px;border-right:1px solid #ded5ea}.a-orderbar>div:last-child{border-right:0}.a-orderbar small,.a-delivery small,.a-note small{display:block;color:#766a87;font-size:10px}.a-orderbar b,.a-orderbar span,.a-delivery b,.a-delivery span{display:block;margin-top:4px;overflow-wrap:anywhere}.a-orderbar b,.a-delivery b{color:#3e2d59;font-size:13px}.a-orderbar span,.a-delivery span{color:#746985;font-size:10px;line-height:1.35}.a-section{margin-top:20px}.a-section-title{display:flex;align-items:baseline;gap:10px;margin-bottom:8px;padding-bottom:7px;border-bottom:1px solid #4e386e}.a-section-title>span{color:#766a87;font-size:10px;font-weight:800;letter-spacing:.1em}.a-section-title h2{margin:0;color:#4e386e;font-size:15px}.a-items{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}.a-items th,.a-items td{padding:7px 5px;border:1px solid #cbd5db;vertical-align:top;overflow-wrap:anywhere}.a-items th{background:#57406f;color:#fff;text-align:left;font-size:9px}.a-items th:nth-child(1){width:3%;text-align:center}.a-items th:nth-child(2){width:8%}.a-items th:nth-child(3){width:9%}.a-items th:nth-child(4){width:15%}.a-items th:nth-child(5){width:9%}.a-items th:nth-child(6){width:6%}.a-items th:nth-child(7){width:4%;text-align:right}.a-items th:nth-child(8),.a-items th:nth-child(9),.a-items th:nth-child(11),.a-items th:nth-child(12){width:8%;text-align:right}.a-items th:nth-child(10){width:7%}.a-items th:nth-child(13){width:6%}.a-items td:nth-child(1),.a-items td:nth-child(7),.a-items td:nth-child(n+8):nth-child(-n+9),.a-items td:nth-child(n+11):nth-child(-n+12){text-align:right;font-variant-numeric:tabular-nums}.a-items td:first-child{text-align:center}.a-items td strong,.a-items td small{display:block}.a-items td small{margin-top:3px;color:#64747e;line-height:1.35}.a-items tbody tr:nth-child(even){background:#fafbfc}.a-strong{font-weight:800}.a-totals{display:grid;grid-template-columns:repeat(7,1fr);margin-top:9px;border:1px solid #c9bae0}.a-total{min-width:0;padding:10px 11px;border-right:1px solid #ded5ea}.a-total:last-child{border-right:0}.a-total small{display:block;color:#766a87;font-size:10px}.a-total b{display:block;margin-top:4px;color:#3e2d59;font-size:14px}.a-total:last-child{background:#f1ecf7}.a-bottom{display:grid;grid-template-columns:1fr 1.2fr;gap:26px}.a-delivery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid #d8cfe5;border-left:1px solid #d8cfe5}.a-delivery>div{min-height:60px;padding:9px 11px;border-right:1px solid #d8cfe5;border-bottom:1px solid #d8cfe5}.a-note{margin:9px 0 0;padding:9px 11px;background:#f4f0f8;color:#594b68;font-size:10px;line-height:1.55}.a-note small{margin-bottom:3px}.a-signatures{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.a-signature{min-height:88px;padding:10px;border:1px solid #bcc8cf;background:#fafbfc}.a-signature b,.a-signature span,.a-signature strong,.a-signature small{display:block}.a-signature span{margin-top:7px;color:#667681;font-size:10px}.a-signature strong{min-height:20px;margin-top:6px;font-size:12px}.a-signature small{color:#667681;font-size:9px}.a-signature.approved span{color:#216c49;font-weight:700}.a-signature.rejected span{color:#9b2c2c;font-weight:700}.a-footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;border-top:1px solid #d6dee3;color:#71808a;font-size:9px}@media(max-width:900px){.mr-print-page{padding:10px}.mr-document{padding:24px 18px;min-width:720px}.mr-print-toolbar{align-items:flex-start;flex-direction:column}.a-orderbar{grid-template-columns:repeat(2,1fr)}.a-bottom{gap:16px}}@media print{@page{size:A4 landscape;margin:9mm}.mr-print-page{padding:0;background:#fff}.mr-print-toolbar{display:none!important}.mr-document{max-width:none;padding:0;border:0;box-shadow:none}.mr-document,.mr-document *{print-color-adjust:exact;-webkit-print-color-adjust:exact}.a-items{font-size:8.5px}.a-items th,.a-items td{padding:5px 4px}.a-orderbar,.a-total:last-child,.a-note{background:#fff!important}.a-header,.a-section-title{border-color:#111}.a-title h1,.a-section-title h2,.a-orderbar b,.a-delivery b{color:#111!important}.a-orderbar,.a-delivery,.a-delivery>div,.a-totals,.a-total{border-color:#bbb}.a-items th{background:#eee!important;color:#111!important}.a-signatures,.a-footer{break-inside:avoid;page-break-inside:avoid}}
.mr-print-page{padding:20px}.mr-print-toolbar{margin-bottom:12px}.mr-document{padding:24px 30px 18px}.a-header{gap:16px;padding-bottom:9px}.a-brand{gap:9px}.a-brand img{width:34px;height:34px}.a-brand span{color:#655a73;font-size:8px;letter-spacing:.06em}.a-brand strong{margin-top:2px;font-size:14px}.a-title h1{font-size:21px;letter-spacing:.06em}.a-ref b{font-size:14px}.a-ref span{margin-top:3px;color:#655a73;font-size:10px}.a-orderbar{margin-top:9px}.a-orderbar>div{min-height:46px;padding:7px 10px}.a-orderbar small,.a-delivery small,.a-note small{color:#655a73;font-size:9px}.a-orderbar b,.a-orderbar span,.a-delivery b,.a-delivery span{margin-top:2px}.a-orderbar b,.a-delivery b{font-size:12px}.a-orderbar span,.a-delivery span{color:#61566e;font-size:9px;line-height:1.3}.a-section{margin-top:12px}.a-section-title{gap:8px;margin-bottom:5px;padding-bottom:4px}.a-section-title>span{color:#655a73;font-size:9px}.a-section-title h2{font-size:13px}.a-items{font-size:8.5px}.a-items th,.a-items td{padding:5px 4px;border-color:#b9c5cc}.a-items th{font-size:8.5px}.a-items td small{margin-top:2px;color:#52616a;line-height:1.3}.a-totals{margin-top:6px}.a-total{padding:7px 8px}.a-total small{color:#655a73;font-size:9px}.a-total b{margin-top:2px;font-size:12px}.a-bottom{gap:18px}.a-delivery>div{min-height:48px;padding:6px 8px}.a-note{margin-top:6px;padding:6px 8px;font-size:9px;line-height:1.4}.a-signatures{gap:6px}.a-signature{min-height:70px;padding:7px;border-color:#aebbc3}.a-signature span{margin-top:4px;color:#52616a;font-size:9px}.a-signature strong{min-height:17px;margin-top:4px;font-size:11px}.a-signature small{color:#52616a;font-size:8px}.a-footer{margin-top:10px;padding-top:6px;border-color:#bfc9cf;color:#52616a;font-size:8px}@media print{@page{size:A4 landscape;margin:7mm}html,body,#root{height:auto!important;min-height:0!important;overflow:visible!important}.mr-print-page{min-height:0;padding:0}.mr-print-toolbar,[data-sonner-toaster]{display:none!important}.mr-document{max-width:none;padding:0;border:0;box-shadow:none;color:#111!important}.a-brand span,.a-ref span,.a-orderbar small,.a-orderbar span,.a-section-title>span,.a-items td small,.a-total small,.a-delivery small,.a-delivery span,.a-note,.a-signature span,.a-signature small,.a-footer{color:#222!important}.a-orderbar,.a-total:last-child,.a-note,.a-signature,.a-items tbody tr{background:#fff!important}.a-header,.a-section-title{border-color:#111!important}.a-title h1,.a-section-title h2,.a-orderbar b,.a-delivery b,.a-total b{color:#111!important}.a-orderbar,.a-orderbar>div,.a-delivery,.a-delivery>div,.a-totals,.a-total,.a-items th,.a-items td,.a-signature{border-color:#777!important}.a-items th{background:#ddd!important;color:#111!important}.a-items thead{display:table-header-group}.a-items tr,.a-totals,.a-signatures,.a-footer{break-inside:avoid;page-break-inside:avoid}}
.mr-document{position:relative;overflow:hidden}.a-watermark{pointer-events:none;position:absolute;inset:42% 5% auto;z-index:2;transform:rotate(-18deg);color:#b91c1c18;font-size:56px;font-weight:800;text-align:center;letter-spacing:.08em}.a-signature-reason{margin-top:3px;overflow-wrap:anywhere}.mr-print-page.is-embedded{min-height:0;padding:0;background:transparent}.mr-print-page.is-embedded .mr-document{max-width:none}
.mr-print-page.is-embedded .mr-print-toolbar{max-width:none;margin:0;padding:12px 14px;border-bottom:1px solid #d4dce2}
.a-fact-group{margin-top:10px}.a-fact-group:first-child{margin-top:0}.a-fact-group-title{margin-bottom:5px;padding-left:7px;border-left:3px solid #73529b;color:#4e386e;font-size:10px;font-weight:700}@media print{.a-fact-group{break-inside:avoid}.a-fact-group-title{color:#111!important;border-left-color:#777}}
@media screen and (min-width:901px){.mr-print-page .a-items,.mr-print-page .a-items th{font-size:10px}.mr-print-page .a-items th,.mr-print-page .a-items td{padding:7px 5px}.mr-print-page .a-orderbar span,.mr-print-page .a-delivery span{font-size:10px}}
@media(max-width:900px){.mr-document{min-width:0!important;padding:18px 14px}.a-header{grid-template-columns:1fr;gap:10px}.a-brand,.a-ref{text-align:left}.a-title{text-align:left}.a-title h1{font-size:18px}.a-orderbar{grid-template-columns:1fr}.a-orderbar>div{border-right:0;border-bottom:1px solid #ded5ea}.a-totals{grid-template-columns:repeat(2,1fr)}.a-total{border-bottom:1px solid #ded5ea}.a-bottom{display:block}.a-items,.a-items tbody,.a-items tr,.a-items td{display:block;width:100%}.a-items thead{display:none}.a-items tr{margin-bottom:10px;border:1px solid #b9c5cc;background:#fff!important}.a-items td,.a-items td:first-child,.a-items td:nth-child(n){display:grid;grid-template-columns:105px minmax(0,1fr);gap:8px;border:0;border-bottom:1px solid #e2e8f0;text-align:left!important;font-size:11px}.a-items td:last-child{border-bottom:0}.a-items td::before{content:attr(data-label);color:#655a73;font-weight:700}.a-signatures{grid-template-columns:1fr}.a-signature{min-height:0}}
.a-details{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid #d8cfe5;border-left:1px solid #d8cfe5}.a-fact{min-width:0;min-height:44px;padding:7px 9px;border-right:1px solid #d8cfe5;border-bottom:1px solid #d8cfe5;break-inside:avoid}.a-fact small{display:block;color:#655a73;font-size:8.5px}.a-fact div{margin-top:3px;overflow-wrap:anywhere;white-space:pre-wrap;font-size:10px;line-height:1.35}.a-items td.a-align-right{text-align:right;font-variant-numeric:tabular-nums}.a-items td.a-align-center{text-align:center}.a-items td.a-align-left{text-align:left}
@media(max-width:900px){.a-details{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media print{.a-watermark{position:fixed;inset:42% 5% auto}.mr-document{min-width:0!important}.a-header{grid-template-columns:1fr auto 1fr!important;gap:16px}.a-brand{text-align:left}.a-title{text-align:center}.a-title h1{font-size:21px}.a-ref{text-align:right}.a-orderbar{grid-template-columns:1.2fr 1fr 1fr .7fr!important}.a-orderbar>div{border-right:1px solid #777;border-bottom:0}.a-orderbar>div:last-child{border-right:0}.a-totals{grid-template-columns:repeat(7,1fr)!important}.a-items{display:table!important;width:100%!important}.a-items thead{display:table-header-group!important}.a-items tbody{display:table-row-group!important}.a-items tr{display:table-row!important;width:auto!important;border:0;margin:0}.a-items td,.a-items td:first-child,.a-items td:nth-child(n){display:table-cell!important;width:auto!important;grid-template-columns:none;border:1px solid #777!important;font-size:8.5px}.a-items td.a-align-right{text-align:right!important}.a-items td.a-align-center{text-align:center!important}.a-items td.a-align-left{text-align:left!important}.a-items td::before{display:none}.a-details{grid-template-columns:repeat(4,minmax(0,1fr));border-color:#777}.a-fact{min-height:36px;padding:5px 7px;border-color:#777}.a-fact small{color:#222!important;font-size:7.5px}.a-fact div{font-size:8.5px}}
@media print{.a-section{margin-top:9px}.a-totals{grid-template-columns:repeat(var(--total-columns),1fr)!important}.a-signature{min-height:64px;padding:6px}.a-footer{display:none!important}}
`

export function MrDocumentView({ order, toolbar, embedded = false }: { order: MrOrder; toolbar?: ReactNode; embedded?: boolean }) {
  const status = order.status || 'draft'
  const formal = ['approved', 'voided'].includes(status)
  const emptyText = formal ? '' : '未填写'
  const install = (order.installOptions || []).join('、') || emptyText
  const maintenance = (order.maintenanceOptions || []).join('、') || emptyText
  const totals = order.totals || {}
  const sales = hasValue(totals.salesExcludingTax) ? Number(totals.salesExcludingTax) : NaN
  const cost = hasValue(totals.costExcludingTax) ? Number(totals.costExcludingTax) : NaN
  const grossProfit = Number.isFinite(sales) && Number.isFinite(cost) ? sales - cost : null
  const watermark = status === 'in_review' ? '签核中 · 非正式文件' : status === 'voided' ? '已作废' : ''
  const versionLabel = status === 'in_review' && order.currentStepKey === 'assistant'
    ? `${Number(order.versionNo || 0) + 1}（待冻结）`
    : String(order.versionNo || order.currentVersion?.versionNo || 0)
  const facts = [
    { label: '客户名称', raw: order.customerName, value: text(order.customerName, emptyText) },
    { label: '客户联系人', raw: order.contactName, value: text(order.contactName, emptyText) },
    { label: 'Ctrl.NO', raw: order.ctrlNo, value: text(order.ctrlNo, emptyText) },
    { label: '客户 P/O', raw: order.customerPo, value: text(order.customerPo, emptyText) },
    { label: '负责业务', raw: order.salesOwnerName, value: text(order.salesOwnerName, emptyText) },
    { label: '计价模式', raw: order.pricingMode, value: PRICING[Number(order.pricingMode)] || emptyText },
    { label: '发票别', raw: order.invoiceType, value: text(order.invoiceType, emptyText) },
    { label: '未税总计', raw: order.totalExcludingTax ?? totals.salesExcludingTax, value: moneyText(order.totalExcludingTax ?? totals.salesExcludingTax, emptyText) },
    { label: '案分类', raw: order.caseCategory, value: text(order.caseCategory, emptyText) },
    { label: '合同号', raw: order.contractNo, value: text(order.contractNo, emptyText) },
    { label: '罚则说明', raw: order.penaltyContent, value: text(order.penaltyContent, emptyText) },
    { label: '发票处理', raw: order.invoiceProcess, value: text(order.invoiceProcess, emptyText) },
    { label: '开票 / 收款', raw: order.billingTiming, value: text(order.billingTiming, emptyText) },
    { label: '开票内容', raw: order.billingContent, value: text(order.billingContent, emptyText) },
    { label: '付款条件', raw: order.paymentTerms, value: text(order.paymentTerms, emptyText) },
    { label: '付款条件说明', raw: order.paymentOther, value: text(order.paymentOther, emptyText) },
    { label: '采购联系人', raw: order.purchaser, value: text(order.purchaser, emptyText) },
    { label: '采购联系电话', raw: order.purchaserTel, value: text(order.purchaserTel, emptyText) },
    { label: '采购联系邮箱', raw: order.purchaserMail, value: text(order.purchaserMail, emptyText) },
    { label: '货物收件人', raw: order.recipient, value: text(order.recipient, emptyText) },
    { label: '收件电话', raw: order.recipientTel, value: text(order.recipientTel, emptyText) },
    { label: '收件邮箱', raw: order.recipientMail, value: text(order.recipientMail, emptyText) },
    { label: '发票收件人', raw: order.invoiceRecipient, value: text(order.invoiceRecipient, emptyText) },
    { label: '发票收件电话', raw: order.invoiceRecipientTel, value: text(order.invoiceRecipientTel, emptyText) },
    { label: '发票收件邮箱', raw: order.invoiceRecipientMail, value: text(order.invoiceRecipientMail, emptyText) },
    { label: '最晚交货日', raw: order.latestDeliveryDate, value: text(order.latestDeliveryDate, emptyText) },
    { label: '分批送机', raw: order.splitDelivery, value: hasValue(order.splitDelivery) ? order.splitDelivery ? '可分批' : '不分批' : emptyText },
    { label: '验收', raw: order.acceptance, value: text(order.acceptance, emptyText) },
    { label: '验收说明', raw: order.acceptanceOther, value: text(order.acceptanceOther, emptyText) },
    { label: '送机地点', raw: order.deliveryLocation, value: text(order.deliveryLocation, emptyText) },
    { label: '装机对象', raw: order.installOptions, value: install },
    { label: '维护对象', raw: order.maintenanceOptions, value: maintenance },
    { label: '交货条款', raw: order.deliveryTerms, value: text(order.deliveryTerms, emptyText) },
    { label: '出货单号', raw: order.shipmentNo, value: text(order.shipmentNo, emptyText) },
    { label: '填表日期', raw: order.fillDate, value: text(order.fillDate, emptyText) },
    { label: '报价附件', raw: order.quotationFiles, value: order.quotationFiles?.map((file) => file.name).join('、') || emptyText },
    { label: '备注', raw: order.remark, value: text(order.remark, emptyText) },
    ...(order.rejectReason ? [{ label: '驳回原因', raw: order.rejectReason, value: order.rejectReason }] : []),
    ...(order.voidReason ? [{ label: '作废原因', raw: order.voidReason, value: order.voidReason }] : []),
  ].filter((fact) => (!formal || hasValue(fact.raw)) && !HEADER_DUPLICATES.has(fact.label) && !(fact.label === '付款条件说明' && order.paymentTerms === '其他'))
  const groupedFacts = FACT_GROUPS.map(([group, labels]) => ({
    group,
    items: labels.map((label) => facts.find((fact) => fact.label === label)).filter((fact): fact is (typeof facts)[number] => Boolean(fact)),
  })).filter(({ items }) => items.length > 0)
  const totalFacts = [
    { label: '未税售价', raw: totals.salesExcludingTax, value: moneyText(totals.salesExcludingTax, emptyText) },
    { label: '销售税额', raw: totals.vat, value: moneyText(totals.vat, emptyText) },
    { label: '含税合计', raw: totals.salesIncludingTax, value: moneyText(totals.salesIncludingTax, emptyText) },
    { label: '采购成本（未税）', raw: totals.costExcludingTax, value: moneyText(totals.costExcludingTax, emptyText) },
    { label: '采购成本（含税）', raw: totals.costIncludingTax, value: moneyText(totals.costIncludingTax, emptyText) },
    { label: '毛利', raw: grossProfit, value: grossProfit === null ? emptyText : moneyText(grossProfit, emptyText) },
    { label: '整单毛利率', raw: totals.marginRate, value: percent(totals.marginRate, emptyText) },
  ].filter((fact) => !formal || hasValue(fact.raw))
  const topLine = (label: string, value: unknown) => formal && !hasValue(value) ? null : <span>{hasValue(value) ? text(value, emptyText) : `${label} · ${emptyText}`}</span>
  return (
    <div className={`mr-print-page ${embedded ? 'is-embedded' : ''}`}>
      <style>{styles}</style>
      {toolbar}
      <article className="mr-document">
        {watermark ? <div className="a-watermark">{watermark}</div> : null}
        <Header order={order} emptyText={emptyText} formal={formal} />
        <div className="a-orderbar">
          <div><small>客户 / CUSTOMER</small><b>{text(order.customerName, emptyText)}</b>{topLine('客户 P/O', order.customerPo)}</div>
          <div><small>交付 / DELIVERY</small><b>{text(order.latestDeliveryDate, emptyText)}</b>{topLine('送机地点', order.deliveryLocation)}</div>
          <div><small>交易 / TERMS</small><b>{text(order.paymentTerms === '其他' ? order.paymentOther : order.paymentTerms, emptyText)}</b>{topLine('发票别 / 开票内容', [order.invoiceType, order.billingContent].filter(hasValue).join(' · '))}</div>
          <div><small>状态 / STATUS</small><b>{STATUS[status] || status}</b><span>V{versionLabel}{hasValue(order.ctrlNo) ? ` · ${order.ctrlNo}` : ''}</span></div>
        </div>
        <Section index="01" title={`采购与销售明细 · ${order.items?.length || 0} 项`}>
          <ItemTable items={order.items || []} emptyText={emptyText} formal={formal} />
          <div className="a-totals" style={{ gridTemplateColumns: `repeat(${Math.max(1, totalFacts.length)}, 1fr)`, '--total-columns': Math.max(1, totalFacts.length) } as CSSProperties}>
            {totalFacts.map((fact) => <div className="a-total" key={fact.label}><small>{fact.label}</small><b>{fact.value}</b></div>)}
          </div>
        </Section>
        <Section index="02" title={`订购与交付资料 · ${facts.length} 项`}>
          {groupedFacts.map(({ group, items }) => (
            <div className="a-fact-group" key={group}>
              <div className="a-fact-group-title">{group}</div>
              <div className="a-details">{items.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />)}</div>
            </div>
          ))}
        </Section>
        <Section index="03" title="电子签核记录"><Signatures order={order} formal={formal} /></Section>
        <footer className="a-footer"><span>MR / 审批存档文件</span><span>V{versionLabel} · 黑白打印适配</span></footer>
      </article>
    </div>
  )
}

export function MrPrintPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const previewOrder = (location.state as { previewOrder?: MrOrder } | null)?.previewOrder || null
  const [order, setOrder] = useState<MrOrder | null>(previewOrder)
  const [error, setError] = useState('')
  useEffect(() => { if (!id || previewOrder) return; let active = true; getMr(id).then((value) => { if (active) setOrder(value) }).catch((err) => { if (active) setError((err as Error).message || '加载失败') }); return () => { active = false } }, [id, previewOrder])
  useEffect(() => { if (!order) return; const previous = document.title; document.title = order.fileName || 'MR'; return () => { document.title = previous } }, [order])
  if (!order && !error) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>
  if (!order) return <div className="p-8 text-destructive">{error}</div>
  const normalizedId = String(id || '').replace(/^\/+|\/+$/g, '')
  const goBack = () => navigate(normalizedId ? `/mr/${normalizedId}` : '/mr', { replace: true })
  const toolbar = <div className="mr-print-toolbar"><span>MR 审批文件 / 打印预览</span><div className="mr-print-actions"><Button variant="outline" onClick={goBack}><ArrowLeft className="mr-2 size-4" />返回 MR</Button><Button onClick={() => window.print()}><Printer className="mr-2 size-4" />打印 / 存为 PDF</Button></div></div>
  return <MrDocumentView order={order} toolbar={toolbar} />
}
