/**
 * 报价文件金样回归测试。
 *
 * 机制：
 * - 扫描 tests/fixtures/quotations/（本地私有语料，含真实价格，已 gitignore 不提交）中的 .xls/.xlsx/.pdf
 * - Excel 走规则解析器（确定性）；PDF 走本地文本解析（确定性）。AI 路径不在此回归（由 quotation-ai-parser.test.js 覆盖）
 * - 首次运行自动生成 snapshots.local.json（学习模式），后续运行逐字段比对，不一致即红灯
 * - 所有品项统一校验“数量契约”：描述里不得出现数量/单价/金额字段片段
 *
 * 语料缺失时（如 CI 环境）软跳过。
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parseWorkbookWithMetadata, parsePdf, stripPriceFieldClauses } = require('../quotation-parser')

const FIXTURE_DIR = path.join(__dirname, '../../../../tests/fixtures/quotations')
const SNAPSHOT_FILE = path.join(FIXTURE_DIR, 'snapshots.local.json')

function summarize(parsed) {
  return (parsed.sheets || []).map((sheet) => ({
    title: sheet.title,
    documentType: parsed.documentType,
    untaxed_total: sheet.untaxed_total ?? null,
    total_amount: sheet.total_amount ?? null,
    discounted_total: sheet.discounted_total ?? null,
    items: (sheet.items || []).map((item) => ({
      name: item.name || '',
      description: item.description || '',
      qty: item.qty,
      unit_price: item.unit_price,
      extended: item.extended,
      part_no: item.part_no || '',
    })),
  }))
}

/** 算术自洽：文件自报总计时，品项合计必须能对上某个口径（未税/含税/优惠价及其税率折算）。 */
function consistencyError(sheet) {
  const sum = sheet.items.reduce((total, item) => total + (item.extended ?? (item.unit_price || 0) * (item.qty || 1)), 0)
  if (!sheet.items.length) return null
  const approx = (a, b) => a !== null && b !== null && b !== undefined && b !== 0 && Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005)
  const bases = []
  for (const declared of [sheet.untaxed_total, sheet.total_amount, sheet.discounted_total]) {
    if (declared === null || declared === undefined) continue
    bases.push(declared)
    for (const rate of [6, 13]) {
      bases.push(declared * (1 + rate / 100))
      bases.push(declared / (1 + rate / 100))
    }
  }
  if (!bases.length) return null // 文件无自报总计，无法算术校验
  if (bases.some((basis) => approx(sum, basis))) return null
  return `品项合计 ${sum.toFixed(2)} 与文件自报总计对不上（未税=${sheet.untaxed_total}, 含税=${sheet.total_amount}, 优惠=${sheet.discounted_total}）`
}

async function main() {
  if (!fs.existsSync(FIXTURE_DIR)) {
    console.log('quotation fixtures: 语料目录不存在，跳过（本地私有语料，不随仓库提交）')
    return
  }
  const files = fs.readdirSync(FIXTURE_DIR).filter((name) => /\.(xls|xlsx|pdf)$/i.test(name)).sort()
  if (!files.length) {
    console.log('quotation fixtures: 语料为空，跳过')
    return
  }
  const snapshots = fs.existsSync(SNAPSHOT_FILE) ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8')) : {}
  let learned = 0
  let checked = 0
  const failures = []

  for (const name of files) {
    const buffer = fs.readFileSync(path.join(FIXTURE_DIR, name))
    const parsed = name.toLowerCase().endsWith('.pdf')
      ? await parsePdf(buffer, name)
      : parseWorkbookWithMetadata(buffer, name)
    const actual = summarize(parsed)

    // 数量契约：所有品项描述不得包含数量/单价/金额字段片段（strip 后应与原文一致）
    for (const sheet of actual) {
      for (const item of sheet.items) {
        for (const field of [item.name, item.description]) {
          if (stripPriceFieldClauses(field) !== field) {
            failures.push(`${name}：品项「${item.name.slice(0, 30)}」描述含数量/价格字段片段：${JSON.stringify(field.slice(0, 80))}`)
          }
        }
      }
      const error = consistencyError(sheet)
      if (error) failures.push(`${name}：${error}`)
    }

    if (!snapshots[name]) {
      snapshots[name] = actual
      learned += 1
      continue
    }
    checked += 1
    try {
      assert.deepStrictEqual(actual, snapshots[name])
    } catch (error) {
      failures.push(`${name}：识别结果与快照不一致\n${String(error.message).slice(0, 600)}`)
    }
  }

  if (learned) {
    fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshots, null, 2)}\n`)
    console.log(`quotation fixtures: 学习模式为 ${learned} 份文件生成快照（ snapshots.local.json ），请人工核对后作为金样`)
  }
  console.log(`quotation fixtures: ${files.length} 份语料，比对 ${checked} 份，新学习 ${learned} 份`)
  if (failures.length) {
    console.error(`\n${failures.length} 处失败：`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log('quotation fixture tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
