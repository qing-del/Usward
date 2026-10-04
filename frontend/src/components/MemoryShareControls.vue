<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ApiError, errorMessage } from '../api'
import { getConnection } from '../connection'
import { categoryLabels, getMemory, getShareCapabilities, shareMemory, sourceLabels,
  unshareMemory } from '../memories'
import type { MemoryDetail, MemoryNotificationCapabilities, MemoryShareWrite } from '../memories'
import { session } from '../session'

const props = defineProps<{ memory: MemoryDetail }>()
const emit = defineEmits<{ updated: [value: MemoryDetail]; busy: [value: boolean] }>()
type ShareAttempt = { key: string; body: MemoryShareWrite }

const step = ref<'idle' | 'share' | 'unshare'>('idle')
const connectionId = ref<string | null>(null)
const capabilities = ref<MemoryNotificationCapabilities | null>(null)
const draft = reactive({ outgoingMode: 'IN_APP' as MemoryShareWrite['notificationPlan']['outgoingMode'],
  followUpMode: 'IN_APP' as MemoryShareWrite['notificationPlan']['followUpMode'] })
const loading = ref(false)
const pending = ref(false)
const error = ref('')
const notice = ref('')
const uncertain = ref<ShareAttempt | null>(null)
const retryVerified = ref(false)

watch([loading, pending], () => emit('busy', loading.value || pending.value))

watch(() => session.user?.id, () => {
  step.value = 'idle'
  connectionId.value = null
  capabilities.value = null
  draft.outgoingMode = 'IN_APP'
  draft.followUpMode = 'IN_APP'
  uncertain.value = null
  retryVerified.value = false
  error.value = ''
  notice.value = ''
})
watch(() => session.reauthRequired, (required, wasRequired) => {
  if (wasRequired && !required && session.user && step.value !== 'idle') {
    uncertain.value = null
    retryVerified.value = false
    error.value = '重新登录后请读取最新卡片，再核对分享选择。'
    void refreshMemory()
  }
})

function reset() {
  step.value = 'idle'
  uncertain.value = null
  retryVerified.value = false
  error.value = ''
}

async function refreshMemory(): Promise<MemoryDetail | null> {
  const userId = session.user?.id
  const id = props.memory.id
  try {
    const latest = await getMemory(id)
    if (session.user?.id !== userId || props.memory.id !== id) return null
    emit('updated', latest)
    return latest
  } catch (cause) {
    if (session.user?.id === userId) error.value = errorMessage(cause)
    return null
  }
}

async function prepareShare() {
  if (loading.value || pending.value) return
  loading.value = true
  error.value = ''
  notice.value = ''
  const userId = session.user?.id
  try {
    const current = await getConnection()
    if (session.user?.id !== userId) return
    if (!current.connection) {
      error.value = '请先在「我的」建立连接，再选择要分享的卡片。'
      return
    }
    const available = await getShareCapabilities(current.connection.id)
    if (session.user?.id !== userId) return
    connectionId.value = current.connection.id
    capabilities.value = available
    step.value = 'share'
  } catch (cause) {
    if (session.user?.id === userId) error.value = errorMessage(cause)
  } finally { loading.value = false }
}

function shared(saved: MemoryDetail, message: string) {
  emit('updated', saved)
  step.value = 'idle'
  uncertain.value = null
  retryVerified.value = false
  error.value = ''
  notice.value = message
}

async function verifyShare() {
  const attempt = uncertain.value
  if (!attempt || loading.value) return
  loading.value = true
  retryVerified.value = false
  const latest = await refreshMemory()
  if (latest) {
    if (latest.sharedConnectionId === attempt.body.connectionId) {
      shared(latest, '已核实卡片分享成功。')
    } else if (latest.sharedConnectionId !== null
      || latest.version !== attempt.body.expectedVersion) {
      uncertain.value = null
      step.value = 'idle'
      error.value = '卡片或连接状态已变化，请重新预览后再决定是否分享。'
    } else {
      try {
        const current = await getConnection()
        if (current.connection?.id !== attempt.body.connectionId) {
          uncertain.value = null
          step.value = 'idle'
          error.value = '当前连接已变化，请重新预览后再决定是否分享。'
        } else {
          retryVerified.value = true
          error.value = '服务端仍显示未分享。可使用原请求重试，或稍后再核对。'
        }
      } catch (cause) { error.value = errorMessage(cause) }
    }
  }
  loading.value = false
}

async function submitShare(retry = false) {
  if (pending.value || loading.value || !connectionId.value || !capabilities.value) return
  if (retry && (!uncertain.value || !retryVerified.value)) return
  if (!retry && uncertain.value) return
  const body: MemoryShareWrite = retry ? uncertain.value!.body : {
    connectionId: connectionId.value,
    expectedVersion: props.memory.version,
    notificationPlan: { outgoingMode: draft.outgoingMode, followUpMode: draft.followUpMode },
  }
  const attempt: ShareAttempt = retry ? uncertain.value! : { key: crypto.randomUUID(), body }
  pending.value = true
  error.value = ''
  retryVerified.value = false
  try {
    const saved = await shareMemory(props.memory.id, attempt.body, attempt.key)
    shared(saved, '卡片已分享给当前连接。')
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') {
      uncertain.value = attempt
      error.value = '分享结果尚不确定。请先读取卡片状态，再决定是否用原请求重试。'
      await verifyShare()
    } else if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
      uncertain.value = null
      step.value = 'idle'
      await refreshMemory()
      error.value = '卡片或连接状态已变化。选择仍保留，请查看最新卡片后重新预览。'
    } else error.value = errorMessage(cause)
  } finally { pending.value = false }
}

