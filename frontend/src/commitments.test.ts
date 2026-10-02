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
const json = (value: unknown) => new Response(JSON.stringify(value),
  { headers: { 'Content-Type': 'application/json' } })

async function mountedPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/commitments', component: CommitmentsPage },
    { path: '/memories', component: CommitmentsPage },
  ] })
  await router.push('/commitments')
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
})
