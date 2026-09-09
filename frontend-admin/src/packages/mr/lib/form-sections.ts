import { CircleDollarSign, Package, ReceiptText, ShieldCheck, StickyNote, Truck, UserRound } from 'lucide-react'

export interface MrSection {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  /** Backend validation field names owned by this section. */
  fields: string[]
}

/**
 * Single source of truth for the form's section order. Drives the side
 * navigation, anchor scrolling and validation-error targeting.
 */
export const MR_SECTIONS: MrSection[] = [
  {
    id: 'identity',
    title: '客户与单号',
    icon: UserRound,
    fields: ['customerId', 'customerName', 'customerContactId', 'ctrlNo', 'customerPo']
  },
  {
    id: 'trade',
    title: '交易信息',
    icon: CircleDollarSign,
    fields: ['pricingMode', 'invoiceType', 'totalExcludingTax', 'caseCategory', 'hasContract', 'contractNo', 'penaltyContent'],
  },
  {
    id: 'billing',
    title: '开票与付款',
    icon: ReceiptText,
    // 发票收件人归开票语义、采购联系人（客户商务对接人）归付款条件语义（2026-09-09 佬拍板：解散联系人信息区）
    fields: ['invoiceProcess', 'billingTiming', 'billingContent', 'invoiceRecipient', 'invoiceRecipientTel', 'invoiceRecipientMail', 'paymentTerms', 'paymentOther', 'purchaser', 'purchaserTel', 'purchaserMail']
  },
  {
    id: 'delivery',
    title: '交付、验收与服务',
    icon: Truck,
    // 收货人/电话/邮箱与交付地点同属收货信息，归交付语义
    fields: ['latestDeliveryDate', 'splitDelivery', 'acceptance', 'acceptanceOther', 'deliveryLocation', 'recipient', 'recipientTel', 'recipientMail', 'installOptions', 'maintenanceOptions', '装机Options', '维护Options']
  },
  { id: 'items', title: '品项明细', icon: Package, fields: ['items'] },
  { id: 'remark', title: '备注与其他', icon: StickyNote, fields: ['remark', 'grossProfitRecognitionStartMonth', 'grossProfitRecognitionAmount', 'remainingRecognizableGrossProfit', 'taiwanBusinessTransferStartMonth', 'taiwanBusinessTransferAmount', 'remainingTaiwanBusinessTransfer', 'grossProfitRecognitions', 'taiwanBusinessTransfers'] },
  { id: 'approval', title: '电子签核流程', icon: ShieldCheck, fields: [] },
]

const SECTION_BY_FIELD = new Map<string, string>()
for (const section of MR_SECTIONS) {
  for (const field of section.fields) SECTION_BY_FIELD.set(field, section.id)
}

/** `items.3.qty` → 3; anything else → null. */
export function itemIndexOf(field?: string) {
  const match = /^items\.(\d+)\./.exec(String(field || ''))
  return match ? Number(match[1]) : null
}

/** Maps a backend validation field name onto the section that owns it. */
export function sectionOfField(field?: string) {
  const name = String(field || '')
  if (!name) return null
  if (name === 'items' || name.startsWith('items.')) return 'items'
  return SECTION_BY_FIELD.get(name) || null
}

export function scrollToSection(id: string) {
  const target = document.getElementById(`mr-section-${id}`)
  if (!target) return
  // 粘性头部高度随按钮换行变化，按实际高度留滚动余量（吸附参照系为主内容区，不含管理端顶栏）
  const header = document.querySelector('[data-mr-sticky-header]')
  target.style.scrollMarginTop = `${(header ? header.getBoundingClientRect().height : 128) + 12}px`
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
