<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { normalizePreviewServiceMode, previewServiceTypeLabel, previewTimesheetCategoryLabel } from '../services/service-mode'

const { zh } = usePreviewI18n()
const route = useRoute()
const loading = ref(false)
const sharing = ref(false)
const error = ref('')
const task = ref(null)
const logoDataUrl = ref('')
const previewUrl = ref('')
const previewBlob = ref(null)
const normalizedServiceMode = computed(() => normalizePreviewServiceMode(task.value || {}))
const isRemoteSheet = computed(() => normalizedServiceMode.value === 'remote')
const supportsSingleSheet = computed(() => normalizedServiceMode.value !== 'office')

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function imageHrefAttrs(value) {
  const href = escapeXml(value)
  return `href="${href}" xlink:href="${href}"`
}

function formatDateTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16) || ''
}

function cleanText(value, fallback = '-') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

// 协作工单中“我无需单独填写”的占位标记，导出时需剔除。
const collaborativeAckMarker = '⁣⁤⁣'

function stripAckMarker(value) {
  return String(value || '').split(collaborativeAckMarker).join('')
}

// 处理内容：优先按每位工程师的原始记录拼接，去掉协作确认占位、不加“姓名：”
// 前缀，仅用换行区分；无 entries 时回退到合并字段。与后端 PDF 导出保持一致。
function exportWorkContent(report) {
  const entries = Array.isArray(report?.workEntries) ? report.workEntries : []
  const filled = entries
    .map((entry) => stripAckMarker(entry?.workContent || '').trim())
    .filter(Boolean)
  if (filled.length) return filled.join('\n')
  return stripAckMarker(report?.workContent || '').trim()
}

function textWidthUnits(value) {
  return Array.from(value).reduce((total, char) => total + (char.charCodeAt(0) <= 255 ? 0.55 : 1), 0)
}

function splitByWidth(value, maxUnits) {
  const chunks = []
  let line = ''
  let units = 0

  for (const char of Array.from(String(value || ''))) {
    const charUnits = textWidthUnits(char)
    if (line && units + charUnits > maxUnits) {
      chunks.push(line)
      line = char
      units = charUnits
      continue
    }
    line += char
    units += charUnits
  }

  if (line) chunks.push(line)
  return chunks
}

function textLines(value, x, y, maxChars, maxLines, lineHeight = 30) {
  const lines = []
  for (const rawLine of String(value || '').split(/\n/)) {
    const line = rawLine.trim()
    if (!line) {
      lines.push('')
    } else {
      lines.push(...splitByWidth(line, maxChars))
    }
  }
  return lines
    .slice(0, maxLines)
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" font-size="16">${escapeXml(line)}</text>`)
    .join('')
}

function contactDisplay(item) {
  const name = item.contactName || item.report?.customerName || ''
  const phone = item.contactPhone || ''
  if (name && phone) return `${name} / ${phone}`
  return name || phone || '-'
}

function serviceTypeLabel(item) {
  return previewServiceTypeLabel(item.serviceType)
}

function categoryDisplay(item) {
  if (isRemoteSheet.value) {
    const remoteCategory = cleanText(previewTimesheetCategoryLabel('remote', item.timesheetCategory || item.serviceCategory || item.serviceType), '远程排障')
    return `远程 / ${remoteCategory}`
  }
  if (normalizedServiceMode.value === 'office') {
    const officeCategory = cleanText(previewTimesheetCategoryLabel('office', item.timesheetCategory || item.serviceCategory || item.serviceType), '其他事项')
    return `内勤 / ${officeCategory}`
  }
  const onsiteCategory = cleanText(previewServiceTypeLabel(item.serviceType), '故障处理')
  return `现场 / ${onsiteCategory}`
}

