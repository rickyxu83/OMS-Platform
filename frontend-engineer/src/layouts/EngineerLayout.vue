<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { unifiedLoginUrl } from '../config/app'
import { api } from '../services/api'
import { clearSession, currentUser } from '../services/auth'
import { isOnline, probeNetwork, startNetworkWatch, stopNetworkWatch } from '../services/network'
import {
  clearSelfReportDraft,
  listCreateDraftBuckets,
  normalizeDraftItemId,
  normalizeDraftMode,
  readLocalSelfReportDraft,
} from '../services/self-report-draft'
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../services/safe-storage'
import { renderMarkdown } from '../services/markdown'
import { pendingSyncCount, refreshPendingSyncQueue, syncPendingSelfReports } from '../services/sync-queue'

const { language, setLanguage, zh } = usePreviewI18n()
const route = useRoute()
const router = useRouter()
const displayName = computed(() => currentUser.value?.realName || currentUser.value?.username || '工程师')
const avatarInitial = computed(() => String(displayName.value || '工').trim().slice(0, 1).toUpperCase())
const avatarUrl = computed(() => currentUser.value?.avatarUrl || '')
const accountOpen = ref(false)
const exitConfirmOpen = ref(false)
const feedbackOpen = ref(false)
const feedbackType = ref('problem')
const feedbackContent = ref('')
const feedbackSubmitting = ref(false)
const feedbackMessage = ref('')
const announcements = ref([])
const announcementOpen = ref(false)
const announcementSubmitting = ref(false)
const formDraftPending = ref(false)
const createFabPosition = ref({ x: null, y: null })
const createFabDragging = ref(false)
const createModePickerOpen = ref(false)
const isFormPage = computed(() => ['service-sheet-new', 'service-sheet-edit'].includes(String(route.name || '')))
const showHomeQuickAction = computed(() => route.name !== 'login')
const showGlobalCreateAction = computed(() => !isFormPage.value && route.name !== 'service-sheet-edit')
const isEditingExistingSheet = computed(() => route.name === 'service-sheet-edit')
const controlsAnchorClass = computed(() => ({
  'service-sheet-controls-anchor': isFormPage.value,
}))
const exitConfirmMeta = computed(() => {
  if (isEditingExistingSheet.value) {
    return {
      title: '退出编辑？',
      body: '未提交修改不会保留。',
      actionLabel: '退出编辑',
      actionIcon: 'close',
    }
  }

  return {
    title: '取消填写？',
    body: '当前草稿不会保留。',
    actionLabel: '放弃并删除草稿',
    actionIcon: 'trash',
  }
})
const sharedFabStorageKey = 'oms-platform:service-record:create-fab-position'
let createFabMoved = false
let createFabStartPointer = { x: 0, y: 0 }
let createFabStartPosition = { x: 0, y: 0 }
let createFabPointerType = ''
let createFabLongPressTimer = null
let createFabLongPressOpened = false
const networkLabel = computed(() => {
  if (isOnline.value) return pendingSyncCount.value ? `在线 · 待同步 ${pendingSyncCount.value}` : '在线'
  return pendingSyncCount.value ? `离线 · 待同步 ${pendingSyncCount.value}` : '离线'
})

const navItems = [
  { label: '服务记录', icon: 'list', to: '/', names: ['tasks', 'task-detail', 'task-share'] },
  {
    label: '客户资产',
    icon: 'assets',
    to: '/assets',
    names: ['assets', 'asset-customers', 'asset-customer-detail', 'asset-devices', 'asset-device-detail', 'asset-maintenance-parties', 'asset-maintenance-party-detail'],
  },
  { label: '新增服务记录', icon: 'new', to: '/service-sheets/new', names: ['service-sheet-new', 'service-sheet-edit'] },
  { label: '月报', icon: 'calendar', to: '/timesheet', names: ['timesheet', 'timesheets'] },
  { label: '我的', icon: 'user', to: '/profile', names: ['profile'] },
]

