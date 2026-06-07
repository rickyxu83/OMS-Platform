const { query, transaction } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')
const { customerNameKey } = require('../../utils/chinese')

const CUSTOMER_LEVELS = new Set(['key', 'normal', 'potential', 'vip'])
let ensureCustomerLevelColumnPromise = null

async function ensureCustomerLevelColumn() {
  if (!ensureCustomerLevelColumnPromise) {
    ensureCustomerLevelColumnPromise = (async () => {
      const rows = await query(
        `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'customers'
           AND COLUMN_NAME = 'level'`,
      )
      if (Number(rows[0]?.total || 0) === 0) {
        await query(
          `ALTER TABLE customers
           ADD COLUMN level ENUM('key', 'normal', 'potential', 'vip') NOT NULL DEFAULT 'normal'
           AFTER salesperson`,
        )
      }
    })()
  }
  return ensureCustomerLevelColumnPromise
}

function normalizeCustomerLevel(level) {
  return CUSTOMER_LEVELS.has(level) ? level : 'normal'
}

function contactPayload(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  }
}

function customerPayload(row, contacts = []) {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    code: row.code,
    address: row.address,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    salesperson: row.salesperson,
    level: normalizeCustomerLevel(row.level),
    latitude: row.latitude,
    longitude: row.longitude,
    mapProvider: row.map_provider,
    mapPoiId: row.map_poi_id,
    mapPoiName: row.map_poi_name,
    mapAddress: row.map_address,
    serviceOrderCount: Number(row.service_order_count || 0),
    contacts,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function loadContacts(customerIds) {
  if (!customerIds.length) return new Map()

  const params = customerIds.reduce((values, id, index) => {
    values[`customerId${index}`] = id
    return values
  }, {})
  const rows = await query(
    `SELECT id, customer_id, name, phone, use_count, last_used_at
     FROM customer_contacts
     WHERE customer_id IN (${customerIds.map((_, index) => `:customerId${index}`).join(',')})
     ORDER BY customer_id ASC, use_count DESC, last_used_at DESC, id DESC`,
    params,
  )

  return rows.reduce((groups, row) => {
    if (!groups.has(row.customer_id)) groups.set(row.customer_id, [])
    groups.get(row.customer_id).push(contactPayload(row))
    return groups
  }, new Map())
}

async function cleanupDuplicateContacts(customerIds) {
  if (!customerIds.length) return
  const params = customerIds.reduce((values, id, index) => {
    values[`customerId${index}`] = id
    return values
  }, {})
  const rows = await query(
    `SELECT id, customer_id, name, use_count
     FROM customer_contacts
     WHERE customer_id IN (${customerIds.map((_, index) => `:customerId${index}`).join(',')})
     ORDER BY customer_id ASC, name ASC, last_used_at DESC, id DESC`,
    params,
  )
  const grouped = rows.reduce((groups, row) => {
    const key = `${row.customer_id}:${row.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
    return groups
  }, new Map())
  const duplicateGroups = [...grouped.values()].filter((group) => group.length > 1)
  if (!duplicateGroups.length) return

  await transaction(async (connection) => {
    for (const group of duplicateGroups) {
      const [keeper, ...duplicates] = group
      const duplicateUseCount = duplicates.reduce((total, row) => total + Number(row.use_count || 0), 0)
      await connection.execute(
        `UPDATE customer_contacts
         SET use_count = use_count + :duplicateUseCount,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :id`,
        { id: keeper.id, duplicateUseCount },
      )
      await mergeDuplicateContacts(
        connection,
        keeper.id,
        duplicates.map((row) => row.id),
      )
    }
  })
}

async function recordContact(connection, customerId, name, phone = null) {
  if (!name) return
  const [existingRows] = await connection.execute(
    `SELECT id, use_count
     FROM customer_contacts
     WHERE customer_id = :customerId AND name = :name
     ORDER BY last_used_at DESC, id DESC`,
    { customerId, name },
  )
  if (existingRows[0]) {
    const keeper = existingRows[0]
    const duplicateIds = existingRows.slice(1).map((row) => row.id)
    const duplicateUseCount = existingRows.slice(1).reduce((total, row) => total + Number(row.use_count || 0), 0)
    await connection.execute(
      `UPDATE customer_contacts
       SET phone = :phone,
           use_count = use_count + :duplicateUseCount + 1,
           last_used_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: keeper.id, phone: phone || null, duplicateUseCount },
    )
    if (duplicateIds.length) {
      await mergeDuplicateContacts(connection, keeper.id, duplicateIds)
    }
    return
  }

  await connection.execute(
    `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
     VALUES (:customerId, :name, :phone, 1, CURRENT_TIMESTAMP)`,
    { customerId, name, phone: phone || null },
  )
}

