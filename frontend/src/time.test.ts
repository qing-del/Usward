import { describe, expect, it } from 'vitest'
import { addDays, calendarBounds, fromLocal, localCandidates, startOfDay } from './time'

describe('IANA day boundaries and wall times', () => {
  it('uses Shanghai local midnight for a half-open calendar day', () => {
    expect(calendarBounds('2026-09-29', '2026-09-30', 'Asia/Shanghai')).toMatchObject({
      from: '2026-09-28T16:00:00.000Z', to: '2026-09-29T16:00:00.000Z', days: 1,
    })
  })

  it('respects daylight saving days of 23 and 25 hours', () => {
    const spring = calendarBounds('2026-03-08', '2026-03-09', 'America/New_York')
    const autumn = calendarBounds('2026-11-01', '2026-11-02', 'America/New_York')
    expect(Date.parse(spring.to) - Date.parse(spring.from)).toBe(23 * 3_600_000)
    expect(Date.parse(autumn.to) - Date.parse(autumn.from)).toBe(25 * 3_600_000)
  })

  it('rejects nonexistent wall time and asks for the offset of repeated wall time', () => {
    expect(localCandidates('2026-03-08T02:30', 'America/New_York')).toHaveLength(0)
    expect(() => fromLocal('2026-03-08T02:30', 'America/New_York')).toThrow('不存在')
    expect(localCandidates('2026-11-01T01:30', 'America/New_York').map(candidate => candidate.offset))
      .toEqual(['-04:00', '-05:00'])
    expect(() => fromLocal('2026-11-01T01:30', 'America/New_York')).toThrow('明确选择')
    expect(fromLocal('2026-11-01T01:30', 'America/New_York', '-05:00'))
      .toBe('2026-11-01T06:30:00.000Z')
  })

  it('rejects a skipped civil date and limits ranges to 93 calendar days', () => {
    expect(() => startOfDay('2011-12-30', 'Pacific/Apia')).toThrow('整日不存在')
    const to = addDays('2026-01-01', 93)
    expect(calendarBounds('2026-01-01', to, 'Asia/Shanghai').days).toBe(93)
    expect(() => calendarBounds('2026-01-01', addDays(to, 1), 'Asia/Shanghai')).toThrow('1 到 93 天')
  })
})
