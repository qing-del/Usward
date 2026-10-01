import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CalendarPage from './pages/CalendarPage.vue'
import { clearCsrf } from './api'
import { eventsOnDay, getCalendar } from './calendar'
import type { CalendarEvent } from './calendar'
import { session } from './session'

const event: CalendarEvent = {
  id: '1', version: '0', createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
  kind: 'PERSONAL', ownerId: '1', connectionId: null, title: '阅读', location: null, note: null,
  allDay: false, startsAt: '2026-09-29T01:00:00Z', endsAt: '2026-09-29T02:00:00Z',
  startDate: null, endDateExclusive: null, eventTimezone: 'Asia/Shanghai', availability: 'BUSY',
  shareTitle: false, offlineConfirmedAt: null, status: 'CONFIRMED', originInvitationId: null,
  pendingChangeInvitationId: null, cancellationReason: null, myReminder: null, myNotificationSetting: null,
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

describe('calendar range reads', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.checked = true
    vi.unstubAllGlobals()
  })

  it('sends one range request for a calendar view and no per-day detail requests', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ items: [event], from: '', to: '',
      timezone: 'Asia/Shanghai', asOf: '2026-09-29T00:00:00Z' })))
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/calendar', component: CalendarPage },
    ] })
    await router.push('/calendar?day=2026-09-29')
    await router.isReady()
    const wrapper = mount(CalendarPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open', 'title'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('scope=MINE')
    expect(fetchMock.mock.calls[0][0]).toContain('timezone=Asia%2FShanghai')
    expect(wrapper.findAll('.week-day')).toHaveLength(7)
    const month = wrapper.findAll('.calendar-toolbar .tab')[2]!
    await month.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.month-cell')).toHaveLength(42)
    wrapper.unmount()
  })

  it('keeps the end boundary exclusive when grouping events into local days', () => {
    const onBoundary = { ...event, startsAt: '2026-09-29T15:00:00Z',
      endsAt: '2026-09-29T16:00:00Z' }
    expect(eventsOnDay([onBoundary], '2026-09-29', 'Asia/Shanghai')).toHaveLength(1)
    expect(eventsOnDay([onBoundary], '2026-09-30', 'Asia/Shanghai')).toHaveLength(0)
  })

  it('forms the documented UTC query from local dates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ items: [], from: '', to: '', timezone: '', asOf: '' }))
    vi.stubGlobal('fetch', fetchMock)
    await getCalendar('2026-09-29', '2026-09-30', 'Asia/Shanghai')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('from=2026-09-28T16%3A00%3A00.000Z')
    expect(url).toContain('to=2026-09-29T16%3A00%3A00.000Z')
  })
})
