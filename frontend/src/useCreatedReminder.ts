import { reactive, ref } from 'vue'
import { emptyReminderDraft, reminderPlan, saveCreatedReminder } from './reminderCreate'
import type { ReminderPlan } from './reminderCreate'
import type { ReminderDetail, ReminderResourceType } from './reminders'

export function useCreatedReminder(resourceType: ReminderResourceType, timezone: () => string,
  mailAvailable: () => boolean) {
  const draft = reactive(emptyReminderDraft())
  const pendingId = ref<string | null>(null)
  const pending = ref(false)
  const error = ref('')
  const review = ref<ReminderDetail | null>(null)

  function clearPending() {
    pendingId.value = null
    error.value = ''
    review.value = null
  }

  function reset() {
    Object.assign(draft, emptyReminderDraft())
    clearPending()
    pending.value = false
  }

  function validate(): ReminderPlan | null {
    return reminderPlan(draft, timezone(), mailAvailable())
  }

  async function apply(resourceId: string, plan: ReminderPlan | null): Promise<ReminderDetail | null> {
    if (!plan) { clearPending(); return null }
    if (pending.value) return null
    pendingId.value = resourceId
    pending.value = true
    error.value = ''
    review.value = null
    try {
      const result = await saveCreatedReminder(resourceType, resourceId, plan)
      if (result.kind === 'saved') {
        clearPending()
        return result.reminder
      }
      error.value = `内容已保存，你选择的提醒未设置。${result.message}`
      if (result.kind === 'review') review.value = result.reminder
      return null
    } finally { pending.value = false }
  }

  async function retry(): Promise<ReminderDetail | null> {
    if (!pendingId.value || pending.value) return null
    let plan: ReminderPlan | null
    try { plan = validate() }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '提醒时间无效。'; return null }
    return apply(pendingId.value, plan)
  }

  return { draft, pendingId, pending, error, review, clearPending, reset, validate, apply, retry }
}
