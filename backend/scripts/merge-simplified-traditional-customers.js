const { pool } = require('../src/config/db')
const { customerNameKey, toTraditional } = require('../src/utils/chinese')

function pickPrimary(rows) {
  return [...rows].sort((a, b) => {
    const orderDelta = Number(b.order_count) - Number(a.order_count)
    if (orderDelta) return orderDelta
    const addressDelta = Number(Boolean(b.address)) - Number(Boolean(a.address))
    if (addressDelta) return addressDelta
    return Number(a.id) - Number(b.id)
  })[0]
}

async function mergeContacts(connection, fromCustomerId, toCustomerId) {
  const [contacts] = await connection.execute(
    `SELECT name, phone, use_count, last_used_at
     FROM customer_contacts
     WHERE customer_id = :fromCustomerId`,
    { fromCustomerId },
  )

  for (const contact of contacts) {
    await connection.execute(
      `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
       VALUES (:toCustomerId, :name, :phone, :useCount, :lastUsedAt)
       ON DUPLICATE KEY UPDATE
         use_count = use_count + VALUES(use_count),
         last_used_at = GREATEST(last_used_at, VALUES(last_used_at)),
         updated_at = CURRENT_TIMESTAMP`,
      {
        toCustomerId,
        name: contact.name,
        phone: contact.phone || null,
        useCount: contact.use_count || 1,
        lastUsedAt: contact.last_used_at,
      },
    )
  }

  await connection.execute('DELETE FROM customer_contacts WHERE customer_id = :fromCustomerId', { fromCustomerId })
}

async function main() {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('UPDATE customers SET name_key = NULL')

    const [rows] = await connection.execute(
      `SELECT c.*,
              (SELECT COUNT(*) FROM service_orders so WHERE so.customer_id = c.id) AS order_count
       FROM customers c
       ORDER BY c.id ASC`,
    )

    const groups = rows.reduce((map, row) => {
      const key = customerNameKey(row.name)
      if (!key) return map
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
      return map
    }, new Map())

    let merged = 0
    for (const [nameKey, groupRows] of groups.entries()) {
      const primary = pickPrimary(groupRows)
      const duplicates = groupRows.filter((row) => row.id !== primary.id)
      const aliases = new Set(groupRows.map((row) => toTraditional(row.name)).filter(Boolean))

      for (const duplicate of duplicates) {
        await connection.execute(
          `UPDATE service_orders SET customer_id = :primaryId WHERE customer_id = :duplicateId`,
          { primaryId: primary.id, duplicateId: duplicate.id },
        )
        await connection.execute(
          `UPDATE devices SET customer_id = :primaryId WHERE customer_id = :duplicateId`,
          { primaryId: primary.id, duplicateId: duplicate.id },
        )
        await mergeContacts(connection, duplicate.id, primary.id)
        await connection.execute('DELETE FROM customers WHERE id = :duplicateId', { duplicateId: duplicate.id })
        merged += 1
      }

      const aliasRemark = aliases.size > 1 ? `簡繁合併別名：${Array.from(aliases).join('、')}` : primary.remark
      await connection.execute(
        `UPDATE customers
         SET name = :name,
             name_key = :nameKey,
             salesperson = COALESCE(salesperson, :salesperson),
             address = COALESCE(address, :address),
             contact_name = COALESCE(contact_name, :contactName),
             contact_phone = COALESCE(contact_phone, :contactPhone),
             remark = :remark
         WHERE id = :id`,
        {
          id: primary.id,
          name: toTraditional(primary.name),
          nameKey,
          salesperson: primary.salesperson || null,
          address: primary.address || null,
          contactName: primary.contact_name || null,
          contactPhone: primary.contact_phone || null,
          remark: aliasRemark || null,
        },
      )
    }

    await connection.commit()
    console.log(`Customer simplified/traditional merge complete. Merged ${merged} duplicate customers.`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
