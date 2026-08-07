import type { CustomerOption, MrConstants, VendorOption } from '../../types'

/**
 * PROTOTYPE — embedded sample data so the MR-restyle explorer renders offline,
 * with no login and no backend. Visually realistic but synthetic.
 */

export const SAMPLE_CUSTOMERS: CustomerOption[] = [
  {
    id: 2001,
    code: 'C-1021',
    name: '华南联晟科技有限公司',
    contactName: '李建国',
    address: '广东省深圳市南山区科技园南路28号',
    mapAddress: '深圳市南山区科技园南一路创新大厦B座12层',
    mapPoiName: '南科大创新园',
    contacts: [
      { id: 3001, name: '李建国', phone: '138-0000-2101' },
      { id: 3002, name: '王丽萍', phone: '139-0000-2102' },
      { id: 3003, name: '陈志强', phone: '137-0000-2103' },
      { id: 3004, name: '刘芳', phone: '136-0000-2104' },
    ],
  },
  {
    id: 2002,
    code: 'C-0715',
    name: '杭州东百数据科技',
    contactName: '周婷',
    address: '浙江省杭州市余杭区文一西路998号',
    contacts: [
      { id: 2501, name: '周婷', phone: '158-0000-2201' },
      { id: 2502, name: '吴强', phone: '159-0000-2202' },
    ],
  },
  {
    id: 2003,
    code: 'C-0033',
    name: '北京远博医疗设备',
    contacts: [{ id: 2601, name: '郑涛', phone: '186-0000-2301' }],
  },
]

export const SAMPLE_VENDORS: VendorOption[] = [
  { id: 1, name: '敦阳流体', officialWebsite: '' },
  { id: 2, name: '迈瑞', officialWebsite: '' },
  { id: 3, name: '西门子医疗', officialWebsite: '' },
  { id: 4, name: '艾默生', officialWebsite: '' },
  { id: 5, name: '霍尼韦尔', officialWebsite: '' },
]

export const SAMPLE_CONSTANTS: MrConstants = {
  INVOICE_TYPES: ['13%销售发票', '6%销售发票'],
  CONTRACT_TYPES: [],
  INVOICE_PROCESSES: ['开票后收款', '收款后开票', '全额开票'],
  PAYMENT_TERMS: ['月结30天', '月结60天', '月结90天', '货到付款', '其他'],
  CASE_CATEGORIES: ['新建项目', '扩建项目', '维修改造', '年度框架'],
  ACCEPTANCE_TYPES: ['到货验收', '安装后验收', '运行一个月后验收', '其他'],
  WORK_OPTIONS: ['NO', '敦阳', '甲方责任', '联合施工'],
  pricingModes: [
    { value: 1, label: '多项系统集成' },
    { value: 2, label: '单项系统集成' },
    { value: 3, label: '开明细' },
  ],
}

export function demoFetchCustomer(id: string | number) {
  return SAMPLE_CUSTOMERS.find((customer) => String(customer.id) === String(id)) || SAMPLE_CUSTOMERS[0]
}

export const SAMPLE_MR_ID = '9001'

export const SAMPLE_ORDER = {
  id: SAMPLE_MR_ID,
  status: 'draft' as const,
  customerId: 2001,
  customerName: '华南联晟科技有限公司',
  customerCode: 'C-1021',
  customerContactId: 2001,
  contactName: '李建国',
  customerPo: 'PO-2026-0237',
  ctrlNo: 'MR-2026-0083',
  invoiceType: '13%销售发票',
  pricingMode: 1,
  totalExcludingTax: 680000,
  caseCategory: '新建项目',
  purchaser: '李建国',
  purchaserTel: '138-0000-2101',
  recipient: '李建国',
  recipientTel: '138-0000-2101',
  invoiceRecipient: '李建国',
  paymentTerms: '月结60天',
  invoiceProcess: '收款后开票',
  billingContent: '13%增值税专用发票，一次性开票',
  splitDelivery: 0,
  acceptance: '到货验收',
  latestDeliveryDate: '2026-09-30',
  deliveryLocation: '广东省深圳市南山区科技园南路28号',
  installOptions: ['敦阳', '甲方责任'],
  maintenanceOptions: ['敦阳'],
  remark: '包含气体管路改造与终端检测设备，需配合甲方现场改造进度进场施工。',
  items: [
    { name: '气体管路终端机', oemSpec: 'GF-LB-200', qty: 2, unitPrice: null, vendor: '敦阳流体', costInclTax: 180000, taxRate: 13, purchaseOrderNo: 'PO-6021', warrantyService: '整机保修3年' },
    { name: '医用气体终端模块', oemSpec: 'GSC-4000', qty: 6, unitPrice: null, vendor: '迈瑞', costInclTax: 42000, taxRate: 13, purchaseOrderNo: 'PO-6133', warrantyService: '质保2年' },
    { name: '多参数监控主机', oemSpec: 'M500', qty: 4, unitPrice: null, vendor: '迈瑞', costInclTax: 36000, taxRate: 13, purchaseOrderNo: 'PO-6134', warrantyService: '质保2年' },
  ],
}