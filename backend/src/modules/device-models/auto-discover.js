/**
 * 设备型号自动发现脚本
 *
 * 功能:
 *   每天运行一次，自动通过 LLM API 查询各品牌最新设备型号，
 *   与数据库现有型号对比后自动追加新型号。
 *
 * 用法:
 *   LLM_API_KEY=sk-xxx node backend/src/modules/device-models/auto-discover.js
 *
 * 环境变量:
 *   LLM_API_KEY  - LLM API 密钥（必填）
 *   LLM_BASE_URL - API 地址（默认 https://chybenzun.top/v1）
 *   LLM_MODEL    - 模型名（默认 gpt-4o-mini）
 *   DRY_RUN      - 设为 true 只打印不写入（默认 false）
 */

const { query } = require('../../config/db')

const LLM_API_KEY = process.env.LLM_API_KEY
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://chybenzun.top/v1').replace(/\/+$/, '')
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
const DRY_RUN = process.env.DRY_RUN === 'true'

if (!LLM_API_KEY) {
  console.error('请设置 LLM_API_KEY 环境变量')
  console.error('用法: LLM_API_KEY=sk-xxx node backend/src/modules/device-models/auto-discover.js')
  process.exit(1)
}

// 需要探测的品牌和分类
const QUERIES = [
  // === 服务器 ===
  { vendor: 'HPE', category: 'Server', prompt: '列出 HPE（Hewlett Packard Enterprise）当前在售的所有 ProLiant 系列服务器型号，包括 DL、ML、Synergy、BladeSystem 等产品线。只返回型号，每行一个，不要多余文字。' },
  { vendor: 'Dell', category: 'Server', prompt: '列出 Dell PowerEdge 当前在售的所有服务器型号，包括 R 系列、T 系列、M 系列、MX 系列等。只返回型号，每行一个。' },
  { vendor: 'Lenovo', category: 'Server', prompt: '列出 Lenovo ThinkSystem 当前在售的所有服务器型号，包括 SR 系列、ST 系列、SD 系列等。只返回型号，每行一个。' },
  { vendor: 'Cisco', category: 'Server', prompt: '列出 Cisco UCS 当前在售的所有服务器型号，包括 B 系列刀片、C 系列机架式等。只返回型号，每行一个。' },
  { vendor: 'Huawei', category: 'Server', prompt: '列出华为 FusionServer 和 TaiShan 当前在售的所有服务器型号。只返回型号，每行一个。' },
  { vendor: 'Inspur', category: 'Server', prompt: '列出浪潮 Inspur 当前在售的所有服务器型号，包括 NF 系列、i 系列等。只返回型号，每行一个。' },
  { vendor: 'Supermicro', category: 'Server', prompt: '列出 Supermicro 当前在售的主要服务器型号，包括 SuperServer、A+ Server 等。只返回型号，每行一个。' },

  // === 存储 ===
  { vendor: 'Dell', category: 'Storage', prompt: '列出 Dell 当前在售的所有存储型号，包括 PowerVault、PowerStore、Unity XT、SC Series 等。只返回型号，每行一个。' },
  { vendor: 'HPE', category: 'Storage', prompt: '列出 HPE 当前在售的所有存储型号，包括 3PAR StoreServ、Nimble、MSA、Primera、Alletra 等。只返回型号，每行一个。' },
  { vendor: 'NetApp', category: 'Storage', prompt: '列出 NetApp 当前在售的所有存储型号，包括 AFF A 系列、FAS 系列、E 系列等。只返回型号，每行一个。' },
  { vendor: 'Lenovo', category: 'Storage', prompt: '列出 Lenovo 当前在售的所有存储型号，包括 DM 系列、DE 系列、DS 系列等。只返回型号，每行一个。' },
  { vendor: 'Huawei', category: 'Storage', prompt: '列出华为 OceanStor 当前在售的所有存储型号。只返回型号，每行一个。' },
  { vendor: 'Inspur', category: 'Storage', prompt: '列出浪潮 Inspur 当前在售的所有存储型号，包括 AS 系列等。只返回型号，每行一个。' },

  // === 网络设备 ===
  { vendor: 'Cisco', category: 'Network', prompt: '列出 Cisco 当前在售的 Catalyst 和 Nexus 系列交换机的主要型号。只返回型号，每行一个。' },
  { vendor: 'Cisco', category: 'Network', prompt: '列出 Cisco MDS 系列光纤交换机当前在售的所有型号。只返回型号，每行一个。' },
  { vendor: 'Huawei', category: 'Network', prompt: '列出华为 CloudEngine 系列交换机当前在售的所有主要型号。只返回型号，每行一个。' },
  { vendor: 'H3C', category: 'Network', prompt: '列出 H3C 华三当前在售的所有交换机主要型号，包括 S 系列各子系列。只返回型号，每行一个。' },
  { vendor: 'Aruba', category: 'Network', prompt: '列出 Aruba（HPE）当前在售的交换机主要型号，包括 CX 系列、2930F/M、5400R 等。只返回型号，每行一个。' },
  { vendor: 'Ruijie', category: 'Network', prompt: '列出锐捷 Ruijie 当前在售的所有交换机主要型号。只返回型号，每行一个。' },
  { vendor: 'Juniper', category: 'Network', prompt: '列出 Juniper 当前在售的 EX 和 QFX 系列交换机主要型号。只返回型号，每行一个。' },
  { vendor: 'Brocade', category: 'Network', prompt: '列出 Broadcom/Brocade 当前在售的光纤交换机型号，包括 G 系列、X 系列 Director 等。只返回型号，每行一个。' },
  { vendor: 'Palo Alto', category: 'Network', prompt: '列出 Palo Alto Networks 当前在售的防火墙主要型号，包括 PA-400、PA-5000 系列等。只返回型号，每行一个。' },
  { vendor: 'Fortinet', category: 'Network', prompt: '列出 Fortinet FortiGate 当前在售的防火墙主要型号。只返回型号，每行一个。' },
]

