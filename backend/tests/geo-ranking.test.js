const assert = require('node:assert/strict')
const { rankPoiResults } = require('../src/modules/geo/controller')

const ranked = rankPoiResults([
  { name: '其他公司', address: '苏州市工业园区', location: '120.6700,31.3000' },
  { name: '华仪电子有限公司', address: '苏州市吴中区', location: '120.6800,31.2900' },
], {
  keyword: '华仪',
  latitude: null,
  longitude: null,
})

assert.equal(ranked[0].name, '华仪电子有限公司')
console.log('geo ranking tests passed')
