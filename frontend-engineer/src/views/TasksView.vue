<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'
import {
  clearSelfReportDraft,
  fetchRemoteSelfReportDraft,
  listCreateDraftBuckets,
  removeLocalSelfReportDraft,
  readLocalSelfReportDraft,
  removeScopedDraftPayload,
  writeLocalSelfReportDraft,
} from '../services/self-report-draft'
import { normalizePreviewServiceMode } from '../services/service-mode'

const { zh } = usePreviewI18n()
const router = useRouter()
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const loadMoreError = ref('')
const tasks = ref([])
const localDraftTasks = ref([])
const pendingTaskAction = ref(null)
const currentPage = ref(1)
const totalTasks = ref(0)
const taskCardPageSize = 12
const visibleTaskLimit = ref(taskCardPageSize)
const lastRefreshedAt = ref(0)
const homeRefreshThresholdMs = 60 * 1000
const taskHomeForceRefreshKey = 'oms-platform-engineer:tasks:force-refresh'
const homeEntryMotionKey = 'oms-platform-engineer:home-entry-motion-played'
const homeMotionStaticClass = 'oms-home-motion-static'
const actionToast = ref('')
const homeEntryMotionDone = ref(false)
let actionToastTimer = null
let homeMotionTimer = null

const statusMap = {
  draft: '草稿',
  draft_local: '本机草稿',
  draft_sync: '账号草稿',
  assigned: '已派发',
  in_progress: '填写中',
  pending_confirmation: '待确认',
  submitted: '已提交',
  cancelled: '已作废',
}
const activeTasks = computed(() => tasks.value.filter((task) => task.status !== 'cancelled'))
const allDisplayTasks = computed(() => [...localDraftTasks.value, ...activeTasks.value])
const displayTasks = computed(() => allDisplayTasks.value.slice(0, visibleTaskLimit.value))
const hasHiddenLoadedTasks = computed(() => visibleTaskLimit.value < allDisplayTasks.value.length)
const hasMoreRemoteTasks = computed(() => currentPage.value * taskCardPageSize < totalTasks.value)
const hasMoreTasks = computed(() => hasHiddenLoadedTasks.value || hasMoreRemoteTasks.value)
const serviceModeMap = {
  remote: { label: '远程服务', icon: 'remote-service' },
  onsite: { label: '现场服务', icon: 'onsite-service' },
  office: { label: '内勤工作', icon: 'office-service' },
}

function isInspectionTask(task) {
  return normalizePreviewServiceMode(task) === 'onsite' && String(task?.serviceType || '').trim() === 'inspect'
}

function compactSummaryText(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  return text.length > 24 ? `${text.slice(0, 24)}…` : text
}

const localDraftPrefix = () => {
  const user = getCurrentUser()
  const userId = user?.id || 'anonymous'
  return `oms-platform-engineer-offline-cache:oms-platform:draft:${userId}:service-record:`
}

const accountDraftPrefix = () => 'oms-platform-engineer-offline-cache:oms-platform:draft:account:service-record:'
const legacyDraftPrefix = () => 'oms-platform-engineer-offline-cache:oms-platform:draft:anonymous:service-record:'
const collaborativeAckMarker = '\u2063\u2064\u2063'

function isCurrentScopedDraftStorageKey(key) {
  return String(key || '').includes(':oms-platform:draft:account:service-record:')
}

const currentUserId = computed(() => Number(getCurrentUser()?.id || 0))

function stripCollaborativeAckMarker(value) {
  return String(value || '').split(collaborativeAckMarker).join('')
}

function needsMyWorkEntry(task) {
  const userId = currentUserId.value
  if (!userId || normalizePreviewServiceMode(task) === 'office') return false
  const engineers = Array.isArray(task.engineers) ? task.engineers : []
  if (engineers.length <= 1) return false
  const currentEngineer = engineers.find((engineer) => Number(engineer.id) === userId)
  if (!currentEngineer) return false
  const entries = Array.isArray(task.report?.workEntries) ? task.report.workEntries : []
  const mine = entries.find((entry) => Number(entry.engineerId) === userId)
  if (mine && (String(mine.workContent || '').includes(collaborativeAckMarker) || stripCollaborativeAckMarker(mine.workContent).trim())) {
    return false
  }
  const currentName = String(currentEngineer.realName || currentEngineer.username || '').trim()
  const mergedWorkContent = String(task.report?.workContent || '')
  if (currentName && mergedWorkContent.includes(`${currentName}：`)) return false
  if (currentName && mergedWorkContent.includes(`${currentName}:`)) return false
  return true
}

