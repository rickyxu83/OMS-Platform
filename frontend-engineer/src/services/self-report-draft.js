import { api } from './api'
import { readOfflineCacheMeta, removeOfflineCache, writeOfflineCache } from './offline-cache'

const CREATE_DRAFT_MODES = ['onsite', 'remote', 'office']

function normalizeOrderId(serviceOrderId) {
  const value = Number(serviceOrderId || 0)
  return value > 0 ? value : null
}

export function normalizeDraftMode(draftMode) {
  return CREATE_DRAFT_MODES.includes(draftMode) ? draftMode : 'onsite'
}

export function createDraftItemId() {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeDraftItemId(draftId) {
  const value = String(draftId || '').trim()
  return value || ''
}

function localDraftKey(serviceOrderId) {
  const orderId = normalizeOrderId(serviceOrderId)
  return orderId ? `oms-platform:draft:account:service-record:${orderId}` : 'oms-platform:draft:account:service-record:new'
}

export function readLocalSelfReportDraft(serviceOrderId) {
  return readOfflineCacheMeta(localDraftKey(serviceOrderId))
}

export function writeLocalSelfReportDraft(serviceOrderId, payload) {
  writeOfflineCache(localDraftKey(serviceOrderId), payload)
}

export function removeLocalSelfReportDraft(serviceOrderId) {
  removeOfflineCache(localDraftKey(serviceOrderId))
}

function deletionTombstone(serviceOrderId) {
  return {
    __draftDeleted: true,
    __draftDeletedAt: new Date().toISOString(),
    __draftScope: normalizeOrderId(serviceOrderId) ? 'edit' : 'create',
  }
}

export async function fetchRemoteSelfReportDraft(serviceOrderId) {
  const orderId = normalizeOrderId(serviceOrderId)
  const query = orderId ? `?serviceOrderId=${orderId}` : ''
  const data = await api.get(`/service-orders/draft/self-report${query}`)
  return data?.item || null
}

export async function saveRemoteSelfReportDraft(serviceOrderId, payload, clientUpdatedAt) {
  await api.put('/service-orders/draft/self-report', {
    serviceOrderId: normalizeOrderId(serviceOrderId),
    payload,
    clientUpdatedAt: clientUpdatedAt || new Date().toISOString(),
  })
}

export async function deleteRemoteSelfReportDraft(serviceOrderId) {
  const orderId = normalizeOrderId(serviceOrderId)
  const query = orderId ? `?serviceOrderId=${orderId}` : ''
  await api.delete(`/service-orders/draft/self-report${query}`)
}

function legacyCreateDraftMode(payload, fallbackMode = 'onsite') {
  const mode = payload?.formMode || payload?.serviceDraft?.serviceMode || fallbackMode
  return normalizeDraftMode(mode)
}

function hasCreateDraftState(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  return Boolean(
    payload.formMode ||
      payload.serviceDraft ||
      payload.selectedCustomer ||
      payload.onsiteDraft ||
      payload.remoteDraft ||
      payload.officeDraft,
  )
}

function normalizeCreateDraftItem(item, fallbackMode = 'onsite') {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null

  const sourcePayload =
    item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? item.payload
      : hasCreateDraftState(item)
        ? item
        : null

  if (!sourcePayload) return null

  const payload = { ...sourcePayload }
  const draftId = normalizeDraftItemId(item.draftId || payload.__draftId) || createDraftItemId()
  const createdAt =
    String(item.createdAt || payload.__draftCreatedAt || payload.__draftClientUpdatedAt || new Date().toISOString()) ||
    new Date().toISOString()
  const updatedAt =
    String(item.updatedAt || payload.__draftClientUpdatedAt || createdAt) ||
    createdAt

  payload.__draftId = draftId
  payload.__draftCreatedAt = createdAt
  payload.formMode = normalizeDraftMode(payload.formMode || payload.serviceDraft?.serviceMode || fallbackMode)

  return {
    draftId,
    createdAt,
    updatedAt,
    payload,
  }
}

function sortCreateDraftItems(items = []) {
  return [...items].sort((left, right) => {
    const time = toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
    if (time !== 0) return time
    return String(right.draftId || '').localeCompare(String(left.draftId || ''))
  })
}

function createDraftBuckets(payload, fallbackMode = 'onsite') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const buckets = payload.__createDraftBuckets
  if (buckets && typeof buckets === 'object' && !Array.isArray(buckets)) {
    return CREATE_DRAFT_MODES.reduce((result, mode) => {
      const bucket = buckets[mode]
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return result
      const rawItems = Array.isArray(bucket.items) ? bucket.items : [bucket]
      const items = sortCreateDraftItems(
        rawItems
          .map((item) => normalizeCreateDraftItem(item, mode))
          .filter(Boolean),
      )
      if (items.length) result[mode] = items
      return result
    }, {})
  }
  if (payload.__draftDeleted) return {}
  if (!hasCreateDraftState(payload)) return {}
  const mode = legacyCreateDraftMode(payload, fallbackMode)
  const item = normalizeCreateDraftItem(payload, mode)
  return item ? { [mode]: [item] } : {}
}

