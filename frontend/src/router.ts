import { createRouter, createWebHistory } from 'vue-router'
import { ensureSession, session } from './session'
import LoginPage from './pages/LoginPage.vue'
import MePage from './pages/MePage.vue'
import MemoriesPage from './pages/MemoriesPage.vue'
import CalendarPage from './pages/CalendarPage.vue'
import TodayPage from './pages/TodayPage.vue'
import CommitmentsPage from './pages/CommitmentsPage.vue'
import RemindersPage from './pages/RemindersPage.vue'
import NotificationsPage from './pages/NotificationsPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/today', name: 'today', component: TodayPage },
    { path: '/login', name: 'login', component: LoginPage, meta: { public: true } },
    { path: '/me', name: 'me', component: MePage },
    { path: '/memories', name: 'memories', component: MemoriesPage },
    { path: '/calendar', name: 'calendar', component: CalendarPage },
    { path: '/commitments', name: 'commitments', component: CommitmentsPage },
    { path: '/reminders', name: 'reminders', component: RemindersPage },
    { path: '/notifications', name: 'notifications', component: NotificationsPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async to => {
  try { await ensureSession() } catch { return true }
  if (!to.meta.public && !session.user) return { name: 'login', query: { next: to.fullPath } }
  if (to.meta.public && session.user) return { name: 'today' }
  return true
})
