const fs = require('fs')
const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { customerNameKey } = require('../../utils/chinese')
const { normalizePhoneNumber } = require('../../utils/phone')
const {
  assertSalesCanAccessSalesperson,
  assertSalesCanUseSalesperson,
  buildSalesCustomerScope,
} = require('../../permissions/sales-scope')
const { INTERNAL_CUSTOMER_NAME, INTERNAL_CUSTOMER_NAME_KEY } = require('./internal')

const CUSTOMER_LEVELS = new Set(['key', 'normal', 'potential', 'vip'])
const CUSTOMER_FORCE_DELETE_ROLES = new Set(['admin', 'dispatcher', 'operations_director', 'engineering_supervisor', 'sales_supervisor', 'sales'])
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
    phone: normalizePhoneNumber(row.phone) || row.phone,
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
    contactPhone: normalizePhoneNumber(row.contact_phone) || row.contact_phone,
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

function normalizeContactName(value) {
  return String(value || '').trim()
}

function normalizeContactPhone(value) {
  const normalized = normalizePhoneNumber(value)
  return normalized || (value ? String(value).trim() : null)
}

async function syncServiceOrderContactSnapshot(connection, customerId, previousContact, nextContact) {
  const oldName = normalizeContactName(previousContact?.name)
  const newName = normalizeContactName(nextContact?.name)
  if (!oldName || !newName) return

  const oldPhone = normalizeContactPhone(previousContact?.phone)
  const newPhone = normalizeContactPhone(nextContact?.phone)
  if (oldName === newName && oldPhone === newPhone) return

  await connection.execute(
    `UPDATE service_orders
     SET contact_name = :newName,
         contact_phone = :newPhone,
         updated_at = CURRENT_TIMESTAMP
     WHERE customer_id = :customerId
       AND TRIM(contact_name) = :oldName`,
    {
      customerId,
      oldName,
      newName,
      newPhone,
    },
  )
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
  const normalizedPhone = normalizePhoneNumber(phone)
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
      { id: keeper.id, phone: normalizedPhone || null, duplicateUseCount },
    )
    if (duplicateIds.length) {
      await mergeDuplicateContacts(connection, keeper.id, duplicateIds)
    }
    return
  }

  await connection.execute(
    `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
     VALUES (:customerId, :name, :phone, 1, CURRENT_TIMESTAMP)`,
    { customerId, name, phone: normalizedPhone || null },
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
      phone: normalizePhoneNumber(contact.phone) || null,
    }))
    .filter((contact) => contact.name)

  const seenNames = new Set()
  const deduped = []
  for (const contact of normalized) {
    if (seenNames.has(contact.name)) continue
    seenNames.add(contact.name)
    deduped.push(contact)
  }

  const existingRows = await connection.execute('SELECT id, name, phone FROM customer_contacts WHERE customer_id = :customerId', { customerId })
  const existingById = new Map(existingRows[0].map((row) => [Number(row.id), row]))
  const existingIds = new Set(existingRows[0].map((row) => Number(row.id)))
  const keptIds = []

  for (const contact of deduped) {
    if (contact.id && existingIds.has(contact.id)) {
      const previousContact = existingById.get(contact.id)
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
      await syncServiceOrderContactSnapshot(connection, customerId, previousContact, contact)
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

function idParams(ids, prefix) {
  return ids.reduce(
    (result, id, index) => {
      const key = `${prefix}${index}`
      result.params[key] = id
      result.placeholders.push(`:${key}`)
      return result
    },
    { params: {}, placeholders: [] },
  )
}

function cleanupStorageFiles(filePaths = []) {
  for (const filePath of filePaths) {
    if (filePath) fs.rm(filePath, { force: true }, () => {})
  }
}

async function deleteFileRowsForOrderIds(connection, orderIds) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [orderIds]).map(Number).filter(Boolean))]
  if (!ids.length) return []
  const { params, placeholders } = idParams(ids, 'fileOrderId')
  const list = placeholders.join(',')
  const [rows] = await connection.execute(
    `SELECT id, storage_path
     FROM files
     WHERE (owner_type = 'service_order' AND owner_id IN (${list}))
        OR (owner_type = 'service_report' AND owner_id IN (${list}))
        OR (
          owner_type = 'signature'
          AND owner_id IN (${list})
          AND NOT EXISTS (
            SELECT 1
            FROM service_reports sr
            WHERE sr.customer_signature_file_id = files.id
              AND sr.service_order_id NOT IN (${list})
          )
        )`,
    params,
  )
  if (!rows.length) return []
  const fileIds = idParams(rows.map((row) => row.id), 'deleteFileId')
  await connection.execute(`DELETE FROM files WHERE id IN (${fileIds.placeholders.join(',')})`, fileIds.params)
  return rows.map((row) => row.storage_path).filter(Boolean)
}

