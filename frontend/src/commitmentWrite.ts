import type { CommitmentDetail, CommitmentSourceType, DueKind } from './commitments'
import { addDays, fromLocal, offsetAt, startOfDay, toLocal } from './time'

export interface CommitmentDraft {
  title: string
  body: string
  nextAction: string
  dueKind: DueKind
  dueDate: string
  dueTimezone: string
  dueLocal: string
  dueOffset: string
}

export type CommitmentSource = { sourceType: Exclude<CommitmentSourceType, 'EXPRESSION'>;
  sourceId: string }

export type CommitmentWrite = {
  title: string
  body: string | null
  nextAction: string | null
  dueKind: DueKind
  dueAt: string | null
  dueDate: string | null
  dueTimezone: string | null
  sourceType?: CommitmentSource['sourceType'] | null
  sourceId?: string | null
}

export type CommitmentPatch = Partial<CommitmentWrite> & { expectedVersion: string }

export function emptyCommitmentDraft(timezone: string): CommitmentDraft {
  return { title: '', body: '', nextAction: '', dueKind: 'NONE', dueDate: '',
    dueTimezone: timezone, dueLocal: '', dueOffset: '' }
}

export function commitmentDraftFromDetail(detail: CommitmentDetail, viewerTimezone: string): CommitmentDraft {
  return { title: detail.title, body: detail.body ?? '', nextAction: detail.nextAction ?? '',
    dueKind: detail.dueKind, dueDate: detail.dueDate ?? '',
    dueTimezone: detail.dueTimezone ?? viewerTimezone,
    dueLocal: detail.dueAt ? toLocal(detail.dueAt, viewerTimezone) : '',
    dueOffset: detail.dueAt ? offsetAt(detail.dueAt, viewerTimezone) : '' }
}

function optionalText(value: string, max: number): string | null {
  const trimmed = value.trim()
  if ([...trimmed].length > max) throw new Error(`内容不能超过 ${max} 个字。`)
  return trimmed || null
}

function dueValues(draft: CommitmentDraft, viewerTimezone: string): Pick<CommitmentWrite,
  'dueKind' | 'dueAt' | 'dueDate' | 'dueTimezone'> {
  if (draft.dueKind === 'NONE') {
    return { dueKind: 'NONE', dueAt: null, dueDate: null, dueTimezone: null }
  }
  if (draft.dueKind === 'DATE') {
    if (!draft.dueDate) throw new Error('请选择截止日期。')
    addDays(draft.dueDate, 0)
    const zone = draft.dueTimezone.trim()
    try { new Intl.DateTimeFormat('zh-CN', { timeZone: zone }) }
    catch { throw new Error('请填写有效的 IANA 时区。') }
    startOfDay(draft.dueDate, zone)
    startOfDay(addDays(draft.dueDate, 1), zone)
    return { dueKind: 'DATE', dueAt: null, dueDate: draft.dueDate, dueTimezone: zone }
  }
  if (!draft.dueLocal) throw new Error('请选择精确截止时间。')
  return { dueKind: 'INSTANT', dueAt: fromLocal(draft.dueLocal, viewerTimezone, draft.dueOffset),
    dueDate: null, dueTimezone: null }
}

export function createCommitmentValues(draft: CommitmentDraft, viewerTimezone: string,
  source: CommitmentSource | null): CommitmentWrite {
  const title = draft.title.trim()
  if (!title || [...title].length > 100) throw new Error('标题必填，最多 100 个字。')
  return { title, body: optionalText(draft.body, 5000),
    nextAction: optionalText(draft.nextAction, 5000), ...dueValues(draft, viewerTimezone),
    ...(source ? { sourceType: source.sourceType, sourceId: source.sourceId } : {}) }
}

export function patchCommitmentValues(draft: CommitmentDraft, original: CommitmentDraft,
  viewerTimezone: string, expectedVersion: string, removeSource: boolean): CommitmentPatch | null {
  const next = createCommitmentValues(draft, viewerTimezone, null)
  const patch: CommitmentPatch = { expectedVersion }
  if (draft.title !== original.title) patch.title = next.title
  if (draft.body !== original.body) patch.body = next.body
  if (draft.nextAction !== original.nextAction) patch.nextAction = next.nextAction
  if (draft.dueKind !== original.dueKind || (draft.dueKind === 'DATE'
    && (draft.dueDate !== original.dueDate || draft.dueTimezone !== original.dueTimezone))
    || (draft.dueKind === 'INSTANT' && (draft.dueLocal !== original.dueLocal
      || draft.dueOffset !== original.dueOffset))) {
    Object.assign(patch, dueValues(draft, viewerTimezone))
  }
  if (removeSource) { patch.sourceType = null; patch.sourceId = null }
  return Object.keys(patch).length > 1 ? patch : null
}
