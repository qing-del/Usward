<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import BaseDialog from '../components/BaseDialog.vue'
import { ApiError, errorMessage } from '../api'
import { availabilityLabels, eventsOnDay, getCalendar, getEvent } from '../calendar'
import type { CalendarEvent } from '../calendar'
import { session } from '../session'
import { addDays, calendarBounds, daysBetween, mondayOf, today } from '../time'

type Mode = 'agenda' | 'week' | 'month' | 'range'
const route = useRoute()
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
const initialDay = typeof route.query.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.day)
  ? route.query.day : today(timezone.value)
const selectedDay = ref(initialDay)
const mode = ref<Mode>(typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 600px)').matches
  ? 'agenda' : 'week')
const rangeStart = ref(initialDay)
const rangeEndExclusive = ref(addDays(initialDay, 7))
const rangeDraftStart = ref(initialDay)
const rangeDraftLast = ref(addDays(initialDay, 6))
const rangeDialog = ref(false)
const rangeError = ref('')
const events = ref<CalendarEvent[]>([])
const loading = ref(false)
const loadError = ref('')
const detailOpen = ref(false)
const detail = ref<CalendarEvent | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
let controller: AbortController | null = null
let sequence = 0

const visibleRange = computed(() => {
  if (mode.value === 'range') return { from: rangeStart.value, to: rangeEndExclusive.value }
  if (mode.value === 'agenda') return { from: selectedDay.value, to: addDays(selectedDay.value, 7) }
  if (mode.value === 'week') {
    const monday = mondayOf(selectedDay.value)
    return { from: monday, to: addDays(monday, 7) }
  }
  const first = `${selectedDay.value.slice(0, 7)}-01`
  const monday = mondayOf(first)
  return { from: monday, to: addDays(monday, 42) }
})
const visibleDays = computed(() => Array.from({ length: daysBetween(visibleRange.value.from,
  visibleRange.value.to) }, (_, index) => addDays(visibleRange.value.from, index)))

async function load() {
  controller?.abort()
  controller = new AbortController()
  const current = ++sequence
  loading.value = true
  loadError.value = ''
  events.value = []
  try {
    const result = await getCalendar(visibleRange.value.from, visibleRange.value.to,
      timezone.value, controller.signal)
    if (current === sequence) events.value = result.items
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    if (current === sequence) loadError.value = errorMessage(cause)
  } finally { if (current === sequence) loading.value = false }
}
watch([() => visibleRange.value.from, () => visibleRange.value.to, timezone], load, { immediate: true })
onBeforeUnmount(() => controller?.abort())

