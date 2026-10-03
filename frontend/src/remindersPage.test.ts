import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import RemindersPage from './pages/RemindersPage.vue'
import { session } from './session'
import type { Me } from './types'

const user: Me = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
const item = { id: '4', resourceType: 'MEMORY_CARD', resourceId: '9',
  scheduledAt: '2026-10-04T02:00:00Z', deliveryMode: 'IN_APP', revision: '1',
  status: 'PENDING', version: '0', createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z' }
const json = (value: unknown) => new Response(JSON.stringify(value),
  { headers: { 'Content-Type': 'application/json' } })

describe('reminder list', () => {
  beforeEach(() => { session.user = user; session.checked = true; vi.unstubAllGlobals() })

  it('uses server filters and 20-item pagination, linking to detail without inventing a title', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => Promise.resolve(json({
      items: path.includes('page=2') ? [{ ...item, id: '5', resourceId: '10' }] : [item],
      total: 21, page: path.includes('page=2') ? 2 : 1, size: 20,
      hasMore: !path.includes('page=2'), asOf: '2026-10-03T00:00:00Z',
    })))
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/reminders', component: RemindersPage }, { path: '/memories', component: RemindersPage },
    ] })
    await router.push('/reminders')
    await router.isReady()
    const wrapper = mount(RemindersPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
    } } })
    await flushPromises()
    expect(fetchMock.mock.calls[0][0]).toContain('status=PENDING&sort=SCHEDULED_ASC&page=1&size=20')
    expect(wrapper.text()).toContain('21 条')
    expect(wrapper.get('.reminder-card a').attributes('href')).toContain('memory=9')
    expect(wrapper.text()).not.toContain('记住这件事')
    await wrapper.get('.more-row button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.reminder-card')).toHaveLength(2)
    await wrapper.get('#reminder-type').setValue('CALENDAR_EVENT')
    await flushPromises()
    expect(fetchMock.mock.lastCall?.[0]).toContain('resourceType=CALENDAR_EVENT&status=PENDING')
    wrapper.unmount()
  })
})