function withCreateDraftBuckets(payload, buckets) {
  const nextBuckets = CREATE_DRAFT_MODES.reduce((result, mode) => {
    const items = sortCreateDraftItems(buckets?.[mode] || [])
    if (!items.length) return result
    result[mode] = {
      items: items.map((item) => ({
        draftId: item.draftId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        payload: item.payload,
      })),
    }
    return result
  }, {})

  if (!Object.keys(nextBuckets).length) return null

  const nextPayload = {
    __createDraftBuckets: nextBuckets,
  }

  if (payload?.__draftDeletedAt) nextPayload.__draftDeletedAt = payload.__draftDeletedAt
  if (payload?.__draftScope) nextPayload.__draftScope = payload.__draftScope
  return nextPayload
}

function isDeletedDraftPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  if (!payload.__draftDeleted) return false
  return !Object.keys(createDraftBuckets(payload)).length
}

export function listCreateDraftBuckets(payload) {
  const buckets = createDraftBuckets(payload)
  return sortCreateDraftItems(
    CREATE_DRAFT_MODES.flatMap((mode) =>
      (buckets[mode] || []).map((item) => ({
        mode,
        draftId: item.draftId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        payload: item.payload,
      })),
    ),
  )
}

export function extractScopedDraftPayload(payload, serviceOrderId, draftMode, draftId = '') {
  if (normalizeOrderId(serviceOrderId)) return payload || null
  const items = createDraftBuckets(payload, draftMode)[normalizeDraftMode(draftMode)] || []
  const normalizedDraftId = normalizeDraftItemId(draftId)
  if (normalizedDraftId) {
    return items.find((item) => item.draftId === normalizedDraftId)?.payload || null
  }
  return items[0]?.payload || null
}

export function mergeScopedDraftPayload(existingPayload, serviceOrderId, draftMode, nextPayload, clientUpdatedAt = '', draftId = '') {
  if (normalizeOrderId(serviceOrderId)) return nextPayload
  const mode = normalizeDraftMode(draftMode)
  const buckets = createDraftBuckets(existingPayload, mode)
  const items = [...(buckets[mode] || [])]
  const normalizedDraftId = normalizeDraftItemId(draftId || nextPayload?.__draftId) || createDraftItemId()
  const existingItem = items.find((item) => item.draftId === normalizedDraftId)
  const createdAt =
    existingItem?.createdAt ||
    String(nextPayload?.__draftCreatedAt || clientUpdatedAt || new Date().toISOString())
  const payload = {
    ...(nextPayload && typeof nextPayload === 'object' && !Array.isArray(nextPayload) ? nextPayload : {}),
    __draftId: normalizedDraftId,
    __draftCreatedAt: createdAt,
    formMode: normalizeDraftMode(nextPayload?.formMode || nextPayload?.serviceDraft?.serviceMode || mode),
  }
  const nextItem = normalizeCreateDraftItem(
    {
      draftId: normalizedDraftId,
      createdAt,
      updatedAt: clientUpdatedAt || payload.__draftClientUpdatedAt || new Date().toISOString(),
      payload,
    },
    mode,
  )
  const nextItems = items.filter((item) => item.draftId !== normalizedDraftId)
  if (nextItem) nextItems.push(nextItem)
  buckets[mode] = nextItems
  const merged = withCreateDraftBuckets(existingPayload, buckets)
  if (!merged) return null
  if (clientUpdatedAt) merged.__draftClientUpdatedAt = clientUpdatedAt
  return merged
}

