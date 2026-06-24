<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { currentUser } from '../services/auth'
import { isOnline, probeNetwork, startNetworkWatch, stopNetworkWatch } from '../services/network'
import { readOfflineCacheMeta } from '../services/offline-cache'
import { safeStorageRemove } from '../services/safe-storage'
import { pendingSyncCount, refreshPendingSyncQueue, syncPendingSelfReports } from '../services/sync-queue'

const { language, setLanguage, zh } = usePreviewI18n()
const route = useRoute()
const router = useRouter()
const displayName = computed(() => currentUser.value?.realName || currentUser.value?.username || '工程师')
const avatarInitial = computed(() => String(displayName.value || '工').trim().slice(0, 1).toUpperCase())
const avatarUrl = computed(() => currentUser.value?.avatarUrl || '')
const exitConfirmOpen = ref(false)
const feedbackOpen = ref(false)
const feedbackType = ref('problem')
const feedbackContent = ref('')
const feedbackSubmitting = ref(false)
const feedbackMessage = ref('')
const formDraftPending = ref(false)
const isFormPage = computed(() => ['service-sheet-new', 'service-sheet-edit'].includes(String(route.name || '')))
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

function isNavActive(item) {
  return item.names.includes(route.name)
}

function draftStorageKey() {
  const userId = currentUser.value?.id || 'anonymous'
  const suffix = route.name === 'service-sheet-edit' ? route.params.id : 'new'
  return `oms-platform:draft:${userId}:service-record:${suffix}`
}

function goHome() {
  router.push('/')
}

function goProfile() {
  router.push('/profile')
}

function openCreateSheet() {
  router.push('/service-sheets/new?mode=onsite')
}

async function handleStatusClick() {
  await probeNetwork()
  if (isOnline.value && pendingSyncCount.value) {
    syncPendingSelfReports().catch(() => {})
  }
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

function openFeedback() {
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
  window.addEventListener('rc-open-exit-confirm', handleOpenExitConfirm)
  window.addEventListener('rc-form-dirty-state', handleFormDirtyState)
})

onBeforeUnmount(() => {
  stopNetworkWatch()
  window.removeEventListener('rc-open-exit-confirm', handleOpenExitConfirm)
  window.removeEventListener('rc-form-dirty-state', handleFormDirtyState)
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
    feedbackOpen.value = false
    formDraftPending.value = false
  },
)
</script>

<template>
  <RouterView v-slot="{ Component }">
    <div class="engineer-page-shell">
      <div class="engineer-shell-controls-anchor" :class="controlsAnchorClass" data-no-convert>
        <div class="engineer-shell-controls">
          <button
            class="shell-quick-action shell-status-action"
            :class="{ offline: !isOnline }"
            type="button"
            :aria-label="zh(networkLabel)"
            :title="zh(isOnline ? '在线模式：会刷新缓存并自动补传离线队列。' : '离线模式：可使用缓存和本机草稿。')"
            @click="handleStatusClick"
          >
            <i aria-hidden="true"></i>
            <span v-if="pendingSyncCount" class="shell-pending-count">{{ pendingSyncCount }}</span>
          </button>
          <button
            class="shell-quick-action"
            :class="{ active: isNavActive(navItems[0]) }"
            type="button"
            :aria-label="zh('返回首页')"
            :title="zh('返回首页')"
            @click="goHome"
          >
            <PreviewIcon name="home" />
          </button>
          <button
            class="shell-quick-action shell-create-shortcut"
            type="button"
            :aria-label="zh('新增服务记录')"
            :title="zh('新增服务记录')"
            @click="openCreateSheet"
          >
            <PreviewIcon name="new" />
          </button>
          <button class="shell-quick-action" type="button" :aria-label="zh('反馈')" :title="zh('反馈')" @click="openFeedback">
            <PreviewIcon name="edit" />
          </button>
          <button
            class="shell-quick-action shell-language-action"
            type="button"
            :aria-label="zh(language === 'hans' ? '切换繁体' : '切换简体')"
            :title="zh(language === 'hans' ? '切换繁体' : '切换简体')"
            @click="setLanguage(language === 'hans' ? 'hant' : 'hans')"
          >
            <PreviewIcon name="language" />
            <span class="shell-language-mark">{{ language === 'hans' ? '简' : '繁' }}</span>
          </button>
          <button
            class="shell-quick-action shell-profile-action"
            :class="{ active: isNavActive(navItems[4]) }"
            type="button"
            :aria-label="zh('我的')"
            :title="zh('我的')"
            @click="goProfile"
          >
            <span class="shell-avatar">
              <img v-if="avatarUrl" :src="avatarUrl" :alt="zh('头像')" />
              <span v-else>{{ avatarInitial }}</span>
            </span>
          </button>
        </div>
      </div>
      <component :is="Component" />
    </div>
  </RouterView>
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
  <div v-if="feedbackOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('反馈')" @click.self="closeFeedback">
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
  <a
    class="icp-badge"
    href="https://beian.miit.gov.cn/"
    target="_blank"
    rel="noreferrer"
    aria-label="浙ICP备2026045692号"
    style="position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); z-index: 1; font-size: var(--type-caption); line-height: 1.4; color: rgba(100,116,139,0.45); text-decoration: none; padding: 1px 8px; pointer-events: auto;"
  >浙ICP备2026045692号</a>
</template>