// -------- LLM 调用 --------

async function callLLM(promptText) {
  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '你是一个专业的IT设备型号专家。请列出当前在售的型号，基于公开信息。只返回型号名称，每行一个，不要编号，不要多余文字。只列你确认存在的型号。' },
        { role: 'user', content: promptText },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// -------- 型号解析 --------

/**
 * 从 LLM 响应中提取型号名称列表
 * 支持多种格式：编号列表、纯列表、逗号分隔等
 */
function parseModels(text, vendor) {
  // 去掉常见的非型号行
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('以下是') && !l.startsWith('基于') && !l.startsWith('注意') && !l.startsWith('常见') && !l.startsWith('以上'))
    .filter(l => !l.match(/^(以下是|这里|基于|根据|注意|常见|以上|总结|目前|截至|我|抱歉|很抱歉)/))
    .map(l => l.replace(/^[\d]+[\.\)、\s]\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter(l => l.length > 2 && l.length < 200)

  return [...new Set(lines)]
}

/**
 * 将型号名称映射为标准化的 seed 条目格式
 */
function modelToEntry(vendor, category, modelName) {
  // 解析产品线
  let productLine = ''
  const lower = modelName.toLowerCase()

  // --- HPE ---
  if (vendor === 'HPE') {
    if (lower.includes('dl380')) productLine = 'ProLiant DL'
    else if (lower.includes('dl360')) productLine = 'ProLiant DL'
    else if (lower.includes('dl325')) productLine = 'ProLiant DL'
    else if (lower.includes('dl385')) productLine = 'ProLiant DL'
    else if (lower.includes('dl560')) productLine = 'ProLiant DL'
    else if (lower.includes('dl580')) productLine = 'ProLiant DL'
    else if (lower.includes('dl160')) productLine = 'ProLiant DL'
    else if (lower.includes('dl180')) productLine = 'ProLiant DL'
    else if (lower.includes('dl20')) productLine = 'ProLiant DL'
    else if (lower.includes('ml350')) productLine = 'ProLiant ML'
    else if (lower.includes('ml30')) productLine = 'ProLiant ML'
    else if (lower.includes('ml110')) productLine = 'ProLiant ML'
    else if (lower.includes('synergy')) productLine = 'Synergy'
    else if (lower.includes('bl460c')) productLine = 'BladeSystem'
    else if (lower.includes('bl465c')) productLine = 'BladeSystem'
    else if (lower.includes('3par') || lower.includes('storeserv')) productLine = '3PAR'
    else if (lower.includes('nimble')) productLine = 'Nimble'
    else if (lower.includes('msa')) productLine = 'MSA'
    else if (lower.includes('alletra')) productLine = 'Alletra'
    else if (lower.includes('primera')) productLine = 'Primera'
    else productLine = 'ProLiant DL' // fallback
  }

  // --- Dell ---
  else if (vendor === 'Dell') {
    if (category === 'Server') {
      if (lower.includes('r740') || lower.includes('r750') || lower.includes('r760') || lower.includes('r660') ||
          lower.includes('r250') || lower.includes('r350') || lower.includes('r450') || lower.includes('r650') ||
          lower.includes('r940') || lower.includes('r240') || lower.includes('r340') || lower.includes('r440') ||
          lower.includes('r540') || lower.includes('r640') || lower.includes('r7620')) {
        productLine = 'PowerEdge R'
        // Normalize the name to "Dell PowerEdge Rxxx"
      }
      else if (lower.includes('mx7000') || lower.includes('mx750c') || lower.includes('mx760c')) productLine = 'PowerEdge MX'
      else if (lower.includes('t340') || lower.includes('t440') || lower.includes('t550') || lower.includes('t560')) productLine = 'PowerEdge T'
      else if (lower.includes('m640') || lower.includes('m740')) productLine = 'PowerEdge M'
      else if (lower.includes('xr11') || lower.includes('xr12') || lower.includes('xr4510c')) productLine = 'PowerEdge XR'
      else productLine = 'PowerEdge R'
    }
    else if (category === 'Storage') {
      if (lower.includes('powervault') || lower.includes('me5')) productLine = 'PowerVault ME'
      else if (lower.includes('powerstore')) productLine = 'PowerStore'
      else if (lower.includes('unity')) productLine = 'Unity XT'
      else if (lower.includes('scv')) productLine = 'SC Series'
      else productLine = 'PowerVault'
    }
    else if (category === 'Network') {
      if (lower.includes('powerconnect') || lower.includes('s3048') || lower.includes('s4048') || lower.includes('s4148') || lower.includes('s5232')) productLine = 'PowerSwitch'
      else productLine = 'PowerSwitch'
    }
  }

  // --- Lenovo ---
  else if (vendor === 'Lenovo') {
    if (lower.startsWith('think') && (lower.includes('sr') || lower.includes('st'))) {
      if (lower.includes('sr')) productLine = 'ThinkSystem SR'
      else if (lower.includes('st')) productLine = 'ThinkSystem ST'
      if (lower.includes('dm') || lower.includes('de') || lower.includes('ds')) productLine = 'DM Series'
    }
    else if (lower.includes('dm') || lower.includes('de') || lower.includes('ds')) productLine = 'DM Series'
    else if (lower.includes('ne') || lower.includes('rack') || lower.includes('g7028') || lower.includes('g8052')) productLine = 'ThinkSystem NE'
    else productLine = 'ThinkSystem SR'
  }

  // --- Cisco ---
  else if (vendor === 'Cisco') {
    if (lower.includes('ucs')) {
      if (lower.includes('b200') || lower.includes('b420') || lower.includes('b480')) productLine = 'UCS B-Series'
      else if (lower.includes('c220') || lower.includes('c240') || lower.includes('c480') || lower.includes('c125')) productLine = 'UCS C-Series'
      else productLine = 'UCS C-Series'
    }
    else if (lower.includes('nexus')) {
      if (lower.includes('3000') || lower.includes('3132') || lower.includes('3172')) productLine = 'Nexus 3000'
      else if (lower.includes('3500') || lower.includes('3548')) productLine = 'Nexus 3500'
      else if (lower.includes('5600')) productLine = 'Nexus 5600'
      else if (lower.includes('7000') || lower.includes('7700')) productLine = 'Nexus 7000'
      else if (lower.includes('9000') || lower.includes('9300') || lower.includes('93180') || lower.includes('9336') || lower.includes('9396')) productLine = 'Nexus 9000'
      else productLine = 'Nexus 9000'
    }
    else if (lower.includes('mds')) productLine = 'MDS 9000'
    else if (lower.includes('catalyst') || lower.includes('2960') || lower.includes('3560') || lower.includes('3650') || lower.includes('3850') || lower.includes('9200') || lower.includes('9300') || lower.includes('9400') || lower.includes('9500') || lower.includes('9600')) {
      if (lower.includes('1000')) productLine = 'Catalyst 1000'
      else if (lower.includes('2960')) productLine = 'Catalyst 2960'
      else if (lower.includes('3560')) productLine = 'Catalyst 3560'
      else if (lower.includes('3650')) productLine = 'Catalyst 3650'
      else if (lower.includes('3850')) productLine = 'Catalyst 3850'
      else if (lower.includes('9200')) productLine = 'Catalyst 9200'
      else if (lower.includes('9300')) productLine = 'Catalyst 9300'
      else if (lower.includes('9400')) productLine = 'Catalyst 9400'
      else if (lower.includes('9500')) productLine = 'Catalyst 9500'
      else if (lower.includes('9600')) productLine = 'Catalyst 9600'
      else if (lower.includes('6800')) productLine = 'Catalyst 6800'
      else productLine = 'Catalyst'
    }
    else if (lower.includes('firepower') || lower.includes('ftd')) productLine = 'Firepower'
    else productLine = 'Catalyst'
  }

  // --- Huawei ---
  else if (vendor === 'Huawei') {
    if (lower.includes('fusion') || lower.includes('1288') || lower.includes('2288') || lower.includes('2488') || lower.includes('5288') || lower.includes('5885') || lower.includes('8100')) productLine = 'FusionServer'
    else if (lower.includes('taishan') || lower.includes('200')) productLine = 'TaiShan'
    else if (lower.includes('ocean')) productLine = 'OceanStor'
    else if (lower.includes('cloudengine') || lower.includes('ce')) {
      if (lower.includes('s5735') || lower.includes('s5720')) productLine = 'CloudEngine S'
      else if (lower.includes('s6720') || lower.includes('s6700')) productLine = 'CloudEngine S'
      else if (lower.includes('6800') || lower.includes('8800') || lower.includes('12800')) productLine = 'CloudEngine'
      else productLine = 'CloudEngine S'
    }
    else productLine = 'FusionServer'
  }

  // --- Inspur ---
  else if (vendor === 'Inspur') {
    if (lower.includes('nf51') || lower.includes('nf52') || lower.includes('nf53') || lower.includes('nf31') || lower.includes('nf21') || lower.includes('nf81') || lower.includes('nf84') || lower.includes('nf80') || lower.includes('nf50') || lower.includes('nf30') || lower.includes('nf20') || lower.includes('nf10')) {
      if (lower.includes('nf51') || lower.includes('nf52') || lower.includes('nf53')) productLine = 'NF5000'
      else if (lower.includes('nf80') || lower.includes('nf81') || lower.includes('nf84') || lower.includes('nf85')) productLine = 'NF8000'
      else if (lower.includes('nf31')) productLine = 'NF3000'
      else if (lower.includes('nf21')) productLine = 'NF2000'
      else productLine = 'NF5000'
    }
    else if (lower.includes('as') || lower.includes('sa')) productLine = 'AS Series'
    else if (lower.includes('i48') || lower.includes('i39')) productLine = 'i Series'
    else productLine = 'NF5000'
  }

  // --- Supermicro ---
  else if (vendor === 'Supermicro') {
    if (lower.includes('1029') || lower.includes('2029') || lower.includes('6029') || lower.includes('6019') || lower.includes('5039') || lower.includes('7039')) productLine = 'SuperServer'
    else if (lower.includes('1028') || lower.includes('2028')) productLine = 'SuperServer'
    else if (lower.includes('a+') || lower.includes('4124') || lower.includes('2124')) productLine = 'A+ Server'
    else if (lower.includes('as') || lower.includes('h12') || lower.includes('h11')) productLine = 'SuperServer'
    else productLine = 'SuperServer'
  }

  // --- Aruba ---
  else if (vendor === 'Aruba') {
    if (lower.includes('2930f') || lower.includes('2930m')) productLine = lower.includes('2930f') ? '2930F' : '2930M'
    else if (lower.includes('5400') || lower.includes('5412') || lower.includes('5406')) productLine = '5400R'
    else if (lower.includes('cx 6100') || lower.includes('6100')) productLine = 'CX 6100'
    else if (lower.includes('cx 6200') || lower.includes('6200')) productLine = 'CX 6200'
    else if (lower.includes('cx 6300') || lower.includes('6300')) productLine = 'CX 6300'
    else if (lower.includes('cx 6400') || lower.includes('6400')) productLine = 'CX 6400'
    else if (lower.includes('cx 8320') || lower.includes('cx 8325') || lower.includes('cx 8360')) productLine = 'CX 8300'
    else if (lower.includes('cx 9300') || lower.includes('10000')) productLine = 'CX 9300'
    else productLine = 'CX'
  }

  // --- Others ---
  else if (vendor === 'H3C') {
    if (lower.includes('s105') || lower.includes('s1050')) productLine = 'S10500'
    else if (lower.includes('s75')) productLine = 'S7500E'
    else if (lower.includes('s68') || lower.includes('s6900')) productLine = 'S6800'
    else if (lower.includes('s55') || lower.includes('s5560') || lower.includes('s5500')) productLine = 'S5500'
    else if (lower.includes('s50')) productLine = 'S5000'
    else productLine = 'S5000'
  }
  else if (vendor === 'Ruijie') {
    if (lower.includes('s29')) productLine = 'RG-S2900'
    else if (lower.includes('s53')) productLine = 'RG-S5300'
    else if (lower.includes('s57')) productLine = 'RG-S5700'
    else if (lower.includes('s62')) productLine = 'RG-S6200'
    else if (lower.includes('s78')) productLine = 'RG-S7800'
    else productLine = 'RG-S5000'
  }
  else if (vendor === 'NetApp') {
    if (lower.includes('aff') && (lower.includes('a') || lower.includes('c'))) productLine = 'AFF A-Series'
    else if (lower.includes('fas')) productLine = 'FAS Series'
    else if (lower.includes('e')) productLine = 'E-Series'
    else productLine = 'FAS Series'
  }
  else if (vendor === 'Brocade') {
    if (lower.includes('g6') || lower.includes('g610') || lower.includes('g620') || lower.includes('g630')) productLine = 'G6'
    else if (lower.includes('g7') || lower.includes('g710') || lower.includes('g720') || lower.includes('g730')) productLine = 'G7'
    else if (lower.includes('dcx') || lower.includes('8510')) productLine = 'DCX'
    else if (lower.includes('x6')) productLine = 'X6'
    else if (lower.includes('x7')) productLine = 'X7'
    else productLine = 'G6'
  }
  else if (vendor === 'Palo Alto') {
    if (lower.includes('pa-400') || lower.includes('pa-440') || lower.includes('pa-450') || lower.includes('pa-460')) productLine = 'PA-400 Series'
    else if (lower.includes('pa-500') || lower.includes('pa-5200') || lower.includes('pa-5250') || lower.includes('pa-5450')) productLine = 'PA-5000 Series'
    else if (lower.includes('pa-3200')) productLine = 'PA-3200 Series'
    else productLine = 'PA Series'
  }
  else if (vendor === 'Fortinet') {
    if (lower.includes('60f') || lower.includes('80f') || lower.includes('100f') || lower.includes('200f') || lower.includes('400f') || lower.includes('600f') || lower.includes('900') || lower.includes('1800') || lower.includes('3200') || lower.includes('4200')) {
      productLine = 'FortiGate'
    }
    else productLine = 'FortiGate'
  }
  else if (vendor === 'Juniper') {
    if (lower.includes('ex2300') || lower.includes('ex3400') || lower.includes('ex4300') || lower.includes('ex4400') || lower.includes('ex4600') || lower.includes('ex4650')) productLine = 'EX Series'
    else if (lower.includes('qfx') || lower.includes('qfx5110') || lower.includes('qfx5120') || lower.includes('qfx5200')) productLine = 'QFX Series'
    else if (lower.includes('srx')) productLine = 'SRX Series'
    else productLine = 'EX Series'
  }
  else if (vendor === 'QNAP') {
    productLine = 'TS Series'
  }
  else if (vendor === 'Synology') {
    if (lower.includes('ds')) productLine = 'DS Series'
    else if (lower.includes('rs')) productLine = 'RS Series'
    else productLine = 'DS Series'
  }
  else if (vendor === 'Ubiquiti') {
    if (lower.includes('unifi')) productLine = 'UniFi'
    else if (lower.includes('edge')) productLine = 'EdgeMax'
    else productLine = 'UniFi'
  }
  else if (vendor === 'TP-Link') {
    if (lower.includes('omada')) productLine = 'Omada'
    else productLine = 'JetStream'
  }

  // 生成关键词
  const kwParts = modelName.replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g, '').split(/[\s]+/)
  const significant = kwParts.filter(p => p.length >= 2 && !['the','and','for','with','series','switch','firewall','storage'].includes(p.toLowerCase()))
  const keywords = [...new Set(significant)].join(',')

  return {
    vendor,
    productLine,
    officialName: modelName,
    keywords,
    category,
  }
}

