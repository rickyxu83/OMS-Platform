<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api'
import EmptyState from '../components/admin/EmptyState.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import StatusBadge from '../components/admin/StatusBadge.vue'
import { downloadText, toCsv } from '../utils/download'

const loading = ref(false)
const error = ref('')
const logs = ref([])
const total = ref(0)
const keyword = ref('')
const actionFilter = ref('')
const actionMap = { read: '查询', create: '新增', update: '修改', delete: '删除' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ pageSize: '30', sortBy: 'createdAt', sortDir: 'desc' })
    if (actionFilter.value) params.set('action', actionFilter.value)
    const data = await api.get(`/audit-logs?${params}`)
    total.value = Number(data.total || 0)
    logs.value = (data.items || []).map((log) => ({
      time: String(log.createdAt || '').replace('T', ' ').slice(0, 16),
      actor: log.actorName || log.actorUsername || '系统',
      actionValue: log.action,
      action: `${actionMap[log.action] || log.action} ${log.targetType || ''}${log.targetId ? ` #${log.targetId}` : ''}`.trim(),
      status: Number(log.detail?.statusCode || 0) >= 400 ? '异常' : '成功',
      ip: log.detail?.ip || '-',
      severity: log.action === 'delete' ? 'danger' : log.action === 'update' ? 'warn' : 'ok',
      durationMs: Number(log.detail?.durationMs || 0),
    }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const rows = [
    ['时间', '用户', '动作', '目标', '来源 IP'],
    ...filteredLogs.value.map((log) => [log.time, log.actor, log.action, log.status, log.ip]),
  ]
  downloadText(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${toCsv(rows)}`, 'text/csv;charset=utf-8')
}

const filteredLogs = computed(() => {
  let rows = logs.value
  if (actionFilter.value) {
    rows = rows.filter((log) => log.actionValue === actionFilter.value)
  }
  if (keyword.value.trim()) {
    const text = keyword.value.trim()
    rows = rows.filter((log) => [log.actor, log.action, log.ip].some((value) => String(value || '').includes(text)))
  }
  return rows
})
const stats = computed(() => ({
  total: total.value,
  loaded: logs.value.length,
  warnings: logs.value.filter((item) => item.severity === 'danger').length,
  avgDuration: logs.value.length
    ? Math.round(logs.value.reduce((sum, item) => sum + item.durationMs, 0) / logs.value.length)
    : 0,
}))

onMounted(load)
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="SEC_OPS_AUDIT" title="操作审计" description="面向当前加载页面的操作审计列表。">
      <template #actions>
        <label class="command-input">
          <span>⌕</span>
          <input v-model.trim="keyword" placeholder="搜索用户或操作..." />
        </label>
        <button class="ghost-button" type="button" @click="actionFilter = actionFilter ? '' : 'delete'; load()">仅看风险操作</button>
        <button class="ghost-button" type="button" @click="exportCsv">导出 CSV</button>
      </template>
    </PageHeader>

    <section class="kpi-grid">
      <KpiCard title="日志总数" :value="stats.total" subtitle="系统层面" icon="ticket" />
      <KpiCard title="当前页记录" :value="stats.loaded" subtitle="当前加载" icon="customer" />
      <KpiCard title="风险操作" :value="stats.warnings" subtitle="删除等敏感操作" icon="warn" />
    </section>

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-else-if="loading" class="muted">正在加载操作日志...</p>

    <section class="detail-layout">
      <article class="glass-panel table-card">
        <div class="table-head log-head">
          <span>时间戳</span>
          <span>用户实体</span>
          <span>类别</span>
          <span>操作描述</span>
          <span>来源 IP</span>
        </div>
        <article v-for="log in filteredLogs" :key="log.time + log.action" class="log-row" :class="log.severity">
          <span class="mono">{{ log.time }}</span>
          <span><strong>{{ log.actor }}</strong></span>
          <span><em class="type-pill">{{ log.severity.toUpperCase() }}</em></span>
          <span>{{ log.action }}</span>
          <span class="mono muted-text">{{ log.ip }}</span>
        </article>
      </article>

      <aside class="glass-panel drawer">
        <h2>当前页审计摘要</h2>
        <div class="pulse-row">
          <span>当前页平均耗时</span>
          <strong>{{ stats.avgDuration }}MS</strong>
          <div class="bar-line"><i :style="{ width: `${Math.min(stats.avgDuration, 100)}%` }"></i></div>
        </div>
        <div class="pulse-row">
          <span>删除操作占比</span>
          <strong>{{ stats.loaded ? Math.round((stats.warnings / stats.loaded) * 100) : 0 }}%</strong>
          <div class="bar-line"><i :style="{ width: `${stats.loaded ? Math.round((stats.warnings / stats.loaded) * 100) : 0}%` }"></i></div>
        </div>
        <div class="drawer-section">
          <h3>当前筛选</h3>
          <p>动作范围：{{ actionFilter ? actionMap[actionFilter] || actionFilter : '全部' }}</p>
          <p>关键词：{{ keyword || '未设置' }}</p>
          <p class="status 已提交">数据来源：当前页已加载记录</p>
        </div>
      </aside>
    </section>
  </section>
</template>
