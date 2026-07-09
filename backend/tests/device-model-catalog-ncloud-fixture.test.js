const assert = require('node:assert/strict')

const fixtureData = require('../src/modules/device-model-catalog/fixture-data')
const { normalizeAlias } = require('../src/modules/device-model-catalog/normalize')

const ncloudModel = fixtureData.find((item) => item.canonicalModel === 'N-cloud')

assert.ok(ncloudModel, 'expected N-cloud fixture')
assert.equal(ncloudModel.brand, 'N-cloud')
assert.equal(ncloudModel.category, 'server')

const aliases = new Map()
for (const alias of ncloudModel.aliases || []) {
  aliases.set(normalizeAlias(alias), ncloudModel.canonicalModel)
}

const expectedAliases = [
  'N-cloud',
  'NCloud',
  'N Cloud',
  'N-cloud 产品',
  'N-cloud 设备',
]

for (const alias of expectedAliases) {
  assert.equal(
    aliases.get(normalizeAlias(alias)),
    'N-cloud',
    `expected alias "${alias}" to resolve to N-cloud`,
  )
}
