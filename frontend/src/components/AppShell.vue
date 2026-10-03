<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Avatar from './Avatar.vue'
import { session } from '../session'
import { startUnreadPolling, unread } from '../unread'

const route = useRoute()
const items = [
  { to: '/today', label: '今天', symbol: '☼' },
  { to: '/calendar', label: '日历', symbol: '▦' },
  { to: '/memories', label: '记忆', symbol: '✿' },
  { to: '/me', label: '我的', symbol: '◌' },
]
const title = computed(() => route.path === '/commitments' ? '我的承诺'
  : route.path === '/reminders' ? '私人提醒'
    : route.path === '/notifications' ? '站内通知'
  : items.find(item => item.to === route.path)?.label ?? '我的空间')
let stopPolling: (() => void) | null = null
onMounted(() => { stopPolling = startUnreadPolling(route.path !== '/today' && route.path !== '/notifications') })
onBeforeUnmount(() => { stopPolling?.(); stopPolling = null })
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="site-layout">
    <aside class="sidebar">
      <RouterLink to="/today" class="brand"><span class="brand-mark">✿</span><span>Usward</span></RouterLink>
      <p class="brand-caption">把心意，放进日常</p>
      <p class="side-label">OUR EVERYDAY</p>
      <nav class="side-nav" aria-label="主导航">
        <RouterLink v-for="item in items" :key="item.to" :to="item.to" class="nav-item"
          :aria-current="route.path === item.to ? 'page' : undefined">
          <span class="nav-symbol" aria-hidden="true">{{ item.symbol }}</span>{{ item.label }}
        </RouterLink>
      </nav>
      <div class="side-note"><span class="note-flower">✿</span><p>不必事事完美，<br />愿我们好好记得。</p></div>
      <RouterLink to="/me" class="side-user" v-if="session.user">
        <Avatar :nickname="session.user.nickname" :avatar-style="session.user.avatarStyle" small />
        <span><strong>{{ session.user.nickname }}</strong><small>我的私人空间</small></span>
      </RouterLink>
    </aside>
    <div class="site-main">
      <header class="topbar">
        <div class="breadcrumb">我的空间 <span>/</span> <strong>{{ title }}</strong></div>
        <div class="topbar-actions"><RouterLink to="/notifications" class="notification-bell"
          :aria-current="route.path === '/notifications' ? 'page' : undefined"
          :aria-label="unread.count === null ? '站内通知，未读数待确认' : `站内通知，${unread.count} 条未读`">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
            <path d="M10 21h4" /></svg><span v-if="unread.count" class="notification-count">{{ unread.count > 99 ? '99+' : unread.count }}</span></RouterLink>
          <RouterLink to="/me" class="top-user" v-if="session.user">
            <span class="top-private">仅自己可见</span>
            <Avatar :nickname="session.user.nickname" :avatar-style="session.user.avatarStyle" small />
          </RouterLink></div>
      </header>
      <main id="main-content" class="page-content" tabindex="-1"><slot /></main>
      <footer class="page-footer">✿　记住小事，也为彼此留一点时间。</footer>
    </div>
    <nav class="bottom-nav" aria-label="手机主导航">
      <RouterLink v-for="item in items" :key="item.to" :to="item.to" class="bottom-item"
        :aria-current="route.path === item.to ? 'page' : undefined">
        <span aria-hidden="true">{{ item.symbol }}</span><small>{{ item.label }}</small>
      </RouterLink>
    </nav>
  </div>
</template>
