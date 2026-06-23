<script setup>
import { computed, onMounted, ref } from 'vue'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { normalizePreviewServiceMode } from '../services/service-mode'

const { zh } = usePreviewI18n()
const loading = ref(false)
const error = ref('')
const preview = ref({ items: [] })
const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const startDate = ref(`${currentMonth}-01`)
const endDate = ref(`${currentMonth}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`)

const detailRows = computed(() => preview.value.items || [])
const onsiteCount = computed(() => detailRows.value.filter((row) => normalizePreviewServiceMode(row) === 'onsite').length)
const remoteCount = computed(() => detailRows.value.filter((row) => normalizePreviewServiceMode(row) === 'remote').length)
const officeCount = computed(() => detailRows.value.filter((row) => normalizePreviewServiceMode(row) === 'office').length)
const stats = computed(() => [
  ['服务总数', String(detailRows.value.length)],
  ['现场服务', String(onsiteCount.value)],
  ['远程服务', String(remoteCount.value)],
  ['内勤工作', String(officeCount.value)],
])

const categoryBars = computed(() => {
  const counts = new Map()
  for (const row of detailRows.value) {
    const key = row.category || row.workNature || '其他'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const items = [...counts.entries()].map(([label, count]) => ({ label, count }))
  const max = Math.max(1, ...items.map((item) => item.count))
  return items.map((item) => ({ ...item, percent: Math.max(10, (item.count / max) * 100) }))
})

const weeklyBars = computed(() => {
  const weeks = ['第1周', '第2周', '第3周', '第4周']
  const counts = weeks.map((label) => ({ label, count: 0 }))
  detailRows.value.forEach((row, index) => {
    const day = Number(String(row.date || '').slice(-2))
    const weekIndex = day ? Math.min(3, Math.floor((day - 1) / 7)) : index % 4
    counts[weekIndex].count += 1
  })
  const max = Math.max(1, ...counts.map((item) => item.count))
  return counts.map((item) => ({ ...item, percent: Math.max(8, (item.count / max) * 100) }))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    preview.value = await api.get(`/service-orders/timesheet/monthly?mine=1&startDate=${startDate.value}&endDate=${endDate.value}`)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const lines = [
    ['填表人', '日期', '星期', '工作性质', '类别', '客户名称', '专案/产品', '工作内容', '进度', '工时', '备注'],
    ...detailRows.value.map((row) => [
      row.engineerName || '',
      row.date || '',
      row.weekday || '',
      row.workNature || '',
      row.category || '',
      row.customerName || '',
      row.productName || '',
      row.workContent || '',
      row.progress || '',
      Number(row.workHours || 1),
      row.remark || '',
    ]),
  ]
  const csv = lines
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `timesheet-${startDate.value}-${endDate.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<template>
  <main class="engineer-shell">
    <header class="topbar">
      <div>
        <BrandEyebrow text="工程师工作台 / 月报" title="月报" />
      </div>
    </header>

    <section class="form-section timesheet-filter">
      <label class="field"><span>{{ zh('开始日期') }}</span><input v-model="startDate" type="date" /></label>
      <label class="field"><span>{{ zh('结束日期') }}</span><input v-model="endDate" type="date" /></label>
      <button class="locate" type="button" :disabled="loading" @click="load"><PreviewIcon name="refresh" />{{ zh(loading ? '正在加载' : '刷新预览') }}</button>
      <button class="primary" type="button" :disabled="loading || !detailRows.length" @click="exportCsv"><PreviewIcon name="download" />{{ zh('导出月报') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="load">{{ zh('重试') }}</button></p>
    <p v-else-if="loading" class="muted">{{ zh('正在加载本人真实月报…') }}</p>

    <section class="metric-grid engineer-metrics timesheet-metrics">
      <article v-for="stat in stats" :key="stat[0]" class="metric-card blue">
        <span>{{ zh(stat[0]) }}</span>
        <strong>{{ stat[1] }}</strong>
      </article>
    </section>

    <section class="timesheet-grid">
      <article class="form-section">
        <h2>{{ zh('服务类型分布') }}</h2>
        <div class="bar-list">
          <div v-for="item in categoryBars" :key="item.label">
            <span>{{ zh(item.label) }}</span>
            <b>{{ item.count }}</b>
            <i :style="{ width: `${item.percent}%` }"></i>
          </div>
          <p v-if="!categoryBars.length && !loading" class="empty-state">{{ zh('暂无类型分布') }}</p>
        </div>
      </article>

      <article class="form-section">
        <h2>{{ zh('每周服务趋势') }}</h2>
        <div class="weekly-bars">
          <div v-for="item in weeklyBars" :key="item.label">
            <i :style="{ height: `${item.percent}%` }"></i>
            <span>{{ zh(item.label) }}</span>
            <strong>{{ item.count }}</strong>
          </div>
        </div>
      </article>
    </section>

    <section class="form-section timesheet-table">
      <h2>{{ zh(preview.label || '月度活动明细') }}</h2>
      <div class="detail-table">
        <div class="detail-table-head">
          <span>{{ zh('日期') }}</span>
          <span>{{ zh('类别') }}</span>
          <span>{{ zh('客户') }}</span>
          <span>{{ zh('工作内容') }}</span>
          <span>{{ zh('工时') }}</span>
        </div>
        <article v-for="row in detailRows" :key="`${row.serviceOrderId || row.manualEntryId}-${row.date}-${row.category}`">
          <span>{{ row.date }}</span>
          <strong>{{ zh(row.category || row.workNature || '-') }}</strong>
          <span>{{ zh(row.customerName || '内部工作') }}</span>
          <span>{{ zh(row.workContent || '-') }}</span>
          <span>{{ Number(row.workHours || 1) }}h</span>
        </article>
        <p v-if="!detailRows.length && !loading" class="empty-state">{{ zh('暂无月报数据') }}</p>
      </div>
    </section>
  </main>
</template>
