import { reactive } from 'vue'
import { ApiError, clearCsrf, refreshCsrf, request, setAuthRequiredHandler } from './api'
import type { Me } from './types'

export const session = reactive({
  user: null as Me | null,
  checked: false,
  bootError: '',
  reauthRequired: false,
  expiredUserId: null as string | null,
})

let loading: Promise<Me | null> | null = null

setAuthRequiredHandler(() => {
  session.expiredUserId = session.user?.id ?? null
  session.reauthRequired = true
})

export async function ensureSession(): Promise<Me | null> {
  if (session.checked) return session.user
  if (!loading) {
    loading = request<Me>('GET', '/me', undefined, { silentAuth: true })
      .then(user => { session.user = user; session.checked = true; session.bootError = ''; return user })
      .catch(error => {
        if (error instanceof ApiError && error.status === 401) {
          session.user = null
          session.checked = true
          session.bootError = ''
          return null
        }
        session.bootError = error instanceof Error ? error.message : '无法连接服务。'
        throw error
      }).finally(() => { loading = null })
  }
  return loading
}

export async function retrySession(): Promise<Me | null> {
  session.checked = false
  session.bootError = ''
  return ensureSession()
}

export async function login(username: string, password: string): Promise<{ user: Me; switched: boolean }> {
  const oldId = session.expiredUserId
  const user = await request<Me>('POST', '/auth/login', { username, password }, { silentAuth: true })
  clearCsrf()
  await refreshCsrf()
  session.user = user
  session.checked = true
  session.bootError = ''
  session.reauthRequired = false
  session.expiredUserId = null
  return { user, switched: oldId !== null && oldId !== user.id }
}

export async function logout(): Promise<void> {
  await request<void>('POST', '/auth/logout')
  clearSession()
}

export function clearSession(): void {
  clearCsrf()
  session.user = null
  session.checked = true
  session.reauthRequired = false
  session.expiredUserId = null
}

export function updateUser(user: Me): void {
  session.user = user
}
