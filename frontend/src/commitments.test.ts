import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CommitmentsPage from './pages/CommitmentsPage.vue'
import { commitmentDueLabel, listCommitments } from './commitments'
import { clearCsrf } from './api'
import { session } from './session'
import type { Me } from './types'

const user: Me = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 1, archivedMemoryCount: 0 } }
const summary = { id: '1', version: '0', createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z', ownerId: '1',
  owner: { id: '1', nickname: 'Alice', avatarStyle: 'INITIAL' }, title: '读书',
  nextAction: '借一本书', status: 'OPEN', dueKind: 'DATE', dueAt: null,
  dueDate: '2026-11-01', dueTimezone: 'America/New_York',
  deadlineAt: '2026-11-02T05:00:00Z', isOverdue: false, isDueToday: false,
  sharedConnectionId: null }
const detail = { ...summary, body: '只在详情读取的说明', result: null,
  sourceType: 'MEMORY_CARD', sourceId: '9', sourceAvailable: false, myReminder: null }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })

async function mountedPage(path = '/commitments') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/commitments', component: CommitmentsPage },
    { path: '/memories', component: CommitmentsPage },
  ] })
  await router.push(path)
  await router.isReady()
  return mount(CommitmentsPage, { global: { plugins: [router], stubs: {
    AppShell: { template: '<div><slot /></div>' },
    BaseDialog: { props: ['open', 'title'], template: '<div v-if="open"><slot /></div>' },
  } } })
}

