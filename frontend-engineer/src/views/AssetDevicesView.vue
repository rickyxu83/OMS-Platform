<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const route = useRoute()
const devices = ref([])
const customers = ref([])
const parties = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const successMessage = ref('')
const searchQuery = ref('')
const customerFilter = ref('')
const dialogOpen = ref(false)
const createMode = ref('single')
const editingId = ref(null)
const form = ref(emptyForm())
const batchRows = ref(createInitialBatchRows())
const selectedDeviceIds = ref([])
const batchEditOpen = ref(false)
const batchEditForm = ref(emptyBatchEditForm())
const batchEditToggles = ref(emptyBatchEditToggles())
const importOpen = ref(false)
const importFile = ref(null)
const importing = ref(false)
const importResult = ref(null)
const importFileInputRef = ref(null)
const customerInput = ref('')
const customerDropdownOpen = ref(false)
const customerSearchLoading = ref(false)
const modelSuggestions = ref([])
const modelLoading = ref(false)
const modelDropdownOpen = ref(false)
const modelSearchTarget = ref('form')
const modelSuggestionsTarget = ref('')
const modelComboRef = ref(null)

let customerSearchTimer = null
let modelSearchTimer = null
let modelSearchRequestId = 0

const maintenanceLabels = {
  none: '无维保',
  original_manufacturer: '原厂维保',
  vendor: '原厂维保',
  our_maintenance: '我方维保',
  our: '我方维保',
}

const MAINTENANCE_TYPE_ALIASES = {
  vendor: 'original_manufacturer',
  our: 'our_maintenance',
}

const DEVICE_STATUS_LABELS = {
  active: '在用',
  inactive: '停用',
  maintenance: '维保中',
  scrapped: '已报废',
}

function canonicalMaintenanceType(value) {
  const type = String(value || 'none').trim() || 'none'
  return MAINTENANCE_TYPE_ALIASES[type] || type
}

function deviceDisplayName(device) {
  if (!device) return ''
  return device.model || device.name || device.serialNo || `设备 #${device.id}`
}

const filteredDevices = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return devices.value.filter((item) => {
    if (customerFilter.value && String(item.customerId || '') !== customerFilter.value) return false
    if (!keyword) return true
    return [item.customerName, item.name, item.model, item.pn, item.serialNo, item.mrNo, item.location, item.remark]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})

const selectedCustomer = computed(() => customers.value.find((item) => String(item.id) === String(form.value.customerId)) || null)

const filteredMaintenanceParties = computed(() => {
  const type = canonicalMaintenanceType(form.value.maintenanceType)
  if (type === 'none') return []
  return parties.value.filter((party) => canonicalMaintenanceType(party.partyType) === type)
})

const filteredBatchEditMaintenanceParties = computed(() => {
  const type = canonicalMaintenanceType(batchEditForm.value.maintenanceType)
  if (type === 'none') return []
  return parties.value.filter((party) => canonicalMaintenanceType(party.partyType) === type)
})

const allFilteredDevicesSelected = computed(() => (
  filteredDevices.value.length > 0
  && filteredDevices.value.every((device) => selectedDeviceIds.value.includes(String(device.id)))
))

const dialogCustomerOptions = computed(() => {
  const keyword = normalizeCustomerSearchText(customerInput.value)
  const selectedId = String(form.value.customerId || '')
  const matches = customers.value
    .filter((customer) => {
      if (!keyword) return true
      return normalizeCustomerSearchText(customerLabel(customer)).includes(keyword) || String(customer.id).includes(keyword)
    })
    .sort((left, right) => {
      if (selectedId && String(left.id) === selectedId) return -1
      if (selectedId && String(right.id) === selectedId) return 1
      const leftLabel = normalizeCustomerSearchText(customerLabel(left))
      const rightLabel = normalizeCustomerSearchText(customerLabel(right))
      const leftStarts = keyword && leftLabel.startsWith(keyword) ? 0 : 1
      const rightStarts = keyword && rightLabel.startsWith(keyword) ? 0 : 1
      if (leftStarts !== rightStarts) return leftStarts - rightStarts
      return customerLabel(left).localeCompare(customerLabel(right), 'zh-Hans-CN')
    })
    .slice(0, 60)

  if (selectedCustomer.value && !matches.some((customer) => String(customer.id) === String(selectedCustomer.value.id))) {
    return [selectedCustomer.value, ...matches].slice(0, 60)
  }
  return matches
})

function emptyForm() {
  return {
    customerId: '',
    name: '',
    model: '',
    pn: '',
    serialNo: '',
    mrNo: '',
    maintenanceType: 'none',
    maintenancePartyId: '',
    maintenanceStart: '',
    maintenanceEnd: '',
    location: '',
    status: 'active',
    remark: '',
  }
}

function emptyBatchEditForm() {
  return {
    maintenanceType: 'none',
    maintenancePartyId: '',
    maintenanceStart: '',
    maintenanceEnd: '',
    warrantyUntil: '',
    mrNo: '',
    location: '',
    remark: '',
  }
}

function emptyBatchEditToggles() {
  return {
    maintenanceType: false,
    maintenancePartyId: false,
    maintenanceStart: false,
    maintenanceEnd: false,
    warrantyUntil: false,
    mrNo: false,
    location: false,
    remark: false,
  }
}

function createEmptyBatchRow() {
  return {
    name: '',
    model: '',
    serialNo: '',
    mrNo: '',
  }
}

function createInitialBatchRows(count = 3) {
  return Array.from({ length: count }, () => createEmptyBatchRow())
}

function batchRowHasInput(row) {
  return Boolean(row.name.trim() || row.model.trim() || row.serialNo.trim() || row.mrNo.trim())
}

function modelNormalizationMessage(payload) {
  const normalization = payload?.modelNormalization || {}
  const action = String(normalization.action || '')
  if (!['corrected', 'created', 'created_corrected', 'not_found'].includes(action)) return ''
  return String(payload?.message || normalization.message || '').trim()
    || (action === 'corrected'
      ? `已按型号库标准纠正为 ${normalization.canonicalModel || '标准型号'}`
      : action === 'created_corrected'
        ? `型号库未命中，已规范为 ${normalization.canonicalModel || '标准型号'} 并加入型号库`
        : action === 'created'
          ? '型号库未命中，已加入型号库'
          : '型号库未命中，未能在线确认，已按原型号保存')
}

