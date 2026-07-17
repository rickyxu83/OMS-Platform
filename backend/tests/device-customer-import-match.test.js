const assert = require('node:assert/strict')
const { customerNameKey } = require('../src/utils/chinese')
const {
  resolveCustomerImportName,
  resolveCustomerImportRows,
  customerImportRequiresPreview,
  unresolvedCustomerImportErrors,
} = require('../src/modules/devices/customer-import-match')

const customerNames = [
  '上海禾新医院',
  '世巨科技(合肥）有限公司',
  '京隆科技(苏州)有限公司',
  '京隆科技独墅湖厂',
  '常熟精元电脑有限公司',
  '精元电脑(江苏)有限公司',
  '成都市世正科技有限公司',
  '精模电子科技(深圳)有限公司',
  '永丰余造纸（扬州）有限公司',
  '镭亚电子（苏州）有限公司',
  '江西联茂电子科技有限公司',
  '李长荣(惠州)高新材料有限公司',
  '敦阳科技（内勤）',
]

const customers = customerNames.map((name, index) => ({
  id: index + 1,
  name,
  name_key: customerNameKey(name),
}))

function expectMatch(input, expectedName, expectedStatus = 'corrected') {
  const result = resolveCustomerImportName(input, customers)
  assert.equal(result.status, expectedStatus, `${input} status`)
  assert.equal(result.customer?.name, expectedName, `${input} customer`)
  return result
}

expectMatch('頎中科技（苏州）', undefined, 'unmatched')
expectMatch('江西聯茂電子', '江西联茂电子科技有限公司')
expectMatch('李长荣(惠州)高新材料有限公司', '李长荣(惠州)高新材料有限公司', 'exact')
expectMatch('上海禾新醫院_FortiADC_100F', '上海禾新医院')
expectMatch('精元电脑（常熟）FGT101F-宿舍', '常熟精元电脑有限公司')
expectMatch('精元电脑（常熟）-201F-厂区', '常熟精元电脑有限公司')
expectMatch('合肥世巨科技', '世巨科技(合肥）有限公司')
expectMatch('成都世正', '成都市世正科技有限公司')
expectMatch('精模(深圳)', '精模电子科技(深圳)有限公司')
expectMatch('京隆科技-FTP-80E-1', '京隆科技(苏州)有限公司')
expectMatch('永丰余（扬州备件）', '永丰余造纸（扬州）有限公司')

const mergedNames = [
  '镭亚电子（常熟）',
  '镭亚电子（常熟备件）',
  '镭亚电子（上海镭明）',
  '雷亚电子（常熟）',
]
for (const name of mergedNames) {
  const result = expectMatch(name, '镭亚电子（苏州）有限公司')
  assert.equal(result.matchType, '历史客户主体合并')
  const plan = resolveCustomerImportRows([{ rowNumber: 4, customerName: name }], customers)
  assert.equal(plan.requiresConfirmation, true, `${name} must wait for user confirmation`)
  assert.equal(plan.resolved[0].matchType, '历史客户主体合并')
}

const similarCases = [
  ['精元电脑（吴江）', ['常熟精元电脑有限公司', '精元电脑(江苏)有限公司']],
  ['敦阳上海办', ['敦阳科技（内勤）']],
]
for (const [name, expectedCandidates] of similarCases) {
  const result = resolveCustomerImportName(name, customers)
  assert.equal(result.status, 'ambiguous', `${name} must show similar existing customers`)
  assert.deepEqual(result.candidates.map((customer) => customer.name), expectedCandidates)
  const plan = resolveCustomerImportRows([{ rowNumber: 5, customerName: name }], customers)
  assert.equal(plan.canImport, false)
  assert.equal(plan.ambiguous.length, 1)
  assert.deepEqual(plan.ambiguous[0].candidates.map((customer) => customer.name), expectedCandidates)
}

for (const name of ['深圳太普', '继仪']) {
  const result = resolveCustomerImportName(name, customers)
  assert.equal(result.status, 'unmatched', `${name} must be treated as missing`)
}

const unmatchedRows = [
  { rowNumber: 5, customerName: '深圳太普' },
  { rowNumber: 6, customerName: '继仪' },
]
const blockedPlan = resolveCustomerImportRows(unmatchedRows, customers)
assert.equal(blockedPlan.resolved.length, 0)
assert.deepEqual(blockedPlan.unmatched.map((row) => row.rowNumber), [5, 6])
assert.equal(blockedPlan.invalid.length, 0)
assert.equal(blockedPlan.canImport, false)
assert.equal(blockedPlan.requiresConfirmation, false)
assert.equal(customerImportRequiresPreview(blockedPlan, false), true)
assert.equal(customerImportRequiresPreview(blockedPlan, true), false)
assert.deepEqual(
  unresolvedCustomerImportErrors(blockedPlan).map((item) => item.message),
  ['客户不存在，请先在客户管理新增后重新导入', '客户不存在，请先在客户管理新增后重新导入'],
)

const similarFailurePlan = resolveCustomerImportRows(
  [{ rowNumber: 7, customerName: '精元电脑（吴江）' }],
  customers,
)
assert.deepEqual(unresolvedCustomerImportErrors(similarFailurePlan), [{
  row: similarFailurePlan.ambiguous[0].row,
  message: '发现相似客户但尚未确认，请选择对应客户后重新导入',
}])

const manualMappings = new Map([
  [customerNameKey('深圳太普'), customers[0].id],
  [customerNameKey('继仪'), customers[1].id],
])
const confirmedPlan = resolveCustomerImportRows(unmatchedRows, customers, manualMappings)
assert.equal(confirmedPlan.unmatched.length, 0)
assert.equal(confirmedPlan.invalid.length, 0)
assert.equal(confirmedPlan.canImport, true)
assert.equal(confirmedPlan.requiresConfirmation, true)
assert.equal(customerImportRequiresPreview(confirmedPlan, false), true)
assert.equal(customerImportRequiresPreview(confirmedPlan, true), false)
assert.deepEqual(confirmedPlan.resolved.map((item) => item.matchType), ['人工确认', '人工确认'])

const overriddenSuggestion = resolveCustomerImportRows(
  [{ rowNumber: 7, customerName: '頎中科技（苏州）' }],
  customers,
  new Map([[customerNameKey('頎中科技（苏州）'), customers[1].id]]),
)
assert.equal(overriddenSuggestion.resolved[0].customer.id, customers[1].id)
assert.equal(overriddenSuggestion.resolved[0].matchType, '人工确认')

const staleMapping = resolveCustomerImportRows(
  [{ rowNumber: 8, customerName: '不存在的客户' }],
  customers,
  new Map([[customerNameKey('不存在的客户'), 999999]]),
)
assert.equal(staleMapping.resolved.length, 0)
assert.equal(staleMapping.unmatched.length, 0)
assert.equal(staleMapping.canImport, false)
assert.equal(staleMapping.invalid[0].reason, '人工选择的客户不存在或无权限')

console.log('device customer import match tests passed')
