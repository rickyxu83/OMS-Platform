<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const route = useRoute()
const router = useRouter()
const customers = ref([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const error = ref('')
const successMessage = ref('')
const deleteError = ref('')
const searchQuery = ref('')
const dialogOpen = ref(false)
const deleteTarget = ref(null)
const editingId = ref(null)
const form = ref(emptyForm())
const locating = ref(false)
const addressLocating = ref(false)
const geoLoading = ref(false)
const candidates = ref([])
const showCandidates = ref(false)
const locationHint = ref('')
const customerNameField = ref(null)
const customerCandidateList = ref(null)

const filteredCustomers = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return customers.value
  return customers.value.filter((item) => [
    item.name,
    item.code,
    item.address,
    item.contactName,
    item.contactPhone,
    item.salesperson,
    ...(Array.isArray(item.contacts) ? item.contacts.flatMap((contact) => [contact.name, contact.phone]) : []),
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)))
})

const hasCoordinates = computed(() => Number.isFinite(Number(form.value.latitude)) && Number.isFinite(Number(form.value.longitude)))

function emptyForm() {
  return {
    name: '',
    code: '',
    address: '',
    contactName: '',
    contactPhone: '',
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

const LEVEL_LABELS = {
  key: '重点客户',
  normal: '普通客户',
  potential: '潜在客户',
  vip: 'VIP 客户',
}

function contactsFor(customer) {
  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : []
  if (contacts.length) return contacts
  if (customer?.contactName || customer?.contactPhone) {
    return [{ name: customer.contactName || '联系人', phone: customer.contactPhone || '' }]
  }
  return []
}

function telHref(phone) {
  const normalized = String(phone || '').trim().replace(/[\s()-]/g, '')
  return normalized ? `tel:${normalized}` : ''
}

async function loadCustomers() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ pageSize: '200' })
    const keyword = searchQuery.value.trim()
    if (keyword) params.set('keyword', keyword)
    const data = await api.get(`/customers?${params.toString()}`)
    customers.value = data?.items || []
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  successMessage.value = ''
  editingId.value = null
  form.value = emptyForm()
  candidates.value = []
  showCandidates.value = false
  locationHint.value = ''
  dialogOpen.value = true
}

function openEdit(customer) {
  successMessage.value = ''
  const contacts = contactsFor(customer)
  editingId.value = customer.id
  form.value = {
    name: customer.name || '',
    code: customer.code || '',
    address: customer.address || '',
    contactName: customer.contactName || contacts[0]?.name || '',
    contactPhone: customer.contactPhone || contacts[0]?.phone || '',
    salesperson: customer.salesperson || '',
    level: customer.level || 'normal',
    remark: customer.remark || '',
    latitude: normalizeCoordinate(customer.latitude),
    longitude: normalizeCoordinate(customer.longitude),
    mapProvider: customer.mapProvider || '',
    mapPoiId: customer.mapPoiId || '',
    mapPoiName: customer.mapPoiName || '',
    mapAddress: customer.mapAddress || '',
    contacts: contacts.length ? contacts.map((contact) => ({ id: contact.id, name: contact.name || '', phone: contact.phone || '' })) : [{ name: '', phone: '' }],
  }
  candidates.value = []
  showCandidates.value = false
  locationHint.value = hasCoordinates.value
    ? `已维护坐标：${Number(form.value.latitude).toFixed(5)}, ${Number(form.value.longitude).toFixed(5)}`
    : ''
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

function openDeleteConfirm(customer) {
  error.value = ''
  successMessage.value = ''
  deleteError.value = ''
  deleteTarget.value = customer
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteError.value = ''
  deleteTarget.value = null
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

function normalizeCoordinate(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function candidateCoordinates(candidate) {
  const directLatitude = normalizeCoordinate(candidate.latitude)
  const directLongitude = normalizeCoordinate(candidate.longitude)
  if (directLatitude != null && directLongitude != null) {
    return { latitude: directLatitude, longitude: directLongitude }
  }

  const [longitudeText, latitudeText] = String(candidate.location || '').split(',')
  const latitude = normalizeCoordinate(latitudeText)
  const longitude = normalizeCoordinate(longitudeText)
  return latitude != null && longitude != null ? { latitude, longitude } : null
}

function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: null, longitude: null })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({ latitude: null, longitude: null }),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    )
  })
}

