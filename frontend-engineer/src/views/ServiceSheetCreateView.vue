<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { currentUser } from '../services/auth'
import { readOfflineCacheMeta } from '../services/offline-cache'
import { isOnline } from '../services/network'
import {
  clearSelfReportDraft,
  createDraftItemId,
  fetchRemoteSelfReportDraft,
  extractScopedDraftPayload,
  mergeScopedDraftPayload,
  normalizeDraftMode,
  normalizeDraftItemId,
  pickPreferredDraft,
  readLocalSelfReportDraft,
  saveRemoteSelfReportDraft,
  writeLocalSelfReportDraft,
} from '../services/self-report-draft'
import {
  normalizePreviewServiceMode,
  previewTimesheetCategoryLabel,
  previewTimesheetCategoryValue,
} from '../services/service-mode'
import {
  pendingSyncCount,
  queueSelfReportSync,
  refreshPendingSyncQueue,
  syncingPendingReports,
  syncPendingSelfReports,
} from '../services/sync-queue'

const { zh } = usePreviewI18n()
const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const retryableError = ref(false)
const message = ref('')
const draftSavedAt = ref('')
const customers = ref([])
const engineers = ref([])
const recentOrders = ref([])
const editingTask = ref(null)
const selectedHistoryId = ref('')
const selectedCustomer = ref(null)
const installDeviceList = ref([createInstallDeviceDraft()])
const activeInstallDeviceIndex = ref(0)
function addInstallDevice() {
  installDeviceList.value.push(createInstallDeviceDraft())
}
function removeInstallDevice(index) {
  if (installDeviceList.value.length > 1) {
    installDeviceList.value.splice(index, 1)
  }
}
function setActiveDeviceIndex(index) {
  activeInstallDeviceIndex.value = index
}
const deviceModelSuggestions = ref([])
const selectedSuggestionIndex = ref(-1)
const selectedCoEngineerIds = ref([])
const showCoEngineerOptions = ref(false)
const showContactOptions = ref(false)
const showDeviceModelSuggestions = ref(false)
const locating = ref(false)
const locationHint = ref('')
const nearbyCompanies = ref([])
const showNearbyCompanies = ref(false)
const fieldErrors = ref({})
const customerNameInput = ref(null)
const customerContactSection = ref(null)
const customerAddressInput = ref(null)
const contactInput = ref(null)
const phoneInput = ref(null)
const coEngineerField = ref(null)
const issueDescriptionInput = ref(null)
const serviceRecordInput = ref(null)
const serviceResultInput = ref(null)
const collaborationWorkSection = ref(null)
const actualStartInput = ref(null)
const actualEndInput = ref(null)
const signatureSection = ref(null)
const signatureCanvas = ref(null)
const customerSignature = ref('')
const signatureDrawn = ref(false)
const signaturePanelOpen = ref(false)
const signatureHistory = ref([])
const loadingLatestSignature = ref(false)
const draftCountdown = ref(0)
const draftDirty = ref(false)
const draftRestored = ref(false)
const draftHydrating = ref(false)
const draftSavedAtMs = ref(0)
const lastDraftClientUpdatedAt = ref('')
const createDraftId = ref('')
const statusNowMs = ref(Date.now())
const cancelFabPosition = ref({ x: null, y: null })
const cancelFabDragging = ref(false)
let customerSearchTimer = null
let deviceModelSearchTimer = null
let deviceModelReqId = 0
let draftTimer = null
let draftSyncTimer = null
let draftCountdownTimer = null
let statusClockTimer = null
let drawingSignature = false
let lastSignaturePoint = null
let signatureBeforeOpen = ''
let cancelFabMoved = false
let cancelFabStartPointer = { x: 0, y: 0 }
let cancelFabStartPosition = { x: 0, y: 0 }
const draftAutoSaveSeconds = 15
const cancelFabStorageKey = 'rc:service-sheet:cancel-fab-position'
const taskHomeForceRefreshKey = 'rc-engineer:tasks:force-refresh'
const collaborativeAckMarker = '\u2063\u2064\u2063'

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localDateTime(offsetHours = 0) {
  return formatLocalDateTime(new Date(Date.now() + offsetHours * 60 * 60 * 1000))
}

function localDateTimeInputValue(offsetHours = 0) {
  return localDateTime(offsetHours).replace(' ', 'T')
}

function formatLoadedDateTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

function fillDefaultTimesForNewSheet() {
  if (route.params.id) return
}

function cloneWorkEntries(entries = []) {
  return (entries || []).map((entry) => ({ ...entry }))
}

function createInstallDeviceDraft() {
  return {
    model: '',
    pn: '',
    serialNo: '',
    remark: '',
  }
}

function cloneInstallDeviceDraft(draft = {}) {
  return {
    ...createInstallDeviceDraft(),
    ...(draft || {}),
  }
}

function normalizedModeValue(mode) {
  return ['onsite', 'remote', 'office'].includes(mode) ? mode : 'onsite'
}

function createOnsiteDraft() {
  return {
    serviceType: 'repair',
    departureAt: '',
    actualStartAt: '',
    actualEndAt: '',
    returnAt: '',
    issueDescription: '',
    commonWorkContent: '',
    workContent: '',
    workEntries: [],
    result: 'resolved',
    resultDescription: '',
  }
}

function createRemoteDraft() {
  return {
    remoteCategory: '远程排障',
    actualStartAt: '',
    actualEndAt: '',
    issueDescription: '',
    commonWorkContent: '',
    workContent: '',
    workEntries: [],
    result: 'resolved',
    resultDescription: '',
  }
}

function createOfficeDraft() {
  return {
    officeCategory: '方案准备',
    deviceName: '',
    actualStartAt: '',
    actualEndAt: '',
    workContent: '',
  }
}

const formMode = ref('onsite')
const onsiteDraft = ref(createOnsiteDraft())
const remoteDraft = ref(createRemoteDraft())
const officeDraft = ref(createOfficeDraft())

function draftRefForMode(mode) {
  if (mode === 'remote') return remoteDraft
  if (mode === 'office') return officeDraft
  return onsiteDraft
}

const serviceDraftFieldKeys = [
  'serviceMode',
  'serviceType',
  'deviceName',
  'departureAt',
  'actualStartAt',
  'actualEndAt',
  'returnAt',
  'issueDescription',
  'commonWorkContent',
  'workContent',
  'workEntries',
  'result',
  'resultDescription',
]

function currentModeServiceDraftView() {
  if (formMode.value === 'remote') {
    return {
      serviceMode: 'remote',
      serviceType: remoteDraft.value.remoteCategory,
      deviceName: '',
      departureAt: '',
      actualStartAt: remoteDraft.value.actualStartAt,
      actualEndAt: remoteDraft.value.actualEndAt,
      returnAt: '',
      issueDescription: remoteDraft.value.issueDescription,
      commonWorkContent: remoteDraft.value.commonWorkContent,
      workContent: remoteDraft.value.workContent,
      workEntries: remoteDraft.value.workEntries,
      result: remoteDraft.value.result,
      resultDescription: remoteDraft.value.resultDescription,
    }
  }
  if (formMode.value === 'office') {
    return {
      serviceMode: 'office',
      serviceType: officeDraft.value.officeCategory,
      deviceName: officeDraft.value.deviceName,
      departureAt: '',
      actualStartAt: officeDraft.value.actualStartAt,
      actualEndAt: officeDraft.value.actualEndAt,
      returnAt: '',
      issueDescription: '',
      commonWorkContent: '',
      workContent: officeDraft.value.workContent,
      workEntries: [],
      result: '',
      resultDescription: '',
    }
  }
  return {
    serviceMode: 'onsite',
    serviceType: onsiteDraft.value.serviceType,
    deviceName: '',
    departureAt: onsiteDraft.value.departureAt,
    actualStartAt: onsiteDraft.value.actualStartAt,
    actualEndAt: onsiteDraft.value.actualEndAt,
    returnAt: onsiteDraft.value.returnAt,
    issueDescription: onsiteDraft.value.issueDescription,
    commonWorkContent: onsiteDraft.value.commonWorkContent,
    workContent: onsiteDraft.value.workContent,
    workEntries: onsiteDraft.value.workEntries,
    result: onsiteDraft.value.result,
    resultDescription: onsiteDraft.value.resultDescription,
  }
}

function currentInstallDeviceView() {
  return {
    installDeviceList: installDeviceList.value.map(d => cloneInstallDeviceDraft(d)),
  }
}

function updateActiveDraftField(field, value) {
  if (field === 'serviceMode') {
    formMode.value = serviceModeOptions.some((option) => option.value === value) ? value : 'onsite'
    return
  }

  if (formMode.value === 'remote') {
    if (field === 'serviceType') remoteDraft.value.remoteCategory = previewTimesheetCategoryLabel('remote', value)
    else if (field === 'actualStartAt') remoteDraft.value.actualStartAt = value
    else if (field === 'actualEndAt') remoteDraft.value.actualEndAt = value
    else if (field === 'issueDescription') remoteDraft.value.issueDescription = value
    else if (field === 'commonWorkContent') remoteDraft.value.commonWorkContent = value
    else if (field === 'workContent') remoteDraft.value.workContent = value
    else if (field === 'workEntries') remoteDraft.value.workEntries = cloneWorkEntries(value)
    else if (field === 'result') remoteDraft.value.result = value
    else if (field === 'resultDescription') remoteDraft.value.resultDescription = value
    return
  }

  if (formMode.value === 'office') {
    if (field === 'serviceType') officeDraft.value.officeCategory = previewTimesheetCategoryLabel('office', value)
    else if (field === 'deviceName') officeDraft.value.deviceName = value
    else if (field === 'actualStartAt') officeDraft.value.actualStartAt = value
    else if (field === 'actualEndAt') officeDraft.value.actualEndAt = value
    else if (field === 'workContent') officeDraft.value.workContent = value
    return
  }

  if (field === 'serviceType') onsiteDraft.value.serviceType = value
  else if (field === 'departureAt') onsiteDraft.value.departureAt = value
  else if (field === 'actualStartAt') onsiteDraft.value.actualStartAt = value
  else if (field === 'actualEndAt') onsiteDraft.value.actualEndAt = value
  else if (field === 'returnAt') onsiteDraft.value.returnAt = value
  else if (field === 'issueDescription') onsiteDraft.value.issueDescription = value
  else if (field === 'commonWorkContent') onsiteDraft.value.commonWorkContent = value
  else if (field === 'workContent') onsiteDraft.value.workContent = value
  else if (field === 'workEntries') onsiteDraft.value.workEntries = cloneWorkEntries(value)
  else if (field === 'result') onsiteDraft.value.result = value
  else if (field === 'resultDescription') onsiteDraft.value.resultDescription = value
}

const serviceDraftProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return currentModeServiceDraftView()[prop]
    },
    set(_target, prop, value) {
      if (typeof prop !== 'string') return false
      updateActiveDraftField(prop, value)
      return true
    },
    ownKeys() {
      return serviceDraftFieldKeys
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string' && serviceDraftFieldKeys.includes(prop)) {
        return { enumerable: true, configurable: true }
      }
      return undefined
    },
  },
)

const serviceDraft = computed(() => serviceDraftProxy)
const currentServiceMode = computed(() => formMode.value)

function pageDraftStateSnapshot() {
  return {
    selectedCustomer: selectedCustomer.value ? { ...selectedCustomer.value } : null,
    selectedHistoryId: selectedHistoryId.value,
    selectedCoEngineerIds: [...selectedCoEngineerIds.value],
    serviceDraft: currentModeServiceDraftView(),
    formMode: formMode.value,
    onsiteDraft: {
      ...onsiteDraft.value,
      workEntries: cloneWorkEntries(onsiteDraft.value.workEntries),
    },
    remoteDraft: {
      ...remoteDraft.value,
      workEntries: cloneWorkEntries(remoteDraft.value.workEntries),
    },
    officeDraft: {
      ...officeDraft.value,
    },
    installDeviceState: currentInstallDeviceView(),
    customerSignature: customerSignature.value,
    __draftClientUpdatedAt: lastDraftClientUpdatedAt.value || new Date().toISOString(),
  }
}

function createDraftRouteMode() {
  return normalizeDraftMode(routeMode.value || formMode.value)
}

function createDraftRouteId() {
  return normalizeDraftItemId(route.query.draftId || createDraftId.value)
}

function extractCreateDraftBuckets(payload = {}) {
  const buckets = payload.__createDraftBuckets
  if (!buckets || typeof buckets !== 'object') return null
  return {
    onsite: buckets.onsite || null,
    remote: buckets.remote || null,
    office: buckets.office || null,
  }
}

function applyDraftState(state = {}, { fallbackMode = 'onsite' } = {}) {
  const nextMode = normalizedModeValue(state.formMode || state.serviceDraft?.serviceMode || fallbackMode)
  formMode.value = nextMode
  selectedCustomer.value = state.selectedCustomer || null
  selectedHistoryId.value = state.selectedHistoryId || ''
  installDeviceList.value = (state.installDeviceState?.installDeviceList || [createInstallDeviceDraft()]).map(d => cloneInstallDeviceDraft(d))
  selectedCoEngineerIds.value = Array.isArray(state.selectedCoEngineerIds)
    ? state.selectedCoEngineerIds.map(Number)
    : []
  onsiteDraft.value = {
    ...createOnsiteDraft(),
    ...(state.onsiteDraft || {}),
    workEntries: cloneWorkEntries(state.onsiteDraft?.workEntries),
  }
  remoteDraft.value = {
    ...createRemoteDraft(),
    ...(state.remoteDraft || {}),
    workEntries: cloneWorkEntries(state.remoteDraft?.workEntries),
  }
  officeDraft.value = {
    ...createOfficeDraft(),
    ...(state.officeDraft || {}),
  }
  customerSignature.value = state.customerSignature || ''
  signatureDrawn.value = Boolean(customerSignature.value)
}

const serviceModeOptions = [
  { value: 'onsite', label: '现场服务' },
  { value: 'remote', label: '远程服务' },
  { value: 'office', label: '内勤工作' },
]
const routeMode = computed(() => {
  const mode = String(route.query.mode || '')
  return serviceModeOptions.some((option) => option.value === mode) ? mode : ''
})

