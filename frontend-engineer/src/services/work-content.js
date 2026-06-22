const collaborativeAckMarker = '⁣⁤⁣'
const commonWorkLabels = new Set(['共同内容', '共同处理', '公共内容'])

function stripCollaborativeAckMarker(value) {
  return String(value || '').split(collaborativeAckMarker).join('')
}

function normalizeWorkLabel(value) {
  return String(value || '').replace(/\s/g, '').trim()
}

function addLabel(labels, value) {
  const label = normalizeWorkLabel(value)
  if (label) labels.add(label)
}

function workContentLabels(report = {}, item = {}) {
  const labels = new Set([...commonWorkLabels, '工程师'])
  ;(item.engineers || []).forEach((engineer) => {
    addLabel(labels, engineer.realName)
    addLabel(labels, engineer.name)
    addLabel(labels, engineer.username)
  })
  ;(report.workEntries || []).forEach((entry) => {
    addLabel(labels, entry.engineerName)
    addLabel(labels, entry.engineer_name)
    addLabel(labels, entry.engineerUsername)
    addLabel(labels, entry.engineer_username)
  })
  return labels
}

function extractCommonWorkContent(value, labels) {
  const lines = stripCollaborativeAckMarker(value).split(/\r?\n/)
  const kept = []
  let collecting = false
  for (const line of lines) {
    const headingMatch = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.*)$/)
    const label = headingMatch ? normalizeWorkLabel(headingMatch[1]) : ''
    if (headingMatch && commonWorkLabels.has(label)) {
      collecting = true
      if (headingMatch[2]) kept.push(headingMatch[2])
      continue
    }
    if (headingMatch && collecting && labels.has(label)) {
      collecting = false
    }
    if (collecting) kept.push(line)
  }
  return kept.join('\n').trim()
}

function stripKnownWorkLabels(value, labels) {
  const lines = []
  for (const line of stripCollaborativeAckMarker(value).split(/\r?\n/)) {
    const headingMatch = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.*)$/)
    const label = headingMatch ? normalizeWorkLabel(headingMatch[1]) : ''
    if (headingMatch && labels.has(label)) {
      if (headingMatch[2]) lines.push(headingMatch[2])
      continue
    }
    lines.push(line)
  }
  return lines.join('\n').trim()
}

export function displayReportWorkContent(report, item = {}) {
  const labels = workContentLabels(report || {}, item || {})
  const common = extractCommonWorkContent(report?.workContent || '', labels)
  const entries = Array.isArray(report?.workEntries) ? report.workEntries : []
  const filled = entries
    .map((entry) => stripCollaborativeAckMarker(entry?.workContent || entry?.work_content || '').trim())
    .filter(Boolean)

  if (common || filled.length) return [common, ...filled].filter(Boolean).join('\n')
  return stripKnownWorkLabels(report?.workContent || '', labels)
}

function servicePartActionLabel(value) {
  if (value === 'replacement') return '配件更换'
  if (value === 'installation') return '配件安装'
  return '配件记录'
}

function servicePartQuantity(part) {
  const quantityText = String(part?.quantity ?? '').trim()
  const numeric = Number(quantityText)
  const quantity = quantityText && Number.isFinite(numeric) ? String(numeric) : quantityText
  return [quantity, String(part?.unit || '').trim()].filter(Boolean).join('')
}

export function displayServiceParts(parts = []) {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => {
      const action = servicePartActionLabel(part?.actionType || part?.action_type)
      const name = String(part?.partName || part?.part_name || '').trim()
      const details = [
        part?.deviceName || part?.device_name ? `设备 ${part.deviceName || part.device_name}` : '',
        part?.partNo || part?.part_no ? `PN ${part.partNo || part.part_no}` : '',
        servicePartQuantity(part) ? `数量 ${servicePartQuantity(part)}` : '',
        part?.remark ? String(part.remark).trim() : '',
      ].filter(Boolean)
      return `${action} ${name || '未命名配件'}${details.length ? `（${details.join('，')}）` : ''}`
    })
    .filter(Boolean)
    .join('\n')
}