function parseDraftRoute(key) {
  const match = key.match(/service-record:(new|\d+)$/)
  if (!match) return { route: '/service-sheets/new?resume=1', orderId: null }
  return match[1] === 'new'
    ? { route: '/service-sheets/new?resume=1', orderId: null }
    : { route: `/service-sheets/${match[1]}/edit?resume=1`, orderId: Number(match[1]) }
}

function toDraftTimestamp(value) {
  const time = Date.parse(String(value || ''))
  return Number.isFinite(time) ? time : 0
}

function mergeDraftCards(items) {
  const merged = new Map()
  for (const item of items) {
    const key = item.draftId || item.localRoute || `${item.linkedOrderId || 'new'}:${item.status}`
    const existing = merged.get(key)
    if (!existing || toDraftTimestamp(item.updatedAt) >= toDraftTimestamp(existing.updatedAt)) {
      merged.set(key, item)
    }
  }
  return [...merged.values()].sort((left, right) => toDraftTimestamp(right.updatedAt) - toDraftTimestamp(left.updatedAt))
}

function createDraftRouteByMode(mode, draftId = '') {
  const query = new URLSearchParams({ resume: '1', mode })
  if (draftId) query.set('draftId', draftId)
  return `/service-sheets/new?${query.toString()}`
}

function pushDraftCard(drafts, { keyPrefix, storageKey = '', linkedOrderId = null, remoteDraft = false, updatedAt = '', createdAt = '', payload, mode, draftId = '' }) {
  if (!payload) return
  const customer = payload.selectedCustomer || {}
  const serviceDraft = payload.serviceDraft || {}
  const normalizedDraftId = String(draftId || payload.__draftId || '').trim()
  const submittedOrderId = Number(payload.__submittedOrderId || 0) || null
  const resolvedLinkedOrderId = linkedOrderId || submittedOrderId
  drafts.push({
    id: `${keyPrefix}:${normalizedDraftId || mode}`,
    storageKey,
    localRoute: resolvedLinkedOrderId ? `/service-sheets/${resolvedLinkedOrderId}/edit?resume=1` : createDraftRouteByMode(mode, normalizedDraftId),
    linkedOrderId: resolvedLinkedOrderId,
    remoteDraft,
    draftId: normalizedDraftId,
    draftMode: mode,
    customerName: customer.name || '',
    deviceName: serviceDraft.deviceName || payload.officeDraft?.deviceName || '',
    issueDescription: serviceDraft.issueDescription || payload.remoteDraft?.issueDescription || payload.onsiteDraft?.issueDescription || '',
    serviceMode: payload.formMode || serviceDraft.serviceMode || mode,
    serviceType:
      mode === 'remote'
        ? (payload.remoteDraft?.remoteCategory || serviceDraft.serviceType || '远程排障')
        : mode === 'office'
          ? (payload.officeDraft?.officeCategory || serviceDraft.serviceType || '方案准备')
          : (payload.onsiteDraft?.serviceType || serviceDraft.serviceType || 'repair'),
    status: remoteDraft ? 'draft_sync' : 'draft_local',
    createdAt: createdAt || updatedAt,
    updatedAt,
  })
}

