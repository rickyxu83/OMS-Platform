import { defineStore } from 'pinia'
import { ensureSessionTheme, resetSessionTheme } from '../services/session-theme'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
  },
  actions: {
    setSession({ user }) {
      this.user = user || null
      if (user) {
        ensureSessionTheme({ force: true, user })
      }
    },
    clearSession() {
      this.user = null
      resetSessionTheme()
    },
  },
})
