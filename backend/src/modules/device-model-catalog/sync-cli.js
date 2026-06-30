const fs = require('fs')
const path = require('path')

const { pool, query } = require('../../config/db')
const env = require('../../config/env')
const { getProvider, listProviders, getNetworkGuardrail } = require('./provider-registry')
const { ensureDeviceModelCatalogTable, ensureDeviceModelAliasesTable } = require('./schema')
const FIXTURE_DATA = require('./fixture-data')
const { ingestFixtureData } = require('./ingest')

const args = process.argv.slice(2)
const providerFlag = args.find((a) => a.startsWith('--provider='))
const scopeFlag = args.find((a) => a.startsWith('--scope='))

function getSnapshotPath(provider) {
  const snapshotDir = process.env.DEVICE_MODEL_SYNC_SNAPSHOT_DIR
    ? path.resolve(process.cwd(), process.env.DEVICE_MODEL_SYNC_SNAPSHOT_DIR)
    : path.resolve(env.rootDir, '..', '.sisyphus')
  return path.join(snapshotDir, provider.snapshotKey || 'last-sync-snapshot.json')
}

function writeSnapshot(snapshotPath, payload) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  fs.writeFileSync(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function readSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) return null
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
}

async function run() {
  if (!providerFlag) {
    console.error(`ERROR: --provider flag is required. Available: ${listProviders().join(', ')}`)
    await pool.end()
    process.exit(1)
  }

  const providerName = providerFlag.split('=')[1]
  const scope = scopeFlag ? scopeFlag.split('=')[1] : 'approved-v1'
  const provider = getProvider(providerName)

  if (!provider) {
    console.error(`ERROR: Unknown provider "${providerName}". Available: ${listProviders().join(', ')}`)
    await pool.end()
    process.exit(1)
  }

  if (getNetworkGuardrail() && provider.networkAccess) {
    console.log(JSON.stringify({ provider: providerName, scope, status: 'network_disabled', message: 'DEVICE_MODEL_SYNC_DISABLE_NETWORK=1' }))
    return
  }

  const snapshotPath = getSnapshotPath(provider)

  try {
    await ensureDeviceModelCatalogTable()
    await ensureDeviceModelAliasesTable()

    if (providerName === 'fixture' || providerName === 'fixture-fail-once') {
      const result = await ingestFixtureData(query, FIXTURE_DATA, scope, { deactivateMissingFixtures: true })

      if (providerName === 'fixture-fail-once') {
        throw new Error('Simulated provider failure after ingest')
      }

      const payload = {
        provider: providerName,
        scope,
        timestamp: new Date().toISOString(),
        summary: result,
      }

      writeSnapshot(snapshotPath, payload)

      console.log(JSON.stringify({
        provider: providerName,
        scope,
        status: 'ok',
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        deactivated: result.deactivated,
        snapshotPath,
      }))
      return
    }

    console.log(JSON.stringify({
      provider: providerName,
      scope,
      status: 'noop',
      message: `Sync not implemented for provider ${providerName}`,
    }))
  } catch (error) {
    console.error('[device-model-catalog] sync error:', error.message)
    const snapshot = readSnapshot(snapshotPath)
    console.log(JSON.stringify({
      provider: providerName,
      scope,
      status: 'provider_failed',
      message: error.message,
      snapshotAvailable: Boolean(snapshot),
      snapshot,
    }))
  } finally {
    await pool.end()
  }
}

run()
