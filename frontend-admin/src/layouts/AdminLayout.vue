<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminIcon from '../components/AdminIcon.vue'
import {
  canAccessRoute,
  findNavigationGroup,
  findNavigationItem,
  getAllNavigationItems,
  getVisibleNavigation,
} from '../config/navigation'
import { clearSession, currentUser } from '../services/auth'
import {
  BRAND_LOGO,
} from '../constants/figmaAssets'

const route = useRoute()
const router = useRouter()
const currentTime = ref('')
const commandOpen = ref(false)
const searchText = ref('')
const searchMessage = ref('')

const visibleGroups = computed(() => getVisibleNavigation(currentUser.value?.role))
const activeGroup = computed(() => findNavigationGroup(route.name, visibleGroups.value) || visibleGroups.value[0] || null)
const activeItem = computed(() => findNavigationItem(route.name, visibleGroups.value))
const activeChildren = computed(() => activeGroup.value?.children || [])
const canViewAuditLogs = computed(() => canAccessRoute('audit-logs', currentUser.value?.role))
const navigationItems = computed(() => getAllNavigationItems(visibleGroups.value))
const commandItems = computed(() => {
  const text = searchText.value.trim().toLowerCase()
  if (!text) return navigationItems.value
  return navigationItems.value.filter(item => {
    const keywords = [item.label, item.name, item.group?.label, ...(item.aliases || [])]
    return keywords.some(keyword => String(keyword || '').toLowerCase().includes(text))
  })
})
const userName = computed(() => currentUser.value?.realName || currentUser.value?.username || '管理员')
const userRoleLabel = computed(() => {
  const roleMap = {
    admin: '系统管理员',
    assistant: '助理',
    dispatcher: '调度',
    supervisor: '主管',
    engineering_supervisor: '工程主管',
    sales_supervisor: '业务主管',
    sales: '业务',
  }
  return roleMap[currentUser.value?.role] || currentUser.value?.role || '管理端用户'
})
const userInitial = computed(() => String(userName.value || '管').slice(0, 1).toUpperCase())

const activeTitle = computed(() => {
  if (!activeGroup.value) return '工作台'
  return `${activeGroup.value.label} / ${activeItem.value?.label || activeGroup.value.children[0]?.label || ''}`
})

function navigateToGroup(group) {
  if (!group.children.length) return
  const firstChild = group.children[0]
  if (route.name !== firstChild.name) {
    router.push(firstChild.to)
  }
}

function tick() {
  currentTime.value = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function handleLogout() {
  clearSession()
  router.push('/login')
}

function handleSearch() {
  const text = searchText.value.trim()
  searchMessage.value = ''
  if (!text) return
  const target = navigationItems.value.find(item => {
    const keywords = [item.label, item.name, item.group?.label, ...(item.aliases || [])]
    return keywords.some(keyword => String(keyword || '').toLowerCase().includes(text.toLowerCase()))
  })
  if (!target) {
    searchMessage.value = '未找到可访问模块'
    return
  }
  selectNavigationItem(target)
}

function selectNavigationItem(item) {
  if (!item) return
  if (item.name !== route.name) router.push({ name: item.name })
  commandOpen.value = false
  searchText.value = ''
  searchMessage.value = ''
}

let timer = 0

onMounted(() => {
  tick()
  timer = window.setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
})
</script>

<template>
  <main class="admin-shell figma-shell make-admin-shell">
    <aside class="admin-sidebar figma-sidebar">
      <div class="sidebar-brand">
        <img :src="BRAND_LOGO" alt="" class="brand-mark" />
        <div>
          <strong>技服表管理端</strong>
          <small>电子化服务平台</small>
        </div>
      </div>

      <nav class="sidebar-nav">
        <section
          v-for="group in visibleGroups"
          :key="group.name"
          class="sidebar-group"
          :class="{ active: activeGroup?.name === group.name }"
        >
          <button type="button" class="sidebar-group-button" @click="navigateToGroup(group)">
            <AdminIcon :name="group.icon" class="nav-icon-image" />
            <span>{{ group.label }}</span>
          </button>
        </section>
      </nav>

      <div class="sidebar-footer">
        <RouterLink v-if="canViewAuditLogs" class="sidebar-link subtle-link" :to="{ name: 'audit-logs' }">
          <AdminIcon name="audit" class="nav-icon-image" />
          <span>查看操作审计</span>
        </RouterLink>
        <button type="button" class="sidebar-link subtle-link" @click="handleLogout">
          <AdminIcon name="logout" class="nav-icon-image" />
          <span>注销账户</span>
        </button>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar figma-topbar">
        <div class="topbar-title">
          <nav class="topbar-breadcrumbs" aria-label="当前位置">
            <span>{{ activeGroup?.label || '工作台' }}</span>
            <em>/</em>
            <strong>{{ activeItem?.label || activeGroup?.children?.[0]?.label || '运营总览' }}</strong>
          </nav>
          <p>{{ currentTime }}</p>
        </div>
        <div class="topbar-actions">
          <button type="button" class="command-trigger" @click="commandOpen = true">
            <AdminIcon name="search" class="command-trigger-icon" />
            <span>快速跳转模块...</span>
            <kbd>⌘K</kbd>
          </button>
          <div class="topbar-user">
            <span class="topbar-avatar">{{ userInitial }}</span>
            <div>
              <strong>{{ userName }}</strong>
              <small>{{ userRoleLabel }}</small>
            </div>
          </div>
          <button type="button" class="topbar-logout" @click="handleLogout">退出</button>
        </div>
      </header>

      <div v-if="commandOpen" class="command-overlay" @click.self="commandOpen = false">
        <section class="command-dialog" role="dialog" aria-label="快速跳转模块">
          <div class="command-input-wrap">
            <AdminIcon name="search" class="command-input-icon" />
            <input
              v-model.trim="searchText"
              autofocus
              placeholder="输入模块名称快速跳转..."
              @keyup.enter="handleSearch"
              @keyup.esc="commandOpen = false"
            />
          </div>
          <p v-if="searchMessage" class="command-message">{{ searchMessage }}</p>
          <div class="command-list">
            <p class="command-group-label">常用模块</p>
            <button
              v-for="item in commandItems"
              :key="item.name"
              type="button"
              class="command-item"
              @click="selectNavigationItem(item)"
            >
              <AdminIcon :name="item.group.icon" class="command-item-icon" />
              <span>{{ item.label }}</span>
              <small>{{ item.group.label }}</small>
            </button>
            <p v-if="commandItems.length === 0" class="command-empty">未找到相关模块</p>
          </div>
        </section>
      </div>

      <nav v-if="activeChildren.length > 0" class="sub-nav">
        <RouterLink
          v-for="item in activeChildren"
          :key="item.name"
          :to="item.to"
          class="sub-nav-link"
          :class="{ active: route.name === item.name }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <section class="admin-workspace figma-workspace" :data-page="String(route.name || '')">
        <RouterView />
      </section>
    </div>
  </main>
</template>