function formatModelNormalizationMessages(messages) {
  const unique = [...new Set(messages.map((item) => String(item || '').trim()).filter(Boolean))]
  if (!unique.length) return ''
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return unique.join('；')
  return `${unique.slice(0, 2).join('；')}；另有 ${unique.length - 2} 条型号校对结果已应用`
}

function customerLabel(customer) {
  if (!customer) return ''
  return customer.name || `客户 #${customer.id}`
}

function normalizeCustomerSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
}

function mergeCustomers(current, incoming) {
  const merged = new Map()
  ;[...current, ...incoming].forEach((customer) => {
    if (!customer?.id) return
    const key = String(customer.id)
    merged.set(key, { ...(merged.get(key) || {}), ...customer })
  })
  return [...merged.values()]
}

async function downloadDeviceImportTemplate() {
  const [{ Workbook }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ])
  const workbook = new Workbook()
  workbook.creator = 'OMS Platform'
  workbook.created = new Date()
  workbook.modified = new Date()

  const headerRowNumber = 4
  const worksheet = workbook.addWorksheet('设备导入模板', {
    views: [{ state: 'frozen', ySplit: headerRowNumber }],
  })
  const requiredHeaders = new Set(['客户名称', '设备型号*', 'SN*'])
  worksheet.columns = [
    { key: 'customerName', width: 24 },
    { key: 'name', width: 20 },
    { key: 'model', width: 24 },
    { key: 'serialNo', width: 22 },
    { key: 'mrNo', width: 18 },
    { key: 'maintenanceType', width: 16 },
    { key: 'maintenancePartyName', width: 24 },
    { key: 'maintenanceStart', width: 14 },
    { key: 'maintenanceEnd', width: 14 },
    { key: 'warrantyUntil', width: 14 },
    { key: 'location', width: 24 },
    { key: 'remark', width: 28 },
  ]
  worksheet.mergeCells('A1:L1')
  worksheet.mergeCells('A2:L2')
  worksheet.mergeCells('A3:L3')
  worksheet.getCell('A1').value = '设备资产导入提示'
  worksheet.getCell('A2').value = '只需先填写客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后可在系统中批量补齐或修改。'
  worksheet.getCell('A3').value = '客户名称必须与系统内记录完全一致，否则对应行会导入失败；重复 SN 会自动跳过。'
  ;[1, 2, 3].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber)
    row.height = rowNumber === 1 ? 26 : 22
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        left: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        bottom: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        right: { style: 'thin', color: { argb: 'FFC4B5FD' } },
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber === 1 ? 'FFDDD6FE' : 'FFF5F3FF' } }
      cell.font = { bold: rowNumber === 1, color: { argb: rowNumber === 3 ? 'FF7F1D1D' : 'FF4C1D95' } }
    })
  })
  worksheet.getRow(headerRowNumber).values = [
    '客户名称',
    '主机名',
    '设备型号*',
    'SN*',
    'MR单',
    '维保类型',
    '维保方名称',
    '维保开始',
    '维保截止',
    '质保截止',
    '位置',
    '备注',
  ]
  worksheet.addRow({
    customerName: '示例客户有限公司',
    name: 'host-01',
    model: 'PowerEdge R740',
    serialNo: 'SN-EXAMPLE-001',
    mrNo: 'MR-001',
    maintenanceType: '我方维保',
    maintenancePartyName: '示例维保方',
    maintenanceStart: '2026-01-01',
    maintenanceEnd: '2026-12-31',
    warrantyUntil: '2026-12-31',
    location: '机房 A01',
    remark: '删除示例行后再导入',
  })
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: worksheet.columns.length },
  }
  worksheet.getRow(headerRowNumber).height = 24
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    const required = requiredHeaders.has(String(cell.value || ''))
    cell.font = { bold: true, color: { argb: required ? 'FF7F1D1D' : 'FF4C1D95' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    if (required) {
      cell.note = String(cell.value) === '客户名称'
        ? '必填项，必须和系统内客户名称一模一样，否则该行会导入失败。'
        : '必填项，不能为空。'
    }
  })
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        left: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        right: { style: 'thin', color: { argb: 'FFD9E2EC' } },
      }
      cell.alignment = { vertical: 'middle', wrapText: true }
      if (rowNumber > headerRowNumber) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      }
    })
  })

  const help = workbook.addWorksheet('字段说明')
  help.columns = [
    { header: '字段', key: 'field', width: 18 },
    { header: '是否必填', key: 'required', width: 14 },
    { header: '说明', key: 'description', width: 72 },
  ]
  ;[
    ['客户名称', '必填', '必须和系统内客户名称一模一样，否则该行会导入失败。'],
    ['设备型号*', '必填', '不能为空。'],
    ['SN*', '必填', '不能为空；导入文件内重复或系统内已存在时，该行失败并跳过。'],
    ['维保类型', '选填', '可填：无维保、原厂维保、我方维保；空值按无维保处理。'],
    ['维保方名称', '有维保时选填', '按名称和维保类型匹配已有维保方。'],
    ['维保截止', '选填', '当前维保合同或服务责任的结束日期；到期提醒优先使用此字段。'],
    ['质保截止', '选填', '设备原厂/供应商质保自然到期日；没有维保截止时作为展示兜底。'],
    ['日期字段', '选填', '使用 YYYY-MM-DD 格式，例如 2026-12-31。'],
    ['填写建议', '说明', '只需先填客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后再在系统中批量补齐或修改。'],
  ].forEach(([field, required, description]) => help.addRow({ field, required, description }))
  help.getRow(1).font = { bold: true, color: { argb: 'FF4C1D95' } }
  help.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '设备资产导入模板.xlsx')
}

function selectedCustomerLabel(customerId, fallback = '') {
  if (!customerId) return ''
  const customer = customers.value.find((item) => String(item.id) === String(customerId))
  return customerLabel(customer) || fallback || `客户 #${customerId}`
}

function inputDate(value) {
  return value ? String(value).slice(0, 10) : ''
}

function displayDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 10) : '未维护'
}

function maintenanceLabel(value) {
  return maintenanceLabels[value || 'none'] || value || '未维护'
}

