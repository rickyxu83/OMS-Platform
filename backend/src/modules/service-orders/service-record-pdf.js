const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

// 导出抬头 logo，与工程师端分享图同一张 export-logo.png；只读取一次。
const LOGO_PATH = path.join(__dirname, 'assets', 'export-logo.png')
let logoBufferCache
function getLogoBuffer() {
  if (logoBufferCache === undefined) {
    try {
      logoBufferCache = fs.readFileSync(LOGO_PATH)
    } catch {
      logoBufferCache = null
    }
  }
  return logoBufferCache
}

const FONT_CANDIDATES = [
  { path: process.env.PDF_CJK_FONT, family: process.env.PDF_CJK_FONT_FAMILY },
  // Alpine font-noto-cjk 实际安装路径
  { path: '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKsc-Regular' },
  { path: '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKsc-Regular' },
  { path: '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKtc-Regular' },
  { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKsc-Regular' },
  { path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKsc-Regular' },
  { path: '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc', family: 'WenQuanYiZenHei' },
  { path: '/System/Library/Fonts/Supplemental/Arial Unicode.ttf' },
  { path: '/Library/Fonts/Arial Unicode.ttf' },
  { path: '/System/Library/Fonts/STHeiti Medium.ttc', family: 'STHeitiSC-Medium' },
].filter((candidate) => candidate.path)

function fileExists(candidate) {
  try {
    return fs.existsSync(candidate)
  } catch {
    return false
  }
}

function registerCandidateFont(doc, candidate) {
  if (!candidate?.path || !fileExists(candidate.path)) return false
  try {
    doc.registerFont('CJK', candidate.path, candidate.family)
    doc.font('CJK')
    return true
  } catch {
    return false
  }
}

function registerFonts(doc) {
  const ok = FONT_CANDIDATES.some((candidate) => registerCandidateFont(doc, candidate))
  if (!ok) return { regular: 'Helvetica', bold: 'Helvetica-Bold' }
  return { regular: 'CJK', bold: 'CJK' }
}

function cleanText(value, fallback = '-') {
  const text = String(value || '').trim()
  return text || fallback
}

function formatDateTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16) || ''
}

function resultDisplay(item) {
  const raw = String(item.report?.result || item.result || '').trim().toLowerCase()
  if (['resolved', 'done', 'completed', 'complete', 'finished', 'success'].includes(raw)) return '已完成'
  if (['unresolved', 'not_resolved', 'incomplete', 'failed'].includes(raw)) return '未完成'
  if (['follow_up_required', 'pending', 'processing', 'in_progress', 'follow_up'].includes(raw)) return '待跟进'
  return '已完成'
}

function serviceMode(item) {
  return String(item.serviceMode || item.service_mode || 'onsite').trim() || 'onsite'
}

function isRemoteSheet(item) {
  return serviceMode(item) === 'remote'
}

function isOfficeSheet(item) {
  return serviceMode(item) === 'office'
}

function contactDisplay(item) {
  const name = item.contactName || item.report?.customerName || item.report?.customerConfirmName || ''
  const phone = item.contactPhone || ''
  if (name && phone) return `${name} / ${phone}`
  return name || phone || '-'
}

function officeCategoryDisplay(item) {
  const category = String(item.timesheetCategory || item.timesheet_category || item.serviceCategory || '').trim()
  return category || '其他事项'
}

function serviceTypeLabel(value) {
  const labels = {
    install: '安装',
    repair: '排障',
    maintain: '调优',
    inspect: '巡检',
    training: '培训',
    remote: '远程支持',
    other: '其他',
  }
  const key = String(value || '').trim()
  return labels[key] || key || ''
}

function engineerNames(item) {
  const names = (item.engineers || []).map((engineer) => engineer.realName || engineer.name || engineer.username).filter(Boolean)
  return names.join('、') || item.engineerName || ''
}

const COLLAB_ACK_MARKER = '⁣⁤⁣'
const COMMON_WORK_LABELS = new Set(['共同内容', '共同处理', '公共内容'])

function stripAckMarker(value) {
  return String(value || '').split(COLLAB_ACK_MARKER).join('')
}

function normalizeWorkLabel(value) {
  return String(value || '').replace(/\s/g, '').trim()
}

function addWorkLabel(labels, value) {
  const label = normalizeWorkLabel(value)
  if (label) labels.add(label)
}

