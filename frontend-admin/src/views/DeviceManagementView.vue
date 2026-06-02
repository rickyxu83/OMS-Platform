<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../services/api'

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
const customerOptions = computed(() => {
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

onMounted(() => {
  filters.value.customerId = String(route.query.customerId || '')
  loadCustomerOptions()
  loadMaintenancePartyOptions()
  load()
})
</script>

<template>
  <section class="figma-page">
    <header class="page-header">
      <div>
        <p class="page-kicker">DEVICE LEDGER</p>
        <h1>设备管理</h1>
        <p>按客户、型号、序列号和维护归属集中查看设备资产。</p>
      </div>
      <div class="page-actions">
        <button class="primary" type="button" @click="openCreateForm">新增设备</button>
        <button class="ghost-button" type="button" @click="resetFilters">重置筛选</button>
        <button class="primary" type="button" :disabled="loading" @click="load">刷新数据</button>
      </div>
    </header>

    <section class="device-filter-grid">
      <label class="field"><span>客户</span><select v-model="filters.customerId" @change="load"><option value="">全部客户</option><option v-for="customer in customerOptions" :key="customer.id" :value="customer.id">{{ customer.name }}</option></select></label>
      <label class="field"><span>型号</span><input v-model.trim="filters.model" placeholder="输入设备型号" @keyup.enter="load" /></label>
      <label class="field"><span>序列号</span><input v-model.trim="filters.serialNo" placeholder="输入序列号" @keyup.enter="load" /></label>
      <label class="field"><span>维护类型</span><select v-model="filters.maintenanceType"><option v-for="[value, label] in maintenanceTypeOptions" :key="value" :value="value">{{ label }}</option></select></label>
      <label class="field"><span>维护方</span><input v-model.trim="filters.maintenanceParty" placeholder="输入维护方名称" @keyup.enter="load" /></label>
      <label class="field"><span>维护截止</span><select v-model="filters.expiry"><option v-for="[value, label] in expiryOptions" :key="value" :value="value">{{ label }}</option></select></label>
    </section>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-else-if="loading" class="muted">正在加载设备资产...</p>

    <section class="kpi-grid">
      <article class="metric-card"><span>筛选后设备</span><strong>{{ stats.total }}</strong><small>当前视图</small></article>
      <article class="metric-card"><span>我方维护</span><strong>{{ stats.ours }}</strong><small>维护类型</small></article>
      <article class="metric-card"><span>需关注到期</span><strong>{{ stats.expiring }}</strong><small>已到期或 30 天内</small></article>
    </section>

    <section class="detail-layout">
      <div class="glass-panel table-card device-table">
        <div class="table-head">
          <span>设备</span>
          <span>客户</span>
          <span>PN / 序列号</span>
          <span>维护类型</span>
          <span>维护方</span>
          <span>维护截止</span>
        </div>
        <button
          v-for="device in filteredDevices"
          :key="device.id"
          class="table-row"
          :class="{ selected: selectedDevice?.id === device.id }"
          type="button"
          @click="selectedDeviceId = device.id"
        >
          <span><strong>{{ device.model }}</strong><small>{{ device.name }} / {{ device.location }}</small></span>
          <span>{{ device.customerName }}</span>
          <span><strong>{{ device.pn }}</strong><small class="mono muted-text">{{ device.serialNo }}</small></span>
          <span><em class="status maintenance-status" :class="device.maintenanceClass">{{ device.maintenanceTypeText }}</em></span>
          <span>{{ device.maintenancePartyName }}</span>
          <span class="muted-text">{{ device.maintenanceEnd }}</span>
        </button>
        <p v-if="!filteredDevices.length && !loading" class="empty-state">暂无匹配设备</p>
      </div>

      <aside class="glass-panel drawer">
        <div class="drawer-head">
          <div>
            <p>{{ formMode ? '设备编辑' : '设备详情' }}</p>
            <h2>{{ formMode ? formTitle : selectedDevice?.model || '请选择设备' }}</h2>
          </div>
          <div class="page-actions">
            <button v-if="formMode" class="ghost-button" type="button" @click="closeDeviceForm">取消</button>
            <button v-else-if="selectedDevice" class="ghost-button" type="button" @click="openEditForm">编辑设备</button>
          </div>
        </div>

        <p v-if="message" class="form-success">{{ message }}</p>

        <template v-if="formMode">
          <form class="drawer-form" @submit.prevent="saveDevice">
            <label class="field wide">
              <span>客户</span>
              <select v-model="deviceForm.customerId">
                <option value="">请选择客户</option>
                <option v-for="customer in customerOptions" :key="customer.id" :value="customer.id">{{ customer.name }}</option>
              </select>
            </label>
            <label class="field wide">
              <span>设备名称</span>
              <input v-model.trim="deviceForm.name" placeholder="输入设备名称" />
            </label>
            <label class="field">
              <span>型号</span>
              <input v-model.trim="deviceForm.model" placeholder="输入设备型号" />
            </label>
            <label class="field">
              <span>部件号 / PN</span>
              <input v-model.trim="deviceForm.pn" placeholder="输入部件号" />
            </label>
            <label class="field">
              <span>序列号</span>
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
              <span>备注</span>
              <textarea v-model.trim="deviceForm.remark" class="drawer-textarea" rows="4" placeholder="补充设备备注"></textarea>
            </label>
            <p v-if="error" class="form-error">{{ error }}</p>
            <div class="page-actions">
              <button class="ghost-button" type="button" :disabled="saving" @click="closeDeviceForm">取消</button>
              <button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存设备' }}</button>
            </div>
          </form>
        </template>

        <template v-else-if="selectedDevice">
          <div class="drawer-stats">
            <article><span>客户</span><strong>{{ selectedDevice.customerName }}</strong></article>
            <article><span>维护归属</span><strong>{{ selectedDevice.maintenanceTone }}</strong></article>
          </div>
          <section class="drawer-section">
            <h3>设备标识</h3>
            <p>名称：{{ selectedDevice.name }}</p>
            <p>型号：{{ selectedDevice.model }}</p>
            <p>部件号：{{ selectedDevice.pn }}</p>
            <p>序列号：{{ selectedDevice.serialNo }}</p>
            <p>位置：{{ selectedDevice.location }}</p>
          </section>
          <section class="drawer-section">
            <h3>维护信息</h3>
            <p>维护方：{{ selectedDevice.maintenancePartyName }}<template v-if="selectedDevice.maintenancePartyPhone"> / {{ selectedDevice.maintenancePartyPhone }}</template></p>
            <p>维护周期：{{ selectedDevice.maintenanceStart }} 至 {{ selectedDevice.maintenanceEnd }}</p>
            <p>质保截止：{{ selectedDevice.warrantyUntil }}</p>
          </section>
          <section class="drawer-section">
            <h3>来源 / 历史上下文</h3>
            <p v-if="selectedDevice.installationSourceServiceOrderId">安装来源工单：#{{ selectedDevice.installationSourceServiceOrderId }}</p>
            <p v-else>暂无安装来源工单记录</p>
            <p>最近更新：{{ selectedDevice.updatedAt }}</p>
            <p>备注：{{ selectedDevice.remark || '未填写' }}</p>
          </section>
        </template>

        <p v-else class="empty-state">请选择一台设备查看详情，或点击“新增设备”创建记录。</p>
      </aside>
    </section>
  </section>
</template>
