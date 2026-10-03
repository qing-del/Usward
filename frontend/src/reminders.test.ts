import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReminderEditor from './components/ReminderEditor.vue'
import { clearCsrf } from './api'
import { cancelReminder, putReminder } from './reminders'
import { session } from './session'
import type { Me } from './types'

const user: Me = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'America/New_York', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
const reminder = { id: '9007199254740993', resourceType: 'MEMORY_CARD', resourceId: '9',
  scheduledAt: '2026-11-01T05:30:00Z', deliveryMode: 'IN_APP', revision: '9007199254740994',
  status: 'PENDING', version: '0', createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z' } as const
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } })

describe('private reminder controls', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = user
    session.checked = true
    session.reauthRequired = false
    vi.unstubAllGlobals()
  })

  it('sends string IDs and revisions, including a null first revision', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => Promise.resolve(path.endsWith('/auth/csrf')
      ? json({ headerName: 'X-CSRF-TOKEN', token: 'token' }) : json(reminder)))
    vi.stubGlobal('fetch', fetchMock)
    await putReminder({ resourceType: 'MEMORY_CARD', resourceId: '9',
      scheduledAt: '2026-11-01T05:30:00Z', deliveryMode: 'IN_APP', expectedRevision: null })
    await cancelReminder(reminder.id, reminder.revision)
    const writes = fetchMock.mock.calls.filter(call => ['PUT', 'DELETE'].includes(call[1]?.method))
    expect(JSON.parse(writes[0]![1].body)).toMatchObject({ resourceId: '9', expectedRevision: null })
    expect(JSON.parse(writes[1]![1].body)).toEqual({ expectedRevision: '9007199254740994' })
  })

  it('requires an offset for repeated local time and blocks nonexistent time', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => Promise.resolve(path.endsWith('/auth/csrf')
      ? json({ headerName: 'X-CSRF-TOKEN', token: 'token' }) : json(reminder)))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ReminderEditor, { props: { resourceType: 'MEMORY_CARD',
      resourceId: '9', reminder: null } })
    await wrapper.get('button').trigger('click')
    await wrapper.get('select').setValue('IN_APP')
    await wrapper.get('input[type="datetime-local"]').setValue('2026-03-08T02:30')
    expect(wrapper.text()).toContain('这个当地时刻不存在')
    await wrapper.get('form').trigger('submit')
    expect(fetchMock).not.toHaveBeenCalled()
    await wrapper.get('input[type="datetime-local"]').setValue('2026-11-01T01:30')
    expect(wrapper.findAll('select')).toHaveLength(2)
    await wrapper.get('form').trigger('submit')
    expect(fetchMock).not.toHaveBeenCalled()
    await wrapper.findAll('select')[1]!.setValue('-05:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const write = fetchMock.mock.calls.find(call => call[1]?.method === 'PUT')!
    expect(JSON.parse(write[1].body).scheduledAt).toBe('2026-11-01T06:30:00.000Z')
    wrapper.unmount()
  })

  it('keeps the draft on revision conflict and waits for explicit review', async () => {
    let puts = 0
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf')) return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      if (init?.method === 'PUT') {
        puts++
        return Promise.resolve(puts === 1
          ? json({ code: 'REMINDER_REVISION_CONFLICT', message: '提醒修订已变化' }, 409)
          : json({ ...reminder, revision: '9007199254740996' }))
      }
      return Promise.resolve(json({ myReminder: { ...reminder, revision: '9007199254740995' } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ReminderEditor, { props: { resourceType: 'MEMORY_CARD',
      resourceId: '9', reminder } })
    await wrapper.get('button').trigger('click')
    await wrapper.get('input[type="datetime-local"]').setValue('2026-11-02T12:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(puts).toBe(1)
    expect((wrapper.get('input[type="datetime-local"]').element as HTMLInputElement).value)
      .toBe('2026-11-02T12:00')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('.inline-note button').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const writes = fetchMock.mock.calls.filter(call => call[1]?.method === 'PUT')
    expect(JSON.parse(writes[1]![1].body).expectedRevision).toBe('9007199254740995')
    wrapper.unmount()
  })

  it('does not mislabel an unavailable mail mode as a revision conflict', async () => {
    session.user = { ...user, notificationEmail: 'alice@example.com', mailReminderAvailable: true }
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => Promise.resolve(path.endsWith('/auth/csrf')
      ? json({ headerName: 'X-CSRF-TOKEN', token: 'token' })
      : json({ code: 'MAIL_NOT_AVAILABLE', message: '邮件通知尚不可用' }, 409))))
    const wrapper = mount(ReminderEditor, { props: { resourceType: 'MEMORY_CARD',
      resourceId: '9', reminder: null } })
    await wrapper.get('button').trigger('click')
    await wrapper.get('select').setValue('IN_APP_AND_MAIL')
    await wrapper.get('input[type="datetime-local"]').setValue('2026-10-04T10:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('邮件通知尚不可用')
    expect(wrapper.find('.inline-note.peach').exists()).toBe(false)
    expect((wrapper.get('input[type="datetime-local"]').element as HTMLInputElement).value)
      .toBe('2026-10-04T10:00')
    wrapper.unmount()
  })
})