async function loadLocalDraftTasks() {
  const drafts = []

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    const isScopedDraft = isCurrentScopedDraftStorageKey(key)
    const isLegacyDraft = key?.startsWith(localDraftPrefix()) || key?.startsWith(accountDraftPrefix()) || key?.startsWith(legacyDraftPrefix())
    if (!isScopedDraft && !isLegacyDraft) continue
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}')
      const draft = parsed?.data || {}
      const routeInfo = parseDraftRoute(key)
      const bucketItems = routeInfo.orderId
        ? [{ mode: draft.formMode || draft.serviceDraft?.serviceMode || 'onsite', payload: draft }]
        : listCreateDraftBuckets(draft)
      bucketItems.forEach(({ mode, payload }) => {
        pushDraftCard(drafts, {
          keyPrefix: `local-${key}`,
          storageKey: key,
          linkedOrderId: routeInfo.orderId,
          remoteDraft: false,
          updatedAt: parsed?.updatedAt || '',
          createdAt: parsed?.updatedAt || '',
          payload,
          mode,
          draftId: payload?.__draftId || '',
        })
      })
    } catch {
      // Ignore invalid local draft entries so the page stays usable.
    }
  }

  try {
    const remoteCreateDraft = await fetchRemoteSelfReportDraft(null)
    const remoteBuckets = listCreateDraftBuckets(remoteCreateDraft?.payload)
    if (remoteCreateDraft?.payload?.__draftDeleted && !remoteBuckets.length) {
      const localCreateDraft = readLocalSelfReportDraft(null)
      const localUpdatedAt = Date.parse(String(localCreateDraft?.data?.__draftClientUpdatedAt || localCreateDraft?.updatedAt || '')) || 0
      const deletedAt = Date.parse(String(remoteCreateDraft.payload.__draftDeletedAt || remoteCreateDraft.clientUpdatedAt || remoteCreateDraft.updatedAt || '')) || 0
      if (deletedAt >= localUpdatedAt) {
        await clearSelfReportDraft(null)
      }
    } else if (remoteCreateDraft?.payload) {
      remoteBuckets.forEach(({ mode, payload, draftId, createdAt, updatedAt }) => {
        pushDraftCard(drafts, {
          keyPrefix: 'remote-draft:new',
          storageKey: '',
          linkedOrderId: null,
          remoteDraft: true,
          updatedAt: updatedAt || remoteCreateDraft.clientUpdatedAt || remoteCreateDraft.updatedAt || '',
          createdAt: createdAt || remoteCreateDraft.createdAt || remoteCreateDraft.updatedAt || '',
          payload,
          mode,
          draftId,
        })
      })
    }
  } catch {
    // Remote draft lookup is best-effort so the list still works offline.
  }

  localDraftTasks.value = mergeDraftCards(drafts)
}

async function clearResolvedLocalDrafts() {
  if (!tasks.value.length) return

  const existingTaskIds = new Set(tasks.value.map((task) => Number(task.id)).filter(Boolean))
  let removed = false
  const removedEditOrderIds = new Set()
  const removedCreateDrafts = []

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    const isScopedDraft = isCurrentScopedDraftStorageKey(key)
    const isLegacyDraft = key?.startsWith(localDraftPrefix()) || key?.startsWith(accountDraftPrefix()) || key?.startsWith(legacyDraftPrefix())
    if (!isScopedDraft && !isLegacyDraft) continue
    const routeInfo = parseDraftRoute(key)
    if (routeInfo.orderId && existingTaskIds.has(Number(routeInfo.orderId))) {
      localStorage.removeItem(key)
      removed = true
      removedEditOrderIds.add(Number(routeInfo.orderId))
      continue
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}')
      const nextPayload = listCreateDraftBuckets(parsed?.data).reduce((payload, item) => {
        const submittedOrderId = Number(item.payload?.__submittedOrderId || 0)
        if (!submittedOrderId || !existingTaskIds.has(submittedOrderId)) return payload
        removed = true
        removedCreateDrafts.push({ mode: item.mode, draftId: item.draftId })
        return removeScopedDraftPayload(payload, null, item.mode, item.draftId)
      }, parsed?.data || null)

      if (!removed) continue
      if (nextPayload) writeLocalSelfReportDraft(null, nextPayload)
      else removeLocalSelfReportDraft(null)
    } catch {
      // Ignore invalid local draft entries so the page stays usable.
    }
  }

  for (const orderId of removedEditOrderIds) {
    await clearSelfReportDraft(orderId).catch(() => {})
  }
  for (const draft of removedCreateDrafts) {
    await clearSelfReportDraft(null, draft.mode, draft.draftId).catch(() => {})
  }
  if (removed) await loadLocalDraftTasks()
}

function mergeTasks(nextItems) {
  const taskMap = new Map(tasks.value.map((task) => [Number(task.id), task]))
  nextItems.forEach((task) => {
    taskMap.set(Number(task.id), task)
  })
  tasks.value = [...taskMap.values()]
}

async function load({ append = false } = {}) {
  return loadWithMode({ append })
}

