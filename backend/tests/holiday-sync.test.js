const assert = require('assert')
const { fetchYearHolidays } = require('../src/modules/attendance/holiday-sync')

// 2026 年样例：元旦 1/1~1/3 放假 + 1/4(周日) 补班；春节 2/14(周六)、2/28(周六) 补班，2/15~2/23 放假
const HOLIDAY_CN_2026 = {
  year: 2026,
  days: [
    { name: '元旦', date: '2026-01-01', isOffDay: true },
    { name: '元旦', date: '2026-01-02', isOffDay: true },
    { name: '元旦', date: '2026-01-03', isOffDay: true },
    { name: '元旦', date: '2026-01-04', isOffDay: false },
    { name: '春节', date: '2026-02-14', isOffDay: false },
    { name: '春节', date: '2026-02-15', isOffDay: true },
    { name: '春节', date: '2026-02-16', isOffDay: true },
    { name: '春节', date: '2026-02-23', isOffDay: true },
    { name: '春节', date: '2026-02-28', isOffDay: false },
    { name: '清明节', date: '2026-04-04', isOffDay: true },
    { name: '劳动节', date: '2026-05-01', isOffDay: true },
    { name: '端午节', date: '2026-06-19', isOffDay: true },
    { name: '中秋节', date: '2026-09-25', isOffDay: true },
    { name: '国庆节', date: '2026-09-20', isOffDay: false },
    { name: '国庆节', date: '2026-10-01', isOffDay: true },
  ],
}

// jiejiariapi 形态：对象按日期键；含小年等民俗标注（工作日 isOffDay=false，应被过滤）；
// 除夕单列命名（命名差异不影响比对）；连休用“国庆节,中秋节”并列命名
const JIEJIARI_2026 = {
  '2026-01-01': { date: '2026-01-01', name: '元旦', isOffDay: true },
  '2026-01-02': { date: '2026-01-02', name: '元旦', isOffDay: true },
  '2026-01-03': { date: '2026-01-03', name: '元旦', isOffDay: true },
  '2026-01-04': { date: '2026-01-04', name: '元旦', isOffDay: false },
  '2026-02-10': { date: '2026-02-10', name: '北小年', isOffDay: false }, // 周二，民俗标注，应被过滤
  '2026-02-14': { date: '2026-02-14', name: '春节', isOffDay: false },
  '2026-02-15': { date: '2026-02-15', name: '春节', isOffDay: true },
  '2026-02-16': { date: '2026-02-16', name: '除夕', isOffDay: true },
  '2026-02-23': { date: '2026-02-23', name: '春节', isOffDay: true },
  '2026-02-28': { date: '2026-02-28', name: '春节', isOffDay: false },
  '2026-04-04': { date: '2026-04-04', name: '清明节', isOffDay: true },
  '2026-05-01': { date: '2026-05-01', name: '劳动节', isOffDay: true },
  '2026-06-19': { date: '2026-06-19', name: '端午节', isOffDay: true },
  '2026-09-20': { date: '2026-09-20', name: '国庆节,中秋节', isOffDay: false },
  '2026-09-25': { date: '2026-09-25', name: '中秋节', isOffDay: true },
  '2026-10-01': { date: '2026-10-01', name: '国庆节,中秋节', isOffDay: true },
}

function fakeFetchRoutes(routes) {
  return async (url) => {
    for (const [needle, payloadOrError] of Object.entries(routes)) {
      if (url.includes(needle)) {
        if (payloadOrError instanceof Error) throw payloadOrError
        if (payloadOrError && payloadOrError.httpStatus) {
          return { ok: false, status: payloadOrError.httpStatus, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => payloadOrError }
      }
    }
    throw new Error(`unexpected url: ${url}`)
  }
}

async function testDualSourceAgreement() {
  const result = await fetchYearHolidays(2026, {
    fetchImpl: fakeFetchRoutes({
      'holiday-cn@master': HOLIDAY_CN_2026,
      'jiejiariapi.com': JIEJIARI_2026,
    }),
  })
  assert.equal(result.ok, true, `双源一致应成功：${result.reason || ''}`)
  assert.equal(result.year, 2026)
  assert.equal(result.items.length, 15, '应合并出 15 天（小年标注被过滤）')
  const newYear = result.items.find((item) => item.date === '2026-01-04')
  assert.equal(newYear.dayType, 'makeup_workday', '1/4 应为调休补班')
  const eve = result.items.find((item) => item.date === '2026-02-16')
  assert.equal(eve.name, '春节', '命名以 holiday-cn 为准（除夕归并为春节）')
  assert.equal(eve.dayType, 'legal_holiday')
  assert.ok(!result.items.some((item) => item.name.includes('小年')), '小年标注不应出现')
  assert.equal(result.sources.length, 2)
  assert.ok(result.sources.every((source) => source.count === 15), '两源应各解析出 15 天')
}

async function testDualSourceMismatch() {
  const tampered = {
    ...JIEJIARI_2026,
    '2026-02-24': { date: '2026-02-24', name: '春节', isOffDay: true }, // 模拟一方多出一天
  }
  const result = await fetchYearHolidays(2026, {
    fetchImpl: fakeFetchRoutes({
      'holiday-cn@master': HOLIDAY_CN_2026,
      'jiejiariapi.com': tampered,
    }),
  })
  assert.equal(result.ok, false, '双源不一致应拒绝')
  assert.ok(result.reason.includes('不一致'), `原因应说明不一致：${result.reason}`)
  assert.ok(result.reason.includes('2026-02-24'), '原因应包含差异日期')
}

async function testSingleSourceDegradation() {
  const routes = {
    'holiday-cn@master': HOLIDAY_CN_2026,
    'jiejiariapi.com': new Error('connect timeout'),
  }
  const manual = await fetchYearHolidays(2026, { fetchImpl: fakeFetchRoutes(routes) })
  assert.equal(manual.ok, true, '手动模式允许单源降级')
  assert.ok(manual.warnings.some((warning) => warning.includes('单源')), '应标注单源警告')

  const strict = await fetchYearHolidays(2026, { requireDualSource: true, fetchImpl: fakeFetchRoutes(routes) })
  assert.equal(strict.ok, false, '自动同步要求双源可用')
  assert.ok(strict.reason.includes('不可用'), strict.reason)
}

async function testUnpublishedYear() {
  const result = await fetchYearHolidays(2099, {
    fetchImpl: fakeFetchRoutes({
      'holiday-cn@master': { httpStatus: 404 },
      'jiejiariapi.com': {},
    }),
  })
  assert.equal(result.ok, false)
  assert.ok(result.reason.includes('尚未公布') || result.reason.includes('暂无'), `原因应说明未公布：${result.reason}`)
}

async function testInvalidYear() {
  const result = await fetchYearHolidays('abc', { fetchImpl: fakeFetchRoutes({}) })
  assert.equal(result.ok, false)
  assert.ok(result.reason.includes('年份'))
}

async function main() {
  await testDualSourceAgreement()
  await testDualSourceMismatch()
  await testSingleSourceDegradation()
  await testUnpublishedYear()
  await testInvalidYear()
  console.log('holiday-sync tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
