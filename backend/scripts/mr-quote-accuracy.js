/**
 * MR 报价识别准确率报告（本地语料 + 人工修正 ground truth）。
 *
 * 数据源：tests/fixtures/quotations/（gitignored 本地私有语料，含真实供应商价格，不得提交）
 *   - ground-truth.local.json：测试服缓存的「识别原文 orig + 人工修正 corrected」对照
 *
 * 两种模式：
 *   cached（默认）：用测试服缓存的识别原文对比人工修正结果——反映“生产上真实发生过的识别准确率”，
 *                   不重新跑识别，AI 文件也能评估（orig 即当时的 AI 输出）
 *   replay         ：对每份文件重新跑当前代码的规则解析器再对比——评估“当前代码改动后的准确率”，
 *                   仅覆盖 Excel/PDF 文本确定性路径（AI 路径由 quotation-ai-parser.test.js 保障）
 *
 * 用法：
 *   NODE_ENV=development node scripts/mr-quote-accuracy.js           # cached 模式
 *   NODE_ENV=development node scripts/mr-quote-accuracy.js replay    # replay 模式
 *   NODE_ENV=development node scripts/mr-quote-accuracy.js cached 文件名片段   # 只看单个文件
 */
const fs = require('fs')
const path = require('path')
const { parseWorkbookWithMetadata, parsePdf } = require('../src/modules/mr/quotation-parser')

const FIXTURE_DIR = path.join(__dirname, '../tests/fixtures/quotations')
const GT_FILE = path.join(FIXTURE_DIR, 'ground-truth.local.json')

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const blank = (v) => v === null || v === undefined || v === ''
const near = (a, b, tol = 0.005) => a !== null && b !== null && Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * tol)
const strEq = (a, b) => String(a || '').trim() === String(b || '').trim()

/**
 * 对比一个品项：orig（识别输出）vs corr（人工修正后）。
 * corr 的 unit_price/extended 为未税口径（校对页字段）；orig 为文件原始口径。
 * 返回该品项的字段级差异分类。
 */
function compareItem(origItem, corrItem, sheetCtx) {
  const diffs = []
  // 文本字段
  for (const field of ['part_no', 'name']) {
    const o = origItem[field]; const c = corrItem[field]
    if (blank(o) && blank(c)) continue
    if (strEq(o, c)) continue
    diffs.push({ field, kind: blank(o) ? 'miss' : (blank(c) ? 'cleared' : 'wrong'), from: o, to: c })
  }
  // 数量
  if (!near(num(origItem.qty), num(corrItem.qty))) {
    diffs.push({ field: 'qty', kind: 'wrong', from: origItem.qty, to: corrItem.qty })
  }
  // 价格字段：corr 为未税口径，先判“税拆分”（orig 含税价 ÷ (1+税率) ≈ corr 未税价），再判错
  for (const field of ['unit_price', 'extended']) {
    const o = num(origItem[field]); const c = num(corrItem[field])
    if (near(o, c)) continue
    const rate = num(corrItem.tax_rate) ?? num(sheetCtx.tax_rate)
    const decomp = rate && o !== null && c !== null && near(o / (1 + rate / 100), c, 0.01)
    if (decomp) { diffs.push({ field, kind: 'tax_decomp', from: o, to: c, rate }); continue }
    if (o !== null && c === 0) { diffs.push({ field, kind: 'cleared_to_zero', from: o, to: c }); continue }
    diffs.push({ field, kind: blank(o) ? 'miss' : 'wrong', from: o, to: c })
  }
  // 品项级 vendor（corr 有 orig 无，算 sheet 级 vendor 未落到品项）
  if (!blank(corrItem.vendor) && !strEq(sheetCtx.vendor, corrItem.vendor)) {
    diffs.push({ field: 'vendor', kind: strEq(sheetCtx.vendor, corrItem.vendor) ? 'ok' : 'wrong', from: sheetCtx.vendor, to: corrItem.vendor })
  }
  return diffs
}