async function loadWithMode({ append = false, silent = false, expandVisible = true } = {}) {
  if (append) {
    if (loadingMore.value || !hasMoreRemoteTasks.value) return false
    loadingMore.value = true
    loadMoreError.value = ''
  } else if (!silent) {
    loading.value = true
    error.value = ''
    loadMoreError.value = ''
    currentPage.value = 1
    totalTasks.value = 0
    visibleTaskLimit.value = taskCardPageSize
  } else {
    error.value = ''
    loadMoreError.value = ''
  }

  try {
    const page = append ? currentPage.value + 1 : 1
    const previousVisibleLimit = visibleTaskLimit.value
    const data = await api.get(`/service-orders?mine=1&page=${page}&pageSize=${taskCardPageSize}&sortBy=createdAt&sortDir=desc`)
    const nextItems = data.items || []
    totalTasks.value = Number(data.total || nextItems.length)
    currentPage.value = Number(data.page || page)
    if (append) {
      mergeTasks(nextItems)
      if (expandVisible) {
        visibleTaskLimit.value = previousVisibleLimit + taskCardPageSize
      }
    } else {
      tasks.value = nextItems
    }
    await clearResolvedLocalDrafts()
    if (!append) {
      await fillInitialTaskBatch()
    }
    lastRefreshedAt.value = Date.now()
    return true
  } catch (err) {
    if (append) {
      loadMoreError.value = err.message
    } else {
      error.value = err.message
    }
    return false
  } finally {
    if (!append) loading.value = false
    loadingMore.value = false
  }
}

async function fillInitialTaskBatch() {
  let loadedPages = 0
  while (allDisplayTasks.value.length < taskCardPageSize && hasMoreRemoteTasks.value && loadedPages < 8) {
    loadedPages += 1
    const loaded = await loadWithMode({ append: true, expandVisible: false })
    if (!loaded) break
  }
}

function loadMoreTasks() {
  if (loading.value || loadingMore.value) return
  if (hasHiddenLoadedTasks.value) {
    visibleTaskLimit.value += taskCardPageSize
    return
  }
  if (hasMoreRemoteTasks.value) {
    load({ append: true })
  }
}

function handleScrollLoadMore() {
  if (!hasMoreTasks.value || loading.value || loadingMore.value) return
  const distanceToBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
  if (distanceToBottom < 420) loadMoreTasks()
}

function formatCardTime(value) {
  return String(value || '').replace('T', ' ').slice(5, 16) || '-'
}

function taskDateMeta(task) {
  const status = String(task.status || '').trim()
  if (isDraftTask(task)) {
    return { label: '更新', value: formatCardTime(task.updatedAt || task.clientUpdatedAt || task.createdAt) }
  }
  if (status === 'submitted') {
    return { label: '提交', value: formatCardTime(task.submittedAt || task.updatedAt || task.report?.actualStartAt || task.serviceAt || task.createdAt) }
  }
  if (task.plannedAt || task.scheduledAt || task.serviceAt) {
    return { label: '预约', value: formatCardTime(task.plannedAt || task.scheduledAt || task.serviceAt) }
  }
  if (task.report?.actualStartAt) {
    return { label: '服务', value: formatCardTime(task.report.actualStartAt) }
  }
  return { label: '创建', value: formatCardTime(task.createdAt || task.updatedAt) }
}

function taskDeviceContext(task) {
  return compactSummaryText(task.deviceName || task.productName || '')
}

function taskStatusLabel(task) {
  if (isInspectionTask(task)) {
    const inspectionStatusMap = { draft: '待巡检', assigned: '待巡检', in_progress: '巡检中', submitted: '巡检已提交', cancelled: '已作废' }
    return inspectionStatusMap[task.status] || statusMap[task.status] || task.status || '待巡检'
  }
  return statusMap[task.status] || task.status || '待处理'
}

// 状态语义色档：用于卡片状态徽章，回退后的 06-16 基础 .task-card strong 无语义区分，这里补回轻量语义色。
function taskStatusTone(task) {
  const status = String(task.status || task.workflowStatus || '').trim()
  if (status === 'cancelled') return 'danger'
  if (status === 'submitted') return 'success'
  if (status === 'pending_confirmation' || status === 'assigned') return 'warning'
  if (status === 'in_progress') return 'progress'
  if (status === 'draft' || status === 'draft_local' || status === 'draft_sync') return 'draft'
  if (isInspectionTask(task)) return 'warning'
  return 'info'
}

function serviceModeBadge(task) {
  return serviceModeMap[normalizePreviewServiceMode(task)] || serviceModeMap.onsite
}

function serviceSummary(task) {
  // 类别（如“巡检/维修”）已由左上角服务模式胶囊体现，摘要里只保留设备/备注等实质信息，避免压缩信息空间
  const summary = compactSummaryText(task.deviceName || task.internalNote || task.productName || task.issueDescription || '')
  if (summary) return summary
  if (normalizePreviewServiceMode(task) === 'office') return '未填写工作内容'
  return '未填写服务需求'
}

