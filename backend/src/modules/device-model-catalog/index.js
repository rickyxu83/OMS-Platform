const { ensureDeviceModelCatalogTable, ensureDeviceModelAliasesTable } = require('./schema')
const { normalizeAlias, deduplicateAliases, resolveAlias, isAmbiguous } = require('./normalize')

async function initializeDeviceModelCatalog() {
  await ensureDeviceModelCatalogTable()
  await ensureDeviceModelAliasesTable()
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
