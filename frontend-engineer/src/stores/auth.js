import { defineStore } from 'pinia'
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../services/safe-storage'
import { ensureSessionTheme, resetSessionTheme } from '../services/session-theme'

const TOKEN_KEY = 'oms-platform-token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: safeStorageGet(localStorage, TOKEN_KEY, ''),
    user: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    setSession({ token, user }) {
      this.token = token
      this.user = user || null
      if (token) {
        safeStorageSet(localStorage, TOKEN_KEY, token)
        ensureSessionTheme({ force: true })
      }
    },
    clearSession() {
      this.token = null
      this.user = null
      safeStorageRemove(localStorage, TOKEN_KEY)
      resetSessionTheme()
    },
  },
})
