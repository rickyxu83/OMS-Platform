<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminIcon from '../components/AdminIcon.vue'
import { clearSession, currentUser } from '../services/auth'
import {
  BRAND_LOGO,
} from '../constants/figmaAssets'

const route = useRoute()
const router = useRouter()
const currentTime = ref('')
const searchText = ref('')
const roleAccess = {
  users: ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor'],
  'audit-logs': ['admin', 'supervisor', 'engineering_supervisor'],
}
const navItems = [
  { to: '/', label: '工作台', icon: 'dashboard', name: 'dashboard' },
  { to: '/service-orders', label: '工单处理', icon: 'service', name: 'service-orders' },
  { to: '/customers', label: '客户资产', icon: 'customer', name: 'customers' },
  { to: '/users', label: '工程师管理', icon: 'member', name: 'users' },
  { to: '/audit-logs', label: '操作审计', icon: 'audit', name: 'audit-logs' },
  { to: '/timesheets', label: '月报导出', icon: 'report', name: 'timesheets' },
]

const visibleNavItems = computed(() => navItems.filter((item) => {
  const allowedRoles = roleAccess[item.name]
  return !allowedRoles || allowedRoles.includes(currentUser.value?.role)
}))
const activeTitle = computed(() => navItems.find((item) => item.name === route.name)?.label || '工作台')

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
  if (!text) return
  const target = visibleNavItems.value.find((item) => {
    const { name, label } = item
    return label.includes(text) || name.includes(text)
  })?.name
  if (target && route.name !== target) {
    router.push({ name: target })
  }
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
  <main class="admin-shell figma-shell">
    <aside class="admin-sidebar figma-sidebar">
      <div class="sidebar-brand">
        <img :src="BRAND_LOGO" alt="" class="brand-mark" />
        <div>
          <strong>技服表电子化</strong>
          <small>管理端</small>
        </div>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{ active: route.name === item.name }"
        >
          <AdminIcon :name="item.icon" class="nav-icon-image" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <RouterLink class="sidebar-link subtle-link" :to="{ name: 'audit-logs' }">
          <AdminIcon name="help" class="nav-icon-image" />
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
          <h1>{{ activeTitle }}</h1>
          <p>当前工作台 · {{ currentTime }}</p>
        </div>
        <div class="topbar-search">
          <input v-model.trim="searchText" placeholder="输入模块名称并回车切换，如客户资产" @keyup.enter="handleSearch" />
          <AdminIcon name="search" class="search-icon" />
        </div>
      </header>

      <section class="admin-workspace figma-workspace" :data-page="String(route.name || '')">
        <RouterView />
      </section>
    </div>
  </main>
</template>
