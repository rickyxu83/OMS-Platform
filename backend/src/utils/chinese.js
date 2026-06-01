const OpenCC = require('opencc-js')

const toTraditionalConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })
const toSimplifiedConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })

function toTraditional(value) {
  if (value === null || value === undefined) return value
  return typeof value === 'string' ? toTraditionalConverter(value) : value
}

function toSimplified(value) {
  if (value === null || value === undefined) return value
  return typeof value === 'string' ? toSimplifiedConverter(value) : value
}

function toTraditionalDeep(value) {
  if (Array.isArray(value)) return value.map(toTraditionalDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toTraditionalDeep(item)]))
  }
  return toTraditional(value)
}

function toSimplifiedDeep(value, skippedKeys = new Set()) {
  if (Array.isArray(value)) return value.map((item) => toSimplifiedDeep(item, skippedKeys))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, skippedKeys.has(key) ? item : toSimplifiedDeep(item, skippedKeys)]),
    )
  }
  return toSimplified(value)
}

function customerNameKey(value) {
  return String(toSimplified(value) || '')
    .toLowerCase()
    .replace(/[\s　()（）【】\[\]《》<>.,，。;；:：'"“”‘’、/\\|-]/g, '')
    .trim()
}

module.exports = {
  toTraditional,
  toSimplified,
  toTraditionalDeep,
  toSimplifiedDeep,
  customerNameKey,
}
