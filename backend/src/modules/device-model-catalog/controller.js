const { query } = require('../../config/db')
const { searchTextVariants } = require('../../utils/chinese')
const { normalizeAlias, deduplicateAliases } = require('./normalize')

const catalogCategories = new Set(['server', 'storage', 'network'])

async function suggest(req, res, next) {
  try {
    const rawKeyword = String(req.query.keyword || '').trim().slice(0, 100)
    if (!rawKeyword) {
      res.json({ items: [] })
      return
    }

    const normalizedKeyword = normalizeAlias(rawKeyword)
    const keywordVariants = searchTextVariants(rawKeyword)
    const variantParams = {}
    keywordVariants.forEach((variant, index) => {
      variantParams[`variantKeyword${index}`] = variant
      variantParams[`variantPrefix${index}`] = `${variant}%`
      variantParams[`variantPartial${index}`] = `%${variant}%`
      variantParams[`variantNormalized${index}`] = normalizeAlias(variant)
      variantParams[`variantNormalizedPartial${index}`] = `%${normalizeAlias(variant)}%`
    })
    const variantExactSql = (column) => keywordVariants.map((_, index) => `LOWER(${column}) = LOWER(:variantKeyword${index})`).join(' OR ')
    const variantPrefixSql = (column) => keywordVariants.map((_, index) => `LOWER(${column}) LIKE LOWER(:variantPrefix${index})`).join(' OR ')
    const variantPartialSql = (column) => keywordVariants.map((_, index) => `LOWER(${column}) LIKE LOWER(:variantPartial${index})`).join(' OR ')
    const variantNormalizedExactSql = keywordVariants.map((_, index) => `a.normalized_alias = :variantNormalized${index}`).join(' OR ')
    const variantNormalizedPartialSql = keywordVariants.map((_, index) => `a.normalized_alias LIKE :variantNormalizedPartial${index}`).join(' OR ')
    const rows = await query(
      `SELECT matched.id,
              matched.brand,
              matched.category,
              matched.canonical_model,
              matched.part_number,
              matched.source_provider,
              matched.confidence,
              matched.priority,
              matched.match_rank
       FROM (
         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.part_number,
                c.source_provider,
                c.confidence,
                c.priority,
                10 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND (LOWER(c.canonical_model) = LOWER(:rawKeyword) OR ${variantExactSql('c.canonical_model')})

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.part_number,
                c.source_provider,
                c.confidence,
                c.priority,
                9 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND (LOWER(COALESCE(c.part_number, '')) = LOWER(:rawKeyword) OR ${variantExactSql("COALESCE(c.part_number, '')")})

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.part_number,
                c.source_provider,
                c.confidence,
                c.priority,
                8 AS match_rank
         FROM device_model_aliases a
         JOIN device_model_catalog c ON c.id = a.catalog_id
         WHERE c.is_active = 1
           AND (a.normalized_alias = :normalizedKeyword OR ${variantNormalizedExactSql})

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.part_number,
                c.source_provider,
                c.confidence,
                c.priority,
                5 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND (
             LOWER(c.canonical_model) LIKE LOWER(:prefixKeyword)
             OR LOWER(COALESCE(c.part_number, '')) LIKE LOWER(:prefixKeyword)
             OR ${variantPrefixSql('c.canonical_model')}
             OR ${variantPrefixSql("COALESCE(c.part_number, '')")}
           )

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.part_number,
                c.source_provider,
                c.confidence,
                c.priority,
                3 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND (
             LOWER(c.canonical_model) LIKE LOWER(:partialKeyword)
             OR LOWER(COALESCE(c.part_number, '')) LIKE LOWER(:partialKeyword)
             OR ${variantPartialSql('c.canonical_model')}
             OR ${variantPartialSql("COALESCE(c.part_number, '')")}
             OR EXISTS (
               SELECT 1
               FROM device_model_aliases a
               WHERE a.catalog_id = c.id
                 AND (a.normalized_alias LIKE :partialNormalizedKeyword OR ${variantNormalizedPartialSql})
             )
           )
       ) AS matched
        ORDER BY matched.match_rank DESC,
                matched.confidence DESC,
                matched.priority DESC,
                matched.canonical_model ASC`,
      {
        rawKeyword,
        normalizedKeyword,
        prefixKeyword: `${rawKeyword}%`,
        partialKeyword: `%${rawKeyword}%`,
        partialNormalizedKeyword: `%${normalizedKeyword}%`,
        ...variantParams,
      },
    )

    const dedupedItems = []
    const bestById = new Map()

    for (const row of rows) {
      const existing = bestById.get(row.id)
      if (existing && existing.rank >= row.match_rank) {
        continue
      }

      const item = {
        canonicalModel: row.canonical_model,
        partNumber: String(row.part_number || '').trim(),
        brand: row.brand,
        category: row.category,
        sourceProvider: row.source_provider,
        rank: Number(row.match_rank),
        confidence: Number(row.confidence),
      }

      bestById.set(row.id, item)
    }

    for (const row of rows) {
      const item = bestById.get(row.id)
      if (!item) {
        continue
      }

      dedupedItems.push(item)
      bestById.delete(row.id)

      if (dedupedItems.length >= 10) {
        break
      }
    }

    res.json({ items: dedupedItems })
  } catch (error) {
    next(error)
  }
}