function resolveMaintenancePartyId(type, currentId) {
  const normalizedType = canonicalMaintenanceType(type)
  if (normalizedType === 'none') return ''
  if (!currentId) return ''
  return parties.value.some((party) => (
    String(party.id) === String(currentId)
    && canonicalMaintenanceType(party.partyType) === normalizedType
  )) ? String(currentId) : ''
}

async function loadBaseData() {
  const [customerData, partyData] = await Promise.all([
    api.get('/customers?pageSize=200'),
    api.get('/maintenance-parties'),
  ])
  customers.value = customerData?.items || []
  parties.value = partyData?.items || []
}

async function loadDevices() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (customerFilter.value) params.set('customerId', customerFilter.value)
    if (searchQuery.value.trim()) params.set('keyword', searchQuery.value.trim())
    const data = await api.get(`/devices${params.toString() ? `?${params.toString()}` : ''}`)
    devices.value = data?.items || []
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  successMessage.value = ''
  createMode.value = 'single'
  editingId.value = null
  form.value = { ...emptyForm(), customerId: customerFilter.value || '' }
  batchRows.value = createInitialBatchRows()
  customerInput.value = selectedCustomerLabel(form.value.customerId)
  customerDropdownOpen.value = false
  modelSuggestions.value = []
  dialogOpen.value = true
}

function openBulkCreate() {
  successMessage.value = ''
  createMode.value = 'bulk'
  editingId.value = null
  form.value = { ...emptyForm(), customerId: customerFilter.value || '' }
  batchRows.value = createInitialBatchRows()
  customerInput.value = selectedCustomerLabel(form.value.customerId)
  customerDropdownOpen.value = false
  modelSuggestions.value = []
  dialogOpen.value = true
}

function openEdit(device) {
  successMessage.value = ''
  createMode.value = 'single'
  editingId.value = device.id
  const maintenanceType = canonicalMaintenanceType(device.maintenanceType)
  form.value = {
    customerId: device.customerId ? String(device.customerId) : '',
    name: device.name || '',
    model: device.model || '',
    pn: device.pn || '',
    serialNo: device.serialNo || '',
    mrNo: device.mrNo || '',
    maintenanceType,
    maintenancePartyId: resolveMaintenancePartyId(maintenanceType, device.maintenancePartyId),
    maintenanceStart: inputDate(device.maintenanceStart),
    maintenanceEnd: inputDate(device.maintenanceEnd),
    location: device.location || '',
    status: device.status || 'active',
    remark: device.remark || '',
  }
  customerInput.value = selectedCustomerLabel(device.customerId, device.customerName)
  customerDropdownOpen.value = false
  modelSuggestions.value = []
  dialogOpen.value = true
}

function updateBatchRow(index, field, value) {
  batchRows.value = batchRows.value.map((row, rowIndex) => (
    rowIndex === index ? { ...row, [field]: value } : row
  ))
}

function batchModelTarget(index) {
  return `batch:${index}`
}

function addBatchRow() {
  batchRows.value = [...batchRows.value, createEmptyBatchRow()]
}

function removeBatchRow(index) {
  const next = batchRows.value.filter((_, rowIndex) => rowIndex !== index)
  batchRows.value = next.length ? next : [createEmptyBatchRow()]
  if (isBatchModelTarget(modelSearchTarget.value)) {
    modelDropdownOpen.value = false
  }
}

function changeMaintenanceType(value) {
  const type = canonicalMaintenanceType(value)
  form.value.maintenanceType = type
  form.value.maintenancePartyId = resolveMaintenancePartyId(type, form.value.maintenancePartyId)
}

function changeBatchEditMaintenanceType(value) {
  const type = canonicalMaintenanceType(value)
  batchEditForm.value.maintenanceType = type
  batchEditForm.value.maintenancePartyId = resolveMaintenancePartyId(type, batchEditForm.value.maintenancePartyId)
}

function toggleDeviceSelection(deviceId, checked) {
  const id = String(deviceId)
  if (checked) {
    if (!selectedDeviceIds.value.includes(id)) selectedDeviceIds.value = [...selectedDeviceIds.value, id]
    return
  }
  selectedDeviceIds.value = selectedDeviceIds.value.filter((item) => item !== id)
}

function toggleAllFilteredDevices(checked) {
  if (!checked) {
    clearDeviceSelection()
    return
  }
  selectedDeviceIds.value = filteredDevices.value.map((device) => String(device.id))
}

function clearDeviceSelection() {
  selectedDeviceIds.value = []
}

function openBatchEdit() {
  if (!selectedDeviceIds.value.length) {
    error.value = '请先选择要批量编辑的设备'
    return
  }
  error.value = ''
  batchEditForm.value = emptyBatchEditForm()
  batchEditToggles.value = emptyBatchEditToggles()
  batchEditOpen.value = true
}

function closeBatchEdit() {
  if (saving.value) return
  batchEditOpen.value = false
  error.value = ''
}

function openImportDialog() {
  error.value = ''
  successMessage.value = ''
  importFile.value = null
  importResult.value = null
  if (importFileInputRef.value) importFileInputRef.value.value = ''
  importOpen.value = true
}

function closeImportDialog() {
  if (importing.value) return
  importOpen.value = false
  error.value = ''
  importFile.value = null
  importResult.value = null
  if (importFileInputRef.value) importFileInputRef.value.value = ''
}

async function submitImport(mode = 'check') {
  if (!importFile.value) {
    error.value = '请选择要导入的 Excel 文件'
    return
  }
  importing.value = true
  error.value = ''
  successMessage.value = ''
  importResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    if (mode === 'confirm') formData.append('confirmModelCorrections', '1')
    if (mode === 'skip') formData.append('skipModelCorrections', '1')
    const data = await api.postForm('/devices/import', formData)
    const result = {
      created: Number(data?.created || 0),
      failed: Number(data?.failed || 0),
      errors: Array.isArray(data?.errors) ? data.errors : [],
      requiresModelConfirmation: Boolean(data?.requiresModelConfirmation),
      modelCorrections: Array.isArray(data?.modelCorrections) ? data.modelCorrections : [],
    }
    importResult.value = result
    if (!result.requiresModelConfirmation) {
      successMessage.value = `导入完成：成功 ${result.created} 台，失败 ${result.failed} 行`
      await loadDevices()
    }
  } catch (err) {
    error.value = err.message || '导入失败'
  } finally {
    importing.value = false
  }
}

