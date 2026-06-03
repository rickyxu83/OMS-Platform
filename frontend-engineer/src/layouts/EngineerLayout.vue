<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
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
const sharedFabStorageKey = 'rc:service-sheet:cancel-fab-position'
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
  { label: '新建服务表', icon: 'new', to: '/service-sheets/new', names: ['service-sheet-new', 'service-sheet-edit'] },
  { label: '月报', icon: 'calendar', to: '/timesheet', names: ['timesheet', 'timesheets'] },
  { label: '我的', icon: 'user', to: '/profile', names: ['profile'] },
]

const quickActions = computed(() => [
  navItems[0],
  navItems[2],
  navItems[3],
])
const createModeOptions = [
  { mode: 'onsite', label: '现场服务', icon: 'onsite-service', className: 'onsite' },
  { mode: 'remote', label: '远程服务', icon: 'remote-service', className: 'remote' },
  { mode: 'office', label: '内勤工作', icon: 'office-service', className: 'office' },
]
const guideSteps = [
  {
    icon: 'user',
    title: '先完成我的资料',
    body: '首次使用请到“我的”修改初始密码、设置手写签名。头像可选，但设置后更容易识别账号。',
  },
  {
    icon: 'new',
    title: '新建服务表',
    body: '点右下角“+”可以新建现场服务、远程服务或内勤记录。手机上点一下默认新建现场服务，长按可选择类型。',
  },
  {
    icon: 'pin',
    title: '定位查找客户',
    body: '填写客户时可以用定位查找，系统会优先搜索苏州、上海及附近客户/地点，再用全国结果兜底。',
  },
  {
    icon: 'refresh',
    title: '同步资料',
    body: '在线时会刷新缓存并补传离线记录；如果看到待同步数量，可以手动点同步资料。',
  },
  {
    icon: 'calendar',
    title: '查看月报',
    body: '月报会汇总你的现场、远程和内勤服务记录，方便核对当月工作。',
  },
]
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
  clearSession()
  router.push('/login')
}

function guideStorageKey() {
  const user = currentUser.value || {}
  const userKey = user.id || user.username || 'anonymous'
  return `rc-engineer:first-login-guide:${guideStorageVersion}:${userKey}`
}

function openFirstLoginGuide() {
  accountOpen.value = false
  firstLoginGuideOpen.value = true
}

function closeFirstLoginGuide() {
  safeStorageSet(localStorage, guideStorageKey(), '1')
  firstLoginGuideOpen.value = false
}

function maybeOpenFirstLoginGuide() {
  if (!currentUser.value) return
  if (safeStorageGet(localStorage, guideStorageKey(), '') === '1') return
  firstLoginGuideOpen.value = true
}

function draftStorageKey() {
  const userId = currentUser.value?.id || 'anonymous'
  const suffix = route.name === 'service-sheet-edit' ? route.params.id : 'new'
  return `rc-engineer-offline-cache:rc:draft:${userId}:service-sheet:${suffix}`
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
  },
)

watch(
  () => currentUser.value?.id || currentUser.value?.username,
  () => {
    window.setTimeout(maybeOpenFirstLoginGuide, 240)
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
    :aria-label="zh('新建服务表')"
    :title="zh('新建服务表')"
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
  <div v-if="firstLoginGuideOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('工程师端功能指引')">
    <div class="signature-modal-shell first-login-guide-shell">
      <header class="signature-modal-head first-login-guide-head">
        <div>
          <p>{{ zh('GET STARTED') }}</p>
          <h2>{{ zh('工程师端功能指引') }}</h2>
          <span>{{ zh('快速了解常用入口，后续也可以从账号菜单再次打开。') }}</span>
        </div>
        <button class="ghost" type="button" @click="closeFirstLoginGuide">{{ zh('跳过') }}</button>
      </header>
      <div class="first-login-guide-grid">
        <article v-for="step in guideSteps" :key="step.title" class="first-login-guide-card">
          <span class="first-login-guide-icon"><PreviewIcon :name="step.icon" /></span>
          <div>
            <h3>{{ zh(step.title) }}</h3>
            <p>{{ zh(step.body) }}</p>
          </div>
        </article>
      </div>
      <footer class="signature-modal-actions first-login-guide-actions">
        <button class="ghost" type="button" @click="router.push('/profile'); closeFirstLoginGuide()"><PreviewIcon name="user" />{{ zh('去完善我的资料') }}</button>
        <button class="primary" type="button" @click="closeFirstLoginGuide"><PreviewIcon name="check" />{{ zh('我知道了') }}</button>
      </footer>
    </div>
  </div>
</template>
