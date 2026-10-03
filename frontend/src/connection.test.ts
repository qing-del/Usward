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
})
