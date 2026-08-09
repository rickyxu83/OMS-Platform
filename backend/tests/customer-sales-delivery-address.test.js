const assert = require('assert')
const { _test } = require('../src/modules/customers/controller')

const row = {
  id: 1,
  name: '测试客户',
  address: '工程服务地址',
  sales_delivery_address: '销售交付地址',
}

assert.equal(_test.canAccessSalesDeliveryAddress({ role: 'sales' }), true)
assert.equal(_test.canAccessSalesDeliveryAddress({ role: 'assistant' }), true)
assert.equal(_test.canAccessSalesDeliveryAddress({ role: 'engineer' }), false)
assert.equal(_test.canAccessSalesDeliveryAddress({ role: 'engineering_supervisor' }), false)

const engineerPayload = _test.customerPayload(row)
assert.equal(Object.hasOwn(engineerPayload, 'salesDeliveryAddress'), false)
assert.equal(_test.customerPayload(row, [], 'zh-CN', true).salesDeliveryAddress, '销售交付地址')

assert.equal(_test.salesDeliveryAddressInput({ user: { role: 'engineer' }, body: { salesDeliveryAddress: '不可写入' } }, '原地址'), '原地址')
assert.equal(_test.salesDeliveryAddressInput({ user: { role: 'sales' }, body: { salesDeliveryAddress: '  新地址  ' } }), '新地址')
assert.equal(_test.salesDeliveryAddressInput({ user: { role: 'sales' }, body: { salesDeliveryAddress: '   ' } }), null)
assert.throws(
  () => _test.salesDeliveryAddressInput({ user: { role: 'sales' }, body: { salesDeliveryAddress: ['地址'] } }),
  /格式不正确/,
)
assert.throws(
  () => _test.salesDeliveryAddressInput({ user: { role: 'sales' }, body: { salesDeliveryAddress: 'x'.repeat(256) } }),
  /不能超过 255 个字符/,
)

console.log('customer sales delivery address OK')
