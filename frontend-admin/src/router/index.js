import { createRouter, createWebHistory } from 'vue-router'
import { api } from '../services/api'
import { clearSession, isLoggedIn, saveUser } from '../services/auth'
import AdminLayout from '../layouts/AdminLayout.vue'
import AuditLogsView from '../views/AuditLogsView.vue'
import CustomersView from '../views/CustomersView.vue'
import DashboardView from '../views/DashboardView.vue'
import LoginView from '../views/LoginView.vue'
import ServiceOrdersView from '../views/ServiceOrdersView.vue'
import TimesheetsView from '../views/TimesheetsView.vue'
import UsersView from '../views/UsersView.vue'

const adminAccessRoles = new Set(['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'sales'])
const routeAccessRoles = {
  users: ['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor'],
  'audit-logs': ['admin', 'supervisor', 'engineering_supervisor'],
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: '', name: 'dashboard', component: DashboardView },
        { path: 'service-orders', name: 'service-orders', component: ServiceOrdersView },
        { path: 'customers', name: 'customers', component: CustomersView },
        { path: 'timesheets', name: 'timesheets', component: TimesheetsView },
        { path: 'users', name: 'users', component: UsersView },
        { path: 'audit-logs', name: 'audit-logs', component: AuditLogsView },
      ],
    },
  ],
})

export default router

router.beforeEach(async (to) => {
  if (!isLoggedIn()) {
    if (to.name !== 'login') return { name: 'login' }
    return true
  }

  try {
    const data = await api.get('/auth/me')
    if (!adminAccessRoles.has(data.user?.role)) {
      clearSession()
      return { name: 'login' }
    }
    saveUser(data.user)
    const allowedRoles = routeAccessRoles[to.name]
    if (allowedRoles && !allowedRoles.includes(data.user?.role)) {
      return { name: 'dashboard' }
    }
    if (to.name === 'login') return { name: 'dashboard' }
  } catch {
    clearSession()
    if (to.name !== 'login') return { name: 'login' }
  }

  return true
})
