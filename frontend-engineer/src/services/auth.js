import { ref } from 'vue'
import { clearOfflineCacheForCurrentSession } from './offline-cache'
import { safeStorageGet, safeStorageRemove, safeStorageSet } from './safe-storage'

const TOKEN_KEY = 'service-sheet-rc-token'
const USER_KEY = 'service-sheet-rc-user'
const LEGACY_TOKEN_KEY = 'service-sheet-rc-engineer-token'
const LEGACY_USER_KEY = 'service-sheet-rc-engineer-user'
const REMEMBER_USERNAME_KEY = 'service-sheet-rc-engineer-remember-username'
const LEGACY_REMEMBER_PASSWORD_KEY = 'service-sheet-rc-engineer-remember-password'

safeStorageRemove(localStorage, LEGACY_REMEMBER_PASSWORD_KEY)

function compactUser(user) {
  if (!user || typeof user !== 'object') return null
  const nextUser = { ...user }
  if ('engineerSignature' in nextUser) nextUser.engineerSignature = ''
  return nextUser
}

function readStoredUser() {
  const raw = safeStorageGet(localStorage, USER_KEY, '') || safeStorageGet(localStorage, LEGACY_USER_KEY, '')
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    safeStorageRemove(localStorage, TOKEN_KEY)
    safeStorageRemove(localStorage, USER_KEY)
    safeStorageRemove(localStorage, LEGACY_TOKEN_KEY)
    safeStorageRemove(localStorage, LEGACY_USER_KEY)
    return null
  }
}

export const currentUser = ref(readStoredUser())

export function getToken() {
  return safeStorageGet(localStorage, TOKEN_KEY, '') || safeStorageGet(localStorage, LEGACY_TOKEN_KEY, '')
}

export function getCurrentUser() {
  currentUser.value = readStoredUser()
  return currentUser.value
}

export function saveSession({ token, user }) {
  safeStorageSet(localStorage, TOKEN_KEY, token)
  safeStorageRemove(localStorage, LEGACY_TOKEN_KEY)
  if (user) {
    const storedUser = compactUser(user)
    safeStorageSet(localStorage, USER_KEY, JSON.stringify(storedUser))
    currentUser.value = storedUser
  }
}

export function loadRememberedCredentials() {
  return {
    username: safeStorageGet(localStorage, REMEMBER_USERNAME_KEY, '') || '',
    password: '',
  }
}

export function saveRememberedCredentials({ username = '' }, rememberPassword) {
  if (rememberPassword) {
    safeStorageSet(localStorage, REMEMBER_USERNAME_KEY, username)
    return
  }

  safeStorageRemove(localStorage, REMEMBER_USERNAME_KEY)
  safeStorageRemove(localStorage, LEGACY_REMEMBER_PASSWORD_KEY)
}

export function saveUser(user) {
  if (!user) {
    safeStorageRemove(localStorage, USER_KEY)
    currentUser.value = null
    return
  }
  const storedUser = compactUser(user)
  safeStorageSet(localStorage, USER_KEY, JSON.stringify(storedUser))
  currentUser.value = storedUser
}

export function clearSession() {
  clearOfflineCacheForCurrentSession()
  safeStorageRemove(localStorage, TOKEN_KEY)
  safeStorageRemove(localStorage, USER_KEY)
  safeStorageRemove(localStorage, LEGACY_TOKEN_KEY)
  safeStorageRemove(localStorage, LEGACY_USER_KEY)
  currentUser.value = null
}

export function isLoggedIn() {
  return Boolean(getToken())
}
