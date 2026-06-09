const bcrypt = require('bcrypt')
const { pool } = require('../src/config/db')

const demoPassword = process.env.SEED_DEMO_PASSWORD

if (!demoPassword) {
  throw new Error('SEED_DEMO_PASSWORD must be set before seeding demo users')
}

// ─── Users ──────────────────────────────────────────────────────────────────
const users = [
  ['admin', demoPassword, '系统管理员', 'admin', null],
  ['assistant', demoPassword, '助理小周', 'assistant', '13800001001'],
  ['engineering_supervisor', demoPassword, '工程主管王工', 'engineering_supervisor', '13800001002'],
  ['sales_supervisor', demoPassword, '业务主管李经理', 'sales_supervisor', '13800001007'],
  ['sales_jack', demoPassword, 'Jack', 'sales', '13800001003'],
  ['sales_annie', demoPassword, 'Annie', 'sales', '13800001004'],
  ['engineer', demoPassword, '张工', 'engineer', null],
  ['engineer_zhou', demoPassword, '周工', 'engineer', '13800001005'],
  ['engineer_chen', demoPassword, '陈工', 'engineer', '13800001006'],
]

// ─── Customers (with geo coordinates for map display) ───────────────────────
const customers = [
  {
    code: 'DEMO-ACME',
    name: '演示客户 A — 苏州工业园区',
    address: '江苏省苏州市苏州工业园区星湖街 328 号创意产业园',
    contactName: '演示联系人 A',
    contactPhone: '10000000001',
    salesperson: 'Demo Sales A',
    level: 'key',
    latitude: 31.3245198,
    longitude: 120.7241641,
    map_poi_name: '苏州创意产业园',
    map_address: '江苏省苏州市苏州工业园区星湖街 328 号',
  },
  {
    code: 'DEMO-BETA',
    name: '演示客户 B — 上海张江',
    address: '上海市浦东新区张江高科技园区祖冲之路 1500 号',
    contactName: '演示联系人 B',
    contactPhone: '10000000002',
    salesperson: 'Demo Sales B',
    level: 'vip',
    latitude: 31.2063596,
    longitude: 121.6001994,
    map_poi_name: '张江高科技园区',
    map_address: '上海市浦东新区祖冲之路 1500 号',
  },
  {
    code: 'DEMO-GAMMA',
    name: '演示客户 C — 无锡新区',
    address: '江苏省无锡市新吴区太湖国际科技园菱湖大道 200 号',
    contactName: '演示联系人 C',
    contactPhone: '10000000003',
    salesperson: 'Demo Sales C',
    level: 'normal',
    latitude: 31.4873499,
    longitude: 120.3588663,
    map_poi_name: '无锡太湖国际科技园',
    map_address: '江苏省无锡市新吴区菱湖大道 200 号',
  },
  {
    code: 'DEMO-DELTA',
    name: '演示客户 D — 昆山花桥',
    address: '江苏省苏州市昆山市花桥镇绿地大道 168 号',
    contactName: '演示联系人 D',
    contactPhone: '10000000004',
    salesperson: 'Demo Sales B',
    level: 'potential',
    latitude: 31.2871429,
    longitude: 121.1261826,
    map_poi_name: '昆山花桥国际商务城',
    map_address: '江苏省苏州市昆山市花桥镇绿地大道 168 号',
  },
  {
    code: 'DEMO-EPSILON',
    name: '演示客户 E — 苏州吴中',
    address: '江苏省苏州市吴中区太湖东路 288 号',
    contactName: '演示联系人 E',
    contactPhone: '10000000005',
    salesperson: 'Demo Sales A',
    level: 'normal',
    latitude: 31.2698275,
    longitude: 120.6322254,
    map_poi_name: '苏州吴中太湖东路',
    map_address: '江苏省苏州市吴中区太湖东路 288 号',
  },
]

// ─── Customer Additional Contacts ────────────────────────────────────────────
const customerExtraContacts = {
  'DEMO-ACME': [
    ['IT 主管张经理', '13800001010'],
    ['网络负责人李工', '13800001011'],
  ],
  'DEMO-BETA': [
    ['数据中心负责人陈经理', '13800001012'],
    ['采购部王经理', '13800001013'],
  ],
  'DEMO-GAMMA': [
    ['安全负责人赵工', '13800001014'],
    ['IT 经理孙经理', '13800001015'],
  ],
  'DEMO-DELTA': [
    ['IT 主管周经理', '13800001016'],
  ],
  'DEMO-EPSILON': [
    ['信息中心吴主任', '13800001017'],
    ['系统管理员郑工', '13800001018'],
  ],
}

// ─── Maintenance Parties (维保厂商) ──────────────────────────────────────────
const maintenanceParties = [
  ['original_manufacturer', 'Dell 技术支持中心', '400-886-6585'],
  ['original_manufacturer', 'Huawei 企业服务热线', '400-822-9999'],
  ['original_manufacturer', 'Fortinet 技术支持', '400-600-5255'],
  ['original_manufacturer', 'VMware 技术支持', '400-816-0688'],
  ['our_maintenance', 'OMs 自维保团队（上海）', '021-88888888'],
  ['our_maintenance', 'OMs 自维保团队（苏州）', '0512-88888888'],
]

