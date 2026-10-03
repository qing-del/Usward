import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MePage from './pages/MePage.vue'
import { clearCsrf } from './api'
import { session } from './session'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})
const pair = { id: '20', status: 'ACTIVE', version: '0', members: [
  { id: '1', nickname: 'Alice', avatarStyle: 'INITIAL' },
  { id: '2', nickname: 'Bob', avatarStyle: 'FLOWER' },
] }

describe('my availability visibility', () => {
  beforeEach(() => {
    clearCsrf()
    vi.unstubAllGlobals()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.checked = true
    session.reauthRequired = false
  })

  async function page() {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/me', component: MePage }] })
    await router.push('/me')
    await router.isReady()
    const wrapper = mount(MePage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    return wrapper
  }

  it('sends only a versioned visibility change after connection exists', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: pair, currentInvite: null }))
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/me') && init?.method === 'PATCH') return Promise.resolve(json({
        ...session.user, shareAvailability: true, version: '1',
      }))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await page()
    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.attributes('disabled')).toBeUndefined()
    await toggle.trigger('click')
    await flushPromises()
    const patch = fetchMock.mock.calls.find(call => call[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toEqual({ expectedVersion: '0', shareAvailability: true })
    expect(toggle.attributes('aria-checked')).toBe('true')
    wrapper.unmount()
  })

  it('disables the switch without a connection and reviews a changed profile version', async () => {
    let connected = false
    let writes = 0
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: connected ? pair : null, currentInvite: null }))
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/me') && init?.method === 'PATCH') {
        writes++
        return Promise.resolve(json({ code: 'VERSION_CONFLICT', message: '资料版本已变化' }, 409))
      }
      if (url.endsWith('/me')) return Promise.resolve(json({ ...session.user, version: '5' }))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await page()
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined()
    connected = true
    wrapper.unmount()
    const connectedPage = await page()
    await connectedPage.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(writes).toBe(1)
    expect(connectedPage.text()).toContain('服务端忙闲状态')
    await connectedPage.findAll('button').find(button => button.text() === '采用最新资料后核对')!.trigger('click')
    expect(session.user?.version).toBe('5')
    connectedPage.unmount()
  })
})
