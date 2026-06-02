const { query } = require('../../config/db')

const models = [
  // ========== HPE Server (16) ==========
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL380 Gen9', keywords: 'DL380,Gen9,380', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL380 Gen10', keywords: 'DL380,Gen10,380', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL380 Gen10 Plus', keywords: 'DL380,Gen10 Plus,380', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL380 Gen11', keywords: 'DL380,Gen11,380', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL360 Gen10', keywords: 'DL360,Gen10,360', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL360 Gen11', keywords: 'DL360,Gen11,360', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL20 Gen10', keywords: 'DL20,Gen10,20', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL20 Gen11', keywords: 'DL20,Gen11,20', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL160 Gen10', keywords: 'DL160,Gen10,160', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL180 Gen10', keywords: 'DL180,Gen10,180', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant ML', officialName: 'HPE ProLiant ML350 Gen10', keywords: 'ML350,Gen10,350', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant ML', officialName: 'HPE ProLiant ML30 Gen10', keywords: 'ML30,Gen10,30', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant ML', officialName: 'HPE ProLiant ML30 Gen11', keywords: 'ML30,Gen11,30', category: 'Server' },
  { vendor: 'HPE', productLine: 'Synergy', officialName: 'HPE Synergy 480 Gen10', keywords: 'Synergy,480,Gen10', category: 'Server' },
  { vendor: 'HPE', productLine: 'Synergy', officialName: 'HPE Synergy 480 Gen11', keywords: 'Synergy,480,Gen11', category: 'Server' },
  { vendor: 'HPE', productLine: 'BladeSystem', officialName: 'HPE BL460c Gen10', keywords: 'BL460c,Gen10,Blade', category: 'Server' },

  // ========== Dell Server (19) ==========
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R740', keywords: 'R740,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R740xd', keywords: 'R740xd,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R740xa', keywords: 'R740xa,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R240', keywords: 'R240,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R340', keywords: 'R340,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R440', keywords: 'R440,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R540', keywords: 'R540,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R640', keywords: 'R640,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R750', keywords: 'R750,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R750xa', keywords: 'R750xa,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R760', keywords: 'R760,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R940', keywords: 'R940,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R940xa', keywords: 'R940xa,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge T', officialName: 'Dell PowerEdge T340', keywords: 'T340,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge T', officialName: 'Dell PowerEdge T440', keywords: 'T440,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge T', officialName: 'Dell PowerEdge T550', keywords: 'T550,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge T', officialName: 'Dell PowerEdge T560', keywords: 'T560,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge M', officialName: 'Dell PowerEdge M640', keywords: 'M640,PowerEdge,Blade', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge M', officialName: 'Dell PowerEdge M740', keywords: 'M740,PowerEdge,Blade', category: 'Server' },

  // ========== Dell Storage (6) ==========
  { vendor: 'Dell', productLine: 'PowerVault ME', officialName: 'Dell PowerVault ME5012', keywords: 'ME5012,PowerVault', category: 'Storage' },
  { vendor: 'Dell', productLine: 'PowerVault ME', officialName: 'Dell PowerVault ME5024', keywords: 'ME5024,PowerVault', category: 'Storage' },
  { vendor: 'Dell', productLine: 'PowerStore', officialName: 'Dell PowerStore 1200T', keywords: 'PowerStore,1200T', category: 'Storage' },
  { vendor: 'Dell', productLine: 'Unity XT', officialName: 'Dell Unity XT 380', keywords: 'Unity XT,380', category: 'Storage' },
  { vendor: 'Dell', productLine: 'Unity XT', officialName: 'Dell Unity XT 480', keywords: 'Unity XT,480', category: 'Storage' },
  { vendor: 'Dell', productLine: 'Unity XT', officialName: 'Dell Unity XT 880', keywords: 'Unity XT,880', category: 'Storage' },

  // ========== Lenovo Server (15) ==========
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR250', keywords: 'SR250,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR530', keywords: 'SR530,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR550', keywords: 'SR550,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR570', keywords: 'SR570,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR590', keywords: 'SR590,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR630', keywords: 'SR630,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR645', keywords: 'SR645,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR650', keywords: 'SR650,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR665', keywords: 'SR665,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR850', keywords: 'SR850,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR860', keywords: 'SR860,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem SR', officialName: 'Lenovo ThinkSystem SR950', keywords: 'SR950,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem ST', officialName: 'Lenovo ThinkSystem ST250', keywords: 'ST250,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem ST', officialName: 'Lenovo ThinkSystem ST550', keywords: 'ST550,ThinkSystem', category: 'Server' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem ST', officialName: 'Lenovo ThinkSystem ST650 V2', keywords: 'ST650,V2,ThinkSystem', category: 'Server' },

  // ========== Lenovo Storage (3) ==========
  { vendor: 'Lenovo', productLine: 'DM Series', officialName: 'Lenovo DM5100F', keywords: 'DM5100F,Storage', category: 'Storage' },
  { vendor: 'Lenovo', productLine: 'DE Series', officialName: 'Lenovo DE4000H', keywords: 'DE4000H,Storage', category: 'Storage' },
  { vendor: 'Lenovo', productLine: 'DE Series', officialName: 'Lenovo DE6000H', keywords: 'DE6000H,Storage', category: 'Storage' },

  // ========== Cisco UCS (10) ==========
  { vendor: 'Cisco', productLine: 'UCS B-Series', officialName: 'Cisco UCS B200 M4', keywords: 'B200,M4,UCS,Blade', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS B-Series', officialName: 'Cisco UCS B200 M5', keywords: 'B200,M5,UCS,Blade', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS B-Series', officialName: 'Cisco UCS B200 M6', keywords: 'B200,M6,UCS,Blade', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C220 M4', keywords: 'C220,M4,UCS', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C220 M5', keywords: 'C220,M5,UCS', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C220 M6', keywords: 'C220,M6,UCS', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C240 M4', keywords: 'C240,M4,UCS', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C240 M5', keywords: 'C240,M5,UCS', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C240 M6', keywords: 'C240,M6,UCS', category: 'Server' },
  { vendor: 'Cisco', productLine: 'UCS C-Series', officialName: 'Cisco UCS C480 M5', keywords: 'C480,M5,UCS', category: 'Server' },

  // ========== Cisco Nexus (9) ==========
  { vendor: 'Cisco', productLine: 'Nexus 3000', officialName: 'Cisco Nexus 3048', keywords: '3048,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 3000', officialName: 'Cisco Nexus 3132Q', keywords: '3132Q,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 3000', officialName: 'Cisco Nexus 3172', keywords: '3172,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 3500', officialName: 'Cisco Nexus 3548', keywords: '3548,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 5600', officialName: 'Cisco Nexus 56128P', keywords: '56128P,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 9000', officialName: 'Cisco Nexus 93180YC', keywords: '93180YC,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 9000', officialName: 'Cisco Nexus 9336C', keywords: '9336C,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 9000', officialName: 'Cisco Nexus 92348GC', keywords: '92348GC,Nexus', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Nexus 9000', officialName: 'Cisco Nexus 93108TC', keywords: '93108TC,Nexus', category: 'Network' },

  // ========== Supermicro (10) ==========
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-1029U', keywords: '1029U,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-2029U', keywords: '2029U,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-6029U', keywords: '6029U,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-1028U', keywords: '1028U,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-2028U', keywords: '2028U,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-6019U', keywords: '6019U,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-5039', keywords: '5039,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'SuperServer', officialName: 'Supermicro SYS-7039', keywords: '7039,SuperServer', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'A+ Server', officialName: 'Supermicro A+ Server 4124GO', keywords: '4124GO,A+,Server', category: 'Server' },
  { vendor: 'Supermicro', productLine: 'A+ Server', officialName: 'Supermicro A+ Server 2124BT', keywords: '2124BT,A+,Server', category: 'Server' },

  // ========== Inspur (10) ==========
  { vendor: 'Inspur', productLine: 'NF5000', officialName: 'Inspur NF5180M5', keywords: 'NF5180,M5,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF5000', officialName: 'Inspur NF5280M5', keywords: 'NF5280,M5,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF5000', officialName: 'Inspur NF5280M6', keywords: 'NF5280,M6,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF5000', officialName: 'Inspur NF5270M5', keywords: 'NF5270,M5,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF5000', officialName: 'Inspur NF5270M6', keywords: 'NF5270,M6,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF8000', officialName: 'Inspur NF8480M5', keywords: 'NF8480,M5,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF8000', officialName: 'Inspur NF8480M6', keywords: 'NF8480,M6,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF3000', officialName: 'Inspur NF3120M5', keywords: 'NF3120,M5,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'NF2000', officialName: 'Inspur NF2180M5', keywords: 'NF2180,M5,浪潮', category: 'Server' },
  { vendor: 'Inspur', productLine: 'i Series', officialName: 'Inspur i48', keywords: 'i48,浪潮', category: 'Server' },

  // ========== Huawei (10) ==========
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 1288H V5', keywords: '1288H,V5,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 2288H V5', keywords: '2288H,V5,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 2288H V6', keywords: '2288H,V6,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 2488H V5', keywords: '2488H,V5,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 5288 V5', keywords: '5288,V5,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 5885H V5', keywords: '5885H,V5,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 8100 V5', keywords: '8100,V5,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'TaiShan', officialName: 'Huawei TaiShan 200 2280', keywords: 'TaiShan,200,2280,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'TaiShan', officialName: 'Huawei TaiShan 200 5280', keywords: 'TaiShan,200,5280,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 2200 V5', keywords: 'OceanStor,2200,V5,华为', category: 'Storage' },

  // ========== HPE Storage (12) ==========
  { vendor: 'HPE', productLine: '3PAR', officialName: 'HPE 3PAR StoreServ 8200', keywords: '3PAR,8200,StoreServ', category: 'Storage' },
  { vendor: 'HPE', productLine: '3PAR', officialName: 'HPE 3PAR StoreServ 8400', keywords: '3PAR,8400,StoreServ', category: 'Storage' },
  { vendor: 'HPE', productLine: '3PAR', officialName: 'HPE 3PAR StoreServ 8440', keywords: '3PAR,8440,StoreServ', category: 'Storage' },
  { vendor: 'HPE', productLine: '3PAR', officialName: 'HPE 3PAR StoreServ 8450', keywords: '3PAR,8450,StoreServ', category: 'Storage' },
  { vendor: 'HPE', productLine: '3PAR', officialName: 'HPE 3PAR StoreServ 9450', keywords: '3PAR,9450,StoreServ', category: 'Storage' },
  { vendor: 'HPE', productLine: 'Nimble', officialName: 'HPE Nimble AF20', keywords: 'Nimble,AF20,All Flash', category: 'Storage' },
  { vendor: 'HPE', productLine: 'Nimble', officialName: 'HPE Nimble AF40', keywords: 'Nimble,AF40,All Flash', category: 'Storage' },
  { vendor: 'HPE', productLine: 'Nimble', officialName: 'HPE Nimble HF20', keywords: 'Nimble,HF20,Hybrid', category: 'Storage' },
  { vendor: 'HPE', productLine: 'Nimble', officialName: 'HPE Nimble HF40', keywords: 'Nimble,HF40,Hybrid', category: 'Storage' },
  { vendor: 'HPE', productLine: 'MSA', officialName: 'HPE MSA 2040', keywords: 'MSA,2040,Storage', category: 'Storage' },
  { vendor: 'HPE', productLine: 'MSA', officialName: 'HPE MSA 2050', keywords: 'MSA,2050,Storage', category: 'Storage' },
  { vendor: 'HPE', productLine: 'MSA', officialName: 'HPE MSA 2060', keywords: 'MSA,2060,Storage', category: 'Storage' },

  // ========== HPE Aruba (9) ==========
  { vendor: 'Aruba', productLine: '2930F', officialName: 'Aruba 2930F 24G', keywords: '2930F,24G,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: '2930F', officialName: 'Aruba 2930F 48G', keywords: '2930F,48G,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: '2930M', officialName: 'Aruba 2930M', keywords: '2930M,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: '5400R', officialName: 'Aruba 5400R zl2', keywords: '5400R,zl2,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: 'CX 6100', officialName: 'Aruba CX 6100', keywords: 'CX,6100,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: 'CX 6300', officialName: 'Aruba CX 6300', keywords: 'CX,6300,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: 'CX 8300', officialName: 'Aruba CX 8320', keywords: 'CX,8320,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: 'CX 8300', officialName: 'Aruba CX 8325', keywords: 'CX,8325,Aruba', category: 'Network' },
  { vendor: 'Aruba', productLine: 'CX 8300', officialName: 'Aruba CX 8360', keywords: 'CX,8360,Aruba', category: 'Network' },

  // ========== Dell Network (5) ==========
  { vendor: 'Dell', productLine: 'PowerSwitch S', officialName: 'Dell PowerSwitch S3048', keywords: 'S3048,PowerSwitch', category: 'Network' },
  { vendor: 'Dell', productLine: 'PowerSwitch S', officialName: 'Dell PowerSwitch S4048', keywords: 'S4048,PowerSwitch', category: 'Network' },
  { vendor: 'Dell', productLine: 'PowerSwitch S', officialName: 'Dell PowerSwitch S4148', keywords: 'S4148,PowerSwitch', category: 'Network' },
  { vendor: 'Dell', productLine: 'PowerSwitch S', officialName: 'Dell PowerSwitch S5232F', keywords: 'S5232F,PowerSwitch', category: 'Network' },
  { vendor: 'Dell', productLine: 'PowerSwitch Z', officialName: 'Dell PowerSwitch Z9100', keywords: 'Z9100,PowerSwitch', category: 'Network' },
]

async function seed() {
  for (const m of models) {
    await query(
      'INSERT IGNORE INTO device_models (vendor, product_line, official_name, search_keywords, category) VALUES (:vendor, :productLine, :officialName, :keywords, :category)',
      { vendor: m.vendor, productLine: m.productLine, officialName: m.officialName, keywords: m.keywords, category: m.category },
    )
  }
  const count = await query('SELECT COUNT(*) as cnt FROM device_models')
  console.log(`Seeded ${count[0].cnt} device models`)
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
