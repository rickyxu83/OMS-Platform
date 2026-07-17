const assert = require('assert')
const { buildLikeSearchTerms } = require('../src/utils/chinese')

const search = buildLikeSearchTerms('Huawei 华为', 'deviceTerm')
const sql = search.sql(['d.model', 'mp.name'])

assert(sql.includes(' AND '), '空格分隔的关键词应使用 AND 连接')
assert(sql.includes('d.model LIKE'), '每个关键词应搜索设备型号')
assert(sql.includes('mp.name LIKE'), '每个关键词应搜索维保方名称')
assert(Object.values(search.params).includes('%huawei%'))
assert(Object.values(search.params).includes('%华为%'))

const single = buildLikeSearchTerms('OceanStor', 'singleTerm')
assert(!single.sql(['d.model', 'mp.name']).includes(' AND '))

console.log('chinese search tests passed')
