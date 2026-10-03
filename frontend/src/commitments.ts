import { query, request } from './api'
import type { CommitmentPatch, CommitmentWrite } from './commitmentWrite'
import type { ReminderDetail } from './reminders'

export type CommitmentStatus = 'OPEN' | 'DONE' | 'CANCELLED'
export type CommitmentStatusFilter = CommitmentStatus | 'ALL'
export type CommitmentSort = 'DEADLINE_ASC' | 'UPDATED_DESC'
export type DueKind = 'NONE' | 'DATE' | 'INSTANT'
export type CommitmentSourceType = 'MEMORY_CARD' | 'CALENDAR_EVENT' | 'EXPRESSION'

export const statusLabels: Record<CommitmentStatus, string> = {
  OPEN: '进行中', DONE: '已完成', CANCELLED: '已取消',
}

export interface CommitmentSummary {
  id: string
  version: string
  createdAt: string
  updatedAt: string
  ownerId: string
  owner: { id: string; nickname: string; avatarStyle: string }
  title: string
  nextAction: string | null
  status: CommitmentStatus
  dueKind: DueKind
  dueAt: string | null
  dueDate: string | null
  dueTimezone: string | null
  deadlineAt: string | null
  isOverdue: boolean
  isDueToday: boolean
  sharedConnectionId: string | null
}

export interface CommitmentDetail extends Omit<CommitmentSummary, 'owner'> {
  body: string | null
  result: string | null
  sourceType: CommitmentSourceType | null
  sourceId: string | null
  sourceAvailable: boolean | null
  myReminder: ReminderDetail | null
}

export interface CommitmentPage {
  items: CommitmentSummary[]
  total: number
  page: number
  size: number
  hasMore: boolean
  asOf: string
  statusCounts: Record<CommitmentStatus, number>
}

export function listCommitments(filter: { status: CommitmentStatusFilter; sort: CommitmentSort;
  page: number; size: number }, signal?: AbortSignal): Promise<CommitmentPage> {
  return request<CommitmentPage>('GET', `/commitments?${query({ scope: 'MINE',
    status: filter.status, sort: filter.sort, page: filter.page, size: filter.size })}`,
  undefined, { signal })
}

export function getCommitment(id: string): Promise<CommitmentDetail> {
  return request<CommitmentDetail>('GET', `/commitments/${encodeURIComponent(id)}`)
}

export function createCommitment(write: CommitmentWrite): Promise<CommitmentDetail> {
  return request<CommitmentDetail>('POST', '/commitments', write)
}

export function patchCommitment(id: string, write: CommitmentPatch): Promise<CommitmentDetail> {
  return request<CommitmentDetail>('PATCH', `/commitments/${encodeURIComponent(id)}`, write)
}

export function completeCommitment(id: string, expectedVersion: string,
  result: string | null): Promise<CommitmentDetail> {
  return request<CommitmentDetail>('POST', `/commitments/${encodeURIComponent(id)}/complete`,
    { expectedVersion, result })
}

export function cancelCommitment(id: string, expectedVersion: string): Promise<CommitmentDetail> {
  return request<CommitmentDetail>('POST', `/commitments/${encodeURIComponent(id)}/cancel`,
    { expectedVersion })
}

export function reopenCommitment(id: string, expectedVersion: string): Promise<CommitmentDetail> {
  return request<CommitmentDetail>('POST', `/commitments/${encodeURIComponent(id)}/reopen`,
    { expectedVersion })
}

export function deleteCommitment(id: string, expectedVersion: string): Promise<void> {
  return request<void>('DELETE', `/commitments/${encodeURIComponent(id)}`, { expectedVersion })
}

export function commitmentDueLabel(item: Pick<CommitmentSummary, 'dueKind' | 'dueDate' | 'dueTimezone' | 'dueAt'>,
  viewerTimezone: string): string {
  if (item.dueKind === 'NONE') return '未设截止时间'
  if (item.dueKind === 'DATE') {
    const date = item.dueDate!
    const display = new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric',
      month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
    return `${display}全天（${item.dueTimezone}）`
  }
  const display = new Intl.DateTimeFormat('zh-CN', { timeZone: viewerTimezone,
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false }).format(new Date(item.dueAt!))
  return `${display}（${viewerTimezone}）`
}

export function commitmentSourceLink(detail: CommitmentDetail): string | null {
  if (!detail.sourceAvailable || !detail.sourceId) return null
  if (detail.sourceType === 'MEMORY_CARD') return `/memories?memory=${encodeURIComponent(detail.sourceId)}`
  if (detail.sourceType === 'CALENDAR_EVENT') return `/calendar?event=${encodeURIComponent(detail.sourceId)}`
  return null
}
