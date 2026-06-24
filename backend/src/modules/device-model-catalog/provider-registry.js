const PROVIDERS = {
  fixture: {
    name: 'fixture',
    label: 'Fixture Data',
    networkAccess: false,
    snapshotKey: 'last-sync-snapshot.json',
    scopes: {
      'approved-v1': {
        servers: ['HPE', 'Dell', 'Lenovo', 'IBM'],
        storage: ['NetApp', 'HDS', 'Dell EMC', 'QNAP', 'Synology', 'Huawei', 'IBM', 'Lenovo', 'LenovoNetapp'],
        network: ['Cisco', 'Huawei', 'H3C', 'Brocade', 'F5'],
      }
    }
  },
  'fixture-fail-once': {
    name: 'fixture-fail-once',
    label: 'Fixture (Fails Once)',
    networkAccess: false,
    isTestOnly: true,
    snapshotKey: 'last-sync-snapshot.json',
    scopes: {
      'approved-v1': {
        servers: ['HPE', 'Dell', 'Lenovo', 'IBM'],
        storage: ['NetApp', 'HDS', 'Dell EMC', 'QNAP', 'Synology', 'Huawei', 'IBM', 'Lenovo', 'LenovoNetapp'],
        network: ['Cisco', 'Huawei', 'H3C', 'Brocade', 'F5'],
      }
    }
  },
  manufacturer: {
    name: 'manufacturer',
    label: 'Manufacturer Catalog',
    networkAccess: true,
    snapshotKey: 'last-sync-snapshot.json',
    allowlistDomains: ['hpe.com', 'dell.com', 'lenovo.com', 'ibm.com', 'netapp.com',
      'hitachivantara.com', 'qnap.com', 'synology.com', 'huawei.com', 'cisco.com',
      'h3c.com', 'broadcom.com', 'f5.com'],
    scopes: {
      'approved-v1': {
        servers: ['HPE', 'Dell', 'Lenovo', 'IBM'],
        storage: ['NetApp', 'HDS', 'Dell EMC', 'QNAP', 'Synology', 'Huawei', 'IBM', 'Lenovo', 'LenovoNetapp'],
        network: ['Cisco', 'Huawei', 'H3C', 'Brocade', 'F5'],
      }
    }
  },
  redfish: {
    name: 'redfish',
    label: 'Redfish BMC',
    networkAccess: true,
    snapshotKey: 'last-sync-snapshot.json',
    scopes: { 'approved-v1': { servers: ['HPE', 'Dell', 'Lenovo'] } }
  }
}

function getProvider(name) { return PROVIDERS[name] || null }
function listProviders() { return Object.keys(PROVIDERS) }
function getNetworkGuardrail() { return process.env.DEVICE_MODEL_SYNC_DISABLE_NETWORK === '1' }

module.exports = { getProvider, listProviders, getNetworkGuardrail, PROVIDERS }