async function mergeDuplicateContacts(connection, keeperId, duplicateIds) {
  if (!duplicateIds.length) return
  const params = duplicateIds.reduce(
    (values, id, index) => {
      values[`duplicateId${index}`] = id
      return values
    },
    { keeperId },
  )
  const placeholders = duplicateIds.map((_, index) => `:duplicateId${index}`).join(',')
  const [usageRows] = await connection.execute(
    `SELECT engineer_id, SUM(use_count) AS use_count, MAX(last_used_at) AS last_used_at
     FROM customer_contact_usage
     WHERE customer_contact_id IN (${placeholders})
     GROUP BY engineer_id`,
    params,
  )
  for (const usage of usageRows) {
    await connection.execute(
      `INSERT INTO customer_contact_usage (customer_contact_id, engineer_id, use_count, last_used_at)
       VALUES (:keeperId, :engineerId, :useCount, :lastUsedAt)
       ON DUPLICATE KEY UPDATE
         use_count = use_count + VALUES(use_count),
         last_used_at = GREATEST(last_used_at, VALUES(last_used_at)),
         updated_at = CURRENT_TIMESTAMP`,
      {
        keeperId,
        engineerId: usage.engineer_id,
        useCount: Number(usage.use_count || 0),
        lastUsedAt: usage.last_used_at,
      },
    )
  }
  await connection.execute(`DELETE FROM customer_contact_usage WHERE customer_contact_id IN (${placeholders})`, params)
  await connection.execute(`DELETE FROM customer_contacts WHERE id IN (${placeholders})`, params)
}

async function replaceContacts(connection, customerId, contacts = []) {
  const normalized = contacts
    .map((contact) => ({
      id: Number(contact.id || 0) || null,
      name: String(contact.name || '').trim(),
      phone: String(contact.phone || '').trim() || null,
    }))
    .filter((contact) => contact.name)

  const seenNames = new Set()
  const deduped = []
  for (const contact of normalized) {
    if (seenNames.has(contact.name)) continue
    seenNames.add(contact.name)
    deduped.push(contact)
  }

  const existingRows = await connection.execute('SELECT id FROM customer_contacts WHERE customer_id = :customerId', { customerId })
  const existingIds = new Set(existingRows[0].map((row) => Number(row.id)))
  const keptIds = []

  for (const contact of deduped) {
    if (contact.id && existingIds.has(contact.id)) {
      const [duplicateRows] = await connection.execute(
        `SELECT id
         FROM customer_contacts
         WHERE customer_id = :customerId AND name = :name AND id <> :id`,
        { id: contact.id, customerId, name: contact.name },
      )
      await mergeDuplicateContacts(
        connection,
        contact.id,
        duplicateRows.map((row) => row.id),
      )
      await connection.execute(
        `UPDATE customer_contacts
         SET name = :name, phone = :phone, updated_at = CURRENT_TIMESTAMP
         WHERE id = :id AND customer_id = :customerId`,
        { id: contact.id, customerId, name: contact.name, phone: contact.phone },
      )
      keptIds.push(contact.id)
    } else {
      const [sameNameRows] = await connection.execute(
        `SELECT id
         FROM customer_contacts
         WHERE customer_id = :customerId AND name = :name
         ORDER BY last_used_at DESC, id DESC`,
        { customerId, name: contact.name },
      )
      if (sameNameRows[0]) {
        await mergeDuplicateContacts(
          connection,
          sameNameRows[0].id,
          sameNameRows.slice(1).map((row) => row.id),
        )
        await connection.execute(
          `UPDATE customer_contacts
           SET phone = :phone, updated_at = CURRENT_TIMESTAMP
           WHERE id = :id`,
          { id: sameNameRows[0].id, phone: contact.phone },
        )
        keptIds.push(sameNameRows[0].id)
        continue
      }
      const [result] = await connection.execute(
        `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
         VALUES (:customerId, :name, :phone, 1, CURRENT_TIMESTAMP)`,
        { customerId, name: contact.name, phone: contact.phone },
      )
      keptIds.push(result.insertId)
    }
  }

  const deleteIds = [...existingIds].filter((id) => !keptIds.includes(id))
  if (deleteIds.length) {
    const params = deleteIds.reduce((values, id, index) => {
      values[`deleteId${index}`] = id
      return values
    }, {})
    const placeholders = deleteIds.map((_, index) => `:deleteId${index}`).join(',')
    await connection.execute(`DELETE FROM customer_contact_usage WHERE customer_contact_id IN (${placeholders})`, params)
    await connection.execute(`DELETE FROM customer_contacts WHERE id IN (${placeholders})`, params)
  }
}