const quickActions = computed(() => [
  navItems[0],
  navItems[3],
  navItems[1],
  navItems[4],
])
const createModeOptions = [
  { mode: 'onsite', label: '现场服务', icon: 'onsite-service', className: 'onsite' },
  { mode: 'remote', label: '远程服务', icon: 'remote-service', className: 'remote' },
  { mode: 'office', label: '内勤工作', icon: 'office-service', className: 'office' },
]
const currentAnnouncement = computed(() => announcements.value[0] || null)
const currentAnnouncementHtml = computed(() => renderMarkdown(currentAnnouncement.value?.contentMarkdown || ''))
const currentAnnouncementIcon = computed(() => {
  if (currentAnnouncement.value?.kind === 'warning') return '⚠️'
  if (currentAnnouncement.value?.kind === 'success') return '✅'
  return '📣'
})
const createModePanelStyle = computed(() => {
  if (createFabPosition.value.x !== null && createFabPosition.value.y !== null) {
    return { left: `${createFabPosition.value.x}px`, top: `${createFabPosition.value.y}px`, right: 'auto', bottom: 'auto' }
  }
  const fallback = defaultFabPosition()
  return fallback ? { left: `${fallback.x}px`, top: `${fallback.y}px`, right: 'auto', bottom: 'auto' } : null
})

function isNavActive(item) {
  return item.names.includes(route.name)
}

function redirectToLogin() {
  window.setTimeout(() => {
    window.location.replace(unifiedLoginUrl('/'))
  }, 0)
}

function logout() {
  accountOpen.value = false
  createModePickerOpen.value = false
  feedbackOpen.value = false
  exitConfirmOpen.value = false
  announcementOpen.value = false
  api.post('/auth/logout').catch(() => {})
  clearSession()
  redirectToLogin()
}

function goHome() {
  accountOpen.value = false
  router.push('/')
}

function currentDraftOrderId() {
  const id = Number(route.params.id || 0)
  return id > 0 ? id : null
}

function currentDraftMode() {
  return normalizeDraftMode(route.query.mode)
}

function currentDraftId() {
  return normalizeDraftItemId(route.query.draftId)
}

function currentLatestLocalDraftId() {
  if (currentDraftOrderId()) return ''
  const localDraft = readLocalSelfReportDraft(null)
  const mode = currentDraftMode()
  return listCreateDraftBuckets(localDraft?.data).find((item) => item.mode === mode)?.draftId || ''
}

function hasCurrentLocalDraft() {
  const orderId = currentDraftOrderId()
  const localDraft = readLocalSelfReportDraft(orderId)
  if (!localDraft?.data) return false
  if (orderId) return true

  const draftId = currentDraftId()
  const buckets = listCreateDraftBuckets(localDraft.data)
  if (draftId) return buckets.some((item) => item.draftId === draftId)
  return buckets.some((item) => item.mode === currentDraftMode())
}

function fabSize() {
  return window.innerWidth <= 680 ? 56 : 60
}

function fabBottomOffset() {
  return 24
}

function defaultFabPosition() {
  if (typeof window === 'undefined') return null
  return clampFabPosition(
    window.innerWidth - fabSize() - 24,
    window.innerHeight - fabSize() - fabBottomOffset(),
  )
}

function ensureCreateFabPosition() {
  if (createFabPosition.value.x !== null && createFabPosition.value.y !== null) return
  const fallback = defaultFabPosition()
  if (fallback) createFabPosition.value = fallback
}

function clampFabPosition(x, y) {
  const size = fabSize()
  const margin = 12
  const minX = margin
  const maxX = Math.max(minX, window.innerWidth - size - margin)
  const minY = margin
  const maxY = Math.max(minY, window.innerHeight - size - fabBottomOffset())
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  }
}

function fabViewportBounds() {
  const size = fabSize()
  const margin = 12
  const minX = margin
  const maxX = Math.max(minX, window.innerWidth - size - margin)
  const minY = margin
  const maxY = Math.max(minY, window.innerHeight - size - fabBottomOffset())
  return { minX, maxX, minY, maxY }
}

