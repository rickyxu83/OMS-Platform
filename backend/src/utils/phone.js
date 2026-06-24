const DIRECT_AREA_CODES = new Set(['010', '020', '021', '022', '023', '024', '025', '027', '028', '029'])

function toHalfWidth(value) {
  return String(value || '')
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}

function stripChinaCountryCode(digits) {
  if (digits.startsWith('0086') && digits.length > 4) return digits.slice(4)
  if (digits.startsWith('86') && digits.length > 2 && /^[10]/.test(digits.slice(2, 3))) return digits.slice(2)
  return digits
}

function stripChinaCountryCodeGroups(groups) {
  if (!groups.length) return groups
  const [first, ...rest] = groups
  if (first === '86' || first === '0086') return rest
  if (first.startsWith('0086') && first.length > 4) return [first.slice(4), ...rest]
  if (first.startsWith('86') && first.length > 2 && /^[10]/.test(first.slice(2, 3))) return [first.slice(2), ...rest]
  return groups
}

function normalizeLandlineDigits(digits) {
  if (!/^0\d{9,}$/.test(digits)) return ''
  const areaLength = DIRECT_AREA_CODES.has(digits.slice(0, 3)) ? 3 : 4
  const area = digits.slice(0, areaLength)
  const rest = digits.slice(areaLength)
  if (rest.length < 7) return ''
  if (rest.length <= 8) return `${area}-${rest}`

  const mainLength = rest.length - 4 >= 7 && rest.length - 4 <= 8
    ? rest.length - 4
    : Math.min(8, rest.length)
  const main = rest.slice(0, mainLength)
  const extension = rest.slice(mainLength)
  return [area, main, extension].filter(Boolean).join('-')
}

function normalizePhoneNumber(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.includes('@')) return ''

  const text = toHalfWidth(raw)
    .replace(/[－–—]/g, '-')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/(?:分机|转接?|转|ext(?:ension)?|x)\s*[:：.]?\s*/gi, '-')
    .replace(/[#,，,；;、/\\|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  const groups = text.match(/\d+/g) || []
  if (!groups.length) return ''

  const localGroups = stripChinaCountryCodeGroups(groups).filter(Boolean)
  const localDigits = stripChinaCountryCode(localGroups.join(''))
  if (/^1\d{10}$/.test(localDigits)) return localDigits

  if (localGroups.length >= 2 && /^0\d{2,3}$/.test(localGroups[0])) {
    const [area, main, ...rest] = localGroups
    return [area, main, rest.join('')].filter(Boolean).join('-')
  }

  const landline = normalizeLandlineDigits(localDigits)
  if (landline) return landline

  if (localGroups.length >= 2) return localGroups.join('-')
  return localDigits
}

function isValidNormalizedPhone(value) {
  const text = String(value || '')
  const digitCount = text.replace(/\D/g, '').length
  return /^[0-9-]{7,32}$/.test(text) && digitCount >= 7
}

module.exports = {
  normalizePhoneNumber,
  isValidNormalizedPhone,
}
