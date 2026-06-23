<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { resolveApiBase } from '../services/api-base'
import { getToken } from '../services/auth'
import { normalizePreviewServiceMode, previewServiceTypeLabel, previewTimesheetCategoryLabel } from '../services/service-mode'
import { displayReportWorkContent } from '../services/work-content'

const { zh } = usePreviewI18n()
const route = useRoute()
const loading = ref(false)
const error = ref('')
const task = ref(null)
const downloadingFileId = ref(null)
const inspectionDocInput = ref(null)
const inspectionDocFiles = ref([])
const uploadingInspectionDocs = ref(false)

const statusMap = { draft: '草稿', in_progress: '填写中', submitted: '已提交', cancelled: '已作废' }
const canEdit = computed(() => ['draft', 'in_progress', 'submitted'].includes(task.value?.status || ''))
const normalizedServiceMode = computed(() => normalizePreviewServiceMode(task.value || {}))
const isInspectionTask = computed(() => normalizedServiceMode.value === 'onsite' && String(task.value?.serviceType || '').trim() === 'inspect')
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
const detailStatusLabel = computed(() => {
  if (isInspectionTask.value) {
    const inspectionStatusMap = { draft: '待巡检', in_progress: '巡检中', submitted: '巡检已提交', cancelled: '已作废' }
    return inspectionStatusMap[task.value?.status] || statusMap[task.value?.status] || task.value?.status || '-'
  }
  return statusMap[task.value?.status] || task.value?.status || '-'
})
const deviceContext = computed(() => task.value?.deviceName || task.value?.internalNote || task.value?.productName || '-')
const detailServiceTime = computed(() => task.value?.report?.actualStartAt || task.value?.serviceAt || task.value?.plannedAt || task.value?.scheduledAt || task.value?.submittedAt || task.value?.createdAt)
const inspectionLead = computed(() => {
  if (!isInspectionTask.value) return task.value?.issueDescription || '暂无服务需求'
  const device = deviceContext.value === '-' ? '待补充设备信息' : deviceContext.value
  return task.value?.issueDescription || `请按计划完成 ${device} 的例行巡检。`
})
const inspectionDocuments = computed(() => (task.value?.files || []).filter((file) => file.purpose === 'inspection_document'))
const dispatchAttachments = computed(() => (task.value?.files || []).filter((file) => file.purpose !== 'inspection_document'))
const serviceParts = computed(() => (Array.isArray(task.value?.parts) ? task.value.parts : []))
const reportWorkContent = computed(() => displayReportWorkContent(task.value?.report, task.value || {}))

const engineers = computed(() => {
  const names = (task.value?.engineers || []).map((engineer) => engineer.realName).filter(Boolean)
  return names.join('、') || task.value?.engineerName || '未指定'
})

function formatTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16) || '-'
}

