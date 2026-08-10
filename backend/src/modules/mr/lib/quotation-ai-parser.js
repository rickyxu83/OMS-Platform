/** AI 报价识别：以多模态/文本大模型识别报价文件，输出与系统解析器对齐的 sheet 结构。 */
const XLSX = require('xlsx')
const env = require('../../../config/env')

const SYSTEM_PROMPT = [
  '你是专业的报价单/采购订单识别助手，擅长从图片和表格文本中提取结构化信息，能理解各种不同的报价单排版格式。',
  '请严格只输出一个合法 JSON 对象，不要输出任何其他文字，不要使用 Markdown 代码块。',
].join('\n')

const USER_PROMPT = [
  '请识别以下报价文件内容，提取报价单信息。',
  '',
  '要求：',
  '1. items 按文件中的行顺序排列，只包含真正的报价明细行（跳过表头、汇总、备注、签字等非明细行）',
  '2. qty / unitPrice / extended 输出为数字（不要千分位逗号、不要货币符号）；extended 以文件中的小计/金额为准',
  '3. name 保留品名原文（可修正明显的 OCR 错字）；description 可包含规格型号；partNo 为型号/料号，没有则填空字符串',
  '4. taxRate 用数字（如 13、6），无法判断填 null；taxIncluded 为布尔值，判断文件是否注明含税',
  '5. untaxedTotal 为未税总计、totalAmount 为含税总计，没有则填 null',
  '6. documentType 取值 "sales_quote"（销售报价/客户 PO）或 "purchase_quote"（供应商报价）',
  '7. vendor 为报价方/供应商公司名；customer 为客户公司名；attn 为联系人',
  '8. 如文件中公司名含"报价单"等字样请正确区分报价方与客户方',
  '',
  '输出 JSON 结构：',
  '{',
  '  "documentType": "purchase_quote",',
  '  "customer": "", "vendor": "", "attn": "", "payment": "", "delivery": "",',
  '  "taxRate": null, "taxIncluded": true, "untaxedTotal": null, "totalAmount": null,',
  '  "items": [{ "itemNo": 1, "partNo": "", "name": "", "description": "", "qty": 1, "unitPrice": 0, "extended": 0 }]',
  '}',
  '',
  '文件内容如下：',
].join('\n')

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function str(value) {
  return String(value === null || value === undefined ? '' : value).trim()
}

function extractJson(content) {
  const text = String(content || '').trim()
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try { return JSON.parse(fence[1].trim()) } catch (_error) { /* fall through */ }
  }
  try { return JSON.parse(text) } catch (_error) { /* fall through */ }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch (_error) { /* fall through */ }
  }
  return null
}

/** 把 AI 返回的 JSON 规范化为系统 sheet 结构；items 为空时返回 null。 */
function normalizeAiResult(ai, fileName) {
  const rawItems = Array.isArray(ai?.items) ? ai.items : []
  const items = rawItems.map((item, index) => {
    const qty = finiteNumber(item.qty)
    const unitPrice = finiteNumber(item.unitPrice)
    const extended = finiteNumber(item.extended)
    const name = str(item.name)
    const description = str(item.description) || name
    return {
      item_no: str(item.itemNo) || String(index + 1),
      part_no: str(item.partNo),
      name,
      description,
      qty: qty === null ? 1 : qty,
      unit_price: unitPrice === null ? 0 : unitPrice,
      extended: extended === null && qty !== null && unitPrice !== null ? qty * unitPrice : extended ?? 0,
    }
  }).filter((item) => item.name || item.part_no || item.description || item.qty > 0 || item.unit_price > 0)
  if (!items.length) return null
  return {
    title: fileName,
    customer: str(ai.customer),
    attn: str(ai.attn),
    seller: { from: str(ai.vendor) },
    vendor: str(ai.vendor),
    payment: str(ai.payment),
    delivery: str(ai.delivery),
    notes: [],
    tax_rate: finiteNumber(ai.taxRate),
    tax_included: ai.taxIncluded === true,
    untaxed_total: finiteNumber(ai.untaxedTotal),
    total_amount: finiteNumber(ai.totalAmount),
    items,
  }
}

