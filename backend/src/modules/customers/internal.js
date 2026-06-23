const { customerNameKey } = require('../../utils/chinese')

const INTERNAL_CUSTOMER_NAME = '敦阳科技（内勤）'
const INTERNAL_CUSTOMER_NAME_KEY = customerNameKey(INTERNAL_CUSTOMER_NAME)

function isInternalCustomerName(name, nameKey = '') {
  return String(name || '').trim() === INTERNAL_CUSTOMER_NAME
    || String(nameKey || '').trim() === INTERNAL_CUSTOMER_NAME_KEY
}

module.exports = {
  INTERNAL_CUSTOMER_NAME,
  INTERNAL_CUSTOMER_NAME_KEY,
  isInternalCustomerName,
}
