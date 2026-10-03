import { ApiError, errorMessage } from './api'
import { getResourceReminder, putReminder } from './reminders'
import type { ReminderDeliveryMode, ReminderDetail, ReminderResourceType } from './reminders'
import { fromLocal } from './time'

export type ReminderDraftMode = 'NONE' | ReminderDeliveryMode
export interface ReminderDraft { mode: ReminderDraftMode; local: string; offset: string }
export interface ReminderPlan { deliveryMode: ReminderDeliveryMode; scheduledAt: string }

export function emptyReminderDraft(): ReminderDraft { return { mode: 'NONE', local: '', offset: '' } }

export function reminderPlan(draft: ReminderDraft, timezone: string,
  mailAvailable: boolean): ReminderPlan | null {
  if (draft.mode === 'NONE') return null
  if (!draft.local) throw new Error('请选择提醒时间。')
  if (draft.mode === 'IN_APP_AND_MAIL' && !mailAvailable) {
    throw new Error('邮件提醒尚不可用，请选择站内通知。')
  }
  return { deliveryMode: draft.mode, scheduledAt: fromLocal(draft.local, timezone, draft.offset) }
}

export type CreatedReminderResult =
  | { kind: 'saved'; reminder: ReminderDetail }
  | { kind: 'review'; reminder: ReminderDetail; message: string }
  | { kind: 'failed'; message: string }

function samePlan(value: ReminderDetail, plan: ReminderPlan): boolean {
  return value.status === 'PENDING' && value.deliveryMode === plan.deliveryMode
    && Date.parse(value.scheduledAt) === Date.parse(plan.scheduledAt)
}

/** A retry always checks the resource first, so a lost PUT response cannot create a second revision. */
export async function saveCreatedReminder(resourceType: ReminderResourceType, resourceId: string,
  plan: ReminderPlan): Promise<CreatedReminderResult> {
  let current: ReminderDetail | null
  try { current = await getResourceReminder(resourceType, resourceId) }
  catch (cause) { return { kind: 'failed', message: errorMessage(cause) } }
  if (current) {
    return samePlan(current, plan) ? { kind: 'saved', reminder: current }
      : { kind: 'review', reminder: current,
        message: '服务端已有另一项提醒。你的时间和方式已保留，请在详情核对后调整。' }
  }
  try {
    return { kind: 'saved', reminder: await putReminder({ resourceType, resourceId,
      ...plan, expectedRevision: null }) }
  } catch (cause) {
    if (cause instanceof ApiError && (cause.code === 'NETWORK_ERROR' || cause.status === 409)) {
      try {
        const latest = await getResourceReminder(resourceType, resourceId)
        if (latest && samePlan(latest, plan)) return { kind: 'saved', reminder: latest }
        if (latest) return { kind: 'review', reminder: latest,
          message: '提醒修订已变化。你的时间和方式已保留，请在详情核对后调整。' }
      } catch { /* Keep the original error and allow an explicit retry. */ }
    }
    return { kind: 'failed', message: errorMessage(cause) }
  }
}
