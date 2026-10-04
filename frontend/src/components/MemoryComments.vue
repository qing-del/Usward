<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, errorMessage } from '../api'
import { addMemoryComment, getMemory, getMemoryActionCapabilities,
  listMemoryComments } from '../memories'
import type { FollowUpMode, MemoryComment, MemoryCommentWrite, MemoryDetail } from '../memories'
import { session } from '../session'

const props = defineProps<{ memory: MemoryDetail; isOwner: boolean }>()
const emit = defineEmits<{ updated: [value: MemoryDetail]; unavailable: [id: string]; busy: [value: boolean] }>()
type Attempt = { key: string; body: MemoryCommentWrite }

const items = ref<MemoryComment[]>([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const pending = ref(false)
const loadError = ref('')
const error = ref('')
const notice = ref('')
const draft = ref('')
const effectiveMode = ref<FollowUpMode | null>(null)
const overrideToken = ref<string | null>(null)
const overrideMode = ref<'IN_APP' | 'NONE'>('IN_APP')
const actionKey = ref<string | null>(null)
const uncertain = ref<Attempt | null>(null)
const retryVerified = ref(false)
const reviewRequired = ref(false)
const latestVersion = ref<string | null>(null)
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
let controller: AbortController | null = null
let sequence = 0

watch([pending, loading], () => emit('busy', pending.value || loading.value))
watch(() => session.user?.id, () => {
  controller?.abort()
  sequence++
  items.value = []
  total.value = 0
  draft.value = ''
  actionKey.value = null
  uncertain.value = null
  retryVerified.value = false
  overrideToken.value = null
  reviewRequired.value = false
  error.value = ''
  notice.value = ''
})
watch(() => session.reauthRequired, (required, wasRequired) => {
  if (wasRequired && !required && session.user && draft.value) {
    actionKey.value = null
    uncertain.value = null
    overrideToken.value = null
    retryVerified.value = false
    reviewRequired.value = true
    error.value = '重新登录后请核对最新卡片和通知方式，再提交补充。'
    void refreshContext()
  }
})
watch(() => props.memory.version, (version, previous) => {
  if (draft.value && version !== previous && !pending.value && !reviewRequired.value) {
    latestVersion.value = version
    reviewRequired.value = true
    error.value = '卡片版本已变化。补充内容已保留，请核对后再提交。'
  }
})

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function load(targetPage: number) {
  controller?.abort()
  controller = new AbortController()
  const run = ++sequence
  if (targetPage === 1) { loading.value = true; loadError.value = ''; items.value = [] }
  else loadingMore.value = true
  try {
    const result = await listMemoryComments(props.memory.id, targetPage, controller.signal)
    if (run !== sequence) return
    items.value = targetPage === 1 ? result.items : [...items.value, ...result.items]
    total.value = result.total
    page.value = result.page
    hasMore.value = result.hasMore
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    if (run !== sequence) return
    if (cause instanceof ApiError && cause.status === 404) emit('unavailable', props.memory.id)
    else loadError.value = errorMessage(cause)
  } finally {
    if (run === sequence) { loading.value = false; loadingMore.value = false }
  }
}

async function loadCapabilities() {
  if (props.isOwner) return
  const userId = session.user?.id
  const id = props.memory.id
  try {
    const result = await getMemoryActionCapabilities(id, 'MEMORY_COMMENT')
    if (session.user?.id === userId && props.memory.id === id) {
      effectiveMode.value = result.effectiveOutgoingMode
    }
  } catch (cause) {
    if (session.user?.id === userId && cause instanceof ApiError && cause.status === 404) emit('unavailable', id)
  }
}

onMounted(() => { void load(1); void loadCapabilities() })
onBeforeUnmount(() => controller?.abort())

async function refreshContext(): Promise<MemoryDetail | null> {
  const userId = session.user?.id
  const id = props.memory.id
  try {
    const latest = await getMemory(id)
    if (session.user?.id !== userId || props.memory.id !== id) return null
    latestVersion.value = latest.version
    emit('updated', latest)
    await loadCapabilities()
    return latest
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) emit('unavailable', id)
    else if (session.user?.id === userId) error.value = errorMessage(cause)
    return null
  }
}

async function verifyUncertain() {
  if (!uncertain.value || loading.value) return
  retryVerified.value = false
  const latest = await refreshContext()
  if (latest) {
    retryVerified.value = true
    error.value = latest.version === uncertain.value.body.expectedVersion
      ? '已读取服务端当前卡片。可用原请求和原幂等键核对提交结果。'
      : '卡片版本已变化。仅可用原请求核对提交结果；如未保存，服务端会提示版本冲突。'
  }
}

function acceptLatest() {
  if (!latestVersion.value) return
  reviewRequired.value = false
  latestVersion.value = null
  actionKey.value = null
  error.value = '请核对这张卡片的最新内容，然后再次提交补充。'
}

async function send(attempt: Attempt) {
  const userId = session.user?.id
  const id = props.memory.id
  pending.value = true
  error.value = ''
  notice.value = ''
  try {
    const created = await addMemoryComment(id, attempt.body, attempt.key)
    if (session.user?.id !== userId || props.memory.id !== id) return
    emit('updated', { ...props.memory, version: created.memoryVersion })
    draft.value = ''
    actionKey.value = null
    uncertain.value = null
    retryVerified.value = false
    overrideToken.value = null
    reviewRequired.value = false
    notice.value = '补充已保存；卡片原文没有改变。'
    await load(1)
    await refreshContext()
  } catch (cause) {
    if (session.user?.id !== userId || props.memory.id !== id) return
    if (cause instanceof ApiError && (cause.code === 'NETWORK_ERROR' || cause.status >= 500)) {
      uncertain.value = attempt
      error.value = '提交结果尚不确定。请先读取服务端状态，再决定是否用原请求重试。'
      await verifyUncertain()
    } else if (cause instanceof ApiError && cause.code === 'MAIL_NOT_AVAILABLE'
      && typeof cause.details?.overrideToken === 'string') {
      overrideToken.value = cause.details.overrideToken
      actionKey.value = attempt.key
      error.value = '作者的历史邮件方式当前不可用。请明确选择本次改为站内通知或不通知。'
    } else if (cause instanceof ApiError && (cause.code === 'VERSION_CONFLICT'
      || cause.code === 'NOTIFICATION_CONTEXT_CHANGED')) {
      uncertain.value = null
      actionKey.value = null
      overrideToken.value = null
      reviewRequired.value = true
      await refreshContext()
      error.value = '卡片或通知设置已变化。补充已保留，请核对最新内容后再提交。'
    } else if (cause instanceof ApiError && cause.status === 404) emit('unavailable', id)
    else error.value = errorMessage(cause)
  } finally { pending.value = false }
}

function submit(useOverride = false) {
  if (props.isOwner || pending.value || loading.value || reviewRequired.value || uncertain.value) return
  const bodyText = draft.value.trim()
  if (!bodyText || [...bodyText].length > 1000) {
    error.value = '请填写 1–1000 字的补充。'
    return
  }
  if (!!overrideToken.value !== useOverride) return
  const body: MemoryCommentWrite = { expectedVersion: props.memory.version, body: bodyText,
    ...(useOverride ? { notificationOverride: { mode: overrideMode.value,
      token: overrideToken.value! } } : {}) }
  const key = actionKey.value ?? crypto.randomUUID()
  actionKey.value = key
  void send({ key, body })
}

function retryOriginal() {
  if (!uncertain.value || !retryVerified.value || pending.value) return
  void send(uncertain.value)
}
</script>

<template>
  <section class="memory-comments-section" aria-label="补充与更正">
    <div class="section-heading"><h3>补充与更正 <span class="badge">{{ total }}</span></h3>
      <span class="muted">按提交时间排列</span></div>
    <p class="field-help">补充会单独保存，不会直接改写卡片原文。</p>
    <div v-if="loading" class="loading-state" role="status">正在读取补充…</div>
    <div v-else-if="loadError" class="inline-note"><p class="form-error" role="alert">{{ loadError }}</p>
      <button type="button" class="text-button" @click="load(1)">重新读取</button></div>
    <p v-else-if="!items.length" class="muted mt-8">这张卡片还没有补充。</p>
    <ol v-else class="memory-comments-list"><li v-for="item in items" :key="item.id">
      <div class="detail-meta"><strong>{{ item.author.nickname }}</strong><small>{{ timeLabel(item.createdAt) }}</small></div>
      <p class="detail-body">{{ item.body }}</p></li></ol>
    <button v-if="hasMore && !loading" class="btn secondary mt-16" type="button"
      :disabled="loadingMore" @click="load(page + 1)">{{ loadingMore ? '正在加载…' : '再看 20 条补充' }}</button>

    <form v-if="!isOwner" class="form-stack mt-16" @submit.prevent="submit(false)">
      <div class="field"><label for="memory-comment-body">补充或更正 <small>最多 1000 字</small></label>
        <textarea id="memory-comment-body" v-model="draft" maxlength="1000" rows="3"
          :disabled="!!uncertain" placeholder="补充你亲历的事实，或温和地说明不同的理解。" /></div>
      <p v-if="effectiveMode" class="field-help">作者目前选择：{{ effectiveMode === 'NONE' ? '不接收后续通知' : effectiveMode === 'IN_APP' ? '接收站内通知' : '历史邮件方式；提交时需改选' }}。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
      <div v-if="overrideToken" class="inline-note peach"><p>邮件发送尚未启用。此改选仅适用于本次补充，不改变作者保存的方式。</p>
        <div class="field mt-8"><label for="memory-comment-override">本次怎样通知作者</label>
          <select id="memory-comment-override" v-model="overrideMode"><option value="IN_APP">站内通知</option>
            <option value="NONE">不通知</option></select></div>
        <button class="btn primary mt-16" type="button" :disabled="pending" @click="submit(true)">
          {{ pending ? '正在保存…' : '确认改选并保存补充' }}</button></div>
      <div v-if="reviewRequired" class="inline-note peach"><p>服务端卡片版本：{{ latestVersion ?? '尚未读取' }}。请核对卡片和已有补充。</p>
        <button v-if="latestVersion" class="text-button" type="button" @click="acceptLatest">已核对，继续填写</button>
        <button v-else class="text-button" type="button" @click="refreshContext">重新读取</button></div>
      <div v-if="uncertain" class="inline-note peach"><p>原补充已锁定，核对完成前不会生成新请求。</p>
        <button type="button" class="btn secondary" :disabled="loading" @click="verifyUncertain">重新读取状态</button>
        <button v-if="retryVerified" type="button" class="btn primary" :disabled="pending" @click="retryOriginal">
          使用原请求核对结果</button></div>
      <button v-if="!overrideToken && !uncertain" type="submit" class="btn secondary" :disabled="pending || reviewRequired">
        {{ pending ? '正在保存…' : '保存补充' }}</button>
    </form>
  </section>
</template>
