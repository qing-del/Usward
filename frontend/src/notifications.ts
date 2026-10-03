import { query, request } from './api'
import { reminderResourceLink, reminderResourceLabels } from './reminders'
import type { ReminderResourceType } from './reminders'

export type NotificationReadFilter = 'ALL' | 'UNREAD' | 'READ'
export type MailDeliveryStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED'

export interface NotificationDetail {
  id: string
  version: string
  kind: string
  resourceType: string
  resourceId: string
  message: string
  createdAt: string
  updatedAt: string
  readAt: string | null
  mailDelivery: { status: MailDeliveryStatus; sentAt: string | null;
    failureCode: string | null } | null
}

export interface NotificationPage {
  items: NotificationDetail[]
  total: number
  page: number
  size: number
  hasMore: boolean
  asOf: string
  unreadCount: number
  readBoundary: string
}

export interface ReadAllResult { updatedCount: number; unreadCount: number }

export function listNotifications(filter: { read: NotificationReadFilter; page: number;
  size: number }, signal?: AbortSignal): Promise<NotificationPage> {
  return request<NotificationPage>('GET', `/notifications?${query({ read: filter.read,
    sort: 'CREATED_DESC', page: filter.page, size: filter.size })}`, undefined, { signal })
}

export function readNotification(id: string): Promise<NotificationDetail> {
  return request<NotificationDetail>('POST', `/notifications/${encodeURIComponent(id)}/read`)
}

export function readAllNotifications(readBoundary: string): Promise<ReadAllResult> {
  return request<ReadAllResult>('POST', '/notifications/read-all', { readBoundary })
}

export function notificationResourceLink(item: Pick<NotificationDetail, 'resourceType' | 'resourceId'>): string | null {
  if (item.resourceType !== 'MEMORY_CARD' && item.resourceType !== 'CALENDAR_EVENT'
    && item.resourceType !== 'COMMITMENT') return null
  return reminderResourceLink(item as { resourceType: ReminderResourceType; resourceId: string })
}

export function notificationResourceLabel(type: string): string {
  return type in reminderResourceLabels ? reminderResourceLabels[type as ReminderResourceType] : '相关内容'
}

export const mailDeliveryLabels: Record<MailDeliveryStatus, string> = {
  QUEUED: '邮件等待处理', PROCESSING: '邮件正在处理',
  SENT: '邮件服务器已接受（不代表送达）', FAILED: '邮件发送失败', CANCELLED: '邮件任务已取消',
}
