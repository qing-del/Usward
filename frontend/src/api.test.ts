import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, clearCsrf, query, request, setAuthRequiredHandler } from './api'
import { login, session } from './session'
import type { Me } from './types'

const user: Me = {
  id: '9007199254740993', username: 'alice', nickname: 'Alice', avatarStyle: 'INITIAL',
  timezone: 'Asia/Shanghai', notificationEmail: null, mailReminderAvailable: false,
  shareAvailability: false, version: '9007199254740994',
  stats: { openCommitmentCount: 0, archivedMemoryCount: 0 },
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('session API client', () => {
  beforeEach(() => {
    clearCsrf()
    session.user = null
    session.checked = false
    session.reauthRequired = false
    session.expiredUserId = null
    vi.unstubAllGlobals()
  })

  it('gets CSRF before login, rotates it after login, and keeps string versions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'before' }))
      .mockResolvedValueOnce(json(user))
      .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'after' }))
      .mockResolvedValueOnce(json({ ...user, version: '9007199254740995' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await login('alice', 'secret')
    expect(result.user.id).toBe('9007199254740993')
    expect(result.user.version).toBe('9007199254740994')
    await request<Me>('PATCH', '/me', { expectedVersion: result.user.version, nickname: 'A' })

    expect(fetchMock.mock.calls[1][1].headers.get('X-CSRF-TOKEN')).toBe('before')
    expect(fetchMock.mock.calls[3][1].headers.get('X-CSRF-TOKEN')).toBe('after')
    expect(fetchMock.mock.calls[3][1].credentials).toBe('same-origin')
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).expectedVersion).toBe('9007199254740994')
  })

  it('reports 401 so the current form can remain mounted', async () => {
    const required = vi.fn()
    setAuthRequiredHandler(required)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'AUTH_REQUIRED', message: '请先登录' }, 401)))
    await expect(request('GET', '/memories')).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
    expect(required).toHaveBeenCalledOnce()
  })

  it('refreshes an invalid CSRF token without replaying a mutation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'old' }))
      .mockResolvedValueOnce(json({ code: 'CSRF_INVALID', message: 'bad' }, 403))
      .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'new' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(request('POST', '/events', { title: 'x' })).rejects.toMatchObject({
      status: 403, code: 'CSRF_INVALID', message: '请求验证已过期，请再次提交。',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('preserves server conflict details and query parameters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'VERSION_CONFLICT', message: '已变化' }, 409)))
    await expect(request('GET', '/events/1')).rejects.toEqual(new ApiError(409, 'VERSION_CONFLICT', '已变化'))
    expect(query({ page: 1, archived: false, tag: null, keyword: '' })).toBe('page=1&archived=false')
  })
})
