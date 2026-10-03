<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import { ApiError, errorMessage } from '../api'
import { listNotifications, mailDeliveryLabels, notificationResourceLabel,
  notificationResourceLink, readAllNotifications, readNotification } from '../notifications'
import type { NotificationDetail, NotificationReadFilter } from '../notifications'
import { session } from '../session'
import { setUnreadCount } from '../unread'

const router = useRouter()
const filters: { value: NotificationReadFilter; label: string }[] = [
  { value: 'ALL', label: '全部' }, { value: 'UNREAD', label: '未读' }, { value: 'READ', label: '已读' },
]
const read = ref<NotificationReadFilter>('ALL')
const items = ref<NotificationDetail[]>([])
const total = ref(0)
const unreadCount = ref(0)
const page = ref(1)
const hasMore = ref(false)
const readBoundary = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const actionId = ref<string | null>(null)
const confirmReadAll = ref(false)
const bulkPending = ref(false)
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
let controller: AbortController | null = null
let sequence = 0

async function load(targetPage: number) {
  controller?.abort()
  controller = new AbortController()
  const current = ++sequence
  if (targetPage === 1) { loading.value = true; items.value = []; total.value = 0; loadError.value = '' }
  else loadingMore.value = true
  try {
    const result = await listNotifications({ read: read.value, page: targetPage, size: 20 }, controller.signal)
    if (current !== sequence) return
    items.value = targetPage === 1 ? result.items : [...items.value, ...result.items]
    total.value = result.total
    unreadCount.value = result.unreadCount
    setUnreadCount(result.unreadCount)
    page.value = result.page
    hasMore.value = result.hasMore
    readBoundary.value = result.readBoundary
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    if (current === sequence) loadError.value = errorMessage(cause)
  } finally { if (current === sequence) { loading.value = false; loadingMore.value = false } }
}

function timeLabel(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(instant))
}

async function openItem(item: NotificationDetail) {
  if (actionId.value || bulkPending.value) return
  actionError.value = ''
  notice.value = ''
  const target = notificationResourceLink(item)
  actionId.value = item.id
  try {
    if (!item.readAt) {
      await readNotification(item.id)
      await load(1)
    }
    if (target) await router.push(target)
    else notice.value = '已标为已读；此类内容暂时没有详情入口。'
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      await load(1)
      actionError.value = '这条通知或关联内容已不可访问，列表已刷新。'
    } else actionError.value = errorMessage(cause)
  } finally { actionId.value = null }
}

async function markAllRead() {
  if (!confirmReadAll.value || bulkPending.value || !readBoundary.value) return
  bulkPending.value = true
  actionError.value = ''
  notice.value = ''
  try {
    const result = await readAllNotifications(readBoundary.value)
    unreadCount.value = result.unreadCount
    setUnreadCount(result.unreadCount)
    confirmReadAll.value = false
    await load(1)
    notice.value = `已标记 ${result.updatedCount} 条通知。`
  } catch (cause) {
    confirmReadAll.value = false
    if (cause instanceof ApiError && cause.code === 'READ_BOUNDARY_EXPIRED') {
      await load(1)
      actionError.value = '通知快照已失效，列表已刷新。请核对后再次选择全部标为已读。'
    } else actionError.value = errorMessage(cause)
  } finally { bulkPending.value = false }
}

watch(read, () => { confirmReadAll.value = false; actionError.value = ''; load(1) })
watch(() => session.reauthRequired, (required, previous) => {
  if (previous && !required) { confirmReadAll.value = false; void load(1) }
})
onMounted(() => load(1))
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">A QUIET NOTE</span>
      <h1 class="serif">站内通知。</h1>
      <p class="subtitle">只显示当前仍可访问的通知；打开内容时会再次检查权限。</p></div></div>
    <div class="toolbar notification-toolbar"><div class="tabs" aria-label="通知状态">
      <button v-for="filter in filters" :key="filter.value" class="tab" :aria-pressed="read === filter.value"
        @click="read = filter.value">{{ filter.label }}</button></div>
      <span class="badge green">{{ unreadCount }} 条未读</span>
      <button class="btn secondary" :disabled="!unreadCount || loading || bulkPending" @click="confirmReadAll = true">全部标为已读</button></div>
    <div v-if="confirmReadAll" class="inline-note peach notification-confirm"><p>将标记这次查询时已经存在、现在仍可访问的未读通知。新到的通知会保持未读。</p>
      <div class="dialog-actions mt-16"><button class="btn secondary" :disabled="bulkPending" @click="confirmReadAll = false">返回</button>
        <button class="btn primary" :disabled="bulkPending" @click="markAllRead">{{ bulkPending ? '正在标记…' : '确认全部标为已读' }}</button></div></div>
    <p v-if="actionError" class="form-error mt-16" role="alert">{{ actionError }}</p>
    <p v-if="notice" class="form-success mt-16" role="status">{{ notice }}</p>
    <p class="results-heading"><strong>符合条件的通知 · {{ total }} 条</strong><span>按最近时间排列</span></p>
    <div v-if="loading" class="loading-state" role="status">正在查看通知…</div>
    <div v-else-if="loadError" class="card empty-state"><p class="form-error" role="alert">{{ loadError }}</p>
      <button class="btn secondary mt-16" @click="load(1)">重试</button></div>
    <div v-else-if="!items.length" class="card empty-state"><span class="empty-mark">✿</span>
      <h2>这里暂时没有通知</h2><p>你设置的到时提醒会在处理后留在这里。</p></div>
    <div v-else class="notification-list"><article v-for="item in items" :key="item.id" class="card notification-card"
      :class="{ unread: !item.readAt }"><div class="detail-meta"><span class="badge" :class="item.readAt ? 'gray' : 'green'">
        {{ item.readAt ? '已读' : '未读' }}</span><span class="badge">{{ item.kind === 'REMINDER_DUE' ? '私人提醒' : '站内通知' }}</span></div>
      <p>{{ item.message }}</p><small>{{ timeLabel(item.createdAt) }} · {{ notificationResourceLabel(item.resourceType) }}</small>
      <small v-if="item.mailDelivery" class="muted">{{ mailDeliveryLabels[item.mailDelivery.status] }}</small>
      <button v-if="notificationResourceLink(item) || !item.readAt" class="text-button"
        :disabled="!!actionId || bulkPending" @click="openItem(item)">
        {{ actionId === item.id ? '正在打开…' : notificationResourceLink(item) ? '查看内容 ↗' : '标为已读' }}</button>
    </article></div>
    <div v-if="hasMore && !loading" class="more-row"><button class="btn secondary" :disabled="loadingMore"
      @click="load(page + 1)">{{ loadingMore ? '正在加载…' : '再看 20 条通知' }}</button></div>
  </AppShell>
</template>
