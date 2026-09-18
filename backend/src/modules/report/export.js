/**
 * 智能报表导出（spec 014）：Excel（exceljs）与 PDF（pdfkit，中文字体复用 service-record-pdf）。
 */
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const { registerFonts } = require('../service-orders/service-record-pdf')

function fileTimestamp(date = new Date()) {
  // 上海时区文件名时间戳
  const sh = new Date(date.getTime() + 8 * 3600e3)
  return sh.toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/^(\d{8})(\d{4})/, '$1-$2')
}

function exportFileName(datasetLabel, ext, date) {
  return `智能报表-${datasetLabel}-${fileTimestamp(date)}.${ext}`
}

/** Excel：数据 sheet + 说明 sheet（报表口径/摘要/导出时间） */
async function buildXlsx({ title, specText, summary, columns, rows, truncated }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OMS 智能报表'

  const sheet = workbook.addWorksheet('数据')
  sheet.columns = columns.map((col) => ({
    header: col.label,
    key: col.key,
    width: Math.min(Math.max(col.label.length * 2 + 6, 12), 40),
  }))
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) {
    sheet.addRow(columns.map((col) => row[col.key]))
  }
  // 简单列宽自适应：扫描前 200 行
  columns.forEach((col, idx) => {
    let width = sheet.columns[idx].width
    for (const row of rows.slice(0, 200)) {
      const len = String(row[col.key] ?? '').length
      width = Math.min(Math.max(width, len * 2 + 4), 50)
    }
    sheet.columns[idx].width = width
  })

  const info = workbook.addWorksheet('说明')
  info.columns = [{ width: 16 }, { width: 90 }]
  info.addRow(['报表名称', title])
  info.addRow(['统计口径', specText])
  info.addRow(['数据行数', rows.length + (truncated ? '（已达上限，存在截断）' : '')])
  info.addRow(['AI 摘要', summary || '（无）'])
  info.addRow(['导出时间', new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + '（上海时间）'])
  info.getColumn(1).font = { bold: true }
  info.getRow(4).alignment = { wrapText: true, vertical: 'top' }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** PDF：标题 + 口径 + 摘要 + 表格（行数上限由调用方控制） */
function buildPdf({ title, specText, summary, columns, rows, truncated }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const fonts = registerFonts(doc)
    const pageWidth = doc.page.width - 80 // margin 40 ×2
    const bottom = doc.page.height - 50

    doc.font(fonts.bold).fontSize(16).fillColor('#111827').text(title, { align: 'left' })
    doc.moveDown(0.3)
    doc.font(fonts.regular).fontSize(9).fillColor('#4b5563').text(`统计口径：${specText}`)
    if (summary) {
      doc.moveDown(0.3)
      doc.font(fonts.regular).fontSize(9).fillColor('#111827').text(`AI 摘要：${summary}`, { width: pageWidth })
    }
    if (truncated) {
      doc.font(fonts.regular).fontSize(8).fillColor('#b45309').text('注：数据行数较多，PDF 仅收录前若干行，完整数据请导出 Excel。')
    }
    doc.moveDown(0.6)

    const colWidth = pageWidth / columns.length
    const rowHeight = 18
    let y = doc.y

    const drawRow = (values, { bold = false, fill = null } = {}) => {
      if (y + rowHeight > bottom) {
        doc.addPage()
        y = 40
        drawRow(columns.map((c) => c.label), { bold: true, fill: '#f3f4f6' })
      }
      if (fill) doc.rect(40, y, pageWidth, rowHeight).fill(fill)
      doc.font(bold ? fonts.bold : fonts.regular).fontSize(8).fillColor('#111827')
      values.forEach((value, i) => {
        doc.text(String(value ?? ''), 42 + i * colWidth, y + 4, {
          width: colWidth - 6,
          height: rowHeight - 4,
          lineBreak: false,
          ellipsis: true,
        })
      })
      doc.moveTo(40, y + rowHeight).lineTo(40 + pageWidth, y + rowHeight).lineWidth(0.25).strokeColor('#e5e7eb').stroke()
      y += rowHeight
    }

    drawRow(columns.map((c) => c.label), { bold: true, fill: '#f3f4f6' })
    for (const row of rows) {
      drawRow(columns.map((c) => row[c.key]))
    }

    doc.font(fonts.regular).fontSize(7).fillColor('#9ca3af')
    doc.text(`OMS 智能报表 · 导出于 ${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')}（上海时间）`, 40, doc.page.height - 36)

    doc.end()
  })
}

module.exports = { buildXlsx, buildPdf, exportFileName }
