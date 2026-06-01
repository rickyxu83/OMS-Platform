import { ref } from 'vue'
import { resolveApiBase } from './api-base'

const API_BASE = resolveApiBase()

export const isOnline = ref(navigator.onLine)
export const networkCheckedAt = ref('')
let networkWatchTimer = null
let probingNetwork = false

function markChecked() {
  networkCheckedAt.value = new Date().toISOString()
}

export function setNetworkOnline(nextOnline) {
  isOnline.value = nextOnline
  markChecked()
}

function syncOnlineStatus() {
  setNetworkOnline(navigator.onLine)
  probeNetwork()
}

window.addEventListener('online', syncOnlineStatus)
window.addEventListener('offline', syncOnlineStatus)
window.addEventListener('focus', () => probeNetwork())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') probeNetwork()
})

export async function probeNetwork() {
  if (probingNetwork) return isOnline.value
  probingNetwork = true
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      cache: 'no-store',
    })
    setNetworkOnline(response.ok)
    return response.ok
  } catch {
    setNetworkOnline(false)
    return false
  } finally {
    probingNetwork = false
  }
}

export function startNetworkWatch() {
  if (networkWatchTimer) return
  const tick = async () => {
    await probeNetwork()
    const nextDelay = isOnline.value ? 15000 : 5000
    networkWatchTimer = window.setTimeout(tick, nextDelay)
  }
  tick()
}

export function stopNetworkWatch() {
  window.clearTimeout(networkWatchTimer)
  networkWatchTimer = null
}
