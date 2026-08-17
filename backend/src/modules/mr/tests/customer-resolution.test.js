const assert = require('assert')
const { resolveSubmissionCustomer } = require('../customer-resolution')

function fakeConnection(responses) {
  const calls = []
  return {
    calls,
    async execute(sql, params = {}) {
      calls.push({ sql, params })
      const response = responses.shift()
      assert(response, `unexpected SQL: ${sql}`)
      if (response.match) assert(sql.includes(response.match), `expected SQL containing ${response.match}`)
      return response.value
    },
  }
}

async function run() {
  {
    const connection = fakeConnection([])
    const order = { id: 10, customerId: 3, customerName: '现有客户' }
    assert.equal(await resolveSubmissionCustomer(connection, order, {}), order)
    assert.equal(connection.calls.length, 0)
  }

  {
    const connection = fakeConnection([
      { match: 'FROM customers', value: [[{ id: 7, name: '测试客户', salesperson: null }], []] },
      { match: 'UPDATE mr_orders', value: [{ affectedRows: 1 }, []] },
    ])
    const order = { id: 11, customerId: null, customerName: ' 测试客户 ' }
    await resolveSubmissionCustomer(connection, order, {})
    assert.equal(order.customerId, 7)
    assert.equal(order.customerName, '测试客户')
    assert.equal(connection.calls[0].params.nameKey, '测试客户')
  }

  {
    const connection = fakeConnection([
      { match: 'FROM customers', value: [[], []] },
      { match: 'MAX(', value: [[{ max_no: 9 }], []] },
      { match: 'INSERT INTO customers', value: [{ insertId: 12 }, []] },
      { match: 'UPDATE mr_orders', value: [{ affectedRows: 1 }, []] },
    ])
    const order = { id: 12, customerId: null, customerName: '新客户（上海）' }
    await resolveSubmissionCustomer(connection, order, {})
    assert.equal(order.customerId, 12)
    assert.equal(connection.calls[2].params.code, 'TS-CUST-0010')
    assert.equal(connection.calls[2].params.nameKey, '新客户上海')
  }

  console.log('mr customer resolution OK')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
