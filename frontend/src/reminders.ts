import { query, request } from './api'

export type ReminderResourceType = 'MEMORY_CARD' | 'CALENDAR_EVENT' | 'COMMITMENT'
export type ReminderStatus = 'PENDING' | 'FIRED' | 'CANCELLED'
export type ReminderDeliveryMode = 'IN_APP' | 'IN_APP_AND_MAIL'

export const reminderResourceLabels: Record<ReminderResourceType, string> = {
  MEMORY_CARD: '记忆卡片', CALENDAR_EVENT: '个人安排', COMMITMENT: '我的承诺',
}
export const reminderStatusLabels: Record<ReminderStatus, string> = {
  PENDING: '待触发', FIRED: '已触发', CANCELLED: '已取消',
}

export interface ReminderDetail {
  id: string
  resourceType: ReminderResourceType
  resourceId: string
  scheduledAt: string
  deliveryMode: ReminderDeliveryMode
  revision: string
  status: ReminderStatus
  version: string
  createdAt: string
  updatedAt: string
}

export type ReminderFilterStatus = ReminderStatus | 'ALL'
export interface ReminderPage {
  items: ReminderDetail[]
  total: number
  page: number
  size: number
  hasMore: boolean
  asOf: string
}

export function putReminder(input: {
  resourceType: ReminderResourceType
  resourceId: string
  scheduledAt: string
  deliveryMode: ReminderDeliveryMode
  expectedRevision: string | null
}): Promise<ReminderDetail> {
  return request<ReminderDetail>('PUT', '/reminders', input)
}

export function cancelReminder(id: string, expectedRevision: string): Promise<ReminderDetail> {
  return request<ReminderDetail>('DELETE', `/reminders/${encodeURIComponent(id)}`,
    { expectedRevision })
}

export function listReminders(filter: { resourceType: ReminderResourceType | null;
  status: ReminderFilterStatus; page: number; size: number }, signal?: AbortSignal): Promise<ReminderPage> {
  return request<ReminderPage>('GET', `/reminders?${query({ resourceType: filter.resourceType,
    status: filter.status, sort: 'SCHEDULED_ASC', page: filter.page, size: filter.size })}`,
  undefined, { signal })
}

export function reminderResourceLink(item: Pick<ReminderDetail, 'resourceType' | 'resourceId'>): string {
  const id = encodeURIComponent(item.resourceId)
  if (item.resourceType === 'MEMORY_CARD') return `/memories?memory=${id}`
  if (item.resourceType === 'CALENDAR_EVENT') return `/calendar?event=${id}`
  return `/commitments?commitment=${id}`
}

export async function getResourceReminder(resourceType: ReminderResourceType,
  resourceId: string): Promise<ReminderDetail | null> {
  // Resource detail endpoints, rather than list summaries, contain myReminder.
  const apiPath = resourceType === 'MEMORY_CARD' ? `/memories/${encodeURIComponent(resourceId)}`
    : resourceType === 'CALENDAR_EVENT' ? `/events/${encodeURIComponent(resourceId)}`
      : `/commitments/${encodeURIComponent(resourceId)}`
  const result = await request<{ myReminder: ReminderDetail | null }>('GET', apiPath)
  return result.myReminder
}
