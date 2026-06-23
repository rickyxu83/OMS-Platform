<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const route = useRoute()
const router = useRouter()
const customer = ref(null)
const devices = ref([])
const partyDetails = ref({})
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const locating = ref(false)
const error = ref('')
const saveMessage = ref('')
const deleteError = ref('')
const deleteConfirmOpen = ref(false)
const geoCandidates = ref([])
const form = ref(emptyForm())

const customerId = computed(() => route.params.id)
const hasCoordinates = computed(() => Number.isFinite(Number(form.value.latitude)) && Number.isFinite(Number(form.value.longitude)))

function emptyForm() {
  return {
    name: '',
    address: '',
    contactName: '',
    contactPhone: '',
    code: '',
    salesperson: '',
    level: 'normal',
    remark: '',
    latitude: null,
    longitude: null,
    mapProvider: '',
    mapPoiId: '',
    mapPoiName: '',
    mapAddress: '',
    contacts: [{ name: '', phone: '' }],
  }
}

function contactsFor(item) {
  const contacts = Array.isArray(item?.contacts) ? item.contacts : []
  if (contacts.length) return contacts
  if (item?.contactName || item?.contactPhone) return [{ name: item.contactName || '联系人', phone: item.contactPhone || '' }]
  return []
}

function fillForm(item) {
  const contacts = contactsFor(item)
  form.value = {
    name: item?.name || '',
    address: item?.address || item?.mapAddress || '',
    contactName: item?.contactName || contacts[0]?.name || '',
    contactPhone: item?.contactPhone || contacts[0]?.phone || '',
    code: item?.code || '',
    salesperson: item?.salesperson || '',
    level: item?.level || 'normal',
    remark: item?.remark || '',
    latitude: item?.latitude ?? null,
    longitude: item?.longitude ?? null,
    mapProvider: item?.mapProvider || '',
    mapPoiId: item?.mapPoiId || '',
    mapPoiName: item?.mapPoiName || '',
    mapAddress: item?.mapAddress || '',
    contacts: contacts.length ? contacts.map((contact) => ({ id: contact.id, name: contact.name || '', phone: contact.phone || '' })) : [{ name: '', phone: '' }],
  }
}

function displayDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 10) : '未维护'
}

function maintenanceTypeLabel(value) {
  const labels = { none: '无维护', original_manufacturer: '原厂维护', vendor: '原厂维护', our_maintenance: '我方维护', our: '我方维护' }
  return labels[value || 'none'] || value || '未维护'
}

function deviceDisplayName(device) {
  if (!device) return ''
  return device.model || device.name || device.serialNo || `设备 #${device.id}`
}

function warrantyDate(device) {
  return device.maintenanceEnd || device.warrantyUntil || ''
}

function warrantyStatus(device) {
  if (!device || device.maintenanceType === 'none') return { label: '无维护', className: 'neutral' }
  const date = warrantyDate(device)
  if (!date) return { label: '未维护到期', className: 'warning' }
  const end = new Date(String(date).slice(0, 10)).getTime()
  if (!Number.isFinite(end)) return { label: '未维护到期', className: 'warning' }
  return end >= Date.now() - 24 * 60 * 60 * 1000 ? { label: '在保', className: 'success' } : { label: '已过保', className: 'danger' }
}

function partyFor(device) {
  return partyDetails.value[String(device.maintenancePartyId || '')] || {}
}

function partyContactLine(device) {
  const party = partyFor(device)
  const contact = party.contact || ''
  const phone = party.phone || device.maintenancePartyPhone || ''
  if (!device.maintenancePartyName && !contact && !phone) return '未关联维保方'
  return [device.maintenancePartyName, contact, phone].filter(Boolean).join(' · ')
}

function addContact() {
  form.value.contacts.push({ name: '', phone: '' })
}

function removeContact(index) {
  if (form.value.contacts.length <= 1) {
    form.value.contacts = [{ name: '', phone: '' }]
    return
  }
  form.value.contacts.splice(index, 1)
}

async function loadPartyDetails(items) {
  const ids = [...new Set(items.map((item) => Number(item.maintenancePartyId || 0)).filter(Boolean))]
  const pairs = await Promise.all(ids.map(async (id) => {
    try {
      const data = await api.get(`/maintenance-parties/${id}`)
      return [String(id), data?.item || {}]
    } catch {
      return [String(id), {}]
    }
  }))
  partyDetails.value = Object.fromEntries(pairs)
}

