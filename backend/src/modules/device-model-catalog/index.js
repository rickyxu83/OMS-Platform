const { query } = require('../../config/db')
const { ensureDeviceModelCatalogTable, ensureDeviceModelAliasesTable } = require('./schema')
const { normalizeAlias, deduplicateAliases, resolveAlias, isAmbiguous } = require('./normalize')
const FIXTURE_DATA = require('./fixture-data')
const { ingestFixtureData } = require('./ingest')
const { models: LEGACY_MODELS = [] } = require('../device-models/seed')

function normalizeLegacyCategory(category) {
  const value = String(category || '').trim().toLowerCase()
  if (value === 'server' || value === 'storage' || value === 'network') return value
  return 'server'
}

function legacyFixtures() {
  return LEGACY_MODELS.map((item) => ({
    brand: item.vendor,
    category: normalizeLegacyCategory(item.category),
    canonicalModel: item.officialName,
    aliases: [
      item.officialName,
      ...String(item.keywords || '')
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ],
  }))
}

async function initializeDeviceModelCatalog() {
  await ensureDeviceModelCatalogTable()
  await ensureDeviceModelAliasesTable()
  await ingestFixtureData(query, FIXTURE_DATA)
  await ingestFixtureData(query, legacyFixtures(), 'legacy-device-models')
  console.log('[device-model-catalog] Tables ensured')
}

module.exports = {
  initializeDeviceModelCatalog,
  ensureDeviceModelCatalogTable,
  ensureDeviceModelAliasesTable,
  normalizeAlias,
  deduplicateAliases,
  resolveAlias,
  isAmbiguous,
}
