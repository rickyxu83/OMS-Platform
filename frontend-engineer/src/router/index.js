import { createRouter, createWebHistory } from 'vue-router'
import { api } from '../services/api'
import { currentUser, isLoggedIn, saveUser } from '../services/auth'
import EngineerLayout from '../layouts/EngineerLayout.vue'
import LoginView from '../views/LoginView.vue'
import ProfileView from '../views/ProfileView.vue'
import ServiceSheetCreateView from '../views/ServiceSheetCreateView.vue'
import TaskDetailView from '../views/TaskDetailView.vue'
import TaskShareView from '../views/TaskShareView.vue'
import TasksView from '../views/TasksView.vue'
import TimesheetsView from '../views/TimesheetsView.vue'

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
        { path: 'timesheets', name: 'timesheets', component: TimesheetsView },
        { path: 'timesheet', name: 'timesheet', component: TimesheetsView },
        { path: 'profile', name: 'profile', component: ProfileView },
      ],
    },
  ],
})

export default router

router.beforeEach(async (to) => {
  if (to.name !== 'login' && !isLoggedIn()) return { name: 'login' }
  if (to.name === 'login' && isLoggedIn()) return { name: 'tasks' }

  if (to.name !== 'login' && isLoggedIn()) {
    try {
      const data = await api.get('/auth/me')
      if (data.user?.role !== 'engineer') return { name: 'login' }
      saveUser(data.user)
    } catch {
      if (!currentUser.value) return { name: 'login' }
    }
  }
})
