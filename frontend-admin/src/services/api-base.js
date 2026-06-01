const sameOriginApiBase = `${window.location.origin}/api/v1`

function normalizeApiBase(value) {
  const resolved = String(value || '').trim().replace(/\/+$/, '')
  return resolved || sameOriginApiBase
}

export function resolveApiBase() {
  return normalizeApiBase(import.meta.env.VITE_API_BASE_URL)
}
