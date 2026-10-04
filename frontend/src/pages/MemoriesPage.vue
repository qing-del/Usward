<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import BaseDialog from '../components/BaseDialog.vue'
import ReminderEditor from '../components/ReminderEditor.vue'
import ReminderDraftFields from '../components/ReminderDraftFields.vue'
import ReminderRecovery from '../components/ReminderRecovery.vue'
import MemoryShareControls from '../components/MemoryShareControls.vue'
import MemoryFollowUpSettings from '../components/MemoryFollowUpSettings.vue'
import MemoryComments from '../components/MemoryComments.vue'
import { ApiError, errorMessage } from '../api'
import { categoryLabels, createMemory, deleteMemory, getMemory, getMemoryActionCapabilities, listMemories,
  patchMemory, setMemoryArchived, sourceLabels } from '../memories'
import type { MemoryCategory, MemoryDetail, MemoryNotificationCapabilities,
  MemoryNotificationOverride, MemoryNotificationSetting, MemoryScope, MemorySummary,
  MemoryWrite, SourceType } from '../memories'
import { session } from '../session'
import { refreshUnread } from '../unread'
import { useCreatedReminder } from '../useCreatedReminder'

const route = useRoute()
type MemoryView = MemoryScope | 'ARCHIVED'
function routeView(): MemoryView {
  if (route.query.archived === '1') return 'ARCHIVED'
  return route.query.scope === 'MINE' || route.query.scope === 'PARTNER' ? route.query.scope : 'ALL'
}
const view = ref<MemoryView>(routeView())
const archived = computed(() => view.value === 'ARCHIVED')
const scope = computed<MemoryScope>(() => archived.value ? 'MINE' : view.value as MemoryScope)
const keyword = ref('')
const category = ref<MemoryCategory | null>(null)
const tag = ref('')
const items = ref<MemorySummary[]>([])
const total = ref(0)
const tags = ref<{ tag: string; count: number }[]>([])
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const listError = ref('')
let abort: AbortController | null = null
let sequence = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

const mode = ref<'create' | 'detail' | 'edit' | null>(null)
const detail = ref<MemoryDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const operationPending = ref(false)
const shareBusy = ref(false)
const commentBusy = ref(false)
const confirmDelete = ref(false)
const latestVersion = ref<string | null>(null)
const latestDetail = ref<MemoryDetail | null>(null)
const editVersion = ref('')
type EditAttempt = { id: string; version: string; write: MemoryWrite; key: string;
  sharedConnectionId: string | null; notificationOverride?: MemoryNotificationOverride }
const editKey = ref<string | null>(null)
const editUncertain = ref<EditAttempt | null>(null)
const editRetryVerified = ref(false)
const editOverrideToken = ref<string | null>(null)
const editOverrideMode = ref<'IN_APP' | 'NONE'>('IN_APP')
const editCapabilities = ref<MemoryNotificationCapabilities | null>(null)
const editCapabilitiesLoading = ref(false)
const draft = reactive({ title: '', body: '', category: '' as MemoryCategory | '',
  tagsText: '', sourceType: 'INTERPRETATION' as SourceType, sourceDate: '', nextAction: '' })
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
const mailAvailable = computed(() => !!session.user?.mailReminderAvailable && !!session.user.notificationEmail)
const { draft: reminderDraft, pendingId: pendingReminderId, pending: reminderPending,
  error: reminderError, review: reminderReview, reset: resetCreatedReminder,
  validate: validateCreatedReminder, apply: applyCreatedReminder, retry: retryReminder,
  clearPending: clearPendingReminder } = useCreatedReminder('MEMORY_CARD', () => timezone.value,
  () => mailAvailable.value)

async function load(targetPage: number) {
  abort?.abort()
  abort = new AbortController()
  const current = ++sequence
  if (targetPage === 1) { loading.value = true; items.value = []; total.value = 0; listError.value = '' }
  else loadingMore.value = true
  try {
    const result = await listMemories({ scope: scope.value, archived: archived.value, keyword: keyword.value,
      category: category.value, tag: tag.value, page: targetPage, size: 9 }, abort.signal)
    if (current !== sequence) return
    items.value = targetPage === 1 ? result.items : [...items.value, ...result.items]
    total.value = result.total
    tags.value = result.availableTags
    hasMore.value = result.hasMore
    page.value = result.page
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    if (current === sequence) listError.value = errorMessage(cause)
  } finally {
    if (current === sequence) { loading.value = false; loadingMore.value = false }
  }
}

