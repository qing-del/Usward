import { query, request } from './api'
import type { Availability } from './calendar'
import { addDays, calendarBounds, startOfDay } from './time'

export interface AvailabilityBlock {
  opaqueId: string
  startsAt: string
  endsAt: string
  status: Availability
  title: string | null
}

export interface AvailabilityView {
  sharingEnabled: boolean
  blocks: AvailabilityBlock[]
  from: string
  to: string
  timezone: string
  asOf: string
}

export interface AvailabilitySlice extends AvailabilityBlock {
  original: AvailabilityBlock
}

export function getAvailability(fromDay: string, toDayExclusive: string, timezone: string,
  signal?: AbortSignal): Promise<AvailabilityView> {
  const bounds = calendarBounds(fromDay, toDayExclusive, timezone)
  return request<AvailabilityView>('GET', `/availability?${query({
    from: bounds.from, to: bounds.to, timezone,
  })}`, undefined, { signal })
}

export function blocksOnDay(blocks: AvailabilityBlock[], day: string,
  timezone: string): AvailabilitySlice[] {
  const from = Date.parse(startOfDay(day, timezone))
  const to = Date.parse(startOfDay(addDays(day, 1), timezone))
  return blocks.flatMap(block => {
    const start = Math.max(from, Date.parse(block.startsAt))
    const end = Math.min(to, Date.parse(block.endsAt))
    return start < end ? [{ ...block, startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(), original: block }] : []
  })
}