function inspectionContext(task) {
  if (!isInspectionTask(task)) return ''
  const device = taskDeviceContext(task)
  return device ? `巡检：${device}` : '巡检：待补充设备信息'
}

function submittedResultHint(task) {
  const raw = String(task.report?.result || task.result || '').trim().toLowerCase()
  if (['resolved', 'done', 'completed', 'complete', 'finished', 'success'].includes(raw)) return '已完成'
  if (['unresolved', 'not_resolved', 'incomplete', 'failed'].includes(raw)) return '未完成'
  if (['follow_up_required', 'pending', 'processing', 'in_progress', 'follow_up'].includes(raw)) return '待跟进'
  if (task.report?.customerConfirmName || task.contactName) return '客户已确认'
  return ''
}

function taskCardHint(task) {
  if (isDraftTask(task)) return '继续填写服务表'
  if (String(task.status || '') === 'submitted') return submittedResultHint(task)
  return ''
}

function showDesktopDangerAction(task) {
  return String(task.status || '') !== 'submitted'
}

function taskCustomerTitle(task) {
  const name = String(task.customerName || '').trim()
  if (name) return compactCustomerTitle(name)
  if (normalizePreviewServiceMode(task) === 'office') return '内勤工作'
  return '待补充客户'
}

function compactCustomerTitle(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  const withoutBrackets = raw
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
  const withoutSuffix = withoutBrackets
    .replace(/(股份有限公司|有限责任公司|有限公司|集团有限公司|集团公司|集团|公司)$/u, '')
    .trim()
  const withoutRegion = withoutSuffix
    .replace(/^(中国|江苏省|浙江省|上海市|北京市|苏州市|苏州|上海|北京)/u, '')
    .trim()
  const candidate = withoutRegion || withoutSuffix || withoutBrackets
  if (!candidate) return raw
  if (candidate.length <= 10) return candidate
  return candidate.slice(0, 10)
}

function refreshView({ silent = false } = {}) {
  loadLocalDraftTasks().catch(() => {})
  loadWithMode({ silent })
}

function consumeForcedRefreshFlag() {
  try {
    const value = Number(sessionStorage.getItem(taskHomeForceRefreshKey) || 0)
    if (!value) return false
    sessionStorage.removeItem(taskHomeForceRefreshKey)
    return true
  } catch {
    return false
  }
}

function hasPlayedHomeEntryMotion() {
  try {
    return sessionStorage.getItem(homeEntryMotionKey) === '1'
  } catch {
    return false
  }
}

function markHomeEntryMotionPlayed() {
  try {
    sessionStorage.setItem(homeEntryMotionKey, '1')
  } catch {
    // Ignore storage failures; the visual fallback remains a normal one-time entry animation.
  }
}

function refreshViewOnFocus() {
  if (Date.now() - lastRefreshedAt.value < homeRefreshThresholdMs) return
  refreshView({ silent: true })
}

function isDraftTask(task) {
  return ['draft_local', 'draft_sync', 'draft'].includes(task.status)
}

function taskEditRoute(task) {
  if (task.localRoute) return task.localRoute
  if (!task.id) return '/service-sheets/new'
  return `/service-sheets/${task.id}/edit${isDraftTask(task) ? '?resume=1' : ''}`
}

function taskPreviewRoute(task) {
  const linkedOrderId = Number(task.linkedOrderId || 0)
  if (linkedOrderId) return `/tasks/${linkedOrderId}`
  const taskId = Number(task.id || 0)
  if (taskId) return `/tasks/${task.id}`
  return taskEditRoute(task)
}

function showActionToast(message) {
  actionToast.value = message
  window.clearTimeout(actionToastTimer)
  actionToastTimer = window.setTimeout(() => {
    actionToast.value = ''
  }, 2600)
}

function openDeleteDraft(task) {
  pendingTaskAction.value = { type: 'delete_draft', task }
}

function openCancelRecord(task) {
  pendingTaskAction.value = { type: 'cancel_record', task }
}

function closeTaskAction() {
  pendingTaskAction.value = null
}

function openTask(task) {
  router.push(taskPreviewRoute(task))
}

function openEditTask(task) {
  router.push(taskEditRoute(task))
}

