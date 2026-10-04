import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoryShareControls from './components/MemoryShareControls.vue'
import { clearCsrf } from './api'
import type { MemoryDetail } from './memories'
import { session } from './session'

const memory: MemoryDetail = {
  id: '9007199254740993', version: '7', createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z', ownerId: '1',
  owner: { id: '1', nickname: 'Alice', avatarStyle: 'INITIAL' },
  sharedConnectionId: null, title: '一张卡片', body: '完整正文', category: 'INTEREST',
  tags: ['花'], sourceType: 'EXPLICIT', sourceDate: null, nextAction: null,
  archived: false, myReminder: null, myNotificationSetting: null,
}
const shared: MemoryDetail = { ...memory, version: '8', sharedConnectionId: '23',
  myNotificationSetting: { followUpMode: 'IN_APP', version: '1' } }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })

describe('memory sharing', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0',
      stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.reauthRequired = false
    vi.unstubAllGlobals()
  })

  it('previews the whole card, submits both notification choices and requires a second revoke click', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (path.endsWith('/connection')) return Promise.resolve(json({ connection: { id: '23' }, currentInvite: null }))
      if (path.includes('/notification-capabilities')) return Promise.resolve(json({
        selfMailAvailable: false, otherMailAvailable: false, effectiveOutgoingMode: null,
      }))
      if (path.endsWith('/share') && init?.method === 'POST') return Promise.resolve(json(shared))
      if (path.endsWith('/share') && init?.method === 'DELETE') return Promise.resolve(json({
        ...memory, version: '9',
      }))
      throw new Error(`unexpected ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(MemoryShareControls, { props: { memory } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('完整正文')
    expect((wrapper.get('#share-outgoing option[value="IN_APP_AND_MAIL"]').element as HTMLOptionElement).disabled)
      .toBe(true)
    await wrapper.get('#share-outgoing').setValue('NONE')
    await wrapper.findAll('button').find(button => button.text() === '确认分享整张卡片')!.trigger('click')
    await flushPromises()
    const post = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toEqual({ connectionId: '23', expectedVersion: '7',
      notificationPlan: { outgoingMode: 'NONE', followUpMode: 'IN_APP' } })
    expect(post[1].headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ sharedConnectionId: '23' })

    await wrapper.setProps({ memory: shared })
    await wrapper.findAll('button').find(button => button.text() === '撤销分享')!.trigger('click')
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0)
    expect(wrapper.text()).toContain('对方的私人提醒、补充记录')
    await wrapper.findAll('button').find(button => button.text() === '确认撤销分享')!.trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(1)
    wrapper.unmount()
  })

  it('checks uncertain results and retries only the identical request with its original key', async () => {
    let shares = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (path.endsWith('/connection')) return Promise.resolve(json({ connection: { id: '23' }, currentInvite: null }))
      if (path.includes('/notification-capabilities')) return Promise.resolve(json({
        selfMailAvailable: false, otherMailAvailable: false, effectiveOutgoingMode: null,
      }))
      if (path.endsWith('/share') && init?.method === 'POST') {
        shares++
        return shares === 1 ? Promise.reject(new TypeError('lost response')) : Promise.resolve(json(shared))
      }
      if (path.endsWith(`/memories/${memory.id}`)) return Promise.resolve(json(memory))
      throw new Error(`unexpected ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(MemoryShareControls, { props: { memory } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '确认分享整张卡片')!.trigger('click')
    await flushPromises()
    expect(shares).toBe(1)
    expect(wrapper.text()).toContain('使用原请求重试')
    await wrapper.findAll('button').find(button => button.text() === '使用原请求重试')!.trigger('click')
    await flushPromises()
    const posts = fetchMock.mock.calls.filter(call => call[1]?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[1]![1].headers.get('Idempotency-Key')).toBe(posts[0]![1].headers.get('Idempotency-Key'))
    expect(posts[1]![1].body).toBe(posts[0]![1].body)
    wrapper.unmount()
  })
})
