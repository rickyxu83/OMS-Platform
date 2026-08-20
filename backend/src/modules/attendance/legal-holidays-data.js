// 中国法定节假日内置数据（source='builtin'）
//
// 维护说明（"每年自动更新" 的确定性数据源）：
// - ensureSchema 启动时会调用 seedBuiltinLegalHolidays()，把本文件内所有数据以
//   INSERT IGNORE 幂等写入 attendance_legal_holidays 表（source='builtin'）。
//   因此只要数据在这个文件里，系统启动即自动具备，无需在管理端手动补。
// - 每年国务院公布下一年放假安排后（通常前一年 11 月底公布），在此追加下一年
//   数据，随版本发布部署即可自动生效。只填写"已由国务院正式公布"的年份，
//   不要凭推测编造未来年份的日期或调休安排（否则会导致加班费折算错误）。
// - 管理端"考勤设置 → 法定节假日"的手动增删（source='manual'）始终作为兜底，
//   用于临时调整或补充漏项。
//
// 已公布年份：2026（国务院已公布当年节假日安排）
const BUILTIN_LEGAL_HOLIDAYS = Object.freeze([
  { date: '2026-01-01', name: '元旦' },
  { date: '2026-02-16', name: '春节' },
  { date: '2026-02-17', name: '春节' },
  { date: '2026-02-18', name: '春节' },
  { date: '2026-02-19', name: '春节' },
  { date: '2026-04-05', name: '清明节' },
  { date: '2026-05-01', name: '劳动节' },
  { date: '2026-05-02', name: '劳动节' },
  { date: '2026-06-19', name: '端午节' },
  { date: '2026-09-25', name: '中秋节' },
  { date: '2026-10-01', name: '国庆节' },
  { date: '2026-10-02', name: '国庆节' },
  { date: '2026-10-03', name: '国庆节' },
])

module.exports = { BUILTIN_LEGAL_HOLIDAYS }
