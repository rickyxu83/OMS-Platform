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
  '3. name 必须包含完整品名：若文件中“产品名称”与“型号及规格”分列，name 应组合为“产品名称 + 规格”（例如 “6类非屏蔽跳线 1米”、“LC-LC OM4光纤跳线 15米”），不得只填规格（如单独的 “1米”“15米”）；description 同样应包含产品名称与规格；partNo 为型号/料号：优先填写文件中的料号、序列号或型号编码（多个编码用 / 连接）；若文件包含设备清单/资产清单/序列号列表（可能与价格表分离、位于文件其他区域），请按顺序把每台设备的序列号写入对应品项的 partNo（第 n 个报价品项对应第 n 台设备的序列号）；尤其是 NetApp 设备，每台通常有一组两个序列号（多份文件中前后顺序可能不同），必须把所有序列号全部写入 partNo，不得遗漏或留空；不要填 MISC、FAS2750、维修、维保等短词或品名，确实没有任何编码时才填空字符串',
  '4. taxRate 用数字（如 13、6），无法判断填 null；taxIncluded 为布尔值，判断文件是否注明含税',
  '5. untaxedTotal 为未税总计、totalAmount 为含税总计，没有则填 null',
  '6. documentType 取值 "sales_quote"（销售报价/客户 PO）或 "purchase_quote"（供应商报价）',
  '7. vendor 为报价方/供应商公司名；customer 为客户公司名；attn 为联系人',
  '8. 如文件中公司名含“报价单”等字样请正确区分报价方与客户方',
  '9. entityKey 为该品项对应的设备/服务实体唯一标识（用于跨文件配对销售报价与供应商报价的同一设备）：存储/服务器/硬件填 品牌型号+序列号/料号（多个编码用 / 连接，例如 “FAS2750 存储 SN:952145001351/952145001204 + DS224C 扩展柜”）；维保/续保服务填 所覆盖设备的品牌型号（例如 “FAS2750 14+7T 维保”）。必须不含金额、单价、数量、日期。无法可靠判断则填空字符串',
  '',
  '输出 JSON 结构：',
  '{',
  '  "documentType": "purchase_quote",',
  '  "customer": "", "vendor": "", "attn": "", "payment": "", "delivery": "",',
  '  "taxRate": null, "taxIncluded": true, "untaxedTotal": null, "totalAmount": null,',
  '  "items": [{ "itemNo": 1, "partNo": "", "name": "", "description": "", "entityKey": "", "qty": 1, "unitPrice": 0, "extended": 0 }]',
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
      entityKey: str(item.entityKey),
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
        temperature: 0.2,
        thinking: { type: 'disabled' },
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
  if (sheet) {
    return {
      sheets: [sheet],
      documentType: ai?.documentType === 'sales_quote' ? 'sales_quote' : 'purchase_quote',
      recognitionMethod: isPdf ? 'ai_vision' : 'ai_text',
    }
  }
  // 重试一次：部分模型偶发返回空内容或解析失败，直接重发可显著提升成功率
  const retryContent = await callAi(messages, timeoutMs, fetchImpl)
  const retryAi = extractJson(retryContent)
  const retrySheet = normalizeAiResult(retryAi, fileName)
  if (!retrySheet) return null
  return {
    sheets: [retrySheet],
    documentType: retryAi?.documentType === 'sales_quote' ? 'sales_quote' : 'purchase_quote',
    recognitionMethod: isPdf ? 'ai_vision' : 'ai_text',
  }
}

/**
 * AI 跨文件实体归一化：把多份报价文件识别出的品项（不含金额）汇总给 AI，
 * 为每个品项分配统一的 entityKey（同一设备/服务实体的 key 完全相同），
 * 用于销售报价与供应商报价的跨文件配对。失败时静默降级（保持原 entityKey）。
 * @param {Array<{ name: string, sheets: Array<{ items: Array }> }>} sources
 */
async function applyAiEntityKeys(sources, { fetchImpl = fetch } = {}) {
  if (!env.ai.quoteRecognitionEnabled || !env.ai.apiUrl || !env.ai.apiKey || !env.ai.model) return
  const entries = []
  sources.forEach((source, sourceIndex) => {
    ;(source.sheets || []).forEach((sheet) => {
      ;(sheet.items || []).forEach((item, itemIndex) => {
        if (item.name || item.part_no || item.description || item.entityKey) {
          entries.push({ sourceIndex, itemIndex, name: str(item.name), partNo: str(item.part_no), description: str(item.description).slice(0, 200), entityKey: str(item.entityKey) })
        }
      })
    })
  })
  if (entries.length < 2) return
  const prompt = [
    '以下是多份报价文件识别出的品项（已去除金额，仅用于实体识别）：',
    JSON.stringify(entries.slice(0, 60)),
    '',
    '请判断哪些品项属于同一设备/服务实体（例如同一台存储设备的硬件采购与维保服务）。',
    '为每个品项重新分配统一的 entityKey：',
    '- 同一实体的所有品项必须使用完全相同的 entityKey 字符串（例如同一台 FAS2750 存储的维保报价与硬件报价，entityKey 都应为 "FAS2750 存储 SN:952145001351/952145001204"）',
    '- 不同实体必须使用不同的 entityKey',
    '- 命名规范：设备/服务对象 + 型号 + 序列号（无序列号则型号 + 配置，如 "FAS2750 14+7T 存储"）',
    '- 维保/服务品项与硬件配置品项：只要设备品牌型号一致（例如都含 "FAS2750" 且配置一致如 "14+7T"），且无证据表明是不同设备（如明确的另一序列号），应视为同一实体，分配完全相同的 entityKey；序列号不一致仅作为补充依据，不作为排除依据',
    '- 同一设备的不同组成部分（如存储机头与 DS224C 扩展柜）视为同一实体',
    '- 无法判断归属的品项给独立 entityKey 或空字符串',
    '严格只输出 JSON，不要其他文字：',
    '{ "items": [{ "sourceIndex": 0, "itemIndex": 0, "entityKey": "..." }] }',
  ].join('\n')
  const content = await callAi([
    { role: 'system', content: '你是设备实体识别助手，严格只输出合法 JSON。' },
    { role: 'user', content: prompt },
  ], env.ai.quoteTimeoutMs, fetchImpl)
  const result = extractJson(content)
  const mapping = Array.isArray(result?.items) ? result.items : []
  for (const entry of mapping) {
    const key = String(entry?.entityKey || '').trim()
    if (!key) continue
    const source = sources[Number(entry.sourceIndex)]
    const item = source?.sheets?.[0]?.items?.[Number(entry.itemIndex)]
    if (item) item.entityKey = key
  }
}

module.exports = { recognizeQuotationWithAi, normalizeAiResult, extractJson, workbookText, applyAiEntityKeys }