async function searchGeo(coords = {}, options = {}) {
  const keyword = String(options.keyword ?? form.value.name ?? '').trim()
  const params = new URLSearchParams()
  if (keyword) params.set('keyword', keyword)
  if (coords.latitude && coords.longitude) {
    params.set('latitude', String(coords.latitude))
    params.set('longitude', String(coords.longitude))
  }

  geoLoading.value = true
  try {
    const data = await api.get(`/geo/companies?${params.toString()}`)
    const items = options.nearbyOnly
      ? (data?.items || []).filter((item) => item.source !== 'customer')
      : data?.items || []
    candidates.value = items
    showCandidates.value = true
    locationHint.value = items.length
      ? `已找到 ${items.length} 个候选，点击可带入客户名称、地址和坐标。`
      : '没有找到候选，可继续手动填写。'
  } catch (err) {
    locationHint.value = err.message || '地图搜索失败'
    candidates.value = []
  } finally {
    geoLoading.value = false
  }
}

async function locateNearMe() {
  if (locating.value) return
  locating.value = true
  try {
    const keyword = form.value.name.trim()
    if (keyword) {
      await searchGeo({}, { keyword })
      return
    }
    const position = await currentPosition()
    await searchGeo(position, { keyword: '', nearbyOnly: true })
  } finally {
    locating.value = false
  }
}

async function locateByAddress() {
  const keyword = form.value.address.trim()
  if (!keyword) {
    locationHint.value = '请输入客户地址'
    return
  }
  addressLocating.value = true
  candidates.value = []
  showCandidates.value = false
  locationHint.value = `正在按地址定位“${keyword}”…`
  try {
    const data = await api.get(`/geo/geocode?address=${encodeURIComponent(keyword)}`)
    const item = data?.item
    if (!item?.latitude || !item?.longitude) {
      locationHint.value = '未能解析该地址坐标'
      return
    }
    form.value.latitude = normalizeCoordinate(item.latitude)
    form.value.longitude = normalizeCoordinate(item.longitude)
    form.value.mapProvider = item.mapProvider || 'amap'
    form.value.mapPoiId = item.mapPoiId || ''
    form.value.mapPoiName = item.mapPoiName || item.mapAddress || form.value.address
    form.value.mapAddress = item.mapAddress || form.value.address
    locationHint.value = `已定位：${Number(form.value.latitude).toFixed(5)}, ${Number(form.value.longitude).toFixed(5)}`
  } catch (err) {
    locationHint.value = err.message || '地址定位失败'
  } finally {
    addressLocating.value = false
  }
}

function applyCandidate(company) {
  const coordinates = candidateCoordinates(company)
  const currentContacts = form.value.contacts.length ? [...form.value.contacts] : [{ name: '', phone: '' }]
  if (company.contactName || company.contactPhone) {
    currentContacts[0] = {
      ...currentContacts[0],
      name: company.contactName || currentContacts[0].name,
      phone: company.contactPhone || currentContacts[0].phone,
    }
  }
  form.value = {
    ...form.value,
    name: company.name || form.value.name,
    address: company.address || form.value.address,
    mapAddress: company.mapAddress || company.address || form.value.mapAddress,
    latitude: coordinates?.latitude ?? form.value.latitude ?? null,
    longitude: coordinates?.longitude ?? form.value.longitude ?? null,
    mapProvider: company.mapProvider || (company.source === 'map' ? 'amap' : form.value.mapProvider || ''),
    mapPoiId: company.mapPoiId || (company.source === 'map' ? String(company.id || '') : form.value.mapPoiId || ''),
    mapPoiName: company.mapPoiName || company.name || form.value.mapPoiName,
    contacts: currentContacts,
  }
  locationHint.value = `已选择：${company.name || '地图候选'}`
  showCandidates.value = false
}

