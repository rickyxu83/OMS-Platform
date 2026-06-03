<script setup>
import { computed, reactive, onMounted, ref, watch } from 'vue'
import DetailPanel from '../components/admin/DetailPanel.vue'
import EmptyState from '../components/admin/EmptyState.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'
import { downloadText, toCsv } from '../utils/download'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const customers = ref([])
const customerDeviceStats = ref({})
const activeCustomerId = ref('')
const keyword = ref('')
const form = reactive({
  name: '',
  contactName: '',
  contactPhone: '',
  address: '',
})
const detailForm = reactive({
  name: '',
  contactName: '',
  contactPhone: '',
  address: '',
  salesperson: '',
})
const currentUser = getCurrentUser()
const canEdit = computed(() => ['admin', 'assistant', 'dispatcher', 'supervisor', 'sales_supervisor', 'sales'].includes(currentUser?.role))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ pageSize: '60' })
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    const data = await api.get(`/customers?${params}`)
    customers.value = (data.items || []).map((customer) => ({
      id: customer.id,
      name: customer.name || '-',
      address: customer.address || customer.mapPoiName || '基础设施维护客户',
      count: Number(customer.serviceOrderCount || customer.orderCount || customer.useCount || 0),
      contactName: customer.contactName || '',
      contactPhone: customer.contactPhone || '',
      contact: customer.contactName ? `${customer.contactName}${customer.contactPhone ? ` / ${customer.contactPhone}` : ''}` : '未维护联系人',
      salesperson: customer.salesperson || '',
      updatedAt: customer.updatedAt,
    }))
    const focusId = String(route.query.customerId || '')
    const focusCustomer = focusId ? customers.value.find((item) => String(item.id) === focusId) : null
    activeCustomerId.value = focusCustomer?.id || (customers.value.some((item) => item.id === activeCustomerId.value)
      ? activeCustomerId.value
      : customers.value[0]?.id || '')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function createCustomer() {
  if (!canEdit.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.post('/customers', {
      ...form,
      contacts: form.contactName ? [{ name: form.contactName, phone: form.contactPhone }] : [],
    })
    Object.assign(form, { name: '', contactName: '', contactPhone: '', address: '' })
    message.value = '客户已新增'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function updateActiveCustomer() {
  if (!canEdit.value) return
  if (!activeCustomer.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.put(`/customers/${activeCustomer.value.id}`, {
      name: detailForm.name,
      address: detailForm.address,
      contactName: detailForm.contactName,
      contactPhone: detailForm.contactPhone,
      salesperson: detailForm.salesperson,
    })
    message.value = '客户资料已更新'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function loadActiveCustomerDevices(customerId) {
  if (!customerId) return
  try {
    const data = await api.get(`/customers/${customerId}/devices`)
    const items = data.items || []
    customerDeviceStats.value = {
      ...customerDeviceStats.value,
      [customerId]: {
        total: items.length,
        none: items.filter((device) => (device.maintenanceType || 'none') === 'none').length,
        original: items.filter((device) => device.maintenanceType === 'original_manufacturer').length,
        ours: items.filter((device) => device.maintenanceType === 'our_maintenance').length,
        expiring: items.filter((device) => isMaintenanceAttention(device.maintenanceEnd)).length,
      },
    }
  } catch (err) {
    customerDeviceStats.value = {
      ...customerDeviceStats.value,
      [customerId]: { total: 0, none: 0, original: 0, ours: 0, expiring: 0, error: err.message },
    }
  }
}

function exportCsv() {
  const rows = [
    ['客户名称', '地址', '联系人', '联系电话', '本年度服务次数', '业务员', '最近更新'],
    ...filteredCustomers.value.map((customer) => [customer.name, customer.address, customer.contactName || '-', customer.contactPhone || '-', customer.count, customer.salesperson || '-', formatDate(customer.updatedAt)]),
  ]
  downloadText(`customers-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${toCsv(rows)}`, 'text/csv;charset=utf-8')
}

const filteredCustomers = computed(() => {
  if (!keyword.value.trim()) return customers.value
  const text = keyword.value.trim()
  return customers.value.filter((customer) => [customer.name, customer.address, customer.contact, customer.salesperson].some((value) => String(value || '').includes(text)))
})
const activeCustomer = computed(() => customers.value.find((item) => item.id === activeCustomerId.value))
const activeCustomerDeviceStats = computed(() => customerDeviceStats.value[activeCustomer.value?.id] || { total: 0, none: 0, original: 0, ours: 0, expiring: 0 })
const totalRecords = computed(() => customers.value.reduce((total, customer) => total + customer.count, 0))
const keyCustomerCount = computed(() => customers.value.filter((customer) => customer.count > 0).length)

function formatDate(value) {
  return String(value || '').replace('T', ' ').slice(0, 10) || '-'
}

function isMaintenanceAttention(value) {
  if (!value) return false
  const end = new Date(`${String(value).slice(0, 10)}T23:59:59`).getTime()
  return end <= Date.now() + 30 * 24 * 60 * 60 * 1000
}

function viewCustomerDevices() {
  if (!activeCustomer.value) return
  router.push({ name: 'devices', query: { customerId: activeCustomer.value.id } })
}

watch(activeCustomer, (customer) => {
  Object.assign(detailForm, {
    name: customer?.name || '',
    contactName: customer?.contactName || '',
    contactPhone: customer?.contactPhone || '',
    address: customer?.address || '',
    salesperson: customer?.salesperson || '',
  })
  if (customer?.id) loadActiveCustomerDevices(customer.id)
}, { immediate: true })

onMounted(() => {
  if (route.query.keyword) keyword.value = String(route.query.keyword)
  load()
})

watch(() => [route.query.customerId, route.query.keyword], () => {
  if (route.query.keyword) keyword.value = String(route.query.keyword)
  load()
})
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="CLIENT VAULT" title="客户资产" description="统一管理客户、联系人、地址和历史服务关系。">
      <template #actions>
        <button class="ghost-button" type="button" @click="exportCsv">导出当前列表明细</button>
        <button v-if="canEdit" class="primary" type="submit" form="customer-create-form" :disabled="saving">新增客户</button>
      </template>
    </PageHeader>

    <FilterBar v-model:query="keyword" search-placeholder="搜索客户名称、地址或联系人..." @submit="load" />

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载客户资料...</p>

    <section class="kpi-grid">
      <KpiCard title="客户总数" :value="customers.length" subtitle="当前列表" icon="customer" />
      <KpiCard title="有服务记录客户" :value="keyCustomerCount" subtitle="本年度" icon="activity" />
      <KpiCard title="本年度服务" :value="totalRecords" subtitle="服务单汇总" icon="ticket" />
    </section>

    <form v-if="canEdit" id="customer-create-form" class="inline-form" @submit.prevent="createCustomer">
      <label class="field"><span>客户名称</span><input v-model.trim="form.name" required /></label>
      <label class="field"><span>联系人</span><input v-model.trim="form.contactName" /></label>
      <label class="field"><span>联系电话</span><input v-model.trim="form.contactPhone" /></label>
      <label class="field wide"><span>客户地址</span><input v-model.trim="form.address" /></label>
    </form>

    <section class="two-column-layout">
      <div class="customer-card-grid">
        <button
          v-for="(customer, index) in filteredCustomers"
          :key="customer.id"
          class="customer-card"
          :class="{ selected: activeCustomerId === customer.id }"
          type="button"
          @click="activeCustomerId = customer.id"
        >
          <span class="vip-pill">{{ index % 3 === 0 ? '重点' : '常规' }}</span>
          <div class="customer-symbol">{{ String(customer.name).slice(0, 1) }}</div>
          <strong>{{ customer.name }}</strong>
          <small>{{ customer.address }}</small>
          <div class="customer-card-meta">
            <span><em>最近更新</em>{{ formatDate(customer.updatedAt) }}</span>
            <span><em>本年度服务</em>{{ customer.count }}</span>
          </div>
        </button>
        <EmptyState v-if="!filteredCustomers.length && !loading" title="暂无客户资料" description="请尝试调整搜索条件或新增客户。" />
      </div>

      <DetailPanel v-if="activeCustomer" subtitle="客户资料" :title="activeCustomer.name" status-label="已启用" status-tone="success">
        <div class="drawer-form">
          <label class="field"><span>客户名称</span><input v-model.trim="detailForm.name" /></label>
          <label class="field"><span>联系人</span><input v-model.trim="detailForm.contactName" /></label>
          <label class="field"><span>联系电话</span><input v-model.trim="detailForm.contactPhone" /></label>
          <label class="field"><span>客户地址</span><input v-model.trim="detailForm.address" /></label>
          <label class="field"><span>业务员</span><input v-model.trim="detailForm.salesperson" /></label>
        </div>
        <div class="drawer-section">
          <h3>服务概览</h3>
          <p>本年度服务次数：{{ activeCustomer.count }}</p>
          <p>最近更新：{{ formatDate(activeCustomer.updatedAt) }}</p>
          <p>联系人：{{ activeCustomer.contact }}</p>
        </div>
        <div class="drawer-section">
          <h3>设备概览</h3>
          <div class="drawer-stats">
            <article><span>设备总数</span><strong>{{ activeCustomerDeviceStats.total }}</strong></article>
            <article><span>需关注维护</span><strong>{{ activeCustomerDeviceStats.expiring }}</strong></article>
            <article><span>我方维护</span><strong>{{ activeCustomerDeviceStats.ours }}</strong></article>
            <article><span>原厂维护</span><strong>{{ activeCustomerDeviceStats.original }}</strong></article>
          </div>
          <p v-if="activeCustomerDeviceStats.error" class="form-error">设备统计加载失败：{{ activeCustomerDeviceStats.error }}</p>
          <button class="ghost-button full" type="button" @click="viewCustomerDevices">查看全部设备</button>
        </div>
        <template #footer>
          <button v-if="canEdit" class="ghost-button full" type="button" :disabled="saving" @click="updateActiveCustomer">保存当前客户</button>
          <p v-else class="form-error">当前账号只可查看，不可编辑客户资料。</p>
          <button class="primary full" type="button" @click="exportCsv">导出当前筛选明细</button>
        </template>
      </DetailPanel>
    </section>
  </section>
</template>
