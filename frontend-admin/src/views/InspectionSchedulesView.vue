<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const schedules = ref([])
const customers = ref([])
const devices = ref([])
const engineers = ref([])
const selectedScheduleId = ref('')
const formMode = ref('')
const filters = reactive({
  customerId: '',
  cadence: '',
  active: '',
})
const form = reactive({
  customerId: '',
  deviceId: '',
  targetEngineerId: '',
  cadence: 'monthly',
  nextRunAnchor: '',
  endDate: '',
  active: true,
})

const currentUser = getCurrentUser()
const canEdit = computed(() => ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor'].includes(currentUser?.role))
const cadenceOptions = [
  ['', '全部周期'],
  ['monthly', '每月'],
  ['bi-monthly', '每两月'],
  ['quarterly', '每季度'],
]
const activeOptions = [
  ['', '全部状态'],
  ['true', '启用'],
  ['false', '停用'],
]
const cadenceMap = Object.fromEntries(cadenceOptions.slice(1))

function formatDate(value) {
  return String(value || '').slice(0, 10) || '-'
}

function inputDate(value) {
  return String(value || '').slice(0, 10)
}

function normalizeSchedule(schedule) {
  return {
    raw: schedule,
    id: String(schedule.id || ''),
    customerId: String(schedule.customerId || ''),
    customerName: schedule.customerName || '-',
    deviceId: String(schedule.deviceId || ''),
    deviceName: schedule.deviceName || '-',
    targetEngineerId: String(schedule.targetEngineerId || ''),
    targetEngineerName: schedule.targetEngineerName || '未指定',
    cadence: schedule.cadence || 'monthly',
    cadenceText: cadenceMap[schedule.cadence] || schedule.cadence || '-',
    nextRunAnchor: formatDate(schedule.nextRunAnchor),
    endDate: formatDate(schedule.endDate),
    active: Boolean(schedule.active),
    activeText: schedule.active ? '启用' : '停用',
    nextOrderStatus: schedule.nextOrderStatus || 'pending_confirmation',
    createdAt: formatDate(schedule.createdAt),
    updatedAt: formatDate(schedule.updatedAt),
  }
}

function resetForm(customerId = '') {
  Object.assign(form, {
    customerId,
    deviceId: '',
    targetEngineerId: '',
    cadence: 'monthly',
    nextRunAnchor: '',
    endDate: '',
    active: true,
  })
}

function fillForm(schedule) {
  Object.assign(form, {
    customerId: schedule?.customerId || '',
    deviceId: schedule?.deviceId || '',
    targetEngineerId: schedule?.targetEngineerId || '',
    cadence: schedule?.cadence || 'monthly',
    nextRunAnchor: inputDate(schedule?.raw?.nextRunAnchor),
    endDate: inputDate(schedule?.raw?.endDate),
    active: Boolean(schedule?.active),
  })
}

function cleanOptionalDate(value) {
  const text = String(value || '').trim()
  return text || null
}

function validateForm() {
  if (!form.customerId || !form.deviceId || !form.targetEngineerId || !form.cadence || !form.nextRunAnchor) {
    throw new Error('客户、设备、目标工程师、周期和下次生成日期不能为空')
  }
  if (form.endDate && form.endDate < form.nextRunAnchor) {
    throw new Error('结束日期不能早于下次生成日期')
  }
}

function schedulePayload() {
  validateForm()
  return {
    customerId: form.customerId,
    deviceId: form.deviceId,
    targetEngineerId: form.targetEngineerId,
    cadence: form.cadence,
    nextRunAnchor: form.nextRunAnchor,
    endDate: cleanOptionalDate(form.endDate),
    active: form.active,
  }
}

async function loadCustomers() {
  try {
    const data = await api.get('/customers?pageSize=200')
    customers.value = (data.items || []).map((customer) => ({
      id: String(customer.id),
      name: customer.name || `客户 #${customer.id}`,
    }))
  } catch {
    customers.value = []
  }
}

async function loadEngineers() {
  try {
    const data = await api.get('/users/engineers')
    engineers.value = (data.items || []).map((engineer) => ({
      id: String(engineer.id),
      name: engineer.realName || engineer.username || `工程师 #${engineer.id}`,
    }))
  } catch {
    engineers.value = []
  }
}

async function loadDevices(customerId = form.customerId || filters.customerId) {
  try {
    const params = new URLSearchParams()
    if (customerId) params.set('customerId', customerId)
    const data = await api.get(`/devices${params.toString() ? `?${params}` : ''}`)
    devices.value = (data.items || []).map((device) => ({
      id: String(device.id),
      customerId: String(device.customerId || ''),
      name: device.name || `设备 #${device.id}`,
      model: device.model || '',
      serialNo: device.serialNo || '',
    }))
    if (form.deviceId && !deviceOptions.value.some((device) => device.id === form.deviceId)) {
      form.deviceId = ''
    }
  } catch {
    devices.value = []
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ pageSize: '100' })
    if (filters.customerId) params.set('customerId', filters.customerId)
    if (filters.cadence) params.set('cadence', filters.cadence)
    if (filters.active) params.set('active', filters.active)
    const data = await api.get(`/inspection-schedules?${params}`)
    schedules.value = (data.items || []).map(normalizeSchedule)
    selectedScheduleId.value = schedules.value.some((schedule) => schedule.id === selectedScheduleId.value)
      ? selectedScheduleId.value
      : schedules.value[0]?.id || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function openCreateForm() {
  error.value = ''
  message.value = ''
  formMode.value = 'create'
  selectedScheduleId.value = ''
  resetForm(filters.customerId)
  loadDevices(filters.customerId)
}

function openEditForm(schedule = selectedSchedule.value) {
  if (!schedule || !canEdit.value) return
  error.value = ''
  message.value = ''
  formMode.value = 'edit'
  selectedScheduleId.value = schedule.id
  fillForm(schedule)
  loadDevices(schedule.customerId)
}

function closeForm() {
  formMode.value = ''
  if (!selectedScheduleId.value && schedules.value[0]) selectedScheduleId.value = schedules.value[0].id
}

async function saveSchedule() {
  if (!canEdit.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = schedulePayload()
    let savedId = selectedScheduleId.value
    if (formMode.value === 'create') {
      const data = await api.post('/inspection-schedules', payload)
      savedId = String(data?.item?.id || '')
      message.value = '巡检计划已新增，后续生成的巡检工单仍需主管确认后才会派发给工程师。'
    } else {
      await api.put(`/inspection-schedules/${selectedScheduleId.value}`, payload)
      message.value = '巡检计划已保存'
    }
    closeForm()
    await load()
    if (savedId) selectedScheduleId.value = savedId
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function toggleSchedule(schedule = selectedSchedule.value) {
  if (!schedule || !canEdit.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.put(`/inspection-schedules/${schedule.id}`, {
      customerId: schedule.customerId,
      deviceId: schedule.deviceId,
      targetEngineerId: schedule.targetEngineerId,
      cadence: schedule.cadence,
      nextRunAnchor: schedule.nextRunAnchor,
      endDate: schedule.raw.endDate || null,
      active: !schedule.active,
    })
    message.value = schedule.active ? '巡检计划已停用' : '巡检计划已启用'
    await load()
    selectedScheduleId.value = schedule.id
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function resetFilters() {
  Object.assign(filters, { customerId: '', cadence: '', active: '' })
  loadDevices('')
  load()
}

const selectedSchedule = computed(() => schedules.value.find((schedule) => schedule.id === selectedScheduleId.value) || schedules.value[0] || null)
const customerOptions = computed(() => {
  const map = new Map()
  for (const customer of customers.value) map.set(customer.id, customer.name)
  for (const schedule of schedules.value) map.set(schedule.customerId, schedule.customerName)
  return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const deviceOptions = computed(() => {
  if (!form.customerId) return devices.value
  return devices.value.filter((device) => device.customerId === form.customerId)
})
const totalCount = computed(() => schedules.value.length)
const activeCount = computed(() => schedules.value.filter((schedule) => schedule.active).length)
const dueSoonCount = computed(() => {
  const deadline = Date.now() + 14 * 24 * 60 * 60 * 1000
  return schedules.value.filter((schedule) => {
    if (!schedule.active || !schedule.nextRunAnchor || schedule.nextRunAnchor === '-') return false
    const nextRun = new Date(`${schedule.nextRunAnchor}T23:59:59`).getTime()
    return nextRun <= deadline
  }).length
})

watch(() => form.customerId, (customerId, previousCustomerId) => {
  if (customerId !== previousCustomerId) {
    form.deviceId = ''
    loadDevices(customerId)
  }
})

watch(selectedSchedule, (schedule) => {
  if (!formMode.value && schedule) fillForm(schedule)
}, { immediate: true })

onMounted(async () => {
  await Promise.all([loadCustomers(), loadEngineers(), loadDevices('')])
  await load()
})
</script>

<template>
  <section class="figma-page">
    <header class="page-header">
      <div>
        <p class="page-kicker">INSPECTION CADENCE</p>
        <h1>巡检计划</h1>
        <p>按客户与设备配置周期性巡检模板；自动生成的巡检工单仍需主管确认后才会派发给工程师。</p>
      </div>
      <div class="page-actions">
        <button class="ghost-button" type="button" @click="resetFilters">重置筛选</button>
        <button v-if="canEdit" class="ghost-button" type="button" @click="openCreateForm">新增计划</button>
        <button class="primary" type="button" :disabled="loading" @click="load">刷新数据</button>
      </div>
    </header>

    <section class="kpi-grid">
      <article class="metric-card"><span>计划总数</span><strong>{{ totalCount }}</strong><small>当前筛选</small></article>
      <article class="metric-card"><span>启用计划</span><strong>{{ activeCount }}</strong><small>可参与后续生成</small></article>
      <article class="metric-card"><span>14 天内待生成</span><strong>{{ dueSoonCount }}</strong><small>仍需确认派发</small></article>
    </section>

    <section class="device-filter-grid">
      <label class="field"><span>客户</span><select v-model="filters.customerId" @change="load"><option value="">全部客户</option><option v-for="customer in customerOptions" :key="customer.id" :value="customer.id">{{ customer.name }}</option></select></label>
      <label class="field"><span>周期</span><select v-model="filters.cadence" @change="load"><option v-for="[value, label] in cadenceOptions" :key="value" :value="value">{{ label }}</option></select></label>
      <label class="field"><span>启用状态</span><select v-model="filters.active" @change="load"><option v-for="[value, label] in activeOptions" :key="value" :value="value">{{ label }}</option></select></label>
      <span class="chip">模板保存不会直接生成工程师可见任务</span>
    </section>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载巡检计划...</p>

    <section class="detail-layout">
      <div class="glass-panel table-card inspection-schedule-table">
        <div class="table-head">
          <span>客户 / 设备</span>
          <span>目标工程师</span>
          <span>周期</span>
          <span>下次生成日期</span>
          <span>启用状态</span>
          <span>操作</span>
        </div>
        <button
          v-for="schedule in schedules"
          :key="schedule.id"
          class="table-row"
          :class="{ selected: selectedSchedule?.id === schedule.id }"
          type="button"
          @click="selectedScheduleId = schedule.id"
        >
          <span><strong>{{ schedule.customerName }}</strong><small>{{ schedule.deviceName }}</small></span>
          <span>{{ schedule.targetEngineerName }}</span>
          <span><em class="type-pill">{{ schedule.cadenceText }}</em></span>
          <span class="muted-text">{{ schedule.nextRunAnchor }}</span>
          <span><em class="status" :class="schedule.active ? '启用' : '已作废'">{{ schedule.activeText }}</em></span>
          <span class="row-actions">查看详情</span>
        </button>
        <p v-if="!schedules.length && !loading" class="empty-state">暂无巡检计划</p>
      </div>

      <aside class="glass-panel drawer">
        <div class="drawer-head">
          <div>
            <p>{{ formMode ? '巡检计划配置' : '巡检计划详情' }}</p>
            <h2>{{ formMode === 'create' ? '新增巡检计划' : selectedSchedule?.deviceName || '请选择计划' }}</h2>
          </div>
          <em v-if="selectedSchedule && !formMode" class="status" :class="selectedSchedule.active ? '启用' : '已作废'">{{ selectedSchedule.activeText }}</em>
        </div>

        <form v-if="formMode" class="drawer-form" @submit.prevent="saveSchedule">
          <label class="field">
            <span>客户</span>
            <select v-model="form.customerId">
              <option value="">请选择客户</option>
              <option v-for="customer in customerOptions" :key="customer.id" :value="customer.id">{{ customer.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>设备</span>
            <select v-model="form.deviceId" :disabled="!form.customerId">
              <option value="">{{ form.customerId ? '请选择该客户设备' : '请先选择客户' }}</option>
              <option v-for="device in deviceOptions" :key="device.id" :value="device.id">
                {{ device.name }}<template v-if="device.model"> / {{ device.model }}</template><template v-if="device.serialNo"> / {{ device.serialNo }}</template>
              </option>
            </select>
          </label>
          <label class="field">
            <span>目标工程师</span>
            <select v-model="form.targetEngineerId">
              <option value="">请选择工程师</option>
              <option v-for="engineer in engineers" :key="engineer.id" :value="engineer.id">{{ engineer.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>周期</span>
            <select v-model="form.cadence">
              <option v-for="[value, label] in cadenceOptions.slice(1)" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <label class="field">
            <span>下次生成日期</span>
            <input v-model="form.nextRunAnchor" type="date" />
          </label>
          <label class="field">
            <span>结束日期</span>
            <input v-model="form.endDate" type="date" />
          </label>
          <label class="field">
            <span>启用状态</span>
            <select v-model="form.active">
              <option :value="true">启用</option>
              <option :value="false">停用</option>
            </select>
          </label>
          <p class="drawer-note">计划保存后只是巡检模板；到期生成的巡检工单状态为待确认，主管确认并派发前不会出现在工程师任务列表。</p>
          <p v-if="error" class="form-error">{{ error }}</p>
          <div class="page-actions">
            <button class="ghost-button" type="button" :disabled="saving" @click="closeForm">取消</button>
            <button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存计划' }}</button>
          </div>
        </form>

        <template v-else-if="selectedSchedule">
          <div class="drawer-stats">
            <article><span>周期</span><strong>{{ selectedSchedule.cadenceText }}</strong></article>
            <article><span>下次生成</span><strong>{{ selectedSchedule.nextRunAnchor }}</strong></article>
          </div>
          <section class="drawer-section">
            <h3>绑定对象</h3>
            <p>客户：{{ selectedSchedule.customerName }}</p>
            <p>设备：{{ selectedSchedule.deviceName }}</p>
            <p>目标工程师：{{ selectedSchedule.targetEngineerName }}</p>
          </section>
          <section class="drawer-section">
            <h3>生成语义</h3>
            <p>模板保存不会生成工程师可见任务。</p>
            <p>后续生成状态：{{ selectedSchedule.nextOrderStatus === 'pending_confirmation' ? '待确认' : selectedSchedule.nextOrderStatus }}</p>
            <p>结束日期：{{ selectedSchedule.endDate }}</p>
          </section>
          <section class="drawer-section">
            <h3>维护信息</h3>
            <p>创建日期：{{ selectedSchedule.createdAt }}</p>
            <p>最近更新：{{ selectedSchedule.updatedAt }}</p>
          </section>
          <div v-if="canEdit" class="page-actions">
            <button class="ghost-button" type="button" @click="openEditForm(selectedSchedule)">编辑计划</button>
            <button class="primary" type="button" :disabled="saving" @click="toggleSchedule(selectedSchedule)">
              {{ selectedSchedule.active ? '停用计划' : '启用计划' }}
            </button>
          </div>
        </template>

        <p v-else class="empty-state">请选择一条计划查看详情，或点击“新增计划”配置巡检模板。</p>
      </aside>
    </section>
  </section>
</template>