async function mergeCustomerContacts(connection, sourceCustomerId, targetCustomerId) {
  const [sourceContacts] = await connection.execute(
    `SELECT id, name, phone
     FROM customer_contacts
     WHERE customer_id = :sourceCustomerId
     ORDER BY use_count DESC, last_used_at DESC, id DESC`,
    { sourceCustomerId },
  )

  for (const contact of sourceContacts) {
    const [targetContacts] = await connection.execute(
      `SELECT id
       FROM customer_contacts
       WHERE customer_id = :targetCustomerId AND name = :name AND (phone <=> :phone)
       ORDER BY use_count DESC, last_used_at DESC, id DESC
       LIMIT 1`,
      { targetCustomerId, name: contact.name, phone: contact.phone || null },
    )

    if (targetContacts[0]) {
      await mergeDuplicateContacts(connection, targetContacts[0].id, [contact.id])
      continue
    }

    await connection.execute(
      `UPDATE customer_contacts
       SET customer_id = :targetCustomerId,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { targetCustomerId, id: contact.id },
    )
  }
}

async function nextCustomerCode(connection) {
  const [rows] = await connection.execute(
    `SELECT MAX(CAST(SUBSTRING(code, 9) AS UNSIGNED)) AS max_no
     FROM customers
     WHERE code LIKE 'TS-CUST-%'`,
  )
  const nextNo = Number(rows[0]?.max_no || 0) + 1
  return `TS-CUST-${String(nextNo).padStart(4, '0')}`
}

function duplicateCustomerError(error) {
  if (error?.code !== 'ER_DUP_ENTRY') return null
  const message = String(error.message || '')
  if (message.includes('uk_customers_code')) {
    return badRequest('客户编码已存在，请换一个编码')
  }
  if (message.includes('uk_customers_name_key')) {
    return badRequest('客户名称已存在，系统已按简繁/相似名称合并判断')
  }
  return badRequest('客户资料已存在，请检查客户名称或编码')
}

async function list(req, res) {
  await ensureCustomerLevelColumn()
  const { keyword = '', salesperson = '' } = req.query
  const keywordKey = customerNameKey(keyword)
  const rows = await query(
      `SELECT c.id, c.name, c.name_key, c.code, c.address, c.contact_name, c.contact_phone, c.salesperson,
            c.level,
            latitude, longitude, map_provider, map_poi_id, map_poi_name, map_address,
            remark, created_at, updated_at,
            COALESCE(soc.service_order_count, 0) AS service_order_count
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS service_order_count
        FROM service_orders
        WHERE status <> 'cancelled'
        GROUP BY customer_id
      ) soc ON soc.customer_id = c.id
     WHERE (:salesperson = '' OR c.salesperson = :salesperson)
       AND (
         :keyword = ''
         OR c.name LIKE :likeKeyword
         OR c.name_key LIKE :likeKeywordKey
         OR c.code LIKE :likeKeyword
         OR c.contact_name LIKE :likeKeyword
         OR c.contact_phone LIKE :likeKeyword
         OR c.salesperson LIKE :likeKeyword
         OR c.address LIKE :likeKeyword
         OR c.remark LIKE :likeKeyword
         OR c.map_poi_name LIKE :likeKeyword
         OR c.map_address LIKE :likeKeyword
       )
     ORDER BY c.id DESC
     LIMIT 200`,
    { keyword, salesperson, likeKeyword: `%${keyword}%`, likeKeywordKey: `%${keywordKey}%` },
  )

  await cleanupDuplicateContacts(rows.map((row) => row.id))
  const contactsByCustomer = await loadContacts(rows.map((row) => row.id))
  res.json({ items: rows.map((row) => customerPayload(row, contactsByCustomer.get(row.id) || [])) })
}

async function create(req, res) {
  await ensureCustomerLevelColumn()
  const {
    name,
    code,
    address,
    contactName,
    contactPhone,
    contacts,
    salesperson,
    level,
    latitude,
    longitude,
    mapProvider,
    mapPoiId,
    mapPoiName,
    mapAddress,
    remark,
  } = req.body || {}
  if (!name) {
    throw badRequest('客户名称不能为空')
  }
  const nameKey = customerNameKey(name)

  let result
  try {
    result = await transaction(async (connection) => {
      const [existingRows] = await connection.execute('SELECT id, code FROM customers WHERE name_key = :nameKey LIMIT 1', { nameKey })
      if (existingRows[0]) {
        const effectiveCode = code || existingRows[0].code || (await nextCustomerCode(connection))
        await connection.execute(
          `UPDATE customers
           SET name = :name,
               code = :code,
               address = COALESCE(:address, address),
               contact_name = COALESCE(:contactName, contact_name),
               contact_phone = COALESCE(:contactPhone, contact_phone),
               salesperson = COALESCE(:salesperson, salesperson),
               level = :level,
               latitude = COALESCE(:latitude, latitude),
               longitude = COALESCE(:longitude, longitude),
               map_provider = COALESCE(:mapProvider, map_provider),
               map_poi_id = COALESCE(:mapPoiId, map_poi_id),
               map_poi_name = COALESCE(:mapPoiName, map_poi_name),
               map_address = COALESCE(:mapAddress, map_address),
               remark = COALESCE(:remark, remark)
           WHERE id = :id`,
          {
            id: existingRows[0].id,
            name,
            code: effectiveCode,
            address: address || null,
            contactName: contactName || null,
            contactPhone: contactPhone || null,
            salesperson: salesperson || null,
            level: normalizeCustomerLevel(level),
            latitude: latitude || null,
            longitude: longitude || null,
            mapProvider: mapProvider || null,
            mapPoiId: mapPoiId || null,
            mapPoiName: mapPoiName || null,
            mapAddress: mapAddress || null,
            remark: remark || null,
          },
        )
        if (Array.isArray(contacts)) {
          await replaceContacts(connection, existingRows[0].id, contacts)
        } else {
          await recordContact(connection, existingRows[0].id, contactName, contactPhone)
        }
        return { insertId: existingRows[0].id }
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO customers (
           name, name_key, code, address, contact_name, contact_phone, salesperson,
           level,
           latitude, longitude, map_provider, map_poi_id, map_poi_name, map_address, remark
         )
         VALUES (
           :name, :nameKey, :code, :address, :contactName, :contactPhone, :salesperson,
           :level,
           :latitude, :longitude, :mapProvider, :mapPoiId, :mapPoiName, :mapAddress, :remark
         )`,
        {
          name,
          nameKey,
          code: code || (await nextCustomerCode(connection)),
          address: address || null,
          contactName: contactName || null,
          contactPhone: contactPhone || null,
          salesperson: salesperson || null,
          level: normalizeCustomerLevel(level),
          latitude: latitude || null,
          longitude: longitude || null,
          mapProvider: mapProvider || null,
          mapPoiId: mapPoiId || null,
          mapPoiName: mapPoiName || null,
          mapAddress: mapAddress || null,
          remark: remark || null,
        },
      )
      if (Array.isArray(contacts)) {
        await replaceContacts(connection, insertResult.insertId, contacts)
      } else {
        await recordContact(connection, insertResult.insertId, contactName, contactPhone)
      }
      return insertResult
    })
  } catch (error) {
    throw duplicateCustomerError(error) || error
  }

  res.status(201).json({ id: result.insertId })
}

