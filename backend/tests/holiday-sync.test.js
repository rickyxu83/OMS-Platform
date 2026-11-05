const assert = require('assert')
const { fetchYearHolidays } = require('../src/modules/attendance/holiday-sync')

// 2026 年样例（四源同一数据集）：
// 放假日 11 天：元旦 1/1~1/3；春节 2/15~2/16、2/23；清明 4/4；劳动节 5/1；端午 6/19；中秋 9/25；国庆 10/1
// 调休补班 4 天：1/4(周日)、2/14(周六)、2/28(周六)、9/20(周日)
const OFF_DAYS = [
  ['2026-01-01', '元旦'], ['2026-01-02', '元旦'], ['2026-01-03', '元旦'],
  ['2026-02-15', '春节'], ['2026-02-16', '春节'], ['2026-02-23', '春节'],
  ['2026-04-04', '清明节'], ['2026-05-01', '劳动节'], ['2026-06-19', '端午节'],
  ['2026-09-25', '中秋节'], ['2026-10-01', '国庆节'],
]
const MAKEUP_DAYS = [
  ['2026-01-04', '元旦'], ['2026-02-14', '春节'], ['2026-02-28', '春节'], ['2026-09-20', '国庆节'],
]

const HOLIDAY_CN_2026 = {
  year: 2026,
  days: [
    ...OFF_DAYS.map(([date, name]) => ({ name, date, isOffDay: true })),
    ...MAKEUP_DAYS.map(([date, name]) => ({ name, date, isOffDay: false })),
  ],
}

// jiejiariapi 形态：对象按日期键；含小年等民俗标注（工作日 isOffDay=false，应被过滤）；
// 除夕单列命名、连休用“国庆节,中秋节”并列命名（命名差异不影响比对）
const JIEJIARI_2026 = Object.fromEntries([
  ...OFF_DAYS.map(([date, name]) => [date, { date, name: date === '2026-02-16' ? '除夕' : name, isOffDay: true }]),
  ...MAKEUP_DAYS.map(([date, name]) => [date, { date, name, isOffDay: false }]),
  ['2026-02-10', { date: '2026-02-10', name: '北小年', isOffDay: false }], // 周二，民俗标注，应被过滤
])

// chinese-days npm dist 形态：{ holidays: { date: "English,中文,n" }, workdays: {...} }
const CHINESE_DAYS_2026 = {
  holidays: Object.fromEntries(OFF_DAYS.map(([date, name]) => [date, `Holiday,${name},1`])),
  workdays: Object.fromEntries(MAKEUP_DAYS.map(([date, name]) => [date, `Holiday,${name},1`])),
  inLieuDays: {},
}

// lanceliao 形态：{ Years: { '2026': [{ Name, StartDate, EndDate, CompDays }] } }，假期段闭区间逐日展开
const LANCELIAO_2026 = {
  Years: {
    2026: [
      { Name: '元旦', StartDate: '2026-01-01', EndDate: '2026-01-03', CompDays: ['2026-01-04'] },
      { Name: '春节', StartDate: '2026-02-15', EndDate: '2026-02-16', CompDays: ['2026-02-14', '2026-02-28'] },
      { Name: '春节', StartDate: '2026-02-23', EndDate: '2026-02-23', CompDays: [] },
      { Name: '清明节', StartDate: '2026-04-04', EndDate: '2026-04-04', CompDays: [] },
      { Name: '劳动节', StartDate: '2026-05-01', EndDate: '2026-05-01', CompDays: [] },
      { Name: '端午节', StartDate: '2026-06-19', EndDate: '2026-06-19', CompDays: [] },
      { Name: '中秋节', StartDate: '2026-09-25', EndDate: '2026-09-25', CompDays: [] },
      { Name: '国庆节', StartDate: '2026-10-01', EndDate: '2026-10-01', CompDays: ['2026-09-20'] },
    ],
  },
}

