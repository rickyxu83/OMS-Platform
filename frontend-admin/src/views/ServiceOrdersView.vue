<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AdminIcon from '../components/AdminIcon.vue'
import EmptyState from '../components/admin/EmptyState.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import StatusBadge from '../components/admin/StatusBadge.vue'
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
const pendingCount = computed(() => serviceOrders.value.filter((order) => order.statusText === '待确认').length)
const processingCount = computed(() => serviceOrders.value.filter((order) => order.statusText === '进行中').length)
const submittedTodayCount = computed(() => serviceOrders.value.filter((order) => order.statusText === '已提交' && order.serviceAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length)
const submittedCount = computed(() => serviceOrders.value.filter((order) => order.statusText === '已提交').length)

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
      : ''
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
const selectedOrder = computed(() => filteredOrders.value.find((order) => order.id === selectedOrderId.value) || null)

function toggleSelectedOrder(orderId) {
  selectedOrderId.value = selectedOrderId.value === orderId ? '' : orderId
}

function getStatusTone(statusText) {
  const toneMap = {
    待确认: 'pending',
    进行中: 'processing',
    已提交: 'success',
    草稿: 'default',
    已作废: 'danger',
  }
  return toneMap[statusText] || 'default'
}

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
    <PageHeader kicker="SERVICE COMMAND" title="工单处理" description="集中查看服务记录、工程师、状态和客户确认进度。">
      <template #actions>
        <button class="ghost-button" type="button" @click="resetFilters">重置筛选</button>
        <button class="ghost-button" type="button" :disabled="!filteredOrders.length" @click="exportCsv">导出 CSV</button>
        <button class="primary" type="button" @click="load">刷新数据</button>
      </template>
    </PageHeader>

    <FilterBar v-model:query="keyword" search-placeholder="搜索工单编号、客户或描述..." @submit="load">
      <button class="filter-chip" :class="{ active: recentOnly }" type="button" @click="toggleRecentOnly">最近 30 天</button>
      <select v-model="activeStatus" class="select-chip" @change="load">
        <option v-for="status in statusOptions" :key="status">{{ status }}</option>
      </select>
    </FilterBar>

    <section class="kpi-grid">
      <KpiCard title="全部工单" :value="serviceOrders.length" subtitle="当前视图" icon="ticket" />
      <KpiCard title="待确认工单" :value="pendingCount" subtitle="待派发 / 待确认" icon="warn" />
      <KpiCard title="进行中工单" :value="processingCount" subtitle="需持续跟进" icon="activity" />
      <KpiCard title="已提交工单" :value="submittedCount" subtitle="当前结果汇总" icon="done" />
    </section>

    <section class="kpi-grid service-kpi-grid-secondary">
      <KpiCard title="今日提交" :value="submittedTodayCount" subtitle="本日提交记录" icon="duration" />
      <KpiCard title="可编辑工单" :value="canEdit ? filteredOrders.length : 0" subtitle="当前账号权限范围" icon="edit" />
      <KpiCard title="最近 30 天" :value="recentOnly ? filteredOrders.length : serviceOrders.length" :subtitle="recentOnly ? '已开启时间筛选' : '显示全部时间范围'" icon="calendar" />
    </section>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载服务记录...</p>

    <section class="service-command-layout">
      <div class="glass-panel table-card service-table make-data-table">
        <div class="table-toolbar">
          <div>
            <h2>服务工单列表</h2>
            <p>点击行后在下方查看和编辑完整工单信息。</p>
          </div>
          <span class="table-count">{{ filteredOrders.length }} 条记录</span>
        </div>
        <div class="table-head">
          <span>记录编号</span>
          <span>客户名称</span>
          <span>服务类型</span>
          <span>工程师</span>
          <span>时间</span>
          <span>状态</span>
        </div>
        <template v-for="order in filteredOrders" :key="order.id">
          <button
            class="table-row"
            :class="{ selected: selectedOrder?.id === order.id }"
            type="button"
            :aria-expanded="selectedOrder?.id === order.id"
            @click="toggleSelectedOrder(order.id)"
          >
            <span class="service-row-main mono">
              <AdminIcon :name="selectedOrder?.id === order.id ? 'chevron-down' : 'chevron-right'" class="service-row-chevron" />
              <strong>{{ order.orderNo }}</strong>
            </span>
            <span>{{ order.customerName }}</span>
            <span><em class="type-pill">{{ order.serviceTypeText }}</em></span>
            <span>{{ order.engineerText }}</span>
            <span class="muted-text">{{ order.serviceAt }}</span>
            <span class="service-row-status">
              <StatusBadge :label="order.statusText" :tone="getStatusTone(order.statusText)" compact />
              <em class="row-expand-indicator">{{ selectedOrder?.id === order.id ? '收起详情' : '查看详情' }}</em>
            </span>
          </button>

          <section v-if="selectedOrder?.id === order.id" class="service-detail-card service-inline-detail">
            <div class="service-detail-head">
              <div>
                <p class="page-kicker">SERVICE DETAIL</p>
                <h2>{{ selectedOrder.orderNo }}</h2>
                <p>{{ selectedOrder.customerName }} · {{ selectedOrder.contactName }}</p>
              </div>
              <StatusBadge :label="selectedOrder.statusText" :tone="getStatusTone(selectedOrder.statusText)" />
            </div>

            <div class="service-detail-metrics">
              <article><span>服务方式</span><strong>{{ selectedOrder.mode }}</strong></article>
              <article><span>服务类型</span><strong>{{ selectedOrder.serviceTypeText }}</strong></article>
              <article><span>工程师</span><strong>{{ selectedOrder.engineerText }}</strong></article>
              <article><span>服务时间</span><strong>{{ selectedOrder.serviceAt }}</strong></article>
            </div>

            <section v-if="selectedOrder.raw.pendingConfirmation && canEdit" class="confirm-panel service-confirm-card">
              <div>
                <h3>巡检派发确认</h3>
                <p class="muted">该巡检单由计划自动生成，确认前不会出现在工程师任务列表。</p>
              </div>
              <div class="service-form-grid confirm-form-grid">
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
                <button class="primary" type="button" :disabled="saving || !confirmForm.engineerId" @click="confirmSelectedInspectionOrder">
                  {{ saving ? '确认中...' : '确认并派发' }}
                </button>
              </div>
              <p class="muted">原计划目标工程师：{{ selectedOrder.targetEngineerText }}</p>
            </section>

            <div class="service-detail-body">
              <section class="service-edit-section">
                <h3>服务信息</h3>
                <div class="service-form-grid">
                  <label class="drawer-field wide">
                    <span>详细描述</span>
                    <textarea v-model.trim="detailForm.issueDescription" class="drawer-textarea" rows="5" />
                  </label>
                  <label class="drawer-field wide">
                    <span>内部备注</span>
                    <textarea v-model.trim="detailForm.internalNote" class="drawer-textarea" rows="5" placeholder="填写内部备注，保存后写入后端" />
                  </label>
                </div>
              </section>
              <section class="service-timeline-card">
                <h3>服务时间线</h3>
                <div class="timeline">
                  <article><span></span><div><strong>服务时间</strong><small>{{ selectedOrder.serviceAt }}</small></div></article>
                  <article><span></span><div><strong>服务方式</strong><small>{{ selectedOrder.mode }}</small></div></article>
                  <article class="active"><span></span><div><strong>当前状态</strong><small>{{ selectedOrder.statusText }}</small></div></article>
                </div>
              </section>
            </div>

            <div class="service-detail-actions">
              <p v-if="!canEdit" class="form-error">当前账号只可查看，不可修改工单。</p>
              <button v-else class="primary" type="button" :disabled="saving" @click="saveSelectedOrder">
                {{ saving ? '保存中...' : '保存工单信息' }}
              </button>
            </div>
          </section>
        </template>
        <EmptyState v-if="!filteredOrders.length && !loading" title="暂无服务记录" description="请调整筛选条件或刷新数据。" />
      </div>
    </section>
  </section>
</template>