function serviceModeDocumentLabel(mode) {
  if (mode === 'remote') return '远程服务单'
  if (mode === 'office') return '内勤记录'
  return '现场服务单'
}

const serviceTypeOptions = [
  { value: 'install', label: '现场安装' },
  { value: 'repair', label: '故障处理' },
  { value: 'inspect', label: '例行巡检' },
  { value: 'training', label: '现场培训' },
  { value: 'other', label: '其他事项' },
]

const remoteCategoryOptions = [
  { value: '远程排障', label: '远程排障' },
  { value: '远程调配', label: '远程调配' },
  { value: '远程协调', label: '远程协调' },
  { value: '远程会议', label: '远程会议' },
  { value: '其他事项', label: '其他事项' },
]

const officeCategoryOptions = [
  { value: '方案准备', label: '方案准备' },
  { value: '文档整理', label: '文档整理' },
  { value: '网络会议', label: '网络会议' },
  { value: '培训学习', label: '培训学习' },
  { value: '其他事项', label: '其他事项' },
]

const resultStatusOptions = [
  { value: 'resolved', label: '已完成' },
  { value: 'unresolved', label: '未完成' },
  { value: 'follow_up_required', label: '待跟进' },
]

const mapFallbackCompanies = [
  {
    id: 'map-fallback-sip',
    name: '苏州工业园区企业服务中心',
    address: '江苏省苏州市苏州工业园区现代大道',
    mapAddress: '江苏省苏州市苏州工业园区现代大道',
    mapProvider: 'amap',
    mapPoiId: 'map-fallback-sip',
    mapPoiName: '苏州工业园区企业服务中心',
    source: 'map',
  },
  {
    id: 'map-fallback-nano',
    name: '苏州纳米城',
    address: '江苏省苏州市工业园区金鸡湖大道99号',
    mapAddress: '江苏省苏州市工业园区金鸡湖大道99号',
    mapProvider: 'amap',
    mapPoiId: 'map-fallback-nano',
    mapPoiName: '苏州纳米城',
    source: 'map',
  },
  {
    id: 'map-fallback-tech',
    name: '苏州科技城',
    address: '江苏省苏州市高新区科灵路',
    mapAddress: '江苏省苏州市高新区科灵路',
    mapProvider: 'amap',
    mapPoiId: 'map-fallback-tech',
    mapPoiName: '苏州科技城',
    source: 'map',
  },
]

const isRemoteLikeMode = computed(() => ['remote', 'office'].includes(currentServiceMode.value))
const isOfficeMode = computed(() => currentServiceMode.value === 'office')
const internalRecordDefaults = computed(() => {
  const user = currentUser.value || {}
  return {
    customerName: '敦阳科技（内勤）',
    customerAddress: '',
    contactName: user.realName || user.username || '内勤工程师',
    contactPhone: user.phone || user.mobile || user.username || '内部记录',
  }
})
const pageEyebrow = computed(() => {
  return `工程师端 / ${route.params.id ? '修改' : '新建'}${serviceModeDocumentLabel(currentServiceMode.value)}`
})
const pageTitle = computed(() => {
  return `${route.params.id ? '修改' : '新建'}${serviceModeDocumentLabel(currentServiceMode.value)}`
})
const remoteModeBannerText = computed(() =>
  currentServiceMode.value === 'remote'
    ? '当前为远程服务单：无需出发、到场与客户手写签名，按远程处理过程填写即可。'
    : '',
)
const customerQuickTitle = computed(() => (isOfficeMode.value ? '关联客户（可选）' : '客户快速带入'))
const customerQuickHint = computed(() =>
  isOfficeMode.value
    ? '如本次内勤工作与某客户或项目有关，可选填关联客户；不填则按内勤工作归档。'
    : '选择常用客户，或输入客户名称后定位查找。空白时可查找附近公司。',
)
const customerSectionTitle = computed(() => (isOfficeMode.value ? '关联信息' : '客户与联系人'))
const customerNameLabel = computed(() => (isOfficeMode.value ? '关联客户' : '客户名称'))
const infoSectionTitle = computed(() => (isOfficeMode.value ? '工作信息' : '服务信息'))
const showDeviceField = computed(() => currentServiceMode.value === 'office')
const deviceFieldLabel = computed(() => {
  if (currentServiceMode.value === 'office') return '具体事项'
  return currentServiceMode.value === 'remote' ? '专案名称 / 产品名称' : '设备/项目'
})
const deviceFieldPlaceholder = computed(() => {
  if (currentServiceMode.value === 'office') return '例如：京隆 AI 项目方案规划、培训课件整理、内部周会纪要'
  if (currentServiceMode.value === 'remote') return '输入本次对应专案或产品名称'
  return '输入本次对应设备、系统或项目名称'
})
const serviceCategoryLabel = computed(() => {
  if (currentServiceMode.value === 'office') return '内勤类别'
  return currentServiceMode.value === 'remote' ? '远程类别' : '服务类别'
})
const issueDescriptionLabel = computed(() => '问题描述')
const issueDescriptionPlaceholder = computed(() =>
  currentServiceMode.value === 'remote'
    ? '一句话概括本次远程服务背景、现象或沟通主题。'
    : '一句话概括现场问题，例如：服务器无法开机、客户反馈网络中断。',
)
const workContentLabel = computed(() => {
  if (isOfficeMode.value) return '工作内容'
  return currentServiceMode.value === 'remote' ? '处理记录' : '服务内容 / 现场处理记录'
})
const workContentPlaceholder = computed(() =>
  isOfficeMode.value
    ? '填写今天实际完成的工作内容，例如：整理 AI 项目文档结构，补充部署说明并更新流程图。'
    : currentServiceMode.value === 'remote'
      ? '填写远程排障、远程调配、远程协调或远程会议的处理过程与结果。'
      : '填写检查内容、处理动作、调整结果；例如：检查设备状态，记录已处理项目和客户确认情况。',
)
const submitButtonLabel = computed(() => {
  if (saving.value) return '提交中'
  return isOfficeMode.value ? '提交内勤' : '提交记录'
})
const travelTimeFields = computed(() => {
  if (isRemoteLikeMode.value) {
    return [
      ['开始时间', '点一下自动带入当前时间，也可手动修改', true],
    ]
  }

  return [
    ['出发时间', '点一下自动带入当前时间，也可手动修改', false],
    ['到达时间', '点一下自动带入当前时间，也可手动修改', true],
  ]
})
const closeoutTimeFields = computed(() => {
  if (isRemoteLikeMode.value) {
    return [
      ['结束时间', '点一下自动带入当前时间，也可手动修改', true],
    ]
  }

  return [
    ['完成时间', '点一下自动带入当前时间，也可手动修改', true],
    ['返抵时间', '可到家后再补，也可手动修改', false],
  ]
})

