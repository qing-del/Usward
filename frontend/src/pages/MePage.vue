<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import Avatar from '../components/Avatar.vue'
import ConnectionPanel from '../components/ConnectionPanel.vue'
import type { CurrentConnection, PairConnection } from '../connection'
import { ApiError, errorMessage, request } from '../api'
import { clearSession, logout, session, updateUser } from '../session'
import type { AvatarStyle, Me } from '../types'

const router = useRouter()
const avatars: { value: AvatarStyle; label: string }[] = [
  { value: 'INITIAL', label: '昵称字' }, { value: 'FLOWER', label: '小花' },
  { value: 'SUN', label: '小太阳' }, { value: 'SPROUT', label: '新芽' },
]
const form = reactive({ nickname: '', avatarStyle: 'INITIAL' as AvatarStyle,
  timezone: 'Asia/Shanghai', notificationEmail: '' })
const password = reactive({ oldPassword: '', newPassword: '' })
const profileVersion = ref('')
const profilePending = ref(false)
const passwordPending = ref(false)
const logoutPending = ref(false)
const profileError = ref('')
const passwordError = ref('')
const actionError = ref('')
const notice = ref('')
const latest = ref<Me | null>(null)
const initializedUserId = ref<string | null>(null)
const connectionPanel = ref<InstanceType<typeof ConnectionPanel> | null>(null)
const currentConnection = ref<PairConnection | null>(null)
const connectionKnown = ref(false)
const visibilityPending = ref(false)
const visibilityError = ref('')
const visibilityNotice = ref('')
const visibilityLatest = ref<Me | null>(null)

function resetFromUser(user: Me) {
  form.nickname = user.nickname
  form.avatarStyle = user.avatarStyle
  form.timezone = user.timezone
  form.notificationEmail = user.notificationEmail ?? ''
  profileVersion.value = user.version
}
watch(() => session.user, user => {
  if (user && initializedUserId.value !== user.id) {
    resetFromUser(user)
    initializedUserId.value = user.id
    currentConnection.value = null
    connectionKnown.value = false
    visibilityLatest.value = null
  }
}, { immediate: true })

function connectionChanged(value: CurrentConnection | null) {
  currentConnection.value = value?.connection ?? null
  connectionKnown.value = value !== null
}

async function saveVisibility(next: boolean) {
  if (!session.user || visibilityPending.value || !connectionKnown.value) return
  visibilityError.value = ''
  visibilityNotice.value = ''
  if (next && !currentConnection.value) {
    visibilityError.value = '请先建立连接，再开启忙闲共享。'
    return
  }
  visibilityPending.value = true
  const userId = session.user.id
  try {
    const user = await request<Me>('PATCH', '/me', {
      expectedVersion: session.user.version, shareAvailability: next,
    })
    if (session.user?.id !== userId) return
    updateUser(user)
    profileVersion.value = user.version
    visibilityLatest.value = null
    visibilityNotice.value = next ? '忙闲共享已开启。对方只会看到时间与状态。' : '忙闲共享已关闭。'
  } catch (cause) {
    if (session.user?.id !== userId) return
    visibilityError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT') {
      try { visibilityLatest.value = await request<Me>('GET', '/me') } catch { /* Keep current choice. */ }
    }
    if (cause instanceof ApiError && (cause.code === 'CONNECTION_REQUIRED' || cause.status === 409)) {
      await connectionPanel.value?.refresh()
    }
  } finally { visibilityPending.value = false }
}

function useLatestVisibility() {
  if (!visibilityLatest.value) return
  updateUser(visibilityLatest.value)
  visibilityLatest.value = null
  visibilityError.value = '已采用最新资料。请核对忙闲状态，再决定是否修改。'
}

function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat('zh-CN', { timeZone: value }); return true }
  catch { return false }
}

