import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { blocksOnDay, getAvailability } from './availability'
import type { AvailabilityBlock } from './availability'
import { clearCsrf } from './api'
import CalendarPage from './pages/CalendarPage.vue'
import { session } from './session'

const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})
const pair = { id: '4', status: 'ACTIVE', version: '0', members: [] }
const block: AvailabilityBlock = { opaqueId: 'opaque-segment', startsAt: '2026-09-29T01:00:00Z',
  endsAt: '2026-09-29T03:00:00Z', status: 'BUSY', title: null }

describe('private partner availability', () => {
  beforeEach(() => {
    clearCsrf()
    vi.unstubAllGlobals()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.checked = true
  })

  it('uses exact local day bounds across DST and clips blocks at exclusive day ends', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ sharingEnabled: true, blocks: [], from: '', to: '',
      timezone: 'America/New_York', asOf: '' }))
    vi.stubGlobal('fetch', fetchMock)
    await getAvailability('2026-03-08', '2026-03-09', 'America/New_York')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('from=2026-03-08T05%3A00%3A00.000Z')
    expect(url).toContain('to=2026-03-09T04%3A00%3A00.000Z')
    expect(url).not.toContain('scope=')
    expect(() => getAvailability('2026-01-01', '2026-04-06', 'America/New_York')).toThrow()

    const spring: AvailabilityBlock = { ...block, startsAt: '2026-03-08T05:00:00Z',
      endsAt: '2026-03-09T04:00:00Z' }
    expect(blocksOnDay([spring], '2026-03-08', 'America/New_York')).toHaveLength(1)
    expect(blocksOnDay([spring], '2026-03-09', 'America/New_York')).toHaveLength(0)
    const split = blocksOnDay([{ ...spring, endsAt: '2026-03-09T06:00:00Z' }],
      '2026-03-08', 'America/New_York')
    expect(split[0]?.endsAt).toBe('2026-03-09T04:00:00.000Z')
    const next = blocksOnDay([{ ...spring, endsAt: '2026-03-09T06:00:00Z' }],
      '2026-03-09', 'America/New_York')
    expect(next[0]?.startsAt).toBe('2026-03-09T04:00:00.000Z')
  })

  it('shows only server-provided blocks and distinguishes closed sharing from empty sharing', async () => {
    let availabilityReads = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: pair, currentInvite: null }))
      if (url.includes('/calendar?')) return Promise.resolve(json({ items: [], from: '', to: '',
        timezone: 'Asia/Shanghai', asOf: '' }))
      if (url.includes('/availability?')) {
        availabilityReads++
        return Promise.resolve(json({ sharingEnabled: availabilityReads > 1,
          blocks: availabilityReads > 2 ? [block] : [], from: '', to: '',
          timezone: 'Asia/Shanghai', asOf: '' }))
      }
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/calendar', component: CalendarPage }, { path: '/me', component: CalendarPage },
    ] })
    await router.push('/calendar?day=2026-09-29')
    await router.isReady()
    const wrapper = mount(CalendarPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open', 'title'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    const partner = wrapper.findAll('.filter-chip').find(button => button.text() === '对方忙闲')!
    await partner.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('对方尚未开启忙闲共享')
    await wrapper.findAll('.filter-chip').find(button => button.text() === '我的安排')!.trigger('click')
    await partner.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('对方已开启共享，但当前范围没有时间块')
    await wrapper.findAll('.filter-chip').find(button => button.text() === '我的安排')!.trigger('click')
    await partner.trigger('click')
    await flushPromises()
    expect(wrapper.get('.calendar-event.partner').text()).toContain('正在忙')
    expect(wrapper.text()).not.toContain('私人备注')
    await wrapper.get('.calendar-event.partner').trigger('click')
    expect(wrapper.text()).toContain('未公开的标题、地点和私人备注不可查看')
    expect(fetchMock.mock.calls.filter(call => call[0].includes('/availability?'))).toHaveLength(3)
    expect(fetchMock.mock.calls.some(call => call[0].includes('/events/opaque-segment'))).toBe(false)
    wrapper.unmount()
  })

  it('aborts an older busy/free range request when switching to the month grid', async () => {
    let firstSignal: AbortSignal | undefined
    let reads = 0
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/connection')) return Promise.resolve(json({ connection: pair, currentInvite: null }))
      if (url.includes('/calendar?')) return Promise.resolve(json({ items: [], from: '', to: '',
        timezone: 'Asia/Shanghai', asOf: '' }))
      if (url.includes('/availability?')) {
        reads++
        if (reads === 1) {
          firstSignal = init?.signal as AbortSignal
          return new Promise<Response>((_resolve, reject) => {
            firstSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          })
        }
        return Promise.resolve(json({ sharingEnabled: true, blocks: [block], from: '', to: '',
          timezone: 'Asia/Shanghai', asOf: '' }))
      }
      throw Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: CalendarPage }] })
    await router.push('/calendar?day=2026-09-29')
    await router.isReady()
    const wrapper = mount(CalendarPage, { global: { plugins: [router], stubs: {
      AppShell: { template: '<div><slot /></div>' },
      BaseDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
    } } })
    await flushPromises()
    await wrapper.findAll('.filter-chip').find(button => button.text() === '对方忙闲')!.trigger('click')
    await flushPromises()
    await wrapper.findAll('.calendar-toolbar .tab')[2]!.trigger('click')
    await flushPromises()
    expect(firstSignal?.aborted).toBe(true)
    expect(reads).toBe(2)
    expect(wrapper.findAll('.month-cell')).toHaveLength(42)
    expect(wrapper.findAll('.month-event.partner')).toHaveLength(1)
    wrapper.unmount()
  })
})
