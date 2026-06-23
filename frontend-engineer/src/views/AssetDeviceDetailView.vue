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
const maintenancePhone = computed(() => party.value?.phone || device.value?.maintenancePartyPhone || '')
const deviceTitle = computed(() => device.value?.model || device.value?.name || device.value?.serialNo || '设备详情')
const partHistory = computed(() => Array.isArray(device.value?.partHistory) ? device.value.partHistory : [])

function displayDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 10) : '未维护'
}

function maintenanceTypeLabel(value) {
  const labels = { none: '无维保', original_manufacturer: '原厂维保', vendor: '原厂维保', our_maintenance: '我方维保', our: '我方维保' }
  return labels[value || 'none'] || value || '未维护'
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

function actionTypeLabel(value) {
  if (value === 'replacement') return '配件更换'
  if (value === 'installation') return '配件安装'
  return '配件记录'
}

function serviceTypeLabel(value) {
  const labels = {
    install: '现场安装',
    repair: '故障处理',
    maintain: '保养维护',
    inspect: '例行巡检',
    training: '现场培训',
    other: '其他事项',
  }
  return labels[value] || value || '服务记录'
}

function partQuantityText(item) {
  const quantity = Number(item?.quantity || 0)
  const text = Number.isFinite(quantity) && quantity > 0 ? String(quantity).replace(/\.00$/, '') : ''
  return [text, item?.unit].filter(Boolean).join('') || '1'
}

function compactText(value, maxLength = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function warrantyDate(item) {
  return item?.maintenanceEnd || item?.warrantyUntil || ''
}

function warrantyStatus(item) {
  if (!item || item.maintenanceType === 'none') return { label: '无维保', className: 'neutral' }
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
        <BrandEyebrow text="客户与资产 / 设备详情" :title="deviceTitle" />
        <p class="asset-page-lead">{{ zh('查看设备维保状态，以及故障时应联系的维保方。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
          <RouterLink class="ghost asset-refresh" to="/assets/devices"><PreviewIcon name="devices" />{{ zh('设备列表') }}</RouterLink>
          <RouterLink v-if="device?.customerId" class="ghost asset-refresh" :to="`/assets/customers/${device.customerId}`"><PreviewIcon name="customers" />{{ zh('客户') }}</RouterLink>
          <RouterLink v-if="device?.maintenancePartyId" class="ghost asset-refresh" :to="`/assets/maintenance-parties/${device.maintenancePartyId}`"><PreviewIcon name="maintenance" />{{ zh('维保方') }}</RouterLink>
        </div>
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="loadDetail">{{ zh('重试') }}</button></p>
    <p v-if="loading" class="muted">{{ zh('正在加载设备详情…') }}</p>

    <section v-if="!loading && device" class="asset-detail-grid">
      <article class="asset-record-card asset-detail-card">
        <header>
          <div>
            <span class="asset-record-kicker" :class="`asset-warranty-${warrantyStatus(device).className}`">{{ zh(warrantyStatus(device).label) }}</span>
            <h2>{{ zh(deviceTitle) }}</h2>
          </div>
        </header>

        <div class="asset-detail-kv">
          <p><span>{{ zh('所属客户') }}</span><b>{{ zh(device.customerName || '未关联客户') }}</b></p>
          <p><span>{{ zh('主机名') }}</span><b>{{ zh(device.name || '未维护') }}</b></p>
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
          <p><span>{{ zh('维保方') }}</span><b>{{ zh(device.maintenancePartyName || party?.name || '未关联维保方') }}</b></p>
          <p><span>{{ zh('联系人') }}</span><b>{{ zh(party?.contact || '未维护') }}</b></p>
          <p><span>{{ zh('联系电话') }}</span><b><a v-if="maintenancePhone" :href="telHref(maintenancePhone)">{{ maintenancePhone }}</a><template v-else>{{ zh('未维护') }}</template></b></p>
          <p v-if="party?.officialWebsite">
            <span>{{ zh('官网地址') }}</span>
            <b><a :href="officialWebsiteHref(party.officialWebsite)" target="_blank" rel="noreferrer">{{ zh(party.officialWebsite) }}</a></b>
          </p>
        </div>
      </article>
    </section>

    <section v-if="!loading && device" class="asset-detail-grid asset-part-history-grid">
      <article class="asset-record-card asset-detail-card asset-part-history-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ zh('配件历史') }}</span>
            <h2>{{ zh('安装与更换记录') }}</h2>
          </div>
        </header>

        <div v-if="partHistory.length" class="asset-part-history-list">
          <div v-for="item in partHistory" :key="item.id" class="asset-part-history-item">
            <div class="asset-part-history-main">
              <span class="asset-record-kicker">{{ zh(actionTypeLabel(item.actionType)) }}</span>
              <strong>{{ zh(item.partName || '未命名配件') }}</strong>
              <p>
                {{ zh(displayDate(item.serviceAt || item.createdAt)) }}
                <template v-if="item.orderNo"> · {{ item.orderNo }}</template>
                <template v-if="item.engineerName"> · {{ zh(item.engineerName) }}</template>
              </p>
              <p class="asset-part-history-meta">
                {{ zh(serviceTypeLabel(item.serviceType)) }}
                <template v-if="item.partNo"> · PN {{ item.partNo }}</template>
                <template v-if="item.quantity"> · {{ zh('数量') }} {{ partQuantityText(item) }}</template>
              </p>
              <p v-if="item.remark || item.issueDescription || item.workContent" class="asset-part-history-summary">
                {{ zh(compactText(item.remark || item.issueDescription || item.workContent)) }}
              </p>
            </div>
            <RouterLink v-if="item.serviceOrderId" class="ghost asset-refresh" :to="`/tasks/${item.serviceOrderId}`">
              <PreviewIcon name="service" />{{ zh('服务记录') }}
            </RouterLink>
          </div>
        </div>
        <p v-else class="muted">{{ zh('暂无配件安装或更换记录') }}</p>
      </article>
    </section>
  </main>
</template>
