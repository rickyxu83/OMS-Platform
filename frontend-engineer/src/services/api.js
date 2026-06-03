import { clearSession, getToken } from './auth'
import { resolveApiBase } from './api-base'
import { readOfflineCache, writeOfflineCache } from './offline-cache'
import { setNetworkOnline } from './network'

const API_BASE = resolveApiBase()

function cacheablePath(path) {
  if (/^\/service-orders\/\d+/.test(path)) return false
  return path.startsWith('/auth/me') || path.startsWith('/customers') || path.startsWith('/service-orders') || path.startsWith('/users/engineers')
}

function requestCacheKey(path) {
  return `api:${path}`
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()
  const method = String(options.method || 'GET').toUpperCase()
  const canUseCache = method === 'GET' && cacheablePath(path)

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    setNetworkOnline(false)
    if (canUseCache) {
      const cached = readOfflineCache(requestCacheKey(path))
      if (cached) return cached
    }
    throw new Error('无法连接服务器')
  }

  if (response.status === 401) clearSession()
  if (response.status === 204) return null
  setNetworkOnline(true)

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    if (canUseCache && response.status >= 500) {
      const cached = readOfflineCache(requestCacheKey(path))
      if (cached) return cached
    }
    const message = payload?.error?.message || payload?.message || payload?.error || response.statusText
    throw new Error(message)
  }

  if (canUseCache) writeOfflineCache(requestCacheKey(path), payload)
  return payload
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
