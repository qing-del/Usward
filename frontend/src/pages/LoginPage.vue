<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import LoginForm from '../components/LoginForm.vue'

const route = useRoute()
const router = useRouter()
function done() {
  const next = typeof route.query.next === 'string' && route.query.next.startsWith('/')
    && !route.query.next.startsWith('//') ? route.query.next : '/me'
  router.replace(next)
}
</script>

<template>
  <div class="login-page">
    <div class="login-art"><div class="login-brand">✿ <span>Usward</span></div>
      <div class="login-illustration" aria-hidden="true">✿</div>
      <p>记住小事，<br />也为彼此留一点时间。</p></div>
    <main class="login-panel"><div class="login-card">
      <span class="eyebrow">A LITTLE SPACE FOR US</span>
      <h1 class="serif">欢迎回来。</h1>
      <p class="muted">用自己的账号，进入只属于你的空间。</p>
      <LoginForm @success="done" />
      <p class="login-help">需要重置密码？请联系私有部署的维护者。这里不通过邮箱找回账号。</p>
    </div></main>
  </div>
</template>
