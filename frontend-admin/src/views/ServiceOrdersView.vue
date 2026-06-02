<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'
import { downloadText, toCsv } from '../utils/download'

const activeStatus = ref('全部')
const selectedOrderId = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const keyword = ref('')
const recentOnly = ref(false)
const serviceOrders = ref([])
const engineerOptions = ref([])
const detailForm = reactive({
  issueDescription: '',
  internalNote: '',
})
const confirmForm = reactive({
  engineerId: '',
  plannedStartAt: '',
  plannedEndAt: '',
})

const statusOptions = ['全部', '待确认', '进行中', '已提交', '草稿', '已作废']
const statusMap = { pending_confirmation: '待确认', draft: '草稿', in_progress: '进行中', submitted: '已提交', cancelled: '已作废' }
const typeMap = { install: '安装', repair: '排障', maintain: '保养', inspect: '巡检', training: '培训', remote: '远程支持', other: '其他' }
const reverseStatusMap = { 待确认: 'pending_confirmation', 草稿: 'draft', 进行中: 'in_progress', 已提交: 'submitted', 已作废: 'cancelled' }
const currentUser = getCurrentUser()
const canEdit = computed(() => ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor'].includes(currentUser?.role))

function normalizeOrder(order) {
  return {
    raw: order,
    id: order.id,
    orderNo: order.orderNo || `SR-${order.id}`,
    customerName: order.customerName || '-',
    contactName: order.contactName || '未维护联系人',
    deviceName: order.deviceName || order.productName || '-',
    engineerText: (order.engineers || []).map((engineer) => engineer.realName).filter(Boolean).join('、') || order.engineerName || '未指定',
    targetEngineerText: order.targetEngineerName || '未指定',
    serviceTypeText: typeMap[order.serviceType] || order.serviceType || '-',
    statusText: statusMap[order.status] || order.status || '-',
    summary: order.issueDescription || order.report?.resultDescription || '服务记录已同步',
    internalNote: order.internalNote || '',
    serviceAt: String(order.report?.actualStartAt || order.serviceAt || order.submittedAt || order.createdAt || '').replace('T', ' ').slice(0, 16) || '-',
    mode: order.serviceMode === 'remote' ? '远程服务' : order.serviceMode === 'office' ? '内勤工作' : '现场服务',
  }
}

function toDatetimeLocal(value) {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 16).replace(' ', 'T')
}

function fromDatetimeLocal(value) {
  return value ? String(value).replace('T', ' ') : null
}

