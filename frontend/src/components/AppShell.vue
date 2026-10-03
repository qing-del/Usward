<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Avatar from './Avatar.vue'
import { session } from '../session'

const route = useRoute()
const items = [
  { to: '/today', label: '今天', symbol: '☼' },
  { to: '/calendar', label: '日历', symbol: '▦' },
  { to: '/memories', label: '记忆', symbol: '✿' },
  { to: '/me', label: '我的', symbol: '◌' },
]
const title = computed(() => route.path === '/commitments' ? '我的承诺'
  : route.path === '/reminders' ? '私人提醒'
  : items.find(item => item.to === route.path)?.label ?? '我的空间')
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
        <RouterLink to="/me" class="top-user" v-if="session.user">
          <span class="top-private">仅自己可见</span>
          <Avatar :nickname="session.user.nickname" :avatar-style="session.user.avatarStyle" small />
        </RouterLink>
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