async function detail(req, res) {
  await ensureCustomerLevelColumn()
  const rows = await query(
    `SELECT id, name, name_key, code, address, contact_name, contact_phone, salesperson,
            level,
            latitude, longitude, map_provider, map_poi_id, map_poi_name, map_address,
            remark, created_at, updated_at
     FROM customers
     WHERE id = :id
     LIMIT 1`,
    { id: req.params.id },
  )

  if (!rows[0]) {
    throw notFound('客户不存在')
  }

  await cleanupDuplicateContacts([rows[0].id])
  const contactsByCustomer = await loadContacts([rows[0].id])
  res.json({ item: customerPayload(rows[0], contactsByCustomer.get(rows[0].id) || []) })
}

async function update(req, res) {
  await ensureCustomerLevelColumn()
  const {
    name,
    code,
    address,
    contactName,
    contactPhone,
    contacts,
    salesperson,
    level,
    latitude,
    longitude,
    mapProvider,
    mapPoiId,
    mapPoiName,
    mapAddress,
    remark,
  } = req.body || {}
  const existing = await query('SELECT id, code FROM customers WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('客户不存在')
  }
  const nameKey = name ? customerNameKey(name) : null

  try {
    await transaction(async (connection) => {
      await connection.execute(
        `UPDATE customers
         SET name = COALESCE(:name, name),
             name_key = COALESCE(:nameKey, name_key),
             code = :code,
             address = :address,
             contact_name = :contactName,
             contact_phone = :contactPhone,
             salesperson = :salesperson,
             level = :level,
             latitude = :latitude,
             longitude = :longitude,
             map_provider = :mapProvider,
             map_poi_id = :mapPoiId,
             map_poi_name = :mapPoiName,
             map_address = :mapAddress,
             remark = :remark
         WHERE id = :id`,
        {
          id: req.params.id,
          name: name || null,
          nameKey,
          code: code || existing[0].code || (await nextCustomerCode(connection)),
          address: address || null,
          contactName: contactName || null,
          contactPhone: contactPhone || null,
          salesperson: salesperson || null,
          level: normalizeCustomerLevel(level),
          latitude: latitude || null,
          longitude: longitude || null,
          mapProvider: mapProvider || null,
          mapPoiId: mapPoiId || null,
          mapPoiName: mapPoiName || null,
          mapAddress: mapAddress || null,
          remark: remark || null,
        },
      )
      if (Array.isArray(contacts)) {
        await replaceContacts(connection, req.params.id, contacts)
      } else {
        await recordContact(connection, req.params.id, contactName, contactPhone)
      }
    })
  } catch (error) {
    throw duplicateCustomerError(error) || error
  }

  res.status(204).end()
}