const historyItems = computed(() => {
  const seen = new Set()
  return recentOrders.value
    .filter((order) => {
      const name = order.customerName || '未命名客户'
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .slice(0, 6)
    .map((order) => ({
      id: order.id,
      label: compactCustomerName(order.customerName || '未命名客户'),
      fullLabel: order.customerName || '未命名客户',
      order,
    }))
})

function compactCustomerName(name) {
  const raw = String(name || '').trim()
  if (!raw) return '未命名客户'
  const withoutBrackets = raw.replace(/[（(].*?[）)]/g, '').trim()
  const withoutSuffix = withoutBrackets
    .replace(/有限公司|股份有限公司|科技有限公司|技术有限公司|有限责任公司|公司$/gu, '')
    .trim()
  const withoutRegion = withoutSuffix
    .replace(/^(中国|江苏省|浙江省|上海市|北京市|苏州市|苏州|上海|北京)/u, '')
    .trim()
  const candidate = withoutRegion || withoutSuffix || withoutBrackets || raw
  return candidate.length > 8 ? candidate.slice(0, 8) : candidate
}

const activeCustomer = computed(() => {
  if (selectedCustomer.value) return selectedCustomer.value
  return {}
})

const contactOptions = computed(() => contactsForCustomer(activeCustomer.value))
const showCustomerNameOptions = computed(
  () => showNearbyCompanies.value && Boolean(String(activeCustomer.value.name || '').trim()),
)
const currentUserId = computed(() => Number(currentUser.value?.id || 0))
const coEngineerOptions = computed(() =>
  engineers.value.filter((engineer) => Number(engineer.id) !== currentUserId.value),
)
const selectedCoEngineers = computed(() =>
  coEngineerOptions.value.filter((engineer) => selectedCoEngineerIds.value.includes(Number(engineer.id))),
)
const selectedEngineerIds = computed(() => {
  const ids = []
  if (currentUserId.value) ids.push(currentUserId.value)
  for (const id of selectedCoEngineerIds.value.map(Number)) {
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
})
const isCollaborativeService = computed(() => !isOfficeMode.value && selectedCoEngineerIds.value.length > 0)
const selectedWorkEntries = computed(() => {
  if (!isCollaborativeService.value) return []
  return selectedEngineerIds.value.map((engineerId) => {
    const id = Number(engineerId)
    return (
      (serviceDraft.value.workEntries || []).find((item) => Number(item.engineerId) === id) || {
        engineerId: id,
        engineerName: engineerName(id),
        workContent: '',
      }
    )
  })
})
const serviceCategoryOptions = computed(() =>
  currentServiceMode.value === 'remote'
    ? remoteCategoryOptions
    : currentServiceMode.value === 'office'
      ? officeCategoryOptions
      : serviceTypeOptions,
)
const draftStatusLabel = computed(() => {
  if (draftDirty.value) return `${draftCountdown.value} 秒后保存`
  if (draftRestored.value) return '本机草稿已恢复'
  if (!draftSavedAtMs.value) return '尚未保存'
  const elapsedSeconds = Math.max(0, Math.floor((statusNowMs.value - draftSavedAtMs.value) / 1000))
  if (elapsedSeconds < 10) return '刚刚保存'
  if (elapsedSeconds < 60) return `${elapsedSeconds} 秒前`
  return `${Math.floor(elapsedSeconds / 60)} 分钟前`
})
const queueStatusLabel = computed(() => {
  if (syncingPendingReports.value) return `同步中 · ${pendingSyncCount.value} 条`
  return pendingSyncCount.value ? `待同步 ${pendingSyncCount.value} 条` : '无待同步'
})

function draftSnapshot() {
  const isNewDraft = !route.params.id
  if (isNewDraft && !createDraftId.value) createDraftId.value = createDraftItemId()
  return {
    selectedCustomer: selectedCustomer.value ? { ...selectedCustomer.value } : null,
    selectedHistoryId: selectedHistoryId.value,
    selectedCoEngineerIds: [...selectedCoEngineerIds.value],
    serviceDraft: currentModeServiceDraftView(),
    formMode: formMode.value,
    onsiteDraft: {
      ...onsiteDraft.value,
      workEntries: cloneWorkEntries(onsiteDraft.value.workEntries),
    },
    remoteDraft: {
      ...remoteDraft.value,
      workEntries: cloneWorkEntries(remoteDraft.value.workEntries),
    },
    officeDraft: {
      ...officeDraft.value,
    },
    installDeviceState: currentInstallDeviceView(),
    customerSignature: customerSignature.value,
    __draftId: isNewDraft ? createDraftId.value : '',
    __draftCreatedAt: isNewDraft ? undefined : '',
    __draftClientUpdatedAt: lastDraftClientUpdatedAt.value || new Date().toISOString(),
  }
}

function draftTargetOrderId() {
  return route.params.id || null
}

async function syncDraftToRemote(payload, clientUpdatedAt) {
  const orderId = draftTargetOrderId()
  if (orderId) {
    await saveRemoteSelfReportDraft(orderId, payload, clientUpdatedAt)
    return
  }
  const existingRemoteDraft = await fetchRemoteSelfReportDraft(null).catch(() => null)
  const mergedPayload = mergeScopedDraftPayload(
    existingRemoteDraft?.payload,
    null,
    createDraftRouteMode(),
    payload,
    clientUpdatedAt,
    createDraftRouteId(),
  )
  await saveRemoteSelfReportDraft(null, mergedPayload, clientUpdatedAt)
}

function currentDraftPayload() {
  const orderId = draftTargetOrderId()
  const scopedMode = createDraftRouteMode()
  const scopedDraftId = createDraftRouteId()
  const localDraft = readLocalSelfReportDraft(orderId)
  const scopedLocalPayload = extractScopedDraftPayload(localDraft?.data, orderId, scopedMode, scopedDraftId)
  if (scopedLocalPayload) return scopedLocalPayload
  if (!lastDraftClientUpdatedAt.value) return null
  return draftSnapshot()
}

async function restoreDraftIfPresent() {
  const orderId = draftTargetOrderId()
  const scopedMode = createDraftRouteMode()
  const scopedDraftId = createDraftRouteId()
  const localDraft = readLocalSelfReportDraft(orderId)
  let remoteAccountDraft = null
  if (isOnline.value) {
    try {
      remoteAccountDraft = await fetchRemoteSelfReportDraft(orderId)
    } catch {
      remoteAccountDraft = null
    }
  }
  const preferredDraft = pickPreferredDraft({
    localDraft: localDraft?.data
      ? {
          ...localDraft,
          data: extractScopedDraftPayload(localDraft.data, orderId, scopedMode, scopedDraftId),
        }
      : localDraft,
    remoteDraft: remoteAccountDraft?.payload
      ? {
          ...remoteAccountDraft,
          payload: extractScopedDraftPayload(remoteAccountDraft.payload, orderId, scopedMode, scopedDraftId),
        }
      : remoteAccountDraft,
  })
  if (preferredDraft?.source === 'remote_deleted') {
    await clearSelfReportDraft(orderId, scopedMode, scopedDraftId)
    draftRestored.value = false
    draftDirty.value = false
    message.value = ''
    return false
  }
  if (!preferredDraft?.payload) return false
  draftHydrating.value = true
  selectedCustomer.value = preferredDraft.payload.selectedCustomer || null
  selectedHistoryId.value = preferredDraft.payload.selectedHistoryId || ''
  installDeviceList.value = (preferredDraft.payload.installDeviceState?.installDeviceList || [createInstallDeviceDraft()]).map(d => cloneInstallDeviceDraft(d))
  selectedCoEngineerIds.value = Array.isArray(preferredDraft.payload.selectedCoEngineerIds)
    ? preferredDraft.payload.selectedCoEngineerIds.map(Number)
    : []
  formMode.value = ['onsite', 'remote', 'office'].includes(preferredDraft.payload.formMode)
    ? preferredDraft.payload.formMode
    : normalizePreviewServiceMode({ serviceMode: preferredDraft.payload.serviceDraft?.serviceMode || 'onsite' })
  onsiteDraft.value = {
    ...createOnsiteDraft(),
    ...(preferredDraft.payload.onsiteDraft || {}),
    workEntries: cloneWorkEntries(preferredDraft.payload.onsiteDraft?.workEntries),
  }
  remoteDraft.value = {
    ...createRemoteDraft(),
    ...(preferredDraft.payload.remoteDraft || {}),
    workEntries: cloneWorkEntries(preferredDraft.payload.remoteDraft?.workEntries),
  }
  officeDraft.value = {
    ...createOfficeDraft(),
    ...(preferredDraft.payload.officeDraft || {}),
  }
  if (!preferredDraft.payload.onsiteDraft && !preferredDraft.payload.remoteDraft && !preferredDraft.payload.officeDraft) {
    const legacyDraft = preferredDraft.payload.serviceDraft || {}
    const legacyMode = normalizePreviewServiceMode({ serviceMode: legacyDraft.serviceMode || formMode.value })
    formMode.value = legacyMode
    if (legacyMode === 'remote') {
      remoteDraft.value = {
        ...remoteDraft.value,
        remoteCategory: previewTimesheetCategoryLabel('remote', legacyDraft.serviceType || remoteDraft.value.remoteCategory),
        actualStartAt: legacyDraft.actualStartAt || '',
        actualEndAt: legacyDraft.actualEndAt || '',
        issueDescription: legacyDraft.issueDescription || '',
        commonWorkContent: legacyDraft.commonWorkContent || '',
        workContent: legacyDraft.workContent || '',
        workEntries: cloneWorkEntries(legacyDraft.workEntries),
        result: legacyDraft.result || remoteDraft.value.result,
        resultDescription: legacyDraft.resultDescription || '',
      }
    } else if (legacyMode === 'office') {
      officeDraft.value = {
        ...officeDraft.value,
        officeCategory: previewTimesheetCategoryLabel('office', legacyDraft.serviceType || officeDraft.value.officeCategory),
        deviceName: legacyDraft.deviceName === '全自动核酸提取系统' ? '' : (legacyDraft.deviceName || ''),
        actualStartAt: legacyDraft.actualStartAt || '',
        actualEndAt: legacyDraft.actualEndAt || '',
        workContent: legacyDraft.workContent || '',
      }
    } else {
      onsiteDraft.value = {
        ...onsiteDraft.value,
        serviceType: legacyDraft.serviceType || onsiteDraft.value.serviceType,
        departureAt: legacyDraft.departureAt || '',
        actualStartAt: legacyDraft.actualStartAt || '',
        actualEndAt: legacyDraft.actualEndAt || '',
        returnAt: legacyDraft.returnAt || '',
        issueDescription: legacyDraft.issueDescription || '',
        commonWorkContent: legacyDraft.commonWorkContent || '',
        workContent: legacyDraft.workContent || '',
        workEntries: cloneWorkEntries(legacyDraft.workEntries),
        result: legacyDraft.result || onsiteDraft.value.result,
        resultDescription: legacyDraft.resultDescription || '',
      }
    }
  }
  customerSignature.value = preferredDraft.payload.customerSignature || ''
  signatureDrawn.value = Boolean(customerSignature.value)
  if (!orderId) createDraftId.value = normalizeDraftItemId(preferredDraft.payload.__draftId || scopedDraftId || createDraftItemId())
  lastDraftClientUpdatedAt.value = preferredDraft.payload.__draftClientUpdatedAt || preferredDraft.updatedAt || ''
  draftSavedAt.value = String(preferredDraft.updatedAt || '').replace('T', ' ').slice(0, 16)
  draftSavedAtMs.value = 0
  draftRestored.value = true
  message.value = `${preferredDraft.label}：${draftSavedAt.value}`
  nextTick(() => {
    paintSignature(customerSignature.value)
    draftHydrating.value = false
  })
  if (preferredDraft.source === 'remote') {
    const existingLocalDraft = readLocalSelfReportDraft(orderId)
    const normalizedPayload = {
      ...preferredDraft.payload,
      __draftClientUpdatedAt: preferredDraft.payload.__draftClientUpdatedAt || preferredDraft.updatedAt || new Date().toISOString(),
    }
    writeLocalSelfReportDraft(
      orderId,
      mergeScopedDraftPayload(
        existingLocalDraft?.data,
        orderId,
        scopedMode,
        normalizedPayload,
        normalizedPayload.__draftClientUpdatedAt,
        createDraftId.value,
      ),
    )
  } else if (remoteAccountDraft?.payload) {
    const payload = {
      ...preferredDraft.payload,
      __draftClientUpdatedAt: preferredDraft.payload.__draftClientUpdatedAt || preferredDraft.updatedAt || new Date().toISOString(),
    }
    syncDraftToRemote(payload, payload.__draftClientUpdatedAt).catch(() => {})
  }
  return true
}

async function persistDraft({ silent = true, waitForRemote = false } = {}) {
  const clientUpdatedAt = new Date().toISOString()
  lastDraftClientUpdatedAt.value = clientUpdatedAt
  const payload = draftSnapshot()
  const orderId = draftTargetOrderId()
  const scopedMode = createDraftRouteMode()
  const scopedDraftId = createDraftRouteId()
  const existingLocalDraft = readLocalSelfReportDraft(orderId)
  writeLocalSelfReportDraft(
    orderId,
    mergeScopedDraftPayload(existingLocalDraft?.data, orderId, scopedMode, payload, clientUpdatedAt, scopedDraftId),
  )
  if (!orderId && route.query.draftId !== createDraftId.value) {
    router.replace({ query: { ...route.query, draftId: createDraftId.value } }).catch(() => {})
  }
  window.clearTimeout(draftTimer)
  window.clearTimeout(draftSyncTimer)
  window.clearInterval(draftCountdownTimer)
  draftDirty.value = false
  draftRestored.value = false
  draftCountdown.value = 0
  statusNowMs.value = Date.now()
  draftSavedAtMs.value = statusNowMs.value
  draftSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isOnline.value || waitForRemote) {
    if (waitForRemote) {
      await syncDraftToRemote(payload, clientUpdatedAt)
    } else {
      draftSyncTimer = window.setTimeout(() => {
        syncDraftToRemote(payload, clientUpdatedAt).catch(() => {})
      }, 220)
    }
  }
  if (!silent) message.value = `草稿已保存：${draftSavedAt.value}`
}

function persistTimeDraft() {
  if (loading.value || draftHydrating.value) return
  persistDraft().catch(() => {})
}

function scheduleDraftSave() {
  if (loading.value || draftHydrating.value) return
  window.clearTimeout(draftTimer)
  window.clearInterval(draftCountdownTimer)
  draftDirty.value = true
  draftRestored.value = false
  draftCountdown.value = draftAutoSaveSeconds
  draftCountdownTimer = window.setInterval(() => {
    draftCountdown.value = Math.max(0, draftCountdown.value - 1)
  }, 1000)
  draftTimer = window.setTimeout(() => {
    persistDraft().catch(() => {})
  }, draftAutoSaveSeconds * 1000)
}

function onServiceModeChange() {
  const options = serviceCategoryOptions.value
  if (!options.some((option) => option.value === serviceDraft.value.serviceType)) {
    serviceDraft.value.serviceType = options[0]?.value || ''
  }
  if (currentServiceMode.value === 'onsite') {
    serviceDraft.value.deviceName = ''
    clearFieldError('deviceName')
  }
  if (isOfficeMode.value) {
    selectedCoEngineerIds.value = []
    serviceDraft.value.commonWorkContent = ''
    serviceDraft.value.workEntries = []
  }
  if (isRemoteLikeMode.value) {
    serviceDraft.value.departureAt = ''
    serviceDraft.value.returnAt = ''
    customerSignature.value = ''
    signatureDrawn.value = false
    signaturePanelOpen.value = false
  }
  clearInactiveFieldErrors()
}

function resetInstallDeviceSelection() {
  installDeviceList.value = [createInstallDeviceDraft()]
}
function applyRouteServiceMode() {
  if (route.params.id || !routeMode.value) return
  formMode.value = routeMode.value
  onServiceModeChange()
}

function engineerName(engineerId) {
  const id = Number(engineerId)
  const engineer = engineers.value.find((item) => Number(item.id) === id)
  if (engineer) return engineer.realName || engineer.username || '工程师'
  if (id === currentUserId.value) return currentUser.value?.realName || currentUser.value?.username || '当前工程师'
  return '工程师'
}

function normalizeEngineerLabel(value) {
  return String(value || '').replace(/[\s:：]/g, '').trim()
}

function stripCollaborativeAckMarker(value) {
  return String(value || '').split(collaborativeAckMarker).join('')
}

function hasVisibleWorkContent(value) {
  return Boolean(stripCollaborativeAckMarker(value).trim())
}

function parseLegacyWorkEntries(workContent, item = {}) {
  const source = String(workContent || '').trim()
  if (!source) return { entries: [], commonWorkContent: '' }
  const candidateIds = []
  const addCandidateId = (value) => {
    const id = Number(value || 0)
    if (id && !candidateIds.includes(id)) candidateIds.push(id)
  }
  if (currentUserId.value) addCandidateId(currentUserId.value)
  ;(item.engineers || []).forEach((engineer) => addCandidateId(engineer.id))
  engineers.value.forEach((engineer) => addCandidateId(engineer.id))
  const candidates = candidateIds
    .map((id) => ({ id, name: engineerName(id), key: normalizeEngineerLabel(engineerName(id)) }))
    .filter((candidate) => candidate.id && candidate.key)
    .sort((a, b) => b.key.length - a.key.length)
  if (!candidates.length) return { entries: [], commonWorkContent: '' }

  const entries = []
  const commonLines = []
  let active = null
  const flushActive = () => {
    if (!active) return
    const content = active.lines.join('\n').trim()
    if (content) entries.push({ engineerId: active.id, engineerName: engineerName(active.id), workContent: content })
    active = null
  }

  for (const line of source.split(/\r?\n/)) {
    const headingMatch = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.*)$/)
    if (headingMatch) {
      const labelKey = normalizeEngineerLabel(headingMatch[1])
      const candidate = candidates.find((item) => item.key === labelKey)
      const isCommon = ['共同内容', '共同处理', '公共内容'].includes(labelKey)
      if (candidate || isCommon) {
        flushActive()
        if (candidate) {
          active = { id: candidate.id, lines: headingMatch[2] ? [headingMatch[2]] : [] }
        } else if (headingMatch[2]) {
          commonLines.push(headingMatch[2])
        }
        continue
      }
    }
    if (active) {
      active.lines.push(line)
    } else {
      commonLines.push(line)
    }
  }
  flushActive()
  const merged = new Map()
  entries.forEach((entry) => {
    const previous = merged.get(entry.engineerId)
    merged.set(entry.engineerId, {
      ...entry,
      workContent: previous ? `${previous.workContent}\n${entry.workContent}`.trim() : entry.workContent,
    })
  })
  return { entries: Array.from(merged.values()), commonWorkContent: commonLines.join('\n').trim() }
}

function syncWorkEntries() {
  const selected = new Set(selectedEngineerIds.value.map(Number))
  serviceDraft.value.workEntries = (serviceDraft.value.workEntries || [])
    .map((entry) => ({
      engineerId: Number(entry.engineerId),
      engineerName: engineerName(entry.engineerId),
      workContent: stripCollaborativeAckMarker(entry.workContent || ''),
    }))
    .filter((entry) => selected.has(Number(entry.engineerId)))
  for (const engineerId of selected) {
    if (!serviceDraft.value.workEntries.some((entry) => Number(entry.engineerId) === Number(engineerId))) {
      serviceDraft.value.workEntries.push({ engineerId: Number(engineerId), engineerName: engineerName(engineerId), workContent: '' })
    }
  }
}

function collaborativeCoEngineerIds(item = {}, workEntries = []) {
  const ids = []
  const addId = (value) => {
    const id = Number(value || 0)
    if (id && id !== currentUserId.value && !ids.includes(id)) ids.push(id)
  }
  ;(item.engineers || []).forEach((engineer) => addId(engineer.id))
  ;(workEntries || []).forEach((entry) => addId(entry.engineerId))
  return ids
}

function collaborativeWorkEntries({ includeConfirmationMarker = false } = {}) {
  if (!isCollaborativeService.value) return []
  syncWorkEntries()
  const selected = new Set(selectedEngineerIds.value.map(Number))
  const entries = serviceDraft.value.workEntries
    .filter((entry) => selected.has(Number(entry.engineerId)))
    .map((entry) => ({
      engineerId: Number(entry.engineerId),
      engineerName: engineerName(entry.engineerId),
      workContent: stripCollaborativeAckMarker(entry.workContent || '').trim(),
    }))
    .filter((entry) => entry.workContent)

  if (!includeConfirmationMarker) return entries

  const common = String(serviceDraft.value.commonWorkContent || '').trim()
  const currentEntry = (serviceDraft.value.workEntries || []).find((entry) => Number(entry.engineerId) === currentUserId.value)
  if (common && currentUserId.value && !hasVisibleWorkContent(currentEntry?.workContent)) {
    entries.push({
      engineerId: currentUserId.value,
      engineerName: engineerName(currentUserId.value),
      workContent: collaborativeAckMarker,
    })
  }
  return entries
}

