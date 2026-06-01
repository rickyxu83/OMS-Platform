import { defineStore } from 'pinia'

const TOKEN_KEY = 'service-sheet-rc-admin-token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    setSession({ token, user }) {
      this.token = token
      this.user = user || null
      if (token) localStorage.setItem(TOKEN_KEY, token)
    },
    clearSession() {
      this.token = null
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
