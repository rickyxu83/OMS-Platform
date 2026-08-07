const { nextCustomerCode } = require('../customers')
const { assertSalesCanAccessSalesperson } = require('../../permissions/sales-scope')
const { customerNameKey } = require('../../utils/chinese')
const { forbidden } = require('../../utils/http-error')

async function findCustomer(connection, nameKey) {
  const [rows] = await connection.execute(
    'SELECT id, name, salesperson FROM customers WHERE name_key = :nameKey LIMIT 1',
    { nameKey },
  )
  return rows[0] || null
}

async function resolveSubmissionCustomer(connection, order, user) {
  if (order.customerId) return order

  const name = String(order.customerName || '').trim()
  if (!name) return order

  const nameKey = customerNameKey(name)
  let customer = await findCustomer(connection, nameKey)

  if (customer) {
    assertSalesCanAccessSalesperson(customer.salesperson, user, forbidden)
  } else {
    const code = await nextCustomerCode(connection)
    const salesperson = user?.role === 'sales'
      ? user.real_name || user.realName || user.username || null
      : null
    try {
      const [result] = await connection.execute(
        `INSERT INTO customers (name, name_key, code, salesperson)
         VALUES (:name, :nameKey, :code, :salesperson)`,
        { name, nameKey, code, salesperson },
      )
      customer = { id: result.insertId, name, salesperson }
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error
      customer = await findCustomer(connection, nameKey)
      if (!customer) throw error
      assertSalesCanAccessSalesperson(customer.salesperson, user, forbidden)
    }
  }

  order.customerId = Number(customer.id)
  order.customerName = customer.name
  await connection.execute(
    `UPDATE mr_orders
     SET customer_id = :customerId, customer_name = :customerName
     WHERE id = :id`,
    { id: order.id, customerId: order.customerId, customerName: order.customerName },
  )
  return order
}

module.exports = { resolveSubmissionCustomer }
