<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const route = useRoute()
const party = ref(null)
const devices = ref([])
const loading = ref(true)
const error = ref('')

const partyId = computed(() => route.params.id)

function partyTypeLabel(value) {
  const labels = {
    original_manufacturer: '原厂联系人',
    vendor_contact: '原厂联系人',
    vendor: '原厂联系人',
    our_maintenance: '合作维保方',
    partner: '合作维保方',
    our: '合作维保方',
  }
  return labels[value] || value || '未分类'
}

function officialWebsiteHref(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function telHref(phone) {
  const normalized = String(phone || '').trim().replace(/[\s()-]/g, '')
  return normalized ? `tel:${normalized}` : ''
}

function contactsForParty(item) {
  const contacts = Array.isArray(item?.contacts) ? item.contacts : []
  if (contacts.length) return contacts.map((contact) => ({ name: contact.name || '', phone: contact.phone || '' }))
  if (item?.contact || item?.phone) return [{ name: item.contact || '', phone: item.phone || '' }]
  return []
}

function displayDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 10) : '未维护'
}

function deviceDisplayName(device) {
  if (!device) return ''
  return device.model || device.name || device.serialNo || `设备 #${device.id}`
}

function warrantyStatus(device) {
  if (!device || device.maintenanceType === 'none') return { label: '无维保', className: 'neutral' }
  const date = device.maintenanceEnd || device.warrantyUntil || ''
  if (!date) return { label: '未维护到期', className: 'warning' }
  const end = new Date(String(date).slice(0, 10)).getTime()
  if (!Number.isFinite(end)) return { label: '未维护到期', className: 'warning' }
  return end >= Date.now() - 24 * 60 * 60 * 1000 ? { label: '在保', className: 'success' } : { label: '已过保', className: 'danger' }
}

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const [partyData, deviceData] = await Promise.all([
      api.get(`/maintenance-parties/${partyId.value}`),
      api.get('/devices'),
    ])
    party.value = partyData?.item || null
    devices.value = (deviceData?.items || []).filter((item) => String(item.maintenancePartyId || '') === String(partyId.value))
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
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
        <BrandEyebrow text="客户与资产 / 维保方详情" :title="party?.name || '维保方详情'" />
        <p class="asset-page-lead">{{ zh('查看维保方联系方式，以及由它负责的设备。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
          <RouterLink class="ghost asset-refresh" to="/assets/maintenance-parties"><PreviewIcon name="maintenance" />{{ zh('维保方列表') }}</RouterLink>
        </div>
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="loadDetail">{{ zh('重试') }}</button></p>
    <p v-if="loading" class="muted">{{ zh('正在加载维保方详情…') }}</p>

    <section v-if="!loading && party" class="asset-detail-grid">
      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ zh(partyTypeLabel(party.partyType)) }}</span>
            <h2>{{ zh(party.name || '未命名维保方') }}</h2>
          </div>
        </header>
        <div class="asset-detail-kv">
          <p v-for="(contact, index) in contactsForParty(party)" :key="`party-contact-${index}`">
            <span>{{ zh(index === 0 ? '联系人' : `联系人 ${index + 1}`) }}</span>
            <b>
              {{ zh(contact.name || '未维护') }}
              <template v-if="contact.phone"> · <a :href="telHref(contact.phone)">{{ contact.phone }}</a></template>
            </b>
          </p>
          <p v-if="!contactsForParty(party).length"><span>{{ zh('联系人') }}</span><b>{{ zh('未维护') }}</b></p>
          <p v-if="party.officialWebsite">
            <span>{{ zh('官网地址') }}</span>
            <b><a :href="officialWebsiteHref(party.officialWebsite)" target="_blank" rel="noreferrer">{{ zh(party.officialWebsite) }}</a></b>
          </p>
          <p><span>{{ zh('备注') }}</span><b>{{ zh(party.remark || '未维护') }}</b></p>
        </div>
      </article>

      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ devices.length }} {{ zh('台设备') }}</span>
            <h2>{{ zh('负责设备') }}</h2>
          </div>
        </header>
        <section class="asset-card-list asset-device-linked-list">
          <RouterLink v-for="device in devices" :key="device.id" class="asset-linked-device-card" :to="`/assets/devices/${device.id}`">
            <div>
              <span class="asset-record-kicker" :class="`asset-warranty-${warrantyStatus(device).className}`">{{ zh(warrantyStatus(device).label) }}</span>
              <h3>{{ zh(deviceDisplayName(device)) }}</h3>
              <p>{{ zh(device.customerName || '未关联客户') }} · SN: {{ device.serialNo || zh('未维护') }}</p>
            </div>
            <div class="asset-linked-maintenance">
              <span>{{ zh('维保到期') }}：{{ zh(displayDate(device.maintenanceEnd || device.warrantyUntil)) }}</span>
            </div>
          </RouterLink>
          <p v-if="!devices.length" class="empty-state">{{ zh('暂无设备关联到该维保方') }}</p>
        </section>
      </article>
    </section>
  </main>
</template>
