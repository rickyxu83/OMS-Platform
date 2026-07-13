const path = require('path')
const multer = require('multer')
const ExcelJS = require('exceljs')
const { query, transaction } = require('../../config/db')
const { badRequest, forbidden, notFound } = require('../../utils/http-error')
const { assertSalesCanAccessSalesperson, buildSalesCustomerScope } = require('../../permissions/sales-scope')
const { normalizePhoneNumber } = require('../../utils/phone')
const { customerNameKey, toSimplified } = require('../../utils/chinese')
const { normalizeAlias } = require('../device-model-catalog/normalize')
const {
  findCatalogMatch,
  normalizeDeviceModelForAsset,
  shouldReportNormalization,
} = require('../device-model-catalog/asset-normalization')

const maintenanceTypes = new Set(['pending_confirmation', 'none', 'original_manufacturer', 'our_maintenance'])
let deviceIdentityColumnsReady = false
let devicePartHistoryColumnsReady = false
let serviceOrderDevicesTableReady = false
let inspectionScheduleDevicesTableReady = false
const modelNormalizationJobs = new Map()
const modelNormalizationJobTtlMs = 60 * 60 * 1000
const modelNormalizationJobMaxCount = 500
const importHeaderAliases = Object.freeze({
  customerId: ['客户id', '客户ID', 'customerid', 'customer_id'],
  customerName: ['客户名称', '客户', 'customername', 'customer_name'],
  name: ['主机名', '设备名称', 'name', 'hostname'],
  model: ['设备型号', '型号', 'model'],
  pn: ['PN', 'pn', 'partnumber', 'part_number'],
  serialNo: ['SN', 'sn', 'S/N', '序列号', '设备序列号', 'serialno', 'serial_no', 'serialnumber'],
  mrNo: ['MR单', 'MR', 'mr', 'mrno', 'mr_no'],
  maintenanceType: ['维保类型', '维护类型', 'maintenancetype', 'maintenance_type'],
  maintenancePartyId: ['维保方ID', '维保方id', 'maintenancepartyid', 'maintenance_party_id'],
  maintenancePartyName: ['维保方名称', '维保方', 'maintenancepartyname', 'maintenance_party_name'],
  maintenanceStart: ['维保开始', '维保开始日期', 'maintenancestart', 'maintenance_start'],
  maintenanceEnd: ['维保截止', '维保结束', '维保截止日期', 'maintenanceend', 'maintenance_end'],
  warrantyUntil: ['质保截止', '质保截止日期', 'warrantyuntil', 'warranty_until'],
  location: ['位置', '安装位置', 'location'],
  remark: ['备注', 'remark'],
})

const importHeaderLookup = Object.freeze(Object.entries(importHeaderAliases).reduce((lookup, [field, aliases]) => {
  aliases.forEach((alias) => { lookup[normalizeHeader(alias)] = field })
  return lookup
}, {}))

const maintenanceTypeImportAliases = Object.freeze({
  '': 'pending_confirmation',
  待确认: 'pending_confirmation',
  待確認: 'pending_confirmation',
  未确认: 'pending_confirmation',
  未確認: 'pending_confirmation',
  pending: 'pending_confirmation',
  pendingconfirmation: 'pending_confirmation',
  pending_confirmation: 'pending_confirmation',
  none: 'none',
  无维保: 'none',
  暂无维保: 'none',
  原厂维保: 'original_manufacturer',
  厂商维保: 'original_manufacturer',
  vendor: 'original_manufacturer',
  originalmanufacturer: 'original_manufacturer',
  original_manufacturer: 'original_manufacturer',
  我方维保: 'our_maintenance',
  自维保: 'our_maintenance',
  our: 'our_maintenance',
  ourmaintenance: 'our_maintenance',
  our_maintenance: 'our_maintenance',
})

function originalNameUtf8(file) {
  return Buffer.from(file?.originalname || '', 'latin1').toString('utf8')
}

function importFileFilter(_req, file, cb) {
  const originalName = originalNameUtf8(file)
  const extension = path.extname(originalName || file.originalname || '').toLowerCase()
  const mimeType = String(file.mimetype || '').toLowerCase()
  const allowedMimeTypes = new Set([
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])
  if (extension !== '.xlsx') {
    cb(badRequest('请上传 .xlsx 格式的导入文件'))
    return
  }
  if (mimeType && !allowedMimeTypes.has(mimeType)) {
    cb(badRequest('导入文件 MIME 类型不支持'))
    return
  }
  cb(null, true)
}

const rawUploadImportMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 4,
  },
  fileFilter: importFileFilter,
}).single('file')

function uploadImportMiddleware(req, res, next) {
  rawUploadImportMiddleware(req, res, (error) => {
    if (!error) {
      next()
      return
    }
    if (error instanceof multer.MulterError) {
      next(badRequest(error.code === 'LIMIT_FILE_SIZE' ? '导入文件不能超过 5MB' : '导入文件不符合上传限制'))
      return
    }
    next(error)
  })
}

function maintenancePartyPayload(row) {
  if (!row.maintenance_party_id) return null
  return {
    id: row.maintenance_party_id,
    name: row.maintenance_party_name,
    phone: normalizePhoneNumber(row.maintenance_party_phone) || row.maintenance_party_phone,
  }
}

function normalizeMaintenanceType(value) {
  const maintenanceType = String(value || 'pending_confirmation').trim() || 'pending_confirmation'
  if (!maintenanceTypes.has(maintenanceType)) {
    throw badRequest('维护类型不合法')
  }
  return maintenanceType
}

function normalizeMaintenancePartyId(value, maintenanceType) {
  const id = Number(value || 0)
  if (!['original_manufacturer', 'our_maintenance'].includes(maintenanceType)) return null
  return id > 0 ? id : null
}

async function ensureMaintenancePartyExists(maintenancePartyId) {
  if (!maintenancePartyId) return
  const rows = await query('SELECT id FROM maintenance_parties WHERE id = :id LIMIT 1', { id: maintenancePartyId })
  if (!rows[0]) {
    throw badRequest('维护方不存在')
  }
}

async function customerSalesperson(customerId) {
  const rows = await query('SELECT id, salesperson FROM customers WHERE id = :id LIMIT 1', { id: customerId })
  if (!rows[0]) {
    throw badRequest('客户不存在')
  }
  return rows[0].salesperson
}

async function assertSalesCanUseCustomer(customerId, user) {
  if (user?.role !== 'sales') return
  const salesperson = await customerSalesperson(customerId)
  assertSalesCanAccessSalesperson(salesperson, user, forbidden)
}