/** Excel 工作簿 → 带行列结构的文本块（保留合并单元格的值）。 */
function workbookText(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const blocks = []
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null
    if (!range) continue
    const owner = new Map()
    for (const merge of worksheet['!merges'] || []) {
      for (let row = merge.s.r; row <= merge.e.r; row += 1) {
        for (let col = merge.s.c; col <= merge.e.c; col += 1) owner.set(`${row},${col}`, { r: merge.s.r, c: merge.s.c })
      }
    }
    const maxRow = Math.min(range.e.r, 150)
    const maxCol = Math.min(range.e.c, 40)
    const rows = []
    for (let row = 0; row <= maxRow; row += 1) {
      const cells = []
      for (let col = 0; col <= maxCol; col += 1) {
        const anchor = owner.get(`${row},${col}`) || { r: row, c: col }
        const cell = worksheet[XLSX.utils.encode_cell(anchor)]
        const value = cell && cell.v !== null && cell.v !== undefined ? String(cell.v).replace(/\s+/g, ' ').trim() : ''
        cells.push(value)
      }
      if (cells.some(Boolean)) rows.push(`${row + 1}: ${cells.join(' | ')}`)
    }
    if (rows.length) blocks.push(`[Sheet: ${sheetName}]\n${rows.join('\n')}`)
  }
  const text = blocks.join('\n\n').slice(0, 30000)
  return text ? [{ type: 'text', text }] : null
}

/** 通过 OCR 服务的 /render 端点把 PDF 渲染为图片消息。 */
async function pdfImageMessages(buffer, timeoutMs) {
  const ocrUrl = process.env.MR_OCR_URL || ''
  if (!ocrUrl) return null
  const origin = ocrUrl.replace(/\/ocr\/?$/, '')
  const renderUrl = `${origin}/render`
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), 'input.pdf')
  const response = await fetch(renderUrl, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(Number(timeoutMs || 120000)),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `渲染服务返回 ${response.status}`)
  const images = Array.isArray(payload.images) ? payload.images : []
  if (!images.length) return null
  return images.map((image) => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${image.data}` },
  }))
}

/** 调用 OpenAI-compatible chat completions 接口。 */
async function callAi(messages, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 60000)))
  try {
    const response = await fetchImpl(env.ai.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        messages,
        stream: false,
        max_tokens: 4000,
      }),
    })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (_error) { /* fall through */ }
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `AI provider HTTP ${response.status}`)
    }
    const content = data?.choices?.[0]?.message?.content || ''
    return content
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * AI 识别报价文件。成功返回 { sheets, recognitionMethod, documentType }；不可用/失败返回 null（由调用方降级）。
 * @param {Buffer} buffer 文件内容
 * @param {string} extension 小写扩展名（.xls/.xlsx/.pdf）
 * @param {string} fileName 原始文件名
 */
async function recognizeQuotationWithAi(buffer, extension, fileName, { fetchImpl = fetch } = {}) {
  if (!env.ai.quoteRecognitionEnabled) return null
  if (!env.ai.apiUrl || !env.ai.apiKey || !env.ai.model) return null
  const timeoutMs = env.ai.quoteTimeoutMs
  const isPdf = extension === '.pdf'
  const input = isPdf ? await pdfImageMessages(buffer, timeoutMs) : workbookText(buffer)
  if (!input || !input.length) return null
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: [{ type: 'text', text: USER_PROMPT }, ...input] },
  ]
  const content = await callAi(messages, timeoutMs, fetchImpl)
  const ai = extractJson(content)
  const sheet = normalizeAiResult(ai, fileName)
  if (!sheet) return null
  return {
    sheets: [sheet],
    documentType: ai?.documentType === 'sales_quote' ? 'sales_quote' : 'purchase_quote',
    recognitionMethod: isPdf ? 'ai_vision' : 'ai_text',
  }
}

module.exports = { recognizeQuotationWithAi, normalizeAiResult, extractJson, workbookText }