function workContentLabels(report = {}, item = {}) {
  const labels = new Set([...COMMON_WORK_LABELS, '工程师'])
  ;(item.engineers || []).forEach((engineer) => {
    addWorkLabel(labels, engineer.realName)
    addWorkLabel(labels, engineer.name)
    addWorkLabel(labels, engineer.username)
  })
  ;(report.workEntries || []).forEach((entry) => {
    addWorkLabel(labels, entry.engineerName)
    addWorkLabel(labels, entry.engineer_name)
    addWorkLabel(labels, entry.engineerUsername)
    addWorkLabel(labels, entry.engineer_username)
  })
  return labels
}

function extractCommonWorkContent(value, labels) {
  const lines = stripAckMarker(value).split(/\r?\n/)
  const kept = []
  let collecting = false
  for (const line of lines) {
    const headingMatch = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.*)$/)
    const label = headingMatch ? normalizeWorkLabel(headingMatch[1]) : ''
    if (headingMatch && COMMON_WORK_LABELS.has(label)) {
      collecting = true
      if (headingMatch[2]) kept.push(headingMatch[2])
      continue
    }
    if (headingMatch && collecting && labels.has(label)) collecting = false
    if (collecting) kept.push(line)
  }
  return kept.join('\n').trim()
}

function stripKnownWorkLabels(value, labels) {
  const lines = []
  for (const line of stripAckMarker(value).split(/\r?\n/)) {
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

function exportWorkContent(report, item) {
  const labels = workContentLabels(report || {}, item || {})
  const common = extractCommonWorkContent(report?.workContent || '', labels)
  const entries = Array.isArray(report?.workEntries) ? report.workEntries : []
  const filled = entries
    .map((entry) => stripAckMarker(entry?.workContent || entry?.work_content || '').trim())
    .filter(Boolean)
  if (common || filled.length) return [common, ...filled].filter(Boolean).join('\n')
  return stripKnownWorkLabels(report?.workContent || '', labels)
}

function servicePartActionLabel(value) {
  if (value === 'replacement') return '备件更换'
  if (value === 'installation') return '硬件部件安装'
  return '部件记录'
}

function remoteCategoryLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('远程')) return text
  const labels = {
    排障: '远程排障',
    调配: '远程调配',
    协调: '远程协调',
    会议: '远程会议',
    培训: '远程培训',
    其他: '远程其他',
  }
  return labels[text] || text
}

function servicePartHasContent(part = {}) {
  return Boolean(
    String(part.partName || part.part_name || '').trim()
      || String(part.partNo || part.part_no || '').trim()
      || String(part.remark || '').trim(),
  )
}

function serviceItemsContent(item = {}) {
  const mode = serviceMode(item)
  const labels = []
  if (mode === 'office') {
    labels.push(officeCategoryDisplay(item) || '内勤')
  } else if (mode === 'remote') {
    labels.push(remoteCategoryLabel(item.timesheetCategory || item.timesheet_category) || '远程')
  } else {
    labels.push(serviceTypeLabel(item.serviceType || item.service_type) || '现场')
  }

  const parts = Array.isArray(item.parts) ? item.parts.filter(servicePartHasContent) : []
  const actions = parts.map((part) => String(part.actionType || part.action_type || '').trim())
  if (actions.includes('replacement')) labels.push('备件更换')
  if (actions.includes('installation')) labels.push('硬件部件安装')
  if (parts.some((part) => !['replacement', 'installation'].includes(String(part.actionType || part.action_type || '').trim()))) {
    labels.push('部件记录')
  }

  return [...new Set(labels.filter(Boolean))].join(' + ') || '-'
}

function servicePartQuantity(part) {
  const quantityText = String(part?.quantity ?? '').trim()
  const numeric = Number(quantityText)
  const quantity = quantityText && Number.isFinite(numeric) ? String(numeric) : quantityText
  return [quantity, String(part?.unit || '').trim()].filter(Boolean).join('')
}

function servicePartsContent(parts = []) {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => {
      const details = [
        part.deviceName || part.device_name ? `设备 ${part.deviceName || part.device_name}` : '',
        part.partNo || part.part_no ? `PN ${part.partNo || part.part_no}` : '',
        servicePartQuantity(part) ? `数量 ${servicePartQuantity(part)}` : '',
        part.remark ? String(part.remark).trim() : '',
      ].filter(Boolean)
      return `${servicePartActionLabel(part.actionType || part.action_type)} ${part.partName || part.part_name || '未命名部件'}${details.length ? `（${details.join('，')}）` : ''}`
    })
    .filter(Boolean)
    .join('\n')
}

function dataUrlToImageBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return null
  const buffer = Buffer.from(match[1], 'base64')
  return buffer.length ? buffer : null
}

function drawSignatureImage(doc, dataUrl, x, y, width, height) {
  const buffer = dataUrlToImageBuffer(dataUrl)
  if (!buffer) return false
  try {
    doc.image(buffer, x * SCALE, y * SCALE, { fit: [width * SCALE, height * SCALE], align: 'center', valign: 'center' })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 下面的绘制以工程师端分享图(TaskShareView.vue 的 SVG)为标准，在 794×1123 的
// 坐标系里 1:1 复刻，再通过全局缩放映射到 A4，保证两端版式一致。
// ---------------------------------------------------------------------------

// 工程师端 SVG 用 794×1123 画布；这里所有坐标仍按该画布书写，由各绘制原语
// 统一乘以 SCALE 映射到 A4(595.28×841.89 pt)。不用 doc.scale() 是因为 pdfkit 的
// 文本自动换页判断按未变换的原始 y 比较页高，CTM 缩放会触发误换页。
const SCALE = 595.28 / 794
// SVG <text> 的 y 是基线，pdfkit 的 y 是文字顶部，按字号比例换算。
const ASCENT_RATIO = 0.8

function fillRect(doc, x, y, w, h, { rx = 0, fill, stroke } = {}) {
  const rxS = rx * SCALE
  if (rxS > 0) doc.roundedRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE, rxS)
  else doc.rect(x * SCALE, y * SCALE, w * SCALE, h * SCALE)
  if (fill && stroke) doc.fillAndStroke(fill, stroke)
  else if (fill) doc.fill(fill)
  else if (stroke) doc.stroke(stroke)
}

function strokeLine(doc, x1, y1, x2, y2, { stroke = '#e2e8f0', width = 1 } = {}) {
  doc.moveTo(x1 * SCALE, y1 * SCALE).lineTo(x2 * SCALE, y2 * SCALE).lineWidth(width * SCALE).strokeColor(stroke).stroke()
}

function fillCircle(doc, cx, cy, r, color) {
  doc.circle(cx * SCALE, cy * SCALE, r * SCALE).fill(color)
}

function text(doc, fonts, content, x, baselineY, opts = {}) {
  const { size = 16, color = '#111827', anchor = 'start', boxWidth = 400, ellipsis = false } = opts
  const sizeS = size * SCALE
  doc.font(fonts.bold).fontSize(sizeS).fillColor(color)
  const top = (baselineY - size * ASCENT_RATIO) * SCALE
  const xS = x * SCALE
  const boxW = boxWidth * SCALE
  if (anchor === 'middle') {
    doc.text(String(content), xS - boxW / 2, top, { width: boxW, align: 'center', lineBreak: false })
  } else if (anchor === 'end') {
    doc.text(String(content), xS - boxW, top, { width: boxW, align: 'right', lineBreak: false })
  } else if (ellipsis) {
    doc.text(String(content), xS, top, { width: boxW, height: sizeS * 1.6, ellipsis: true })
  } else {
    doc.text(String(content), xS, top, { lineBreak: false })
  }
}

function splitByPdfWidth(doc, fonts, value, maxWidth, size) {
  const chunks = []
  let line = ''
  const maxWidthS = maxWidth * SCALE
  doc.font(fonts.bold).fontSize(size * SCALE)
  for (const char of Array.from(String(value || ''))) {
    const next = line + char
    if (line && doc.widthOfString(next) > maxWidthS) {
      chunks.push(line)
      line = char
      continue
    }
    line = next
  }
  if (line) chunks.push(line)
  return chunks
}

function textLines(doc, fonts, value, x, baselineY, { maxChars, maxWidth, maxLines, lineHeight = 30, size = 16, color = '#1f2937' }) {
  const lines = []
  const width = maxWidth || maxChars * 12
  for (const rawLine of String(value || '').split(/\n/)) {
    const line = rawLine.trim()
    if (!line) lines.push('')
    else lines.push(...splitByPdfWidth(doc, fonts, line, width, size))
  }
  lines.slice(0, maxLines).forEach((line, index) => {
    if (!line) return
    text(doc, fonts, line, x, baselineY + index * lineHeight, { size, color })
  })
}

function drawEngineerSignatures(doc, fonts, item, { x, y, width, height }) {
  const signatures = (item.engineers || []).filter((engineer) => engineer.engineerSignature).slice(0, 5)
  if (!signatures.length) {
    text(doc, fonts, engineerNames(item) || '待补签', x + width / 2, y + height / 2 + 6, {
      size: 16,
      color: '#0f172a',
      anchor: 'middle',
      boxWidth: width,
    })
    return
  }
  const signatureWidth = Math.max(56, Math.floor(width / signatures.length))
  signatures.forEach((engineer, index) => {
    drawSignatureImage(doc, engineer.engineerSignature, x + index * signatureWidth, y, signatureWidth - 6, height)
  })
}

function drawRemoteEngineerSignatures(doc, fonts, item, { x, y, width, height }) {
  const signatures = (item.engineers || []).filter((engineer) => engineer.engineerSignature).slice(0, 4)
  if (!signatures.length) {
    text(doc, fonts, engineerNames(item) || '待补签', x + 6, y + height - 6, { size: 20, color: '#0f172a' })
    return
  }
  const signatureWidth = Math.max(82, Math.floor(width / signatures.length))
  signatures.forEach((engineer, index) => {
    drawSignatureImage(doc, engineer.engineerSignature, x + index * signatureWidth, y, signatureWidth - 6, height)
  })
}

function drawSheet(doc, fonts, item, logoImage) {
  const report = item.report || {}
  const remote = isRemoteSheet(item)
  const actualStart = formatDateTime(report.actualStartAt || item.plannedStartAt)
  const actualEnd = formatDateTime(report.actualEndAt || item.plannedEndAt)
  const departure = formatDateTime(report.departureAt) || '—'
  const returned = formatDateTime(report.returnAt) || '—'
  const finishedDate = formatDateTime(report.actualEndAt || item.submittedAt || item.updatedAt || item.createdAt).slice(0, 10)
  const summaryText = cleanText(item.issueDescription || item.problemDescription || '', '未填写问题描述')
  const workContent = exportWorkContent(report, item) || '未填写处理记录'
  const partContent = servicePartsContent(item.parts)
  const workRecord = [workContent, partContent ? `备件与硬件部件：\n${partContent}` : ''].filter(Boolean).join('\n')
  const titleText = remote ? '远程服务记录单' : '技术服务记录单'
  const recordLabel = remote ? '工作内容' : '服务内容'
  const resultLabel = remote ? '处理结果' : '服务结论'
  const resultStatus = cleanText(resultDisplay(item), '已完成')
  const resultDescription = String(report.resultDescription || item.resultDescription || '').trim()

  const primary = '#6b3fa0'
  const line = '#e7def3'
  const secondary = '#7f5ab5'

  const summaryY = 318
  const summaryTextY = 386
  const recordBoxY = 438
  const recordBoxHeight = remote ? 340 : 380
  const recordContentStartY = remote ? recordBoxY + 52 : recordBoxY + 60
  const recordLineHeight = 26
  const recordMaxLines = remote ? 7 : 8
  const resultDividerY = remote ? recordBoxY + 220 : recordBoxY + 258
  const resultStatusY = resultDividerY + 34
  const resultDetailY = resultStatusY + 28
  const resultMaxLines = 2
  const resultGuideLines = remote ? [58, 86] : [56, 84]
  const timeSummaryY = recordBoxY + recordBoxHeight + 18
  const signatureBaseY = timeSummaryY + 138
  const footerY = remote ? 1088 : 1082
  const recordGuideLines = remote ? [76, 102, 128, 154, 180, 206, 232] : [76, 102, 128, 154, 180, 206, 232, 258]

  // 外框
  fillRect(doc, 0, 0, 794, 1123, { fill: '#ffffff' })
  fillRect(doc, 30, 28, 734, 1067, { rx: 16, fill: '#ffffff', stroke: '#e2e8f0' })

  // 抬头：logo(与工程师端同一张) + 标题；logo 不可用时回退公司名文字
  if (logoImage) {
    try {
      doc.image(logoImage, 68 * SCALE, 58 * SCALE, { fit: [330 * SCALE, 53 * SCALE], align: 'left', valign: 'center' })
    } catch {
      text(doc, fonts, '敦阳（宁波）科技有限公司', 68, 88, { size: 18, color: '#0f766e' })
    }
  } else {
    text(doc, fonts, '敦阳（宁波）科技有限公司', 68, 88, { size: 18, color: '#0f766e' })
  }
  text(doc, fonts, titleText, 750, 92, { size: 31, color: '#111827', anchor: 'end', boxWidth: 560 })
  strokeLine(doc, 68, 130, 750, 130, { stroke: primary, width: 2.2 })
  strokeLine(doc, 68, 135, 750, 135, { stroke: line, width: 1 })

  // 基本信息单元格
  const cell = (x, y, w, labelW, label, value, valuePad = 12) => {
    fillRect(doc, x, y, w, 46, { fill: '#ffffff', stroke: '#d6dee8' })
    fillRect(doc, x, y, labelW, 46, { fill: '#f8fafc', stroke: '#d6dee8' })
    text(doc, fonts, label, x + 16, y + 29, { size: 14, color: '#1f2937' })
    text(doc, fonts, cleanText(value), x + labelW + 18, y + 29, {
      size: 15,
      color: '#0f172a',
      ellipsis: true,
      boxWidth: x + w - (x + labelW + 18) - valuePad,
    })
  }
  cell(68, 158, 390, 122, '客户名称', item.customerName)
  cell(458, 158, 292, 102, '联系人', contactDisplay(item))
  cell(68, 204, 390, 122, 'Case号', item.orderNo || item.id || '-')
  cell(458, 204, 292, 102, '填写日期', cleanText(finishedDate, '-'))
  cell(68, 250, 422, 122, '地址', cleanText(item.customerAddress, remote ? '远程服务未填写地址' : '-'))
  cell(490, 250, 260, 102, '服务事项', serviceItemsContent(item))

  // 问题描述
  fillRect(doc, 68, summaryY, 682, 108, { rx: 12, fill: '#f8fafc', stroke: '#d6dee8' })
  text(doc, fonts, '问题描述', 92, summaryY + 34, { size: 15.5, color: '#0f172a' })
  textLines(doc, fonts, summaryText, 92, summaryTextY, { maxWidth: 634, maxChars: 66, maxLines: 2, lineHeight: 30 })

  // 服务内容 / 工作内容 + 服务结论 / 处理结果
  fillRect(doc, 68, recordBoxY, 682, recordBoxHeight, { rx: 12, fill: '#ffffff', stroke: '#d6dee8' })
  fillRect(doc, 68, recordBoxY, 138, recordBoxHeight, { rx: 12, fill: '#f8fafc', stroke: '#d6dee8' })
  fillRect(doc, 196, recordBoxY, 10, recordBoxHeight, { fill: '#f8fafc' })
  text(doc, fonts, recordLabel, 88, recordBoxY + 36, { size: 15.5, color: '#0f172a' })
  recordGuideLines.forEach((offset) => strokeLine(doc, 226, recordBoxY + offset, 726, recordBoxY + offset, { stroke: '#e2e8f0', width: 1 }))
  textLines(doc, fonts, workRecord, 226, recordContentStartY, { maxWidth: 500, maxChars: 41, maxLines: recordMaxLines, lineHeight: recordLineHeight })
  strokeLine(doc, 206, resultDividerY, 726, resultDividerY, { stroke: line, width: 1.4 })
  text(doc, fonts, resultLabel, 88, resultStatusY, { size: 14, color: primary })
  text(doc, fonts, resultStatus, 226, resultStatusY, { size: 15, color: '#0f172a' })
  resultGuideLines.forEach((offset) => strokeLine(doc, 226, resultDividerY + offset, 726, resultDividerY + offset, { stroke: '#e2e8f0', width: 1 }))
  if (resultDescription) {
    textLines(doc, fonts, resultDescription, 226, resultDetailY, { maxWidth: 500, maxChars: 41, maxLines: resultMaxLines, lineHeight: 26 })
  } else {
    text(doc, fonts, '已记录本次服务结果，可直接分享留底。', 226, resultDetailY, { size: 13, color: '#334155' })
  }

  // 时间轴
  fillRect(doc, 68, timeSummaryY, 682, 112, { rx: 12, fill: '#ffffff', stroke: '#d6dee8' })
  if (remote) {
    strokeLine(doc, 337, timeSummaryY + 44, 469, timeSummaryY + 44, { stroke: line, width: 1.4 })
    text(doc, fonts, '→', 403, timeSummaryY + 49, { size: 16, color: secondary, anchor: 'middle', boxWidth: 40 })
    const remoteSteps = [
      [191, 275, '01', '开始时间', actualStart],
      [531, 615, '02', '结束时间', actualEnd],
    ]
    remoteSteps.forEach(([cx, labelX, idx, label, value]) => {
      fillCircle(doc, cx, timeSummaryY + 44, 14, primary)
      text(doc, fonts, idx, cx, timeSummaryY + 49, { size: 12, color: '#ffffff', anchor: 'middle', boxWidth: 28 })
      text(doc, fonts, label, labelX, timeSummaryY + 49, { size: 14, color: '#1f2937', anchor: 'middle', boxWidth: 130 })
      text(doc, fonts, cleanText(value), labelX, timeSummaryY + 98, { size: 13, color: '#334155', anchor: 'middle', boxWidth: 150 })
    })
  } else {
    strokeLine(doc, 143, timeSummaryY + 44, 657, timeSummaryY + 44, { stroke: line, width: 1.6 })
    const steps = [
      [143, '01', '出发时间', departure],
      [314, '02', '到达时间', actualStart],
      [486, '03', '完成时间', actualEnd],
      [657, '04', '返抵时间', returned],
    ]
    steps.forEach(([cx, idx, label, value]) => {
      fillCircle(doc, cx, timeSummaryY + 44, 14, primary)
      text(doc, fonts, idx, cx, timeSummaryY + 49, { size: 12, color: '#ffffff', anchor: 'middle', boxWidth: 28 })
      text(doc, fonts, label, cx, timeSummaryY + 74, { size: 14, color: '#1f2937', anchor: 'middle', boxWidth: 150 })
      text(doc, fonts, cleanText(value), cx, timeSummaryY + 98, { size: 13, color: '#334155', anchor: 'middle', boxWidth: 168 })
    })
  }

  // 签名
  const customerSignature = report.customerSignature || item.customerSignature
  if (remote) {
    const remoteHasHandwritten = (item.engineers || []).some((engineer) => engineer.engineerSignature)
    text(doc, fonts, '服务工程师', 92, signatureBaseY + 56, { size: 16, color: '#0f172a' })
    drawRemoteEngineerSignatures(doc, fonts, item, { x: 176, y: signatureBaseY + 18, width: 232, height: 46 })
    if (!remoteHasHandwritten) {
      const summary = remoteHasHandwritten ? engineerNames(item) : `数字签名：${engineerNames(item) || '待补签'}`
      text(doc, fonts, summary, 92, signatureBaseY + 88, { size: 14.5, color: '#64748b' })
    }
  } else {
    text(doc, fonts, '服务工程师', 92, signatureBaseY + 26, { size: 16, color: '#0f172a' })
    drawEngineerSignatures(doc, fonts, item, { x: 92, y: signatureBaseY + 38, width: 228, height: 58 })
    text(doc, fonts, '客户签署', 430, signatureBaseY + 26, { size: 16, color: '#0f172a' })
    if (!drawSignatureImage(doc, customerSignature, 402, signatureBaseY + 32, 284, 76)) {
      text(doc, fonts, '待客户签署', 544, signatureBaseY + 74, { size: 15, color: '#64748b', anchor: 'middle', boxWidth: 200 })
    }
  }

  // 页脚
  text(doc, fonts, '• 说明：本 PDF 由技术服务电子化系统生成，供分享留底。', 78, footerY, { size: 13, color: '#334155' })
  text(doc, fonts, cleanText(item.orderNo || item.id || '', '-'), 750, footerY, { size: 12, color: '#64748b', anchor: 'end', boxWidth: 200 })
}

function drawOfficeSheet(doc, fonts, item, logoImage) {
  const report = item.report || {}
  const actualStart = formatDateTime(report.actualStartAt || item.plannedStartAt || item.submittedAt)
  const actualEnd = formatDateTime(report.actualEndAt || item.plannedEndAt || item.updatedAt || item.submittedAt)
  const finishedDate = formatDateTime(report.actualEndAt || item.submittedAt || item.updatedAt || item.createdAt).slice(0, 10)
  const relatedName = cleanText(item.customerName, '敦阳科技内勤')
  const category = officeCategoryDisplay(item)
  const matter = cleanText(item.internalNote || item.deviceName || item.issueDescription, '内勤工作')
  const workContent = exportWorkContent(report, item) || cleanText(item.issueDescription, '未填写工作内容')
  const resultStatus = cleanText(resultDisplay(item), '已完成')
  const resultDescription = String(report.resultDescription || item.resultDescription || '').trim()
  const salesperson = String(item.timesheetSalesperson || item.timesheet_salesperson || '').trim()

  const primary = '#6b3fa0'
  const line = '#e7def3'

  fillRect(doc, 0, 0, 794, 1123, { fill: '#ffffff' })
  fillRect(doc, 30, 28, 734, 1067, { rx: 16, fill: '#ffffff', stroke: '#e2e8f0' })

  if (logoImage) {
    try {
      doc.image(logoImage, 68 * SCALE, 58 * SCALE, { fit: [330 * SCALE, 53 * SCALE], align: 'left', valign: 'center' })
    } catch {
      text(doc, fonts, '敦阳（宁波）科技有限公司', 68, 88, { size: 18, color: '#0f766e' })
    }
  } else {
    text(doc, fonts, '敦阳（宁波）科技有限公司', 68, 88, { size: 18, color: '#0f766e' })
  }
  text(doc, fonts, '内勤工作记录', 750, 92, { size: 31, color: '#111827', anchor: 'end', boxWidth: 560 })
  strokeLine(doc, 68, 130, 750, 130, { stroke: primary, width: 2.2 })
  strokeLine(doc, 68, 135, 750, 135, { stroke: line, width: 1 })

  const cell = (x, y, w, labelW, label, value, valuePad = 12) => {
    fillRect(doc, x, y, w, 46, { fill: '#ffffff', stroke: '#d6dee8' })
    fillRect(doc, x, y, labelW, 46, { fill: '#f8fafc', stroke: '#d6dee8' })
    text(doc, fonts, label, x + 16, y + 29, { size: 14, color: '#1f2937' })
    text(doc, fonts, cleanText(value), x + labelW + 18, y + 29, {
      size: 15,
      color: '#0f172a',
      ellipsis: true,
      boxWidth: x + w - (x + labelW + 18) - valuePad,
    })
  }
  cell(68, 158, 390, 122, '关联客户', relatedName)
  cell(458, 158, 292, 102, '工程师', engineerNames(item) || '-')
  cell(68, 204, 390, 122, 'Case号', item.orderNo || item.id || '-')
  cell(458, 204, 292, 102, '填写日期', cleanText(finishedDate, '-'))
  cell(68, 250, 390, 122, '内勤类别', category)
  cell(458, 250, 292, 102, '业务人员', salesperson || '-')

  fillRect(doc, 68, 318, 682, 118, { rx: 12, fill: '#f8fafc', stroke: '#d6dee8' })
  text(doc, fonts, '具体事项', 92, 352, { size: 15.5, color: '#0f172a' })
  textLines(doc, fonts, matter, 92, 396, { maxWidth: 634, maxChars: 66, maxLines: 2, lineHeight: 30 })

  fillRect(doc, 68, 462, 682, 344, { rx: 12, fill: '#ffffff', stroke: '#d6dee8' })
  fillRect(doc, 68, 462, 138, 344, { rx: 12, fill: '#f8fafc', stroke: '#d6dee8' })
  fillRect(doc, 196, 462, 10, 344, { fill: '#f8fafc' })
  text(doc, fonts, '工作内容', 88, 498, { size: 15.5, color: '#0f172a' })
  const workGuideLines = [76, 102, 128, 154, 180, 206, 232]
  workGuideLines.forEach((offset) => strokeLine(doc, 226, 462 + offset, 726, 462 + offset, { stroke: '#e2e8f0', width: 1 }))
  textLines(doc, fonts, workContent, 226, 522, { maxWidth: 500, maxChars: 41, maxLines: 7, lineHeight: 26 })

  strokeLine(doc, 206, 696, 726, 696, { stroke: line, width: 1.4 })
  text(doc, fonts, '工作结果', 88, 732, { size: 14, color: primary })
  text(doc, fonts, resultStatus, 226, 732, { size: 15, color: '#0f172a' })
  strokeLine(doc, 226, 752, 726, 752, { stroke: '#e2e8f0', width: 1 })
  strokeLine(doc, 226, 780, 726, 780, { stroke: '#e2e8f0', width: 1 })
  if (resultDescription) {
    textLines(doc, fonts, resultDescription, 226, 762, { maxWidth: 500, maxChars: 41, maxLines: 2, lineHeight: 26 })
  } else {
    text(doc, fonts, '已记录本次内勤工作结果，可导出留底。', 226, 762, { size: 13, color: '#334155' })
  }

  fillRect(doc, 68, 832, 682, 106, { rx: 12, fill: '#ffffff', stroke: '#d6dee8' })
  strokeLine(doc, 250, 876, 568, 876, { stroke: line, width: 1.4 })
  const timeSteps = [
    [204, '01', '开始时间', actualStart],
    [614, '02', '结束时间', actualEnd],
  ]
  timeSteps.forEach(([cx, idx, label, value]) => {
    fillCircle(doc, cx, 876, 14, primary)
    text(doc, fonts, idx, cx, 881, { size: 12, color: '#ffffff', anchor: 'middle', boxWidth: 28 })
    text(doc, fonts, label, cx, 904, { size: 14, color: '#1f2937', anchor: 'middle', boxWidth: 150 })
    text(doc, fonts, cleanText(value), cx, 920, { size: 13, color: '#334155', anchor: 'middle', boxWidth: 170 })
  })

  const signatureBaseY = 968
  const hasEngineerSignature = (item.engineers || []).some((engineer) => engineer.engineerSignature)
  text(doc, fonts, '工程师确认', 92, signatureBaseY + 36, { size: 16, color: '#0f172a' })
  drawRemoteEngineerSignatures(doc, fonts, item, { x: 198, y: signatureBaseY + 4, width: 260, height: 58 })
  if (!hasEngineerSignature) {
    text(doc, fonts, engineerNames(item) || '待补签', 92, signatureBaseY + 76, { size: 14.5, color: '#64748b' })
  }

  text(doc, fonts, '• 说明：本 PDF 由技术服务电子化系统生成，供内勤工作归档留底。', 78, 1082, { size: 13, color: '#334155' })
  text(doc, fonts, cleanText(item.orderNo || item.id || '', '-'), 750, 1082, { size: 12, color: '#64748b', anchor: 'end', boxWidth: 200 })
}

// 每个文档把 logo 只 openImage 一次，避免逐页重复嵌入(否则 80 页会塞 80 份 PNG)。
function openLogo(doc) {
  const buffer = getLogoBuffer()
  if (!buffer) return null
  try {
    return doc.openImage(buffer)
  } catch {
    return null
  }
}

function drawServiceRecord(doc, fonts, item, logoImage) {
  if (isOfficeSheet(item)) {
    drawOfficeSheet(doc, fonts, item, logoImage)
    return
  }
  drawSheet(doc, fonts, item, logoImage)
}

function buildServiceRecordPdf(item) {
  const title = isOfficeSheet(item) ? '内勤工作记录' : '技术服务记录单'
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${item.orderNo || item.id || 'service-record'} ${title}` } })
  const fonts = registerFonts(doc)
  drawServiceRecord(doc, fonts, item, openLogo(doc))
  doc.end()
  return doc
}

// 批量导出：所有工单合成一个多页 PDF。字体只注册/子集化一次、logo 只嵌入一次，
// 相比逐单生成独立 PDF（每份都要重新解析 18.6MB 中文字体）快约一个数量级。
function buildServiceRecordsPdf(items) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: '服务记录（批量导出）' } })
  const fonts = registerFonts(doc)
  const logoImage = openLogo(doc)
  items.forEach((item, index) => {
    if (index > 0) doc.addPage()
    drawServiceRecord(doc, fonts, item, logoImage)
  })
  doc.end()
  return doc
}

function serviceRecordPdfFilename(item) {
  return `${String(item.orderNo || item.id || 'service-record').replace(/[\\/:*?"<>|\s]+/g, '-')}.pdf`
}

module.exports = {
  buildServiceRecordPdf,
  buildServiceRecordsPdf,
  serviceRecordPdfFilename,
}
