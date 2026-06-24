<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const searchQuery = ref('')
const customerFilter = ref('')
const dialogOpen = ref(false)
const createMode = ref('single')
const editingId = ref(null)
const form = ref(emptyForm())
const batchRows = ref(createInitialBatchRows())
const customerInput = ref('')
const customerDropdownOpen = ref(false)
const customerSearchLoading = ref(false)
const modelSuggestions = ref([])
const modelLoading = ref(false)
const modelDropdownOpen = ref(false)
const modelComboRef = ref(null)

let customerSearchTimer = null
let modelSearchTimer = null

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
    return [item.customerName, item.name, item.model, item.pn, item.serialNo, item.location, item.remark]
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
    maintenanceType: 'none',
    maintenancePartyId: '',
    maintenanceStart: '',
    maintenanceEnd: '',
    location: '',
    status: 'active',
    remark: '',
  }
}

function createEmptyBatchRow() {
  return {
    name: '',
    model: '',
    serialNo: '',
  }
}

function createInitialBatchRows(count = 3) {
  return Array.from({ length: count }, () => createEmptyBatchRow())
}

function batchRowHasInput(row) {
  return Boolean(row.name.trim() || row.model.trim() || row.serialNo.trim())
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
  createMode.value = 'single'
  editingId.value = device.id
  const maintenanceType = canonicalMaintenanceType(device.maintenanceType)
  form.value = {
    customerId: device.customerId ? String(device.customerId) : '',
    name: device.name || '',
    model: device.model || '',
    pn: device.pn || '',
    serialNo: device.serialNo || '',
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

function addBatchRow() {
  batchRows.value = [...batchRows.value, createEmptyBatchRow()]
}

function removeBatchRow(index) {
  const next = batchRows.value.filter((_, rowIndex) => rowIndex !== index)
  batchRows.value = next.length ? next : [createEmptyBatchRow()]
}

function changeMaintenanceType(value) {
  const type = canonicalMaintenanceType(value)
  form.value.maintenanceType = type
  form.value.maintenancePartyId = resolveMaintenancePartyId(type, form.value.maintenancePartyId)
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

async function saveDevice() {
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
  if (!form.value.model.trim()) {
    error.value = '请输入设备型号'
    return
  }
  saving.value = true
  error.value = ''
  let createdCount = 0
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
        await api.post('/devices', {
          ...commonPayload,
          name: row.name || null,
          model: row.model,
          serialNo: row.serialNo || undefined,
        })
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
      }
      if (editingId.value) await api.put(`/devices/${editingId.value}`, payload)
      else await api.post('/devices', payload)
    }
    dialogOpen.value = false
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

function scheduleModelSearch(value) {
  window.clearTimeout(modelSearchTimer)
  const keyword = String(value || '').trim()
  if (keyword.length < 2) {
    modelSuggestions.value = []
    modelDropdownOpen.value = false
    return
  }
  modelDropdownOpen.value = true
  modelSearchTimer = window.setTimeout(async () => {
    modelLoading.value = true
    try {
      const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`)
      modelSuggestions.value = data?.items || []
    } catch {
      modelSuggestions.value = []
    } finally {
      modelLoading.value = false
    }
  }, 250)
}

function applyModelSuggestion(suggestion) {
  form.value.model = suggestion.canonicalModel || suggestion.officialName || form.value.model
  form.value.pn = suggestion.partNumber || form.value.pn
  modelSuggestions.value = []
  modelDropdownOpen.value = false
}

function handleModelOutsidePointer(event) {
  if (!modelDropdownOpen.value) return
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
        <input v-model="searchQuery" type="search" :placeholder="zh('搜索设备、型号、序列号、客户')" @keydown.enter="loadDevices" />
      </label>
      <select v-model="customerFilter" class="asset-select" @change="loadDevices">
        <option value="">{{ zh('全部客户') }}</option>
        <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">{{ zh(customer.name || '未命名客户') }}</option>
      </select>
      <button class="ghost" type="button" :disabled="loading" @click="loadDevices"><PreviewIcon name="refresh" />{{ zh('刷新') }}</button>
      <button class="ghost" type="button" @click="openBulkCreate"><PreviewIcon name="new" />{{ zh('批量新增') }}</button>
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增设备') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
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
          <div>
            <span class="asset-record-kicker">{{ zh(device.customerName || '未关联客户') }}</span>
            <h2>{{ zh(deviceDisplayName(device)) }}</h2>
          </div>
          <button class="ghost" type="button" @click.stop="openEdit(device)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
        </header>
        <p class="asset-record-line">
          <PreviewIcon name="devices" />
          <span class="asset-ellipsis" :title="`${device.model || '未维护型号'} · SN: ${device.serialNo || '未维护'}`">{{ zh(device.model || '未维护型号') }} · SN: {{ device.serialNo || zh('未维护') }}</span>
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
            <div ref="modelComboRef" class="asset-combo-field">
              <input
                v-model="form.model"
                type="text"
                :placeholder="zh('同型号设备可在这里填一次，每行也可单独覆盖')"
                autocomplete="off"
                @focus="modelDropdownOpen = Boolean(modelLoading || modelSuggestions.length)"
                @input="scheduleModelSearch(form.model)"
              />
              <div v-if="modelDropdownOpen && (modelLoading || modelSuggestions.length)" class="asset-dropdown">
                <div v-if="modelLoading" class="asset-dropdown-status">{{ zh('搜索型号中…') }}</div>
                <button
                  v-for="(suggestion, index) in modelSuggestions"
                  :key="`${suggestion.canonicalModel || suggestion.officialName}-${suggestion.partNumber}-${index}`"
                  type="button"
                  @click="applyModelSuggestion(suggestion)"
                >
                  <strong>{{ zh(suggestion.canonicalModel || suggestion.officialName || '标准型号') }}</strong>
                  <span>{{ zh([suggestion.brand || suggestion.vendor, suggestion.partNumber, suggestion.category].filter(Boolean).join(' · ') || '标准型号') }}</span>
                </button>
              </div>
            </div>
          </label>
          <template v-else>
            <label>{{ zh('主机名') }}<input v-model="form.name" type="text" :placeholder="zh('例如 sz5eap01；多个值用 ; 隔开，可不填')" /></label>
            <label>{{ zh('设备型号 *') }}
              <div ref="modelComboRef" class="asset-combo-field">
                <input
                  v-model="form.model"
                  type="text"
                  :placeholder="zh('例如 PowerEdge R740')"
                  autocomplete="off"
                  @focus="modelDropdownOpen = Boolean(modelLoading || modelSuggestions.length)"
                  @input="scheduleModelSearch(form.model)"
                />
                <div v-if="modelDropdownOpen && (modelLoading || modelSuggestions.length)" class="asset-dropdown">
                  <div v-if="modelLoading" class="asset-dropdown-status">{{ zh('搜索型号中…') }}</div>
                  <button
                    v-for="(suggestion, index) in modelSuggestions"
                    :key="`${suggestion.canonicalModel || suggestion.officialName}-${suggestion.partNumber}-${index}`"
                    type="button"
                    @click="applyModelSuggestion(suggestion)"
                  >
                    <strong>{{ zh(suggestion.canonicalModel || suggestion.officialName || '标准型号') }}</strong>
                    <span>{{ zh([suggestion.brand || suggestion.vendor, suggestion.partNumber, suggestion.category].filter(Boolean).join(' · ') || '标准型号') }}</span>
                  </button>
                </div>
              </div>
            </label>
            <label>{{ zh('序列号 SN *') }}<input v-model="form.serialNo" type="text" :placeholder="zh('序列号必填；多个值用 ; 隔开')" /></label>
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
                <input
                  :value="row.model"
                  type="text"
                  :placeholder="zh('型号，空则用默认型号')"
                  @input="updateBatchRow(index, 'model', $event.target.value)"
                />
                <input
                  :value="row.serialNo"
                  type="text"
                  :placeholder="zh('SN 必填；多个值用 ; 隔开')"
                  @input="updateBatchRow(index, 'serialNo', $event.target.value)"
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
  </main>
</template>
