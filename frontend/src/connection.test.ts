import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConnectionPanel from './components/ConnectionPanel.vue'
import { clearCsrf } from './api'
import { session } from './session'

const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})
const invite = { id: '9007199254740993', status: 'PENDING', version: '0',
  expiresAt: '2026-10-05T12:00:00Z' }
const token = 'a'.repeat(43)
const pair = { id: '4', status: 'ACTIVE', version: '0', members: [
  { id: '1', nickname: 'Alice', avatarStyle: 'INITIAL' },
  { id: '2', nickname: 'Bob', avatarStyle: 'FLOWER' },
] }
const dialogStub = { props: ['open', 'title'], template: '<div v-if="open"><slot /></div>' }
const me = () => ({ ...session.user })

describe('connection invitation issuing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    clearCsrf()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.checked = true
    session.reauthRequired = false
  })

  it('shows the token only from the creation response and sends string versions', async () => {
    let currentInvite: typeof invite | null = null
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: null, currentInvite }))
      if (url.endsWith('/connection-invites')) {
        currentInvite = invite
        return Promise.resolve(json({ ...invite, token }))
      }
      if (url.endsWith(`/connection-invites/${invite.id}/revoke`)) {
        currentInvite = null
        return Promise.resolve(json({ ...invite, status: 'REVOKED', version: '1' }))
      }
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const first = mount(ConnectionPanel)
    await flushPromises()
    await first.get('button.btn.primary').trigger('click')
    await flushPromises()
    expect(first.get('#issued-invite-token').element.getAttribute('value')).toBe(token)
    const issueCall = fetchMock.mock.calls.find(call => call[0].endsWith('/connection-invites'))!
    expect(issueCall[1].method).toBe('POST')
    expect(issueCall[1].headers.get('X-CSRF-TOKEN')).toBe('csrf')
    expect(issueCall[0]).not.toContain(token)
    first.unmount()

    const refreshed = mount(ConnectionPanel)
    await flushPromises()
    expect(refreshed.find('#issued-invite-token').exists()).toBe(false)
    expect(refreshed.text()).toContain('口令已无法重显')
    await refreshed.get('button.text-button.danger').trigger('click')
    await flushPromises()
    const revokeCall = fetchMock.mock.calls.find(call => call[0].endsWith(`/connection-invites/${invite.id}/revoke`))!
    expect(JSON.parse(revokeCall[1].body)).toEqual({ expectedVersion: '0' })
    refreshed.unmount()
  })

  it('reads current metadata after a lost creation response without repeating POST', async () => {
    let reads = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/connection')) {
        reads++
        return Promise.resolve(json({ connection: null, currentInvite: reads > 1 ? invite : null }))
      }
      if (url.endsWith('/connection-invites')) return Promise.reject(new TypeError('response lost'))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ConnectionPanel)
    await flushPromises()
    await wrapper.get('button.btn.primary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('口令无法找回')
    expect(wrapper.find('#issued-invite-token').exists()).toBe(false)
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/connection-invites'))).toHaveLength(1)
    wrapper.unmount()
  })

  it('previews the inviter before accepting with the preview version, and clears drafts on account switch', async () => {
    let connected = false
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: connected ? pair : null, currentInvite: null }))
      if (url.endsWith('/connection-invites/preview')) return Promise.resolve(json({ id: '7',
        inviter: pair.members[1], expiresAt: invite.expiresAt, version: '17' }))
      if (url.endsWith('/connection-invites/accept')) { connected = true; return Promise.resolve(json(pair)) }
      if (url.endsWith('/me')) return Promise.resolve(json(me()))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ConnectionPanel, { global: { stubs: { BaseDialog: dialogStub } } })
    await flushPromises()
    await wrapper.get('button.btn.secondary').trigger('click')
    await wrapper.get('#received-invite-token').setValue(token)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Bob')
    expect(fetchMock.mock.calls.some(call => call[0].includes(token))).toBe(false)
    expect(JSON.parse(fetchMock.mock.calls.find(call => call[0].endsWith('/connection-invites/preview'))![1].body))
      .toEqual({ token })
    await wrapper.get('button.btn.primary:last-child').trigger('click')
    await flushPromises()
    expect(JSON.parse(fetchMock.mock.calls.find(call => call[0].endsWith('/connection-invites/accept'))![1].body))
      .toEqual({ token, expectedVersion: '17' })
    expect(wrapper.text()).toContain('连接已建立')
    wrapper.unmount()

    connected = false
    const switching = mount(ConnectionPanel, { global: { stubs: { BaseDialog: dialogStub } } })
    await flushPromises()
    await switching.get('button.btn.secondary').trigger('click')
    await switching.get('#received-invite-token').setValue(token)
    session.user = { ...session.user!, id: '2', username: 'bob', nickname: 'Bob' }
    await flushPromises()
    expect(switching.find('#received-invite-token').exists()).toBe(false)
    expect(switching.text()).not.toContain(token)
    switching.unmount()
  })

  it('retains the token and requires a new preview after an accept conflict', async () => {
    let previews = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: null, currentInvite: null }))
      if (url.endsWith('/connection-invites/preview')) {
        previews++
        return Promise.resolve(json({ id: '7', inviter: pair.members[1],
          expiresAt: invite.expiresAt, version: String(previews - 1) }))
      }
      if (url.endsWith('/connection-invites/accept')) return Promise.resolve(new Response(
        JSON.stringify({ code: 'VERSION_CONFLICT', message: '邀请版本已变化' }), { status: 409 }))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ConnectionPanel, { global: { stubs: { BaseDialog: dialogStub } } })
    await flushPromises()
    await wrapper.get('button.btn.secondary').trigger('click')
    await wrapper.get('#received-invite-token').setValue(token)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('button.btn.primary:last-child').trigger('click')
    await flushPromises()
    expect((wrapper.get('#received-invite-token').element as HTMLInputElement).value).toBe(token)
    expect(wrapper.get('button.btn.primary:last-child').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('重新查看邀请者')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(previews).toBe(2)
    expect(wrapper.get('button.btn.primary:last-child').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the received token through a same-account re-login after 401', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: null, currentInvite: null }))
      if (url.endsWith('/connection-invites/preview')) return Promise.resolve(json({ id: '7',
        inviter: pair.members[1], expiresAt: invite.expiresAt, version: '0' }))
      if (url.endsWith('/connection-invites/accept')) return Promise.resolve(new Response(
        JSON.stringify({ code: 'AUTH_REQUIRED', message: '请重新登录' }), { status: 401 }))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ConnectionPanel, { global: { stubs: { BaseDialog: dialogStub } } })
    await flushPromises()
    await wrapper.get('button.btn.secondary').trigger('click')
    await wrapper.get('#received-invite-token').setValue(token)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('button.btn.primary:last-child').trigger('click')
    await flushPromises()
    expect(session.reauthRequired).toBe(true)
    expect((wrapper.get('#received-invite-token').element as HTMLInputElement).value).toBe(token)
    session.reauthRequired = false
    await flushPromises()
    expect((wrapper.get('#received-invite-token').element as HTMLInputElement).value).toBe(token)
    wrapper.unmount()
  })

  it('ends only after both confirmations and retries only with a refreshed version', async () => {
    let version = '0'
    let ended = false
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: ended ? null : { ...pair, version }, currentInvite: null }))
      if (url.endsWith('/connection/end')) {
        if (version === '0') {
          version = '1'
          return Promise.resolve(new Response(JSON.stringify({ code: 'VERSION_CONFLICT', message: '连接版本已变化' }), { status: 409 }))
        }
        ended = true
        return Promise.resolve(json({ connection: null, currentInvite: null }))
      }
      if (url.endsWith('/me')) return Promise.resolve(json({ ...me(), shareAvailability: false, version: '2' }))
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ConnectionPanel, { global: { stubs: { BaseDialog: dialogStub } } })
    await flushPromises()
    await wrapper.get('button.text-button.danger').trigger('click')
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/connection/end'))).toHaveLength(0)
    await wrapper.get('button.btn.danger').trigger('click')
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/connection/end'))).toHaveLength(0)
    await wrapper.get('button.btn.danger').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('连接状态可能已变化')
    await wrapper.get('button.btn.danger').trigger('click')
    await wrapper.get('button.btn.danger').trigger('click')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => call[0].endsWith('/connection/end'))
    expect(writes.map(call => JSON.parse(call[1].body))).toEqual([
      { expectedVersion: '0' }, { expectedVersion: '1' },
    ])
    expect(wrapper.text()).toContain('连接已解除')
    wrapper.unmount()
  })
})
