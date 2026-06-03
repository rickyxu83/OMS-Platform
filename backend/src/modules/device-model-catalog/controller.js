const { query } = require('../../config/db')
const { normalizeAlias } = require('./normalize')

async function suggest(req, res, next) {
  try {
    const rawKeyword = String(req.query.keyword || '').trim().slice(0, 100)
    if (!rawKeyword) {
      res.json({ items: [] })
      return
    }

    const normalizedKeyword = normalizeAlias(rawKeyword)
    const rows = await query(
      `SELECT matched.id,
              matched.brand,
              matched.category,
              matched.canonical_model,
              matched.source_provider,
              matched.confidence,
              matched.priority,
              matched.match_rank
       FROM (
         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.source_provider,
                c.confidence,
                c.priority,
                10 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND LOWER(c.canonical_model) = LOWER(:rawKeyword)

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.source_provider,
                c.confidence,
                c.priority,
                8 AS match_rank
         FROM device_model_aliases a
         JOIN device_model_catalog c ON c.id = a.catalog_id
         WHERE c.is_active = 1
           AND a.normalized_alias = :normalizedKeyword

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.source_provider,
                c.confidence,
                c.priority,
                5 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND LOWER(c.canonical_model) LIKE LOWER(:prefixKeyword)

         UNION ALL

         SELECT c.id,
                c.brand,
                c.category,
                c.canonical_model,
                c.source_provider,
                c.confidence,
                c.priority,
                3 AS match_rank
         FROM device_model_catalog c
         WHERE c.is_active = 1
           AND (
             LOWER(c.canonical_model) LIKE LOWER(:partialKeyword)
             OR EXISTS (
               SELECT 1
               FROM device_model_aliases a
               WHERE a.catalog_id = c.id
                 AND a.normalized_alias LIKE :partialNormalizedKeyword
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

module.exports = {
  suggest,
}
