import { ref } from 'vue'
import { safeStorageGet, safeStorageSet } from './safe-storage'

const AI_DRAFT_ENABLED_KEY = 'oms-platform:engineer:ai-draft-enabled'

function readBooleanPreference(key, fallback = true) {
  const storage = typeof window === 'undefined' ? null : window.localStorage
  const value = safeStorageGet(storage, key, fallback ? '1' : '0')
  return value !== '0'
}

export const aiDraftEnabled = ref(readBooleanPreference(AI_DRAFT_ENABLED_KEY, true))

export function setAiDraftEnabled(enabled) {
  const next = Boolean(enabled)
  aiDraftEnabled.value = next
  const storage = typeof window === 'undefined' ? null : window.localStorage
  safeStorageSet(storage, AI_DRAFT_ENABLED_KEY, next ? '1' : '0')
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== AI_DRAFT_ENABLED_KEY) return
    aiDraftEnabled.value = event.newValue !== '0'
  })
}
