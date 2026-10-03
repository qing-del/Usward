<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError, errorMessage } from '../api'
import { getConnection, issueInvite, revokeInvite } from '../connection'
import type { CurrentConnection, IssuedInvite } from '../connection'
import { session } from '../session'

const current = ref<CurrentConnection | null>(null)
const issued = ref<IssuedInvite | null>(null)
const loading = ref(false)
const pending = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
let sequence = 0

const connection = computed(() => current.value?.connection ?? null)
const invite = computed(() => current.value?.currentInvite ?? null)

function expiresAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: session.user?.timezone ?? 'Asia/Shanghai',
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

async function load() {
  const userId = session.user?.id
  if (!userId) return
  const run = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const value = await getConnection()
    if (run !== sequence || session.user?.id !== userId) return
    current.value = value
    if (issued.value && issued.value.id !== value.currentInvite?.id) issued.value = null
  } catch (cause) {
    if (run === sequence && session.user?.id === userId) loadError.value = errorMessage(cause)
  } finally {
    if (run === sequence) loading.value = false
  }
}

watch(() => session.user?.id, (id, oldId) => {
  if (id !== oldId) {
    sequence++
    current.value = null
    issued.value = null
    actionError.value = ''
    notice.value = ''
  }
  if (id) void load()
}, { immediate: true })
watch(() => session.reauthRequired, (required, wasRequired) => {
  if (wasRequired && !required && session.user) void load()
})

async function createInvite() {
  if (pending.value || connection.value) return
  pending.value = true
  actionError.value = ''
  notice.value = ''
  const userId = session.user?.id
  try {
    const value = await issueInvite()
    if (session.user?.id !== userId) return
    issued.value = value
    current.value = { connection: null, currentInvite: {
      id: value.id, status: value.status, expiresAt: value.expiresAt, version: value.version,
    } }
    notice.value = '邀请已生成。口令只会在当前页面显示，刷新后无法找回。'
  } catch (cause) {
    if (session.user?.id !== userId) return
    actionError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') {
      await load()
      if (invite.value && !issued.value) {
        actionError.value = '邀请可能已生成，但口令无法找回。请查看当前邀请状态；如需新口令，请手动重新生成。'
      }
    } else if (cause instanceof ApiError && cause.code === 'ALREADY_CONNECTED') await load()
  } finally { pending.value = false }
}

async function revoke() {
  if (pending.value || !invite.value) return
  pending.value = true
  actionError.value = ''
  notice.value = ''
  const userId = session.user?.id
  try {
    await revokeInvite(invite.value.id, invite.value.version)
    if (session.user?.id !== userId) return
    issued.value = null
    current.value = { connection: null, currentInvite: null }
    notice.value = '邀请已撤销，原口令不再可用。'
  } catch (cause) {
    if (session.user?.id !== userId) return
    actionError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.status === 409) await load()
  } finally { pending.value = false }
}

async function copyToken() {
  if (!issued.value) return
  try {
    await navigator.clipboard.writeText(issued.value.token)
    notice.value = '口令已复制，请只交给你想连接的人。'
  } catch { notice.value = '无法自动复制；请选中口令后手动复制。' }
}
</script>

<template>
  <section class="card connection-card">
    <div class="section-heading"><h2>{{ connection ? '我们的连接' : '邀请一个重要的人' }}</h2>
      <span class="badge" :class="connection ? 'green' : ''">{{ connection ? '连接中' : '未连接' }}</span></div>
    <p v-if="loading && !current" class="loading-state" role="status">正在读取连接状态…</p>
    <p v-if="loadError" class="form-error" role="alert">{{ loadError }}</p>
    <button v-if="loadError" class="text-button mt-8" :disabled="loading" @click="load">重新读取</button>
    <template v-if="current && !loading">
      <div v-if="connection" class="connection-members">
        <p v-for="member in connection.members" :key="member.id">{{ member.nickname }}
          <small>{{ member.id === session.user?.id ? '我' : '对方' }}</small></p>
        <div class="inline-note mt-16">连接不会自动分享历史内容；记忆与承诺仍只属于作者。</div>
      </div>
      <template v-else>
        <p class="muted mt-8">记忆、安排、承诺和私人提醒，不连接也能使用。</p>
        <div v-if="invite" class="inline-note mt-16">
          <p>已有待发邀请，有效至 {{ expiresAt(invite.expiresAt) }}。</p>
          <p>{{ issued?.id === invite.id ? '口令目前仅在本页可见。' : '口令已无法重显，可以撤销或重新生成。' }}</p>
        </div>
        <div v-if="issued && issued.id === invite?.id" class="field mt-16">
          <label for="issued-invite-token">一次性连接口令</label>
          <div class="token-row"><input id="issued-invite-token" :value="issued.token" readonly autocomplete="off" />
            <button class="btn secondary" type="button" @click="copyToken">复制</button></div>
        </div>
        <p class="field-help mt-8">邀请有效期为 24 小时。生成新邀请会使旧口令失效。</p>
        <div class="connection-actions mt-16">
          <button class="btn primary" :disabled="pending" @click="createInvite">
            {{ pending ? '正在处理…' : invite ? '重新生成邀请' : '生成连接邀请' }}</button>
          <button v-if="invite" class="text-button danger" :disabled="pending" @click="revoke">撤销邀请</button>
        </div>
      </template>
    </template>
    <p v-if="actionError" class="form-error mt-16" role="alert">{{ actionError }}</p>
    <p v-if="notice" class="form-success mt-16" role="status">{{ notice }}</p>
  </section>
</template>