async function submitUnshare() {
  if (pending.value || loading.value) return
  pending.value = true
  error.value = ''
  const version = props.memory.version
  try {
    const saved = await unshareMemory(props.memory.id, version)
    shared(saved, '分享已撤销，对方不再能查看这张卡片。')
  } catch (cause) {
    if (cause instanceof ApiError && (cause.code === 'NETWORK_ERROR'
      || cause.status === 409 || cause.status === 404)) {
      const latest = await refreshMemory()
      if (latest?.sharedConnectionId === null) shared(latest, '已核实卡片目前未分享。')
      else {
        step.value = 'idle'
        error.value = latest ? '卡片仍为分享状态。请核对最新版本后重新确认撤销。'
          : '无法确认撤销结果。请重新读取卡片后再操作。'
      }
    } else error.value = errorMessage(cause)
  } finally { pending.value = false }
}
</script>

<template>
  <section class="memory-share-section" aria-label="卡片分享">
    <div class="section-heading"><h3>分享这张卡片</h3>
      <span class="badge" :class="memory.sharedConnectionId ? 'green' : 'gray'">
        {{ memory.sharedConnectionId ? '已分享' : '仅自己可见' }}</span></div>
    <p class="muted">连接不会自动分享卡片。只有你主动选择，这张卡片才会给对方阅读。</p>
    <p v-if="error" class="form-error mt-16" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success mt-16" role="status">{{ notice }}</p>
    <button v-if="step === 'idle' && !memory.sharedConnectionId" type="button" class="btn secondary mt-16"
      :disabled="loading || pending" @click="prepareShare">{{ loading ? '正在读取连接…' : '预览并分享' }}</button>
    <button v-if="step === 'idle' && memory.sharedConnectionId" type="button" class="text-button danger mt-16"
      :disabled="pending" @click="step = 'unshare'">撤销分享</button>

    <div v-if="step === 'share'" class="inline-note memory-share-preview mt-16">
      <h4>分享前预览</h4>
      <p class="field-help">对方可读取以下整张卡片；你的私人提醒不会分享。</p>
      <strong>{{ memory.title || '一件值得记住的小事' }}</strong>
      <p class="detail-body">{{ memory.body }}</p>
      <p>{{ memory.category ? categoryLabels[memory.category] : '未分类' }} · {{ sourceLabels[memory.sourceType] }}</p>
      <p v-if="memory.sourceDate">来源日期：{{ memory.sourceDate }}</p>
      <p v-if="memory.nextAction">下次行动：{{ memory.nextAction }}</p>
      <p v-if="memory.tags.length">标签：{{ memory.tags.join('、') }}</p>
      <div class="form-grid mt-16"><div class="field"><label for="share-outgoing">本次怎样通知对方</label>
        <select id="share-outgoing" v-model="draft.outgoingMode" :disabled="!!uncertain">
          <option value="IN_APP">站内通知</option><option value="NONE">不通知</option>
          <option value="IN_APP_AND_MAIL" :disabled="!capabilities?.otherMailAvailable">站内 + 邮件{{ capabilities?.otherMailAvailable ? '' : '（当前不可用）' }}</option>
        </select></div><div class="field"><label for="share-followup">对方补充后怎样通知我</label>
        <select id="share-followup" v-model="draft.followUpMode" :disabled="!!uncertain">
          <option value="IN_APP">站内通知</option><option value="NONE">不通知</option>
          <option value="IN_APP_AND_MAIL" :disabled="!capabilities?.selfMailAvailable">站内 + 邮件{{ capabilities?.selfMailAvailable ? '' : '（当前不可用）' }}</option>
        </select></div></div>
      <p class="field-help">邮件发送尚未启用；选择“不通知”也会保存分享或之后的补充。</p>
      <div class="dialog-actions mt-16">
        <button type="button" class="btn secondary" :disabled="pending" @click="reset">返回</button>
        <button v-if="uncertain" type="button" class="btn secondary" :disabled="loading || pending"
          @click="verifyShare">{{ loading ? '正在核对…' : '重新读取状态' }}</button>
        <button v-if="uncertain && retryVerified" type="button" class="btn primary" :disabled="pending"
          @click="submitShare(true)">使用原请求重试</button>
        <button v-if="!uncertain" type="button" class="btn primary" :disabled="pending"
          @click="submitShare()">{{ pending ? '正在分享…' : '确认分享整张卡片' }}</button>
      </div>
    </div>
    <div v-if="step === 'unshare'" class="inline-note peach mt-16">
      <p>撤销后，对方将无法查看这张卡片；对方的私人提醒、补充记录，以及双方在本次分享上的后续通知设置会被清除。你的私人提醒仍保留。</p>
      <div class="dialog-actions mt-16"><button type="button" class="btn secondary" :disabled="pending" @click="reset">返回</button>
        <button type="button" class="btn danger" :disabled="pending" @click="submitUnshare">
          {{ pending ? '正在撤销…' : '确认撤销分享' }}</button></div>
    </div>
  </section>
</template>
