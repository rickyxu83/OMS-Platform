import { safeStorageGet } from './safe-storage'

const CACHE_PREFIX = 'oms-platform-engineer-offline-cache:'
const TOKEN_KEY = 'oms-platform-token'
const USER_KEY = 'oms-platform-user'

function hashValue(value) {
  let hash = 5381
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

function getCurrentScope() {
  const token = safeStorageGet(localStorage, TOKEN_KEY, '')
  const rawUser = safeStorageGet(localStorage, USER_KEY, '')
  if (!token || !rawUser) return 'anonymous'

  try {
    const user = JSON.parse(rawUser)
    const userKey = user?.id ? `id:${user.id}` : user?.username ? `username:${user.username}` : 'unknown'
    return `${userKey}:${hashValue(token)}`
  } catch {
    return `token:${hashValue(token)}`
  }
}

function cacheKey(scope, key) {
  return `${CACHE_PREFIX}${scope}:${key}`
}

function scopedCacheKeys(scope) {
  const prefix = `${CACHE_PREFIX}${scope}:`
  const keys = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  return keys
}

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    String(error?.message || '').toLowerCase().includes('quota')
  )
}

function removeOldestCacheEntries(scope, limit = 4) {
  const entries = []
  for (const key of scopedCacheKeys(scope)) {
    if (key.includes(':draft:')) continue

    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}')
      entries.push({ key, updatedAt: parsed.updatedAt || '' })
    } catch {
      entries.push({ key, updatedAt: '' })
    }
  }

  entries
    .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
    .slice(0, limit)
    .forEach((entry) => {
      localStorage.removeItem(entry.key)
    })
}

export function readOfflineCache(key, fallback = null) {
  const raw = localStorage.getItem(cacheKey(getCurrentScope(), key))
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw)
    return parsed?.data ?? fallback
  } catch {
    localStorage.removeItem(cacheKey(getCurrentScope(), key))
    return fallback
  }
}

export function readOfflineCacheMeta(key) {
  const raw = localStorage.getItem(cacheKey(getCurrentScope(), key))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return {
      updatedAt: parsed?.updatedAt || '',
      data: parsed?.data ?? null,
    }
  } catch {
    localStorage.removeItem(cacheKey(getCurrentScope(), key))
    return null
  }
}

export function writeOfflineCache(key, data) {
  const value = JSON.stringify({
    updatedAt: new Date().toISOString(),
    data,
  })
  const scope = getCurrentScope()
  const targetKey = cacheKey(scope, key)

  try {
    localStorage.setItem(targetKey, value)
  } catch (error) {
    if (!isQuotaError(error)) throw error
    removeOldestCacheEntries(scope)
    try {
      localStorage.setItem(targetKey, value)
    } catch {
      // Offline cache is optional. If Safari storage is full, keep the page usable.
    }
  }
}

export function removeOfflineCache(key) {
  localStorage.removeItem(cacheKey(getCurrentScope(), key))
}

export function clearOfflineCacheForScope(scope) {
  for (const key of scopedCacheKeys(scope || getCurrentScope())) {
    localStorage.removeItem(key)
  }
}

export function clearOfflineCacheForCurrentSession() {
  clearOfflineCacheForScope(getCurrentScope())
}
