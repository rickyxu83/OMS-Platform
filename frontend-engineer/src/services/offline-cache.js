import { safeStorageGet } from './safe-storage'

const CACHE_PREFIX = 'oms-platform-engineer-offline-cache:'
const USER_KEY = 'oms-platform-user'
const DRAFT_KEY_MARKER = ':draft:'

function readCurrentUser() {
  const rawUser = safeStorageGet(localStorage, USER_KEY, '')
  if (!rawUser) return null
  try {
    return JSON.parse(rawUser)
  } catch {
    return null
  }
}

function userScope(user) {
  if (!user || typeof user !== 'object') return ''
  if (user.id) return `id:${user.id}`
  if (user.username) return `username:${user.username}`
  return ''
}

function getCurrentScope() {
  const user = readCurrentUser()
  const accountScope = userScope(user)
  if (accountScope) return accountScope
  return 'anonymous'
}

function currentAccountScope() {
  const user = readCurrentUser()
  return userScope(user)
}

function isDraftCacheKey(key) {
  return String(key || '').includes(DRAFT_KEY_MARKER)
}

function parseCacheEntry(raw, storageKey = '') {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      storageKey,
      updatedAt: parsed?.updatedAt || '',
      data: parsed?.data ?? null,
    }
  } catch {
    return null
  }
}

function findLegacyDraftEntry(key) {
  if (!isDraftCacheKey(key)) return null

  const suffix = `:${key}`
  const accountScope = currentAccountScope()
  const matches = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index)
    if (!storageKey?.startsWith(CACHE_PREFIX) || !storageKey.endsWith(suffix)) continue
    const scopedPart = storageKey.slice(CACHE_PREFIX.length, -suffix.length)
    if (accountScope && scopedPart !== accountScope && !scopedPart.startsWith(`${accountScope}:`)) continue
    if (!accountScope && scopedPart !== 'anonymous' && !scopedPart.startsWith('token:')) continue
    const entry = parseCacheEntry(localStorage.getItem(storageKey), storageKey)
    if (entry) matches.push(entry)
  }
  matches.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  return matches[0] || null
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
  const targetKey = cacheKey(getCurrentScope(), key)
  const entry = parseCacheEntry(localStorage.getItem(targetKey), targetKey)
  if (entry) return entry.data ?? fallback
  if (localStorage.getItem(targetKey)) localStorage.removeItem(targetKey)

  const legacyEntry = findLegacyDraftEntry(key)
  return legacyEntry?.data ?? fallback
}

export function readOfflineCacheMeta(key) {
  const targetKey = cacheKey(getCurrentScope(), key)
  const entry = parseCacheEntry(localStorage.getItem(targetKey), targetKey)
  if (entry) return { updatedAt: entry.updatedAt, data: entry.data }
  if (localStorage.getItem(targetKey)) localStorage.removeItem(targetKey)

  const legacyEntry = findLegacyDraftEntry(key)
  if (!legacyEntry) return null
  writeOfflineCache(key, legacyEntry.data)
  localStorage.removeItem(legacyEntry.storageKey)
  return { updatedAt: legacyEntry.updatedAt, data: legacyEntry.data }
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

export function clearOfflineCacheForScope(scope, { preserveDrafts = false } = {}) {
  for (const key of scopedCacheKeys(scope || getCurrentScope())) {
    if (preserveDrafts && isDraftCacheKey(key)) continue
    localStorage.removeItem(key)
  }
}

export function clearOfflineCacheForCurrentSession(options = {}) {
  clearOfflineCacheForScope(getCurrentScope(), options)
}
