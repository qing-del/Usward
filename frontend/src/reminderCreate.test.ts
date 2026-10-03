import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearCsrf } from './api'
import { reminderPlan, saveCreatedReminder } from './reminderCreate'
import MemoriesPage from './pages/MemoriesPage.vue'
import CalendarPage from './pages/CalendarPage.vue'
import CommitmentsPage from './pages/CommitmentsPage.vue'
import { session } from './session'
import type { Me } from './types'

const user: Me = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
const memory = { id: '9', version: '0', ownerId: '1', title: '记得', body: '记住这件事',
  category: null, tags: [], sourceType: 'INTERPRETATION', sourceDate: null, nextAction: null,
  archived: false, myReminder: null, myNotificationSetting: null,
  createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
const reminder = { id: '3', resourceType: 'MEMORY_CARD', resourceId: '9',
  scheduledAt: '2026-10-04T02:00:00Z', deliveryMode: 'IN_APP', revision: '1',
  status: 'PENDING', version: '0', createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z' }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })

describe('reminders after resource creation', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = user
    session.checked = true
    session.reauthRequired = false
    vi.unstubAllGlobals()
  })

  it('validates reminder time before creating the content', () => {
    expect(() => reminderPlan({ mode: 'IN_APP', local: '2026-03-08T02:30', offset: '' },
      'America/New_York', false)).toThrow('不存在')
    expect(() => reminderPlan({ mode: 'IN_APP', local: '2026-11-01T01:30', offset: '' },
      'America/New_York', false)).toThrow('重复出现')
    expect(() => reminderPlan({ mode: 'IN_APP_AND_MAIL', local: '2026-10-04T10:00', offset: '' },
      'Asia/Shanghai', false)).toThrow('邮件提醒尚不可用')
  })

  it('recognizes a successful PUT after its response is lost without resubmitting', async () => {
    let stored = false
    let puts = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (init?.method === 'PUT') { stored = true; puts++; return Promise.reject(new Error('response lost')) }
      return Promise.resolve(json({ ...memory, myReminder: stored ? reminder : null }))
    }))
    const result = await saveCreatedReminder('MEMORY_CARD', '9', {
      deliveryMode: 'IN_APP', scheduledAt: reminder.scheduledAt,
    })
    expect(result).toMatchObject({ kind: 'saved', reminder: { revision: '1' } })
    expect(puts).toBe(1)
  })

  it('keeps saved content and reminder input after a failed PUT, then retries only the reminder', async () => {
    let puts = 0
    let posts = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/memories') && init?.method === 'POST') { posts++; return Promise.resolve(json(memory, 201)) }
      if (path.endsWith('/memories/9')) return Promise.resolve(json({ ...memory, myReminder: puts > 1 ? reminder : null }))
      if (path.endsWith('/reminders') && init?.method === 'PUT') {
        puts++
        return puts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(json(reminder))
      }
      return Promise.resolve(json({ items: [], total: 0, page: 1, size: 9, hasMore: false,
        asOf: '', availableTags: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/memories', component: MemoriesPage }, { path: '/commitments', component: MemoriesPage },
    ] })
    await router.push('/memories')
    await router.isReady()
    const wrapper = mount(MemoriesPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('记一张卡片'))!.trigger('click')
    await wrapper.get('#memory-body').setValue('记住这件事')
    await wrapper.get('#memory-create-mode').setValue('IN_APP')
    await wrapper.get('#memory-create-time').setValue('2026-10-04T10:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(posts).toBe(1)
    expect(puts).toBe(1)
    expect(wrapper.text()).toContain('内容已保存，你选择的提醒未设置')
    expect((wrapper.get('#memory-retry-time').element as HTMLInputElement).value).toBe('2026-10-04T10:00')
    await wrapper.findAll('button').find(button => button.text() === '只重试提醒')!.trigger('click')
    await flushPromises()
    expect(posts).toBe(1)
    expect(puts).toBe(2)
    expect(wrapper.text()).toContain('待触发')
    wrapper.unmount()
  })

  it('sets an event reminder only after the personal event exists', async () => {
    const event = { id: '7', version: '0', title: '散步', kind: 'PERSONAL', ownerId: '1',
      allDay: false, startsAt: '2026-10-04T10:00:00Z', endsAt: '2026-10-04T11:00:00Z',
      eventTimezone: 'Asia/Shanghai', availability: 'BUSY', location: null, note: null,
      offlineConfirmedAt: null, myReminder: null }
    const calls: string[] = []
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/events') && init?.method === 'POST') { calls.push('create'); return Promise.resolve(json(event, 201)) }
      if (path.endsWith('/events/7')) return Promise.resolve(json(event))
      if (path.endsWith('/reminders') && init?.method === 'PUT') {
        calls.push('reminder')
        expect(JSON.parse(init.body as string)).toMatchObject({ resourceType: 'CALENDAR_EVENT',
          resourceId: '7', expectedRevision: null })
        return Promise.resolve(json({ ...reminder, resourceType: 'CALENDAR_EVENT', resourceId: '7' }))
      }
      return Promise.resolve(json({ items: [], from: '', to: '', timezone: 'Asia/Shanghai', asOf: '' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/calendar', component: CalendarPage }, { path: '/commitments', component: CalendarPage },
    ] })
    await router.push('/calendar')
    await router.isReady()
    const wrapper = mount(CalendarPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('个人安排'))!.trigger('click')
    await wrapper.get('#event-title').setValue('散步')
    await wrapper.get('#event-create-mode').setValue('IN_APP')
    await wrapper.get('#event-create-time').setValue('2026-10-04T09:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls).toEqual(['create', 'reminder'])
    wrapper.unmount()
  })

  it('sets a commitment reminder only after the commitment exists', async () => {
    const commitment = { id: '8', version: '0', ownerId: '1', title: '借书', body: null,
      nextAction: null, status: 'OPEN', dueKind: 'NONE', dueAt: null, dueDate: null,
      dueTimezone: null, deadlineAt: null, isOverdue: false, isDueToday: false,
      sharedConnectionId: null, sourceType: null, sourceId: null, sourceAvailable: null,
      myReminder: null }
    const calls: string[] = []
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/commitments') && init?.method === 'POST') {
        calls.push('create'); return Promise.resolve(json(commitment, 201))
      }
      if (path.endsWith('/commitments/8')) return Promise.resolve(json(commitment))
      if (path.endsWith('/reminders') && init?.method === 'PUT') {
        calls.push('reminder')
        expect(JSON.parse(init.body as string)).toMatchObject({ resourceType: 'COMMITMENT',
          resourceId: '8', expectedRevision: null })
        return Promise.resolve(json({ ...reminder, resourceType: 'COMMITMENT', resourceId: '8' }))
      }
      return Promise.resolve(json({ items: [], total: 0, page: 1, size: 20, hasMore: false,
        asOf: '', statusCounts: { OPEN: 0, DONE: 0, CANCELLED: 0 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/commitments', component: CommitmentsPage }, { path: '/memories', component: CommitmentsPage },
    ] })
    await router.push('/commitments')
    await router.isReady()
    const wrapper = mount(CommitmentsPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('写下我的下一步'))!.trigger('click')
    await wrapper.get('#commitment-title').setValue('借书')
    await wrapper.get('#commitment-create-mode').setValue('IN_APP')
    await wrapper.get('#commitment-create-time').setValue('2026-10-04T09:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls).toEqual(['create', 'reminder'])
    wrapper.unmount()
  })
})
