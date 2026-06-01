<script setup>
import { computed, reactive, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'
import { downloadText, toCsv } from '../utils/download'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const customers = ref([])
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
const totalRecords = computed(() => customers.value.reduce((total, customer) => total + customer.count, 0))
const keyCustomerCount = computed(() => customers.value.filter((customer) => customer.count > 0).length)

function formatDate(value) {
  return String(value || '').replace('T', ' ').slice(0, 10) || '-'
}

watch(activeCustomer, (customer) => {
  Object.assign(detailForm, {
    name: customer?.name || '',
    contactName: customer?.contactName || '',
    contactPhone: customer?.contactPhone || '',
    address: customer?.address || '',
    salesperson: customer?.salesperson || '',
  })
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
    <header class="page-header">
      <div>
        <p class="page-kicker">CLIENT VAULT</p>
        <h1>客户资产</h1>
        <p>统一管理客户、联系人、地址和历史服务关系。</p>
      </div>
      <div class="page-actions">
        <button class="ghost-button" type="button" @click="exportCsv">导出当前列表明细</button>
        <button v-if="canEdit" class="primary" type="submit" form="customer-create-form" :disabled="saving">新增客户</button>
      </div>
    </header>

    <label class="command-input">
      <span>⌕</span>
      <input v-model.trim="keyword" placeholder="搜索客户名称、地址或联系人..." @keyup.enter="load" />
    </label>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载客户资料...</p>

    <section class="kpi-grid">
      <article class="metric-card"><span>客户总数</span><strong>{{ customers.length }}</strong><small>当前列表</small></article>
      <article class="metric-card"><span>有服务记录客户</span><strong>{{ keyCustomerCount }}</strong><small>本年度</small></article>
      <article class="metric-card"><span>本年度服务</span><strong>{{ totalRecords }}</strong><small>服务单汇总</small></article>
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
        <p v-if="!filteredCustomers.length && !loading" class="empty-state">暂无客户资料</p>
      </div>

      <aside class="glass-panel drawer" v-if="activeCustomer">
        <div class="drawer-head">
          <div>
            <p>客户资料</p>
            <h2>{{ activeCustomer.name }}</h2>
          </div>
          <em class="status 已提交">已启用</em>
        </div>
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
        <button v-if="canEdit" class="ghost-button full" type="button" :disabled="saving" @click="updateActiveCustomer">保存当前客户</button>
        <p v-else class="form-error">当前账号只可查看，不可编辑客户资料。</p>
        <button class="primary full" type="button" @click="exportCsv">导出当前筛选明细</button>
      </aside>
    </section>
  </section>
</template>