// -------- 主流程 --------

async function main() {
  // 获取数据库中已有的 officialName 集合
  const existing = await query('SELECT official_name FROM device_models')
  const existingSet = new Set(existing.map(r => r.official_name))

  console.log(`数据库现有 ${existingSet.size} 条设备型号`)
  if (DRY_RUN) console.log('🧪 DRY RUN 模式 - 不会写入数据库')

  let totalNew = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const q of QUERIES) {
    console.log(`\n--- ${q.vendor} / ${q.category} ---`)

    try {
      // 查询 LLM
      console.log(`  查询 LLM...`)
      const text = await callLLM(q.prompt)
      const rawModels = parseModels(text, q.vendor)
      console.log(`  LLM 返回 ${rawModels.length} 个型号`)

      // 尝试清理型号名（去掉品牌前缀重复的问题）
      const cleanModels = rawModels.map(m => {
        let name = m.trim()
        // 有些 LLM 返回 "Dell PowerEdge R740"，有些只返回 "PowerEdge R740"
        // 确保包含品牌名
        const vendorLower = q.vendor.toLowerCase()
        const nameLower = name.toLowerCase()
        if (!nameLower.includes(vendorLower) && !nameLower.includes(q.vendor)) {
          // 如果是 HPE，检查 "HPE" 前缀
          if (q.vendor === 'HPE' && !nameLower.includes('hpe')) {
            name = `HPE ${name}`
          } else {
            name = `${q.vendor} ${name}`
          }
        }
        // 对包含品牌名的做去重（如 "Dell Dell PowerEdge")
        const parts = name.split(' ')
        if (parts.length >= 3) {
          const vLower = q.vendor.toLowerCase()
          if (parts[0].toLowerCase() === vLower && parts[1].toLowerCase() === vLower) {
            name = parts.slice(1).join(' ')
          }
        }
        return name
      })

      // 去重
      const unique = [...new Set(cleanModels)]

      // 与数据库对比
      let newCount = 0
      let skipCount = 0

      for (const name of unique) {
        if (existingSet.has(name)) {
          skipCount++
          continue
        }

        const entry = modelToEntry(q.vendor, q.category, name)

        // 校验：officialName 不能太短，且要有意义
        if (entry.officialName.length < 5) {
          skipCount++
          continue
        }

        if (!DRY_RUN) {
          await query(
            'INSERT IGNORE INTO device_models (vendor, product_line, official_name, search_keywords, category) VALUES (:vendor, :productLine, :officialName, :keywords, :category)',
            { vendor: entry.vendor, productLine: entry.productLine, officialName: entry.officialName, keywords: entry.keywords, category: entry.category },
          )
          existingSet.add(entry.officialName)
        }

        console.log(`  ➕ 新增: ${entry.officialName}`)
        newCount++
      }

      if (newCount > 0) console.log(`  ✅ ${q.vendor}/${q.category}: 新增 ${newCount} 条，跳过 ${skipCount} 条（已有）`)
      else console.log(`  ➖ ${q.vendor}/${q.category}: 无新增，跳过 ${skipCount} 条`)

      totalNew += newCount
      totalSkipped += skipCount

      // LLM API 限流等待
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`  ❌ 错误: ${err.message}`)
      totalErrors++
    }
  }

  // 输出统计
  const final = await query('SELECT COUNT(*) as cnt FROM device_models')
  const inDB = final[0]?.cnt || 0

  console.log('\n========== 自动发现完成 ==========')
  console.log(`数据库总计: ${inDB} 条`)
  console.log(`本次新增: ${totalNew} 条`)
  console.log(`跳过(已有): ${totalSkipped} 条`)
  console.log(`错误: ${totalErrors} 次`)
  if (DRY_RUN) console.log('🧪 本次为 DRY RUN，未写入任何数据')

  process.exit(0)
}

main().catch(e => {
  console.error('脚本异常:', e)
  process.exit(1)
})
