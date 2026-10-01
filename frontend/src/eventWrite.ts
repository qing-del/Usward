import type { Availability } from './calendar'
import { addDays, daysBetween, fromLocal, startOfDay } from './time'

export interface EventDraft {
  title: string
  location: string
  note: string
  allDay: boolean
  startsLocal: string
  endsLocal: string
  startOffset: string
  endOffset: string
  startDate: string
  lastDate: string
  eventTimezone: string
  availability: Availability
  offlineConfirmed: boolean
}

export interface EventWrite {
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
  offlineConfirmed: boolean
  shareTitle?: false
}

export function eventWriteValues(draft: EventDraft, creating: boolean): EventWrite {
  const title = draft.title.trim()
  if (!title) throw new Error('请填写安排标题。')
  if ([...title].length > 100) throw new Error('安排标题最多 100 个字。')
  const common = {
    title, location: draft.location.trim() || null, note: draft.note.trim() || null,
    eventTimezone: draft.eventTimezone, availability: draft.availability,
    offlineConfirmed: draft.offlineConfirmed,
    ...(creating ? { shareTitle: false as const } : {}),
  }
  if (draft.allDay) {
    if (!draft.startDate || !draft.lastDate) throw new Error('请选择开始和结束日期。')
    const endDateExclusive = addDays(draft.lastDate, 1)
    if (daysBetween(draft.startDate, endDateExclusive) < 1) throw new Error('结束日期不能早于开始日期。')
    startOfDay(draft.startDate, draft.eventTimezone)
    startOfDay(endDateExclusive, draft.eventTimezone)
    return { ...common, allDay: true, startsAt: null, endsAt: null,
      startDate: draft.startDate, endDateExclusive }
  }
  if (!draft.startsLocal || !draft.endsLocal) throw new Error('请选择开始和结束时间。')
  const startsAt = fromLocal(draft.startsLocal, draft.eventTimezone, draft.startOffset)
  const endsAt = fromLocal(draft.endsLocal, draft.eventTimezone, draft.endOffset)
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('结束时间需要晚于开始时间。')
  return { ...common, allDay: false, startsAt, endsAt, startDate: null, endDateExclusive: null }
}
