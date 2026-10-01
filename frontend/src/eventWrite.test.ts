import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent, deleteEvent, patchEvent } from './calendar'
import { clearCsrf } from './api'
import { eventWriteValues } from './eventWrite'
import type { EventDraft } from './eventWrite'

const base: EventDraft = {
  title: '散步', location: '', note: '私人备注', allDay: false,
  startsLocal: '2026-11-01T01:30', endsLocal: '2026-11-01T02:30',
  startOffset: '-05:00', endOffset: '', startDate: '2026-11-01', lastDate: '2026-11-01',
  eventTimezone: 'America/New_York', availability: 'NEGOTIABLE', offlineConfirmed: true,
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

describe('personal event writes', () => {
  beforeEach(() => { clearCsrf(); vi.unstubAllGlobals() })

  it('converts a repeated local time only with its chosen offset', () => {
    const write = eventWriteValues(base, true)
    expect(write.startsAt).toBe('2026-11-01T06:30:00.000Z')
    expect(write.endsAt).toBe('2026-11-01T07:30:00.000Z')
    expect(write.startDate).toBeNull()
    expect(write.eventTimezone).toBe('America/New_York')
    expect(write.offlineConfirmed).toBe(true)
    expect(write.shareTitle).toBe(false)
    expect(() => eventWriteValues({ ...base, startOffset: '' }, true)).toThrow('明确选择')
  })

  it('uses an exclusive end date and preserves the event timezone on edit', () => {
    const write = eventWriteValues({ ...base, allDay: true, startDate: '2026-11-01',
      lastDate: '2026-11-03' }, false)
    expect(write).toMatchObject({ allDay: true, startDate: '2026-11-01',
      endDateExclusive: '2026-11-04', startsAt: null, endsAt: null,
      eventTimezone: 'America/New_York' })
    expect(write).not.toHaveProperty('shareTitle')
  })

  it('rejects nonexistent time and reversed intervals before sending', () => {
    expect(() => eventWriteValues({ ...base, startsLocal: '2026-03-08T02:30' }, true)).toThrow('不存在')
    expect(() => eventWriteValues({ ...base, startsLocal: '2026-11-01T03:00',
      endsLocal: '2026-11-01T02:30', startOffset: '' }, true)).toThrow('晚于')
  })

  it('sends string expectedVersion in PATCH and DELETE, and consumes 204 delete', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
      .mockResolvedValueOnce(json({ id: '55', version: '9007199254740995' }, 201))
      .mockResolvedValueOnce(json({ id: '55', version: '9007199254740996' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const write = eventWriteValues(base, true)
    await createEvent(write)
    await patchEvent('55', '9007199254740995', eventWriteValues(base, false))
    await deleteEvent('55', '9007199254740996')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).expectedVersion).toBe('9007199254740995')
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).expectedVersion).toBe('9007199254740996')
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE')
  })
})
