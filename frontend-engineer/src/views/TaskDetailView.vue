<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { normalizePreviewServiceMode, previewServiceTypeLabel, previewTimesheetCategoryLabel } from '../services/service-mode'

const { zh } = usePreviewI18n()
const route = useRoute()
const loading = ref(false)
const error = ref('')
const task = ref(null)

const statusMap = { draft: '草稿', in_progress: '填写中', submitted: '已提交', cancelled: '已作废' }
const canEdit = computed(() => ['draft', 'in_progress', 'submitted'].includes(task.value?.status || ''))
const normalizedServiceMode = computed(() => normalizePreviewServiceMode(task.value || {}))
const canShare = computed(() => Boolean(task.value?.report) && normalizedServiceMode.value !== 'office')
const serviceModeLabel = computed(() => {
  if (normalizedServiceMode.value === 'office') return '内勤工作'
  return normalizedServiceMode.value === 'remote' ? '远程服务' : '现场服务'
})
const categoryLabel = computed(() => {
  if (['remote', 'office'].includes(normalizedServiceMode.value)) {
    return previewTimesheetCategoryLabel(normalizedServiceMode.value, task.value?.timesheetCategory || task.value?.serviceCategory || task.value?.serviceType)
  }
  return previewServiceTypeLabel(task.value?.serviceType)
})
const resultLabel = computed(() => {
  const raw = String(task.value?.report?.result || task.value?.result || '').trim().toLowerCase()
  if (['resolved', 'done', 'completed', 'complete', 'finished', 'success'].includes(raw)) return '已完成'
  if (['unresolved', 'not_resolved', 'incomplete', 'failed'].includes(raw)) return '未完成'
  if (['follow_up_required', 'pending', 'processing', 'in_progress', 'follow_up'].includes(raw)) return '待跟进'
  return '-'
})

const engineers = computed(() => {
  const names = (task.value?.engineers || []).map((engineer) => engineer.realName).filter(Boolean)
  return names.join('、') || task.value?.engineerName || '未指定'
})

function formatTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16) || '-'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/service-orders/${route.params.id}`)
    task.value = data.item
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="engineer-shell detail-shell">
    <header class="topbar">
      <div>
        <BrandEyebrow text="工程师端 / 服务记录详情" title="服务记录详情" />
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="load">{{ zh('重试') }}</button></p>
    <p v-else-if="loading" class="muted">{{ zh('正在加载服务记录详情...') }}</p>

    <template v-if="task">
      <section class="detail-grid">
        <article class="form-section detail-hero">
          <div>
            <span class="mono">{{ task.orderNo || task.id }}</span>
            <h2>{{ zh(task.customerName || '未命名客户') }}</h2>
            <p>{{ zh(task.customerAddress || '未填写地址') }}</p>
          </div>
          <span class="service-mode-badge" :class="normalizedServiceMode">
            <i aria-hidden="true"></i>{{ zh(serviceModeLabel) }}
          </span>
        </article>

        <article class="form-section detail-card">
          <h2>{{ zh('服务信息') }}</h2>
          <dl class="detail-list">
            <div><dt>{{ zh('状态') }}</dt><dd>{{ zh(statusMap[task.status] || task.status || '-') }}</dd></div>
            <div><dt>{{ zh('类别') }}</dt><dd>{{ zh(categoryLabel) }}</dd></div>
            <div><dt>{{ zh('设备/系统') }}</dt><dd>{{ zh(task.deviceName || task.productName || '-') }}</dd></div>
            <div><dt>{{ zh('工程师') }}</dt><dd>{{ zh(engineers) }}</dd></div>
            <div><dt>{{ zh('服务时间') }}</dt><dd>{{ formatTime(task.report?.actualStartAt || task.submittedAt || task.createdAt) }}</dd></div>
          </dl>
        </article>

        <article class="form-section detail-card">
          <h2>{{ zh('服务需求') }}</h2>
          <p>{{ zh(task.issueDescription || '暂无服务需求') }}</p>
        </article>

        <article class="form-section detail-card">
          <h2>{{ zh('已保存服务记录') }}</h2>
          <div v-if="task.report" class="report-stack">
            <p><strong>{{ zh('服务结论') }}：</strong>{{ zh(resultLabel) }}</p>
            <p><strong>{{ zh('客户确认') }}：</strong>{{ zh(task.report.customerConfirmName || task.contactName || '-') }}</p>
            <p>{{ zh(task.report.workContent || '暂无处理过程') }}</p>
          </div>
          <p v-else class="muted compact">
            {{ zh(normalizedServiceMode === 'office' ? '内勤记录不生成单独服务表，请在月报中统一导出。' : '该服务记录还没有提交服务表。') }}
          </p>
        </article>
      </section>

      <footer class="page-actions">
        <RouterLink v-if="canEdit" class="primary" :to="`/service-sheets/${task.id}/edit`"><PreviewIcon name="edit" />{{ zh(task.status === 'submitted' ? '修改服务记录' : '继续填写') }}</RouterLink>
        <RouterLink v-if="canShare" class="locate" :to="`/tasks/${task.id}/share`"><PreviewIcon name="share" />{{ zh('预览并分享') }}</RouterLink>
      </footer>
    </template>
  </main>
</template>
