<script setup>
import { computed, onMounted, ref } from 'vue'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const loading = ref(true)
const error = ref('')
const counts = ref({ customers: 0, devices: 0, parties: 0 })

const modules = computed(() => [
  {
    title: '客户档案',
    desc: '维护客户地址、联系人和联系电话',
    icon: 'customers',
    to: '/assets/customers',
    count: counts.value.customers,
    unit: '家',
  },
  {
    title: '设备资产',
    desc: '查询与维护客户设备、序列号和维保信息',
    icon: 'devices',
    to: '/assets/devices',
    count: counts.value.devices,
    unit: '台',
  },
  {
    title: '维保方目录',
    desc: '维护原厂与合作维保方联系方式',
    icon: 'maintenance',
    to: '/assets/maintenance-parties',
    count: counts.value.parties,
    unit: '个',
  },
])

async function loadSummary() {
  loading.value = true
  error.value = ''
  try {
    const [customers, devices, parties] = await Promise.all([
      api.get('/customers?pageSize=200'),
      api.get('/devices'),
      api.get('/maintenance-parties'),
    ])
    counts.value = {
      customers: Number(customers?.items?.length || 0),
      devices: Number(devices?.items?.length || 0),
      parties: Number(parties?.items?.length || 0),
    }
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSummary()
})
</script>

<template>
  <main class="engineer-shell asset-shell">
    <header class="topbar asset-topbar">
      <div>
        <BrandEyebrow text="工程师端 / 客户资产" title="客户与资产" />
        <p class="asset-page-lead">{{ zh('现场常用资料库，所有工程师均可查询、新增和维护基础资料。') }}</p>
      </div>
      <button class="ghost asset-refresh" type="button" :disabled="loading" @click="loadSummary">
        <PreviewIcon name="refresh" />{{ zh('刷新') }}
      </button>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="loadSummary">{{ zh('重试') }}</button></p>

    <section class="asset-hero-card">
      <div>
        <span class="asset-hero-kicker">{{ zh('资料维护') }}</span>
        <h2>{{ zh('客户、设备、维保方集中管理') }}</h2>
        <p>{{ zh('在填写服务表前后，都可以在这里补全客户联系人、设备资产和厂商电话。') }}</p>
      </div>
      <PreviewIcon name="assets" />
    </section>

    <section class="asset-module-grid" :aria-label="zh('客户与资产模块')">
      <RouterLink v-for="item in modules" :key="item.to" class="asset-module-card" :to="item.to">
        <span class="asset-module-icon"><PreviewIcon :name="item.icon" /></span>
        <strong>{{ zh(item.title) }}</strong>
        <p>{{ zh(item.desc) }}</p>
        <span class="asset-module-count">
          <template v-if="loading">{{ zh('统计中') }}</template>
          <template v-else>{{ item.count }} {{ zh(item.unit) }}</template>
        </span>
      </RouterLink>
    </section>
  </main>
</template>