// ---- 卡片左滑露出修改/销毁操作（仅触屏；桌面端用 .task-desktop-action 按钮）----
// transform 完全由 JS 内联驱动，避免依赖响应式 class 的异步更新时序导致展开态闪烁/残留
const swipeOpenId = ref(null)
let swipeState = null
const SWIPE_ACTION_WIDTH = 168 // 露出的操作区宽度，需与 CSS --swipe-action-width 一致

function applySwipeTransform(body, open) {
  if (!body) return
  body.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)'
  body.style.transform = open ? `translateX(${-SWIPE_ACTION_WIDTH}px)` : 'translateX(0)'
}

function closeAllSwipe(exceptId = null) {
  if (swipeOpenId.value && swipeOpenId.value !== exceptId) {
    const prev = document.querySelector(`.task-swipe-body[data-task-id="${swipeOpenId.value}"]`)
    applySwipeTransform(prev, false)
  }
}

function onSwipePointerDown(task, event) {
  // 仅对主指针（触屏/笔）启用滑动；鼠标点击交由 click 处理
  if (event.pointerType === 'mouse') return
  swipeState = {
    taskId: task.id,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    openAtStart: swipeOpenId.value === task.id,
    dx: 0,
  }
}

function onSwipePointerMove(event) {
  if (!swipeState) return
  const dx = event.clientX - swipeState.startX
  const dy = event.clientY - swipeState.startY
  // 水平位移明显大于垂直，才判定为左滑意图，避免吃掉纵向滚动
  if (!swipeState.moved) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    if (Math.abs(dy) > Math.abs(dx)) {
      swipeState = null
      return
    }
    swipeState.moved = true
  }
  swipeState.dx = dx
  let translate = dx
  if (swipeState.openAtStart) translate = -SWIPE_ACTION_WIDTH + dx
  // 限制在 [-SWIPE_ACTION_WIDTH, 0]
  translate = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, translate))
  const body = event.currentTarget
  body.style.transition = 'none'
  body.style.transform = `translateX(${translate}px)`
}

function onSwipePointerUp(event) {
  if (!swipeState) return
  const body = event.currentTarget
  const moved = swipeState.moved
  const dx = swipeState.dx
  const wasOpen = swipeState.openAtStart
  const taskId = swipeState.taskId
  swipeState = null
  if (!moved) return
  const threshold = SWIPE_ACTION_WIDTH / 2
  let shouldOpen
  if (wasOpen) shouldOpen = !(dx > threshold)
  else shouldOpen = dx < -threshold
  // 先收起其它已展开的卡片
  closeAllSwipe(taskId)
  swipeOpenId.value = shouldOpen ? taskId : null
  // 内联设到最终位，带过渡
  applySwipeTransform(body, shouldOpen)
  // 标记本次为滑动，阻止后续 click 跳转
  body.dataset.swiped = '1'
  window.setTimeout(() => { delete body.dataset.swiped }, 0)
}

function onTaskCardClick(task, event) {
  // 发生过滑动的 pointerup 之后会触发 click，这里拦掉
  if (event.currentTarget?.dataset?.swiped === '1') {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  // 点击时若本卡处于展开态，先收起，不跳转
  if (swipeOpenId.value === task.id) {
    swipeOpenId.value = null
    applySwipeTransform(event.currentTarget, false)
    return
  }
  // 其它卡片展开则收起，不跳转
  if (swipeOpenId.value) {
    closeAllSwipe()
    swipeOpenId.value = null
    return
  }
  openTask(task)
}

function closeSwipeFromAction(event) {
  swipeOpenId.value = null
  const body = event.currentTarget?.closest?.('.task-card')?.querySelector?.('.task-swipe-body')
  applySwipeTransform(body, false)
}

function onSwipeEditClick(task, event) {
  closeSwipeFromAction(event)
  openEditTask(task)
}

function onSwipeActionClick(task, event) {
  closeSwipeFromAction(event)
  if (['draft_local', 'draft_sync'].includes(task.status)) openDeleteDraft(task)
  else openCancelRecord(task)
}

function onTaskCardKeydown(task, event) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openTask(task)
}

const taskActionDialogLabel = computed(() => {
  if (pendingTaskAction.value?.type === 'cancel_record') return '作废记录'
  return '删除草稿'
})

const taskActionTitle = computed(() => {
  if (pendingTaskAction.value?.type === 'cancel_record') return '确认作废记录？'
  return '确认删除草稿？'
})

const taskActionLead = computed(() => {
  if (pendingTaskAction.value?.type === 'cancel_record') return '作废后这条服务记录将不再参与正常流转'
  return '这份本机草稿删除后将无法恢复'
})

