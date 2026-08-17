async function recognizePdf(buffer, name) {
  const url = process.env.MR_OCR_URL
  if (!url) return null
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), name)
  const response = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(Number(process.env.MR_OCR_TIMEOUT_MS || 130000)) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `OCR 服务返回 ${response.status}`)
  return payload
}

module.exports = { recognizePdf }
