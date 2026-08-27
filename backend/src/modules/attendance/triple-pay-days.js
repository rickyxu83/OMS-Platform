/**
 * 三倍工资日自动计算（国务院法定节假日中享受 3 倍加班工资的 11 天）。
 *
 * 数据来源：lunar-javascript 农历/节气计算，按年份自动生成，无需每年手动维护。
 * 规则（《全国年节及纪念日放假办法》法定节假日，加班按 300% 计）：
 * - 元旦：1 月 1 日（1 天）
 * - 春节：农历除夕、正月初一、初二、初三（4 天）
 * - 清明节：清明节气当日（1 天）
 * - 劳动节：5 月 1 日、2 日（2 天）
 * - 端午节：农历五月初五（1 天）
 * - 中秋节：农历八月十五（1 天）
 * - 国庆节：10 月 1 日、2 日、3 日（3 天）
 *
 * 说明：此处仅用于「3 倍」角标提示（供审批人与财务识别），系统不做 300% 折算，
 * 实际加班费由行政线下按法规自行计算。
 */

const { Lunar, Solar } = require('lunar-javascript')

function pad(number) {
  return String(number).padStart(2, '0')
}

function toKey(solar) {
  return `${solar.getYear()}-${pad(solar.getMonth())}-${pad(solar.getDay())}`
}

// 年份 → Set<'YYYY-MM-DD'> 缓存
const cache = new Map()

function computeTriplePayDates(year) {
  const days = new Set()
  const push = (solar) => { if (solar) days.add(toKey(solar)) }
  const pushSolar = (month, day) => push(Solar.fromYmd(year, month, day))

  // 元旦：1 月 1 日
  pushSolar(1, 1)

  // 春节：农历正月初一（含除夕=初一前一天）及初二、初三
  const springFestival = Lunar.fromYmd(year, 1, 1).getSolar()
  const springFestivalSolar = Solar.fromYmd(springFestival.getYear(), springFestival.getMonth(), springFestival.getDay())
  for (let offset = -1; offset <= 2; offset += 1) push(springFestivalSolar.next(offset))

  // 清明节：清明节气当日
  const jieQiTable = Solar.fromYmd(year, 1, 2).getLunar().getJieQiTable()
  push(jieQiTable['清明'])

  // 劳动节：5 月 1 日、2 日
  pushSolar(5, 1)
  pushSolar(5, 2)

  // 端午节：农历五月初五
  push(Lunar.fromYmd(year, 5, 5).getSolar())

  // 中秋节：农历八月十五
  push(Lunar.fromYmd(year, 8, 15).getSolar())

  // 国庆节：10 月 1 日、2 日、3 日
  pushSolar(10, 1)
  pushSolar(10, 2)
  pushSolar(10, 3)

  return days
}

/** 返回某年的三倍工资日 Set（'YYYY-MM-DD'），含缓存。 */
function triplePayDates(year) {
  const key = Number(year)
  if (!cache.has(key)) cache.set(key, computeTriplePayDates(key))
  return cache.get(key)
}

/** 判定日期（'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm[:ss]'）是否为三倍工资日。 */
function isTriplePayDate(dateStr) {
  const text = String(dateStr || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const year = Number(text.slice(0, 4))
  return triplePayDates(year).has(text)
}

/** 返回时间段（含首尾日期）覆盖到的三倍工资日列表（'YYYY-MM-DD'，升序；上限 62 天防御）。 */
function triplePayDatesInRange(startAt, endAt) {
  const startText = String(startAt || '').trim().slice(0, 10)
  const endText = String(endAt || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startText) || !/^\d{4}-\d{2}-\d{2}$/.test(endText)) return []
  const days = []
  const cursor = new Date(`${startText}T00:00:00`)
  const end = new Date(`${endText}T00:00:00`)
  for (let i = 0; i <= 62 && cursor <= end; i += 1) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    if (isTriplePayDate(key)) days.push(key)
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

module.exports = {
  triplePayDates,
  isTriplePayDate,
  triplePayDatesInRange,
}
