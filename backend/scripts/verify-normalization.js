const { normalizeAlias, isAmbiguous } = require('../src/modules/device-model-catalog')

const normalized = normalizeAlias('  DL380-G10 / Rack_Server  ')
console.log('normalizeAlias input:   "  DL380-G10 / Rack_Server  "')
console.log(`normalizeAlias output:  "${normalized}"`)

const ambiguousResult = {
  ambiguous: true,
  candidates: [
    { catalog_id: 1, canonical_model: 'ProLiant DL380 Gen10', brand: 'HPE', category: 'server' },
    { catalog_id: 2, canonical_model: 'PowerEdge R740', brand: 'Dell', category: 'server' },
  ],
}
const singleResult = {
  catalog_id: 1,
  canonical_model: 'ProLiant DL380 Gen10',
  brand: 'HPE',
  category: 'server',
}

console.log(`isAmbiguous(ambiguousResult): ${isAmbiguous(ambiguousResult)}`)
console.log(`isAmbiguous(singleResult): ${isAmbiguous(singleResult)}`)
