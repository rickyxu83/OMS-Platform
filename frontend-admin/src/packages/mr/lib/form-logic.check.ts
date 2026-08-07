import { calculateForm, normalizeCostTaxRates, quotationDetailItems, salesSubtotal, singleIntegrationItems } from './form-logic.ts'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const mixed = normalizeCostTaxRates([{ taxRate: 6 }, { taxRate: 13 }], '13%增值税')
assert(mixed[0].taxRate === 6 && mixed[1].taxRate === 13, '13%销售发票应保留逐项6%/13%成本税率')

const forced = normalizeCostTaxRates([{ taxRate: 13 }, { taxRate: 6 }], '6%普通发票')
assert(forced.every((item) => item.taxRate === 6), '6%销售发票应强制全部成本税率为6%')

const single = singleIntegrationItems(
  [{ name: '主设备', qty: 2, costInclTax: 113, taxRate: 13 }, { name: '不应保留的第二项' }, { name: '第三项' }],
  '13%增值税',
  ['敦阳'],
)
assert(single.length === 2, '单项系统集成应固定两项')
assert(single[1].name === '技术服务' && single[1].qty === 1 && single[1].costInclTax === 0, '第二项应重建为技术服务')
assert(single[1].installBy === '敦阳', '技术服务应继承装机对象')

const integrated = calculateForm({ pricingMode: 1, totalExcludingTax: 300, invoiceType: '13%增值税', items: [
  { name: 'A', qty: 1, costInclTax: 106, taxRate: 6 },
  { name: 'B', qty: 1, costInclTax: 113, taxRate: 13 },
] })
assert(integrated.items?.[0].unitPrice === 150 && integrated.items?.[1].unitPrice === 150, '多项系统集成应按逐项未税成本分摊售价')

assert(salesSubtotal({ qty: 2, quotedUnitPrice: 130000 }) === 260000, '没有采购成本时应回退展示销售报价原始未税小计')
assert(salesSubtotal({ qty: 2, quotedUnitPrice: 130000, subtotal: 250000 }) === 250000, '已有最终计价结果时应优先显示MR销售小计')
const workstation = calculateForm({
  pricingMode: 2,
  totalExcludingTax: 11500,
  invoiceType: '13%增值税',
  items: singleIntegrationItems([{ name: 'HP Z2工作站', qty: 1, costInclTax: 11000, taxRate: 13 }], '13%增值税'),
})
assert(workstation.items?.[0].unitPrice === 11385 && workstation.items?.[1].unitPrice === 115, '单项系统集成应按99%/1%拆分未税销售额')
assert(workstation.items?.[0].costExcludingTax === 9734.51, '含税成本11000按13%应换算为未税Cost 9734.51')
assert(workstation.totals?.salesIncludingTax === 12995 && workstation.totals?.costIncludingTax === 11000, '含税销售与含税成本应和来源报价总额一致')

const detailed = quotationDetailItems([
  { name: '有报价明细', unitPrice: 150, quotedUnitPrice: 120 },
  { name: '只有整包总额', unitPrice: 180, quotedUnitPrice: null },
])
assert(detailed[0].unitPrice === 120, '开明细应恢复销售报价原始单价')
assert(detailed[1].unitPrice === 180, '没有报价原价时应保留系统分摊价')
console.log('mr form logic OK')