async function upsertEntry(req, res, next) {
  try {
    const brand = String(req.body?.brand || '').trim()
    const category = String(req.body?.category || '').trim().toLowerCase()
    const canonicalModel = String(req.body?.canonicalModel || '').trim()
    const partNumber = String(req.body?.partNumber || '').trim()
    const aliases = deduplicateAliases([
      canonicalModel,
      partNumber,
      ...(Array.isArray(req.body?.aliases) ? req.body.aliases : String(req.body?.aliases || '').split(/\r?\n|,/)),
    ])

    if (!brand || !canonicalModel) {
      res.status(400).json({ error: { message: '品牌和标准型号不能为空' } })
      return
    }
    if (!catalogCategories.has(category)) {
      res.status(400).json({ error: { message: '设备分类不合法' } })
      return
    }

    await query(
      `INSERT INTO device_model_catalog (
         brand, category, canonical_model, part_number, source_provider, source_reference, is_active, synced_at
       ) VALUES (
         :brand, :category, :canonicalModel, :partNumber, 'manual', 'device-management', 1, CURRENT_TIMESTAMP
       )
       ON DUPLICATE KEY UPDATE
         part_number = VALUES(part_number),
         source_provider = 'manual',
         source_reference = 'device-management',
         is_active = 1,
         synced_at = CURRENT_TIMESTAMP`,
      {
        brand,
        category,
        canonicalModel,
        partNumber: partNumber || null,
      },
    )

    const rows = await query(
      `SELECT id, brand, category, canonical_model, part_number
       FROM device_model_catalog
       WHERE brand = :brand AND category = :category AND canonical_model = :canonicalModel
       LIMIT 1`,
      { brand, category, canonicalModel },
    )

    const item = rows[0]
    if (!item) {
      res.status(500).json({ error: { message: '型号库写入失败' } })
      return
    }

    for (const alias of aliases) {
      const normalizedAlias = normalizeAlias(alias)
      if (!normalizedAlias) continue
      await query(
        `INSERT IGNORE INTO device_model_aliases (
           catalog_id, normalized_alias, provider_scope
         ) VALUES (
           :catalogId, :normalizedAlias, 'approved-v1'
         )`,
        {
          catalogId: item.id,
          normalizedAlias,
        },
      )
    }

    res.status(201).json({
      item: {
        id: item.id,
        brand: item.brand,
        category: item.category,
        canonicalModel: item.canonical_model,
        partNumber: String(item.part_number || '').trim(),
      },
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  suggest,
  upsertEntry,
}