const taskActionBody = computed(() => {
  if (pendingTaskAction.value?.type === 'cancel_record') {
    return '确认后这条记录会标记为已作废，并从正常服务记录列表中移除。'
  }
  return '删除后，这张“继续填写”的本机草稿卡片会从服务记录列表中移除。'
})

const taskActionConfirmLabel = computed(() => {
  if (pendingTaskAction.value?.type === 'cancel_record') return '确认作废'
  return '确认删除'
})

const taskActionCancelLabel = computed(() => {
  if (pendingTaskAction.value?.type === 'cancel_record') return '继续保留'
  return '继续保留'
})

async function confirmTaskAction() {
  const action = pendingTaskAction.value
  if (!action) return
  if (action.type === 'delete_draft') {
    if (action.task.storageKey) {
      if (action.task.linkedOrderId) {
        localStorage.removeItem(action.task.storageKey)
      }
    }
    await clearSelfReportDraft(
      action.task.linkedOrderId || null,
      action.task.draftMode || action.task.serviceMode || 'onsite',
      action.task.draftId || '',
    )
    pendingTaskAction.value = null
    loadLocalDraftTasks().catch(() => {})
    showActionToast('已删除草稿')
    return
  }
  await api.post(`/service-orders/${action.task.id}/cancel`, {})
  pendingTaskAction.value = null
  tasks.value = tasks.value.filter((task) => Number(task.id) !== Number(action.task.id))
  totalTasks.value = Math.max(0, totalTasks.value - 1)
  showActionToast('已作废记录')
  refreshView({ silent: true })
}

onMounted(() => {
  homeEntryMotionDone.value = hasPlayedHomeEntryMotion()
  document.body.classList.toggle(homeMotionStaticClass, homeEntryMotionDone.value)
  if (!homeEntryMotionDone.value) {
    markHomeEntryMotionPlayed()
    homeMotionTimer = window.setTimeout(() => {
      homeEntryMotionDone.value = true
      document.body.classList.add(homeMotionStaticClass)
    }, 1700)
  }

  if (consumeForcedRefreshFlag()) {
    refreshView({ silent: true })
  } else {
    refreshView()
  }
  window.addEventListener('focus', refreshViewOnFocus)
  window.addEventListener('scroll', handleScrollLoadMore, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshViewOnFocus)
  window.removeEventListener('scroll', handleScrollLoadMore)
  window.clearTimeout(actionToastTimer)
  window.clearTimeout(homeMotionTimer)
  document.body.classList.remove(homeMotionStaticClass)
})
</script>