function fabDescriptorFromPosition(position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null
  const { minX, maxX, minY, maxY } = fabViewportBounds()
  const anchorX = position.x <= (minX + maxX) / 2 ? 'left' : 'right'
  const anchorY = position.y <= (minY + maxY) / 2 ? 'top' : 'bottom'
  return {
    anchorX,
    anchorY,
    offsetX: anchorX === 'left' ? position.x - minX : maxX - position.x,
    offsetY: anchorY === 'top' ? position.y - minY : maxY - position.y,
  }
}

function fabPositionFromDescriptor(descriptor) {
  if (!descriptor) return null
  const { minX, maxX, minY, maxY } = fabViewportBounds()
  const x = descriptor.anchorX === 'right'
    ? maxX - Number(descriptor.offsetX || 0)
    : minX + Number(descriptor.offsetX || 0)
  const y = descriptor.anchorY === 'bottom'
    ? maxY - Number(descriptor.offsetY || 0)
    : minY + Number(descriptor.offsetY || 0)
  return clampFabPosition(x, y)
}

function restoreCreateFabPosition() {
  try {
    const raw = safeStorageGet(localStorage, sharedFabStorageKey, '')
    if (!raw) {
      ensureCreateFabPosition()
      return
    }
    const parsed = JSON.parse(raw)
    if (parsed?.anchorX && parsed?.anchorY) {
      const restored = fabPositionFromDescriptor(parsed)
      if (restored) {
        createFabPosition.value = restored
        return
      }
    }
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) {
      ensureCreateFabPosition()
      return
    }
    createFabPosition.value = clampFabPosition(parsed.x, parsed.y)
  } catch {
    safeStorageRemove(localStorage, sharedFabStorageKey)
    ensureCreateFabPosition()
  }
}

function persistCreateFabPosition() {
  if (!Number.isFinite(createFabPosition.value.x) || !Number.isFinite(createFabPosition.value.y)) return
  const descriptor = fabDescriptorFromPosition(createFabPosition.value)
  safeStorageSet(localStorage, sharedFabStorageKey, JSON.stringify(descriptor || createFabPosition.value))
}

function lockHorizontalScroll() {
  document.documentElement.scrollLeft = 0
  document.body.scrollLeft = 0
  if (window.scrollX) window.scrollTo(0, window.scrollY)
}

function handleCreateFabPointerMove(event) {
  if (!createFabDragging.value) return
  event.preventDefault()
  lockHorizontalScroll()
  const deltaX = event.clientX - createFabStartPointer.x
  const deltaY = event.clientY - createFabStartPointer.y
  if (!createFabMoved && Math.hypot(deltaX, deltaY) > 6) {
    createFabMoved = true
    window.clearTimeout(createFabLongPressTimer)
  }
  createFabPosition.value = clampFabPosition(
    createFabStartPosition.x + deltaX,
    createFabStartPosition.y + deltaY,
  )
}

function stopCreateFabDrag() {
  if (!createFabDragging.value) return
  createFabDragging.value = false
  window.clearTimeout(createFabLongPressTimer)
  persistCreateFabPosition()
  lockHorizontalScroll()
  window.removeEventListener('pointermove', handleCreateFabPointerMove)
  window.removeEventListener('pointerup', stopCreateFabDrag)
  window.removeEventListener('pointercancel', stopCreateFabDrag)
}

function startCreateFabDrag(event) {
  if (event.button !== undefined && event.button !== 0) return
  createFabDragging.value = true
  createFabMoved = false
  createFabLongPressOpened = false
  createFabPointerType = event.pointerType || 'mouse'
  event.preventDefault()
  createFabStartPointer = { x: event.clientX, y: event.clientY }
  const current = createFabPosition.value.x === null || createFabPosition.value.y === null
    ? defaultFabPosition()
    : createFabPosition.value
  if (!current) return
  createFabStartPosition = { ...current }
  createFabPosition.value = current
  if (createFabPointerType === 'touch' || createFabPointerType === 'pen') {
    window.clearTimeout(createFabLongPressTimer)
    createFabLongPressTimer = window.setTimeout(() => {
      if (!createFabDragging.value || createFabMoved) return
      createFabLongPressOpened = true
      createModePickerOpen.value = true
    }, 520)
  }
  window.addEventListener('pointermove', handleCreateFabPointerMove)
  window.addEventListener('pointerup', stopCreateFabDrag)
  window.addEventListener('pointercancel', stopCreateFabDrag)
}

