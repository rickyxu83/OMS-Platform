<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import DetailPanel from '../components/admin/DetailPanel.vue'
import EmptyState from '../components/admin/EmptyState.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import { useRoute } from 'vue-router'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const devices = ref([])
const customerDirectory = ref([])
const maintenancePartyDirectory = ref([])
const selectedDeviceId = ref('')
const formMode = ref('')
const editingDeviceId = ref('')
const filters = ref({
  customerId: '',
  model: '',
  serialNo: '',
  maintenanceType: '',
  maintenanceParty: '',
  expiry: '',
})
const deviceForm = reactive({
  customerId: '',
  name: '',
  model: '',
  pn: '',
  serialNo: '',
  remark: '',
  maintenanceType: 'none',
  maintenancePartyId: '',
  maintenanceStart: '',
  maintenanceEnd: '',
  location: '',
  warrantyUntil: '',
})

const maintenanceTypeOptions = [
  ['', '全部维护类型'],
  ['none', '无维护'],
  ['original_manufacturer', '原厂维护'],
  ['our_maintenance', '我方维护'],
]
const expiryOptions = [
  ['', '全部到期状态'],
  ['expired', '已到期'],
  ['within30', '30 天内到期'],
  ['valid', '维护期内'],
  ['noEnd', '未设置维护截止'],
]
const maintenanceTypeMeta = {
  none: { label: '无维护', className: 'maintenance-none', tone: '中性记录' },
  original_manufacturer: { label: '原厂维护', className: 'maintenance-original', tone: '外部原厂' },
  our_maintenance: { label: '我方维护', className: 'maintenance-ours', tone: '内部维护' },
}
const currentUser = getCurrentUser()
const savingCatalog = ref(false)
const catalogCategoryOptions = [
  ['server', '服务器'],
  ['storage', '存储'],
  ['network', '网络'],
]
const catalogForm = reactive({
  brand: '',
  category: 'network',
  canonicalModel: '',
  partNumber: '',
  aliases: '',
})
const canManageCatalog = computed(() => ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor'].includes(currentUser?.role))

function formatDate(value) {
  return String(value || '').replace('T', ' ').slice(0, 10) || '-'
}

function inputDate(value) {
  return String(value || '').slice(0, 10)
}

function isExpired(value) {
  if (!value) return false
  return new Date(`${String(value).slice(0, 10)}T23:59:59`).getTime() < Date.now()
}

function isWithinDays(value, days) {
  if (!value) return false
  const now = Date.now()
  const target = new Date(`${String(value).slice(0, 10)}T23:59:59`).getTime()
  return target >= now && target <= now + days * 24 * 60 * 60 * 1000
}

function normalizeDevice(device) {
  const maintenanceType = device.maintenanceType || 'none'
  return {
    raw: device,
    id: device.id,
    customerId: device.customerId,
    customerName: device.customerName || '-',
    name: device.name || '-',
    model: device.model || '-',
    pn: device.pn || '-',
    serialNo: device.serialNo || '-',
    remark: device.remark || '',
    maintenanceType,
    maintenanceTypeText: maintenanceTypeMeta[maintenanceType]?.label || maintenanceType,
    maintenanceClass: maintenanceTypeMeta[maintenanceType]?.className || 'maintenance-none',
    maintenanceTone: maintenanceTypeMeta[maintenanceType]?.tone || '维护记录',
    maintenancePartyId: device.maintenancePartyId || '',
    maintenancePartyName: device.maintenancePartyName || device.maintenanceParty?.name || (maintenanceType === 'none' ? '不适用' : '未指定'),
    maintenancePartyPhone: device.maintenancePartyPhone || device.maintenanceParty?.phone || '',
    maintenanceStart: formatDate(device.maintenanceStart),
    maintenanceEnd: formatDate(device.maintenanceEnd),
    maintenanceEndRaw: device.maintenanceEnd || '',
    installationSourceServiceOrderId: device.installationSourceServiceOrderId || '',
    location: device.location || '-',
    warrantyUntil: formatDate(device.warrantyUntil),
    createdAt: formatDate(device.createdAt),
    updatedAt: formatDate(device.updatedAt),
  }
}

function resetDeviceForm(customerId = '') {
  Object.assign(deviceForm, {
    customerId,
    name: '',
    model: '',
    pn: '',
    serialNo: '',
    remark: '',
    maintenanceType: 'none',
    maintenancePartyId: '',
    maintenanceStart: '',
    maintenanceEnd: '',
    location: '',
    warrantyUntil: '',
  })
}

function fillDeviceForm(device) {
  Object.assign(deviceForm, {
    customerId: String(device.customerId || ''),
    name: device.raw.name || '',
    model: device.raw.model || '',
    pn: device.raw.pn || '',
    serialNo: device.raw.serialNo || '',
    remark: device.raw.remark || '',
    maintenanceType: device.maintenanceType || 'none',
    maintenancePartyId: device.maintenanceType === 'none' ? '' : String(device.maintenancePartyId || ''),
    maintenanceStart: inputDate(device.raw.maintenanceStart),
    maintenanceEnd: inputDate(device.raw.maintenanceEnd),
    location: device.raw.location || '',
    warrantyUntil: inputDate(device.raw.warrantyUntil),
  })
}

function includesText(value, keyword) {
  return String(value || '').toLowerCase().includes(keyword.toLowerCase())
}

function matchesExpiry(device) {
  const expiry = filters.value.expiry
  if (!expiry) return true
  if (expiry === 'noEnd') return !device.maintenanceEndRaw
  if (expiry === 'expired') return isExpired(device.maintenanceEndRaw)
  if (expiry === 'within30') return isWithinDays(device.maintenanceEndRaw, 30)
  if (expiry === 'valid') return Boolean(device.maintenanceEndRaw) && !isExpired(device.maintenanceEndRaw)
  return true
}

function guessCatalogBrand(model = '') {
  const text = String(model || '').trim()
  if (/^Dell EMC\b/i.test(text)) return 'Dell EMC'
  if (/^Dell\b/i.test(text)) return 'Dell'
  if (/^HPE\b/i.test(text)) return 'HPE'
  if (/^HP\b/i.test(text)) return 'HP'
  if (/^Lenovo\b/i.test(text)) return 'Lenovo'
  if (/^IBM\b/i.test(text)) return 'IBM'
  if (/^NetApp\b/i.test(text)) return 'NetApp'
  if (/^Huawei\b/i.test(text)) return 'Huawei'
  if (/^H3C\b/i.test(text)) return 'H3C'
  if (/^Cisco\b/i.test(text)) return 'Cisco'
  if (/^F5\b/i.test(text)) return 'F5'
  if (/^Brocade\b/i.test(text)) return 'Brocade'
  return ''
}

function guessCatalogCategory(device = {}) {
  const text = `${device?.raw?.model || device?.model || ''} ${device?.raw?.name || device?.name || ''}`.toLowerCase()
  if (/oceanstor|dorado|powerstore|unity|vsp|netapp|aff|fas|ts-h|synology|qnap|me\d+/i.test(text)) return 'storage'
  if (/switch|router|nexus|catalyst|cloudengine|s\d{3,}|h3c|brocade|f5|fortigate|firewall/i.test(text)) return 'network'
  return 'server'
}

function resetCatalogForm(device = null) {
  Object.assign(catalogForm, {
    brand: guessCatalogBrand(device?.raw?.model || device?.model || ''),
    category: guessCatalogCategory(device),
    canonicalModel: String(device?.raw?.model || device?.model || '').trim(),
    partNumber: String(device?.raw?.pn || device?.pn || '').trim(),
    aliases: '',
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (filters.value.customerId) params.set('customerId', filters.value.customerId)
    const data = await api.get(`/devices${params.toString() ? `?${params}` : ''}`)
    devices.value = (data.items || []).map(normalizeDevice)
    selectedDeviceId.value = filteredDevices.value.some((device) => device.id === selectedDeviceId.value)
      ? selectedDeviceId.value
      : filteredDevices.value[0]?.id || devices.value[0]?.id || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadCustomerOptions() {
  try {
    const data = await api.get('/customers?pageSize=200')
    customerDirectory.value = (data.items || []).map((customer) => ({
      id: String(customer.id),
      name: customer.name || `客户 #${customer.id}`,
    }))
  } catch {
    customerDirectory.value = []
  }
}

async function loadMaintenancePartyOptions() {
  try {
    const data = await api.get('/maintenance-parties')
    maintenancePartyDirectory.value = (data.items || []).map((party) => ({
      id: String(party.id),
      name: party.name || `维保方 #${party.id}`,
      partyType: party.partyType || 'our_maintenance',
    }))
  } catch {
    maintenancePartyDirectory.value = []
  }
}

function resetFilters() {
  filters.value = {
    customerId: '',
    model: '',
    serialNo: '',
    maintenanceType: '',
    maintenanceParty: '',
    expiry: '',
  }
  load()
}

function openCreateForm() {
  error.value = ''
  message.value = ''
  editingDeviceId.value = ''
  resetDeviceForm(String(filters.value.customerId || selectedDevice.value?.customerId || ''))
  formMode.value = 'create'
}

function openEditForm() {
  if (!selectedDevice.value) return
  error.value = ''
  message.value = ''
  editingDeviceId.value = selectedDevice.value.id
  fillDeviceForm(selectedDevice.value)
  formMode.value = 'edit'
}

function closeDeviceForm() {
  formMode.value = ''
  editingDeviceId.value = ''
}

function toggleSelectedDevice(deviceId) {
  selectedDeviceId.value = selectedDeviceId.value === deviceId ? '' : deviceId
}

function nullableText(value) {
  const text = String(value || '').trim()
  return text || null
}

function devicePayload() {
  const maintenanceType = deviceForm.maintenanceType || 'none'
  return {
    customerId: deviceForm.customerId,
    name: deviceForm.name.trim(),
    model: nullableText(deviceForm.model),
    pn: nullableText(deviceForm.pn),
    serialNo: nullableText(deviceForm.serialNo),
    remark: nullableText(deviceForm.remark),
    maintenanceType,
    maintenancePartyId: maintenanceType === 'none' ? null : nullableText(deviceForm.maintenancePartyId),
    maintenanceStart: nullableText(deviceForm.maintenanceStart),
    maintenanceEnd: nullableText(deviceForm.maintenanceEnd),
    location: nullableText(deviceForm.location),
    warrantyUntil: nullableText(deviceForm.warrantyUntil),
  }
}

async function syncSelectedDeviceToCatalog() {
  if (!selectedDevice.value) return
  if (!canManageCatalog.value) {
    error.value = '当前账号没有写入型号库权限'
    return
  }
  if (!catalogForm.brand.trim() || !catalogForm.canonicalModel.trim()) {
    error.value = '请先补充品牌和标准型号'
    return
  }
  savingCatalog.value = true
  error.value = ''
  message.value = ''
  try {
    const aliases = String(catalogForm.aliases || '')
      .split(/\r?\n|,/) 
      .map((item) => item.trim())
      .filter(Boolean)
    await api.post('/device-model-catalog/entries', {
      brand: catalogForm.brand.trim(),
      category: catalogForm.category,
      canonicalModel: catalogForm.canonicalModel.trim(),
      partNumber: catalogForm.partNumber.trim(),
      aliases,
    })
    message.value = '已写入型号库，后续安装单可直接联动'
  } catch (err) {
    error.value = err.message
  } finally {
    savingCatalog.value = false
  }
}

async function saveDevice() {
  if (!deviceForm.customerId || !deviceForm.name.trim()) {
    error.value = '客户和设备名称不能为空'
    return
  }
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = devicePayload()
    let savedId = editingDeviceId.value
    if (formMode.value === 'create') {
      const data = await api.post('/devices', payload)
      savedId = data.id
      message.value = '设备已新增'
    } else {
      await api.put(`/devices/${editingDeviceId.value}`, payload)
      message.value = '设备资料已保存'
    }
    filters.value.customerId = String(payload.customerId || '')
    closeDeviceForm()
    await load()
    if (savedId) selectedDeviceId.value = savedId
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

const filteredDevices = computed(() => devices.value.filter((device) => {
  const model = filters.value.model.trim()
  const serialNo = filters.value.serialNo.trim()
  const party = filters.value.maintenanceParty.trim()
  if (model && !includesText(device.model, model)) return false
  if (serialNo && !includesText(device.serialNo, serialNo)) return false
  if (filters.value.maintenanceType && device.maintenanceType !== filters.value.maintenanceType) return false
  if (party && !includesText(device.maintenancePartyName, party)) return false
  return matchesExpiry(device)
}))
const selectedDevice = computed(() => filteredDevices.value.find((device) => device.id === selectedDeviceId.value) || filteredDevices.value[0] || null)
const filterCustomerOptions = computed(() => {
  const map = new Map()
  devices.value.forEach((device) => {
    if (device.customerId) map.set(String(device.customerId), device.customerName)
  })
  return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const formCustomerOptions = computed(() => {
  const map = new Map()
  customerDirectory.value.forEach((customer) => {
    if (customer.id) map.set(String(customer.id), customer.name)
  })
  devices.value.forEach((device) => {
    if (device.customerId) map.set(String(device.customerId), device.customerName)
  })
  return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const maintenancePartyOptions = computed(() => {
  const map = new Map()
  maintenancePartyDirectory.value.forEach((party) => {
    if (party.id) {
      const label = party.partyType === 'original_manufacturer' ? '原厂联系人' : '合作维保方'
      map.set(String(party.id), `${party.name}（${label}）`)
    }
  })
  devices.value.forEach((device) => {
    if (device.maintenancePartyId && device.maintenancePartyName !== '不适用' && !map.has(String(device.maintenancePartyId))) {
      map.set(String(device.maintenancePartyId), device.maintenancePartyName)
    }
  })
  return Array.from(map, ([id, name]) => ({ id, name }))
})
const stats = computed(() => ({
  total: filteredDevices.value.length,
  ours: filteredDevices.value.filter((device) => device.maintenanceType === 'our_maintenance').length,
  original: filteredDevices.value.filter((device) => device.maintenanceType === 'original_manufacturer').length,
  expiring: filteredDevices.value.filter((device) => isWithinDays(device.maintenanceEndRaw, 30) || isExpired(device.maintenanceEndRaw)).length,
}))
const formTitle = computed(() => (formMode.value === 'create' ? '新增设备' : '编辑设备'))

watch(() => deviceForm.maintenanceType, (maintenanceType) => {
  if (maintenanceType === 'none') deviceForm.maintenancePartyId = ''
})

watch(() => route.query.customerId, (customerId) => {
  filters.value.customerId = String(customerId || '')
  load()
})

watch(filteredDevices, (items) => {
  if (!items.some((device) => device.id === selectedDeviceId.value)) {
    selectedDeviceId.value = items[0]?.id || ''
  }
})

watch(selectedDevice, (device) => {
  resetCatalogForm(device)
}, { immediate: true })

onMounted(() => {
  filters.value.customerId = String(route.query.customerId || '')
  loadCustomerOptions()
  loadMaintenancePartyOptions()
  load()
})
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="DEVICE LEDGER" title="设备管理" description="按客户、型号、序列号和维护归属集中查看设备资产。">
      <template #actions>
        <button class="primary" type="button" @click="openCreateForm">新增设备</button>
        <button class="ghost-button" type="button" @click="resetFilters">重置筛选</button>
        <button class="primary" type="button" :disabled="loading" @click="load">刷新数据</button>
      </template>
    </PageHeader>

    <FilterBar v-model:query="filters.model" search-placeholder="搜索设备名称、型号、序列号..." @submit="load">
      <label class="field"><span>客户</span><select v-model="filters.customerId" @change="load"><option value="">全部客户</option><option v-for="customer in filterCustomerOptions" :key="customer.id" :value="customer.id">{{ customer.name }}</option></select></label>
      <label class="field"><span>序列号</span><input v-model.trim="filters.serialNo" placeholder="输入序列号" @keyup.enter="load" /></label>
      <label class="field"><span>维护类型</span><select v-model="filters.maintenanceType"><option v-for="[value, label] in maintenanceTypeOptions" :key="value" :value="value">{{ label }}</option></select></label>
      <label class="field"><span>维护方</span><input v-model.trim="filters.maintenanceParty" placeholder="输入维护方名称" @keyup.enter="load" /></label>
      <label class="field"><span>维护截止</span><select v-model="filters.expiry"><option v-for="[value, label] in expiryOptions" :key="value" :value="value">{{ label }}</option></select></label>
    </FilterBar>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-else-if="loading" class="muted">正在加载设备资产...</p>

    <section class="kpi-grid">
      <KpiCard title="筛选后设备" :value="stats.total" subtitle="当前视图" icon="asset" />
      <KpiCard title="我方维护" :value="stats.ours" subtitle="维护类型" icon="activity" />
      <KpiCard title="需关注到期" :value="stats.expiring" subtitle="已到期或 30 天内" icon="warn" />
    </section>

    <section class="detail-layout">
      <div class="glass-panel table-card device-table">
        <div class="table-head">
          <span>设备型号 / Model</span>
          <span>客户</span>
          <span>部件号 / PN · 序列号 / SN</span>
          <span>维护类型</span>
          <span>维护方</span>
          <span>维护截止</span>
        </div>
        <template v-for="device in filteredDevices" :key="device.id">
          <button
            class="table-row"
            :class="{ selected: selectedDevice?.id === device.id }"
            type="button"
            @click="toggleSelectedDevice(device.id)"
          >
            <span><strong>{{ device.model }}</strong><small>位置：{{ device.location }}</small></span>
            <span>{{ device.customerName }}</span>
            <span><strong>{{ device.pn }}</strong><small class="mono muted-text">{{ device.serialNo }}</small></span>
            <span><em class="status maintenance-status" :class="device.maintenanceClass">{{ device.maintenanceTypeText }}</em></span>
            <span>{{ device.maintenancePartyName }}</span>
            <span class="muted-text">{{ device.maintenanceEnd }}</span>
          </button>
          <div v-if="selectedDevice?.id === device.id && !formMode" class="drawer-section">
            <div class="drawer-head">
              <div>
                <p>设备详情</p>
                <h2>{{ device.model || device.name }}</h2>
              </div>
              <div class="page-actions">
                <button class="ghost-button" type="button" @click="openEditForm">编辑设备</button>
                <button v-if="canManageCatalog" class="ghost-button" type="button" :disabled="savingCatalog" @click="syncSelectedDeviceToCatalog">
                  {{ savingCatalog ? '写入中...' : '写入型号库' }}
                </button>
              </div>
            </div>
            <div class="drawer-stats">
              <article><span>客户</span><strong>{{ device.customerName }}</strong></article>
              <article><span>维护归属</span><strong>{{ device.maintenanceTone }}</strong></article>
            </div>
            <section class="drawer-section">
              <h3>设备标识</h3>
              <p>名称：{{ device.name }}</p>
              <p>设备型号 / Model：{{ device.model }}</p>
              <p>部件号 / PN：{{ device.pn }}</p>
              <p>序列号 / SN：{{ device.serialNo }}</p>
              <p>位置：{{ device.location }}</p>
            </section>
            <section v-if="canManageCatalog" class="drawer-section">
              <h3>写入型号库</h3>
              <div class="drawer-form">
                <label class="field">
                  <span>品牌</span>
                  <input v-model.trim="catalogForm.brand" placeholder="例如 Huawei / H3C / Dell" />
                </label>
                <label class="field">
                  <span>分类</span>
                  <select v-model="catalogForm.category">
                    <option v-for="[value, label] in catalogCategoryOptions" :key="value" :value="value">{{ label }}</option>
                  </select>
                </label>
                <label class="field wide">
                  <span>标准型号 / Model</span>
                  <input v-model.trim="catalogForm.canonicalModel" placeholder="与工程师安装单中的设备型号保持一致" />
                </label>
                <label class="field">
                  <span>部件号 / PN</span>
                  <input v-model.trim="catalogForm.partNumber" placeholder="没有可留空" />
                </label>
                <label class="field wide">
                  <span>附加别名</span>
                  <textarea v-model.trim="catalogForm.aliases" class="drawer-textarea" rows="3" placeholder="一行一个，或用逗号分隔"></textarea>
                </label>
              </div>
              <p class="drawer-note">这里写入的是标准型号库，用于后续工程师安装单自动补全和 PN 联动，不会影响现有设备台账记录。</p>
            </section>
            <section class="drawer-section">
              <h3>维护信息</h3>
              <p>维护方：{{ device.maintenancePartyName }}<template v-if="device.maintenancePartyPhone"> / {{ device.maintenancePartyPhone }}</template></p>
              <p>维护周期：{{ device.maintenanceStart }} 至 {{ device.maintenanceEnd }}</p>
              <p>质保截止：{{ device.warrantyUntil }}</p>
            </section>
            <section class="drawer-section">
              <h3>来源 / 历史上下文</h3>
              <p v-if="device.installationSourceServiceOrderId">安装来源工单：#{{ device.installationSourceServiceOrderId }}</p>
              <p v-else>暂无安装来源工单记录</p>
              <p>最近更新：{{ device.updatedAt }}</p>
              <p>备注：{{ device.remark || '未填写' }}</p>
            </section>
          </div>
        </template>
        <EmptyState v-if="!filteredDevices.length && !loading" title="暂无匹配设备" description="请尝试调整筛选条件或新增设备。" />
      </div>

      <DetailPanel v-if="formMode" subtitle="设备编辑" :title="formTitle">

        <p v-if="message" class="form-success">{{ message }}</p>
        <form class="drawer-form" @submit.prevent="saveDevice">
          <label class="field wide">
            <span>客户</span>
            <select v-model="deviceForm.customerId">
              <option value="">请选择客户</option>
              <option v-for="customer in formCustomerOptions" :key="customer.id" :value="customer.id">{{ customer.name }}</option>
            </select>
          </label>
          <label class="field wide">
            <span>设备名称</span>
            <input v-model.trim="deviceForm.name" placeholder="输入设备名称" />
          </label>
          <label class="field">
            <span>设备型号 / Model</span>
            <input v-model.trim="deviceForm.model" placeholder="输入设备型号" />
          </label>
          <label class="field">
            <span>部件号 / PN</span>
            <input v-model.trim="deviceForm.pn" placeholder="输入部件号" />
          </label>
          <label class="field">
            <span>序列号 / SN</span>
            <input v-model.trim="deviceForm.serialNo" placeholder="输入序列号" />
          </label>
          <label class="field">
            <span>维护类型</span>
            <select v-model="deviceForm.maintenanceType">
              <option v-for="[value, label] in maintenanceTypeOptions.slice(1)" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <label class="field">
            <span>维护方</span>
            <select v-model="deviceForm.maintenancePartyId" :disabled="deviceForm.maintenanceType === 'none'">
              <option value="">{{ deviceForm.maintenanceType === 'none' ? '无维护不需要维护方' : '请选择维护方' }}</option>
              <option v-for="party in maintenancePartyOptions" :key="party.id" :value="party.id">{{ party.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>维护开始</span>
            <input v-model="deviceForm.maintenanceStart" type="date" />
          </label>
          <label class="field">
            <span>维护截止</span>
            <input v-model="deviceForm.maintenanceEnd" type="date" />
          </label>
          <label class="field">
            <span>位置</span>
            <input v-model.trim="deviceForm.location" placeholder="输入安装位置" />
          </label>
          <label class="field">
            <span>质保截止</span>
            <input v-model="deviceForm.warrantyUntil" type="date" />
          </label>
          <label class="field wide">
            <span>备注 / Remark</span>
            <textarea v-model.trim="deviceForm.remark" class="drawer-textarea" rows="4" placeholder="补充备注"></textarea>
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
        </form>
        <template #footer>
          <div class="page-actions">
            <button class="ghost-button" type="button" :disabled="saving" @click="closeDeviceForm">取消</button>
            <button class="primary" type="button" :disabled="saving" @click="saveDevice">{{ saving ? '保存中...' : '保存设备' }}</button>
          </div>
        </template>
      </DetailPanel>
    </section>
  </section>
</template>
