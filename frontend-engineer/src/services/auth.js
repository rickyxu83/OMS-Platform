import { ref } from 'vue'
import { clearOfflineCacheForCurrentSession } from './offline-cache'
import { safeStorageGet, safeStorageRemove, safeStorageSet } from './safe-storage'
import { ensureSessionTheme, resetSessionTheme } from './session-theme'

const TOKEN_KEY = 'oms-platform-token'
const USER_KEY = 'oms-platform-user'
const REMEMBER_USERNAME_KEY = 'oms-platform-engineer-remember-username'

function compactUser(user) {
  if (!user || typeof user !== 'object') return null
  const nextUser = { ...user }
  if ('engineerSignature' in nextUser) nextUser.engineerSignature = ''
  return nextUser
}

function readStoredUser() {
  const raw = safeStorageGet(localStorage, USER_KEY, '')
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    safeStorageRemove(localStorage, TOKEN_KEY)
    safeStorageRemove(localStorage, USER_KEY)
    return null
  }
}

export const currentUser = ref(readStoredUser())

export function getToken() {
  return safeStorageGet(localStorage, TOKEN_KEY, '')
}

export function getCurrentUser() {
  currentUser.value = readStoredUser()
  return currentUser.value
}

export function saveSession({ token, user }) {
  safeStorageSet(localStorage, TOKEN_KEY, token)
  ensureSessionTheme({ force: true })
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

export function releaseInteractionLocks() {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) activeElement.blur()
  document.body.style.removeProperty('pointer-events')
}

export function clearSession() {
  releaseInteractionLocks()
  clearOfflineCacheForCurrentSession({ preserveDrafts: true })
  safeStorageRemove(localStorage, TOKEN_KEY)
  safeStorageRemove(localStorage, USER_KEY)
  resetSessionTheme()
  currentUser.value = null
}

export function isLoggedIn() {
  return Boolean(getToken())
}
