function text(value) {
  return String(value || '').trim()
}

export function normalizePreviewServiceMode(record = {}) {
  const rawMode = text(record.serviceMode || 'onsite')
  if (rawMode === 'office') return 'office'
  if (rawMode !== 'remote') return 'onsite'
  return 'remote'
}