function isForceDeleteRequest(req) {
  return ['1', 'true', 'yes'].includes(String(req.query?.force || '').toLowerCase())
}

async function deleteCustomerContacts(connection, customerId) {
  const [contactRows] = await connection.execute('SELECT id FROM customer_contacts WHERE customer_id = :customerId', { customerId })
  const contactIds = contactRows.map((row) => Number(row.id)).filter(Boolean)
  if (!contactIds.length) return

  const { params, placeholders } = idParams(contactIds, 'contactId')
  await connection.execute(`DELETE FROM customer_contact_usage WHERE customer_contact_id IN (${placeholders.join(',')})`, params)
  await connection.execute(`DELETE FROM customer_contacts WHERE id IN (${placeholders.join(',')})`, params)
}

async function deleteServiceOrders(connection, orderIds) {
  if (!orderIds.length) return []
  const { params, placeholders } = idParams(orderIds, 'orderId')
  const list = placeholders.join(',')

  await connection.execute(`UPDATE devices SET installation_source_service_order_id = NULL WHERE installation_source_service_order_id IN (${list})`, params)
  await connection.execute(`DELETE FROM service_report_work_entries WHERE service_order_id IN (${list})`, params)
  await connection.execute(`DELETE FROM service_parts WHERE service_order_id IN (${list})`, params)
  await connection.execute(`DELETE FROM self_report_drafts WHERE service_order_id IN (${list})`, params)
  const deletedFilePaths = await deleteFileRowsForOrderIds(connection, orderIds)
  await connection.execute(`DELETE FROM service_reports WHERE service_order_id IN (${list})`, params)
  await connection.execute(`DELETE FROM service_order_engineers WHERE service_order_id IN (${list})`, params)
  await connection.execute(`DELETE FROM service_orders WHERE id IN (${list})`, params)
  return deletedFilePaths
}

async function forceDeleteCustomer(connection, customerId) {
  const [deviceRows] = await connection.execute('SELECT id FROM devices WHERE customer_id = :customerId', { customerId })
  const deviceIds = deviceRows.map((row) => Number(row.id)).filter(Boolean)

  let orderRows
  if (deviceIds.length) {
    const deviceIdParams = idParams(deviceIds, 'deviceId')
    orderRows = (await connection.execute(
      `SELECT id
       FROM service_orders
       WHERE customer_id = :customerId OR device_id IN (${deviceIdParams.placeholders.join(',')})`,
      { customerId, ...deviceIdParams.params },
    ))[0]
  } else {
    orderRows = (await connection.execute('SELECT id FROM service_orders WHERE customer_id = :customerId', { customerId }))[0]
  }
  const orderIds = orderRows.map((row) => Number(row.id)).filter(Boolean)

  let deletedFilePaths = []
  if (orderIds.length) {
    const orderIdParams = idParams(orderIds, 'linkedOrderId')
    await connection.execute(`UPDATE service_orders SET device_id = NULL WHERE id IN (${orderIdParams.placeholders.join(',')})`, orderIdParams.params)
    deletedFilePaths = await deleteServiceOrders(connection, orderIds)
  }

  if (deviceIds.length) {
    const deviceIdParams = idParams(deviceIds, 'deleteDeviceId')
    await connection.execute(
      `DELETE FROM inspection_schedules
       WHERE customer_id = :customerId OR device_id IN (${deviceIdParams.placeholders.join(',')})`,
      { customerId, ...deviceIdParams.params },
    )
    await connection.execute(`DELETE FROM devices WHERE id IN (${deviceIdParams.placeholders.join(',')})`, deviceIdParams.params)
  } else {
    await connection.execute('DELETE FROM inspection_schedules WHERE customer_id = :customerId', { customerId })
  }

  await deleteCustomerContacts(connection, customerId)
  await connection.execute('DELETE FROM customers WHERE id = :customerId', { customerId })

  return { deviceCount: deviceIds.length, serviceOrderCount: orderIds.length, deletedFilePaths }
}