export function removeScopedDraftPayload(existingPayload, serviceOrderId, draftMode, draftId = '') {
  if (normalizeOrderId(serviceOrderId)) return null
  const mode = normalizeDraftMode(draftMode)
  const buckets = createDraftBuckets(existingPayload, mode)
  const normalizedDraftId = normalizeDraftItemId(draftId)
  if (!normalizedDraftId) delete buckets[mode]
  else buckets[mode] = (buckets[mode] || []).filter((item) => item.draftId !== normalizedDraftId)
  return withCreateDraftBuckets(existingPayload, buckets)
}

export async function clearSelfReportDraft(serviceOrderId, draftMode = '', draftId = '') {
  const orderId = normalizeOrderId(serviceOrderId)
  if (!orderId && draftMode) {
    const localDraft = readLocalSelfReportDraft(null)
    const nextLocalPayload = removeScopedDraftPayload(localDraft?.data, null, draftMode, draftId)
    if (nextLocalPayload) writeLocalSelfReportDraft(null, nextLocalPayload)
    else removeLocalSelfReportDraft(null)

    try {
      const remoteDraft = await fetchRemoteSelfReportDraft(null)
      const nextRemotePayload = removeScopedDraftPayload(remoteDraft?.payload, null, draftMode, draftId)
      if (nextRemotePayload) {
        await saveRemoteSelfReportDraft(null, nextRemotePayload, new Date().toISOString())
      } else {
        await deleteRemoteSelfReportDraft(null)
      }
    } catch {
      // Keep preview interactions responsive when offline.
    }
    return
  }

  removeLocalSelfReportDraft(serviceOrderId)
  try {
    if (orderId) await saveRemoteSelfReportDraft(serviceOrderId, deletionTombstone(serviceOrderId))
    else await deleteRemoteSelfReportDraft(null)
  } catch {
    // Keep preview interactions responsive when offline.
  }
}

function toTimestamp(value) {
  const time = Date.parse(String(value || ''))
  return Number.isFinite(time) ? time : 0
}

export function pickPreferredDraft({ localDraft, remoteDraft }) {
  const localTime = toTimestamp(localDraft?.data?.__draftClientUpdatedAt || localDraft?.updatedAt)
  const remoteTime = toTimestamp(remoteDraft?.clientUpdatedAt || remoteDraft?.updatedAt)
  const remoteDeleted = isDeletedDraftPayload(remoteDraft?.payload)
  const remoteDeletedAt = toTimestamp(remoteDraft?.payload?.__draftDeletedAt || remoteDraft?.clientUpdatedAt || remoteDraft?.updatedAt)

  // Prefer preserving local user-entered data over propagating a delete tombstone.
  if (localDraft?.data) {
    if (!remoteDeleted && remoteTime > localTime) {
      return {
        source: 'remote',
        payload: remoteDraft?.payload || null,
        updatedAt: remoteDraft?.clientUpdatedAt || remoteDraft?.updatedAt || '',
        label: '已恢复账号草稿',
      }
    }
    return {
      source: 'local',
      payload: localDraft.data,
      updatedAt: localDraft?.data?.__draftClientUpdatedAt || localDraft?.updatedAt || '',
      label: '已恢复本机草稿',
    }
  }

  if (remoteDeleted && remoteDeletedAt >= localTime) {
    return {
      source: 'remote_deleted',
      payload: null,
      updatedAt: remoteDraft?.payload?.__draftDeletedAt || remoteDraft?.clientUpdatedAt || remoteDraft?.updatedAt || '',
      label: '账号草稿已删除',
    }
  }
  if (remoteTime > localTime) {
    return {
      source: 'remote',
      payload: remoteDraft?.payload || null,
      updatedAt: remoteDraft?.clientUpdatedAt || remoteDraft?.updatedAt || '',
      label: '已恢复账号草稿',
    }
  }
  if (remoteDraft?.payload) {
    return {
      source: 'remote',
      payload: remoteDraft.payload,
      updatedAt: remoteDraft?.clientUpdatedAt || remoteDraft?.updatedAt || '',
      label: '已恢复账号草稿',
    }
  }
  return null
}
