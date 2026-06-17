import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import './services/network'
import { ensureSessionTheme } from './services/session-theme'

ensureSessionTheme()
createApp(App).use(createPinia()).use(router).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/'
    const scopePrefix = new URL(base, window.location.origin).toString()

    navigator.serviceWorker
      .getRegistrations()
      .then(async (registrations) => {
        await Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(scopePrefix))
            .map((registration) => registration.unregister()),
        )

        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.filter((key) => key.startsWith('oms-platform-engineer-shell-')).map((key) => caches.delete(key)))
        }

        if (navigator.serviceWorker.controller && !window.__omsPlatformSwCleanupReloaded) {
          window.__omsPlatformSwCleanupReloaded = true
          window.location.reload()
        }
      })
      .catch(() => {})
  })
}
