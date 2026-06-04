<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { LayoutDashboard } from '@lucide/vue'
import AdminIcon from '../components/AdminIcon.vue'
import {
  canAccessRoute,
  findNavigationGroup,
  findNavigationItem,
  getAllNavigationItems,
  getVisibleNavigation,
} from '../config/navigation'
import { clearSession, currentUser } from '../services/auth'

const route = useRoute()
const router = useRouter()
const currentTime = ref('')
const commandOpen = ref(false)
const sidebarOpen = ref(true)
const searchText = ref('')
const searchMessage = ref('')
const isTraditional = ref(false)

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

const systemVersion = computed(() => import.meta.env.VITE_APP_VERSION || 'v2.4.8')

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

function toggleLanguage() {
  isTraditional.value = !isTraditional.value
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
  <main class="admin-shell make-admin-shell-v2" :class="{ 'sidebar-collapsed': !sidebarOpen }">
    <aside class="admin-sidebar make-sidebar-v2" :aria-hidden="!sidebarOpen">
      <div class="sidebar-brand make-sidebar-brand-v2">
        <span class="make-brand-tile"><LayoutDashboard :size="24" :stroke-width="2" /></span>
        <div>
          <strong>运维智管</strong>
          <small>OMS SYSTEM</small>
        </div>
      </div>

      <nav class="sidebar-nav make-sidebar-nav-v2">
        <section
          v-for="group in visibleGroups"
          :key="group.name"
          class="make-nav-section-v2"
        >
          <p class="make-nav-group-label-v2">{{ group.label }}</p>
          <div class="make-nav-list-v2">
            <RouterLink
              v-for="item in group.children"
              :key="item.name"
              :to="item.to"
              class="make-nav-item-v2"
              :class="{ active: route.name === item.name }"
            >
              <AdminIcon :name="item.name" class="nav-icon-image" />
              <span>{{ item.label }}</span>
              <i v-if="route.name === item.name" aria-hidden="true"></i>
            </RouterLink>
          </div>
        </section>
      </nav>

      <div class="make-sidebar-version-v2">
        <span>System Version</span>
        <strong>{{ systemVersion }}</strong>
      </div>
    </aside>

    <div class="admin-main make-admin-main-v2">
      <div class="make-main-orb make-main-orb-primary"></div>
      <div class="make-main-orb make-main-orb-blue"></div>

      <header class="admin-topbar make-topbar-v2">
        <div class="make-topbar-left-v2">
          <button type="button" class="make-icon-button-v2" @click="sidebarOpen = !sidebarOpen" :aria-label="sidebarOpen ? '收起侧边栏' : '展开侧边栏'">
            <AdminIcon :name="sidebarOpen ? 'close' : 'menu'" />
          </button>
          <nav class="make-breadcrumb-v2" aria-label="当前位置">
            <span>运维管理系统</span>
            <em>/</em>
            <strong>{{ activeItem?.label || activeGroup?.children?.[0]?.label || '运营总览' }}</strong>
          </nav>
        </div>

        <div class="topbar-actions make-topbar-actions-v2">
          <button type="button" class="command-trigger make-quick-button-v2" @click="commandOpen = true">
            <AdminIcon name="search" class="command-trigger-icon" />
            <span>快速跳转</span>
          </button>
          <button type="button" class="make-lang-button-v2" @click="toggleLanguage">
            <AdminIcon name="language" />
            <strong>{{ isTraditional ? '繁体' : '简体' }}</strong>
          </button>
          <p class="make-time-v2">{{ currentTime }}</p>
          <div class="make-topbar-separator-v2"></div>
          <div class="topbar-user make-user-v2">
            <div>
              <strong>{{ userName }}</strong>
              <small>{{ userRoleLabel }}</small>
            </div>
            <button type="button" class="make-icon-button-v2" @click="handleLogout" aria-label="退出登录"><AdminIcon name="logout" /></button>
          </div>
        </div>
      </header>

      <div v-if="commandOpen" class="command-overlay make-command-overlay-v2" @click.self="commandOpen = false">
        <section class="command-dialog make-command-dialog-v2" role="dialog" aria-label="快速跳转模块">
          <header>
            <h2>快速跳转</h2>
            <button type="button" @click="commandOpen = false"><AdminIcon name="close" /></button>
          </header>
          <div class="command-input-wrap make-command-input-v2">
            <AdminIcon name="search" class="command-input-icon" />
            <input
              v-model.trim="searchText"
              autofocus
              placeholder="搜索模块名称..."
              @keyup.enter="handleSearch"
              @keyup.esc="commandOpen = false"
            />
          </div>
          <p v-if="searchMessage" class="command-message">{{ searchMessage }}</p>
          <div class="command-list make-command-list-v2">
            <button
              v-for="item in commandItems"
              :key="item.name"
              type="button"
              class="command-item"
              @click="selectNavigationItem(item)"
            >
              <AdminIcon :name="item.name" class="command-item-icon" />
              <span>{{ item.label }}</span>
              <small>{{ item.group.label }}</small>
            </button>
            <p v-if="commandItems.length === 0" class="command-empty">未找到相关模块</p>
          </div>
        </section>
      </div>

      <section class="admin-workspace make-workspace-v2" :data-page="String(route.name || '')">
        <RouterView />
      </section>
    </div>
  </main>
</template>