function itemsOn(day: string): CalendarEvent[] { return eventsOnDay(events.value, day, timezone.value) }
function dayLabel(day: string, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`))
}
function momentLabel(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, hour: '2-digit',
    minute: '2-digit', hour12: false }).format(new Date(instant))
}
function dateTimeLabel(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant))
}
function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) {
    const last = addDays(event.endDateExclusive!, -1)
    return `${dayLabel(event.startDate!)}${last !== event.startDate ? `—${dayLabel(last)}` : ''} · 全天（${event.eventTimezone}）`
  }
  return `${dateTimeLabel(event.startsAt!)} — ${dateTimeLabel(event.endsAt!)}`
}
function chipTime(event: CalendarEvent): string {
  return event.allDay ? '全天' : `${momentLabel(event.startsAt!)}–${momentLabel(event.endsAt!)}`
}
function headerLabel(): string {
  if (mode.value === 'range') return `${dayLabel(rangeStart.value)} — ${dayLabel(addDays(rangeEndExclusive.value, -1))}`
  return dayLabel(selectedDay.value, { year: 'numeric', month: 'long' })
}
function shift(direction: number) {
  if (mode.value === 'range') {
    const days = daysBetween(rangeStart.value, rangeEndExclusive.value)
    rangeStart.value = addDays(rangeStart.value, direction * days)
    rangeEndExclusive.value = addDays(rangeEndExclusive.value, direction * days)
    return
  }
  if (mode.value === 'month') {
    const first = new Date(`${selectedDay.value.slice(0, 7)}-01T12:00:00Z`)
    first.setUTCMonth(first.getUTCMonth() + direction)
    selectedDay.value = first.toISOString().slice(0, 10)
    return
  }
  selectedDay.value = addDays(selectedDay.value, direction * 7)
}
function chooseDay(day: string) { selectedDay.value = day; mode.value = 'agenda' }
function openRange() {
  rangeDraftStart.value = rangeStart.value
  rangeDraftLast.value = addDays(rangeEndExclusive.value, -1)
  rangeError.value = ''
  rangeDialog.value = true
}
function applyRange() {
  try {
    const bounds = calendarBounds(rangeDraftStart.value, addDays(rangeDraftLast.value, 1), timezone.value)
    if (bounds.days < 1 || bounds.days > 93) throw new Error('日期范围应为 1 到 93 天。')
    rangeStart.value = rangeDraftStart.value
    rangeEndExclusive.value = addDays(rangeDraftLast.value, 1)
    selectedDay.value = rangeDraftStart.value
    mode.value = 'range'
    rangeDialog.value = false
    rangeError.value = ''
  } catch (cause) { rangeError.value = cause instanceof Error ? cause.message : '日期范围无效。' }
}

async function openEvent(id: string) {
  detailOpen.value = true
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  try { detail.value = await getEvent(id) }
  catch (cause) {
    detailError.value = cause instanceof ApiError && cause.status === 404
      ? '这个安排已不可访问。请返回日历查看最新内容。' : errorMessage(cause)
  } finally { detailLoading.value = false }
}

function closeEvent() { detailOpen.value = false; detail.value = null }
function onCurrentDay() { selectedDay.value = today(timezone.value); if (mode.value === 'range') mode.value = 'agenda' }
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">TIME FOR MYSELF</span>
      <h1 class="serif">为时间，留一点余地。</h1>
      <p class="subtitle">自己的安排好好记；目前这里显示的都是私人日程。</p></div></div>
    <div class="calendar-layout"><section class="calendar-main">
      <div class="calendar-toolbar"><div class="calendar-nav">
        <h2>{{ headerLabel() }}</h2>
        <button class="icon-button" aria-label="上一个时间段" @click="shift(-1)">‹</button>
        <button class="icon-button" aria-label="下一个时间段" @click="shift(1)">›</button>
        <button class="text-button" @click="onCurrentDay">今天</button></div>
        <div class="tabs" aria-label="日历显示方式">
          <button v-for="entry in ([['agenda','日程'],['week','周'],['month','月'],['range','范围']] as const)"
            :key="entry[0]" class="tab" :aria-pressed="mode === entry[0]"
            @click="entry[0] === 'range' ? openRange() : mode = entry[0]">{{ entry[1] }}</button></div></div>
      <div class="calendar-controls"><span class="badge green">我的安排</span>
        <button class="text-button" @click="openRange">选择日期范围 · 最多 93 天</button></div>
      <div class="card calendar-board">
        <div v-if="loading" class="loading-state" role="status">正在查看日历…</div>
        <div v-else-if="loadError" class="empty-state"><p class="form-error" role="alert">{{ loadError }}</p>
          <button class="btn secondary mt-16" @click="load">重试</button></div>
        <div v-else-if="mode === 'agenda' || mode === 'range'" class="agenda-list">
          <section v-for="day in visibleDays" :key="day" class="agenda-day">
            <div class="agenda-date"><strong>{{ dayLabel(day, { day: 'numeric' }) }}</strong>
              <span>{{ dayLabel(day, { weekday: 'short' }) }}</span><small v-if="day === today(timezone)">今天</small></div>
            <div class="agenda-events"><template v-if="itemsOn(day).length">
              <button v-for="event in itemsOn(day)" :key="event.id" class="calendar-event"
                @click="openEvent(event.id)"><span>{{ chipTime(event) }}</span><strong>{{ event.title }}</strong>
                <small>{{ event.offlineConfirmedAt ? '由我记录，线下确认' : '我的个人安排' }}</small></button>
            </template><p v-else class="unmarked">没有安排 · 给日常留一点余地</p></div></section></div>
        <div v-else-if="mode === 'week'" class="week-scroll"><div class="week-grid">
          <section v-for="day in visibleDays" :key="day" class="week-day">
            <button class="week-day-head" :class="{ current: day === today(timezone) }" @click="chooseDay(day)">
              <span>{{ dayLabel(day, { weekday: 'short' }) }}</span><strong>{{ dayLabel(day, { day: 'numeric' }) }}</strong></button>
            <div class="week-day-events"><button v-for="event in itemsOn(day)" :key="event.id" class="calendar-event compact"
              @click="openEvent(event.id)"><small>{{ chipTime(event) }}</small><strong>{{ event.title }}</strong></button>
              <p v-if="!itemsOn(day).length" class="unmarked">未安排</p></div></section></div></div>
        <div v-else class="month-grid"><div v-for="label in ['一','二','三','四','五','六','日']" :key="label" class="month-weekday">周{{ label }}</div>
          <div v-for="day in visibleDays" :key="day" class="month-cell"
            :class="{ outside: day.slice(0,7) !== selectedDay.slice(0,7), current: day === today(timezone) }">
            <button class="month-day-number" :aria-label="`查看${dayLabel(day)}的安排`" @click="chooseDay(day)">{{ Number(day.slice(-2)) }}</button>
            <button v-for="event in itemsOn(day).slice(0,2)" :key="event.id" class="month-event" @click="openEvent(event.id)">{{ event.title }}</button>
            <button v-if="itemsOn(day).length > 2" class="month-more" @click="chooseDay(day)">还有 {{ itemsOn(day).length - 2 }} 项</button></div></div>
      </div><div class="calendar-legend"><span>● 我的安排</span><small>{{ timezone }}</small></div>
    </section><aside class="calendar-aside"><div class="card soft"><h2>属于自己的时间</h2>
      <p class="muted mt-8">安排默认私密。连接、忙闲展示与共同邀约将在相应后端能力完成后接入。</p></div>
      <div class="inline-note">不必把每天填满。记下重要的安排，也给日常留一点余地。</div></aside></div>

    <BaseDialog :open="rangeDialog" title="选择日历日期范围" @close="rangeDialog = false">
      <form class="form-stack" @submit.prevent="applyRange"><div class="form-grid">
        <div class="field"><label for="range-start">开始日期</label><input id="range-start" v-model="rangeDraftStart" type="date" required /></div>
        <div class="field"><label for="range-last">结束日期（包含当天）</label><input id="range-last" v-model="rangeDraftLast" type="date" required /></div></div>
        <p class="field-help">按 {{ timezone }} 的当地日界查询，最多 93 天。</p>
        <p v-if="rangeError" class="form-error" role="alert">{{ rangeError }}</p>
        <div class="dialog-actions"><button class="btn secondary" type="button" @click="rangeDialog = false">取消</button>
          <button class="btn primary" type="submit">查看安排</button></div></form>
    </BaseDialog>
    <BaseDialog :open="detailOpen" :title="detail?.title || '个人安排'" @close="closeEvent">
      <div v-if="detailLoading" class="loading-state" role="status">正在读取安排…</div>
      <template v-else-if="detail"><div class="detail-meta"><span class="badge green">个人安排</span>
        <span v-if="detail.offlineConfirmedAt" class="badge peach">由我记录，线下确认</span></div>
        <p class="detail-body">{{ eventTimeLabel(detail) }}</p>
        <p class="detail-line"><strong>时间状态</strong>{{ availabilityLabels[detail.availability] }}</p>
        <p v-if="detail.location" class="detail-line"><strong>地点</strong>{{ detail.location }}</p>
        <p v-if="detail.note" class="detail-line"><strong>私人备注</strong><span class="detail-body">{{ detail.note }}</span></p>
      </template>
      <p v-if="detailError" class="form-error" role="alert">{{ detailError }}</p>
    </BaseDialog>
  </AppShell>
</template>
