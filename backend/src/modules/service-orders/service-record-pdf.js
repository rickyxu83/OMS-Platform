const fs = require('fs')
const PDFDocument = require('pdfkit')

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

function contactDisplay(item) {
  const name = item.contactName || item.report?.customerName || item.report?.customerConfirmName || ''
  const phone = item.contactPhone || ''
  if (name && phone) return `${name} / ${phone}`
  return name || phone || '-'
}

function engineerNames(item) {
  const names = (item.engineers || []).map((engineer) => engineer.realName || engineer.name || engineer.username).filter(Boolean)
  return names.join('、') || item.engineerName || ''
}

function dataUrlToImageBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return null
  const buffer = Buffer.from(match[1], 'base64')
  return buffer.length ? buffer : null
}

function drawDataUrlImage(doc, dataUrl, x, y, width, height) {
  const buffer = dataUrlToImageBuffer(dataUrl)
  if (!buffer) return false
  try {
    doc.image(buffer, x, y, { fit: [width, height], align: 'center', valign: 'center' })
    return true
  } catch {
    return false
  }
}

function drawLabelValue(doc, fonts, { x, y, width, labelWidth = 82, height = 34, label, value }) {
  doc.roundedRect(x, y, width, height, 0).fillAndStroke('#ffffff', '#d6dee8')
  doc.rect(x, y, labelWidth, height).fillAndStroke('#f8fafc', '#d6dee8')
  doc.font(fonts.bold).fontSize(9.8).fillColor('#1f2937').text(label, x + 10, y + 11, { width: labelWidth - 16, height: height - 10 })
  doc
    .font(fonts.bold)
    .fontSize(10.6)
    .fillColor('#0f172a')
    .text(cleanText(value), x + labelWidth + 12, y + 10, { width: width - labelWidth - 20, height: height - 10, ellipsis: true })
}

function drawSectionBox(doc, fonts, { x, y, width, height, title, body, fill = '#ffffff', titleColor = '#0f172a' }) {
  doc.roundedRect(x, y, width, height, 9).fillAndStroke(fill, '#d6dee8')
  doc.font(fonts.bold).fontSize(11).fillColor(titleColor).text(title, x + 16, y + 14)
  doc.font(fonts.regular).fontSize(10.5).fillColor('#1f2937').text(cleanText(body, '未填写'), x + 16, y + 38, {
    width: width - 32,
    height: height - 50,
    lineGap: 4,
    ellipsis: true,
  })
}

function drawTimeline(doc, fonts, item, { x, y, width, remote }) {
  const report = item.report || {}
  const primary = '#6b3fa0'
  doc.roundedRect(x, y, width, 84, 9).fillAndStroke('#ffffff', '#d6dee8')
  const steps = remote
    ? [
        ['01', '开始时间', formatDateTime(report.actualStartAt || item.plannedStartAt)],
        ['02', '结束时间', formatDateTime(report.actualEndAt || item.plannedEndAt)],
      ]
    : [
        ['01', '出发时间', formatDateTime(report.departureAt) || '-'],
        ['02', '到达时间', formatDateTime(report.actualStartAt || item.plannedStartAt) || '-'],
        ['03', '完成时间', formatDateTime(report.actualEndAt || item.plannedEndAt) || '-'],
        ['04', '返抵时间', formatDateTime(report.returnAt) || '-'],
      ]
  const stepGap = width / steps.length
  doc.moveTo(x + stepGap / 2, y + 34).lineTo(x + width - stepGap / 2, y + 34).lineWidth(1).strokeColor('#e7def3').stroke()
  steps.forEach(([index, label, value], stepIndex) => {
    const cx = x + stepGap * stepIndex + stepGap / 2
    doc.circle(cx, y + 34, 10).fill(primary)
    doc.font(fonts.bold).fontSize(8).fillColor('#ffffff').text(index, cx - 7, y + 29, { width: 14, align: 'center' })
    doc.font(fonts.bold).fontSize(9.5).fillColor('#1f2937').text(label, cx - stepGap / 2 + 6, y + 51, { width: stepGap - 12, align: 'center' })
    doc.font(fonts.regular).fontSize(8.5).fillColor('#334155').text(cleanText(value), cx - stepGap / 2 + 6, y + 67, { width: stepGap - 12, align: 'center', ellipsis: true })
  })
}

function drawSignatures(doc, fonts, item, { x, y, width, remote }) {
  const report = item.report || {}
  doc.roundedRect(x, y, width, remote ? 72 : 94, 9).fillAndStroke('#ffffff', '#d6dee8')
  doc.font(fonts.bold).fontSize(10.5).fillColor('#0f172a').text('服务工程师', x + 18, y + 16)
  const engineerSignatures = (item.engineers || []).filter((engineer) => engineer.engineerSignature).slice(0, remote ? 4 : 5)
  const sigY = y + 28
  const sigW = remote ? 190 : 170
  if (engineerSignatures.length) {
    const each = Math.max(46, sigW / engineerSignatures.length)
    engineerSignatures.forEach((engineer, index) => {
      drawDataUrlImage(doc, engineer.engineerSignature, x + 18 + index * each, sigY, each - 5, 36)
    })
  } else {
    doc.font(fonts.bold).fontSize(12).fillColor('#0f172a').text(cleanText(engineerNames(item), '待补签'), x + 18, sigY + 12, { width: sigW })
  }

  if (remote) {
    if (!engineerSignatures.length) {
      doc.font(fonts.regular).fontSize(9).fillColor('#64748b').text(`数字签名：${cleanText(engineerNames(item), '待补签')}`, x + 18, y + 56, { width: width - 36 })
    }
    return
  }

  const customerX = x + width / 2 + 10
  doc.font(fonts.bold).fontSize(10.5).fillColor('#0f172a').text('客户签署', customerX, y + 16)
  if (!drawDataUrlImage(doc, report.customerSignature || item.customerSignature, customerX, y + 28, width / 2 - 46, 50)) {
    doc.font(fonts.bold).fontSize(10.5).fillColor('#64748b').text('待客户签署', customerX, y + 49, { width: width / 2 - 46, align: 'center' })
  }
}

