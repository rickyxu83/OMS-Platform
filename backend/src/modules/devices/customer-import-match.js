const { customerNameKey, toSimplified } = require('../../utils/chinese')

const legalSuffixes = Object.freeze([
  '有限责任公司',
  '集团股份有限公司',
  '股份有限公司',
  '集团有限公司',
  '有限公司',
  '集团公司',
  '分公司',
  '公司',
])

const genericBusinessTerms = Object.freeze(['电子科技', '科技', '电子'])

const locationAliases = Object.freeze([
  ['成都市', '成都'],
  ['上海市', '上海'],
  ['苏州市', '苏州'],
  ['合肥市', '合肥'],
  ['深圳市', '深圳'],
  ['常熟市', '常熟'],
  ['扬州市', '扬州'],
  ['镇江市', '镇江'],
  ['惠州市', '惠州'],
  ['吴江市', '吴江'],
  ['东莞市', '东莞'],
  ['中山市', '中山'],
  ['南京市', '南京'],
  ['嘉兴市', '嘉兴'],
  ['天津市', '天津'],
  ['广州市', '广州'],
  ['昆山市', '昆山'],
  ['福州市', '福州'],
  ['青岛市', '青岛'],
  ['厦门市', '厦门'],
  ['独墅湖', '独墅湖'],
  ['上海', '上海'],
  ['苏州', '苏州'],
  ['合肥', '合肥'],
  ['成都', '成都'],
  ['深圳', '深圳'],
  ['常熟', '常熟'],
  ['扬州', '扬州'],
  ['镇江', '镇江'],
  ['惠州', '惠州'],
  ['吴江', '吴江'],
  ['东莞', '东莞'],
  ['中山', '中山'],
  ['南京', '南京'],
  ['嘉兴', '嘉兴'],
  ['天津', '天津'],
  ['广州', '广州'],
  ['昆山', '昆山'],
  ['福州', '福州'],
  ['青岛', '青岛'],
  ['厦门', '厦门'],
  ['江西', '江西'],
  ['江苏', '江苏'],
])

const retiredCompanyMerges = Object.freeze([
  {
    aliases: ['镭亚电子', '雷亚电子'],
    targetName: '镭亚电子（苏州）有限公司',
    matchType: '历史客户主体合并',
  },
])

function normalizedName(value) {
  return String(toSimplified(value) || '').trim()
}

function removeLegalSuffixes(value) {
  let key = value
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of legalSuffixes) {
      if (key.length > suffix.length + 1 && key.endsWith(suffix)) {
        key = key.slice(0, -suffix.length)
        changed = true
        break
      }
    }
  }
  return key
}

function looseCustomerKey(value) {
  return removeLegalSuffixes(customerNameKey(value))
}

function annotationFreeVariants(value) {
  const name = normalizedName(value)
  const variants = [name]
  const add = (candidate) => {
    const text = String(candidate || '').trim()
    if (text && !variants.includes(text)) variants.push(text)
  }

  add(name.replace(/[（(]([^()（）]*?)(?:备件)[）)]\s*$/u, (_matched, location) => location ? `（${location}）` : ''))

  const underscoreIndex = name.search(/[_＿]/u)
  if (underscoreIndex > 1) add(name.slice(0, underscoreIndex))

  const modelAfterLocation = name.match(/^(.+[）)])\s*[A-Za-z]+[A-Za-z0-9]*(?:[-_].*)?$/u)
  if (modelAfterLocation) add(modelAfterLocation[1])

  for (const candidate of [...variants]) {
    const hyphenIndex = candidate.search(/[-－—]/u)
    if (hyphenIndex > 1) add(candidate.slice(0, hyphenIndex))
  }

  return variants.length > 1 ? [...variants.slice(1), variants[0]] : variants
}

function companyProfile(value) {
  let key = removeLegalSuffixes(customerNameKey(value))
  const locations = new Set()
  for (const [text, canonical] of locationAliases) {
    if (!key.includes(text)) continue
    locations.add(canonical)
    key = key.split(text).join('')
  }
  for (const term of genericBusinessTerms) {
    key = key.split(term).join('')
  }
  return { core: key, locations }
}

function locationsConflict(left, right) {
  if (left.size && !right.size) return true
  if (!left.size || !right.size) return false
  return ![...left].some((location) => right.has(location))
}

function uniqueCustomer(matches) {
  const unique = [...new Map(matches.map((customer) => [String(customer.id), customer])).values()]
  return unique.length === 1 ? unique[0] : null
}

