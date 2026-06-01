function text(value) {
  return String(value || '').trim()
}

const onsiteServiceTypeLabelMap = {
  install: '现场安装',
  repair: '故障处理',
  maintain: '设备保养',
  inspect: '例行巡检',
  training: '现场培训',
  other: '其他事项',
}

const remoteCategoryLabelMap = {
  排障: '远程排障',
  故障排查: '远程排障',
  远程排障: '远程排障',
  调配: '远程调配',
  配置调整: '远程调配',
  远程调配: '远程调配',
  协调: '远程协调',
  沟通协调: '远程协调',
  远程协调: '远程协调',
  会议: '远程会议',
  会议讨论: '远程会议',
  远程会议: '远程会议',
  其他: '其他事项',
  其他事项: '其他事项',
}

const officeCategoryLabelMap = {
  方案准备: '方案准备',
  文档整理: '文档整理',
  内部会议: '网络会议',
  网络会议: '网络会议',
  培训学习: '培训学习',
  其他: '其他事项',
  其他事项: '其他事项',
}

const remoteCategoryValueMap = {
  远程排障: '排障',
  远程调配: '调配',
  远程协调: '协调',
  远程会议: '会议',
  其他事项: '其他',
}

const officeCategoryValueMap = {
  方案准备: '方案准备',
  文档整理: '文档整理',
  网络会议: '网络会议',
  培训学习: '培训学习',
  其他事项: '其他',
}

export function normalizePreviewServiceMode(record = {}) {
  const rawMode = text(record.serviceMode || 'onsite')
  if (rawMode === 'office') return 'office'
  if (rawMode !== 'remote') return 'onsite'
  return 'remote'
}

export function isOfficePreviewRecord(record = {}) {
  return normalizePreviewServiceMode(record) === 'office'
}

export function isRemotePreviewRecord(record = {}) {
  return normalizePreviewServiceMode(record) === 'remote'
}

export function previewServiceTypeLabel(serviceType) {
  return onsiteServiceTypeLabelMap[text(serviceType)] || text(serviceType) || '其他事项'
}

export function previewTimesheetCategoryLabel(mode, value) {
  const normalizedMode = normalizePreviewServiceMode({ serviceMode: mode })
  const rawValue = text(value)
  if (normalizedMode === 'remote') {
    return remoteCategoryLabelMap[rawValue] || rawValue || '远程排障'
  }
  if (normalizedMode === 'office') {
    return officeCategoryLabelMap[rawValue] || rawValue || '其他事项'
  }
  return previewServiceTypeLabel(value)
}

export function previewTimesheetCategoryValue(mode, value) {
  const normalizedMode = normalizePreviewServiceMode({ serviceMode: mode })
  const rawValue = text(value)
  if (normalizedMode === 'remote') {
    return remoteCategoryValueMap[rawValue] || rawValue || '排障'
  }
  if (normalizedMode === 'office') {
    return officeCategoryValueMap[rawValue] || rawValue || '其他'
  }
  return null
}
