import { query, request } from './api'
import { addDays, calendarBounds, startOfDay } from './time'
import type { EventWrite } from './eventWrite'

export type Availability = 'BUSY' | 'NEGOTIABLE' | 'FREE'
export const availabilityLabels: Record<Availability, string> = {
  BUSY: '正在忙', NEGOTIABLE: '可以商量', FREE: '有空',
}

export interface CalendarEvent {
  id: string
  version: string
  createdAt: string
  updatedAt: string
  kind: 'PERSONAL'
  ownerId: string
  connectionId: null
  title: string
  location: string | null
  note: string | null
  allDay: boolean
  startsAt: string | null
  endsAt: string | null
  startDate: string | null
  endDateExclusive: string | null
  eventTimezone: string
  availability: Availability
  shareTitle: boolean
  offlineConfirmedAt: string | null
  status: 'CONFIRMED'
  originInvitationId: null
  pendingChangeInvitationId: null
  cancellationReason: null
  myReminder: null
  myNotificationSetting: null
}

export interface CalendarView {
  items: CalendarEvent[]
  from: string
  to: string
  timezone: string
  asOf: string
}

export function getCalendar(fromDay: string, toDayExclusive: string, timezone: string,
  signal?: AbortSignal): Promise<CalendarView> {
  const bounds = calendarBounds(fromDay, toDayExclusive, timezone)
  return request<CalendarView>('GET', `/calendar?${query({ from: bounds.from, to: bounds.to,
    timezone, scope: 'MINE', includeCancelled: false })}`, undefined, { signal })
}

export function getEvent(id: string): Promise<CalendarEvent> {
  return request<CalendarEvent>('GET', `/events/${encodeURIComponent(id)}`)
}

export function createEvent(write: EventWrite): Promise<CalendarEvent> {
  return request<CalendarEvent>('POST', '/events', write)
}

export function patchEvent(id: string, expectedVersion: string,
  write: EventWrite): Promise<CalendarEvent> {
  return request<CalendarEvent>('PATCH', `/events/${encodeURIComponent(id)}`,
    { expectedVersion, ...write })
}

export function deleteEvent(id: string, expectedVersion: string): Promise<void> {
  return request<void>('DELETE', `/events/${encodeURIComponent(id)}`, { expectedVersion })
}

export function eventBounds(event: CalendarEvent): { start: string; end: string } {
  if (event.allDay) {
    return { start: startOfDay(event.startDate!, event.eventTimezone),
      end: startOfDay(event.endDateExclusive!, event.eventTimezone) }
  }
  return { start: event.startsAt!, end: event.endsAt! }
}

export function eventsOnDay(events: CalendarEvent[], day: string, timezone: string): CalendarEvent[] {
  const from = Date.parse(startOfDay(day, timezone))
  const to = Date.parse(startOfDay(addDays(day, 1), timezone))
  return events.filter(event => {
    const bounds = eventBounds(event)
    return Date.parse(bounds.start) < to && Date.parse(bounds.end) > from
  })
}
