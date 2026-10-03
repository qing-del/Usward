<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ApiError, errorMessage } from '../api'
import { cancelReminder, getResourceReminder, putReminder, reminderStatusLabels } from '../reminders'
import type { ReminderDeliveryMode, ReminderDetail, ReminderResourceType } from '../reminders'
import { session } from '../session'
import { fromLocal, localCandidates, offsetAt, toLocal } from '../time'

const props = defineProps<{
  resourceType: ReminderResourceType
  resourceId: string
  reminder: ReminderDetail | null
}>()
const emit = defineEmits<{ changed: [value: ReminderDetail | null] }>()
const current = ref<ReminderDetail | null>(props.reminder)
const editing = ref(false)
const pending = ref(false)
const error = ref('')
const notice = ref('')
const reviewRequired = ref(false)
const latest = ref<ReminderDetail | null>(null)
const draft = reactive({ mode: 'NONE' as ReminderDeliveryMode | 'NONE', local: '', offset: '' })
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
const candidates = computed(() => {
  if (!draft.local) return []
  try { return localCandidates(draft.local, timezone.value) }
  catch { return [] }
})
const mailAvailable = computed(() => !!session.user?.mailReminderAvailable
  && !!session.user.notificationEmail)

watch(() => props.reminder, value => {
  if (value?.revision !== current.value?.revision || value?.status !== current.value?.status) {
    if (editing.value) {
      latest.value = value
      reviewRequired.value = true
      error.value = '提醒已在其他位置变化，请核对最新状态。'
    } else current.value = value
  }
})
watch(() => session.reauthRequired, (required, previous) => {
  if (previous && !required && editing.value) void loadLatest('重新登录后请核对当前提醒，再提交。')
})

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function beginEdit() {
  const item = current.value
  draft.mode = item?.status === 'PENDING' ? item.deliveryMode : 'NONE'
  draft.local = item?.status === 'PENDING' ? toLocal(item.scheduledAt, timezone.value) : ''
  draft.offset = item?.status === 'PENDING' ? offsetAt(item.scheduledAt, timezone.value) : ''
  editing.value = true
  error.value = ''
  notice.value = ''
  reviewRequired.value = false
  latest.value = null
}

async function loadLatest(message: string): Promise<ReminderDetail | null | undefined> {
  try {
    const value = await getResourceReminder(props.resourceType, props.resourceId)
    latest.value = value
    reviewRequired.value = true
    error.value = message
    return value
  } catch (cause) {
    error.value = cause instanceof ApiError && cause.status === 404
      ? '关联内容已不可访问，请返回列表。' : errorMessage(cause)
    return undefined
  }
}

function acceptLatest() {
  current.value = latest.value
  emit('changed', latest.value)
  latest.value = null
  reviewRequired.value = false
  error.value = '请核对当前选择和时间，然后再次提交。'
}

async function save() {
  if (pending.value || reviewRequired.value) return
  error.value = ''
  notice.value = ''
  let scheduledAt = ''
  if (draft.mode !== 'NONE') {
    if (!draft.local) { error.value = '请选择提醒时间。'; return }
    try { scheduledAt = fromLocal(draft.local, timezone.value, draft.offset) }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '提醒时间无效。'; return }
    if (draft.mode === 'IN_APP_AND_MAIL' && !mailAvailable.value) {
      error.value = '邮件提醒尚不可用，请选择站内通知。'
      return
    }
  }
  pending.value = true
  const previous = current.value
  try {
    if (draft.mode === 'NONE' && (!previous || previous.status === 'CANCELLED')) {
      editing.value = false
      notice.value = '目前没有有效的提醒。'
      return
    }
    const saved = draft.mode === 'NONE'
      ? await cancelReminder(previous!.id, previous!.revision)
      : await putReminder({ resourceType: props.resourceType, resourceId: props.resourceId,
        scheduledAt, deliveryMode: draft.mode, expectedRevision: previous?.revision ?? null })
    current.value = saved
    emit('changed', saved)
    editing.value = false
    notice.value = draft.mode === 'NONE' ? '提醒已取消。' : '私人提醒已保存。'
  } catch (cause) {
    error.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'REMINDER_REVISION_CONFLICT') {
      await loadLatest('提醒修订已变化。你的时间和方式仍保留，请核对最新状态。')
    } else if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') {
      const fetched = await loadLatest('连接中断。请核对服务端状态，再决定是否重试。')
      if (fetched && fetched.revision !== previous?.revision
        && (draft.mode === 'NONE' ? fetched.status === 'CANCELLED'
          : fetched.status === 'PENDING' && fetched.deliveryMode === draft.mode
            && Date.parse(fetched.scheduledAt) === Date.parse(scheduledAt))) {
        current.value = fetched
        emit('changed', fetched)
        reviewRequired.value = false
        editing.value = false
        error.value = ''
        notice.value = '已核实提醒保存在服务端。'
      }
    }
  } finally { pending.value = false }
}
</script>

