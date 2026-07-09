const assert = require('node:assert/strict')

const { ingestFixtureData } = require('../src/modules/device-model-catalog/ingest')

const catalogRows = [
  {
    id: 1,
    brand: 'HPE',
    category: 'server',
    canonical_model: 'HPE FlexFabric 5940 4-slot Switch',
    part_number: 'FlexFabric 5940 4-slot Switch',
    source_provider: 'online',
    is_active: 1,
  },
]
const aliasRows = []
let nextCatalogId = 2

async function fakeQuery(sql, params = []) {
  const normalizedSql = sql.replace(/\s+/g, ' ').trim()

  if (normalizedSql.startsWith('INSERT IGNORE INTO device_model_catalog')) {
    const [brand, category, canonicalModel, partNumber] = params
    const existing = catalogRows.find(
      (row) => row.brand === brand && row.category === category && row.canonical_model === canonicalModel,
    )
    if (existing) return { affectedRows: 0 }
    catalogRows.push({
      id: nextCatalogId,
      brand,
      category,
      canonical_model: canonicalModel,
      part_number: partNumber,
      source_provider: 'fixture',
      is_active: 1,
    })
    nextCatalogId += 1
    return { affectedRows: 1 }
  }

  if (normalizedSql.startsWith("UPDATE device_model_catalog SET source_provider = 'fixture'")) {
    const [partNumber, brand, category, canonicalModel] = params
    const existing = catalogRows.find(
      (row) => row.brand === brand && row.category === category && row.canonical_model === canonicalModel,
    )
    if (!existing) return { affectedRows: 0 }
    existing.part_number = partNumber
    existing.source_provider = 'fixture'
    existing.is_active = 1
    return { affectedRows: 1 }
  }

  if (normalizedSql.startsWith('SELECT id FROM device_model_catalog')) {
    const [brand, category, canonicalModel] = params
    return catalogRows
      .filter((row) => row.brand === brand && row.category === category && row.canonical_model === canonicalModel)
      .map((row) => ({ id: row.id }))
  }

  if (normalizedSql.startsWith('INSERT IGNORE INTO device_model_aliases')) {
    const [catalogId, normalizedAlias, providerScope] = params
    const existing = aliasRows.find(
      (row) => row.catalog_id === catalogId && row.normalized_alias === normalizedAlias && row.provider_scope === providerScope,
    )
    if (existing) return { affectedRows: 0 }
    aliasRows.push({ catalog_id: catalogId, normalized_alias: normalizedAlias, provider_scope: providerScope })
    return { affectedRows: 1 }
  }

  if (normalizedSql.includes("FROM device_model_catalog WHERE source_provider = 'fixture'")) {
    return catalogRows
      .filter((row) => row.source_provider === 'fixture' && row.is_active === 1)
      .map((row) => ({
        id: row.id,
        brand: row.brand,
        category: row.category,
        canonical_model: row.canonical_model,
      }))
  }

  if (normalizedSql.startsWith('UPDATE device_model_catalog SET is_active = 0') && normalizedSql.includes('WHERE id = ?')) {
    const [id] = params
    const row = catalogRows.find((item) => item.id === id)
    if (!row || row.is_active === 0) return { affectedRows: 0 }
    row.is_active = 0
    return { affectedRows: 1 }
  }

  if (normalizedSql.startsWith('UPDATE device_model_catalog SET is_active = 0') && normalizedSql.includes('source_provider <>')) {
    const [brand, canonicalModel, category] = params
    let affectedRows = 0
    for (const row of catalogRows) {
      if (
        row.brand === brand
        && row.canonical_model === canonicalModel
        && row.category !== category
        && row.is_active === 1
        && row.source_provider !== 'fixture'
      ) {
        row.is_active = 0
        affectedRows += 1
      }
    }
    return { affectedRows }
  }

  throw new Error(`Unhandled fake query: ${normalizedSql}`)
}

async function run() {
  const summary = await ingestFixtureData(fakeQuery, [
    {
      brand: 'HPE',
      category: 'network',
      canonicalModel: 'HPE FlexFabric 5940 4-slot Switch',
      partNumber: '5940 4-slot Switch',
      aliases: ['HPE FlexFabric 5940 4-slot Switch'],
    },
  ], 'approved-v1', { deactivateMissingFixtures: true })

  const onlineRow = catalogRows.find((row) => row.id === 1)
  const fixtureRow = catalogRows.find((row) => row.category === 'network')

  assert.equal(summary.deactivated, 1)
  assert.equal(onlineRow.is_active, 0)
  assert.equal(fixtureRow.is_active, 1)
  assert.equal(fixtureRow.source_provider, 'fixture')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
