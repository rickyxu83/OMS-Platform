const ExcelJS = require('exceljs')
const XLSX = require('xlsx')

const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff])
const JPEG_END = Buffer.from([0xff, 0xd9])

function carve(buffer, startSignature, endSignature, extension) {
  const images = []
  let offset = 0
  while (images.length < 10) {
    const start = buffer.indexOf(startSignature, offset)
    if (start < 0) break
    const endMarker = buffer.indexOf(endSignature, start + startSignature.length)
    if (endMarker < 0) break
    const end = endMarker + endSignature.length
    const image = buffer.subarray(start, end)
    if (image.length >= 500 && image.length <= 10 * 1024 * 1024) images.push({ buffer: image, extension })
    offset = end
  }
  return images
}

function extractBiffDrawingImages(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', bookFiles: true })
  const stream = workbook.cfb?.FileIndex?.find((entry) => entry.name === 'Workbook')?.content
  if (!stream) return []
  const drawing = []
  let active = false
  for (let offset = 0; offset + 4 <= stream.length;) {
    const type = stream.readUInt16LE(offset)
    const length = stream.readUInt16LE(offset + 2)
    const end = offset + 4 + length
    if (end > stream.length) break
    if (type === 0x00eb || type === 0x00ec) {
      active = true
      drawing.push(stream.subarray(offset + 4, end))
    } else if (type === 0x003c && active) {
      drawing.push(stream.subarray(offset + 4, end))
    } else {
      active = false
    }
    offset = end
  }
  const data = Buffer.concat(drawing)
  return [...carve(data, PNG_START, PNG_END, 'png'), ...carve(data, JPEG_START, JPEG_END, 'jpg')].slice(0, 10)
}

async function extractWorkbookImages(buffer, extension) {
  if (extension === '.xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    return (workbook.media || [])
      .filter((media) => media.type === 'image' && Buffer.isBuffer(media.buffer) && media.buffer.length >= 500)
      .slice(0, 10)
      .map((media) => ({ buffer: media.buffer, extension: String(media.extension || 'png').toLowerCase() }))
  }
  if (extension === '.xls') return extractBiffDrawingImages(buffer)
  return []
}

function companyCandidates(text) {
  const ownCompany = /(敦阳|敦陽|stark|dunyang)/i
  const suffix = /(?:有限责任公司|股份有限公司|有限公司|科技公司|电子公司|信息公司|實業股份|科技股份)/
  return [...new Set(String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[|{}\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1'))
    .filter((line) => line.length >= 4 && line.length <= 80 && suffix.test(line) && !ownCompany.test(line))
    .map((line) => line.replace(/^.*?[：:]\s*/, '').trim()))]
}

module.exports = { extractWorkbookImages, companyCandidates }
