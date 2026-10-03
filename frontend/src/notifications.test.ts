import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearCsrf } from './api'
import { listNotifications, notificationResourceLink, readAllNotifications } from './notifications'
import NotificationsPage from './pages/NotificationsPage.vue'
import { session } from './session'
import type { Me } from './types'
import { unread } from './unread'

const user: Me = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
const item = { id: '5', version: '0', kind: 'REMINDER_DUE', resourceType: 'MEMORY_CARD',
  resourceId: '9', message: '你设置的提醒已到，请登录 Usward 查看',
  createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:00:00Z',
  readAt: null, mailDelivery: null }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })

async function mountedPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/notifications', component: NotificationsPage },
    { path: '/memories', component: { template: '<div>记忆详情</div>' } },
  ] })
  await router.push('/notifications')
  await router.isReady()
  const wrapper = mount(NotificationsPage, { global: { plugins: [router], stubs: {
    AppShell: { template: '<div><slot /></div>' },
  } } })
  return { wrapper, router }
}

describe('notification inbox', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = user
    session.checked = true
    session.reauthRequired = false
    unread.ownerId = null
    unread.count = null
    vi.unstubAllGlobals()
  })

  it('uses server filters, CSRF and opaque read boundary without loading private titles', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => Promise.resolve(path.endsWith('/auth/csrf')
      ? json({ headerName: 'X-CSRF-TOKEN', token: 'token' })
      : json(path.endsWith('/read-all') ? { updatedCount: 2, unreadCount: 1 }
        : { items: [item], total: 25, page: 1, size: 20, hasMore: true,
          asOf: '2026-10-03T10:00:00Z', unreadCount: 25, readBoundary: 'boundary-1' })))
    vi.stubGlobal('fetch', fetchMock)
    const page = await listNotifications({ read: 'UNREAD', page: 1, size: 20 })
    expect(page.unreadCount).toBe(25)
    expect(fetchMock.mock.calls[0][0]).toContain('read=UNREAD&sort=CREATED_DESC&page=1&size=20')
    await readAllNotifications(page.readBoundary)
    const write = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(write[1].body)).toEqual({ readBoundary: 'boundary-1' })
    expect(notificationResourceLink(item)).toBe('/memories?memory=9')
  })

  it('marks one item read before navigating and uses the full unread count', async () => {
    let read = false
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/notifications/5/read') && init?.method === 'POST') {
        read = true; return Promise.resolve(json({ ...item, readAt: '2026-10-03T10:10:00Z' }))
      }
      return Promise.resolve(json({ items: [{ ...item, readAt: read ? '2026-10-03T10:10:00Z' : null }],
        total: 25, page: 1, size: 20, hasMore: true, asOf: '2026-10-03T10:10:00Z',
        unreadCount: read ? 24 : 25, readBoundary: 'boundary-1' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper, router } = await mountedPage()
    await flushPromises()
    expect(wrapper.text()).toContain('25 条未读')
    expect(wrapper.text()).not.toContain('记住这件事')
    await wrapper.get('.notification-card button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/memories?memory=9')
    expect(unread.count).toBe(24)
    wrapper.unmount()
  })

  it('refreshes an expired snapshot and requires a new explicit bulk action', async () => {
    let reads = 0
    let gets = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/read-all') && init?.method === 'POST') {
        reads++
        return Promise.resolve(reads === 1
          ? json({ code: 'READ_BOUNDARY_EXPIRED', message: '快照已失效' }, 409)
          : json({ updatedCount: 24, unreadCount: 1 }))
      }
      gets++
      return Promise.resolve(json({ items: [item], total: 25, page: 1, size: 20,
        hasMore: true, asOf: '2026-10-03T10:00:00Z',
        unreadCount: reads > 1 ? 1 : 25, readBoundary: gets === 1 ? 'boundary-1' : 'boundary-2' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = await mountedPage()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '全部标为已读')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '确认全部标为已读')!.trigger('click')
    await flushPromises()
    expect(reads).toBe(1)
    expect(wrapper.text()).toContain('列表已刷新')
    await wrapper.findAll('button').find(button => button.text() === '全部标为已读')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '确认全部标为已读')!.trigger('click')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/read-all'))
    expect(JSON.parse(writes[0]![1].body).readBoundary).toBe('boundary-1')
    expect(JSON.parse(writes[1]![1].body).readBoundary).toBe('boundary-2')
    expect(unread.count).toBe(1)
    wrapper.unmount()
  })
})