function syncCreateFabPositionToViewport() {
  if (createFabPosition.value.x === null || createFabPosition.value.y === null) return
  restoreCreateFabPosition()
}

restoreCreateFabPosition()

function openCreateSheet() {
  if (createFabMoved) {
    window.setTimeout(() => {
      createFabMoved = false
    }, 0)
    return
  }
  if (createFabLongPressOpened) {
    createFabLongPressOpened = false
    return
  }
  if (createFabPointerType === 'touch' || createFabPointerType === 'pen') {
    if (createModePickerOpen.value) {
      createModePickerOpen.value = false
      return
    }
    selectCreateMode('onsite')
    return
  }
  createModePickerOpen.value = !createModePickerOpen.value
}

function selectCreateMode(mode) {
  createModePickerOpen.value = false
  router.push(`/service-sheets/new?mode=${mode}`)
}

function openExitConfirm() {
  if (!hasCurrentLocalDraft() && !formDraftPending.value) {
    router.push('/')
    return
  }
  exitConfirmOpen.value = true
}

function closeExitConfirm() {
  exitConfirmOpen.value = false
}

function openFeedback() {
  accountOpen.value = false
  feedbackMessage.value = ''
  feedbackOpen.value = true
}

function closeFeedback() {
  if (feedbackSubmitting.value) return
  feedbackOpen.value = false
  feedbackMessage.value = ''
}

async function submitFeedback() {
  const content = feedbackContent.value.trim()
  if (!content) {
    feedbackMessage.value = '请填写反馈内容'
    return
  }

  feedbackSubmitting.value = true
  feedbackMessage.value = ''
  try {
    await api.post('/feedback', {
      type: feedbackType.value,
      content,
      pagePath: route.fullPath,
    })
    feedbackContent.value = ''
    feedbackType.value = 'problem'
    feedbackMessage.value = '反馈已提交'
    window.setTimeout(() => {
      if (feedbackMessage.value === '反馈已提交') closeFeedback()
    }, 700)
  } catch (error) {
    feedbackMessage.value = error instanceof Error ? error.message : '提交失败'
  } finally {
    feedbackSubmitting.value = false
  }
}

async function loadUnreadAnnouncements() {
  try {
    const data = await api.get('/announcements/unread')
    announcements.value = Array.isArray(data?.items) ? data.items : []
    announcementOpen.value = announcements.value.length > 0
  } catch {}
}

async function acknowledgeAnnouncement() {
  if (!currentAnnouncement.value || announcementSubmitting.value) return
  const announcementId = currentAnnouncement.value.id
  announcementSubmitting.value = true
  try {
    await api.post(`/announcements/${announcementId}/read`, {})
    announcements.value = announcements.value.filter((item) => item.id !== announcementId)
    announcementOpen.value = announcements.value.length > 0
  } catch (error) {
    feedbackMessage.value = error instanceof Error ? error.message : '确认公告失败'
  } finally {
    announcementSubmitting.value = false
  }
}

async function discardDraftAndExit() {
  window.dispatchEvent(new CustomEvent('rc-discard-current-draft'))
  const orderId = currentDraftOrderId()
  const draftId = currentDraftId() || currentLatestLocalDraftId()
  if (orderId || draftId || hasCurrentLocalDraft()) {
    await clearSelfReportDraft(orderId, currentDraftMode(), draftId).catch(() => {})
  }
  formDraftPending.value = false
  exitConfirmOpen.value = false
  router.push('/')
}

function handleOpenExitConfirm() {
  openExitConfirm()
}

function handleFormDirtyState(event) {
  formDraftPending.value = Boolean(event?.detail?.dirty)
}

onMounted(() => {
  refreshPendingSyncQueue()
  loadUnreadAnnouncements()
  startNetworkWatch()
  if (isOnline.value && pendingSyncCount.value) {
    syncPendingSelfReports().catch(() => {})
  }
  restoreCreateFabPosition()
  window.addEventListener('rc-open-exit-confirm', handleOpenExitConfirm)
  window.addEventListener('rc-form-dirty-state', handleFormDirtyState)
  window.addEventListener('resize', syncCreateFabPositionToViewport)
})

