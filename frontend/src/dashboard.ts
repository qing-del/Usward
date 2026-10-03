import { request } from './api'
import type { CalendarEvent } from './calendar'
import type { CommitmentSummary } from './commitments'
import type { MemorySummary } from './memories'
import type { ReminderDetail } from './reminders'

export interface DashboardGroup<T> {
  items: T[]
  total: number
  hasMore: boolean
}

export interface Dashboard {
  asOf: string
  timezone: string
  today: string
  groups: {
    events: DashboardGroup<CalendarEvent>
    expressions: DashboardGroup<unknown>
    invitations: DashboardGroup<unknown>
    reminders: DashboardGroup<ReminderDetail>
    commitments: DashboardGroup<CommitmentSummary>
  }
  featuredMemory: MemorySummary | null
  unreadCount: number
}

export function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  return request<Dashboard>('GET', '/dashboard', undefined, { signal })
}
