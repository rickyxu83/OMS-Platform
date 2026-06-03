<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api'
import EmptyState from '../components/admin/EmptyState.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'

const loading = ref(false)
const error = ref('')
const preview = ref({ items: [] })
const lastLoadedMonth = ref('')
const now = new Date()
const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

const rows = computed(() => {
  const groups = new Map()
  for (const item of preview.value.items || []) {
    const key = item.workNature || item.category || '其他'
    const current = groups.get(key) || { count: 0, hours: 0, hasHours: false, details: new Set() }
    const workHours = Number(item.workHours)
    current.count += 1
    if (Number.isFinite(workHours)) {
      current.hours += workHours
      current.hasHours = true
    }
    if (item.category) current.details.add(item.category)
    groups.set(key, current)
  }
  return [...groups.entries()].map(([label, item]) => [label, `${item.count} 条`, item.hasHours ? `${item.hours}h` : '—', [...item.details].slice(0, 3).join('、') || '暂无分类'])
})

const totalItems = computed(() => (preview.value.items || []).length)
const serviceOrderCount = computed(() => (preview.value.items || []).filter((item) => item.source === 'service_order').length)
const manualCount = computed(() => (preview.value.items || []).filter((item) => item.source === 'manual').length)
const categoryCount = computed(() => new Set((preview.value.items || []).map((item) => item.category).filter(Boolean)).size)

async function load() {
  loading.value = true
  error.value = ''
  try {
    preview.value = await api.get(`/service-orders/timesheet/monthly?startDate=${startDate}&endDate=${endDate}&engineerId=all`)
    lastLoadedMonth.value = preview.value.label || `${startDate} 至 ${endDate}`
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const lines = [['分类', '记录数', '工时', '明细'], ...rows.value]
  const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `timesheet-${startDate}-${endDate}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="MONTHLY EXPORT" title="月报导出" description="按当前月份读取月报数据，并导出 CSV 汇总。">
      <template #actions>
        <button class="primary" type="button" :disabled="loading || !rows.length" @click="exportCsv">导出月报</button>
      </template>
    </PageHeader>

    <div class="stepper">
      <span class="active"><b>1</b><em>读取本月数据</em></span>
      <span class="active"><b>2</b><em>预览汇总</em></span>
      <span><b>3</b><em>导出 CSV</em></span>
    </div>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-else-if="loading" class="muted">正在读取月报数据...</p>

    <section class="kpi-grid">
      <KpiCard title="已加载记录" :value="totalItems || '—'" subtitle="当前月份" icon="ticket" />
      <KpiCard title="服务记录" :value="serviceOrderCount || '—'" subtitle="服务记录来源" icon="activity" />
      <KpiCard title="手工记录" :value="manualCount || '—'" subtitle="手工补录来源" icon="duration" />
    </section>

    <section class="figma-grid">
      <article class="glass-panel panel" style="grid-column: span 8">
        <div class="panel-head">
          <div>
            <h2>{{ lastLoadedMonth || '本月工时汇总' }}</h2>
            <p>按月报字段预览导出内容。</p>
          </div>
          <span class="chip">{{ totalItems ? `${totalItems} 条` : '—' }}</span>
        </div>
        <div class="summary-rows">
          <div v-for="row in rows" :key="row[0]">
            <strong>{{ row[0] }}</strong>
            <span>{{ row[1] }}</span>
            <span>{{ row[2] }}</span>
            <small>{{ row[3] }}</small>
          </div>
          <EmptyState v-if="!rows.length && !loading" title="暂无月报数据" description="当前月份还没有月报记录，请检查数据范围。" />
        </div>
      </article>

      <article class="glass-panel panel" style="grid-column: span 4">
        <h2>导出前检查</h2>
        <ul class="report-checks">
          <li><span>已加载记录</span><strong>{{ totalItems || '—' }}</strong></li>
          <li><span>服务记录 / 手工记录</span><strong>{{ serviceOrderCount || '—' }} / {{ manualCount || '—' }}</strong></li>
          <li><span>分类数量</span><strong>{{ categoryCount || '—' }}</strong></li>
        </ul>
        <button class="primary full" type="button" :disabled="loading || !rows.length" @click="exportCsv">导出月报</button>
      </article>
    </section>
  </section>
</template>
