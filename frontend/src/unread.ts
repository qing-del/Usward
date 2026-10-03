import { reactive } from 'vue'
import { listNotifications } from './notifications'
import { session } from './session'

export const unread = reactive({ ownerId: null as string | null, count: null as number | null })
let revision = 0
let pending: Promise<void> | null = null
let pendingOwner: string | null = null
let timer: ReturnType<typeof setInterval> | null = null

function syncOwner(): string | null {
  const id = session.user?.id ?? null
  if (unread.ownerId !== id) {
    unread.ownerId = id
    unread.count = null
    revision++
  }
  return id
}

export function setUnreadCount(count: number): void {
  if (!syncOwner()) return
  revision++
  unread.count = count
}

export async function refreshUnread(): Promise<void> {
  const id = syncOwner()
  if (!id) return
  if (pending && pendingOwner === id) return pending
  const before = revision
  let operation: Promise<void>
  operation = listNotifications({ read: 'UNREAD', page: 1, size: 1 })
    .then(page => {
      if (session.user?.id === id && revision === before) setUnreadCount(page.unreadCount)
    }).catch(() => { /* The current page retains its last known count; retry on visibility or timer. */ })
    .finally(() => { if (pending === operation) { pending = null; pendingOwner = null } })
  pending = operation
  pendingOwner = id
  return operation
}

function onVisible() {
  if (document.visibilityState === 'visible') void refreshUnread()
}

export function startUnreadPolling(initialQuery: boolean): () => void {
  stopUnreadPolling()
  syncOwner()
  if (initialQuery) void refreshUnread()
  document.addEventListener('visibilitychange', onVisible)
  timer = setInterval(onVisible, 60_000)
  return stopUnreadPolling
}

function stopUnreadPolling(): void {
  if (timer) clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
}
