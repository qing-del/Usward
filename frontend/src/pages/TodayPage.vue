<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import { errorMessage } from '../api'
import { eventsOnDay, getCalendar } from '../calendar'
import type { CalendarEvent } from '../calendar'
import { listMemories, sourceLabels } from '../memories'
import type { MemorySummary } from '../memories'
import { session } from '../session'
import { addDays, today } from '../time'

const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
const currentDay = computed(() => today(timezone.value))
const events = ref<CalendarEvent[]>([])
const recentMemory = ref<MemorySummary | null>(null)
const calendarPending = ref(true)
const memoryPending = ref(true)
const calendarError = ref('')
const memoryError = ref('')

function dayLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric',
    month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${currentDay.value}T12:00:00Z`))
}
function eventLabel(event: CalendarEvent): string {
  if (event.allDay) return '全天'
  const format = new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, hour: '2-digit',
    minute: '2-digit', hour12: false })
  return `${format.format(new Date(event.startsAt!))}–${format.format(new Date(event.endsAt!))}`
}

async function loadCalendar() {
  calendarPending.value = true
  calendarError.value = ''
  try {
    const result = await getCalendar(currentDay.value, addDays(currentDay.value, 1), timezone.value)
    events.value = eventsOnDay(result.items, currentDay.value, timezone.value)
  } catch (cause) { calendarError.value = errorMessage(cause) }
  finally { calendarPending.value = false }
}

async function loadMemory() {
  memoryPending.value = true
  memoryError.value = ''
  try {
    const result = await listMemories({ archived: false, keyword: '', category: null,
      tag: '', page: 1, size: 1 })
    recentMemory.value = result.items[0] ?? null
  } catch (cause) { memoryError.value = errorMessage(cause) }
  finally { memoryPending.value = false }
}
onMounted(() => { loadCalendar(); loadMemory() })
</script>

<template>
  <AppShell>
    <div class="today-hero"><div class="today-hero-copy"><span class="eyebrow">OUR EVERYDAY</span>
      <h1 class="serif">今天，也慢慢来。</h1>
      <p>{{ dayLabel() }} · {{ session.user?.nickname }} 的私人空间</p>
      <div class="page-actions"><RouterLink class="btn primary" to="/memories?new=1">＋ 记一张卡片</RouterLink>
        <RouterLink class="btn soft" to="/calendar?new=1">＋ 个人安排</RouterLink></div></div>
      <img src="/daily.svg" alt="" class="today-art" /></div>
    <div class="today-grid"><section class="card"><div class="section-heading"><h2>今日安排</h2>
      <RouterLink class="text-button" :to="`/calendar?day=${currentDay}`">查看日历</RouterLink></div>
      <div v-if="calendarPending" class="loading-state" role="status">正在查看今天的安排…</div>
      <div v-else-if="calendarError" class="empty-state"><p class="form-error" role="alert">{{ calendarError }}</p>
        <button class="btn secondary mt-16" @click="loadCalendar">重试</button></div>
      <div v-else-if="!events.length" class="empty-state"><span class="empty-mark">✿</span>
        <h3>今天没有安排</h3><p>可以给自己留一点余地。</p>
        <RouterLink class="btn secondary mt-16" to="/calendar?new=1">记一段个人安排</RouterLink></div>
      <div v-else class="today-events"><RouterLink v-for="event in events" :key="event.id"
        class="today-event" :to="`/calendar?day=${currentDay}&event=${encodeURIComponent(event.id)}`">
        <span>{{ eventLabel(event) }}</span><strong>{{ event.title }}</strong><small>查看安排　↗</small></RouterLink></div>
    </section><section class="card today-memory"><div class="section-heading"><h2>最近记下</h2>
      <RouterLink class="text-button" to="/memories">翻看记忆</RouterLink></div>
      <div v-if="memoryPending" class="loading-state" role="status">正在翻看记忆…</div>
      <div v-else-if="memoryError" class="empty-state"><p class="form-error" role="alert">{{ memoryError }}</p>
        <button class="btn secondary mt-16" @click="loadMemory">重试</button></div>
      <div v-else-if="!recentMemory" class="empty-state"><span class="empty-mark">✿</span>
        <h3>还没有卡片</h3><p>把一件值得记住的小事写下来。</p>
        <RouterLink class="btn secondary mt-16" to="/memories?new=1">记一张卡片</RouterLink></div>
      <RouterLink v-else class="recent-memory-link" :to="`/memories?memory=${encodeURIComponent(recentMemory.id)}`">
        <span class="badge green">仅自己可见</span>
        <h3 class="serif">{{ recentMemory.title || '一件值得记住的小事' }}</h3>
        <p>{{ sourceLabels[recentMemory.sourceType] }}</p>
        <div class="memory-card-tags">{{ recentMemory.tags.map(tag => `# ${tag}`).join('　') }}</div>
        <span class="text-button">查看卡片　↗</span></RouterLink>
    </section></div>
    <div class="today-note">这里先展示已接入的个人内容。承诺、提醒、表达和共同安排会随对应后端接口逐步加入。</div>
  </AppShell>
</template>