function resetFilters() {
  keyword.value = ''
  category.value = null
  tag.value = ''
}

watch([view, category, tag, keyword], (next, previous) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(1), next[3] === previous[3] ? 0 : 280)
})
onMounted(() => {
  load(1)
  if (route.query.new === '1') newMemory()
  else if (typeof route.query.memory === 'string' && /^[1-9]\d*$/.test(route.query.memory)) {
    openMemory(route.query.memory)
  }
})
watch(() => route.query.memory, value => {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value) && value !== detail.value?.id) {
    void openMemory(value)
  }
})
watch(() => [route.query.scope, route.query.archived], () => { view.value = routeView() })
watch(() => session.reauthRequired, (required, wasRequired) => {
  if (wasRequired && !required && mode.value === 'edit' && detail.value) {
    editKey.value = null
    editUncertain.value = null
    editRetryVerified.value = false
    editOverrideToken.value = null
    void latestForEdit('重新登录后请核对最新卡片和通知方式，再保存输入。')
  }
})
onBeforeUnmount(() => { abort?.abort(); if (searchTimer) clearTimeout(searchTimer) })

function isMine(memory: Pick<MemorySummary, 'ownerId'>): boolean {
  return memory.ownerId === session.user?.id
}

function closeDialog() {
  if (operationPending.value || shareBusy.value || commentBusy.value) return
  mode.value = null
  detailError.value = ''
  confirmDelete.value = false
  latestVersion.value = null
  latestDetail.value = null
}

function newMemory() {
  Object.assign(draft, { title: '', body: '', category: '', tagsText: '',
    sourceType: 'INTERPRETATION', sourceDate: '', nextAction: '' })
  detail.value = null
  detailError.value = ''
  latestVersion.value = null
  latestDetail.value = null
  resetCreatedReminder()
  mode.value = 'create'
}

async function openMemory(id: string) {
  mode.value = 'detail'
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  confirmDelete.value = false
  try { detail.value = await getMemory(id) }
  catch (cause) {
    detailError.value = cause instanceof ApiError && cause.status === 404
      ? '这张卡片已不可访问。请返回列表查看最新内容。' : errorMessage(cause)
  } finally { detailLoading.value = false }
}

function editMemory() {
  if (!detail.value || !isMine(detail.value)) return
  const memory = detail.value
  Object.assign(draft, { title: memory.title ?? '', body: memory.body,
    category: memory.category ?? '', tagsText: memory.tags.join('，'),
    sourceType: memory.sourceType, sourceDate: memory.sourceDate ?? '',
    nextAction: memory.nextAction ?? '' })
  editVersion.value = memory.version
  latestVersion.value = null
  latestDetail.value = null
  editKey.value = null
  editUncertain.value = null
  editRetryVerified.value = false
  editOverrideToken.value = null
  editCapabilities.value = null
  detailError.value = ''
  mode.value = 'edit'
  if (memory.sharedConnectionId) void loadEditCapabilities(memory.id)
}

async function loadEditCapabilities(id: string) {
  const userId = session.user?.id
  editCapabilitiesLoading.value = true
  try {
    const value = await getMemoryActionCapabilities(id, 'MEMORY_EDIT')
    if (session.user?.id === userId && detail.value?.id === id && mode.value === 'edit') {
      editCapabilities.value = value
    }
  } catch (cause) {
    if (session.user?.id === userId && mode.value === 'edit') detailError.value = errorMessage(cause)
  } finally { editCapabilitiesLoading.value = false }
}

async function latestForEdit(message: string): Promise<MemoryDetail | null> {
  if (!detail.value) return null
  const id = detail.value.id
  const userId = session.user?.id
  try {
    const latest = await getMemory(id)
    if (session.user?.id !== userId || detail.value?.id !== id) return null
    latestVersion.value = latest.version
    latestDetail.value = latest
    detailError.value = message
    if (latest.sharedConnectionId) void loadEditCapabilities(id)
    return latest
  } catch (cause) {
    if (session.user?.id !== userId) return null
    if (cause instanceof ApiError && cause.status === 404) {
      mode.value = 'detail'
      detail.value = null
      detailError.value = '卡片已不可访问。请查看最新列表。'
      void load(1)
    } else detailError.value = errorMessage(cause)
    return null
  }
}