function buildServiceRecordPdf(item) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${item.orderNo || item.id || 'service-record'} 技术服务记录单` } })
  const fonts = registerFonts(doc)
  const remote = isRemoteSheet(item)
  const report = item.report || {}
  const primary = '#6b3fa0'
  const line = '#e7def3'
  const page = { x: 22, y: 22, width: 551, height: 798 }
  const title = remote ? '远程服务记录单' : '技术服务记录单'
  const finishedDate = formatDateTime(report.actualEndAt || item.submittedAt || item.updatedAt || item.createdAt).slice(0, 10)
  const summaryText = cleanText(item.issueDescription || item.problemDescription || '', '未填写问题描述')
  const workRecord = cleanText(report.workContent || item.serviceContent || item.issueDescription || '', '未填写处理记录')
  const resultDescription = String(report.resultDescription || item.resultDescription || '').trim()

  doc.roundedRect(page.x, page.y, page.width, page.height, 12).fillAndStroke('#ffffff', '#e2e8f0')
  doc.font(fonts.bold).fontSize(13).fillColor('#0f766e').text('敦阳(宁波)科技有限公司', 52, 50, { width: 230 })
  doc.font(fonts.bold).fontSize(22).fillColor('#111827').text(title, 300, 47, { width: 248, align: 'right' })
  doc.moveTo(52, 94).lineTo(543, 94).lineWidth(1.6).strokeColor(primary).stroke()
  doc.moveTo(52, 98).lineTo(543, 98).lineWidth(0.8).strokeColor(line).stroke()
  drawLabelValue(doc, fonts, { x: 52, y: 116, width: 282, label: '客户名称', value: item.customerName })
  drawLabelValue(doc, fonts, { x: 334, y: 116, width: 209, labelWidth: 74, label: '联系人', value: contactDisplay(item) })
  drawLabelValue(doc, fonts, { x: 52, y: 150, width: 282, label: 'Case号', value: item.orderNo || item.id || '-' })
  drawLabelValue(doc, fonts, { x: 334, y: 150, width: 209, labelWidth: 74, label: '填写日期', value: finishedDate || '-' })
  drawLabelValue(doc, fonts, { x: 52, y: 184, width: 491, label: '地址', value: cleanText(item.customerAddress, remote ? '远程服务未填写地址' : '-') })
  drawSectionBox(doc, fonts, { x: 52, y: 236, width: 491, height: 82, title: '问题描述', body: summaryText, fill: '#f8fafc' })

  const recordY = 330
  const recordHeight = remote ? 230 : 266
  doc.roundedRect(52, recordY, 491, recordHeight, 9).fillAndStroke('#ffffff', '#d6dee8')
  doc.rect(52, recordY, 100, recordHeight).fillAndStroke('#f8fafc', '#d6dee8')
  doc.rect(146, recordY + 1, 6, recordHeight - 2).fill('#f8fafc')
  doc.font(fonts.bold).fontSize(11).fillColor('#0f172a').text(remote ? '工作内容' : '服务内容', 66, recordY + 19)
  doc.font(fonts.regular).fontSize(10.5).fillColor('#1f2937').text(workRecord, 166, recordY + 18, {
    width: 350,
    height: remote ? 112 : 146,
    lineGap: 4,
    ellipsis: true,
  })
  const resultY = recordY + (remote ? 146 : 174)
  doc.moveTo(152, resultY).lineTo(526, resultY).lineWidth(0.8).strokeColor(line).stroke()
  doc.font(fonts.bold).fontSize(10).fillColor(primary).text(remote ? '处理结果' : '服务结论', 66, resultY + 18)
  doc.font(fonts.bold).fontSize(10.8).fillColor('#0f172a').text(resultDisplay(item), 166, resultY + 17, { width: 350 })
  doc.font(fonts.regular).fontSize(9.8).fillColor('#334155').text(resultDescription || '已记录本次服务结果，可直接分享留底。', 166, resultY + 40, {
    width: 350,
    height: remote ? 42 : 50,
    lineGap: 3,
    ellipsis: true,
  })

  const timelineY = recordY + (remote ? 246 : 282)
  drawTimeline(doc, fonts, item, { x: 52, y: timelineY, width: 491, remote })
  drawSignatures(doc, fonts, item, { x: 52, y: timelineY + 100, width: 491, remote })
  doc.font(fonts.regular).fontSize(8.5).fillColor('#64748b').text('说明：本 PDF 由技术服务电子化系统生成，供分享留底。', 58, 792, { width: 300 })
  doc.font(fonts.bold).fontSize(8.5).fillColor('#64748b').text(cleanText(item.orderNo || item.id, '-'), 375, 792, { width: 168, align: 'right' })
  doc.end()
  return doc
}

function serviceRecordPdfFilename(item) {
  return `${String(item.orderNo || item.id || 'service-record').replace(/[\\/:*?"<>|\s]+/g, '-')}.pdf`
}

module.exports = {
  buildServiceRecordPdf,
  serviceRecordPdfFilename,
}
