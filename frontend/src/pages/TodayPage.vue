<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import { errorMessage } from '../api'
import type { CalendarEvent } from '../calendar'
import { commitmentDueLabel } from '../commitments'
import type { CommitmentSummary } from '../commitments'
import { getDashboard } from '../dashboard'
import type { Dashboard } from '../dashboard'
import { sourceLabels } from '../memories'
import { session } from '../session'

const dashboard = ref<Dashboard | null>(null)
const loading = ref(true)
const loadError = ref('')
let controller: AbortController | null = null

async function load() {
  controller?.abort()
  controller = new AbortController()
  dashboard.value = null
  loading.value = true
  loadError.value = ''
  try { dashboard.value = await getDashboard(controller.signal) }
  catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    loadError.value = errorMessage(cause)
  } finally { loading.value = false }
}
onMounted(load)
onBeforeUnmount(() => controller?.abort())

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric',
    month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${day}T12:00:00Z`))
}
function eventLabel(event: CalendarEvent, timezone: string): string {
  if (event.allDay) return '全天'
  const format = new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour: '2-digit',
    minute: '2-digit', hour12: false })
  return `${format.format(new Date(event.startsAt!))}–${format.format(new Date(event.endsAt!))}`
}
function dueLabel(item: CommitmentSummary, timezone: string): string {
  return commitmentDueLabel(item, timezone)
}
</script>

<template>
  <AppShell>
    <div class="today-hero"><div class="today-hero-copy"><span class="eyebrow">OUR EVERYDAY</span>
      <h1 class="serif">今天，也慢慢来。</h1>
      <p>{{ dashboard ? dayLabel(dashboard.today) : '正在确认今天的日期…' }} · {{ session.user?.nickname }} 的私人空间</p>
      <div class="page-actions"><RouterLink class="btn primary" to="/memories?new=1">＋ 记一张卡片</RouterLink>
        <RouterLink class="btn soft" to="/calendar?new=1">＋ 个人安排</RouterLink>
        <RouterLink class="btn soft" to="/commitments?new=1">＋ 我的承诺</RouterLink></div></div>
      <img src="/daily.svg" alt="" class="today-art" /></div>
    <div v-if="loading" class="loading-state" role="status">正在整理今天的个人内容…</div>
    <div v-else-if="loadError" class="card empty-state"><p class="form-error" role="alert">{{ loadError }}</p>
      <button class="btn secondary mt-16" @click="load">重试</button></div>
    <template v-else-if="dashboard">
      <div class="today-grid"><section class="card"><div class="section-heading"><h2>今日安排
        <span class="badge">{{ dashboard.groups.events.total }}</span></h2>
        <RouterLink class="text-button" :to="`/calendar?day=${dashboard.today}`">
          {{ dashboard.groups.events.hasMore ? '查看全部' : '查看日历' }}</RouterLink></div>
        <div v-if="!dashboard.groups.events.items.length" class="empty-state"><span class="empty-mark">✿</span>
          <h3>今天没有安排</h3><p>可以给自己留一点余地。</p>
          <RouterLink class="btn secondary mt-16" to="/calendar?new=1">记一段个人安排</RouterLink></div>
        <div v-else class="today-events"><RouterLink v-for="event in dashboard.groups.events.items" :key="event.id"
          class="today-event" :to="`/calendar?day=${dashboard.today}&event=${encodeURIComponent(event.id)}`">
          <span>{{ eventLabel(event, dashboard.timezone) }}</span><strong>{{ event.title }}</strong><small>查看安排　↗</small></RouterLink></div>
        <p v-if="dashboard.groups.events.hasMore" class="muted today-more">显示前 {{ dashboard.groups.events.items.length }} 条，共 {{ dashboard.groups.events.total }} 条。</p>
      </section><section class="card"><div class="section-heading"><h2>到期承诺
        <span class="badge">{{ dashboard.groups.commitments.total }}</span></h2>
        <RouterLink class="text-button" to="/commitments?status=OPEN">查看全部</RouterLink></div>
        <div v-if="!dashboard.groups.commitments.items.length" class="empty-state"><span class="empty-mark">✿</span>
          <h3>今天没有到期承诺</h3><p>写下的下一步，可以按自己的节奏完成。</p>
          <RouterLink class="btn secondary mt-16" to="/commitments?new=1">写下我的下一步</RouterLink></div>
        <div v-else class="today-commitments"><RouterLink v-for="item in dashboard.groups.commitments.items" :key="item.id"
          class="today-commitment" :to="`/commitments?commitment=${encodeURIComponent(item.id)}`">
          <span class="badge" :class="item.isOverdue ? 'peach' : 'green'">{{ item.isOverdue ? '已过约定时间' : '今天到期' }}</span>
          <strong>{{ item.title }}</strong><small>{{ dueLabel(item, dashboard.timezone) }}</small>
          <span v-if="item.nextAction" class="commitment-next"><small>下一步</small>{{ item.nextAction }}</span></RouterLink></div>
        <p v-if="dashboard.groups.commitments.hasMore" class="muted today-more">显示前 {{ dashboard.groups.commitments.items.length }} 条，共 {{ dashboard.groups.commitments.total }} 条。</p>
      </section></div>
      <section class="card today-featured"><div class="section-heading"><h2>最近记下</h2>
        <RouterLink class="text-button" to="/memories">翻看记忆</RouterLink></div>
        <div v-if="!dashboard.featuredMemory" class="empty-state"><span class="empty-mark">✿</span>
          <h3>还没有卡片</h3><p>把一件值得记住的小事写下来。</p>
          <RouterLink class="btn secondary mt-16" to="/memories?new=1">记一张卡片</RouterLink></div>
        <RouterLink v-else class="recent-memory-link" :to="`/memories?memory=${encodeURIComponent(dashboard.featuredMemory.id)}`">
          <span class="badge green">仅自己可见</span>
          <h3 class="serif">{{ dashboard.featuredMemory.title || '一件值得记住的小事' }}</h3>
          <p>{{ sourceLabels[dashboard.featuredMemory.sourceType] }}</p>
          <div class="memory-card-tags">{{ dashboard.featuredMemory.tags.map(tag => `# ${tag}`).join('　') }}</div>
          <span class="text-button">查看卡片　↗</span></RouterLink>
      </section>
    </template>
    <div class="today-note">这里展示已接入的个人内容。表达、邀约、提醒和通知会随对应接口逐步加入。</div>
  </AppShell>
</template>
