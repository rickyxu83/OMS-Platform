const { query } = require('../../config/db')
const { badRequest, notFound } = require('../../utils/http-error')

function devicePayload(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    name: row.name,
    model: row.model,
    serialNo: row.serial_no,
    location: row.location,
    warrantyUntil: row.warranty_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function list(req, res) {
  const { customerId = null, keyword = '' } = req.query
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.serial_no,
            d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE (:customerId IS NULL OR d.customer_id = :customerId)
       AND (:keyword = '' OR d.name LIKE :likeKeyword OR d.model LIKE :likeKeyword OR d.serial_no LIKE :likeKeyword)
     ORDER BY d.id DESC
     LIMIT 200`,
    {
      customerId: customerId || null,
      keyword,
      likeKeyword: `%${keyword}%`,
    },
  )

  res.json({ items: rows.map(devicePayload) })
}

async function create(req, res) {
  const { customerId, name, model, serialNo, location, warrantyUntil } = req.body || {}
  if (!customerId || !name) {
    throw badRequest('客户和设备名称不能为空')
  }

  const result = await query(
    `INSERT INTO devices (customer_id, name, model, serial_no, location, warranty_until)
     VALUES (:customerId, :name, :model, :serialNo, :location, :warrantyUntil)`,
    {
      customerId,
      name,
      model: model || null,
      serialNo: serialNo || null,
      location: location || null,
      warrantyUntil: warrantyUntil || null,
    },
  )

  res.status(201).json({ id: result.insertId })
}

async function detail(req, res) {
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.serial_no,
            d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id = :id
     LIMIT 1`,
    { id: req.params.id },
  )

  if (!rows[0]) {
    throw notFound('设备不存在')
  }

  res.json({ item: devicePayload(rows[0]) })
}

async function update(req, res) {
  const { customerId, name, model, serialNo, location, warrantyUntil } = req.body || {}
  const existing = await query('SELECT id FROM devices WHERE id = :id LIMIT 1', { id: req.params.id })
  if (!existing[0]) {
    throw notFound('设备不存在')
  }

  await query(
    `UPDATE devices
     SET customer_id = COALESCE(:customerId, customer_id),
         name = COALESCE(:name, name),
         model = :model,
         serial_no = :serialNo,
         location = :location,
         warranty_until = :warrantyUntil
     WHERE id = :id`,
    {
      id: req.params.id,
      customerId: customerId || null,
      name: name || null,
      model: model || null,
      serialNo: serialNo || null,
      location: location || null,
      warrantyUntil: warrantyUntil || null,
    },
  )

  res.status(204).end()
}

module.exports = {
  list,
  create,
  detail,
  update,
}

