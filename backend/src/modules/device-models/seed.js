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

  // ========== Cisco Catalyst Switch (20) ==========
  { vendor: 'Cisco', productLine: 'Catalyst 1000', officialName: 'Cisco Catalyst 1000-16T', keywords: '1000,16T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 1000', officialName: 'Cisco Catalyst 1000-24T', keywords: '1000,24T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 1000', officialName: 'Cisco Catalyst 1000-48T', keywords: '1000,48T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 2960', officialName: 'Cisco Catalyst 2960X-24TS', keywords: '2960X,24TS,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 2960', officialName: 'Cisco Catalyst 2960X-48TS', keywords: '2960X,48TS,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 3560', officialName: 'Cisco Catalyst 3560X-24T', keywords: '3560X,24T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 3560', officialName: 'Cisco Catalyst 3560X-48T', keywords: '3560X,48T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 3650', officialName: 'Cisco Catalyst 3650-24TS', keywords: '3650,24TS,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 3650', officialName: 'Cisco Catalyst 3650-48TS', keywords: '3650,48TS,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 3850', officialName: 'Cisco Catalyst 3850-24T', keywords: '3850,24T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 3850', officialName: 'Cisco Catalyst 3850-48T', keywords: '3850,48T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9200-24T', keywords: '9200,24T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9200-48T', keywords: '9200,48T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9300-24T', keywords: '9300,24T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9300-48T', keywords: '9300,48T,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9400', keywords: '9400,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9500-24Y4C', keywords: '9500,24Y4C,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9500-40Q', keywords: '9500,40Q,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 9000', officialName: 'Cisco Catalyst 9600', keywords: '9600,Catalyst', category: 'Network' },
  { vendor: 'Cisco', productLine: 'Catalyst 6800', officialName: 'Cisco Catalyst 6840', keywords: '6840,Catalyst', category: 'Network' },

  // ========== Cisco MDS FC Switch (6) ==========
  { vendor: 'Cisco', productLine: 'MDS 9000', officialName: 'Cisco MDS 9148S', keywords: '9148S,MDS,FC,光纤', category: 'Network' },
  { vendor: 'Cisco', productLine: 'MDS 9000', officialName: 'Cisco MDS 9148T', keywords: '9148T,MDS,FC,光纤', category: 'Network' },
  { vendor: 'Cisco', productLine: 'MDS 9000', officialName: 'Cisco MDS 9220i', keywords: '9220i,MDS,FC,光纤', category: 'Network' },
  { vendor: 'Cisco', productLine: 'MDS 9000', officialName: 'Cisco MDS 9250i', keywords: '9250i,MDS,FC,光纤', category: 'Network' },
  { vendor: 'Cisco', productLine: 'MDS 9000', officialName: 'Cisco MDS 9396S', keywords: '9396S,MDS,FC,光纤', category: 'Network' },
  { vendor: 'Cisco', productLine: 'MDS 9000', officialName: 'Cisco MDS 9710', keywords: '9710,MDS,FC,光纤,Director', category: 'Network' },

  // ========== Brocade FC Switch (10) ==========
  { vendor: 'Brocade', productLine: 'G6', officialName: 'Brocade G610', keywords: 'G610,FC,光纤,Gen6', category: 'Network' },
  { vendor: 'Brocade', productLine: 'G6', officialName: 'Brocade G620', keywords: 'G620,FC,光纤,Gen6', category: 'Network' },
  { vendor: 'Brocade', productLine: 'G6', officialName: 'Brocade G630', keywords: 'G630,FC,光纤,Gen6', category: 'Network' },
  { vendor: 'Brocade', productLine: 'G7', officialName: 'Brocade G710', keywords: 'G710,FC,光纤,Gen7', category: 'Network' },
  { vendor: 'Brocade', productLine: 'G7', officialName: 'Brocade G720', keywords: 'G720,FC,光纤,Gen7', category: 'Network' },
  { vendor: 'Brocade', productLine: 'G7', officialName: 'Brocade G730', keywords: 'G730,FC,光纤,Gen7', category: 'Network' },
  { vendor: 'Brocade', productLine: 'DCX', officialName: 'Brocade DCX 8510', keywords: 'DCX,8510,FC,光纤,Director', category: 'Network' },
  { vendor: 'Brocade', productLine: 'X6', officialName: 'Brocade X6-4 Director', keywords: 'X6,Director,FC,光纤', category: 'Network' },
  { vendor: 'Brocade', productLine: 'X6', officialName: 'Brocade X6-8 Director', keywords: 'X6,Director,FC,光纤', category: 'Network' },
  { vendor: 'Brocade', productLine: 'X7', officialName: 'Brocade X7-4 Director', keywords: 'X7,Director,FC,光纤,Gen7', category: 'Network' },

  // ========== Huawei Switch (12) ==========
  { vendor: 'Huawei', productLine: 'CloudEngine S', officialName: 'Huawei CloudEngine S5735S-L24T4S', keywords: 'S5735,24T,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine S', officialName: 'Huawei CloudEngine S5735S-L48T4S', keywords: 'S5735,48T,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine S', officialName: 'Huawei CloudEngine S5735S-L24P4S', keywords: 'S5735,24P,POE,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine S', officialName: 'Huawei CloudEngine S6720-24C', keywords: 'S6720,24C,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine S', officialName: 'Huawei CloudEngine S6720-48C', keywords: 'S6720,48C,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine', officialName: 'Huawei CloudEngine 6800-48S', keywords: 'CE6800,48S,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine', officialName: 'Huawei CloudEngine 8800-24C', keywords: 'CE8800,24C,华为', category: 'Network' },
  { vendor: 'Huawei', productLine: 'CloudEngine', officialName: 'Huawei CloudEngine 12800', keywords: 'CE12800,华为,数据中心', category: 'Network' },
  { vendor: 'Huawei', productLine: 'FusionServer', officialName: 'Huawei FusionServer 1288H V6', keywords: '1288H,V6,FusionServer,华为', category: 'Server' },
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 5300 V5', keywords: 'OceanStor,5300,V5,华为,存储', category: 'Storage' },
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 5500 V5', keywords: 'OceanStor,5500,V5,华为,存储', category: 'Storage' },
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 6800 V5', keywords: 'OceanStor,6800,V5,华为,存储', category: 'Storage' },

  // ========== H3C Switch (14) ==========
  { vendor: 'H3C', productLine: 'S5000', officialName: 'H3C S5024E', keywords: 'S5024E,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S5000', officialName: 'H3C S5048E', keywords: 'S5048E,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S5500', officialName: 'H3C S5500V2-28C', keywords: 'S5500,28C,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S5500', officialName: 'H3C S5500V2-52C', keywords: 'S5500,52C,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S5560', officialName: 'H3C S5560-30S', keywords: 'S5560,30S,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S5560', officialName: 'H3C S5560-54S', keywords: 'S5560,54S,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S6800', officialName: 'H3C S6800-54QP', keywords: 'S6800,54QP,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S6800', officialName: 'H3C S6800-32Q', keywords: 'S6800,32Q,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S6900', officialName: 'H3C S6900-48F', keywords: 'S6900,48F,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S7500E', officialName: 'H3C S7503E', keywords: 'S7503E,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S7500E', officialName: 'H3C S7510E', keywords: 'S7510E,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S10500', officialName: 'H3C S10504', keywords: 'S10504,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S10500', officialName: 'H3C S10508', keywords: 'S10508,H3C,华三', category: 'Network' },
  { vendor: 'H3C', productLine: 'S10500', officialName: 'H3C S10512', keywords: 'S10512,H3C,华三', category: 'Network' },

  // ========== Ruijie Switch (8) ==========
  { vendor: 'Ruijie', productLine: 'RG-S2900', officialName: 'Ruijie RG-S2928G-E', keywords: 'S2928G,Ruijie,锐捷', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S2900', officialName: 'Ruijie RG-S2952G-E', keywords: 'S2952G,Ruijie,锐捷', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S5300', officialName: 'Ruijie RG-S5310-24GT4XS', keywords: 'S5310,24GT,Ruijie,锐捷', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S5300', officialName: 'Ruijie RG-S5310-48GT4XS', keywords: 'S5310,48GT,Ruijie,锐捷', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S5700', officialName: 'Ruijie RG-S5750-48GT', keywords: 'S5750,48GT,Ruijie,锐捷', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S6200', officialName: 'Ruijie RG-S6220-48XS', keywords: 'S6220,48XS,Ruijie,锐捷,数据中心', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S7800', officialName: 'Ruijie RG-S7805C', keywords: 'S7805C,Ruijie,锐捷', category: 'Network' },
  { vendor: 'Ruijie', productLine: 'RG-S7800', officialName: 'Ruijie RG-S7810C', keywords: 'S7810C,Ruijie,锐捷', category: 'Network' },

  // ========== NetApp Storage (12) ==========
  { vendor: 'NetApp', productLine: 'AFF A-Series', officialName: 'NetApp AFF A150', keywords: 'AFF,A150,All Flash,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'AFF A-Series', officialName: 'NetApp AFF A250', keywords: 'AFF,A250,All Flash,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'AFF A-Series', officialName: 'NetApp AFF A400', keywords: 'AFF,A400,All Flash,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'AFF A-Series', officialName: 'NetApp AFF A700', keywords: 'AFF,A700,All Flash,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'AFF A-Series', officialName: 'NetApp AFF A90', keywords: 'AFF,A90,All Flash,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'FAS Series', officialName: 'NetApp FAS2750', keywords: 'FAS,2750,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'FAS Series', officialName: 'NetApp FAS5000', keywords: 'FAS,5000,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'FAS Series', officialName: 'NetApp FAS8300', keywords: 'FAS,8300,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'FAS Series', officialName: 'NetApp FAS8700', keywords: 'FAS,8700,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'FAS Series', officialName: 'NetApp FAS9500', keywords: 'FAS,9500,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'E-Series', officialName: 'NetApp E2860', keywords: 'E2860,E-Series,NetApp', category: 'Storage' },
  { vendor: 'NetApp', productLine: 'E-Series', officialName: 'NetApp E5700', keywords: 'E5700,E-Series,NetApp', category: 'Storage' },

  // ========== QNAP / Synology (6) ==========
  { vendor: 'QNAP', productLine: 'TS Series', officialName: 'QNAP TS-453D', keywords: 'TS-453D,QNAP,威联通', category: 'Storage' },
  { vendor: 'QNAP', productLine: 'TS Series', officialName: 'QNAP TS-873A', keywords: 'TS-873A,QNAP,威联通', category: 'Storage' },
  { vendor: 'QNAP', productLine: 'TS Series', officialName: 'QNAP TS-h1290FX', keywords: 'TS-h1290FX,QNAP,威联通', category: 'Storage' },
  { vendor: 'Synology', productLine: 'DS Series', officialName: 'Synology DS1821+', keywords: 'DS1821,Synology,群晖', category: 'Storage' },
  { vendor: 'Synology', productLine: 'DS Series', officialName: 'Synology DS2422+', keywords: 'DS2422,Synology,群晖', category: 'Storage' },
  { vendor: 'Synology', productLine: 'RS Series', officialName: 'Synology RS3617xs+', keywords: 'RS3617,Synology,群晖', category: 'Storage' },

  // ========== Huawei Storage add (3) ==========
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 2200 V3', keywords: 'OceanStor,2200,V3,华为,存储', category: 'Storage' },
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 2600 V3', keywords: 'OceanStor,2600,V3,华为,存储', category: 'Storage' },
  { vendor: 'Huawei', productLine: 'OceanStor', officialName: 'Huawei OceanStor 18500 V5', keywords: 'OceanStor,18500,V5,华为,存储', category: 'Storage' },

  // ========== Inspur Storage (4) ==========
  { vendor: 'Inspur', productLine: 'AS Series', officialName: 'Inspur AS2150G2', keywords: 'AS2150,G2,浪潮,存储', category: 'Storage' },
  { vendor: 'Inspur', productLine: 'AS Series', officialName: 'Inspur AS2200G2', keywords: 'AS2200,G2,浪潮,存储', category: 'Storage' },
  { vendor: 'Inspur', productLine: 'AS Series', officialName: 'Inspur AS5300G5', keywords: 'AS5300,G5,浪潮,存储', category: 'Storage' },
  { vendor: 'Inspur', productLine: 'AS Series', officialName: 'Inspur AS5500G5', keywords: 'AS5500,G5,浪潮,存储', category: 'Storage' },

  // ========== Lenovo Network (4) ==========
  { vendor: 'Lenovo', productLine: 'ThinkSystem NE', officialName: 'Lenovo ThinkSystem NE1032', keywords: 'NE1032,ThinkSystem', category: 'Network' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem NE', officialName: 'Lenovo ThinkSystem NE1072', keywords: 'NE1072,ThinkSystem', category: 'Network' },
  { vendor: 'Lenovo', productLine: 'ThinkSystem NE', officialName: 'Lenovo ThinkSystem NE2580', keywords: 'NE2580,ThinkSystem', category: 'Network' },
  { vendor: 'Lenovo', productLine: 'RackSwitch', officialName: 'Lenovo RackSwitch G7028', keywords: 'G7028,RackSwitch', category: 'Network' },

  // ========== Juniper Network (5) ========== 
  { vendor: 'Juniper', productLine: 'EX Series', officialName: 'Juniper EX2300-24P', keywords: 'EX2300,24P,Juniper', category: 'Network' },
  { vendor: 'Juniper', productLine: 'EX Series', officialName: 'Juniper EX2300-48P', keywords: 'EX2300,48P,Juniper', category: 'Network' },
  { vendor: 'Juniper', productLine: 'EX Series', officialName: 'Juniper EX3400-24T', keywords: 'EX3400,24T,Juniper', category: 'Network' },
  { vendor: 'Juniper', productLine: 'EX Series', officialName: 'Juniper EX3400-48T', keywords: 'EX3400,48T,Juniper', category: 'Network' },
  { vendor: 'Juniper', productLine: 'QFX Series', officialName: 'Juniper QFX5110-48S', keywords: 'QFX5110,48S,Juniper', category: 'Network' },

  // ========== Ubiquiti (3) ==========
  { vendor: 'Ubiquiti', productLine: 'UniFi', officialName: 'Ubiquiti UniFi Switch 24', keywords: 'UniFi,24口,Ubiquiti', category: 'Network' },
  { vendor: 'Ubiquiti', productLine: 'UniFi', officialName: 'Ubiquiti UniFi Switch 48', keywords: 'UniFi,48口,Ubiquiti', category: 'Network' },
  { vendor: 'Ubiquiti', productLine: 'EdgeMax', officialName: 'Ubiquiti EdgeRouter 12', keywords: 'EdgeRouter,12,Ubiquiti', category: 'Network' },

  // ========== TP-Link Enterprise (4) ==========
  { vendor: 'TP-Link', productLine: 'JetStream', officialName: 'TP-Link JetStream TL-SG3428', keywords: 'TL-SG3428,TP-Link,普联', category: 'Network' },
  { vendor: 'TP-Link', productLine: 'JetStream', officialName: 'TP-Link JetStream TL-SG3452', keywords: 'TL-SG3452,TP-Link,普联', category: 'Network' },
  { vendor: 'TP-Link', productLine: 'Omada', officialName: 'TP-Link Omada SG2210P', keywords: 'SG2210P,Omada,TP-Link,普联', category: 'Network' },
  { vendor: 'TP-Link', productLine: 'Omada', officialName: 'TP-Link Omada SG2428P', keywords: 'SG2428P,Omada,TP-Link,普联', category: 'Network' },

  // ========== Palo Alto Firewall (4) ==========
  { vendor: 'Palo Alto', productLine: 'PA Series', officialName: 'Palo Alto PA-440', keywords: 'PA-440,PaloAlto,防火墙', category: 'Network' },
  { vendor: 'Palo Alto', productLine: 'PA Series', officialName: 'Palo Alto PA-460', keywords: 'PA-460,PaloAlto,防火墙', category: 'Network' },
  { vendor: 'Palo Alto', productLine: 'PA Series', officialName: 'Palo Alto PA-5250', keywords: 'PA-5250,PaloAlto,防火墙', category: 'Network' },
  { vendor: 'Palo Alto', productLine: 'PA Series', officialName: 'Palo Alto PA-5450', keywords: 'PA-5450,PaloAlto,防火墙', category: 'Network' },

  // ========== Fortinet (4) ==========
  { vendor: 'Fortinet', productLine: 'FortiGate', officialName: 'Fortinet FortiGate 60F', keywords: '60F,FortiGate,Fortinet,防火墙', category: 'Network' },
  { vendor: 'Fortinet', productLine: 'FortiGate', officialName: 'Fortinet FortiGate 80F', keywords: '80F,FortiGate,Fortinet,防火墙', category: 'Network' },
  { vendor: 'Fortinet', productLine: 'FortiGate', officialName: 'Fortinet FortiGate 100F', keywords: '100F,FortiGate,Fortinet,防火墙', category: 'Network' },
  { vendor: 'Fortinet', productLine: 'FortiGate', officialName: 'Fortinet FortiGate 600E', keywords: '600E,FortiGate,Fortinet,防火墙', category: 'Network' },

  // ========== HPE Server add (6) ==========
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL325 Gen10', keywords: 'DL325,Gen10,325', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL325 Gen11', keywords: 'DL325,Gen11,325', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL385 Gen10', keywords: 'DL385,Gen10,385', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL385 Gen11', keywords: 'DL385,Gen11,385', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL560 Gen10', keywords: 'DL560,Gen10,560', category: 'Server' },
  { vendor: 'HPE', productLine: 'ProLiant DL', officialName: 'HPE ProLiant DL580 Gen10', keywords: 'DL580,Gen10,580', category: 'Server' },

  // ========== Dell Server add (8) ==========
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R250', keywords: 'R250,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R350', keywords: 'R350,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R450', keywords: 'R450,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R650', keywords: 'R650,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R660', keywords: 'R660,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge R', officialName: 'Dell PowerEdge R7620', keywords: 'R7620,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge XR', officialName: 'Dell PowerEdge XR11', keywords: 'XR11,PowerEdge', category: 'Server' },
  { vendor: 'Dell', productLine: 'PowerEdge XR', officialName: 'Dell PowerEdge XR12', keywords: 'XR12,PowerEdge', category: 'Server' },
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
