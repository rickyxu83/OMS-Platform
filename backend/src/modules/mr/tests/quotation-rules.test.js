/** 识别规则引擎 + 规则教练变换执行器 单元测试（合成数据，虚构料号价格）。 */
const assert = require('assert')
const { classifyComponent, summarizeComponents, applyStructuredRules, categoryMatches } = require('../lib/quotation-rules')
const { applyTransform } = require('../lib/quote-coach')

/* ---- 组件归类器 ---- */
assert.equal(classifyComponent({ part: 'P67093-B21', description: 'INT Xeon-S 4516Y+ CPU for HPE' }), 'cpu')
assert.equal(classifyComponent({ part: 'P64706-B21', description: 'HPE 32GB 2Rx8 PC5-5600B-R Smart Kit' }), 'memory')
assert.equal(classifyComponent({ part: 'P28586-B21', description: 'HPE 1.2TB SAS 10K SFF BC HDD' }), 'disk')
assert.equal(classifyComponent({ part: 'P58335-B21', description: 'HPE MR408i-o Gen11 SPDM Storage Controller' }), 'raid')
assert.equal(classifyComponent({ part: 'P26253-B21', description: 'BCM 57416 10GbE 2p BASE-T Adptr' }), 'nic')
assert.equal(classifyComponent({ part: 'P38995-B21', description: 'HPE 800W FS Plat Ht Plg LH PS Kit' }), 'psu')
assert.equal(classifyComponent({ part: 'P52341-B21', description: 'HPE DL3XX Gen11 Easy Install Rail Kit' }), 'rail')
assert.equal(classifyComponent({ part: 'BD505A', description: 'HPE iLO Adv incl 3yr TSU 1-Svr Lic' }), 'software')
assert.equal(classifyComponent({ part: 'XX', description: '杂项' }), 'other')

/* ---- 组件摘要 ---- */
const bom = [
  { group: 'SDD', part: 'AA100-B21', description: 'ACME DemoServer CTO Svr', qty: 1 },
  { group: 'SDD', part: 'AA100-B21#0D1', description: 'Factory integrated', qty: 1 },
  { group: 'SDD', part: 'BB200-B21', description: 'INT Xeon-S 4516Y+ CPU for HPE', qty: 2 },
  { group: 'SDD', part: 'CC300-B21', description: 'HPE 32GB 2Rx8 PC5-5600B-R Smart Kit', qty: 4 },
  { group: 'SDD', part: 'DD400-B21', description: 'HPE 1.2TB SAS 10K SFF BC HDD', qty: 6 },
  { group: 'SDD', part: 'EE500-B21', description: 'HPE 800W FS Plat Ht Plg LH PS Kit', qty: 2 },
]
const summary = summarizeComponents(bom, ['cpu', 'memory', 'disk'])
assert(summary.includes('CPU'), '摘要含 CPU')
assert(summary.includes('×2'), 'CPU 数量合并')
assert(summary.includes('×4') && summary.includes('×6'), '内存/硬盘数量合并')
assert(!summary.includes('Rail'), '未保留类别不进摘要')
assert(!summary.includes('Factory integrated'), '影子行不单独列出')
assert(summary.includes('其他配件'), '未保留类别折叠计数')

/* ---- 品类匹配 ---- */
assert(categoryMatches('服务器/CTO Svr', { name: 'HPE DL380 Gen11 8SFF NC CTO Svr' }))
assert(categoryMatches('服务器', { name: 'x', description: '机架式服务器 2U' }))
assert(!categoryMatches('服务器', { name: '华为交换机 S5735' }))

/* ---- 规则引擎 ---- */
const parsed = {
  sheets: [{
    vendor: 'ACME 科技',
    items: [
      { name: 'ACME DemoServer CTO Svr', description: '全量 BOM…', part_no: '900001-01', components: bom },
      { name: '华为交换机', description: 'S5735', part_no: 'S5735', components: [] },
    ],
  }],
}
const rules = [
  { id: 1, scope_type: 'category', scope_value: 'CTO Svr', action_type: 'summarize_components', params: { keep: ['cpu', 'memory', 'disk'] } },
  { id: 2, scope_type: 'vendor', scope_value: '别的供应商', action_type: 'summarize_components', params: { keep: ['cpu'] } },
  { id: 3, scope_type: 'global', scope_value: '', action_type: 'prompt_rule', params: null },
]
const ruled = applyStructuredRules(parsed, rules)
assert.deepEqual(ruled.applied, [1], '只有作用域命中的结构化规则执行')
const item0 = ruled.parsed.sheets[0].items[0]
assert(item0.description.includes('（其他配件'), '命中品项描述被摘要')
assert(item0.components.length === bom.length, '完整 BOM 保留')
assert(!ruled.parsed.sheets[0].items[1].summary_applied, '无 BOM 品项不受影响')

/* ---- 教练变换执行器 ---- */
// summarize_components
const coachItems = [{ name: 'ACME DemoServer CTO Svr', description: '全量', part_no: 'P1', components: bom }]
const t1 = applyTransform(coachItems, { type: 'summarize_components', keep: ['cpu', 'disk'] })
assert(t1 && t1[0].description.includes('CPU'), '教练摘要变换生效')
assert(!t1[0].description.includes('32GB'), '未选类别不出现')
// 非法 keep
assert.equal(applyTransform(coachItems, { type: 'summarize_components', keep: ['hacker'] }), null)
// item_edit 白名单
const t2 = applyTransform(coachItems, { type: 'item_edit', edits: [{ index: 0, fields: { name: '新名字', unit_price: 99999, qty: 99 } }] })
assert.equal(t2[0].name, '新名字', '白名单字段可改')
assert.equal(t2[0].unit_price, undefined, '价格字段被拦截')
assert.equal(t2[0].qty, undefined, '数量字段被拦截')
// 越界 index / 未知类型
assert.equal(applyTransform(coachItems, { type: 'item_edit', edits: [{ index: 9, fields: { name: 'x' } }] }), null)
assert.equal(applyTransform(coachItems, { type: 'drop_table' }), null)

console.log('quotation-rules + quote-coach tests passed')