function resultDisplay(item) {
  const rawResult = String(item.report?.result || item.result || '').trim().toLowerCase()
  if (['resolved', 'done', 'completed', 'complete', 'finished', 'success'].includes(rawResult)) return '已完成'
  if (['unresolved', 'not_resolved', 'incomplete', 'failed'].includes(rawResult)) return '未完成'
  if (['follow_up_required', 'pending', 'processing', 'in_progress', 'follow_up'].includes(rawResult)) return '待跟进'
  return '已完成'
}

function resultDescriptionDisplay(item) {
  return String(item.report?.resultDescription || item.resultDescription || '').trim()
}

function engineerNames(item) {
  const names = (item.engineers || []).map((engineer) => engineer.realName).filter(Boolean)
  return names.join('、') || item.engineerName || ''
}

function signatureImage(href, x, y, width, height) {
  return `<image ${imageHrefAttrs(href)} x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" filter="url(#signatureInk)"/>`
}

function engineerSignatureBlock(item, { x = 161, y = 950, width = 202, height = 44 } = {}) {
  const signatures = (item.engineers || []).filter((engineer) => engineer.engineerSignature).slice(0, 5)
  if (!signatures.length) {
    return `<text x="${x + width / 2}" y="${y + height / 2 + 6}" text-anchor="middle" font-size="16" font-weight="600" fill="#0f172a">${escapeXml(engineerNames(item) || '待补签')}</text>`
  }
  const signatureWidth = Math.max(56, Math.floor(width / signatures.length))
  return signatures
    .map((engineer, index) => {
      const imageX = x + index * signatureWidth
      return signatureImage(engineer.engineerSignature, imageX, y, signatureWidth - 6, height)
    })
    .join('')
}

function engineerSignatureSummary(item) {
  const hasSignature = (item.engineers || []).some((engineer) => engineer.engineerSignature)
  return hasSignature ? escapeXml(engineerNames(item) || '服务工程师手写签名') : `数字签名：${escapeXml(engineerNames(item) || '待补签')}`
}

function remoteEngineerSignatureBlock(item, { x = 176, y = 940, width = 232, height = 46 } = {}) {
  const signatures = (item.engineers || []).filter((engineer) => engineer.engineerSignature).slice(0, 4)
  if (!signatures.length) {
    return `<text x="${x + 6}" y="${y + height - 6}" font-size="20" font-weight="600" fill="#0f172a">${escapeXml(engineerNames(item) || '待补签')}</text>`
  }
  const signatureWidth = Math.max(82, Math.floor(width / signatures.length))
  return signatures
    .map((engineer, index) => {
      const imageX = x + index * signatureWidth
      return signatureImage(engineer.engineerSignature, imageX, y, signatureWidth - 6, height)
    })
    .join('')
}

async function imageToDataUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

let renderToken = 0

function revokePreviewUrl() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

async function renderPreviewPng() {
  const svg = sheetSvg.value
  renderToken += 1
  const token = renderToken

  revokePreviewUrl()
  previewBlob.value = null

  if (!svg) return

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await new Promise((resolve, reject) => {
      const node = new Image()
      node.onload = () => resolve(node)
      node.onerror = () => reject(new Error('生成高清图片失败'))
      node.src = svgUrl
    })
    if (token !== renderToken) return

    const scale = window.devicePixelRatio > 1.5 ? 2.6 : 3
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(794 * scale)
    canvas.height = Math.round(1123 * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器不支持图片导出')
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 794, 1123)
    context.drawImage(image, 0, 0, 794, 1123)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob)
        else reject(new Error('生成高清图片失败'))
      }, 'image/png')
    })
    if (token !== renderToken) return

    previewBlob.value = blob
    previewUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    error.value = err.message || '生成高清图片失败'
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