function combinedWorkContent() {
  const common = String(serviceDraft.value.commonWorkContent || '').trim()
  if (!isCollaborativeService.value) return String(serviceDraft.value.workContent || '').trim()
  const segments = []
  if (common) segments.push(`共同内容：\n${common}`)
  for (const entry of collaborativeWorkEntries()) {
    segments.push(`${entry.engineerName}：\n${entry.workContent}`)
  }
  return segments.join('\n\n')
}

function workEntryPlaceholder(entry) {
  if (Number(entry.engineerId) === currentUserId.value) {
    return currentServiceMode.value === 'remote'
      ? '填写你负责的远程处理、沟通或配置调整内容'
      : '填写你负责或参与的现场处理内容'
  }
  return '协同工程师稍后用自己的账号补充'
}

function toggleCoEngineer(engineerId) {
  const id = Number(engineerId)
  if (!id || id === currentUserId.value) return
  if (selectedCoEngineerIds.value.includes(id)) {
    selectedCoEngineerIds.value = selectedCoEngineerIds.value.filter((item) => item !== id)
    syncWorkEntries()
    return
  }
  selectedCoEngineerIds.value = [...selectedCoEngineerIds.value, id]
  syncWorkEntries()
}

function hideCoEngineerOptionsSoon() {
  window.setTimeout(() => {
    showCoEngineerOptions.value = false
  }, 140)
}

function handleDocumentPointerDown(event) {
  const container = coEngineerField.value
  if (!container || !showCoEngineerOptions.value) return
  if (!container.contains(event.target)) {
    showCoEngineerOptions.value = false
  }
}

function signaturePoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  const point = event.touches?.[0] || event
  return {
    x: ((point.clientX - rect.left) / rect.width) * canvas.width,
    y: ((point.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function resizeSignatureCanvas() {
  const canvas = signatureCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const ratio = window.devicePixelRatio || 1
  const nextWidth = Math.max(1, Math.round(rect.width * ratio))
  const nextHeight = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width === nextWidth && canvas.height === nextHeight) return
  canvas.width = nextWidth
  canvas.height = nextHeight
  paintSignature(customerSignature.value)
}

async function lockSignatureLandscape() {
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // Fullscreen is best-effort; unsupported browsers still get the landscape signing panel.
  }
  try {
    await screen.orientation?.lock?.('landscape')
  } catch {
    // iOS Safari may not expose orientation lock, so the UI also asks the user to rotate.
  }
}

async function unlockSignatureLandscape() {
  try {
    screen.orientation?.unlock?.()
  } catch {
    // No-op when unsupported.
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch {
    // No-op when unsupported.
  }
}

async function openSignaturePanel() {
  signatureBeforeOpen = customerSignature.value
  signatureHistory.value = []
  signaturePanelOpen.value = true
  await nextTick()
  resizeSignatureCanvas()
  paintSignature(customerSignature.value)
  await lockSignatureLandscape()
  window.setTimeout(resizeSignatureCanvas, 260)
}

async function finishSignaturePanel() {
  endSignature()
  if (signatureCanvas.value && signatureDrawn.value) {
    customerSignature.value = signatureCanvas.value.toDataURL('image/png')
  } else {
    customerSignature.value = ''
  }
  signatureDrawn.value = Boolean(customerSignature.value)
  signaturePanelOpen.value = false
  await unlockSignatureLandscape()
}

async function cancelSignaturePanel() {
  endSignature()
  customerSignature.value = signatureBeforeOpen
  signatureDrawn.value = Boolean(customerSignature.value)
  signaturePanelOpen.value = false
  await unlockSignatureLandscape()
}

function beginSignature(event) {
  event.preventDefault()
  const canvas = signatureCanvas.value
  if (!canvas) return
  resizeSignatureCanvas()
  signatureHistory.value = [...signatureHistory.value.slice(-11), customerSignature.value || '']
  drawingSignature = true
  lastSignaturePoint = signaturePoint(event, canvas)
}

function drawSignature(event) {
  if (!drawingSignature) return
  event.preventDefault()
  const canvas = signatureCanvas.value
  if (!canvas || !lastSignaturePoint) return
  const point = signaturePoint(event, canvas)
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = '#172033'
  ctx.lineWidth = Math.max(6, canvas.width / 150)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(lastSignaturePoint.x, lastSignaturePoint.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  lastSignaturePoint = point
  signatureDrawn.value = true
  customerSignature.value = canvas.toDataURL('image/png')
}

function endSignature() {
  drawingSignature = false
  lastSignaturePoint = null
}

function clearSignature() {
  const canvas = signatureCanvas.value
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  signatureDrawn.value = false
  customerSignature.value = ''
  signatureHistory.value = []
}

function undoSignatureStroke() {
  if (!signatureHistory.value.length) return
  const previous = signatureHistory.value[signatureHistory.value.length - 1] || ''
  signatureHistory.value = signatureHistory.value.slice(0, -1)
  customerSignature.value = previous
  signatureDrawn.value = Boolean(previous)
  const canvas = signatureCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (previous) paintSignature(previous)
}

function paintSignature(dataUrl) {
  const canvas = signatureCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!dataUrl) return
  const image = new Image()
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    signatureDrawn.value = true
  }
  image.src = dataUrl
}

function applyCustomerSignature(dataUrl) {
  customerSignature.value = dataUrl || ''
  signatureDrawn.value = Boolean(customerSignature.value)
  if (signatureCanvas.value) {
    paintSignature(customerSignature.value)
  }
}

async function useLatestCustomerSignature() {
  const customer = activeCustomer.value
  const params = new URLSearchParams()
  if (customer.id) params.set('customerId', customer.id)
  if (customer.name) params.set('customerName', customer.name)
  if (!params.toString()) {
    error.value = '请先选择或填写客户名称'
    return
  }

  loadingLatestSignature.value = true
  error.value = ''
  try {
    const data = await api.get(`/service-orders/customer-signature/latest?${params.toString()}`)
    if (!data.customerSignature) {
      error.value = '没有找到该客户历史签名'
      return
    }
    applyCustomerSignature(data.customerSignature)
    message.value = '已复用该客户最近一次历史签名'
  } catch (err) {
    error.value = err.message || '历史签名读取失败'
  } finally {
    loadingLatestSignature.value = false
  }
}

async function scrollToCustomerPreview({ focus = false, behavior = 'smooth' } = {}) {
  await nextTick()
  const target = customerContactSection.value
  if (target) {
    const offset = window.innerWidth <= 680 ? 24 : 28
    const top = target.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: Math.max(0, top), behavior })
  } else {
    customerNameInput.value?.scrollIntoView({ behavior, block: 'start' })
  }
  if (focus) window.setTimeout(() => customerNameInput.value?.focus?.(), 220)
}

function sameCustomer(left, right) {
  if (!left || !right) return false
  const leftId = String(left.id || left.customerId || '')
  const rightId = String(right.id || right.customerId || '')
  if (leftId && rightId && leftId === rightId) return true
  const leftName = left.name || left.customerName || ''
  const rightName = right.name || right.customerName || ''
  return leftName && rightName && leftName === rightName
}

function findCustomerProfile(customer) {
  return customers.value.find((item) => sameCustomer(item, customer)) || null
}

function mergeContacts(...contactGroups) {
  const contacts = new Map()
  contactGroups.flat().forEach((contact) => {
    const name = String(contact?.name || contact?.contactName || '').trim()
    if (!name) return
    const phone = String(contact?.phone || contact?.contactPhone || '').trim()
    const key = contactKey({ name, phone })
    const existing = contacts.get(key)
    contacts.set(key, {
      id: contact.id || existing?.id || key,
      name,
      phone,
      useCount: Number(contact.useCount || 0) + Number(existing?.useCount || 0),
      lastUsedAt: contact.lastUsedAt || contact.engineerLastUsedAt || existing?.lastUsedAt || '',
    })
  })
  return [...contacts.values()]
}

function normalizeCustomerFromOrder(order) {
  return {
    id: order.customerId,
    name: order.customerName,
    address: order.customerAddress,
    mapAddress: order.customerMapAddress,
    contactName: order.contactName || order.report?.customerName,
    contactPhone: order.contactPhone,
    contacts: order.contacts || [],
  }
}

function parseLocation(location) {
  if (!location) return { latitude: null, longitude: null }
  const [longitude, latitude] = String(location).split(',').map(Number)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude: null, longitude: null }
  }
  return { latitude, longitude }
}

function normalizeCustomer(customer) {
  const location = parseLocation(customer.location)
  return {
    id: customer.id || customer.customerId,
    name: customer.name || customer.customerName,
    address: customer.address || customer.customerAddress,
    mapAddress: customer.mapAddress || customer.customerMapAddress,
    latitude: customer.latitude || customer.customerLatitude || location.latitude,
    longitude: customer.longitude || customer.customerLongitude || location.longitude,
    mapProvider: customer.mapProvider || customer.customerMapProvider || '',
    mapPoiId: customer.mapPoiId || customer.customerMapPoiId || '',
    mapPoiName: customer.mapPoiName || customer.customerMapPoiName || '',
    contactName: customer.contactName || '',
    contactPhone: customer.contactPhone || '',
    contacts: customer.contacts || [],
    source: customer.source || '',
  }
}

function customerWithProfile(customer) {
  const normalized = normalizeCustomer(customer)
  const profile = findCustomerProfile(normalized)
  if (!profile) return normalized

  const normalizedProfile = normalizeCustomer(profile)
  return {
    ...normalizedProfile,
    ...normalized,
    id: normalized.id || normalizedProfile.id,
    name: normalized.name || normalizedProfile.name,
    address: normalized.address || normalizedProfile.address,
    mapAddress: normalized.mapAddress || normalizedProfile.mapAddress,
    contactName: normalized.contactName || normalizedProfile.contactName,
    contactPhone: normalized.contactPhone || normalizedProfile.contactPhone,
    contacts: mergeContacts(
      normalizedProfile.contacts,
      normalized.contacts,
      { name: normalizedProfile.contactName, phone: normalizedProfile.contactPhone },
      { name: normalized.contactName, phone: normalized.contactPhone },
    ),
  }
}

function contactKey(contact) {
  return `${contact.name || ''}:${contact.phone || ''}`
}

function contactsForCustomer(customer) {
  if (!customer?.id && !customer?.name) return []
  const customerId = String(customer.id || '')
  const customerName = customer.name || ''
  const contacts = new Map()
  const pushContact = (contact, weight = 0) => {
    const name = String(contact?.name || '').trim()
    if (!name) return
    const phone = String(contact?.phone || '').trim()
    const key = contactKey({ name, phone })
    const existing = contacts.get(key)
    contacts.set(key, {
      id: contact.id || key,
      name,
      phone,
      weight: (existing?.weight || 0) + weight + Number(contact.useCount || 0),
      lastUsedAt: contact.lastUsedAt || contact.engineerLastUsedAt || existing?.lastUsedAt || '',
    })
  }

  ;(customer.contacts || []).forEach((contact) => pushContact(contact, 1))
  if (customer.contactName) pushContact({ name: customer.contactName, phone: customer.contactPhone }, 1)
  recentOrders.value
    .filter((order) => {
      if (customerId && String(order.customerId || '') === customerId) return true
      return customerName && order.customerName === customerName
    })
    .forEach((order, index) => {
      pushContact(
        {
          name: order.contactName || order.report?.customerName,
          phone: order.contactPhone,
          lastUsedAt: order.submittedAt || order.updatedAt || order.createdAt,
        },
        100 - index,
      )
      ;(order.contacts || []).forEach((contact) => pushContact(contact, 20))
    })

  return [...contacts.values()].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    return String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || ''))
  })
}

function preferredContactForCustomer(customer) {
  return contactsForCustomer(customer)[0] || {
    name: customer.contactName || '',
    phone: customer.contactPhone || '',
  }
}

function applyCustomer(customer, sourceId = '') {
  const normalized = customerWithProfile(customer)
  const contact = preferredContactForCustomer(normalized)
  const customerChanged = !sameCustomer(selectedCustomer.value, normalized)
  if (customerChanged) clearSignature()
  selectedHistoryId.value = sourceId
  selectedCustomer.value = {
    ...normalized,
    contactName: contact.name || normalized.contactName || '',
    contactPhone: contact.phone || normalized.contactPhone || '',
  }
  showContactOptions.value = false
  showNearbyCompanies.value = false
  if (customerChanged && currentServiceMode.value === 'onsite' && serviceDraft.value.serviceType === 'install') {
    resetInstallDeviceSelection()
  }
}

function clearFieldError(field) {
  fieldErrors.value = {
    ...fieldErrors.value,
    [field]: '',
  }
}

function activeRequiredTimeFieldKeys() {
  return [...travelTimeFields.value, ...closeoutTimeFields.value]
    .filter((field) => field[2])
    .map((field) => timeFieldKey(field[0]))
    .filter(Boolean)
}

function activeFieldErrorKeys() {
  const keys = ['workContent', 'actualStartAt', 'actualEndAt']
  if (!isOfficeMode.value) {
    keys.push('name', 'contactName', 'contactPhone', 'issueDescription', 'result')
  }
  if (!isRemoteLikeMode.value) {
    keys.push('address', 'customerSignature')
  }
  if (showDeviceField.value) {
    keys.push('deviceName')
  }
  for (const key of activeRequiredTimeFieldKeys()) {
    if (!keys.includes(key)) keys.push(key)
  }
  return keys
}

function clearInactiveFieldErrors() {
  const activeKeys = new Set(activeFieldErrorKeys())
  const nextErrors = {}
  for (const [key, value] of Object.entries(fieldErrors.value || {})) {
    if (activeKeys.has(key)) nextErrors[key] = value
  }
  fieldErrors.value = nextErrors
  if (error.value && !Object.values(nextErrors).includes(error.value)) {
    error.value = ''
  }
}

function applyContactFields(fields) {
  const current = normalizeCustomer(activeCustomer.value)
  selectedCustomer.value = {
    ...current,
    ...fields,
  }
}

