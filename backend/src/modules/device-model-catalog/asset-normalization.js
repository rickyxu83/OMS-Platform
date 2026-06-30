const { query } = require('../../config/db')
const env = require('../../config/env')
const { effectiveSettings } = require('../settings/controller')
const { badRequest } = require('../../utils/http-error')
const { ensureDeviceModelCatalogTable, ensureDeviceModelAliasesTable } = require('./schema')
const { normalizeAlias, deduplicateAliases } = require('./normalize')

const catalogCategories = new Set(['server', 'storage', 'network'])
const defaultLookupTimeoutMs = 2500
const defaultAiLookupTimeoutMs = 12000
const defaultAiLookupConfidence = 0.78

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ') || null
}

function compactAlias(value) {
  return normalizeAlias(value).replace(/\s+/g, '')
}

function titleCaseKnownWords(value) {
  return String(value || '')
    .replace(/\bpoweredge\b/gi, 'PowerEdge')
    .replace(/\bproliant\b/gi, 'ProLiant')
    .replace(/\bthinksystem\b/gi, 'ThinkSystem')
    .replace(/\bpowervault\b/gi, 'PowerVault')
    .replace(/\bpowerstore\b/gi, 'PowerStore')
    .replace(/\boceanstor\b/gi, 'OceanStor')
    .replace(/\bcatalyst\b/gi, 'Catalyst')
    .replace(/\bnexus\b/gi, 'Nexus')
    .replace(/\bgen\s*(\d+)/gi, 'Gen$1')
    .replace(/\bg\s*(\d+)/gi, 'Gen$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function normalizeBingUrl(value) {
  const href = decodeHtml(value)
  if (!href) return ''
  try {
    const url = new URL(href, 'https://www.bing.com')
    const encodedTarget = url.searchParams.get('u')
    if (encodedTarget) {
      const normalized = encodedTarget.replace(/^a1/i, '').replace(/-/g, '+').replace(/_/g, '/')
      try {
        const decoded = Buffer.from(normalized, 'base64').toString('utf8')
        if (/^https?:\/\//i.test(decoded)) return decoded
      } catch {}
    }
    return url.toString()
  } catch {
    return href
  }
}

function extractSearchResults(html) {
  const results = []
  const itemPattern = /<li[^>]+class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
  let match
  while ((match = itemPattern.exec(html)) && results.length < 8) {
    const itemHtml = match[1]
    const anchor = itemHtml.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i)
    if (!anchor) continue
    const snippet = itemHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    results.push({
      title: stripHtml(anchor[2]),
      url: normalizeBingUrl(anchor[1]),
      snippet: snippet ? stripHtml(snippet[1]) : '',
    })
  }

  return results.filter((result) => result.title || result.snippet)
}

async function fetchSearchEvidence(inputModel) {
  if (process.env.DEVICE_MODEL_ONLINE_LOOKUP_DISABLED === '1' || process.env.DEVICE_MODEL_SYNC_DISABLE_NETWORK === '1') {
    return { searched: false, disabled: true, results: [] }
  }
  if (typeof fetch !== 'function') {
    return { searched: false, disabled: true, results: [] }
  }

  const timeoutMs = Math.max(500, Number(process.env.DEVICE_MODEL_ONLINE_LOOKUP_TIMEOUT_MS || defaultLookupTimeoutMs))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const searchQuery = `"${inputModel}" device model server storage network`
  const url = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}&setmkt=en-US&setlang=en-US&cc=US`

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'OMSDeviceModelNormalizer/1.0',
      },
    })
    if (!response.ok) {
      return { searched: true, error: `HTTP ${response.status}`, results: [] }
    }
    const html = await response.text()
    return {
      searched: true,
      results: extractSearchResults(html),
    }
  } catch (error) {
    return { searched: true, error: error.message || 'lookup failed', results: [] }
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeModelToken(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase()
}

function inferBrandCategory(text) {
  const lower = String(text || '').toLowerCase()

  if (/\b(hpe|hewlett packard enterprise|proliant|synergy)\b/.test(lower)) {
    return { brand: 'HPE', category: 'server' }
  }
  if (/\b(poweredge|idrac)\b/.test(lower) || /\bdell\b/.test(lower) && /\b(server|r\d{3}|t\d{3}|c\d{3})\b/.test(lower)) {
    return { brand: 'Dell', category: 'server' }
  }
  if (/\b(dell emc|emc|powerstore|powervault|unity|vnx|vnxe)\b/.test(lower)) {
    return { brand: 'Dell EMC', category: 'storage' }
  }
  if (/\b(thinksystem|lenovo)\b/.test(lower)) {
    return { brand: 'Lenovo', category: /\b(de|dm|storage)\b/.test(lower) ? 'storage' : 'server' }
  }
  if (/\b(netapp|aff|fas)\b/.test(lower)) {
    return { brand: 'NetApp', category: 'storage' }
  }
  if (/\b(hitachi vantara|hds|v\s*sp)\b/.test(lower)) {
    return { brand: 'HDS', category: 'storage' }
  }
  if (/\b(qnap|synology)\b/.test(lower)) {
    return { brand: /\bqnap\b/.test(lower) ? 'QNAP' : 'Synology', category: 'storage' }
  }
  if (/\b(cisco|catalyst|nexus|ucs)\b/.test(lower)) {
    return { brand: 'Cisco', category: /\bucs\b/.test(lower) ? 'server' : 'network' }
  }
  if (/\b(h3c|aruba|brocade|broadcom|f5|big-ip)\b/.test(lower)) {
    if (/\bf5|big-ip\b/.test(lower)) return { brand: 'F5', category: 'network' }
    if (/\bbrocade|broadcom\b/.test(lower)) return { brand: 'Brocade', category: 'network' }
    if (/\baruba\b/.test(lower)) return { brand: 'HPE', category: 'network' }
    return { brand: 'H3C', category: 'network' }
  }
  if (/\b(huawei|oceanstor|cloudengine|s\d{4,5})\b/.test(lower)) {
    return { brand: 'Huawei', category: /\boceanstor\b/.test(lower) ? 'storage' : 'network' }
  }

  return { brand: '', category: '' }
}

function extracted(brand, category, canonicalModel, partNumber = '') {
  const model = normalizeText(canonicalModel)
  if (!model || !catalogCategories.has(category)) return null
  return {
    brand,
    category,
    canonicalModel: titleCaseKnownWords(model),
    partNumber: normalizeText(partNumber) || '',
  }
}

function extractKnownModel(inputModel, evidenceText) {
  const input = normalizeText(inputModel) || ''
  const text = normalizeText(`${evidenceText || ''} ${input}`) || input
  const inferred = inferBrandCategory(text)

  let match = text.match(/\b(?:HPE|HP|Hewlett Packard Enterprise)?\s*(?:ProLiant\s+)?((?:DL|ML|BL|XL)\s*\d{2,4})\s*(?:(?:Gen|G)\s*(\d{1,2})(?:\s*(Plus))?)?\b/i)
  if (match && (inferred.brand === 'HPE' || /\b(proliant|hpe|hewlett|hp)\b/i.test(text))) {
    const model = normalizeModelToken(match[1])
    const gen = match[2] ? ` Gen${match[2]}${match[3] ? ' Plus' : ''}` : ''
    return extracted('HPE', 'server', `HPE ProLiant ${model}${gen}`, `${model}${gen.replace(/\s+/g, '')}`)
  }

  match = text.match(/\b(?:Dell\s+EMC\s+|Dell\s+)?PowerStore\s+([0-9]{3,4}[A-Z]?)\b/i)
  if (match) return extracted('Dell EMC', 'storage', `Dell EMC PowerStore ${match[1].toUpperCase()}`, `PowerStore ${match[1].toUpperCase()}`)

  match = text.match(/\b(?:Dell\s+EMC\s+|Dell\s+|EMC\s+)?Unity\s*(?:XT\s*)?([0-9]{3,4}[A-Z]?)\b/i)
  if (match) return extracted('Dell EMC', 'storage', `Dell EMC Unity XT ${match[1].toUpperCase()}`, `Unity XT ${match[1].toUpperCase()}`)

  match = text.match(/\b(?:Dell\s+EMC\s+|Dell\s+|EMC\s+)?(VNXe?)\s*-?\s*([0-9]{3,4})\b/i)
  if (match) return extracted('Dell EMC', 'storage', `Dell EMC ${match[1]} ${match[2]}`, `${match[1]}${match[2]}`)

  match = text.match(/\b(?:Dell\s+)?(?:PowerEdge\s+)?([RCTM][0-9]{3,4}(?:xd2?|xa|xs|s|t)?)\b/i)
  if (match && (inferred.brand === 'Dell' || /\b(poweredge|dell)\b/i.test(text))) {
    const model = match[1].toUpperCase()
    return extracted('Dell', 'server', `Dell PowerEdge ${model}`, model)
  }

  match = text.match(/\b(?:Lenovo\s+)?(?:ThinkSystem\s+)?((?:SR|ST|SN|SD)\s*\d{3,4}(?:\s*V\d)?)\b/i)
  if (match && (inferred.brand === 'Lenovo' || /\b(thinksystem|lenovo)\b/i.test(text))) {
    const model = match[1].replace(/\s+/g, ' ').toUpperCase()
    return extracted('Lenovo', 'server', `Lenovo ThinkSystem ${model}`, model)
  }

  match = text.match(/\b(?:IBM\s+)?(?:Power\s+)?(S[0-9]{3,4}|E[0-9]{3,4})\b/i)
  if (match && /\b(ibm|power)\b/i.test(text)) {
    const model = match[1].toUpperCase()
    return extracted('IBM', 'server', `IBM Power ${model}`, model)
  }

  match = text.match(/\b(?:NetApp\s+)?(AFF|FAS)\s*-?\s*([A-Z]?[0-9]{3,4})\b/i)
  if (match && (inferred.brand === 'NetApp' || /\b(netapp|aff|fas)\b/i.test(text))) {
    const family = match[1].toUpperCase()
    const model = match[2].toUpperCase()
    return extracted('NetApp', 'storage', `NetApp ${family} ${model}`, `${family}${model}`)
  }

  match = text.match(/\b(?:Huawei\s+)?OceanStor\s+([A-Z0-9 -]{3,24})\b/i)
  if (match) {
    const model = match[1].replace(/\s+/g, ' ').trim().toUpperCase()
    return extracted('Huawei', 'storage', `Huawei OceanStor ${model}`, model)
  }

  match = text.match(/\b(?:Cisco\s+)?(?:Catalyst\s+)?(C?\d{4}(?:-\d{2,3}[A-Z0-9-]+)?)\b/i)
  if (match && (inferred.brand === 'Cisco' || /\b(cisco|catalyst)\b/i.test(text))) {
    const model = match[1].replace(/^C(?=\d{4})/i, '').toUpperCase()
    return extracted('Cisco', 'network', `Cisco Catalyst ${model}`, model)
  }

  match = text.match(/\b(?:Cisco\s+)?Nexus\s+([0-9]{4,5}[A-Z0-9-]*)\b/i)
  if (match) return extracted('Cisco', 'network', `Cisco Nexus ${match[1].toUpperCase()}`, match[1].toUpperCase())

  match = text.match(/\b(?:H3C\s+)?(S[0-9]{4,5}(?:-[A-Z0-9-]+)?)\b/i)
  if (match && (inferred.brand === 'H3C' || /\bh3c\b/i.test(text))) {
    const model = match[1].toUpperCase()
    return extracted('H3C', 'network', `H3C ${model}`, model)
  }

  match = text.match(/\b(?:Huawei\s+)?(?:CloudEngine\s+)?(S[0-9]{4,5}(?:-[A-Z0-9-]+)?)\b/i)
  if (match && (inferred.brand === 'Huawei' || /\b(huawei|cloudengine)\b/i.test(text))) {
    const model = match[1].toUpperCase()
    return extracted('Huawei', 'network', `Huawei ${model}`, model)
  }

  if (inferred.brand && inferred.category && catalogCategories.has(inferred.category)) {
    const brandPattern = new RegExp(`^${escapeRegExp(inferred.brand)}\\s+`, 'i')
    const modelWithoutBrand = titleCaseKnownWords(input.replace(brandPattern, '').trim())
    if (modelWithoutBrand) {
      return extracted(inferred.brand, inferred.category, `${inferred.brand} ${modelWithoutBrand}`, modelWithoutBrand)
    }
  }

  return null
}

function aliasesForCandidate(candidate, inputModel) {
  const aliases = [candidate.canonicalModel, candidate.partNumber, inputModel, ...(Array.isArray(candidate.aliases) ? candidate.aliases : [])]
  const canonical = candidate.canonicalModel

  if (candidate.brand === 'Dell' && /PowerEdge/i.test(canonical)) {
    const model = canonical.replace(/^Dell\s+PowerEdge\s+/i, '')
    aliases.push(model, `PowerEdge ${model}`, `Dell ${model}`)
  } else if (candidate.brand === 'HPE' && /ProLiant/i.test(canonical)) {
    const model = canonical.replace(/^HPE\s+ProLiant\s+/i, '')
    aliases.push(model, `HPE ${model}`, `HP ${model}`, model.replace(/\s+/g, ''))
  } else if (candidate.brand === 'Lenovo' && /ThinkSystem/i.test(canonical)) {
    const model = canonical.replace(/^Lenovo\s+ThinkSystem\s+/i, '')
    aliases.push(model, `ThinkSystem ${model}`)
  } else if (candidate.brand === 'Dell EMC') {
    aliases.push(canonical.replace(/^Dell\s+EMC\s+/i, ''), canonical.replace(/^Dell\s+/i, ''))
  } else if (candidate.brand) {
    aliases.push(canonical.replace(new RegExp(`^${escapeRegExp(candidate.brand)}\\s+`, 'i'), ''))
  }

  return deduplicateAliases(aliases)
}

async function findCatalogMatch(rawModel) {
  const model = normalizeText(rawModel)
  if (!model) return null

  await ensureDeviceModelCatalogTable()
  await ensureDeviceModelAliasesTable()

  const normalizedModel = normalizeAlias(model)
  const compactNormalizedModel = compactAlias(model)
  const rows = await query(
    `SELECT matched.id,
            matched.canonical_model,
            matched.part_number,
            matched.brand,
            matched.category,
            matched.source_provider,
            matched.match_type,
            matched.match_rank
     FROM (
       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category, c.source_provider,
              '标准型号' AS match_type, 10 AS match_rank
       FROM device_model_catalog c
       WHERE c.is_active = 1
         AND LOWER(c.canonical_model) = LOWER(:model)

       UNION ALL

       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category, c.source_provider,
              'PN' AS match_type, 9 AS match_rank
       FROM device_model_catalog c
       WHERE c.is_active = 1
         AND LOWER(COALESCE(c.part_number, '')) = LOWER(:model)

       UNION ALL

       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category, c.source_provider,
              '别名' AS match_type, 8 AS match_rank
       FROM device_model_aliases a
       JOIN device_model_catalog c ON c.id = a.catalog_id
       WHERE c.is_active = 1
         AND a.normalized_alias = :normalizedModel

       UNION ALL

       SELECT c.id, c.canonical_model, c.part_number, c.brand, c.category, c.source_provider,
              '别名' AS match_type, 7 AS match_rank
       FROM device_model_aliases a
       JOIN device_model_catalog c ON c.id = a.catalog_id
       WHERE c.is_active = 1
         AND :compactNormalizedModel <> ''
         AND REPLACE(a.normalized_alias, ' ', '') = :compactNormalizedModel
     ) AS matched
     ORDER BY matched.match_rank DESC, matched.canonical_model ASC`,
    { model, normalizedModel, compactNormalizedModel },
  )

  const bestById = new Map()
  for (const row of rows) {
    const existing = bestById.get(row.id)
    if (!existing || Number(row.match_rank) > Number(existing.match_rank)) {
      bestById.set(row.id, row)
    }
  }

  const matches = [...bestById.values()]
  if (!matches.length) return null

  const canonicalKeys = new Set(matches.map((row) => String(row.canonical_model || '').trim().toLowerCase()).filter(Boolean))
  if (canonicalKeys.size > 1) {
    throw badRequest('设备型号匹配到多个标准型号，请使用更准确的型号')
  }

  return matches[0]
}

async function upsertCatalogCandidate(candidate, inputModel, sourceReference) {
  await ensureDeviceModelCatalogTable()
  await ensureDeviceModelAliasesTable()

  const sourceProvider = normalizeText(candidate.sourceProvider) || 'online'
  const confidence = Math.max(0.01, Math.min(1, Number(candidate.confidence || (candidate.onlineVerified ? 0.75 : 0.55))))

  await query(
    `INSERT INTO device_model_catalog (
       brand, category, canonical_model, part_number, source_provider, source_reference,
       confidence, is_active, synced_at
     ) VALUES (
       :brand, :category, :canonicalModel, :partNumber, :sourceProvider, :sourceReference,
       :confidence, 1, CURRENT_TIMESTAMP
     )
     ON DUPLICATE KEY UPDATE
       part_number = COALESCE(VALUES(part_number), part_number),
       source_provider = VALUES(source_provider),
       source_reference = COALESCE(VALUES(source_reference), source_reference),
       confidence = GREATEST(confidence, VALUES(confidence)),
       is_active = 1,
       synced_at = CURRENT_TIMESTAMP`,
    {
      brand: candidate.brand,
      category: candidate.category,
      canonicalModel: candidate.canonicalModel,
      partNumber: candidate.partNumber || null,
      sourceProvider,
      sourceReference: sourceReference || 'device-asset-online-lookup',
      confidence,
    },
  )

  const rows = await query(
    `SELECT id, brand, category, canonical_model, part_number, source_provider
     FROM device_model_catalog
     WHERE brand = :brand AND category = :category AND canonical_model = :canonicalModel
     LIMIT 1`,
    {
      brand: candidate.brand,
      category: candidate.category,
      canonicalModel: candidate.canonicalModel,
    },
  )
  const item = rows[0]
  if (!item) throw badRequest('型号库写入失败')

  for (const alias of aliasesForCandidate(candidate, inputModel)) {
    const normalizedAlias = normalizeAlias(alias)
    if (!normalizedAlias) continue
    await query(
      `INSERT IGNORE INTO device_model_aliases (
         catalog_id, normalized_alias, provider_scope
       ) VALUES (
         :catalogId, :normalizedAlias, 'approved-v1'
       )`,
      { catalogId: item.id, normalizedAlias },
    )
  }

  return item
}

function normalizationPayload({ inputModel, finalModel, action, source, matchType, item, message }) {
  return {
    action,
    inputModel,
    canonicalModel: finalModel,
    corrected: finalModel !== inputModel,
    source,
    matchType: matchType || '',
    brand: item?.brand || '',
    category: item?.category || '',
    partNumber: normalizeText(item?.part_number || item?.partNumber) || '',
    confidence: item?.confidence === undefined || item?.confidence === null ? null : Number(item.confidence),
    reason: normalizeText(item?.reason) || '',
    needsConfirmation: action === 'suggested_correction',
    message: message || '',
  }
}

function stripJsonFence(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function parseAiJsonResponse(data, text) {
  const content = data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.message?.content
    || text
  const stripped = stripJsonFence(content)
  if (!stripped) return null
  try {
    return JSON.parse(stripped)
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return null
    try { return JSON.parse(match[0]) } catch {}
  }
  return null
}

function normalizeAiAliases(value, inputModel) {
  const aliases = Array.isArray(value) ? value : []
  return deduplicateAliases([inputModel, ...aliases.map((alias) => normalizeText(alias)).filter(Boolean)])
}

function modelCore(value) {
  return compactAlias(value)
    .replace(/\b(hpe|hp|hewlettpackardenterprise|dell|emc|lenovo|ibm|cisco|huawei|h3c|netapp)\b/g, '')
    .replace(/\b(proliant|poweredge|thinksystem|bladesystem|oceanstor|catalyst|nexus|ucs|enclosure)\b/g, '')
}

function aiCandidateRelatesToInput(candidate, inputModel) {
  const inputCore = modelCore(inputModel)
  if (!inputCore) return false
  const values = [
    candidate.canonicalModel,
    candidate.partNumber,
    ...(Array.isArray(candidate.aliases) ? candidate.aliases : []),
  ].map(modelCore).filter(Boolean)
  return values.some((value) => value.includes(inputCore) || inputCore.includes(value))
}

function normalizeAiCandidatePayload(payload, inputModel) {
  if (!payload) return null
  const brand = normalizeText(payload.brand)
  const category = normalizeText(payload.category)?.toLowerCase()
  const canonicalModel = normalizeText(payload.canonicalModel)
  const partNumber = normalizeText(payload.partNumber) || ''
  const confidence = Number(payload.confidence || 0)
  if (!brand || !canonicalModel || !catalogCategories.has(category)) return null
  if (!Number.isFinite(confidence) || confidence <= 0) return null

  const candidate = {
    brand,
    category,
    canonicalModel: titleCaseKnownWords(canonicalModel),
    partNumber,
    aliases: normalizeAiAliases(payload.aliases, inputModel),
    confidence,
    reason: normalizeText(payload.reason) || '',
    sourceProvider: 'ai',
  }
  const inputCore = modelCore(inputModel)
  const partNumberCore = modelCore(candidate.partNumber)
  const canonicalCore = modelCore(candidate.canonicalModel)
  if (inputCore && partNumberCore.includes(inputCore) && !canonicalCore.includes(inputCore)) {
    const partNumberHasBrand = normalizeAlias(candidate.partNumber).startsWith(normalizeAlias(brand))
    candidate.canonicalModel = titleCaseKnownWords(partNumberHasBrand ? candidate.partNumber : `${brand} ${candidate.partNumber}`)
  }
  if (!aiCandidateRelatesToInput(candidate, inputModel)) return null
  return candidate
}

function normalizeAiCandidate(payload, inputModel) {
  if (!payload || payload.matched !== true) return null
  const candidate = normalizeAiCandidatePayload(payload, inputModel)
  if (!candidate) return null
  if (candidate.confidence < Number(process.env.DEVICE_MODEL_AI_LOOKUP_MIN_CONFIDENCE || defaultAiLookupConfidence)) return null
  return candidate
}

function normalizeAiSuggestion(payload, inputModel) {
  const minSuggestionConfidence = Number(process.env.DEVICE_MODEL_AI_SUGGESTION_MIN_CONFIDENCE || 0.25)
  const candidatePayload = payload?.matched === false && payload?.suggestedCandidate
    ? {
      ...payload.suggestedCandidate,
      reason: payload.suggestedCandidate.reason || payload.reason,
    }
    : payload
  const candidate = normalizeAiCandidatePayload(candidatePayload, inputModel)
    || inferAiSuggestionFromReason(payload, inputModel)
  if (!candidate) return null
  if (candidate.confidence < minSuggestionConfidence) return null
  if (candidate.confidence >= Number(process.env.DEVICE_MODEL_AI_LOOKUP_MIN_CONFIDENCE || defaultAiLookupConfidence)) return null
  return candidate
}

function likelyModelVariants(inputModel) {
  const input = normalizeText(inputModel) || ''
  const variants = []
  const suffixMatch = input.match(/^(.+-[A-Z]*\d+[A-Z0-9]*)(-[A-Z]{1,4})$/i)
  if (suffixMatch) variants.push(suffixMatch[1])
  const compactVariant = input.replace(/-/g, '')
  if (compactVariant && compactVariant !== input) variants.push(compactVariant)
  return deduplicateAliases(variants).slice(0, 3)
}

function inferAiSuggestionFromReason(payload, inputModel) {
  const reason = normalizeText(payload?.reason) || ''
  if (!reason || !/深信服|sangfor/i.test(reason)) return null
  const variants = likelyModelVariants(inputModel)
  const model = variants[0] || normalizeText(inputModel)
  if (!model || !/^AC[-\s]?\d/i.test(model)) return null
  return {
    brand: '深信服',
    category: 'network',
    canonicalModel: `深信服 ${model}`,
    partNumber: normalizeText(inputModel) || model,
    aliases: normalizeAiAliases([inputModel, model, `Sangfor ${model}`], inputModel),
    confidence: 0.25,
    reason,
    sourceProvider: 'ai',
  }
}

function buildAiLookupPrompt(inputModel, search) {
  const evidence = (search?.results || []).slice(0, 6).map((result, index) => ({
    index: index + 1,
    title: result.title || '',
    snippet: result.snippet || '',
    url: result.url || '',
  }))

  return [
    '请判断输入内容是否为企业 IT 硬件设备型号，并给出标准型号候选。',
    '',
    '这是型号库未命中后的 AI 兜底判断：',
    '- 可以结合搜索摘要和你自身的公开硬件型号知识判断；搜索摘要为空不代表必须失败。',
    '- 如果你能确认它是已知企业硬件型号，允许 matched=true，并给出标准品牌、类别和型号。',
    '- 如果只是猜测、型号可能对应多款设备、或无法确定完整标准名称，matched 必须为 false。',
    '- 如果不能自动确认，但存在唯一最可能候选，请在 matched=false 时输出 suggestedCandidate；系统会交给用户人工确认，不会自动写库。',
    '- 只处理服务器、存储、网络设备；不要处理软件、耗材、许可证、线缆、普通配件。',
    '- canonicalModel 必须包含品牌和完整标准型号，例如 "HPE BladeSystem c7000 Enclosure"。',
    '- 如果输入型号包含后缀或变体标记，且无法证明应删除，请在 canonicalModel 中保留完整后缀，并在 reason 说明需人工确认。',
    '- aliases 只放明确等价的写法，必须包含输入型号本身。',
    '- confidence 使用 0 到 1；可确认的已知型号应 >= 0.78，低于 0.78 会被系统拒绝。',
    '- 只输出 JSON，不要 Markdown，不要代码块。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "matched": true,',
    '  "brand": "string",',
    '  "category": "server|storage|network",',
    '  "canonicalModel": "string",',
    '  "partNumber": "string",',
    '  "aliases": ["string"],',
    '  "confidence": 0.0,',
    '  "reason": "string"',
    '}',
    '',
    '无法确定时输出：',
    '{ "matched": false, "reason": "string", "suggestedCandidate": { "brand": "string", "category": "server|storage|network", "canonicalModel": "string", "partNumber": "string", "aliases": ["string"], "confidence": 0.0, "reason": "string" } }',
    '',
    '输入型号：',
    inputModel,
    '',
    '可尝试的型号变体：',
    JSON.stringify(likelyModelVariants(inputModel)),
    '',
    '搜索摘要：',
    JSON.stringify(evidence),
  ].join('\n')
}

async function callAiLookupProvider(inputModel, search, aiSettings) {
  const timeoutMs = Math.max(1000, Number(process.env.DEVICE_MODEL_AI_LOOKUP_TIMEOUT_MS || env.ai.summaryTimeoutMs || defaultAiLookupTimeoutMs))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(aiSettings.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiSettings.apiKey}`,
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: 'system', content: '你是严谨的企业硬件型号识别助手，必须只返回合法 JSON。' },
          { role: 'user', content: buildAiLookupPrompt(inputModel, search) },
        ],
        stream: false,
        max_tokens: 500,
      }),
    })

    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch {}
    if (!response.ok) {
      const message = data?.error?.message || data?.message || `AI provider HTTP ${response.status}`
      throw new Error(message)
    }
    return parseAiJsonResponse(data, text)
  } finally {
    clearTimeout(timeout)
  }
}

