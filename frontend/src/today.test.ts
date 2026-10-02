import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TodayPage from './pages/TodayPage.vue'
import { clearCsrf } from './api'
import { session } from './session'

const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})
const empty = { items: [], total: 0, hasMore: false }
const dashboard = {
  asOf: '2026-10-03T12:00:00Z', timezone: 'America/New_York', today: '2026-10-03',
  groups: {
    events: { items: [{ id: '2', allDay: false, startsAt: '2026-10-03T13:00:00Z',
      endsAt: '2026-10-03T14:00:00Z', title: '阅读' }], total: 11, hasMore: true },
    commitments: { items: [{ id: '4', title: '借一本书', nextAction: '去图书馆',
      dueKind: 'DATE', dueDate: '2026-10-03', dueTimezone: 'America/New_York',
      dueAt: null, isOverdue: true, isDueToday: false }], total: 7, hasMore: true },
    expressions: empty, invitations: empty, reminders: empty,
  },
  featuredMemory: { id: '3', title: '最近卡片', sourceType: 'INTERPRETATION', tags: ['日常'] },
  unreadCount: 0,
}

async function mountedPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/today', component: TodayPage }, { path: '/calendar', component: TodayPage },
    { path: '/memories', component: TodayPage }, { path: '/commitments', component: TodayPage },
  ] })
  await router.push('/today')
  await router.isReady()
  return mount(TodayPage, { global: { plugins: [router], stubs: {
    AppShell: { template: '<div><slot /></div>' },
  } } })
}

describe('personal dashboard', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.checked = true
    vi.unstubAllGlobals()
  })

  it('uses one dashboard request and server date, flags, totals and deep links', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(dashboard))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/dashboard')
    expect(wrapper.text()).toContain('2026年10月3日')
    expect(wrapper.text()).toContain('09:00–10:00')
    expect(wrapper.text()).toContain('已过约定时间')
    expect(wrapper.text()).toContain('共 11 条')
    expect(wrapper.text()).toContain('共 7 条')
    expect(wrapper.find('.today-event').attributes('href')).toContain('event=2')
    expect(wrapper.find('.today-commitment').attributes('href')).toContain('commitment=4')
    expect(wrapper.find('.recent-memory-link').attributes('href')).toContain('memory=3')
    expect(wrapper.text()).not.toContain('待回应')
    wrapper.unmount()
  })

  it('keeps quick links available and retries a failed dashboard read', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json(dashboard))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage()
    await flushPromises()
    expect(wrapper.text()).toContain('无法连接服务')
    expect(wrapper.findAll('a').some(link => link.attributes('href') === '/commitments?new=1')).toBe(true)
    await wrapper.get('.empty-state button').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('最近卡片')
    wrapper.unmount()
  })
})