function matchesEdit(write: MemoryWrite, latest: MemoryDetail): boolean {
  return latest.title === write.title && latest.body === write.body
    && latest.category === write.category && latest.sourceType === write.sourceType
    && latest.sourceDate === write.sourceDate && latest.nextAction === write.nextAction
    && latest.tags.length === write.tags.length
    && latest.tags.every((tag, index) => tag === write.tags[index])
}

async function savedEdit(saved: MemoryDetail) {
  detail.value = saved
  mode.value = 'detail'
  latestVersion.value = null
  latestDetail.value = null
  editKey.value = null
  editUncertain.value = null
  editRetryVerified.value = false
  editOverrideToken.value = null
  detailError.value = ''
  if (archived.value) view.value = 'MINE'
  else await load(1)
  void refreshUnread()
}

async function verifyEditUncertain() {
  const attempt = editUncertain.value
  if (!attempt) return
  editRetryVerified.value = false
  const latest = await latestForEdit('正在核对服务端的卡片状态。')
  if (!latest) return
  if (latest.version !== attempt.version && matchesEdit(attempt.write, latest)) {
    await savedEdit(latest)
  } else if (latest.sharedConnectionId !== attempt.sharedConnectionId) {
    editUncertain.value = null
    detailError.value = '分享状态已变化。输入已保留，请核对最新卡片后重新提交。'
  } else {
    latestVersion.value = null
    editRetryVerified.value = true
    detailError.value = '已读取服务端当前卡片。可用原请求和原幂等键核对提交结果。'
  }
}

async function persistEdit(attempt: EditAttempt) {
  operationPending.value = true
  detailError.value = ''
  try {
    const saved = await patchMemory(attempt.id, attempt.version, attempt.write,
      attempt.key, attempt.notificationOverride)
    await savedEdit(saved)
  } catch (cause) {
    if (cause instanceof ApiError && (cause.code === 'NETWORK_ERROR' || cause.status >= 500)) {
      editUncertain.value = attempt
      detailError.value = '保存结果尚不确定。请先读取最新卡片，再决定是否用原请求重试。'
      await verifyEditUncertain()
    } else if (cause instanceof ApiError && cause.code === 'MAIL_NOT_AVAILABLE'
      && typeof cause.details?.overrideToken === 'string') {
      editOverrideToken.value = cause.details.overrideToken
      editKey.value = attempt.key
      detailError.value = '对方的历史邮件方式当前不可用。请明确选择本次改为站内通知或不通知。'
    } else if (cause instanceof ApiError && (cause.code === 'VERSION_CONFLICT'
      || cause.code === 'NOTIFICATION_CONTEXT_CHANGED')) {
      editKey.value = null
      editUncertain.value = null
      editOverrideToken.value = null
      await latestForEdit('卡片或通知设置已变化。输入已保留，请核对最新内容。')
    } else if (cause instanceof ApiError && cause.status === 404) {
      await memoryUnavailable()
    } else detailError.value = errorMessage(cause)
  } finally { operationPending.value = false }
}

function parseTags(): string[] {
  return [...new Set(draft.tagsText.split(/[,，\n]/).map(value => value.trim()).filter(Boolean))]
}

