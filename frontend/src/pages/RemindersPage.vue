<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import { errorMessage } from '../api'
import { listReminders, reminderResourceLabels, reminderResourceLink, reminderStatusLabels } from '../reminders'
import type { ReminderDetail, ReminderFilterStatus, ReminderResourceType } from '../reminders'
import { session } from '../session'

const route = useRoute()
const types: { value: ReminderResourceType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '全部内容' }, { value: 'MEMORY_CARD', label: '记忆卡片' },
  { value: 'CALENDAR_EVENT', label: '个人安排' }, { value: 'COMMITMENT', label: '我的承诺' },
]
const statuses: ReminderFilterStatus[] = ['PENDING', 'FIRED', 'CANCELLED', 'ALL']
const resourceType = ref<ReminderResourceType | 'ALL'>('ALL')
const status = ref<ReminderFilterStatus>(statuses.includes(route.query.status as ReminderFilterStatus)
  ? route.query.status as ReminderFilterStatus : 'PENDING')
const items = ref<ReminderDetail[]>([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const asOf = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
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
    const result = await listReminders({ resourceType: resourceType.value === 'ALL' ? null : resourceType.value,
      status: status.value, page: targetPage, size: 20 }, controller.signal)
    if (current !== sequence) return
    items.value = targetPage === 1 ? result.items : [...items.value, ...result.items]
    total.value = result.total
    page.value = result.page
    hasMore.value = result.hasMore
    asOf.value = result.asOf
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
function waitingForScan(item: ReminderDetail): boolean {
  return item.status === 'PENDING' && !!asOf.value
    && Date.parse(item.scheduledAt) <= Date.parse(asOf.value)
}

watch([resourceType, status], () => load(1))
onMounted(() => load(1))
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">ONLY FOR ME</span>
      <h1 class="serif">给自己留一个提醒。</h1>
      <p class="subtitle">设置时间与方式只对自己可见。到时会生成站内通知。</p></div></div>
    <div class="toolbar reminder-toolbar"><div class="field"><label for="reminder-type">内容类型</label>
      <select id="reminder-type" v-model="resourceType">
        <option v-for="choice in types" :key="choice.value" :value="choice.value">{{ choice.label }}</option></select></div>
      <div class="field"><label for="reminder-status">提醒状态</label>
        <select id="reminder-status" v-model="status"><option v-for="choice in statuses" :key="choice" :value="choice">
          {{ choice === 'ALL' ? '全部状态' : reminderStatusLabels[choice] }}</option></select></div></div>
    <p class="results-heading"><strong>符合条件的提醒 · {{ total }} 条</strong><span>仅自己可见</span></p>
    <div v-if="loading" class="loading-state" role="status">正在查看私人提醒…</div>
    <div v-else-if="loadError" class="card empty-state"><p class="form-error" role="alert">{{ loadError }}</p>
      <button class="btn secondary mt-16" @click="load(1)">重试</button></div>
    <div v-else-if="!items.length" class="card empty-state"><span class="empty-mark">✿</span>
      <h2>没有符合条件的提醒</h2><p>可以在记忆、个人安排或进行中的承诺里设置。</p></div>
    <div v-else class="reminder-list"><article v-for="item in items" :key="item.id" class="card reminder-card">
      <div class="detail-meta"><span class="badge" :class="item.status === 'PENDING' ? 'green' : 'gray'">{{ reminderStatusLabels[item.status] }}</span>
        <span class="badge">{{ reminderResourceLabels[item.resourceType] }}</span></div>
      <strong>{{ reminderResourceLabels[item.resourceType] }} #{{ item.resourceId }}</strong>
      <p>{{ timeLabel(item.scheduledAt) }}（{{ timezone }}）</p>
      <p v-if="waitingForScan(item)" class="muted">
        已到设置时间，等待后端处理。</p>
      <p class="muted">{{ item.deliveryMode === 'IN_APP' ? '站内通知' : '站内及邮件通知（历史设置）' }}</p>
      <RouterLink class="text-button" :to="reminderResourceLink(item)">查看内容与提醒设置　↗</RouterLink>
    </article></div>
    <div v-if="hasMore && !loading" class="more-row"><button class="btn secondary" :disabled="loadingMore"
      @click="load(page + 1)">{{ loadingMore ? '正在加载…' : '再看 20 条提醒' }}</button></div>
  </AppShell>
</template>
