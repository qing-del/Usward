import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoryFollowUpSettings from './components/MemoryFollowUpSettings.vue'
import { clearCsrf } from './api'
import { session } from './session'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })
const setting = { resourceType: 'MEMORY_CARD', resourceId: '8', followUpMode: 'IN_APP', version: '1' }

describe('shared memory notification setting', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
      timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
      shareAvailability: false, version: '0',
      stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
    session.reauthRequired = false
    vi.unstubAllGlobals()
  })

  it('keeps the personal draft through a version conflict and uses only the latest accepted version', async () => {
    let reads = 0
    let puts = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      if (path.includes('/notification-capabilities')) return Promise.resolve(json({
        selfMailAvailable: false, otherMailAvailable: false, effectiveOutgoingMode: 'IN_APP',
      }))
      if (path.endsWith('/notification-settings/MEMORY_CARD/8') && init?.method === 'PUT') {
        puts++
        return Promise.resolve(puts === 1
          ? json({ code: 'NOTIFICATION_SETTING_CONFLICT', message: '已变化' }, 409)
          : json({ ...setting, followUpMode: 'NONE', version: '3' }))
      }
      if (path.endsWith('/notification-settings/MEMORY_CARD/8')) {
        reads++
        return Promise.resolve(json({ ...setting, version: reads === 1 ? '1' : '2' }))
      }
      throw new Error(`unexpected ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(MemoryFollowUpSettings, { props: {
      memoryId: '8', isOwner: true, setting: { followUpMode: 'IN_APP', version: '1' },
    } })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    expect((wrapper.get('#memory-followup-mode option[value="IN_APP_AND_MAIL"]').element as HTMLOptionElement).disabled)
      .toBe(true)
    await wrapper.get('#memory-followup-mode').setValue('NONE')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(puts).toBe(1)
    expect((wrapper.get('#memory-followup-mode').element as HTMLSelectElement).value).toBe('NONE')
    expect(wrapper.text()).toContain('服务端当前设置')
    await wrapper.findAll('button').find(button => button.text() === '采用最新版本后核对')!.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => call[1]?.method === 'PUT')
    expect(JSON.parse(writes[0]![1].body)).toEqual({ followUpMode: 'NONE', expectedVersion: '1' })
    expect(JSON.parse(writes[1]![1].body)).toEqual({ followUpMode: 'NONE', expectedVersion: '2' })
    expect(wrapper.emitted('changed')?.at(-1)?.[0]).toEqual({ followUpMode: 'NONE', version: '3' })
    wrapper.unmount()
  })
})
