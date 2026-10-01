import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoriesPage from './pages/MemoriesPage.vue'
import { clearCsrf } from './api'
import { listMemories } from './memories'
import { session } from './session'
import type { Me } from './types'

const user: Me = {
  id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 },
}
const summary = {
  id: '1', version: '0', createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
  ownerId: '1', owner: { id: '1', nickname: 'Alice', avatarStyle: 'INITIAL' },
  title: '喜欢的花', category: 'INTEREST', tags: ['花'], sourceType: 'INTERPRETATION', sharedConnectionId: null,
}
const detail = { ...summary, body: '不应出现在列表里的私密正文', sourceDate: null,
  nextAction: null, archived: false, myReminder: null, myNotificationSetting: null }
const page = (items: unknown[], pageNumber: number, hasMore = false) => ({
  items, total: hasMore ? 2 : items.length, page: pageNumber, size: 9, hasMore,
  asOf: '2026-10-01T00:00:00Z', availableTags: [{ tag: '花', count: 2 }],
})
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

function mountedPage() {
  return mount(MemoriesPage, { global: { stubs: {
    AppShell: { template: '<div><slot /></div>' },
    BaseDialog: { props: ['open', 'title'], template: '<div v-if="open"><slot /></div>' },
  } } })
}

describe('private memories', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = user
    session.checked = true
    vi.unstubAllGlobals()
  })

  it('requests complete server-side filters and pagination, then fetches body only on open', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.includes('page=2')) return Promise.resolve(json(page([{ ...summary, id: '2', title: '第二张' }], 2)))
      if (path.endsWith('/memories/1')) return Promise.resolve(json(detail))
      return Promise.resolve(json(page([summary], 1, true)))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountedPage()
    await flushPromises()

    expect(fetchMock.mock.calls[0][0]).toContain('scope=MINE&archived=false')
    expect(fetchMock.mock.calls[0][0]).toContain('page=1&size=9')
    expect(wrapper.text()).toContain('2 张小小的记忆')
    expect(wrapper.text()).not.toContain(detail.body)
    await wrapper.get('.more-row button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.memory-card')).toHaveLength(2)
    expect(fetchMock.mock.calls[1][0]).toContain('page=2')
    await wrapper.findAll('.memory-open')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(detail.body)
    wrapper.unmount()
  })

  it('keeps edited text after a 409 and submits only after the user adopts the new version', async () => {
    let detailReads = 0
    let patches = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/memories/1') && init?.method === 'PATCH') {
        patches++
        return Promise.resolve(patches === 1
          ? json({ code: 'VERSION_CONFLICT', message: '卡片版本已变化' }, 409)
          : json({ ...detail, body: '用户修改的正文', version: '2' }))
      }
      if (path.endsWith('/memories/1')) {
        detailReads++
        return Promise.resolve(json({ ...detail, version: detailReads === 1 ? '0' : '1' }))
      }
      return Promise.resolve(json(page([summary], 1)))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountedPage()
    await flushPromises()
    await wrapper.get('.memory-open').trigger('click')
    await flushPromises()
    await wrapper.get('.dialog-actions .primary').trigger('click')
    await wrapper.get('#memory-body').setValue('用户修改的正文')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect((wrapper.get('#memory-body').element as HTMLTextAreaElement).value).toBe('用户修改的正文')
    expect(wrapper.text()).toContain('当前输入已保留')
    expect(patches).toBe(1)
    await wrapper.get('.inline-note.peach .text-button').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(fetchMock.mock.calls.filter(call => call[1]?.method === 'PATCH')[1]![1].body).expectedVersion)
      .toBe('1')
    wrapper.unmount()
  })

  it('does not use an in-browser copy for full result counts or tag totals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ...page([summary], 1), total: 40,
      availableTags: [{ tag: '花', count: 27 }] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await listMemories({ archived: false, keyword: '花', category: 'INTEREST',
      tag: '花', page: 1, size: 9 })
    expect(result.total).toBe(40)
    expect(result.availableTags[0]?.count).toBe(27)
    expect(fetchMock.mock.calls[0][0]).toContain('keyword=%E8%8A%B1')
    expect(fetchMock.mock.calls[0][0]).toContain('category=INTEREST')
  })
})
