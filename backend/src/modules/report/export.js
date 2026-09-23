/**
 * 智能报表导出（spec 014/015）：Excel（exceljs）与 PDF（pdfkit，中文字体复用 service-record-pdf）。
 * 支持对比列（__compare/__delta/__pct）红绿配色与前端图表截图嵌入。
 */
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const { registerFonts } = require('../service-orders/service-record-pdf')

const BRAND = 'FF4C1D95' // 深紫（表头）
const ZEBRA = 'FFF5F3FF' // 浅紫斑马纹
const UP = '#15803d' // 涨：绿
const DOWN = '#b91c1c' // 跌：红

function fileTimestamp(date = new Date()) {
  // 上海时区文件名时间戳
  const sh = new Date(date.getTime() + 8 * 3600e3)
  return sh.toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/^(\d{8})(\d{4})/, '$1-$2')
}

function exportFileName(datasetLabel, ext, date) {
  return `智能报表-${datasetLabel}-${fileTimestamp(date)}.${ext}`
}

function exportTimeText() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + '（上海时间）'
}

function isPctCol(key) { return key.endsWith('__pct') }
function isDeltaCol(key) { return key.endsWith('__delta') }

/** 千分位分组（保留原小数位，大金额可读性） */
function groupThousands(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  const [intPart, decPart] = String(num).split('.')
  const negative = intPart.startsWith('-')
  const grouped = (negative ? intPart.slice(1) : intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (negative ? '-' : '') + grouped + (decPart !== undefined ? `.${decPart}` : '')
}

/** 金额展示：负号在前 + ¥ + 千分位绝对值（如 -¥1,234.5） */
function formatCny(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return (num < 0 ? '-' : '') + '¥' + groupThousands(Math.abs(num))
}

/** PDF 展示文本：指标千分位；pct 带符号与百分号；delta 带符号 */
function displayValue(col, value) {
  if (value === null || value === undefined || value === '') return '-'
  if (isPctCol(col.key)) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '-'
    return `${num > 0 ? '+' : ''}${num}%`
  }
  if (isDeltaCol(col.key)) {
    const num = Number(value)
    if (!Number.isFinite(num)) return String(value)
    if (col.unit === 'cny') return num > 0 ? `+${formatCny(num)}` : formatCny(num)
    return num > 0 ? `+${groupThousands(num)}` : groupThousands(num)
  }
  if (col.kind === 'metric') return col.unit === 'cny' ? formatCny(value) : groupThousands(value)
  return String(value)
}

/** 涨跌配色；非对比列返回 null */
function trendColor(key, value) {
  if (!isPctCol(key) && !isDeltaCol(key)) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return null
  return num > 0 ? UP : DOWN
}

/** 图表截图 dataURL → Buffer；非法输入返回 null */
function chartImageBuffer(chartImage) {
  if (typeof chartImage !== 'string' || !chartImage.startsWith('data:image/png;base64,')) return null
  try {
    return Buffer.from(chartImage.slice('data:image/png;base64,'.length), 'base64')
  } catch {
    return null
  }
}

/** 月报式明细列宽（对齐旧「月报导出」页面） */
const DETAIL_WIDTHS = { order_no: 20, engineer: 14, date: 13, weekday: 10, work_nature: 13, category: 13, customer: 24, product: 24, main_content: 42, work_content: 42, progress: 12, remark: 18, source: 12 }
const COMPANY_NAME = '敦阳（宁波）科技有限公司'

function safeSheetName(value, fallback) {
  const cleaned = String(value || '').replace(/[\\/?*\[\]:]/g, ' ').trim() || fallback
  return cleaned.slice(0, 31)
}

/**
 * 明细模式 Excel（月报格式）：公司抬头 + 口径行 +（拆 sheet 时）分组行 + 冻结表头。
 * spec.sheetBy 命中时按该列拆 sheet（如月报按填表人一人一 sheet），否则单一「明细」sheet。
 */
