const { query } = require('../../config/db')
const { ensureDeviceModelCatalogTable, ensureDeviceModelAliasesTable } = require('./schema')
const { normalizeAlias, deduplicateAliases, resolveAlias, isAmbiguous } = require('./normalize')
const FIXTURE_DATA = require('./fixture-data')
const { ingestFixtureData } = require('./ingest')

async function initializeDeviceModelCatalog() {
  await ensureDeviceModelCatalogTable()
  await ensureDeviceModelAliasesTable()
  await ingestFixtureData(query, FIXTURE_DATA)
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
