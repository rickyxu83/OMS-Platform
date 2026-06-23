function salesScopeIdentities(user) {
  return [
    user?.real_name,
    user?.realName,
    user?.username,
    user?.email,
    user?.login_alias,
    user?.loginAlias,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
}

function salesCanAccessSalesperson(salesperson, user) {
  if (user?.role !== 'sales') return true
  const owner = String(salesperson || '').trim()
  if (!owner) return true
  return salesScopeIdentities(user).includes(owner)
}

function buildSalesCustomerScope(user, customerAlias = 'c', prefix = 'salesScope') {
  if (user?.role !== 'sales') return { sql: '', params: {} }

  const identities = salesScopeIdentities(user)
  const params = {}
  const identityPlaceholders = identities.map((value, index) => {
    const key = `${prefix}Identity${index}`
    params[key] = value
    return `:${key}`
  })
  const assignedClause = identityPlaceholders.length
    ? ` OR ${customerAlias}.salesperson IN (${identityPlaceholders.join(',')})`
    : ''

  return {
    sql: `AND (${customerAlias}.salesperson IS NULL OR ${customerAlias}.salesperson = ''${assignedClause})`,
    params,
  }
}

function assertSalesCanUseSalesperson(salesperson, user, forbidden) {
  if (user?.role !== 'sales') return
  if (salesCanAccessSalesperson(salesperson, user)) return
  throw forbidden('普通业务只能选择自己作为对应销售，或保持未分配销售')
}

function assertSalesCanAccessSalesperson(salesperson, user, forbidden) {
  if (user?.role !== 'sales') return
  if (salesCanAccessSalesperson(salesperson, user)) return
  throw forbidden('无权访问该销售归属的数据')
}

module.exports = {
  salesScopeIdentities,
  salesCanAccessSalesperson,
  buildSalesCustomerScope,
  assertSalesCanUseSalesperson,
  assertSalesCanAccessSalesperson,
}
