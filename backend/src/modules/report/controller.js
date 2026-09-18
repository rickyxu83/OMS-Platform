/**
 * 智能报表控制器（spec 014）：对话生成 / 预览 / 导出 / 模板 / 订阅。
 * 所有接口由 routes.js 统一加 requirePermission('report.use')（主管及以上）。
 */
const assistant = require('./assistant')
const { runSpec, validateSpec } = require('./engine')
const { buildXlsx, buildPdf, exportFileName } = require('./export')
const { DATASETS } = require('./datasets')
const store = require('./store')
const { badRequest, notFound } = require('../../utils/http-error')

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 数据集元数据（前端展示可选维度/指标/筛选用；只暴露标签与可选项，不暴露 SQL 片段） */
async function datasets(req, res) {
  res.json({
    items: Object.values(DATASETS).map((ds) => ({
      key: ds.key,
      label: ds.label,
      description: ds.description,
      timeFields: Object.entries(ds.timeFields).map(([key, v]) => ({ key, label: v.label })),
      defaultTimeField: ds.defaultTimeField,
      dimensions: Object.entries(ds.dimensions).map(([key, v]) => ({ key, label: v.label })),
      metrics: Object.entries(ds.metrics).map(([key, v]) => ({ key, label: v.label })),
      filters: Object.entries(ds.filters).map(([key, v]) => ({
        key,
        label: v.label,
        type: v.type,
        options: v.options || null,
      })),
    })),
  })
}

/**
 * 对话一轮：body.messages 为会话历史（末条须为 user）。
 * AI 产出 spec 时后端立即校验并出预览 + AI 摘要；校验失败把原因并入 reply 返回（不 500）。
 */
async function chat(req, res) {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : []
  const result = await assistant.chat(messages)

  if (!result.spec) {
    return res.json({ reply: result.reply, spec: null })
  }

  const { errors, spec } = validateSpec(result.spec)
  if (!spec) {
    return res.json({
      reply: `${result.reply}\n\n（这张报表我暂时生成不了：${errors.join('；')}。可以换个说法，或换用支持的维度/指标。）`,
      spec: null,
    })
  }

  const preview = await runSpec(spec, { limit: 200 })
  const summary = preview.rows.length ? await assistant.summarize(preview.specText, preview.columns, preview.rows) : ''
  res.json({
    reply: result.reply,
    spec: preview.spec,
    specText: preview.specText,
    columns: preview.columns,
    rows: preview.rows,
    total: preview.total,
    truncated: preview.truncated,
    summary,
  })
}

/** 按 spec 直接出预览（模板重跑用） */
async function preview(req, res) {
  const result = await runSpec(req.body?.spec, { limit: 200 })
  const summary = result.rows.length ? await assistant.summarize(result.specText, result.columns, result.rows) : ''
  res.json({
    spec: result.spec,
    specText: result.specText,
    columns: result.columns,
    rows: result.rows,
    total: result.total,
    truncated: result.truncated,
    summary,
  })
}

/** 导出：body { spec, format: 'xlsx'|'pdf', summary? } */
async function exportReport(req, res) {
  const format = String(req.body?.format || 'xlsx')
  if (!['xlsx', 'pdf'].includes(format)) throw badRequest('format 仅支持 xlsx / pdf')
  const limit = format === 'pdf' ? 300 : 1000
  const result = await runSpec(req.body?.spec, { limit })
  const datasetLabel = DATASETS[result.spec.dataset].label
  const title = String(req.body?.title || '').trim().slice(0, 100) || `${datasetLabel}报表`
  const summary = String(req.body?.summary || '').trim().slice(0, 800)

  const payload = { title, specText: result.specText, summary, columns: result.columns, rows: result.rows, truncated: result.truncated }
  if (format === 'pdf') {
    const buffer = await buildPdf(payload)
    const filename = exportFileName(datasetLabel, 'pdf')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="report-${Date.now()}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Length', buffer.length)
    return res.end(buffer)
  }
  const buffer = await buildXlsx(payload)
  const filename = exportFileName(datasetLabel, 'xlsx')
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
  res.setHeader('Content-Disposition', `attachment; filename="report-${Date.now()}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.setHeader('Content-Length', buffer.length)
  res.end(buffer)
}

async function listTemplates(req, res) {
  res.json({ items: await store.listTemplates(req.user.id) })
}

async function createTemplate(req, res) {
  const name = String(req.body?.name || '').trim().slice(0, 100)
  if (!name) throw badRequest('模板名称不能为空')
  const { errors, spec } = validateSpec(req.body?.spec)
  if (!spec) throw badRequest(`报表定义无效：${errors.join('；')}`)
  const chartType = ['table', 'bar', 'line', 'pie'].includes(req.body?.chartType) ? req.body.chartType : null
  const template = await store.createTemplate({ name, spec, chartType, userId: req.user.id })
  res.status(201).json(template)
}

async function deleteTemplate(req, res) {
  const deleted = await store.deleteTemplate(Number(req.params.id), req.user.id)
  if (!deleted) throw notFound('模板不存在')
  res.status(204).end()
}

/** 订阅 upsert：body { frequency: 'weekly'|'monthly', recipients?, enabled? } */
async function upsertSubscription(req, res) {
  const templateId = Number(req.params.id)
  const template = await store.getTemplate(templateId, req.user.id)
  if (!template) throw notFound('模板不存在')
  const frequency = String(req.body?.frequency || '')
  if (!['weekly', 'monthly'].includes(frequency)) throw badRequest('frequency 仅支持 weekly / monthly')
  const recipients = String(req.body?.recipients || '').trim().slice(0, 500)
  const enabled = req.body?.enabled !== false
  const updated = await store.upsertSubscription({ templateId, frequency, recipients, enabled, userId: req.user.id })
  res.json(updated)
}

async function deleteSubscription(req, res) {
  const template = await store.getTemplate(Number(req.params.id), req.user.id)
  if (!template) throw notFound('模板不存在')
  await store.removeSubscription(template.id, req.user.id)
  res.status(204).end()
}

module.exports = {
  datasets,
  chat,
  preview,
  exportReport,
  listTemplates,
  createTemplate,
  deleteTemplate,
  upsertSubscription,
  deleteSubscription,
}
