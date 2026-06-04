<script setup>
import { computed, reactive, onMounted, ref, watch } from 'vue'
import EmptyState from '../components/admin/EmptyState.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import AdminIcon from '../components/AdminIcon.vue'
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
const selectedCustomerId = ref('')
const keyword = ref('')
const form = reactive({
  name: '',
  contactName: '',
  contactPhone: '',
  address: '',
})
const currentUser = getCurrentUser()
const canEdit = computed(() => ['admin', 'assistant', 'dispatcher', 'supervisor', 'sales_supervisor', 'sales'].includes(currentUser?.role))
const viewMode = ref('list')

function selectCustomer(id) {
  if (!id) return
  selectedCustomerId.value = id
  viewMode.value = 'detail'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ pageSize: '60' })
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    const data = await api.get(`/customers?${params}`)
    customers.value = (data.items || []).map((customer) => ({
      id: String(customer.id),
      code: customer.code || '',
      name: customer.name || '-',
      address: customer.address || customer.mapPoiName || '基础设施维护客户',
      count: Number(customer.serviceOrderCount || customer.orderCount || customer.useCount || 0),
      contactName: customer.contactName || '',
      contactPhone: customer.contactPhone || '',
      contact: customer.contactName ? `${customer.contactName}${customer.contactPhone ? ` / ${customer.contactPhone}` : ''}` : '未维护联系人',
      salesperson: customer.salesperson || '',
      updatedAt: customer.updatedAt,
    }))
    const routeCustomerId = String(route.query.customerId || '')
    const nextSelectedId = customers.value.some((customer) => customer.id === selectedCustomerId.value)
      ? selectedCustomerId.value
      : customers.value.some((customer) => customer.id === routeCustomerId)
        ? routeCustomerId
        : customers.value[0]?.id || ''
    selectedCustomerId.value = nextSelectedId
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
const selectedCustomer = computed(() => filteredCustomers.value.find((customer) => customer.id === selectedCustomerId.value) || filteredCustomers.value[0] || null)
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

function viewCustomerDevices(customerId) {
  router.push({ name: 'devices', query: { customerId } })
}

function openCreateView() {
  viewMode.value = 'create'
}

function openListView() {
  viewMode.value = 'list'
}

function openDetailView(customerId) {
  if (!customerId) return
  selectedCustomerId.value = customerId
  viewMode.value = 'detail'
}

async function submitCreateCustomer() {
  await createCustomer()
  if (!error.value) {
    viewMode.value = 'list'
  }
}

const selectedCustomerDeviceStats = computed(() => {
  if (!selectedCustomer.value) return null
  return customerDeviceStats.value[selectedCustomer.value.id] || null
})

onMounted(() => {
  if (route.query.keyword) keyword.value = String(route.query.keyword)
  if (route.query.customerId) viewMode.value = 'detail'
  load()
})

watch(() => [route.query.customerId, route.query.keyword], () => {
  if (route.query.keyword) keyword.value = String(route.query.keyword)
  if (route.query.customerId) viewMode.value = 'detail'
  load()
})

watch(selectedCustomer, (customer) => {
  if (customer?.id && !customerDeviceStats.value[customer.id]) {
    loadActiveCustomerDevices(customer.id)
  }
}, { immediate: true })

