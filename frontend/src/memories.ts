import { query, request } from './api'
import type { ReminderDetail } from './reminders'

export type MemoryCategory = 'INTEREST' | 'RECENT_CONCERN' | 'RELATIONSHIP_PREFERENCE'
  | 'BOUNDARY' | 'SHARED_EXPERIENCE' | 'SELF_REFLECTION' | 'OTHER'
export type SourceType = 'EXPLICIT' | 'OBSERVED' | 'INTERPRETATION'

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

export interface MemoryDetail extends Omit<MemorySummary, 'owner'> {
  body: string
  sourceDate: string | null
  nextAction: string | null
  archived: boolean
  myReminder: ReminderDetail | null
  myNotificationSetting: null
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
  archived: boolean
  keyword: string
  category: MemoryCategory | null
  tag: string
  page: number
  size: number
}

export function listMemories(filter: MemoryFilter, signal?: AbortSignal): Promise<MemoryPage> {
  return request<MemoryPage>('GET', `/memories?${query({
    scope: 'MINE', archived: filter.archived, keyword: filter.keyword.trim(),
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

export function patchMemory(id: string, expectedVersion: string, write: MemoryWrite): Promise<MemoryDetail> {
  return request<MemoryDetail>('PATCH', `/memories/${encodeURIComponent(id)}`, { expectedVersion, ...write })
}

export function setMemoryArchived(id: string, expectedVersion: string, archived: boolean): Promise<MemoryDetail> {
  return request<MemoryDetail>('POST', `/memories/${encodeURIComponent(id)}/${archived ? 'archive' : 'restore'}`,
    { expectedVersion })
}

export function deleteMemory(id: string, expectedVersion: string): Promise<void> {
  return request<void>('DELETE', `/memories/${encodeURIComponent(id)}`, { expectedVersion })
}