async function saveProfile() {
  if (profilePending.value) return
  profileError.value = ''
  notice.value = ''
  if (!form.nickname.trim()) { profileError.value = '请填写昵称。'; return }
  if (!validTimezone(form.timezone.trim())) { profileError.value = '请填写有效的 IANA 时区。'; return }
  profilePending.value = true
  try {
    const user = await request<Me>('PATCH', '/me', {
      expectedVersion: profileVersion.value, nickname: form.nickname.trim(),
      avatarStyle: form.avatarStyle, timezone: form.timezone.trim(),
      notificationEmail: form.notificationEmail.trim() || null,
    })
    updateUser(user)
    profileVersion.value = user.version
    latest.value = null
    notice.value = '个人资料已保存。'
  } catch (cause) {
    profileError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT') {
      try { latest.value = await request<Me>('GET', '/me') } catch { /* Keep the draft. */ }
    }
  } finally { profilePending.value = false }
}

function acceptLatestVersion() {
  if (!latest.value) return
  profileVersion.value = latest.value.version
  latest.value = null
  profileError.value = '版本已更新，请核对当前输入后再次保存。'
}

async function changePassword() {
  if (passwordPending.value) return
  passwordError.value = ''
  if (!password.oldPassword || !password.newPassword) {
    passwordError.value = '请填写当前密码和新密码。'; return
  }
  passwordPending.value = true
  try {
    await request<void>('POST', '/me/password', { ...password })
    password.oldPassword = ''
    password.newPassword = ''
    clearSession()
    await router.replace('/login')
  } catch (cause) { passwordError.value = errorMessage(cause) }
  finally { passwordPending.value = false }
}