onBeforeUnmount(() => {
  stopNetworkWatch()
  stopCreateFabDrag()
  window.clearTimeout(createFabLongPressTimer)
  window.removeEventListener('rc-open-exit-confirm', handleOpenExitConfirm)
  window.removeEventListener('rc-form-dirty-state', handleFormDirtyState)
  window.removeEventListener('resize', syncCreateFabPositionToViewport)
})

watch(
  () => isOnline.value,
  (online) => {
    if (online && pendingSyncCount.value) {
      syncPendingSelfReports().catch(() => {})
    }
  },
)

watch(
  () => route.fullPath,
  () => {
    exitConfirmOpen.value = false
    accountOpen.value = false
    feedbackOpen.value = false
    createModePickerOpen.value = false
    formDraftPending.value = false
    restoreCreateFabPosition()
  },
)
</script>

<template>
  <RouterView v-slot="{ Component }">
    <div class="engineer-page-shell">
      <div class="engineer-shell-controls-anchor" :class="controlsAnchorClass" data-no-convert>
        <div class="engineer-shell-controls" :class="{ open: accountOpen }">
          <div
            class="shell-glass-pill shell-status-compact"
            :class="{ offline: !isOnline }"
            :aria-label="zh(networkLabel)"
          >
            <i aria-hidden="true"></i>
          </div>
          <div v-if="showHomeQuickAction" class="shell-glass-pill shell-home-compact">
            <button type="button" :aria-label="zh('返回首页')" @click="goHome">
              <PreviewIcon name="home" />
            </button>
          </div>
          <div class="shell-glass-pill shell-feedback-compact">
            <button type="button" :aria-label="zh('反馈')" @click="openFeedback">
              <PreviewIcon name="edit" />
            </button>
          </div>
          <div class="shell-glass-pill shell-language-compact">
            <button
              type="button"
              :aria-label="zh(language === 'hans' ? '切换繁体' : '切换简体')"
              @click="setLanguage(language === 'hans' ? 'hant' : 'hans')"
            >
              <PreviewIcon name="language" />
              <span class="shell-language-mark">{{ language === 'hans' ? '简' : '繁' }}</span>
            </button>
          </div>
          <div v-if="accountOpen" class="shell-account-menu" :aria-label="zh('快捷菜单')">
            <template v-for="(item, index) in quickActions" :key="`${item.label}-${index}`">
              <RouterLink
                v-if="item.to"
                class="shell-menu-icon"
                :class="{ active: isNavActive(item) }"
                :to="item.to"
                :aria-label="zh(item.label)"
                @click="accountOpen = false"
              >
                <PreviewIcon :name="item.icon" />
              </RouterLink>
            </template>
            <button
              class="shell-menu-icon danger"
              type="button"
              :aria-label="zh('退出')"
              @click="logout"
            >
              <PreviewIcon name="logout" />
            </button>
          </div>
          <div class="shell-account">
            <button
              class="shell-account-trigger"
              type="button"
              :aria-expanded="accountOpen"
              :aria-label="zh('账户菜单')"
              @click="accountOpen = !accountOpen"
            >
              <span class="shell-avatar">
                <img v-if="avatarUrl" :src="avatarUrl" :alt="zh('头像')" />
                <span v-else>{{ avatarInitial }}</span>
              </span>
              <span class="shell-user">{{ displayName }}</span>
            </button>
          </div>
        </div>
      </div>
      <component :is="Component" />
    </div>
  </RouterView>
  <button
    v-if="showGlobalCreateAction"
    class="home-create-action"
    :class="{ dragging: createFabDragging, open: createModePickerOpen }"
    :style="createModePanelStyle"
    type="button"
    :aria-label="zh('新增服务记录')"
    :title="zh('新增服务记录')"
    @pointerdown="startCreateFabDrag"
    @click="openCreateSheet"
  >
    <PreviewIcon name="new" />
  </button>
  <div
    v-if="showGlobalCreateAction && createModePickerOpen"
    class="create-mode-panel"
    :style="createModePanelStyle"
    role="menu"
    :aria-label="zh('选择新建类型')"
  >
    <button
      v-for="(option, index) in createModeOptions"
      :key="option.mode"
      class="create-mode-option"
      :class="option.className"
      :style="{ '--mode-index': index }"
      type="button"
      role="menuitem"
      :aria-label="zh(option.label)"
      :title="zh(option.label)"
      @click="selectCreateMode(option.mode)"
    >
      <PreviewIcon :name="option.icon" />
    </button>
  </div>
  <div v-if="announcementOpen && currentAnnouncement" class="signature-modal announcement-modal" role="dialog" aria-modal="true" :aria-label="zh('公告')">
    <div class="signature-modal-shell announcement-modal-shell">
      <header class="signature-modal-head">
        <div>
          <h2><span aria-hidden="true">{{ currentAnnouncementIcon }}</span>{{ zh(currentAnnouncement.title || '公告') }}</h2>
        </div>
      </header>
      <div class="announcement-modal-body markdown-content" v-html="currentAnnouncementHtml"></div>
      <footer class="signature-modal-actions">
        <button class="primary" type="button" :disabled="announcementSubmitting" @click="acknowledgeAnnouncement">
          <PreviewIcon name="send" />{{ zh(announcementSubmitting ? '确认中…' : announcements.length > 1 ? `已读，下一条 (${announcements.length - 1})` : '已读并关闭') }}
        </button>
      </footer>
    </div>
  </div>
  <div v-if="exitConfirmOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('取消填写')">
    <div class="signature-modal-shell exit-confirm-shell">
      <header class="signature-modal-head">
        <div>
          <h2>{{ zh(exitConfirmMeta.title) }}</h2>
        </div>
      </header>
      <div class="exit-confirm-body">
        <p>{{ zh(exitConfirmMeta.body) }}</p>
      </div>
      <footer class="signature-modal-actions">
        <button class="ghost" type="button" @click="closeExitConfirm"><PreviewIcon name="edit" />{{ zh('继续填写') }}</button>
        <button class="primary danger-action" type="button" @click="discardDraftAndExit">
          <PreviewIcon :name="exitConfirmMeta.actionIcon" />{{ zh(exitConfirmMeta.actionLabel) }}
        </button>
      </footer>
    </div>
  </div>
  <div v-if="feedbackOpen" class="signature-modal feedback-modal" role="dialog" aria-modal="true" :aria-label="zh('反馈')" @click.self="closeFeedback">
    <div class="signature-modal-shell feedback-modal-shell">
      <header class="signature-modal-head">
        <div>
          <h2>{{ zh('反馈') }}</h2>
        </div>
      </header>
      <div class="feedback-modal-body">
        <div class="feedback-type-switch" role="group" :aria-label="zh('反馈类型')">
          <button
            type="button"
            :class="{ active: feedbackType === 'problem' }"
            @click="feedbackType = 'problem'"
          >{{ zh('遇到问题') }}</button>
          <button
            type="button"
            :class="{ active: feedbackType === 'suggestion' }"
            @click="feedbackType = 'suggestion'"
          >{{ zh('功能建议') }}</button>
        </div>
        <textarea
          v-model="feedbackContent"
          class="feedback-textarea"
          :placeholder="zh('简单写一下遇到的问题或想法…')"
          maxlength="2000"
          autofocus
        ></textarea>
        <p v-if="feedbackMessage" class="feedback-message">{{ zh(feedbackMessage) }}</p>
      </div>
      <footer class="signature-modal-actions">
        <button class="ghost" type="button" :disabled="feedbackSubmitting" @click="closeFeedback">{{ zh('取消') }}</button>
        <button class="primary" type="button" :disabled="feedbackSubmitting" @click="submitFeedback">
          <PreviewIcon name="send" />{{ zh(feedbackSubmitting ? '提交中…' : '提交') }}
        </button>
      </footer>
    </div>
  </div>
</template>