async function loadDetail() {
  loading.value = true
  error.value = ''
  saveMessage.value = ''
  try {
    const [customerData, deviceData] = await Promise.all([
      api.get(`/customers/${customerId.value}`),
      api.get(`/customers/${customerId.value}/devices`),
    ])
    customer.value = customerData?.item || null
    devices.value = deviceData?.items || []
    fillForm(customer.value)
    await loadPartyDetails(devices.value)
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openDeleteConfirm() {
  error.value = ''
  saveMessage.value = ''
  deleteError.value = ''
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteError.value = ''
  deleteConfirmOpen.value = false
}

function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: '', longitude: '' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({ latitude: '', longitude: '' }),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    )
  })
}

function parseCandidateCoordinates(candidate) {
  if (candidate.latitude && candidate.longitude) return { latitude: candidate.latitude, longitude: candidate.longitude }
  const [longitude, latitude] = String(candidate.location || '').split(',').map(Number)
  return { latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null }
}

async function locateCustomer() {
  locating.value = true
  error.value = ''
  try {
    const position = await currentPosition()
    const keyword = form.value.name.trim() || form.value.address.trim() || '公司'
    const params = new URLSearchParams({ keyword })
    if (position.latitude && position.longitude) {
      params.set('latitude', String(position.latitude))
      params.set('longitude', String(position.longitude))
    }
    const data = await api.get(`/geo/companies?${params.toString()}`)
    geoCandidates.value = data?.items || []
    if (!geoCandidates.value.length) error.value = '未找到地址候选'
  } catch (err) {
    error.value = err.message || '定位失败'
  } finally {
    locating.value = false
  }
}

function selectCandidate(candidate) {
  const coordinates = parseCandidateCoordinates(candidate)
  form.value.address = candidate.mapAddress || candidate.address || form.value.address
  form.value.latitude = coordinates.latitude
  form.value.longitude = coordinates.longitude
  form.value.mapProvider = candidate.mapProvider || 'amap'
  form.value.mapPoiId = candidate.mapPoiId || String(candidate.id || '')
  form.value.mapPoiName = candidate.mapPoiName || candidate.name || ''
  form.value.mapAddress = candidate.mapAddress || candidate.address || ''
  if (!form.value.name.trim()) form.value.name = candidate.name || ''
  geoCandidates.value = []
}

