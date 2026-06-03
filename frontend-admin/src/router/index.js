import { createRouter, createWebHistory } from 'vue-router'
import { api } from '../services/api'
import { ADMIN_ACCESS_ROLES, ROUTE_ACCESS_ROLES } from '../config/navigation'
import { clearSession, isLoggedIn, saveUser } from '../services/auth'
import AdminLayout from '../layouts/AdminLayout.vue'
import AuditLogsView from '../views/AuditLogsView.vue'
import CustomersView from '../views/CustomersView.vue'
import DashboardView from '../views/DashboardView.vue'
import DeviceManagementView from '../views/DeviceManagementView.vue'
import InspectionSchedulesView from '../views/InspectionSchedulesView.vue'
import LoginView from '../views/LoginView.vue'
import MaintenancePartiesView from '../views/MaintenancePartiesView.vue'
import ServiceOrdersView from '../views/ServiceOrdersView.vue'
import TimesheetsView from '../views/TimesheetsView.vue'
import UsersView from '../views/UsersView.vue'

const adminAccessRoles = new Set(ADMIN_ACCESS_ROLES)

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
        { path: 'inspection-schedules', name: 'inspection-schedules', component: InspectionSchedulesView },
        { path: 'devices', name: 'devices', component: DeviceManagementView },
        { path: 'customers', name: 'customers', component: CustomersView },
        { path: 'maintenance-parties', name: 'maintenance-parties', component: MaintenancePartiesView },
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
    const allowedRoles = ROUTE_ACCESS_ROLES[to.name]
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
