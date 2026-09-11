// 签单主体常量（2026-09-10 spec 011）：与后端 mr/lib/domain.js 的 COMPANIES 保持一致。
// 表单页优先消费后端 constants 下发的 COMPANIES；打印页/列表等无 constants 场景用本文件兜底。
export interface MrCompany {
  value: string
  label: string
  shortLabel: string
  enName: string
  pricingModes: number[]
}

export const MR_COMPANIES: MrCompany[] = [
  { value: 'dunyang', label: '敦阳（宁波）科技有限公司', shortLabel: '敦阳', enName: 'STARK (NINGBO) TECHNOLOGY INC.', pricingModes: [1, 2, 3] },
  { value: 'dunhu', label: '上海敦沪信息科技有限公司', shortLabel: '敦沪', enName: 'SHANGHAI DUNHU INFORMATION TECHNOLOGY CO.,LTD.', pricingModes: [3] },
]

export function mrCompanyOf(value: unknown, companies: MrCompany[] = MR_COMPANIES): MrCompany {
  return (companies.length ? companies : MR_COMPANIES).find((company) => company.value === value) || MR_COMPANIES[0]
}

// 装机/维护承担方选项按签单主体派生：敦阳单显示"敦阳"，敦沪单显示"敦沪"
export function mrWorkOptionsFor(value: unknown, companies: MrCompany[] = MR_COMPANIES): string[] {
  return [mrCompanyOf(value, companies).shortLabel, '供应商', 'NO', '其他']
}
