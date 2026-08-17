const LEGACY_TOKEN_KEY = 'oms-platform-token'
const USER_KEY = 'oms-platform-user'

function clearLegacyToken() {
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  sessionStorage.removeItem(LEGACY_TOKEN_KEY)
}

export function getCurrentUser(): Record<string, any> | null {
  clearLegacyToken()
  const raw = localStorage.getItem(USER_KEY)
    || sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function saveSession(user?: Record<string, any>, remember = true) {
  const storage = remember ? localStorage : sessionStorage
  clearSession()
  if (user) storage.setItem(USER_KEY, JSON.stringify(user))
}

export function saveUser(user: Record<string, any> | null) {
  if (!user) {
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(USER_KEY)
    return
  }
  const storage = localStorage.getItem(USER_KEY) ? localStorage : sessionStorage
  storage.setItem(USER_KEY, JSON.stringify(user))
}

export function releaseInteractionLocks() {
  if (typeof document === 'undefined') return
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) activeElement.blur()
  document.body.style.removeProperty('pointer-events')
}

export function clearSession() {
  releaseInteractionLocks()
  clearLegacyToken()
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(USER_KEY)
}

function resolveApiBase(): string {
  const sameOrigin = `${window.location.origin}/api/v1`
  const configured = (import.meta as any).env.VITE_API_BASE_URL
  if (!configured) return sameOrigin
  try {
    const url = new URL(configured)
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname) && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return sameOrigin
    }
  } catch {}
  return configured.replace(/\/+$/, '') || sameOrigin
}

export async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers as Record<string, string> || {})

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const API_BASE = resolveApiBase()
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  } catch {
    throw new Error('无法连接服务器')
  }

  if (response.status === 401) {
    clearSession()
    // 通知 AuthContext 同步登出:仅清存储不更新 React 状态会导致页面"假登录"、后续连环 401
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('oms:unauthorized'))
  }
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  let payload: any
  if (contentType.includes('application/json')) {
    // 网关截断/响应体损坏时 response.json() 会抛未包装的 SyntaxError,降级为文本避免丢失 status 分支
    try {
      payload = await response.json()
    } catch {
      payload = await response.text().catch(() => '')
    }
  } else {
    payload = await response.text()
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.error || response.statusText
    const error = new Error(message) as Error & { status?: number; details?: unknown; payload?: unknown }
    error.status = response.status
    error.details = payload?.error?.details
    error.payload = payload
    throw error
  }

  return payload
}

export async function download(path: string): Promise<Blob> {
  const headers = new Headers()

  const API_BASE = resolveApiBase()
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include' })
  } catch {
    throw new Error('无法连接服务器')
  }

  if (response.status === 401) clearSession()
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(message || response.statusText)
  }
  return response.blob()
}

export interface SummaryProgressEvent {
  stage: string;
  progress: number;
  message: string;
}

// 通过 SSE 读取 AI 总结生成进度（与后端 timesheet/monthly 的流式响应配套）。
// 复用 resolveApiBase()：生产构建的 VITE_API_BASE_URL 可能是 localhost 占位，
// 必须走 localhost 回退逻辑，否则会被 CSP connect-src 拦截导致“无法连接服务器”。
export async function fetchSummaryStream(path: string, onProgress?: (progress: SummaryProgressEvent) => void): Promise<any> {
  const API_BASE = resolveApiBase()
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'text/event-stream' },
      credentials: 'include',
    })
  } catch {
    throw new Error('无法连接服务器')
  }

  if (response.status === 401) {
    clearSession()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('oms:unauthorized'))
  }

  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    let message = `请求失败（${response.status}）`
    try {
      const payload = await response.json()
      message = payload?.error?.message || payload?.message || message
    } catch {}
    throw new Error(message)
  }

  if (!contentType.includes('text/event-stream')) {
    // 后端未走 SSE（例如被限流/网关拦截），按普通 JSON 处理
    return request(path)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取服务器进度流')
  const decoder = new TextDecoder()
  let buffer = ''
  let result: any = null
  let errorMessage = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const eventName = /^event: (.+)$/m.exec(frame)?.[1] || 'message'
      const dataLine = /^data: (.+)$/m.exec(frame)?.[1] || ''
      if (!dataLine) continue
      let parsed: any = null
      try { parsed = JSON.parse(dataLine) } catch { continue }
      if (eventName === 'progress' && parsed && typeof parsed.progress === 'number') {
        onProgress?.({ stage: parsed.stage || 'ai', progress: parsed.progress, message: parsed.message || '' })
      } else if (eventName === 'result') {
        result = parsed
      } else if (eventName === 'error') {
        errorMessage = parsed?.message || 'AI 总结生成失败'
      }
    }
  }
  if (errorMessage) throw new Error(errorMessage)
  if (!result) throw new Error('AI 总结生成失败：未收到结果')
  return result
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  postForm: (path: string, body: FormData) => request(path, { method: 'POST', body }),
  put: (path: string, body?: any) => request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
  download,
}