function clearMapSelection() {
  form.value.latitude = null
  form.value.longitude = null
  form.value.mapProvider = ''
  form.value.mapPoiId = ''
  form.value.mapPoiName = ''
  form.value.mapAddress = ''
  candidates.value = []
  showCandidates.value = false
  locationHint.value = '已清除定位信息'
}

function updateCustomerName(value) {
  form.value.name = value
  form.value.mapPoiId = ''
  form.value.mapPoiName = ''
  candidates.value = []
  showCandidates.value = false
  locationHint.value = String(value || '').trim() ? '客户名称已手动修改，可重新定位查找。' : ''
}

function updateCustomerAddress(value) {
  form.value.address = value
  form.value.latitude = null
  form.value.longitude = null
  form.value.mapProvider = ''
  form.value.mapPoiId = ''
  form.value.mapPoiName = ''
  form.value.mapAddress = value
  candidates.value = []
  showCandidates.value = false
  locationHint.value = value.trim() ? '地址已手动修改，定位信息已清除，可按地址重新定位。' : ''
}

async function saveCustomer() {
  if (!form.value.name.trim()) {
    error.value = '请输入客户名称'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const contacts = form.value.contacts
      .map((contact) => ({ id: contact.id, name: contact.name.trim(), phone: contact.phone.trim() || undefined }))
      .filter((contact) => contact.name)
    const firstContact = contacts[0] || { name: form.value.contactName.trim() || undefined, phone: form.value.contactPhone.trim() || undefined }
    const payload = {
      name: form.value.name.trim(),
      code: form.value.code.trim() || undefined,
      address: form.value.address.trim() || undefined,
      latitude: form.value.latitude,
      longitude: form.value.longitude,
      mapProvider: form.value.mapProvider || null,
      mapPoiId: form.value.mapPoiId || null,
      mapPoiName: form.value.mapPoiName || null,
      mapAddress: form.value.mapAddress || null,
      contactName: form.value.contactName.trim() || firstContact.name || undefined,
      contactPhone: form.value.contactPhone.trim() || firstContact.phone || undefined,
      contacts,
      salesperson: form.value.salesperson.trim() || undefined,
      level: form.value.level,
      remark: form.value.remark.trim() || undefined,
    }
    if (editingId.value) await api.put(`/customers/${editingId.value}`, payload)
    else await api.post('/customers', payload)
    dialogOpen.value = false
    await loadCustomers()
  } catch (err) {
    error.value = err.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function deleteCustomer() {
  if (!deleteTarget.value?.id) return
  const deletedName = deleteTarget.value.name || '客户'
  deleting.value = true
  error.value = ''
  successMessage.value = ''
  deleteError.value = ''
  try {
    await api.delete(`/customers/${deleteTarget.value.id}`)
    deleteTarget.value = null
    await loadCustomers()
    successMessage.value = `已删除客户：${deletedName}`
  } catch (err) {
    deleteError.value = err.message || '删除失败'
    error.value = deleteError.value
  } finally {
    deleting.value = false
  }
}

function consumeDeleteSuccessQuery() {
  const deletedName = String(route.query.deleted || '').trim()
  if (!deletedName) return
  successMessage.value = `已删除客户：${deletedName}`
  const nextQuery = { ...route.query }
  delete nextQuery.deleted
  router.replace({ path: route.path, query: nextQuery })
}

function handleDocumentPointerDown(event) {
  if (!showCandidates.value) return
  const target = event.target
  if (!target) return
  if (customerNameField.value?.contains(target) || customerCandidateList.value?.contains(target)) return
  showCandidates.value = false
}

onMounted(() => {
  consumeDeleteSuccessQuery()
  loadCustomers()
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<template>
  <main class="engineer-shell asset-shell">
    <header class="topbar asset-topbar">
      <div>
        <BrandEyebrow text="客户与资产 / 客户档案" title="客户档案" />
        <p class="asset-page-lead">{{ zh('维护客户地址、联系人和联系电话。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
        </div>
      </div>
    </header>

    <section class="asset-toolbar">
      <label class="asset-search-box">
        <PreviewIcon name="eye" />
        <input v-model="searchQuery" type="search" :placeholder="zh('搜索客户、联系人、电话、地址')" @keydown.enter="loadCustomers" />
      </label>
      <button class="ghost" type="button" :disabled="loading" @click="loadCustomers"><PreviewIcon name="refresh" />{{ zh('刷新') }}</button>
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增客户') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
    <p v-if="successMessage" class="asset-save-message"><PreviewIcon name="check" />{{ zh(successMessage) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在加载客户档案…') }}</p>

    <section class="asset-card-list">
      <article
        v-for="customer in filteredCustomers"
        :key="customer.id"
        class="asset-record-card asset-clickable-card"
        role="link"
        tabindex="0"
        @click="$router.push(`/assets/customers/${customer.id}`)"
        @keydown.enter="$router.push(`/assets/customers/${customer.id}`)"
        @keydown.space.prevent="$router.push(`/assets/customers/${customer.id}`)"
      >
        <header>
          <div>
            <span class="asset-record-kicker">{{ customer.code || zh('未维护编码') }}</span>
            <h2>{{ zh(customer.name || '未命名客户') }}</h2>
          </div>
          <div class="asset-record-actions">
            <button class="ghost" type="button" @click.stop="openEdit(customer)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
            <button class="ghost danger-lite" type="button" @click.stop="openDeleteConfirm(customer)"><PreviewIcon name="trash" />{{ zh('删除') }}</button>
          </div>
        </header>
        <p class="asset-record-line"><PreviewIcon name="pin" />{{ zh(customer.address || '未维护地址') }}</p>
        <div class="asset-contact-list">
          <span v-for="contact in contactsFor(customer)" :key="`${customer.id}-${contact.id || contact.name}`">
            <PreviewIcon name="contact" />{{ zh(contact.name || '联系人') }}<b><a v-if="telHref(contact.phone)" :href="telHref(contact.phone)" @click.stop>{{ contact.phone }}</a><template v-else>{{ zh('未维护电话') }}</template></b>
          </span>
          <span v-if="!contactsFor(customer).length"><PreviewIcon name="contact" />{{ zh('未维护联系人') }}</span>
        </div>
      </article>
      <p v-if="!loading && !filteredCustomers.length" class="empty-state">{{ zh('暂无客户档案') }}</p>
    </section>

    <div v-if="dialogOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(editingId ? '编辑客户' : '新增客户')" @click.self="closeDialog">
      <div class="signature-modal-shell asset-editor-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('客户档案') }}</p>
            <h2>{{ zh(editingId ? '编辑客户' : '新增客户') }}</h2>
          </div>
        </header>
        <div class="asset-editor-form">
          <label ref="customerNameField" class="asset-editor-wide">{{ zh('客户名称') }}
            <div class="asset-inline-control">
              <input
                v-model="form.name"
                type="text"
                :placeholder="zh('输入客户名称或地图关键词')"
                autocomplete="off"
                @input="updateCustomerName($event.target.value)"
              />
              <button class="ghost asset-inline-button" type="button" :disabled="locating" @click="locateNearMe">
                <PreviewIcon name="pin" />{{ zh(locating ? '定位中…' : '定位查找') }}
              </button>
            </div>
          </label>
          <div v-if="showCandidates && candidates.length" ref="customerCandidateList" class="asset-candidate-list asset-editor-wide">
            <button v-for="candidate in candidates" :key="`${candidate.source || 'candidate'}-${candidate.id || candidate.name}`" type="button" @click="applyCandidate(candidate)">
              <strong>{{ zh(candidate.name || '未命名地点') }}</strong>
              <span>{{ zh(candidate.address || candidate.mapAddress || '未维护地址') }}</span>
              <small>{{ zh(candidate.source === 'customer' ? '系统客户' : '地图结果') }}</small>
            </button>
          </div>
          <p v-if="locationHint" class="asset-location-hint asset-editor-wide">
            <PreviewIcon v-if="geoLoading" name="refresh" />{{ zh(locationHint) }}
          </p>
          <label>{{ zh('客户编码') }}<input v-model="form.code" type="text" :placeholder="zh('留空自动生成或沿用')" /></label>
          <label class="asset-editor-wide">{{ zh('客户地址') }}
            <div class="asset-inline-control">
              <textarea :value="form.address" rows="2" :placeholder="zh('详细至街道门牌号')" @input="updateCustomerAddress($event.target.value)"></textarea>
              <button class="ghost asset-inline-button" type="button" :disabled="addressLocating" @click="locateByAddress">
                <PreviewIcon name="pin" />{{ zh(addressLocating ? '定位中…' : '按地址定位') }}
              </button>
            </div>
          </label>
          <label>{{ zh('默认联系人') }}<input v-model="form.contactName" type="text" /></label>
          <label>{{ zh('默认电话') }}<input v-model="form.contactPhone" type="tel" /></label>
          <label>{{ zh('业务归属') }}<input v-model="form.salesperson" type="text" /></label>
          <label>{{ zh('客户等级') }}
            <select v-model="form.level">
              <option value="key">{{ zh('重点客户') }}</option>
              <option value="normal">{{ zh('普通客户') }}</option>
              <option value="potential">{{ zh('潜在客户') }}</option>
              <option value="vip">{{ zh('VIP 客户') }}</option>
            </select>
          </label>
          <label>{{ zh('备注') }}<textarea v-model="form.remark" rows="2"></textarea></label>
          <section v-if="hasCoordinates" class="asset-editor-nested asset-editor-wide">
            <div class="asset-map-meta">
              <PreviewIcon name="pin" />
              <div>
                <strong>{{ zh(form.mapPoiName || '已维护坐标') }}</strong>
                <span>{{ zh(form.mapAddress || form.address || '未维护地图地址') }}</span>
                <code>{{ Number(form.latitude).toFixed(6) }}, {{ Number(form.longitude).toFixed(6) }}{{ form.mapPoiId ? ` · POI ${form.mapPoiId}` : '' }}</code>
              </div>
              <button class="ghost" type="button" @click="clearMapSelection">{{ zh('清除') }}</button>
            </div>
          </section>
          <section class="asset-editor-nested">
            <div class="asset-editor-nested-head">
              <strong>{{ zh('联系人列表') }}</strong>
              <button class="ghost" type="button" @click="addContact"><PreviewIcon name="new" />{{ zh('新增') }}</button>
            </div>
            <div v-for="(contact, index) in form.contacts" :key="index" class="asset-contact-row">
              <input v-model="contact.name" type="text" :placeholder="zh('联系人')" />
              <input v-model="contact.phone" type="tel" :placeholder="zh('电话')" />
              <button class="ghost danger-lite" type="button" @click="removeContact(index)"><PreviewIcon name="trash" /></button>
            </div>
          </section>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeDialog">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="saveCustomer"><PreviewIcon name="save" />{{ zh(saving ? '保存中…' : '保存') }}</button>
        </footer>
      </div>
    </div>

    <div v-if="deleteTarget" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('删除客户')">
      <div class="signature-modal-shell exit-confirm-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('删除客户') }}</p>
            <h2>{{ zh(deleteTarget.name || '未命名客户') }}</h2>
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
