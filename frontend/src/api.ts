import type { ApiErrorBody } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
type RequestOptions = { silentAuth?: boolean; signal?: AbortSignal }

let csrf: { headerName: string; token: string } | null = null
let csrfPromise: Promise<void> | null = null
let onAuthRequired: (() => void) | null = null

export function setAuthRequiredHandler(handler: () => void): void {
  onAuthRequired = handler
}

export function clearCsrf(): void {
  csrf = null
}

export async function refreshCsrf(): Promise<void> {
  if (!csrfPromise) {
    csrfPromise = (async () => {
      const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
      if (!response.ok) throw await failure(response)
      csrf = await response.json() as { headerName: string; token: string }
    })().finally(() => { csrfPromise = null })
  }
  return csrfPromise
}

async function failure(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null
  try { body = await response.json() as ApiErrorBody } catch { /* Non-JSON gateway failure. */ }
  return new ApiError(response.status, body?.code ?? 'HTTP_ERROR',
    body?.message ?? '请求暂时无法完成，请稍后再试。', body?.fieldErrors ?? {})
}

export async function request<T>(method: Method, path: string, body?: unknown,
  options: RequestOptions = {}): Promise<T> {
  const headers = new Headers()
  if (method !== 'GET') {
    if (!csrf) await refreshCsrf()
    if (csrf) headers.set(csrf.headerName, csrf.token)
    if (body !== undefined) headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method, credentials: 'same-origin', headers, signal: options.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'NETWORK_ERROR', '无法连接服务，请检查网络后重试。')
  }
  if (!response.ok) {
    const error = await failure(response)
    if (error.code === 'CSRF_INVALID') {
      clearCsrf()
      try { await refreshCsrf() } catch { /* A later action can retry. */ }
      error.message = '请求验证已过期，请再次提交。'
    }
    if (response.status === 401 && !options.silentAuth) onAuthRequired?.()
    throw error
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  return search.toString()
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '暂时无法完成，请稍后重试。'
}