async function signOut() {
  if (logoutPending.value) return
  actionError.value = ''
  logoutPending.value = true
  try { await logout(); await router.replace('/login') }
  catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      clearSession(); await router.replace('/login')
    } else actionError.value = errorMessage(cause)
  } finally { logoutPending.value = false }
}
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">MY LITTLE SPACE</span>
      <h1 class="serif">照顾好自己的空间。</h1>
      <p class="subtitle">资料和设置只属于你。每次分享都需要明确选择。</p></div></div>
    <div class="settings-grid" v-if="session.user">
      <section class="card profile-card">
        <div class="section-heading"><h2>个人资料</h2><span class="badge">仅自己可见</span></div>
        <div class="profile-preview"><Avatar :nickname="form.nickname || session.user.nickname" :avatar-style="form.avatarStyle" />
          <div><strong>{{ form.nickname || session.user.nickname }}</strong><small>@{{ session.user.username }}</small></div></div>
        <form class="form-stack" @submit.prevent="saveProfile">
          <div class="field"><label for="nickname">昵称</label>
            <input id="nickname" v-model="form.nickname" maxlength="100" required /></div>
          <fieldset class="avatar-choices"><legend>内置头像</legend>
            <label v-for="choice in avatars" :key="choice.value" class="avatar-choice"
              :class="{ selected: form.avatarStyle === choice.value }">
              <input v-model="form.avatarStyle" type="radio" name="avatar" :value="choice.value" />
              <Avatar :nickname="form.nickname || session.user.nickname" :avatar-style="choice.value" small />
              <span>{{ choice.label }}</span></label></fieldset>
          <div class="field"><label for="timezone">显示时区</label>
            <input id="timezone" v-model="form.timezone" list="common-timezones" required maxlength="64"
              autocomplete="off" spellcheck="false" />
            <datalist id="common-timezones"><option value="Asia/Shanghai" /><option value="Asia/Tokyo" />
              <option value="Europe/London" /><option value="America/New_York" /></datalist>
            <p class="field-help">使用 IANA 时区名称。修改后，已有安排的绝对时间不会改变。</p></div>
          <div class="field"><label for="notification-email">通知收件邮箱 <small>可选</small></label>
            <input id="notification-email" v-model="form.notificationEmail" type="email" autocomplete="email"
              maxlength="320" placeholder="name@example.com" />
            <p class="field-help">可保存邮箱；目前尚未启用邮件通知或邮件提醒。</p></div>
          <p v-if="profileError" class="form-error" role="alert">{{ profileError }}</p>
          <div v-if="latest" class="inline-note peach"><p>资料在其他位置发生了变化。你的输入仍保留。</p>
            <button type="button" class="text-button" @click="acceptLatestVersion">使用最新版本后核对并重试</button></div>
          <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
          <button type="submit" class="btn primary" :disabled="profilePending">{{ profilePending ? '正在保存…' : '保存个人资料' }}</button>
        </form>
      </section>
      <div class="settings-side">
        <ConnectionPanel ref="connectionPanel" @changed="connectionChanged" />
        <RouterLink to="/notifications" class="card account-link"><span class="section-heading"><strong>站内通知</strong>
          <span class="badge">查看收件箱</span></span>
          <span class="muted">查看私人提醒和共享记忆互动的站内消息　↗</span></RouterLink>
        <RouterLink to="/reminders" class="card account-link"><span class="section-heading"><strong>我的私人提醒</strong>
          <span class="badge">只提醒自己</span></span>
          <span class="muted">查看待触发、已触发和已取消的设置　↗</span></RouterLink>
        <RouterLink to="/commitments" class="card account-link"><span class="section-heading"><strong>我的承诺</strong>
          <span class="badge">{{ session.user.stats.openCommitmentCount }} 条进行中</span></span>
          <span class="muted">看看自己愿意做的下一步　↗</span></RouterLink>
        <RouterLink to="/memories?archived=1" class="card account-link"><span class="section-heading"><strong>已归档记忆</strong>
          <span class="badge">{{ session.user.stats.archivedMemoryCount }} 张</span></span>
          <span class="muted">翻看自己收好的卡片　↗</span></RouterLink>
        <section class="card soft"><div class="section-heading"><h2>忙闲共享</h2>
          <span class="badge">{{ currentConnection ? session.user.shareAvailability ? '已开启' : '已关闭' : '仅自己可见' }}</span></div>
          <p class="muted">{{ currentConnection ? '开启后，对方能看到你主动标注的时间和忙闲状态。标题还需逐条选择公开。' : '建立连接后可选择开启；当前个人安排保持私密。' }}</p>
          <button class="visibility-switch mt-16" role="switch" type="button"
            :aria-checked="!!currentConnection && session.user.shareAvailability"
            :disabled="!connectionKnown || !currentConnection || visibilityPending"
            @click="saveVisibility(!session.user.shareAvailability)">
            <span class="visibility-track" aria-hidden="true" />
            {{ visibilityPending ? '正在保存…' : '向当前连接展示忙闲' }}
          </button>
          <p class="field-help mt-8">个人备注和地点始终私密；未标注的时间不代表有空。</p>
          <p v-if="visibilityError" class="form-error mt-16" role="alert">{{ visibilityError }}</p>
          <div v-if="visibilityLatest" class="inline-note peach mt-16"><p>资料版本已变化，服务端忙闲状态为「{{ visibilityLatest.shareAvailability ? '已开启' : '已关闭' }}」。</p>
            <button class="text-button" @click="useLatestVisibility">采用最新资料后核对</button></div>
          <p v-if="visibilityNotice" class="form-success mt-16" role="status">{{ visibilityNotice }}</p>
        </section>
        <section class="card"><h2>修改密码</h2><p class="muted mt-8">保存后，当前和其他设备的会话都会结束。</p>
          <form class="form-stack mt-16" @submit.prevent="changePassword">
            <div class="field"><label for="old-password">当前密码</label>
              <input id="old-password" v-model="password.oldPassword" type="password" autocomplete="current-password" required /></div>
            <div class="field"><label for="new-password">新密码</label>
              <input id="new-password" v-model="password.newPassword" type="password" autocomplete="new-password" required /></div>
            <p v-if="passwordError" class="form-error" role="alert">{{ passwordError }}</p>
            <button class="btn secondary" type="submit" :disabled="passwordPending">{{ passwordPending ? '正在修改…' : '修改密码' }}</button>
          </form></section>
        <section class="card"><h2>账号</h2><p class="muted mt-8">退出后需要重新输入账号和密码。</p>
          <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
          <button class="text-button danger mt-16" :disabled="logoutPending" @click="signOut">
            {{ logoutPending ? '正在退出…' : '退出登录' }}</button></section>
      </div>
    </div>
  </AppShell>
</template>
