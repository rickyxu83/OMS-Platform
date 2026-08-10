import { countUpValue } from './count-up.ts'
import { calculateForm, deriveMissingCosts, normalizeCostTaxRates, quotationDetailItems, salesSubtotal, singleIntegrationItems, weightedAverageMargin } from './form-logic.ts'

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
assert(integrated.items?.[0].unitPrice === 150 && integrated.items?.[1].unitPrice === 150, '多项系统集成应按采购成本（不含税）分摊售价')

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

const adopted = calculateForm({ pricingMode: 1, totalExcludingTax: 450000, invoiceType: '13%增值税', items: [
  { name: 'A', qty: 2, quotedUnitPrice: 130000, costInclTax: 275634, taxRate: 13 },
  { name: 'B', qty: 1, quotedUnitPrice: 75000, costInclTax: 73512, taxRate: 13 },
  { name: 'C', qty: 1, quotedUnitPrice: 55000, costInclTax: 40836, taxRate: 13 },
  { name: 'D', qty: 3, quotedUnitPrice: 20000, costInclTax: 45900, taxRate: 13 },
  ] })
assert(JSON.stringify(adopted.items?.map((item) => item.unitPrice)) === JSON.stringify([130000, 75000, 55000, 20000]), '多项系统集成应保留完整销售报价逐项价')
assert(adopted.totals?.salesExcludingTax === 450000 && adopted.totals?.marginRate === 14.2808, '采用销售逐项价后汇总应与真实MR一致')

const allocated = calculateForm({ pricingMode: 1, totalExcludingTax: 450000, invoiceType: '13%增值税', items: [
  { name: 'A', qty: 2, costInclTax: 275634, taxRate: 13 },
  { name: 'B', qty: 1, costInclTax: 73512, taxRate: 13 },
  { name: 'C', qty: 1, costInclTax: 40836, taxRate: 13 },
  { name: 'D', qty: 3, costInclTax: 45900, taxRate: 13 },
  ] })
assert(allocated.totals?.salesExcludingTax === 450000, '按成本分摊时最后一项应吸收分币尾差')
const incomplete = calculateForm({ pricingMode: 1, totalExcludingTax: 100, invoiceType: '13%增值税', items: [
  { name: '待补成本', qty: 1, quotedUnitPrice: 100, costInclTax: null, taxRate: 13 },
  ] })
assert(incomplete.totals?.costExcludingTax === null && incomplete.totals?.costIncludingTax === null && incomplete.totals?.marginRate === null, '成本不完整时汇总不得显示为0或计算毛利')
assert(countUpValue(100, 0) === 0 && countUpValue(100, 0.5) === 87.5 && countUpValue(100, 1) === 100, '数字动画应从0缓出到目标值')
assert(countUpValue(100, -1) === 0 && countUpValue(100, 2) === 100, '数字动画进度应限制在0到1')

console.log('mr form logic OK')

const derive = deriveMissingCosts([
  { name: 'A', qty: 2, unitPrice: 100, quotedUnitPrice: 100, costInclTax: 113, taxRate: 13 },
  { name: 'B', qty: 1, unitPrice: 200, taxRate: 13, costInclTax: null },
  { name: 'C', qty: 1, unitPrice: null, costInclTax: null },
], 0.2)
assert(derive[0].costInclTax === 113, '已有真实成本的品项不应被反推覆盖')
assert(derive[1].costEstimated === true, '反推品项应标记估算')
assert(Math.abs((derive[1].costInclTax ?? 0) - 200 * 1 * 0.8 * 1.13) < 0.01, '反推成本 = 售价×数量×(1-毛利率)×(1+税率)')
assert(derive[2].costInclTax === null, '无售价品项不应反推')
assert(derive[1].quotedUnitPrice === 200, '手动售价应同步为报价单价以保留售价')

const avg = weightedAverageMargin([
  { name: 'A', qty: 1, unitPrice: 100, costInclTax: 79.5, taxRate: 6 },
  { name: 'B', qty: 1, unitPrice: 100, costInclTax: 113, taxRate: 13 },
])
assert(avg !== null && Math.abs(avg - 0.125) < 0.001, '加权平均毛利率 = (Σ售价-Σ未税成本)/Σ售价')