const ALL_SOURCES = {
  'holiday-cn@master': HOLIDAY_CN_2026,
  'holidayAPI.json': LANCELIAO_2026,
  'chinese-days': CHINESE_DAYS_2026,
  'jiejiariapi.com': JIEJIARI_2026,
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

async function testFourSourceConsensus() {
  const result = await fetchYearHolidays(2026, { fetchImpl: fakeFetchRoutes({ ...ALL_SOURCES }) })
  assert.equal(result.ok, true, `四源一致应成功：${result.reason || ''}`)
  assert.equal(result.year, 2026)
  assert.equal(result.items.length, 15, '应合并出 15 天（小年标注被过滤）')
  const newYear = result.items.find((item) => item.date === '2026-01-04')
  assert.equal(newYear.dayType, 'makeup_workday', '1/4 应为调休补班')
  const eve = result.items.find((item) => item.date === '2026-02-16')
  assert.equal(eve.name, '春节', '命名以 holiday-cn 为准（除夕归并为春节）')
  assert.equal(eve.dayType, 'legal_holiday')
  assert.ok(!result.items.some((item) => item.name.includes('小年')), '小年标注不应出现')
  assert.equal(result.sources.length, 4)
  assert.ok(result.sources.every((source) => source.count === 15), '四源应各解析出 15 天')
}

async function testThreeOfFourConsensusWithDissenter() {
  // jiejiariapi 多出一天（模拟某源数据错误），其余三源一致 → 多数决通过
  const tampered = {
    ...JIEJIARI_2026,
    '2026-02-24': { date: '2026-02-24', name: '春节', isOffDay: true },
  }
  const result = await fetchYearHolidays(2026, {
    fetchImpl: fakeFetchRoutes({ ...ALL_SOURCES, 'jiejiariapi.com': tampered }),
  })
  assert.equal(result.ok, true, `3 源一致 + 1 源分歧应多数决通过：${result.reason || ''}`)
  assert.equal(result.items.length, 15)
  assert.ok(result.warnings.some((warning) => warning.includes('不一致') && warning.includes('jiejiariapi')), '应标注少数派分歧')
}

async function testOneSourceDown() {
  const result = await fetchYearHolidays(2026, {
    fetchImpl: fakeFetchRoutes({ ...ALL_SOURCES, 'holidayAPI.json': new Error('connect timeout') }),
  })
  assert.equal(result.ok, true, `一源不可用、其余三源一致应通过：${result.reason || ''}`)
  assert.equal(result.items.length, 15)
  assert.ok(result.warnings.some((warning) => warning.includes('lanceliao')), '应标注不可用源')
}

async function testEmptyPlaceholderNotBlocking() {
  // holiday-cn 公告前的空占位（HTTP 200 但 days 为空）不应阻塞其他三源达成共识
  const result = await fetchYearHolidays(2026, {
    fetchImpl: fakeFetchRoutes({ ...ALL_SOURCES, 'holiday-cn@master': { year: 2026, days: [] } }),
  })
  assert.equal(result.ok, true, `空占位源不应阻塞：${result.reason || ''}`)
  assert.equal(result.items.length, 15)
  // holiday-cn 缺席时命名回退到 lanceliao
  const eve = result.items.find((item) => item.date === '2026-02-16')
  assert.equal(eve.name, '春节')
}

async function testTwoVsTwoSplit() {
  // 2v2 分裂：chinese-days 与 lanceliao 一致地少了国庆 10/1
  const cdSplit = {
    ...CHINESE_DAYS_2026,
    holidays: Object.fromEntries(Object.entries(CHINESE_DAYS_2026.holidays).filter(([date]) => date !== '2026-10-01')),
  }
  const llSplit = {
    Years: { 2026: LANCELIAO_2026.Years[2026].filter((entry) => entry.Name !== '国庆节') },
  }
  const result = await fetchYearHolidays(2026, {
    fetchImpl: fakeFetchRoutes({ ...ALL_SOURCES, 'chinese-days': cdSplit, 'holidayAPI.json': llSplit }),
  })
  assert.equal(result.ok, false, '2v2 分裂应拒绝')
  assert.ok(result.reason.includes('不一致'), `原因应说明不一致：${result.reason}`)
  assert.ok(result.reason.includes('2026-10-01'), '原因应包含差异日期')
}

async function testTwoSourcesAgreeOnly() {
  const routes = {
    ...ALL_SOURCES,
    'chinese-days': { httpStatus: 404 },
    'holidayAPI.json': new Error('connect timeout'),
  }
  const manual = await fetchYearHolidays(2026, { fetchImpl: fakeFetchRoutes(routes) })
  assert.equal(manual.ok, true, '手动模式允许 2 源一致降级')
  assert.ok(manual.warnings.some((warning) => warning.includes('仅 2 源')), '应标注 2 源警告')

  const strict = await fetchYearHolidays(2026, { requireConsensus: true, fetchImpl: fakeFetchRoutes(routes) })
  assert.equal(strict.ok, false, '自动同步要求 ≥3 源共识')
  assert.ok(strict.reason.includes('共识'), strict.reason)
}

async function testSingleSourceDegradation() {
  const routes = {
    'holiday-cn@master': HOLIDAY_CN_2026,
    'holidayAPI.json': new Error('connect timeout'),
    'chinese-days': { httpStatus: 404 },
    'jiejiariapi.com': new Error('connect timeout'),
  }
  const manual = await fetchYearHolidays(2026, { fetchImpl: fakeFetchRoutes(routes) })
  assert.equal(manual.ok, true, '手动模式允许单源降级')
  assert.ok(manual.warnings.some((warning) => warning.includes('单源')), '应标注单源警告')

  const strict = await fetchYearHolidays(2026, { requireConsensus: true, fetchImpl: fakeFetchRoutes(routes) })
  assert.equal(strict.ok, false, '自动同步拒绝单源')
}

async function testAutoSyncThreeConsensus() {
  const result = await fetchYearHolidays(2026, {
    requireConsensus: true,
    fetchImpl: fakeFetchRoutes({ ...ALL_SOURCES, 'jiejiariapi.com': new Error('connect timeout') }),
  })
  assert.equal(result.ok, true, `自动同步 3 源共识应通过：${result.reason || ''}`)
}

async function testUnpublishedYear() {
  // 全部源暂无数据（含空占位）→ 尚未公布
  const result = await fetchYearHolidays(2099, {
    fetchImpl: fakeFetchRoutes({
      'holiday-cn@master': { year: 2099, days: [] },
      'holidayAPI.json': { Years: {} },
      'chinese-days': { httpStatus: 404 },
      'jiejiariapi.com': {},
    }),
  })
  assert.equal(result.ok, false)
  assert.ok(result.reason.includes('尚未公布') || result.reason.includes('暂无'), `原因应说明未公布：${result.reason}`)

  // 全部源网络不可用 → 均不可用
  const allDown = await fetchYearHolidays(2099, {
    fetchImpl: fakeFetchRoutes({
      'holiday-cn@master': new Error('timeout'),
      'holidayAPI.json': new Error('timeout'),
      'chinese-days': new Error('timeout'),
      'jiejiariapi.com': new Error('timeout'),
    }),
  })
  assert.equal(allDown.ok, false)
  assert.ok(allDown.reason.includes('均不可用'), allDown.reason)
}

async function testInvalidYear() {
  const result = await fetchYearHolidays('abc', { fetchImpl: fakeFetchRoutes({}) })
  assert.equal(result.ok, false)
  assert.ok(result.reason.includes('年份'))
}

async function main() {
  await testFourSourceConsensus()
  await testThreeOfFourConsensusWithDissenter()
  await testOneSourceDown()
  await testEmptyPlaceholderNotBlocking()
  await testTwoVsTwoSplit()
  await testTwoSourcesAgreeOnly()
  await testSingleSourceDegradation()
  await testAutoSyncThreeConsensus()
  await testUnpublishedYear()
  await testInvalidYear()
  console.log('holiday-sync tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
