const IMPORTED_FIXTURE_DATA = require('./imported-fixture-data')

function dellEmcVnxModel(model) {
  const compact = `VNX${model}`
  const spaced = `VNX ${model}`
  return {
    brand: 'Dell EMC',
    category: 'storage',
    canonicalModel: `Dell EMC VNX ${model}`,
    partNumber: compact,
    aliases: [
      `Dell EMC VNX ${model}`,
      `Dell EMC ${compact}`,
      `EMC VNX ${model}`,
      `EMC ${compact}`,
      spaced,
      compact,
    ],
  }
}

function dellEmcVnxeModel(model) {
  const compact = `VNXe${model}`
  const spaced = `VNXe ${model}`
  return {
    brand: 'Dell EMC',
    category: 'storage',
    canonicalModel: `Dell EMC VNXe ${model}`,
    partNumber: compact,
    aliases: [
      `Dell EMC VNXe ${model}`,
      `Dell EMC ${compact}`,
      `EMC VNXe ${model}`,
      `EMC ${compact}`,
      spaced,
      compact,
    ],
  }
}

function ibmStorwizeVSeriesModel(model, extraAliases = []) {
  return {
    brand: 'IBM',
    category: 'storage',
    canonicalModel: `IBM Storwize ${model}`,
    partNumber: model,
    aliases: [
      `IBM Storwize ${model}`,
      `IBM ${model}`,
      `Storwize ${model}`,
      model,
      `IBM ${model} 存储`,
      `${model} 存储`,
      ...extraAliases,
    ],
  }
}

function storageModel(brand, canonicalModel, partNumber, aliases = []) {
  return {
    brand,
    category: 'storage',
    canonicalModel,
    partNumber,
    aliases: [
      canonicalModel,
      partNumber,
      partNumber ? `${brand} ${partNumber}` : '',
      partNumber ? `${partNumber} 存储` : '',
      ...(Array.isArray(aliases) ? aliases : []),
    ].filter(Boolean),
  }
}

function networkModel(brand, canonicalModel, partNumber, aliases = []) {
  return {
    brand,
    category: 'network',
    canonicalModel,
    partNumber,
    aliases: [
      canonicalModel,
      partNumber,
      partNumber ? `${brand} ${partNumber}` : '',
      ...(Array.isArray(aliases) ? aliases : []),
    ].filter(Boolean),
  }
}

function hdsVspModel(model, extraAliases = []) {
  return storageModel('HDS', `HDS VSP ${model}`, model, [
    `VSP ${model}`,
    `Hitachi VSP ${model}`,
    `Hitachi Vantara VSP ${model}`,
    `HDS ${model}`,
    ...(Array.isArray(extraAliases) ? extraAliases : []),
  ])
}

function lenovoNetappThinkSystemStorageModel(model, extraAliases = []) {
  return storageModel('LenovoNetapp', `LenovoNetapp ThinkSystem ${model}`, model, [
    `LenovoNetapp ${model}`,
    `Lenovo NetApp ${model}`,
    `Lenovo NetApp ThinkSystem ${model}`,
    `Lenovo ThinkSystem ${model}`,
    `Lenovo ${model}`,
    `ThinkSystem ${model}`,
    ...(Array.isArray(extraAliases) ? extraAliases : []),
  ])
}

function netAppAffModel(model, extraAliases = []) {
  return storageModel('NetApp', `NetApp AFF ${model}`, `AFF ${model}`, [
    `NetApp ${model}`,
    `ONTAP ${model}`,
    model,
    ...(Array.isArray(extraAliases) ? extraAliases : []),
  ])
}

function netAppFasModel(model, extraAliases = []) {
  return storageModel('NetApp', `NetApp FAS${model}`, `FAS${model}`, [
    `NetApp FAS ${model}`,
    `FAS ${model}`,
    ...(Array.isArray(extraAliases) ? extraAliases : []),
  ])
}

function netAppEModel(model, extraAliases = []) {
  return storageModel('NetApp', `NetApp E${model}`, `E${model}`, [
    `NetApp E-Series E${model}`,
    `E-Series E${model}`,
    `E ${model}`,
    ...(Array.isArray(extraAliases) ? extraAliases : []),
  ])
}

