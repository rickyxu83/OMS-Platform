/** 智能报表摘要缓存单测（spec 017）：summaryCacheKey 纯函数。不依赖数据库与 AI。 */
const assert = require('node:assert/strict')
const { summaryCacheKey } = require('../assistant')

const columns = [{ key: 'engineer', label: '工程师' }, { key: 'count', label: '单数' }]
const rows = [
  { engineer: '张三', count: 30 },
  { engineer: '李四', count: 25 },
]

{
  // 同一输入 → 同一键（缓存可命中）
  assert.equal(summaryCacheKey('工单报表', columns, rows), summaryCacheKey('工单报表', columns, rows))
  assert.match(summaryCacheKey('工单报表', columns, rows), /^[0-9a-f]{40}$/)
}

{
  // 口径变化 → 键变化（新报表重新生成摘要）
  assert.notEqual(summaryCacheKey('工单报表A', columns, rows), summaryCacheKey('工单报表B', columns, rows))
}

{
  // 数据变化 → 键变化（同一报表新数据不会吃到旧摘要）
  const changed = [{ engineer: '张三', count: 31 }, { engineer: '李四', count: 25 }]
  assert.notEqual(summaryCacheKey('工单报表', columns, rows), summaryCacheKey('工单报表', columns, changed))
}

{
  // 列变化 → 键变化
  const cols2 = [{ key: 'engineer', label: '工程师' }, { key: 'count', label: '工单数' }]
  assert.notEqual(summaryCacheKey('工单报表', columns, rows), summaryCacheKey('工单报表', cols2, rows))
}

console.log('report assistant tests passed')
