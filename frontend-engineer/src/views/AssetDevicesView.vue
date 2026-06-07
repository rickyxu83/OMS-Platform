<script setup>
import { computed, onMounted, ref } from 'vue'
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
const editingId = ref(null)
const form = ref(emptyForm())

const maintenanceLabels = {
  none: '无维护',
  original_manufacturer: '原厂维护',
  our_maintenance: '我方维护',
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
    warrantyUntil: '',
    remark: '',
  }
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
  editingId.value = null
  form.value = { ...emptyForm(), customerId: customerFilter.value || '' }
  dialogOpen.value = true
}

function openEdit(device) {
  editingId.value = device.id
  form.value = {
    customerId: device.customerId ? String(device.customerId) : '',
    name: device.name || '',
    model: device.model || '',
    pn: device.pn || '',
    serialNo: device.serialNo || '',
    maintenanceType: device.maintenanceType || 'none',
    maintenancePartyId: device.maintenancePartyId ? String(device.maintenancePartyId) : '',
    maintenanceStart: inputDate(device.maintenanceStart),
    maintenanceEnd: inputDate(device.maintenanceEnd),
    location: device.location || '',
    warrantyUntil: inputDate(device.warrantyUntil),
    remark: device.remark || '',
  }
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

async function saveDevice() {
  if (!form.value.customerId || !form.value.name.trim()) {
    error.value = '请选择客户并填写设备名称'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      customerId: form.value.customerId,
      name: form.value.name.trim(),
      model: form.value.model.trim(),
      pn: form.value.pn.trim(),
      serialNo: form.value.serialNo.trim(),
      maintenanceType: form.value.maintenanceType,
      maintenancePartyId: form.value.maintenanceType === 'none' ? '' : form.value.maintenancePartyId,
      maintenanceStart: form.value.maintenanceStart,
      maintenanceEnd: form.value.maintenanceEnd,
      location: form.value.location.trim(),
      warrantyUntil: form.value.warrantyUntil,
      remark: form.value.remark.trim(),
    }
    if (editingId.value) await api.put(`/devices/${editingId.value}`, payload)
    else await api.post('/devices', payload)
    dialogOpen.value = false
    await loadDevices()
  } catch (err) {
    error.value = err.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    customerFilter.value = String(route.query.customerId || '')
    await loadBaseData()
    await loadDevices()
  } catch (err) {
    error.value = err.message || '加载失败'
  }
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
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增设备') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在载入设备资产...') }}</p>

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
            <h2>{{ zh(device.name || '未命名设备') }}</h2>
          </div>
          <button class="ghost" type="button" @click.stop="openEdit(device)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
        </header>
        <p class="asset-record-line"><PreviewIcon name="devices" />{{ zh(device.model || '未维护型号') }} · SN: {{ device.serialNo || zh('未维护') }}</p>
        <p class="asset-record-line"><PreviewIcon name="pin" />{{ zh(device.location || '未维护位置') }}</p>
        <div class="asset-meta-row">
          <span>{{ zh(maintenanceLabel(device.maintenanceType)) }}</span>
          <span>{{ zh('维保到期') }}：{{ zh(displayDate(device.maintenanceEnd || device.warrantyUntil)) }}</span>
        </div>
      </article>
      <p v-if="!loading && !filteredDevices.length" class="empty-state">{{ zh('暂无设备资产') }}</p>
    </section>

    <div v-if="dialogOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(editingId ? '编辑设备' : '新增设备')">
      <div class="signature-modal-shell asset-editor-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('设备资产') }}</p>
            <h2>{{ zh(editingId ? '编辑设备' : '新增设备') }}</h2>
          </div>
        </header>
        <div class="asset-editor-form">
          <label>{{ zh('所属客户') }}
            <select v-model="form.customerId">
              <option value="">{{ zh('请选择客户') }}</option>
              <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">{{ zh(customer.name || '未命名客户') }}</option>
            </select>
          </label>
          <label>{{ zh('设备名称') }}<input v-model="form.name" type="text" /></label>
          <label>{{ zh('型号') }}<input v-model="form.model" type="text" /></label>
          <label>{{ zh('PN') }}<input v-model="form.pn" type="text" /></label>
          <label>{{ zh('序列号') }}<input v-model="form.serialNo" type="text" /></label>
          <label>{{ zh('维保类型') }}
            <select v-model="form.maintenanceType">
              <option value="none">{{ zh('无维护') }}</option>
              <option value="original_manufacturer">{{ zh('原厂维护') }}</option>
              <option value="our_maintenance">{{ zh('我方维护') }}</option>
            </select>
          </label>
          <label v-if="form.maintenanceType !== 'none'">{{ zh('维保方') }}
            <select v-model="form.maintenancePartyId">
              <option value="">{{ zh('请选择维保方') }}</option>
              <option v-for="party in parties" :key="party.id" :value="String(party.id)">{{ zh(party.name || '未命名维保方') }}</option>
            </select>
          </label>
          <label>{{ zh('维保开始') }}<input v-model="form.maintenanceStart" type="date" /></label>
          <label>{{ zh('维保结束') }}<input v-model="form.maintenanceEnd" type="date" /></label>
          <label>{{ zh('设备位置') }}<input v-model="form.location" type="text" /></label>
          <label>{{ zh('质保到期') }}<input v-model="form.warrantyUntil" type="date" /></label>
          <label>{{ zh('备注') }}<textarea v-model="form.remark" rows="2"></textarea></label>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeDialog">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="saveDevice"><PreviewIcon name="save" />{{ zh(saving ? '保存中...' : '保存') }}</button>
        </footer>
      </div>
    </div>
  </main>
</template>
