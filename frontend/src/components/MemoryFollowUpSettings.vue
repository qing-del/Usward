<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ApiError, errorMessage } from '../api'
import { getMemoryActionCapabilities, getMemoryNotificationSetting,
  putMemoryNotificationSetting } from '../memories'
import type { FollowUpMode, MemoryNotificationSetting,
  MemoryNotificationSettingDetail } from '../memories'
import { session } from '../session'

const props = defineProps<{ memoryId: string; isOwner: boolean;
  setting: MemoryNotificationSetting | null }>()
const emit = defineEmits<{ changed: [value: MemoryNotificationSetting]; unavailable: [id: string];
  busy: [value: boolean] }>()

const current = ref<MemoryNotificationSettingDetail | null>(null)
const latest = ref<MemoryNotificationSettingDetail | null>(null)
const draft = ref<FollowUpMode>('IN_APP')
const mailAvailable = ref(false)
const editing = ref(false)
const loading = ref(false)
const pending = ref(false)
const reviewRequired = ref(false)
const error = ref('')
const notice = ref('')
let sequence = 0
watch([loading, pending], () => emit('busy', loading.value || pending.value))

function label(mode: FollowUpMode): string {
  return mode === 'NONE' ? '不通知' : mode === 'IN_APP' ? '站内通知' : '站内及邮件（历史设置）'
}

async function load(review = false) {
  const id = props.memoryId
  const userId = session.user?.id
  const run = ++sequence
  loading.value = true
  try {
    const [setting, capability] = await Promise.all([
      getMemoryNotificationSetting(id),
      getMemoryActionCapabilities(id, props.isOwner ? 'MEMORY_EDIT' : 'MEMORY_COMMENT'),
    ])
    if (run !== sequence || session.user?.id !== userId || props.memoryId !== id) return
    mailAvailable.value = capability.selfMailAvailable
    if (review || editing.value) {
      latest.value = setting
      reviewRequired.value = true
    } else current.value = setting
    error.value = review ? '请核对服务端当前设置，再决定是否保存你的选择。' : ''
  } catch (cause) {
    if (run !== sequence || session.user?.id !== userId) return
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 400)) {
      emit('unavailable', id)
    } else error.value = errorMessage(cause)
  } finally { if (run === sequence) loading.value = false }
}

onMounted(() => { void load() })
watch(() => props.setting, value => {
  if (!value) return
  if (editing.value && value.version !== current.value?.version) {
    latest.value = { resourceType: 'MEMORY_CARD', resourceId: props.memoryId, ...value }
    reviewRequired.value = true
  } else if (!editing.value) {
    current.value = { resourceType: 'MEMORY_CARD', resourceId: props.memoryId, ...value }
  }
})
watch(() => session.user?.id, () => {
  sequence++
  current.value = null
  latest.value = null
  editing.value = false
  reviewRequired.value = false
  error.value = ''
  notice.value = ''
})
watch(() => session.reauthRequired, (required, wasRequired) => {
  if (wasRequired && !required && session.user) void load(editing.value)
})

function beginEdit() {
  draft.value = current.value?.followUpMode ?? props.setting?.followUpMode ?? 'IN_APP'
  editing.value = true
  reviewRequired.value = false
  latest.value = null
  error.value = ''
  notice.value = ''
}

function acceptLatest() {
  if (!latest.value) return
  current.value = latest.value
  emit('changed', { followUpMode: latest.value.followUpMode, version: latest.value.version })
  latest.value = null
  reviewRequired.value = false
  error.value = '已采用最新版本。请核对你的选择后再次提交。'
}

async function save() {
  if (pending.value || loading.value || reviewRequired.value || !current.value) return
  pending.value = true
  error.value = ''
  notice.value = ''
  const userId = session.user?.id
  try {
    const saved = await putMemoryNotificationSetting(props.memoryId, draft.value,
      current.value.version)
    if (session.user?.id !== userId) return
    current.value = saved
    emit('changed', { followUpMode: saved.followUpMode, version: saved.version })
    editing.value = false
    notice.value = '自己的后续通知设置已保存。'
  } catch (cause) {
    if (session.user?.id !== userId) return
    error.value = errorMessage(cause)
    if (cause instanceof ApiError && (cause.code === 'NOTIFICATION_SETTING_CONFLICT'
      || cause.code === 'NETWORK_ERROR' || cause.status >= 500)) {
      reviewRequired.value = true
      await load(true)
    } else if (cause instanceof ApiError && cause.status === 404) emit('unavailable', props.memoryId)
  } finally { pending.value = false }
}
</script>

<template>
  <section class="memory-followup-section" aria-label="我的后续通知设置">
    <div class="section-heading"><h3>这张卡片有新互动时</h3><span class="badge green">只改我的设置</span></div>
    <p class="muted">对方补充或作者修改原文后，按你保存的方式通知你；这不影响对方的设置，也不是私人到时提醒。</p>
    <p v-if="loading && !current" class="loading-state" role="status">正在读取通知设置…</p>
    <p v-else-if="current && !editing" class="muted mt-8">当前：{{ label(current.followUpMode) }}</p>
    <p v-if="error" class="form-error mt-16" role="alert">{{ error }}</p>
    <button v-if="error && !current" class="text-button mt-8" :disabled="loading" @click="load()">重新读取</button>
    <p v-if="notice" class="form-success mt-16" role="status">{{ notice }}</p>
    <button v-if="current && !editing" type="button" class="btn secondary mt-16" @click="beginEdit">调整我的通知</button>
    <form v-if="editing" class="form-stack mt-16" @submit.prevent="save">
      <div class="field"><label for="memory-followup-mode">以后怎样通知我</label>
        <select id="memory-followup-mode" v-model="draft">
          <option value="IN_APP">站内通知</option><option value="NONE">不通知</option>
          <option value="IN_APP_AND_MAIL" :disabled="!mailAvailable">站内 + 邮件{{ mailAvailable ? '' : '（当前不可用）' }}</option>
        </select></div>
      <p v-if="!mailAvailable" class="field-help">邮件发送尚未启用；历史邮件设置可改为站内通知或不通知。</p>
      <div v-if="reviewRequired" class="inline-note peach"><p>服务端当前设置：{{ latest ? `${label(latest.followUpMode)} · 版本 ${latest.version ?? '未创建'}` : '暂时无法读取' }}。</p>
        <button v-if="latest" type="button" class="text-button" @click="acceptLatest">采用最新版本后核对</button>
        <button v-else type="button" class="text-button" :disabled="loading" @click="load(true)">重新读取</button></div>
      <div class="dialog-actions"><button type="button" class="btn secondary" :disabled="pending" @click="editing = false">返回详情</button>
        <button type="submit" class="btn primary" :disabled="pending || loading || reviewRequired || !current">
          {{ pending ? '正在保存…' : '保存通知方式' }}</button></div>
    </form>
  </section>
</template>
