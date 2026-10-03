import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshUnread, setUnreadCount, unread } from './unread'
import { session } from './session'
import type { Me } from './types'

const user: Me = { id: '1', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '0', stats: { openCommitmentCount: 0, archivedMemoryCount: 0 } }
const json = (count: number) => new Response(JSON.stringify({ unreadCount: count }),
  { headers: { 'Content-Type': 'application/json' } })

describe('unread count ownership', () => {
  beforeEach(() => {
    session.user = user
    unread.ownerId = null
    unread.count = null
    vi.unstubAllGlobals()
  })

  it('ignores a late response from a previous account', async () => {
    let resolveAlice!: (value: Response) => void
    const alice = new Promise<Response>(resolve => { resolveAlice = resolve })
    const fetchMock = vi.fn().mockReturnValueOnce(alice).mockResolvedValueOnce(json(2))
    vi.stubGlobal('fetch', fetchMock)
    const oldRequest = refreshUnread()
    session.user = { ...user, id: '2', username: 'bob' }
    await refreshUnread()
    resolveAlice(json(8))
    await oldRequest
    expect(unread.ownerId).toBe('2')
    expect(unread.count).toBe(2)
  })

  it('keeps a newer dashboard count over an older polling response', async () => {
    let resolvePoll!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(resolve => { resolvePoll = resolve })))
    const poll = refreshUnread()
    setUnreadCount(5)
    resolvePoll(json(4))
    await poll
    expect(unread.count).toBe(5)
  })
})