async function assertSalesCanUpdateDevices(deviceIds, user) {
  if (user?.role !== 'sales') return
  const ids = [...new Set(deviceIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (!ids.length) return
  const params = {}
  const placeholders = ids.map((id, index) => {
    const key = `accessDeviceId${index}`
    params[key] = id
    return `:${key}`
  }).join(', ')
  const rows = await query(
    `SELECT d.id, c.salesperson AS customer_salesperson
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id IN (${placeholders})`,
    params,
  )
  for (const row of rows) {
    assertSalesCanAccessSalesperson(row.customer_salesperson, user, forbidden)
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeText(value) {
  const text = String(toSimplified(value) || '').trim()
  return text || null
}

function normalizeHeader(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[*/：:]/g, '').toLowerCase()
}

function cellValueToText(cell) {
  const value = cell?.value
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDateValue(value)
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return String(value.result ?? '').trim()
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim()
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return String(value.text ?? '').trim()
    if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return String(value.text || value.hyperlink || '').trim()
  }
  return String(value).trim()
}

function formatDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeImportDate(cell, fieldLabel) {
  const value = cell?.value
  if (value === null || value === undefined || String(value).trim?.() === '') return null
  if (value instanceof Date) return formatDateValue(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  const text = cellValueToText(cell)
  if (!text) return null
  const matched = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!matched) {
    throw badRequest(`${fieldLabel}格式应为 YYYY-MM-DD`)
  }
  const [, year, month, day] = matched
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${normalized}T00:00:00`)
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(year)
    || date.getMonth() + 1 !== Number(month)
    || date.getDate() !== Number(day)
  ) {
    throw badRequest(`${fieldLabel}不是有效日期`)
  }
  return normalized
}

function normalizeImportMaintenanceType(value) {
  const text = String(value || '').trim()
  const key = text.replace(/\s+/g, '').toLowerCase()
  return normalizeMaintenanceType(maintenanceTypeImportAliases[text] || maintenanceTypeImportAliases[key] || text || 'pending_confirmation')
}

function normalizeImportId(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const id = Number(text)
  return Number.isInteger(id) && id > 0 ? id : null
}

function importRowHasInput(row, headerMap) {
  return Object.values(headerMap).some((column) => cellValueToText(row.getCell(column)))
}

function parseImportHeader(worksheet) {
  const maxHeaderRows = Math.min(10, worksheet.rowCount)
  for (let rowNumber = 1; rowNumber <= maxHeaderRows; rowNumber += 1) {
    const headerMap = {}
    worksheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
      const field = importHeaderLookup[normalizeHeader(cellValueToText(cell))]
      if (field && !headerMap[field]) headerMap[field] = columnNumber
    })
    if (headerMap.model && headerMap.serialNo && (headerMap.customerId || headerMap.customerName)) {
      return { headerMap, headerRowNumber: rowNumber }
    }
  }
  throw badRequest('导入模板缺少必填表头：客户名称、设备型号、SN')
}

function getImportText(row, headerMap, field) {
  const column = headerMap[field]
  return column ? cellValueToText(row.getCell(column)) : ''
}

function parseImportRow(row, headerMap) {
  const maintenanceType = normalizeImportMaintenanceType(getImportText(row, headerMap, 'maintenanceType'))
  return {
    rowNumber: row.number,
    customerId: normalizeImportId(getImportText(row, headerMap, 'customerId')),
    customerName: normalizeText(getImportText(row, headerMap, 'customerName')),
    name: normalizeText(getImportText(row, headerMap, 'name')),
    model: normalizeText(getImportText(row, headerMap, 'model')),
    pn: normalizeText(getImportText(row, headerMap, 'pn')),
    serialNo: normalizeText(getImportText(row, headerMap, 'serialNo')),
    mrNo: normalizeText(getImportText(row, headerMap, 'mrNo')),
    remark: normalizeText(getImportText(row, headerMap, 'remark')),
    maintenanceType,
    maintenancePartyId: normalizeImportId(getImportText(row, headerMap, 'maintenancePartyId')),
    maintenancePartyName: normalizeText(getImportText(row, headerMap, 'maintenancePartyName')),
    maintenanceStart: normalizeImportDate(headerMap.maintenanceStart ? row.getCell(headerMap.maintenanceStart) : null, '维保开始'),
    maintenanceEnd: normalizeImportDate(headerMap.maintenanceEnd ? row.getCell(headerMap.maintenanceEnd) : null, '维保截止'),
    warrantyUntil: normalizeImportDate(headerMap.warrantyUntil ? row.getCell(headerMap.warrantyUntil) : null, '质保截止'),
    location: normalizeText(getImportText(row, headerMap, 'location')),
  }
}

async function findImportCustomer(row, user) {
  let customer = null
  if (row.customerId) {
    const rows = await query('SELECT id, name, salesperson FROM customers WHERE id = :id LIMIT 1', { id: row.customerId })
    customer = rows[0] || null
  } else if (row.customerName) {
    const rows = await query('SELECT id, name, salesperson FROM customers WHERE name = :name LIMIT 2', { name: row.customerName })
    if (rows.length > 1) throw badRequest('客户名称匹配到多条记录，请改用客户ID')
    customer = rows[0] || null
  }
  if (!customer) throw badRequest('客户不存在，请先维护客户资料')
  assertSalesCanAccessSalesperson(customer.salesperson, user, forbidden)
  return customer
}

function importCustomerLooseKey(value) {
  let key = customerNameKey(value)
  const suffixes = [
    '有限责任公司',
    '股份有限公司',
    '集团有限公司',
    '集团股份有限公司',
    '有限公司',
    '集团公司',
    '分公司',
    '集团',
    '公司',
  ]
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of suffixes) {
      if (key.length > suffix.length + 1 && key.endsWith(suffix)) {
        key = key.slice(0, -suffix.length)
        changed = true
        break
      }
    }
  }
  return key
}

function importCustomerCorrectionPayload(row, customer, matchType) {
  return {
    rowNumber: row.rowNumber,
    sn: row.serialNo || '',
    inputCustomerName: row.customerName || '',
    customerId: customer.id,
    customerName: customer.name,
    matchType,
  }
}

async function resolveImportCustomerCorrection(row, user) {
  if (row.customerId || !row.customerName) return null

  const salesScope = buildSalesCustomerScope(user, 'c', 'importCustomerScope')
  const exactRows = await query(
    `SELECT c.id, c.name, c.name_key, c.salesperson
     FROM customers c
     WHERE c.name = :name
       ${salesScope.sql}
     LIMIT 2`,
    { name: row.customerName, ...salesScope.params },
  )
  if (exactRows.length > 1) throw badRequest('客户名称匹配到多条记录，请改用客户ID')
  if (exactRows[0]) return null

  const key = customerNameKey(row.customerName)
  if (key) {
    const keyRows = await query(
      `SELECT c.id, c.name, c.name_key, c.salesperson
       FROM customers c
       WHERE c.name_key = :nameKey
         ${salesScope.sql}
       LIMIT 2`,
      { nameKey: key, ...salesScope.params },
    )
    if (keyRows.length > 1) throw badRequest('客户名称匹配到多条记录，请改用客户ID')
    if (keyRows[0] && keyRows[0].name !== row.customerName) {
      return importCustomerCorrectionPayload(row, keyRows[0], '名称规范化')
    }
  }

  const looseKey = importCustomerLooseKey(row.customerName)
  if (looseKey.length < 2) return null

  const candidates = await query(
    `SELECT c.id, c.name, c.name_key, c.salesperson
     FROM customers c
     WHERE c.name_key LIKE :likeKey
       ${salesScope.sql}
     ORDER BY CHAR_LENGTH(c.name_key) ASC, c.name ASC
     LIMIT 20`,
    { likeKey: `%${looseKey}%`, ...salesScope.params },
  )
  const matches = candidates.filter((candidate) => {
    const candidateKey = customerNameKey(candidate.name)
    const candidateLooseKey = importCustomerLooseKey(candidate.name)
    return candidateLooseKey === looseKey
      || (looseKey.length >= 4 && candidateKey.includes(looseKey))
  })
  const uniqueById = new Map(matches.map((candidate) => [String(candidate.id), candidate]))
  const uniqueMatches = [...uniqueById.values()]
  if (uniqueMatches.length === 1 && uniqueMatches[0].name !== row.customerName) {
    return importCustomerCorrectionPayload(row, uniqueMatches[0], '客户名简称匹配')
  }
  return null
}

async function findImportMaintenanceParty(row) {
  if (!['original_manufacturer', 'our_maintenance'].includes(row.maintenanceType)) return null
  let party = null
  if (row.maintenancePartyId) {
    const rows = await query(
      'SELECT id, name, party_type FROM maintenance_parties WHERE id = :id LIMIT 1',
      { id: row.maintenancePartyId },
    )
    party = rows[0] || null
    if (party && party.party_type !== row.maintenanceType) {
      throw badRequest('维保方类型与维保类型不一致')
    }
  } else if (row.maintenancePartyName) {
    const rows = await query(
      `SELECT id, name, party_type
       FROM maintenance_parties
       WHERE name = :name AND party_type = :partyType
       LIMIT 2`,
      { name: row.maintenancePartyName, partyType: row.maintenanceType },
    )
    if (rows.length > 1) throw badRequest('维保方名称匹配到多条记录，请改用维保方ID')
    party = rows[0] || null
  }
  if (!party && (row.maintenancePartyId || row.maintenancePartyName)) {
    throw badRequest('维保方不存在，请先维护维保方资料')
  }
  return party
}

function importRowError(row, message) {
  return {
    rowNumber: row.rowNumber,
    sn: row.serialNo || '',
    message,
  }
}

function isDuplicateEntryError(error) {
  return error?.code === 'ER_DUP_ENTRY' || /duplicate/i.test(String(error?.message || ''))
}

function shouldConfirmModelCorrections(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase())
}

async function resolveImportModel(rawModel) {
  const model = String(rawModel || '').trim()
  if (!model) return null
  const normalizedModel = normalizeAlias(model)
  const rows = await query(
    `SELECT matched.id,
            matched.canonical_model,
            matched.part_number,
            matched.brand,
            matched.category,
            matched.match_type,
            matched.match_rank
     FROM (
       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category,
              '标准型号' AS match_type, 10 AS match_rank
       FROM device_model_catalog c
       WHERE c.is_active = 1
         AND LOWER(c.canonical_model) = LOWER(:model)

       UNION ALL

       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category,
              'PN' AS match_type, 9 AS match_rank
       FROM device_model_catalog c
       WHERE c.is_active = 1
         AND LOWER(COALESCE(c.part_number, '')) = LOWER(:model)

       UNION ALL

       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category,
              '别名' AS match_type, 8 AS match_rank
       FROM device_model_aliases a
       JOIN device_model_catalog c ON c.id = a.catalog_id
       WHERE c.is_active = 1
         AND a.normalized_alias = :normalizedModel
     ) AS matched
     ORDER BY matched.match_rank DESC, matched.canonical_model ASC`,
    { model, normalizedModel },
  )

  const bestById = new Map()
  for (const row of rows) {
    const existing = bestById.get(row.id)
    if (!existing || Number(row.match_rank) > Number(existing.match_rank)) {
      bestById.set(row.id, row)
    }
  }
  const matches = [...bestById.values()]
  if (!matches.length) {
    const normalizationResult = await normalizeDeviceModelForAsset(model)
    const item = normalizationResult?.catalogItem || normalizationResult?.normalization
    if (!item || normalizationResult?.normalization?.action === 'not_found') return null
    return {
      id: item.id || null,
      canonical_model: item.canonical_model || item.canonicalModel || normalizationResult.model,
      part_number: item.part_number || item.partNumber || '',
      brand: item.brand || '',
      category: item.category || '',
      match_type: normalizationResult.normalization?.matchType || '在线匹配',
      match_rank: 1,
      confidence: normalizationResult.normalization?.confidence,
      reason: normalizationResult.normalization?.reason || '',
      needs_confirmation: normalizationResult.normalization?.needsConfirmation ? 1 : 0,
    }
  }
  const canonicalKeys = new Set(matches.map((row) => String(row.canonical_model || '').trim().toLowerCase()).filter(Boolean))
  if (canonicalKeys.size > 1) {
    throw badRequest('设备型号匹配到多个标准型号，请使用更准确的型号')
  }
  return matches[0]
}

function buildModelNormalizationMessage(normalization) {
  if (!normalization || !shouldReportNormalization(normalization)) return ''
  if (normalization.message) return normalization.message
  if (normalization.action === 'corrected') return `已按型号库标准纠正为 ${normalization.canonicalModel}`
  if (normalization.action === 'created_corrected') return `型号库未命中，已规范为 ${normalization.canonicalModel} 并加入型号库`
  if (normalization.action === 'suggested_correction') return `AI 建议可能是 ${normalization.canonicalModel}，需人工确认后应用`
  if (normalization.action === 'created') return '型号库未命中，已加入型号库'
  return '型号库未命中，已按原型号保存'
}

function localCatalogNormalization(inputModel, catalogMatch) {
  const finalModel = normalizeText(catalogMatch?.canonical_model) || inputModel
  const action = finalModel === inputModel ? 'matched' : 'corrected'
  return {
    model: finalModel,
    catalogItem: catalogMatch,
    normalization: {
      action,
      inputModel,
      canonicalModel: finalModel,
      corrected: finalModel !== inputModel,
      source: 'catalog',
      matchType: catalogMatch?.match_type || '',
      brand: catalogMatch?.brand || '',
      category: catalogMatch?.category || '',
      partNumber: normalizeText(catalogMatch?.part_number) || '',
      message: action === 'corrected' ? `已按型号库标准纠正为 ${finalModel}` : '',
    },
  }
}

function cleanupModelNormalizationJobs() {
  const now = Date.now()
  for (const [id, job] of modelNormalizationJobs.entries()) {
    if (now - Number(job.createdAtMs || 0) > modelNormalizationJobTtlMs) {
      modelNormalizationJobs.delete(id)
    }
  }

  const overflow = modelNormalizationJobs.size - modelNormalizationJobMaxCount
  if (overflow <= 0) return
  const oldest = [...modelNormalizationJobs.values()]
    .sort((left, right) => Number(left.createdAtMs || 0) - Number(right.createdAtMs || 0))
    .slice(0, overflow)
  oldest.forEach((job) => modelNormalizationJobs.delete(job.id))
}

function modelNormalizationJobPayload(job) {
  return {
    id: job.id,
    status: job.status,
    deviceId: job.deviceId,
    inputModel: job.inputModel,
    canonicalModel: job.canonicalModel || '',
    updated: Boolean(job.updated),
    modelNormalization: job.modelNormalization || null,
    message: job.message || '',
    error: job.error || '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

function buildModelNormalizationJobMessage(normalization, updated) {
  const baseMessage = buildModelNormalizationMessage(normalization)
  if (normalization?.needsConfirmation) {
    return baseMessage || `后台搜索建议可能是 ${normalization.canonicalModel}，需人工确认后应用`
  }
  if (canApplyModelNormalization(normalization) && !updated) {
    return `${baseMessage || `已找到标准型号 ${normalization.canonicalModel}`}，设备型号已变化，未自动覆盖`
  }
  if (baseMessage) return baseMessage
  return '型号后台搜索完成'
}

async function runModelNormalizationJob(jobId) {
  const job = modelNormalizationJobs.get(jobId)
  if (!job) return

  try {
    const result = await normalizeDeviceModelForAsset(job.inputModel, { requireConfirmation: true })
    const normalization = result.normalization || {}
    const updated = false

    Object.assign(job, {
      status: 'completed',
      canonicalModel: normalization.canonicalModel || result.model || job.inputModel,
      updated,
      modelNormalization: normalization,
      message: buildModelNormalizationJobMessage(normalization, updated),
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Device model normalization background job failed', {
      jobId,
      deviceId: job.deviceId,
      inputModel: job.inputModel,
      error,
    })
    Object.assign(job, {
      status: 'failed',
      updated: false,
      message: '型号后台搜索失败，请稍后在型号校正中处理',
      error: error?.message || '型号后台搜索失败',
      updatedAt: new Date().toISOString(),
    })
  }
}

function startModelNormalizationJob(deviceId, inputModel) {
  cleanupModelNormalizationJobs()
  const now = new Date()
  const job = {
    id: `dmn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    status: 'pending',
    deviceId,
    inputModel,
    canonicalModel: '',
    updated: false,
    modelNormalization: null,
    message: '设备已保存，正在后台搜索型号，结果需确认后应用',
    error: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdAtMs: now.getTime(),
  }
  modelNormalizationJobs.set(job.id, job)
  setTimeout(() => {
    runModelNormalizationJob(job.id)
  }, 0)
  return modelNormalizationJobPayload(job)
}

function normalizeDeviceIds(value, maxCount = 200) {
  const rawIds = Array.isArray(value) ? value : []
  const ids = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length > maxCount) {
    throw badRequest(`一次最多比对 ${maxCount} 台设备`)
  }
  return ids
}