async function loadEngineers() {
  if (engineerOptions.value.length || !canEdit.value) return
  const data = await api.get('/users/engineers')
  engineerOptions.value = data.items || []
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      pageSize: '50',
      sortBy: 'createdAt',
      sortDir: 'desc',
    })
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    if (activeStatus.value !== '全部') params.set('status', reverseStatusMap[activeStatus.value] || activeStatus.value)
    if (recentOnly.value) {
      const date = new Date()
      date.setDate(date.getDate() - 30)
      params.set('startDate', date.toISOString().slice(0, 10))
    }
    const data = await api.get(`/service-orders?${params}`)
    serviceOrders.value = (data.items || []).map(normalizeOrder)
    selectedOrderId.value = serviceOrders.value.some((order) => order.id === selectedOrderId.value)
      ? selectedOrderId.value
      : serviceOrders.value[0]?.id || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function saveSelectedOrder() {
  if (!canEdit.value) return
  if (!selectedOrder.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.put(`/service-orders/${selectedOrder.value.id}`, {
      issueDescription: detailForm.issueDescription,
      internalNote: detailForm.internalNote,
      deviceId: selectedOrder.value.raw.deviceId || null,
    })
    message.value = '服务记录已保存'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function confirmSelectedInspectionOrder() {
  if (!canEdit.value || !selectedOrder.value?.raw?.pendingConfirmation) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.post(`/service-orders/${selectedOrder.value.id}/confirm-inspection`, {
      engineerId: Number(confirmForm.engineerId || 0),
      plannedStartAt: fromDatetimeLocal(confirmForm.plannedStartAt),
      plannedEndAt: fromDatetimeLocal(confirmForm.plannedEndAt),
    })
    message.value = '巡检工单已确认并派发'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function resetFilters() {
  keyword.value = ''
  activeStatus.value = '全部'
  recentOnly.value = false
  load()
}

function toggleRecentOnly() {
  recentOnly.value = !recentOnly.value
  load()
}

function exportCsv() {
  const rows = [
    ['记录编号', '客户名称', '服务类型', '工程师', '时间', '状态', '描述'],
    ...filteredOrders.value.map((order) => [
      order.orderNo,
      order.customerName,
      order.serviceTypeText,
      order.engineerText,
      order.serviceAt,
      order.statusText,
      order.summary,
    ]),
  ]
  downloadText(`service-orders-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${toCsv(rows)}`, 'text/csv;charset=utf-8')
}

const filteredOrders = computed(() => serviceOrders.value)
const selectedOrder = computed(() => filteredOrders.value.find((order) => order.id === selectedOrderId.value) || filteredOrders.value[0] || null)

watch(selectedOrder, (order) => {
  detailForm.issueDescription = order?.summary || ''
  detailForm.internalNote = order?.internalNote || ''
  confirmForm.engineerId = order?.raw?.targetEngineerId || ''
  confirmForm.plannedStartAt = toDatetimeLocal(order?.raw?.plannedStartAt || order?.raw?.serviceAt)
  confirmForm.plannedEndAt = toDatetimeLocal(order?.raw?.plannedEndAt)
}, { immediate: true })

onMounted(async () => {
  await Promise.all([load(), loadEngineers()])
})
</script>

<template>
  <section class="figma-page">
    <header class="page-header">
      <div>
        <p class="page-kicker">SERVICE COMMAND</p>
        <h1>工单处理</h1>
        <p>集中查看服务记录、工程师、状态和客户确认进度。</p>
      </div>
      <div class="page-actions">
        <button class="ghost-button" type="button" @click="resetFilters">重置筛选</button>
        <button class="ghost-button" type="button" :disabled="!filteredOrders.length" @click="exportCsv">导出 CSV</button>
        <button class="primary" type="button" @click="load">刷新数据</button>
      </div>
    </header>

    <div class="filter-bar">
      <label class="command-input">
        <span>⌕</span>
        <input v-model.trim="keyword" placeholder="搜索工单编号、客户或描述..." @keyup.enter="load" />
      </label>
      <button class="filter-chip" :class="{ active: recentOnly }" type="button" @click="toggleRecentOnly">最近 30 天</button>
      <select v-model="activeStatus" class="select-chip" @change="load">
        <option v-for="status in statusOptions" :key="status">{{ status }}</option>
      </select>
    </div>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载服务记录...</p>

    <section class="detail-layout">
      <div class="glass-panel table-card service-table">
        <div class="table-head">
          <span>记录编号</span>
          <span>客户名称</span>
          <span>服务类型</span>
          <span>工程师</span>
          <span>时间</span>
          <span>状态</span>
        </div>
        <button
          v-for="order in filteredOrders"
          :key="order.id"
          class="table-row"
          :class="{ selected: selectedOrder?.id === order.id }"
          type="button"
          @click="selectedOrderId = order.id"
        >
          <span class="mono">{{ order.orderNo }}</span>
          <span>{{ order.customerName }}</span>
          <span><em class="type-pill">{{ order.serviceTypeText }}</em></span>
          <span>{{ order.engineerText }}</span>
          <span class="muted-text">{{ order.serviceAt }}</span>
          <span><em class="status" :class="order.statusText">{{ order.statusText }}</em></span>
        </button>
        <p v-if="!filteredOrders.length && !loading" class="empty-state">暂无服务记录</p>
      </div>

      <aside class="glass-panel drawer" v-if="selectedOrder">
        <div class="drawer-head">
          <div>
            <p>服务记录详情</p>
            <h2>{{ selectedOrder.orderNo }}</h2>
          </div>
          <em class="status" :class="selectedOrder.statusText">{{ selectedOrder.statusText }}</em>
        </div>
        <div class="drawer-stats">
          <article><span>服务方式</span><strong>{{ selectedOrder.mode }}</strong></article>
          <article><span>工程师</span><strong>{{ selectedOrder.engineerText }}</strong></article>
        </div>
        <section v-if="selectedOrder.raw.pendingConfirmation && canEdit" class="drawer-section confirm-panel">
          <h3>巡检派发确认</h3>
          <p class="muted">该巡检单由计划自动生成，确认前不会出现在工程师任务列表。</p>
          <label class="drawer-field">
            <span>派发工程师</span>
            <select v-model="confirmForm.engineerId" class="drawer-input">
              <option value="">请选择工程师</option>
              <option v-for="engineer in engineerOptions" :key="engineer.id" :value="engineer.id">
                {{ engineer.realName || engineer.username }}
              </option>
            </select>
          </label>
          <label class="drawer-field">
            <span>计划开始</span>
            <input v-model="confirmForm.plannedStartAt" class="drawer-input" type="datetime-local" />
          </label>
          <label class="drawer-field">
            <span>计划结束</span>
            <input v-model="confirmForm.plannedEndAt" class="drawer-input" type="datetime-local" />
          </label>
          <button class="primary full" type="button" :disabled="saving || !confirmForm.engineerId" @click="confirmSelectedInspectionOrder">
            {{ saving ? '确认中...' : '确认并派发巡检工单' }}
          </button>
          <p class="muted">原计划目标工程师：{{ selectedOrder.targetEngineerText }}</p>
        </section>
        <section class="drawer-section">
          <h3>详细描述</h3>
          <textarea v-model.trim="detailForm.issueDescription" class="drawer-textarea" rows="4" />
        </section>
        <section class="drawer-section">
          <h3>内部备注</h3>
          <textarea v-model.trim="detailForm.internalNote" class="drawer-textarea" rows="3" placeholder="填写内部备注，保存后写入后端" />
        </section>
        <section class="drawer-section">
          <h3>服务时间线</h3>
          <div class="timeline">
            <article><span></span><div><strong>服务时间</strong><small>{{ selectedOrder.serviceAt }}</small></div></article>
            <article><span></span><div><strong>服务方式</strong><small>{{ selectedOrder.mode }}</small></div></article>
            <article class="active"><span></span><div><strong>当前状态</strong><small>{{ selectedOrder.statusText }}</small></div></article>
          </div>
        </section>
        <button v-if="canEdit" class="primary full" type="button" :disabled="saving" @click="saveSelectedOrder">
          {{ saving ? '保存中...' : '保存工单信息' }}
        </button>
        <p v-else class="form-error">当前账号只可查看，不可修改工单。</p>
      </aside>
    </section>
  </section>
</template>