async function buildDetailXlsx({ title, specText, columns, rows, truncated, spec }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OMS 智能报表'
  const HEADER_ROW = 4

  const groups = new Map()
  if (spec?.sheetBy) {
    for (const row of rows) {
      const key = String(row[spec.sheetBy] ?? '') || '未指定'
      groups.set(key, [...(groups.get(key) || []), row])
    }
  } else {
    groups.set('', rows)
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))

  sortedGroups.forEach(([groupValue, groupRows], index) => {
    const sheet = workbook.addWorksheet(safeSheetName(groupValue, `明细${index + 1}`), {
      views: [{ state: 'frozen', ySplit: HEADER_ROW }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    sheet.columns = columns.map((col) => ({
      header: col.label,
      key: col.key,
      width: DETAIL_WIDTHS[col.key] || Math.min(Math.max(col.label.length * 2 + 6, 12), 40),
    }))

    const span = Math.max(columns.length, 1)
    sheet.mergeCells(1, 1, 1, span)
    sheet.getCell(1, 1).value = COMPANY_NAME
    sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF111827' } }
    sheet.mergeCells(2, 1, 2, span)
    sheet.getCell(2, 1).value = `${title} · ${specText}`
    sheet.getCell(2, 1).font = { size: 9, color: { argb: 'FF4B5563' } }
    sheet.mergeCells(3, 1, 3, span)
    sheet.getCell(3, 1).value = groupValue
      ? `填表人：${groupValue}　记录数：${groupRows.length}`
      : `记录数：${groupRows.length}${truncated ? '（已达上限，存在截断）' : ''}`
    sheet.getCell(3, 1).font = { size: 9, color: { argb: truncated ? 'FFB45309' : 'FF9CA3AF' } }
    sheet.getRow(1).height = 24

    const headerRow = sheet.getRow(HEADER_ROW)
    headerRow.height = 20
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    groupRows.forEach((row) => {
      sheet.addRow(columns.map((col) => {
        const value = row[col.key]
        return value === null || value === undefined || value === '' ? '-' : value
      }))
    })
  })

  return workbook.xlsx.writeBuffer()
}

/** Excel：标题区 + 样式化数据 sheet + 图表 sheet（可选）+ 说明 sheet */
async function buildXlsx({ title, specText, summary, columns, rows, truncated, compare, chartImage }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OMS 智能报表'

  const HEADER_ROW = 4
  const sheet = workbook.addWorksheet('数据', { views: [{ state: 'frozen', ySplit: HEADER_ROW }] })
  sheet.columns = columns.map((col) => ({
    header: col.label,
    key: col.key,
    width: Math.min(Math.max(col.label.length * 2 + 6, 12), 40),
  }))

  // 标题区（第 1~3 行，跨列合并）
  const span = Math.max(columns.length, 1)
  sheet.mergeCells(1, 1, 1, span)
  sheet.getCell(1, 1).value = title
  sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF111827' } }
  sheet.mergeCells(2, 1, 2, span)
  sheet.getCell(2, 1).value = `统计口径：${specText}`
  sheet.getCell(2, 1).font = { size: 9, color: { argb: 'FF4B5563' } }
  sheet.mergeCells(3, 1, 3, span)
  sheet.getCell(3, 1).value = `导出时间：${exportTimeText()}${truncated ? '；数据行数已达上限，存在截断' : ''}`
  sheet.getCell(3, 1).font = { size: 9, color: { argb: truncated ? 'FFB45309' : 'FF9CA3AF' } }
  sheet.getRow(1).height = 24

  // 表头：深紫底白字
  const headerRow = sheet.getRow(HEADER_ROW)
  headerRow.height = 20
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDD6FE' } } }
  })

  // 数据行：斑马纹 + 指标右对齐 + 涨跌红绿
  const thin = { style: 'thin', color: { argb: 'FFE5E7EB' } }
  rows.forEach((row, r) => {
    const excelRow = sheet.addRow(columns.map((col) => {
      const value = row[col.key]
      if (value === null || value === undefined) return isPctCol(col.key) || isDeltaCol(col.key) ? '-' : (col.kind === 'metric' ? 0 : '-')
      return value
    }))
    excelRow.eachCell((cell, colNumber) => {
      const col = columns[colNumber - 1]
      if (!col) return
      cell.border = { bottom: thin }
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      if (col.kind === 'metric') {
        cell.alignment = { horizontal: 'right' }
        const num = Number(cell.value)
        if (isPctCol(col.key) && Number.isFinite(num)) cell.numFmt = '+0.0"%";-0.0"%";"-"'
        else if (isDeltaCol(col.key) && Number.isFinite(num)) cell.numFmt = col.unit === 'cny' ? '+"¥"#,##0.00;-"¥"#,##0.00;"¥"0' : '+#,##0.##;-#,##0.##;0'
        else if (Number.isFinite(num) && col.unit === 'cny') cell.numFmt = '"¥"#,##0.00'
        else if (Number.isFinite(num)) cell.numFmt = '#,##0.##' // 大金额千分位
        const color = trendColor(col.key, cell.value)
        if (color) cell.font = { color: { argb: `FF${color.slice(1).toUpperCase()}` } }
      }
    })
  })

  // 列宽自适应：扫描前 200 行
  columns.forEach((col, idx) => {
    let width = sheet.columns[idx].width
    for (const row of rows.slice(0, 200)) {
      const len = String(displayValue(col, row[col.key])).length
      width = Math.min(Math.max(width, len * 2 + 4), 50)
    }
    sheet.columns[idx].width = width
  })

  // 图表 sheet：嵌入前端图表截图
  const chartBuf = chartImageBuffer(chartImage)
  if (chartBuf) {
    const chartSheet = workbook.addWorksheet('图表')
    const imageId = workbook.addImage({ base64: chartBuf.toString('base64'), extension: 'png' })
    chartSheet.addImage(imageId, 'B2:P30')
  }

  const info = workbook.addWorksheet('说明')
  info.columns = [{ width: 16 }, { width: 90 }]
  info.addRow(['报表名称', title])
  info.addRow(['统计口径', specText])
  if (compare) info.addRow(['对比周期', compare.label])
  info.addRow(['数据行数', rows.length + (truncated ? '（已达上限，存在截断）' : '')])
  info.addRow(['AI 摘要', summary || '（无）'])
  info.addRow(['导出时间', exportTimeText()])
  info.getColumn(1).font = { bold: true }
  info.getRow(compare ? 5 : 4).alignment = { wrapText: true, vertical: 'top' }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** PDF：标题 + 口径 + 摘要 + 图表截图（可选）+ 样式化表格 + 页脚页码 */
function buildPdf({ title, specText, summary, columns, rows, truncated, compare, chartImage }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const fonts = registerFonts(doc)
    const pageWidth = doc.page.width - 80 // margin 40 ×2
    const bottom = doc.page.height - 50

    // 标题 + 品牌色条
    doc.rect(40, 40, 4, 18).fill('#4c1d95')
    doc.font(fonts.bold).fontSize(15).fillColor('#111827').text(title, 52, 40)
    doc.moveDown(0.4)
    doc.font(fonts.regular).fontSize(9).fillColor('#4b5563').text(`统计口径：${specText}`, 40)
    if (summary) {
      doc.moveDown(0.3)
      doc.font(fonts.regular).fontSize(9).fillColor('#111827').text(`AI 摘要：${summary}`, { width: pageWidth })
    }
    if (truncated) {
      doc.font(fonts.regular).fontSize(8).fillColor('#b45309').text('注：数据行数较多，PDF 仅收录前若干行，完整数据请导出 Excel。')
    }
    doc.moveDown(0.5)

    // 图表截图
    const chartBuf = chartImageBuffer(chartImage)
    if (chartBuf) {
      const imgHeight = 240
      if (doc.y + imgHeight > bottom) doc.addPage()
      doc.image(chartBuf, 40, doc.y, { fit: [pageWidth, imgHeight], align: 'center' })
      doc.y += imgHeight + 12
    }

    // 表格：维度列宽权重 1.4，指标列 1.0
    const weights = columns.map((c) => (c.kind === 'dimension' ? 1.4 : 1))
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    const colWidths = weights.map((w) => (pageWidth * w) / totalWeight)
    const rowHeight = 18

    const drawRow = (values, { bold = false, header = false, zebra = false } = {}) => {
      let y = doc.y
      if (y + rowHeight > bottom) {
        doc.addPage()
        doc.y = 40
        drawRow(columns.map((c) => c.label), { bold: true, header: true })
        y = doc.y
      }
      if (header) doc.rect(40, y, pageWidth, rowHeight).fill('#4c1d95')
      else if (zebra) doc.rect(40, y, pageWidth, rowHeight).fill('#f5f3ff')
      values.forEach((value, i) => {
        const col = columns[i]
        const trend = !header && col ? trendColor(col.key, value) : null
        doc.font(bold ? fonts.bold : fonts.regular).fontSize(8)
        doc.fillColor(header ? '#ffffff' : trend || '#111827')
        const x = 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0)
        doc.text(header ? String(value ?? '') : displayValue(col, value), x + 3, y + 4, {
          width: colWidths[i] - 6,
          height: rowHeight - 4,
          lineBreak: false,
          ellipsis: true,
          align: col && col.kind === 'metric' ? 'right' : 'left',
        })
      })
      doc.moveTo(40, y + rowHeight).lineTo(40 + pageWidth, y + rowHeight).lineWidth(0.25).strokeColor('#e5e7eb').stroke()
      doc.y = y + rowHeight
    }

    drawRow(columns.map((c) => c.label), { bold: true, header: true })
    rows.forEach((row, i) => {
      drawRow(columns.map((c) => row[c.key]), { zebra: i % 2 === 1 })
    })

    // 页脚：品牌 + 导出时间 + 页码（每页）
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i)
      doc.font(fonts.regular).fontSize(7).fillColor('#9ca3af')
      doc.text(
        `OMS 智能报表 · 导出于 ${exportTimeText()} · 第 ${i + 1} / ${range.start + range.count} 页`,
        40,
        doc.page.height - 36,
        { width: pageWidth, align: 'center', lineBreak: false },
      )
    }

    doc.end()
  })
}

module.exports = { buildXlsx, buildDetailXlsx, buildPdf, exportFileName }