function canApplyModelNormalization(normalization) {
  return Boolean(['corrected', 'created_corrected', 'suggested_correction'].includes(normalization?.action)
    && normalizeText(normalization?.canonicalModel)
    && normalizeText(normalization?.canonicalModel) !== normalizeText(normalization?.inputModel))
}

function modelNormalizationIssuePayload(device, normalization, applied = false) {
  return {
    id: device.id,
    customerId: device.customer_id,
    customerName: device.customer_name,
    name: device.name,
    serialNo: device.serial_no,
    inputModel: normalization.inputModel || device.model,
    canonicalModel: normalization.canonicalModel || device.model,
    action: normalization.action || '',
    source: normalization.source || '',
    matchType: normalization.matchType || '',
    brand: normalization.brand || '',
    category: normalization.category || '',
    partNumber: normalization.partNumber || '',
    confidence: normalization.confidence,
    reason: normalization.reason || '',
    needsConfirmation: Boolean(normalization.needsConfirmation),
    message: buildModelNormalizationMessage(normalization),
    canApply: canApplyModelNormalization(normalization),
    applied,
  }
}

function summarizeModelNormalization(scanned, items) {
  return {
    scanned,
    matched: Math.max(0, scanned - items.length),
    issueCount: items.length,
    correctableCount: items.filter((item) => item.canApply).length,
    unresolvedCount: items.filter((item) => item.action === 'not_found').length,
    catalogCreatedCount: items.filter((item) => ['created', 'created_corrected'].includes(item.action)).length,
  }
}