watch(filteredCustomers, (items) => {
  if (!items.some((customer) => customer.id === selectedCustomerId.value)) {
    selectedCustomerId.value = items[0]?.id || ''
  }
})
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="CLIENT VAULT" title="客户资产" description="统一管理客户、联系人、地址和历史服务关系。">
      <template #actions>
        <button class="ghost-button" type="button" @click="exportCsv">导出当前列表明细</button>
        <button v-if="viewMode !== 'list'" class="ghost-button" type="button" @click="openListView">返回列表</button>
        <button v-if="canEdit && viewMode === 'list'" class="primary" type="button" @click="openCreateView">新增客户</button>
      </template>
    </PageHeader>

    <FilterBar v-if="viewMode === 'list'" v-model:query="keyword" search-placeholder="搜索客户名称、地址或联系人..." @submit="load" />

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载客户资料...</p>

    <section v-if="viewMode === 'list'" class="kpi-grid">
      <KpiCard title="客户总数" :value="customers.length" subtitle="当前列表" icon="customer" />
      <KpiCard title="有服务记录客户" :value="keyCustomerCount" subtitle="本年度" icon="activity" />
      <KpiCard title="本年度服务" :value="totalRecords" subtitle="服务单汇总" icon="ticket" />
    </section>

    <section v-if="viewMode === 'list'" class="detail-layout">
      <div class="glass-panel table-card customer-table make-data-table">
        <div class="table-toolbar">
          <div>
            <h2>客户列表</h2>
            <p>查看客户档案、服务次数、业务归属与最近资料更新时间。</p>
          </div>
          <span class="table-count">{{ filteredCustomers.length }} 条记录</span>
        </div>
        <div class="table-head">
          <span>客户名称</span>
          <span>客户编码</span>
          <span>联系人</span>
          <span>联系电话</span>
          <span>服务地址</span>
          <span>本年服务</span>
          <span>业务员</span>
          <span>最近更新</span>
          <span>操作</span>
        </div>
        <button
          v-for="customer in filteredCustomers"
          :key="customer.id"
          class="table-row"
          :class="{ selected: selectedCustomer?.id === customer.id }"
          type="button"
          @click="selectCustomer(customer.id)"
        >
          <span>
            <strong>{{ customer.name }}</strong>
            <small class="muted-text mono">ID {{ customer.id }}</small>
          </span>
          <span class="mono muted-text">{{ customer.code || '-' }}</span>
          <span>{{ customer.contactName || '-' }}</span>
          <span class="mono">{{ customer.contactPhone || '-' }}</span>
          <span class="muted-text">{{ customer.address }}</span>
          <span><strong>{{ customer.count }}</strong></span>
          <span>{{ customer.salesperson || '-' }}</span>
          <span class="muted-text">{{ formatDate(customer.updatedAt) }}</span>
          <span class="service-row-status">
            <span class="ghost-button subtle-link">查看详情</span>
          </span>
        </button>
        <EmptyState v-if="!filteredCustomers.length && !loading" title="暂无客户资料" description="请尝试调整搜索条件或新增客户。" />
      </div>

      <aside class="glass-panel drawer">
        <h2>客户管理视图</h2>
        <p class="empty-state">当前列表页已按 Figma Make 的客户台账布局调整。点击左侧任一客户可进入详情页。</p>
      </aside>
    </section>

    <section v-else-if="viewMode === 'detail' && selectedCustomer" class="page-stack">
      <article class="glass-panel drawer">
        <div class="drawer-head">
          <div>
            <p class="page-kicker">CUSTOMER DETAIL</p>
            <h2>{{ selectedCustomer.name }}</h2>
            <p>客户编码 {{ selectedCustomer.code || '-' }}</p>
          </div>
          <button class="ghost-button" type="button" @click="openListView">
            <AdminIcon name="chevron-left" />
            返回客户列表
          </button>
        </div>

        <div class="drawer-stats">
          <article><span>客户编码</span><strong class="mono">{{ selectedCustomer.code || '-' }}</strong></article>
          <article><span>最近更新</span><strong>{{ formatDate(selectedCustomer.updatedAt) }}</strong></article>
          <article><span>本年度服务</span><strong>{{ selectedCustomer.count }}</strong></article>
          <article><span>业务员</span><strong>{{ selectedCustomer.salesperson || '-' }}</strong></article>
        </div>

        <section class="drawer-section">
          <h3>客户资料</h3>
          <p>客户名称：{{ selectedCustomer.name }}</p>
          <p>联系人：{{ selectedCustomer.contactName || '未维护' }}</p>
          <p>联系电话：{{ selectedCustomer.contactPhone || '未维护' }}</p>
          <p>客户地址：{{ selectedCustomer.address }}</p>
        </section>

        <section class="drawer-section">
          <h3>设备概览</h3>
          <div class="drawer-stats">
            <article><span>设备总数</span><strong>{{ selectedCustomerDeviceStats?.total ?? '…' }}</strong></article>
            <article><span>需关注维护</span><strong>{{ selectedCustomerDeviceStats?.expiring ?? '…' }}</strong></article>
            <article><span>我方维护</span><strong>{{ selectedCustomerDeviceStats?.ours ?? '…' }}</strong></article>
            <article><span>原厂维护</span><strong>{{ selectedCustomerDeviceStats?.original ?? '…' }}</strong></article>
          </div>
          <p v-if="customerDeviceStats[selectedCustomer.id]?.error" class="form-error">设备统计加载失败：{{ customerDeviceStats[selectedCustomer.id].error }}</p>
        </section>

        <div class="page-actions">
          <button class="ghost-button full" type="button" @click="viewCustomerDevices(selectedCustomer.id)">查看该客户全部设备</button>
          <button v-if="canEdit" class="primary" type="button" @click="openCreateView">新增客户</button>
        </div>
      </article>
    </section>

    <section v-else-if="viewMode === 'create' && canEdit" class="page-stack">
      <article class="glass-panel drawer">
        <div class="drawer-head">
          <div>
            <p class="page-kicker">NEW CUSTOMER</p>
            <h2>新增客户</h2>
            <p>按照 Figma Make 的新建客户流程，先录入基础档案，再进入后续资产管理。</p>
          </div>
          <button class="ghost-button" type="button" @click="openListView">取消</button>
        </div>

        <form id="customer-create-form" class="inline-form" @submit.prevent="submitCreateCustomer">
          <label class="field wide"><span>客户名称</span><input v-model.trim="form.name" required /></label>
          <label class="field"><span>联系人</span><input v-model.trim="form.contactName" /></label>
          <label class="field"><span>联系电话</span><input v-model.trim="form.contactPhone" /></label>
          <label class="field wide"><span>客户地址</span><input v-model.trim="form.address" /></label>
          <div class="page-actions" style="grid-column: 1 / -1; justify-content: flex-end;">
            <button class="ghost-button" type="button" @click="openListView">取消</button>
            <button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存客户档案' }}</button>
          </div>
        </form>
      </article>
    </section>

    <section v-else class="detail-layout">
      <aside class="glass-panel drawer">
        <h2>请选择客户</h2>
        <p class="empty-state">从客户列表选择客户后，可在这里查看联系人、服务统计和设备概览。</p>
      </aside>
    </section>
  </section>
</template>
