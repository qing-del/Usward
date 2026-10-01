<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { errorMessage } from '../api'
import { login } from '../session'
import type { Me } from '../types'

const emit = defineEmits<{ success: [user: Me, switched: boolean] }>()
const username = ref('')
const password = ref('')
const pending = ref(false)
const error = ref('')
const showPassword = ref(false)
const usernameInput = ref<HTMLInputElement | null>(null)

onMounted(async () => { await nextTick(); usernameInput.value?.focus() })

async function submit() {
  if (pending.value) return
  error.value = ''
  pending.value = true
  try {
    const result = await login(username.value.trim(), password.value)
    password.value = ''
    emit('success', result.user, result.switched)
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="form-stack" @submit.prevent="submit">
    <div class="field"><label for="login-username">账号</label>
      <input id="login-username" ref="usernameInput" v-model="username" autocomplete="username"
        maxlength="100" required placeholder="由部署者提供的账号" /></div>
    <div class="field"><label for="login-password">密码</label>
      <div class="input-action"><input id="login-password" v-model="password"
        :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required />
        <button type="button" class="text-button" :aria-pressed="showPassword" @click="showPassword = !showPassword">
          {{ showPassword ? '隐藏' : '显示' }}
        </button></div></div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <button class="btn primary full" type="submit" :disabled="pending">{{ pending ? '正在登录…' : '进入我的空间' }}</button>
  </form>
</template>