async function saveMemory(useOverride = false) {
  if (operationPending.value || editUncertain.value || latestVersion.value) return
  detailError.value = ''
  if (!draft.body.trim()) { detailError.value = '请填写卡片正文。'; return }
  const parsedTags = parseTags()
  if (parsedTags.some(value => [...value].length > 100)) {
    detailError.value = '每个标签最多 100 个字。'; return
  }
  const write: MemoryWrite = {
    title: draft.title.trim() || null, body: draft.body.trim(),
    category: draft.category || null, tags: parsedTags, sourceType: draft.sourceType,
    sourceDate: draft.sourceDate || null, nextAction: draft.nextAction.trim() || null,
  }
  if (mode.value === 'edit' && detail.value) {
    if (!!editOverrideToken.value !== useOverride) return
    const key = editKey.value ?? crypto.randomUUID()
    editKey.value = key
    await persistEdit({ id: detail.value.id, version: editVersion.value, write, key,
      sharedConnectionId: detail.value.sharedConnectionId,
      ...(useOverride ? { notificationOverride: { mode: editOverrideMode.value,
        token: editOverrideToken.value! } } : {}) })
    return
  }
  let reminderPlan: ReturnType<typeof validateCreatedReminder> = null
  if (mode.value === 'create') {
    try { reminderPlan = validateCreatedReminder() }
    catch (cause) { detailError.value = cause instanceof Error ? cause.message : '提醒时间无效。'; return }
  }
  operationPending.value = true
  try {
    const saved = await createMemory(write)
    detail.value = saved
    mode.value = 'detail'
    latestVersion.value = null
    if (archived.value) view.value = 'MINE'
    else await load(1)
    const reminder = await applyCreatedReminder(saved.id, reminderPlan)
    if (reminder) detail.value = { ...saved, myReminder: reminder }
    else if (reminderReview.value) detail.value = { ...saved, myReminder: reminderReview.value }
  } catch (cause) {
    detailError.value = errorMessage(cause)
  } finally { operationPending.value = false }
}

function retryEditOriginal() {
  if (!editUncertain.value || !editRetryVerified.value || operationPending.value) return
  void persistEdit(editUncertain.value)
}

function useLatestVersion() {
  if (!latestVersion.value) return
  editVersion.value = latestVersion.value
  if (latestDetail.value) detail.value = latestDetail.value
  latestVersion.value = null
  latestDetail.value = null
  editKey.value = null
  editOverrideToken.value = null
  editUncertain.value = null
  detailError.value = '请核对当前输入，然后再次保存。'
}

async function toggleArchived() {
  if (!detail.value || !isMine(detail.value) || operationPending.value) return
  detailError.value = ''
  operationPending.value = true
  try {
    detail.value = await setMemoryArchived(detail.value.id, detail.value.version, !detail.value.archived)
    await load(1)
  } catch (cause) {
    detailError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT' && detail.value) {
      try { detail.value = await getMemory(detail.value.id) } catch { /* Keep the error visible. */ }
    }
  } finally { operationPending.value = false }
}

async function removeMemory() {
  if (!detail.value || !isMine(detail.value) || operationPending.value) return
  detailError.value = ''
  operationPending.value = true
  try {
    await deleteMemory(detail.value.id, detail.value.version)
    closeDialogAfterDelete()
    await load(1)
  } catch (cause) {
    detailError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT' && detail.value) {
      try { detail.value = await getMemory(detail.value.id) } catch { /* Keep the error visible. */ }
    }
  } finally { operationPending.value = false }
}

function closeDialogAfterDelete() {
  mode.value = null
  detail.value = null
  confirmDelete.value = false
}

function readableDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: session.user?.timezone ?? 'Asia/Shanghai',
    year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}
