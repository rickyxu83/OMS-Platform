<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const route = useRoute()
const device = ref(null)
const party = ref(null)
const loading = ref(true)
const error = ref('')

const deviceId = computed(() => route.params.id)

function displayDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 10) : '未维护'
}

function maintenanceTypeLabel(value) {
  const labels = { none: '无维护', original_manufacturer: '原厂维护', vendor: '原厂维护', our_maintenance: '我方维护', our: '我方维护' }
  return labels[value || 'none'] || value || '未维护'
}

function warrantyDate(item) {
  return item?.maintenanceEnd || item?.warrantyUntil || ''
}

function warrantyStatus(item) {
  if (!item || item.maintenanceType === 'none') return { label: '无维护', className: 'neutral' }
  const date = warrantyDate(item)
  if (!date) return { label: '未维护到期', className: 'warning' }
  const end = new Date(String(date).slice(0, 10)).getTime()
  if (!Number.isFinite(end)) return { label: '未维护到期', className: 'warning' }
  return end >= Date.now() - 24 * 60 * 60 * 1000 ? { label: '在保', className: 'success' } : { label: '已过保', className: 'danger' }
}

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/devices/${deviceId.value}`)
    device.value = data?.item || null
    if (device.value?.maintenancePartyId) {
      try {
        const partyData = await api.get(`/maintenance-parties/${device.value.maintenancePartyId}`)
        party.value = partyData?.item || null
      } catch {
        party.value = null
      }
    } else {
      party.value = null
    }
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
        <BrandEyebrow text="客户与资产 / 设备详情" :title="device?.name || '设备详情'" />
        <p class="asset-page-lead">{{ zh('查看设备维保状态，以及故障时应联系的维保厂商。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
          <RouterLink class="ghost asset-refresh" to="/assets/devices"><PreviewIcon name="devices" />{{ zh('设备列表') }}</RouterLink>
          <RouterLink v-if="device?.customerId" class="ghost asset-refresh" :to="`/assets/customers/${device.customerId}`"><PreviewIcon name="customers" />{{ zh('客户') }}</RouterLink>
          <RouterLink v-if="device?.maintenancePartyId" class="ghost asset-refresh" :to="`/assets/maintenance-parties/${device.maintenancePartyId}`"><PreviewIcon name="maintenance" />{{ zh('维保方') }}</RouterLink>
        </div>
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="loadDetail">{{ zh('重试') }}</button></p>
    <p v-if="loading" class="muted">{{ zh('正在载入设备详情...') }}</p>

    <section v-if="!loading && device" class="asset-detail-grid">
      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker" :class="`asset-warranty-${warrantyStatus(device).className}`">{{ zh(warrantyStatus(device).label) }}</span>
            <h2>{{ zh(device.name || '未命名设备') }}</h2>
          </div>
        </header>

        <div class="asset-detail-kv">
          <p><span>{{ zh('所属客户') }}</span><b>{{ zh(device.customerName || '未关联客户') }}</b></p>
          <p><span>{{ zh('型号') }}</span><b>{{ zh(device.model || '未维护') }}</b></p>
          <p><span>{{ zh('PN') }}</span><b>{{ device.pn || zh('未维护') }}</b></p>
          <p><span>{{ zh('序列号') }}</span><b>{{ device.serialNo || zh('未维护') }}</b></p>
          <p><span>{{ zh('设备位置') }}</span><b>{{ zh(device.location || '未维护') }}</b></p>
          <p><span>{{ zh('备注') }}</span><b>{{ zh(device.remark || '未维护') }}</b></p>
        </div>
      </article>

      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ zh(maintenanceTypeLabel(device.maintenanceType)) }}</span>
            <h2>{{ zh('维保与联系人') }}</h2>
          </div>
        </header>

        <div class="asset-detail-kv">
          <p><span>{{ zh('维保开始') }}</span><b>{{ zh(displayDate(device.maintenanceStart)) }}</b></p>
          <p><span>{{ zh('维保结束') }}</span><b>{{ zh(displayDate(device.maintenanceEnd || device.warrantyUntil)) }}</b></p>
          <p><span>{{ zh('维保方') }}</span><b>{{ zh(device.maintenancePartyName || party?.name || '未关联维保厂商') }}</b></p>
          <p><span>{{ zh('联系人') }}</span><b>{{ zh(party?.contact || '未维护') }}</b></p>
          <p><span>{{ zh('联系电话') }}</span><b>{{ party?.phone || device.maintenancePartyPhone || zh('未维护') }}</b></p>
          <p v-if="party?.serviceScope"><span>{{ zh('服务范围') }}</span><b>{{ zh(party.serviceScope) }}</b></p>
        </div>
      </article>
    </section>
  </main>
</template>
