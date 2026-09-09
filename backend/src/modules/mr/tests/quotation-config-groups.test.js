/**
 * 配置组收敛（实验引擎 v2）单元测试：HPE 整机 CTO 捆绑报价结构。
 * 合成数据（虚构料号与价格），覆盖：两组收敛 / BOM 入 components / 描述拍平 / 门控回退。
 */
const assert = require('assert')
const XLSX = require('xlsx')
const { collapseConfigGroups } = require('../lib/quotation-config-groups')

function buildWorkbook(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

const HEADER = ['序号', '产品编码', '描述', '数量', '单价(RMB)', '总价(RMB)']

// 组 1：两行 BOM（含 Factory integrated 影子行），组小计 1000，总计 2 套 2000
// 组 2：两行 BOM，组小计 900，总计 2 套 1800
const buffer = buildWorkbook([
  [],
  ['价格明细清单'],
  HEADER,
  [],
  [1, '900001-01+CTO-X #1', '', '', '', '', 'V1.0_1'],
  ['1_1', 'SDD'],
  ['', 'AA100-B21', 'ACME DemoServer G1 NC CTO Svr', 1, '', ''],
  ['', 'AA100-B21#0D1', 'Factory integrated', 1, '', ''],
  ['', 'BB200-B21', 'ACME 16GB Demo Memory Kit', 2, '', ''],
  ['', '配置组小计', '', '', 1000, ''],
  ['', '总计', '', '2套', 2000, ''],
  [],
  HEADER,
  [1, '900001-01+CTO-X #1', '', '', '', '', 'V1.0_1'],
  ['1_1', 'SDD'],
  ['', 'AA100-B21', 'ACME DemoServer G1 NC CTO Svr', 1, '', ''],
  ['', 'CC300-B21', 'ACME 1TB Demo Disk', 4, '', ''],
  ['', '配置组小计', '', '', 900, ''],
  ['', '总计', '', '2套', 1800, ''],
])

const result = collapseConfigGroups(buffer)
assert(result, '配置组结构应命中门控')
assert.equal(result.recognitionMethod, 'excel_config_group_v2')
assert.equal(result.sheets.length, 1)
const items = result.sheets[0].items
assert.equal(items.length, 2, '两个配置组收敛为 2 个整机品项')

// 组 1
assert.equal(items[0].part_no, '900001-01+CTO-X #1')
assert.equal(items[0].name, 'ACME DemoServer G1 NC CTO Svr', '品名取 CTO 基准行描述')
assert.equal(items[0].qty, 2, '套数取自总计行')
assert.equal(items[0].unit_price, 1000, '单价取配置组小计')
assert.equal(items[0].extended, 2000, '小计取总计行金额')
assert.equal(items[0].components.length, 3, 'BOM 全量入 components')
assert(items[0].description.startsWith('SDD; AA100-B21 ACME DemoServer G1 NC CTO Svr;'), '描述按人工口径拍平')
assert(items[0].description.includes('BB200-B21 ACME 16GB Demo Memory Kit'))

// 组 2
assert.equal(items[1].unit_price, 900)
assert.equal(items[1].extended, 1800)
assert.equal(items[1].components.length, 2)

// sheet 级税字段如实留空
assert.equal(result.sheets[0].tax_rate, null)
assert.equal(result.sheets[0].total_amount, null)
assert(result.warnings.some((w) => w.includes('实验引擎 v2')))

// 门控回退 1：普通有价明细表（无配置组小计行）
const normal = collapseConfigGroups(buildWorkbook([
  HEADER,
  [1, 'SW-4800', '交换机 48口', 2, 500, 1000],
  [2, 'CB-5M', '跳线 5米', 10, 10, 100],
]))
assert.equal(normal, null, '普通报价表不命中门控，回退常规解析')

// 门控回退 2：有「配置组小计」字样但无组头/BOM（防止误接管）
const fake = collapseConfigGroups(buildWorkbook([
  HEADER,
  ['', '配置组小计', '', '', 100, ''],
]))
assert.equal(fake, null, '无配置组结构时即使有标签也不接管')

console.log('quotation-config-groups tests passed')