function compareFile(name, entry, origParsed) {
  const oSheet = (origParsed.parsed && origParsed.parsed.sheets && origParsed.parsed.sheets[0]) || (origParsed.sheets && origParsed.sheets[0]) || {}
  const cSheet = (entry.corrected.sheets && entry.corrected.sheets[0]) || {}
  const oItems = oSheet.items || []
  const cItems = cSheet.items || []
  const itemDiffs = []
  const n = Math.max(oItems.length, cItems.length)
  for (let i = 0; i < n; i++) {
    const o = oItems[i]; const c = cItems[i]
    if (!o && c) { itemDiffs.push({ row: i + 1, diffs: [{ field: '__row__', kind: 'miss_row' }] }); continue }
    if (o && !c) { itemDiffs.push({ row: i + 1, diffs: [{ field: '__row__', kind: 'extra_row' }] }); continue }
    const diffs = compareItem(o, c, oSheet)
    if (diffs.length) itemDiffs.push({ row: i + 1, diffs })
  }
  return {
    file: name,
    method: entry.method || (origParsed.recognitionMethod || '?'),
    itemCount: `${oItems.length}→${cItems.length}`,
    itemCountMatch: oItems.length === cItems.length,
    itemDiffs,
  }
}

function aggregate(reports) {
  const kindCount = {}
  const fieldKind = {}
  let filesClean = 0
  for (const rep of reports) {
    const hasRealIssue = rep.itemDiffs.some((d) => d.diffs.some((x) => !['tax_decomp'].includes(x.kind)))
    if (!hasRealIssue) filesClean++
    for (const row of rep.itemDiffs) {
      for (const d of row.diffs) {
        kindCount[d.kind] = (kindCount[d.kind] || 0) + 1
        const key = `${d.field}:${d.kind}`
        fieldKind[key] = (fieldKind[key] || 0) + 1
      }
    }
  }
  return { filesClean, filesWithIssues: reports.length - filesClean, kindCount, fieldKind }
}

async function main() {
  if (!fs.existsSync(GT_FILE)) {
    console.log('ground-truth.local.json 不存在（本地私有语料，未提交仓库），跳过。')
    return
  }
  const mode = process.argv[2] === 'replay' ? 'replay' : 'cached'
  const filter = process.argv[3] || process.argv[2] && process.argv[2] !== 'replay' && process.argv[2] !== 'cached' ? process.argv[3] || (process.argv[2] !== 'replay' && process.argv[2] !== 'cached' ? process.argv[2] : '') : ''
  const gt = JSON.parse(fs.readFileSync(GT_FILE, 'utf8'))
  const reports = []
  for (const [name, entry] of Object.entries(gt)) {
    if (filter && !name.includes(filter)) continue
    let origParsed = entry.orig
    if (mode === 'replay') {
      const filePath = path.join(FIXTURE_DIR, name)
      if (!fs.existsSync(filePath)) { console.log(`跳过（文件缺失）: ${name}`); continue }
      const buffer = fs.readFileSync(filePath)
      try {
        origParsed = name.toLowerCase().endsWith('.pdf')
          ? await parsePdf(buffer, name)
          : parseWorkbookWithMetadata(buffer, name)
      } catch (error) {
        origParsed = { parsed: { sheets: [] }, parseError: error.message }
      }
    }
    reports.push(compareFile(name, entry, origParsed))
  }
  const agg = aggregate(reports)
  console.log(`\n===== MR 报价识别准确率报告（${mode} 模式，${reports.length} 份有 ground truth 的文件）=====`)
  console.log(`无实质差异（仅税拆分或完全一致）: ${agg.filesClean} 份`)
  console.log(`有实质差异: ${agg.filesWithIssues} 份`)
  console.log('\n按差异类型:', JSON.stringify(agg.kindCount, null, 1))
  console.log('\n按字段×类型:')
  Object.entries(agg.fieldKind).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`))
  console.log('\n===== 逐文件明细 =====')
  for (const rep of reports.sort((a, b) => b.itemDiffs.length - a.itemDiffs.length)) {
    console.log(`\n[${rep.method}] ${rep.file}  品项 ${rep.itemCount}${rep.itemCountMatch ? '' : ' ⚠️数量不一致'}`)
    for (const row of rep.itemDiffs.slice(0, 15)) {
      for (const d of row.diffs) {
        const from = JSON.stringify(d.from)?.slice(0, 50)
        const to = JSON.stringify(d.to)?.slice(0, 50)
        console.log(`   行${row.row} ${d.field} [${d.kind}] ${from} → ${to}`)
      }
    }
    if (rep.itemDiffs.length > 15) console.log(`   ... 共 ${rep.itemDiffs.length} 行有差异`)
  }
}

main().catch((error) => { console.error('FATAL', error); process.exit(1) })
