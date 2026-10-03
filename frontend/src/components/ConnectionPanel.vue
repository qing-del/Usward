<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Avatar from './Avatar.vue'
import BaseDialog from './BaseDialog.vue'
import { ApiError, errorMessage, request } from '../api'
import { acceptInvite, endConnection, getConnection, issueInvite, previewInvite,
  revokeInvite } from '../connection'
import type { CurrentConnection, InvitePreview, IssuedInvite } from '../connection'
import { session, updateUser } from '../session'
import type { Me } from '../types'

const emit = defineEmits<{ changed: [value: CurrentConnection | null] }>()

const current = ref<CurrentConnection | null>(null)
const issued = ref<IssuedInvite | null>(null)
const loading = ref(false)
const pending = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const receiveOpen = ref(false)
const tokenDraft = ref('')
const preview = ref<InvitePreview | null>(null)
const previewPending = ref(false)
const acceptPending = ref(false)
const receiveError = ref('')
const previewNeedsRefresh = ref(false)
const endStep = ref(0)
const endPending = ref(false)
const endError = ref('')
let sequence = 0

const connection = computed(() => current.value?.connection ?? null)
const invite = computed(() => current.value?.currentInvite ?? null)

function setCurrent(value: CurrentConnection | null) {
  current.value = value
  emit('changed', value)
}

function expiresAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: session.user?.timezone ?? 'Asia/Shanghai',
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

async function load(): Promise<boolean> {
  const userId = session.user?.id
  if (!userId) return false
  const run = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const value = await getConnection()
    if (run !== sequence || session.user?.id !== userId) return false
    const previousConnection = current.value?.connection
    setCurrent(value)
    if (issued.value && issued.value.id !== value.currentInvite?.id) issued.value = null
    if (!value.connection && endStep.value) endStep.value = 0
    else if (endStep.value === 2 && previousConnection && value.connection
      && (previousConnection.id !== value.connection.id
        || previousConnection.version !== value.connection.version)) {
      endStep.value = 1
      endError.value = '连接版本已变化。请重新查看解除影响，再决定是否继续。'
    }
    return true
  } catch (cause) {
    if (run === sequence && session.user?.id === userId) {
      setCurrent(null)
      loadError.value = errorMessage(cause)
    }
    return false
  } finally {
    if (run === sequence) loading.value = false
  }
}

watch(() => session.user?.id, (id, oldId) => {
  if (id !== oldId) {
    sequence++
    setCurrent(null)
    issued.value = null
    actionError.value = ''
    notice.value = ''
    receiveOpen.value = false
    tokenDraft.value = ''
    preview.value = null
    receiveError.value = ''
    previewNeedsRefresh.value = false
    endStep.value = 0
    endError.value = ''
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
    setCurrent({ connection: null, currentInvite: {
      id: value.id, status: value.status, expiresAt: value.expiresAt, version: value.version,
    } })
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
    setCurrent({ connection: null, currentInvite: null })
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

async function refreshMe(userId: string | undefined) {
  try {
    const me = await request<Me>('GET', '/me')
    if (session.user?.id === userId) updateUser(me)
  } catch (cause) {
    if (session.user?.id === userId) actionError.value = `连接已更新，但资料暂时无法刷新：${errorMessage(cause)}`
  }
}

function openReceive() {
  receiveError.value = ''
  receiveOpen.value = true
}

function tokenChanged() {
  preview.value = null
  previewNeedsRefresh.value = false
  receiveError.value = ''
}

async function inspectInvite() {
  if (previewPending.value || acceptPending.value) return
  const token = tokenDraft.value.trim()
  if (!token) { receiveError.value = '请输入对方给你的邀请口令。'; return }
  previewPending.value = true
  receiveError.value = ''
  previewNeedsRefresh.value = false
  const userId = session.user?.id
  try {
    const value = await previewInvite(token)
    if (session.user?.id === userId) preview.value = value
  } catch (cause) {
    if (session.user?.id !== userId) return
    preview.value = null
    receiveError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'ALREADY_CONNECTED') await load()
  } finally { previewPending.value = false }
}

async function acceptReceived() {
  if (acceptPending.value || !preview.value || previewNeedsRefresh.value) return
  const userId = session.user?.id
  const token = tokenDraft.value.trim()
  acceptPending.value = true
  receiveError.value = ''
  try {
    const value = await acceptInvite(token, preview.value.version)
    if (session.user?.id !== userId) return
    setCurrent({ connection: value, currentInvite: null })
    issued.value = null
    receiveOpen.value = false
    tokenDraft.value = ''
    preview.value = null
    notice.value = '连接已建立。过去的私人内容仍只属于各自。'
    await refreshMe(userId)
  } catch (cause) {
    if (session.user?.id !== userId) return
    receiveError.value = errorMessage(cause)
    if (cause instanceof ApiError && (cause.status === 409 || cause.code === 'NETWORK_ERROR')) {
      previewNeedsRefresh.value = true
      const refreshed = await load()
      if (!refreshed) {
        receiveError.value = '无法确认连接的最新状态。口令已保留，请重新读取后再查看邀请者。'
        return
      }
      if (current.value?.connection) {
        receiveOpen.value = false
        tokenDraft.value = ''
        preview.value = null
        notice.value = '连接状态已变化，请核对当前连接。'
        await refreshMe(userId)
      } else if (cause.code === 'NETWORK_ERROR') {
        receiveError.value = '请求结果尚不确定。口令已保留，请先重新查看邀请者，再决定是否接受。'
      }
    }
  } finally { acceptPending.value = false }
}

function startEnd() { endError.value = ''; endStep.value = 1 }

async function confirmEnd() {
  if (endPending.value || !connection.value || endStep.value !== 2) return
  const userId = session.user?.id
  endPending.value = true
  endError.value = ''
  try {
    const value = await endConnection(connection.value.version)
    if (session.user?.id !== userId) return
    setCurrent(value)
    issued.value = null
    endStep.value = 0
    notice.value = '连接已解除；自己的记录仍在，旧共同空间已不可访问。'
    await refreshMe(userId)
  } catch (cause) {
    if (session.user?.id !== userId) return
    endError.value = errorMessage(cause)
    if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404
      || cause.code === 'NETWORK_ERROR')) {
      const refreshed = await load()
      if (!refreshed) {
        endStep.value = 1
        endError.value = '无法确认连接的最新状态。请重新读取后再决定是否解除。'
        return
      }
      if (current.value?.connection) {
        endStep.value = 1
        endError.value = '连接状态可能已变化。请重新核对影响，再决定是否解除。'
      } else {
        endStep.value = 0
        notice.value = '当前已没有有效连接。'
        await refreshMe(userId)
      }
    }
  } finally { endPending.value = false }
}