<template>
  <section class="reminder-editor" aria-label="私人提醒">
    <div class="section-heading"><h3>只提醒自己</h3><span class="badge green">仅自己可见</span></div>
    <p v-if="!current || current.status === 'CANCELLED'" class="muted">不通知。<span v-if="current">上次提醒已取消。</span></p>
    <p v-else class="muted">{{ reminderStatusLabels[current.status] }} · {{ formatTime(current.scheduledAt) }}（{{ timezone }}）
      · {{ current.deliveryMode === 'IN_APP' ? '站内通知' : '站内及邮件通知（历史设置）' }}</p>
    <button v-if="!editing" type="button" class="btn secondary mt-16" @click="beginEdit">
      {{ current?.status === 'PENDING' ? '调整或取消提醒' : '设置提醒' }}</button>
    <form v-else class="form-stack mt-16" @submit.prevent="save">
      <div class="field"><label :for="`reminder-mode-${resourceType}-${resourceId}`">到时怎样提醒我</label>
        <select :id="`reminder-mode-${resourceType}-${resourceId}`" v-model="draft.mode">
          <option value="NONE">不通知</option><option value="IN_APP">站内通知</option>
          <option value="IN_APP_AND_MAIL" :disabled="!mailAvailable">站内通知 + 邮件通知{{ mailAvailable ? '' : '（当前不可用）' }}</option></select></div>
      <template v-if="draft.mode !== 'NONE'"><div class="field"><label :for="`reminder-time-${resourceType}-${resourceId}`">
        提醒时间（{{ timezone }}）</label><input :id="`reminder-time-${resourceType}-${resourceId}`"
          v-model="draft.local" type="datetime-local" required @input="draft.offset = ''" />
        <p class="field-help">可选择过去时间；到时通知由后端扫描处理，不保证精确到秒。</p>
        <p v-if="draft.local && !candidates.length" class="form-error">这个当地时刻不存在，请另选时间。</p></div>
        <div v-if="candidates.length > 1" class="field"><label :for="`reminder-offset-${resourceType}-${resourceId}`">选择 UTC 偏移</label>
          <select :id="`reminder-offset-${resourceType}-${resourceId}`" v-model="draft.offset" required>
            <option value="">请选择</option><option v-for="candidate in candidates" :key="candidate.instant"
              :value="candidate.offset">UTC{{ candidate.offset }} · {{ candidate.instant }}</option></select></div></template>
      <p v-if="!mailAvailable" class="field-help">邮件通知尚未启用，目前可使用站内提醒。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div v-if="reviewRequired" class="inline-note peach"><p>服务端当前状态：{{ latest ? `${reminderStatusLabels[latest.status]} · 修订 ${latest.revision}` : '未设置' }}。</p>
        <button type="button" class="text-button" @click="acceptLatest">使用最新修订后核对</button></div>
      <div class="dialog-actions"><button type="button" class="btn secondary" :disabled="pending" @click="editing = false">返回详情</button>
        <button type="submit" class="btn primary" :disabled="pending || reviewRequired">{{ pending ? '正在保存…' : '保存提醒' }}</button></div>
    </form>
    <p v-if="notice" class="form-success mt-16" role="status">{{ notice }}</p>
  </section>
</template>