function reminderChanged(value: MemoryDetail['myReminder']) {
  if (detail.value) detail.value = { ...detail.value, myReminder: value }
  if (value) clearPendingReminder()
}
function memoryUpdated(value: MemoryDetail) {
  if (detail.value?.id !== value.id) return
  detail.value = value
  void load(1)
  void refreshUnread()
}
function settingChanged(value: MemoryNotificationSetting) {
  if (detail.value) detail.value = { ...detail.value, myNotificationSetting: value }
}
async function memoryUnavailable() {
  if (!detail.value) return
  if (!isMine(detail.value)) {
    detail.value = null
    detailError.value = '这张分享卡片已不可访问。请查看最新列表。'
  } else {
    try { detail.value = await getMemory(detail.value.id) }
    catch {
      detail.value = null
      detailError.value = '这张卡片已不可访问。请查看最新列表。'
    }
  }
  await load(1)
}
async function retryCreatedReminder() {
  const reminder = await retryReminder()
  if (detail.value && reminder) detail.value = { ...detail.value, myReminder: reminder }
  else if (detail.value && reminderReview.value) {
    detail.value = { ...detail.value, myReminder: reminderReview.value }
  }
}
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">LITTLE THINGS, WELL KEPT</span>
      <h1 class="serif">记得你，也记得自己。</h1>
      <p class="subtitle">偏好、边界、平常的瞬间，都可以慢慢收好。</p></div>
      <button class="btn primary" @click="newMemory">＋ 记一张卡片</button></div>
    <div class="memory-intro"><span class="memory-intro-mark">✿</span>
      <p>记忆是一份温柔的备忘，不是关于彼此的定论。<br /><small>新记录默认只属于自己；对方分享的卡片会标明作者。</small></p></div>
    <div class="memory-toolbar toolbar"><div class="tabs" aria-label="记忆状态">
      <button class="tab" :aria-pressed="view === 'ALL'" @click="view = 'ALL'">全部</button>
      <button class="tab" :aria-pressed="view === 'MINE'" @click="view = 'MINE'">我的</button>
      <button class="tab" :aria-pressed="view === 'PARTNER'" @click="view = 'PARTNER'">对方分享</button>
      <button class="tab" :aria-pressed="view === 'ARCHIVED'" @click="view = 'ARCHIVED'">已归档</button></div>
      <div class="search-field"><label class="sr-only" for="memory-search">搜索记忆</label>
        <span aria-hidden="true">⌕</span><input id="memory-search" v-model="keyword" type="search" placeholder="找一件记得的小事…" /></div></div>
    <div class="memory-filters"><div class="filter-chips" aria-label="类别筛选">
      <button class="filter-chip" :aria-pressed="category === null" @click="category = null">所有类别</button>
      <button v-for="(label, value) in categoryLabels" :key="value" class="filter-chip"
        :aria-pressed="category === value" @click="category = value">{{ label }}</button></div>
      <div class="memory-tags"><span class="muted">标签</span>
        <button v-for="entry in tags" :key="entry.tag" class="filter-chip" :aria-pressed="tag === entry.tag"
          @click="tag = tag === entry.tag ? '' : entry.tag"># {{ entry.tag }} · {{ entry.count }}</button>
        <button v-if="keyword || category || tag" class="text-button" @click="resetFilters">清除筛选</button></div></div>
    <div class="results-heading"><strong>{{ total }} 张小小的记忆</strong><span>♧ 新建内容默认私密</span></div>
    <div v-if="loading" class="loading-state" role="status">正在翻看记忆…</div>
    <div v-else-if="listError" class="card"><p class="form-error" role="alert">{{ listError }}</p>
      <button class="btn secondary mt-16" @click="load(1)">重试</button></div>
    <div v-else-if="!items.length" class="card empty-state"><span class="empty-mark">✿</span>
      <h3>暂时没有找到记忆</h3><p>{{ view === 'PARTNER' ? '对方主动分享的卡片会出现在这里。' : '可以换个关键词，或清除筛选后再看看。' }}</p>
      <button v-if="keyword || category || tag" class="btn secondary mt-16" @click="resetFilters">清除筛选</button></div>
    <div v-else class="memory-grid">
      <article v-for="memory in items" :key="memory.id" class="memory-card">
        <button class="memory-open" @click="openMemory(memory.id)">
          <span class="memory-card-top"><span>{{ memory.category ? categoryLabels[memory.category] : '未分类' }}</span><span>♧</span></span>
          <h2 class="serif">{{ memory.title || '一件值得记住的小事' }}</h2>
          <span class="memory-source" :class="{ interpretation: memory.sourceType === 'INTERPRETATION' }">
            {{ sourceLabels[memory.sourceType] }}</span>
          <span v-if="memory.tags.length" class="memory-card-tags">{{ memory.tags.map(item => `# ${item}`).join('　') }}</span>
          <span class="memory-card-bottom"><span>{{ isMine(memory) ? memory.sharedConnectionId ? '已分享' : '仅自己可见' : `${memory.owner.nickname} 分享` }}</span><span>{{ readableDate(memory.updatedAt) }}</span></span>
        </button></article></div>
    <div v-if="hasMore && !loading" class="more-row"><button class="btn secondary" :disabled="loadingMore"
      @click="load(page + 1)">{{ loadingMore ? '正在加载…' : '再翻 9 张记忆' }}</button></div>

    <BaseDialog :open="mode !== null" :title="mode === 'create' ? '记一张卡片' : mode === 'edit' ? '编辑记忆' : detail?.title || '记忆详情'"
      :wide="true" :busy="operationPending || shareBusy || commentBusy" @close="closeDialog">
      <div v-if="mode === 'detail'">
        <div v-if="detailLoading" class="loading-state" role="status">正在读取卡片…</div>
        <template v-else-if="detail">
          <div class="detail-meta"><span class="badge green">{{ isMine(detail) ? detail.sharedConnectionId ? '已分享给对方' : '仅自己可见' : `${detail.owner.nickname} 分享` }}</span>
            <span v-if="detail.archived" class="badge gray">已归档</span>
            <span class="muted">{{ readableDate(detail.updatedAt) }}</span></div>
          <p class="detail-body">{{ detail.body }}</p>
          <div class="detail-tags"><span v-if="detail.category" class="badge">{{ categoryLabels[detail.category] }}</span>
            <span v-for="item in detail.tags" :key="item" class="badge"># {{ item }}</span></div>
          <p class="detail-line"><strong>来源</strong>{{ sourceLabels[detail.sourceType] }}</p>
          <p v-if="detail.sourceDate" class="detail-line"><strong>来源日期</strong>{{ detail.sourceDate }}</p>
          <p v-if="detail.nextAction" class="detail-line"><strong>下次行动</strong><span class="detail-body">{{ detail.nextAction }}</span></p>
          <ReminderRecovery v-if="pendingReminderId === detail.id" :draft="reminderDraft"
            :timezone="timezone" :mail-available="mailAvailable" :error="reminderError"
            :review="reminderReview" :pending="reminderPending" prefix="memory-retry" @retry="retryCreatedReminder" />
          <ReminderEditor :key="detail.id" resource-type="MEMORY_CARD" :resource-id="detail.id"
            :reminder="detail.myReminder" @changed="reminderChanged" />
          <MemoryShareControls v-if="isMine(detail)" :key="detail.id" :memory="detail"
            @updated="memoryUpdated" @busy="shareBusy = $event" />
          <MemoryFollowUpSettings v-if="detail.sharedConnectionId" :key="detail.id"
            :memory-id="detail.id" :is-owner="isMine(detail)" :setting="detail.myNotificationSetting"
            @changed="settingChanged" @unavailable="memoryUnavailable" />
          <MemoryComments v-if="detail.sharedConnectionId" :key="detail.id" :memory="detail"
            :is-owner="isMine(detail)" @updated="memoryUpdated" @unavailable="memoryUnavailable"
            @busy="commentBusy = $event" />
          <div v-if="isMine(detail) && confirmDelete" class="inline-note peach mt-16"><p>删除后，这张卡片将无法从页面恢复。确定删除？</p>
            <button class="btn danger mt-16" :disabled="operationPending" @click="removeMemory">确认删除</button>
            <button class="text-button" @click="confirmDelete = false">再想一下</button></div>
          <div v-else class="dialog-actions"><button v-if="isMine(detail)" class="text-button danger" @click="confirmDelete = true">删除</button>
            <button v-if="isMine(detail)" class="btn secondary" :disabled="operationPending" @click="toggleArchived">
              {{ detail.archived ? '恢复到记忆' : '归档' }}</button>
            <RouterLink class="btn soft" :to="`/commitments?new=1&sourceType=MEMORY_CARD&sourceId=${encodeURIComponent(detail.id)}`">
              写下我的下一步</RouterLink>
            <button v-if="isMine(detail)" class="btn primary" @click="editMemory">编辑卡片</button></div>
        </template>
        <p v-if="detailError" class="form-error mt-16" role="alert">{{ detailError }}</p>
      </div>
      <form v-else-if="mode === 'create' || mode === 'edit'" class="form-stack" @submit.prevent="saveMemory()">
        <div class="field"><label for="memory-title">标题 <small>可选</small></label>
          <input id="memory-title" v-model="draft.title" maxlength="100" :disabled="!!editUncertain" placeholder="给这件小事取个名字" /></div>
        <div class="field"><label for="memory-body">记下的内容</label>
          <textarea id="memory-body" v-model="draft.body" maxlength="5000" required rows="6" :disabled="!!editUncertain" placeholder="你想记住什么？" /></div>
        <div class="form-grid"><div class="field"><label for="memory-category">类别 <small>可选</small></label>
          <select id="memory-category" v-model="draft.category" :disabled="!!editUncertain"><option value="">不分类</option>
            <option v-for="(label, value) in categoryLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="memory-source">信息来源</label>
            <select id="memory-source" v-model="draft.sourceType" :disabled="!!editUncertain">
              <option v-for="(label, value) in sourceLabels" :key="value" :value="value">{{ label }}</option></select></div></div>
        <div class="field"><label for="memory-tags">标签 <small>可选，用逗号分隔</small></label>
          <input id="memory-tags" v-model="draft.tagsText" :disabled="!!editUncertain" placeholder="例如：散步，饮食" /></div>
        <div class="field"><label for="memory-date">来源日期 <small>可选</small></label>
          <input id="memory-date" v-model="draft.sourceDate" type="date" :disabled="!!editUncertain" /></div>
        <div class="field"><label for="memory-next">下次行动 <small>可选</small></label>
          <textarea id="memory-next" v-model="draft.nextAction" maxlength="5000" rows="2" :disabled="!!editUncertain" /></div>
        <ReminderDraftFields v-if="mode === 'create'" prefix="memory-create" :timezone="timezone"
          :mail-available="mailAvailable" v-model:mode="reminderDraft.mode"
          v-model:local="reminderDraft.local" v-model:offset="reminderDraft.offset" />
        <p v-else class="field-help">要调整私人提醒，请先保存卡片，再在详情中设置。</p>
        <div class="inline-note">新卡片默认只对你自己可见；提醒只发给自己。</div>
        <p v-if="mode === 'edit' && editCapabilitiesLoading" class="field-help">正在确认本次编辑的通知方式…</p>
        <p v-if="mode === 'edit' && editCapabilities?.effectiveOutgoingMode" class="field-help">
          对方目前选择：{{ editCapabilities.effectiveOutgoingMode === 'NONE' ? '不接收后续通知' : editCapabilities.effectiveOutgoingMode === 'IN_APP' ? '接收站内通知' : '历史邮件方式；保存时需明确改选' }}。</p>
        <p v-if="detailError" class="form-error" role="alert">{{ detailError }}</p>
        <div v-if="latestVersion && !editUncertain" class="inline-note peach"><p>卡片在其他位置发生了变化。当前输入已保留。服务端版本：{{ latestVersion }}。</p>
          <p v-if="latestDetail" class="detail-body">最新原文：{{ latestDetail.body }}</p>
          <button type="button" class="text-button" @click="useLatestVersion">使用最新版本后核对并重试</button></div>
        <div v-if="editOverrideToken" class="inline-note peach"><p>邮件发送尚未启用。此次改选只影响本次编辑，不改变对方保存的方式。</p>
          <div class="field mt-8"><label for="memory-edit-override">本次怎样通知对方</label>
            <select id="memory-edit-override" v-model="editOverrideMode"><option value="IN_APP">站内通知</option>
              <option value="NONE">不通知</option></select></div>
          <button type="button" class="btn primary mt-16" :disabled="operationPending" @click="saveMemory(true)">
            {{ operationPending ? '正在保存…' : '确认改选并保存卡片' }}</button></div>
        <div v-if="editUncertain" class="inline-note peach"><p>保存结果尚不确定；原请求已锁定，不会生成新幂等键。</p>
          <p v-if="latestDetail" class="detail-body">服务端当前原文：{{ latestDetail.body }}</p>
          <button type="button" class="btn secondary" :disabled="operationPending" @click="verifyEditUncertain">重新读取状态</button>
          <button v-if="editRetryVerified" type="button" class="btn primary" :disabled="operationPending" @click="retryEditOriginal">使用原请求核对结果</button></div>
        <div class="dialog-actions"><button type="button" class="btn secondary" @click="closeDialog">取消</button>
          <button v-if="!editOverrideToken && !editUncertain" type="submit" class="btn primary"
            :disabled="operationPending || !!latestVersion">{{ operationPending ? '正在保存…' : '保存卡片' }}</button></div>
      </form>
    </BaseDialog>
  </AppShell>
</template>