defineExpose({ refresh: load })
</script>

<template>
  <section class="card connection-card">
    <div class="section-heading"><h2>{{ connection ? '我们的连接' : '邀请一个重要的人' }}</h2>
      <span class="connection-heading-actions"><span class="badge" :class="connection ? 'green' : ''">{{ connection ? '连接中' : '未连接' }}</span>
        <button class="text-button" type="button" :disabled="loading" @click="load">刷新状态</button></span></div>
    <p v-if="loading && !current" class="loading-state" role="status">正在读取连接状态…</p>
    <p v-if="loadError" class="form-error" role="alert">{{ loadError }}</p>
    <button v-if="loadError" class="text-button mt-8" :disabled="loading" @click="load">重新读取</button>
    <template v-if="current && !loading">
      <div v-if="connection" class="connection-members">
        <p v-for="member in connection.members" :key="member.id">
          <Avatar :nickname="member.nickname" :avatar-style="member.avatarStyle" small />
          <span>{{ member.nickname }} <small>{{ member.id === session.user?.id ? '我' : '对方' }}</small></span></p>
        <div class="inline-note mt-16">连接不会自动分享历史内容；记忆与承诺仍只属于作者。</div>
        <button class="text-button danger mt-16" @click="startEnd">解除连接</button>
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
          <button class="btn secondary" :disabled="pending" @click="openReceive">我收到一个邀请</button>
        </div>
      </template>
    </template>
    <p v-if="actionError" class="form-error mt-16" role="alert">{{ actionError }}</p>
    <p v-if="notice" class="form-success mt-16" role="status">{{ notice }}</p>
  </section>
  <BaseDialog :open="receiveOpen" title="看看这份连接邀请" :busy="previewPending || acceptPending"
    @close="receiveOpen = false">
    <form class="form-stack" @submit.prevent="inspectInvite">
      <div class="field"><label for="received-invite-token">对方给你的邀请口令</label>
        <input id="received-invite-token" v-model="tokenDraft" autocomplete="off" spellcheck="false"
          @input="tokenChanged" /></div>
      <p class="field-help">先查看邀请者，再决定是否连接。口令不会写入网址或本地存储。</p>
      <p v-if="receiveError" class="form-error" role="alert">{{ receiveError }}</p>
      <div v-if="preview" class="connection-preview">
        <Avatar :nickname="preview.inviter.nickname" :avatar-style="preview.inviter.avatarStyle" />
        <div><strong>{{ preview.inviter.nickname }}</strong><p>邀请你建立连接</p>
          <small>有效至 {{ expiresAt(preview.expiresAt) }}</small></div></div>
      <div v-if="preview" class="inline-note">连接不会自动分享双方过去的私人记录。</div>
      <div class="dialog-actions"><button type="button" class="btn secondary" @click="receiveOpen = false">暂不接受</button>
        <button type="submit" class="btn secondary" :disabled="previewPending || acceptPending">
          {{ previewPending ? '正在查看…' : previewNeedsRefresh ? '重新查看邀请者' : '查看邀请者' }}</button>
        <button v-if="preview" type="button" class="btn primary" :disabled="acceptPending || previewPending || previewNeedsRefresh"
          @click="acceptReceived">{{ acceptPending ? '正在接受…' : '接受连接' }}</button></div>
    </form>
  </BaseDialog>
  <BaseDialog :open="endStep > 0" :title="endStep === 1 ? '解除连接前，先看看这些变化' : '确认解除连接？'"
    :busy="endPending" @close="endStep = 0">
    <template v-if="endStep === 1"><ul class="connection-impact">
      <li>双方的忙闲展示与旧共同访问会立即停止。</li>
      <li>各自的私人记录保留；旧分享关系与评论会清除。</li>
      <li>旧表达、邀约和共同安排将无法访问，也不会自动复制为个人安排。</li>
      <li>以后重新连接，需要重新选择分享内容及标题。</li>
    </ul><div class="inline-note peach mt-16">解除不是删除；部署方的数据库备份可能仍保留历史记录。</div>
      <p v-if="endError" class="form-error mt-16" role="alert">{{ endError }}</p>
      <div class="dialog-actions mt-16"><button class="btn secondary" @click="endStep = 0">保留连接</button>
        <button class="btn danger" @click="endStep = 2">我已了解，继续</button></div></template>
    <template v-else><p>确定解除与对方的连接？这一操作会立即生效。</p>
      <p v-if="endError" class="form-error mt-16" role="alert">{{ endError }}</p>
      <div class="dialog-actions mt-16"><button class="btn secondary" @click="endStep = 1">返回查看影响</button>
        <button class="btn danger" :disabled="endPending" @click="confirmEnd">
          {{ endPending ? '正在解除…' : '确认解除连接' }}</button></div></template>
  </BaseDialog>
</template>