const sheetSvg = computed(() => {
  const item = task.value
  if (!item?.report) return ''
  const actualStart = formatDateTime(item.report.actualStartAt || item.plannedStartAt)
  const actualEnd = formatDateTime(item.report.actualEndAt || item.plannedEndAt)
  const departure = formatDateTime(item.report.departureAt) || '—'
  const returned = formatDateTime(item.report.returnAt) || '—'
  const finishedDate = formatDateTime(item.report.actualEndAt || item.submittedAt || item.updatedAt || item.createdAt).slice(0, 10)
  const summaryText = cleanText(item.issueDescription || item.problemDescription || '', '未填写问题描述')
  const workRecord = exportWorkContent(item.report) || cleanText(item.serviceContent || item.issueDescription || '', '未填写处理记录')
  const titleText = isRemoteSheet.value ? '远程服务记录单' : '技术服务记录单'
  const secondLabel = '设备 / 系统'
  const secondValue = cleanText(item.deviceName || item.internalNote || item.productName || '', '未填写设备信息')
  const summaryLabel = '问题描述'
  const recordLabel = isRemoteSheet.value ? '工作内容' : '服务内容'
  const resultLabel = isRemoteSheet.value ? '处理结果' : '服务结论'
  const resultStatus = cleanText(resultDisplay(item), '已完成')
  const resultDescription = resultDescriptionDisplay(item)
  const sheetPrimary = '#6b3fa0'
  const sheetSoft = '#f6f1fb'
  const sheetLine = '#e7def3'
  const sheetSecondary = '#7f5ab5'
  const summaryY = isRemoteSheet.value ? 318 : 318
  const summaryTextY = isRemoteSheet.value ? 386 : 386
  const recordBoxY = isRemoteSheet.value ? 438 : 438
  const recordBoxHeight = isRemoteSheet.value ? 340 : 380
  const recordContentStartY = isRemoteSheet.value ? recordBoxY + 52 : recordBoxY + 60
  const recordLineHeight = 26
  const recordMaxLines = isRemoteSheet.value ? 7 : 8
  const resultDividerY = isRemoteSheet.value ? recordBoxY + 220 : recordBoxY + 258
  const resultStatusY = resultDividerY + 34
  const resultDetailY = resultStatusY + 28
  const resultMaxLines = isRemoteSheet.value ? 2 : 2
  const resultGuideLines = isRemoteSheet.value ? [58, 86] : [56, 84]
  const timeSummaryY = recordBoxY + recordBoxHeight + 18
  const signatureBaseY = timeSummaryY + 138
  const footerY = isRemoteSheet.value ? 1088 : 1082
  const recordGuideLines = isRemoteSheet.value ? [76, 102, 128, 154, 180, 206, 232] : [76, 102, 128, 154, 180, 206, 232, 258]
  const recordGuidesSvg = recordGuideLines
    .map((offset) => `<line x1="226" y1="${recordBoxY + offset}" x2="726" y2="${recordBoxY + offset}" stroke="#e2e8f0"/>`)
    .join('')
  const resultGuidesSvg = resultGuideLines
    .map((offset) => `<line x1="226" y1="${resultDividerY + offset}" x2="726" y2="${resultDividerY + offset}" stroke="#e2e8f0"/>`)
    .join('')
  const timeSummary = isRemoteSheet.value
    ? `<rect x="68" y="${timeSummaryY}" width="682" height="112" rx="12" fill="#ffffff" stroke="#d6dee8"/>
    <line x1="337" y1="${timeSummaryY + 44}" x2="469" y2="${timeSummaryY + 44}" stroke="${sheetLine}" stroke-width="1.4"/><text x="403" y="${timeSummaryY + 49}" text-anchor="middle" fill="${sheetSecondary}">→</text>
    <circle cx="191" cy="${timeSummaryY + 44}" r="14" fill="${sheetPrimary}"/><text x="191" y="${timeSummaryY + 49}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">01</text><text x="275" y="${timeSummaryY + 49}" text-anchor="middle" class="label">开始时间</text><text x="275" y="${timeSummaryY + 98}" text-anchor="middle" class="small">${escapeXml(actualStart)}</text>
    <circle cx="531" cy="${timeSummaryY + 44}" r="14" fill="${sheetPrimary}"/><text x="531" y="${timeSummaryY + 49}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">02</text><text x="615" y="${timeSummaryY + 49}" text-anchor="middle" class="label">结束时间</text><text x="615" y="${timeSummaryY + 98}" text-anchor="middle" class="small">${escapeXml(actualEnd)}</text>`
    : `<rect x="68" y="${timeSummaryY}" width="682" height="112" rx="12" fill="#ffffff" stroke="#d6dee8"/>
    <line x1="143" y1="${timeSummaryY + 44}" x2="657" y2="${timeSummaryY + 44}" stroke="${sheetLine}" stroke-width="1.6"/>
    <circle cx="143" cy="${timeSummaryY + 44}" r="14" fill="${sheetPrimary}"/><text x="143" y="${timeSummaryY + 49}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">01</text><text x="143" y="${timeSummaryY + 74}" text-anchor="middle" class="label">出发时间</text><text x="143" y="${timeSummaryY + 98}" text-anchor="middle" class="small">${escapeXml(departure)}</text>
    <circle cx="314" cy="${timeSummaryY + 44}" r="14" fill="${sheetPrimary}"/><text x="314" y="${timeSummaryY + 49}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">02</text><text x="314" y="${timeSummaryY + 74}" text-anchor="middle" class="label">到达时间</text><text x="314" y="${timeSummaryY + 98}" text-anchor="middle" class="small">${escapeXml(actualStart)}</text>
    <circle cx="486" cy="${timeSummaryY + 44}" r="14" fill="${sheetPrimary}"/><text x="486" y="${timeSummaryY + 49}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">03</text><text x="486" y="${timeSummaryY + 74}" text-anchor="middle" class="label">完成时间</text><text x="486" y="${timeSummaryY + 98}" text-anchor="middle" class="small">${escapeXml(actualEnd)}</text>
    <circle cx="657" cy="${timeSummaryY + 44}" r="14" fill="${sheetPrimary}"/><text x="657" y="${timeSummaryY + 49}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">04</text><text x="657" y="${timeSummaryY + 74}" text-anchor="middle" class="label">返抵时间</text><text x="657" y="${timeSummaryY + 98}" text-anchor="middle" class="small">${escapeXml(returned)}</text>`
  const customerSignature = item.report.customerSignature || item.customerSignature
  const remoteHasHandwrittenSignature = (item.engineers || []).some((engineer) => engineer.engineerSignature)
  const onsiteSignatureSection = `<text x="92" y="${signatureBaseY + 26}" font-size="16" font-weight="700" fill="#0f172a">服务工程师</text>${
    engineerSignatureBlock(item, { x: 92, y: signatureBaseY + 38, width: 228, height: 58 })
  }<text x="430" y="${signatureBaseY + 26}" font-size="16" font-weight="700" fill="#0f172a">客户签署</text>${
    customerSignature
      ? signatureImage(customerSignature, 402, signatureBaseY + 32, 284, 76)
      : `<text x="544" y="${signatureBaseY + 74}" text-anchor="middle" font-size="15" font-weight="600" fill="#64748b">待客户签署</text>`
  }`
  const signatureSection = isRemoteSheet.value
    ? `<text x="92" y="${signatureBaseY + 56}" font-size="16" font-weight="700" fill="#0f172a">服务工程师</text>${remoteEngineerSignatureBlock(item, { x: 176, y: signatureBaseY + 18, width: 232, height: 46 })}${remoteHasHandwrittenSignature ? '' : `<text x="92" y="${signatureBaseY + 88}" font-size="14.5" fill="#64748b">${engineerSignatureSummary(item)}</text>`}`
    : onsiteSignatureSection
  const logo = logoDataUrl.value
    ? `<image ${imageHrefAttrs(logoDataUrl.value)} x="68" y="58" width="330" height="53" preserveAspectRatio="xMinYMid meet"/>`
    : `<text x="68" y="88" font-size="18" font-weight="700" fill="#0f766e">敦阳（宁波）科技有限公司</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="794" height="1123" viewBox="0 0 794 1123">
    <defs>
      <filter id="signatureInk" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 0.031 0 0 0 0 0.153 0 0 0 0 0.298 0 0 0 1 0"/>
      </filter>
      <style>
        .label { font: 700 14px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #1f2937; }
        .value { font: 600 15px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #0f172a; }
        .small { font: 500 13px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #334155; }
        .title { font: 700 31px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #111827; }
      </style>
    </defs>
    <rect width="794" height="1123" fill="#ffffff"/>
    <rect x="30" y="28" width="734" height="1067" rx="16" fill="#ffffff" stroke="#e2e8f0"/>
    ${logo}
    <text x="750" y="92" text-anchor="end" class="title">${titleText}</text>
    <line x1="68" y1="130" x2="750" y2="130" stroke="${sheetPrimary}" stroke-width="2.2"/>
    <line x1="68" y1="135" x2="750" y2="135" stroke="${sheetLine}"/>
    <rect x="68" y="158" width="390" height="46" fill="#ffffff" stroke="#d6dee8"/><rect x="68" y="158" width="122" height="46" fill="#f8fafc" stroke="#d6dee8"/><text x="84" y="187" class="label">客户名称</text><text x="208" y="187" class="value">${escapeXml(cleanText(item.customerName))}</text>
    <rect x="458" y="158" width="292" height="46" fill="#ffffff" stroke="#d6dee8"/><rect x="458" y="158" width="102" height="46" fill="#f8fafc" stroke="#d6dee8"/><text x="474" y="187" class="label">联系人</text><text x="578" y="187" class="value">${escapeXml(contactDisplay(item))}</text>
    <rect x="68" y="204" width="390" height="46" fill="#ffffff" stroke="#d6dee8"/><rect x="68" y="204" width="122" height="46" fill="#f8fafc" stroke="#d6dee8"/><text x="84" y="233" class="label">Case号</text><text x="208" y="233" class="value">${escapeXml(cleanText(item.orderNo || item.id || '', '-'))}</text>
    <rect x="458" y="204" width="292" height="46" fill="#ffffff" stroke="#d6dee8"/><rect x="458" y="204" width="102" height="46" fill="#f8fafc" stroke="#d6dee8"/><text x="474" y="233" class="label">填写日期</text><text x="578" y="233" class="value">${escapeXml(cleanText(finishedDate, '-'))}</text>
    <rect x="68" y="250" width="682" height="46" fill="#ffffff" stroke="#d6dee8"/><rect x="68" y="250" width="122" height="46" fill="#f8fafc" stroke="#d6dee8"/><text x="84" y="279" class="label">地址</text><text x="208" y="279" class="value">${escapeXml(cleanText(item.customerAddress, isRemoteSheet.value ? '远程服务未填写地址' : '-'))}</text>
    <rect x="68" y="${summaryY}" width="682" height="108" rx="12" fill="#f8fafc" stroke="#d6dee8"/><text x="92" y="${summaryY + 34}" font-size="15.5" font-weight="700" fill="#0f172a">${summaryLabel}</text>${textLines(summaryText, 92, summaryTextY, 66, 2, 30)}
    <rect x="68" y="${recordBoxY}" width="682" height="${recordBoxHeight}" rx="12" fill="#ffffff" stroke="#d6dee8"/><rect x="68" y="${recordBoxY}" width="138" height="${recordBoxHeight}" rx="12" fill="#f8fafc" stroke="#d6dee8"/><rect x="196" y="${recordBoxY}" width="10" height="${recordBoxHeight}" fill="#f8fafc"/><text x="88" y="${recordBoxY + 36}" font-size="15.5" font-weight="700" fill="#0f172a">${recordLabel}</text>${recordGuidesSvg}${textLines(workRecord, 226, recordContentStartY, 41, recordMaxLines, recordLineHeight)}<line x1="206" y1="${resultDividerY}" x2="726" y2="${resultDividerY}" stroke="${sheetLine}" stroke-width="1.4"/><text x="88" y="${resultStatusY}" font-size="14" font-weight="700" fill="${sheetPrimary}">${resultLabel}</text><text x="226" y="${resultStatusY}" class="value">${escapeXml(resultStatus)}</text>${resultGuidesSvg}${resultDescription ? textLines(resultDescription, 226, resultDetailY, 41, resultMaxLines, 26) : `<text x="226" y="${resultDetailY}" class="small">已记录本次服务结果，可直接分享留底。</text>`}
    ${timeSummary}
    ${signatureSection}
    <text x="78" y="${footerY}" class="small">• 说明：本图片由技术服务电子化系统生成，供分享留底。</text><text x="750" y="${footerY}" text-anchor="end" font-size="12" font-weight="600" fill="#64748b">${escapeXml(cleanText(item.orderNo || item.id || '', '-'))}</text>
  </svg>`
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/service-orders/${route.params.id}?mine=1`)
    task.value = data.item
    logoDataUrl.value = await imageToDataUrl(`${import.meta.env.BASE_URL}export-logo.png`).catch(() => '')
    if (normalizePreviewServiceMode(data.item || {}) === 'office') {
      error.value = '内勤记录不生成单独服务表，请在月报中统一导出'
      return
    }
    if (!data.item?.report) error.value = '请先填写并提交服务记录'
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function downloadPng() {
  if (!previewBlob.value || !task.value) return
  const url = URL.createObjectURL(previewBlob.value)
  const link = document.createElement('a')
  link.href = url
  link.download = `${task.value.orderNo || 'service-record'}.png`
  link.click()
  URL.revokeObjectURL(url)
}

async function shareSheet() {
  if (!task.value) return
  sharing.value = true
  error.value = ''
  try {
    if (navigator.share && previewBlob.value) {
      const file = new File([previewBlob.value], `${task.value.orderNo || 'service-record'}.png`, { type: 'image/png' })
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${task.value?.customerName || ''} 技术服务表`,
          text: `${task.value?.orderNo || ''} 技术服务表高清图片`,
          files: [file],
        })
        return
      }
    }
    if (navigator.share) {
      await navigator.share({
        title: `${task.value?.customerName || ''} 技术服务表`,
        text: `${task.value?.orderNo || ''} 技术服务表高清图片已生成，可下载留底。`,
        url: window.location.href,
      })
    } else {
      downloadPng()
    }
  } catch (err) {
    error.value = err.message || '分享失败'
  } finally {
    sharing.value = false
  }
}

