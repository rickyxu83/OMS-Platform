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
const categories = [
  { label: '工作台', icon: 'dashboard', name: 'dashboard', to: '/', standalone: true },
  {
    label: '业务管理', icon: 'service', name: 'business',
    children: [
      { to: '/service-orders', label: '工单处理', name: 'service-orders' },
      { to: '/inspection-schedules', label: '巡检计划', name: 'inspection-schedules' },
    ]
  },
  {
    label: '资源管理', icon: 'customer', name: 'resources',
    children: [
      { to: '/customers', label: '客户资产', name: 'customers' },
      { to: '/devices', label: '设备管理', name: 'devices' },
      { to: '/maintenance-parties', label: '维保方管理', name: 'maintenance-parties' },
    ]
  },
  {
    label: '系统设置', icon: 'member', name: 'system',
    children: [
      { to: '/users', label: '工程师管理', name: 'users' },
      { to: '/audit-logs', label: '操作审计', name: 'audit-logs' },
      { to: '/timesheets', label: '月报导出', name: 'timesheets' },
    ]
  }
]

const activeCategory = computed(() => {
  if (route.name === 'dashboard') return categories[0]
  return categories.find(c => !c.standalone && c.children?.some(ch => ch.name === route.name)) || null
})

const activeChildren = computed(() => activeCategory.value?.children || [])

const visibleCategories = computed(() => {
  return categories.filter(cat => {
    if (cat.standalone) return true
    if (!cat.children) return false
    return cat.children.some(ch => {
      const allowed = roleAccess[ch.name]
      return !allowed || allowed.includes(currentUser.value?.role)
    })
  })
})

const activeTitle = computed(() => {
  if (!activeCategory.value) return '工作台'
  if (activeCategory.value.standalone) return '工作台'
  const child = activeCategory.value.children.find(ch => ch.name === route.name)
  return `${activeCategory.value.label} / ${child?.label || ''}`
})

function handleCategoryClick(cat) {
  if (cat.standalone) {
    router.push(cat.to)
    return
  }
  if (activeCategory.value?.name === cat.name) return
  const firstVisible = cat.children.find(ch => {
    const allowed = roleAccess[ch.name]
    return !allowed || allowed.includes(currentUser.value?.role)
  })
  if (firstVisible) router.push(firstVisible.to)
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
  if (!text) return
  const allItems = categories.flatMap(cat => cat.standalone ? [cat] : (cat.children || []))
  const target = allItems.find(item => item.label?.includes(text) || item.name?.includes(text))?.name
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
        <a
          v-for="cat in visibleCategories"
          :key="cat.name"
          class="sidebar-link"
          :class="{ active: activeCategory?.name === cat.name }"
          @click="handleCategoryClick(cat)"
        >
          <AdminIcon :name="cat.icon" class="nav-icon-image" />
          <span>{{ cat.label }}</span>
        </a>
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