<template>
  <main class="engineer-shell" :class="{ 'home-entry-motion-done': homeEntryMotionDone }">
    <header class="topbar">
      <div>
        <BrandEyebrow text="工程师工作台 / 服务记录" title="服务记录" />
      </div>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="load">{{ zh('重试') }}</button></p>
    <p v-else-if="loading && !displayTasks.length" class="muted">{{ zh('正在载入服务记录...') }}</p>

    <div v-if="actionToast" class="floating-toast">{{ zh(actionToast) }}</div>

    <section class="task-board">
      <article
        v-for="(task, index) in displayTasks"
        :key="task.id"
        class="form-section task-card"
        :class="{
          'task-card-local-draft': ['draft_local', 'draft_sync'].includes(task.status),
          'task-card-inspection': isInspectionTask(task),
          'swipe-open': swipeOpenId === task.id,
        }"
        :style="{ '--stagger': `${Math.min(index, 12) * 64}ms` }"
      >
        <!-- 滑动露出的操作区（左滑出现） -->
        <div class="task-swipe-actions">
          <button
            type="button"
            class="task-swipe-action task-swipe-action-edit"
            :aria-label="zh('修改')"
            :title="zh('修改')"
            @click.stop="onSwipeEditClick(task, $event)"
          >
            <PreviewIcon name="edit" />
            <span>{{ zh('修改') }}</span>
          </button>
          <button
            type="button"
            class="task-swipe-action task-swipe-action-danger"
            :aria-label="zh(['draft_local', 'draft_sync'].includes(task.status) ? '删除草稿' : '作废记录')"
            :title="zh(['draft_local', 'draft_sync'].includes(task.status) ? '删除草稿' : '作废记录')"
            @click.stop="onSwipeActionClick(task, $event)"
          >
            <PreviewIcon name="trash" />
            <span>{{ zh(['draft_local', 'draft_sync'].includes(task.status) ? '删除草稿' : '作废记录') }}</span>
          </button>
        </div>
        <!-- 可滑动的内容层：整卡点击进预览 -->
        <div
          class="task-swipe-body"
          :data-task-id="task.id"
          role="link"
          tabindex="0"
          @click="onTaskCardClick(task, $event)"
          @keydown="onTaskCardKeydown(task, $event)"
          @pointerdown="onSwipePointerDown(task, $event)"
          @pointermove="onSwipePointerMove($event)"
          @pointerup="onSwipePointerUp($event)"
          @pointercancel="onSwipePointerUp($event)"
        >
          <div class="task-side-badges">
            <span class="service-mode-badge" :class="normalizePreviewServiceMode(task)">
              <PreviewIcon :name="serviceModeBadge(task).icon" />{{ zh(serviceModeBadge(task).label) }}
            </span>
            <strong :class="needsMyWorkEntry(task) ? 'new-work-badge' : ['task-status-badge', `task-status-${taskStatusTone(task)}`]">
              <template v-if="needsMyWorkEntry(task)"><i aria-hidden="true">!</i>{{ zh('New') }}</template>
              <template v-else>{{ zh(taskStatusLabel(task)) }}</template>
            </strong>
          </div>
          <div class="task-content">
            <div class="task-card-head">
              <span class="mono task-time">
                <small>{{ zh(taskDateMeta(task).label) }}</small>
                {{ taskDateMeta(task).value }}
              </span>
            </div>
            <div class="task-card-main">
              <h2 :title="zh(task.customerName || taskCustomerTitle(task))">{{ zh(taskCustomerTitle(task)) }}</h2>
              <p>{{ zh(serviceSummary(task)) }}</p>
              <p v-if="isInspectionTask(task)" class="task-inspection-context">{{ zh(inspectionContext(task)) }}</p>
              <p v-if="taskCardHint(task)" class="task-card-hint">{{ zh(taskCardHint(task)) }}</p>
            </div>
          </div>
          <!-- 桌面端（无触屏）保留的非滑动操作入口 -->
          <div class="task-desktop-actions">
            <button
              type="button"
              class="task-desktop-action task-desktop-action-edit"
              :aria-label="zh('修改')"
              :title="zh('修改')"
              @click.stop="openEditTask(task)"
            >
              <PreviewIcon name="edit" />
            </button>
            <button
              v-if="showDesktopDangerAction(task)"
              type="button"
              class="task-desktop-action task-desktop-action-danger"
              :aria-label="zh(['draft_local', 'draft_sync'].includes(task.status) ? '删除草稿' : '作废记录')"
              :title="zh(['draft_local', 'draft_sync'].includes(task.status) ? '删除草稿' : '作废记录')"
              @click.stop="['draft_local', 'draft_sync'].includes(task.status) ? openDeleteDraft(task) : openCancelRecord(task)"
            >
              <PreviewIcon name="trash" />
            </button>
          </div>
        </div>
      </article>
      <p v-if="!allDisplayTasks.length && !loading" class="empty-state">{{ zh('暂无服务记录') }}</p>
    </section>

    <footer v-if="allDisplayTasks.length" class="task-load-state">
      <p v-if="loadingMore">{{ zh('正在加载更多服务记录...') }}</p>
      <p v-else-if="loadMoreError">
        {{ zh(loadMoreError) }}
        <button type="button" @click="loadMoreTasks">{{ zh('重试') }}</button>
      </p>
      <p v-else-if="hasMoreTasks">{{ zh('继续下拉加载更多') }}</p>
      <p v-else>{{ zh('已加载全部服务记录') }}</p>
    </footer>

    <div v-if="pendingTaskAction" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(taskActionDialogLabel)">
      <div class="signature-modal-shell exit-confirm-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh(taskActionLead) }}</p>
            <h2>{{ zh(taskActionTitle) }}</h2>
          </div>
        </header>
        <div class="exit-confirm-body">
          <p>{{ zh(taskActionBody) }}</p>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeTaskAction"><PreviewIcon name="edit" />{{ zh(taskActionCancelLabel) }}</button>
          <button class="primary danger-action" type="button" @click="confirmTaskAction">
            <PreviewIcon name="trash" />{{ zh(taskActionConfirmLabel) }}
          </button>
        </footer>
      </div>
    </div>
  </main>
</template>
