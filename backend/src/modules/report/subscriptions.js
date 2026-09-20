/**
 * 智能报表订阅推送（spec 014 P3 / spec 016）：每天 09:07（上海时间）由 scheduler 触发，
 * 日报每天发、周刊周一发、月刊每月 1 号发；同一天不重复发送。推送结果（成功/失败）写回订阅记录。
 */
const { runSpec } = require('./engine')
const { summarize } = require('./assistant')
const { buildXlsx, exportFileName } = require('./export')
const { DATASETS } = require('./datasets')
const store = require('./store')
const { sendReportSubscriptionMail } = require('../../services/mail')

function shanghaiParts(now = Date.now()) {
  const sh = new Date(now + 8 * 3600e3)
  return { date: sh.toISOString().slice(0, 10), day: sh.getUTCDate(), weekday: sh.getUTCDay() }
}

/** 是否到期：日报每天、周刊周一、月刊每月 1 日；当天已发过则跳过（last_sent_at 日期部分比较，9 点档不受时区歧义影响） */
function isDue(sub, parts) {
  if (sub.frequency === 'weekly' && parts.weekday !== 1) return false
  if (sub.frequency === 'monthly' && parts.day !== 1) return false
  if (sub.last_sent_at && String(sub.last_sent_at).slice(0, 10) === parts.date) return false
  return true
}

function recipientList(sub) {
  const custom = String(sub.recipients || '').split(/[,;\s，；]+/).map((s) => s.trim()).filter(Boolean)
  if (custom.length) return custom
  return sub.creator_email ? [sub.creator_email] : []
}

async function processReportSubscriptions() {
  const parts = shanghaiParts()
  const subs = await store.listEnabledSubscriptions()
  const results = []
  for (const sub of subs) {
    if (!isDue(sub, parts)) continue
    const spec = typeof sub.spec === 'object' ? sub.spec : (() => { try { return JSON.parse(sub.spec || 'null') } catch { return null } })()
    if (!spec) {
      console.error('[report] subscription skipped: bad spec', { id: sub.id })
      continue
    }
    try {
      const result = await runSpec(spec, { limit: 1000 })
      const summary = await summarize(result.specText, result.columns, result.rows)
      const datasetLabel = DATASETS[result.spec.dataset]?.label || 'report'
      const xlsxBuffer = await buildXlsx({
        title: sub.template_name,
        specText: result.specText,
        summary,
        columns: result.columns,
        rows: result.rows,
        truncated: result.truncated,
      })
      const sendResult = await sendReportSubscriptionMail({
        templateName: sub.template_name,
        frequency: sub.frequency,
        specText: result.specText,
        summary,
        columns: result.columns,
        rows: result.rows,
        xlsxBuffer,
        fileName: exportFileName(datasetLabel, 'xlsx'),
        recipients: recipientList(sub),
      })
      if (sendResult.sent) {
        await store.markSubscriptionSent(sub.id)
        results.push({ id: sub.id, sent: true, to: sendResult.to })
      } else {
        await store.markSubscriptionError(sub.id, `邮件未发送：${sendResult.reason || 'unknown'}`)
        results.push({ id: sub.id, ...sendResult })
        console.error('[report] subscription not sent', { id: sub.id, reason: sendResult.reason })
      }
    } catch (error) {
      console.error('[report] subscription failed', { id: sub.id, message: error?.message || error })
      await store.markSubscriptionError(sub.id, error?.message || error).catch(() => undefined)
      results.push({ id: sub.id, failed: true })
    }
  }
  return { checked: subs.length, results }
}

module.exports = { processReportSubscriptions, isDue, shanghaiParts }
