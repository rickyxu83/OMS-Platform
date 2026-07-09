const assert = require('node:assert/strict')

const fixtureData = require('../src/modules/device-model-catalog/fixture-data')
const { normalizeAlias } = require('../src/modules/device-model-catalog/normalize')

const hpeNetworkModels = fixtureData.filter(
  (item) => item.brand === 'HPE' && item.category === 'network',
)

const canonicalModels = new Set(hpeNetworkModels.map((item) => item.canonicalModel))

assert.ok(
  canonicalModels.has('HPE FlexFabric 5940 4-slot Switch'),
  'expected HPE FlexFabric 5940 4-slot Switch fixture',
)

const aliasOwners = new Map()
for (const item of hpeNetworkModels) {
  for (const alias of item.aliases || []) {
    const normalizedAlias = normalizeAlias(alias)
    if (!normalizedAlias) continue
    const existing = aliasOwners.get(normalizedAlias)
    assert.ok(
      !existing || existing === item.canonicalModel,
      `duplicate HPE network alias "${alias}" maps to both ${existing} and ${item.canonicalModel}`,
    )
    aliasOwners.set(normalizedAlias, item.canonicalModel)
  }
}

const expectedAliases = [
  ['HPE FlexFabric 5940 4-slot Switch', 'HPE FlexFabric 5940 4-slot Switch'],
  ['HP FlexFabric 5940 4-slot Switch', 'HPE FlexFabric 5940 4-slot Switch'],
  ['HPE 5940 4-slot', 'HPE FlexFabric 5940 4-slot Switch'],
  ['5940 4-slot Switch', 'HPE FlexFabric 5940 4-slot Switch'],
  ['FlexFabric 5940', 'HPE FlexFabric 5940 4-slot Switch'],
]

for (const [alias, canonicalModel] of expectedAliases) {
  const owner = aliasOwners.get(normalizeAlias(alias))
  assert.equal(owner, canonicalModel, `expected alias "${alias}" to resolve to ${canonicalModel}`)
}