function updateCustomerField(field, value) {
  const current = normalizeCustomer(activeCustomer.value)
  selectedHistoryId.value = ''
  selectedCustomer.value = {
    ...current,
    [field]: value,
  }
  if (field === 'address') {
    selectedCustomer.value.mapAddress = value
  }
  clearFieldError(field)
  if (field === 'name') {
    selectedCustomer.value.id = ''
    selectedCustomer.value.contactName = ''
    selectedCustomer.value.contactPhone = ''
    selectedCustomer.value.contacts = []
    clearSignature()
    scheduleCustomerLookup(value)
  }
  if (field === 'name' || field === 'address') {
    if (currentServiceMode.value === 'onsite' && serviceDraft.value.serviceType === 'install') {
      resetInstallDeviceSelection()
    }
  }
}

function updateContactField(field, value) {
  applyContactFields({ [field]: value })
  clearFieldError(field)
}

function applyHistory(order) {
  applyCustomer(normalizeCustomerFromOrder(order), order.id)
  message.value = `已带入客户：${order.customerName || '未命名客户'}`
  scrollToCustomerPreview()
}

function selectContact(contact) {
  applyContactFields({
    contactName: contact.name,
    contactPhone: contact.phone || '',
  })
  showContactOptions.value = false
  clearFieldError('contactName')
  clearFieldError('contactPhone')
}

function hideContactOptionsSoon() {
  window.setTimeout(() => {
    showContactOptions.value = false
  }, 140)
}

function hideNearbyCompaniesSoon() {
  window.setTimeout(() => {
    showNearbyCompanies.value = false
  }, 140)
}

function timeFieldKey(label) {
  if (label === '开始时间') return 'actualStartAt'
  if (label === '结束时间') return 'actualEndAt'
  if (label === '出发时间') return 'departureAt'
  if (label === '到达时间') return 'actualStartAt'
  if (label === '完成时间') return 'actualEndAt'
  if (label === '返抵时间') return 'returnAt'
  return ''
}

function setTimeInputRef(label, element) {
  if (label === '到达时间') actualStartInput.value = element
  if (label === '完成时间') actualEndInput.value = element
}

function timeInputValue(label) {
  const key = timeFieldKey(label)
  return key ? String(serviceDraft.value[key] || '').replace(' ', 'T') : ''
}

function normalizeTimeInputValue(value) {
  return String(value || '').replace('T', ' ')
}

function submitDateTimeValue(value) {
  const normalized = normalizeTimeInputValue(value).trim()
  if (!normalized) return null
  return normalized.length === 16 ? `${normalized}:00` : normalized
}

function showTimePicker(event) {
  event.target?.showPicker?.()
}

function fillTimeFieldWithCurrentTime(label) {
  const key = timeFieldKey(label)
  if (!key) return
  const nextValue = normalizeTimeInputValue(localDateTimeInputValue())
  serviceDraft.value[key] = nextValue
  clearFieldError(key)
  persistTimeDraft()
}

function handleTimeFieldClick(label, event) {
  const key = timeFieldKey(label)
  if (!key) return
  if (!String(serviceDraft.value[key] || '').trim()) {
    fillTimeFieldWithCurrentTime(label)
    message.value = '已带入当前时间，可继续修改'
  }
  showTimePicker(event)
}

function updateTimeField(label, value) {
  const key = timeFieldKey(label)
  if (!key) return
  const nextValue = normalizeTimeInputValue(value)
  serviceDraft.value[key] = nextValue
  clearFieldError(key)
  persistTimeDraft()
}

async function searchNearbyCompanies(coords = {}, options = {}) {
  const params = new URLSearchParams()
  const keyword = options.keyword ?? activeCustomer.value.name ?? ''
  if (keyword) params.set('keyword', keyword)
  if (coords.latitude && coords.longitude) {
    params.set('latitude', coords.latitude)
    params.set('longitude', coords.longitude)
  }

  const data = await api.get(`/geo/companies?${params.toString()}`)
  const items = options.nearbyOnly ? (data.items || []).filter((item) => item.source !== 'customer') : data.items || []
  nearbyCompanies.value = options.nearbyOnly && !items.length ? mapFallbackCompanies : items
  showNearbyCompanies.value = true
  locationHint.value = nearbyCompanies.value.length
    ? `已找到 ${nearbyCompanies.value.length} 个候选，点击可带入客户名称和地址。`
    : '没有找到候选，可继续使用常用客户或手动填写。'
}

function scheduleCustomerLookup(value) {
  const keyword = String(value || '').trim()
  window.clearTimeout(customerSearchTimer)
  if (!keyword) {
    nearbyCompanies.value = []
    showNearbyCompanies.value = false
    locationHint.value = ''
    return
  }
  customerSearchTimer = window.setTimeout(async () => {
    locationHint.value = `正在搜索“${keyword}”相关客户...`
    try {
      await searchNearbyCompanies({}, { keyword })
    } catch (err) {
      locationHint.value = err.message || '客户搜索失败'
    }
  }, 300)
}

function onDeviceModelInput() {
  const active = installDeviceList.value[activeInstallDeviceIndex.value]
  const q = String(active?.model || '').trim()
  window.clearTimeout(deviceModelSearchTimer)
  ++deviceModelReqId
  if (q.length < 2) {
    deviceModelSuggestions.value = []
    showDeviceModelSuggestions.value = false
    return
  }
  deviceModelSearchTimer = window.setTimeout(async () => {
    const reqId = deviceModelReqId
    try {
      const data = await api.get(`/device-models/suggest?q=${encodeURIComponent(q)}`)
      if (reqId !== deviceModelReqId) return
      deviceModelSuggestions.value = data?.items || []
      showDeviceModelSuggestions.value = deviceModelSuggestions.value.length > 0
    } catch {
      if (reqId !== deviceModelReqId) return
      deviceModelSuggestions.value = []
      showDeviceModelSuggestions.value = false
    }
  }, 300)
}

function selectDeviceModel(item) {
  const active = installDeviceList.value[activeInstallDeviceIndex.value]
  if (active) active.model = item?.officialName || ''
  showDeviceModelSuggestions.value = false
  deviceModelSuggestions.value = []
  selectedSuggestionIndex.value = -1
}

function hideDeviceModelSuggestions() {
  window.setTimeout(() => {
    showDeviceModelSuggestions.value = false
    selectedSuggestionIndex.value = -1
  }, 200)
}

function onDeviceModelKeydown(event) {
  if (!showDeviceModelSuggestions.value || deviceModelSuggestions.value.length === 0) return
  const maxIndex = deviceModelSuggestions.value.length - 1
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedSuggestionIndex.value = selectedSuggestionIndex.value < maxIndex ? selectedSuggestionIndex.value + 1 : 0
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedSuggestionIndex.value = selectedSuggestionIndex.value > 0 ? selectedSuggestionIndex.value - 1 : maxIndex
  } else if (event.key === 'Enter' && selectedSuggestionIndex.value >= 0) {
    event.preventDefault()
    selectDeviceModel(deviceModelSuggestions.value[selectedSuggestionIndex.value])
  } else if (event.key === 'Escape') {
    showDeviceModelSuggestions.value = false
    selectedSuggestionIndex.value = -1
  }
}

async function locateNearbyCompanies() {
  if (locating.value) return
  locating.value = true
  clearFieldError('name')
  clearFieldError('address')
  if (error.value === fieldErrors.value.name || error.value === '请填写客户名称') {
    error.value = ''
  }
  const keyword = String(activeCustomer.value.name || '').trim()

  if (keyword) {
    locationHint.value = `正在搜索“${keyword}”相关客户...`
    try {
      await searchNearbyCompanies()
    } catch (err) {
      locationHint.value = err.message || '客户搜索失败'
    } finally {
      locating.value = false
    }
    return
  }

  locationHint.value = '正在获取定位并查找附近公司...'

  const fallback = async () => {
    locationHint.value = '无法获取定位，先展示地图公司候选；允许定位后会按附近排序。'
    await searchNearbyCompanies({}, { keyword: '公司', nearbyOnly: true })
  }

  try {
    if (!navigator.geolocation) {
      await fallback()
      return
    }
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await searchNearbyCompanies(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            { keyword: '', nearbyOnly: true },
          )
          resolve()
        },
        async () => {
          await fallback()
          resolve()
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
      )
    })
  } catch (err) {
    locationHint.value = err.message || '定位查询失败'
  } finally {
    locating.value = false
  }
}

function applyNearbyCompany(company) {
  applyCustomer({
    id: company.customerId || company.id,
    name: company.name,
    address: company.address,
    mapAddress: company.mapAddress || company.address,
    latitude: company.latitude,
    longitude: company.longitude,
    location: company.location,
    mapProvider: company.mapProvider || (company.source === 'map' ? 'amap' : ''),
    mapPoiId: company.mapPoiId || (company.source === 'map' ? company.id : ''),
    mapPoiName: company.mapPoiName || company.name,
    contactName: company.contactName,
    contactPhone: company.contactPhone,
    contacts: company.contacts || [],
    source: company.source,
  })
  locationHint.value = `已纠正为：${company.name}`
  clearFieldError('name')
  clearFieldError('address')
  clearFieldError('contactName')
  clearFieldError('contactPhone')
  scrollToCustomerPreview()
}

async function load() {
  loading.value = true
  error.value = ''
  retryableError.value = false
  try {
    const requests = [
      api.get('/customers?pageSize=10'),
      api.get('/service-orders?mine=1&pageSize=10&sortBy=createdAt&sortDir=desc'),
      api.get('/users/engineers'),
    ]
    if (route.params.id) requests.push(api.get(`/service-orders/${route.params.id}`))
    const [customerData, orderData, engineerData, detailData] = await Promise.all(requests)
    customers.value = customerData.items || []
    recentOrders.value = orderData.items || []
    engineers.value = engineerData.items || []
    editingTask.value = detailData?.item || null
    if (detailData?.item) {
      const normalizedMode = normalizePreviewServiceMode(detailData.item)
      const report = detailData.item.report || {}
      const loadedWorkEntries = Array.isArray(report.workEntries)
        ? report.workEntries.map((entry) => ({
            engineerId: Number(entry.engineerId),
            engineerName: entry.engineerName || engineerName(entry.engineerId),
            workContent: stripCollaborativeAckMarker(entry.workContent || ''),
          }))
        : []
      const legacyWork = loadedWorkEntries.length ? { entries: [], commonWorkContent: '' } : parseLegacyWorkEntries(report.workContent, detailData.item)
      const effectiveWorkEntries = loadedWorkEntries.length ? loadedWorkEntries : legacyWork.entries
      const currentWorkEntry = effectiveWorkEntries.find((entry) => Number(entry.engineerId) === currentUserId.value)
      selectedCoEngineerIds.value = collaborativeCoEngineerIds(detailData.item, effectiveWorkEntries)
      applyCustomer(
        {
          ...normalizeCustomerFromOrder(detailData.item),
          contacts: detailData.item.contacts || [],
        },
        detailData.item.id,
      )
      formMode.value = normalizedMode
      onsiteDraft.value = createOnsiteDraft()
      remoteDraft.value = createRemoteDraft()
      officeDraft.value = createOfficeDraft()
      if (normalizedMode === 'remote') {
        remoteDraft.value = {
          ...remoteDraft.value,
          remoteCategory: previewTimesheetCategoryLabel('remote', detailData.item.timesheetCategory || remoteDraft.value.remoteCategory),
          actualStartAt: formatLoadedDateTime(report.actualStartAt || detailData.item.plannedStartAt),
          actualEndAt: formatLoadedDateTime(report.actualEndAt || detailData.item.plannedEndAt),
          issueDescription: detailData.item.issueDescription || report.faultSummary || '',
          commonWorkContent: legacyWork.commonWorkContent || '',
          workContent: effectiveWorkEntries.length ? currentWorkEntry?.workContent || '' : report.workContent || '',
          workEntries: effectiveWorkEntries,
          result: report.result || remoteDraft.value.result || 'resolved',
          resultDescription: report.resultDescription || '',
        }
      } else if (normalizedMode === 'office') {
        officeDraft.value = {
          ...officeDraft.value,
          officeCategory: previewTimesheetCategoryLabel('office', detailData.item.timesheetCategory || officeDraft.value.officeCategory),
          deviceName: detailData.item.deviceName === '全自动核酸提取系统' ? '' : (detailData.item.deviceName || ''),
          actualStartAt: formatLoadedDateTime(report.actualStartAt || detailData.item.plannedStartAt),
          actualEndAt: formatLoadedDateTime(report.actualEndAt || detailData.item.plannedEndAt),
          workContent: report.workContent || detailData.item.issueDescription || '',
        }
      } else {
        onsiteDraft.value = {
          ...onsiteDraft.value,
          serviceType: detailData.item.serviceType || onsiteDraft.value.serviceType,
          departureAt: formatLoadedDateTime(report.departureAt),
          actualStartAt: formatLoadedDateTime(report.actualStartAt || detailData.item.plannedStartAt),
          actualEndAt: formatLoadedDateTime(report.actualEndAt || detailData.item.plannedEndAt),
          returnAt: formatLoadedDateTime(report.returnAt),
          issueDescription: detailData.item.issueDescription || report.faultSummary || '',
          commonWorkContent: legacyWork.commonWorkContent || '',
          workContent: effectiveWorkEntries.length ? currentWorkEntry?.workContent || '' : report.workContent || '',
          workEntries: effectiveWorkEntries,
          result: report.result || onsiteDraft.value.result || 'resolved',
          resultDescription: report.resultDescription || '',
        }
      }
      if (normalizedMode === 'onsite' && detailData.item.serviceType === 'install') {
        installDeviceList.value = [createInstallDeviceDraft()]
      } else {
        resetInstallDeviceSelection()
      }
      syncWorkEntries()
      customerSignature.value = report.customerSignature || ''
      signatureDrawn.value = Boolean(customerSignature.value)
    }
  } catch (err) {
    error.value = err.message
    retryableError.value = true
  } finally {
    loading.value = false
  }
}