async function saveCustomer() {
  if (!form.value.name.trim()) {
    error.value = '请输入客户名称'
    return
  }
  saving.value = true
  error.value = ''
  saveMessage.value = ''
  try {
    const contacts = form.value.contacts
      .map((contact) => ({ id: contact.id, name: String(contact.name || '').trim(), phone: String(contact.phone || '').trim() }))
      .filter((contact) => contact.name || contact.phone)
    const firstContact = contacts[0] || { name: form.value.contactName.trim(), phone: form.value.contactPhone.trim() }
    await api.put(`/customers/${customerId.value}`, {
      name: form.value.name.trim(),
      code: form.value.code,
      address: form.value.address.trim(),
      contactName: form.value.contactName.trim() || firstContact.name || '',
      contactPhone: form.value.contactPhone.trim() || firstContact.phone || '',
      contacts,
      salesperson: form.value.salesperson,
      level: form.value.level,
      remark: form.value.remark,
      latitude: form.value.latitude,
      longitude: form.value.longitude,
      mapProvider: form.value.mapProvider,
      mapPoiId: form.value.mapPoiId,
      mapPoiName: form.value.mapPoiName,
      mapAddress: form.value.mapAddress,
    })
    await loadDetail()
    saveMessage.value = '已保存客户档案'
  } catch (err) {
    error.value = err.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function deleteCustomer() {
  deleting.value = true
  error.value = ''
  saveMessage.value = ''
  deleteError.value = ''
  const deletedName = customer.value?.name || form.value.name || '客户'
  try {
    await api.delete(`/customers/${customerId.value}`)
    deleteConfirmOpen.value = false
    router.push({ path: '/assets/customers', query: { deleted: deletedName } })
  } catch (err) {
    deleteError.value = err.message || '删除失败'
    error.value = deleteError.value
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  loadDetail()
})
</script>

<template>
  <main class="engineer-shell asset-shell">
    <header class="topbar asset-topbar">
      <div>
        <BrandEyebrow text="客户与资产 / 客户详情" :title="customer?.name || '客户详情'" />
        <p class="asset-page-lead">{{ zh('重点查看客户名下设备、在保状态和故障时应联系的维保方。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
          <RouterLink class="ghost asset-refresh" to="/assets/customers"><PreviewIcon name="customers" />{{ zh('客户列表') }}</RouterLink>
        </div>
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="loadDetail">{{ zh('重试') }}</button></p>
    <p v-if="saveMessage" class="asset-save-message"><PreviewIcon name="check" />{{ zh(saveMessage) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在载入客户详情…') }}</p>

    <section v-if="!loading" class="asset-detail-grid">
      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ zh('客户档案') }}</span>
            <h2>{{ zh('基础信息') }}</h2>
          </div>
          <div class="asset-record-actions">
            <button class="ghost danger-lite" type="button" :disabled="saving || deleting" @click="openDeleteConfirm">
              <PreviewIcon name="trash" />{{ zh('删除客户') }}
            </button>
            <button class="primary" type="button" :disabled="saving || deleting" @click="saveCustomer">
              <PreviewIcon name="save" />{{ zh(saving ? '保存中…' : '保存') }}
            </button>
          </div>
        </header>

        <div class="asset-editor-form asset-inline-form">
          <label>{{ zh('客户名称') }}<input v-model="form.name" type="text" /></label>
          <label>{{ zh('客户地址') }}<textarea v-model="form.address" rows="2" :placeholder="zh('点击定位后可选择地图候选地址')"></textarea></label>
          <button class="ghost asset-locate-button" type="button" :disabled="locating" @click="locateCustomer">
            <PreviewIcon name="pin" />{{ zh(locating ? '定位中…' : '定位匹配地址') }}
          </button>
          <p class="asset-record-line"><PreviewIcon name="pin" /><template v-if="hasCoordinates">{{ zh('已维护坐标') }}：{{ form.latitude }}, {{ form.longitude }}</template><template v-else>{{ zh('暂未维护坐标') }}</template></p>
          <div v-if="geoCandidates.length" class="asset-candidate-list">
            <button v-for="candidate in geoCandidates" :key="candidate.id" type="button" @click="selectCandidate(candidate)">
              <strong>{{ zh(candidate.name || '未命名地点') }}</strong>
              <span>{{ zh(candidate.address || candidate.mapAddress || '未维护地址') }}</span>
            </button>
          </div>

          <section class="asset-editor-nested">
            <div class="asset-editor-nested-head">
              <strong>{{ zh('联系人及电话') }}</strong>
              <button class="ghost" type="button" @click="addContact"><PreviewIcon name="new" />{{ zh('新增') }}</button>
            </div>
            <div v-for="(contact, index) in form.contacts" :key="index" class="asset-contact-row">
              <input v-model="contact.name" type="text" :placeholder="zh('联系人')" />
              <input v-model="contact.phone" type="tel" :placeholder="zh('电话')" />
              <button class="ghost danger-lite" type="button" @click="removeContact(index)"><PreviewIcon name="trash" /></button>
            </div>
          </section>
        </div>
      </article>

      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ devices.length }} {{ zh('台设备') }}</span>
            <h2>{{ zh('关联设备与维保') }}</h2>
          </div>
          <RouterLink class="ghost" :to="`/assets/devices?customerId=${customerId}`"><PreviewIcon name="devices" />{{ zh('设备列表') }}</RouterLink>
        </header>

        <section class="asset-card-list asset-device-linked-list">
          <RouterLink v-for="device in devices" :key="device.id" class="asset-linked-device-card" :to="`/assets/devices/${device.id}`">
            <div>
              <span class="asset-record-kicker" :class="`asset-warranty-${warrantyStatus(device).className}`">{{ zh(warrantyStatus(device).label) }}</span>
              <h3>{{ zh(deviceDisplayName(device)) }}</h3>
              <p>{{ zh(device.model || '未维护型号') }} · SN: {{ device.serialNo || zh('未维护') }}</p>
            </div>
            <div class="asset-linked-maintenance">
              <span>{{ zh(maintenanceTypeLabel(device.maintenanceType)) }}</span>
              <span>{{ zh('到期') }}：{{ zh(displayDate(warrantyDate(device))) }}</span>
              <b>{{ zh(partyContactLine(device)) }}</b>
            </div>
          </RouterLink>
          <p v-if="!devices.length" class="empty-state">{{ zh('这个客户暂未关联设备') }}</p>
        </section>
      </article>
    </section>

    <div v-if="deleteConfirmOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('删除客户')">
      <div class="signature-modal-shell exit-confirm-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('删除客户') }}</p>
            <h2>{{ zh(customer?.name || '未命名客户') }}</h2>
          </div>
        </header>
        <div class="exit-confirm-body">
          <p>{{ zh('删除后客户档案和联系人将不可恢复。若该客户已关联设备或服务记录，系统会阻止删除。') }}</p>
          <p>{{ zh('如果提示已有服务记录关联，请先删除关联的服务记录，再删除客户。') }}</p>
          <p v-if="deleteError" class="form-error asset-delete-error">{{ zh(deleteError) }}</p>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" :disabled="deleting" @click="closeDeleteConfirm"><PreviewIcon name="edit" />{{ zh('取消') }}</button>
          <button class="primary danger-action" type="button" :disabled="deleting" @click="deleteCustomer">
            <PreviewIcon name="trash" />{{ zh(deleting ? '删除中…' : '确认删除') }}
          </button>
        </footer>
      </div>
    </div>
  </main>
</template>