describe('private commitments read', () => {
  beforeEach(() => { clearCsrf(); session.user = user; session.checked = true; vi.unstubAllGlobals() })

  it('uses server pagination and counts and loads private body only when opened', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/commitments/1')) return Promise.resolve(json(detail))
      if (path.includes('page=2')) return Promise.resolve(json({ items: [{ ...summary, id: '2' }],
        total: 21, page: 2, size: 20, hasMore: false, asOf: '',
        statusCounts: { OPEN: 21, DONE: 3, CANCELLED: 2 } }))
      return Promise.resolve(json({ items: [summary], total: 21, page: 1, size: 20,
        hasMore: true, asOf: '', statusCounts: { OPEN: 21, DONE: 3, CANCELLED: 2 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage()
    await flushPromises()
    expect(fetchMock.mock.calls[0][0]).toContain('scope=MINE&status=OPEN&sort=DEADLINE_ASC&page=1&size=20')
    expect(wrapper.text()).toContain('21 条承诺')
    expect(wrapper.text()).not.toContain(detail.body)
    await wrapper.get('.more-row button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.commitment-card')).toHaveLength(2)
    await wrapper.findAll('.commitment-open')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(detail.body)
    expect(wrapper.text()).toContain('来源不可用')
    wrapper.unmount()
  })

  it('keeps DATE precision and saved timezone instead of formatting the deadline as a clock time', () => {
    expect(commitmentDueLabel(summary as Parameters<typeof commitmentDueLabel>[0], 'Asia/Shanghai'))
      .toContain('2026年11月1日全天（America/New_York）')
  })

  it('passes status and sort to the server rather than filtering one page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ items: [], total: 8, page: 1, size: 20,
      hasMore: false, asOf: '', statusCounts: { OPEN: 2, DONE: 8, CANCELLED: 1 } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await listCommitments({ status: 'DONE', sort: 'UPDATED_DESC', page: 1, size: 20 })
    expect(result.total).toBe(8)
    expect(result.statusCounts.DONE).toBe(8)
    expect(fetchMock.mock.calls[0][0]).toContain('status=DONE&sort=UPDATED_DESC')
  })

  it('creates a private commitment with its memory source from the detail deep link', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/commitments') && init?.method === 'POST') return Promise.resolve(json(detail, 201))
      return Promise.resolve(json({ items: [], total: 0, page: 1, size: 20,
        hasMore: false, asOf: '', statusCounts: { OPEN: 0, DONE: 0, CANCELLED: 0 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage('/commitments?new=1&sourceType=MEMORY_CARD&sourceId=9')
    await flushPromises()
    await wrapper.get('#commitment-title').setValue('新的下一步')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const post = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toMatchObject({ title: '新的下一步',
      dueKind: 'NONE', sourceType: 'MEMORY_CARD', sourceId: '9' })
    wrapper.unmount()
  })

  it('preserves an edited draft after version conflict until the user reviews the latest detail', async () => {
    let detailReads = 0
    let patches = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/commitments/1') && init?.method === 'PATCH') {
        patches++
        return Promise.resolve(patches === 1
          ? json({ code: 'VERSION_CONFLICT', message: '承诺版本已变化' }, 409)
          : json({ ...detail, title: '我的新标题', version: '2' }))
      }
      if (path.endsWith('/commitments/1')) {
        detailReads++
        return Promise.resolve(json({ ...detail, version: detailReads === 1 ? '0' : '1',
          title: detailReads === 1 ? '读书' : '另一处修改的标题' }))
      }
      return Promise.resolve(json({ items: [summary], total: 1, page: 1, size: 20,
        hasMore: false, asOf: '', statusCounts: { OPEN: 1, DONE: 0, CANCELLED: 0 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage()
    await flushPromises()
    await wrapper.get('.commitment-open').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '编辑承诺')!.trigger('click')
    await wrapper.get('#commitment-title').setValue('我的新标题')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect((wrapper.get('#commitment-title').element as HTMLInputElement).value).toBe('我的新标题')
    expect(wrapper.text()).toContain('另一处修改的标题')
    expect(patches).toBe(1)
    await wrapper.get('.inline-note.peach .text-button').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => call[1]?.method === 'PATCH')
    expect(JSON.parse(writes[1]![1].body)).toMatchObject({ expectedVersion: '1', title: '我的新标题' })
    expect(JSON.parse(writes[1]![1].body)).not.toHaveProperty('sourceType')
    wrapper.unmount()
  })

  it('completes a commitment with a result and refreshes the server counts', async () => {
    let completed = false
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/commitments/1/complete')) {
        completed = true
        return Promise.resolve(json({ ...detail, version: '1', status: 'DONE',
          result: '读完了，想继续聊聊' }))
      }
      if (path.endsWith('/commitments/1')) return Promise.resolve(json(detail))
      return Promise.resolve(json({ items: completed ? [] : [summary], total: completed ? 0 : 1,
        page: 1, size: 20, hasMore: false, asOf: '', statusCounts: {
          OPEN: completed ? 0 : 1, DONE: completed ? 1 : 0, CANCELLED: 0,
        } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage()
    await flushPromises()
    await wrapper.get('.commitment-open').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '记为完成')!.trigger('click')
    await wrapper.get('#commitment-result').setValue('读完了，想继续聊聊')
    await wrapper.findAll('button').find(button => button.text() === '确认完成')!.trigger('click')
    await flushPromises()
    const call = fetchMock.mock.calls.find(entry => String(entry[0]).endsWith('/commitments/1/complete'))!
    expect(JSON.parse(call[1].body)).toEqual({ expectedVersion: '0', result: '读完了，想继续聊聊' })
    expect(wrapper.text()).toContain('完成记录')
    expect(session.user?.stats.openCommitmentCount).toBe(0)
    wrapper.unmount()
  })

  it('does not retry a stale delete until the user reviews the new version', async () => {
    let detailReads = 0
    let deletions = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (path.endsWith('/commitments/1') && init?.method === 'DELETE') {
        deletions++
        return Promise.resolve(deletions === 1
          ? json({ code: 'VERSION_CONFLICT', message: '版本已变化' }, 409)
          : new Response(null, { status: 204 }))
      }
      if (path.endsWith('/commitments/1')) {
        detailReads++
        return Promise.resolve(json({ ...detail, version: detailReads === 1 ? '0' : '1' }))
      }
      return Promise.resolve(json({ items: [summary], total: 1, page: 1, size: 20,
        hasMore: false, asOf: '', statusCounts: { OPEN: 1, DONE: 0, CANCELLED: 0 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountedPage()
    await flushPromises()
    await wrapper.get('.commitment-open').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '确认删除')!.trigger('click')
    await flushPromises()
    expect(deletions).toBe(1)
    expect(wrapper.text()).toContain('最新版本')
    await wrapper.findAll('button').find(button => button.text() === '使用最新版本后核对')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '确认删除')!.trigger('click')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(entry => entry[1]?.method === 'DELETE')
    expect(JSON.parse(writes[1]![1].body)).toEqual({ expectedVersion: '1' })
    wrapper.unmount()
  })
})
