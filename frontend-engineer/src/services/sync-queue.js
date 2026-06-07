import { computed, ref } from 'vue'
import { getCurrentUser } from './auth'
import { api } from './api'

const STORAGE_PREFIX = 'oms-platform-engineer-sync-queue'

function storageKey() {
  const user = getCurrentUser()
  return `${STORAGE_PREFIX}:${user?.id || 'anonymous'}`
}

function readQueue() {
  const raw = localStorage.getItem(storageKey())
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    localStorage.removeItem(storageKey())
    return []
  }
}

function writeQueue(items) {
  pendingSyncItems.value = items
  localStorage.setItem(storageKey(), JSON.stringify(items))
}

function createSyncId() {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isConnectivityError(message) {
  const text = String(message || '')
  return text.includes('无法连接服务器') || text.includes('当前离线')
}

export const pendingSyncItems = ref([])
export const syncingPendingReports = ref(false)
export const pendingSyncCount = computed(() => pendingSyncItems.value.length)

export function refreshPendingSyncQueue() {
  pendingSyncItems.value = readQueue()
  return pendingSyncItems.value
}

export function queueSelfReportSync({ mode, orderId = null, payload }) {
  const items = refreshPendingSyncQueue()
  const nextItem = {
    id: createSyncId(),
    mode,
    orderId: mode === 'update' ? Number(orderId) : null,
    payload,
    customerName: payload.customerName || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: '',
  }
  writeQueue([nextItem, ...items])
  return nextItem
}

export function removePendingSyncItem(syncId) {
  writeQueue(refreshPendingSyncQueue().filter((item) => item.id !== String(syncId)))
}

export async function syncPendingSelfReports() {
  if (syncingPendingReports.value) {
    return { total: pendingSyncItems.value.length, success: 0, failed: 0 }
  }

  syncingPendingReports.value = true
  refreshPendingSyncQueue()

  let success = 0
  let failed = 0

  try {
    for (const item of [...pendingSyncItems.value]) {
      try {
        if (item.mode === 'update' && item.orderId) {
          await api.put(`/service-orders/${item.orderId}/self-report`, item.payload)
        } else {
          await api.post('/service-orders/self-report', item.payload)
        }
        removePendingSyncItem(item.id)
        success += 1
      } catch (error) {
        failed += 1
        const items = refreshPendingSyncQueue().map((current) =>
          current.id === item.id
            ? { ...current, updatedAt: new Date().toISOString(), lastError: error.message || '同步失败' }
            : current,
        )
        writeQueue(items)
        if (isConnectivityError(error.message)) break
      }
    }
  } finally {
    syncingPendingReports.value = false
    refreshPendingSyncQueue()
  }

  return { total: success + failed, success, failed }
}

refreshPendingSyncQueue()
