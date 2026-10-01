import { createRouter, createWebHistory } from 'vue-router'
import { ensureSession, session } from './session'
import LoginPage from './pages/LoginPage.vue'
import MePage from './pages/MePage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/me' },
    { path: '/login', name: 'login', component: LoginPage, meta: { public: true } },
    { path: '/me', name: 'me', component: MePage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async to => {
  try { await ensureSession() } catch { return true }
  if (!to.meta.public && !session.user) return { name: 'login', query: { next: to.fullPath } }
  if (to.meta.public && session.user) return { name: 'me' }
  return true
})