function buildSubmitPayload() {
  const customer = activeCustomer.value
  const effectiveServiceMode = currentServiceMode.value
  const fallbackCustomer = isOfficeMode.value ? internalRecordDefaults.value : null
  const workContent = combinedWorkContent()
  const issueDescription = isOfficeMode.value
    ? workContent
    : String(serviceDraft.value.issueDescription || '').trim()
  const workEntries = collaborativeWorkEntries({ includeConfirmationMarker: true })
  const numericCustomerId = Number(customer.id)
  const baseCustomerName = String(customer.name || fallbackCustomer?.customerName || '').trim()
  const customerName = baseCustomerName
  const customerAddress = String(customer.address || customer.mapAddress || fallbackCustomer?.customerAddress || '').trim()
  const contactName = String(customer.contactName || fallbackCustomer?.contactName || customerName || '').trim()
  const contactPhone = String(customer.contactPhone || fallbackCustomer?.contactPhone || '').trim()
  const issueSummary = String(serviceDraft.value.issueDescription || '').trim()
  const submitDeviceName = showDeviceField.value
    ? String(serviceDraft.value.deviceName || '').trim()
    : (issueSummary || [customerName, serviceModeDocumentLabel(currentServiceMode.value)].filter(Boolean).join(' / '))
  const isInstallOrder = effectiveServiceMode === 'onsite' && serviceDraft.value.serviceType === 'install'
  const installDevices = isInstallOrder
    ? installDeviceList.value
        .filter(d => d.model || d.pn || d.serialNo || d.remark)
        .map(d => ({
          deviceModel: String(d.model || '').trim() || null,
          devicePn: String(d.pn || '').trim() || null,
          deviceSerialNo: String(d.serialNo || '').trim() || null,
          deviceRemark: String(d.remark || '').trim() || null,
        }))
    : []
  // First device is also mapped to legacy single fields for backward compat
  const firstDevice = installDevices[0] || {}
  const payload = {
    customerId: Number.isInteger(numericCustomerId) && numericCustomerId > 0 ? numericCustomerId : null,
    customerName,
    customerAddress,
    customerLatitude: customer.latitude || null,
    customerLongitude: customer.longitude || null,
    customerMapProvider: customer.mapProvider || null,
    customerMapPoiId: customer.mapPoiId || null,
    customerMapPoiName: customer.mapPoiName || null,
    customerMapAddress: customer.mapAddress || null,
    contactName,
    contactPhone,
    deviceName: isInstallOrder ? '' : submitDeviceName,
    serviceMode: effectiveServiceMode,
    serviceType: effectiveServiceMode === 'onsite' ? serviceDraft.value.serviceType : 'other',
    timesheetCategory:
      effectiveServiceMode === 'onsite'
        ? null
        : previewTimesheetCategoryValue(effectiveServiceMode, serviceDraft.value.serviceType),
    priority: 'normal',
    engineerIds: selectedCoEngineerIds.value,
    issueDescription,
    faultSummary: issueDescription,
    workContent,
    workEntries,
    result: serviceDraft.value.result,
    resultDescription: serviceDraft.value.resultDescription,
    departureAt: submitDateTimeValue(serviceDraft.value.departureAt),
    actualStartAt: submitDateTimeValue(serviceDraft.value.actualStartAt),
    actualEndAt: submitDateTimeValue(serviceDraft.value.actualEndAt),
    returnAt: submitDateTimeValue(serviceDraft.value.returnAt),
    workHours: 2,
    customerConfirmName: contactName || customerName,
    customerSignature: effectiveServiceMode === 'remote' ? '' : customerSignature.value,
  }
  if (isInstallOrder) {
    payload.deviceModel = firstDevice.deviceModel
    payload.devicePn = firstDevice.devicePn
    payload.deviceSerialNo = firstDevice.deviceSerialNo
    payload.deviceRemark = firstDevice.deviceRemark
    payload.installDevices = installDevices
  }
  return payload
}

function isConnectivityError(err) {
  const text = String(err?.message || err || '')
  return text.includes('无法连接服务器') || text.includes('当前离线') || text.includes('Failed to fetch')
}

function returnToTasks() {
  try {
    sessionStorage.setItem(taskHomeForceRefreshKey, String(Date.now()))
  } catch {
    // Ignore storage errors so returning to the list is never blocked.
  }
  window.location.replace(router.resolve({ name: 'tasks' }).href)
}

async function submitServiceSheet() {
  if (!(await validateRequiredFields())) return

  saving.value = true
  error.value = ''
  retryableError.value = false
  message.value = ''
  const payload = buildSubmitPayload()
  try {
    if (!isOnline.value) {
      const queued = queueSelfReportSync({
        mode: route.params.id ? 'update' : 'create',
        orderId: route.params.id,
        payload,
      })
      await persistDraft()
      message.value = `当前离线，已加入待同步队列：${queued.customerName || '服务记录'}`
      returnToTasks()
      return
    }
    const result = route.params.id
      ? await api.put(`/service-orders/${route.params.id}/self-report`, payload)
      : await api.post('/service-orders/self-report', payload)
    const submittedLabel = result?.orderNo || editingTask.value?.orderNo || result?.id || route.params.id || '服务记录'
    message.value = `服务记录已提交：${submittedLabel}`
    await clearSelfReportDraft(draftTargetOrderId(), createDraftRouteMode(), createDraftRouteId())
    draftSavedAt.value = ''
    draftSavedAtMs.value = 0
    draftDirty.value = false
    draftCountdown.value = 0
    if (pendingSyncCount.value) syncPendingSelfReports().catch(() => {})
    await load()
    returnToTasks()
  } catch (err) {
    if (isConnectivityError(err)) {
      const queued = queueSelfReportSync({
        mode: route.params.id ? 'update' : 'create',
        orderId: route.params.id,
        payload,
      })
      await persistDraft()
      message.value = `网络中断，已加入待同步队列：${queued.customerName || '服务记录'}`
      returnToTasks()
      return
    }
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function focusField(field) {
  const refs = {
    name: customerNameInput,
    address: customerAddressInput,
    contactName: contactInput,
    contactPhone: phoneInput,
    issueDescription: issueDescriptionInput,
    workContent: isCollaborativeService.value ? collaborationWorkSection : serviceRecordInput,
    result: serviceResultInput,
    actualStartAt: actualStartInput,
    actualEndAt: actualEndInput,
    customerSignature: signatureSection,
  }
  await nextTick()
  const element = refs[field]?.value
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => element?.focus?.(), 220)
}

async function validateRequiredFields() {
  const customer = activeCustomer.value
  const errors = {}
  if (!isOfficeMode.value && !String(customer.name || '').trim()) errors.name = '请填写客户名称'
  if (!isRemoteLikeMode.value && !String(customer.address || customer.mapAddress || '').trim()) errors.address = '请填写客户地址'
  if (!isOfficeMode.value && !String(customer.contactName || '').trim()) errors.contactName = '请填写联系人'
  if (!isOfficeMode.value && !String(customer.contactPhone || '').trim()) errors.contactPhone = '请填写联系电话'
  if (showDeviceField.value && !String(serviceDraft.value.deviceName || '').trim()) {
    errors.deviceName = `请填写${deviceFieldLabel.value}`
  }
  if (!isOfficeMode.value && !String(serviceDraft.value.issueDescription || '').trim()) errors.issueDescription = '请填写问题描述'
  if (!combinedWorkContent()) errors.workContent = currentServiceMode.value === 'remote' ? '请填写处理记录' : '请填写服务内容 / 现场处理记录'
  if (!isOfficeMode.value && !String(serviceDraft.value.result || '').trim()) {
    errors.result = currentServiceMode.value === 'remote' ? '请选择处理结果' : '请选择服务结论'
  }
  for (const [label, , required] of [...travelTimeFields.value, ...closeoutTimeFields.value]) {
    if (!required) continue
    const key = timeFieldKey(label)
    if (key && !String(serviceDraft.value[key] || '').trim()) {
      errors[key] = `请填写${label}`
    }
  }
  if (!isRemoteLikeMode.value && !customerSignature.value) errors.customerSignature = '请先完成客户签名'

  fieldErrors.value = errors
  const firstField = Object.keys(errors)[0]
  if (!firstField) return true
  showNearbyCompanies.value = false
  error.value = errors[firstField]
  retryableError.value = false
  await focusField(firstField)
  return false
}

function saveDraft() {
  persistDraft({ silent: false, waitForRemote: true })
    .then(() => {
      returnToTasks()
    })
    .catch((err) => {
      error.value = err?.message || '草稿保存失败，请稍后重试'
      retryableError.value = true
      message.value = ''
    })
}

function requestExitConfirm() {
  if (cancelFabMoved) {
    window.setTimeout(() => {
      cancelFabMoved = false
    }, 0)
    return
  }
  window.dispatchEvent(new CustomEvent('rc-open-exit-confirm'))
}

function emitDraftDirtyState() {
  window.dispatchEvent(new CustomEvent('rc-form-dirty-state', { detail: { dirty: draftDirty.value } }))
}

function cancelFabSize() {
  return window.innerWidth <= 680 ? 56 : 60
}

function cancelFabBottomOffset() {
  return 24
}

function defaultCancelFabPosition() {
  if (typeof window === 'undefined') return null
  return clampCancelFabPosition(
    window.innerWidth - cancelFabSize() - 24,
    window.innerHeight - cancelFabSize() - cancelFabBottomOffset(),
  )
}

function ensureCancelFabPosition() {
  if (cancelFabPosition.value.x !== null && cancelFabPosition.value.y !== null) return
  const fallback = defaultCancelFabPosition()
  if (fallback) cancelFabPosition.value = fallback
}

function clampCancelFabPosition(x, y) {
  const size = cancelFabSize()
  const margin = 12
  const minX = margin
  const maxX = Math.max(minX, window.innerWidth - size - margin)
  const minY = margin
  const maxY = Math.max(minY, window.innerHeight - size - cancelFabBottomOffset())
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  }
}

function cancelFabViewportBounds() {
  const size = cancelFabSize()
  const margin = 12
  const minX = margin
  const maxX = Math.max(minX, window.innerWidth - size - margin)
  const minY = margin
  const maxY = Math.max(minY, window.innerHeight - size - cancelFabBottomOffset())
  return { minX, maxX, minY, maxY }
}

function cancelFabDescriptorFromPosition(position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null
  const { minX, maxX, minY, maxY } = cancelFabViewportBounds()
  const anchorX = position.x <= (minX + maxX) / 2 ? 'left' : 'right'
  const anchorY = position.y <= (minY + maxY) / 2 ? 'top' : 'bottom'
  return {
    anchorX,
    anchorY,
    offsetX: anchorX === 'left' ? position.x - minX : maxX - position.x,
    offsetY: anchorY === 'top' ? position.y - minY : maxY - position.y,
  }
}

function cancelFabPositionFromDescriptor(descriptor) {
  if (!descriptor) return null
  const { minX, maxX, minY, maxY } = cancelFabViewportBounds()
  const x = descriptor.anchorX === 'right'
    ? maxX - Number(descriptor.offsetX || 0)
    : minX + Number(descriptor.offsetX || 0)
  const y = descriptor.anchorY === 'bottom'
    ? maxY - Number(descriptor.offsetY || 0)
    : minY + Number(descriptor.offsetY || 0)
  return clampCancelFabPosition(x, y)
}

function restoreCancelFabPosition() {
  try {
    const raw = localStorage.getItem(cancelFabStorageKey)
    if (!raw) {
      ensureCancelFabPosition()
      return
    }
    const parsed = JSON.parse(raw)
    if (parsed?.anchorX && parsed?.anchorY) {
      const restored = cancelFabPositionFromDescriptor(parsed)
      if (restored) {
        cancelFabPosition.value = restored
        return
      }
    }
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) {
      ensureCancelFabPosition()
      return
    }
    cancelFabPosition.value = clampCancelFabPosition(parsed.x, parsed.y)
  } catch {
    localStorage.removeItem(cancelFabStorageKey)
    ensureCancelFabPosition()
  }
}

function persistCancelFabPosition() {
  if (!Number.isFinite(cancelFabPosition.value.x) || !Number.isFinite(cancelFabPosition.value.y)) return
  const descriptor = cancelFabDescriptorFromPosition(cancelFabPosition.value)
  localStorage.setItem(cancelFabStorageKey, JSON.stringify(descriptor || cancelFabPosition.value))
}

function lockHorizontalScroll() {
  document.documentElement.scrollLeft = 0
  document.body.scrollLeft = 0
  if (window.scrollX) window.scrollTo(0, window.scrollY)
}

function handleCancelFabPointerMove(event) {
  if (!cancelFabDragging.value) return
  event.preventDefault()
  lockHorizontalScroll()
  const deltaX = event.clientX - cancelFabStartPointer.x
  const deltaY = event.clientY - cancelFabStartPointer.y
  if (!cancelFabMoved && Math.hypot(deltaX, deltaY) > 6) {
    cancelFabMoved = true
  }
  cancelFabPosition.value = clampCancelFabPosition(
    cancelFabStartPosition.x + deltaX,
    cancelFabStartPosition.y + deltaY,
  )
}

function stopCancelFabDrag() {
  if (!cancelFabDragging.value) return
  cancelFabDragging.value = false
  persistCancelFabPosition()
  lockHorizontalScroll()
  window.removeEventListener('pointermove', handleCancelFabPointerMove)
  window.removeEventListener('pointerup', stopCancelFabDrag)
  window.removeEventListener('pointercancel', stopCancelFabDrag)
}

function startCancelFabDrag(event) {
  if (event.button !== undefined && event.button !== 0) return
  cancelFabDragging.value = true
  cancelFabMoved = false
  event.preventDefault()
  cancelFabStartPointer = { x: event.clientX, y: event.clientY }
  const current = cancelFabPosition.value.x === null || cancelFabPosition.value.y === null
    ? defaultCancelFabPosition()
    : cancelFabPosition.value
  if (!current) return
  cancelFabStartPosition = { ...current }
  cancelFabPosition.value = current
  window.addEventListener('pointermove', handleCancelFabPointerMove)
  window.addEventListener('pointerup', stopCancelFabDrag)
  window.addEventListener('pointercancel', stopCancelFabDrag)
}