async function loadDevicesForModelNormalization(req, ids) {
  await ensureDeviceIdentityColumns()
  const salesScope = buildSalesCustomerScope(req.user, 'c')
  if (ids.length) {
    const params = { ...salesScope.params }
    const placeholders = ids.map((id, index) => {
      const key = `deviceId${index}`
      params[key] = id
      return `:${key}`
    }).join(', ')
    return query(
      `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.serial_no
       FROM devices d
       JOIN customers c ON c.id = d.customer_id
       WHERE d.id IN (${placeholders})
         ${salesScope.sql}
       ORDER BY d.id DESC`,
      params,
    )
  }

  const { customerId = null } = req.body || {}
  const keyword = String(req.body?.keyword ?? req.body?.q ?? '').trim()
  return query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.serial_no
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE (:customerId IS NULL OR d.customer_id = :customerId)
       ${salesScope.sql}
       AND (
         :keyword = ''
         OR d.name LIKE :likeKeyword
         OR d.model LIKE :likeKeyword
         OR d.serial_no LIKE :likeKeyword
         OR c.name LIKE :likeKeyword
       )
     ORDER BY d.id DESC
     LIMIT 200`,
    {
      customerId: customerId || null,
      keyword,
      likeKeyword: `%${keyword}%`,
      ...salesScope.params,
    },
  )
}

async function buildExistingModelNormalizationPreview(devices) {
  const cache = new Map()
  const items = []

  for (const device of devices) {
    const model = normalizeText(device.model)
    if (!model) continue
    const cacheKey = model.toLowerCase()
    let result = cache.get(cacheKey)
    if (!result) {
      result = await normalizeDeviceModelForAsset(model)
      cache.set(cacheKey, result)
    }
    const normalization = result.normalization
    if (!shouldReportNormalization(normalization)) continue
    items.push(modelNormalizationIssuePayload(device, normalization))
  }

  return {
    ...summarizeModelNormalization(devices.length, items),
    items,
  }
}

async function ensureDeviceIdentityColumns() {
  if (deviceIdentityColumnsReady) return

  const rows = await query(
    `SELECT column_name, is_nullable, column_type
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'devices'
       AND column_name IN ('name', 'mr_no', 'maintenance_type')`,
  )
  const nameColumn = rows.find((row) => String(row.column_name).toLowerCase() === 'name')
  if (nameColumn && String(nameColumn.is_nullable || '').toUpperCase() !== 'YES') {
    await query('ALTER TABLE devices MODIFY COLUMN name VARCHAR(128) NULL')
  }
  const mrNoColumn = rows.find((row) => String(row.column_name).toLowerCase() === 'mr_no')
  if (!mrNoColumn) {
    await query('ALTER TABLE devices ADD COLUMN mr_no VARCHAR(128) NULL AFTER serial_no')
  }
  const maintenanceTypeColumn = rows.find((row) => String(row.column_name).toLowerCase() === 'maintenance_type')
  if (maintenanceTypeColumn && !String(maintenanceTypeColumn.column_type || '').includes('pending_confirmation')) {
    await query("ALTER TABLE devices MODIFY COLUMN maintenance_type ENUM('pending_confirmation', 'none', 'original_manufacturer', 'our_maintenance') NOT NULL DEFAULT 'pending_confirmation'")
    await query("UPDATE devices SET maintenance_type = 'pending_confirmation' WHERE maintenance_type = 'none'")
  }

  deviceIdentityColumnsReady = true
}

async function ensureDevicePartHistoryColumns() {
  if (devicePartHistoryColumnsReady) return
  await query(
    `CREATE TABLE IF NOT EXISTS service_parts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      service_order_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NULL,
      action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general',
      part_name VARCHAR(128) NOT NULL,
      part_no VARCHAR(128) NULL,
      quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
      unit VARCHAR(32) NULL,
      remark VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_service_parts_order_id (service_order_id),
      KEY idx_service_parts_device_id (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  const rows = await query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_parts'
       AND column_name IN ('device_id', 'action_type')`,
  )
  const columns = new Set(rows.map((row) => row.columnName || row.column_name))
  if (!columns.has('device_id')) {
    await query('ALTER TABLE service_parts ADD COLUMN device_id BIGINT UNSIGNED NULL AFTER service_order_id')
  }
  if (!columns.has('action_type')) {
    await query(
      "ALTER TABLE service_parts ADD COLUMN action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general' AFTER device_id",
    )
  }
  const indexRows = await query(
    `SELECT index_name AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_parts'
       AND index_name = 'idx_service_parts_device_id'`,
  )
  if (!indexRows.length) {
    await query('ALTER TABLE service_parts ADD KEY idx_service_parts_device_id (device_id)')
  }
  devicePartHistoryColumnsReady = true
}

async function ensureServiceOrderDevicesTable() {
  if (serviceOrderDevicesTableReady) return
  await query(
    `CREATE TABLE IF NOT EXISTS service_order_devices (
      service_order_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (service_order_id, device_id),
      KEY idx_service_order_devices_device_id (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await query(
    `INSERT IGNORE INTO service_order_devices (service_order_id, device_id)
     SELECT id, device_id
     FROM service_orders
     WHERE device_id IS NOT NULL`,
  )
  serviceOrderDevicesTableReady = true
}

async function ensureInspectionScheduleDevicesTable(executeQuery = query) {
  if (executeQuery === query && inspectionScheduleDevicesTableReady) return
  await executeQuery(
    `CREATE TABLE IF NOT EXISTS inspection_schedule_devices (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      schedule_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_schedule_device (schedule_id, device_id),
      KEY idx_schedule_devices_device (device_id),
      CONSTRAINT fk_device_delete_schedule_devices_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
      CONSTRAINT fk_device_delete_schedule_devices_device FOREIGN KEY (device_id) REFERENCES devices (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await executeQuery(
    `INSERT IGNORE INTO inspection_schedule_devices (schedule_id, device_id)
     SELECT s.id, s.device_id FROM inspection_schedules s
     WHERE s.device_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM inspection_schedule_devices d
         WHERE d.schedule_id = s.id AND d.device_id = s.device_id
       )`,
  )
  await executeQuery(
    `CREATE TABLE IF NOT EXISTS inspection_schedule_assignments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      schedule_id BIGINT UNSIGNED NOT NULL,
      engineer_id BIGINT UNSIGNED NOT NULL,
      device_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_inspection_assignment_device (schedule_id, device_id),
      KEY idx_inspection_assignments_engineer (engineer_id),
      KEY idx_inspection_assignments_device (device_id),
      CONSTRAINT fk_inspection_assignments_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
      CONSTRAINT fk_inspection_assignments_engineer FOREIGN KEY (engineer_id) REFERENCES users (id),
      CONSTRAINT fk_inspection_assignments_device FOREIGN KEY (device_id) REFERENCES devices (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
  await executeQuery(
    `INSERT IGNORE INTO inspection_schedule_assignments (schedule_id, engineer_id, device_id)
     SELECT sd.schedule_id, s.target_engineer_id, sd.device_id
     FROM inspection_schedule_devices sd
     JOIN inspection_schedules s ON s.id = sd.schedule_id
     WHERE s.target_engineer_id IS NOT NULL`,
  )
  if (executeQuery === query) inspectionScheduleDevicesTableReady = true
}

function devicePayload(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    name: row.name,
    model: row.model,
    pn: row.pn,
    serialNo: row.serial_no,
    mrNo: row.mr_no,
    remark: row.remark,
    maintenanceType: row.maintenance_type,
    maintenancePartyId: row.maintenance_party_id,
    maintenancePartyName: row.maintenance_party_name,
    maintenancePartyPhone: normalizePhoneNumber(row.maintenance_party_phone) || row.maintenance_party_phone,
    maintenanceParty: maintenancePartyPayload(row),
    maintenanceStart: row.maintenance_start,
    maintenanceEnd: row.maintenance_end,
    installationSourceServiceOrderId: row.installation_source_service_order_id,
    location: row.location,
    warrantyUntil: row.warranty_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isForceDeleteRequest(req) {
  return ['1', 'true', 'yes', 'on'].includes(String(req.query.force || req.body?.force || '').toLowerCase())
}

function relationOrderPayload(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    customerName: row.customer_name,
  }
}

function relationSchedulePayload(row) {
  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    cadence: row.cadence,
    active: Boolean(row.active),
  }
}

function relationPartPayload(row) {
  return {
    id: row.id,
    orderId: row.service_order_id,
    orderNo: row.order_no,
    actionType: row.action_type,
    partName: row.part_name,
    partNo: row.part_no,
  }
}

function relationLabel(items, formatter, limit = 5) {
  if (!items.length) return ''
  const labels = items.slice(0, limit).map(formatter).filter(Boolean)
  const suffix = items.length > limit ? ` 等 ${items.length} 项` : ''
  return `${labels.join('、')}${suffix}`
}

function deviceDeleteBlockedMessage(summary) {
  const parts = []
  if (summary.relations.mainServiceOrders.length) {
    parts.push(`主设备工单：${relationLabel(summary.relations.mainServiceOrders, (item) => item.orderNo || `#${item.id}`)}`)
  }
  if (summary.relations.targetServiceOrders.length) {
    parts.push(`目标设备工单：${relationLabel(summary.relations.targetServiceOrders, (item) => item.orderNo || `#${item.id}`)}`)
  }
  if (summary.relations.serviceParts.length) {
    parts.push(`部件记录：${relationLabel(summary.relations.serviceParts, (item) => `${item.orderNo || `工单 #${item.orderId}`} ${item.partName || item.partNo || `部件 #${item.id}`}`)}`)
  }
  if (summary.relations.inspectionSchedules.length) {
    parts.push(`巡检计划：${relationLabel(summary.relations.inspectionSchedules, (item) => item.name || `计划 #${item.id}`)}`)
  }
  if (!parts.length) return ''
  const device = summary.device
  const deviceName = [device.model, device.serialNo].filter(Boolean).join(' / ') || device.name || `设备 #${device.id}`
  const customerText = device.customerName ? `，所属客户：${device.customerName}` : ''
  return `设备「${deviceName}」仍有关联数据${customerText}。${parts.join('；')}。`
}

async function loadDeviceDeleteSummary(deviceId, executeQuery = query) {
  await ensureDevicePartHistoryColumns()
  await ensureServiceOrderDevicesTable()
  await ensureInspectionScheduleDevicesTable(executeQuery)
  const deviceRows = await executeQuery(
    `SELECT d.id, d.name, d.model, d.serial_no, d.customer_id, c.name AS customer_name, c.salesperson AS customer_salesperson
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id = :deviceId
     LIMIT 1`,
    { deviceId },
  )
  const mainOrders = await executeQuery(
    `SELECT so.id, so.order_no, so.status, c.name AS customer_name
     FROM service_orders so
     JOIN customers c ON c.id = so.customer_id
     WHERE so.device_id = :deviceId
     ORDER BY so.id DESC
     LIMIT 20`,
    { deviceId },
  )
  const targetOrders = await executeQuery(
    `SELECT so.id, so.order_no, so.status, c.name AS customer_name
     FROM service_order_devices sod
     JOIN service_orders so ON so.id = sod.service_order_id
     JOIN customers c ON c.id = so.customer_id
     WHERE sod.device_id = :deviceId
     ORDER BY so.id DESC
     LIMIT 20`,
    { deviceId },
  )
  const schedules = await executeQuery(
    `SELECT s.id, s.name, s.cadence, s.active, c.name AS customer_name
     FROM inspection_schedules s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.device_id = :deviceId
        OR EXISTS (
          SELECT 1 FROM inspection_schedule_devices sd
          WHERE sd.schedule_id = s.id AND sd.device_id = :deviceId
        )
     ORDER BY s.active DESC, s.id DESC
     LIMIT 20`,
    { deviceId },
  )
  const serviceParts = await executeQuery(
    `SELECT sp.id, sp.service_order_id, sp.action_type, sp.part_name, sp.part_no, so.order_no
     FROM service_parts sp
     JOIN service_orders so ON so.id = sp.service_order_id
     WHERE sp.device_id = :deviceId
     ORDER BY sp.id DESC
     LIMIT 20`,
    { deviceId },
  )
  const device = deviceRows[0]
  if (!device) return null
  const summary = {
    device: {
      id: device.id,
      name: device.name,
      model: device.model,
      serialNo: device.serial_no,
      customerId: device.customer_id,
      customerName: device.customer_name,
      customerSalesperson: device.customer_salesperson,
    },
    relations: {
      mainServiceOrders: mainOrders.map(relationOrderPayload),
      targetServiceOrders: targetOrders.map(relationOrderPayload),
      inspectionSchedules: schedules.map(relationSchedulePayload),
      serviceParts: serviceParts.map(relationPartPayload),
    },
  }
  summary.counts = {
    mainServiceOrders: summary.relations.mainServiceOrders.length,
    targetServiceOrders: summary.relations.targetServiceOrders.length,
    inspectionSchedules: summary.relations.inspectionSchedules.length,
    serviceParts: summary.relations.serviceParts.length,
  }
  summary.blocked = Object.values(summary.counts).some((count) => count > 0)
  summary.message = deviceDeleteBlockedMessage(summary)
  return summary
}

async function loadRelatedServiceOrders(deviceId) {
  await ensureDevicePartHistoryColumns()
  await ensureServiceOrderDevicesTable()
  const rows = await query(
    `SELECT related.*
     FROM (
       SELECT so.id, so.order_no, so.status, so.service_mode, so.service_type, so.issue_description,
              so.submitted_at, so.created_at, u.real_name AS engineer_name, u.username AS engineer_username,
              'service_order_device' AS relation_type
       FROM service_orders so
       LEFT JOIN users u ON u.id = so.assigned_engineer_id
       WHERE so.device_id = :deviceId

       UNION

       SELECT so.id, so.order_no, so.status, so.service_mode, so.service_type, so.issue_description,
              so.submitted_at, so.created_at, u.real_name AS engineer_name, u.username AS engineer_username,
              'service_order_target_device' AS relation_type
       FROM service_order_devices sod
       JOIN service_orders so ON so.id = sod.service_order_id
       LEFT JOIN users u ON u.id = so.assigned_engineer_id
       WHERE sod.device_id = :deviceId

       UNION

       SELECT so.id, so.order_no, so.status, so.service_mode, so.service_type, so.issue_description,
              so.submitted_at, so.created_at, u.real_name AS engineer_name, u.username AS engineer_username,
              'installation_source' AS relation_type
       FROM devices d
       JOIN service_orders so ON so.id = d.installation_source_service_order_id
       LEFT JOIN users u ON u.id = so.assigned_engineer_id
       WHERE d.id = :deviceId

       UNION

       SELECT so.id, so.order_no, so.status, so.service_mode, so.service_type, so.issue_description,
              so.submitted_at, so.created_at, u.real_name AS engineer_name, u.username AS engineer_username,
              CONCAT('service_part:', COALESCE(sp.action_type, 'general')) AS relation_type
       FROM service_parts sp
       JOIN service_orders so ON so.id = sp.service_order_id
       LEFT JOIN users u ON u.id = so.assigned_engineer_id
       WHERE sp.device_id = :deviceId
     ) related
     ORDER BY COALESCE(related.submitted_at, related.created_at) DESC, related.id DESC
     LIMIT 100`,
    { deviceId },
  )
  const items = []
  const byId = new Map()
  for (const row of rows) {
    const key = String(row.id)
    const relationType = String(row.relation_type || '').trim()
    const existing = byId.get(key)
    if (existing) {
      const relationTypes = new Set(String(existing.relationType || '').split(',').filter(Boolean))
      if (relationType) relationTypes.add(relationType)
      existing.relationType = [...relationTypes].join(',')
      continue
    }
    const item = {
      id: row.id,
      orderNo: row.order_no,
      status: row.status,
      serviceMode: row.service_mode,
      serviceType: row.service_type,
      relationType,
      issueDescription: row.issue_description,
      engineerName: row.engineer_name || row.engineer_username,
      serviceAt: row.submitted_at || row.created_at,
      createdAt: row.created_at,
    }
    byId.set(key, item)
    items.push(item)
  }
  return items
}

async function duplicateSerialNoMessage(deviceId, serialNo) {
  const rows = await query(
    `SELECT d.id, d.model, d.serial_no, c.name AS customer_name
     FROM devices d
     LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.id = :deviceId
     LIMIT 1`,
    { deviceId },
  )
  const device = rows[0]
  if (!device) return 'SN 已存在'
  const relatedOrders = await loadRelatedServiceOrders(deviceId)
  const orderText = relatedOrders
    .slice(0, 5)
    .map((order) => order.orderNo || `#${order.id}`)
    .join('、')
  const deviceText = `设备 #${device.id}${device.customer_name ? `（${device.customer_name}）` : ''}`
  return orderText
    ? `SN ${serialNo} 已存在，当前属于${deviceText}，关联工单：${orderText}`
    : `SN ${serialNo} 已存在，当前属于${deviceText}`
}

async function list(req, res) {
  await ensureDeviceIdentityColumns()
  const { customerId = null } = req.query
  const keyword = String(req.query.keyword ?? req.query.q ?? '').trim()
  const salesScope = buildSalesCustomerScope(req.user, 'c')
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, d.name, d.model, d.pn, d.serial_no, d.mr_no,
            d.remark, d.maintenance_type, d.maintenance_party_id, mp.name AS maintenance_party_name,
            mp.phone AS maintenance_party_phone, d.maintenance_start, d.maintenance_end,
            d.installation_source_service_order_id, d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id
     WHERE (:customerId IS NULL OR d.customer_id = :customerId)
       ${salesScope.sql}
       AND (
         :keyword = ''
         OR d.name LIKE :likeKeyword
         OR d.model LIKE :likeKeyword
         OR d.pn LIKE :likeKeyword
         OR d.serial_no LIKE :likeKeyword
         OR d.mr_no LIKE :likeKeyword
         OR c.name LIKE :likeKeyword
         OR mp.name LIKE :likeKeyword
         OR d.location LIKE :likeKeyword
         OR d.remark LIKE :likeKeyword
       )
     ORDER BY d.id DESC
     LIMIT 200`,
    {
      customerId: customerId || null,
      keyword,
      likeKeyword: `%${keyword}%`,
      ...salesScope.params,
    },
  )

  res.json({ items: rows.map(devicePayload) })
}

async function create(req, res) {
  await ensureDeviceIdentityColumns()
  const {
    customerId,
    name,
    model,
    pn,
    serialNo,
    mrNo,
    remark,
    maintenanceType,
    maintenancePartyId,
    maintenanceStart,
    maintenanceEnd,
    location,
    warrantyUntil,
  } = req.body || {}
  const normalizedModel = normalizeText(model)
  const normalizedSerialNo = normalizeText(serialNo)
  if (!customerId || !normalizedModel || !normalizedSerialNo) {
    throw badRequest('客户、设备型号和 S/N 序列号不能为空')
  }
  await assertSalesCanUseCustomer(customerId, req.user)
  const normalizedName = normalizeText(name)
  const normalizedMaintenanceType = normalizeMaintenanceType(maintenanceType)
  const normalizedMaintenancePartyId = normalizeMaintenancePartyId(maintenancePartyId, normalizedMaintenanceType)
  await ensureMaintenancePartyExists(normalizedMaintenancePartyId)
  const existingDevice = await query('SELECT id FROM devices WHERE serial_no = :serialNo LIMIT 1', { serialNo: normalizedSerialNo })
  if (existingDevice[0]) {
    throw badRequest(await duplicateSerialNoMessage(existingDevice[0].id, normalizedSerialNo))
  }
  const catalogMatch = await findCatalogMatch(normalizedModel)
  const modelNormalizationResult = catalogMatch
    ? localCatalogNormalization(normalizedModel, catalogMatch)
    : { model: normalizedModel, normalization: null }
  const effectiveModel = modelNormalizationResult.model

  const result = await query(
    `INSERT INTO devices (
       customer_id, name, model, pn, serial_no, remark, maintenance_type, maintenance_party_id,
       mr_no, maintenance_start, maintenance_end, location, warranty_until
     )
     VALUES (
       :customerId, :name, :model, :pn, :serialNo, :remark, :maintenanceType, :maintenancePartyId,
       :mrNo, :maintenanceStart, :maintenanceEnd, :location, :warrantyUntil
     )`,
    {
      customerId,
      name: normalizedName,
      model: effectiveModel,
      pn: normalizeText(pn),
      serialNo: normalizedSerialNo,
      mrNo: normalizeText(mrNo),
      remark: remark || null,
      maintenanceType: normalizedMaintenanceType,
      maintenancePartyId: normalizedMaintenancePartyId,
      maintenanceStart: normalizeDate(maintenanceStart),
      maintenanceEnd: normalizeDate(maintenanceEnd),
      location: location || null,
      warrantyUntil: warrantyUntil || null,
    },
  )

  const payload = {
    id: result.insertId,
    modelNormalization: modelNormalizationResult.normalization,
    message: buildModelNormalizationMessage(modelNormalizationResult.normalization),
  }
  if (!catalogMatch) {
    payload.modelNormalizationJob = startModelNormalizationJob(result.insertId, normalizedModel)
  }

  res.status(201).json(payload)
}

async function importDevices(req, res) {
  await ensureDeviceIdentityColumns()
  if (!req.file?.buffer?.length) {
    throw badRequest('导入文件不能为空')
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(req.file.buffer)
  } catch {
    throw badRequest('导入文件无法解析，请确认是有效的 .xlsx 文件')
  }
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw badRequest('导入文件没有工作表')
  }
  const { headerMap, headerRowNumber } = parseImportHeader(worksheet)
  if (worksheet.rowCount - headerRowNumber > 1000) {
    throw badRequest('一次最多导入 1000 行设备')
  }
  const rows = []
  const errors = []
  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    if (!importRowHasInput(row, headerMap)) continue
    try {
      const item = parseImportRow(row, headerMap)
      if (!item.model) throw badRequest('设备型号不能为空')
      if (!item.serialNo) throw badRequest('SN 不能为空')
      if (!item.customerId && !item.customerName) throw badRequest('客户ID或客户名称不能为空')
      rows.push(item)
    } catch (error) {
      errors.push({ rowNumber, sn: getImportText(row, headerMap, 'serialNo'), message: error.message || '行数据不合法' })
    }
  }

  if (!rows.length && !errors.length) {
    throw badRequest('导入文件没有可导入的数据行')
  }

  const snCounts = rows.reduce((counts, row) => {
    const key = row.serialNo.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map())
  const duplicateSnKeys = new Set([...snCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key))
  const confirmModelCorrections = shouldConfirmModelCorrections(req.body?.confirmModelCorrections)
  const skipModelCorrections = shouldConfirmModelCorrections(req.body?.skipModelCorrections)
  const confirmImportCorrections = shouldConfirmModelCorrections(req.body?.confirmImportCorrections) || confirmModelCorrections
  const skipImportCorrections = shouldConfirmModelCorrections(req.body?.skipImportCorrections) || skipModelCorrections
  const customerCorrections = []
  const modelCorrections = []
  const importModelMatchCache = new Map()

  for (const row of rows) {
    try {
      const customerCorrection = await resolveImportCustomerCorrection(row, req.user)
      if (customerCorrection) {
        row.correctedCustomerId = customerCorrection.customerId
        row.correctedCustomerName = customerCorrection.customerName
        customerCorrections.push(customerCorrection)
      }
    } catch (error) {
      row.skipImport = true
      errors.push(importRowError(row, error.message || '客户名称匹配失败'))
    }
  }

  for (const row of rows) {
    if (row.skipImport) continue
    try {
      const modelCacheKey = row.model.toLowerCase()
      let matchedModel = importModelMatchCache.get(modelCacheKey)
      if (!importModelMatchCache.has(modelCacheKey)) {
        matchedModel = await resolveImportModel(row.model)
        importModelMatchCache.set(modelCacheKey, matchedModel || null)
      }
      const canonicalModel = String(matchedModel?.canonical_model || '').trim()
      if (!canonicalModel || canonicalModel === row.model) continue
      row.correctedModel = canonicalModel
      modelCorrections.push({
        rowNumber: row.rowNumber,
        sn: row.serialNo || '',
        inputModel: row.model,
        canonicalModel,
        matchType: matchedModel.match_type,
        brand: matchedModel.brand,
        category: matchedModel.category,
        partNumber: String(matchedModel.part_number || '').trim(),
        confidence: matchedModel.confidence,
        reason: matchedModel.reason || '',
        needsConfirmation: Boolean(matchedModel.needs_confirmation),
      })
    } catch (error) {
      row.skipImport = true
      errors.push(importRowError(row, error.message || '设备型号匹配失败'))
    }
  }

  if ((customerCorrections.length || modelCorrections.length) && !confirmImportCorrections && !skipImportCorrections) {
    res.json({
      requiresImportConfirmation: true,
      requiresModelConfirmation: Boolean(modelCorrections.length),
      created: 0,
      failed: errors.length,
      errors: errors.sort((left, right) => left.rowNumber - right.rowNumber),
      customerCorrections,
      modelCorrections,
    })
    return
  }

  let created = 0
  for (const row of rows) {
    try {
      if (row.skipImport) continue
      if (confirmImportCorrections && row.correctedCustomerId) {
        row.customerId = row.correctedCustomerId
        row.customerName = row.correctedCustomerName
      }
      if (confirmImportCorrections && row.correctedModel) {
        const confirmedNormalization = await normalizeDeviceModelForAsset(row.model, { confirmAiSuggestion: true })
        row.model = confirmedNormalization.model || row.correctedModel
      }
      if (duplicateSnKeys.has(row.serialNo.toLowerCase())) {
        throw badRequest('导入文件内 SN 重复')
      }
      const existing = await query('SELECT id FROM devices WHERE serial_no = :serialNo LIMIT 1', { serialNo: row.serialNo })
      if (existing[0]) {
        throw badRequest('SN 已存在，已跳过')
      }
      const customer = await findImportCustomer(row, req.user)
      const maintenanceParty = await findImportMaintenanceParty(row)
      const result = await query(
        `INSERT INTO devices (
           customer_id, name, model, pn, serial_no, remark, maintenance_type, maintenance_party_id,
           mr_no, maintenance_start, maintenance_end, location, warranty_until
         )
         VALUES (
           :customerId, :name, :model, :pn, :serialNo, :remark, :maintenanceType, :maintenancePartyId,
           :mrNo, :maintenanceStart, :maintenanceEnd, :location, :warrantyUntil
         )`,
        {
          customerId: customer.id,
          name: row.name,
          model: row.model,
          pn: row.pn,
          serialNo: row.serialNo,
          mrNo: row.mrNo,
          remark: row.remark,
          maintenanceType: row.maintenanceType,
          maintenancePartyId: maintenanceParty?.id || null,
          maintenanceStart: row.maintenanceStart,
          maintenanceEnd: row.maintenanceEnd,
          location: row.location,
          warrantyUntil: row.warrantyUntil,
        },
      )
      if (result.insertId) created += 1
    } catch (error) {
      errors.push(importRowError(row, isDuplicateEntryError(error) ? 'SN 已存在，已跳过' : error.message || '导入失败'))
    }
  }

  res.json({
    created,
    failed: errors.length,
    errors: errors.sort((left, right) => left.rowNumber - right.rowNumber),
  })
}

async function previewModelNormalizations(req, res) {
  const ids = normalizeDeviceIds(req.body?.ids)
  const devices = await loadDevicesForModelNormalization(req, ids)
  const preview = await buildExistingModelNormalizationPreview(devices)
  res.json(preview)
}

async function applyModelNormalizations(req, res) {
  const ids = normalizeDeviceIds(req.body?.ids)
  if (!ids.length) {
    throw badRequest('请选择要纠正的设备')
  }
  await assertSalesCanUpdateDevices(ids, req.user)
  const devices = await loadDevicesForModelNormalization(req, ids)
  const cache = new Map()
  const items = []
  let updated = 0

  for (const device of devices) {
    const model = normalizeText(device.model)
    if (!model) continue
    const cacheKey = model.toLowerCase()
    let result = cache.get(cacheKey)
    if (!result) {
      result = await normalizeDeviceModelForAsset(model, { confirmAiSuggestion: true })
      cache.set(cacheKey, result)
    }
    const normalization = result.normalization
    if (!shouldReportNormalization(normalization)) continue
    const canApply = canApplyModelNormalization(normalization)
    const item = modelNormalizationIssuePayload(device, normalization, canApply)
    items.push(item)
    if (!canApply) continue
    await query(
      `UPDATE devices
       SET model = :model
       WHERE id = :id`,
      { id: device.id, model: result.model },
    )
    updated += 1
  }

  res.json({
    updated,
    skipped: Math.max(0, devices.length - updated),
    ...summarizeModelNormalization(devices.length, items),
    items,
  })
}

async function modelNormalizationJob(req, res) {
  cleanupModelNormalizationJobs()
  const job = modelNormalizationJobs.get(String(req.params.id || ''))
  if (!job) {
    throw notFound('型号后台搜索任务不存在或已过期')
  }
  res.json({ item: modelNormalizationJobPayload(job) })
}

async function detail(req, res) {
  await ensureDeviceIdentityColumns()
  await ensureDevicePartHistoryColumns()
  const rows = await query(
    `SELECT d.id, d.customer_id, c.name AS customer_name, c.salesperson AS customer_salesperson, d.name, d.model, d.pn, d.serial_no, d.mr_no,
            d.remark, d.maintenance_type, d.maintenance_party_id, mp.name AS maintenance_party_name,
            mp.phone AS maintenance_party_phone, d.maintenance_start, d.maintenance_end,
            d.installation_source_service_order_id, d.location, d.warranty_until, d.created_at, d.updated_at
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     LEFT JOIN maintenance_parties mp ON mp.id = d.maintenance_party_id
     WHERE d.id = :id
     LIMIT 1`,
    { id: req.params.id },
  )

  if (!rows[0]) {
    throw notFound('设备不存在')
  }
  assertSalesCanAccessSalesperson(rows[0].customer_salesperson, req.user, forbidden)

  const partRows = await query(
    `SELECT sp.id, sp.service_order_id, sp.device_id, sp.action_type, sp.part_name, sp.part_no,
            sp.quantity, sp.unit, sp.remark, sp.created_at, sp.updated_at,
            so.order_no, so.service_mode, so.service_type, so.issue_description,
            so.submitted_at, so.created_at AS order_created_at,
            sr.work_content, u.real_name AS engineer_name, u.username AS engineer_username
     FROM service_parts sp
     JOIN service_orders so ON so.id = sp.service_order_id
     LEFT JOIN service_reports sr ON sr.service_order_id = so.id
     LEFT JOIN users u ON u.id = so.assigned_engineer_id
     WHERE sp.device_id = :id
     ORDER BY COALESCE(so.submitted_at, sp.created_at) DESC, sp.id DESC
     LIMIT 100`,
    { id: req.params.id },
  )

  res.json({
    item: {
      ...devicePayload(rows[0]),
      relatedServiceOrders: await loadRelatedServiceOrders(req.params.id),
      partHistory: partRows.map((part) => ({
        id: part.id,
        serviceOrderId: part.service_order_id,
        orderNo: part.order_no,
        serviceMode: part.service_mode,
        serviceType: part.service_type,
        actionType: part.action_type || 'general',
        partName: part.part_name,
        partNo: part.part_no,
        quantity: part.quantity,
        unit: part.unit,
        remark: part.remark,
        issueDescription: part.issue_description,
        workContent: part.work_content,
        engineerName: part.engineer_name || part.engineer_username,
        serviceAt: part.submitted_at || part.order_created_at || part.created_at,
        createdAt: part.created_at,
        updatedAt: part.updated_at,
      })),
    },
  })
}

async function batchUpdate(req, res) {
  await ensureDeviceIdentityColumns()
  const { ids, fields = {} } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    throw badRequest('请选择至少一台设备')
  }
  const numericIds = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  if (numericIds.length === 0) {
    throw badRequest('设备 ID 不合法')
  }
  await assertSalesCanUpdateDevices(numericIds, req.user)

  const setClauses = []
  const params = {}

  if (Object.prototype.hasOwnProperty.call(fields, 'maintenanceType')) {
    const maintenanceType = normalizeMaintenanceType(fields.maintenanceType)
    setClauses.push('maintenance_type = :maintenanceType')
    params.maintenanceType = maintenanceType
    if (!['original_manufacturer', 'our_maintenance'].includes(maintenanceType)) {
      setClauses.push('maintenance_party_id = NULL')
    } else if (Object.prototype.hasOwnProperty.call(fields, 'maintenancePartyId')) {
      const partyId = normalizeMaintenancePartyId(fields.maintenancePartyId, maintenanceType)
      if (partyId) await ensureMaintenancePartyExists(partyId)
      setClauses.push('maintenance_party_id = :maintenancePartyId')
      params.maintenancePartyId = partyId
    }
  } else if (Object.prototype.hasOwnProperty.call(fields, 'maintenancePartyId')) {
    const partyId = normalizeMaintenancePartyId(fields.maintenancePartyId, 'original_manufacturer')
    if (partyId) await ensureMaintenancePartyExists(partyId)
    setClauses.push('maintenance_party_id = :maintenancePartyId')
    params.maintenancePartyId = partyId
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'maintenanceStart')) {
    setClauses.push('maintenance_start = :maintenanceStart')
    params.maintenanceStart = normalizeDate(fields.maintenanceStart)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'maintenanceEnd')) {
    setClauses.push('maintenance_end = :maintenanceEnd')
    params.maintenanceEnd = normalizeDate(fields.maintenanceEnd)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'warrantyUntil')) {
    setClauses.push('warranty_until = :warrantyUntil')
    params.warrantyUntil = normalizeDate(fields.warrantyUntil)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'location')) {
    setClauses.push('location = :location')
    params.location = normalizeText(fields.location)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'remark')) {
    setClauses.push('remark = :remark')
    params.remark = normalizeText(fields.remark)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
    setClauses.push('name = :name')
    params.name = normalizeText(fields.name)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'pn')) {
    setClauses.push('pn = :pn')
    params.pn = normalizeText(fields.pn)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'mrNo')) {
    setClauses.push('mr_no = :mrNo')
    params.mrNo = normalizeText(fields.mrNo)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'location')) {
    setClauses.push('location = :location')
    params.location = normalizeText(fields.location)
  }

  if (setClauses.length === 0) {
    throw badRequest('没有需要更新的字段')
  }

  const placeholders = numericIds.map((_, i) => `:id${i}`).join(', ')
  numericIds.forEach((id, i) => { params[`id${i}`] = id })

  await query(
    `UPDATE devices SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`,
    params,
  )

  res.status(204).end()
}

async function update(req, res) {
  await ensureDeviceIdentityColumns()
  const {
    customerId,
    name,
    model,
    pn,
    serialNo,
    mrNo,
    remark,
    maintenanceType,
    maintenancePartyId,
    maintenanceStart,
    maintenanceEnd,
    location,
    warrantyUntil,
  } = req.body || {}
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name')
  const normalizedName = hasName ? normalizeText(name) : null
  const normalizedModel = normalizeText(model)
  const normalizedSerialNo = normalizeText(serialNo)
  if (!normalizedModel) {
    throw badRequest('设备型号不能为空')
  }
  if (!normalizedSerialNo) {
    throw badRequest('S/N 序列号不能为空')
  }
  const existing = await query(
    `SELECT d.id, d.customer_id, c.salesperson AS customer_salesperson
     FROM devices d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id = :id
     LIMIT 1`,
    { id: req.params.id },
  )
  if (!existing[0]) {
    throw notFound('设备不存在')
  }
  assertSalesCanAccessSalesperson(existing[0].customer_salesperson, req.user, forbidden)
  if (customerId && String(customerId) !== String(existing[0].customer_id)) {
    await assertSalesCanUseCustomer(customerId, req.user)
  }
  const normalizedMaintenanceType = normalizeMaintenanceType(maintenanceType)
  const normalizedMaintenancePartyId = normalizeMaintenancePartyId(maintenancePartyId, normalizedMaintenanceType)
  await ensureMaintenancePartyExists(normalizedMaintenancePartyId)
  const duplicateSerialNo = await query(
    `SELECT id
     FROM devices
     WHERE serial_no = :serialNo
       AND id <> :id
     LIMIT 1`,
    { id: req.params.id, serialNo: normalizedSerialNo },
  )
  if (duplicateSerialNo[0]) {
    throw badRequest(await duplicateSerialNoMessage(duplicateSerialNo[0].id, normalizedSerialNo))
  }

  await query(
    `UPDATE devices
     SET customer_id = COALESCE(:customerId, customer_id),
         name = CASE WHEN :hasName = 1 THEN :name ELSE name END,
         model = :model,
         pn = :pn,
         serial_no = :serialNo,
         mr_no = :mrNo,
         remark = :remark,
         maintenance_type = :maintenanceType,
         maintenance_party_id = :maintenancePartyId,
         maintenance_start = :maintenanceStart,
         maintenance_end = :maintenanceEnd,
         location = :location,
         warranty_until = :warrantyUntil
     WHERE id = :id`,
    {
      id: req.params.id,
      customerId: customerId || null,
      hasName: hasName ? 1 : 0,
      name: normalizedName,
      model: normalizedModel,
      pn: pn || null,
      serialNo: normalizedSerialNo,
      mrNo: normalizeText(mrNo),
      remark: remark || null,
      maintenanceType: normalizedMaintenanceType,
      maintenancePartyId: normalizedMaintenancePartyId,
      maintenanceStart: normalizeDate(maintenanceStart),
      maintenanceEnd: normalizeDate(maintenanceEnd),
      location: location || null,
      warrantyUntil: warrantyUntil || null,
    },
  )

  res.status(204).end()
}

async function remove(req, res) {
  const deviceId = Number(req.params.id)
  const forced = isForceDeleteRequest(req)
  if (!deviceId) {
    throw notFound('设备不存在')
  }

  if (!forced) {
    const summary = await loadDeviceDeleteSummary(deviceId)
    if (!summary) {
      throw notFound('设备不存在')
    }
    assertSalesCanAccessSalesperson(summary.device.customerSalesperson, req.user, forbidden)
    if (summary.blocked) {
      throw badRequest(summary.message || '设备仍有关联数据，不能直接删除', {
        code: 'DEVICE_DELETE_BLOCKED',
        canForceDelete: true,
        ...summary,
      })
    }
    await query('DELETE FROM devices WHERE id = :id', { id: deviceId })
    res.status(204).end()
    return
  }

  const result = await transaction(async (connection) => {
    const execute = async (sql, params = {}) => {
      const [rows] = await connection.execute(sql, params)
      return rows
    }
    const summary = await loadDeviceDeleteSummary(deviceId, execute)
    if (!summary) {
      throw notFound('设备不存在')
    }
    assertSalesCanAccessSalesperson(summary.device.customerSalesperson, req.user, forbidden)

    await connection.execute('UPDATE service_orders SET device_id = NULL WHERE device_id = :id', { id: deviceId })
    await connection.execute('DELETE FROM service_order_devices WHERE device_id = :id', { id: deviceId })
    await connection.execute('UPDATE service_parts SET device_id = NULL WHERE device_id = :id', { id: deviceId })
    await connection.execute('UPDATE inspection_schedules SET device_id = NULL WHERE device_id = :id', { id: deviceId })
    await connection.execute('DELETE FROM inspection_schedule_assignments WHERE device_id = :id', { id: deviceId })
    await connection.execute('DELETE FROM inspection_schedule_devices WHERE device_id = :id', { id: deviceId })
    await connection.execute('DELETE FROM devices WHERE id = :id', { id: deviceId })
    return summary
  })

  res.json({ deleted: true, forced: true, ...result })
}

module.exports = {
  uploadImportMiddleware,
  list,
  create,
  importDevices,
  previewModelNormalizations,
  applyModelNormalizations,
  modelNormalizationJob,
  detail,
  batchUpdate,
  update,
  remove,
  normalizeMaintenanceType,
}
