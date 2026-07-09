const assert = require('node:assert/strict')

const fixtureData = require('../src/modules/device-model-catalog/fixture-data')
const { normalizeAlias } = require('../src/modules/device-model-catalog/normalize')

const h3cNetworkModels = fixtureData.filter(
  (item) => item.brand === 'H3C' && item.category === 'network',
)

const canonicalModels = new Set(h3cNetworkModels.map((item) => item.canonicalModel))

const expectedSwitchModels = [
  'S3100V2',
  'S3100V2-26TP-EI',
  'S5120-28P-EI',
  'S5120V2-28P-LI',
  'S5130S-28P-EI',
  'S5130-30C-HI',
  'S5500V2-28C-EI',
  'S5560X-30C-EI',
  'S5570S-52P-EI',
  'S6520X-54QC-EI',
  'S6550X-54C-HI',
  'S6820-56HF',
  'S9825-64CD',
  'S7506E',
  'S10506',
  'S12516X-AF',
]

for (const model of expectedSwitchModels) {
  assert.ok(
    canonicalModels.has(`H3C ${model}`),
    `expected H3C device model fixture for ${model}`,
  )
}

const aliasOwners = new Map()
for (const item of h3cNetworkModels) {
  for (const alias of item.aliases || []) {
    const normalizedAlias = normalizeAlias(alias)
    if (!normalizedAlias) continue
    const existing = aliasOwners.get(normalizedAlias)
    assert.ok(
      !existing || existing === item.canonicalModel,
      `duplicate H3C alias "${alias}" maps to both ${existing} and ${item.canonicalModel}`,
    )
    aliasOwners.set(normalizedAlias, item.canonicalModel)
  }
}

const expectedAliases = [
  ['H3C S3100v2', 'H3C S3100V2'],
  ['S3100 V2', 'H3C S3100V2'],
  ['S3100V2 交换机', 'H3C S3100V2'],
  ['S5130S 28P EI', 'H3C S5130S-28P-EI'],
  ['S6520X-54QC-EI 交换机', 'H3C S6520X-54QC-EI'],
]

for (const [alias, canonicalModel] of expectedAliases) {
  const owner = aliasOwners.get(normalizeAlias(alias))
  assert.equal(owner, canonicalModel, `expected alias "${alias}" to resolve to ${canonicalModel}`)
}
