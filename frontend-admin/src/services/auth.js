import { ref } from 'vue'

const TOKEN_KEY = 'service-sheet-rc-admin-token'
const USER_KEY = 'service-sheet-rc-admin-user'
const REMEMBER_USERNAME_KEY = 'service-sheet-rc-admin-remember-username'
const REMEMBER_PASSWORD_KEY = 'service-sheet-rc-admin-remember-password'

function readStoredValue(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

function getActiveStorage() {
  return sessionStorage.getItem(TOKEN_KEY) && !localStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage
}

function readStoredUser() {
  const raw = readStoredValue(USER_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    clearStoredSession()
    return null
  }
}

export const currentUser = ref(readStoredUser())

export function getToken() {
  return readStoredValue(TOKEN_KEY)
}

export function getCurrentUser() {
  currentUser.value = readStoredUser()
  return currentUser.value
}

export function saveSession({ token, user }, remember = true) {
  const storage = remember ? localStorage : sessionStorage
  clearStoredSession()
  storage.setItem(TOKEN_KEY, token)
  if (user) {
    storage.setItem(USER_KEY, JSON.stringify(user))
    currentUser.value = user
  }
}

export function loadRememberedCredentials() {
  return {
    username: localStorage.getItem(REMEMBER_USERNAME_KEY) || '',
    password: localStorage.getItem(REMEMBER_PASSWORD_KEY) || '',
  }
}

export function saveRememberedCredentials({ username = '', password = '' }, rememberPassword) {
  if (rememberPassword) {
    localStorage.setItem(REMEMBER_USERNAME_KEY, username)
    localStorage.setItem(REMEMBER_PASSWORD_KEY, password)
    return
  }

  localStorage.removeItem(REMEMBER_USERNAME_KEY)
  localStorage.removeItem(REMEMBER_PASSWORD_KEY)
}

export function saveUser(user) {
  if (!user) {
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(USER_KEY)
    currentUser.value = null
    return
  }
  const storage = getActiveStorage()
  storage.setItem(USER_KEY, JSON.stringify(user))
  if (storage === localStorage) sessionStorage.removeItem(USER_KEY)
  if (storage === sessionStorage) localStorage.removeItem(USER_KEY)
  currentUser.value = user
}

export function clearSession() {
  clearStoredSession()
  currentUser.value = null
}

export function isLoggedIn() {
  return Boolean(getToken())
}
