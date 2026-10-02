import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TodayPage from './pages/TodayPage.vue'
import { clearCsrf } from './api'
import { session } from './session'
import { fromLocal, today } from './time'

const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})

describe('personal today page', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.checked = true
    vi.unstubAllGlobals()
  })

  it('shows only authorized current API sections and deep links to their details', async () => {
    const day = today('Asia/Shanghai')
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.includes('/calendar?')) return Promise.resolve(json({ items: [{
        id: '2', allDay: false, startsAt: fromLocal(`${day}T09:00`, 'Asia/Shanghai'),
        endsAt: fromLocal(`${day}T10:00`, 'Asia/Shanghai'), eventTimezone: 'Asia/Shanghai',
        title: '阅读', status: 'CONFIRMED', kind: 'PERSONAL', offlineConfirmedAt: null,
      }], from: '', to: '', timezone: 'Asia/Shanghai', asOf: '' }))
      return Promise.resolve(json({ items: [{ id: '3', title: '最近卡片', sourceType: 'INTERPRETATION',
        tags: ['日常'] }], total: 1, page: 1, size: 1, hasMore: false, asOf: '', availableTags: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/today', component: TodayPage }, { path: '/calendar', component: TodayPage },
      { path: '/memories', component: TodayPage },
    ] })
    await router.push('/today')
    await router.isReady()
    const wrapper = mount(TodayPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
    } } })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.find(call => String(call[0]).includes('/calendar?'))?.[0]).toContain('scope=MINE')
    expect(fetchMock.mock.calls.find(call => String(call[0]).includes('/memories?'))?.[0]).toContain('size=1')
    expect(wrapper.text()).toContain('Alice 的私人空间')
    expect(wrapper.text()).toContain('阅读')
    expect(wrapper.text()).toContain('最近卡片')
    expect(wrapper.find('.today-event').attributes('href')).toContain('event=2')
    expect(wrapper.find('.recent-memory-link').attributes('href')).toContain('memory=3')
    expect(wrapper.text()).not.toContain('待回应')
    wrapper.unmount()
  })
})
