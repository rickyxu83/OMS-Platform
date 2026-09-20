/** 智能报表订阅推送单测（spec 016）：到期判断 isDue。不依赖数据库。 */
const assert = require('node:assert/strict')
const { isDue } = require('../subscriptions')

const SUNDAY = { date: '2026-09-20', day: 20, weekday: 0 }
const MONDAY = { date: '2026-09-21', day: 21, weekday: 1 }
const FIRST = { date: '2026-10-01', day: 1, weekday: 4 }

{
  // 日报：每天到期
  assert.equal(isDue({ frequency: 'daily', last_sent_at: null }, SUNDAY), true)
  assert.equal(isDue({ frequency: 'daily', last_sent_at: '2026-09-19 09:07:00' }, SUNDAY), true)
}

{
  // 周刊：仅周一
  assert.equal(isDue({ frequency: 'weekly', last_sent_at: null }, SUNDAY), false)
  assert.equal(isDue({ frequency: 'weekly', last_sent_at: null }, MONDAY), true)
}

{
  // 月刊：仅每月 1 日
  assert.equal(isDue({ frequency: 'monthly', last_sent_at: null }, SUNDAY), false)
  assert.equal(isDue({ frequency: 'monthly', last_sent_at: null }, FIRST), true)
}

{
  // 当天已发过不重复（各频率一致）
  assert.equal(isDue({ frequency: 'daily', last_sent_at: '2026-09-20 09:07:00' }, SUNDAY), false)
  assert.equal(isDue({ frequency: 'weekly', last_sent_at: '2026-09-21 09:07:00' }, MONDAY), false)
  assert.equal(isDue({ frequency: 'monthly', last_sent_at: '2026-10-01 09:07:00' }, FIRST), false)
}

console.log('report subscriptions tests passed')
