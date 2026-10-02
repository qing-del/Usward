<script setup lang="ts">
import { useRouter } from 'vue-router'
import LoginForm from './components/LoginForm.vue'
import { retrySession, session } from './session'

const router = useRouter()

async function retry() {
  try { await retrySession(); await router.replace(session.user ? '/today' : '/login') }
  catch { /* The retry panel displays the updated failure. */ }
}

function reauthenticated(_user: unknown, switched: boolean) {
  if (switched) {
    window.location.assign('/today')
  }
}
</script>

<template>
  <div v-if="!session.checked && !session.bootError" class="center-state" role="status">正在打开你的空间…</div>
  <div v-else-if="session.bootError" class="center-state">
    <div class="card center-card"><h1>暂时无法连接</h1><p>{{ session.bootError }}</p>
      <button class="btn primary" @click="retry">重新尝试</button></div>
  </div>
  <div v-else :inert="session.reauthRequired"><RouterView /></div>
  <div v-if="session.reauthRequired" class="dialog-backdrop reauth-backdrop" role="presentation">
    <section class="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <span class="eyebrow">WELCOME BACK</span><h2 id="reauth-title">请重新登录</h2>
      <p class="muted">会话已结束。当前填写的内容会保留在页面上，登录后请再次确认提交。</p>
      <LoginForm @success="reauthenticated" />
    </section>
  </div>
</template>
