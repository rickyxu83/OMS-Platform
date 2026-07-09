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

function dellStorageModel(brand, family, model, extraAliases = []) {
  const familyCompact = String(family || '').replace(/\s+/g, '')
  const modelText = String(model || '').trim()
  return storageModel(brand, `${brand} ${family} ${modelText}`, modelText, [
    `${family} ${modelText}`,
    `${familyCompact} ${modelText}`,
    `${familyCompact}${modelText}`,
    modelText,
    brand === 'Dell EMC' ? `Dell ${family} ${modelText}` : '',
    brand === 'Dell EMC' ? `EMC ${family} ${modelText}` : '',
    `${modelText} 存储`,
    ...(Array.isArray(extraAliases) ? extraAliases : []),
  ].filter(Boolean))
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

function serverModel(brand, canonicalModel, partNumber, aliases = []) {
  return {
    brand,
    category: 'server',
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

function hpeProLiantModel(model, aliases = []) {
  return serverModel('HPE', `HPE ProLiant ${model}`, model, [
    `HP ProLiant ${model}`,
    `HPE ${model}`,
    `HP ${model}`,
    model,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function dellPowerEdgeModel(model, aliases = []) {
  return serverModel('Dell', `Dell PowerEdge ${model}`, model, [
    `PowerEdge ${model}`,
    `Dell ${model}`,
    `PE ${model}`,
    model,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function lenovoThinkSystemServerModel(model, aliases = []) {
  return serverModel('Lenovo', `Lenovo ThinkSystem ${model}`, model, [
    `Lenovo ${model}`,
    `ThinkSystem ${model}`,
    model,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function ibmPowerServerModel(model, aliases = []) {
  return serverModel('IBM', `IBM Power System ${model}`, model, [
    `IBM ${model}`,
    `Power ${model}`,
    `Power System ${model}`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
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
  return storageModel('Lenovo', `Lenovo ThinkSystem ${model}`, model, [
    `LenovoNetapp ${model}`,
    `LenovoNetapp ThinkSystem ${model}`,
    `Lenovo NetApp ${model}`,
    `Lenovo NetApp ThinkSystem ${model}`,
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

function paloAltoFirewallModel(model, aliases = []) {
  const compact = model.replace(/-/g, '')
  return networkModel('Palo Alto Networks', `Palo Alto Networks ${model}`, model, [
    `Palo Alto ${model}`,
    `PaloAlto ${model}`,
    `PaloAlto${compact.replace(/^PA/i, '')}`,
    compact,
    `PAN-${model}`,
    `${model} 防火墙`,
    `${compact} 防火墙`,
    `Palo Alto ${model} 防火墙`,
    `Palo Alto Networks ${model} 防火墙`,
    `PaloAlto ${model} 防火墙`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function fortinetAdcModel(model, aliases = []) {
  const hyphenated = `FortiADC-${model}`
  const spaced = `FortiADC ${model}`
  return networkModel('Fortinet', `Fortinet ${hyphenated}`, hyphenated, [
    spaced,
    `Fortinet ${spaced}`,
    `Fortinet ${hyphenated}`,
    `FAD-${model}`,
    `FAD ${model}`,
    `FortiADC${model}`,
    `${hyphenated} 负载均衡`,
    `${spaced} 负载均衡`,
    `${hyphenated} 应用交付`,
    `${spaced} 应用交付`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function fortinetFortiGateModel(model, aliases = []) {
  return networkModel('Fortinet', `Fortinet FortiGate ${model}`, `FortiGate-${model}`, [
    `FortiGate ${model}`,
    `FortiGate${model}`,
    `Fortinet ${model}`,
    `FG-${model}`,
    `FGT-${model}`,
    `FG ${model}`,
    `FGT ${model}`,
    model,
    `${model} 防火墙`,
    `FortiGate ${model} 防火墙`,
    `Fortinet FortiGate ${model} 防火墙`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function sangforNetworkModel(productLine, model, aliases = []) {
  const normalizedLine = String(productLine || '').trim()
  const normalizedModel = String(model || '').trim()
  const partNumber = `${normalizedLine}-${normalizedModel}`
  return networkModel('Sangfor', `Sangfor ${normalizedLine} ${normalizedModel}`, partNumber, [
    `Sangfor ${partNumber}`,
    `SANGFOR ${partNumber}`,
    `Sangfor ${normalizedLine}-${normalizedModel}`,
    `Sangfor ${normalizedLine} ${normalizedModel}`,
    `深信服 ${partNumber}`,
    `深信服 ${normalizedLine}-${normalizedModel}`,
    `深信服 ${normalizedLine} ${normalizedModel}`,
    `深信服${partNumber}`,
    `深信服${normalizedLine}${normalizedModel}`,
    partNumber,
    `${normalizedLine}-${normalizedModel}`,
    `${normalizedLine} ${normalizedModel}`,
    `${normalizedLine}${normalizedModel}`,
    normalizedModel,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function sangforAfModel(model, aliases = []) {
  return sangforNetworkModel('AF', model, [
    `${model} 防火墙`,
    `AF-${model} 防火墙`,
    `Sangfor AF-${model} 防火墙`,
    `深信服 AF-${model} 防火墙`,
    `深信服下一代防火墙 ${model}`,
    '深信服防火墙',
    'Sangfor NGAF',
    'NGAF',
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function sangforAcModel(model, aliases = []) {
  return sangforNetworkModel('AC', model, [
    `${model} 上网行为管理`,
    `AC-${model} 上网行为管理`,
    `Sangfor AC-${model} 上网行为管理`,
    `深信服 AC-${model} 上网行为管理`,
    '深信服上网行为管理',
    'Sangfor IAM',
    'IAM',
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function sangforAdModel(model, aliases = []) {
  return sangforNetworkModel('AD', model, [
    `${model} 负载均衡`,
    `AD-${model} 负载均衡`,
    `Sangfor AD-${model} 负载均衡`,
    `深信服 AD-${model} 负载均衡`,
    `${model} 应用交付`,
    `AD-${model} 应用交付`,
    '深信服应用交付',
    '深信服负载均衡',
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function sangforVpnModel(model, aliases = []) {
  return sangforNetworkModel('SSL VPN', model, [
    `SSL VPN-${model}`,
    `SSLVPN-${model}`,
    `Sangfor SSL VPN ${model}`,
    `深信服 SSL VPN ${model}`,
    `深信服 SSLVPN ${model}`,
    `${model} VPN`,
    '深信服 VPN',
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function ciscoNexusModel(model, partNumber, aliases = []) {
  const compact = String(model || '').replace(/\s+/g, '')
  return networkModel('Cisco', `Cisco Nexus ${model}`, partNumber || compact, [
    `Nexus ${model}`,
    `Cisco ${compact}`,
    `Nexus ${compact}`,
    compact,
    partNumber,
    partNumber ? partNumber.replace(/-/g, ' ') : '',
    `${model} 交换机`,
    `Nexus ${model} 交换机`,
    `Cisco Nexus ${model} 交换机`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaNetworkModel(canonicalModel, partNumber, aliases = []) {
  return networkModel('Aruba', canonicalModel, partNumber, [
    `HPE ${canonicalModel}`,
    `HP ${canonicalModel}`,
    `HPE Aruba ${partNumber}`,
    `HP Aruba ${partNumber}`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaSwitchModel(model, aliases = []) {
  return arubaNetworkModel(`Aruba ${model}`, model, [
    model.replace(/\s+/g, ''),
    `Aruba ${model} Switch`,
    `Aruba Switch ${model}`,
    `${model} 交换机`,
    `Aruba ${model} 交换机`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaCxSwitchModel(model, aliases = []) {
  return arubaSwitchModel(`CX ${model}`, [
    `ArubaCX ${model}`,
    `Aruba CX${model}`,
    `AOS-CX ${model}`,
    `ArubaOS-CX ${model}`,
    `CX${model}`,
    `${model} CX`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaApModel(model, aliases = []) {
  const apNumber = String(model || '').replace(/^AP-/i, '')
  return arubaNetworkModel(`Aruba ${model}`, model, [
    `Aruba ${apNumber}`,
    `Aruba IAP-${apNumber}`,
    `IAP-${apNumber}`,
    `AP${apNumber}`,
    `${apNumber} AP`,
    `${model} 无线AP`,
    `Aruba ${model} 无线AP`,
    `Aruba ${apNumber} 无线AP`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaInstantOnApModel(model, aliases = []) {
  return arubaNetworkModel(`Aruba Instant On ${model}`, model, [
    `Instant On ${model}`,
    `Aruba ${model}`,
    `${model} 无线AP`,
    `Instant On ${model} 无线AP`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaControllerModel(model, aliases = []) {
  return arubaNetworkModel(`Aruba ${model} Mobility Controller`, model, [
    `Aruba ${model}`,
    `Aruba Controller ${model}`,
    `Aruba Mobility Controller ${model}`,
    `${model} 控制器`,
    `Aruba ${model} 控制器`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function arubaGatewayModel(model, aliases = []) {
  return arubaNetworkModel(`Aruba ${model} Gateway`, model, [
    `Aruba ${model}`,
    `Aruba Gateway ${model}`,
    `${model} 网关`,
    `Aruba ${model} 网关`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

function hpeFlexFabricSwitchModel(model, partNumber, aliases = []) {
  return networkModel('HPE', `HPE FlexFabric ${model}`, partNumber || model, [
    `HP FlexFabric ${model}`,
    `HPE ${model}`,
    `HP ${model}`,
    `FlexFabric ${model}`,
    `${model} 交换机`,
    ...(Array.isArray(aliases) ? aliases : []),
  ])
}

const DELL_EMC_VNX_FIXTURE_DATA = [
  ...['5100', '5300', '5500', '5700', '7500'].map(dellEmcVnxModel),
  ...['5200', '5400', '5600', '5800', '7600', '8000'].map(dellEmcVnxModel),
  ...['3100', '3150', '3200', '3300'].map(dellEmcVnxeModel),
]

const DELL_STORAGE_FIXTURE_DATA = [
  ...['ME4012', 'ME4024', 'ME4084', 'ME5084'].map((model) => dellStorageModel('Dell', 'PowerVault', model)),
  ...[
    'MD1200',
    'MD1220',
    'MD1400',
    'MD1420',
    'MD3200',
    'MD3220',
    'MD3260',
    'MD3200i',
    'MD3220i',
    'MD3260i',
    'MD3400',
    'MD3420',
    'MD3460',
    'MD3600i',
    'MD3620i',
    'MD3660i',
    'MD3600f',
    'MD3620f',
    'MD3660f',
    'MD3800i',
    'MD3820i',
    'MD3860i',
    'MD3800f',
    'MD3820f',
    'MD3860f',
  ].map((model) => dellStorageModel('Dell', 'PowerVault', model)),
  ...[
    '500T',
    '1000X',
    '3000T',
    '3000X',
    '3200T',
    '5000T',
    '5000X',
    '5200T',
    '7000T',
    '7000X',
    '9000T',
    '9000X',
    '9200T',
  ].map((model) => dellStorageModel('Dell', 'PowerStore', model)),
]

const DELL_EMC_STORAGE_FIXTURE_DATA = [
  ...[
    'PS4100',
    'PS4110',
    'PS4210',
    'PS6100',
    'PS6110',
    'PS6210',
    'PS6500',
    'PS6510',
    'PS6610',
  ].map((model) => dellStorageModel('Dell EMC', 'EqualLogic', model, [
    `Dell EqualLogic ${model}`,
    `EqualLogic ${model}`,
  ])),
  ...[
    'SCv2000',
    'SCv2020',
    'SCv2080',
    'SC4020',
    'SC5020',
    'SC5020F',
    'SC7020',
    'SC7020F',
    'SC8000',
    'SC9000',
  ].map((model) => storageModel('Dell EMC', `Dell EMC ${model}`, model, [
    `Dell EMC SC Series ${model}`,
    `Dell SC ${model}`,
    `Dell Compellent ${model}`,
    `Compellent ${model}`,
    model.replace(/^SCv/i, 'SCv '),
  ])),
  ...[
    '300',
    '300F',
    '350F',
    '400',
    '400F',
    '450F',
    '500',
    '500F',
    '550F',
    '600',
    '600F',
    '650F',
  ].map((model) => dellStorageModel('Dell EMC', 'Unity', model, [
    `Dell Unity ${model}`,
    `EMC Unity ${model}`,
  ])),
  ...['380F', '480F', '680', '680F', '880F'].map((model) => dellStorageModel('Dell EMC', 'Unity XT', model, [
    `Dell Unity XT ${model}`,
    `EMC Unity XT ${model}`,
  ])),
  ...[
    'A200',
    'A300',
    'H400',
    'H500',
    'H600',
    'H700',
    'F200',
    'F600',
    'F800',
    'F900',
  ].map((model) => dellStorageModel('Dell EMC', 'PowerScale', model, [
    `Dell PowerScale ${model}`,
    `Isilon ${model}`,
  ])),
  ...['NL400', 'S210', 'X410'].map((model) => dellStorageModel('Dell EMC', 'Isilon', model, [
    `EMC Isilon ${model}`,
    `Dell Isilon ${model}`,
  ])),
  ...[
    'DD2500',
    'DD3300',
    'DD4200',
    'DD4500',
    'DD6300',
    'DD6400',
    'DD6800',
    'DD6900',
    'DD7200',
    'DD9300',
    'DD9400',
    'DD9500',
    'DD9800',
    'DD9900',
  ].map((model) => dellStorageModel('Dell EMC', 'Data Domain', model, [
    `Dell Data Domain ${model}`,
    `EMC Data Domain ${model}`,
    model.replace(/^DD/i, 'DD '),
  ])),
  ...['2000', '2500', '8000', '8500'].map((model) => dellStorageModel('Dell EMC', 'PowerMax', model, [
    `Dell PowerMax ${model}`,
    `EMC PowerMax ${model}`,
  ])),
  ...['250F', '450F', '850F', '950F'].map((model) => dellStorageModel('Dell EMC', 'VMAX', model, [
    `EMC VMAX ${model}`,
    `Dell VMAX ${model}`,
  ])),
  ...['X1', 'X2-S', 'X2-R'].map((model) => dellStorageModel('Dell EMC', 'XtremIO', model, [
    `EMC XtremIO ${model}`,
    `Dell XtremIO ${model}`,
    model.replace('-', ' '),
  ])),
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

const HPE_STORAGE_FIXTURE_DATA = [
  ...['1040', '1050', '1060', '2042', '2052', '2062'].map((model) => storageModel('HPE', `HPE MSA ${model}`, `MSA ${model}`, [
    `HPE Modular Smart Array ${model}`,
    `HP MSA ${model}`,
    `MSA${model}`,
  ])),
  ...['7200', '7400', '7440', '7450'].map((model) => storageModel('HPE', `HPE 3PAR StoreServ ${model}`, model, [
    `HP 3PAR ${model}`,
    `HPE 3PAR ${model}`,
    `StoreServ ${model}`,
    `3PAR ${model}`,
  ])),
  ...['CS300', 'CS500', 'CS700', 'AF20Q', 'AF60', 'AF80', 'HF20C', 'HF40C', 'HF60', 'HF60C'].map((model) => storageModel('HPE', `HPE Nimble ${model}`, model, [
    `Nimble ${model}`,
    `HPE Nimble Storage ${model}`,
  ])),
  ...['A630', 'A650', 'C630', 'C650'].map((model) => storageModel('HPE', `HPE Primera ${model}`, model, [
    `Primera ${model}`,
    `HPE Primera Storage ${model}`,
  ])),
  ...['5010', '5030', '5050', '5070', '6010', '6030', '6050', '6070', '9060', '9080'].map((model) => storageModel('HPE', `HPE Alletra ${model}`, model, [
    `Alletra ${model}`,
    `HPE Alletra Storage ${model}`,
  ])),
  ...['3620', '3640', '5200', '5250', '5650'].map((model) => storageModel('HPE', `HPE StoreOnce ${model}`, model, [
    `StoreOnce ${model}`,
    `HP StoreOnce ${model}`,
  ])),
]

const HUAWEI_STORAGE_FIXTURE_DATA = [
  ...[
    '2200 V3',
    '2600 V3',
    '2600F V3',
    '2600 V5',
    '2800 V3',
    '2800 V5',
    '5300 V3',
    '5500 V3',
    '5500F V3',
    '5600 V3',
    '5600F V3',
    '5600 V5',
    '5800 V3',
    '5800F V3',
    '5800 V5',
    '6800 V3',
    '6800F V3',
    '6900 V3',
    '18500 V3',
    '18500 V5',
    '18800 V3',
    '18800 V5',
  ].map((model) => storageModel('Huawei', `Huawei OceanStor ${model}`, model, [
    `OceanStor ${model}`,
    `Huawei ${model}`,
    `华为 OceanStor ${model}`,
    `华为 ${model}`,
    `华为存储 ${model}`,
    `华为存储${model}`,
  ])),
  ...['5110F', '5210', '5310F', '5510', '5510F', '5610', '6810', '6810F'].map((model) => storageModel(
    'Huawei',
    `Huawei OceanStor ${model}`,
    model,
    [`OceanStor ${model}`, `华为 OceanStor ${model}`],
  )),
  ...['3000 V6', '5000 V6', '6000 V6', '8000 V6', '18000 V6'].map((model) => storageModel('Huawei', `Huawei OceanStor Dorado ${model}`, model, [
    `OceanStor Dorado ${model}`,
    `Dorado ${model}`,
    `华为 Dorado ${model}`,
  ])),
]

const IBM_FLASHSYSTEM_FIXTURE_DATA = [
  ...['5010', '5030', '5100', '5200', '5300', '7200', '7300', '9100', '9200', '9500'].map((model) => storageModel(
    'IBM',
    `IBM FlashSystem ${model}`,
    model,
    [`FlashSystem ${model}`, `IBM ${model}`, `${model} 存储`],
  )),
  ...['DS3512', 'DS3524', 'DS5020', 'DS8000', 'DS8870', 'DS8880', 'DS8900F'].map((model) => storageModel('IBM', `IBM ${model}`, model, [
    `IBM System Storage ${model}`,
    `${model} 存储`,
  ])),
  storageModel('IBM', 'IBM SAN Volume Controller', 'SVC', ['IBM SVC', 'SAN Volume Controller', 'SVC 存储虚拟化']),
]

const NETAPP_ADDITIONAL_STORAGE_FIXTURE_DATA = [
  ...['A700s', 'C30', 'C60', 'C80'].map((model) => netAppAffModel(model, [`AFF ${model} All Flash`])),
  ...['2240', '2520', '8020', '8040', '8060', '8080'].map(netAppFasModel),
  ...['A150', 'A250', 'A400', 'A700', 'A800'].map((model) => storageModel('NetApp', `NetApp ASA ${model}`, `ASA ${model}`, [
    `NetApp ${model} ASA`,
    `ASA ${model}`,
  ])),
  ...['2812', '4012', '4060'].map(netAppEModel),
]

const LENOVO_ADDITIONAL_STORAGE_FIXTURE_DATA = [
  ...[
    'DM3000H',
    'DM5000H',
    'DM5000F',
    'DM7000H',
    'DM7000F',
    'DM7100H',
    'DM7100F',
    'DE2000H',
    'DE4000F',
    'DE6000F',
    'DE6400H',
    'DE6400F',
    'DE6600H',
    'DE6600F',
  ].map((model) => storageModel('Lenovo', `Lenovo ThinkSystem ${model}`, model, [
    `Lenovo ${model}`,
    `ThinkSystem ${model}`,
  ])),
]

const QNAP_STORAGE_FIXTURE_DATA = [
  ...[
    'TS-453D',
    'TS-464',
    'TS-873A',
    'TVS-h874',
    'TS-h973AX',
    'TS-h1277XU-RP',
    'TS-h1283XU-RP',
    'TS-h1683XU-RP',
    'TS-h3087XU-RP',
  ].map((model) => storageModel('QNAP', `QNAP ${model}`, model, [
    model.replace(/-/g, ' '),
    `${model} NAS`,
  ])),
]

const SYNOLOGY_STORAGE_FIXTURE_DATA = [
  ...[
    'DS923+',
    'DS1522+',
    'DS1821+',
    'DS1823xs+',
    'RS1221+',
    'RS3621xs+',
    'RS4021xs+',
    'SA3400',
    'SA3600',
    'SA6400',
    'FS2500',
    'FS3600',
    'FS6400',
    'UC3200',
  ].map((model) => storageModel('Synology', `Synology ${model}`, model, [
    model.replace('+', ' Plus'),
    `${model} NAS`,
  ])),
]

const PURE_STORAGE_FIXTURE_DATA = [
  ...['X10', 'X20', 'X50', 'X70', 'X90'].map((model) => storageModel('Pure Storage', `Pure Storage FlashArray//${model}`, `FlashArray//${model}`, [
    `FlashArray ${model}`,
    `Pure ${model}`,
    `Pure Storage ${model}`,
  ])),
  ...['C40', 'C60', 'C70', 'C90'].map((model) => storageModel('Pure Storage', `Pure Storage FlashArray//${model}`, `FlashArray//${model}`, [
    `FlashArray ${model}`,
    `Pure ${model}`,
    `Pure Storage ${model}`,
  ])),
  ...['S200', 'S500'].map((model) => storageModel('Pure Storage', `Pure Storage FlashBlade//${model}`, `FlashBlade//${model}`, [
    `FlashBlade ${model}`,
    `Pure FlashBlade ${model}`,
  ])),
  storageModel('Pure Storage', 'Pure Storage FlashArray//E', 'FlashArray//E', ['FlashArray E', 'Pure FlashArray E']),
]

const INSPUR_STORAGE_FIXTURE_DATA = [
  ...['AS2200G2', 'AS2600G2', 'AS5300G5', 'AS5500G5', 'AS5600G2', 'AS6800G2'].map((model) => storageModel('Inspur', `Inspur ${model}`, model, [
    `浪潮 ${model}`,
    `浪潮存储 ${model}`,
  ])),
  storageModel('Inspur', 'Inspur AS13000G5', 'AS13000G5', ['浪潮 AS13000G5', '浪潮分布式存储 AS13000G5']),
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

const HUAWEI_LEGACY_NETWORK_FIXTURE_DATA = [
  huaweiSwitchModel('CE5880-48T4S-EI', [
    'CloudEngine 5880',
    'Huawei CloudEngine 5880',
    'CloudEngine CE5880-48T4S-EI',
    'Huawei CloudEngine CE5880-48T4S-EI',
    'CE5880',
  ]),
  huaweiSwitchModel('CE6881-48S6CQ', [
    'CloudEngine 6881',
    'Huawei CloudEngine 6881',
    'CloudEngine CE6881-48S6CQ',
    'Huawei CloudEngine CE6881-48S6CQ',
    'CE6881',
  ]),
  huaweiSwitchModel('S5731-H48P4XC', ['Huawei CloudEngine S5731-H48P4XC']),
  huaweiSwitchModel('S5735S-L48P4X-A', ['Huawei CloudEngine S5735S-L48P4X-A']),
]

const HPE_NETWORK_FIXTURE_DATA = [
  hpeFlexFabricSwitchModel('5940 4-slot Switch', '5940 4-slot Switch', [
    'HPE FlexFabric 5940',
    'HP FlexFabric 5940',
    'FlexFabric 5940',
    'HPE 5940',
    'HP 5940',
    'HPE 5940 4-slot',
    'HP 5940 4-slot',
    '5940 4-slot',
    '5940 4-slot Switch',
    '5940 Switch',
    'HPE FlexFabric 5940 4-slot',
    'HP FlexFabric 5940 4-slot',
    'HPE FlexFabric 5940 4-slot Switch',
    'HP FlexFabric 5940 4-slot Switch',
    'FlexFabric 5940 4-slot',
    'FlexFabric 5940 4-slot Switch',
    '5940 交换机',
    'HPE 5940 交换机',
    'HP 5940 交换机',
  ]),
]

const PALO_ALTO_NETWORKS_FIXTURE_DATA = [
  ...[
    'PA-220',
    'PA-410',
    'PA-415',
    'PA-440',
    'PA-450',
    'PA-460',
    'PA-820',
    'PA-850',
    'PA-1410',
    'PA-1420',
    'PA-3220',
    'PA-3250',
    'PA-3260',
    'PA-3410',
    'PA-3420',
    'PA-3430',
    'PA-3440',
    'PA-5220',
    'PA-5250',
    'PA-5260',
    'PA-5410',
    'PA-5420',
    'PA-5430',
    'PA-5440',
    'PA-7050',
    'PA-7080',
  ].map(paloAltoFirewallModel),
  networkModel('Palo Alto Networks', 'Palo Alto Networks VM-Series', 'VM-Series', [
    'Palo Alto VM-Series',
    'PaloAlto VM-Series',
    'PA VM-Series',
    'VM Series',
    'Palo Alto 虚拟防火墙',
    'Palo Alto VM 防火墙',
  ]),
]

const FORTINET_ADC_FIXTURE_DATA = [
  ...[
    '60F',
    '100F',
    '200F',
    '300F',
    '400F',
    '1000F',
    '2000F',
    '3000F',
  ].map(fortinetAdcModel),
  networkModel('Fortinet', 'Fortinet FortiADC VM', 'FortiADC-VM', [
    'FortiADC VM',
    'Fortinet FortiADC-VM',
    'FAD-VM',
    'FortiADC 虚拟负载均衡',
  ]),
]

const CISCO_NEXUS_FIXTURE_DATA = [
  ciscoNexusModel('5010', 'N5K-C5010P-BF', ['N5K-C5010P', 'Nexus 5000 5010', 'Cisco Nexus 5000 5010']),
  ciscoNexusModel('5020', 'N5K-C5020P-BF', ['N5K-C5020P', 'Nexus 5000 5020', 'Cisco Nexus 5000 5020']),
  ciscoNexusModel('5548P', 'N5K-C5548P', ['Nexus 5548 P', 'Cisco Nexus 5548 P', '5548P']),
  ciscoNexusModel('5548UP', 'N5K-C5548UP', ['Nexus 5548 UP', 'Cisco Nexus 5548 UP', '5548UP']),
  ciscoNexusModel('5596T', 'N5K-C5596T', ['Nexus 5596 T', 'Cisco Nexus 5596 T', '5596T']),
  ciscoNexusModel('5596UP', 'N5K-C5596UP', ['Nexus 5596 UP', 'Cisco Nexus 5596 UP', '5596UP']),
  ciscoNexusModel('56128P', 'N5K-C56128P', ['Nexus 56128 P', 'Cisco Nexus 56128 P', '56128P']),
  ciscoNexusModel('5672UP', 'N5K-C5672UP', ['Nexus 5672 UP', 'Cisco Nexus 5672 UP', '5672UP']),
  ciscoNexusModel('5672UP-16G', 'N5K-C5672UP-16G', ['Nexus 5672 UP 16G', 'Cisco Nexus 5672UP 16G', '5672UP-16G']),
  ciscoNexusModel('5696Q', 'N5K-C5696Q', ['Nexus 5696 Q', 'Cisco Nexus 5696 Q', '5696Q']),
]

const HPE_ADDITIONAL_SERVER_FIXTURE_DATA = [
  ...[
    'DL20 Gen10',
    'DL20 Gen11',
    'DL160 Gen10',
    'DL180 Gen10',
    'DL325 Gen10',
    'DL325 Gen11',
    'DL345 Gen10',
    'DL345 Gen11',
    'DL360 Gen9',
    'DL360 Gen10',
    'DL360 Gen10 Plus',
    'DL360 Gen11',
    'DL365 Gen10 Plus',
    'DL365 Gen11',
    'DL380 Gen9',
    'DL380 Gen10',
    'DL380 Gen10 Plus',
    'DL380 Gen11',
    'DL385 Gen10',
    'DL385 Gen10 Plus',
    'DL385 Gen11',
    'DL560 Gen10',
    'DL580 Gen10',
    'ML30 Gen10',
    'ML30 Gen11',
    'ML350 Gen10',
    'MicroServer Gen10 Plus',
  ].map(hpeProLiantModel),
  ...['480 Gen10', '480 Gen11', '660 Gen10'].map((model) => serverModel('HPE', `HPE Synergy ${model}`, `Synergy ${model}`, [
    `Synergy ${model}`,
    `HPE Synergy ${model}`,
  ])),
  serverModel('HPE', 'HPE BladeSystem c7000 Enclosure', 'c7000', [
    'HP BladeSystem c7000 Enclosure',
    'HPE BladeSystem c7000',
    'HP BladeSystem c7000',
    'BladeSystem c7000',
    'BladeSystem c7000 Enclosure',
    'HPE c7000',
    'HP c7000',
    'BL c7000',
    'BL-c7000',
    'BLc7000',
    'c7000 Enclosure',
    'c7000 刀箱',
    'c7000 刀片机箱',
    'c7000 刀片服务器',
    'HPE c7000 刀箱',
    'HP c7000 刀箱',
  ]),
]

const DELL_ADDITIONAL_SERVER_FIXTURE_DATA = [
  ...[
    'R230',
    'R240',
    'R250',
    'R330',
    'R340',
    'R350',
    'R430',
    'R440',
    'R450',
    'R530',
    'R540',
    'R550',
    'R630',
    'R640',
    'R650',
    'R650xs',
    'R660',
    'R730',
    'R730xd',
    'R740',
    'R740xd',
    'R750',
    'R750xs',
    'R760',
    'R760xs',
    'R7625',
    'R840',
    'R940',
    'R940xa',
    'T340',
    'T440',
    'T550',
    'T640',
    'M640',
    'MX740c',
    'MX750c',
    'XR11',
    'XR12',
  ].map(dellPowerEdgeModel),
]

const LENOVO_ADDITIONAL_SERVER_FIXTURE_DATA = [
  ...[
    'SR250',
    'SR530',
    'SR550',
    'SR570',
    'SR590',
    'SR630',
    'SR630 V2',
    'SR630 V3',
    'SR635',
    'SR645',
    'SR650',
    'SR650 V2',
    'SR650 V3',
    'SR655',
    'SR665',
    'SR670 V2',
    'SR850',
    'SR850 V2',
    'SR860',
    'SR860 V2',
    'ST250',
    'ST550',
  ].map(lenovoThinkSystemServerModel),
]

const IBM_ADDITIONAL_SERVER_FIXTURE_DATA = [
  ...['S814', 'S822', 'S824', 'S914', 'S922', 'S924', 'S1022', 'S1024', 'E950', 'E980', 'E1050', 'E1080'].map(ibmPowerServerModel),
]

const CISCO_UCS_ADDITIONAL_SERVER_FIXTURE_DATA = [
  ...[
    'C220 M5',
    'C220 M6',
    'C220 M7',
    'C240 M5',
    'C240 M6',
    'C240 M7',
    'C480 M5',
    'B200 M5',
    'B200 M6',
    'X210c M6',
    'X210c M7',
    'X410c M7',
  ].map((model) => serverModel('Cisco', `Cisco UCS ${model}`, `UCS ${model}`, [
    `Cisco ${model}`,
    model,
  ])),
]

const VMWARE_ADDITIONAL_SERVER_FIXTURE_DATA = [
  serverModel('VMware', 'VMware vSphere 7 Enterprise Plus', 'VS7-EPL', [
    'vSphere 7 Enterprise Plus',
    'VMware vSphere 7',
    'vSphere 7',
    'ESXi 7 Enterprise Plus',
  ]),
  serverModel('VMware', 'VMware vSphere 8 Standard', 'VS8-STD', [
    'vSphere 8 Standard',
    'VMware vSphere 8',
    'vSphere 8',
    'ESXi 8 Standard',
  ]),
]

const NCLOUD_ADDITIONAL_SERVER_FIXTURE_DATA = [
  serverModel('N-cloud', 'N-cloud', 'N-cloud', [
    'NCloud',
    'N Cloud',
    'N-Cloud',
    'n-cloud',
    'ncloud',
    'n cloud',
    'N-cloud 产品',
    'N-cloud 设备',
    'NCloud 产品',
    'NCloud 设备',
    'N Cloud 产品',
    'N Cloud 设备',
  ]),
]

const CISCO_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    'Catalyst 1000-24T',
    'Catalyst 1000-48T',
    'Catalyst 2960X-24TS',
    'Catalyst 2960X-48TS',
    'Catalyst 3650-24TS',
    'Catalyst 3650-48TS',
    'Catalyst 3850-24T',
    'Catalyst 3850-48T',
    'Catalyst 9200-24T',
    'Catalyst 9200-48T',
    'Catalyst 9300-24T',
    'Catalyst 9300-48T',
    'Catalyst 9400',
    'Catalyst 9500-24Y4C',
    'Catalyst 9500-40X',
    'Catalyst 9600',
    'Catalyst 8200',
    'Catalyst 8300',
    'Catalyst 8500',
  ].map((model) => networkModel('Cisco', `Cisco ${model}`, model, [
    model.replace(/^Catalyst\s+/i, 'C'),
    `${model} 交换机`,
  ])),
  ...[
    'ISR 4321',
    'ISR 4331',
    'ISR 4351',
    'ISR 4431',
    'ISR 4451-X',
    'ASR 1001-X',
    'ASR 1002-X',
  ].map((model) => networkModel('Cisco', `Cisco ${model}`, model, [
    model.replace(/\s+/g, ''),
    `${model} 路由器`,
  ])),
  ...[
    'Firepower 1010',
    'Firepower 1120',
    'Firepower 1140',
    'Firepower 1150',
    'Firepower 2110',
    'Firepower 2120',
    'Firepower 2130',
    'Firepower 2140',
    'Firepower 4110',
    'Firepower 4120',
    'Firepower 4140',
  ].map((model) => networkModel('Cisco', `Cisco ${model}`, model, [
    model.replace(/\s+/g, ''),
    `${model} 防火墙`,
  ])),
  ...['ASA 5506-X', 'ASA 5516-X', 'ASA 5525-X', 'ASA 5545-X'].map((model) => networkModel('Cisco', `Cisco ${model}`, model, [
    model.replace(/\s+/g, ''),
    `${model} 防火墙`,
  ])),
  ...[
    'MX64',
    'MX67',
    'MX68',
    'MX75',
    'MX84',
    'MX85',
    'MX95',
    'MX105',
    'MX250',
    'MX450',
    'MS120-24',
    'MS225-48',
    'MS250-48',
    'MR36',
    'MR44',
    'MR46',
    'MR56',
  ].map((model) => networkModel('Cisco', `Cisco Meraki ${model}`, model, [
    `Meraki ${model}`,
  ])),
]

const HUAWEI_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    'S5731-S24T4X',
    'S5731-S48T4X',
    'S5732-H24S6Q',
    'S5732-H48S6Q',
    'S6730-H24X6C',
    'S6730-H48X6C',
    'S6730-S24X6Q',
    'S6730-S48X6Q',
    'S12700E-4',
    'S12700E-8',
    'S16700-4',
    'S16700-8',
  ].map(huaweiSwitchModel),
  ...['CE6857F', 'CE6865', 'CE6881E', 'CE6885', 'CE8851', 'CE9860'].map((model) => huaweiSwitchModel(model, [
    `Huawei CloudEngine ${model}`,
    `CloudEngine ${model}`,
  ])),
  ...['AR6120E', 'AR6280K', 'AR8140', 'AR8700'].map(huaweiRouterModel),
  ...['USG6615E', 'USG6625E', 'USG6635E', 'USG6655E', 'USG6716F', 'USG6720F'].map(huaweiFirewallModel),
]

function h3cSwitchModel(model, aliases = []) {
  const spacedModel = String(model || '').replace(/-/g, ' ')
  return networkModel('H3C', `H3C ${model}`, model, [
    spacedModel && spacedModel !== model ? spacedModel : '',
    `${model} 交换机`,
    `H3C ${model} 交换机`,
    ...(Array.isArray(aliases) ? aliases : []),
  ].filter(Boolean))
}

const H3C_SWITCH_EXTRA_ALIASES = {
  S3100V2: ['S3100 V2', 'H3C S3100 V2'],
}

const H3C_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    'S3100V2',
    'S3100V2-8TP-EI',
    'S3100V2-16TP-EI',
    'S3100V2-26TP-EI',
    'S3100V2-52TP-EI',
    'S5120-28P-SI',
    'S5120-52P-SI',
    'S5120-28P-EI',
    'S5120-52P-EI',
    'S5120V2-10P-LI',
    'S5120V2-28P',
    'S5120V2-28P-LI',
    'S5120V2-28P-PWR-LI',
    'S5120V2-52P',
    'S5120V2-52P-LI',
    'S5120V2-52P-PWR-LI',
    'S5130-28S-EI',
    'S5130-52S-EI',
    'S5130-28F-EI',
    'S5130-30C-HI',
    'S5130-54C-HI',
    'S5130S-10P-EI',
    'S5130S-28P',
    'S5130S-28P-EI',
    'S5130S-28P-LI',
    'S5130S-28P-PWR-EI',
    'S5130S-52P',
    'S5130S-52P-EI',
    'S5130S-52P-LI',
    'S5130S-52P-PWR-EI',
    'S5130S-28S',
    'S5130S-28S-EI',
    'S5130S-28S-HI',
    'S5130S-52S',
    'S5130S-52S-EI',
    'S5130S-52S-HI',
    'S5150-24S-EI',
    'S5150-48S-EI',
    'S5500V2-28C-EI',
    'S5500V2-52C-EI',
    'S5560-30C-EI',
    'S5560-54C-EI',
    'S5560-30F-EI',
    'S5560-54F-EI',
    'S5560S-28P-EI',
    'S5560S-52P-EI',
    'S5560S-28S-EI',
    'S5560S-52S-EI',
    'S5560X-30C',
    'S5560X-30C-EI',
    'S5560X-30F-EI',
    'S5560X-54C',
    'S5560X-54C-EI',
    'S5560X-54F-EI',
    'S5570S-28P-EI',
    'S5570S-52P-EI',
    'S5570S-28S-EI',
    'S5570S-52S-EI',
    'S6520-30C-EI',
    'S6520-54C-EI',
    'S6520X-30QC',
    'S6520X-30QC-EI',
    'S6520X-54QC',
    'S6520X-54QC-EI',
    'S6520X-30HF',
    'S6520X-30HF-EI',
    'S6550X-30C-HI',
    'S6550X-54C-HI',
    'S6800-54QF',
    'S6820-56HF',
    'S6850-56HF',
    'S6880-54HF',
    'S9820-64H',
    'S9825-64CD',
    'S9850-32H',
    'S9850-4C',
    'S7506E',
    'S7506E-V',
    'S7510E-V',
    'S10506',
    'S10510',
    'S12504X-AF',
    'S12508X-AF',
    'S12516X-AF',
  ].map((model) => h3cSwitchModel(model, H3C_SWITCH_EXTRA_ALIASES[model])),
  ...['MSR3610', 'MSR3620', 'MSR3640', 'MSR5660'].map((model) => networkModel('H3C', `H3C ${model}`, model, [
    `${model} 路由器`,
  ])),
  ...['F1000-AI-20', 'F1000-AI-30', 'F1000-AI-55', 'F5000-AI-15', 'F5000-AI-40'].map((model) => networkModel('H3C', `H3C SecPath ${model}`, model, [
    `H3C ${model}`,
    `SecPath ${model}`,
    `${model} 防火墙`,
  ])),
]

const DELL_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    'S3048',
    'S4048',
    'S4128F-ON',
    'S4128T-ON',
    'S4148F-ON',
    'S4148T-ON',
    'S4248FB-ON',
    'S5232F-ON',
    'S5248F-ON',
    'S5296F-ON',
    'Z9100-ON',
    'Z9264F-ON',
    'Z9332F-ON',
    'Z9432F-ON',
  ].map((model) => networkModel('Dell', `Dell PowerSwitch ${model}`, model, [
    `Dell Networking ${model}`,
    `PowerSwitch ${model}`,
    model.replace('-ON', ''),
  ])),
]

const LENOVO_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...['NE1032', 'NE1072', 'NE2572', 'NE2580', 'NE10032', 'G8272', 'G8296', 'G8332', 'G8052'].map((model) => networkModel('Lenovo', `Lenovo ThinkSystem ${model}`, model, [
    `Lenovo ${model}`,
    `ThinkSystem ${model}`,
    `RackSwitch ${model}`,
  ])),
]

const ARUBA_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    '2530',
    '2540',
    '2930F',
    '2930M',
    '3810M',
    '5400R',
  ].map(arubaSwitchModel),
  ...[
    '4100i',
    '6000',
    '6100',
    '6200F',
    '6200M',
    '6300F',
    '6300M',
    '6400',
    '8320',
    '8325',
    '8360',
    '8400',
  ].map(arubaCxSwitchModel),
  ...[
    'Instant On 1430',
    'Instant On 1830',
    'Instant On 1930',
    'Instant On 1960',
  ].map(arubaSwitchModel),
  ...[
    'AP-203R',
    'AP-205',
    'AP-207',
    'AP-215',
    'AP-225',
    'AP-303',
    'AP-305',
    'AP-315',
    'AP-325',
    'AP-335',
    'AP-345',
    'AP-365',
    'AP-367',
    'AP-374',
    'AP-375',
    'AP-377',
    'AP-387',
    'AP-503',
    'AP-505',
    'AP-505H',
    'AP-515',
    'AP-518',
    'AP-535',
    'AP-555',
    'AP-565',
    'AP-567',
    'AP-575',
    'AP-577',
    'AP-584',
    'AP-585',
    'AP-587',
    'AP-615',
    'AP-635',
    'AP-655',
    'AP-675',
  ].map(arubaApModel),
  ...[
    'AP11',
    'AP12',
    'AP15',
    'AP17',
    'AP22',
    'AP25',
    'AP32',
  ].map(arubaInstantOnApModel),
  ...[
    '7005',
    '7010',
    '7024',
    '7030',
    '7205',
    '7210',
    '7220',
    '7240XM',
  ].map(arubaControllerModel),
  ...[
    '9004',
    '9012',
    '9240',
    '9240XM',
  ].map(arubaGatewayModel),
]

const PALO_ALTO_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...['PA-5450', 'PA-5455', 'PA-7500'].map(paloAltoFirewallModel),
  ...['PA-3410', 'PA-3420', 'PA-3430', 'PA-3440'].map(paloAltoFirewallModel),
]

const FORTINET_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    '30E',
    '30F',
    '40F',
    '41F',
    '40G',
    '41G',
    '50E',
    '50G',
    '51E',
    '51G',
    '60E',
    '60F',
    '60G',
    '61E',
    '61F',
    '61G',
    '70F',
    '70G',
    '71F',
    '71G',
    '80E',
    '80F',
    '81E',
    '81F',
    '90E',
    '90G',
    '91E',
    '91G',
    '100E',
    '100F',
    '100G',
    '101E',
    '101F',
    '101G',
    '120G',
    '121G',
    '200E',
    '200F',
    '200G',
    '201E',
    '201F',
    '201G',
    '300E',
    '301E',
    '400E',
    '400F',
    '401E',
    '401F',
    '600E',
    '600F',
    '601E',
    '601F',
    '900G',
    '901G',
    '1000F',
    '1001F',
    '1100E',
    '1101E',
    '1800F',
    '1801F',
    '2200E',
    '2201E',
    '2500E',
    '2501E',
    '2600F',
    '2601F',
    '3000D',
    '3000F',
    '3001F',
    '3200D',
    '3300E',
    '3301E',
    '3400E',
    '3401E',
    '3500F',
    '3501F',
    '3600E',
    '3601E',
    '3700D',
    '3700F',
    '3701F',
    '3800D',
    '3960E',
    '3980E',
    '4200F',
    '4201F',
    '4400F',
    '4401F',
    '4800F',
    '4801F',
    '5001E',
    '6000F',
    '6001F',
    '6500F',
    '6501F',
    '7000E',
    '7000F',
  ].map(fortinetFortiGateModel),
  networkModel('Fortinet', 'Fortinet FortiGate VM', 'FortiGate-VM', [
    'FortiGate VM',
    'FortiGate-VM',
    'FG-VM',
    'FGT-VM',
    'FortiGate Virtual Machine',
    'FortiGate 虚拟防火墙',
    'Fortinet 虚拟防火墙',
  ]),
  ...['124F', '248E', '248F', '424E', '424F', '448E', '448F'].map((model) => networkModel('Fortinet', `Fortinet FortiSwitch ${model}`, `FortiSwitch-${model}`, [
    `FortiSwitch ${model}`,
    `FS-${model}`,
  ])),
]

const SANGFOR_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...[
    '1000',
    '1200',
    '1500',
    '1800',
    '2000',
    '2200',
    '2500',
    '3000',
    '5000',
    '6000',
    '8000',
  ].map(sangforAfModel),
  ...[
    '1000',
    '1200',
    '1500',
    '1800',
    '2000',
    '2200',
    '2500',
    '3000',
    '5000',
  ].map(sangforAcModel),
  ...[
    '1000',
    '1200',
    '1600',
    '2000',
    '2500',
    '3000',
    '4000',
    '5000',
    '6000',
  ].map(sangforAdModel),
  ...[
    '1000',
    '1500',
    '2000',
    '3000',
    '5000',
  ].map(sangforVpnModel),
  networkModel('Sangfor', 'Sangfor aCloud HCI', 'aCloud HCI', [
    'Sangfor HCI',
    'SANGFOR HCI',
    'Sangfor aCloud',
    '深信服 aCloud',
    '深信服 HCI',
    '深信服超融合',
    '深信服云计算',
    'aCloud',
    'HCI',
  ]),
]

const BROCADE_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...['6505', '6510', '6520', '7840', 'G620', 'G630', 'G720', 'X6-4', 'X6-8', 'X7-4', 'X7-8'].map((model) => networkModel('Brocade', `Brocade ${model}`, model, [
    `Brocade Switch ${model}`,
    `Brocade Gen 6 ${model}`,
    `Brocade Gen 7 ${model}`,
    `${model} SAN 交换机`,
  ])),
]

const F5_ADDITIONAL_NETWORK_FIXTURE_DATA = [
  ...['i2600', 'i2800', 'i4600', 'i4800', 'i5600', 'i5800', 'i7600', 'i7800', 'i10600', 'i10800'].map((model) => networkModel('F5', `F5 BIG-IP ${model}`, model, [
    `BIG-IP ${model}`,
    `BIG IP ${model}`,
    `${model} 负载均衡`,
  ])),
  ...['r2600', 'r2800', 'r4600', 'r4800', 'r5600', 'r5800', 'r10600', 'r10800'].map((model) => networkModel('F5', `F5 BIG-IP ${model}`, model, [
    `BIG-IP ${model}`,
    `F5 rSeries ${model}`,
    `${model} 负载均衡`,
  ])),
  networkModel('F5', 'F5 BIG-IP VE', 'BIG-IP VE', ['F5 VE', 'BIG-IP Virtual Edition', 'F5 虚拟负载均衡']),
]

function mergeFixtureData(fixtures) {
  const merged = new Map()
  for (const fixture of fixtures) {
    const key = [
      String(fixture.brand || '').toLowerCase(),
      String(fixture.category || '').toLowerCase(),
      String(fixture.canonicalModel || '').toLowerCase(),
    ].join('|')
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...fixture, aliases: [...(fixture.aliases || [])] })
      continue
    }
    existing.partNumber = existing.partNumber || fixture.partNumber
    existing.aliases = [...(existing.aliases || []), ...(fixture.aliases || [])]
  }
  return [...merged.values()]
}

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

module.exports = mergeFixtureData([
  ...BASE_FIXTURE_DATA,
  ...HPE_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...DELL_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...LENOVO_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...IBM_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...CISCO_UCS_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...VMWARE_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...NCLOUD_ADDITIONAL_SERVER_FIXTURE_DATA,
  ...DELL_EMC_VNX_FIXTURE_DATA,
  ...DELL_STORAGE_FIXTURE_DATA,
  ...DELL_EMC_STORAGE_FIXTURE_DATA,
  ...IBM_STORAGE_V_SERIES_FIXTURE_DATA,
  ...IBM_FLASHSYSTEM_FIXTURE_DATA,
  ...HDS_STORAGE_FIXTURE_DATA,
  ...LENOVO_NETAPP_STORAGE_FIXTURE_DATA,
  ...LENOVO_STORAGE_FIXTURE_DATA,
  ...LENOVO_ADDITIONAL_STORAGE_FIXTURE_DATA,
  ...NETAPP_STORAGE_FIXTURE_DATA,
  ...NETAPP_ADDITIONAL_STORAGE_FIXTURE_DATA,
  ...HPE_STORAGE_FIXTURE_DATA,
  ...HUAWEI_STORAGE_FIXTURE_DATA,
  ...QNAP_STORAGE_FIXTURE_DATA,
  ...SYNOLOGY_STORAGE_FIXTURE_DATA,
  ...PURE_STORAGE_FIXTURE_DATA,
  ...INSPUR_STORAGE_FIXTURE_DATA,
  ...HUAWEI_NETWORK_SECURITY_FIXTURE_DATA,
  ...HUAWEI_SWITCH_FIXTURE_DATA,
  ...HUAWEI_ROUTER_FIXTURE_DATA,
  ...HUAWEI_LEGACY_NETWORK_FIXTURE_DATA,
  ...HUAWEI_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...HPE_NETWORK_FIXTURE_DATA,
  ...PALO_ALTO_NETWORKS_FIXTURE_DATA,
  ...PALO_ALTO_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...FORTINET_ADC_FIXTURE_DATA,
  ...FORTINET_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...SANGFOR_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...CISCO_NEXUS_FIXTURE_DATA,
  ...CISCO_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...H3C_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...DELL_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...LENOVO_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...ARUBA_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...BROCADE_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...F5_ADDITIONAL_NETWORK_FIXTURE_DATA,
  ...IMPORTED_FIXTURE_DATA,
])