function syncCancelFabPositionToViewport() {
  if (cancelFabPosition.value.x === null || cancelFabPosition.value.y === null) return
  restoreCancelFabPosition()
}

restoreCancelFabPosition()

onMounted(async () => {
  refreshPendingSyncQueue()
  statusClockTimer = window.setInterval(() => {
    statusNowMs.value = Date.now()
  }, 1000)
  fillDefaultTimesForNewSheet()
  if (!route.params.id) {
    createDraftId.value = normalizeDraftItemId(route.query.draftId) || createDraftItemId()
    if (route.query.draftId !== createDraftId.value) {
      router.replace({ query: { ...route.query, draftId: createDraftId.value } }).catch(() => {})
    }
  }
  applyRouteServiceMode()
  await load()
  if (route.query.resume === '1') {
    restoreDraftIfPresent()
  }
  await nextTick()
  if (route.query.resume === '1') {
    await scrollToCustomerPreview({ behavior: 'auto' })
  }
  resizeSignatureCanvas()
  if (customerSignature.value) paintSignature(customerSignature.value)
  restoreCancelFabPosition()
  window.addEventListener('resize', resizeSignatureCanvas)
  window.addEventListener('storage', refreshPendingSyncQueue)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('resize', syncCancelFabPositionToViewport)
  emitDraftDirtyState()
})

onBeforeUnmount(() => {
  window.clearTimeout(customerSearchTimer)
  window.clearTimeout(deviceModelSearchTimer)
  window.clearTimeout(draftTimer)
  window.clearTimeout(draftSyncTimer)
  window.clearInterval(draftCountdownTimer)
  window.clearInterval(statusClockTimer)
  window.removeEventListener('resize', resizeSignatureCanvas)
  window.removeEventListener('storage', refreshPendingSyncQueue)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('resize', syncCancelFabPositionToViewport)
  stopCancelFabDrag()
  unlockSignatureLandscape()
  window.dispatchEvent(new CustomEvent('rc-form-dirty-state', { detail: { dirty: false } }))
})

watch(
  [selectedCustomer, selectedHistoryId, selectedCoEngineerIds, formMode, onsiteDraft, remoteDraft, officeDraft, customerSignature],
  () => scheduleDraftSave(),
  { deep: true },
)

watch(
  [selectedCoEngineerIds, formMode],
  () => {
    syncWorkEntries()
  },
  { deep: true },
)

watch(isOnline, (online, wasOnline) => {
  if (!online || wasOnline) return
  const payload = currentDraftPayload()
  if (!payload) return
  const clientUpdatedAt = payload.__draftClientUpdatedAt || lastDraftClientUpdatedAt.value || new Date().toISOString()
  lastDraftClientUpdatedAt.value = clientUpdatedAt
  syncDraftToRemote(payload, clientUpdatedAt).catch(() => {})
})

watch(
  () => route.query.draftId,
  (value) => {
    if (route.params.id) return
    const normalized = normalizeDraftItemId(value)
    if (normalized) createDraftId.value = normalized
  },
)

watch(draftDirty, () => emitDraftDirtyState(), { immediate: true })
</script>