function huaweiNetworkModel(canonicalModel, partNumber, aliases = []) {
  return networkModel('Huawei', canonicalModel, partNumber, [
    `Huawei ${partNumber}`,
    `华为 ${partNumber}`,
    `华为${partNumber}`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function huaweiFirewallModel(model, aliases = []) {
  const digits = model.match(/\d+/)?.[0] || model
  const withoutSuffix = model.endsWith('E') ? model.slice(0, -1) : ''
  return huaweiNetworkModel(`Huawei ${model}`, model, [
    withoutSuffix,
    withoutSuffix ? `Huawei ${withoutSuffix}` : '',
    `HiSecEngine ${model}`,
    `Huawei HiSecEngine ${model}`,
    `${model} 防火墙`,
    `${digits} 防火墙`,
    `华为 ${model} 防火墙`,
    `华为${model}防火墙`,
    `华为防火墙${digits}`,
    ...(Array.isArray(aliases) ? aliases : []),
  ].filter(Boolean))
}

function huaweiSwitchModel(model, aliases = []) {
  return huaweiNetworkModel(`Huawei ${model}`, model, [
    `${model} 交换机`,
    `华为 ${model} 交换机`,
    `华为交换机${model}`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function huaweiRouterModel(model, aliases = []) {
  return huaweiNetworkModel(`Huawei ${model}`, model, [
    `${model} 路由器`,
    `华为 ${model} 路由器`,
    `华为路由器${model}`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

const DELL_EMC_VNX_FIXTURE_DATA = [
  ...['5100', '5300', '5500', '5700', '7500'].map(dellEmcVnxModel),
  ...['5200', '5400', '5600', '5800', '7600', '8000'].map(dellEmcVnxModel),
  ...['3100', '3150', '3200', '3300'].map(dellEmcVnxeModel),
]

const IBM_STORAGE_V_SERIES_FIXTURE_DATA = [
  ibmStorwizeVSeriesModel('V3500'),
  ibmStorwizeVSeriesModel('V3700'),
  ibmStorwizeVSeriesModel('V5000', ['IBM Storwize V5000 Gen1', 'Storwize V5000 Gen1', 'V5000 Gen1']),
  ibmStorwizeVSeriesModel('V5010'),
  ibmStorwizeVSeriesModel('V5020'),
  ibmStorwizeVSeriesModel('V5030'),
  ibmStorwizeVSeriesModel('V5030F', ['IBM Storwize V5030 F', 'Storwize V5030 F', 'V5030 F']),
  ibmStorwizeVSeriesModel('V5035'),
  ibmStorwizeVSeriesModel('V7000'),
  ibmStorwizeVSeriesModel('V7000 Gen2', ['IBM Storwize V7000 G2', 'IBM V7000 G2', 'Storwize V7000 G2', 'V7000 G2']),
  ibmStorwizeVSeriesModel('V7000 Gen2+', [
    'IBM Storwize V7000 Gen2 Plus',
    'IBM Storwize V7000 G2+',
    'IBM V7000 G2+',
    'V7000 Gen2 Plus',
    'V7000 G2+',
  ]),
  ibmStorwizeVSeriesModel('V7000 Unified', ['IBM Storwize V7000U', 'IBM V7000U', 'Storwize V7000U', 'V7000U']),
  ibmStorwizeVSeriesModel('V7000F', ['IBM Storwize V7000 F', 'Storwize V7000 F', 'V7000 F']),
  {
    brand: 'IBM',
    category: 'storage',
    canonicalModel: 'IBM FlashSystem V9000',
    partNumber: 'V9000',
    aliases: [
      'IBM FlashSystem V9000',
      'IBM V9000',
      'FlashSystem V9000',
      'V9000',
      'IBM V9000 存储',
      'V9000 存储',
    ],
  },
]

const HDS_STORAGE_FIXTURE_DATA = [
  ...[
    'G200',
    'G370',
    'G400',
    'G600',
    'G700',
    'G800',
    'G900',
    'G1000',
    'G1500',
    'F350',
    'F370',
    'F400',
    'F600',
    'F700',
    'F900',
    'E590',
    'E790',
    'E990',
    '5100',
    '5200',
    '5500',
    '5600',
  ].map(hdsVspModel),
  ...['HUS 110', 'HUS 130', 'HUS 150'].map((model) => storageModel('HDS', `HDS ${model}`, model, [
    `Hitachi ${model}`,
    `Hitachi Unified Storage ${model.replace('HUS ', '')}`,
    model.replace(/\s+/g, ''),
  ])),
  ...['AMS 2100', 'AMS 2300', 'AMS 2500'].map((model) => storageModel('HDS', `HDS ${model}`, model, [
    `Hitachi ${model}`,
    `Adaptable Modular Storage ${model.replace('AMS ', '')}`,
    model.replace(/\s+/g, ''),
  ])),
]

const LENOVO_NETAPP_STORAGE_FIXTURE_DATA = [
  ...[
    'DM3000H',
    'DM5000H',
    'DM5000F',
    'DM7000H',
    'DM7000F',
    'DM7100H',
    'DM7100F',
    'DM3010H',
    'DM5010H',
    'DE2000H',
    'DE4000F',
    'DE6000F',
    'DE6400H',
    'DE6400F',
    'DE6600H',
    'DE6600F',
  ].map(lenovoNetappThinkSystemStorageModel),
]

const LENOVO_STORAGE_FIXTURE_DATA = [
  storageModel('Lenovo', 'Lenovo Storage V3700 V2', 'V3700 V2', [
    'Lenovo V3700 V2',
    'Lenovo V3700',
    'Storage V3700 V2',
    'V3700',
  ]),
  storageModel('Lenovo', 'Lenovo Storage S2200', 'S2200', ['Lenovo S2200', 'Storage S2200']),
  storageModel('Lenovo', 'Lenovo Storage S3200', 'S3200', ['Lenovo S3200', 'Storage S3200']),
  storageModel('Lenovo', 'Lenovo Storage D1212', 'D1212', ['Lenovo D1212', 'Storage D1212']),
  storageModel('Lenovo', 'Lenovo Storage D1224', 'D1224', ['Lenovo D1224', 'Storage D1224']),
  storageModel('Lenovo', 'Lenovo Storage D3284', 'D3284', ['Lenovo D3284', 'Storage D3284']),
]

const NETAPP_STORAGE_FIXTURE_DATA = [
  ...['A200', 'A220', 'A300', 'A320', 'A800', 'A900', 'A20', 'A30', 'A50', 'A70', 'A1K'].map(netAppAffModel),
  ...['C190', 'C250', 'C400', 'C800'].map((model) => netAppAffModel(model, [`AFF ${model} All Flash`])),
  ...['2552', '2554', '2620', '2650', '2720', '8200', '9000'].map(netAppFasModel),
  ...['2800', '2824', '5724', '5760'].map(netAppEModel),
  ...['SG5712', 'SG5760', 'SG6060', 'SGF6024', 'SG100', 'SG1000'].map((model) => storageModel(
    'NetApp',
    `NetApp StorageGRID ${model}`,
    model,
    [`StorageGRID ${model}`, `NetApp ${model}`],
  )),
]

const HUAWEI_NETWORK_SECURITY_FIXTURE_DATA = [
  ...[
    'USG6305E',
    'USG6310E',
    'USG6320',
    'USG6330',
    'USG6350',
    'USG6360',
    'USG6370',
    'USG6380',
    'USG6390',
    'USG6510E',
    'USG6525E',
    'USG6530E',
    'USG6550E',
    'USG6560E',
    'USG6580E',
    'USG6605E',
    'USG6610E',
    'USG6620E',
    'USG6630E',
    'USG6650E',
    'USG6680E',
    'USG6685E',
    'USG6712E',
    'USG6716E',
    'USG6720E',
    'USG6750E',
  ].map((model) => huaweiFirewallModel(model, model === 'USG6685E' ? [
    'USG6685',
    'Huawei USG6685',
    '华为 USG6685',
    '6685',
    '6685E',
    '6685E 防火墙',
    'USG 6685',
    'USG 6685E',
  ] : [])),
  huaweiNetworkModel('Huawei HiSecEngine AntiDDoS8000', 'AntiDDoS8000', [
    'Anti DDoS 8000',
    'AntiDDoS 8000',
    '华为 AntiDDoS8000',
    '华为抗D 8000',
    '抗D 8000',
  ]),
  huaweiNetworkModel('Huawei NIP6600', 'NIP6600', [
    'Huawei NIP 6600',
    'NIP 6600',
    '华为 NIP6600',
    '入侵防御 NIP6600',
  ]),
]

const HUAWEI_SWITCH_FIXTURE_DATA = [
  ...[
    'S5700',
    'S5720',
    'S5720S',
    'S5735S',
    'S5735-L24T4S',
    'S5735-L48T4S',
    'S5735-S24T4X',
    'S5735-S48T4X',
    'S5735S-S24T4X-A',
    'S5735S-S48T4X-A',
    'S5736-S24T4XC',
    'S5736-S48T4XC',
    'S6720',
    'S6720S',
    'S6730-H24X6C',
    'S6730-H48X6C',
    'S6730-S24X6Q',
    'S6730-S48X6Q',
    'S7703',
    'S7706',
    'S7712',
    'S12700E',
  ].map(huaweiSwitchModel),
  ...[
    'CE6855',
    'CE6857',
    'CE6857E',
    'CE6863',
    'CE6863E',
    'CE6865E',
    'CE6881',
    'CE6881K',
    'CE8850',
    'CE8861',
    'CE12800',
  ].map((model) => huaweiSwitchModel(model, [
    `Huawei CloudEngine ${model}`,
    `CloudEngine ${model}`,
    `${model} 数据中心交换机`,
  ])),
]

const HUAWEI_ROUTER_FIXTURE_DATA = [
  ...[
    'AR1220',
    'AR2220',
    'AR2240',
    'AR3260',
    'AR6120',
    'AR6121',
    'AR6121E',
    'AR6140',
    'AR6140E',
    'AR6280',
    'AR6300',
    'AR651',
    'AR651C',
    'AR617VW',
    'NE20E-S2',
    'NE40E-X3',
    'NE40E-X8',
  ].map(huaweiRouterModel),
  huaweiRouterModel('NetEngine 8000 M1A', ['NE8000 M1A', 'NetEngine8000 M1A']),
  huaweiRouterModel('NetEngine 8000 M6', ['NE8000 M6', 'NetEngine8000 M6']),
  huaweiRouterModel('NetEngine 8000 M8', ['NE8000 M8', 'NetEngine8000 M8']),
]

const BASE_FIXTURE_DATA = [
  {
    brand: 'HPE',
    category: 'server',
    canonicalModel: 'HPE ProLiant DL380 Gen10',
    aliases: ['HP DL380 G10', 'DL380 Gen10', 'ProLiant DL380 Gen10'],
  },
  {
    brand: 'Dell',
    category: 'server',
    canonicalModel: 'Dell PowerEdge R740',
    aliases: ['PowerEdge R740', 'Dell R740', 'PE R740'],
  },
  {
    brand: 'Lenovo',
    category: 'server',
    canonicalModel: 'Lenovo ThinkSystem SR650',
    aliases: ['ThinkSystem SR650', 'Lenovo SR650', 'SR650'],
  },
  {
    brand: 'IBM',
    category: 'server',
    canonicalModel: 'IBM Power System S922',
    aliases: ['Power System S922', 'IBM S922', 'Power S922'],
  },
  {
    brand: 'NetApp',
    category: 'storage',
    canonicalModel: 'NetApp AFF A250',
    aliases: ['AFF A250', 'NetApp A250', 'ONTAP A250'],
  },
  {
    brand: 'HDS',
    category: 'storage',
    canonicalModel: 'HDS VSP G350',
    aliases: ['VSP G350', 'Hitachi VSP G350', 'HDS G350'],
  },
  {
    brand: 'Dell EMC',
    category: 'storage',
    canonicalModel: 'Dell EMC PowerStore 1000T',
    aliases: ['PowerStore 1000T', 'Dell PowerStore 1000T', 'EMC PowerStore 1000T'],
  },
  {
    brand: 'QNAP',
    category: 'storage',
    canonicalModel: 'QNAP TS-h1886XU-RP',
    aliases: ['TS-h1886XU-RP', 'QNAP TS h1886XU RP', 'TS h1886XU RP'],
  },
  {
    brand: 'Synology',
    category: 'storage',
    canonicalModel: 'Synology RS2421RP+',
    aliases: ['RS2421RP+', 'Synology RS2421RP Plus', 'RS2421RP Plus'],
  },
  {
    brand: 'Huawei',
    category: 'storage',
    canonicalModel: 'Huawei OceanStor 5110 V5',
    partNumber: '5110 V5',
    aliases: ['OceanStor 5110 V5', 'Huawei 5110 V5', 'OceanStor 5110'],
  },
  {
    brand: 'Huawei',
    category: 'storage',
    canonicalModel: 'Huawei OceanStor 2200 V5',
    partNumber: '2200 V5',
    aliases: ['OceanStor 2200 V5', 'Huawei 2200 V5', 'OceanStor 2200'],
  },
  {
    brand: 'Huawei',
    category: 'storage',
    canonicalModel: 'Huawei OceanStor 5310',
    partNumber: '5310',
    aliases: ['OceanStor 5310', 'Huawei 5310', 'OceanStor 5310 V5', 'Huawei OceanStor 5310 V5'],
  },
  {
    brand: 'Huawei',
    category: 'storage',
    canonicalModel: 'Huawei OceanStor 5300 V5',
    partNumber: '5300 V5',
    aliases: ['OceanStor 5300 V5', 'Huawei 5300 V5', 'OceanStor 5300'],
  },
  {
    brand: 'Huawei',
    category: 'storage',
    canonicalModel: 'Huawei OceanStor 5500 V5',
    partNumber: '5500 V5',
    aliases: ['OceanStor 5500 V5', 'Huawei 5500 V5', 'OceanStor 5500'],
  },
  {
    brand: 'Huawei',
    category: 'storage',
    canonicalModel: 'Huawei OceanStor 6800 V5',
    partNumber: '6800 V5',
    aliases: ['OceanStor 6800 V5', 'Huawei 6800 V5', 'OceanStor 6800'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9300',
    aliases: ['Catalyst 9300', 'Cisco C9300', 'C9300'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9200',
    aliases: ['Catalyst 9200', 'Cisco C9200', 'C9200'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9200CX',
    aliases: ['Catalyst 9200CX', 'Cisco C9200CX', 'C9200CX'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9300L',
    aliases: ['Catalyst 9300L', 'Cisco C9300L', 'C9300L'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9300X',
    aliases: ['Catalyst 9300X', 'Cisco C9300X', 'C9300X'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9500',
    aliases: ['Catalyst 9500', 'Cisco C9500', 'C9500'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Catalyst 9500X',
    aliases: ['Catalyst 9500X', 'Cisco C9500X', 'C9500X'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-8T-E-2G',
    aliases: ['CBS1300-8T-E-2G', 'Cisco CBS1300-8T-E-2G', 'Cisco Business 1300-8T-E-2G', 'C1300-8T-E-2G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-8P-E-2G',
    aliases: ['CBS1300-8P-E-2G', 'Cisco CBS1300-8P-E-2G', 'Cisco Business 1300-8P-E-2G', 'C1300-8P-E-2G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-16T-2G',
    aliases: ['CBS1300-16T-2G', 'Cisco CBS1300-16T-2G', 'Cisco Business 1300-16T-2G', 'C1300-16T-2G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-16P-2G',
    aliases: ['CBS1300-16P-2G', 'Cisco CBS1300-16P-2G', 'Cisco Business 1300-16P-2G', 'C1300-16P-2G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-24T-4G',
    aliases: ['CBS1300-24T-4G', 'Cisco CBS1300-24T-4G', 'Cisco Business 1300-24T-4G', 'C1300-24T-4G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-24P-4G',
    aliases: ['CBS1300-24P-4G', 'Cisco CBS1300-24P-4G', 'Cisco Business 1300-24P-4G', 'C1300-24P-4G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-48T-4G',
    aliases: ['CBS1300-48T-4G', 'Cisco CBS1300-48T-4G', 'Cisco Business 1300-48T-4G', 'C1300-48T-4G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Business CBS1300-48P-4G',
    aliases: ['CBS1300-48P-4G', 'Cisco CBS1300-48P-4G', 'Cisco Business 1300-48P-4G', 'C1300-48P-4G'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Nexus 93180YC-FX3',
    aliases: ['Nexus 93180YC-FX3', 'Cisco N9K-C93180YC-FX3', '93180YC-FX3'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Nexus 93240YC-FX2',
    aliases: ['Nexus 93240YC-FX2', 'Cisco N9K-C93240YC-FX2', '93240YC-FX2'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco Nexus 9364C-GX',
    aliases: ['Nexus 9364C-GX', 'Cisco N9K-C9364C-GX', '9364C-GX'],
  },
  {
    brand: 'Cisco',
    category: 'network',
    canonicalModel: 'Cisco MDS 9148T',
    aliases: ['MDS 9148T', 'Cisco DS-C9148T', '9148T'],
  },
  {
    brand: 'Cisco',
    category: 'server',
    canonicalModel: 'Cisco UCS C220 M7',
    aliases: ['UCS C220 M7', 'Cisco C220 M7', 'C220 M7'],
  },
  {
    brand: 'Cisco',
    category: 'server',
    canonicalModel: 'Cisco UCS C240 M7',
    aliases: ['UCS C240 M7', 'Cisco C240 M7', 'C240 M7'],
  },
  {
    brand: 'Cisco',
    category: 'server',
    canonicalModel: 'Cisco UCS X210c M7',
    aliases: ['UCS X210c M7', 'Cisco X210c M7', 'X210c M7'],
  },
  {
    brand: 'Huawei',
    category: 'network',
    canonicalModel: 'Huawei S5735S',
    partNumber: 'S5735S',
    aliases: ['S5735S', 'Huawei S5735-S', 'S5735 S'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5024E',
    partNumber: 'S5024E',
    aliases: ['S5024E', 'H3C S5024E', 'S5000 24E'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5048E',
    partNumber: 'S5048E',
    aliases: ['S5048E', 'H3C S5048E', 'S5000 48E'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5500V2-28C',
    partNumber: 'S5500V2-28C',
    aliases: ['S5500V2-28C', 'H3C S5500V2-28C', 'S5500 28C'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5500V2-52C',
    partNumber: 'S5500V2-52C',
    aliases: ['S5500V2-52C', 'H3C S5500V2-52C', 'S5500 52C'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5560-30S',
    partNumber: 'S5560-30S',
    aliases: ['S5560-30S', 'H3C S5560-30S', 'S5560 30S'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5560-54S',
    partNumber: 'S5560-54S',
    aliases: ['S5560-54S', 'H3C S5560-54S', 'S5560 54S'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S5560X',
    partNumber: 'S5560X',
    aliases: ['S5560X', 'H3C S5560-X', 'S5560 X'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S6800-54QP',
    partNumber: 'S6800-54QP',
    aliases: ['S6800-54QP', 'H3C S6800-54QP', 'S6800 54QP'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S6800-32Q',
    partNumber: 'S6800-32Q',
    aliases: ['S6800-32Q', 'H3C S6800-32Q', 'S6800 32Q'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S6900-48F',
    partNumber: 'S6900-48F',
    aliases: ['S6900-48F', 'H3C S6900-48F', 'S6900 48F'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S7503E',
    partNumber: 'S7503E',
    aliases: ['S7503E', 'H3C S7503E', 'S7500E 3-slot'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S7510E',
    partNumber: 'S7510E',
    aliases: ['S7510E', 'H3C S7510E', 'S7500E 10-slot'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S10504',
    partNumber: 'S10504',
    aliases: ['S10504', 'H3C S10504', 'S10500 4-slot'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S10508',
    partNumber: 'S10508',
    aliases: ['S10508', 'H3C S10508', 'S10500 8-slot'],
  },
  {
    brand: 'H3C',
    category: 'network',
    canonicalModel: 'H3C S10512',
    partNumber: 'S10512',
    aliases: ['S10512', 'H3C S10512', 'S10500 12-slot'],
  },
  {
    brand: 'Brocade',
    category: 'network',
    canonicalModel: 'Brocade G610',
    aliases: ['G610', 'Brocade Switch G610', 'Brocade Gen 6 G610'],
  },
  {
    brand: 'F5',
    category: 'network',
    canonicalModel: 'F5 BIG-IP i5800',
    aliases: ['BIG-IP i5800', 'F5 i5800', 'BIG IP i5800'],
  },
]

module.exports = [
  ...BASE_FIXTURE_DATA,
  ...DELL_EMC_VNX_FIXTURE_DATA,
  ...IBM_STORAGE_V_SERIES_FIXTURE_DATA,
  ...HDS_STORAGE_FIXTURE_DATA,
  ...LENOVO_NETAPP_STORAGE_FIXTURE_DATA,
  ...LENOVO_STORAGE_FIXTURE_DATA,
  ...NETAPP_STORAGE_FIXTURE_DATA,
  ...HUAWEI_NETWORK_SECURITY_FIXTURE_DATA,
  ...HUAWEI_SWITCH_FIXTURE_DATA,
  ...HUAWEI_ROUTER_FIXTURE_DATA,
  ...IMPORTED_FIXTURE_DATA,
]