function findRetiredCompanyMerge(name, customers) {
  const key = customerNameKey(name)
  for (const rule of retiredCompanyMerges) {
    if (!rule.aliases.some((alias) => key.startsWith(customerNameKey(alias)))) continue
    const targetKey = customerNameKey(rule.targetName)
    const customer = uniqueCustomer(customers.filter((item) => customerNameKey(item.name) === targetKey))
    if (customer) return { customer, matchType: rule.matchType }
  }
  return null
}

function matchVariant(variant, customers) {
  const exact = uniqueCustomer(customers.filter((customer) => normalizedName(customer.name) === variant))
  if (exact) return { customer: exact, matchType: '标准名称匹配', exact: true }

  const key = customerNameKey(variant)
  const keyed = uniqueCustomer(customers.filter((customer) => String(customer.name_key || customerNameKey(customer.name)) === key))
  if (keyed) return { customer: keyed, matchType: '名称规范化', exact: false }

  const looseKey = looseCustomerKey(variant)
  if (looseKey.length >= 2) {
    const loose = uniqueCustomer(customers.filter((customer) => {
      const candidateKey = customerNameKey(customer.name)
      const candidateLooseKey = looseCustomerKey(customer.name)
      return candidateLooseKey === looseKey
        || (looseKey.length >= 4 && candidateKey.includes(looseKey))
    }))
    if (loose) return { customer: loose, matchType: '客户名简称匹配', exact: false }
  }

  const profile = companyProfile(variant)
  if (profile.core.length >= 2) {
    const structured = uniqueCustomer(customers.filter((customer) => {
      const candidate = companyProfile(customer.name)
      if (locationsConflict(profile.locations, candidate.locations)) return false
      if (candidate.core === profile.core) return true
      const shorter = profile.core.length <= candidate.core.length ? profile.core : candidate.core
      const longer = shorter === profile.core ? candidate.core : profile.core
      return shorter.length >= 3 && longer.startsWith(shorter)
    }))
    if (structured) return { customer: structured, matchType: '地区与企业简称匹配', exact: false }
  }

  return null
}

function resolveCustomerImportName(value, customers) {
  const inputCustomerName = normalizedName(value)
  if (!inputCustomerName) return { status: 'unmatched', inputCustomerName }

  const merged = findRetiredCompanyMerge(inputCustomerName, customers)
  if (merged) {
    return {
      status: 'corrected',
      inputCustomerName,
      customer: merged.customer,
      matchType: merged.matchType,
    }
  }

  const variants = annotationFreeVariants(inputCustomerName)
  for (const variant of variants) {
    const matched = matchVariant(variant, customers)
    if (!matched) continue
    const exact = matched.exact && variant === inputCustomerName
    return {
      status: exact ? 'exact' : 'corrected',
      inputCustomerName,
      matchedCustomerName: variant,
      customer: matched.customer,
      matchType: variant === inputCustomerName ? matched.matchType : `清理设备说明后${matched.matchType}`,
    }
  }

  return { status: 'unmatched', inputCustomerName }
}

function resolveCustomerImportRows(rows, customers, customerMappings = new Map()) {
  const customerById = new Map(customers.map((customer) => [String(customer.id), customer]))
  const resolved = []
  const unmatched = []
  const invalid = []

  for (const row of rows) {
    if (row.customerId) {
      const customer = customerById.get(String(row.customerId))
      if (customer) resolved.push({ row, customer, status: 'exact', matchType: '客户ID匹配' })
      else invalid.push({ row, reason: '客户ID不存在或无权限' })
      continue
    }

    const matched = resolveCustomerImportName(row.customerName, customers)
    if (matched.status !== 'unmatched') {
      resolved.push({
        row,
        customer: matched.customer,
        status: matched.status,
        matchType: matched.matchType,
      })
      continue
    }

    const mappedCustomerId = customerMappings.get(customerNameKey(row.customerName))
    if (!mappedCustomerId) {
      unmatched.push(row)
      continue
    }
    const customer = customerById.get(String(mappedCustomerId))
    if (!customer) {
      invalid.push({ row, reason: '人工选择的客户不存在或无权限' })
      continue
    }
    resolved.push({ row, customer, status: 'corrected', matchType: '人工确认' })
  }

  return {
    resolved,
    unmatched,
    invalid,
    canImport: unmatched.length === 0 && invalid.length === 0,
    requiresConfirmation: resolved.some((item) => item.status === 'corrected'),
  }
}

module.exports = {
  annotationFreeVariants,
  companyProfile,
  resolveCustomerImportName,
  resolveCustomerImportRows,
}