function formatFileSize(value) {
  const size = Number(value || 0)
  if (!size) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function partActionLabel(value) {
  if (value === 'replacement') return '配件更换'
  if (value === 'installation') return '配件安装'
  return '配件记录'
}

function formatPartQuantity(part) {
  const quantityText = String(part?.quantity ?? '').trim()
  const numeric = Number(quantityText)
  const quantity = quantityText && Number.isFinite(numeric) ? String(numeric) : quantityText
  const unit = String(part?.unit || '').trim()
  return [quantity, unit].filter(Boolean).join(' ') || '-'
}

async function downloadFile(file) {
  if (!file?.id || downloadingFileId.value) return
  downloadingFileId.value = file.id
  error.value = ''
  try {
    const token = getToken()
    const response = await fetch(`${resolveApiBase()}/files/${file.id}?mine=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
    if (!response.ok) throw new Error('附件下载失败')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.originalName || `attachment-${file.id}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    error.value = err.message || '附件下载失败'
  } finally {
    downloadingFileId.value = null
  }
}

function chooseInspectionDocuments() {
  if (uploadingInspectionDocs.value) return
  inspectionDocInput.value?.click()
}

function onInspectionDocumentsSelected(event) {
  inspectionDocFiles.value = Array.from(event.target.files || [])
}

function clearInspectionDocuments() {
  inspectionDocFiles.value = []
  if (inspectionDocInput.value) inspectionDocInput.value.value = ''
}

async function uploadInspectionDocuments() {
  if (!isInspectionTask.value || !task.value?.id || !inspectionDocFiles.value.length || uploadingInspectionDocs.value) return
  uploadingInspectionDocs.value = true
  error.value = ''
  try {
    for (const file of inspectionDocFiles.value) {
      const formData = new FormData()
      formData.append('ownerType', 'service_order')
      formData.append('ownerId', String(task.value.id))
      formData.append('purpose', 'inspection_document')
      formData.append('mine', '1')
      formData.append('file', file)
      await api.postForm('/files', formData)
    }
    clearInspectionDocuments()
    await load()
  } catch (err) {
    error.value = err.message || '巡检文档上传失败'
  } finally {
    uploadingInspectionDocs.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/service-orders/${route.params.id}?mine=1`)
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
        <BrandEyebrow text="工程师工作台 / 服务记录详情" title="服务记录详情" />
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="load">{{ zh('重试') }}</button></p>
    <p v-else-if="loading" class="muted">{{ zh('正在加载服务记录详情…') }}</p>

    <template v-if="task">
      <section class="detail-grid">
        <article class="form-section detail-hero">
          <div>
            <span class="mono">{{ task.orderNo || task.id }}</span>
            <h2>{{ zh(task.customerName || '未命名客户') }}</h2>
            <p>{{ zh(task.customerAddress || '未填写地址') }}</p>
          </div>
          <div class="detail-hero-badges">
            <span class="service-mode-badge" :class="normalizedServiceMode">
              <i aria-hidden="true"></i>{{ zh(serviceModeLabel) }}
            </span>
            <span v-if="isInspectionTask" class="inspection-badge detail-inspection-badge">{{ zh('巡检任务') }}</span>
          </div>
        </article>

        <article class="form-section detail-card">
          <h2>{{ zh('服务信息') }}</h2>
          <dl class="detail-list">
            <div><dt>{{ zh('状态') }}</dt><dd>{{ zh(detailStatusLabel) }}</dd></div>
            <div><dt>{{ zh('类别') }}</dt><dd>{{ zh(categoryLabel) }}</dd></div>
            <div><dt>{{ zh(isInspectionTask ? '巡检设备' : '设备/系统') }}</dt><dd>{{ zh(deviceContext) }}</dd></div>
            <div v-if="task.productName && task.productName !== task.deviceName"><dt>{{ zh('产品型号') }}</dt><dd>{{ zh(task.productName) }}</dd></div>
            <div><dt>{{ zh('工程师') }}</dt><dd>{{ zh(engineers) }}</dd></div>
            <div><dt>{{ zh(isInspectionTask ? '巡检时间' : '服务时间') }}</dt><dd>{{ formatTime(detailServiceTime) }}</dd></div>
          </dl>
        </article>

        <article class="form-section detail-card">
          <h2>{{ zh(isInspectionTask ? '巡检说明' : '服务需求') }}</h2>
          <p>{{ zh(inspectionLead) }}</p>
        </article>

        <article v-if="serviceParts.length" class="form-section detail-card">
          <h2>{{ zh('配件记录') }}</h2>
          <div class="service-part-detail-list">
            <div v-for="part in serviceParts" :key="part.id || `${part.partName}-${part.partNo}`" class="service-part-detail-item">
              <div class="service-part-detail-head">
                <strong>{{ zh(part.partName || '未命名配件') }}</strong>
                <span>{{ zh(partActionLabel(part.actionType)) }}</span>
              </div>
              <dl class="service-part-detail-grid">
                <div>
                  <dt>{{ zh('关联设备') }}</dt>
                  <dd>{{ zh(part.deviceName || task.deviceName || '-') }}</dd>
                </div>
                <div>
                  <dt>{{ zh('PN') }}</dt>
                  <dd>{{ zh(part.partNo || '-') }}</dd>
                </div>
                <div>
                  <dt>{{ zh('数量') }}</dt>
                  <dd>{{ zh(formatPartQuantity(part)) }}</dd>
                </div>
              </dl>
              <p v-if="part.remark" class="service-part-detail-remark">{{ zh(part.remark) }}</p>
            </div>
          </div>
        </article>

        <article v-if="isInspectionTask" class="form-section detail-card inspection-document-card">
          <h2>{{ zh('巡检文档') }}</h2>
          <p class="muted compact">{{ zh('上传巡检报告、现场照片、检查表或客户确认资料，管理端可在工单详情中查看。') }}</p>
          <input
            ref="inspectionDocInput"
            type="file"
            multiple
            hidden
            @change="onInspectionDocumentsSelected"
          />
          <div class="inspection-document-actions">
            <button class="ghost" type="button" :disabled="uploadingInspectionDocs" @click="chooseInspectionDocuments">
              <PreviewIcon name="new" />{{ zh('选择文档') }}
            </button>
            <button class="primary" type="button" :disabled="uploadingInspectionDocs || !inspectionDocFiles.length" @click="uploadInspectionDocuments">
              <PreviewIcon name="save" />{{ zh(uploadingInspectionDocs ? '上传中' : '上传巡检文档') }}
            </button>
          </div>
          <div v-if="inspectionDocFiles.length" class="inspection-document-selection">
            <div v-for="file in inspectionDocFiles" :key="`${file.name}-${file.size}`">
              <strong>{{ file.name }}</strong>
              <small>{{ formatFileSize(file.size) }}</small>
            </div>
            <button class="ghost" type="button" :disabled="uploadingInspectionDocs" @click="clearInspectionDocuments">{{ zh('清空') }}</button>
          </div>
          <div v-if="inspectionDocuments.length" class="attachment-list">
            <button
              v-for="file in inspectionDocuments"
              :key="file.id"
              class="attachment-item"
              type="button"
              :disabled="downloadingFileId === file.id"
              @click="downloadFile(file)"
            >
              <span>
                <strong>{{ file.originalName || `巡检文档 #${file.id}` }}</strong>
                <small>{{ formatFileSize(file.size) }}</small>
              </span>
              <PreviewIcon name="download" />
            </button>
          </div>
          <p v-else class="muted compact">{{ zh('暂无已上传巡检文档') }}</p>
        </article>

        <article v-if="dispatchAttachments.length" class="form-section detail-card">
          <h2>{{ zh('派单附件') }}</h2>
          <div class="attachment-list">
            <button
              v-for="file in dispatchAttachments"
              :key="file.id"
              class="attachment-item"
              type="button"
              :disabled="downloadingFileId === file.id"
              @click="downloadFile(file)"
            >
              <span>
                <strong>{{ file.originalName || `附件 #${file.id}` }}</strong>
                <small>{{ formatFileSize(file.size) }}</small>
              </span>
              <PreviewIcon name="download" />
            </button>
          </div>
        </article>

        <article class="form-section detail-card">
          <h2>{{ zh('已保存服务记录') }}</h2>
          <div v-if="task.report" class="report-stack">
            <p><strong>{{ zh('服务结论') }}：</strong>{{ zh(resultLabel) }}</p>
            <p><strong>{{ zh('客户确认') }}：</strong>{{ zh(task.report.customerConfirmName || task.contactName || '-') }}</p>
            <p class="report-work-content">{{ zh(reportWorkContent || '暂无处理过程') }}</p>
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