watch(sheetSvg, () => {
  renderPreviewPng()
}, { immediate: true })

onBeforeUnmount(() => {
  renderToken += 1
  revokePreviewUrl()
})

onMounted(load)
</script>

<template>
  <main class="engineer-shell share-shell">
    <header class="topbar">
      <div>
        <BrandEyebrow text="工程师工作台 / 分享服务表" title="分享服务表" />
      </div>
      <RouterLink class="ghost top-link" :to="`/tasks/${route.params.id}`"><PreviewIcon name="eye" />{{ zh('返回详情') }}</RouterLink>
    </header>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="load">{{ zh('重试') }}</button></p>
    <p v-else-if="loading" class="muted">{{ zh('正在生成分享预览...') }}</p>

    <article v-if="task?.report && supportsSingleSheet" class="form-section share-panel">
      <div class="share-head">
        <div>
          <h2>{{ zh('分享前预览') }}</h2>
          <p>{{ task.orderNo || task.id }} · {{ zh(task.customerName || '-') }}</p>
        </div>
        <div class="share-actions">
          <button class="ghost" type="button" :disabled="sharing || !previewUrl" @click="downloadPng"><PreviewIcon name="download" />{{ zh('下载高清 PNG') }}</button>
          <button class="primary" type="button" :disabled="sharing" @click="shareSheet"><PreviewIcon name="share" />{{ zh(sharing ? '分享中' : '系统分享') }}</button>
        </div>
      </div>
      <div class="paper-preview">
        <img v-if="previewUrl" :src="previewUrl" alt="技术服务表预览" />
      </div>
    </article>
  </main>
</template>