<template>
  <main class="engineer-shell service-sheet-shell">
    <header class="topbar">
      <div>
        <BrandEyebrow :text="pageEyebrow" :title="pageTitle" />
      </div>
    </header>

    <p v-if="error" class="form-error">
      {{ zh(error) }}
      <button v-if="retryableError" type="button" @click="load">{{ zh('重试') }}</button>
    </p>
    <p v-if="message" class="form-success">{{ zh(message) }}</p>
    <p v-else-if="loading" class="muted">{{ zh('正在加载客户与历史服务记录...') }}</p>

    <section class="quick-card quick-customer-card">
      <div class="quick-card-head">
        <div>
          <p class="section-kicker">{{ zh('START HERE') }}</p>
          <h2>{{ zh(customerQuickTitle) }}</h2>
          <p>{{ zh(customerQuickHint) }}</p>
        </div>
      </div>
      <div class="history-stack">
        <button
          v-for="item in historyItems"
          :key="item.id"
          type="button"
          :class="{ active: selectedHistoryId === item.id }"
          :title="zh(item.fullLabel)"
          :aria-label="zh(`带入客户：${item.fullLabel}`)"
          @click="applyHistory(item.order)"
        >
          {{ zh(item.label) }}
        </button>
        <span v-if="!historyItems.length && !loading">{{ zh('暂无历史服务记录') }}</span>
      </div>
      <div class="quick-action-row">
        <button class="locate gps-correct-button" type="button" :disabled="locating" @click="locateNearbyCompanies">
          <PreviewIcon name="pin" />
          {{ zh(locating ? '查找中' : '定位查找') }}
        </button>
        <button class="ghost refresh-customer-button" type="button" :title="zh('重新同步客户、历史服务和工程师资料')" @click="load"><PreviewIcon name="refresh" />{{ zh('同步资料') }}</button>
      </div>
      <p v-if="locationHint" class="location-hint">{{ zh(locationHint) }}</p>
      <div v-if="showNearbyCompanies && !showCustomerNameOptions" class="nearby-company-list">
        <button
          v-for="company in nearbyCompanies"
          :key="company.id"
          type="button"
          @click="applyNearbyCompany(company)"
        >
          <strong>{{ zh(company.name) }}</strong>
          <span>{{ zh(company.source === 'customer' ? '系统客户' : '地图结果') }} · {{ zh(company.address || company.mapAddress || '暂无地址') }}</span>
        </button>
        <span v-if="!nearbyCompanies.length">{{ zh('暂无附近候选') }}</span>
      </div>
    </section>

    <section class="form-layout" :class="[`mode-${currentServiceMode}`, { collaborative: isCollaborativeService, remote: currentServiceMode === 'remote' }]">
      <article v-if="currentServiceMode === 'remote'" class="form-section remote-mode-banner">
        <div class="section-heading compact">
          <div>
            <p class="section-kicker">{{ zh('REMOTE MODE') }}</p>
            <h2>{{ zh('远程服务单') }}</h2>
            <p class="section-copy">{{ zh(remoteModeBannerText) }}</p>
          </div>
        </div>
      </article>
      <article ref="customerContactSection" class="form-section customer-contact-section section-tone-customer">
        <div class="section-heading">
          <div>
            <p class="section-kicker">{{ zh('01 / 基础信息') }}</p>
            <h2>{{ zh(customerSectionTitle) }}</h2>
          </div>
        </div>
        <div class="field-grid">
          <label class="field customer-name-field" :class="{ 'has-error': fieldErrors.name }">
            <span>{{ zh(customerNameLabel) }}<b v-if="!isOfficeMode">*</b></span>
            <input
              ref="customerNameInput"
              :class="{ invalid: fieldErrors.name }"
              :value="zh(activeCustomer.name || '')"
              :placeholder="zh(isOfficeMode ? '内勤工作可留空；如有关联客户也可填写' : '输入客户名称，或留空定位附近公司')"
              autocomplete="off"
              @focus="showNearbyCompanies = Boolean(activeCustomer.name && nearbyCompanies.length)"
              @input="updateCustomerField('name', $event.target.value)"
              @blur="hideNearbyCompaniesSoon"
            />
            <div v-if="showCustomerNameOptions" class="customer-company-options">
              <button
                v-for="company in nearbyCompanies"
                :key="company.id"
                type="button"
                @mousedown.prevent="applyNearbyCompany(company)"
              >
                <strong>{{ zh(company.name) }}</strong>
                <span>{{ zh(company.source === 'customer' ? '系统客户' : '地图结果') }} · {{ zh(company.address || company.mapAddress || '暂无地址') }}</span>
              </button>
              <em v-if="!nearbyCompanies.length">{{ zh('暂无匹配客户') }}</em>
            </div>
            <small v-if="fieldErrors.name" class="field-error">{{ zh(fieldErrors.name) }}</small>
          </label>
          <label class="field" :class="{ 'has-error': fieldErrors.address }">
            <span>{{ zh('客户地址') }}<b v-if="!isRemoteLikeMode">*</b></span>
            <input
              ref="customerAddressInput"
              :class="{ invalid: fieldErrors.address }"
              :value="zh(activeCustomer.address ?? activeCustomer.mapAddress ?? '')"
              :placeholder="zh(isOfficeMode ? '内勤工作通常可留空' : '选择客户或定位后带入')"
              @input="updateCustomerField('address', $event.target.value)"
            />
            <small v-if="fieldErrors.address" class="field-error">{{ zh(fieldErrors.address) }}</small>
          </label>
          <label class="field contact-picker-field" :class="{ 'has-error': fieldErrors.contactName }">
            <span>{{ zh('联系人') }}<b v-if="!isOfficeMode">*</b></span>
            <input
              ref="contactInput"
              :class="{ invalid: fieldErrors.contactName }"
              :value="zh(activeCustomer.contactName || '')"
              :placeholder="zh(isOfficeMode ? '内勤工作可留空；默认按当前工程师归档' : contactOptions.length ? '输入或选择联系人' : '输入联系人姓名')"
              @focus="showContactOptions = Boolean(contactOptions.length)"
              @click="showContactOptions = Boolean(contactOptions.length)"
              @input="updateContactField('contactName', $event.target.value)"
              @blur="hideContactOptionsSoon"
            />
            <div v-if="showContactOptions" class="contact-options">
              <button
                v-for="contact in contactOptions"
                :key="contact.id"
                type="button"
                @mousedown.prevent="selectContact(contact)"
              >
                <strong>{{ zh(contact.name) }}</strong>
                <span>{{ contact.phone || zh('未填写电话') }}</span>
              </button>
              <em v-if="!contactOptions.length">{{ zh('暂无联系人，可手动补充') }}</em>
            </div>
            <small v-if="fieldErrors.contactName" class="field-error">{{ zh(fieldErrors.contactName) }}</small>
          </label>
          <label class="field" :class="{ 'has-error': fieldErrors.contactPhone }">
            <span>{{ zh('联系电话') }}<b v-if="!isOfficeMode">*</b></span>
            <input
              ref="phoneInput"
              :class="{ invalid: fieldErrors.contactPhone }"
              :value="zh(activeCustomer.contactPhone || '')"
              :placeholder="zh(isOfficeMode ? '内勤工作可留空；默认带当前工程师信息' : '输入联系电话')"
              @input="updateContactField('contactPhone', $event.target.value)"
            />
            <small v-if="fieldErrors.contactPhone" class="field-error">{{ zh(fieldErrors.contactPhone) }}</small>
          </label>
        </div>
        <p v-if="isOfficeMode" class="muted compact">{{ zh('不关联客户也可以直接提交，记录会在月报中按内勤工作体现。') }}</p>
      </article>

      <article class="form-section service-info-section section-tone-service">
        <div class="section-heading">
          <div>
            <p class="section-kicker">{{ zh(currentServiceMode === 'remote' ? '02 / 远程信息' : '02 / 出发前') }}</p>
            <h2>{{ zh(infoSectionTitle) }}</h2>
          </div>
        </div>
        <div class="field-grid">
          <label v-if="showDeviceField" class="field" :class="{ 'has-error': fieldErrors.deviceName }">
            <span>{{ zh(deviceFieldLabel) }}<b>*</b></span>
            <input
              :class="{ invalid: fieldErrors.deviceName }"
              v-model.trim="serviceDraft.deviceName"
              :placeholder="zh(deviceFieldPlaceholder)"
              @input="clearFieldError('deviceName')"
            />
            <small v-if="fieldErrors.deviceName" class="field-error">{{ zh(fieldErrors.deviceName) }}</small>
          </label>
          <label class="field select-field">
            <span>{{ zh(serviceCategoryLabel) }}<b>*</b></span>
            <select v-model="serviceDraft.serviceType">
              <option v-for="option in serviceCategoryOptions" :key="option.value" :value="option.value">
                {{ zh(option.label) }}
              </option>
            </select>
          </label>
          <div v-if="!isOfficeMode" ref="coEngineerField" class="field co-engineer-field">
            <span>{{ zh('协同工程师') }}</span>
            <button
              class="co-engineer-trigger"
              type="button"
              @click.stop="showCoEngineerOptions = !showCoEngineerOptions"
            >
              <PreviewIcon name="users" />
              <span v-if="!selectedCoEngineers.length" class="co-engineer-placeholder">{{ zh('选择协同工程师') }}</span>
              <span v-for="engineer in selectedCoEngineers" :key="engineer.id" class="co-engineer-chip">
                {{ zh(engineer.realName || engineer.username || '工程师') }}
              </span>
              <i aria-hidden="true"></i>
            </button>
            <div v-if="showCoEngineerOptions" class="co-engineer-menu" @pointerdown.stop @click.stop>
              <button
                v-for="engineer in coEngineerOptions"
                :key="engineer.id"
                type="button"
                :class="{ selected: selectedCoEngineerIds.includes(Number(engineer.id)) }"
                @pointerdown.stop.prevent="toggleCoEngineer(engineer.id)"
                @click.stop.prevent
              >
                {{ zh(engineer.realName || engineer.username || '工程师') }}
              </button>
              <em v-if="!coEngineerOptions.length">{{ zh('暂无其他工程师') }}</em>
            </div>
          </div>
        </div>
        <label
          v-if="!isOfficeMode"
          class="field service-record-field issue-summary-field"
          :class="{ compact: isRemoteLikeMode, 'has-error': fieldErrors.issueDescription }"
        >
          <span>{{ zh(issueDescriptionLabel) }}<b>*</b></span>
          <textarea
            ref="issueDescriptionInput"
            v-model="serviceDraft.issueDescription"
            :class="{ invalid: fieldErrors.issueDescription }"
            :placeholder="zh(issueDescriptionPlaceholder)"
            rows="2"
            @input="clearFieldError('issueDescription')"
          />
          <small v-if="fieldErrors.issueDescription" class="field-error">{{ zh(fieldErrors.issueDescription) }}</small>
        </label>
      </article>

      <article class="form-section travel-time-section section-tone-time">
        <div class="section-heading">
          <div>
            <p class="section-kicker">{{ zh(isRemoteLikeMode ? '03 / 开始服务' : '03 / 出发到场') }}</p>
            <h2>{{ zh(isRemoteLikeMode ? '开始时间' : '出发与到达') }}</h2>
          </div>
        </div>
        <div class="field-grid">
          <label v-for="field in travelTimeFields" :key="field[0]" class="field">
            <span>{{ zh(field[0]) }}<b v-if="field[2]">*</b></span>
            <input
              :ref="(element) => setTimeInputRef(field[0], element)"
              type="datetime-local"
              :class="{ invalid: fieldErrors[timeFieldKey(field[0])] }"
              :value="timeInputValue(field[0])"
              :placeholder="zh(field[1])"
              @click="handleTimeFieldClick(field[0], $event)"
              @input="updateTimeField(field[0], $event.target.value)"
              @change="updateTimeField(field[0], $event.target.value)"
            />
            <small v-if="fieldErrors[timeFieldKey(field[0])]" class="field-error">
              {{ zh(fieldErrors[timeFieldKey(field[0])]) }}
            </small>
          </label>
        </div>
      </article>

      <article class="form-section work-detail-section section-tone-service">
        <div class="section-heading">
          <div>
            <p class="section-kicker">{{ zh('04 / 处理记录') }}</p>
            <h2>{{ zh(isCollaborativeService ? '协作服务内容' : workContentLabel) }}</h2>
          </div>
        </div>
        <div
          v-if="isCollaborativeService"
          ref="collaborationWorkSection"
          class="collaboration-work-card"
          :class="{ 'has-error': fieldErrors.workContent }"
        >
          <div class="card-row">
            <div>
              <span class="field-label">{{ zh('协作服务内容') }}<b>*</b></span>
              <small class="collaboration-hint">{{ zh('共同内容会合并到服务记录；每位工程师仅填写自己的处理内容。') }}</small>
            </div>
          </div>
          <label class="field service-record-field common-work-field">
            <span>{{ zh('共同内容') }}</span>
            <textarea
              v-model="serviceDraft.commonWorkContent"
              :placeholder="zh('填写大家共同确认的背景、结论或统一说明；没有可留空。')"
              rows="3"
              @input="clearFieldError('workContent')"
            />
          </label>
          <div class="collaboration-work-grid">
            <label
              v-for="entry in selectedWorkEntries"
              :key="entry.engineerId"
              class="field service-record-field"
            >
              <span>{{ zh(entry.engineerName) }}{{ Number(entry.engineerId) === currentUserId ? zh('（我）') : '' }}</span>
              <textarea
                v-model="entry.workContent"
                :readonly="Number(entry.engineerId) !== currentUserId"
                :placeholder="zh(workEntryPlaceholder(entry))"
                rows="4"
                @input="clearFieldError('workContent')"
              />
            </label>
          </div>
          <small v-if="fieldErrors.workContent" class="field-error">{{ zh(fieldErrors.workContent) }}</small>
        </div>
        <label v-else class="field service-record-field" :class="{ 'has-error': fieldErrors.workContent }">
          <span>{{ zh(workContentLabel) }}<b>*</b></span>
          <textarea
            ref="serviceRecordInput"
            v-model="serviceDraft.workContent"
            :class="{ invalid: fieldErrors.workContent }"
            :placeholder="zh(workContentPlaceholder)"
            rows="5"
            @input="clearFieldError('workContent')"
          />
          <small v-if="fieldErrors.workContent" class="field-error">{{ zh(fieldErrors.workContent) }}</small>
        </label>
        <div v-if="!isOfficeMode" class="field-grid">
          <label class="field select-field" :class="{ 'has-error': fieldErrors.result }">
            <span>{{ zh(isRemoteLikeMode ? '处理结果' : '服务结论') }}<b>*</b></span>
            <select
              ref="serviceResultInput"
              v-model="serviceDraft.result"
              :class="{ invalid: fieldErrors.result }"
              @change="clearFieldError('result')"
            >
              <option v-for="option in resultStatusOptions" :key="option.value" :value="option.value">
                {{ zh(option.label) }}
              </option>
            </select>
            <small v-if="fieldErrors.result" class="field-error">{{ zh(fieldErrors.result) }}</small>
          </label>
        </div>

        <!-- Install devices: multi-entry card for on-site install orders -->
        <div v-if="currentServiceMode === 'onsite' && serviceDraft.serviceType === 'install'" class="install-device-card">
          <div class="card-row">
            <div>
              <span class="field-label">{{ zh('安装设备') }}</span>
              <small class="collaboration-hint">{{ zh('记录本次安装的每台设备信息，可添加多行。') }}</small>
            </div>
            <button type="button" class="btn-add-row" @click="addInstallDevice">＋ {{ zh('添加设备') }}</button>
          </div>
          <div
            v-for="(device, dIdx) in installDeviceList"
            :key="dIdx"
            class="install-device-row"
            :class="{ 'is-first': dIdx === 0 }"
          >
            <div class="install-device-row-head">
              <span class="install-device-row-label">{{ zh('设备') }} {{ dIdx + 1 }}</span>
              <button
                v-if="installDeviceList.length > 1"
                type="button"
                class="btn-remove-row"
                @click="removeInstallDevice(dIdx)"
              >✕</button>
            </div>
            <div class="field-grid">
              <label class="field device-model-autocomplete">
                <span>{{ zh('设备型号 / Model') }}</span>
                <div class="autocomplete-wrapper">
                  <input
                    v-model.trim="device.model"
                    :placeholder="zh('输入设备型号，支持自动补全')"
                    autocomplete="off"
                    @focus="setActiveDeviceIndex(dIdx); onDeviceModelInput()"
                    @input="setActiveDeviceIndex(dIdx); onDeviceModelInput()"
                    @keydown="onDeviceModelKeydown"
                    @blur="hideDeviceModelSuggestions"
                  />
                  <ul v-if="showDeviceModelSuggestions && activeInstallDeviceIndex === dIdx" class="autocomplete-dropdown">
                    <li
                      v-for="(item, index) in deviceModelSuggestions"
                      :key="item.id"
                      :class="{ highlighted: index === selectedSuggestionIndex }"
                      @mousedown.prevent="selectDeviceModel(item)"
                    >
                      <strong>{{ item.officialName }}</strong>
                      <small>{{ item.vendor }} · {{ item.category }}</small>
                    </li>
                  </ul>
                </div>
              </label>
              <label class="field">
                <span>{{ zh('部件号 / PN') }}</span>
                <input v-model.trim="device.pn" :placeholder="zh('输入部件号')" />
              </label>
              <label class="field">
                <span>{{ zh('序列号 / SN') }}</span>
                <input v-model.trim="device.serialNo" :placeholder="zh('多个序列号请用逗号分隔')" />
              </label>
              <label class="field">
                <span>{{ zh('备注 / Remark') }}</span>
                <input v-model.trim="device.remark" :placeholder="zh('补充备注')" />
              </label>
            </div>
          </div>
        </div>
      </article>

      <article class="form-section closeout-time-section section-tone-time">
        <div class="section-heading">
          <div>
            <p class="section-kicker">{{ zh(isRemoteLikeMode ? '05 / 结束服务' : '05 / 完成返程') }}</p>
            <h2>{{ zh(isRemoteLikeMode ? '结束时间' : '完成与返抵') }}</h2>
          </div>
        </div>
        <div class="field-grid">
          <label v-for="field in closeoutTimeFields" :key="field[0]" class="field">
            <span>{{ zh(field[0]) }}<b v-if="field[2]">*</b></span>
            <input
              :ref="(element) => setTimeInputRef(field[0], element)"
              type="datetime-local"
              :class="{ invalid: fieldErrors[timeFieldKey(field[0])] }"
              :value="timeInputValue(field[0])"
              :placeholder="zh(field[1])"
              @click="handleTimeFieldClick(field[0], $event)"
              @input="updateTimeField(field[0], $event.target.value)"
              @change="updateTimeField(field[0], $event.target.value)"
            />
            <small v-if="fieldErrors[timeFieldKey(field[0])]" class="field-error">
              {{ zh(fieldErrors[timeFieldKey(field[0])]) }}
            </small>
          </label>
        </div>
      </article>

      <article v-if="!isRemoteLikeMode" ref="signatureSection" class="form-section signature-section section-tone-signature">
        <div class="signature-copy">
          <div class="section-heading compact">
            <div>
              <p class="section-kicker">{{ zh('06 / 签名确认') }}</p>
              <h2>{{ zh('客户签名') }}</h2>
            </div>
          </div>
          <div class="signature-actions">
            <button class="ghost" type="button" :disabled="loadingLatestSignature" @click="useLatestCustomerSignature">
              <PreviewIcon name="history" />
              {{ zh(loadingLatestSignature ? '读取中' : '使用上次签名') }}
            </button>
            <button class="primary" type="button" @click="openSignaturePanel">
              <PreviewIcon name="rotate" />{{ zh(signatureDrawn ? '重新横屏签名' : '横屏签名') }}
            </button>
            <button class="ghost" type="button" @click="clearSignature"><PreviewIcon name="trash" />{{ zh('清除') }}</button>
          </div>
          <small v-if="fieldErrors.customerSignature" class="field-error">{{ zh(fieldErrors.customerSignature) }}</small>
        </div>
        <div class="signature-summary" :class="{ signed: signatureDrawn }">
          <img v-if="signatureDrawn && customerSignature" :src="customerSignature" :alt="zh('客户签名预览')" />
          <span v-else><PreviewIcon name="pen" />{{ zh('未签名，点击横屏签名开始') }}</span>
        </div>
      </article>
    </section>

    <div v-if="!isRemoteLikeMode && signaturePanelOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('横屏签名')">
      <div class="signature-modal-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('请将手机横向握持') }}</p>
            <h2>{{ zh('客户横屏签名') }}</h2>
          </div>
          <button class="ghost" type="button" @click="cancelSignaturePanel"><PreviewIcon name="close" />{{ zh('取消') }}</button>
        </header>
        <div class="signature-landscape-box" :class="{ signed: signatureDrawn }">
          <canvas
            ref="signatureCanvas"
            class="signature-pad landscape"
            @mousedown="beginSignature"
            @mousemove="drawSignature"
            @mouseup="endSignature"
            @mouseleave="endSignature"
            @touchstart="beginSignature"
            @touchmove="drawSignature"
            @touchend="endSignature"
          />
          <span v-if="!signatureDrawn"><PreviewIcon name="pen" />{{ zh('请客户在此手写签名') }}</span>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" :disabled="!signatureHistory.length" @click="undoSignatureStroke">
            <PreviewIcon name="undo" />{{ zh('回退一步') }}
          </button>
          <button class="ghost" type="button" @click="clearSignature"><PreviewIcon name="trash" />{{ zh('清除') }}</button>
          <button class="primary" type="button" @click="finishSignaturePanel">
            <PreviewIcon name="check" />{{ zh('完成签名') }}
          </button>
        </footer>
      </div>
    </div>

    <button
      class="form-cancel-fab"
      :class="{ dragging: cancelFabDragging }"
      :style="cancelFabPosition.x !== null && cancelFabPosition.y !== null ? { left: `${cancelFabPosition.x}px`, top: `${cancelFabPosition.y}px`, right: 'auto', bottom: 'auto' } : null"
      type="button"
      @pointerdown="startCancelFabDrag"
      @click="requestExitConfirm"
    >
      <PreviewIcon name="close" />
    </button>

    <footer class="submit-bar section-tone-submit">
      <div class="submit-status">
        <p class="section-kicker">{{ zh('FINAL STEP') }}</p>
        <strong>{{ zh('草稿自动保存') }}</strong>
        <span>{{ zh('断网时进入待同步队列，恢复网络后自动补传。') }}</span>
        <div class="submit-status-chips">
          <small :class="{ pending: draftDirty }">{{ zh('自动保存') }} · {{ zh(draftStatusLabel) }}</small>
          <small :class="{ pending: pendingSyncCount }">{{ zh('离线队列') }} · {{ zh(queueStatusLabel) }}</small>
          <small>{{ zh(isOnline ? '在线' : '离线') }}</small>
        </div>
      </div>
      <button class="ghost" type="button" @click="saveDraft"><PreviewIcon name="save" />{{ zh('保存草稿') }}</button>
      <button class="primary" :disabled="saving || loading" @click="submitServiceSheet"><PreviewIcon name="send" />{{ zh(submitButtonLabel) }}</button>
    </footer>
  </main>
</template>

<style scoped>
.device-model-autocomplete .autocomplete-wrapper {
  position: relative;
}

.device-model-autocomplete .autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
  margin: 4px 0 0 0;
  padding: 4px 0;
}

.device-model-autocomplete .autocomplete-dropdown li {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-model-autocomplete .autocomplete-dropdown li:hover {
  background: #f5f6fa;
}

.device-model-autocomplete .autocomplete-dropdown li.highlighted {
  background: #f5f6fa;
}

.device-model-autocomplete .autocomplete-dropdown li strong {
  font-size: 14px;
  color: #1d2939;
}

.device-model-autocomplete .autocomplete-dropdown li small {
  font-size: 12px;
  color: #667085;
}

.install-device-card {
  margin-top: 16px;
  padding: 16px;
  background: #fafbfc;
  border: 1px solid #e2e6ed;
  border-radius: 10px;
}

.install-device-card .card-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.install-device-card .btn-add-row {
  flex-shrink: 0;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #3b82f6;
  background: transparent;
  border: 1px dashed #3b82f6;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.install-device-card .btn-add-row:hover {
  background: #eff6ff;
  color: #2563eb;
}

.install-device-row {
  padding: 12px 0;
  border-top: 1px solid #e2e6ed;
}

.install-device-row.is-first {
  border-top: 0;
  padding-top: 0;
}

.install-device-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.install-device-row-label {
  font-size: 13px;
  font-weight: 600;
  color: #344054;
}

.btn-remove-row {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #98a2b3;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.btn-remove-row:hover {
  color: #f04438;
  background: #fef3f2;
}
</style>
