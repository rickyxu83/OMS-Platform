export function safeStorageGet(storage, key, fallback = null) {
  try {
    const value = storage?.getItem?.(key)
    return value ?? fallback
  } catch {
    return fallback
  }
}

export function safeStorageSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value)
    return true
  } catch {
    return false
  }
}

export function safeStorageRemove(storage, key) {
  try {
    storage?.removeItem?.(key)
  } catch {
    // Ignore storage failures so preview pages remain usable.
  }
}
