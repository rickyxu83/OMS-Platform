import { createRouter, createWebHistory } from 'vue-router'
import { api } from '../services/api'
import { currentUser, getToken, isLoggedIn, saveUser } from '../services/auth'
import EngineerLayout from '../layouts/EngineerLayout.vue'

// 路由级代码分割:视图按需加载,避免全站打进一个 chunk(首屏体积)
const LoginView = () => import('../views/LoginView.vue')
const TasksView = () => import('../views/TasksView.vue')
const ServiceSheetCreateView = () => import('../views/ServiceSheetCreateView.vue')
const TaskDetailView = () => import('../views/TaskDetailView.vue')
const TaskShareView = () => import('../views/TaskShareView.vue')
const AssetsView = () => import('../views/AssetsView.vue')
const AssetCustomersView = () => import('../views/AssetCustomersView.vue')
const AssetCustomerDetailView = () => import('../views/AssetCustomerDetailView.vue')
const AssetDevicesView = () => import('../views/AssetDevicesView.vue')
const AssetDeviceDetailView = () => import('../views/AssetDeviceDetailView.vue')
const AssetMaintenancePartiesView = () => import('../views/AssetMaintenancePartiesView.vue')
const AssetMaintenancePartyDetailView = () => import('../views/AssetMaintenancePartyDetailView.vue')
const TimesheetsView = () => import('../views/TimesheetsView.vue')
const ProfileView = () => import('../views/ProfileView.vue')

const viewLoaders = [
  LoginView,
  TasksView,
  ServiceSheetCreateView,
  TaskDetailView,
  TaskShareView,
  AssetsView,
  AssetCustomersView,
  AssetCustomerDetailView,
  AssetDevicesView,
  AssetDeviceDetailView,
  AssetMaintenancePartiesView,
  AssetMaintenancePartyDetailView,
  TimesheetsView,
  ProfileView,
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/',
      component: EngineerLayout,
      children: [
        { path: '', name: 'tasks', component: TasksView },
        { path: 'service-sheets/new', name: 'service-sheet-new', component: ServiceSheetCreateView },
        { path: 'service-sheets/:id/edit', name: 'service-sheet-edit', component: ServiceSheetCreateView },
        { path: 'tasks', redirect: { name: 'tasks' } },
        { path: 'tasks/:id', name: 'task-detail', component: TaskDetailView },
        { path: 'tasks/:id/share', name: 'task-share', component: TaskShareView },
        { path: 'assets', name: 'assets', component: AssetsView },
        { path: 'assets/customers', name: 'asset-customers', component: AssetCustomersView },
        { path: 'assets/customers/:id', name: 'asset-customer-detail', component: AssetCustomerDetailView },
        { path: 'assets/devices', name: 'asset-devices', component: AssetDevicesView },
        { path: 'assets/devices/:id', name: 'asset-device-detail', component: AssetDeviceDetailView },
        { path: 'assets/maintenance-parties', name: 'asset-maintenance-parties', component: AssetMaintenancePartiesView },
        { path: 'assets/maintenance-parties/:id', name: 'asset-maintenance-party-detail', component: AssetMaintenancePartyDetailView },
        { path: 'timesheets', name: 'timesheets', component: TimesheetsView },
        { path: 'timesheet', name: 'timesheet', component: TimesheetsView },
        { path: 'profile', name: 'profile', component: ProfileView },
      ],
    },
  ],
})

// 首屏渲染后在空闲时预取其余视图 chunk:
// 保证离线场景(工程师外勤断网)下未访问过的路由依然可以导航
router.isReady().then(() => {
  const prefetchAllViews = () => {
    for (const load of viewLoaders) {
      load().catch(() => {})
    }
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(prefetchAllViews, { timeout: 5000 })
  } else {
    setTimeout(prefetchAllViews, 2000)
  }
})

export default router

function isEngineerUser(user) {
  const workspaces = Array.isArray(user?.availableWorkspaces) ? user.availableWorkspaces : []
  if (workspaces.length > 0) return workspaces.some((workspace) => workspace.key === 'engineer')
  return user?.role === 'engineer' || user?.role === 'engineering_supervisor'
}

// /auth/me 会话校验缓存:60s 内的路由跳转不重复请求,且并发跳转共享同一个在途请求。
// 缓存按 token 区分(登出/换号自动失效);onboarding 未完成时不缓存,确保完成后立即放行。
const AUTH_ME_TTL_MS = 60_000
let sessionCache = { token: '', user: null, fetchedAt: 0 }
let sessionPending = null

async function fetchSessionUser() {
  const token = getToken()
  const cacheUsable = sessionCache.user
    && sessionCache.token === token
    && !sessionCache.user.requiresOnboarding
    && Date.now() - sessionCache.fetchedAt < AUTH_ME_TTL_MS
  if (cacheUsable) return sessionCache.user

  if (!sessionPending) {
    sessionPending = api
      .get('/auth/me')
      .then((data) => {
        sessionCache = { token, user: data.user, fetchedAt: Date.now() }
        return data.user
      })
      .finally(() => {
        sessionPending = null
      })
  }
  return sessionPending
}

router.beforeEach(async (to) => {
  if (to.name === 'login' && isLoggedIn()) return { name: 'tasks' }

  if (to.name !== 'login') {
    try {
      const user = await fetchSessionUser()
      if (!isEngineerUser(user)) return { name: 'login' }
      saveUser(user)
      if (user?.requiresOnboarding && to.name !== 'profile') return { name: 'profile' }
    } catch {
      if (!currentUser.value) return { name: 'login' }
      if (currentUser.value?.requiresOnboarding && to.name !== 'profile') return { name: 'profile' }
    }
  }
})