async function merge(req, res) {
  await ensureCustomerLevelColumn()
  const targetCustomerId = Number(req.params.id)
  const sourceCustomerId = Number(req.body?.sourceCustomerId)

  if (!targetCustomerId || !sourceCustomerId) {
    throw badRequest('请选择要合并的客户')
  }
  if (targetCustomerId === sourceCustomerId) {
    throw badRequest('不能合并同一个客户')
  }

  const customers = await query(
    `SELECT id, name, code, address, contact_name, contact_phone, salesperson,
            level,
            latitude, longitude, map_provider, map_poi_id, map_poi_name, map_address, remark
     FROM customers
     WHERE id = :targetCustomerId OR id = :sourceCustomerId`,
    { targetCustomerId, sourceCustomerId },
  )
  const targetCustomer = customers.find((customer) => Number(customer.id) === targetCustomerId)
  const sourceCustomer = customers.find((customer) => Number(customer.id) === sourceCustomerId)

  if (!targetCustomer || !sourceCustomer) {
    throw notFound('客户不存在')
  }

  await transaction(async (connection) => {
    await connection.execute('UPDATE service_orders SET customer_id = :targetCustomerId WHERE customer_id = :sourceCustomerId', {
      targetCustomerId,
      sourceCustomerId,
    })
    await connection.execute('UPDATE devices SET customer_id = :targetCustomerId WHERE customer_id = :sourceCustomerId', {
      targetCustomerId,
      sourceCustomerId,
    })
    await mergeCustomerContacts(connection, sourceCustomerId, targetCustomerId)

    const aliases = new Set()
    for (const value of [targetCustomer.remark, sourceCustomer.remark]) {
      if (value) aliases.add(value)
    }
    aliases.add(`合并来源：${sourceCustomer.name}${sourceCustomer.code ? `（${sourceCustomer.code}）` : ''}`)

    await connection.execute(
      `UPDATE customers
       SET address = COALESCE(NULLIF(address, ''), :address),
           contact_name = COALESCE(NULLIF(contact_name, ''), :contactName),
           contact_phone = COALESCE(NULLIF(contact_phone, ''), :contactPhone),
           salesperson = COALESCE(NULLIF(salesperson, ''), :salesperson),
           level = COALESCE(level, :level),
           latitude = COALESCE(latitude, :latitude),
           longitude = COALESCE(longitude, :longitude),
           map_provider = COALESCE(NULLIF(map_provider, ''), :mapProvider),
           map_poi_id = COALESCE(NULLIF(map_poi_id, ''), :mapPoiId),
           map_poi_name = COALESCE(NULLIF(map_poi_name, ''), :mapPoiName),
           map_address = COALESCE(NULLIF(map_address, ''), :mapAddress),
           remark = :remark
       WHERE id = :targetCustomerId`,
      {
        targetCustomerId,
        address: sourceCustomer.address || null,
        contactName: sourceCustomer.contact_name || null,
        contactPhone: sourceCustomer.contact_phone || null,
        salesperson: sourceCustomer.salesperson || null,
        level: normalizeCustomerLevel(sourceCustomer.level),
        latitude: sourceCustomer.latitude || null,
        longitude: sourceCustomer.longitude || null,
        mapProvider: sourceCustomer.map_provider || null,
        mapPoiId: sourceCustomer.map_poi_id || null,
        mapPoiName: sourceCustomer.map_poi_name || null,
        mapAddress: sourceCustomer.map_address || null,
        remark: Array.from(aliases).filter(Boolean).join('\n'),
      },
    )
    await connection.execute('DELETE FROM customers WHERE id = :sourceCustomerId', { sourceCustomerId })
  })

  res.status(204).end()
}

async function devices(req, res) {
  const rows = await query(
    `SELECT d.id, d.customer_id, d.name, d.model, d.serial_no, d.remark, d.maintenance_type,
            d.maintenance_party_id, mp.name AS maintenance_party_name, mp.phone AS maintenance_party_phone,
            d.maintenance_start, d.maintenance_end, d.installation_source_service_order_id, d.location,
            d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id
     WHERE d.customer_id = :customerId
     ORDER BY d.id DESC`,
    { customerId: req.params.id },
  )

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      model: row.model,
      serialNo: row.serial_no,
      remark: row.remark,
      maintenanceType: row.maintenance_type,
      maintenancePartyId: row.maintenance_party_id,
      maintenancePartyName: row.maintenance_party_name,
      maintenancePartyPhone: row.maintenance_party_phone,
      maintenanceStart: row.maintenance_start,
      maintenanceEnd: row.maintenance_end,
      installationSourceServiceOrderId: row.installation_source_service_order_id,
      location: row.location,
      warrantyUntil: row.warranty_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  })
}

module.exports = {
  list,
  create,
  detail,
  update,
  merge,
  devices,
}