async function submitBatchEdit() {
  const fields = {}
  if (batchEditToggles.value.maintenanceType) {
    fields.maintenanceType = canonicalMaintenanceType(batchEditForm.value.maintenanceType)
    if (fields.maintenanceType !== 'none' && batchEditToggles.value.maintenancePartyId) {
      fields.maintenancePartyId = batchEditForm.value.maintenancePartyId || null
    }
  } else if (batchEditToggles.value.maintenancePartyId) {
    fields.maintenancePartyId = batchEditForm.value.maintenancePartyId || null
  }
  if (batchEditToggles.value.maintenanceStart) fields.maintenanceStart = batchEditForm.value.maintenanceStart || null
  if (batchEditToggles.value.maintenanceEnd) fields.maintenanceEnd = batchEditForm.value.maintenanceEnd || null
  if (batchEditToggles.value.warrantyUntil) fields.warrantyUntil = batchEditForm.value.warrantyUntil || null
  if (batchEditToggles.value.mrNo) fields.mrNo = batchEditForm.value.mrNo.trim() || null
  if (batchEditToggles.value.location) fields.location = batchEditForm.value.location.trim() || null
  if (batchEditToggles.value.remark) fields.remark = batchEditForm.value.remark.trim() || null

  if (!Object.keys(fields).length) {
    error.value = '请至少勾选一个要修改的字段'
    return
  }

  saving.value = true
  error.value = ''
  try {
    await api.put('/devices/batch', { ids: selectedDeviceIds.value, fields })
    batchEditOpen.value = false
    selectedDeviceIds.value = []
    await loadDevices()
  } catch (err) {
    error.value = err.message || '批量编辑失败'
  } finally {
    saving.value = false
  }
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

async function saveDevice() {
  successMessage.value = ''
  let effectiveCustomerId = form.value.customerId
  if (!effectiveCustomerId && customerInput.value.trim()) {
    const normalizedInput = normalizeCustomerSearchText(customerInput.value)
    const exact = customers.value.find((customer) => (
      normalizeCustomerSearchText(customerLabel(customer)) === normalizedInput
      || String(customer.id) === customerInput.value.trim()
    ))
    if (exact) effectiveCustomerId = String(exact.id)
  }
  if (!effectiveCustomerId) {
    error.value = '请选择客户'
    customerDropdownOpen.value = true
    return
  }
  if ((editingId.value || createMode.value !== 'bulk') && !form.value.model.trim()) {
    error.value = '请输入设备型号'
    return
  }
  saving.value = true
  error.value = ''
  let createdCount = 0
  const normalizationMessages = []
  try {
    const type = canonicalMaintenanceType(form.value.maintenanceType)
    const commonPayload = {
      customerId: effectiveCustomerId,
      maintenanceType: type,
      maintenancePartyId: type === 'none' ? null : (form.value.maintenancePartyId || null),
      maintenanceStart: form.value.maintenanceStart || undefined,
      maintenanceEnd: form.value.maintenanceEnd || undefined,
      location: form.value.location.trim() || undefined,
      status: form.value.status,
      remark: form.value.remark.trim() || undefined,
    }

    if (!editingId.value && createMode.value === 'bulk') {
      const defaultModel = form.value.model.trim()
      const rows = batchRows.value
        .map((row, index) => ({
          index,
          name: row.name.trim(),
          model: row.model.trim() || defaultModel,
          serialNo: row.serialNo.trim(),
          mrNo: row.mrNo.trim(),
          hasInput: batchRowHasInput(row),
        }))
        .filter((row) => row.hasInput)

      if (!rows.length) {
        error.value = '请至少填写一台设备'
        return
      }

      const missingModel = rows.find((row) => !row.model)
      if (missingModel) {
        error.value = `第 ${missingModel.index + 1} 行缺少设备型号，请填写该行型号或上方默认型号`
        return
      }
      const missingSerialNo = rows.find((row) => !row.serialNo)
      if (missingSerialNo) {
        error.value = `第 ${missingSerialNo.index + 1} 行缺少 S/N 序列号`
        return
      }

      for (const row of rows) {
        const data = await api.post('/devices', {
          ...commonPayload,
          name: row.name || null,
          model: row.model,
          serialNo: row.serialNo || undefined,
          mrNo: row.mrNo || undefined,
        })
        const message = modelNormalizationMessage(data)
        if (message) normalizationMessages.push(message)
        createdCount += 1
      }
    } else {
      if (!form.value.model.trim()) {
        error.value = '请输入设备型号'
        return
      }
      if (!form.value.serialNo.trim()) {
        error.value = '请输入 S/N 序列号'
        return
      }
      const payload = {
        ...commonPayload,
        name: form.value.name.trim() || null,
        model: form.value.model.trim(),
        pn: form.value.pn.trim() || undefined,
        serialNo: form.value.serialNo.trim() || undefined,
        mrNo: form.value.mrNo.trim() || undefined,
      }
      if (editingId.value) {
        await api.put(`/devices/${editingId.value}`, payload)
      } else {
        const data = await api.post('/devices', payload)
        const message = modelNormalizationMessage(data)
        if (message) normalizationMessages.push(message)
      }
    }
    dialogOpen.value = false
    successMessage.value = formatModelNormalizationMessages(normalizationMessages)
    await loadDevices()
  } catch (err) {
    const message = err.message || '保存失败'
    error.value = createdCount ? `已新增 ${createdCount} 台设备，后续保存失败：${message}` : message
    if (createdCount) await loadDevices()
  } finally {
    saving.value = false
  }
}

function scheduleCustomerSearch(value) {
  window.clearTimeout(customerSearchTimer)
  const keyword = String(value || '').trim()
  if (!keyword) {
    customerSearchLoading.value = false
    return
  }
  customerSearchTimer = window.setTimeout(async () => {
    customerSearchLoading.value = true
    try {
      const data = await api.get(`/customers?pageSize=50&keyword=${encodeURIComponent(keyword)}`)
      customers.value = mergeCustomers(customers.value, data?.items || [])
    } catch {
      // Keep locally loaded customers usable when search fails.
    } finally {
      customerSearchLoading.value = false
    }
  }, 220)
}

function applyCustomer(customer) {
  form.value.customerId = String(customer.id)
  customerInput.value = customerLabel(customer)
  customerDropdownOpen.value = false
}

function closeCustomerDropdownSoon() {
  window.setTimeout(() => {
    customerDropdownOpen.value = false
  }, 120)
}

function onCustomerInput() {
  customerDropdownOpen.value = true
  if (!selectedCustomer.value || normalizeCustomerSearchText(customerInput.value) !== normalizeCustomerSearchText(customerLabel(selectedCustomer.value))) {
    form.value.customerId = ''
  }
  scheduleCustomerSearch(customerInput.value)
}

function suggestionModelName(suggestion) {
  return suggestion?.canonicalModel || suggestion?.officialName || ''
}

function suggestionMetaText(suggestion) {
  return [suggestion?.brand || suggestion?.vendor, suggestion?.partNumber, suggestion?.category].filter(Boolean).join(' · ') || '标准型号'
}

function isBatchModelTarget(target) {
  return String(target || '').startsWith('batch:')
}

function isModelDropdownVisible(target = 'form') {
  return modelDropdownOpen.value
    && modelSearchTarget.value === target
    && modelSuggestionsTarget.value === target
    && (modelLoading.value || modelSuggestions.value.length)
}

function focusModelField(value, target = 'form') {
  modelSearchTarget.value = target
  const keyword = String(value || '').trim()
  if (modelSuggestionsTarget.value === target && (modelLoading.value || modelSuggestions.value.length)) {
    modelDropdownOpen.value = true
    return
  }
  if (keyword.length >= 2) {
    scheduleModelSearch(keyword, target)
  } else {
    modelDropdownOpen.value = false
  }
}

function scheduleModelSearch(value, target = 'form') {
  window.clearTimeout(modelSearchTimer)
  const searchTarget = target
  const keyword = String(value || '').trim()
  modelSearchTarget.value = searchTarget
  modelSuggestionsTarget.value = searchTarget
  const requestId = ++modelSearchRequestId
  if (keyword.length < 2) {
    modelSuggestions.value = []
    modelLoading.value = false
    modelDropdownOpen.value = false
    return
  }
  modelDropdownOpen.value = true
  modelSearchTimer = window.setTimeout(async () => {
    modelLoading.value = true
    try {
      const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`)
      if (requestId === modelSearchRequestId && modelSearchTarget.value === searchTarget) {
        modelSuggestions.value = data?.items || []
      }
    } catch {
      if (requestId === modelSearchRequestId && modelSearchTarget.value === searchTarget) {
        modelSuggestions.value = []
      }
    } finally {
      if (requestId === modelSearchRequestId && modelSearchTarget.value === searchTarget) {
        modelLoading.value = false
      }
    }
  }, 250)
}

function applyModelSuggestion(suggestion, target = modelSearchTarget.value) {
  const nextModel = suggestionModelName(suggestion)
  if (isBatchModelTarget(target)) {
    const index = Number(String(target).slice('batch:'.length))
    if (Number.isInteger(index) && batchRows.value[index]) {
      updateBatchRow(index, 'model', nextModel || batchRows.value[index].model)
    }
  } else {
    form.value.model = nextModel || form.value.model
    form.value.pn = suggestion.partNumber || form.value.pn
  }
  modelSuggestions.value = []
  modelDropdownOpen.value = false
}

function handleModelOutsidePointer(event) {
  if (!modelDropdownOpen.value) return
  if (event.target?.closest?.('.asset-model-combo')) return
  if (modelComboRef.value?.contains?.(event.target)) return
  modelDropdownOpen.value = false
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleModelOutsidePointer)
  try {
    customerFilter.value = String(route.query.customerId || '')
    await loadBaseData()
    await loadDevices()
  } catch (err) {
    error.value = err.message || '加载失败'
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleModelOutsidePointer)
  window.clearTimeout(modelSearchTimer)
})

watch(filteredDevices, (items) => {
  const visibleIds = new Set(items.map((device) => String(device.id)))
  const next = selectedDeviceIds.value.filter((id) => visibleIds.has(id))
  if (next.length !== selectedDeviceIds.value.length) selectedDeviceIds.value = next
})
</script>

<template>
  <main class="engineer-shell asset-shell">
    <header class="topbar asset-topbar">
      <div>
        <BrandEyebrow text="客户与资产 / 设备资产" title="设备资产" />
        <p class="asset-page-lead">{{ zh('维护客户设备、序列号、位置和维保信息。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
        </div>
      </div>
    </header>

    <section class="asset-toolbar">
      <label class="asset-search-box">
        <PreviewIcon name="eye" />
        <input v-model="searchQuery" type="search" :placeholder="zh('搜索设备、型号、序列号、MR单、客户')" @keydown.enter="loadDevices" />
      </label>
      <select v-model="customerFilter" class="asset-select" @change="loadDevices">
        <option value="">{{ zh('全部客户') }}</option>
        <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">{{ zh(customer.name || '未命名客户') }}</option>
      </select>
      <button class="ghost" type="button" :disabled="loading" @click="loadDevices"><PreviewIcon name="refresh" />{{ zh('刷新') }}</button>
      <button class="ghost" type="button" @click="downloadDeviceImportTemplate"><PreviewIcon name="download" />{{ zh('下载模板') }}</button>
      <button class="ghost" type="button" @click="openImportDialog"><PreviewIcon name="download" />{{ zh('导入 Excel') }}</button>
      <button class="ghost" type="button" @click="openBulkCreate"><PreviewIcon name="new" />{{ zh('批量新增') }}</button>
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增设备') }}</button>
    </section>

    <section v-if="filteredDevices.length" class="asset-batch-toolbar">
      <label>
        <input
          type="checkbox"
          :checked="allFilteredDevicesSelected"
          :disabled="saving"
          @change="toggleAllFilteredDevices($event.target.checked)"
        />
        {{ zh('全选当前列表') }}
      </label>
      <span>{{ zh(`已选择 ${selectedDeviceIds.length} 台`) }}</span>
      <button v-if="selectedDeviceIds.length" class="ghost" type="button" :disabled="saving" @click="clearDeviceSelection">{{ zh('清空选择') }}</button>
      <button class="ghost" type="button" :disabled="saving || !selectedDeviceIds.length" @click="openBatchEdit"><PreviewIcon name="edit" />{{ zh('批量编辑') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
    <p v-if="successMessage" class="asset-save-message"><PreviewIcon name="check" />{{ zh(successMessage) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在加载设备资产…') }}</p>

    <section class="asset-card-list">
      <article
        v-for="device in filteredDevices"
        :key="device.id"
        class="asset-record-card asset-clickable-card"
        role="link"
        tabindex="0"
        @click="$router.push(`/assets/devices/${device.id}`)"
        @keydown.enter="$router.push(`/assets/devices/${device.id}`)"
        @keydown.space.prevent="$router.push(`/assets/devices/${device.id}`)"
      >
        <header>
          <div class="asset-record-title-row">
            <label class="asset-record-select" @click.stop @keydown.stop>
              <input
                type="checkbox"
                :checked="selectedDeviceIds.includes(String(device.id))"
                :disabled="saving"
                :aria-label="zh(`选择设备 ${deviceDisplayName(device)}`)"
                @change="toggleDeviceSelection(device.id, $event.target.checked)"
              />
            </label>
            <div>
              <span class="asset-record-kicker">{{ zh(device.customerName || '未关联客户') }}</span>
              <h2>{{ zh(deviceDisplayName(device)) }}</h2>
            </div>
          </div>
          <button class="ghost" type="button" @click.stop="openEdit(device)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
        </header>
        <p class="asset-record-line">
          <PreviewIcon name="devices" />
          <span class="asset-ellipsis" :title="`${device.model || '未维护型号'} · SN: ${device.serialNo || '未维护'}${device.mrNo ? ` · MR: ${device.mrNo}` : ''}`">
            {{ zh(device.model || '未维护型号') }} · SN: {{ device.serialNo || zh('未维护') }}<template v-if="device.mrNo"> · MR: {{ device.mrNo }}</template>
          </span>
        </p>
        <p class="asset-record-line">
          <PreviewIcon name="pin" />
          <span class="asset-ellipsis" :title="device.location || '未维护位置'">{{ zh(device.location || '未维护位置') }}</span>
        </p>
        <div class="asset-meta-row">
          <span>{{ zh(maintenanceLabel(device.maintenanceType)) }}</span>
          <span>{{ zh('维保到期') }}：{{ zh(displayDate(device.maintenanceEnd || device.warrantyUntil)) }}</span>
        </div>
      </article>
      <p v-if="!loading && !filteredDevices.length" class="empty-state">{{ zh('暂无设备资产') }}</p>
    </section>

    <div v-if="dialogOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(editingId ? '编辑设备' : createMode === 'bulk' ? '批量新增设备' : '新增设备')" @click.self="closeDialog">
      <div class="signature-modal-shell asset-editor-shell" :class="{ 'asset-editor-shell-wide': !editingId && createMode === 'bulk' }">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('设备资产') }}</p>
            <h2>{{ zh(editingId ? '编辑设备' : createMode === 'bulk' ? '批量新增设备' : '新增设备') }}</h2>
          </div>
        </header>
        <div class="asset-editor-form">
          <label class="asset-editor-wide">{{ zh('客户 *') }}
            <div class="asset-combo-field">
              <input
                v-model="customerInput"
                type="text"
                :placeholder="zh('输入客户名称关键词搜索')"
                autocomplete="off"
                @focus="customerDropdownOpen = true"
                @blur="closeCustomerDropdownSoon"
                @input="onCustomerInput"
              />
              <div v-if="customerDropdownOpen" class="asset-dropdown">
                <div v-if="customerSearchLoading" class="asset-dropdown-status">{{ zh('搜索客户中…') }}</div>
                <button
                  v-for="customer in dialogCustomerOptions"
                  :key="customer.id"
                  type="button"
                  @mousedown.prevent
                  @click="applyCustomer(customer)"
                >
                  <strong>{{ zh(customerLabel(customer)) }}</strong>
                  <span>{{ zh(`客户 #${customer.id}`) }}</span>
                </button>
                <div v-if="!customerSearchLoading && !dialogCustomerOptions.length" class="asset-dropdown-status">
                  {{ zh('未找到匹配客户，请调整关键词') }}
                </div>
              </div>
            </div>
          </label>
          <label v-if="!editingId && createMode === 'bulk'" class="asset-editor-wide">{{ zh('默认设备型号') }}
            <div ref="modelComboRef" class="asset-combo-field asset-model-combo">
              <input
                v-model="form.model"
                type="text"
                :placeholder="zh('同型号设备可在这里填一次，每行也可单独覆盖')"
                autocomplete="off"
                @focus="focusModelField(form.model)"
                @input="scheduleModelSearch($event.target.value)"
              />
              <div v-if="isModelDropdownVisible()" class="asset-dropdown">
                <div v-if="modelLoading" class="asset-dropdown-status">{{ zh('搜索型号中…') }}</div>
                <button
                  v-for="(suggestion, index) in modelSuggestions"
                  :key="`${suggestionModelName(suggestion)}-${suggestion.partNumber}-${index}`"
                  type="button"
                  @click="applyModelSuggestion(suggestion)"
                >
                  <strong>{{ zh(suggestionModelName(suggestion) || '标准型号') }}</strong>
                  <span>{{ zh(suggestionMetaText(suggestion)) }}</span>
                </button>
              </div>
            </div>
          </label>
          <template v-else>
            <label>{{ zh('主机名') }}<input v-model="form.name" type="text" :placeholder="zh('例如 sz5eap01；多个值用 ; 隔开，可不填')" /></label>
            <label>{{ zh('设备型号 *') }}
              <div ref="modelComboRef" class="asset-combo-field asset-model-combo">
                <input
                  v-model="form.model"
                  type="text"
                  :placeholder="zh('例如 PowerEdge R740')"
                  autocomplete="off"
                  @focus="focusModelField(form.model)"
                  @input="scheduleModelSearch($event.target.value)"
                />
                <div v-if="isModelDropdownVisible()" class="asset-dropdown">
                  <div v-if="modelLoading" class="asset-dropdown-status">{{ zh('搜索型号中…') }}</div>
                  <button
                    v-for="(suggestion, index) in modelSuggestions"
                    :key="`${suggestionModelName(suggestion)}-${suggestion.partNumber}-${index}`"
                    type="button"
                    @click="applyModelSuggestion(suggestion)"
                  >
                    <strong>{{ zh(suggestionModelName(suggestion) || '标准型号') }}</strong>
                    <span>{{ zh(suggestionMetaText(suggestion)) }}</span>
                  </button>
                </div>
              </div>
            </label>
            <label>{{ zh('序列号 SN *') }}<input v-model="form.serialNo" type="text" :placeholder="zh('序列号必填；多个值用 ; 隔开')" /></label>
            <label>{{ zh('MR单') }}<input v-model="form.mrNo" type="text" :placeholder="zh('MR单号，可不填')" /></label>
          </template>
          <label>{{ zh('维保类型') }}
            <select :value="form.maintenanceType" @change="changeMaintenanceType($event.target.value)">
              <option value="none">{{ zh('无维保') }}</option>
              <option value="our_maintenance">{{ zh('我方维保') }}</option>
              <option value="original_manufacturer">{{ zh('原厂维保') }}</option>
            </select>
          </label>
          <label>{{ zh('维保方') }}
            <select v-model="form.maintenancePartyId" :disabled="form.maintenanceType === 'none'">
              <option value="">{{ zh(form.maintenanceType === 'none' ? '无维保' : '选择维保方') }}</option>
              <option v-for="party in filteredMaintenanceParties" :key="party.id" :value="String(party.id)">{{ zh(party.name || '未命名维保方') }}</option>
            </select>
          </label>
          <label>{{ zh('维保开始') }}<input v-model="form.maintenanceStart" type="date" /></label>
          <label>{{ zh('维保截止') }}<input v-model="form.maintenanceEnd" type="date" /></label>
          <label>{{ zh('位置') }}<input v-model="form.location" type="text" :placeholder="zh('安装位置')" /></label>
          <label>{{ zh('状态') }}
            <select v-model="form.status">
              <option value="active">{{ zh('在用') }}</option>
              <option value="inactive">{{ zh('停用') }}</option>
              <option value="maintenance">{{ zh('维保中') }}</option>
              <option value="scrapped">{{ zh('已报废') }}</option>
            </select>
          </label>
          <label>{{ zh('备注') }}<textarea v-model="form.remark" rows="2" :placeholder="zh('补充说明')"></textarea></label>
          <section v-if="!editingId && createMode === 'bulk'" class="asset-editor-batch-section">
            <div class="asset-editor-section-head">
              <div>
                <strong>{{ zh('设备明细 *') }}</strong>
                <p>{{ zh('每行一台设备；空行会自动忽略，行内型号为空时使用上方默认型号。') }}</p>
              </div>
              <button class="ghost" type="button" :disabled="saving" @click="addBatchRow"><PreviewIcon name="new" />{{ zh('添加一行') }}</button>
            </div>
            <div class="asset-editor-batch-table">
              <div class="asset-editor-batch-head">
                <span>{{ zh('主机名') }}</span>
                <span>{{ zh('型号') }}</span>
                <span>{{ zh('SN *') }}</span>
                <span>{{ zh('MR单') }}</span>
                <span></span>
              </div>
              <div
                v-for="(row, index) in batchRows"
                :key="index"
                class="asset-editor-batch-row"
              >
                <input
                  :value="row.name"
                  type="text"
                  :placeholder="zh(`第 ${index + 1} 台主机名；多个值用 ; 隔开`)"
                  @input="updateBatchRow(index, 'name', $event.target.value)"
                />
                <div class="asset-combo-field asset-model-combo">
                  <input
                    :value="row.model"
                    type="text"
                    :placeholder="zh('型号，空则用默认型号')"
                    autocomplete="off"
                    @focus="focusModelField(row.model, batchModelTarget(index))"
                    @input="updateBatchRow(index, 'model', $event.target.value); scheduleModelSearch($event.target.value, batchModelTarget(index))"
                  />
                  <div v-if="isModelDropdownVisible(batchModelTarget(index))" class="asset-dropdown">
                    <div v-if="modelLoading" class="asset-dropdown-status">{{ zh('搜索型号中…') }}</div>
                    <button
                      v-for="(suggestion, suggestionIndex) in modelSuggestions"
                      :key="`${suggestionModelName(suggestion)}-${suggestion.partNumber}-${suggestionIndex}`"
                      type="button"
                      @click="applyModelSuggestion(suggestion, batchModelTarget(index))"
                    >
                      <strong>{{ zh(suggestionModelName(suggestion) || '标准型号') }}</strong>
                      <span>{{ zh(suggestionMetaText(suggestion)) }}</span>
                    </button>
                  </div>
                </div>
                <input
                  :value="row.serialNo"
                  type="text"
                  :placeholder="zh('SN 必填；多个值用 ; 隔开')"
                  @input="updateBatchRow(index, 'serialNo', $event.target.value)"
                />
                <input
                  :value="row.mrNo"
                  type="text"
                  :placeholder="zh('MR单，可不填')"
                  @input="updateBatchRow(index, 'mrNo', $event.target.value)"
                />
                <button class="ghost asset-editor-row-remove" type="button" :disabled="saving" :aria-label="zh(`删除第 ${index + 1} 行`)" @click="removeBatchRow(index)">
                  <PreviewIcon name="trash" />
                </button>
              </div>
            </div>
          </section>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeDialog">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="saveDevice"><PreviewIcon name="save" />{{ zh(saving ? '保存中…' : editingId ? '保存修改' : createMode === 'bulk' ? '批量保存' : '保存') }}</button>
        </footer>
      </div>
    </div>

    <div v-if="importOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('导入设备资产')" @click.self="closeImportDialog">
      <div class="signature-modal-shell asset-editor-shell asset-import-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('设备资产') }}</p>
            <h2>{{ zh('导入设备资产') }}</h2>
          </div>
        </header>
        <p v-if="error" class="form-error">{{ zh(error) }}</p>
        <div class="asset-import-body">
          <section class="asset-import-hint">
            <strong>{{ zh('先导入最小必填信息即可') }}</strong>
            <p>{{ zh('只需先填写客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后可在系统中批量补齐或修改。') }}</p>
            <p>{{ zh('客户名称必须与系统内记录完全一致，否则对应行会导入失败；重复 SN 会自动跳过。') }}</p>
          </section>

          <label class="asset-import-file">{{ zh('Excel 文件 *') }}
            <input
              ref="importFileInputRef"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              :disabled="importing"
              @change="importResult = null; importFile = $event.target.files?.[0] || null"
            />
            <span>{{ zh('单次最多 1000 行，文件不超过 5MB。') }}</span>
          </label>

          <section v-if="importResult?.requiresModelConfirmation && importResult.modelCorrections?.length" class="asset-import-corrections">
            <header>{{ zh(`发现 ${importResult.modelCorrections.length} 行设备型号可自动纠正`) }}</header>
            <div class="asset-import-correction-list">
              <div
                v-for="(item, index) in importResult.modelCorrections"
                :key="`${item.rowNumber}-${item.sn || ''}-${index}`"
                class="asset-import-correction-row"
              >
                <strong>{{ zh(`第 ${item.rowNumber} 行`) }}</strong>
                <span :title="item.inputModel || ''">{{ zh(`原型号：${item.inputModel || '-'}`) }}</span>
                <span :title="item.canonicalModel || ''">{{ zh(`标准型号：${item.canonicalModel || '-'}`) }}</span>
              </div>
            </div>
            <p>{{ zh('确认后，以上行会按标准型号写入；未列出的行保持 Excel 原值。') }}</p>
          </section>

          <section v-else-if="importResult" class="asset-import-summary">
            <div>
              <span>{{ zh('成功导入') }}</span>
              <strong>{{ importResult.created }}</strong>
            </div>
            <div>
              <span>{{ zh('失败行数') }}</span>
              <strong>{{ importResult.failed }}</strong>
            </div>
          </section>

          <section v-if="importResult?.errors?.length" class="asset-import-errors">
            <header>{{ zh('失败明细') }}</header>
            <div class="asset-import-error-list">
              <div
                v-for="(item, index) in importResult.errors"
                :key="`${item.rowNumber}-${item.sn || ''}-${index}`"
                class="asset-import-error-row"
              >
                <strong>{{ zh(`第 ${item.rowNumber} 行`) }}</strong>
                <span>{{ zh(`SN：${item.sn || '-'}`) }}</span>
                <span>{{ zh(item.message || '导入失败') }}</span>
              </div>
            </div>
          </section>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" :disabled="importing" @click="closeImportDialog">{{ zh('关闭') }}</button>
          <button v-if="importResult?.requiresModelConfirmation" class="ghost" type="button" :disabled="importing || !importFile" @click="submitImport('skip')">
            {{ zh('按原型号导入') }}
          </button>
          <button class="ghost" type="button" :disabled="importing" @click="downloadDeviceImportTemplate"><PreviewIcon name="download" />{{ zh('下载模板') }}</button>
          <button class="primary" type="button" :disabled="importing || !importFile" @click="submitImport(importResult?.requiresModelConfirmation ? 'confirm' : 'check')">
            <PreviewIcon name="download" />
            {{ zh(importing ? '导入中…' : importResult?.requiresModelConfirmation ? '自动纠正并导入' : '开始导入') }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="batchEditOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('批量编辑设备')" @click.self="closeBatchEdit">
      <div class="signature-modal-shell asset-editor-shell asset-batch-edit-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('设备资产') }}</p>
            <h2>{{ zh(`批量编辑设备 (${selectedDeviceIds.length} 台)`) }}</h2>
          </div>
        </header>
        <p v-if="error" class="form-error">{{ zh(error) }}</p>
        <div class="asset-editor-form asset-batch-edit-form">
          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.maintenanceType" type="checkbox" />
              <span>{{ zh('维保类型') }}</span>
            </label>
            <select :value="batchEditForm.maintenanceType" :disabled="!batchEditToggles.maintenanceType" @change="changeBatchEditMaintenanceType($event.target.value)">
              <option value="none">{{ zh('无维保') }}</option>
              <option value="our_maintenance">{{ zh('我方维保') }}</option>
              <option value="original_manufacturer">{{ zh('原厂维保') }}</option>
            </select>
          </section>

          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.maintenancePartyId" type="checkbox" />
              <span>{{ zh('维保方') }}</span>
            </label>
            <select v-model="batchEditForm.maintenancePartyId" :disabled="!batchEditToggles.maintenancePartyId || batchEditForm.maintenanceType === 'none'">
              <option value="">{{ zh(batchEditForm.maintenanceType === 'none' ? '无维保' : '选择维保方') }}</option>
              <option v-for="party in filteredBatchEditMaintenanceParties" :key="party.id" :value="String(party.id)">{{ zh(party.name || '未命名维保方') }}</option>
            </select>
          </section>

          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.maintenanceStart" type="checkbox" />
              <span>{{ zh('维保开始日期') }}</span>
            </label>
            <input v-model="batchEditForm.maintenanceStart" type="date" :disabled="!batchEditToggles.maintenanceStart" />
          </section>

          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.maintenanceEnd" type="checkbox" />
              <span>{{ zh('维保截止日期') }}</span>
            </label>
            <input v-model="batchEditForm.maintenanceEnd" type="date" :disabled="!batchEditToggles.maintenanceEnd" />
          </section>

          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.warrantyUntil" type="checkbox" />
              <span>{{ zh('质保截止日期') }}</span>
            </label>
            <input v-model="batchEditForm.warrantyUntil" type="date" :disabled="!batchEditToggles.warrantyUntil" />
          </section>

          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.mrNo" type="checkbox" />
              <span>{{ zh('MR单') }}</span>
            </label>
            <input v-model="batchEditForm.mrNo" type="text" :disabled="!batchEditToggles.mrNo" :placeholder="zh('MR单号，可留空清除')" />
          </section>

          <section class="asset-batch-edit-field">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.location" type="checkbox" />
              <span>{{ zh('安装位置') }}</span>
            </label>
            <input v-model="batchEditForm.location" type="text" :disabled="!batchEditToggles.location" :placeholder="zh('安装位置')" />
          </section>

          <section class="asset-batch-edit-field asset-editor-wide">
            <label class="asset-toggle-row">
              <input v-model="batchEditToggles.remark" type="checkbox" />
              <span>{{ zh('备注') }}</span>
            </label>
            <textarea v-model="batchEditForm.remark" rows="2" :disabled="!batchEditToggles.remark" :placeholder="zh('补充说明')"></textarea>
          </section>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" :disabled="saving" @click="closeBatchEdit">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="submitBatchEdit"><PreviewIcon name="save" />{{ zh(saving ? '保存中…' : '批量保存') }}</button>
        </footer>
      </div>
    </div>
  </main>
</template>