// ─── Devices (expanded per customer with warranty / maintenance info) ───────
const devices = [
  // --- DEMO-ACME: virtualization + server + switch + firewall ---
  { customerCode: 'DEMO-ACME', name: 'VMware vSphere 虚拟化集群', model: 'VMware vSphere 7 Enterprise Plus', pn: 'VS7-EPL-A', serialNo: 'DEMO-ACME-VMW', location: 'A栋 3F 机房', warrantyUntil: null, maintenanceType: 'our_maintenance', maintenancePartyName: 'OMs 自维保团队（上海）', maintenanceStart: '2025-01-01', maintenanceEnd: '2026-12-31', remark: '6 台 ESXi 主机集群' },
  { customerCode: 'DEMO-ACME', name: '核心交换机 A', model: 'Huawei CloudEngine 6881', pn: 'CE6881-48S6CQ', serialNo: 'DEMO-ACME-CE6881-A', location: 'A栋 3F 机房 机柜A01', warrantyUntil: '2026-08-15', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Huawei 企业服务热线', maintenanceStart: '2024-08-15', maintenanceEnd: '2026-08-14', remark: null },
  { customerCode: 'DEMO-ACME', name: '核心交换机 B', model: 'Huawei CloudEngine 6881', pn: 'CE6881-48S6CQ', serialNo: 'DEMO-ACME-CE6881-B', location: 'A栋 3F 机房 机柜A02', warrantyUntil: '2026-08-15', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Huawei 企业服务热线', maintenanceStart: '2024-08-15', maintenanceEnd: '2026-08-14', remark: '堆叠备机' },
  { customerCode: 'DEMO-ACME', name: 'Dell PowerEdge R750 服务器', model: 'PowerEdge R750', pn: 'R750-3Y-SUPPORT', serialNo: 'DEMO-ACME-R750-01', location: 'A栋 3F 机房 机柜B03', warrantyUntil: '2026-03-20', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Dell 技术支持中心', maintenanceStart: '2024-03-20', maintenanceEnd: '2026-03-19', remark: 'vCenter 管理节点' },

  // --- DEMO-BETA: storage + server + switch ---
  { customerCode: 'DEMO-BETA', name: 'Dell ME5024 存储阵列', model: 'PowerVault ME5024', pn: 'ME5024-5Y-SUPPORT', serialNo: 'DEMO-BETA-STG', location: 'B1 机房 机柜C01', warrantyUntil: '2027-11-30', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Dell 技术支持中心', maintenanceStart: '2024-12-01', maintenanceEnd: '2027-11-30', remark: '双控制器，24×2.4TB SAS' },
  { customerCode: 'DEMO-BETA', name: 'Dell PowerEdge R650 服务器', model: 'PowerEdge R650', pn: 'R650-3Y-SUPPORT', serialNo: 'DEMO-BETA-R650-01', location: 'B1 机房 机柜C02', warrantyUntil: '2026-06-30', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Dell 技术支持中心', maintenanceStart: '2024-07-01', maintenanceEnd: '2026-06-30', remark: '数据库服务器' },
  { customerCode: 'DEMO-BETA', name: 'Dell PowerEdge R650 服务器', model: 'PowerEdge R650', pn: 'R650-3Y-SUPPORT', serialNo: 'DEMO-BETA-R650-02', location: 'B1 机房 机柜C02', warrantyUntil: '2026-06-30', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Dell 技术支持中心', maintenanceStart: '2024-07-01', maintenanceEnd: '2026-06-30', remark: '应用服务器' },
  { customerCode: 'DEMO-BETA', name: '接入交换机', model: 'Huawei S5735S-L48P4X-A', pn: 'S5735S-L48P4X-A', serialNo: 'DEMO-BETA-S5735-01', location: 'B1 机房 机柜C03', warrantyUntil: '2024-05-10', maintenanceType: 'none', maintenancePartyName: null, maintenanceStart: null, maintenanceEnd: null, remark: '已过保' },

  // --- DEMO-GAMMA: firewalls + switch ---
  { customerCode: 'DEMO-GAMMA', name: 'FortiGate 100F 防火墙 A', model: 'FortiGate 100F', pn: 'FG-100F-SLA', serialNo: 'DEMO-GAMMA-FW', location: 'C栋 2F 机房 机柜D01', warrantyUntil: '2026-10-01', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Fortinet 技术支持', maintenanceStart: '2025-10-01', maintenanceEnd: '2026-09-30', remark: '主防火墙，含 AV/IPS/Web Filter 订阅' },
  { customerCode: 'DEMO-GAMMA', name: 'FortiGate 60F 防火墙 B', model: 'FortiGate 60F', pn: 'FG-60F-SLA', serialNo: 'DEMO-GAMMA-FW60', location: 'C栋 2F 机房 机柜D01', warrantyUntil: '2025-10-01', maintenanceType: 'our_maintenance', maintenancePartyName: 'OMs 自维保团队（苏州）', maintenanceStart: '2025-01-01', maintenanceEnd: '2026-06-30', remark: '备机 / 测试防火墙' },
  { customerCode: 'DEMO-GAMMA', name: '核心交换机', model: 'Huawei CloudEngine 5880', pn: 'CE5880-48T4S-EI', serialNo: 'DEMO-GAMMA-CE5880', location: 'C栋 2F 机房 机柜D02', warrantyUntil: '2025-08-20', maintenanceType: 'none', maintenancePartyName: null, maintenanceStart: null, maintenanceEnd: null, remark: null },

  // --- DEMO-DELTA: firewall + server ---
  { customerCode: 'DEMO-DELTA', name: 'FortiGate 80E 防火墙', model: 'FortiGate 80E', pn: 'FG-80E-SLA', serialNo: 'DEMO-DELTA-FW', location: 'D栋 1F 机房 机柜E01', warrantyUntil: '2024-12-31', maintenanceType: 'our_maintenance', maintenancePartyName: 'OMs 自维保团队（上海）', maintenanceStart: '2025-01-01', maintenanceEnd: '2026-12-31', remark: '原厂保已过期，转自维保' },
  { customerCode: 'DEMO-DELTA', name: 'Dell PowerEdge R740 服务器', model: 'PowerEdge R740', pn: 'R740-3Y-SUPPORT', serialNo: 'DEMO-DELTA-R740-01', location: 'D栋 1F 机房 机柜E02', warrantyUntil: '2026-01-15', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Dell 技术支持中心', maintenanceStart: '2024-01-15', maintenanceEnd: '2026-01-14', remark: 'ERP 系统服务器' },
  { customerCode: 'DEMO-DELTA', name: 'Dell PowerEdge R740 服务器', model: 'PowerEdge R740', pn: 'R740-3Y-SUPPORT', serialNo: 'DEMO-DELTA-R740-02', location: 'D栋 1F 机房 机柜E02', warrantyUntil: '2026-01-15', maintenanceType: 'original_manufacturer', maintenancePartyName: 'Dell 技术支持中心', maintenanceStart: '2024-01-15', maintenanceEnd: '2026-01-14', remark: '备份服务器' },

  // --- DEMO-EPSILON: hypervisor + switch ---
  { customerCode: 'DEMO-EPSILON', name: 'VMware vSphere 虚拟化集群', model: 'VMware vSphere 8 Standard', pn: 'VS8-STD-A', serialNo: 'DEMO-EPSILON-VMW', location: 'E栋 3F 机房 机柜F01', warrantyUntil: null, maintenanceType: 'our_maintenance', maintenancePartyName: 'OMs 自维保团队（苏州）', maintenanceStart: '2025-06-01', maintenanceEnd: '2026-12-31', remark: '3 台 ESXi 主机，vSAN 存储' },
  { customerCode: 'DEMO-EPSILON', name: '接入交换机', model: 'Huawei S5731-H48P4XC', pn: 'S5731-H48P4XC', serialNo: 'DEMO-EPSILON-S5731', location: 'E栋 3F 机房 机柜F02', warrantyUntil: '2025-03-10', maintenanceType: 'none', maintenancePartyName: null, maintenanceStart: null, maintenanceEnd: null, remark: '已过保，运行稳定' },
]

// ─── Service Orders (expanded, varied statuses) ─────────────────────────────
const orders = [
  // Existing 6 orders, preserved with minor updates
  {
    orderNo: 'DEMO202605001',
    customerCode: 'DEMO-ACME',
    deviceSerial: 'DEMO-ACME-VMW',
    mode: 'onsite',
    type: 'inspect',
    priority: 'normal',
    status: 'submitted',
    engineer: 'engineer',
    date: '2026-05-06 09:30:00',
    end: '2026-05-06 12:00:00',
    issue: '虚拟化平台例行巡检，检查主机、存储、备份任务状态。',
    work: '完成 ESXi 主机健康检查、数据存储容量检查、HA 状态检查，并整理巡检结果。',
    result: 'resolved',
    parts: null,
  },
  {
    orderNo: 'DEMO202605002',
    customerCode: 'DEMO-BETA',
    deviceSerial: 'DEMO-BETA-STG',
    mode: 'onsite',
    type: 'install',
    priority: 'high',
    status: 'submitted',
    engineer: 'engineer_zhou',
    date: '2026-05-08 10:00:00',
    end: '2026-05-08 17:30:00',
    issue: 'Dell ME5024 存储上架、初始化和主机连线。',
    work: '完成设备上架、管理地址配置、存储池创建、主机端链路验证和标签整理。',
    result: 'resolved',
    parts: null,
  },
  {
    orderNo: 'DEMO202605003',
    customerCode: 'DEMO-GAMMA',
    deviceSerial: 'DEMO-GAMMA-FW',
    mode: 'remote',
    type: 'repair',
    priority: 'urgent',
    status: 'submitted',
    category: 'Remote Support',
    engineer: 'engineer_chen',
    date: '2026-05-09 14:00:00',
    end: '2026-05-09 15:10:00',
    issue: 'SSL VPN 用户无法连接。',
    work: '远程检查 FortiGate SSL VPN 策略、用户组和证书状态，调整认证配置后恢复连接。',
    result: 'resolved',
    parts: null,
  },
  {
    orderNo: 'DEMO202605004',
    customerCode: 'DEMO-DELTA',
    deviceSerial: 'DEMO-DELTA-FW',
    mode: 'remote',
    type: 'maintain',
    priority: 'normal',
    status: 'submitted',
    category: 'Documentation',
    engineer: 'engineer_chen',
    date: '2026-05-12 16:00:00',
    end: '2026-05-12 18:00:00',
    issue: '防火墙变更前资料整理。',
    work: '整理现有策略、对象和 license 到期信息，输出给客户确认。',
    result: 'resolved',
    parts: null,
  },
  {
    orderNo: 'DEMO202605005',
    customerCode: 'DEMO-EPSILON',
    deviceSerial: null,
    mode: 'remote',
    type: 'other',
    priority: 'normal',
    status: 'submitted',
    category: 'Meeting',
    engineer: 'engineer_zhou',
    date: '2026-05-15 13:30:00',
    end: '2026-05-15 15:00:00',
    issue: 'Veeam 备份方案需求讨论。',
    work: '与客户远程会议确认备份范围、保留周期和异地复制需求。',
    result: 'follow_up_required',
    resultDescription: '等待客户提供虚拟机清单。',
    parts: null,
  },
  {
    orderNo: 'DEMO202605006',
    customerCode: 'DEMO-ACME',
    deviceSerial: 'DEMO-ACME-CE6881-A',
    mode: 'onsite',
    type: 'repair',
    priority: 'high',
    status: 'submitted',
    engineer: 'engineer',
    extraEngineer: 'engineer_zhou',
    date: '2026-05-18 09:00:00',
    end: '2026-05-18 13:00:00',
    issue: '产线交换机端口间歇性丢包。',
    work: '现场检查光模块、端口错误包和链路日志，更换跳线并调整端口速率后观察正常。',
    result: 'resolved',
    parts: [
      { partName: 'SFP+ 万兆光模块', partNo: 'SFP-10G-SR', quantity: 2, unit: '个' },
      { partName: 'LC-LC 单模跳线 3m', partNo: 'LC-SM-3M', quantity: 4, unit: '根' },
    ],
  },
  // --- New orders ---
  {
    orderNo: 'DEMO202605007',
    customerCode: 'DEMO-ACME',
    deviceSerial: 'DEMO-ACME-R750-01',
    mode: 'onsite',
    type: 'repair',
    priority: 'urgent',
    status: 'in_progress',
    engineer: 'engineer',
    extraEngineer: 'engineer_chen',
    date: '2026-05-20 14:00:00',
    end: '2026-05-20 18:00:00',
    issue: 'Dell R750 服务器告警：内存 ECC 错误。',
    work: '检查 iDRAC 日志，定位故障 DIMM 槽位，申请备件更换。',
    result: 'unresolved',
    resultDescription: '已定位故障 DIMM，备件未到，明日继续。',
    parts: [
      { partName: 'DDR5 4800 32GB 内存条', partNo: 'DDR5-32GB-4800', quantity: 1, unit: '根' },
    ],
  },
  {
    orderNo: 'DEMO202606001',
    customerCode: 'DEMO-BETA',
    deviceSerial: 'DEMO-BETA-R650-01',
    mode: 'remote',
    type: 'maintain',
    priority: 'normal',
    status: 'assigned',
    engineer: 'engineer_zhou',
    date: '2026-06-02 10:00:00',
    end: '2026-06-02 12:00:00',
    issue: '数据库服务器系统补丁更新。',
    work: '远程安装 Oracle Linux 安全补丁，验证数据库服务正常。',
    result: null,
    resultDescription: null,
    parts: null,
  },
  {
    orderNo: 'DEMO202606002',
    customerCode: 'DEMO-GAMMA',
    deviceSerial: 'DEMO-GAMMA-FW',
    mode: 'remote',
    type: 'maintain',
    priority: 'normal',
    status: 'assigned',
    engineer: 'engineer_chen',
    date: '2026-06-03 09:00:00',
    end: '2026-06-03 11:00:00',
    issue: 'FortiGate 100F 固件升级。',
    work: '升级 FortiOS v7.4.5 → v7.4.6，验证策略和 VPN 正常。',
    result: null,
    resultDescription: null,
    parts: null,
  },
  {
    orderNo: 'DEMO202605008',
    customerCode: 'DEMO-DELTA',
    deviceSerial: 'DEMO-DELTA-R740-01',
    mode: 'onsite',
    type: 'repair',
    priority: 'high',
    status: 'draft',
    engineer: null,
    date: null,
    end: null,
    issue: 'ERP 服务器磁盘故障（RAID 5 降级）。',
    work: '更换故障硬盘，重建 RAID，验证数据完整性。',
    result: null,
    resultDescription: null,
    parts: [
      { partName: 'SAS 2.4TB 10K 硬盘', partNo: 'ST2400MM0129', quantity: 1, unit: '块' },
    ],
  },
  {
    orderNo: 'DEMO202606003',
    customerCode: 'DEMO-EPSILON',
    deviceSerial: 'DEMO-EPSILON-VMW',
    mode: 'onsite',
    type: 'inspect',
    priority: 'normal',
    status: 'pending_confirmation',
    engineer: 'engineer',
    date: '2026-06-08 09:00:00',
    end: '2026-06-08 12:00:00',
    issue: '虚拟化平台季度巡检。',
    work: '检查 vSAN 健康状态、主机固件版本、备份成功率。',
    result: null,
    resultDescription: null,
    parts: null,
  },
  {
    orderNo: 'DEMO202605009',
    customerCode: 'DEMO-ACME',
    deviceSerial: 'DEMO-ACME-VMW',
    mode: 'remote',
    type: 'maintain',
    priority: 'normal',
    status: 'cancelled',
    engineer: 'engineer',
    date: '2026-05-22 10:00:00',
    end: '2026-05-22 11:00:00',
    issue: 'vCenter 证书更新。',
    work: null,
    result: null,
    resultDescription: '客户临时取消，改为下月窗口。',
    parts: null,
  },
  {
    orderNo: 'DEMO202606004',
    customerCode: 'DEMO-BETA',
    deviceSerial: 'DEMO-BETA-R650-02',
    mode: 'onsite',
    type: 'install',
    priority: 'high',
    status: 'pending_confirmation',
    engineer: 'engineer_zhou',
    date: '2026-06-10 13:00:00',
    end: '2026-06-10 18:00:00',
    issue: '新增 PowerEdge R650 应用服务器上架配置。',
    work: '服务器上架、iDRAC 配置、ESXi 安装、网络配置、加入集群。',
    result: null,
    resultDescription: null,
    parts: [
      { partName: 'SFP+ 万兆光模块', partNo: 'SFP-10G-SR', quantity: 2, unit: '个' },
    ],
  },
  {
    orderNo: 'DEMO202606005',
    customerCode: 'DEMO-GAMMA',
    deviceSerial: 'DEMO-GAMMA-FW60',
    mode: 'onsite',
    type: 'repair',
    priority: 'low',
    status: 'draft',
    engineer: null,
    date: null,
    end: null,
    issue: '备机 FortiGate 60F 配置同步。',
    work: '将主防火墙配置备份并导入备机，验证 HA 切换。',
    result: null,
    resultDescription: null,
    parts: null,
  },
  {
    orderNo: 'DEMO202605010',
    customerCode: 'DEMO-EPSILON',
    deviceSerial: 'DEMO-EPSILON-S5731',
    mode: 'onsite',
    type: 'repair',
    priority: 'normal',
    status: 'submitted',
    engineer: 'engineer',
    date: '2026-05-25 09:00:00',
    end: '2026-05-25 11:30:00',
    issue: '接入交换机多个端口 Link Down。',
    work: '检查交换机日志、端口光功率，发现光模块老化，更换后恢复。',
    result: 'resolved',
    parts: [
      { partName: 'SFP 千兆光模块', partNo: 'SFP-GE-LX-SM', quantity: 3, unit: '个' },
    ],
  },
]

// ─── Inspection Schedules ────────────────────────────────────────────────────
const inspectionSchedules = [
  { customerCode: 'DEMO-ACME', deviceSerials: ['DEMO-ACME-VMW', 'DEMO-ACME-PAN'], engineerUsername: 'engineer', cadence: 'quarterly', nextRunAnchor: '2026-08-06' },
  { customerCode: 'DEMO-BETA', deviceSerials: ['DEMO-BETA-STG'], engineerUsername: 'engineer_zhou', cadence: 'monthly', nextRunAnchor: '2026-06-08' },
  { customerCode: 'DEMO-GAMMA', deviceSerials: ['DEMO-GAMMA-FW', 'DEMO-GAMMA-AP'], engineerUsername: 'engineer_chen', cadence: 'bi-monthly', nextRunAnchor: '2026-07-03' },
]

// ─── Timesheet Manual Entries ────────────────────────────────────────────────
const timesheetManualEntries = [
  { engineerUsername: 'engineer', entryDate: '2026-05-06', category: '巡检服务', customerProject: 'DEMO-ACME', workContent: '虚拟化平台季度巡检', progress: 'completed', remark: null },
  { engineerUsername: 'engineer_zhou', entryDate: '2026-05-08', category: '安装服务', customerProject: 'DEMO-BETA', workContent: 'Dell ME5024 存储上架安装', progress: 'completed', remark: null },
  { engineerUsername: 'engineer_chen', entryDate: '2026-05-09', category: '远程支持', customerProject: 'DEMO-GAMMA', workContent: 'SSL VPN 故障排除', progress: 'completed', remark: null },
  { engineerUsername: 'engineer', entryDate: '2026-05-18', category: '维修服务', customerProject: 'DEMO-ACME', workContent: '产线交换机端口丢包排查', progress: 'completed', remark: '更换光模块和跳线' },
  { engineerUsername: 'engineer_chen', entryDate: '2026-05-12', category: '文档整理', customerProject: 'DEMO-DELTA', workContent: '防火墙变更前资料整理' , progress: 'completed', remark: null },
  { engineerUsername: 'engineer_zhou', entryDate: '2026-05-15', category: '会议', customerProject: 'DEMO-EPSILON', workContent: 'Veeam 备份方案需求讨论', progress: 'completed', remark: null },
]

// ─── Device Model Catalog ────────────────────────────────────────────────────
const deviceModelCatalog = [
  { brand: 'Dell', category: 'server', canonicalModel: 'PowerEdge R750', partNumber: 'R750', priority: 10 },
  { brand: 'Dell', category: 'server', canonicalModel: 'PowerEdge R740', partNumber: 'R740', priority: 10 },
  { brand: 'Dell', category: 'server', canonicalModel: 'PowerEdge R650', partNumber: 'R650', priority: 10 },
  { brand: 'Dell', category: 'storage', canonicalModel: 'PowerVault ME5024', partNumber: 'ME5024', priority: 10 },
  { brand: 'Huawei', category: 'network', canonicalModel: 'CloudEngine 6881', partNumber: 'CE6881-48S6CQ', priority: 10 },
  { brand: 'Huawei', category: 'network', canonicalModel: 'CloudEngine 5880', partNumber: 'CE5880-48T4S-EI', priority: 10 },
  { brand: 'Huawei', category: 'network', canonicalModel: 'S5735S-L48P4X-A', partNumber: 'S5735S-L48P4X-A', priority: 10 },
  { brand: 'Huawei', category: 'network', canonicalModel: 'S5731-H48P4XC', partNumber: 'S5731-H48P4XC', priority: 10 },
  { brand: 'Fortinet', category: 'network', canonicalModel: 'FortiGate 100F', partNumber: 'FG-100F', priority: 10 },
  { brand: 'Fortinet', category: 'network', canonicalModel: 'FortiGate 80E', partNumber: 'FG-80E', priority: 10 },
  { brand: 'Fortinet', category: 'network', canonicalModel: 'FortiGate 60F', partNumber: 'FG-60F', priority: 10 },
  { brand: 'VMware', category: 'server', canonicalModel: 'vSphere 7 Enterprise Plus', partNumber: 'VS7-EPL', priority: 5 },
  { brand: 'VMware', category: 'server', canonicalModel: 'vSphere 8 Standard', partNumber: 'VS8-STD', priority: 5 },
]

// ─── Helper Functions ────────────────────────────────────────────────────────
async function upsertUser(connection, [username, password, realName, role, phone]) {
  const passwordHash = await bcrypt.hash(password, 10)
  await connection.execute(
    `INSERT INTO users (username, password_hash, real_name, phone, role, status)
     VALUES (:username, :passwordHash, :realName, :phone, :role, 'active')
     ON DUPLICATE KEY UPDATE real_name = VALUES(real_name), phone = VALUES(phone), role = VALUES(role), status = 'active'`,
    { username, passwordHash, realName, phone, role },
  )
}

async function idBy(connection, sql, params) {
  const [rows] = await connection.execute(sql, params)
  return rows[0]?.id
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // ── Users ──
    for (const user of users) {
      await upsertUser(connection, user)
    }

    // ── Maintenance Parties ──
    for (const [partyType, name, phone] of maintenanceParties) {
      await connection.execute(
        `INSERT INTO maintenance_parties (party_type, name, phone)
         VALUES (:partyType, :name, :phone)
         ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone)`,
        { partyType, name, phone },
      )
    }

    // ── Customers ──
    for (const c of customers) {
      await connection.execute(
        `INSERT INTO customers (code, name, address, contact_name, contact_phone, salesperson, level, latitude, longitude, map_poi_name, map_address)
         VALUES (:code, :name, :address, :contactName, :contactPhone, :salesperson, :level, :lat, :lng, :poiName, :mapAddress)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), address = VALUES(address), contact_name = VALUES(contact_name),
           contact_phone = VALUES(contact_phone), salesperson = VALUES(salesperson),
           level = VALUES(level), latitude = VALUES(latitude), longitude = VALUES(longitude)`,
        { code: c.code, name: c.name, address: c.address, contactName: c.contactName, contactPhone: c.contactPhone, salesperson: c.salesperson, level: c.level, lat: c.latitude, lng: c.longitude, poiName: c.map_poi_name, mapAddress: c.map_address },
      )

      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :code LIMIT 1', { code: c.code })

      // Primary contact
      await connection.execute(
        `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
         VALUES (:customerId, :contactName, :contactPhone, 5, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE use_count = GREATEST(use_count, 5), last_used_at = CURRENT_TIMESTAMP`,
        { customerId, contactName: c.contactName, contactPhone: c.contactPhone },
      )

      // Extra contacts
      const extraContacts = customerExtraContacts[c.code] || []
      for (const [name, phone] of extraContacts) {
        await connection.execute(
          `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
           VALUES (:customerId, :name, :phone, 1, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE use_count = GREATEST(use_count, 1), last_used_at = CURRENT_TIMESTAMP`,
          { customerId, name, phone },
        )
      }
    }

    // ── Devices ──
    for (const d of devices) {
      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :customerCode LIMIT 1', { customerCode: d.customerCode })
      let maintenancePartyId = null
      if (d.maintenancePartyName) {
        maintenancePartyId = await idBy(
          connection,
          'SELECT id FROM maintenance_parties WHERE name = :name LIMIT 1',
          { name: d.maintenancePartyName },
        )
      }
      const w = d.warrantyUntil ? `'${d.warrantyUntil}'` : 'NULL'
      await connection.execute(
        `INSERT INTO devices (customer_id, name, model, pn, serial_no, location, warranty_until, maintenance_type, maintenance_party_id, maintenance_start, maintenance_end, remark)
         VALUES (:customerId, :name, :model, :pn, :serialNo, :location, :warrantyUntil, :maintenanceType, :maintenancePartyId, :maintenanceStart, :maintenanceEnd, :remark)
         ON DUPLICATE KEY UPDATE
           customer_id = VALUES(customer_id), name = VALUES(name), model = VALUES(model),
           pn = VALUES(pn), location = VALUES(location), warranty_until = VALUES(warranty_until),
           maintenance_type = VALUES(maintenance_type), maintenance_party_id = VALUES(maintenance_party_id),
           maintenance_start = VALUES(maintenance_start), maintenance_end = VALUES(maintenance_end),
           remark = VALUES(remark)`,
        {
          customerId,
          name: d.name,
          model: d.model,
          pn: d.pn,
          serialNo: d.serialNo,
          location: d.location,
          warrantyUntil: d.warrantyUntil || null,
          maintenanceType: d.maintenanceType,
          maintenancePartyId,
          maintenanceStart: d.maintenanceStart || null,
          maintenanceEnd: d.maintenanceEnd || null,
          remark: d.remark || null,
        },
      )
    }

    // ── Device Model Catalog ──
    for (const cat of deviceModelCatalog) {
      await connection.execute(
        `INSERT INTO device_model_catalog (brand, category, canonical_model, part_number, priority)
         VALUES (:brand, :category, :model, :partNumber, :priority)
         ON DUPLICATE KEY UPDATE part_number = VALUES(part_number), priority = VALUES(priority)`,
        { brand: cat.brand, category: cat.category, model: cat.canonicalModel, partNumber: cat.partNumber, priority: cat.priority },
      )
    }

    // ── Service Orders ──
    const adminId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: 'admin' })
    for (const order of orders) {
      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :code LIMIT 1', { code: order.customerCode })
      const deviceId = order.deviceSerial
        ? await idBy(connection, 'SELECT id FROM devices WHERE serial_no = :serialNo LIMIT 1', { serialNo: order.deviceSerial })
        : null

      let engineerId = null
      if (order.engineer) {
        engineerId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: order.engineer })
      }

      // Determine status: for submitted orders we set submitted_at
      const isSubmitted = ['submitted', 'in_progress'].includes(order.status)

      // If engineer is assigned, status is 'assigned'; drafts have no engineer assigned
      let effectiveStatus = order.status
      if (order.status === 'draft') {
        effectiveStatus = 'draft'
      } else if (order.status === 'pending_confirmation' && order.engineer) {
        // pending_confirmation: engineer suggested but not confirmed
        effectiveStatus = 'pending_confirmation'
      } else if (order.status === 'assigned' && order.engineer) {
        effectiveStatus = 'assigned'
      }

      await connection.execute(
        `INSERT INTO service_orders (
           order_no, customer_id, device_id, service_mode, service_type, timesheet_category,
           priority, status, issue_description, assigned_engineer_id, planned_start_at,
           planned_end_at, created_by, submitted_at
         )
         VALUES (
           :orderNo, :customerId, :deviceId, :mode, :type, :category, :priority, :status,
           :issue, :engineerId, :date, :end, :adminId, :submittedAt
         )
         ON DUPLICATE KEY UPDATE
           customer_id = VALUES(customer_id), device_id = VALUES(device_id), service_mode = VALUES(service_mode),
           service_type = VALUES(service_type), timesheet_category = VALUES(timesheet_category),
           priority = VALUES(priority), issue_description = VALUES(issue_description),
           assigned_engineer_id = VALUES(assigned_engineer_id),
           planned_start_at = VALUES(planned_start_at), planned_end_at = VALUES(planned_end_at),
           status = VALUES(status), submitted_at = VALUES(submitted_at)`,
        {
          orderNo: order.orderNo,
          customerId,
          deviceId,
          mode: order.mode,
          type: order.type,
          category: order.category || null,
          priority: order.priority,
          status: effectiveStatus,
          issue: order.issue,
          engineerId,
          date: order.date || null,
          end: order.end || null,
          adminId,
          submittedAt: isSubmitted ? (order.end || order.date) : null,
        },
      )

      // Only create engineer association and report for orders with assigned engineers
      if (engineerId && order.status !== 'draft') {
        const orderId = await idBy(connection, 'SELECT id FROM service_orders WHERE order_no = :orderNo LIMIT 1', { orderNo: order.orderNo })
        await connection.execute(
          `INSERT INTO service_order_engineers (service_order_id, engineer_id, joined_by)
           VALUES (:orderId, :engineerId, :adminId)
           ON DUPLICATE KEY UPDATE joined_by = VALUES(joined_by)`,
          { orderId, engineerId, adminId },
        )

        if (order.extraEngineer) {
          const extraEngineerId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: order.extraEngineer })
          await connection.execute(
            `INSERT INTO service_order_engineers (service_order_id, engineer_id, joined_by)
             VALUES (:orderId, :extraEngineerId, :adminId)
             ON DUPLICATE KEY UPDATE joined_by = VALUES(joined_by)`,
            { orderId, extraEngineerId, adminId },
          )
        }

        // Only create service report for submitted/in_progress orders
        if (isSubmitted && order.date && order.end) {
          await connection.execute(
            `INSERT INTO service_reports (
               service_order_id, actual_start_at, actual_end_at, work_hours, fault_summary,
               work_content, result, result_description, customer_name
             )
             VALUES (
               :orderId, :date, :end, TIMESTAMPDIFF(MINUTE, :date, :end) / 60,
               :issue, :work, :result, :resultDescription, '客户确认'
             )
             ON DUPLICATE KEY UPDATE
               actual_start_at = VALUES(actual_start_at), actual_end_at = VALUES(actual_end_at),
               work_hours = VALUES(work_hours), fault_summary = VALUES(fault_summary),
               work_content = VALUES(work_content), result = VALUES(result),
               result_description = VALUES(result_description), customer_name = VALUES(customer_name)`,
            {
              orderId,
              date: order.date,
              end: order.end,
              issue: order.issue,
              work: order.work,
              result: order.result || null,
              resultDescription: order.resultDescription || null,
            },
          )
        }

        // ── Service Parts ──
        if (order.parts) {
          for (const part of order.parts) {
            await connection.execute(
              `INSERT INTO service_parts (service_order_id, part_name, part_no, quantity, unit)
               VALUES (:orderId, :partName, :partNo, :quantity, :unit)`,
              { orderId, partName: part.partName, partNo: part.partNo || null, quantity: part.quantity, unit: part.unit || null },
            )
          }
        }
      }
    }

    // ── Inspection Schedules ──
    for (const s of inspectionSchedules) {
      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :code LIMIT 1', { code: s.customerCode })
      const engineerId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: s.engineerUsername })
      if (customerId && engineerId) {
        const [result] = await connection.execute(
          `INSERT INTO inspection_schedules (customer_id, target_engineer_id, cadence, next_run_anchor, created_by)
           VALUES (:customerId, :engineerId, :cadence, :nextRun, :adminId)
           ON DUPLICATE KEY UPDATE next_run_anchor = VALUES(next_run_anchor)`,
          { customerId, engineerId, cadence: s.cadence, nextRun: s.nextRunAnchor, adminId },
        )
        const scheduleId = result.insertId || await (async () => {
          const [rows] = await connection.execute(
            `SELECT id FROM inspection_schedules WHERE customer_id = :customerId AND target_engineer_id = :engineerId AND cadence = :cadence LIMIT 1`,
            { customerId, engineerId, cadence: s.cadence },
          )
          return rows[0]?.id
        })()
        if (scheduleId && s.deviceSerials) {
          for (const serial of s.deviceSerials) {
            const deviceId = await idBy(connection, 'SELECT id FROM devices WHERE serial_no = :serialNo LIMIT 1', { serialNo: serial })
            if (deviceId) {
              await connection.execute(
                `INSERT IGNORE INTO inspection_schedule_devices (schedule_id, device_id) VALUES (:scheduleId, :deviceId)`,
                { scheduleId, deviceId },
              )
            }
          }
        }
      }
    }

    // ── Timesheet Manual Entries ──
    for (const t of timesheetManualEntries) {
      const engineerId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: t.engineerUsername })
      await connection.execute(
        `INSERT INTO timesheet_manual_entries (engineer_id, entry_date, category, customer_project, work_content, progress, remark, created_by)
         VALUES (:engineerId, :entryDate, :category, :customerProject, :workContent, :progress, :remark, :adminId)`,
        { engineerId, entryDate: t.entryDate, category: t.category, customerProject: t.customerProject, workContent: t.workContent, progress: t.progress, remark: t.remark, adminId },
      )
    }

    // ── Audit Log ──
    await connection.execute(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:adminId, 'demo', 0, 'seed_demo', JSON_OBJECT(
         'users', :userCount, 'customers', :customerCount,
         'devices', :deviceCount, 'orders', :orderCount,
         'parts', :partCount, 'maintenanceParties', :mpCount,
         'inspections', :inspCount, 'timesheets', :tsCount
       ))`,
      {
        adminId,
        userCount: users.length,
        customerCount: customers.length,
        deviceCount: devices.length,
        orderCount: orders.length,
        partCount: orders.reduce((sum, o) => sum + (o.parts ? o.parts.length : 0), 0),
        mpCount: maintenanceParties.length,
        inspCount: inspectionSchedules.length,
        tsCount: timesheetManualEntries.length,
      },
    )

    await connection.commit()

    const partCount = orders.reduce((sum, o) => sum + (o.parts ? o.parts.length : 0), 0)
    console.log(`
Seeded summary:
  Users                ${users.length}
  Maintenance Parties   ${maintenanceParties.length}
  Customers             ${customers.length}
  Customer Contacts     ${customers.length + Object.values(customerExtraContacts).flat().length}
  Devices               ${devices.length}
  Device Model Catalog  ${deviceModelCatalog.length}
  Service Orders        ${orders.length}  (statuses: ${[...new Set(orders.map(o => o.status))].join(', ')})
  Service Parts         ${partCount}
  Inspection Schedules  ${inspectionSchedules.length}
  Timesheet Entries     ${timesheetManualEntries.length}
`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