async function discoverAiCandidate(inputModel, search) {
  if (process.env.DEVICE_MODEL_AI_LOOKUP_DISABLED === '1') {
    return { candidate: null, disabled: true }
  }
  if (typeof fetch !== 'function') {
    return { candidate: null, disabled: true }
  }

  const settings = await effectiveSettings()
  const aiSettings = settings.ai
  if (!aiSettings.apiUrl || !aiSettings.apiKey || !aiSettings.model) {
    return { candidate: null, disabled: true }
  }

  try {
    const payload = await callAiLookupProvider(inputModel, search, aiSettings)
    return {
      candidate: normalizeAiCandidate(payload, inputModel),
      suggestion: normalizeAiSuggestion(payload, inputModel),
      raw: payload,
    }
  } catch (error) {
    return {
      candidate: null,
      error: error.name === 'AbortError' ? 'AI lookup timeout' : (error.message || 'AI lookup failed'),
    }
  }
}

async function discoverOnlineCandidate(inputModel) {
  const localCandidate = extractKnownModel(inputModel, '')
  const search = await fetchSearchEvidence(inputModel)
  const evidence = search.results.map((result) => `${result.title} ${result.snippet}`).join(' ')
  const onlineCandidate = evidence ? extractKnownModel(inputModel, evidence) : null
  let candidate = localCandidate || onlineCandidate
  const usedOnlineCandidate = !localCandidate && Boolean(onlineCandidate)
  let usedAiCandidate = false
  let aiLookup = null

  if (!candidate) {
    aiLookup = await discoverAiCandidate(inputModel, search)
    candidate = aiLookup.candidate
    usedAiCandidate = Boolean(candidate)
  }

  if (!candidate) {
    return {
      candidate: null,
      suggestion: aiLookup?.suggestion || null,
      searched: search.searched,
      disabled: search.disabled,
      error: search.error || aiLookup?.error,
    }
  }

  return {
    candidate: {
      ...candidate,
      onlineVerified: Boolean(usedOnlineCandidate && search.results.length),
      sourceProvider: usedAiCandidate ? 'ai' : 'online',
      confidence: usedAiCandidate ? candidate.confidence : (usedOnlineCandidate && search.results.length ? 0.75 : 0.55),
    },
    searched: search.searched,
    disabled: search.disabled,
    error: search.error || aiLookup?.error,
    sourceReference: usedAiCandidate ? 'device-asset-ai-fallback' : (search.results[0]?.url || ''),
  }
}

