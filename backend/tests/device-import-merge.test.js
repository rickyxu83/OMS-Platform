const assert = require('node:assert/strict')
const { buildExistingDeviceImportPatch } = require('../src/modules/devices/device-import-merge')

const emptyExisting = {
  name: null,
  pn: '',
  mr_no: null,
  remark: null,
  location: null,
  maintenance_type: 'pending_confirmation',
  maintenance_party_id: null,
  maintenance_start: null,
  maintenance_end: null,
}

const supplement = buildExistingDeviceImportPatch(emptyExisting, {
  name: 'server-01',
  pn: 'PN-001',
  mrNo: 'MR-001',
  remark: '核心设备',
  location: 'A01',
  maintenanceType: 'original_manufacturer',
  maintenanceTypeProvided: true,
  maintenancePartyName: '原厂服务商',
  maintenanceStart: '2026-01-01',
  maintenanceEnd: '2026-12-31',
})
assert.deepEqual(supplement.patch, {
  name: 'server-01',
  pn: 'PN-001',
  mr_no: 'MR-001',
  remark: '核心设备',
  location: 'A01',
  maintenance_type: 'original_manufacturer',
  maintenance_start: '2026-01-01',
  maintenance_end: '2026-12-31',
})
assert.equal(supplement.effectiveMaintenanceType, 'original_manufacturer')
assert.equal(supplement.shouldResolveMaintenanceParty, true)

const preserveExisting = buildExistingDeviceImportPatch({
  ...emptyExisting,
  name: 'existing-host',
  location: 'existing-location',
  maintenance_type: 'original_manufacturer',
  maintenance_start: '2025-01-01',
  maintenance_end: '2025-12-31',
}, {
  name: 'excel-host',
  location: 'excel-location',
  maintenanceType: 'our_maintenance',
  maintenanceTypeProvided: true,
  maintenanceStart: '2026-01-01',
  maintenanceEnd: '2026-12-31',
})
assert.deepEqual(preserveExisting.patch, {})
assert.equal(preserveExisting.effectiveMaintenanceType, 'original_manufacturer')
assert.equal(preserveExisting.shouldResolveMaintenanceParty, false)

const noMaintenance = buildExistingDeviceImportPatch({
  ...emptyExisting,
  maintenance_type: 'none',
}, {
  maintenanceType: 'original_manufacturer',
  maintenanceTypeProvided: true,
  maintenanceStart: '2026-01-01',
  maintenanceEnd: '2026-12-31',
})
assert.deepEqual(noMaintenance.patch, {})
assert.equal(noMaintenance.effectiveMaintenanceType, 'none')
assert.equal(noMaintenance.shouldResolveMaintenanceParty, false)

const pendingDates = buildExistingDeviceImportPatch(emptyExisting, {
  maintenanceType: 'pending_confirmation',
  maintenanceTypeProvided: false,
  maintenanceStart: '2026-01-01',
  maintenanceEnd: '2026-12-31',
})
assert.deepEqual(pendingDates.patch, {
  maintenance_start: '2026-01-01',
  maintenance_end: '2026-12-31',
})

console.log('device import merge tests passed')
