const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'scripts/ensure-device-maintenance-columns.js'), 'utf8')
const controller = fs.readFileSync(path.join(root, 'src/modules/service-orders/controller.js'), 'utf8')

assert.doesNotMatch(schema, /UNIQUE KEY uk_devices_installation_source_service_order_id/)
assert.match(schema, /KEY idx_devices_installation_source_service_order_id \(installation_source_service_order_id\)/)

for (const source of [migration, controller]) {
  const addIndex = source.indexOf('ADD KEY idx_devices_installation_source_service_order_id')
  const dropUnique = source.indexOf('DROP INDEX uk_devices_installation_source_service_order_id')
  assert.ok(addIndex >= 0 && dropUnique > addIndex, 'must add the foreign-key index before dropping the unique index')
}

console.log('multi-install schema tests passed')