async function normalizeDeviceModelForAsset(rawModel, options = {}) {
  const inputModel = normalizeText(rawModel)
  if (!inputModel) throw badRequest('设备型号不能为空')

  const catalogMatch = await findCatalogMatch(inputModel)
  if (catalogMatch) {
    const finalModel = normalizeText(catalogMatch.canonical_model) || inputModel
    const action = finalModel === inputModel ? 'matched' : 'corrected'
    return {
      model: finalModel,
      catalogItem: catalogMatch,
      normalization: normalizationPayload({
        inputModel,
        finalModel,
        action,
        source: 'catalog',
        matchType: catalogMatch.match_type,
        item: catalogMatch,
        message: action === 'corrected' ? `已按型号库标准纠正为 ${finalModel}` : '',
      }),
    }
  }

  if (options.allowOnlineLookup === false) {
    return {
      model: inputModel,
      catalogItem: null,
      normalization: normalizationPayload({
        inputModel,
        finalModel: inputModel,
        action: 'not_found',
        source: 'none',
        message: '型号库未命中，已按原型号保存',
      }),
    }
  }

  const discovered = await discoverOnlineCandidate(inputModel)
  if (discovered.candidate) {
    const item = await upsertCatalogCandidate(discovered.candidate, inputModel, discovered.sourceReference)
    const finalModel = normalizeText(item.canonical_model) || inputModel
    const action = finalModel === inputModel ? 'created' : 'created_corrected'
    const source = discovered.candidate.sourceProvider === 'ai'
      ? 'ai'
      : (discovered.candidate.onlineVerified ? 'online' : 'local')
    const matchType = discovered.candidate.sourceProvider === 'ai'
      ? 'AI 兜底'
      : (discovered.candidate.onlineVerified ? '网上搜索' : '本地规则')
    return {
      model: finalModel,
      catalogItem: item,
      normalization: normalizationPayload({
        inputModel,
        finalModel,
        action,
        source,
        matchType,
        item,
        message: action === 'created_corrected'
          ? `型号库未命中，已规范为 ${finalModel} 并加入型号库`
          : '型号库未命中，已加入型号库',
      }),
    }
  }

  if (discovered.suggestion) {
    if (options.confirmAiSuggestion === true) {
      const item = await upsertCatalogCandidate(discovered.suggestion, inputModel, 'device-asset-ai-confirmed')
      const finalModel = normalizeText(item.canonical_model) || inputModel
      const action = finalModel === inputModel ? 'created' : 'created_corrected'
      return {
        model: finalModel,
        catalogItem: item,
        normalization: normalizationPayload({
          inputModel,
          finalModel,
          action,
          source: 'ai',
          matchType: 'AI 人工确认',
          item,
          message: action === 'created_corrected'
            ? `已确认 AI 候选，并规范为 ${finalModel} 加入型号库`
            : '已确认 AI 候选，并加入型号库',
        }),
      }
    }

    return {
      model: inputModel,
      catalogItem: null,
      normalization: normalizationPayload({
        inputModel,
        finalModel: discovered.suggestion.canonicalModel,
        action: 'suggested_correction',
        source: 'ai',
        matchType: 'AI 待确认',
        item: discovered.suggestion,
        message: `AI 建议可能是 ${discovered.suggestion.canonicalModel}，需人工确认后应用`,
      }),
    }
  }

  return {
    model: inputModel,
    catalogItem: null,
    normalization: normalizationPayload({
      inputModel,
      finalModel: inputModel,
      action: 'not_found',
      source: discovered.searched ? 'online' : 'none',
      message: discovered.disabled
        ? '型号库未命中，在线检索未启用，已按原型号保存'
        : '型号库未命中，未能在线确认具体型号，已按原型号保存',
    }),
  }
}

function shouldReportNormalization(normalization) {
  return ['corrected', 'created', 'created_corrected', 'suggested_correction', 'not_found'].includes(normalization?.action)
}

module.exports = {
  findCatalogMatch,
  normalizeDeviceModelForAsset,
  shouldReportNormalization,
}
