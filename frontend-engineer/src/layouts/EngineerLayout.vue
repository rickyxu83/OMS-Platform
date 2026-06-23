<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { clearSession, currentUser } from '../services/auth'
import { isOnline, probeNetwork, startNetworkWatch, stopNetworkWatch } from '../services/network'
import { readOfflineCacheMeta } from '../services/offline-cache'
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../services/safe-storage'
import { pendingSyncCount, refreshPendingSyncQueue, syncPendingSelfReports } from '../services/sync-queue'

const { language, setLanguage, zh } = usePreviewI18n()
const route = useRoute()
const router = useRouter()
const displayName = computed(() => currentUser.value?.realName || currentUser.value?.username || '工程师')
const avatarInitial = computed(() => String(displayName.value || '工').trim().slice(0, 1).toUpperCase())
const avatarUrl = computed(() => currentUser.value?.avatarUrl || '')
const accountOpen = ref(false)
const exitConfirmOpen = ref(false)
const firstLoginGuideOpen = ref(false)
const featureTourIndex = ref(0)
const featureTourRect = ref(null)
const formDraftPending = ref(false)
const createFabPosition = ref({ x: null, y: null })
const createFabDragging = ref(false)
const createModePickerOpen = ref(false)
const isFormPage = computed(() => ['service-sheet-new', 'service-sheet-edit'].includes(String(route.name || '')))
const showHomeQuickAction = computed(() => route.name !== 'login')
const showGlobalCreateAction = computed(() => !isFormPage.value && route.name !== 'service-sheet-edit')
const isEditingExistingSheet = computed(() => route.name === 'service-sheet-edit')
const shouldAutoOpenFirstLoginGuide = computed(() => Boolean(currentUser.value?.requiresOnboarding))
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
const guideStorageVersion = 'v1'
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
const guideSteps = [
  {
    selector: '.shell-account-trigger',
    title: '账户菜单',
    body: '这里可以打开快捷菜单，进入服务记录、月报、客户资产、我的，也可以重新打开功能指引。',
  },
  {
    selector: '.home-create-action',
    title: '新增服务记录',
    body: '点右下角“+”可以新增现场服务、远程服务或内勤记录。手机上点一下默认新增现场服务，长按可选择类型。',
  },
  {
    selector: '.profile-hero-card',
    route: '/profile',
    title: '我的资料',
    body: '这里管理头像、账号状态和首次登录必做项。头像不是必填，但设置后更容易识别。',
  },
  {
    selector: '.profile-form',
    route: '/profile',
    title: '修改密码',
    body: '首次登录必须修改初始密码。新密码需要满足复杂度要求，保证账号安全。',
  },
  {
    selector: '.signature-card',
    route: '/profile',
    title: '个人手写签名',
    body: '签名会用于服务记录导出。可以预览、重新签名，确认无误后保存。',
  },
  {
    selector: '.quick-action-row .locate',
    route: '/service-sheets/new?mode=onsite&guide=1',
    title: '定位查找',
    body: '填写客户时用它搜索附近客户和地点，系统会按关键词匹配和当前位置排序。',
  },
  {
    selector: '.quick-action-row .ghost',
    route: '/service-sheets/new?mode=onsite&guide=1',
    title: '同步资料',
    body: '在线时可以手动刷新客户、联系人、草稿和离线队列，避免现场资料不同步。',
  },
  {
    selector: '.timesheet-filter',
    route: '/timesheet?guide=1',
    title: '查看月报',
    body: '月报会汇总你的现场、远程和内勤服务记录，方便核对当月工作。',
  },
]
const activeGuideStep = computed(() => guideSteps[featureTourIndex.value] || guideSteps[0])
const featureTourSpotlightStyle = computed(() => {
  const rect = featureTourRect.value
  if (!rect) return { opacity: 0 }
  const padding = 8
  return {
    left: `${Math.max(8, rect.left - padding)}px`,
    top: `${Math.max(8, rect.top - padding)}px`,
    width: `${rect.width + padding * 2}px`,
    height: `${rect.height + padding * 2}px`,
    opacity: 1,
  }
})
const featureTourBubbleStyle = computed(() => {
  const rect = featureTourRect.value
  if (!rect) return {}
  if (window.innerWidth <= 520) {
    const width = Math.min(320, window.innerWidth - 24)
    const placeAtTop = rect.top > window.innerHeight * 0.52
    return {
      width: `${width}px`,
      left: '12px',
      top: placeAtTop ? '12px' : 'auto',
      bottom: placeAtTop ? 'auto' : 'calc(12px + env(safe-area-inset-bottom))',
    }
  }
  const maxWidth = window.innerWidth <= 680 ? 296 : 340
  const sideGap = window.innerWidth <= 520 ? 72 : window.innerWidth <= 680 ? 56 : 28
  const width = Math.min(maxWidth, window.innerWidth - sideGap)
  const preferBelow = rect.top + rect.height + 18 + 190 < window.innerHeight
  const top = preferBelow
    ? rect.top + rect.height + 16
    : Math.max(12, rect.top - (window.innerWidth <= 520 ? 170 : 210))
  const left = Math.min(Math.max(14, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 14)
  return { width: `${width}px`, left: `${left}px`, top: `${top}px` }
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

function logout() {
  accountOpen.value = false
  api.post('/auth/logout').catch(() => {})
  clearSession()
  router.push('/login')
}

function guideStorageKey() {
  const user = currentUser.value || {}
  const userKey = user.id || user.username || 'anonymous'
  return `oms-platform-engineer:first-login-guide:${guideStorageVersion}:${userKey}`
}

function openFirstLoginGuide() {
  accountOpen.value = false
  featureTourIndex.value = 0
  firstLoginGuideOpen.value = true
  window.setTimeout(updateFeatureTourTarget, 80)
}

function closeFirstLoginGuide() {
  safeStorageSet(localStorage, guideStorageKey(), '1')
  firstLoginGuideOpen.value = false
  featureTourRect.value = null
}

function maybeOpenFirstLoginGuide() {
  if (!currentUser.value) return
  if (!shouldAutoOpenFirstLoginGuide.value) return
  if (safeStorageGet(localStorage, guideStorageKey(), '') === '1') return
  openFirstLoginGuide()
}

async function prepareFeatureTourStep() {
  const step = activeGuideStep.value
  const targetRoute = step?.route ? router.resolve(step.route).fullPath : ''
  if (targetRoute && route.fullPath !== targetRoute) {
    await router.push(targetRoute)
  }
  accountOpen.value = Boolean(step?.selector?.includes('shell-menu-icon'))
  await new Promise((resolve) => window.setTimeout(resolve, 180))
  updateFeatureTourTarget()
}

function updateFeatureTourTarget() {
  if (!firstLoginGuideOpen.value) return
  const selector = activeGuideStep.value?.selector
  const target = selector ? document.querySelector(selector) : null
  if (!target) {
    featureTourRect.value = null
    return
  }
  target.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' })
  window.setTimeout(() => {
    const rect = target.getBoundingClientRect()
    featureTourRect.value = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }, 220)
}

async function nextFeatureTourStep() {
  if (featureTourIndex.value >= guideSteps.length - 1) {
    closeFirstLoginGuide()
    return
  }
  featureTourIndex.value += 1
  await prepareFeatureTourStep()
}

async function previousFeatureTourStep() {
  if (featureTourIndex.value <= 0) return
  featureTourIndex.value -= 1
  await prepareFeatureTourStep()
}

function draftStorageKey() {
  const userId = currentUser.value?.id || 'anonymous'
  const suffix = route.name === 'service-sheet-edit' ? route.params.id : 'new'
  return `oms-platform:draft:${userId}:service-record:${suffix}`
}

function goHome() {
  accountOpen.value = false
  router.push('/')
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
  if (!readOfflineCacheMeta(draftStorageKey()) && !formDraftPending.value) {
    router.push('/')
    return
  }
  exitConfirmOpen.value = true
}

function closeExitConfirm() {
  exitConfirmOpen.value = false
}

function discardDraftAndExit() {
  safeStorageRemove(localStorage, draftStorageKey())
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
  startNetworkWatch()
  if (isOnline.value && pendingSyncCount.value) {
    syncPendingSelfReports().catch(() => {})
  }
  restoreCreateFabPosition()
  window.setTimeout(maybeOpenFirstLoginGuide, 360)
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
    createModePickerOpen.value = false
    formDraftPending.value = false
    restoreCreateFabPosition()
    window.setTimeout(updateFeatureTourTarget, 260)
  },
)

watch(featureTourIndex, () => {
  prepareFeatureTourStep()
})

watch(
  () => currentUser.value?.id || currentUser.value?.username,
  () => {
    window.setTimeout(maybeOpenFirstLoginGuide, 240)
  },
)

watch(shouldAutoOpenFirstLoginGuide, (required) => {
  if (required) window.setTimeout(maybeOpenFirstLoginGuide, 240)
})
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
            :title="zh(isOnline ? '在线模式：会刷新缓存并自动补传离线队列。' : '离线模式：可使用缓存和本机草稿。')"
          >
            <i aria-hidden="true"></i>
          </div>
          <div v-if="showHomeQuickAction" class="shell-glass-pill shell-home-compact">
            <button type="button" :aria-label="zh('返回首页')" :title="zh('返回首页')" @click="goHome">
              <PreviewIcon name="home" />
            </button>
          </div>
          <div class="shell-glass-pill shell-language-compact">
            <button
              type="button"
              :aria-label="zh(language === 'hans' ? '切换繁体' : '切换简体')"
              :title="zh(language === 'hans' ? '切换繁体' : '切换简体')"
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
                :style="{ '--menu-index': index }"
                :to="item.to"
                :aria-label="zh(item.label)"
                :title="zh(item.label)"
                @click="accountOpen = false"
              >
                <PreviewIcon :name="item.icon" />
              </RouterLink>
            </template>
            <button
              class="shell-menu-icon"
              type="button"
              :style="{ '--menu-index': quickActions.length }"
              :aria-label="zh('功能指引')"
              :title="zh('功能指引')"
              @click="openFirstLoginGuide"
            >
              <PreviewIcon name="status" />
            </button>
            <button
              class="shell-menu-icon danger"
              type="button"
              :style="{ '--menu-index': quickActions.length + 1 }"
              :aria-label="zh('退出')"
              :title="zh('退出')"
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
  <div v-if="firstLoginGuideOpen" class="feature-tour-layer" role="dialog" aria-modal="true" :aria-label="zh('功能指引')">
    <button class="feature-tour-backdrop" type="button" :aria-label="zh('结束功能指引')" @click="closeFirstLoginGuide"></button>
    <div class="feature-tour-spotlight" :style="featureTourSpotlightStyle" aria-hidden="true"></div>
    <section class="feature-tour-card" :style="featureTourBubbleStyle">
      <p>{{ zh('功能指引') }} {{ featureTourIndex + 1 }} / {{ guideSteps.length }}</p>
      <h2>{{ zh(activeGuideStep.title) }}</h2>
      <span>{{ zh(activeGuideStep.body) }}</span>
      <footer>
        <button class="ghost" type="button" :disabled="featureTourIndex === 0" @click="previousFeatureTourStep">{{ zh('上一步') }}</button>
        <button class="ghost" type="button" @click="closeFirstLoginGuide">{{ zh('结束') }}</button>
        <button class="primary" type="button" @click="nextFeatureTourStep">
          {{ zh(featureTourIndex >= guideSteps.length - 1 ? '完成' : '下一步') }}
        </button>
      </footer>
    </section>
  </div>
  <a
    class="icp-badge"
    href="https://beian.miit.gov.cn/"
    target="_blank"
    rel="noreferrer"
    aria-label="浙ICP备2026045692号"
    style="position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); z-index: 1; font-size: 10px; line-height: 1.4; color: rgba(100,116,139,0.45); text-decoration: none; padding: 1px 8px; pointer-events: auto;"
  >浙ICP备2026045692号</a>
</template>
