import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoryComments from './components/MemoryComments.vue'
import { clearCsrf } from './api'
import type { MemoryDetail } from './memories'
import { session } from './session'

const memory: MemoryDetail = {
  id: '9', version: '7', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  ownerId: '1', owner: { id: '1', nickname: 'Alice', avatarStyle: 'INITIAL' },
  sharedConnectionId: '23', title: '花', body: '作者的原文', category: null, tags: [],
  sourceType: 'EXPLICIT', sourceDate: null, nextAction: null, archived: null,
  myReminder: null, myNotificationSetting: { followUpMode: 'IN_APP', version: '1' },
}
const comment = (n: number) => ({ id: String(n), cardId: '9', authorId: '2',
  author: { id: '2', nickname: 'Bob', avatarStyle: 'FLOWER' }, body: `补充 ${n}`,
  createdAt: '2026-10-04T00:00:00Z' })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })
const commentPage = (page: number, count: number, total: number) => ({
  items: Array.from({ length: count }, (_, index) => comment((page - 1) * 20 + index + 1)),
  total, page, size: 20, hasMore: page * 20 < total, asOf: '2026-10-04T00:00:00Z',
})

describe('shared memory comments', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = { id: '2', username: 'bob', nickname: 'Bob', avatarStyle: 'FLOWER',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0',
      stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.reauthRequired = false
    vi.unstubAllGlobals()
  })

  it('paginates on the server and posts a string card version without changing the original body', async () => {
    let posted = false
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (path.includes('/notification-capabilities')) return Promise.resolve(json({
        selfMailAvailable: false, otherMailAvailable: false, effectiveOutgoingMode: 'IN_APP',
      }))
      if (path.includes('/comments?')) return Promise.resolve(json(path.includes('page=2')
        ? commentPage(2, posted ? 6 : 5, posted ? 26 : 25)
        : commentPage(1, 20, posted ? 26 : 25)))
      if (path.endsWith('/comments') && init?.method === 'POST') {
        posted = true
        return Promise.resolve(json({ comment: comment(26), memoryVersion: '8' }))
      }
      if (path.endsWith('/memories/9')) return Promise.resolve(json({ ...memory, version: '8' }))
      throw new Error(`unexpected ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(MemoryComments, { props: { memory, isOwner: false } })
    await flushPromises()
    expect(wrapper.text()).toContain('补充与更正 25')
    await wrapper.findAll('button').find(button => button.text() === '再看 20 条补充')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.memory-comments-list li')).toHaveLength(25)
    await wrapper.get('#memory-comment-body').setValue('我记得另一种颜色')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const post = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toEqual({ expectedVersion: '7', body: '我记得另一种颜色' })
    expect(post[1].headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(wrapper.emitted('updated')?.at(-1)?.[0]).toMatchObject({ version: '8', body: '作者的原文' })
    expect(wrapper.findAll('.memory-comments-list li')).toHaveLength(20)
    expect(wrapper.text()).toContain('补充与更正 26')
    wrapper.unmount()
  })

  it('requires explicit one-time fallback for a historical mail setting', async () => {
    let posts = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (path.includes('/notification-capabilities')) return Promise.resolve(json({
        selfMailAvailable: false, otherMailAvailable: false, effectiveOutgoingMode: 'IN_APP_AND_MAIL',
      }))
      if (path.includes('/comments?')) return Promise.resolve(json(commentPage(1, posts > 1 ? 1 : 0, posts > 1 ? 1 : 0)))
      if (path.endsWith('/comments') && init?.method === 'POST') {
        posts++
        return Promise.resolve(posts === 1
          ? json({ code: 'MAIL_NOT_AVAILABLE', message: '邮件不可用',
            details: { overrideToken: 'temporary-token' } }, 409)
          : json({ comment: comment(1), memoryVersion: '8' }))
      }
      if (path.endsWith('/memories/9')) return Promise.resolve(json({ ...memory, version: '8' }))
      throw new Error(`unexpected ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(MemoryComments, { props: { memory, isOwner: false } })
    await flushPromises()
    await wrapper.get('#memory-comment-body').setValue('更正')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(posts).toBe(1)
    expect((wrapper.get('#memory-comment-body').element as HTMLTextAreaElement).value).toBe('更正')
    await wrapper.get('#memory-comment-override').setValue('NONE')
    await wrapper.findAll('button').find(button => button.text() === '确认改选并保存补充')!.trigger('click')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => call[1]?.method === 'POST')
    expect(JSON.parse(writes[1]![1].body)).toEqual({ expectedVersion: '7', body: '更正',
      notificationOverride: { mode: 'NONE', token: 'temporary-token' } })
    expect(writes[1]![1].headers.get('Idempotency-Key'))
      .toBe(writes[0]![1].headers.get('Idempotency-Key'))
    wrapper.unmount()
  })

  it('reads state after a lost response before offering the original exact request', async () => {
    let posts = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (path.includes('/notification-capabilities')) return Promise.resolve(json({
        selfMailAvailable: false, otherMailAvailable: false, effectiveOutgoingMode: 'IN_APP',
      }))
      if (path.includes('/comments?')) return Promise.resolve(json(commentPage(1, posts > 1 ? 1 : 0, posts > 1 ? 1 : 0)))
      if (path.endsWith('/comments') && init?.method === 'POST') {
        posts++
        return posts === 1 ? Promise.reject(new TypeError('lost response'))
          : Promise.resolve(json({ comment: comment(1), memoryVersion: '8' }))
      }
      if (path.endsWith('/memories/9')) return Promise.resolve(json(memory))
      throw new Error(`unexpected ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(MemoryComments, { props: { memory, isOwner: false } })
    await flushPromises()
    await wrapper.get('#memory-comment-body').setValue('未确认的补充')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fetchMock.mock.calls.some(call => call[0].endsWith('/memories/9'))).toBe(true)
    expect(posts).toBe(1)
    await wrapper.findAll('button').find(button => button.text() === '使用原请求核对结果')!.trigger('click')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => call[1]?.method === 'POST')
    expect(writes[1]![1].body).toBe(writes[0]![1].body)
    expect(writes[1]![1].headers.get('Idempotency-Key'))
      .toBe(writes[0]![1].headers.get('Idempotency-Key'))
    wrapper.unmount()
  })
})