async function list(req, res) {
  await ensureCustomerLevelColumn()
  const { salesperson = '', mine = '' } = req.query
  const keyword = String(req.query.keyword ?? req.query.q ?? '').trim()
  const keywordKey = customerNameKey(keyword)
  const normalizedPageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 200))
  const mineQuery = mine === '1' || mine === 'true'
  const effectiveEngineerId = mineQuery ? Number(req.user.id) : null
  const engineerCustomerWhere = effectiveEngineerId
    ? `AND EXISTS (
          SELECT 1
          FROM service_orders mine_so
          WHERE mine_so.customer_id = c.id
            AND mine_so.status <> 'cancelled'
            AND (
              mine_so.assigned_engineer_id = :effectiveEngineerId
              OR EXISTS (
                SELECT 1
                FROM service_order_engineers mine_soe
                WHERE mine_soe.service_order_id = mine_so.id
                  AND mine_soe.engineer_id = :effectiveEngineerId
              )
            )
        )`
    : ''
  const orderBy = effectiveEngineerId
    ? 'COALESCE(es.last_used_at, c.updated_at, c.created_at) DESC, COALESCE(es.engineer_order_count, 0) DESC, c.id DESC'
    : 'c.id DESC'
  const salesScope = buildSalesCustomerScope(req.user, 'c')
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
      LEFT JOIN (
        SELECT so.customer_id, COUNT(*) AS engineer_order_count, MAX(COALESCE(so.submitted_at, so.created_at)) AS last_used_at
        FROM service_orders so
        WHERE so.status <> 'cancelled'
          AND (
            :effectiveEngineerId IS NULL
            OR so.assigned_engineer_id = :effectiveEngineerId
            OR EXISTS (
              SELECT 1
              FROM service_order_engineers soe
              WHERE soe.service_order_id = so.id
                AND soe.engineer_id = :effectiveEngineerId
            )
          )
        GROUP BY so.customer_id
      ) es ON es.customer_id = c.id
     WHERE (:salesperson = '' OR c.salesperson = :salesperson)
       AND NOT (c.name = :internalCustomerName OR c.name_key = :internalCustomerNameKey)
       ${salesScope.sql}
       ${engineerCustomerWhere}
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
     ORDER BY ${orderBy}
     LIMIT ${normalizedPageSize}`,
    {
      keyword,
      salesperson,
      effectiveEngineerId,
      likeKeyword: `%${keyword}%`,
      likeKeywordKey: `%${keywordKey}%`,
      internalCustomerName: INTERNAL_CUSTOMER_NAME,
      internalCustomerNameKey: INTERNAL_CUSTOMER_NAME_KEY,
      ...salesScope.params,
    },
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
  assertSalesCanUseSalesperson(salesperson, req.user, forbidden)
  const nameKey = customerNameKey(name)
  const normalizedContactPhone = normalizePhoneNumber(contactPhone)

  let result
  try {
    result = await transaction(async (connection) => {
      const [existingRows] = await connection.execute(
        'SELECT id, code, salesperson, contact_name, contact_phone FROM customers WHERE name_key = :nameKey LIMIT 1',
        { nameKey },
      )
      if (existingRows[0]) {
        assertSalesCanAccessSalesperson(existingRows[0].salesperson, req.user, forbidden)
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
            contactPhone: normalizedContactPhone || null,
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
          await recordContact(connection, existingRows[0].id, contactName, normalizedContactPhone)
        }
        await syncServiceOrderContactSnapshot(
          connection,
          existingRows[0].id,
          { name: existingRows[0].contact_name, phone: existingRows[0].contact_phone },
          { name: contactName, phone: normalizedContactPhone || contactPhone || null },
        )
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
          contactPhone: normalizedContactPhone || null,
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
        await recordContact(connection, insertResult.insertId, contactName, normalizedContactPhone)
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
  assertSalesCanAccessSalesperson(rows[0].salesperson, req.user, forbidden)

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
  const existing = await query('SELECT id, code, salesperson, contact_name, contact_phone FROM customers WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('客户不存在')
  }
  assertSalesCanAccessSalesperson(existing[0].salesperson, req.user, forbidden)
  assertSalesCanUseSalesperson(salesperson, req.user, forbidden)
  const nameKey = name ? customerNameKey(name) : null
  const normalizedContactPhone = normalizePhoneNumber(contactPhone)

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
          contactPhone: normalizedContactPhone || null,
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
        await recordContact(connection, req.params.id, contactName, normalizedContactPhone)
      }
      await syncServiceOrderContactSnapshot(
        connection,
        req.params.id,
        { name: existing[0].contact_name, phone: existing[0].contact_phone },
        { name: contactName, phone: normalizedContactPhone || contactPhone || null },
      )
    })
  } catch (error) {
    throw duplicateCustomerError(error) || error
  }

  res.status(204).end()
}

async function remove(req, res) {
  const forced = isForceDeleteRequest(req)
  if (forced && !CUSTOMER_FORCE_DELETE_ROLES.has(req.user?.role)) {
    throw forbidden('当前账号无权强制删除客户')
  }

  let forceDeleteResult = null
  await transaction(async (connection) => {
    const customerId = Number(req.params.id)
    const [customers] = await connection.execute('SELECT id, salesperson FROM customers WHERE id = :customerId LIMIT 1 FOR UPDATE', { customerId })
    if (!customers[0]) {
      throw notFound('客户不存在')
    }
    assertSalesCanAccessSalesperson(customers[0].salesperson, req.user, forbidden)

    const [relationRows] = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM devices WHERE customer_id = :customerId) AS device_count,
         (SELECT COUNT(*) FROM service_orders WHERE customer_id = :customerId) AS service_order_count,
         (SELECT COUNT(*) FROM inspection_schedules WHERE customer_id = :customerId) AS inspection_schedule_count`,
      { customerId },
    )
    const deviceCount = Number(relationRows[0]?.device_count || 0)
    const serviceOrderCount = Number(relationRows[0]?.service_order_count || 0)
    const inspectionScheduleCount = Number(relationRows[0]?.inspection_schedule_count || 0)
    if (deviceCount > 0) {
      if (forced) {
        forceDeleteResult = await forceDeleteCustomer(connection, customerId)
        return
      }
      throw badRequest('该客户下还有关联设备，请先删除或转移设备后再删除客户')
    }
    if (serviceOrderCount > 0) {
      if (forced) {
        forceDeleteResult = await forceDeleteCustomer(connection, customerId)
        return
      }
      throw badRequest('该客户已有服务单关联，请先删除关联的服务单，再删除客户')
    }
    if (inspectionScheduleCount > 0) {
      if (forced) {
        forceDeleteResult = await forceDeleteCustomer(connection, customerId)
        return
      }
      throw badRequest('该客户已有巡检计划关联，请先删除关联的巡检计划，再删除客户')
    }

    await deleteCustomerContacts(connection, customerId)

    await connection.execute('DELETE FROM customers WHERE id = :customerId', { customerId })
  })

  if (forceDeleteResult) {
    cleanupStorageFiles(forceDeleteResult.deletedFilePaths)
    delete forceDeleteResult.deletedFilePaths
    res.json({ deleted: true, forced: true, ...forceDeleteResult })
    return
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
  assertSalesCanAccessSalesperson(targetCustomer.salesperson, req.user, forbidden)
  assertSalesCanAccessSalesperson(sourceCustomer.salesperson, req.user, forbidden)

  await transaction(async (connection) => {
    await connection.execute('UPDATE service_orders SET customer_id = :targetCustomerId WHERE customer_id = :sourceCustomerId', {
      targetCustomerId,
      sourceCustomerId,
    })
    await connection.execute('UPDATE devices SET customer_id = :targetCustomerId WHERE customer_id = :sourceCustomerId', {
      targetCustomerId,
      sourceCustomerId,
    })
    await connection.execute(
      `UPDATE inspection_schedules source_schedule
       JOIN inspection_schedules target_schedule
         ON target_schedule.customer_id = :targetCustomerId
        AND target_schedule.target_engineer_id = source_schedule.target_engineer_id
        AND target_schedule.cadence = source_schedule.cadence
        AND target_schedule.active = 1
       SET source_schedule.active = 0,
           source_schedule.updated_by = COALESCE(:updatedBy, source_schedule.updated_by)
       WHERE source_schedule.customer_id = :sourceCustomerId
         AND source_schedule.active = 1`,
      {
        targetCustomerId,
        sourceCustomerId,
        updatedBy: req.user?.id || null,
      },
    )
    await connection.execute(
      `UPDATE inspection_schedules
       SET customer_id = :targetCustomerId,
           updated_by = COALESCE(:updatedBy, updated_by)
       WHERE customer_id = :sourceCustomerId`,
      {
        targetCustomerId,
        sourceCustomerId,
        updatedBy: req.user?.id || null,
      },
    )
    await recordContact(
      connection,
      sourceCustomerId,
      sourceCustomer.contact_name,
      normalizePhoneNumber(sourceCustomer.contact_phone) || sourceCustomer.contact_phone || null,
    )
    await mergeCustomerContacts(connection, sourceCustomerId, targetCustomerId)

    const aliases = new Set()
    for (const value of [targetCustomer.remark, sourceCustomer.remark]) {
      if (value) aliases.add(value)
    }
    aliases.add(`合并来源：${sourceCustomer.name}${sourceCustomer.code ? `（${sourceCustomer.code}）` : ''}`)

    await connection.execute(
      `UPDATE customers
       SET address = COALESCE(NULLIF(address, ''), :address),
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
  const customerRows = await query('SELECT id, salesperson FROM customers WHERE id = :customerId LIMIT 1', { customerId: req.params.id })
  if (!customerRows[0]) {
    throw notFound('客户不存在')
  }
  assertSalesCanAccessSalesperson(customerRows[0].salesperson, req.user, forbidden)

  const rows = await query(
    `SELECT d.id, d.customer_id, d.name, d.model, d.pn, d.serial_no, d.remark, d.maintenance_type,
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
      pn: row.pn,
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
  remove,
  merge,
  devices,
  nextCustomerCode,
}
