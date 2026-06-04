const sameOriginApiBase = `${window.location.origin}/api/v1`

function isLoopbackApiBase(value) {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function normalizeApiBase(value) {
  const resolved = String(value || '').trim().replace(/\/+$/, '')
  if (resolved && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) && isLoopbackApiBase(resolved)) {
    return sameOriginApiBase
  }
  return resolved || sameOriginApiBase
}

export function resolveApiBase() {
  return normalizeApiBase(import.meta.env.VITE_API_BASE_URL)
}
