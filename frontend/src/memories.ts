import { query, request } from './api'
import type { ReminderDetail } from './reminders'

export type MemoryCategory = 'INTEREST' | 'RECENT_CONCERN' | 'RELATIONSHIP_PREFERENCE'
  | 'BOUNDARY' | 'SHARED_EXPERIENCE' | 'SELF_REFLECTION' | 'OTHER'
export type SourceType = 'EXPLICIT' | 'OBSERVED' | 'INTERPRETATION'
export type MemoryScope = 'ALL' | 'MINE' | 'PARTNER'
export type FollowUpMode = 'NONE' | 'IN_APP' | 'IN_APP_AND_MAIL'
export interface MemoryNotificationSetting { followUpMode: FollowUpMode; version: string | null }
export interface MemoryNotificationSettingDetail extends MemoryNotificationSetting {
  resourceType: 'MEMORY_CARD'
  resourceId: string
}
export interface MemoryNotificationCapabilities {
  selfMailAvailable: boolean
  otherMailAvailable: boolean
  effectiveOutgoingMode: FollowUpMode | null
}
export interface MemorySharePlan { outgoingMode: FollowUpMode; followUpMode: FollowUpMode }
export interface MemoryShareWrite {
  connectionId: string
  expectedVersion: string
  notificationPlan: MemorySharePlan
}
export interface MemoryNotificationOverride { mode: 'NONE' | 'IN_APP'; token: string }
export interface MemoryComment {
  id: string
  cardId: string
  authorId: string
  author: MemorySummary['owner']
  body: string
  createdAt: string
}
export interface MemoryCommentPage {
  items: MemoryComment[]
  total: number
  page: number
  size: number
  hasMore: boolean
  asOf: string
}
export interface MemoryCommentCreated { comment: MemoryComment; memoryVersion: string }
export interface MemoryCommentWrite {
  expectedVersion: string
  body: string
  notificationOverride?: MemoryNotificationOverride
}

export const categoryLabels: Record<MemoryCategory, string> = {
  INTEREST: '喜好兴趣', RECENT_CONCERN: '近期关注', RELATIONSHIP_PREFERENCE: '相处偏好',
  BOUNDARY: '明确边界', SHARED_EXPERIENCE: '共同经历', SELF_REFLECTION: '自我反思', OTHER: '其他',
}
export const sourceLabels: Record<SourceType, string> = {
  EXPLICIT: '对方明确表达', OBSERVED: '亲历事实 / 自己的经历',
  INTERPRETATION: '我的理解，待确认',
}

export interface MemorySummary {
  id: string
  version: string
  createdAt: string
  updatedAt: string
  ownerId: string
  owner: { id: string; nickname: string; avatarStyle: string }
  title: string | null
  category: MemoryCategory | null
  tags: string[]
  sourceType: SourceType
  sharedConnectionId: string | null
}

export interface MemoryDetail extends MemorySummary {
  body: string
  sourceDate: string | null
  nextAction: string | null
  archived: boolean | null
  myReminder: ReminderDetail | null
  myNotificationSetting: MemoryNotificationSetting | null
}

export interface MemoryPage {
  items: MemorySummary[]
  total: number
  page: number
  size: number
  hasMore: boolean
  asOf: string
  availableTags: { tag: string; count: number }[]
}

export interface MemoryWrite {
  title: string | null
  body: string
  category: MemoryCategory | null
  tags: string[]
  sourceType: SourceType
  sourceDate: string | null
  nextAction: string | null
}

export interface MemoryFilter {
  scope: MemoryScope
  archived: boolean
  keyword: string
  category: MemoryCategory | null
  tag: string
  page: number
  size: number
}

export function listMemories(filter: MemoryFilter, signal?: AbortSignal): Promise<MemoryPage> {
  return request<MemoryPage>('GET', `/memories?${query({
    scope: filter.scope, archived: filter.archived, keyword: filter.keyword.trim(),
    category: filter.category, tag: filter.tag, sort: 'UPDATED_DESC',
    page: filter.page, size: filter.size,
  })}`, undefined, { signal })
}

export function getMemory(id: string): Promise<MemoryDetail> {
  return request<MemoryDetail>('GET', `/memories/${encodeURIComponent(id)}`)
}

export function createMemory(write: MemoryWrite): Promise<MemoryDetail> {
  return request<MemoryDetail>('POST', '/memories', write)
}

export function patchMemory(id: string, expectedVersion: string, write: MemoryWrite,
  idempotencyKey: string, notificationOverride?: MemoryNotificationOverride): Promise<MemoryDetail> {
  return request<MemoryDetail>('PATCH', `/memories/${encodeURIComponent(id)}`,
    { expectedVersion, ...write, ...(notificationOverride ? { notificationOverride } : {}) },
    { idempotencyKey })
}

export function setMemoryArchived(id: string, expectedVersion: string, archived: boolean): Promise<MemoryDetail> {
  return request<MemoryDetail>('POST', `/memories/${encodeURIComponent(id)}/${archived ? 'archive' : 'restore'}`,
    { expectedVersion })
}

export function deleteMemory(id: string, expectedVersion: string): Promise<void> {
  return request<void>('DELETE', `/memories/${encodeURIComponent(id)}`, { expectedVersion })
}

export function getShareCapabilities(connectionId: string): Promise<MemoryNotificationCapabilities> {
  return request<MemoryNotificationCapabilities>('GET',
    `/notification-capabilities?${query({ connectionId })}`)
}

export function getMemoryActionCapabilities(id: string, action: 'MEMORY_EDIT' | 'MEMORY_COMMENT'):
  Promise<MemoryNotificationCapabilities> {
  return request<MemoryNotificationCapabilities>('GET',
    `/notification-capabilities?${query({ resourceType: 'MEMORY_CARD', resourceId: id, action })}`)
}

export function getMemoryNotificationSetting(id: string): Promise<MemoryNotificationSettingDetail> {
  return request<MemoryNotificationSettingDetail>('GET',
    `/notification-settings/MEMORY_CARD/${encodeURIComponent(id)}`)
}

export function putMemoryNotificationSetting(id: string, followUpMode: FollowUpMode,
  expectedVersion: string | null): Promise<MemoryNotificationSettingDetail> {
  return request<MemoryNotificationSettingDetail>('PUT',
    `/notification-settings/MEMORY_CARD/${encodeURIComponent(id)}`,
    { followUpMode, expectedVersion })
}

export function shareMemory(id: string, body: MemoryShareWrite,
  idempotencyKey: string): Promise<MemoryDetail> {
  return request<MemoryDetail>('POST', `/memories/${encodeURIComponent(id)}/share`, body,
    { idempotencyKey })
}

export function unshareMemory(id: string, expectedVersion: string): Promise<MemoryDetail> {
  return request<MemoryDetail>('DELETE', `/memories/${encodeURIComponent(id)}/share`,
    { expectedVersion })
}

export function listMemoryComments(id: string, page: number, signal?: AbortSignal):
  Promise<MemoryCommentPage> {
  return request<MemoryCommentPage>('GET',
    `/memories/${encodeURIComponent(id)}/comments?${query({ sort: 'CREATED_ASC', page, size: 20 })}`,
    undefined, { signal })
}

export function addMemoryComment(id: string, body: MemoryCommentWrite,
  idempotencyKey: string): Promise<MemoryCommentCreated> {
  return request<MemoryCommentCreated>('POST', `/memories/${encodeURIComponent(id)}/comments`,
    body, { idempotencyKey })
}
